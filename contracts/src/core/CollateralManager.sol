// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ICollateralManager} from "../interfaces/ICollateralManager.sol";
import {PercentageMath}     from "../math/PercentageMath.sol";

/**
 * @title  CollateralManager
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Stores per-asset risk parameters and calculates health factors.
 *
 *         What it owns:
 *           - AssetConfig per asset (LTV, liqThreshold, liqBonus, reserveFactor)
 *           - Health-factor calculator (pure math — LendingPool passes USD values)
 *
 *         What it does NOT own:
 *           - User balances (LendingPool tracks those)
 *           - Oracle calls (LendingPool fetches prices, passes USD values here)
 *
 *         This clean separation means CollateralManager is testable in isolation
 *         and governance can update risk params without touching the main pool.
 */
contract CollateralManager is ICollateralManager, AccessControl {
    using PercentageMath for uint256;

    bytes32 public constant CONFIGURATOR_ROLE = keccak256("CONFIGURATOR_ROLE");

    uint256 public constant MAX_LTV                   = 9_500; // 95%
    uint256 public constant MAX_LIQUIDATION_THRESHOLD = 9_500; // 95%
    uint256 public constant MAX_LIQUIDATION_BONUS     = 2_000; // 20%
    uint256 public constant MAX_RESERVE_FACTOR        = 5_000; // 50%

    mapping(address => AssetConfig) private _configs;
    address[] private _supportedAssets;
    mapping(address => bool) private _isTracked;

    constructor(address admin) {
        if (admin == address(0)) revert CollateralManager__ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONFIGURATOR_ROLE,  admin);
    }

    // ─── Config management ────────────────────────────────────────────────────

    function setAssetConfig(address asset, AssetConfig calldata cfg)
        external override onlyRole(CONFIGURATOR_ROLE)
    {
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

    function disableAsset(address asset) external onlyRole(CONFIGURATOR_ROLE) {
        _configs[asset].isActive        = false;
        _configs[asset].isBorrowEnabled = false;
        emit AssetDisabled(asset);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function getAssetConfig(address asset) external view override returns (AssetConfig memory) {
        return _configs[asset];
    }

    function isAssetActive(address asset) external view override returns (bool) {
        return _configs[asset].isActive;
    }

    function isBorrowEnabled(address asset) external view override returns (bool) {
        return _configs[asset].isBorrowEnabled;
    }

    function getSupportedAssets() external view returns (address[] memory) {
        return _supportedAssets;
    }

    // ─── Health factor calculation ────────────────────────────────────────────

    /**
     * @notice Calculate health factor given pre-computed USD values.
     *
     *   adjustedCollateral = Σ (collateralUsd_i * liquidationThreshold_i)
     *   healthFactor = adjustedCollateral * 1e18 / totalDebtUsd
     *
     * Returns type(uint256).max when no debt exists.
     */
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
            uint256 liqThreshold = _configs[collateralAssets[i]].liquidationThreshold;
            adjustedCollateral  += collateralUsds[i].percentMul(liqThreshold);
        }

        return (adjustedCollateral * 1e18) / totalDebtUsd;
    }

    function getMaxBorrow(address collateralAsset, uint256 collateralUsd)
        external view override returns (uint256)
    {
        return collateralUsd.percentMul(_configs[collateralAsset].ltv);
    }
}
