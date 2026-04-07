// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {WadRayMath} from "../math/WadRayMath.sol";

/**
 * @title  PriceOracle
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Wraps Chainlink price feeds and exposes USD prices normalised to
 *         WAD (18 decimals) for every supported asset.
 *
 * @dev    Security measures implemented:
 *
 *         1. STALENESS CHECK
 *            Every price read verifies that `block.timestamp - updatedAt ≤ heartbeat`.
 *            Heartbeats are registered per-feed (Chainlink uses 3600 s for most
 *            USD feeds on mainnet, 86400 s on L2s).
 *
 *         2. NEGATIVE / ZERO PRICE GUARD
 *            Chainlink can return 0 or negative values during circuit-breaker
 *            events.  We revert on `answer ≤ 0`.
 *
 *         3. ROUND COMPLETENESS CHECK
 *            If `answeredInRound < roundId` the aggregator has not finished
 *            updating — the answer is from a prior round.  We revert.
 *
 *         4. DECIMAL NORMALISATION
 *            Chainlink USD feeds use 8 decimals.  We scale every price up to
 *            WAD (18 decimals) so the rest of the protocol works in a single
 *            precision.
 *
 *         5. ASSET DECIMAL NORMALISATION
 *            `getValueInUsd` adjusts for the token's own decimals so you can
 *            pass raw token amounts (e.g. USDC with 6 decimals) and always
 *            receive a WAD-denominated USD value.
 */
