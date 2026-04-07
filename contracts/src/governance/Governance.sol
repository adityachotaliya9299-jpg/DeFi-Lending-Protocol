// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable}           from "@openzeppelin/contracts/access/Ownable.sol";
import {ICollateralManager} from "../interfaces/ICollateralManager.sol";
import {IInterestRateModel} from "../interfaces/IInterestRateModel.sol";
import {InterestRateModel}  from "../interest/InterestRateModel.sol";

/**
 * @title  Governance
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice DAO-controlled parameter manager.
 *
 *         Controls:
 *           • Asset risk parameters (LTV, liquidation threshold, bonus, reserveFactor)
 *           • Interest rate model parameters (base rate, slopes, optimal utilization)
 *           • Treasury address
 *
 *         Architecture note:
 *           This is a simple owner-controlled governance contract suitable for
 *           a portfolio project. A production protocol would use a timelocked
 *           DAO (e.g. OpenZeppelin Governor) so that parameter changes require
 *           community voting with a mandatory delay.
 *
 *         Roles granted on deployment:
 *           • CollateralManager.CONFIGURATOR_ROLE → this contract
 *           • InterestRateModel.owner             → this contract (via transferOwnership)
 */
contract Governance is Ownable {

    ICollateralManager public immutable collateralManager;
    InterestRateModel  public immutable interestRateModel;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AssetConfigProposed(address indexed asset, ICollateralManager.AssetConfig config);
    event AssetConfigExecuted(address indexed asset);
    event RateParamsUpdated(uint256 baseRate, uint256 slope1, uint256 slope2, uint256 optimal);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error Governance__ZeroAddress();
    error Governance__InvalidParams(string reason);

    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address owner_,
        address collateralManager_,
        address interestRateModel_
    ) Ownable(owner_) {
        if (owner_             == address(0)) revert Governance__ZeroAddress();
        if (collateralManager_ == address(0)) revert Governance__ZeroAddress();
        if (interestRateModel_ == address(0)) revert Governance__ZeroAddress();

        collateralManager = ICollateralManager(collateralManager_);
        interestRateModel = InterestRateModel(interestRateModel_);
    }

    // ─── Asset configuration ──────────────────────────────────────────────────

    /**
     * @notice Set or update the risk configuration for an asset.
     *         Governance must hold CONFIGURATOR_ROLE on CollateralManager.
     */
    function configureAsset(
        address asset,
        ICollateralManager.AssetConfig calldata config
    ) external onlyOwner {
        if (asset == address(0)) revert Governance__ZeroAddress();
        collateralManager.setAssetConfig(asset, config);
        emit AssetConfigProposed(asset, config);
        emit AssetConfigExecuted(asset);
    }

    /**
     * @notice Disable an asset (freeze new deposits/borrows).
     */
    function disableAsset(address asset) external onlyOwner {
        collateralManager.setAssetConfig(
            asset,
            ICollateralManager.AssetConfig({
                ltv:                  0,
                liquidationThreshold: 1, // must be > ltv
                liquidationBonus:     0,
                reserveFactor:        0,
                isActive:             false,
                isBorrowEnabled:      false
            })
        );
    }

    // ─── Interest rate parameters ─────────────────────────────────────────────

    /**
     * @notice Update the global interest rate curve.
     *         Governance must be the owner of InterestRateModel.
     *
     * @param  baseRate    Base APR in basis points (e.g. 100 = 1%).
     * @param  slopeOne    Slope below kink in bps (e.g. 400 = 4%).
     * @param  slopeTwo    Slope above kink in bps (e.g. 7500 = 75%).
     * @param  optimalUtil Optimal utilization in bps (e.g. 8000 = 80%).
     */
    function setInterestRateParams(
        uint256 baseRate,
        uint256 slopeOne,
        uint256 slopeTwo,
        uint256 optimalUtil
    ) external onlyOwner {
        interestRateModel.setRateParams(baseRate, slopeOne, slopeTwo, optimalUtil);
        emit RateParamsUpdated(baseRate, slopeOne, slopeTwo, optimalUtil);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    function getAssetConfig(address asset)
        external view returns (ICollateralManager.AssetConfig memory)
    {
        return collateralManager.getAssetConfig(asset);
    }

    function getCurrentRateParams()
        external view
        returns (
            uint256 baseRateRay,
            uint256 slopeOneRay,
            uint256 slopeTwoRay,
            uint256 optimalUtilizationRay
        )
    {
        return (
            interestRateModel.baseRateRay(),
            interestRateModel.slopeOneRay(),
            interestRateModel.slopeTwoRay(),
            interestRateModel.optimalUtilizationRay()
        );
    }
}
