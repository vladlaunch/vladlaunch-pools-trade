// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title IStrategy
/// @notice The distribution-strategy interface Uniswap's `LiquidityLauncher`
///         (pools.trade) calls, taken from the launcher's verified source on
///         Robinhood Chain.
/// @dev Kontrak launcher: 0x00004c4ccc709Ef590F7C81102C0689F0263D4e9
///
/// The caller performs:
///   1. `IERC20(token).forceApprove(strategy, amount)`
///   2. `strategy.initializeDistribution(token, amount, configData, keccak256(abi.encode(msg.sender, salt)))`
///   3. checks `allowance(launcher, strategy) == 0`, else reverts AllowanceNotFullyConsumed
///
/// Artinya strategy WAJIB menarik SELURUH allowance lewat transferFrom.
interface IStrategy {
    /// @notice Emitted when a distribution is initialized.
    event DistributionInitialized(address indexed distributor, address indexed token, uint256 totalSupply);

    /// @notice The distributed amount is invalid.
    error InvalidAmount(uint256 amount, uint256 maxAmount);

    /// @notice Inisialisasi distribusi token di bawah strategy ini.
    /// @param token The token being distributed.
    /// @param totalSupply Amount to distribute. Must be pulled in full.
    /// @param configData Parameter bebas, spesifik per strategy.
    /// @param salt Salt for deterministic deployment, if the strategy uses one.
    function initializeDistribution(address token, uint256 totalSupply, bytes calldata configData, bytes32 salt)
        external;
}
