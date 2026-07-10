// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  ICollateralManager
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Stores per-asset risk parameters and calculates health factors.
 *
 */
interface ICollateralManager {
    struct AssetConfig {
        uint256 ltv;
        uint256 liquidationThreshold;
        uint256 liquidationBonus;
        uint256 reserveFactor;
        uint256 supplyCap;
        uint256 borrowCap;
        bool isActive;
        bool isBorrowEnabled;
    }

    event AssetConfigured(address indexed asset, AssetConfig config);
    event AssetDisabled(address indexed asset);
    event SupplyCapUpdated(
        address indexed asset,
        uint256 oldCap,
        uint256 newCap
    );
    event BorrowCapUpdated(
        address indexed asset,
        uint256 oldCap,
        uint256 newCap
    );

    error CollateralManager__AssetNotActive(address asset);
    error CollateralManager__BorrowNotEnabled(address asset);
    error CollateralManager__InvalidConfig(string reason);
    error CollateralManager__ZeroAddress();
    error CollateralManager__Unauthorized();
    error CollateralManager__SupplyCapExceeded(
        address asset,
        uint256 cap,
        uint256 attempted
    );
    error CollateralManager__BorrowCapExceeded(
        address asset,
        uint256 cap,
        uint256 attempted
    );

    function setAssetConfig(
        address asset,
        AssetConfig calldata config
    ) external;
    function getAssetConfig(
        address asset
    ) external view returns (AssetConfig memory);
    function isAssetActive(address asset) external view returns (bool);
    function isBorrowEnabled(address asset) external view returns (bool);
    function checkSupplyCap(
        address asset,
        uint256 currentSupply,
        uint256 depositAmount
    ) external view;
    function checkBorrowCap(
        address asset,
        uint256 currentBorrows,
        uint256 borrowAmount
    ) external view;
    function calculateHealthFactor(
        address[] calldata collateralAssets,
        uint256[] calldata collateralUsds,
        uint256[] calldata debtUsds
    ) external view returns (uint256 healthFactor);
    function getMaxBorrow(
        address collateralAsset,
        uint256 collateralUsd
    ) external view returns (uint256);
}
