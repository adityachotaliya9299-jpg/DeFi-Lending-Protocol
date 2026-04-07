// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test}              from "forge-std/Test.sol";
import {ProtocolTreasury}  from "../../src/treasury/ProtocolTreasury.sol";
import {MockERC20}         from "../../src/mocks/MockERC20.sol";

contract ProtocolTreasuryTest is Test {

    ProtocolTreasury internal treasury;
    MockERC20        internal token;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal dest  = makeAddr("dest");

    function setUp() public {
        treasury = new ProtocolTreasury(owner);
        token    = new MockERC20("USD Coin", "USDC", 6);
        token.mint(address(treasury), 100_000e6);
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    function test_deployment_ownerSet() public view {
        assertEq(treasury.owner(), owner);
    }

    function test_deployment_zeroOwnerReverts() public {
        vm.expectRevert();
        new ProtocolTreasury(address(0));
    }

    // ─── withdraw ─────────────────────────────────────────────────────────────

    function test_withdraw_transfersTokens() public {
        uint256 amount = 10_000e6;
        vm.prank(owner);
        treasury.withdraw(address(token), dest, amount);

        assertEq(token.balanceOf(dest),              amount);
        assertEq(token.balanceOf(address(treasury)), 90_000e6);
    }

    function test_withdraw_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        treasury.withdraw(address(token), dest, 1_000e6);
    }

    function test_withdraw_zeroAmountReverts() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolTreasury.ProtocolTreasury__ZeroAmount.selector);
        treasury.withdraw(address(token), dest, 0);
    }

    function test_withdraw_zeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolTreasury.ProtocolTreasury__ZeroAddress.selector);
        treasury.withdraw(address(0), dest, 1_000e6);
    }

    function test_withdraw_zeroDestReverts() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolTreasury.ProtocolTreasury__ZeroAddress.selector);
        treasury.withdraw(address(token), address(0), 1_000e6);
    }

    function test_withdraw_exceedingBalanceReverts() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolTreasury.ProtocolTreasury__InsufficientBalance.selector);
        treasury.withdraw(address(token), dest, 200_000e6);
    }

    function test_withdraw_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit ProtocolTreasury.FundsWithdrawn(address(token), dest, 5_000e6);
        treasury.withdraw(address(token), dest, 5_000e6);
    }

    // ─── withdrawAll ──────────────────────────────────────────────────────────

    function test_withdrawAll_drainsBalance() public {
        vm.prank(owner);
        treasury.withdrawAll(address(token), dest);

        assertEq(token.balanceOf(dest),              100_000e6);
        assertEq(token.balanceOf(address(treasury)), 0);
    }

    function test_withdrawAll_zeroBalanceReverts() public {
        MockERC20 empty = new MockERC20("Empty", "EMP", 18);
        vm.prank(owner);
        vm.expectRevert(ProtocolTreasury.ProtocolTreasury__ZeroAmount.selector);
        treasury.withdrawAll(address(empty), dest);
    }

    // ─── getBalance ───────────────────────────────────────────────────────────

    function test_getBalance_returnsCorrectAmount() public view {
        assertEq(treasury.getBalance(address(token)), 100_000e6);
    }

    // ─── ETH handling ─────────────────────────────────────────────────────────

    function test_receiveEther_accepted() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(treasury).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(treasury).balance, 1 ether);
    }

    function test_withdrawEther_works() public {
        vm.deal(address(treasury), 5 ether);
        vm.prank(owner);
        treasury.withdrawEther(payable(dest), 3 ether);
        assertEq(dest.balance, 3 ether);
        assertEq(address(treasury).balance, 2 ether);
    }

    function test_withdrawEther_onlyOwner() public {
        vm.deal(address(treasury), 1 ether);
        vm.prank(alice);
        vm.expectRevert();
        treasury.withdrawEther(payable(dest), 1 ether);
    }

    // ─── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_withdraw_partialAmount(uint256 amount) public {
        amount = bound(amount, 1, 100_000e6);
        vm.prank(owner);
        treasury.withdraw(address(token), dest, amount);
        assertEq(token.balanceOf(dest), amount);
    }
}
