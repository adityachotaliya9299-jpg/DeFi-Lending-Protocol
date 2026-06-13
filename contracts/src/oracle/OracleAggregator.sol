// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {WadRayMath} from "../math/WadRayMath.sol";

/**
 * @title OracleAggregator
 * @author Aditya Chotaliya [https://adityachotaliya.xyz]
 * @notice Aggregates N Chainlink feeds per asset → weighted median price
 *
 * Key design:
 * - Each asset can have up to MAX_FEEDS Chainlink sources
 * - Each feed has a weight (basis points, must sum to 10_000)
 * - Stale feeds are skipped automatically
 * - Requires MIN_VALID_FEEDS valid responses before returning a price
 * - Returns weighted median: sort valid prices, pick weight-adjusted middle
 * - Drop-in replacement for PriceOracle — same getPrice() interface
 */
contract OracleAggregator is AccessControl {
    using WadRayMath for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant MAX_FEEDS       = 5;
    uint256 public constant MIN_VALID_FEEDS = 2;
    uint256 public constant BPS_TOTAL       = 10_000;
    uint256 public constant WAD             = 1e18;

    // ── Errors ────────────────────────────────────────────────────────────────
    error OracleAggregator__NoFeeds(address asset);
    error OracleAggregator__InsufficientValidFeeds(address asset, uint256 valid);
    error OracleAggregator__WeightsMustSumTo10000(uint256 got);
    error OracleAggregator__TooManyFeeds();
    error OracleAggregator__ZeroAddress();
    error OracleAggregator__InvalidWeight();

    // ── Events ────────────────────────────────────────────────────────────────
    event FeedsRegistered(address indexed asset, address[] feeds, uint256[] weights);
    event FeedRemoved(address indexed asset);

    // ── Types ─────────────────────────────────────────────────────────────────
    struct FeedConfig {
        address feed;
        uint256 weight;      // basis points (sum must = 10_000)
        uint256 heartbeat;   // max seconds since last update
    }

    // ── Storage ───────────────────────────────────────────────────────────────
    mapping(address => FeedConfig[]) private _feeds;
    mapping(address => bool)         private _hasFeeds;

    constructor(address admin) {
        require(admin != address(0), "OracleAggregator__ZeroAddress");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    /**
     * @notice Register N feeds for an asset with weights summing to 10_000
     * @param asset    Token address
     * @param feeds    Chainlink AggregatorV3Interface addresses
     * @param weights  Basis points per feed (must sum to 10_000)
     * @param heartbeats Max staleness per feed in seconds
     */
    function registerFeeds(
        address asset,
        address[] calldata feeds,
        uint256[] calldata weights,
        uint256[] calldata heartbeats
    ) external onlyRole(ADMIN_ROLE) {
        if (asset == address(0)) revert OracleAggregator__ZeroAddress();
        if (feeds.length == 0 || feeds.length > MAX_FEEDS) revert OracleAggregator__TooManyFeeds();
        require(feeds.length == weights.length && feeds.length == heartbeats.length, "length mismatch");

        uint256 totalWeight;
        for (uint256 i; i < weights.length; i++) {
            if (weights[i] == 0) revert OracleAggregator__InvalidWeight();
            if (feeds[i] == address(0)) revert OracleAggregator__ZeroAddress();
            totalWeight += weights[i];
        }
        if (totalWeight != BPS_TOTAL) revert OracleAggregator__WeightsMustSumTo10000(totalWeight);

        delete _feeds[asset];
        for (uint256 i; i < feeds.length; i++) {
            _feeds[asset].push(FeedConfig({
                feed:      feeds[i],
                weight:    weights[i],
                heartbeat: heartbeats[i]
            }));
        }
        _hasFeeds[asset] = true;

        emit FeedsRegistered(asset, feeds, weights);
    }

    /**
     * @notice Remove all feeds for an asset
     */
    function removeFeeds(address asset) external onlyRole(ADMIN_ROLE) {
        delete _feeds[asset];
        _hasFeeds[asset] = false;
        emit FeedRemoved(asset);
    }

    // =========================================================================
    //  Price Query
    // =========================================================================

    /**
     * @notice Get WAD-normalised price for asset via weighted median
     * @param asset Token address
     * @return price WAD (18 decimal) price in USD
     */
    function getPrice(address asset) external view returns (uint256 price) {
        if (!_hasFeeds[asset]) revert OracleAggregator__NoFeeds(asset);

        FeedConfig[] storage configs = _feeds[asset];

        uint256[] memory validPrices  = new uint256[](configs.length);
        uint256[] memory validWeights = new uint256[](configs.length);
        uint256 validCount;
        uint256 totalValidWeight;

        for (uint256 i; i < configs.length; i++) {
            (bool ok, uint256 p) = _tryGetPrice(configs[i]);
            if (!ok) continue;

            validPrices[validCount]  = p;
            validWeights[validCount] = configs[i].weight;
            totalValidWeight        += configs[i].weight;
            validCount++;
        }

        if (validCount < MIN_VALID_FEEDS) {
            revert OracleAggregator__InsufficientValidFeeds(asset, validCount);
        }

        // Sort prices ascending (insertion sort — max 5 elements)
        _insertionSort(validPrices, validWeights, validCount);

        // Weighted median: walk sorted prices until cumulative weight >= 50%
        uint256 halfWeight = totalValidWeight / 2;
        uint256 cumWeight;
        for (uint256 i; i < validCount; i++) {
            cumWeight += validWeights[i];
            if (cumWeight >= halfWeight) {
                return validPrices[i];
            }
        }

        // Fallback: return last valid price (shouldn't reach here)
        return validPrices[validCount - 1];
    }

    /**
     * @notice Get individual feed prices for an asset (view/debug)
     */
    function getFeedPrices(address asset)
        external view
        returns (address[] memory feeds, uint256[] memory prices, bool[] memory valid)
    {
        FeedConfig[] storage configs = _feeds[asset];
        feeds  = new address[](configs.length);
        prices = new uint256[](configs.length);
        valid  = new bool[](configs.length);

        for (uint256 i; i < configs.length; i++) {
            feeds[i] = configs[i].feed;
            (valid[i], prices[i]) = _tryGetPrice(configs[i]);
        }
    }

    /**
     * @notice Get feed configs for an asset
     */
    function getFeedConfigs(address asset) external view returns (FeedConfig[] memory) {
        return _feeds[asset];
    }

    /**
     * @notice Check if asset has registered feeds
     */
    function hasFeeds(address asset) external view returns (bool) {
        return _hasFeeds[asset];
    }

    // =========================================================================
    //  Internal
    // =========================================================================

    /**
     * @dev Try to get price from a single Chainlink feed.
     *      Returns (false, 0) if feed is stale, negative, or reverts.
     */
    function _tryGetPrice(FeedConfig storage config)
        internal view
        returns (bool ok, uint256 price)
    {
        try AggregatorV3Interface(config.feed).latestRoundData() returns (
            uint80,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            if (answer <= 0) return (false, 0);
            if (block.timestamp - updatedAt > config.heartbeat) return (false, 0);

            // Normalise to WAD (18 decimals)
            // Chainlink feeds return 8 decimals → multiply by 1e10
            price = uint256(answer) * 1e10;
            return (true, price);
        } catch {
            return (false, 0);
        }
    }

    /**
     * @dev Insertion sort on parallel arrays (prices, weights) — O(n^2) but n ≤ 5
     */
    function _insertionSort(
        uint256[] memory prices,
        uint256[] memory weights,
        uint256 length
    ) internal pure {
        for (uint256 i = 1; i < length; i++) {
            uint256 keyPrice  = prices[i];
            uint256 keyWeight = weights[i];
            int256  j         = int256(i) - 1;

            while (j >= 0 && prices[uint256(j)] > keyPrice) {
                prices[uint256(j + 1)]  = prices[uint256(j)];
                weights[uint256(j + 1)] = weights[uint256(j)];
                j--;
            }
            prices[uint256(j + 1)]  = keyPrice;
            weights[uint256(j + 1)] = keyWeight;
        }
    }
}
