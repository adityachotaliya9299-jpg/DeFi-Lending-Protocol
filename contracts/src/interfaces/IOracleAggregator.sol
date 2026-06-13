// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IOracleAggregator
 * @author Aditya Chotaliya [https://adityachotaliya.xyz]
 * @notice Interface for the N-source weighted median oracle aggregator
 */
interface IOracleAggregator {
    event FeedsRegistered(address indexed asset, address[] feeds, uint256[] weights);
    event FeedRemoved(address indexed asset);

    error OracleAggregator__NoFeeds(address asset);
    error OracleAggregator__InsufficientValidFeeds(address asset, uint256 valid);
    error OracleAggregator__WeightsMustSumTo10000(uint256 got);
    error OracleAggregator__TooManyFeeds();
    error OracleAggregator__ZeroAddress();
    error OracleAggregator__InvalidWeight();

    function registerFeeds(
        address asset,
        address[] calldata feeds,
        uint256[] calldata weights,
        uint256[] calldata heartbeats
    ) external;

    function removeFeeds(address asset) external;

    function getPrice(address asset) external view returns (uint256);

    function getFeedPrices(address asset)
        external view
        returns (address[] memory feeds, uint256[] memory prices, bool[] memory valid);

    function hasFeeds(address asset) external view returns (bool);
}
