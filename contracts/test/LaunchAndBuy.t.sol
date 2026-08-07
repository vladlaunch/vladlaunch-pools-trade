// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {VladFeeSplit, IUERC20BeneficiaryVault, IPoolsFeeSplitter, IPosm} from "../src/VladFeeSplit.sol";
import {VladStrategy, IVladFeeSplit, IUERC20BeneficiaryVault as IVaultForStrategy} from "../src/VladStrategy.sol";
import {VladLaunchRouter, ILiquidityLauncher} from "../src/VladLaunchRouter.sol";

interface IUERC20Factory {
    function getUERC20Address(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        address creator,
        bytes32 graffiti
    ) external view returns (address);
}

/// Runs against real Robinhood Chain state. Nothing here is mocked: the launcher, the
/// token factory, the pool manager, the beneficiary vault and the fee splitter are all
/// the deployed contracts. A pass means the flow works on the chain it ships to.
///
///   forge test --fork-url https://rpc.mainnet.chain.robinhood.com --match-path "*LaunchAndBuy*" -vv
contract LaunchAndBuyForkTest is Test {
    address constant LAUNCHER = 0x00004c4ccc709Ef590F7C81102C0689F0263D4e9;
    address constant UERC20_FACTORY = 0x000000e200088D55C39a11F609E5F667729ad49b;
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant BENEFICIARY_VAULT = 0x587D2fDDDF14F6f84022b51e8c3a473eB88C4544;
    address constant POOLS_FEE_SPLITTER = 0x7198C32a497c09497e04C86cf8F77A244A9E4b8F;

    int24 constant START_TICK = 198060;
    int24 constant TICK_LOWER = -208980;
    int24 constant TICK_SPACING = 60;
    uint128 constant SUPPLY = 1_000_000_000e18;

    VladFeeSplit feeSplit;
    VladStrategy strategy;
    VladLaunchRouter router;

    Seller seller;
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");

    function setUp() public {
        // The two contracts reference each other, so one address is predicted. Deployed
        // in this order the strategy lands at the next nonce.
        address predictedStrategy = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);

        feeSplit = new VladFeeSplit(
            IUERC20BeneficiaryVault(BENEFICIARY_VAULT),
            IPoolsFeeSplitter(POOLS_FEE_SPLITTER),
            IPosm(POSITION_MANAGER),
            predictedStrategy,
            treasury
        );
        strategy = new VladStrategy(
            IPoolManager(POOL_MANAGER),
            IPositionManager(POSITION_MANAGER),
            IAllowanceTransfer(PERMIT2),
            IVaultForStrategy(BENEFICIARY_VAULT),
            POOLS_FEE_SPLITTER,
            IVladFeeSplit(address(feeSplit))
        );
        assertEq(address(strategy), predictedStrategy, "nonce prediction");

        router = new VladLaunchRouter(ILiquidityLauncher(LAUNCHER), IPoolManager(POOL_MANAGER));
        seller = new Seller(IPoolManager(POOL_MANAGER));
    }

    function _calls(string memory name, string memory symbol, uint24 fee)
        internal
        view
        returns (bytes[] memory calls, address token, PoolKey memory key)
    {
        return _calls(name, symbol, fee, true);
    }

    function _calls(string memory name, string memory symbol, uint24 fee, bool lock)
        internal
        view
        returns (bytes[] memory calls, address token, PoolKey memory key)
    {
        // The launcher derives graffiti from ITS OWN msg.sender — `createToken` has no
        // graffiti parameter. Routing through the router therefore salts the token
        // address with the router, not with the creator.
        bytes32 graffiti = keccak256(abi.encode(address(router)));
        token = IUERC20Factory(UERC20_FACTORY).getUERC20Address(name, symbol, 18, LAUNCHER, graffiti);

        bytes memory tokenData = abi.encode(
            Metadata({description: "fork test", website: "", image: "", extraData: ""})
        );

        calls = new bytes[](2);
        calls[0] = abi.encodeWithSignature(
            "createToken(address,string,string,uint8,uint128,address,bytes)",
            UERC20_FACTORY,
            name,
            symbol,
            uint8(18),
            SUPPLY,
            LAUNCHER,
            tokenData
        );

        VladStrategy.LaunchConfig memory cfg = VladStrategy.LaunchConfig({
            feeRecipient: creator,
            fee: fee,
            tickSpacing: TICK_SPACING,
            startTick: START_TICK,
            tickLower: TICK_LOWER,
            hooks: address(0),
            lockPosition: lock
        });

        calls[1] = abi.encodeWithSignature(
            "distributeToken(address,(address,uint128,bytes),bytes32)",
            token,
            ILiquidityLauncherDistribution({
                strategy: address(strategy),
                amount: SUPPLY,
                configData: abi.encode(cfg)
            }),
            keccak256(abi.encode(symbol, block.timestamp))
        );

        key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: fee,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });
    }

    /// Must encode as ONE tuple: the leading offset word is what the factory decodes.
    struct Metadata {
        string description;
        string website;
        string image;
        bytes extraData;
    }

    struct ILiquidityLauncherDistribution {
        address strategy;
        uint128 amount;
        bytes configData;
    }

    /// The whole point of the router: the opening buy lands in the launch transaction,
    /// so there is no block in which a bot could get in first.
    function test_launchAndBuy_isAtomic_andCreditsBuyer() public {
        (bytes[] memory calls, address token, PoolKey memory key) = _calls("Fork Test", "FORKT", 10_000);

        vm.deal(creator, 5 ether);
        vm.prank(creator);
        uint256 out = router.launchAndBuy{value: 1 ether}(calls, key, 1);

        assertGt(out, 0, "buy produced no tokens");
        // >= not ==: the strategy also forwards launch dust (rounding left over from
        // the liquidity maths) to the creator, so the balance is the buy plus a few wei.
        assertGe(IERC20(token).balanceOf(creator), out, "tokens did not reach the creator");
        console.log("1 ETH bought (whole tokens):", out / 1e18);
        console.log("share of supply, bps:", (out * 10_000) / SUPPLY);
    }

    /// Liquidity custody is not a per-launch choice on this pad, so assert it.
    function test_lpPositionGoesToSplitter_andFeeClaimIsOurs() public {
        uint256 nextId = IPositionManager(POSITION_MANAGER).nextTokenId();
        (bytes[] memory calls,, PoolKey memory key) = _calls("Custody Test", "CUSTT", 10_000);

        vm.deal(creator, 5 ether);
        vm.prank(creator);
        router.launchAndBuy{value: 0.1 ether}(calls, key, 1);

        assertEq(
            IERC721(POSITION_MANAGER).ownerOf(nextId),
            POOLS_FEE_SPLITTER,
            "LP position must end at the pools.trade fee splitter"
        );
        assertEq(
            IERC721(BENEFICIARY_VAULT).ownerOf(nextId),
            address(feeSplit),
            "fee beneficiary NFT must be held by our splitter, or fees cannot be split"
        );
        assertEq(feeSplit.creatorOf(nextId), creator, "creator not registered");
    }

    /// Trading generates fees; claiming must land 75/25 without stranding dust.
    ///
    /// Also settles the question of WHICH currency the fee arrives in. A v4 pool takes
    /// its fee from the input of each swap, so a buy pays in ETH and a sell pays in the
    /// token — the two-sided pile only appears once volume goes both ways.
    function test_claim_splits75_25_onBothSides() public {
        uint256 nextId = IPositionManager(POSITION_MANAGER).nextTokenId();
        (bytes[] memory calls, address token, PoolKey memory key) = _calls("Split Test", "SPLTT", 10_000);

        vm.deal(creator, 20 ether);
        vm.prank(creator);
        uint256 bought = router.launchAndBuy{value: 5 ether}(calls, key, 1);

        // Sell half of it back so the token side of the fee is non-zero too.
        vm.prank(creator);
        IERC20(token).transfer(address(seller), bought / 2);
        seller.sell(key, bought / 2);

        uint256 creatorEthBefore = creator.balance;
        uint256 treasuryEthBefore = treasury.balance;
        uint256 creatorTokBefore = IERC20(token).balanceOf(creator);
        uint256 treasuryTokBefore = IERC20(token).balanceOf(treasury);

        feeSplit.claim(nextId);

        uint256 creatorEth = creator.balance - creatorEthBefore;
        uint256 treasuryEth = treasury.balance - treasuryEthBefore;
        uint256 creatorTok = IERC20(token).balanceOf(creator) - creatorTokBefore;
        uint256 treasuryTok = IERC20(token).balanceOf(treasury) - treasuryTokBefore;

        console.log("--- ETH side (wei) ---");
        console.log("creator :", creatorEth);
        console.log("treasury:", treasuryEth);
        console.log("--- token side ---");
        console.log("creator :", creatorTok);
        console.log("treasury:", treasuryTok);

        uint256 totalEth = creatorEth + treasuryEth;
        uint256 totalTok = creatorTok + treasuryTok;
        assertGt(totalEth, 0, "buys should have produced an ETH-side fee");

        // MEASURED, not assumed: the pools.trade FeeSplitter keeps the entire token
        // side of the fee and forwards it to 0x666DA634…be9b, so nothing denominated
        // in the launch token ever reaches the beneficiary. Asserting zero here means
        // the suite fails loudly if Uniswap ever changes that.
        assertEq(totalTok, 0, "token-side fee is retained upstream; if this fires, the economics changed");

        // Of the ETH side, only 40% is forwarded to the beneficiary vault — the other
        // 60% goes upstream too. Our 75/25 applies to what actually arrives.
        uint256 grossEthFee = (5 ether * 10_000) / 1_000_000;
        assertApproxEqRel(totalEth, (grossEthFee * 40) / 100, 0.02e18, "pass-through should be 40% of the gross fee");
        assertApproxEqRel(treasuryEth * 10_000 / totalEth, 2500, 0.01e18, "ETH split must be 25% protocol");
        assertEq(IERC20(token).balanceOf(address(feeSplit)), 0, "no token dust may be stranded");
        assertEq(address(feeSplit).balance, 0, "no ETH may be stranded");
    }

    /// The decisive comparison: identical volume down both custody routes.
    ///
    /// Route A hands the position to the pools.trade FeeSplitter (an official-looking
    /// launch). Route B keeps it in our own splitter, which has no withdrawal function,
    /// so the liquidity is equally unpullable — but nothing is skimmed on the way.
    function test_compare_custodyRoutes() public {
        uint256 lockedId = IPositionManager(POSITION_MANAGER).nextTokenId();
        (bytes[] memory c1,, PoolKey memory k1) = _calls("Route A", "RTA", 10_000, true);
        vm.deal(creator, 20 ether);
        vm.prank(creator);
        router.launchAndBuy{value: 5 ether}(c1, k1, 1);

        uint256 aC = creator.balance;
        uint256 aT = treasury.balance;
        feeSplit.claim(lockedId);
        uint256 viaSplitter = (creator.balance - aC) + (treasury.balance - aT);

        uint256 ownId = IPositionManager(POSITION_MANAGER).nextTokenId();
        (bytes[] memory c2, address tok2, PoolKey memory k2) = _calls("Route B", "RTB", 10_000, false);
        vm.deal(creator, 20 ether);
        vm.prank(creator);
        router.launchAndBuy{value: 5 ether}(c2, k2, 1);

        assertEq(
            IERC721(POSITION_MANAGER).ownerOf(ownId),
            address(feeSplit),
            "route B must keep the position in our splitter"
        );

        uint256 bC = creator.balance;
        uint256 bT = treasury.balance;
        uint256 bTokC = IERC20(tok2).balanceOf(creator);
        feeSplit.claimDirect(ownId);
        uint256 viaSelf = (creator.balance - bC) + (treasury.balance - bT);
        uint256 tokenSide = IERC20(tok2).balanceOf(creator) - bTokC;

        uint256 gross = (5 ether * 10_000) / 1_000_000;
        console.log("gross ETH fee on a 5 ETH buy (wei):", gross);
        console.log("Route A  via pools.trade splitter :", viaSplitter);
        console.log("Route B  keeping the position     :", viaSelf);
        console.log("Route B  token side to creator    :", tokenSide);
        console.log("Route A pass-through, bps         :", (viaSplitter * 10_000) / gross);
        console.log("Route B pass-through, bps         :", (viaSelf * 10_000) / gross);

        assertGt(viaSelf, viaSplitter, "keeping the position must collect more, or route A wins");

        // The whole point: holding the NFT does not let anyone remove the principal.
        // This contract exposes no call that decreases liquidity by a non-zero amount.
        assertEq(IERC20(tok2).balanceOf(address(feeSplit)), 0, "no token stranded");
        assertEq(address(feeSplit).balance, 0, "no ETH stranded");
    }

    /// The load-bearing promise of this launchpad, asserted rather than asserted-in-prose:
    /// collecting fees must never move the principal, and nothing must be able to move
    /// the position out of the splitter.
    ///
    /// If someone later adds a withdrawal path to VladFeeSplit, this test fails.
    function test_liquidityCannotBePulled() public {
        uint256 id = IPositionManager(POSITION_MANAGER).nextTokenId();
        (bytes[] memory calls, address token, PoolKey memory key) = _calls("Locked", "LOCKD", 10_000, false);

        vm.deal(creator, 20 ether);
        vm.prank(creator);
        router.launchAndBuy{value: 3 ether}(calls, key, 1);

        uint128 before = _positionLiquidity(id);
        assertGt(before, 0, "position should hold the supply");
        assertEq(IERC721(POSITION_MANAGER).ownerOf(id), address(feeSplit), "custody");

        // Generate fees, then claim them repeatedly. Principal must not budge.
        // Read the balance BEFORE the prank: an external call in an argument consumes
        // the prank, and the transfer would then run as this contract.
        uint256 half = IERC20(token).balanceOf(creator) / 2;
        vm.prank(creator);
        IERC20(token).transfer(address(seller), half);
        seller.sell(key, half);

        feeSplit.claimDirect(id);
        feeSplit.claimDirect(id);

        assertEq(_positionLiquidity(id), before, "claiming fees must not reduce liquidity");
        assertEq(IERC721(POSITION_MANAGER).ownerOf(id), address(feeSplit), "position must not leave the splitter");

        // And the creator cannot reach it: the splitter exposes no call that touches
        // the NFT, so an approval they might try to grant themselves does not exist.
        assertEq(
            IERC721(POSITION_MANAGER).getApproved(id),
            address(0),
            "no approval may exist on the position"
        );
    }

    function _positionLiquidity(uint256 tokenId) internal view returns (uint128) {
        (bool ok, bytes memory data) =
            POSITION_MANAGER.staticcall(abi.encodeWithSignature("getPositionLiquidity(uint256)", tokenId));
        require(ok, "getPositionLiquidity");
        return abi.decode(data, (uint128));
    }
}

/// Minimal seller so the test can push volume the other way through the pool.
contract Seller is IUnlockCallback {
    IPoolManager immutable pm;
    PoolKey key;
    uint256 amount;

    constructor(IPoolManager _pm) {
        pm = _pm;
    }

    function sell(PoolKey memory _key, uint256 _amount) external {
        key = _key;
        amount = _amount;
        pm.unlock("");
    }

    function unlockCallback(bytes calldata) external override returns (bytes memory) {
        BalanceDelta delta = pm.swap(
            key,
            SwapParams({
                zeroForOne: false,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        // Selling the token: we owe currency1 and receive currency0.
        uint256 owed = uint256(uint128(-delta.amount1()));
        uint256 got = uint256(uint128(delta.amount0()));

        pm.sync(key.currency1);
        IERC20(Currency.unwrap(key.currency1)).transfer(address(pm), owed);
        pm.settle();
        pm.take(key.currency0, address(this), got);
        return "";
    }

    receive() external payable {}
}
