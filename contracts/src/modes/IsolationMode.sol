// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  IsolationMode
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Inspired by Aave v3 Isolation Mode.
 *
 * ─── What is Isolation Mode? ─────────────────────────────────────────────────
 *
 *   Certain risky assets (new listings, volatile tokens) can be enabled as
 *   collateral in "Isolation Mode". When a user deposits an isolated asset,
 *   they can ONLY borrow stablecoins (not ETH, BTC, etc.) and their total
 *   borrowable amount is capped at an "isolation debt ceiling".
 *
 *   This limits the protocol's exposure to risky collateral while still
 *   allowing the asset to generate borrowing fees.
 *
 * ─── Example ──────────────────────────────────────────────────────────────────
 *
 *   LINK is enabled in isolation mode with:
 *     - isolationDebtCeiling = $1,000,000
 *     - allowedBorrowableAssets = [USDC]
 *
 *   User deposits 1,000 LINK (~$15,000). They can only borrow USDC,
 *   and only up to the isolation debt ceiling across ALL users using LINK.
 *
 * ─── Why it matters ───────────────────────────────────────────────────────────
 *
 *   Without isolation mode, a new volatile asset listed as collateral
 *   could be used to drain the pool via oracle manipulation.
 *   Isolation mode caps the damage to the debt ceiling.
 */
library IsolationMode {

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct IsolationConfig {
        bool    isIsolated;             // true = this asset is in isolation mode
        uint256 debtCeiling;            // max USD value (WAD) that can be borrowed
        uint256 currentDebt;            // total USD debt outstanding (WAD)
        mapping(address => bool) allowedBorrowables; // only these can be borrowed
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error IsolationMode__DebtCeilingExceeded(
        address collateral,
        uint256 current,
        uint256 ceiling
    );
    error IsolationMode__BorrowNotAllowedInIsolation(
        address collateral,
        address borrowAsset
    );

    // ─── Validation ───────────────────────────────────────────────────────────

    /**
     * @notice Validate that a borrow is allowed given isolation mode constraints.
     *
     * @param cfg          The isolation config for the user's collateral.
     * @param collateral   The isolated collateral asset address.
     * @param borrowAsset  The asset the user wants to borrow.
     * @param borrowUsd    The USD value (WAD) of the borrow.
     */
    function validateBorrow(
        IsolationConfig storage cfg,
        address collateral,
        address borrowAsset,
        uint256 borrowUsd
    ) internal view {
        // 1. Must borrow an allowed stablecoin
        if (!cfg.allowedBorrowables[borrowAsset])
            revert IsolationMode__BorrowNotAllowedInIsolation(collateral, borrowAsset);

        // 2. Must not exceed debt ceiling
        if (cfg.currentDebt + borrowUsd > cfg.debtCeiling)
            revert IsolationMode__DebtCeilingExceeded(
                collateral,
                cfg.currentDebt,
                cfg.debtCeiling
            );
    }
}
