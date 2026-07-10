// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPointsAccounting
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice Interface for the protocol incentive points accounting system
 */
interface IPointsAccounting {
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

    error PointsAccounting__ZeroAddress();
    error PointsAccounting__InvalidMode();
    error PointsAccounting__AssetNotActive(address asset);
    error PointsAccounting__ZeroAmount();

    function setAssetRate(
        address asset,
        uint256 supplyRate,
        uint256 borrowRate,
        bool active
    ) external;

    function updatePosition(
        address user,
        address asset,
        uint256 mode,
        uint256 newBalance
    ) external;

    function accruePoints(address user, address asset, uint256 mode) external;

    function redeemPoints(address user, uint256 amount) external;

    function getPendingPoints(
        address user,
        address asset,
        uint256 mode
    ) external view returns (uint256);

    function getUserPoints(address user) external view returns (uint256);

    function getPosition(
        address user,
        address asset,
        uint256 mode
    )
        external
        view
        returns (uint256 balance, uint256 lastUpdate, uint256 accruedPoints);
}
