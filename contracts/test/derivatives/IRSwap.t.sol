// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IRSwap} from "../../src/derivatives/IRSwap.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/**
 * @title IRSwapTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 20 tests for interest rate swap (variable <-> fixed)
 */
contract IRSwapTest is Test {

    IRSwap    internal swap;
    MockERC20 internal token;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");
    address internal asset = makeAddr("asset");

    uint256 constant NOTIONAL      = 100_000e6;  // $100K
    uint256 constant FIXED_RATE    = 500;         // 5% APR in BPS
    uint256 constant VARIABLE_RATE = 800;         // 8% APR in BPS
    uint256 constant DURATION      = 30 days;

    function setUp() public {
        token = new MockERC20("Settlement", "USDC", 6);
        swap  = new IRSwap(admin, address(token));

        vm.prank(admin);
        swap.setVariableRate(asset, VARIABLE_RATE);

        token.mint(alice, 10_000_000e6);
        token.mint(address(swap), 10_000_000e6); // protocol reserves for payouts
    }

    function _open() internal returns (uint256 id) {
        vm.startPrank(alice);
        token.approve(address(swap), type(uint256).max);
        id = swap.openSwap(asset, NOTIONAL, FIXED_RATE, DURATION);
        vm.stopPrank();
    }

    // =========================================================================
    //  Admin
    // =========================================================================

    function test_setVariableRate_storesValue() public view {
        assertEq(swap.variableRates(asset), VARIABLE_RATE);
    }

    function test_setVariableRate_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        swap.setVariableRate(asset, 500);
    }

    // =========================================================================
    //  openSwap
    // =========================================================================

    function test_openSwap_createsSwap() public {
        uint256 id = _open();
        IRSwap.Swap memory s = swap.getSwap(id);

        assertTrue(s.exists);
        assertEq(s.user, alice);
        assertEq(s.notional, NOTIONAL);
        assertEq(s.fixedRateBps, FIXED_RATE);
        assertEq(s.maturity, block.timestamp + DURATION);
    }

    function test_openSwap_pullsCollateral() public {
        uint256 balBefore = token.balanceOf(alice);
        _open();
        uint256 collateral = (NOTIONAL * 500) / 10_000; // 5%
        assertEq(token.balanceOf(alice), balBefore - collateral);
    }

    function test_openSwap_emitsEvent() public {
        vm.startPrank(alice);
        token.approve(address(swap), type(uint256).max);
        vm.expectEmit(false, true, false, false);
        emit IRSwap.SwapOpened(1, alice, asset, NOTIONAL, FIXED_RATE, 0);
        swap.openSwap(asset, NOTIONAL, FIXED_RATE, DURATION);
        vm.stopPrank();
    }

    function test_openSwap_zeroNotionalReverts() public {
        vm.startPrank(alice);
        token.approve(address(swap), type(uint256).max);
        vm.expectRevert(IRSwap.IRSwap__ZeroAmount.selector);
        swap.openSwap(asset, 0, FIXED_RATE, DURATION);
        vm.stopPrank();
    }

    function test_openSwap_durationTooShortReverts() public {
        vm.startPrank(alice);
        token.approve(address(swap), type(uint256).max);
        vm.expectRevert();
        swap.openSwap(asset, NOTIONAL, FIXED_RATE, 1 days); // < MIN_DURATION (7 days)
        vm.stopPrank();
    }

    function test_openSwap_durationTooLongReverts() public {
        vm.startPrank(alice);
        token.approve(address(swap), type(uint256).max);
        vm.expectRevert();
        swap.openSwap(asset, NOTIONAL, FIXED_RATE, 400 days); // > MAX_DURATION
        vm.stopPrank();
    }

    function test_openSwap_incrementsId() public {
        uint256 id1 = _open();
        uint256 id2 = _open();
        assertEq(id2, id1 + 1);
    }

    // =========================================================================
    //  settleSwap — variable > fixed (user receives)
    // =========================================================================

    function test_settleSwap_variableAboveFixed_userReceives() public {
        uint256 id = _open(); // fixed=5%, variable=8%

        vm.warp(block.timestamp + DURATION);

        uint256 balBefore = token.balanceOf(alice);
        swap.settleSwap(id);
        uint256 balAfter = token.balanceOf(alice);

        // User should receive net payment (variable > fixed)
        assertGt(balAfter, balBefore, "user should receive net payment");
        console2.log("Net received by alice:", balAfter - balBefore);
    }

    function test_settleSwap_fixedAboveVariable_userPays() public {
        // Set variable below fixed
        vm.prank(admin);
        swap.setVariableRate(asset, 300); // 3% variable, 5% fixed

        uint256 id = _open();
        vm.warp(block.timestamp + DURATION);

        uint256 balBefore = token.balanceOf(alice);
        swap.settleSwap(id);
        uint256 balAfter = token.balanceOf(alice);

        // User gets back collateral minus net payment (fixed > variable)
        // Should get back less than full collateral
        uint256 fullCollateral = (NOTIONAL * 500) / 10_000;
        uint256 returned = balAfter - balBefore;
        assertLt(returned, fullCollateral, "user pays net when fixed > variable");
    }

    function test_settleSwap_beforeMaturityReverts() public {
        uint256 id = _open();
        vm.expectRevert();
        swap.settleSwap(id);
    }

    function test_settleSwap_doubleSettleReverts() public {
        uint256 id = _open();
        vm.warp(block.timestamp + DURATION);
        swap.settleSwap(id);

        vm.expectRevert(abi.encodeWithSelector(IRSwap.IRSwap__SwapAlreadySettled.selector, id));
        swap.settleSwap(id);
    }

    function test_settleSwap_nonExistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IRSwap.IRSwap__SwapNotFound.selector, 999));
        swap.settleSwap(999);
    }

    function test_settleSwap_marksSettled() public {
        uint256 id = _open();
        vm.warp(block.timestamp + DURATION);
        swap.settleSwap(id);
        assertTrue(swap.getSwap(id).settled);
    }

    // =========================================================================
    //  previewSettlement
    // =========================================================================

    function test_previewSettlement_correctMath() public {
        uint256 id = _open();

        (uint256 fixed_, uint256 variable_, int256 net) = swap.previewSettlement(id);

        // fixed = 100_000e6 * 500 * 30 days / (10_000 * 365 days)
        uint256 expectedFixed    = (NOTIONAL * FIXED_RATE * DURATION) / (10_000 * 365 days);
        uint256 expectedVariable = (NOTIONAL * VARIABLE_RATE * DURATION) / (10_000 * 365 days);

        assertApproxEqAbs(fixed_, expectedFixed, 1e3);
        assertApproxEqAbs(variable_, expectedVariable, 1e3);
        assertEq(net, int256(expectedVariable) - int256(expectedFixed));
    }

    function test_isMatured_falseBeforeMaturity() public {
        uint256 id = _open();
        assertFalse(swap.isMatured(id));
    }

    function test_isMatured_trueAfterMaturity() public {
        uint256 id = _open();
        vm.warp(block.timestamp + DURATION);
        assertTrue(swap.isMatured(id));
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_openSwap_collateralProportionalToNotional(uint256 notional) public {
        notional = bound(notional, 1e6, 1_000_000e6);
        token.mint(alice, notional);

        uint256 expectedCollateral = (notional * 500) / 10_000;

        vm.startPrank(alice);
        token.approve(address(swap), type(uint256).max);
        swap.openSwap(asset, notional, FIXED_RATE, DURATION);
        vm.stopPrank();

        IRSwap.Swap memory s = swap.getSwap(1);
        assertEq(s.collateralPosted, expectedCollateral);
    }
}
