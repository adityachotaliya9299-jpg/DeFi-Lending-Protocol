// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  ICreditDelegationV2
 * @notice Credit delegation built on variable debt tokens.
 *
 * Phase 2 concept:
 *   Instead of a separate CreditDelegation contract,
 *   credit delegation is now part of VariableDebtToken itself.
 *
 *   Alice approves Bob to borrow USDC up to $5,000:
 *   vUSDC.approveDelegation(bob, 5000e6)
 *
 *   Bob borrows using that credit:
 *   pool.borrowWithDelegation(alice, USDC, 5000e6)
 *
 * Advantages over Phase 1:
 *   - No separate contract, just the vToken
 *   - Standard ERC-20 approve pattern (more familiar)
 *   - Easier wallet integration
 *   - Lower gas overhead
 */
interface ICreditDelegationV2 {

    event CreditDelegationApproved(
        address indexed delegator,
        address indexed delegatee,
        address indexed asset,
        uint256 amount
    );

    event CreditDelegationUsed(
        address indexed delegator,
        address indexed delegatee,
        address indexed asset,
        uint256 amount
    );

    /**
     * @notice Approve a delegatee to borrow on your behalf.
     * @param  delegatee  Address that can borrow using your credit.
     * @param  amount     Maximum amount they can borrow (in token units).
     * @return success    True if approval succeeded.
     *
     * Example: vUSDC.approveDelegation(bob, 5000e6)
     *   → Bob can now borrow up to $5,000 USDC using Alice's collateral
     */
    function approveDelegation(address delegatee, uint256 amount)
        external returns (bool success);

    /**
     * @notice Revoke credit delegation.
     * @param  delegatee  The delegatee whose credit is revoked.
     */
    function revokeDelegation(address delegatee) external returns (bool success);

    /**
     * @notice Get the remaining credit available to a delegatee.
     * @param  delegator   The account that delegated credit.
     * @param  delegatee   The account using the credit.
     * @return remaining   Available to borrow in token units.
     */
    function creditAvailable(address delegator, address delegatee)
        external view returns (uint256 remaining);

    /**
     * @notice Get the amount of credit delegated by an account.
     * @param  delegator   The account that delegated.
     * @param  delegatee   The delegatee.
     * @return delegated   Amount approved for delegation.
     */
    function delegationAllowance(address delegator, address delegatee)
        external view returns (uint256 delegated);
}
