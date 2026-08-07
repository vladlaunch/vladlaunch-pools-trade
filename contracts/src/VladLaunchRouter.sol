// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ILiquidityLauncher {
    function multicall(bytes[] calldata data) external returns (bytes[] memory);
}

/// @title VladLaunchRouter
/// @notice Launch a token and buy the first of it in one transaction.
///
/// @dev Why this contract has to exist: `LiquidityLauncher.multicall` is nonpayable and
///      only dispatches to the launcher's own functions, so ETH cannot travel with a
///      launch and no swap can be smuggled into it. Doing the buy as a second
///      transaction leaves a gap that a bot watching the mempool will happily fill —
///      the creator's own launch gets sniped before their buy lands.
///
///      So: this contract takes the ETH, performs the launch, and swaps in the same
///      call. The buy executes at the pool's opening price because nothing else can
///      run in between.
///
///      The swap talks to the PoolManager directly rather than through a router. v4
///      only allows pool operations inside `unlock`, so the sequence is
///      unlock → swap → settle the ETH we owe → take the tokens to the buyer.
///
///      Pool geometry note: currency0 is native ETH and currency1 is the token, so
///      buying is zeroForOne. Price starts at the top tick, which is why the whole
///      supply sits below spot and the opening buy needs no counterparty.
///
/// WARNING: unaudited, and never run outside a fork. Test with small amounts first.
contract VladLaunchRouter is IUnlockCallback {
    using SafeERC20 for IERC20;

    ILiquidityLauncher public immutable launcher;
    IPoolManager public immutable poolManager;

    struct BuyData {
        PoolKey key;
        uint256 amountIn;
        address buyer;
        uint256 minOut;
    }

    event LaunchedAndBought(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokensOut);

    error OnlyPoolManager();
    error NothingToBuy();
    error InsufficientOutput(uint256 got, uint256 wanted);
    error RefundFailed();

    constructor(ILiquidityLauncher _launcher, IPoolManager _poolManager) {
        launcher = _launcher;
        poolManager = _poolManager;
    }

    /// @notice Run the launch calls, then spend `msg.value` buying the new token.
    /// @param launcherCalls The encoded createToken + distributeToken pair.
    /// @param key The pool the launch is about to create. Must match, or the swap
    ///        would hit some other pool — hence `minOut` as the backstop.
    /// @param minOut Fewer tokens than this and the whole transaction reverts, which
    ///        also unwinds the launch. Better than an opening buy at a price the
    ///        creator did not agree to.
    function launchAndBuy(bytes[] calldata launcherCalls, PoolKey calldata key, uint256 minOut)
        external
        payable
        returns (uint256 tokensOut)
    {
        launcher.multicall(launcherCalls);
        if (msg.value == 0) revert NothingToBuy();

        bytes memory result = poolManager.unlock(
            abi.encode(BuyData({key: key, amountIn: msg.value, buyer: msg.sender, minOut: minOut}))
        );
        tokensOut = abi.decode(result, (uint256));

        if (tokensOut < minOut) revert InsufficientOutput(tokensOut, minOut);
        emit LaunchedAndBought(Currency.unwrap(key.currency1), msg.sender, msg.value, tokensOut);
    }

    /// @notice Launch without buying. Same path as the wizard's no-dev-buy case.
    function launchOnly(bytes[] calldata launcherCalls) external {
        launcher.multicall(launcherCalls);
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        BuyData memory b = abi.decode(data, (BuyData));

        // Negative amountSpecified means exact input: spend precisely this much ETH.
        // The price limit is the far edge of the range, so the swap is bounded only by
        // the liquidity that exists, not by an arbitrary stopping point.
        BalanceDelta delta = poolManager.swap(
            b.key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -int256(b.amountIn),
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            ""
        );

        // amount0 is what we owe in ETH (negative), amount1 what the pool hands back.
        uint256 owed = uint256(uint128(-delta.amount0()));
        uint256 out = uint256(uint128(delta.amount1()));

        poolManager.settle{value: owed}();
        poolManager.take(b.key.currency1, b.buyer, out);

        // Exact-input swaps consume everything, but a pool that runs out of liquidity
        // partway leaves change. It belongs to the buyer, not to this contract.
        uint256 change = b.amountIn - owed;
        if (change != 0) {
            (bool ok,) = b.buyer.call{value: change}("");
            if (!ok) revert RefundFailed();
        }

        return abi.encode(out);
    }

    /// @dev Needed so the PoolManager can hand back native ETH during settlement.
    receive() external payable {}
}
