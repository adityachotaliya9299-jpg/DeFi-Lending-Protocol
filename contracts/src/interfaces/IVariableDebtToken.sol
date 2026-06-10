// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  IVariableDebtToken
 * @notice ERC-20 interface for variable-rate debt tokens.
 *
 * Variable debt tokens are non-transferable ERC-20 contracts where:
 *   - balanceOf(user) returns user's current debt INCLUDING accrued interest
 *   - totalSupply() returns total pool debt across all users
 *   - Only the LendingPool can mint and burn
 *   - Transfer is blocked — debt cannot be sent between users
 *   - Approval still works — enables approveDelegation for credit lines
 *
 * Phase 2 core concept:
 *   Instead of debt as mapping(_scaledBorrows[user][asset]),
 *   debt is now an ERC-20 token. This unlocks:
 *   - Standard ERC-20 tooling
 *   - Credit delegation at token level (vUSDC.approveDelegation)
 *   - Easier integration with external protocols
 *   - Aave v3 architecture alignment
 */
interface IVariableDebtToken {

    // ─── Events ───────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when debt is minted (user borrows).
     * @param  user      The user who borrowed.
     * @param  amount    Amount borrowed in token units (NOT scaled).
     * @param  index     The borrow index at mint time (for precision tracking).
     */
    event Mint(address indexed user, uint256 amount, uint256 index);

    /**
     * @notice Emitted when debt is burned (user repays).
     * @param  user      The user who repaid.
     * @param  amount    Amount repaid in token units.
     * @param  index     The borrow index at burn time.
     */
    event Burn(address indexed user, uint256 amount, uint256 index);

    /**
     * @notice Emitted when transfer is attempted (always fails).
     */
    event TransferBlocked(address indexed from, address indexed to, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error VariableDebtToken__NonTransferable();
    error VariableDebtToken__OnlyPool();
    error VariableDebtToken__InvalidAmount();
    error VariableDebtToken__ZeroAddress();

    // ─── Core ERC-20 functions (overridden) ────────────────────────────────────

    /**
     * @notice Returns the balance of a user INCLUDING accrued interest.
     *
     * balance = scaledBalance × currentBorrowIndex / 1e27
     *
     * This differs from standard ERC-20: balance changes every second
     * as interest accrues, WITHOUT any state writes.
     */
    function balanceOf(address user) external view returns (uint256);

    /**
     * @notice Returns total debt across all users INCLUDING accrued interest.
     *
     * totalSupply = totalScaledBorrows × currentBorrowIndex / 1e27
     */
    function totalSupply() external view returns (uint256);

    /**
     * @notice Transfer is BLOCKED. Debt cannot be sent between users.
     * @dev    Always reverts with NonTransferable error.
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @notice TransferFrom is BLOCKED. Debt cannot be sent between users.
     * @dev    Always reverts with NonTransferable error.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    /**
     * @notice Approval still works for credit delegation.
     * @dev    Standard ERC-20 approve for delegatee allowances.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    // ─── Pool-only mint/burn ──────────────────────────────────────────────────

    /**
     * @notice Mint debt tokens (called by LendingPool on borrow).
     * @param  user      User receiving the debt.
     * @param  amount    Amount in token units (e.g. 1000e6 for 1000 USDC debt).
     * @param  index     Current borrow index (for scaled balance calculation).
     * @dev    Only callable by the pool.
     */
    function mint(address user, uint256 amount, uint256 index) external;

    /**
     * @notice Burn debt tokens (called by LendingPool on repay).
     * @param  user      User whose debt is being repaid.
     * @param  amount    Amount in token units.
     * @param  index     Current borrow index.
     * @dev    Only callable by the pool.
     */
    function burn(address user, uint256 amount, uint256 index) external;

    // ─── View functions ───────────────────────────────────────────────────────

    /**
     * @notice Returns the scaled balance (internal representation).
     * @dev    Scaled balance is what's stored in state.
     *         Actual balance = scaledBalance × index / 1e27
     */
    function scaledBalanceOf(address user) external view returns (uint256);

    /**
     * @notice Returns total scaled borrows across all users.
     */
    function totalScaledSupply() external view returns (uint256);

    /**
     * @notice Returns the underlying asset this debt token represents.
     */
    function getUnderlyingAsset() external view returns (address);

    /**
     * @notice Returns the LendingPool address (only entity that can mint/burn).
     */
    function getPool() external view returns (address);
}
