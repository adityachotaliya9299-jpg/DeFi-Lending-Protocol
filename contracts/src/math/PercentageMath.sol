// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  PercentageMath
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Provides percentage arithmetic using a basis-point (bps) scale:
 *
 *           PERCENTAGE_FACTOR = 10_000
 *           1     bps = 0.01 %
 *           100   bps = 1.00 %
 *           10000 bps = 100.00 %
 *
 * @dev    Keeping everything in basis points avoids floating-point errors and
 *         is the standard used by Aave, Compound, and virtually every major
 *         DeFi protocol for configurable risk parameters.
 *
 *         All functions round half-up (same policy as WadRayMath).
 *
 * @custom:usage
 *   // Express 75% LTV
 *   uint256 LTV = 75_00; // 7500 bps
 *
 *   // Calculate max borrow for $10,000 collateral
 *   uint256 maxBorrow = PercentageMath.percentMul(10_000e18, LTV);
 *   // → 7_500e18  ($7,500)
 *
 *   // Recover the original collateral from the borrow amount
 *   uint256 collateral = PercentageMath.percentDiv(7_500e18, LTV);
 *   // → 10_000e18  ($10,000)
 */
library PercentageMath {
    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev 100.00 % expressed in basis points.
    uint256 internal constant PERCENTAGE_FACTOR = 10_000;

    /// @dev Half of PERCENTAGE_FACTOR, used for round-half-up rounding.
    uint256 internal constant HALF_PERCENTAGE_FACTOR = 5_000;

    // ─────────────────────────────────────────────────────────────────────────
    //  Common protocol percentages (expressed in bps for easy re-use)
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev 80%  — typical maximum LTV for ETH collateral.
    uint256 internal constant PCT_80 = 8_000;

    /// @dev 75%  — typical maximum LTV for volatile assets.
    uint256 internal constant PCT_75 = 7_500;

    /// @dev 85%  — typical liquidation threshold for ETH.
    uint256 internal constant PCT_85 = 8_500;

    /// @dev 8%   — typical liquidation bonus paid to liquidators.
    uint256 internal constant PCT_LIQUIDATION_BONUS = 800;

    /// @dev 0.9% — typical borrow fee / protocol reserve factor.
    uint256 internal constant PCT_RESERVE_FACTOR = 90;

    // ─────────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Thrown when caller attempts to divide by zero.
    error PercentageMath__DivisionByZero();

    /// @dev Thrown when a multiplication would overflow uint256.
    error PercentageMath__MultiplicationOverflow();

    /// @dev Thrown when a percentage value exceeds 100% (10_000 bps).
    error PercentageMath__InvalidPercentage(uint256 provided, uint256 maximum);

    // ─────────────────────────────────────────────────────────────────────────
    //  Core functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Multiplies a value by a percentage expressed in basis points.
     *
     * @dev    Formula:  result = (value * bps + HALF_PERCENTAGE_FACTOR) / PERCENTAGE_FACTOR
     *
     *         Example:
     *           percentMul(10_000e18, 7_500) == 7_500e18   // 75% of $10,000 = $7,500
     *           percentMul(1_000e18,  500)   == 50e18      // 5%  of $1,000  = $50
     *
     * @param  value   The base value (any uint256, typically a WAD amount).
     * @param  bps     Percentage in basis points (0–10_000 inclusive).
     * @return         Result = value × (bps / 100%), rounded half-up.
     */
    function percentMul(uint256 value, uint256 bps) internal pure returns (uint256) {
        if (value == 0 || bps == 0) return 0;

        if (value > (type(uint256).max - HALF_PERCENTAGE_FACTOR) / bps) {
            revert PercentageMath__MultiplicationOverflow();
        }

        unchecked {
            return (value * bps + HALF_PERCENTAGE_FACTOR) / PERCENTAGE_FACTOR;
        }
    }

    /**
     * @notice Divides a value by a percentage expressed in basis points.
     *
     * @dev    This is the inverse of percentMul:
     *           percentDiv(percentMul(x, bps), bps) ≈ x  (up to rounding)
     *
     *         Formula:  result = (value * PERCENTAGE_FACTOR + bps / 2) / bps
     *
     *         Used in the protocol to answer "what collateral is needed to back
     *         this borrow at a given LTV?":
     *           requiredCollateral = percentDiv(borrowAmount, LTV_bps)
     *
     * @param  value   The base value to scale up.
     * @param  bps     Percentage in basis points (must be > 0).
     * @return         result = value / (bps / 100%), rounded half-up.
     */
    function percentDiv(uint256 value, uint256 bps) internal pure returns (uint256) {
        if (bps == 0) revert PercentageMath__DivisionByZero();

        uint256 halfBps = bps / 2;

        if (value > (type(uint256).max - halfBps) / PERCENTAGE_FACTOR) {
            revert PercentageMath__MultiplicationOverflow();
        }

        unchecked {
            return (value * PERCENTAGE_FACTOR + halfBps) / bps;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Validation helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Reverts if `bps` is not a valid percentage (i.e. > 10_000).
     * @dev    Use this at configuration time (e.g. when setting LTV, liquidation
     *         thresholds) to catch mis-configurations early.
     */
    function validatePercentage(uint256 bps) internal pure {
        if (bps > PERCENTAGE_FACTOR) {
            revert PercentageMath__InvalidPercentage(bps, PERCENTAGE_FACTOR);
        }
    }

    /**
     * @notice Returns true when `bps` represents a valid percentage ≤ 100%.
     */
    function isValidPercentage(uint256 bps) internal pure returns (bool) {
        return bps <= PERCENTAGE_FACTOR;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Health-factor helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Calculates the health factor for a position.
     *
     * @dev    healthFactor = (collateralValue * liquidationThreshold) / borrowedValue
     *
     *         Expressed in WAD (1e18), so:
     *           healthFactor >= 1e18  → position is safe
     *           healthFactor <  1e18  → position can be liquidated
     *
     *         NOTE: Both collateralValue and borrowedValue must be expressed in
     *         the same unit (e.g. USD with 18 decimals = WAD).
     *
     * @param  collateralValueWad       Total collateral value in WAD.
     * @param  liquidationThresholdBps  Liquidation threshold in bps (e.g. 8500 = 85%).
     * @param  borrowedValueWad         Total debt value in WAD.
     * @return                          Health factor in WAD. Returns type(uint256).max
     *                                  when there is no debt (fully collateralised).
     */
    function calculateHealthFactor(
        uint256 collateralValueWad,
        uint256 liquidationThresholdBps,
        uint256 borrowedValueWad
    ) internal pure returns (uint256) {
        if (borrowedValueWad == 0) return type(uint256).max;

        // adjustedCollateral = collateralValue * liquidationThreshold (in WAD)
        // We scale by 1e18 and then divide by PERCENTAGE_FACTOR to keep WAD units.
        uint256 adjustedCollateral = percentMul(collateralValueWad, liquidationThresholdBps);

        // healthFactor = adjustedCollateral * 1e18 / borrowedValue
        // Both are in WAD, so we need the extra 1e18 scale.
        return (adjustedCollateral * 1e18) / borrowedValueWad;
    }

    /**
     * @notice Returns true if a health factor represents a safe (non-liquidatable) position.
     * @dev    Threshold is 1e18 (== 1.0 in WAD).
     */
    function isHealthy(uint256 healthFactorWad) internal pure returns (bool) {
        return healthFactorWad >= 1e18;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Conversion helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Converts a percentage expressed as a WAD fraction to basis points.
     *
     * @dev    Example: wadToBps(0.75e18) == 7_500
     *
     * @param  wad  Percentage as a WAD value where 1e18 = 100%.
     * @return      Equivalent in basis points.
     */
    function wadToBps(uint256 wad) internal pure returns (uint256) {
        return (wad * PERCENTAGE_FACTOR) / 1e18;
    }

    /**
     * @notice Converts basis points to a WAD fraction.
     *
     * @dev    Example: bpsToWad(7_500) == 0.75e18
     *
     * @param  bps  Percentage in basis points.
     * @return      Equivalent as WAD where 1e18 = 100%.
     */
    function bpsToWad(uint256 bps) internal pure returns (uint256) {
        return (bps * 1e18) / PERCENTAGE_FACTOR;
    }
}
