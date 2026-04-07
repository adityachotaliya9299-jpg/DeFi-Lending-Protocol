// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable}  from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20}   from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title  ProtocolTreasury
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Accumulates protocol revenue: reserve factor cuts from borrow interest
 *         and any penalty fees from liquidations.
 *
 *         Revenue flows:
 *           1. LendingPool calls transferFrom(borrower, treasury, reserveCut)
 *              on every repayment.
 *           2. Governance (owner) can withdraw accumulated tokens at any time.
 *
 *         In production this would be a timelock-controlled multisig, but for
 *         the portfolio the owner is sufficient to demonstrate the pattern.
 */
contract ProtocolTreasury is Ownable {
    using SafeERC20 for IERC20;

    // ─── Events ───────────────────────────────────────────────────────────────

    event FundsWithdrawn(address indexed token, address indexed to, uint256 amount);
    event EtherWithdrawn(address indexed to, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ProtocolTreasury__ZeroAmount();
    error ProtocolTreasury__ZeroAddress();
    error ProtocolTreasury__InsufficientBalance();
    error ProtocolTreasury__TransferFailed();

    constructor(address owner_) Ownable(owner_) {
        if (owner_ == address(0)) revert ProtocolTreasury__ZeroAddress();
    }

    // ─── Withdrawal ───────────────────────────────────────────────────────────

    /**
     * @notice Withdraw `amount` of ERC-20 `token` to `to`.
     *         Only owner (governance) can call.
     */
    function withdraw(address token, address to, uint256 amount)
        external onlyOwner
    {
        if (token  == address(0)) revert ProtocolTreasury__ZeroAddress();
        if (to     == address(0)) revert ProtocolTreasury__ZeroAddress();
        if (amount == 0)          revert ProtocolTreasury__ZeroAmount();

        uint256 bal = IERC20(token).balanceOf(address(this));
        if (amount > bal) revert ProtocolTreasury__InsufficientBalance();

        IERC20(token).safeTransfer(to, amount);
        emit FundsWithdrawn(token, to, amount);
    }

    /**
     * @notice Withdraw all of an ERC-20 token.
     */
    function withdrawAll(address token, address to) external onlyOwner {
        if (token == address(0)) revert ProtocolTreasury__ZeroAddress();
        if (to    == address(0)) revert ProtocolTreasury__ZeroAddress();

        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) revert ProtocolTreasury__ZeroAmount();

        IERC20(token).safeTransfer(to, bal);
        emit FundsWithdrawn(token, to, bal);
    }

    /**
     * @notice Withdraw native ETH (if any arrives via receive()).
     */
    function withdrawEther(address payable to, uint256 amount)
        external onlyOwner
    {
        if (to     == address(0)) revert ProtocolTreasury__ZeroAddress();
        if (amount == 0)          revert ProtocolTreasury__ZeroAmount();
        if (amount > address(this).balance)
            revert ProtocolTreasury__InsufficientBalance();

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert ProtocolTreasury__TransferFailed();
        emit EtherWithdrawn(to, amount);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    // Accept ETH
    receive() external payable {}
}
