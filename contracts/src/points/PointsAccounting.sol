// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PointsAccounting
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Tracks protocol incentive points per user per asset per mode
 *
 * Key design:
 * - Points minted on deposit (supply mode) and borrow (borrow mode)
 * - Configurable rate per asset per mode (points per token per second)
 * - Points accumulate linearly: points += amount * rate * dt
 * - Non-transferable — only redeemable by governance
 * - Admin can set rates, pause accrual per asset
 * - Anyone can trigger accrual for any user (permissionless update)
 */
contract PointsAccounting is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");

    uint256 public constant SUPPLY_MODE = 1;
    uint256 public constant BORROW_MODE = 2;

    // ── Errors ────────────────────────────────────────────────────────────────
    error PointsAccounting__ZeroAddress();
    error PointsAccounting__InvalidMode();
    error PointsAccounting__AssetNotActive(address asset);
    error PointsAccounting__ZeroAmount();

    // ── Events ────────────────────────────────────────────────────────────────
    event PointsMinted(
        address indexed user,
        address indexed asset,
        uint256 amount,
        uint256 mode
    );
    event RateSet(address indexed asset, uint256 mode, uint256 rate);
    event PositionUpdated(
        address indexed user,
        address indexed asset,
        uint256 mode,
        uint256 newBalance,
        uint256 timestamp
    );
    event PointsRedeemed(address indexed user, uint256 amount);

    // ── Types ─────────────────────────────────────────────────────────────────

    struct AssetRate {
        uint256 supplyRate; // points per token per second (WAD-scaled)
        uint256 borrowRate; // points per token per second (WAD-scaled)
        bool active;
    }

    struct UserPosition {
        uint256 balance; // current token balance (deposit or borrow)
        uint256 lastUpdate; // timestamp of last accrual
        uint256 points; // accumulated points
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    // asset → AssetRate
    mapping(address => AssetRate) public assetRates;

    // user → asset → mode → UserPosition
    mapping(address => mapping(address => mapping(uint256 => UserPosition)))
        private _positions;

    // user → total points across all assets/modes
    mapping(address => uint256) public totalPoints;

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address admin, address pool) {
        if (admin == address(0)) revert PointsAccounting__ZeroAddress();
        if (pool == address(0)) revert PointsAccounting__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(POOL_ROLE, pool);
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    /**
     * @notice Set points accrual rates for an asset
     * @param asset      Token address
     * @param supplyRate Points per token per second for depositors (WAD)
     * @param borrowRate Points per token per second for borrowers (WAD)
     * @param active     Whether accrual is enabled for this asset
     */
    function setAssetRate(
        address asset,
        uint256 supplyRate,
        uint256 borrowRate,
        bool active
    ) external onlyRole(ADMIN_ROLE) {
        if (asset == address(0)) revert PointsAccounting__ZeroAddress();
        assetRates[asset] = AssetRate({
            supplyRate: supplyRate,
            borrowRate: borrowRate,
            active: active
        });
        emit RateSet(asset, SUPPLY_MODE, supplyRate);
        emit RateSet(asset, BORROW_MODE, borrowRate);
    }

    // =========================================================================
    //  Pool hooks — called by LendingPool on deposit/borrow/withdraw/repay
    // =========================================================================

    /**
     * @notice Update a user's position balance and accrue points
     * @param user       User address
     * @param asset      Token address
     * @param mode       SUPPLY_MODE or BORROW_MODE
     * @param newBalance New token balance after the operation
     */
    function updatePosition(
        address user,
        address asset,
        uint256 mode,
        uint256 newBalance
    ) external onlyRole(POOL_ROLE) {
        if (user == address(0)) revert PointsAccounting__ZeroAddress();
        if (asset == address(0)) revert PointsAccounting__ZeroAddress();
        if (mode != SUPPLY_MODE && mode != BORROW_MODE)
            revert PointsAccounting__InvalidMode();

        AssetRate memory rate = assetRates[asset];
        if (!rate.active) return; // silently skip if asset not active

        UserPosition storage pos = _positions[user][asset][mode];

        // Accrue points on old balance before updating
        uint256 accrued = _accrue(
            pos,
            mode == SUPPLY_MODE ? rate.supplyRate : rate.borrowRate
        );

        if (accrued > 0) {
            totalPoints[user] += accrued;
            emit PointsMinted(user, asset, accrued, mode);
        }

        // Update position
        pos.balance = newBalance;
        pos.lastUpdate = block.timestamp;

        emit PositionUpdated(user, asset, mode, newBalance, block.timestamp);
    }

    /**
     * @notice Force accrue points for a user without changing balance
     * @dev Permissionless — anyone can trigger accrual for any user
     */
    function accruePoints(address user, address asset, uint256 mode) external {
        if (user == address(0)) revert PointsAccounting__ZeroAddress();
        if (asset == address(0)) revert PointsAccounting__ZeroAddress();
        if (mode != SUPPLY_MODE && mode != BORROW_MODE)
            revert PointsAccounting__InvalidMode();

        AssetRate memory rate = assetRates[asset];
        if (!rate.active) return;

        UserPosition storage pos = _positions[user][asset][mode];
        uint256 accrued = _accrue(
            pos,
            mode == SUPPLY_MODE ? rate.supplyRate : rate.borrowRate
        );

        if (accrued > 0) {
            totalPoints[user] += accrued;
            emit PointsMinted(user, asset, accrued, mode);
        }

        pos.lastUpdate = block.timestamp;
    }

    /**
     * @notice Redeem (burn) points — called by governance/rewards contract
     * @dev Only ADMIN can redeem on behalf of users
     */
    function redeemPoints(
        address user,
        uint256 amount
    ) external onlyRole(ADMIN_ROLE) {
        if (amount == 0) revert PointsAccounting__ZeroAmount();
        require(
            totalPoints[user] >= amount,
            "PointsAccounting__InsufficientPoints"
        );
        totalPoints[user] -= amount;
        emit PointsRedeemed(user, amount);
    }

    // =========================================================================
    //  View
    // =========================================================================

    /**
     * @notice Get user's pending (unaccrued) points for a position
     */
    function getPendingPoints(
        address user,
        address asset,
        uint256 mode
    ) external view returns (uint256) {
        AssetRate memory rate = assetRates[asset];
        if (!rate.active) return 0;

        UserPosition storage pos = _positions[user][asset][mode];
        uint256 r = mode == SUPPLY_MODE ? rate.supplyRate : rate.borrowRate;
        return _pendingPoints(pos, r);
    }

    /**
     * @notice Get user's total points (accrued + pending across all positions)
     * @dev For a precise total, call accruePoints first on all positions
     */
    function getUserPoints(address user) external view returns (uint256) {
        return totalPoints[user];
    }

    /**
     * @notice Get user's position details
     */
    function getPosition(
        address user,
        address asset,
        uint256 mode
    )
        external
        view
        returns (uint256 balance, uint256 lastUpdate, uint256 accruedPoints)
    {
        UserPosition storage pos = _positions[user][asset][mode];
        return (pos.balance, pos.lastUpdate, pos.points);
    }

    // =========================================================================
    //  Internal
    // =========================================================================

    /**
     * @dev Accrue points on a position: points = balance * rate * dt
     *      Updates pos.points and returns newly accrued amount.
     */
    function _accrue(
        UserPosition storage pos,
        uint256 rate
    ) internal returns (uint256 accrued) {
        if (pos.balance == 0 || pos.lastUpdate == 0) return 0;
        uint256 dt = block.timestamp - pos.lastUpdate;
        if (dt == 0) return 0;

        // points = balance * rate * dt / 1e18
        accrued = (pos.balance * rate * dt) / 1e18;
        pos.points += accrued;
    }

    /**
     * @dev View-only version of _accrue (no state changes)
     */
    function _pendingPoints(
        UserPosition storage pos,
        uint256 rate
    ) internal view returns (uint256) {
        if (pos.balance == 0 || pos.lastUpdate == 0) return 0;
        uint256 dt = block.timestamp - pos.lastUpdate;
        return (pos.balance * rate * dt) / 1e18;
    }
}
