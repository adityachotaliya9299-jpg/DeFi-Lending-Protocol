// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  EfficiencyMode (E-Mode)
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Inspired by Aave v3 Efficiency Mode.
 *
 * ─── What is E-Mode? ──────────────────────────────────────────────────────────
 *
 *   Assets in the same "E-Mode category" are considered highly correlated —
 *   their prices move together (e.g. ETH and stETH, USDC and USDT, BTC and WBTC).
 *
 *   When ALL of a user's collateral AND debt are in the same E-Mode category,
 *   they get significantly higher LTV and liquidation thresholds, because the
 *   risk of under-collateralisation is much lower for correlated assets.
 *
 * ─── Categories ───────────────────────────────────────────────────────────────
 *
 *   Category 0: No E-Mode (default for all assets)
 *   Category 1: ETH-correlated (ETH, stETH, rETH, cbETH)
 *   Category 2: Stablecoins (USDC, USDT, DAI, FRAX)
 *   Category 3: BTC-correlated (WBTC, tBTC, cbBTC)
 *
 * ─── Example ──────────────────────────────────────────────────────────────────
 *
 *   Standard USDC LTV = 85%, standard USDT LTV = 85%
 *   E-Mode Stablecoin LTV = 97% — because if you deposit USDC and borrow USDT,
 *   both are pegged to $1 so there's almost no liquidation risk from price swings.
 *
 * ─── Parameter override ───────────────────────────────────────────────────────
 *
 *   When a user is in E-Mode, their effective LTV and liquidation threshold
 *   come from the category config, NOT the per-asset CollateralManager config.
 */
library EfficiencyMode {

    uint8 public constant NO_EMODE = 0;

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct EModeCategory {
        uint16 ltv;                    // bps — overrides asset LTV
        uint16 liquidationThreshold;   // bps — overrides asset liquidationThreshold
        uint16 liquidationBonus;       // bps — overrides asset liquidationBonus
        string label;                  // e.g. "ETH Correlated"
        bool   active;
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error EMode__CategoryNotActive(uint8 categoryId);
    error EMode__CategoryNotFound(uint8 categoryId);
    error EMode__InvalidParams(string reason);

    // ─── Validation ───────────────────────────────────────────────────────────

    /**
     * @notice Check if a user's collateral and borrow are in the same E-Mode category.
     * @param userEModeCategory    The E-Mode category the user has opted into.
     * @param collateralEModeId    The E-Mode ID of the collateral asset.
     * @param borrowEModeId        The E-Mode ID of the borrow asset.
     * @return eligible            True if user gets E-Mode parameters.
     */
    function isEModeEligible(
        uint8 userEModeCategory,
        uint8 collateralEModeId,
        uint8 borrowEModeId
    ) internal pure returns (bool eligible) {
        if (userEModeCategory == NO_EMODE) return false;
        return (
            collateralEModeId == userEModeCategory &&
            borrowEModeId     == userEModeCategory
        );
    }

    /**
     * @notice Get effective LTV — E-Mode overrides standard if eligible.
     * @param standard     Standard LTV from CollateralManager (bps).
     * @param emodeLtv     E-Mode LTV from category (bps).
     * @param eligible     Whether user qualifies for E-Mode.
     */
    function getEffectiveLtv(
        uint256 standard,
        uint16  emodeLtv,
        bool    eligible
    ) internal pure returns (uint256) {
        return eligible ? uint256(emodeLtv) : standard;
    }

    /**
     * @notice Get effective liquidation threshold.
     */
    function getEffectiveLiqThreshold(
        uint256 standard,
        uint16  eLiqThreshold,
        bool    eligible
    ) internal pure returns (uint256) {
        return eligible ? uint256(eLiqThreshold) : standard;
    }

    /**
     * @notice Validate E-Mode category parameters on creation.
     */
    function validateCategory(EModeCategory memory cat) internal pure {
        if (cat.ltv == 0 || cat.ltv >= 10_000)
            revert EMode__InvalidParams("ltv out of range");
        if (cat.liquidationThreshold <= cat.ltv)
            revert EMode__InvalidParams("liqThreshold must be > ltv");
        if (cat.liquidationThreshold > 9_900)
            revert EMode__InvalidParams("liqThreshold too high");
    }
}
