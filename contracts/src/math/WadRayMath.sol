// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  WadRayMath
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Provides fixed-point arithmetic in two precisions:
 *
 *           WAD  = 1e18  →  used for token amounts, exchange rates, health factors
 *           RAY  = 1e27  →  used for interest rate indices (higher precision needed
 *                           so accrued interest doesn't round to zero over short periods)
 *
 * @dev    All mul / div helpers round to the nearest integer (half-up) to minimise
 *         accumulated rounding error.  The overflow guards rely on Solidity 0.8's
 *         built-in checked arithmetic — we only use `unchecked` where the bounds
 *         have been proven safe by explicit `require` statements.
 *
 *         Inspired by Aave's WadRayMath (https://github.com/aave/aave-v3-core)
 *         but written from scratch with additional NatSpec and safety comments.
 */
library WadRayMath {
    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev 1 WAD  = 10^18.  Standard 18-decimal fixed-point unit.
    uint256 internal constant WAD = 1e18;

    /// @dev Half WAD, used for rounding: adding this before dividing achieves
    ///      "round half away from zero".
    uint256 internal constant HALF_WAD = 0.5e18;

    /// @dev 1 RAY  = 10^27.  High-precision fixed-point unit for indices.
    uint256 internal constant RAY = 1e27;

    /// @dev Half RAY — same rounding purpose as HALF_WAD.
    uint256 internal constant HALF_RAY = 0.5e27;

    /// @dev Scaling factor between WAD and RAY: RAY / WAD = 10^9.
    uint256 internal constant WAD_RAY_RATIO = 1e9;

    /// @dev Half of WAD_RAY_RATIO, used for round-half-up when converting RAY→WAD.
    uint256 internal constant HALF_WAD_RAY_RATIO = 0.5e9;

    // ─────────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Thrown when a multiplication would overflow uint256.
    error WadRayMath__MultiplicationOverflow();

    /// @dev Thrown when caller attempts to divide by zero.
    error WadRayMath__DivisionByZero();

    // ─────────────────────────────────────────────────────────────────────────
    //  WAD arithmetic  (18-decimal)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Multiplies two WAD values and rounds the result half-up.
     *
     * @dev    Formula:  result = (a * b + HALF_WAD) / WAD
     *
     *         Overflow guard: if a != 0 and the product would exceed uint256,
     *         the division `(a * b) / a != b` will be true, so we revert.
     *         The `unchecked` block is safe because we manually verify there
     *         is no overflow before entering it.
     *
     * @param  a  First WAD operand.
     * @param  b  Second WAD operand.
     * @return    Product in WAD precision, rounded half-up.
     *
     * @custom:example
     *   wadMul(1.5e18, 2.0e18) == 3.0e18   // 1.5 * 2.0  = 3.0
     *   wadMul(0.3e18, 0.3e18) == 0.09e18  // 0.3 * 0.3  = 0.09
     */
    function wadMul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;

        // Overflow check: a * b must fit in uint256 before we add HALF_WAD.
        // We also need headroom for the + HALF_WAD, so guard against
        // (type(uint256).max - HALF_WAD) / b.
        if (a > (type(uint256).max - HALF_WAD) / b) {
            revert WadRayMath__MultiplicationOverflow();
        }

        unchecked {
            return (a * b + HALF_WAD) / WAD;
        }
    }

    /**
     * @notice Divides two WAD values and rounds the result half-up.
     *
     * @dev    Formula:  result = (a * WAD + b / 2) / b
     *
     *         We scale the numerator up by WAD first, then add half the
     *         denominator to achieve half-up rounding.
     *
     * @param  a  Numerator in WAD.
     * @param  b  Denominator in WAD (must be non-zero).
     * @return    Quotient in WAD precision, rounded half-up.
     *
     * @custom:example
     *   wadDiv(1e18, 2e18)  == 0.5e18   // 1 / 2 = 0.5
     *   wadDiv(3e18, 2e18)  == 1.5e18   // 3 / 2 = 1.5
     */
    function wadDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        if (b == 0) revert WadRayMath__DivisionByZero();

        uint256 halfB = b / 2;

        if (a > (type(uint256).max - halfB) / WAD) {
            revert WadRayMath__MultiplicationOverflow();
        }

        unchecked {
            return (a * WAD + halfB) / b;
        }
    }

    /**
     * @notice Returns the absolute difference between two WAD values.
     * @dev    Safe because Solidity 0.8 will revert on underflow automatically
     *         if we didn't use the ternary.  We keep it explicit for clarity.
     */
    function wadAbs(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a - b : b - a;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  RAY arithmetic  (27-decimal)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Multiplies two RAY values and rounds the result half-up.
     *
     * @dev    Formula:  result = (a * b + HALF_RAY) / RAY
     *
     *         Used extensively in interest index compounding:
     *           newIndex = currentIndex.rayMul(interestFactor)
     *
     * @param  a  First RAY operand.
     * @param  b  Second RAY operand.
     * @return    Product in RAY precision, rounded half-up.
     *
     * @custom:example
     *   rayMul(1.05e27, 1.0e27)  == 1.05e27   // 1.05 * 1.0 = 1.05
     *   rayMul(RAY, RAY)         == RAY        // 1 * 1      = 1
     */
    function rayMul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;

        if (a > (type(uint256).max - HALF_RAY) / b) {
            revert WadRayMath__MultiplicationOverflow();
        }

        unchecked {
            return (a * b + HALF_RAY) / RAY;
        }
    }

    /**
     * @notice Divides two RAY values and rounds the result half-up.
     *
     * @dev    Formula:  result = (a * RAY + b / 2) / b
     *
     * @param  a  Numerator in RAY.
     * @param  b  Denominator in RAY (must be non-zero).
     * @return    Quotient in RAY precision, rounded half-up.
     *
     * @custom:example
     *   rayDiv(RAY, 4 * RAY)     == 0.25e27  // 1 / 4 = 0.25
     *   rayDiv(3 * RAY, 2 * RAY) == 1.5e27   // 3 / 2 = 1.5
     */
    function rayDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        if (b == 0) revert WadRayMath__DivisionByZero();

        uint256 halfB = b / 2;

        if (a > (type(uint256).max - halfB) / RAY) {
            revert WadRayMath__MultiplicationOverflow();
        }

        unchecked {
            return (a * RAY + halfB) / b;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Cross-precision conversions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Converts a RAY (1e27) value to WAD (1e18) by dividing by 1e9.
     *
     * @dev    Rounds half-up: if the discarded digits ≥ 0.5e9, the result is
     *         incremented by 1.
     *
     *         This is commonly needed when reporting a RAY-precision interest
     *         index to a WAD-precision token balance calculation.
     *
     * @param  a  Value expressed in RAY.
     * @return    Equivalent value expressed in WAD, rounded half-up.
     */
    function rayToWad(uint256 a) internal pure returns (uint256) {
        unchecked {
            uint256 remainder = a % WAD_RAY_RATIO;
            uint256 result = a / WAD_RAY_RATIO;
            // Round half-up
            if (remainder >= HALF_WAD_RAY_RATIO) {
                result += 1;
            }
            return result;
        }
    }

    /**
     * @notice Converts a WAD (1e18) value to RAY (1e27) by multiplying by 1e9.
     *
     * @dev    Exact conversion — no rounding needed because we are only
     *         appending zeros.  However we still guard against overflow.
     *
     * @param  a  Value expressed in WAD.
     * @return    Equivalent value expressed in RAY.
     */
    function wadToRay(uint256 a) internal pure returns (uint256) {
        if (a > type(uint256).max / WAD_RAY_RATIO) {
            revert WadRayMath__MultiplicationOverflow();
        }
        unchecked {
            return a * WAD_RAY_RATIO;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Utility helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the smaller of two uint256 values.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    /**
     * @notice Returns the larger of two uint256 values.
     */
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }
}
