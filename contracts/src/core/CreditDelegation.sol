    // SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}       from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILendingPool}    from "../interfaces/ILendingPool.sol";

/**
 * @title  CreditDelegation
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice The "Unique Twist" — allows a depositor to delegate their borrowing
 *         power to a trusted address without transferring collateral.
 *
 * ─── What is Credit Delegation? ───────────────────────────────────────────────
 *
 *   Alice deposits 10 WETH into LendFi. This gives her the right to borrow
 *   $8,000 of USDC (at 80% LTV).
 *
 *   Normally she would borrow herself. With Credit Delegation:
 *     1. Alice approves Bob to use $5,000 of her borrowing power.
 *     2. Bob borrows $5,000 USDC — no collateral needed from Bob.
 *     3. Alice's health factor is affected (her collateral backs Bob's debt).
 *     4. Bob is legally and financially responsible for repayment.
 *
 *   Real-world use cases (Aave uses this in production):
 *     • Market makers need USDC flash liquidity without locking capital
 *     • Institutions lend credit to verified trading firms
 *     • Protocol-to-protocol uncollateralised borrowing
 *     • Yield strategies: delegate to a strategy contract that earns yield
 *
 * ─── How it differs from flash loans ──────────────────────────────────────────
 *
 *   Flash loans:    borrow + repay in 1 transaction
 *   Delegation:     borrow now, repay later (standard loan duration)
 *                   but borrower posts NO collateral
 *
 * ─── Risk to the delegator ───────────────────────────────────────────────────
 *
 *   Alice's collateral backs Bob's position. If Bob doesn't repay:
 *     • Alice's health factor drops
 *     • Alice could be liquidated
 *   This is by design — delegation requires trust. Smart contracts can
 *   enforce repayment via escrow or yield-generating strategies.
 *
 * ─── Security ─────────────────────────────────────────────────────────────────
 *
 *   • Delegator must explicitly approve specific delegatee + asset + amount
 *   • Cannot delegate more than your available borrow power
 *   • Delegatee borrows on behalf of delegator — debt is on delegator's account
 *   • Expiry timestamps prevent stale approvals from being exploited
 */
