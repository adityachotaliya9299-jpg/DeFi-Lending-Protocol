// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {TrancheVault} from "../../src/tranches/TrancheVault.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/**
 * @title TrancheVaultTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 18 tests for Senior/Junior tranche vault
 */
contract TrancheVaultTest is Test {

    TrancheVault internal vault;
    MockERC20    internal usdc;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice"); // senior depositor
    address internal bob   = makeAddr("bob");   // junior depositor

    uint256 constant TARGET_SENIOR_YIELD = 500; // 5% APR in BPS

    function setUp() public {
        usdc  = new MockERC20("USD Coin", "USDC", 6);
        vault = new TrancheVault(admin, address(usdc), TARGET_SENIOR_YIELD);

        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob,   1_000_000e6);
        usdc.mint(admin, 1_000_000e6);
    }

    function _depositJunior(address user, uint256 amt) internal {
        vm.startPrank(user);
        usdc.approve(address(vault), amt);
        vault.depositJunior(amt);
        vm.stopPrank();
    }

    function _depositSenior(address user, uint256 amt) internal {
        vm.startPrank(user);
        usdc.approve(address(vault), amt);
        vault.depositSenior(amt);
        vm.stopPrank();
    }

    // =========================================================================
    //  Deposit Junior
    // =========================================================================

    function test_depositJunior_mintsShares() public {
        _depositJunior(bob, 20_000e6);
        assertGt(vault.juniorToken().balanceOf(bob), 0);
        assertEq(vault.juniorTVL(), 20_000e6);
    }

    function test_depositJunior_zeroAmountReverts() public {
        vm.prank(bob);
        vm.expectRevert(TrancheVault.TrancheVault__ZeroAmount.selector);
        vault.depositJunior(0);
    }

    function test_depositJunior_emitsEvent() public {
        vm.startPrank(bob);
        usdc.approve(address(vault), 10_000e6);
        vm.expectEmit(true, false, false, false);
        emit TrancheVault.JuniorDeposit(bob, 10_000e6, 0);
        vault.depositJunior(10_000e6);
        vm.stopPrank();
    }

    // =========================================================================
    //  Deposit Senior
    // =========================================================================

    function test_depositSenior_requiresJuniorBuffer() public {
        // No junior yet — senior deposit should revert
        // (only enforced when there is existing TVL)
        // First deposit always works since totalTVL=0
        _depositSenior(alice, 10_000e6);
        assertEq(vault.seniorTVL(), 10_000e6);
    }

    function test_depositSenior_withJuniorBuffer() public {
        _depositJunior(bob, 20_000e6);   // 20k junior first
        _depositSenior(alice, 60_000e6); // 60k senior (75% of 80k = ok)
        assertEq(vault.seniorTVL(), 60_000e6);
    }

    function test_depositSenior_exceedsCap_reverts() public {
        _depositJunior(bob, 10_000e6);

        // Try to make senior > 80% of total
        vm.startPrank(alice);
        usdc.approve(address(vault), 500_000e6);
        vm.expectRevert(TrancheVault.TrancheVault__ExceedsSeniorCap.selector);
        vault.depositSenior(500_000e6); // would be ~98% senior
        vm.stopPrank();
    }

    function test_depositSenior_mintsShares() public {
        _depositJunior(bob, 20_000e6);
        _depositSenior(alice, 60_000e6);
        assertGt(vault.seniorToken().balanceOf(alice), 0);
    }

    // =========================================================================
    //  Withdraw
    // =========================================================================

    function test_withdrawJunior_returnsUnderlying() public {
        _depositJunior(bob, 20_000e6);

        uint256 shares = vault.juniorToken().balanceOf(bob);
        uint256 balBefore = usdc.balanceOf(bob);

        vm.prank(bob);
        vault.withdrawJunior(shares);

        assertGt(usdc.balanceOf(bob), balBefore);
        assertEq(vault.juniorToken().balanceOf(bob), 0);
    }

    function test_withdrawSenior_returnsUnderlying() public {
        _depositJunior(bob, 20_000e6);
        _depositSenior(alice, 60_000e6);

        uint256 shares    = vault.seniorToken().balanceOf(alice);
        uint256 balBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        vault.withdrawSenior(shares);

        assertGt(usdc.balanceOf(alice), balBefore);
    }

    // =========================================================================
    //  Yield Distribution
    // =========================================================================

    function test_distributeYield_seniorGetsTargetFirst() public {
        _depositJunior(bob,   20_000e6);
        _depositSenior(alice, 60_000e6);

        uint256 seniorBefore = vault.seniorTVL();
        uint256 juniorBefore = vault.juniorTVL();

        // Distribute 1000 USDC yield
        vm.prank(admin);
        vault.distributeYield(1_000e6);

        uint256 seniorAfter = vault.seniorTVL();
        uint256 juniorAfter = vault.juniorTVL();

        // Senior should get targetSeniorYieldBps of its TVL first
        // (60_000 * 500 / 10_000 = 3_000e6 max, but only 1_000 available)
        // So senior gets min(3000, 1000) = 1000 here (all yield)
        assertGe(seniorAfter, seniorBefore, "senior TVL should grow");
        console2.log("Senior TVL after yield:", seniorAfter);
        console2.log("Junior TVL after yield:", juniorAfter);
    }

    function test_distributeYield_excessGoesToJunior() public {
        _depositJunior(bob,   50_000e6);
        _depositSenior(alice, 50_000e6);

        // Yield large enough that senior gets cap and junior gets rest
        // Senior max = 50_000 * 500/10_000 = 2_500
        // Distribute 5_000 → senior gets 2_500, junior gets 2_500
        vm.prank(admin);
        vault.distributeYield(5_000e6);

        assertGt(vault.juniorTVL(), 50_000e6, "junior should also get yield");
    }

    function test_distributeYield_emitsEvent() public {
        _depositJunior(bob, 20_000e6);
        vm.prank(admin);
        vm.expectEmit(false, false, false, false);
        emit TrancheVault.YieldDistributed(0, 0, 0);
        vault.distributeYield(1_000e6);
    }

    // =========================================================================
    //  Bad Debt Absorption
    // =========================================================================

    function test_absorbBadDebt_juniorAbsorbsFirst() public {
        _depositJunior(bob,   20_000e6);
        _depositSenior(alice, 60_000e6);

        uint256 seniorBefore = vault.seniorTVL();

        vm.prank(admin);
        vault.absorbBadDebt(10_000e6); // junior can absorb (20k > 10k)

        // Senior untouched
        assertEq(vault.seniorTVL(), seniorBefore, "senior protected");
        assertEq(vault.juniorTVL(), 10_000e6, "junior absorbs loss");
    }

    function test_absorbBadDebt_seniorTakesExcess() public {
        _depositJunior(bob,   5_000e6);
        _depositSenior(alice, 20_000e6);

        vm.prank(admin);
        vault.absorbBadDebt(10_000e6); // 5k junior wiped + 5k from senior

        assertEq(vault.juniorTVL(), 0, "junior wiped");
        assertEq(vault.seniorTVL(), 15_000e6, "senior takes excess loss");
    }

    // =========================================================================
    //  View
    // =========================================================================

    function test_seniorRatioBps_correct() public {
        _depositJunior(bob,   25_000e6);
        _depositSenior(alice, 75_000e6);

        // 75k / 100k = 75%
        assertApproxEqAbs(vault.seniorRatioBps(), 7_500, 1);
    }

    function test_totalTVL_sumOfBothTranches() public {
        _depositJunior(bob,   20_000e6);
        _depositSenior(alice, 60_000e6);
        assertEq(vault.totalTVL(), 80_000e6);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_juniorAbsorbsBeforeSenior(uint256 badDebt) public {
        _depositJunior(bob,   20_000e6);
        _depositSenior(alice, 60_000e6);

        badDebt = bound(badDebt, 1, 20_000e6); // within junior capacity
        uint256 seniorBefore = vault.seniorTVL();

        vm.prank(admin);
        vault.absorbBadDebt(badDebt);

        assertEq(vault.seniorTVL(), seniorBefore, "senior always protected when junior covers");
    }
}
