// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  IInterestRateModel
 * @notice Defines the interface every interest rate model must implement.
 *         The LendingPool calls this to calculate borrow and supply rates
 *         based on the current utilization of an asset reserve.
 */
interface IInterestRateModel {
    // ─────────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted whenever rate model parameters are updated.
    event RateParamsUpdated(
        uint256 baseRateRay,
        uint256 slopeOneRay,
        uint256 slopeTwoRay,
        uint256 optimalUtilizationRay
    );

    // ─────────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Thrown when a rate parameter would exceed 100% APR in RAY.
    error InterestRateModel__InvalidRate(uint256 provided, uint256 maximum);

    // ─────────────────────────────────────────────────────────────────────────
    //  Core functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Calculates the current borrow APR in RAY for a given reserve state.
     *
     * @param totalLiquidity  Total deposited liquidity (WAD).
     * @param totalBorrows    Outstanding borrows (WAD).
     * @return borrowRateRay  Per-second borrow rate expressed in RAY.
     *                        Multiply by seconds elapsed to get the interest factor.
     */
    function calculateBorrowRate(uint256 totalLiquidity, uint256 totalBorrows)
        external
        view
        returns (uint256 borrowRateRay);

    /**
     * @notice Calculates the current supply APR in RAY.
     *         Supply rate = borrowRate * utilizationRate * (1 - reserveFactor).
     *
     * @param totalLiquidity  Total deposited liquidity (WAD).
     * @param totalBorrows    Outstanding borrows (WAD).
     * @param reserveFactor   Protocol reserve factor in basis points (e.g. 1000 = 10%).
     * @return supplyRateRay  Per-second supply rate in RAY.
     */
    function calculateSupplyRate(uint256 totalLiquidity, uint256 totalBorrows, uint256 reserveFactor)
        external
        view
        returns (uint256 supplyRateRay);

    /**
     * @notice Returns the current utilization rate for a reserve.
     *         utilizationRate = totalBorrows / totalLiquidity
     *
     * @return utilizationRay  Utilization rate in RAY (0 = 0%, RAY = 100%).
     */
    function getUtilizationRate(uint256 totalLiquidity, uint256 totalBorrows)
        external
        pure
        returns (uint256 utilizationRay);
}
