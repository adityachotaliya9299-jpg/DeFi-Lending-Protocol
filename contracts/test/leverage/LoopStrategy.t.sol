// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {LoopStrategy} from "../../src/leverage/LoopStrategy.sol";

/**
 * @title LoopStrategyTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 15 tests for leveraged loop strategy
 */
contract LoopStrategyTest is Test {

    LoopStrategy internal strategy;

    address internal admin  = makeAddr("admin");
    address internal pool   = makeAddr("pool");
    address internal flash  = makeAddr("flash");
    address internal alice  = makeAddr("alice");
    address internal colAsset = makeAddr("colAsset");
    address internal borAsset = makeAddr("borAsset");

    function setUp() public {
        strategy = new LoopStrategy(admin, pool, flash);
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    function test_setMaxLeverage_storesValue() public {
        vm.prank(admin);
        strategy.setMaxLeverage(50_000);
        assertEq(strategy.maxLeverageBps(), 50_000);
    }

    function test_setMaxLeverage_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        strategy.setMaxLeverage(50_000);
    }

    function test_setMaxLeverage_belowMinReverts() public {
        vm.prank(admin);
        vm.expectRevert("min 1x");
        strategy.setMaxLeverage(5_000); // below BPS_TOTAL (10_000)
    }

    function test_setMaxLeverage_aboveMaxReverts() public {
        vm.prank(admin);
        vm.expectRevert("max 10x");
        strategy.setMaxLeverage(200_000);
    }

    // =========================================================================
    //  calculateLeverage — pure math
    // =========================================================================

    function test_calculateLeverage_1loop_is1x() public view {
        // 1 loop = just deposit, no borrow = 1x = 10_000 BPS
        uint256 lev = strategy.calculateLeverage(7_000, 1);
        assertEq(lev, 10_000);
    }

    function test_calculateLeverage_2loops_70pctLtv() public view {
        // 2 loops at 70% LTV: 1x + 0.7x = 1.7x = 17_000 BPS
        uint256 lev = strategy.calculateLeverage(7_000, 2);
        assertEq(lev, 17_000);
    }

    function test_calculateLeverage_3loops_70pctLtv() public view {
        // 3 loops: 1 + 0.7 + 0.49 = 2.19x = 21_900 BPS
        uint256 lev = strategy.calculateLeverage(7_000, 3);
        assertEq(lev, 21_900);
    }

    function test_calculateLeverage_increasesWithLoops() public view {
        uint256 lev1 = strategy.calculateLeverage(7_000, 1);
        uint256 lev3 = strategy.calculateLeverage(7_000, 3);
        uint256 lev5 = strategy.calculateLeverage(7_000, 5);
        assertLt(lev1, lev3);
        assertLt(lev3, lev5);
    }

    function test_calculateLeverage_increasesWithLtv() public view {
        uint256 lev60 = strategy.calculateLeverage(6_000, 3);
        uint256 lev70 = strategy.calculateLeverage(7_000, 3);
        uint256 lev80 = strategy.calculateLeverage(8_000, 3);
        assertLt(lev60, lev70);
        assertLt(lev70, lev80);
    }

    // =========================================================================
    //  openPosition — validation
    // =========================================================================

    function test_openPosition_zeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(LoopStrategy.LoopStrategy__ZeroAmount.selector);
        strategy.openPosition(colAsset, borAsset, 0, 2, 7_000);
    }

    function test_openPosition_tooManyLoopsReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(
            LoopStrategy.LoopStrategy__TooManyLoops.selector, 11, 10
        ));
        strategy.openPosition(colAsset, borAsset, 1_000e6, 11, 7_000);
    }

    function test_openPosition_leverageTooHighReverts() public {
        // 10 loops at 90% LTV → very high leverage
        vm.prank(alice);
        vm.expectRevert();
        strategy.openPosition(colAsset, borAsset, 1_000e6, 10, 9_000);
    }

    function test_openPosition_zeroAddressReverts() public {
        vm.prank(alice);
        vm.expectRevert(LoopStrategy.LoopStrategy__ZeroAddress.selector);
        strategy.openPosition(address(0), borAsset, 1_000e6, 2, 7_000);
    }

    // =========================================================================
    //  closePosition — validation
    // =========================================================================

    function test_closePosition_noPositionReverts() public {
        vm.prank(alice);
        vm.expectRevert(LoopStrategy.LoopStrategy__NoPositionOpen.selector);
        strategy.closePosition();
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_leverage_alwaysAbove1x(uint256 ltvBps, uint256 loops) public view {
        ltvBps = bound(ltvBps, 100, 9_900);
        loops  = bound(loops, 1, 10);
        uint256 lev = strategy.calculateLeverage(ltvBps, loops);
        assertGe(lev, 10_000, "leverage always >= 1x");
    }

    function testFuzz_leverage_monotonicInLoops(uint256 ltvBps, uint256 loops) public view {
        ltvBps = bound(ltvBps, 100, 9_000);
        loops  = bound(loops, 1, 9);
        uint256 levN   = strategy.calculateLeverage(ltvBps, loops);
        uint256 levNp1 = strategy.calculateLeverage(ltvBps, loops + 1);
        assertLe(levN, levNp1, "more loops = more leverage");
    }
}
