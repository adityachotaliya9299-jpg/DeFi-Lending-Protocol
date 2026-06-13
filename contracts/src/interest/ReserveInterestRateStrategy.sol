// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {WadRayMath} from "../math/WadRayMath.sol";

/**
 * @title ReserveInterestRateStrategy
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Aave-compatible interest rate strategy per reserve
 *
 * Key design:
 * - Implements IReserveInterestRateStrategy (Aave v3 compatible interface)
 * - Each reserve can have its own strategy contract
 * - calculateInterestRates() returns (liquidityRate, stableRate, variableRate)
 * - Two-slope model: below optimal = slope1, above = slope2
 * - reserveFactor taken as input to calculate net supply rate
 */
contract ReserveInterestRateStrategy is AccessControl {
    using WadRayMath for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant RAY              = 1e27;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // ── Errors ────────────────────────────────────────────────────────────────
    error Strategy__OptimalUtilizationZero();
    error Strategy__OptimalUtilizationAbove100();
    error Strategy__ZeroAddress();

    // ── Events ────────────────────────────────────────────────────────────────
    event StrategyUpdated(
        uint256 optimalUtilization,
        uint256 baseVariableBorrowRate,
        uint256 variableRateSlope1,
        uint256 variableRateSlope2,
        uint256 stableRateSlope1,
        uint256 stableRateSlope2
    );

    // ── Parameters ────────────────────────────────────────────────────────────

    /// @notice Optimal utilization ratio (RAY-scaled, e.g. 0.8e27 = 80%)
    uint256 public optimalUtilizationRate;

    /// @notice Base variable borrow rate at 0% utilization (RAY per second)
    uint256 public baseVariableBorrowRate;

    /// @notice Variable rate slope below optimal (RAY per second)
    uint256 public variableRateSlope1;

    /// @notice Variable rate slope above optimal (RAY per second)
    uint256 public variableRateSlope2;

    /// @notice Stable rate slope below optimal (RAY per second)
    uint256 public stableRateSlope1;

    /// @notice Stable rate slope above optimal (RAY per second)
    uint256 public stableRateSlope2;

    constructor(
        address admin,
        uint256 _optimalUtilizationRate,
        uint256 _baseVariableBorrowRate,
        uint256 _variableRateSlope1,
        uint256 _variableRateSlope2,
        uint256 _stableRateSlope1,
        uint256 _stableRateSlope2
    ) {
        if (admin == address(0)) revert Strategy__ZeroAddress();
        if (_optimalUtilizationRate == 0) revert Strategy__OptimalUtilizationZero();
        if (_optimalUtilizationRate >= RAY) revert Strategy__OptimalUtilizationAbove100();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        optimalUtilizationRate  = _optimalUtilizationRate;
        baseVariableBorrowRate  = _baseVariableBorrowRate;
        variableRateSlope1      = _variableRateSlope1;
        variableRateSlope2      = _variableRateSlope2;
        stableRateSlope1        = _stableRateSlope1;
        stableRateSlope2        = _stableRateSlope2;

        emit StrategyUpdated(
            _optimalUtilizationRate,
            _baseVariableBorrowRate,
            _variableRateSlope1,
            _variableRateSlope2,
            _stableRateSlope1,
            _stableRateSlope2
        );
    }

    // =========================================================================
    //  Aave-compatible interface
    // =========================================================================

    /**
     * @notice Calculate interest rates for a reserve
     * @dev Aave v3 compatible: IReserveInterestRateStrategy
     *
     * @param availableLiquidity  Liquidity available (not borrowed)
     * @param totalStableDebt     Total stable borrows
     * @param totalVariableDebt   Total variable borrows
     * @param averageStableBorrowRate  Weighted avg stable rate (RAY)
     * @param reserveFactor       Protocol fee in BPS (e.g. 1000 = 10%)
     *
     * @return liquidityRate   Supply APR for depositors (RAY per second)
     * @return stableBorrowRate  Stable borrow rate (RAY per second)
     * @return variableBorrowRate  Variable borrow rate (RAY per second)
     */
    function calculateInterestRates(
        uint256 availableLiquidity,
        uint256 totalStableDebt,
        uint256 totalVariableDebt,
        uint256 averageStableBorrowRate,
        uint256 reserveFactor
    ) external view returns (
        uint256 liquidityRate,
        uint256 stableBorrowRate,
        uint256 variableBorrowRate
    ) {
        uint256 totalDebt = totalStableDebt + totalVariableDebt;
        uint256 totalLiquidity = availableLiquidity + totalDebt;

        uint256 utilizationRate = totalLiquidity == 0
            ? 0
            : totalDebt.rayDiv(totalLiquidity);

        if (utilizationRate <= optimalUtilizationRate) {
            // Below optimal: linear interpolation on slope1
            uint256 utilizationFraction = utilizationRate.rayDiv(optimalUtilizationRate);
            variableBorrowRate = baseVariableBorrowRate
                + variableRateSlope1.rayMul(utilizationFraction);
            stableBorrowRate = stableRateSlope1.rayMul(utilizationFraction);
        } else {
            // Above optimal: add slope2 for excess utilization
            uint256 excessUtilization = utilizationRate - optimalUtilizationRate;
            uint256 excessFraction    = excessUtilization.rayDiv(RAY - optimalUtilizationRate);
            variableBorrowRate = baseVariableBorrowRate
                + variableRateSlope1
                + variableRateSlope2.rayMul(excessFraction);
            stableBorrowRate = stableRateSlope1
                + stableRateSlope2.rayMul(excessFraction);
        }

        // Stable rate includes a buffer over variable to incentivize variable mode
        stableBorrowRate += variableBorrowRate / 10; // +10% buffer

        // liquidityRate = weighted avg borrow rate * utilization * (1 - reserveFactor)
        uint256 weightedBorrowRate = totalDebt == 0
            ? 0
            : (totalVariableDebt.rayMul(variableBorrowRate) +
               totalStableDebt.rayMul(averageStableBorrowRate)).rayDiv(
                   totalDebt.wadToRay()
               );

        uint256 reserveFactorRay = reserveFactor * (RAY / 10_000);
        liquidityRate = weightedBorrowRate
            .rayMul(utilizationRate)
            .rayMul(RAY - reserveFactorRay);
    }

    /**
     * @notice Update strategy parameters (admin only)
     */
    function updateStrategy(
        uint256 _optimalUtilizationRate,
        uint256 _baseVariableBorrowRate,
        uint256 _variableRateSlope1,
        uint256 _variableRateSlope2,
        uint256 _stableRateSlope1,
        uint256 _stableRateSlope2
    ) external onlyRole(ADMIN_ROLE) {
        if (_optimalUtilizationRate == 0) revert Strategy__OptimalUtilizationZero();
        if (_optimalUtilizationRate >= RAY) revert Strategy__OptimalUtilizationAbove100();

        optimalUtilizationRate = _optimalUtilizationRate;
        baseVariableBorrowRate = _baseVariableBorrowRate;
        variableRateSlope1     = _variableRateSlope1;
        variableRateSlope2     = _variableRateSlope2;
        stableRateSlope1       = _stableRateSlope1;
        stableRateSlope2       = _stableRateSlope2;

        emit StrategyUpdated(
            _optimalUtilizationRate,
            _baseVariableBorrowRate,
            _variableRateSlope1,
            _variableRateSlope2,
            _stableRateSlope1,
            _stableRateSlope2
        );
    }

    // =========================================================================
    //  View helpers
    // =========================================================================

    function getOptimalUtilizationRate() external view returns (uint256) {
        return optimalUtilizationRate;
    }

    function calculateUtilizationRate(
        uint256 availableLiquidity,
        uint256 totalDebt
    ) external pure returns (uint256) {
        uint256 totalLiquidity = availableLiquidity + totalDebt;
        if (totalLiquidity == 0) return 0;
        return totalDebt.rayDiv(totalLiquidity);
    }
}
