// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// v4-core is imported through "@uniswap/v4-core/" — the SAME path v4-periphery uses.
// There are two copies of v4-core in the tree (top level, and nested inside
// v4-periphery, at different versions). Solidity identifies types by file path, so
// mixing the two makes `PoolKey` resolve to two incompatible types.
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {IPoolInitializer_v4} from "v4-periphery/interfaces/IPoolInitializer_v4.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";
import {Actions} from "v4-periphery/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {IStrategy} from "./interfaces/IStrategy.sol";

/// @notice The pools.trade vault that mints the "Fee Beneficiary" NFT.
/// @dev No whitelist — the only requirement is that the caller owns the LP position.
///      Source: UERC20BeneficiaryVault, verified at 0x587D2fDD…4544.
interface IUERC20BeneficiaryVault {
    function registerBeneficiary(uint256 tokenId, address beneficiary) external;
}

/// @notice Our 75/25 splitter. Holds the fee claim so it can be divided.
interface IVladFeeSplit {
    function register(uint256 tokenId, address creator, address token) external;
}

/// @title CustomFeeStrategy
/// @notice Distribution strategy for Uniswap's `LiquidityLauncher` (pools.trade) with
///         a POOL FEE THE LAUNCHER CHOOSES — something the official strategies cannot
///         do, since they hardcode 0.25% and no hook.
///
/// @dev Only the distribution step is replaced; the token itself is still Uniswap's
///      own UERC20, created by Uniswap's own factory.
///
/// Per launch:
///   1. Consume the ENTIRE allowance from the launcher. Leaving any behind makes the
///      launcher revert with `AllowanceNotFullyConsumed`.
///   2. Initialize a native-ETH/token v4 pool with the chosen `fee` and `hooks`.
///   3. Mint one single-sided LP position holding the whole supply.
///   4. Route the fee claim according to `lockPosition` (see below).
///
/// POOL GEOMETRY (matches pools.trade, verified on-chain):
///   currency0 is native ETH (address(0)) and currency1 is the token — address(0)
///   always sorts first, so the ordering is fixed. Price is token-per-ETH: it starts
///   high (the token is cheap) and falls as people buy.
///
///   `startTick` is the upper bound, and the whole position sits BELOW it in
///   [tickLower, startTick]. At tick == tickUpper the position is 100% currency1, so
///   no ETH has to be deposited at all. Reference values taken from a real
///   pools.trade launch: startTick=198060, tickLower=-208980, tickSpacing=60.
///
///   A falling tick means a rising token price, so `tickLower` is the price ceiling
///   and `startTick` sets the opening market cap.
///
/// WARNING: unaudited. Test with small amounts first.
contract VladStrategy is IStrategy {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;
    /// @notice Vault pencetak NFT Fee Beneficiary (alur resmi pools.trade).
    IUERC20BeneficiaryVault public immutable beneficiaryVault;
    /// @notice Kustodian akhir posisi LP (FeeSplitter pools.trade).
    address public immutable positionRecipient;
    /// @notice Pemegang NFT Fee Beneficiary — membagi fee 75% creator / 25% protokol.
    IVladFeeSplit public immutable feeSplit;

    /// @notice Per-launch parameters, abi-encoded into `configData`.
    /// @param feeRecipient The launch's creator — who the fee split pays out to.
    /// @param fee Pool fee in millionths (10000 = 1%). Max 1_000_000 (100%),
    ///        or LPFeeLibrary.DYNAMIC_FEE_FLAG (0x800000) for a dynamic fee — which
    ///        REQUIRES a hook to set the fee, or initialization reverts.
    /// @param tickSpacing The pool's tick spacing.
    /// @param startTick Opening tick, and the upper bound of the range. Must be a
    ///        multiple of tickSpacing.
    /// @param tickLower Lower bound. Multiple of tickSpacing, must be < startTick.
    /// @param hooks A v4 hook address, or address(0) for none.
    /// @param lockPosition true mirrors the official pools.trade flow: the position is
    ///        handed to their FeeSplitter and the fee claim arrives as a Fee
    ///        Beneficiary NFT. Measured cost: that splitter forwards only 40% of the
    ///        ETH-side fee and none of the token side.
    ///        false keeps the position in our own splitter, which collects 100% of
    ///        both sides. Either way the creator never holds the position personally,
    ///        so the liquidity cannot be pulled.
    struct LaunchConfig {
        address feeRecipient;
        uint24 fee;
        int24 tickSpacing;
        int24 startTick;
        int24 tickLower;
        address hooks;
        bool lockPosition;
    }

    /// @notice Emitted once the pool exists and the LP position is minted.
    /// @dev The signature deliberately matches the official pools.trade strategy's
    ///      `TokenLaunched`, so the topic0 is identical and any indexer parsing that
    ///      event still recognises launches made here.
    event TokenLaunched(
        PoolId indexed poolId, address indexed token, address indexed finalPositionRecipient, PoolKey key
    );

    error ZeroRecipient();
    error FeeTooHigh(uint24 fee);
    error InvalidTickSpacing(int24 tickSpacing);
    error TicksNotAligned(int24 tickLower, int24 startTick, int24 tickSpacing);
    error InvalidTickRange(int24 tickLower, int24 startTick);
    error ZeroLiquidity();

    constructor(
        IPoolManager _poolManager,
        IPositionManager _positionManager,
        IAllowanceTransfer _permit2,
        IUERC20BeneficiaryVault _beneficiaryVault,
        address _positionRecipient,
        IVladFeeSplit _feeSplit
    ) {
        poolManager = _poolManager;
        positionManager = _positionManager;
        permit2 = _permit2;
        beneficiaryVault = _beneficiaryVault;
        positionRecipient = _positionRecipient;
        feeSplit = _feeSplit;
    }

    /// @inheritdoc IStrategy
    /// @dev `salt` is unused: this strategy deploys no separate distributor, and pool
    ///      identity is already unique because every launch has a unique token address.
    function initializeDistribution(address token, uint256 totalSupply, bytes calldata configData, bytes32)
        external
        override
    {
        // The launcher passes a uint128 amount, but this interface takes uint256 —
        // guard the difference in case anyone calls in directly.
        if (totalSupply > type(uint128).max) revert InvalidAmount(totalSupply, type(uint128).max);

        LaunchConfig memory cfg = abi.decode(configData, (LaunchConfig));
        _validate(cfg);

        // 1. Consume the ENTIRE allowance — the launcher requires it.
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalSupply);

        // 2. Native-ETH/token pool. address(0) sorts first, so ETH is always currency0.
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: cfg.fee,
            tickSpacing: cfg.tickSpacing,
            hooks: IHooks(cfg.hooks)
        });

        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(cfg.startTick);
        IPoolInitializer_v4(address(positionManager)).initializePool(key, sqrtPriceX96);

        // 3. The whole supply becomes single-sided liquidity in [tickLower, startTick].
        //    Opening exactly at tickUpper means zero currency0 (ETH) is required.
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(
            TickMath.getSqrtPriceAtTick(cfg.tickLower), sqrtPriceX96, totalSupply
        );
        if (liquidity == 0) revert ZeroLiquidity();

        // 4. Mint the LP position (Permit2 approval and settlement live in the helper).
        // Pada mode lockPosition, posisi di-mint ke strategy dulu: `registerBeneficiary`
        uint256 tokenId = positionManager.nextTokenId();
        _mintAndSettle(key, token, totalSupply, cfg, liquidity);

        // Two custody routes, and the choice decides who collects the fees.
        //
        //   lockPosition = true  — hand the position to the pools.trade FeeSplitter and
        //     hold a Fee Beneficiary NFT instead. Matches an official launch exactly, but
        //     that splitter forwards only part of the fee onward (measured: 40% of the
        //     ETH side, none of the token side).
        //
        //   lockPosition = false — mint the position to our own splitter. It collects the
        //     full fee on both sides, and because that contract exposes no withdrawal,
        //     the liquidity is still unpullable. The custody promise survives; the
        //     upstream cut does not.
        //
        // Either way the creator never personally holds the position, so "the dev can
        // pull the LP" is untrue on this pad by construction, not by policy.
        feeSplit.register(tokenId, cfg.feeRecipient, token);

        address finalRecipient;
        if (cfg.lockPosition) {
            // registerBeneficiary requires the caller to own the position, so the order
            // mint -> register -> hand over is forced.
            beneficiaryVault.registerBeneficiary(tokenId, address(feeSplit));
            IERC721(address(positionManager)).safeTransferFrom(address(this), positionRecipient, tokenId);
            finalRecipient = positionRecipient;
        } else {
            IERC721(address(positionManager)).safeTransferFrom(address(this), address(feeSplit), tokenId);
            finalRecipient = address(feeSplit);
        }

        // 5. Sweep the rounding dust left over from the liquidity maths.
        //    The Permit2 allowance is deliberately NOT reset: resetting to zero reverts
        //    on a UERC20, and the grant is already bounded by the expiry set above.
        uint256 dust = IERC20(token).balanceOf(address(this));
        if (dust != 0) IERC20(token).safeTransfer(cfg.feeRecipient, dust);

        emit DistributionInitialized(address(this), token, totalSupply);
        emit TokenLaunched(key.toId(), token, finalRecipient, key);
    }

    /// @dev Split out of `initializeDistribution` purely to cut the local variable
    ///      count — inlining it hits "stack too deep".
    function _mintAndSettle(
        PoolKey memory key,
        address token,
        uint256 totalSupply,
        LaunchConfig memory cfg,
        uint128 liquidity
    ) private {
        // A UERC20 (Solady) already grants Permit2 an unlimited allowance by
        // default, and reverts with `Permit2AllowanceIsFixedAtInfinity()` if approved
        // for anything other than uint256.max. So approve only when the allowance is
        // actually short — which also keeps this strategy working for a plain ERC20.
        if (IERC20(token).allowance(address(this), address(permit2)) < totalSupply) {
            IERC20(token).forceApprove(address(permit2), type(uint256).max);
        }
        // Expiry sependek mungkin: izin ini hanya perlu hidup selama tx ini.
        permit2.approve(token, address(positionManager), uint160(totalSupply), uint48(block.timestamp + 1));

        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        // amount0Max = 0 asserts that no ETH may be pulled in.
        params[0] = abi.encode(
            key,
            cfg.tickLower,
            cfg.startTick,
            uint256(liquidity),
            uint128(0),
            uint128(totalSupply),
            address(this),
            bytes("")
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    /// @notice Compute liquidity and pool id without sending a transaction, for previews.
    function previewLaunch(address token, uint256 totalSupply, LaunchConfig calldata cfg)
        external
        pure
        returns (PoolKey memory key, uint128 liquidity)
    {
        key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: cfg.fee,
            tickSpacing: cfg.tickSpacing,
            hooks: IHooks(cfg.hooks)
        });
        liquidity = LiquidityAmounts.getLiquidityForAmount1(
            TickMath.getSqrtPriceAtTick(cfg.tickLower), TickMath.getSqrtPriceAtTick(cfg.startTick), totalSupply
        );
    }

    function _validate(LaunchConfig memory cfg) internal pure {
        if (cfg.feeRecipient == address(0)) revert ZeroRecipient();
        // Dynamic fee dibolehkan; selain itu maksimum 100%.
        if (cfg.fee != LPFeeLibrary.DYNAMIC_FEE_FLAG && cfg.fee > LPFeeLibrary.MAX_LP_FEE) {
            revert FeeTooHigh(cfg.fee);
        }
        if (cfg.tickSpacing <= 0) revert InvalidTickSpacing(cfg.tickSpacing);
        if (cfg.tickLower % cfg.tickSpacing != 0 || cfg.startTick % cfg.tickSpacing != 0) {
            revert TicksNotAligned(cfg.tickLower, cfg.startTick, cfg.tickSpacing);
        }
        if (cfg.tickLower >= cfg.startTick || cfg.tickLower < TickMath.MIN_TICK || cfg.startTick > TickMath.MAX_TICK) {
            revert InvalidTickRange(cfg.tickLower, cfg.startTick);
        }
    }
}
