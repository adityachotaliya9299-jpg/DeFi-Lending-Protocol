// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  ICollateralManager
 * @notice Stores per-asset risk parameters and calculates health factors.
 */
interface ICollateralManager {

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct AssetConfig {
        uint256 ltv;                   // max borrow ratio in bps (e.g. 8000 = 80%)
        uint256 liquidationThreshold;  // health-factor trigger in bps (e.g. 8500 = 85%)
        uint256 liquidationBonus;      // bonus paid to liquidators in bps (e.g. 800 = 8%)
        uint256 reserveFactor;         // protocol's cut of interest in bps (e.g. 1000 = 10%)
        bool    isActive;              // can be deposited as collateral
        bool    isBorrowEnabled;       // can be borrowed against collateral
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    event AssetConfigured(address indexed asset, AssetConfig config);
    event AssetDisabled(address indexed asset);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error CollateralManager__AssetNotActive(address asset);
    error CollateralManager__BorrowNotEnabled(address asset);
    error CollateralManager__InvalidConfig(string reason);
    error CollateralManager__ZeroAddress();
    error CollateralManager__Unauthorized();

    // ─── Config management ────────────────────────────────────────────────────

    function setAssetConfig(address asset, AssetConfig calldata config) external;
    function getAssetConfig(address asset) external view returns (AssetConfig memory);
    function isAssetActive(address asset) external view returns (bool);
    function isBorrowEnabled(address asset) external view returns (bool);

    // ─── Health factor calculation ────────────────────────────────────────────

    /**
     * @notice Calculates health factor given pre-computed USD values.
     * @param  collateralAssets  List of collateral asset addresses.
     * @param  collateralUsds    USD value of each collateral (WAD).
     * @param  debtUsds          USD value of each debt (WAD).
     * @return healthFactor      In WAD. >= 1e18 = safe, < 1e18 = liquidatable.
     */
    function calculateHealthFactor(
        address[] calldata collateralAssets,
        uint256[] calldata collateralUsds,
        uint256[] calldata debtUsds
    ) external view returns (uint256 healthFactor);

    /**
     * @notice Returns the max borrow value (USD WAD) for a given collateral value.
     */
    function getMaxBorrow(address collateralAsset, uint256 collateralUsd)
        external view returns (uint256 maxBorrowUsd);
}
