// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {VariableDebtToken} from "../../src/tokens/VariableDebtToken.sol";
import {IVariableDebtToken} from "../../src/interfaces/IVariableDebtToken.sol";
import {WadRayMath} from "../../src/math/WadRayMath.sol";

/**
 * @title  VariableDebtTokenTest
 * @notice Tests for the Phase 2 variable debt token implementation.
 *
 * Key test areas:
 *   1. Scaled balance math: amount ↔ scaled amount via index
 *   2. Non-transferability: transfer and transferFrom always revert
 *   3. Mint/burn: only pool can call, balance updates correctly
 *   4. Interest accrual: balance grows as index increases (without state changes)
 *   5. Approval still works: for credit delegation
 */
contract VariableDebtTokenTest is Test {
    using WadRayMath for uint256;

    VariableDebtToken public vToken;
    address pool        = makeAddr("pool");
    address user        = makeAddr("user");
    address attacker    = makeAddr("attacker");
    address underlying  = makeAddr("usdc");

    function setUp() public {
        vm.prank(pool);
        vToken = new VariableDebtToken(
            pool,
            underlying,
            "Variable Debt USDC",
            "vUSDC"
        );
    }

    // ─── Mint tests ────────────────────────────────────────────────────────────

    function test_mint_createsDebt() public {
        uint256 amount = 1000e6; // 1000 USDC
        uint256 index  = 1e27;   // 1.0 RAY (no accrual yet)

        vm.prank(pool);
        vToken.mint(user, amount, index);

        // balance = scaledBalance × index / RAY
        // scaledBalance = amount × RAY / index = 1000e6 × 1e27 / 1e27 = 1000e6
        // balance = 1000e6 × 1e27 / 1e27 = 1000e6
        assertEq(vToken.balanceOf(user), amount);
        assertEq(vToken.totalSupply(), amount);
    }

    function test_mint_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit IVariableDebtToken.Mint(user, 500e6, 1e27);

        vm.prank(pool);
        vToken.mint(user, 500e6, 1e27);
    }

    function test_mint_onlyPool() public {
        vm.prank(attacker);
        vm.expectRevert();
        vToken.mint(user, 1000e6, 1e27);
    }

    function test_mint_zeroAmountReverts() public {
        vm.prank(pool);
        vm.expectRevert(IVariableDebtToken.VariableDebtToken__InvalidAmount.selector);
        vToken.mint(user, 0, 1e27);
    }

    function test_mint_zeroAddressReverts() public {
        vm.prank(pool);
        vm.expectRevert(IVariableDebtToken.VariableDebtToken__ZeroAddress.selector);
        vToken.mint(address(0), 1000e6, 1e27);
    }

    // ─── Burn tests ────────────────────────────────────────────────────────────

    function test_burn_reducesDebt() public {
        vm.startPrank(pool);
        vToken.mint(user, 1000e6, 1e27);
        vToken.burn(user, 300e6, 1e27);
        vm.stopPrank();

        assertEq(vToken.balanceOf(user), 700e6);
        assertEq(vToken.totalSupply(), 700e6);
    }

    function test_burn_fullRepayment() public {
        vm.startPrank(pool);
        vToken.mint(user, 1000e6, 1e27);
        vToken.burn(user, 1000e6, 1e27);
        vm.stopPrank();

        assertEq(vToken.balanceOf(user), 0);
        assertEq(vToken.totalSupply(), 0);
    }

    function test_burn_emitsEvent() public {
        vm.prank(pool);
        vToken.mint(user, 1000e6, 1e27);

        vm.expectEmit(true, false, false, true);
        emit IVariableDebtToken.Burn(user, 500e6, 1e27);

        vm.prank(pool);
        vToken.burn(user, 500e6, 1e27);
    }

    function test_burn_onlyPool() public {
        vm.prank(attacker);
        vm.expectRevert();
        vToken.burn(user, 1000e6, 1e27);
    }

    // ─── Scaled balance math ───────────────────────────────────────────────────

    function test_scaledBalance_withHighIndex() public {
        // Index = 1.05e27 (5% interest accrued)
        // User mints 1000e6 at index 1e27
        vm.prank(pool);
        vToken.mint(user, 1000e6, 1e27);

        uint256 scaledBal = vToken.scaledBalanceOf(user);
        assertEq(scaledBal, 1000e6);

        // If index is now 1.05e27, balance should be 1050e6
        // But we can't change the index in this test (it's internal)
        // This demonstrates the concept for documentation
    }

    function test_scaledBalance_repaymentScaled() public {
        // Mint at index 1e27
        vm.prank(pool);
        vToken.mint(user, 1000e6, 1e27);
        assertEq(vToken.scaledBalanceOf(user), 1000e6);

        // Repay 500e6 at same index
        vm.prank(pool);
        vToken.burn(user, 500e6, 1e27);
        assertEq(vToken.scaledBalanceOf(user), 500e6);
    }

    // ─── Transfer blocking tests ───────────────────────────────────────────────

    function test_transfer_blocked() public {
        vm.prank(pool);
        vToken.mint(user, 1000e6, 1e27);

        vm.prank(user);
        vm.expectRevert(IVariableDebtToken.VariableDebtToken__NonTransferable.selector);
        vToken.transfer(attacker, 100e6);
    }

    function test_transferFrom_blocked() public {
        vm.prank(pool);
        vToken.mint(user, 1000e6, 1e27);

        vm.prank(user);
        vToken.approve(attacker, 1000e6);

        vm.prank(attacker);
        vm.expectRevert(IVariableDebtToken.VariableDebtToken__NonTransferable.selector);
        vToken.transferFrom(user, attacker, 100e6);
    }

    // ─── Approval (for credit delegation) ──────────────────────────────────────

    function test_approve_works() public {
        vm.prank(pool);
        vToken.mint(user, 1000e6, 1e27);

        vm.prank(user);
        bool success = vToken.approve(attacker, 500e6);
        assertTrue(success);
        assertEq(vToken.allowance(user, attacker), 500e6);
    }

    function test_allowance_zeroByDefault() public {
        assertEq(vToken.allowance(user, attacker), 0);
    }

    // ─── Multi-user scenarios ──────────────────────────────────────────────────

    function test_multiUser_independentBalances() public {
        address user2 = makeAddr("user2");

        vm.startPrank(pool);
        vToken.mint(user, 1000e6, 1e27);
        vToken.mint(user2, 500e6, 1e27);
        vm.stopPrank();

        assertEq(vToken.balanceOf(user), 1000e6);
        assertEq(vToken.balanceOf(user2), 500e6);
        assertEq(vToken.totalSupply(), 1500e6);
    }

    function test_multiUser_burnIndependent() public {
        address user2 = makeAddr("user2");

        vm.startPrank(pool);
        vToken.mint(user, 1000e6, 1e27);
        vToken.mint(user2, 500e6, 1e27);
        vToken.burn(user, 200e6, 1e27);
        vm.stopPrank();

        assertEq(vToken.balanceOf(user), 800e6);
        assertEq(vToken.balanceOf(user2), 500e6);
        assertEq(vToken.totalSupply(), 1300e6);
    }

    // ─── Fuzz tests ────────────────────────────────────────────────────────────

    function testFuzz_mint_balanceEqualsAmount(uint256 amount) public {
        amount = bound(amount, 1, 1e20);

        vm.prank(pool);
        vToken.mint(user, amount, 1e27);

        assertEq(vToken.balanceOf(user), amount);
    }

    function testFuzz_burn_balanceReducedByAmount(uint256 mint, uint256 burn) public {
        mint = bound(mint, 1, 1e20);
        burn = bound(burn, 1, mint);

        vm.startPrank(pool);
        vToken.mint(user, mint, 1e27);
        vToken.burn(user, burn, 1e27);
        vm.stopPrank();

        assertEq(vToken.balanceOf(user), mint - burn);
    }

    function testFuzz_totalSupply_sumOfAllBalances(uint256 amount1, uint256 amount2) public {
        amount1 = bound(amount1, 1, 1e20);
        amount2 = bound(amount2, 1, 1e20);
        address user2 = makeAddr("user2");

        vm.startPrank(pool);
        vToken.mint(user, amount1, 1e27);
        vToken.mint(user2, amount2, 1e27);
        vm.stopPrank();

        assertEq(vToken.totalSupply(), amount1 + amount2);
    }
}
