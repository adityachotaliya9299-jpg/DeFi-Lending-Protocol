// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IInterestRateModel} from "../interfaces/IInterestRateModel.sol";
import {WadRayMath} from "../math/WadRayMath.sol";
import {PercentageMath} from "../math/PercentageMath.sol";

/**
 * @title  InterestRateModel
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Two-slope (kinked) interest rate model identical in design to Aave v2/v3.
 *
 * ─── How the curve works ────────────────────────────────────────────────────
 *
 *  APR (RAY)
 *    │                          ╱  ← slope2 (steep)
 *    │                         ╱
 *    │                        ╱
 *    │              ─────────╱   ← kink point at optimalUtilization
 *    │        ╱ ← slope1 (gentle)
 *    │       ╱
 *    │──────╱  ← baseRate
 *    └──────────────────────────── Utilization (0% → 100%)
 *           0%     Uoptimal  100%
 *
 *  Below the kink  (U ≤ Uoptimal):
 *    borrowRate = baseRate + slope1 * (U / Uoptimal)
 *
 *  Above the kink  (U > Uoptimal):
 *    excess     = (U - Uoptimal) / (1 - Uoptimal)
 *    borrowRate = baseRate + slope1 + slope2 * excess
 *
 *  Supply rate:
 *    supplyRate = borrowRate * U * (1 - reserveFactor)
 *
 * ─── Default parameters ─────────────────────────────────────────────────────
 *
 *  baseRate            = 1%   APR  (floor: lenders always earn something)
 *  slope1              = 4%   APR  (gradual increase below kink)
 *  slope2              = 75%  APR  (cliff above kink — strongly discourages
 *                                   over-utilization so the pool stays liquid)
 *  optimalUtilization  = 80%       (Aave default for ETH-like assets)
 *
 * ─── Unit conventions ────────────────────────────────────────────────────────
 *
 *  All rates stored and returned in RAY (1e27) per SECOND, because that is
 *  the native unit used by the interest index in the LendingPool.
 *  The yearly rate constants below are divided by SECONDS_PER_YEAR on read
 *  so that `borrowRate * secondsElapsed` gives the correct interest factor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
contract InterestRateModel is IInterestRateModel, Ownable {
    using WadRayMath for uint256;
    using PercentageMath for uint256;

    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public constant RAY = WadRayMath.RAY;

    /// @dev Seconds in a 365-day year. Used to convert APR → per-second rate.
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    /// @dev Maximum allowed APR in RAY (1000% — safety cap).
    uint256 public constant MAX_RATE_RAY = 1_000 * RAY / 100;

    // ─────────────────────────────────────────────────────────────────────────
    //  Rate parameters (stored as annual rates in RAY)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Minimum borrow APR at 0% utilization (RAY).
    uint256 public baseRateRay;

    /// @notice Additional APR per unit of utilization below the kink (RAY).
    uint256 public slopeOneRay;

    /// @notice Additional APR per unit of utilization above the kink (RAY).
    uint256 public slopeTwoRay;

    /// @notice Utilization rate at which the slope transitions (RAY).
    ///         e.g. 0.80e27 = 80%
    uint256 public optimalUtilizationRay;

    /// @dev Complement: 1 - optimalUtilization (cached to avoid repeated subtraction).
    uint256 private _excessUtilizationRay;

    // ─────────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param initialOwner  Address that can update rate parameters (Governance).
     * @param baseRate      Base APR in basis points (e.g. 100 = 1%).
     * @param slopeOne      Slope-1 APR in basis points (e.g. 400 = 4%).
     * @param slopeTwo      Slope-2 APR in basis points (e.g. 7500 = 75%).
     * @param optimalUtil   Optimal utilization in basis points (e.g. 8000 = 80%).
     */
    constructor(
        address initialOwner,
        uint256 baseRate,
        uint256 slopeOne,
        uint256 slopeTwo,
        uint256 optimalUtil
    ) Ownable(initialOwner) {
        _setRateParams(baseRate, slopeOne, slopeTwo, optimalUtil);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Admin
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Updates rate parameters.  All values in basis points.
     * @dev    Can only be called by governance (owner).
     */
    function setRateParams(
        uint256 baseRate,
        uint256 slopeOne,
        uint256 slopeTwo,
        uint256 optimalUtil
    ) external onlyOwner {
        _setRateParams(baseRate, slopeOne, slopeTwo, optimalUtil);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  IInterestRateModel implementation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @inheritdoc IInterestRateModel
     *
     * @dev  Returns the per-SECOND borrow rate in RAY.
     *
     *       Two-slope formula:
     *
     *       if U ≤ Uoptimal:
     *         annualRate = baseRate + slope1 * (U / Uoptimal)
     *
     *       else:
     *         excess     = (U - Uoptimal) / (1 - Uoptimal)
     *         annualRate = baseRate + slope1 + slope2 * excess
     *
     *       perSecondRate = annualRate / SECONDS_PER_YEAR
     */
    function calculateBorrowRate(uint256 totalLiquidity, uint256 totalBorrows)
        external
        view
        override
        returns (uint256 borrowRateRay)
    {
        uint256 utilization = _utilization(totalLiquidity, totalBorrows);
        return _borrowRateFromUtilization(utilization);
    }

    /**
     * @inheritdoc IInterestRateModel
     *
     * @dev  supplyRate = borrowRate * utilizationRate * (1 - reserveFactor)
     *
     *       The reserveFactor is in basis points (e.g. 1000 = 10%).
     *       (1 - reserveFactor) = (PERCENTAGE_FACTOR - reserveFactor) / PERCENTAGE_FACTOR
     */
    function calculateSupplyRate(
        uint256 totalLiquidity,
        uint256 totalBorrows,
        uint256 reserveFactor
    ) external view override returns (uint256 supplyRateRay) {
        if (totalLiquidity == 0 || totalBorrows == 0) return 0;

        uint256 utilization  = _utilization(totalLiquidity, totalBorrows);
        uint256 borrowRate   = _borrowRateFromUtilization(utilization);

        // supplyRate = borrowRate * U * (1 - reserveFactor)
        // Step 1: borrowRate * U  (both in RAY → rayMul)
        uint256 grossSupply  = borrowRate.rayMul(utilization);

        // Step 2: apply (1 - reserveFactor) reduction using percentMul
        // (1 - reserveFactor) in bps = PERCENTAGE_FACTOR - reserveFactor
        uint256 lenderShare  = PercentageMath.PERCENTAGE_FACTOR - reserveFactor;

        supplyRateRay        = grossSupply.percentMul(lenderShare);
    }

    /**
     * @inheritdoc IInterestRateModel
     */
    function getUtilizationRate(uint256 totalLiquidity, uint256 totalBorrows)
        external
        pure
        override
        returns (uint256 utilizationRay)
    {
        return _utilization(totalLiquidity, totalBorrows);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  View helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the full annual borrow rate curve for display purposes.
     *         Useful for the frontend to render the rate chart.
     *
     * @return utilizationRay   Current utilization in RAY.
     * @return annualBorrowRate Current annual borrow rate in RAY.
     * @return annualSupplyRate Current annual supply rate in RAY.
     */
    function getRateData(
        uint256 totalLiquidity,
        uint256 totalBorrows,
        uint256 reserveFactor
    ) external view returns (
        uint256 utilizationRay,
        uint256 annualBorrowRate,
        uint256 annualSupplyRate
    ) {
        utilizationRay   = _utilization(totalLiquidity, totalBorrows);
        uint256 perSec   = _borrowRateFromUtilization(utilizationRay);

        // Convert per-second rate back to annual for display
        annualBorrowRate = perSec * SECONDS_PER_YEAR;

        uint256 grossSupply  = perSec.rayMul(utilizationRay) * SECONDS_PER_YEAR;
        uint256 lenderShare  = PercentageMath.PERCENTAGE_FACTOR - reserveFactor;
        annualSupplyRate     = grossSupply.percentMul(lenderShare);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Calculates utilization rate in RAY.
     *      Returns 0 when liquidity is 0 (empty pool).
     *      Caps at RAY (100%) if borrows somehow exceed liquidity.
     */
    function _utilization(uint256 totalLiquidity, uint256 totalBorrows)
        internal
        pure
        returns (uint256)
    {
        if (totalLiquidity == 0) return 0;
        if (totalBorrows >= totalLiquidity) return RAY; // 100% — capped

        
        return WadRayMath.rayDiv(totalBorrows, totalLiquidity);
    }

    /**
     * @dev Applies the two-slope formula and converts annual rate → per-second.
     */
    function _borrowRateFromUtilization(uint256 utilizationRay)
        internal
        view
        returns (uint256 perSecondRay)
    {
        uint256 annualRay;

        if (utilizationRay <= optimalUtilizationRay) {
            // ── Below kink ───────────────────────────────────────────────────
            // annualRate = baseRate + slope1 * (U / Uoptimal)
            //
            // slope1 * (U / Uoptimal) uses rayDiv to keep RAY precision.
            uint256 slope1Contribution = slopeOneRay.rayMul(
                WadRayMath.rayDiv(utilizationRay, optimalUtilizationRay)
            );
            annualRay = baseRateRay + slope1Contribution;
        } else {
            // ── Above kink ───────────────────────────────────────────────────
            // excess = (U - Uoptimal) / (1 - Uoptimal)
            uint256 excessUtilization = utilizationRay - optimalUtilizationRay;
            uint256 excessRatio = WadRayMath.rayDiv(excessUtilization, _excessUtilizationRay);

            uint256 slope2Contribution = slopeTwoRay.rayMul(excessRatio);
            annualRay = baseRateRay + slopeOneRay + slope2Contribution;
        }

        // Convert annual rate → per-second rate
        // perSecondRate = annualRate / SECONDS_PER_YEAR
        perSecondRay = annualRay / SECONDS_PER_YEAR;
    }

    /**
     * @dev Converts basis-point inputs to RAY and validates + stores them.
     */
    function _setRateParams(
        uint256 baseRate,
        uint256 slopeOne,
        uint256 slopeTwo,
        uint256 optimalUtil
    ) internal {
        // Validate optimalUtil: must be in (0, 100%)
        require(optimalUtil > 0 && optimalUtil < PercentageMath.PERCENTAGE_FACTOR,
            "IRM: invalid optimalUtil");

        // Convert bps → RAY: bps * RAY / PERCENTAGE_FACTOR
        uint256 base    = bpsToRay(baseRate);
        uint256 slope1  = bpsToRay(slopeOne);
        uint256 slope2  = bpsToRay(slopeTwo);
        uint256 optimal = bpsToRay(optimalUtil);

        // Cap each rate at MAX_RATE_RAY
        if (base   > MAX_RATE_RAY) revert InterestRateModel__InvalidRate(base,   MAX_RATE_RAY);
        if (slope1 > MAX_RATE_RAY) revert InterestRateModel__InvalidRate(slope1, MAX_RATE_RAY);
        if (slope2 > MAX_RATE_RAY) revert InterestRateModel__InvalidRate(slope2, MAX_RATE_RAY);

        baseRateRay           = base;
        slopeOneRay           = slope1;
        slopeTwoRay           = slope2;
        optimalUtilizationRay = optimal;
        _excessUtilizationRay = RAY - optimal; // 1 - Uoptimal

        emit RateParamsUpdated(base, slope1, slope2, optimal);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Pure utility
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Converts a basis-point percentage to RAY.
     *         1 bps = 0.01% → RAY / 10_000
     */
    function bpsToRay(uint256 bps) public pure returns (uint256) {
        return (bps * RAY) / PercentageMath.PERCENTAGE_FACTOR;
    }
}
