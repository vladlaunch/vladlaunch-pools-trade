// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice pools.trade vault that mints the "Fee Beneficiary" NFT and pays out fees.
/// @dev Verified on-chain at 0x587D2fDD…4544.
interface IUERC20BeneficiaryVault {
    function claim(uint256 tokenId, uint256 minCurrency0Amount, uint256 minCurrency1Amount) external;
    function amounts(uint256 tokenId) external view returns (uint128 currency0Amount, uint128 currency1Amount);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice Uniswap v4 PositionManager — used to collect fees straight from a position
///         we hold ourselves, bypassing the pools.trade splitter entirely.
interface IPosm {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice pools.trade FeeSplitter — final custodian of the LP position.
/// @dev Verified on-chain at 0x7198C32a…4b8F. `collectFees` is permissionless.
interface IPoolsFeeSplitter {
    function collectFees(uint256[] calldata tokenIds) external;
}

/// @title VladFeeSplit
/// @notice Splits a launch's trading fees between the token's creator and the protocol.
///
/// @dev Fees on this launchpad reach whoever holds the Fee Beneficiary NFT. To split
///      them, that NFT has to be held by a contract rather than a person — so this one
///      holds it, and remembers which creator each position belongs to.
///
///      Harvesting is two steps, not one, and skipping the first makes the second a
///      silent no-op: `FeeSplitter.collectFees` moves fees out of the v4 position and
///      credits the vault, and only then does `vault.claim` pay anything out. Both are
///      done here so a creator cannot get it wrong.
///
///      `claim` is permissionless on purpose. Payouts go to addresses fixed at launch,
///      so letting anyone trigger a claim costs the caller gas and benefits the
///      creator — there is nothing to steal by calling it.
///
/// WARNING: unaudited, and never run outside a fork. Test with small amounts first.
contract VladFeeSplit {
    using SafeERC20 for IERC20;

    /// @notice Protocol's cut, in basis points. 2500 = 25%; the creator keeps the rest.
    uint16 public constant PROTOCOL_BPS = 2500;
    uint16 private constant BPS = 10_000;

    IUERC20BeneficiaryVault public immutable vault;
    IPoolsFeeSplitter public immutable poolsSplitter;
    IPosm public immutable posm;

    /// @notice The only address allowed to register launches — our launch strategy.
    address public immutable strategy;
    /// @notice Where the protocol's share goes. Immutable so it cannot be redirected.
    address public immutable treasury;

    mapping(uint256 tokenId => address creator) public creatorOf;
    mapping(uint256 tokenId => address token) public tokenOf;

    /// v4-periphery action ids. DECREASE_LIQUIDITY by zero collects fees only.
    uint8 private constant DECREASE_LIQUIDITY = 0x01;
    uint8 private constant TAKE_PAIR = 0x11;

    uint256 private _locked = 1;

    event Registered(uint256 indexed tokenId, address indexed creator, address indexed token);
    event Claimed(
        uint256 indexed tokenId,
        address indexed creator,
        uint256 creatorEth,
        uint256 creatorToken,
        uint256 protocolEth,
        uint256 protocolToken
    );

    error NotStrategy();
    error AlreadyRegistered(uint256 tokenId);
    error UnknownPosition(uint256 tokenId);
    error ZeroAddress();
    error EthTransferFailed(address to);
    error Reentrancy();

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(
        IUERC20BeneficiaryVault _vault,
        IPoolsFeeSplitter _poolsSplitter,
        IPosm _posm,
        address _strategy,
        address _treasury
    ) {
        if (_strategy == address(0) || _treasury == address(0)) revert ZeroAddress();
        vault = _vault;
        poolsSplitter = _poolsSplitter;
        posm = _posm;
        strategy = _strategy;
        treasury = _treasury;
    }

    /// @notice Record who launched a position. Called by the strategy inside the launch tx.
    /// @dev Write-once. If this could be overwritten, whoever called last would own the
    ///      creator's fee stream.
    function register(uint256 tokenId, address creator, address token) external {
        if (msg.sender != strategy) revert NotStrategy();
        if (creator == address(0) || token == address(0)) revert ZeroAddress();
        if (creatorOf[tokenId] != address(0)) revert AlreadyRegistered(tokenId);
        creatorOf[tokenId] = creator;
        tokenOf[tokenId] = token;
        emit Registered(tokenId, creator, token);
    }

    /// @notice Fees waiting in the vault. Does not include fees still sitting in the
    ///         position — call `claim` to sweep those in first.
    function pending(uint256 tokenId) external view returns (uint128 ethAmount, uint128 tokenAmount) {
        return vault.amounts(tokenId);
    }

    /// @notice Harvest a position's fees and pay them out 75/25. Anyone may call.
    function claim(uint256 tokenId) external nonReentrant {
        address creator = creatorOf[tokenId];
        if (creator == address(0)) revert UnknownPosition(tokenId);
        IERC20 token = IERC20(tokenOf[tokenId]);

        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        poolsSplitter.collectFees(ids);

        // ETH is measured as a delta because this contract holds ETH for every launch
        // it manages; only the amount that arrived during this claim belongs to it.
        uint256 ethBefore = address(this).balance;
        vault.claim(tokenId, 0, 0);
        uint256 ethIn = address(this).balance - ethBefore;

        // The token side needs no delta: a given launch token only ever reaches this
        // contract as that launch's fees or its launch dust, and both belong to the
        // same creator. Taking the whole balance also sweeps dust that would
        // otherwise sit here forever.
        uint256 tokenIn = token.balanceOf(address(this));

        // Remainders go to the creator, so rounding never strands wei in this contract.
        _payout(tokenId, creator, token, ethIn, tokenIn);
    }

    /// @notice Collect fees from a position this contract holds directly, then split.
    ///
    /// @dev Used when a launch kept its position instead of handing it to the
    ///      pools.trade splitter. Decreasing liquidity by ZERO withdraws nothing but the
    ///      fees that have accrued — the principal cannot move, which is what keeps
    ///      "the liquidity is unpullable" true even though we hold the NFT. This
    ///      contract has no other path that touches the position, so there is no
    ///      withdrawal to find.
    ///
    ///      Unlike the splitter route, everything the position earned arrives here:
    ///      both currencies, nothing skimmed upstream.
    function claimDirect(uint256 tokenId) external nonReentrant {
        address creator = creatorOf[tokenId];
        if (creator == address(0)) revert UnknownPosition(tokenId);
        IERC20 token = IERC20(tokenOf[tokenId]);

        bytes memory actions = abi.encodePacked(DECREASE_LIQUIDITY, TAKE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(address(0), address(token), address(this));

        uint256 ethBefore = address(this).balance;
        posm.modifyLiquidities(abi.encode(actions, params), block.timestamp);
        uint256 ethIn = address(this).balance - ethBefore;
        uint256 tokenIn = token.balanceOf(address(this));

        _payout(tokenId, creator, token, ethIn, tokenIn);
    }

    function _payout(uint256 tokenId, address creator, IERC20 token, uint256 ethIn, uint256 tokenIn)
        private
    {
        uint256 protocolEth = (ethIn * PROTOCOL_BPS) / BPS;
        uint256 protocolToken = (tokenIn * PROTOCOL_BPS) / BPS;
        uint256 creatorEth = ethIn - protocolEth;
        uint256 creatorToken = tokenIn - protocolToken;

        if (protocolToken != 0) token.safeTransfer(treasury, protocolToken);
        if (creatorToken != 0) token.safeTransfer(creator, creatorToken);
        if (protocolEth != 0) _sendEth(treasury, protocolEth);
        if (creatorEth != 0) _sendEth(creator, creatorEth);

        emit Claimed(tokenId, creator, creatorEth, creatorToken, protocolEth, protocolToken);
    }

    /// @dev Accept the position NFT when a launch keeps custody here.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function _sendEth(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed(to);
    }

    /// @dev The vault pays the ETH side of fees as native ETH.
    receive() external payable {}
}
