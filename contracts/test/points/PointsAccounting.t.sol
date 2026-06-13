// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {PointsAccounting} from "../../src/points/PointsAccounting.sol";

/**
 * @title PointsAccountingTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 15 tests for protocol incentive points accounting
 */
contract PointsAccountingTest is Test {

    PointsAccounting internal pa;

    address internal admin = makeAddr("admin");
    address internal pool  = makeAddr("pool");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");
    address internal asset = makeAddr("asset");

    uint256 constant SUPPLY_MODE = 1;
    uint256 constant BORROW_MODE = 2;

    // 1e12 points per token per second → 1000 tokens for 1 day = 86.4e15 points
    uint256 constant SUPPLY_RATE = 1e12;
    uint256 constant BORROW_RATE = 2e12; // borrowers earn 2x

    function setUp() public {
        pa = new PointsAccounting(admin, pool);

        vm.prank(admin);
        pa.setAssetRate(asset, SUPPLY_RATE, BORROW_RATE, true);
    }

    // =========================================================================
    //  Admin — Rate Config
    // =========================================================================

    function test_setAssetRate_storesCorrectly() public view {
        (uint256 supplyRate, uint256 borrowRate, bool active) = _getRate();
        assertEq(supplyRate, SUPPLY_RATE);
        assertEq(borrowRate, BORROW_RATE);
        assertTrue(active);
    }

    function test_setAssetRate_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        pa.setAssetRate(asset, 1e12, 2e12, true);
    }

    function test_setAssetRate_emitsEvents() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit PointsAccounting.RateSet(asset, SUPPLY_MODE, 1e12);
        pa.setAssetRate(asset, 1e12, 2e12, true);
    }

    // =========================================================================
    //  updatePosition — deposit/borrow hooks
    // =========================================================================

    function test_updatePosition_setsBalance() public {
        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, 1_000e18);

        (uint256 balance,,) = pa.getPosition(alice, asset, SUPPLY_MODE);
        assertEq(balance, 1_000e18);
    }

    function test_updatePosition_onlyPool() public {
        vm.prank(alice);
        vm.expectRevert();
        pa.updatePosition(alice, asset, SUPPLY_MODE, 1_000e18);
    }

    function test_updatePosition_silentlySkipsInactiveAsset() public {
        address inactive = makeAddr("inactive");
        // No rate set for inactive — should not revert
        vm.prank(pool);
        pa.updatePosition(alice, inactive, SUPPLY_MODE, 1_000e18);
        assertEq(pa.getUserPoints(alice), 0);
    }

    function test_updatePosition_invalidModeReverts() public {
        vm.prank(pool);
        vm.expectRevert(PointsAccounting.PointsAccounting__InvalidMode.selector);
        pa.updatePosition(alice, asset, 3, 1_000e18);
    }

    // =========================================================================
    //  Points Accrual
    // =========================================================================

    function test_points_accrueOverTime() public {
        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, 1_000e18);

        vm.warp(block.timestamp + 1 days);

        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, 1_000e18); // trigger accrual

        uint256 pts = pa.getUserPoints(alice);
        // Expected: 1000e18 * 1e12 * 86400 / 1e18 = 86400e12 points
        assertGt(pts, 0, "points should accrue");
        assertApproxEqAbs(pts, 1_000e18 * SUPPLY_RATE * 1 days / 1e18, 1e6);
        console2.log("Points after 1 day:", pts);
    }

    function test_points_borrowModeEarnsHigherRate() public {
        // Supply Alice
        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, 1_000e18);

        // Borrow Bob (same amount, same time)
        vm.prank(pool);
        pa.updatePosition(bob, asset, BORROW_MODE, 1_000e18);

        vm.warp(block.timestamp + 1 days);

        pa.accruePoints(alice, asset, SUPPLY_MODE);
        pa.accruePoints(bob,   asset, BORROW_MODE);

        uint256 alicePts = pa.getUserPoints(alice);
        uint256 bobPts   = pa.getUserPoints(bob);

        assertGt(bobPts, alicePts, "borrowers earn more points");
        assertApproxEqAbs(bobPts, alicePts * 2, 1e6, "borrow rate is 2x supply");
    }

    function test_points_accruePermissionless() public {
        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, 1_000e18);

        vm.warp(block.timestamp + 1 days);

        // Anyone can trigger accrual
        vm.prank(bob);
        pa.accruePoints(alice, asset, SUPPLY_MODE);

        assertGt(pa.getUserPoints(alice), 0);
    }

    function test_getPendingPoints_returnsUnaccrued() public {
        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, 1_000e18);

        vm.warp(block.timestamp + 1 days);

        uint256 pending = pa.getPendingPoints(alice, asset, SUPPLY_MODE);
        assertGt(pending, 0, "should have pending points");
        assertApproxEqAbs(pending, 1_000e18 * SUPPLY_RATE * 1 days / 1e18, 1e6);
    }

    function test_points_zeroBalanceAccruesNothing() public {
        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, 0);

        vm.warp(block.timestamp + 365 days);
        pa.accruePoints(alice, asset, SUPPLY_MODE);

        assertEq(pa.getUserPoints(alice), 0);
    }

    // =========================================================================
    //  Redeem
    // =========================================================================

    function test_redeemPoints_reducesTotal() public {
        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, 1_000e18);
        vm.warp(block.timestamp + 1 days);
        pa.accruePoints(alice, asset, SUPPLY_MODE);

        uint256 before = pa.getUserPoints(alice);
        uint256 toRedeem = before / 2;

        vm.prank(admin);
        pa.redeemPoints(alice, toRedeem);

        assertEq(pa.getUserPoints(alice), before - toRedeem);
    }

    function test_redeemPoints_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        pa.redeemPoints(alice, 1);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_points_proportionalToBalanceAndTime(
        uint256 balance,
        uint256 dt
    ) public {
        balance = bound(balance, 1e18, 1_000_000e18);
        dt      = bound(dt, 1, 365 days);

        vm.prank(pool);
        pa.updatePosition(alice, asset, SUPPLY_MODE, balance);

        vm.warp(block.timestamp + dt);
        pa.accruePoints(alice, asset, SUPPLY_MODE);

        uint256 pts = pa.getUserPoints(alice);
        uint256 expected = balance * SUPPLY_RATE * dt / 1e18;
        assertApproxEqAbs(pts, expected, 1e6);
    }

    // =========================================================================
    //  Helper
    // =========================================================================

    function _getRate() internal view returns (uint256, uint256, bool) {
        PointsAccounting.AssetRate memory r = pa.assetRates(asset);
        return (r.supplyRate, r.borrowRate, r.active);
    }
}
