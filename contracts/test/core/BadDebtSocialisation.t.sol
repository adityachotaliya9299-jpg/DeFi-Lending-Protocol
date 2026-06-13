// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {BadDebtSocialisation} from "../../src/core/BadDebtSocialisation.sol";

/**
 * @title BadDebtSocialisationTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice 12 tests for bad debt socialisation via index reduction
 */
contract BadDebtSocialisationTest is Test {

    BadDebtSocialisation internal bds;

    address internal admin    = makeAddr("admin");
    address internal pool     = makeAddr("pool");
    address internal alice    = makeAddr("alice"); // borrower with bad debt
    address internal asset    = makeAddr("asset");

    uint256 constant RAY = 1e27;

    function setUp() public {
        bds = new BadDebtSocialisation(admin, pool);
    }

    // =========================================================================
    //  calculateIndexReduction — core logic
    // =========================================================================

    function test_calculateIndexReduction_basic() public {
        // 1000 bad debt, 100_000 total deposits, index = RAY
        // reduction = 1000 * RAY / 100_000 = RAY / 100 = 1%
        vm.prank(pool);
        (uint256 reduction, uint256 newIndex) = bds.calculateIndexReduction(
            asset, alice, 1_000e6, 100_000e6, RAY
        );

        assertGt(reduction, 0, "reduction should be nonzero");
        assertEq(newIndex, RAY - reduction, "newIndex = currentIndex - reduction");
        assertLt(newIndex, RAY, "index should decrease");
        console2.log("Index reduction:", reduction);
        console2.log("New index:", newIndex);
    }

    function test_calculateIndexReduction_onlyPool() public {
        vm.prank(alice);
        vm.expectRevert();
        bds.calculateIndexReduction(asset, alice, 1_000e6, 100_000e6, RAY);
    }

    function test_calculateIndexReduction_zeroDebtReverts() public {
        vm.prank(pool);
        vm.expectRevert(BadDebtSocialisation.BadDebtSocialisation__ZeroDebt.selector);
        bds.calculateIndexReduction(asset, alice, 0, 100_000e6, RAY);
    }

    function test_calculateIndexReduction_zeroDepositsReverts() public {
        vm.prank(pool);
        vm.expectRevert(BadDebtSocialisation.BadDebtSocialisation__ZeroDeposits.selector);
        bds.calculateIndexReduction(asset, alice, 1_000e6, 0, RAY);
    }

    function test_calculateIndexReduction_debtExceedsDepositsReverts() public {
        // If bad debt >= total deposits, index would go to 0 — must revert
        vm.prank(pool);
        vm.expectRevert(BadDebtSocialisation.BadDebtSocialisation__IndexWouldBeZero.selector);
        bds.calculateIndexReduction(asset, alice, 100_000e6, 1_000e6, RAY);
    }

    function test_calculateIndexReduction_emitsEvent() public {
        vm.prank(pool);
        vm.expectEmit(true, true, false, false);
        emit BadDebtSocialisation.BadDebtSocialised(asset, alice, 1_000e6, 0, 0);
        bds.calculateIndexReduction(asset, alice, 1_000e6, 100_000e6, RAY);
    }

    function test_calculateIndexReduction_tracksCumulative() public {
        vm.prank(pool);
        bds.calculateIndexReduction(asset, alice, 1_000e6, 100_000e6, RAY);

        vm.prank(pool);
        bds.calculateIndexReduction(asset, alice, 500e6, 100_000e6, RAY);

        (uint256 cumulative, uint256 count) = bds.getAssetStats(asset);
        assertEq(cumulative, 1_500e6);
        assertEq(count, 2);
    }

    // =========================================================================
    //  previewIndexReduction — view helper
    // =========================================================================

    function test_previewIndexReduction_matchesCalculate() public {
        (uint256 previewReduction, uint256 previewNew) =
            bds.previewIndexReduction(1_000e6, 100_000e6, RAY);

        vm.prank(pool);
        (uint256 actualReduction, uint256 actualNew) =
            bds.calculateIndexReduction(asset, alice, 1_000e6, 100_000e6, RAY);

        assertEq(previewReduction, actualReduction);
        assertEq(previewNew, actualNew);
    }

    function test_previewIndexReduction_zeroDeposits_returnsCurrentIndex() public {
        (uint256 reduction, uint256 newIndex) =
            bds.previewIndexReduction(1_000e6, 0, RAY);
        assertEq(reduction, 0);
        assertEq(newIndex, RAY);
    }

    // =========================================================================
    //  wouldWipeDepositors
    // =========================================================================

    function test_wouldWipeDepositors_trueWhenDebtExceedsDeposits() public view {
        assertTrue(bds.wouldWipeDepositors(100_000e6, 1_000e6, RAY));
    }

    function test_wouldWipeDepositors_falseWhenSafe() public view {
        assertFalse(bds.wouldWipeDepositors(1_000e6, 100_000e6, RAY));
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_indexReduction_alwaysLessThanCurrentIndex(
        uint256 badDebt,
        uint256 totalDeposits,
        uint256 currentIndex
    ) public {
        // Ensure safe: badDebt < totalDeposits, index reasonable
        totalDeposits = bound(totalDeposits, 1e18, 1e30);
        badDebt       = bound(badDebt, 1, totalDeposits - 1);
        currentIndex  = bound(currentIndex, RAY, RAY * 10);

        // Ensure reduction < currentIndex
        uint256 reduction = (badDebt * currentIndex) / totalDeposits;
        vm.assume(reduction < currentIndex);

        vm.prank(pool);
        (, uint256 newIndex) = bds.calculateIndexReduction(
            asset, alice, badDebt, totalDeposits, currentIndex
        );

        assertLt(newIndex, currentIndex, "new index must be less than current");
        assertGt(newIndex, 0, "new index must be > 0");
    }
}
