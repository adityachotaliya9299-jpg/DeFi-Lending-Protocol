// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SecurityHardening
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Per-asset circuit breakers and front-running mitigations
 *
 * Key design:
 * - Per-asset pause: GUARDIAN can pause individual assets (not whole protocol)
 * - Borrow cooldown: enforces min time between borrows per user (anti-flashbot)
 * - Commit-reveal for liquidations: liquidator commits hash, reveals later
 *   (prevents front-running of profitable liquidations)
 * - Price deviation guard: rejects oracle updates that deviate > MAX_DEVIATION from TWAP
 * - Rate limit: max borrow per block per asset (prevents oracle manipulation attacks)
 */
contract SecurityHardening is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint256 public constant MAX_DEVIATION_BPS = 1_000; // 10% max price deviation
    uint256 public constant BORROW_COOLDOWN = 1 hours;
    uint256 public constant COMMIT_DELAY = 2; // blocks between commit and reveal
    uint256 public constant BPS_TOTAL = 10_000;

    error Security__AssetPaused(address asset);
    error Security__BorrowCooldown(address user, uint256 nextAllowed);
    error Security__CommitNotFound(bytes32 commitHash);
    error Security__CommitTooEarly(uint256 revealBlock, uint256 current);
    error Security__CommitExpired(uint256 expiry, uint256 current);
    error Security__PriceDeviationTooHigh(uint256 deviationBps);
    error Security__RateLimitExceeded(address asset, uint256 limit);
    error Security__ZeroAddress();

    event AssetPaused(address indexed asset, bool paused);
    event CommitSubmitted(
        bytes32 indexed commitHash,
        address indexed liquidator,
        uint256 revealBlock
    );
    event CommitRevealed(
        bytes32 indexed commitHash,
        address indexed liquidator,
        address borrower
    );
    event BorrowRateLimitSet(address indexed asset, uint256 limitPerBlock);
    event PriceDeviationChecked(
        address indexed asset,
        uint256 deviationBps,
        bool accepted
    );

    struct LiquidationCommit {
        address liquidator;
        uint256 commitBlock;
        uint256 expiryBlock; // commit expires after 100 blocks
        bool revealed;
    }

    // asset → paused
    mapping(address => bool) public assetPaused;

    // user → last borrow timestamp
    mapping(address => uint256) public lastBorrowTime;

    // commitHash → commit data
    mapping(bytes32 => LiquidationCommit) public commits;

    // asset → max borrow amount per block
    mapping(address => uint256) public borrowRateLimits;

    // asset → block → borrowed this block
    mapping(address => mapping(uint256 => uint256)) public borrowedThisBlock;

    // asset → last known TWAP price (WAD)
    mapping(address => uint256) public twapPrices;

    constructor(address admin) {
        if (admin == address(0)) revert Security__ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
    }

    // =========================================================================
    //  Per-asset circuit breaker
    // =========================================================================

    function pauseAsset(address asset) external onlyRole(GUARDIAN_ROLE) {
        assetPaused[asset] = true;
        emit AssetPaused(asset, true);
    }

    function unpauseAsset(address asset) external onlyRole(GUARDIAN_ROLE) {
        assetPaused[asset] = false;
        emit AssetPaused(asset, false);
    }

    function requireAssetNotPaused(address asset) external view {
        if (assetPaused[asset]) revert Security__AssetPaused(asset);
    }

    // =========================================================================
    //  Borrow cooldown
    // =========================================================================

    function checkAndUpdateBorrowCooldown(
        address user
    ) external onlyRole(ADMIN_ROLE) {
        uint256 next = lastBorrowTime[user] + BORROW_COOLDOWN;
        if (block.timestamp < next) revert Security__BorrowCooldown(user, next);
        lastBorrowTime[user] = block.timestamp;
    }

    function getBorrowCooldownStatus(
        address user
    ) external view returns (bool canBorrow, uint256 nextAllowed) {
        nextAllowed = lastBorrowTime[user] + BORROW_COOLDOWN;
        canBorrow = block.timestamp >= nextAllowed;
    }

    // =========================================================================
    //  Commit-reveal for liquidations
    // =========================================================================

    /**
     * @notice Liquidator commits intent to liquidate (prevents front-running)
     * @param commitHash keccak256(abi.encode(borrower, debtAsset, collAsset, amount, salt))
     */
    function commitLiquidation(bytes32 commitHash) external {
        commits[commitHash] = LiquidationCommit({
            liquidator: msg.sender,
            commitBlock: block.number,
            expiryBlock: block.number + 100, // 100 block window to reveal
            revealed: false
        });
        emit CommitSubmitted(
            commitHash,
            msg.sender,
            block.number + COMMIT_DELAY
        );
    }

    /**
     * @notice Reveal liquidation intent after delay
     * @param borrower     Target borrower
     * @param debtAsset    Debt asset
     * @param collAsset    Collateral asset
     * @param amount       Amount to liquidate
     * @param salt         Random salt used in commit
     */
    function revealLiquidation(
        address borrower,
        address debtAsset,
        address collAsset,
        uint256 amount,
        bytes32 salt
    ) external {
        bytes32 commitHash = keccak256(
            abi.encode(borrower, debtAsset, collAsset, amount, salt)
        );

        LiquidationCommit storage c = commits[commitHash];
        if (c.liquidator == address(0))
            revert Security__CommitNotFound(commitHash);
        if (block.number < c.commitBlock + COMMIT_DELAY)
            revert Security__CommitTooEarly(
                c.commitBlock + COMMIT_DELAY,
                block.number
            );
        if (block.number > c.expiryBlock)
            revert Security__CommitExpired(c.expiryBlock, block.number);

        c.revealed = true;
        emit CommitRevealed(commitHash, msg.sender, borrower);
    }

    function isCommitValid(bytes32 commitHash) external view returns (bool) {
        LiquidationCommit storage c = commits[commitHash];
        return
            c.liquidator != address(0) &&
            !c.revealed &&
            block.number >= c.commitBlock + COMMIT_DELAY &&
            block.number <= c.expiryBlock;
    }

    // =========================================================================
    //  Price deviation guard
    // =========================================================================

    function setTwapPrice(
        address asset,
        uint256 price
    ) external onlyRole(ADMIN_ROLE) {
        twapPrices[asset] = price;
    }

    function checkPriceDeviation(
        address asset,
        uint256 spotPrice
    ) external returns (bool accepted) {
        uint256 twap = twapPrices[asset];
        if (twap == 0) return true; // no TWAP set, skip check

        uint256 deviation;
        if (spotPrice > twap) {
            deviation = ((spotPrice - twap) * BPS_TOTAL) / twap;
        } else {
            deviation = ((twap - spotPrice) * BPS_TOTAL) / twap;
        }

        accepted = deviation <= MAX_DEVIATION_BPS;
        emit PriceDeviationChecked(asset, deviation, accepted);

        if (!accepted) revert Security__PriceDeviationTooHigh(deviation);
    }

    // =========================================================================
    //  Rate limit
    // =========================================================================

    function setBorrowRateLimit(
        address asset,
        uint256 limitPerBlock
    ) external onlyRole(ADMIN_ROLE) {
        borrowRateLimits[asset] = limitPerBlock;
        emit BorrowRateLimitSet(asset, limitPerBlock);
    }

    function checkAndUpdateRateLimit(
        address asset,
        uint256 amount
    ) external onlyRole(ADMIN_ROLE) {
        uint256 limit = borrowRateLimits[asset];
        if (limit == 0) return; // no limit

        uint256 alreadyBorrowed = borrowedThisBlock[asset][block.number];
        if (alreadyBorrowed + amount > limit)
            revert Security__RateLimitExceeded(asset, limit);

        borrowedThisBlock[asset][block.number] += amount;
    }
}
