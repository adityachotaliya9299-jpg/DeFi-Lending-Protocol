// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  IFlashLoanReceiver
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Implement this interface to receive flash loans from LendingPool.
 *
 * Your contract must:
 *   1. Receive the tokens in executeOperation()
 *   2. Do whatever arbitrage / liquidation / refinancing you need
 *   3. Approve (amount + fee) back to the pool before returning
 *
 * The pool calls executeOperation() atomically and reverts the entire
 * transaction if the repayment is not in place.
 */
interface IFlashLoanReceiver {
    /**
     * @param asset      The token being borrowed.
     * @param amount     The amount borrowed (without fee).
     * @param fee        The fee to repay on top of amount.
     * @param initiator  The address that initiated the flash loan.
     * @param params     Arbitrary bytes passed through from the caller.
     * @return           Must return true — any other value reverts.
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 fee,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}
