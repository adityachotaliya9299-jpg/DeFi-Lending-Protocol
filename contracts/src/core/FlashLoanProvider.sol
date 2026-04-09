// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard}      from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}               from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}            from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IFlashLoanReceiver}   from "../interfaces/IFlashLoanReceiver.sol";
import {PercentageMath}       from "../math/PercentageMath.sol";

/**
 * @title  FlashLoanProvider
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Add-on contract that provides flash loan functionality.
 *         Inherit alongside LendingPool or deploy standalone and point at pool.
 *
 * ─── What is a flash loan? ────────────────────────────────────────────────
 *
 *   A flash loan lets you borrow any amount of any supported asset with
 *   ZERO collateral, as long as you repay it (plus a small fee) within
 *   the SAME TRANSACTION.
 *
 *   If you don't repay, the entire transaction is atomically reversed —
 *   no funds are ever at risk.
 *
 * ─── Fee model ────────────────────────────────────────────────────────────
 *
 *   9 bps (0.09%) of the borrowed amount, consistent with Aave v2/v3.
 *   Fee goes entirely to depositors (increases liquidityIndex).
 *
 *   Premium can be updated by governance (capped at 100 bps).
 *
 * ─── Use cases ────────────────────────────────────────────────────────────
 *
 *   • Arbitrage:     Borrow → swap on DEX A → sell on DEX B → repay
 *   • Liquidations:  Borrow debt asset → liquidate → sell collateral → repay
 *   • Refinancing:   Borrow to repay expensive loan, reopen at better rate
 *   • Collateral swap: Borrow new collateral → swap old → repay flash loan
 */
abstract contract FlashLoanProvider is ReentrancyGuard {
    using SafeERC20    for IERC20;
    using PercentageMath for uint256;

    // ── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant FLASH_LOAN_FEE_BPS = 9;    // 0.09%
    uint256 public constant MAX_FLASH_LOAN_FEE = 100;  // 1.0% cap

    // ── Storage ───────────────────────────────────────────────────────────────

    uint256 public flashLoanFeeBps = FLASH_LOAN_FEE_BPS;

    // ── Events ────────────────────────────────────────────────────────────────

    event FlashLoan(
        address indexed receiver,
        address indexed asset,
        uint256 amount,
        uint256 fee,
        address initiator
    );
    event FlashLoanFeeUpdated(uint256 newFeeBps);

    // ── Errors ────────────────────────────────────────────────────────────────

    error FlashLoan__InsufficientLiquidity(address asset, uint256 requested, uint256 available);
    error FlashLoan__RepaymentFailed(address asset, uint256 expected, uint256 actual);
    error FlashLoan__ReceiverReturnedFalse();
    error FlashLoan__ZeroAmount();
    error FlashLoan__ZeroReceiver();
    error FlashLoan__FeeTooHigh();

    // ── Flash loan ─────────────────────────────────────────────────────────────

    /**
     * @notice Execute a flash loan.
     *
     * @param receiverAddress  Contract that implements IFlashLoanReceiver.
     * @param asset            Token to borrow.
     * @param amount           Amount to borrow.
     * @param params           Arbitrary calldata forwarded to executeOperation.
     *
     * @dev Flow:
     *   1. Check pool has enough liquidity
     *   2. Record balance before
     *   3. Transfer tokens to receiver
     *   4. Call receiver.executeOperation(asset, amount, fee, msg.sender, params)
     *   5. Check pool balance increased by at least (amount + fee)
     *   6. Distribute fee to depositors (liquidityIndex bump)
     */
    function flashLoan(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params
    ) external nonReentrant {
        if (amount == 0)           revert FlashLoan__ZeroAmount();
        if (receiverAddress == address(0)) revert FlashLoan__ZeroReceiver();

        uint256 available = _getFlashLoanAvailable(asset);
        if (amount > available)
            revert FlashLoan__InsufficientLiquidity(asset, amount, available);

        uint256 fee          = amount.percentMul(flashLoanFeeBps);
        uint256 repayAmount  = amount + fee;
        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));

        // ── Transfer to receiver ───────────────────────────────────────────
        IERC20(asset).safeTransfer(receiverAddress, amount);

        // ── Call receiver ──────────────────────────────────────────────────
        bool success = IFlashLoanReceiver(receiverAddress).executeOperation(
            asset, amount, fee, msg.sender, params
        );
        if (!success) revert FlashLoan__ReceiverReturnedFalse();

        // ── Verify repayment ───────────────────────────────────────────────
        uint256 balanceAfter = IERC20(asset).balanceOf(address(this));
        if (balanceAfter < balanceBefore + fee)
            revert FlashLoan__RepaymentFailed(asset, balanceBefore + fee, balanceAfter);

        // ── Distribute fee to depositors ───────────────────────────────────
        _onFlashLoanFeeCollected(asset, fee);

        emit FlashLoan(receiverAddress, asset, amount, fee, msg.sender);
    }

    /**
     * @notice Update flash loan fee (governance only — implemented by subclass).
     */
    function setFlashLoanFee(uint256 newFeeBps) external {
        if (newFeeBps > MAX_FLASH_LOAN_FEE) revert FlashLoan__FeeTooHigh();
        _requireFlashLoanAdmin();
        flashLoanFeeBps = newFeeBps;
        emit FlashLoanFeeUpdated(newFeeBps);
    }

    /**
     * @notice Returns max flash-loanable amount for an asset.
     */
    function maxFlashLoan(address asset) external view returns (uint256) {
        return _getFlashLoanAvailable(asset);
    }

    /**
     * @notice Calculate the fee for a given flash loan amount.
     */
    function flashFee(address /*asset*/, uint256 amount) external view returns (uint256) {
        return amount.percentMul(flashLoanFeeBps);
    }

    // ── Hooks to implement in LendingPool ─────────────────────────────────────

    /// @dev Returns available liquidity in pool for `asset`.
    function _getFlashLoanAvailable(address asset) internal view virtual returns (uint256);

    /// @dev Called after fee is confirmed. Subclass distributes it to depositors.
    function _onFlashLoanFeeCollected(address asset, uint256 fee) internal virtual;

    /// @dev Subclass checks the caller has admin/governance rights.
    function _requireFlashLoanAdmin() internal view virtual;
}
