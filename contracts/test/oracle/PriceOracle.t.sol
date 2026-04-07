// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {PriceOracle}        from "../../src/oracle/PriceOracle.sol";
import {IPriceOracle}       from "../../src/interfaces/IPriceOracle.sol";
import {MockChainlinkFeed}  from "../../src/mocks/MockChainlinkFeed.sol";
import {MockERC20}          from "../../src/mocks/MockERC20.sol";

/**
 * @title  PriceOracleTest
 * @notice Full test suite for PriceOracle — happy paths, staleness, negative
 *         prices, multi-asset, access control, and decimal normalisation.
 */
contract PriceOracleTest is Test {

    // ─────────────────────────────────────────────────────────────────────────
    //  Actors and contracts
    // ─────────────────────────────────────────────────────────────────────────

    address internal owner   = makeAddr("owner");
    address internal alice   = makeAddr("alice");

    PriceOracle        internal oracle;
    MockChainlinkFeed  internal ethFeed;
    MockChainlinkFeed  internal btcFeed;
    MockChainlinkFeed  internal linkFeed;
    MockERC20          internal weth;
    MockERC20          internal wbtc;
    MockERC20          internal usdc;
    MockERC20          internal link;

    // ─────────────────────────────────────────────────────────────────────────
    //  Setup
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.startPrank(owner);

        oracle  = new PriceOracle(owner);

        // Deploy mock feeds — prices in 8-decimal Chainlink format
        ethFeed  = new MockChainlinkFeed();   // default $2,000
        btcFeed  = new MockChainlinkFeed();
        linkFeed = new MockChainlinkFeed();

        // Deploy mock tokens
        weth = new MockERC20("Wrapped Ether",   "WETH", 18);
        wbtc = new MockERC20("Wrapped Bitcoin", "WBTC", 8);
        usdc = new MockERC20("USD Coin",        "USDC", 6);
        link = new MockERC20("Chainlink",       "LINK", 18);

        // Set prices
        ethFeed.setPrice(2_000e8);    // $2,000
        btcFeed.setPrice(60_000e8);   // $60,000
        linkFeed.setPrice(15e8);      // $15

        // Register feeds with a 1-hour heartbeat
        oracle.registerFeed(address(weth), address(ethFeed),  3_600);
        oracle.registerFeed(address(wbtc), address(btcFeed),  3_600);
        oracle.registerFeed(address(link), address(linkFeed), 3_600);

        vm.stopPrank();
    }

    // =========================================================================
    //  getPrice — happy path
    // =========================================================================

    function test_getPrice_eth() public view {
        // $2,000 * 1e10 (CHAINLINK_TO_WAD) = 2_000e18
        uint256 price = oracle.getPrice(address(weth));
        assertEq(price, 2_000e18);
    }

    function test_getPrice_btc() public view {
        uint256 price = oracle.getPrice(address(wbtc));
        assertEq(price, 60_000e18);
    }

    function test_getPrice_link() public view {
        uint256 price = oracle.getPrice(address(link));
        assertEq(price, 15e18);
    }

    function test_getPrice_isWadNormalised() public view {
        // Any registered asset should return a WAD-precision price
        uint256 price = oracle.getPrice(address(weth));
        // Price must be expressible as whole USD cents or more
        assertGe(price, 1e16); // at least $0.01
        assertLe(price, 1_000_000e18); // at most $1M
    }

    // =========================================================================
    //  getPrice — failure paths
    // =========================================================================

    function test_getPrice_revertsOnMissingFeed() public {
        vm.expectRevert(
            abi.encodeWithSelector(IPriceOracle.PriceOracle__FeedNotFound.selector, address(usdc))
        );
        oracle.getPrice(address(usdc));
    }

    function test_getPrice_revertsOnNegativePrice() public {
        ethFeed.makeNegative(); // sets answer = -1
        vm.expectRevert(
            abi.encodeWithSelector(
                IPriceOracle.PriceOracle__InvalidPrice.selector,
                address(weth),
                int256(-1)
            )
        );
        oracle.getPrice(address(weth));
    }

    function test_getPrice_revertsOnZeroPrice() public {
        ethFeed.setPrice(0);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPriceOracle.PriceOracle__InvalidPrice.selector,
                address(weth),
                int256(0)
            )
        );
        oracle.getPrice(address(weth));
    }

    function test_getPrice_revertsOnStalePrice() public {
        vm.warp(block.timestamp + 10_000);
        ethFeed.makeStale(3_600 + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                IPriceOracle.PriceOracle__StalePrice.selector,
                address(weth),
                ethFeed.mockUpdatedAt(),
                uint256(3_600)
            )
        );
        oracle.getPrice(address(weth));
    }

    function test_getPrice_exactlyAtHeartbeatBoundary_passes() public {
        // updatedAt = block.timestamp - heartbeat → exactly at the boundary → should pass
        vm.warp(block.timestamp + 3_600);
        ethFeed.setUpdatedAt(block.timestamp - 3_600);

        // Should NOT revert (≤ heartbeat)
        uint256 price = oracle.getPrice(address(weth));
        assertEq(price, 2_000e18);
    }

    function test_getPrice_revertsOnIncompleteRound() public {
        ethFeed.makeIncompleteRound(); // answeredInRound = roundId - 1
        vm.expectRevert(
            abi.encodeWithSelector(IPriceOracle.PriceOracle__IncompleteRound.selector, address(weth))
        );
        oracle.getPrice(address(weth));
    }

    // =========================================================================
    //  getValueInUsd — decimal normalisation
    // =========================================================================

    function test_getValueInUsd_weth18decimals() public view {
        // 1 WETH at $2,000 = $2,000
        uint256 value = oracle.getValueInUsd(address(weth), 1e18);
        assertEq(value, 2_000e18);
    }

    function test_getValueInUsd_wbtc8decimals() public view {
        // 2 WBTC at $60,000 = $120,000
        // amount = 2e8 (WBTC has 8 decimals)
        uint256 value = oracle.getValueInUsd(address(wbtc), 2e8);
        assertEq(value, 120_000e18);
    }

    function test_getValueInUsd_zeroAmount() public view {
        uint256 value = oracle.getValueInUsd(address(weth), 0);
        assertEq(value, 0);
    }

    function test_getValueInUsd_fractional() public view {
        // 0.5 ETH at $2,000 = $1,000
        uint256 value = oracle.getValueInUsd(address(weth), 0.5e18);
        assertEq(value, 1_000e18);
    }

    function test_getValueInUsd_smallAmount() public view {
        // 100 LINK at $15 = $1,500
        uint256 value = oracle.getValueInUsd(address(link), 100e18);
        assertEq(value, 1_500e18);
    }

    // =========================================================================
    //  hasFeed
    // =========================================================================

    function test_hasFeed_registeredAsset() public view {
        assertTrue(oracle.hasFeed(address(weth)));
        assertTrue(oracle.hasFeed(address(wbtc)));
    }

    function test_hasFeed_unregisteredAsset() public view {
        assertFalse(oracle.hasFeed(address(usdc)));
        assertFalse(oracle.hasFeed(address(0)));
    }

    // =========================================================================
    //  Feed management — access control
    // =========================================================================

    function test_registerFeed_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.registerFeed(address(usdc), address(ethFeed), 3_600);
    }

    function test_registerFeed_zeroAssetReverts() public {
        vm.prank(owner);
        vm.expectRevert(IPriceOracle.PriceOracle__ZeroAddress.selector);
        oracle.registerFeed(address(0), address(ethFeed), 3_600);
    }

    function test_registerFeed_zeroFeedReverts() public {
        vm.prank(owner);
        vm.expectRevert(IPriceOracle.PriceOracle__ZeroAddress.selector);
        oracle.registerFeed(address(usdc), address(0), 3_600);
    }

    function test_registerFeed_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit IPriceOracle.FeedRegistered(address(usdc), address(ethFeed), 3_600);
        oracle.registerFeed(address(usdc), address(ethFeed), 3_600);
    }

    function test_registerFeed_defaultHeartbeat() public {
        vm.prank(owner);
        oracle.registerFeed(address(usdc), address(ethFeed), 0); // 0 → default

        (, uint256 heartbeat) = oracle.getFeedConfig(address(usdc));
        assertEq(heartbeat, oracle.DEFAULT_HEARTBEAT());
    }

    function test_registerFeed_clampsExcessiveHeartbeat() public {
        vm.prank(owner);
        oracle.registerFeed(address(usdc), address(ethFeed), 365 days); // > MAX

        (, uint256 heartbeat) = oracle.getFeedConfig(address(usdc));
        assertEq(heartbeat, oracle.MAX_HEARTBEAT());
    }

    function test_removeFeed_works() public {
        vm.prank(owner);
        oracle.removeFeed(address(weth));
        assertFalse(oracle.hasFeed(address(weth)));
    }

    function test_removeFeed_revertsWhenNotRegistered() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(IPriceOracle.PriceOracle__FeedNotFound.selector, address(usdc))
        );
        oracle.removeFeed(address(usdc));
    }

    function test_removeFeed_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.removeFeed(address(weth));
    }

    // =========================================================================
    //  Price update scenario
    // =========================================================================

    function test_priceUpdate_reflectsNewAnswer() public {
        assertEq(oracle.getPrice(address(weth)), 2_000e18);

        // ETH crashes to $1,500
        ethFeed.setPrice(1_500e8);
        assertEq(oracle.getPrice(address(weth)), 1_500e18);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    /// @dev Any positive 8-decimal price should scale to WAD correctly.
    function testFuzz_getPrice_scalesCorrectly(int256 rawPrice) public {
        // Bound to realistic asset price range: $0.01 → $1,000,000
        rawPrice = int256(bound(uint256(rawPrice), 1e6, 1_000_000e8));

        ethFeed.setPrice(rawPrice);
        uint256 price = oracle.getPrice(address(weth));

        // WAD price = rawPrice * 1e10
        assertEq(price, uint256(rawPrice) * 1e10);
    }

    /// @dev getValueInUsd should be proportional to amount.
    function testFuzz_getValueInUsd_isProportional(uint256 amount) public view {
        // Bound to avoid multiplication overflow
        amount = bound(amount, 1, 1e24);

        uint256 valueA = oracle.getValueInUsd(address(weth), amount);
        uint256 valueB = oracle.getValueInUsd(address(weth), amount * 2);

        // value(2x) == 2 * value(x) within ±1 wei rounding
        uint256 diff = valueB > 2 * valueA ? valueB - 2 * valueA : 2 * valueA - valueB;
        assertLe(diff, 1);
    }
}