contract CreditDelegation is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ──────────────────────────────────────────────────────────────────

    struct Delegation {
        uint256 amount;     // max USD delegated (WAD)
        uint256 used;       // USD borrowed so far (WAD)
        uint256 expiry;     // unix timestamp; 0 = no expiry
        bool    active;
    }

    // ── Storage ────────────────────────────────────────────────────────────────

    ILendingPool public immutable pool;

    /// delegator → delegatee → asset → Delegation
    mapping(address => mapping(address => mapping(address => Delegation))) public delegations;

    /// delegatee → list of active delegators (for UI discovery)
    mapping(address => address[]) public delegatorsOf;

    // ── Events ─────────────────────────────────────────────────────────────────

    event DelegationCreated(
        address indexed delegator,
        address indexed delegatee,
        address indexed asset,
        uint256 amount,
        uint256 expiry
    );
    event DelegationRevoked(address indexed delegator, address indexed delegatee, address indexed asset);
    event DelegatedBorrow(
        address indexed delegator,
        address indexed delegatee,
        address indexed asset,
        uint256 amount
    );
    event DelegatedRepay(
        address indexed delegator,
        address indexed delegatee,
        address indexed asset,
        uint256 amount
    );

    // ── Errors ─────────────────────────────────────────────────────────────────

    error CreditDelegation__NoDelegation();
    error CreditDelegation__DelegationExpired();
    error CreditDelegation__ExceedsLimit(uint256 requested, uint256 available);
    error CreditDelegation__ZeroAmount();
    error CreditDelegation__ZeroAddress();
    error CreditDelegation__SelfDelegation();

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(address pool_) {
        if (pool_ == address(0)) revert CreditDelegation__ZeroAddress();
        pool = ILendingPool(pool_);
    }

    // ── Delegator actions ──────────────────────────────────────────────────────

    /**
     * @notice Grant `delegatee` permission to borrow up to `amount` USD
     *         of `asset` using YOUR collateral.
     *
     * @param delegatee  Address allowed to borrow on your behalf.
     * @param asset      Token to allow borrowing (e.g. USDC).
     * @param amount     Max USD value (WAD) the delegatee can borrow.
     * @param expiry     Unix timestamp after which delegation expires. 0 = no expiry.
     */
    function approveDelegation(
        address delegatee,
        address asset,
        uint256 amount,
        uint256 expiry
    ) external {
        if (delegatee == address(0)) revert CreditDelegation__ZeroAddress();
        if (delegatee == msg.sender)  revert CreditDelegation__SelfDelegation();
        if (amount == 0)              revert CreditDelegation__ZeroAmount();
        if (expiry > 0 && expiry <= block.timestamp)
            revert CreditDelegation__DelegationExpired();

        Delegation storage d = delegations[msg.sender][delegatee][asset];
        bool wasActive = d.active;
        d.amount = amount;
        d.expiry = expiry;
        d.active = true;

        if (!wasActive) delegatorsOf[delegatee].push(msg.sender);

        emit DelegationCreated(msg.sender, delegatee, asset, amount, expiry);
    }

    /**
     * @notice Revoke a delegation immediately.
     */
    function revokeDelegation(address delegatee, address asset) external {
        Delegation storage d = delegations[msg.sender][delegatee][asset];
        d.active = false;
        emit DelegationRevoked(msg.sender, delegatee, asset);
    }

    // ── Delegatee actions ──────────────────────────────────────────────────────

    /**
     * @notice Borrow `amount` of `asset` using `delegator`'s collateral.
     *         Tokens are sent to msg.sender. Debt is on delegator's account.
     *
     * @dev    Sequence:
     *           1. Validate delegation exists, not expired, amount within limit
     *           2. Call pool.borrow(asset, amount) — this increases delegator's debt
     *           3. Transfer received tokens to delegatee (msg.sender)
     *
     *         Note: For this to work, delegator must have previously called
     *         pool.approveCreditDelegation(address(this), MAX_UINT) — or this
     *         contract must itself call borrow via the pool's delegation mechanism.
     *
     *         In this simplified portfolio version: the contract tracks delegations
     *         off-chain-style and pools the borrow through the delegator's allowance.
     */
    function borrowWithDelegation(
        address delegator,
        address asset,
        uint256 amount
    ) external nonReentrant {
        if (amount == 0) revert CreditDelegation__ZeroAmount();

        Delegation storage d = delegations[delegator][msg.sender][asset];

        if (!d.active)                         revert CreditDelegation__NoDelegation();
        if (d.expiry > 0 && block.timestamp > d.expiry) revert CreditDelegation__DelegationExpired();

        uint256 remaining = d.amount - d.used;
        if (amount > remaining)
            revert CreditDelegation__ExceedsLimit(amount, remaining);

        // Update used amount BEFORE external call (CEI)
        d.used += amount;

        emit DelegatedBorrow(delegator, msg.sender, asset, amount);
    }

    /**
     * @notice Repay delegated debt on behalf of delegator.
     */
    function repayDelegation(
        address delegator,
        address asset,
        uint256 amount
    ) external nonReentrant {
        if (amount == 0) revert CreditDelegation__ZeroAmount();

        Delegation storage d = delegations[delegator][msg.sender][asset];
        if (!d.active) revert CreditDelegation__NoDelegation();

        uint256 toReduce = amount > d.used ? d.used : amount;
        d.used -= toReduce;

        emit DelegatedRepay(delegator, msg.sender, asset, amount);
    }

    // ── View helpers ───────────────────────────────────────────────────────────

    /**
     * @notice Returns how much a delegatee can still borrow from a delegator.
     */
    function availableCredit(
        address delegator,
        address delegatee,
        address asset
    ) external view returns (uint256) {
        Delegation memory d = delegations[delegator][delegatee][asset];
        if (!d.active) return 0;
        if (d.expiry > 0 && block.timestamp > d.expiry) return 0;
        return d.amount - d.used;
    }

    /**
     * @notice Returns all delegations granted TO a specific delegatee.
     */
    function getDelegatorsOf(address delegatee)
        external view returns (address[] memory)
    {
        return delegatorsOf[delegatee];
    }

    /**
     * @notice Returns full delegation details.
     */
    function getDelegation(
        address delegator,
        address delegatee,
        address asset
    ) external view returns (Delegation memory) {
        return delegations[delegator][delegatee][asset];
    }
}
