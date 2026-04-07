// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  IPriceOracle
 * @notice Protocol-facing oracle interface consumed by CollateralManager and
 *         LiquidationEngine.  Returns prices normalised to WAD (1e18) in USD.
 */
interface IPriceOracle {
    // ─────────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emitted when a new Chainlink feed is registered for an asset.
    event FeedRegistered(address indexed asset, address indexed feed, uint256 heartbeat);

    /// @notice Emitted when an existing feed is removed.
    event FeedRemoved(address indexed asset);

    // ─────────────────────────────────────────────────────────────────────────
    //  Errors
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Thrown when a price feed for the asset has not been registered.
    error PriceOracle__FeedNotFound(address asset);

    /// @dev Thrown when the Chainlink feed returns a non-positive price.
    error PriceOracle__InvalidPrice(address asset, int256 price);

    /// @dev Thrown when the feed data is older than the heartbeat threshold.
    error PriceOracle__StalePrice(address asset, uint256 updatedAt, uint256 heartbeat);

    /// @dev Thrown when answeredInRound < roundId (incomplete round).
    error PriceOracle__IncompleteRound(address asset);

    /// @dev Thrown when the zero address is passed.
    error PriceOracle__ZeroAddress();

    // ─────────────────────────────────────────────────────────────────────────
    //  Core functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the USD price of `asset` in WAD (18 decimals).
     * @dev    Reverts if the price is stale, negative, or the feed is missing.
     */
    function getPrice(address asset) external view returns (uint256 priceWad);

    /**
     * @notice Returns the USD value of `amount` of `asset` in WAD.
     * @dev    Convenience: getPrice(asset) * amount / 10^assetDecimals
     */
    function getValueInUsd(address asset, uint256 amount) external view returns (uint256 valueWad);

    /**
     * @notice Returns true if `asset` has a registered, non-stale feed.
     */
    function hasFeed(address asset) external view returns (bool);
}
