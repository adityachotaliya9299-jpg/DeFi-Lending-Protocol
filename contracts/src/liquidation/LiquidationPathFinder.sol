// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title LiquidationPathFinder
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Finds optimal collateral path for multi-collateral liquidations
 *
 * Key design:
 * - Borrower may have N collateral assets and M debt assets
 * - Liquidator calls findBestPath(borrower) to get optimal (collateral, debt) pair
 * - Optimal = maximizes liquidation bonus (collateral with highest bonus %)
 * - Secondary sort: largest collateral position (more profitable in USD)
 * - Returns ranked list of (collateralAsset, debtAsset, collateralUsd, bonus)
 * - Integrates with LendingPool view functions (no state changes)
 */
contract LiquidationPathFinder is AccessControl {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    error PathFinder__ZeroAddress();
    error PathFinder__NoLiquidatablePath(address borrower);
    error PathFinder__HealthFactorOk(address borrower, uint256 hf);

    event PathFound(
        address indexed borrower,
        address collateralAsset,
        address debtAsset,
        uint256 collateralUsd,
        uint256 bonusBps
    );

    struct LiquidationPath {
        address collateralAsset;
        address debtAsset;
        uint256 collateralUsd;   // USD value of collateral position
        uint256 debtUsd;         // USD value of debt position
        uint256 bonusBps;        // liquidation bonus in BPS
        uint256 maxRepayUsd;     // max repayable (50% close factor)
        uint256 seizeableUsd;    // collateral seizable incl. bonus
    }

    address public immutable pool;
    address public immutable oracle;
    address public immutable collateralManager;

    uint256 public constant CLOSE_FACTOR_BPS = 5_000; // 50%
    uint256 public constant BPS_TOTAL        = 10_000;
    uint256 public constant HEALTH_FACTOR_OK = 1e18;

    constructor(address admin, address _pool, address _oracle, address _cm) {
        if (admin == address(0) || _pool == address(0) ||
            _oracle == address(0) || _cm == address(0))
            revert PathFinder__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        pool              = _pool;
        oracle            = _oracle;
        collateralManager = _cm;
    }

    // =========================================================================
    //  Path Finding
    // =========================================================================

    /**
     * @notice Find the single best liquidation path for a borrower
     * @param borrower        Address to liquidate
     * @param collateralAssets All assets borrower has deposited
     * @param debtAssets       All assets borrower has borrowed
     * @return best The optimal liquidation path
     */
    function findBestPath(
        address borrower,
        address[] calldata collateralAssets,
        address[] calldata debtAssets
    ) external returns (LiquidationPath memory best) {
        if (borrower == address(0)) revert PathFinder__ZeroAddress();

        // Check health factor
        uint256 hf = _getHealthFactor(borrower);
        if (hf >= HEALTH_FACTOR_OK)
            revert PathFinder__HealthFactorOk(borrower, hf);

        bool found = false;
        uint256 bestScore = 0;

        for (uint256 c; c < collateralAssets.length; c++) {
            address colAsset = collateralAssets[c];
            uint256 colUsd   = _getCollateralUsd(borrower, colAsset);
            if (colUsd == 0) continue;

            uint256 bonusBps = _getLiquidationBonus(colAsset);

            for (uint256 d; d < debtAssets.length; d++) {
                address debtAsset = debtAssets[d];
                uint256 debtUsd   = _getDebtUsd(borrower, debtAsset);
                if (debtUsd == 0) continue;

                // Score = bonus BPS * collateral USD (prioritise high bonus + large position)
                uint256 score = bonusBps * colUsd;

                if (!found || score > bestScore) {
                    bestScore = score;
                    found     = true;

                    uint256 maxRepay  = (debtUsd * CLOSE_FACTOR_BPS) / BPS_TOTAL;
                    uint256 seizable  = (maxRepay * (BPS_TOTAL + bonusBps)) / BPS_TOTAL;

                    best = LiquidationPath({
                        collateralAsset: colAsset,
                        debtAsset:       debtAsset,
                        collateralUsd:   colUsd,
                        debtUsd:         debtUsd,
                        bonusBps:        bonusBps,
                        maxRepayUsd:     maxRepay,
                        seizeableUsd:    seizable > colUsd ? colUsd : seizable
                    });
                }
            }
        }

        if (!found) revert PathFinder__NoLiquidatablePath(borrower);

        emit PathFound(borrower, best.collateralAsset, best.debtAsset, best.collateralUsd, best.bonusBps);
    }

    /**
     * @notice Rank all possible paths sorted by score descending
     */
    function rankPaths(
        address borrower,
        address[] calldata collateralAssets,
        address[] calldata debtAssets
    ) external view returns (LiquidationPath[] memory paths, uint256 count) {
        paths = new LiquidationPath[](collateralAssets.length * debtAssets.length);
        count = 0;

        for (uint256 c; c < collateralAssets.length; c++) {
            uint256 colUsd   = _getCollateralUsd(borrower, collateralAssets[c]);
            if (colUsd == 0) continue;
            uint256 bonusBps = _getLiquidationBonus(collateralAssets[c]);

            for (uint256 d; d < debtAssets.length; d++) {
                uint256 debtUsd = _getDebtUsd(borrower, debtAssets[d]);
                if (debtUsd == 0) continue;

                uint256 maxRepay = (debtUsd * CLOSE_FACTOR_BPS) / BPS_TOTAL;
                uint256 seizable = (maxRepay * (BPS_TOTAL + bonusBps)) / BPS_TOTAL;

                paths[count++] = LiquidationPath({
                    collateralAsset: collateralAssets[c],
                    debtAsset:       debtAssets[d],
                    collateralUsd:   colUsd,
                    debtUsd:         debtUsd,
                    bonusBps:        bonusBps,
                    maxRepayUsd:     maxRepay,
                    seizeableUsd:    seizable > colUsd ? colUsd : seizable
                });
            }
        }

        // Insertion sort by score desc
        for (uint256 i = 1; i < count; i++) {
            LiquidationPath memory key = paths[i];
            uint256 keyScore = key.bonusBps * key.collateralUsd;
            int256 j = int256(i) - 1;
            while (j >= 0 && paths[uint256(j)].bonusBps * paths[uint256(j)].collateralUsd < keyScore) {
                paths[uint256(j + 1)] = paths[uint256(j)];
                j--;
            }
            paths[uint256(j + 1)] = key;
        }
    }

    // =========================================================================
    //  Internal — pool/oracle calls
    // =========================================================================

    function _getHealthFactor(address borrower) internal view returns (uint256) {
        (bool ok, bytes memory data) = pool.staticcall(
            abi.encodeWithSignature("getUserHealthFactor(address)", borrower)
        );
        if (!ok || data.length == 0) return type(uint256).max;
        return abi.decode(data, (uint256));
    }

    function _getCollateralUsd(address borrower, address asset) internal view returns (uint256) {
        (bool ok, bytes memory data) = pool.staticcall(
            abi.encodeWithSignature("getUserDeposit(address,address)", borrower, asset)
        );
        if (!ok || data.length == 0) return 0;
        uint256 amount = abi.decode(data, (uint256));
        return _toUsd(asset, amount);
    }

    function _getDebtUsd(address borrower, address asset) internal view returns (uint256) {
        (bool ok, bytes memory data) = pool.staticcall(
            abi.encodeWithSignature("getUserDebt(address,address)", borrower, asset)
        );
        if (!ok || data.length == 0) return 0;
        uint256 amount = abi.decode(data, (uint256));
        return _toUsd(asset, amount);
    }

    function _toUsd(address asset, uint256 amount) internal view returns (uint256) {
        (bool ok, bytes memory data) = oracle.staticcall(
            abi.encodeWithSignature("getValueInUsd(address,uint256)", asset, amount)
        );
        if (!ok || data.length == 0) return 0;
        return abi.decode(data, (uint256));
    }

    function _getLiquidationBonus(address asset) internal view returns (uint256) {
        (bool ok, bytes memory data) = collateralManager.staticcall(
            abi.encodeWithSignature("getAssetConfig(address)", asset)
        );
        if (!ok || data.length == 0) return 0;
        // AssetConfig: ltv, liqThreshold, liqBonus, reserveFactor, supplyCap, borrowCap, isActive, isBorrowEnabled
        (, , uint256 bonus, , , , ,) = abi.decode(data, (uint256,uint256,uint256,uint256,uint256,uint256,bool,bool));
        return bonus;
    }
}