contract PriceOracle is IPriceOracle, Ownable {
    using WadRayMath for uint256;

    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Chainlink USD feeds return prices with 8 decimal places.
    uint256 private constant CHAINLINK_DECIMALS = 8;

    /// @dev Scale factor: WAD / 10^CHAINLINK_DECIMALS = 1e18 / 1e8 = 1e10.
    ///      Multiplying a Chainlink 8-decimal price by this gives a WAD price.
    uint256 private constant CHAINLINK_TO_WAD = 1e10;

    /// @dev Default heartbeat used when none is provided: 24 hours.
    uint256 public constant DEFAULT_HEARTBEAT = 86_400;

    /// @dev Maximum heartbeat we will accept when registering a feed (7 days).
    ///      Prevents accidental registration with an absurdly long window that
    ///      would defeat the staleness protection.
    uint256 public constant MAX_HEARTBEAT = 7 days;

    // ─────────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Per-asset feed configuration.
    struct FeedConfig {
        AggregatorV3Interface feed;   // Chainlink aggregator
        uint256               heartbeat; // max seconds between updates
    }

    /// @notice Maps asset address → Chainlink feed config.
    mapping(address asset => FeedConfig) private _feeds;

    // ─────────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param  initialOwner  Address that will own the contract and can register
     *                       / remove feeds.  In production this should be the
     *                       Governance contract.
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    // ─────────────────────────────────────────────────────────────────────────
    //  Admin — feed management (owner only)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Registers a Chainlink price feed for `asset`.
     *
     * @dev    Can be called multiple times to update the feed or heartbeat.
     *
     * @param  asset      The ERC-20 token address.
     * @param  feed       Chainlink AggregatorV3 address (must return USD price).
     * @param  heartbeat  Max acceptable age of a price in seconds.
     *                    Pass 0 to use DEFAULT_HEARTBEAT (24 h).
     */
    function registerFeed(address asset, address feed, uint256 heartbeat)
        external
        onlyOwner
    {
        if (asset == address(0) || feed == address(0)) revert PriceOracle__ZeroAddress();

        uint256 h = heartbeat == 0 ? DEFAULT_HEARTBEAT : heartbeat;
        if (h > MAX_HEARTBEAT) h = MAX_HEARTBEAT;

        _feeds[asset] = FeedConfig({
            feed:      AggregatorV3Interface(feed),
            heartbeat: h
        });

        emit FeedRegistered(asset, feed, h);
    }

    /**
     * @notice Removes the price feed for `asset`.
     * @dev    After removal `getPrice(asset)` will revert with FeedNotFound.
     *         Only call this after the asset has been delisted from the protocol.
     */
    function removeFeed(address asset) external onlyOwner {
        if (address(_feeds[asset].feed) == address(0)) revert PriceOracle__FeedNotFound(asset);
        delete _feeds[asset];
        emit FeedRemoved(asset);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  IPriceOracle implementation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @inheritdoc IPriceOracle
     *
     * @dev    Process:
     *           1. Load feed config — revert if not registered.
     *           2. Call latestRoundData() on the Chainlink aggregator.
     *           3. Validate: answer > 0, not stale, round complete.
     *           4. Scale 8-decimal Chainlink price to 18-decimal WAD.
     */
    function getPrice(address asset) external view override returns (uint256 priceWad) {
        return _getPrice(asset);
    }

    /**
     * @inheritdoc IPriceOracle
     *
     * @dev    USD value = (price * amount) / (10 ^ tokenDecimals)
     *
     *         Example — 2 WBTC at $60,000 each:
     *           price  = 60_000e18  (WAD)
     *           amount = 2e8        (WBTC has 8 decimals)
     *           result = 60_000e18 * 2e8 / 1e8 = 120_000e18  ($120,000 in WAD)
     */
    function getValueInUsd(address asset, uint256 amount)
        external
        view
        override
        returns (uint256 valueWad)
    {
        if (amount == 0) return 0;

        uint256 price = _getPrice(asset);

        // Fetch token decimals — default to 18 if the call reverts (native ETH wrapper).
        uint8 decimals = _getDecimals(asset);

        // value = price * amount / 10^decimals
        // Both price and result are WAD; amount is in the token's native decimals.
        valueWad = (price * amount) / (10 ** decimals);
    }

    /// @inheritdoc IPriceOracle
    function hasFeed(address asset) external view override returns (bool) {
        return address(_feeds[asset].feed) != address(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  View helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the raw feed config for an asset (for off-chain monitoring).
     */
    function getFeedConfig(address asset)
        external
        view
        returns (address feed, uint256 heartbeat)
    {
        FeedConfig storage cfg = _feeds[asset];
        return (address(cfg.feed), cfg.heartbeat);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Core price fetch — validates and normalises to WAD.
     */
    function _getPrice(address asset) internal view returns (uint256) {
        FeedConfig storage cfg = _feeds[asset];

        // ── 1. Feed must be registered ──────────────────────────────────────
        if (address(cfg.feed) == address(0)) revert PriceOracle__FeedNotFound(asset);

        // ── 2. Fetch latest round data ──────────────────────────────────────
        (
            uint80  roundId,
            int256  answer,
            ,
            uint256 updatedAt,
            uint80  answeredInRound
        ) = cfg.feed.latestRoundData();

        // ── 3a. Price must be positive ──────────────────────────────────────
        // Chainlink returns 0 or negative during circuit breaker / aggregator
        // fault events.  We must never price collateral at zero.
        if (answer <= 0) revert PriceOracle__InvalidPrice(asset, answer);

        // ── 3b. Staleness check ─────────────────────────────────────────────
        // block.timestamp - updatedAt > heartbeat means the feed has not been
        // updated within its expected window.
        if (block.timestamp - updatedAt > cfg.heartbeat) {
            revert PriceOracle__StalePrice(asset, updatedAt, cfg.heartbeat);
        }

        // ── 3c. Round completeness ──────────────────────────────────────────
        // answeredInRound < roundId means the latest round is not yet answered.
        if (answeredInRound < roundId) revert PriceOracle__IncompleteRound(asset);

        // ── 4. Normalise 8-decimal → 18-decimal (WAD) ──────────────────────
        return uint256(answer) * CHAINLINK_TO_WAD;
    }

    /**
     * @dev Safe decimals fetch — returns 18 if the ERC-20 call reverts.
     *      Handles WETH and other tokens that don't implement decimals().
     */
    function _getDecimals(address asset) internal view returns (uint8) {
        try IERC20Metadata(asset).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }
}
