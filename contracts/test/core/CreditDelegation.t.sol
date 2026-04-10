// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CreditDelegation} from "../../src/core/CreditDelegation.sol";

contract MockPool {
    // Minimal mock — just needs to exist at an address
}

contract CreditDelegationTest is Test {

    CreditDelegation cd;
    MockPool         pool;

    address alice  = makeAddr("alice");   // delegator
    address bob    = makeAddr("bob");     // delegatee
    address carol  = makeAddr("carol");
    address usdc   = makeAddr("usdc");
    address weth   = makeAddr("weth");

    uint256 constant WAD = 1e18;

    function setUp() public {
        pool = new MockPool();
        cd   = new CreditDelegation(address(pool));
    }

    // ── approveDelegation ─────────────────────────────────────────────────────

    function test_approveDelegation_basic() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 5000 * WAD, 0);

        CreditDelegation.Delegation memory d = cd.getDelegation(alice, bob, usdc);
        assertTrue(d.active);
        assertEq(d.amount, 5000 * WAD);
        assertEq(d.used,   0);
        assertEq(d.expiry, 0);
    }

    function test_approveDelegation_withExpiry() public {
        uint256 exp = block.timestamp + 7 days;
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 1000 * WAD, exp);

        CreditDelegation.Delegation memory d = cd.getDelegation(alice, bob, usdc);
        assertEq(d.expiry, exp);
    }

    function test_approveDelegation_selfReverts() public {
        vm.prank(alice);
        vm.expectRevert(CreditDelegation.CreditDelegation__SelfDelegation.selector);
        cd.approveDelegation(alice, usdc, 1000 * WAD, 0);
    }

    function test_approveDelegation_zeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(CreditDelegation.CreditDelegation__ZeroAmount.selector);
        cd.approveDelegation(bob, usdc, 0, 0);
    }

    function test_approveDelegation_pastExpiryReverts() public {
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert();
        cd.approveDelegation(bob, usdc, 1000 * WAD, block.timestamp - 1);
    }

    // ── revokeDelegation ──────────────────────────────────────────────────────

    function test_revokeDelegation() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 1000 * WAD, 0);

        vm.prank(alice);
        cd.revokeDelegation(bob, usdc);

        CreditDelegation.Delegation memory d = cd.getDelegation(alice, bob, usdc);
        assertFalse(d.active);
    }

    // ── borrowWithDelegation ──────────────────────────────────────────────────

    function test_borrow_basic() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 5000 * WAD, 0);

        vm.prank(bob);
        cd.borrowWithDelegation(alice, usdc, 2000 * WAD);

        CreditDelegation.Delegation memory d = cd.getDelegation(alice, bob, usdc);
        assertEq(d.used, 2000 * WAD);
        assertEq(cd.availableCredit(alice, bob, usdc), 3000 * WAD);
    }

    function test_borrow_exceedsLimitReverts() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 1000 * WAD, 0);

        vm.prank(bob);
        vm.expectRevert();
        cd.borrowWithDelegation(alice, usdc, 2000 * WAD);
    }

    function test_borrow_noDelegationReverts() public {
        vm.prank(bob);
        vm.expectRevert(CreditDelegation.CreditDelegation__NoDelegation.selector);
        cd.borrowWithDelegation(alice, usdc, 100 * WAD);
    }

    function test_borrow_afterRevokeReverts() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 1000 * WAD, 0);

        vm.prank(alice);
        cd.revokeDelegation(bob, usdc);

        vm.prank(bob);
        vm.expectRevert(CreditDelegation.CreditDelegation__NoDelegation.selector);
        cd.borrowWithDelegation(alice, usdc, 100 * WAD);
    }

    function test_borrow_afterExpiryReverts() public {
        uint256 exp = block.timestamp + 1 days;
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 1000 * WAD, exp);

        vm.warp(block.timestamp + 2 days);

        vm.prank(bob);
        vm.expectRevert(CreditDelegation.CreditDelegation__DelegationExpired.selector);
        cd.borrowWithDelegation(alice, usdc, 100 * WAD);
    }

    // ── repayDelegation ───────────────────────────────────────────────────────

    function test_repay_reducesUsed() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 5000 * WAD, 0);

        vm.prank(bob);
        cd.borrowWithDelegation(alice, usdc, 3000 * WAD);

        vm.prank(bob);
        cd.repayDelegation(alice, usdc, 1000 * WAD);

        CreditDelegation.Delegation memory d = cd.getDelegation(alice, bob, usdc);
        assertEq(d.used, 2000 * WAD);
    }

    function test_repay_moreUsedCapsAtZero() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 1000 * WAD, 0);

        vm.prank(bob);
        cd.borrowWithDelegation(alice, usdc, 500 * WAD);

        vm.prank(bob);
        cd.repayDelegation(alice, usdc, 9999 * WAD); // repay more than used

        CreditDelegation.Delegation memory d = cd.getDelegation(alice, bob, usdc);
        assertEq(d.used, 0);
    }

    // ── availableCredit ───────────────────────────────────────────────────────

    function test_availableCredit_noApproval() public view {
        assertEq(cd.availableCredit(alice, bob, usdc), 0);
    }

    function test_availableCredit_afterBorrow() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 5000 * WAD, 0);
        assertEq(cd.availableCredit(alice, bob, usdc), 5000 * WAD);

        vm.prank(bob);
        cd.borrowWithDelegation(alice, usdc, 1500 * WAD);
        assertEq(cd.availableCredit(alice, bob, usdc), 3500 * WAD);
    }

    // ── getDelegatorsOf ───────────────────────────────────────────────────────

    function test_getDelegatorsOf() public {
        vm.prank(alice);
        cd.approveDelegation(bob, usdc, 1000 * WAD, 0);

        vm.prank(carol);
        cd.approveDelegation(bob, usdc, 500 * WAD, 0);

        address[] memory delegators = cd.getDelegatorsOf(bob);
        assertEq(delegators.length, 2);
        assertEq(delegators[0], alice);
        assertEq(delegators[1], carol);
    }

    // ── Fuzz ──────────────────────────────────────────────────────────────────

    function testFuzz_borrowUpToLimit(uint256 delegated, uint256 toBorrow) public {
        delegated = bound(delegated, 1, 1_000_000 * WAD);
        toBorrow  = bound(toBorrow,  1, delegated);

        vm.prank(alice);
        cd.approveDelegation(bob, usdc, delegated, 0);

        vm.prank(bob);
        cd.borrowWithDelegation(alice, usdc, toBorrow);

        assertEq(cd.availableCredit(alice, bob, usdc), delegated - toBorrow);
    }
}
