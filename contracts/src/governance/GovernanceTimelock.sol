// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  GovernanceTimelock
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 48-hour timelock between governance proposals and execution.
 *
 * ─── Why a timelock? ─────────────────────────────────────────────────────────
 *
 *   Without a timelock, a compromised admin key can drain the entire protocol
 *   in a single block:
 *     1. setLTV(WETH, 9900)        — allow 99% LTV
 *     2. deposit 1 WETH             — as attacker
 *     3. borrow 99% of all USDC    — empty the pool
 *
 *   With a 48-hour timelock, users see the malicious proposal on-chain and
 *   have 48 hours to withdraw their funds before it executes.
 *
 * ─── Architecture ────────────────────────────────────────────────────────────
 *
 *   PROPOSER_ROLE  → governance multisig / DAO
 *   EXECUTOR_ROLE  → keeper bot / anyone after delay
 *   CANCELLER_ROLE → guardian multisig (emergency cancel)
 *   ADMIN_ROLE     → initial deployer (should be renounced after setup)
 *
 *   Flow:
 *     1. Proposer calls schedule(target, value, data, delay)
 *        → emits CallScheduled, stores keccak256(target, value, data, salt)
 *     2. After delay passes, anyone with EXECUTOR_ROLE calls execute(...)
 *        → target.call{value}(data) executes atomically
 *     3. Canceller can cancel at any point before execution
 *
 * ─── Parameters ──────────────────────────────────────────────────────────────
 *
 *   MIN_DELAY    = 24 hours (absolute floor — cannot schedule faster)
 *   DEFAULT_DELAY = 48 hours (recommended for protocol params)
 *   MAX_DELAY    = 30 days  (prevents locking proposals forever)
 */
