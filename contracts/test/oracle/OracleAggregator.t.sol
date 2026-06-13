// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {OracleAggregator} from "../../src/oracle/OracleAggregator.sol";
import {IOracleAggregator} from "../../src/interfaces/IOracleAggregator.sol";

/**
 * @title MockAggregatorV3
 * @author Aditya Chotaliya [https://adityachotaliya.xyz]
 * @dev Minimal Chainlink feed mock for aggregator testing
 */
contract MockAggV3 {
    int256  public answer;
    uint256 public updatedAt;
    bool    public shouldRevert;

    constructor(int256 _answer) {
        answer    = _answer;
        updatedAt = block.timestamp;
    }

    function setPrice(int256 _answer) external { answer = _answer; }
    function setUpdatedAt(uint256 _t) external { updatedAt = _t; }
    function makeStale(uint256 staleSince) external { updatedAt = block.timestamp - staleSince; }
    function makeRevert() external { shouldRevert = true; }

    function latestRoundData() external view returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        require(!shouldRevert, "feed reverted");
        return (1, answer, 0, updatedAt, 1);
    }
}

/**
 * @title OracleAggregatorTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 18 tests for N-source weighted median oracle aggregator
 */
contract OracleAggregatorTest is Test {

    OracleAggregator internal agg;
    address internal admin = makeAddr("admin");
    address internal asset = makeAddr("asset");

    MockAggV3 internal feedA;
    MockAggV3 internal feedB;
    MockAggV3 internal feedC;

    uint256 constant HEARTBEAT = 3_600; // 1 hour

    function setUp() public {
        vm.prank(admin);
        agg = new OracleAggregator(admin);

        feedA = new MockAggV3(2_000e8); // $2,000
        feedB = new MockAggV3(2_010e8); // $2,010
        feedC = new MockAggV3(1_990e8); // $1,990
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _register2(address a, address b) internal {
        address[] memory feeds     = new address[](2);
        uint256[] memory weights   = new uint256[](2);
        uint256[] memory heartbeat = new uint256[](2);
        feeds[0] = a; feeds[1] = b;
        weights[0] = 5_000; weights[1] = 5_000;
        heartbeat[0] = HEARTBEAT; heartbeat[1] = HEARTBEAT;
        vm.prank(admin);
        agg.registerFeeds(asset, feeds, weights, heartbeat);
    }

    function _register3(address a, address b, address c) internal {
        address[] memory feeds     = new address[](3);
        uint256[] memory weights   = new uint256[](3);
        uint256[] memory heartbeat = new uint256[](3);
        feeds[0] = a; feeds[1] = b; feeds[2] = c;
        weights[0] = 4_000; weights[1] = 3_000; weights[2] = 3_000;
        heartbeat[0] = HEARTBEAT; heartbeat[1] = HEARTBEAT; heartbeat[2] = HEARTBEAT;
        vm.prank(admin);
        agg.registerFeeds(asset, feeds, weights, heartbeat);
    }

    // =========================================================================
    //  Registration
    // =========================================================================

    function test_register_basic2Feeds() public {
        _register2(address(feedA), address(feedB));
        assertTrue(agg.hasFeeds(asset));
    }

    function test_register_emitsEvent() public {
        address[] memory feeds     = new address[](2);
        uint256[] memory weights   = new uint256[](2);
        uint256[] memory heartbeat = new uint256[](2);
        feeds[0] = address(feedA); feeds[1] = address(feedB);
        weights[0] = 6_000; weights[1] = 4_000;
        heartbeat[0] = HEARTBEAT; heartbeat[1] = HEARTBEAT;

        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit IOracleAggregator.FeedsRegistered(asset, feeds, weights);
        agg.registerFeeds(asset, feeds, weights, heartbeat);
    }

    function test_register_weightsMustSum10000() public {
        address[] memory feeds     = new address[](2);
        uint256[] memory weights   = new uint256[](2);
        uint256[] memory heartbeat = new uint256[](2);
        feeds[0] = address(feedA); feeds[1] = address(feedB);
        weights[0] = 4_000; weights[1] = 4_000; // sums to 8_000
        heartbeat[0] = HEARTBEAT; heartbeat[1] = HEARTBEAT;

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(
            OracleAggregator.OracleAggregator__WeightsMustSumTo10000.selector, 8_000
        ));
        agg.registerFeeds(asset, feeds, weights, heartbeat);
    }

    function test_register_zeroWeightReverts() public {
        address[] memory feeds     = new address[](2);
        uint256[] memory weights   = new uint256[](2);
        uint256[] memory heartbeat = new uint256[](2);
        feeds[0] = address(feedA); feeds[1] = address(feedB);
        weights[0] = 0; weights[1] = 10_000;
        heartbeat[0] = HEARTBEAT; heartbeat[1] = HEARTBEAT;

        vm.prank(admin);
        vm.expectRevert(OracleAggregator.OracleAggregator__InvalidWeight.selector);
        agg.registerFeeds(asset, feeds, weights, heartbeat);
    }

    function test_register_onlyAdmin() public {
        address[] memory feeds     = new address[](2);
        uint256[] memory weights   = new uint256[](2);
        uint256[] memory heartbeat = new uint256[](2);
        feeds[0] = address(feedA); feeds[1] = address(feedB);
        weights[0] = 5_000; weights[1] = 5_000;
        heartbeat[0] = HEARTBEAT; heartbeat[1] = HEARTBEAT;

        vm.expectRevert();
        agg.registerFeeds(asset, feeds, weights, heartbeat);
    }

    function test_removeFeeds() public {
        _register2(address(feedA), address(feedB));
        assertTrue(agg.hasFeeds(asset));

        vm.prank(admin);
        agg.removeFeeds(asset);
        assertFalse(agg.hasFeeds(asset));
    }

    // =========================================================================
    //  Price Calculation — Happy Path
    // =========================================================================

    function test_getPrice_twoFeeds_equalWeight_returnsMedian() public {
        _register2(address(feedA), address(feedB)); // $2000, $2010 equal weight

        uint256 price = agg.getPrice(asset);
        // Sorted: [2000, 2010], cumWeight at 2000 = 5000 >= half(5000) → returns 2000
        assertEq(price, 2_000e18);
    }

    function test_getPrice_threeFeeds_returnsWeightedMedian() public {
        _register3(address(feedC), address(feedA), address(feedB));
        // Prices: $1990(w=3000), $2000(w=4000), $2010(w=3000)
        // Sorted: [1990, 2000, 2010], weights: [3000, 4000, 3000]
        // half = 5000, cumulative: 3000 → 7000 ≥ 5000 at index 1 → returns $2000
        uint256 price = agg.getPrice(asset);
        assertEq(price, 2_000e18);
    }

    function test_getPrice_noFeeds_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            OracleAggregator.OracleAggregator__NoFeeds.selector, asset
        ));
        agg.getPrice(asset);
    }

    function test_getPrice_wadNormalised() public {
        _register2(address(feedA), address(feedB));
        uint256 price = agg.getPrice(asset);
        // Chainlink returns 8 decimals → we normalise to 18
        assertGe(price, 1_000e18);
        assertLe(price, 10_000e18);
    }

    // =========================================================================
    //  Stale / Failed Feeds
    // =========================================================================

    function test_getPrice_skipsStaleFeed_usesValid() public {
        feedA.makeStale(HEARTBEAT + 1); // stale
        _register2(address(feedA), address(feedB));

        // Only 1 valid feed — should revert (need MIN_VALID_FEEDS = 2)
        vm.expectRevert(abi.encodeWithSelector(
            OracleAggregator.OracleAggregator__InsufficientValidFeeds.selector, asset, 1
        ));
        agg.getPrice(asset);
    }

    function test_getPrice_skipsStaleFeed_3feeds_stillWorks() public {
        feedA.makeStale(HEARTBEAT + 1); // stale — skip
        _register3(address(feedA), address(feedB), address(feedC));
        // feedB=$2010 (w=3000), feedC=$1990 (w=3000) are valid
        // Only 2 valid feeds — meets MIN_VALID_FEEDS
        uint256 price = agg.getPrice(asset);
        assertGt(price, 0);
    }

    function test_getPrice_skipsRevertingFeed() public {
        feedA.makeRevert();
        _register3(address(feedA), address(feedB), address(feedC));
        // feedA reverts — should be skipped, feedB+feedC valid
        uint256 price = agg.getPrice(asset);
        assertGt(price, 0);
    }

    function test_getPrice_skipsNegativePrice() public {
        feedA.setPrice(-1); // negative
        _register3(address(feedA), address(feedB), address(feedC));
        uint256 price = agg.getPrice(asset);
        assertGt(price, 0);
    }

    function test_getPrice_allStale_reverts() public {
        feedA.makeStale(HEARTBEAT + 1);
        feedB.makeStale(HEARTBEAT + 1);
        _register2(address(feedA), address(feedB));

        vm.expectRevert(abi.encodeWithSelector(
            OracleAggregator.OracleAggregator__InsufficientValidFeeds.selector, asset, 0
        ));
        agg.getPrice(asset);
    }

    // =========================================================================
    //  getFeedPrices (debug view)
    // =========================================================================

    function test_getFeedPrices_returnsAllStatuses() public {
        feedA.makeStale(HEARTBEAT + 1);
        _register2(address(feedA), address(feedB));

        (address[] memory feeds, uint256[] memory prices, bool[] memory valid) =
            agg.getFeedPrices(asset);

        assertEq(feeds.length, 2);
        assertFalse(valid[0]); // feedA stale
        assertTrue(valid[1]);  // feedB ok
        assertEq(prices[1], 2_010e18);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_getPrice_withinReasonableRange(
        int256 priceA,
        int256 priceB
    ) public {
        priceA = bound(priceA, 1e8, 100_000e8);   // $1 – $100K
        priceB = bound(priceB, 1e8, 100_000e8);

        feedA.setPrice(priceA);
        feedB.setPrice(priceB);
        _register2(address(feedA), address(feedB));

        uint256 price = agg.getPrice(asset);
        assertGt(price, 0);
        assertLe(price, 100_000e18);
    }

    function testFuzz_getPrice_medianBetweenMinMax(
        int256 priceA,
        int256 priceB,
        int256 priceC
    ) public {
        priceA = bound(priceA, 1e8, 100_000e8);
        priceB = bound(priceB, 1e8, 100_000e8);
        priceC = bound(priceC, 1e8, 100_000e8);

        feedA.setPrice(priceA);
        feedB.setPrice(priceB);
        feedC.setPrice(priceC);

        _register3(address(feedA), address(feedB), address(feedC));
        uint256 price = agg.getPrice(asset);

        uint256 minPrice = uint256(_min(priceA, _min(priceB, priceC))) * 1e10;
        uint256 maxPrice = uint256(_max(priceA, _max(priceB, priceC))) * 1e10;

        assertGe(price, minPrice, "median below min");
        assertLe(price, maxPrice, "median above max");
    }

    function _min(int256 a, int256 b) internal pure returns (int256) { return a < b ? a : b; }
    function _max(int256 a, int256 b) internal pure returns (int256) { return a > b ? a : b; }
}
