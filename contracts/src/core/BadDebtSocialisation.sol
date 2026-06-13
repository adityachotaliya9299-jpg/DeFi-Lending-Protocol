// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {WadRayMath} from "../math/WadRayMath.sol";

/**
 * @title BadDebtSocialisation
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Handles bad debt when collateral < debt after liquidation
 *
 * Key design:
 * - When a position's collateral is fully seized but debt remains,
 *   the residual debt is "socialised" across all depositors
 * - Socialisation works by reducing the asset's liquidityIndex
 *   so all lToken holders share the loss pro-rata
 * - LendingPool calls reportBadDebt() after a full liquidation
 *   that still leaves residual debt
 * - Emits BadDebtSocialised event with full accounting details
 * - Tracks cumulative bad debt per asset for analytics
 */
contract BadDebtSocialisation is AccessControl {
    using WadRayMath for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant POOL_ROLE  = keccak256("POOL_ROLE");

    uint256 private constant RAY = 1e27;

    // ── Errors ────────────────────────────────────────────────────────────────
    error BadDebtSocialisation__ZeroAddress();
    error BadDebtSocialisation__ZeroDebt();
    error BadDebtSocialisation__ZeroDeposits();
    error BadDebtSocialisation__IndexWouldBeZero();

    // ── Events ────────────────────────────────────────────────────────────────
    event BadDebtSocialised(
        address indexed asset,
        address indexed borrower,
        uint256 badDebtAmount,
        uint256 indexReduction,
        uint256 newLiquidityIndex
    );

    event BadDebtRecorded(
        address indexed asset,
        uint256 cumulative
    );

    // ── Storage ───────────────────────────────────────────────────────────────

    // asset → cumulative bad debt (in token units)
    mapping(address => uint256) public cumulativeBadDebt;

    // asset → count of socialisation events
    mapping(address => uint256) public socialisationCount;

    constructor(address admin, address pool) {
        if (admin == address(0)) revert BadDebtSocialisation__ZeroAddress();
        if (pool  == address(0)) revert BadDebtSocialisation__ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(POOL_ROLE, pool);
    }

    // =========================================================================
    //  Core — called by LendingPool after failed full liquidation
    // =========================================================================

    /**
     * @notice Calculate the index reduction needed to socialise bad debt
     * @dev Does NOT modify LendingPool state — returns the reduction for
     *      LendingPool to apply to its own liquidityIndex.
     *
     * @param asset           Token with bad debt
     * @param borrower        Address with residual debt
     * @param badDebtAmount   Remaining debt after collateral fully seized (in token units)
     * @param totalDeposits   Current total deposits (liquidityIndex * scaledDeposits)
     * @param currentIndex    Current liquidityIndex (RAY-scaled)
     * @return indexReduction Amount to subtract from liquidityIndex (RAY-scaled)
     * @return newIndex       New liquidityIndex after reduction
     */
    function calculateIndexReduction(
        address asset,
        address borrower,
        uint256 badDebtAmount,
        uint256 totalDeposits,
        uint256 currentIndex
    ) external onlyRole(POOL_ROLE) returns (uint256 indexReduction, uint256 newIndex) {
        if (badDebtAmount  == 0) revert BadDebtSocialisation__ZeroDebt();
        if (totalDeposits  == 0) revert BadDebtSocialisation__ZeroDeposits();

        // indexReduction = badDebt * currentIndex / totalDeposits
        // This pro-rates the loss across all depositors via their scaled balances
        indexReduction = (badDebtAmount * currentIndex) / totalDeposits;

        if (indexReduction >= currentIndex) revert BadDebtSocialisation__IndexWouldBeZero();

        newIndex = currentIndex - indexReduction;

        // Record for analytics
        cumulativeBadDebt[asset]  += badDebtAmount;
        socialisationCount[asset] += 1;

        emit BadDebtSocialised(asset, borrower, badDebtAmount, indexReduction, newIndex);
        emit BadDebtRecorded(asset, cumulativeBadDebt[asset]);
    }

    // =========================================================================
    //  View
    // =========================================================================

    /**
     * @notice Preview index reduction without state changes
     */
    function previewIndexReduction(
        uint256 badDebtAmount,
        uint256 totalDeposits,
        uint256 currentIndex
    ) external pure returns (uint256 indexReduction, uint256 newIndex) {
        if (totalDeposits == 0) return (0, currentIndex);
        indexReduction = (badDebtAmount * currentIndex) / totalDeposits;
        newIndex = indexReduction >= currentIndex ? 0 : currentIndex - indexReduction;
    }

    /**
     * @notice Check if a given bad debt would wipe out all deposits
     */
    function wouldWipeDepositors(
        uint256 badDebtAmount,
        uint256 totalDeposits,
        uint256 currentIndex
    ) external pure returns (bool) {
        if (totalDeposits == 0) return true;
        uint256 reduction = (badDebtAmount * currentIndex) / totalDeposits;
        return reduction >= currentIndex;
    }

    /**
     * @notice Get analytics for an asset
     */
    function getAssetStats(address asset)
        external view
        returns (uint256 cumulative, uint256 count)
    {
        return (cumulativeBadDebt[asset], socialisationCount[asset]);
    }
}