contract GovernanceTimelock is AccessControl {

    // ── Roles ─────────────────────────────────────────────────────────────────

    bytes32 public constant PROPOSER_ROLE  = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE  = keccak256("EXECUTOR_ROLE");
    bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");

    // ── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant MIN_DELAY  = 24 hours;
    uint256 public constant MAX_DELAY  = 30 days;

    // ── Storage ───────────────────────────────────────────────────────────────

    /// @notice operationId => earliest execution timestamp (0 = not queued)
    mapping(bytes32 => uint256) public timestamps;

    uint256 public minDelay;

    // ── Events ────────────────────────────────────────────────────────────────

    event CallScheduled(
        bytes32 indexed id,
        address indexed target,
        uint256          value,
        bytes            data,
        bytes32          predecessor,
        uint256          delay
    );
    event CallExecuted(
        bytes32 indexed id,
        address indexed target,
        uint256          value,
        bytes            data
    );
    event CallCancelled(bytes32 indexed id);
    event MinDelayChanged(uint256 oldDelay, uint256 newDelay);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Timelock__NotQueued(bytes32 id);
    error Timelock__TooEarly(bytes32 id, uint256 readyAt, uint256 now_);
    error Timelock__AlreadyQueued(bytes32 id);
    error Timelock__DelayTooShort(uint256 delay, uint256 min);
    error Timelock__DelayTooLong(uint256 delay, uint256 max);
    error Timelock__ExecutionFailed(address target, bytes data);
    error Timelock__PredecessorNotDone(bytes32 predecessor);
    error Timelock__ZeroAddress();

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * @param admin_     Initial admin (should renounce after granting roles).
     * @param proposers_ Addresses that can schedule operations.
     * @param executors_ Addresses that can execute ready operations.
     * @param cancellers_ Addresses that can cancel operations.
     * @param delay_     Initial minimum delay in seconds.
     */
    constructor(
        address   admin_,
        address[] memory proposers_,
        address[] memory executors_,
        address[] memory cancellers_,
        uint256   delay_
    ) {
        if (admin_ == address(0)) revert Timelock__ZeroAddress();
        if (delay_ < MIN_DELAY)  revert Timelock__DelayTooShort(delay_, MIN_DELAY);
        if (delay_ > MAX_DELAY)  revert Timelock__DelayTooLong(delay_, MAX_DELAY);

        minDelay = delay_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);

        for (uint256 i; i < proposers_.length; ++i)  _grantRole(PROPOSER_ROLE,  proposers_[i]);
        for (uint256 i; i < executors_.length; ++i)  _grantRole(EXECUTOR_ROLE,  executors_[i]);
        for (uint256 i; i < cancellers_.length; ++i) _grantRole(CANCELLER_ROLE, cancellers_[i]);
    }

    // ── Core operations ───────────────────────────────────────────────────────

    /**
     * @notice Schedule a call for execution after `delay` seconds.
     *
     * @param target      Contract to call.
     * @param value       ETH to send with the call.
     * @param data        Encoded calldata.
     * @param predecessor If non-zero, this operation must execute first.
     * @param salt        Nonce to allow duplicate (target, data) pairs.
     * @param delay       Seconds to wait. Must be >= minDelay.
     */
    function schedule(
        address target,
        uint256 value,
        bytes   calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) external onlyRole(PROPOSER_ROLE) {
        if (delay < minDelay) revert Timelock__DelayTooShort(delay, minDelay);
        if (delay > MAX_DELAY) revert Timelock__DelayTooLong(delay, MAX_DELAY);

        bytes32 id = hashOperation(target, value, data, predecessor, salt);
        if (timestamps[id] != 0) revert Timelock__AlreadyQueued(id);

        timestamps[id] = block.timestamp + delay;

        emit CallScheduled(id, target, value, data, predecessor, delay);
    }

    /**
     * @notice Execute a queued operation whose delay has elapsed.
     *
     * @dev Anyone with EXECUTOR_ROLE can call this. In practice, a keeper
     *      bot watches for ReadyAt events and executes automatically.
     */
    function execute(
        address target,
        uint256 value,
        bytes   calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) external payable onlyRole(EXECUTOR_ROLE) {
        bytes32 id = hashOperation(target, value, data, predecessor, salt);

        if (timestamps[id] == 0) revert Timelock__NotQueued(id);
        if (block.timestamp < timestamps[id])
            revert Timelock__TooEarly(id, timestamps[id], block.timestamp);

        // Check predecessor completed
        if (predecessor != bytes32(0) && timestamps[predecessor] != 1)
            revert Timelock__PredecessorNotDone(predecessor);

        // Mark done BEFORE external call (CEI)
        timestamps[id] = 1; // sentinel: 1 = done

        (bool ok, ) = target.call{value: value}(data);
        if (!ok) revert Timelock__ExecutionFailed(target, data);

        emit CallExecuted(id, target, value, data);
    }

    /**
     * @notice Cancel a queued operation before it executes.
     */
    function cancel(bytes32 id) external onlyRole(CANCELLER_ROLE) {
        if (timestamps[id] == 0 || timestamps[id] == 1)
            revert Timelock__NotQueued(id);
        delete timestamps[id];
        emit CallCancelled(id);
    }

    /**
     * @notice Update the minimum delay. Must go through the timelock itself.
     */
    function updateDelay(uint256 newDelay) external {
        require(msg.sender == address(this), "only via timelock");
        if (newDelay < MIN_DELAY) revert Timelock__DelayTooShort(newDelay, MIN_DELAY);
        if (newDelay > MAX_DELAY) revert Timelock__DelayTooLong(newDelay, MAX_DELAY);
        emit MinDelayChanged(minDelay, newDelay);
        minDelay = newDelay;
    }

    // ── View functions ────────────────────────────────────────────────────────

    /**
     * @notice Compute the operation id for a call.
     */
    function hashOperation(
        address target,
        uint256 value,
        bytes   calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(target, value, data, predecessor, salt));
    }

    /**
     * @notice True if the operation is queued and delay has not elapsed.
     */
    function isQueued(bytes32 id) public view returns (bool) {
        return timestamps[id] > 1;
    }

    /**
     * @notice True if the operation is queued AND its delay has elapsed.
     */
    function isReady(bytes32 id) public view returns (bool) {
        return timestamps[id] > 1 && block.timestamp >= timestamps[id];
    }

    /**
     * @notice True if the operation has already been executed.
     */
    function isDone(bytes32 id) public view returns (bool) {
        return timestamps[id] == 1;
    }

    /**
     * @notice Returns when an operation becomes executable (0 = not queued).
     */
    function getTimestamp(bytes32 id) public view returns (uint256) {
        return timestamps[id];
    }

    // ── ETH receiver ──────────────────────────────────────────────────────────

    receive() external payable {}
}
