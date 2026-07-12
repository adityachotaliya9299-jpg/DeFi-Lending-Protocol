// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ICollateralManager} from "../interfaces/ICollateralManager.sol";
import {PercentageMath} from "../math/PercentageMath.sol";

/**
 * @title  CollateralManager
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Stores per-asset risk parameters and calculates health factors.
 *
 * Phase 1 additions:
 *   - supplyCap per asset — governance can cap total deposits (e.g. WETH: 10,000 WETH max)
 *   - borrowCap per asset — governance can cap total borrows  (e.g. USDC: 8,000,000 USDC max)
 *   - checkSupplyCap() — pure view, called by LendingPool before every deposit
 *   - checkBorrowCap() — pure view, called by LendingPool before every borrow
 *   - setSupplyCap() / setBorrowCap() — governance-only cap updates with events
 *
 * Why caps matter:
 *   Without caps, a single asset with a compromised oracle can drain the
 *   entire pool. Aave v3 introduced supply/borrow caps after multiple exploits
 *   used unlimited collateral to extract all liquidity. Caps limit the
 *   maximum possible loss to the configured ceiling.
 */
contract CollateralManager is ICollateralManager, AccessControl {
    using PercentageMath for uint256;

    bytes32 public constant CONFIGURATOR_ROLE = keccak256("CONFIGURATOR_ROLE");

    uint256 public constant MAX_LTV = 9_500;
    uint256 public constant MAX_LIQUIDATION_THRESHOLD = 9_500;
    uint256 public constant MAX_LIQUIDATION_BONUS = 2_000;
    uint256 public constant MAX_RESERVE_FACTOR = 5_000;

    mapping(address => AssetConfig) private _configs;
    address[] private _supportedAssets;
    mapping(address => bool) private _isTracked;

    constructor(address admin) {
        if (admin == address(0)) revert CollateralManager__ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONFIGURATOR_ROLE, admin);
    }

    // ─── Config management ────────────────────────────────────────────────────

    function setAssetConfig(
        address asset,
        AssetConfig calldata cfg
    ) external override onlyRole(CONFIGURATOR_ROLE) {
        if (asset == address(0)) revert CollateralManager__ZeroAddress();
        if (cfg.ltv >= cfg.liquidationThreshold)
            revert CollateralManager__InvalidConfig("ltv >= liqThreshold");
        if (cfg.liquidationThreshold > MAX_LIQUIDATION_THRESHOLD)
            revert CollateralManager__InvalidConfig("liqThreshold too high");
        if (cfg.ltv > MAX_LTV)
            revert CollateralManager__InvalidConfig("ltv too high");
        if (cfg.liquidationBonus > MAX_LIQUIDATION_BONUS)
            revert CollateralManager__InvalidConfig("bonus too high");
        if (cfg.reserveFactor > MAX_RESERVE_FACTOR)
            revert CollateralManager__InvalidConfig("reserveFactor too high");

        if (!_isTracked[asset]) {
            _supportedAssets.push(asset);
            _isTracked[asset] = true;
        }

        _configs[asset] = cfg;
        emit AssetConfigured(asset, cfg);
    }

    /**
     * @notice Update the supply cap for an asset.
     * @param  asset     The asset to update.
     * @param  newCap    New maximum total deposits in asset units. 0 = unlimited.
     *
     * Example: setSupplyCap(WETH, 10_000e18) caps WETH deposits at 10,000 WETH.
     */
    function setSupplyCap(
        address asset,
        uint256 newCap
    ) external onlyRole(CONFIGURATOR_ROLE) {
        uint256 oldCap = _configs[asset].supplyCap;
        _configs[asset].supplyCap = newCap;
        emit SupplyCapUpdated(asset, oldCap, newCap);
    }

    /**
     * @notice Update the borrow cap for an asset.
     * @param  asset     The asset to update.
     * @param  newCap    New maximum total borrows in asset units. 0 = unlimited.
     *
     * Example: setBorrowCap(USDC, 8_000_000e6) caps USDC borrows at 8M USDC.
     */
    function setBorrowCap(
        address asset,
        uint256 newCap
    ) external onlyRole(CONFIGURATOR_ROLE) {
        uint256 oldCap = _configs[asset].borrowCap;
        _configs[asset].borrowCap = newCap;
        emit BorrowCapUpdated(asset, oldCap, newCap);
    }

    function disableAsset(address asset) external onlyRole(CONFIGURATOR_ROLE) {
        _configs[asset].isActive = false;
        _configs[asset].isBorrowEnabled = false;
        emit AssetDisabled(asset);
    }

    // ─── Cap checkers ─────────────────────────────────────────────────────────

    /**
     * @notice Reverts if depositing `depositAmount` would exceed the supply cap.
     * @dev    Called by LendingPool.deposit() before any state changes.
     *         The pool passes the current totalScaledDeposits (converted to asset units)
     *         so this function is purely a view — no storage writes.
     */
    function checkSupplyCap(
        address asset,
        uint256 currentSupply,
        uint256 depositAmount
    ) external view override {
        uint256 cap = _configs[asset].supplyCap;
        if (cap == 0) return; // 0 = unlimited, skip check

        uint256 newSupply = currentSupply + depositAmount;
        if (newSupply > cap)
            revert CollateralManager__SupplyCapExceeded(asset, cap, newSupply);
    }

    /**
     * @notice Reverts if borrowing `borrowAmount` would exceed the borrow cap.
     * @dev    Called by LendingPool.borrow() before any state changes.
     */
    function checkBorrowCap(
        address asset,
        uint256 currentBorrows,
        uint256 borrowAmount
    ) external view override {
        uint256 cap = _configs[asset].borrowCap;
        if (cap == 0) return; // 0 = unlimited, skip check

        uint256 newBorrows = currentBorrows + borrowAmount;
        if (newBorrows > cap)
            revert CollateralManager__BorrowCapExceeded(asset, cap, newBorrows);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function getAssetConfig(
        address asset
    ) external view override returns (AssetConfig memory) {
        return _configs[asset];
    }

    function isAssetActive(
        address asset
    ) external view override returns (bool) {
        return _configs[asset].isActive;
    }

    function isBorrowEnabled(
        address asset
    ) external view override returns (bool) {
        return _configs[asset].isBorrowEnabled;
    }

    function getSupportedAssets() external view returns (address[] memory) {
        return _supportedAssets;
    }

    function getSupplyCap(address asset) external view returns (uint256) {
        return _configs[asset].supplyCap;
    }

    function getBorrowCap(address asset) external view returns (uint256) {
        return _configs[asset].borrowCap;
    }

    // ─── Health factor calculation ────────────────────────────────────────────

    function calculateHealthFactor(
        address[] calldata collateralAssets,
        uint256[] calldata collateralUsds,
        uint256[] calldata debtUsds
    ) external view override returns (uint256 healthFactor) {
        uint256 totalDebtUsd;
        for (uint256 i; i < debtUsds.length; ++i) {
            totalDebtUsd += debtUsds[i];
        }
        if (totalDebtUsd == 0) return type(uint256).max;

        uint256 adjustedCollateral;
        for (uint256 i; i < collateralAssets.length; ++i) {
            uint256 liqThreshold = _configs[collateralAssets[i]]
                .liquidationThreshold;
            adjustedCollateral += collateralUsds[i].percentMul(liqThreshold);
        }

        return (adjustedCollateral * 1e18) / totalDebtUsd;
    }

    function getMaxBorrow(
        address collateralAsset,
        uint256 collateralUsd
    ) external view override returns (uint256) {
        return collateralUsd.percentMul(_configs[collateralAsset].ltv);
    }
}
