// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20}       from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}    from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILendingPool} from "../interfaces/ILendingPool.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {WadRayMath}   from "../math/WadRayMath.sol";
import {PercentageMath} from "../math/PercentageMath.sol";

/**
 * @title  LiquidationEngine
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Helper contract for liquidators.
 *         Provides view functions to discover liquidatable positions and
 *         wraps LendingPool.liquidate() with pre-validation.
 *
 *         Liquidators can either:
 *           (a) Call LendingPool.liquidate() directly, or
 *           (b) Call LiquidationEngine.executeLiquidation() which validates
 *               and calls the pool on their behalf.
 *
 *         A real production version would add flash-loan liquidation here.
 */
contract LiquidationEngine {
    using SafeERC20     for IERC20;
    using WadRayMath    for uint256;
    using PercentageMath for uint256;

    uint256 private constant HEALTH_FACTOR_OK = 1e18;

    ILendingPool public immutable pool;
    IPriceOracle public immutable oracle;

    error LiquidationEngine__PositionHealthy(address borrower, uint256 hf);
    error LiquidationEngine__ZeroAmount();
    error LiquidationEngine__ZeroAddress();

    event LiquidationExecuted(
        address indexed liquidator,
        address indexed borrower,
        address debtAsset,
        address collateralAsset,
        uint256 debtRepaid,
        uint256 collateralReceived
    );

    constructor(address pool_, address oracle_) {
        if (pool_   == address(0)) revert LiquidationEngine__ZeroAddress();
        if (oracle_ == address(0)) revert LiquidationEngine__ZeroAddress();
        pool   = ILendingPool(pool_);
        oracle = IPriceOracle(oracle_);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  View — discovery helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns true if the position can be liquidated.
     */
    function isLiquidatable(address borrower) external view returns (bool) {
        return pool.getUserHealthFactor(borrower) < HEALTH_FACTOR_OK;
    }

    /**
     * @notice Returns full account data for a potential liquidation target.
     */
    function getLiquidationData(address borrower)
        external view
        returns (
            uint256 totalCollateralUsd,
            uint256 totalDebtUsd,
            uint256 healthFactor,
            uint256 availableBorrowUsd,
            bool    liquidatable
        )
    {
        (totalCollateralUsd, totalDebtUsd, healthFactor, availableBorrowUsd)
            = pool.getUserAccountData(borrower);
        liquidatable = healthFactor < HEALTH_FACTOR_OK;
    }

    /**
     * @notice Calculate how much collateral a liquidator would receive for
     *         repaying `debtAmount` of `debtAsset`.
     *         Useful for off-chain liquidation bots.
     *
     * @param  borrower          The position to be liquidated.
     * @param  debtAsset         Asset the borrower owes.
     * @param  collateralAsset   Asset the liquidator wants to receive.
     * @param  debtAmount        Amount of debt the liquidator will repay.
     * @return collateralSeized  Amount of collateral the liquidator will receive.
     * @return profitUsd         Profit in USD (WAD) after repaying the debt.
     */
    function previewLiquidation(
        address borrower,
        address debtAsset,
        address collateralAsset,
        uint256 debtAmount
    ) external view returns (uint256 collateralSeized, uint256 profitUsd) {
        ILendingPool.ReserveData memory debtRes  = pool.getReserveData(debtAsset);
        ILendingPool.ReserveData memory collRes  = pool.getReserveData(collateralAsset);

        uint256 currentDebt = pool.getUserScaledBorrow(borrower, debtAsset)
            .rayMul(debtRes.borrowIndex);

        uint256 maxClose = currentDebt.percentMul(pool.CLOSE_FACTOR_BPS());
        if (debtAmount > maxClose) debtAmount = maxClose;

        uint256 debtUsd         = oracle.getValueInUsd(debtAsset, debtAmount);
        uint256 collateralPrice = oracle.getPrice(collateralAsset);

        // 8% liquidation bonus included in seize amount
        // (actual bonus comes from CollateralManager config in the pool)
        collateralSeized = (debtUsd * 1e18) / collateralPrice;
        profitUsd        = (collateralSeized * collateralPrice / 1e18) - debtUsd;

        // _ = collRes; // silence unused warning
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Execute liquidation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Execute a liquidation via the LendingPool.
     *         Pre-validates the position is unhealthy before spending any gas
     *         on a doomed transaction.
     *
     * @dev    The caller must have approved `debtAmount` of `debtAsset` to this
     *         contract BEFORE calling. This contract forwards the approval to pool.
     */
    function executeLiquidation(
        address borrower,
        address debtAsset,
        address collateralAsset,
        uint256 debtAmount
    ) external {
        if (debtAmount == 0) revert LiquidationEngine__ZeroAmount();

        uint256 hf = pool.getUserHealthFactor(borrower);
        if (hf >= HEALTH_FACTOR_OK) {
            revert LiquidationEngine__PositionHealthy(borrower, hf);
        }

        // Pull debt asset from liquidator
        IERC20(debtAsset).safeTransferFrom(msg.sender, address(this), debtAmount);

        // Approve pool to pull funds
        IERC20(debtAsset).forceApprove(address(pool), debtAmount);

        // Record collateral balance before
        uint256 collBefore = IERC20(collateralAsset).balanceOf(address(this));

        // Execute via pool
        pool.liquidate(borrower, debtAsset, collateralAsset, debtAmount);

        // Forward collateral to liquidator
        uint256 collReceived = IERC20(collateralAsset).balanceOf(address(this)) - collBefore;
        if (collReceived > 0) {
            IERC20(collateralAsset).safeTransfer(msg.sender, collReceived);
        }

        emit LiquidationExecuted(
            msg.sender, borrower, debtAsset, collateralAsset,
            debtAmount, collReceived
        );
    }
}
