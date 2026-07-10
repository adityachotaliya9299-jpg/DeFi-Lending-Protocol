// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IStableDebtToken
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Stable rate debt token interface — tracks fixed-rate borrows
 * @dev Non-transferable, balance = actual debt owed (principal + accrued interest)
 */
interface IStableDebtToken is IERC20 {
    event Mint(address indexed user, uint256 amount, uint256 stableRate);

    event Burn(address indexed user, uint256 amount);

    event StableRateUpdated(address indexed user, uint256 newRate);

    function mint(
        address user,
        uint256 amount,
        uint256 stableRate
    ) external returns (bool);

    function burn(address user, uint256 amount) external;

    function getStableBorrowRate(address user) external view returns (uint256);

    function getSupplyRate() external view returns (uint256);

    function principalBalanceOf(address user) external view returns (uint256);
}
