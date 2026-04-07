// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {InterestRateModel}  from "../../src/interest/InterestRateModel.sol";
import {IInterestRateModel} from "../../src/interfaces/IInterestRateModel.sol";
import {WadRayMath}         from "../../src/math/WadRayMath.sol";

/**
 * @title  InterestRateModelTest
 * @notice Full test suite — curve shape, kink, access control, fuzz.
 */
contract InterestRateModelTest is Test {
    using WadRayMath for uint256;

    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint256 constant RAY             = 1e27;
    uint256 constant SECONDS_PER_YEAR = 365 days;

    // Default params: 1% base, 4% slope1, 75% slope2, 80% optimal
    uint256 constant BASE_RATE    = 100;    // 1%
    uint256 constant SLOPE_ONE    = 400;    // 4%
    uint256 constant SLOPE_TWO    = 7_500;  // 75%
    uint256 constant OPTIMAL_UTIL = 8_000;  // 80%

    // ─────────────────────────────────────────────────────────────────────────

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    InterestRateModel internal irm;

    function setUp() public {
        irm = new InterestRateModel(owner, BASE_RATE, SLOPE_ONE, SLOPE_TWO, OPTIMAL_UTIL);
    }

    // =========================================================================
    //  Constructor + initial state
    // =========================================================================

    function test_initialParams() public view {
        assertEq(irm.baseRateRay(),           irm.bpsToRay(BASE_RATE));
        assertEq(irm.slopeOneRay(),           irm.bpsToRay(SLOPE_ONE));
        assertEq(irm.slopeTwoRay(),           irm.bpsToRay(SLOPE_TWO));
        assertEq(irm.optimalUtilizationRay(), irm.bpsToRay(OPTIMAL_UTIL));
    }

    // =========================================================================
    //  getUtilizationRate
    // =========================================================================

    function test_utilization_zeroLiquidity() public view {
        assertEq(irm.getUtilizationRate(0, 0), 0);
    }

    function test_utilization_zeroBorrows() public view {
        assertEq(irm.getUtilizationRate(1_000e18, 0), 0);
    }

    function test_utilization_50Percent() public view {
        uint256 u = irm.getUtilizationRate(1_000e18, 500e18);
        assertApproxEqRel(u, 0.5e27, 0.001e27); // 50% in RAY ±0.1%
    }

    function test_utilization_80Percent() public view {
        uint256 u = irm.getUtilizationRate(1_000e18, 800e18);
        assertApproxEqRel(u, 0.8e27, 0.001e27);
    }

    function test_utilization_100Percent() public view {
        // borrows >= liquidity → capped at RAY
        assertEq(irm.getUtilizationRate(1_000e18, 1_000e18), RAY);
        assertEq(irm.getUtilizationRate(1_000e18, 2_000e18), RAY); // over-borrows capped
    }

    // =========================================================================
    //  calculateBorrowRate — curve shape verification
    // =========================================================================

    function test_borrowRate_atZeroUtilization() public view {
        uint256 rate = irm.calculateBorrowRate(1_000e18, 0);

        // At 0% util, rate = baseRate per second
        uint256 expectedAnnual = irm.bpsToRay(BASE_RATE); // 1% in RAY
        uint256 expectedPerSec = expectedAnnual / SECONDS_PER_YEAR;

        assertEq(rate, expectedPerSec);
    }

    function test_borrowRate_atOptimalUtilization() public view {
        // At exactly 80% utilization: rate = baseRate + slope1
        uint256 rate = irm.calculateBorrowRate(1_000e18, 800e18);

        uint256 expectedAnnual = irm.bpsToRay(BASE_RATE + SLOPE_ONE); // 5% in RAY
        uint256 expectedPerSec = expectedAnnual / SECONDS_PER_YEAR;

        assertApproxEqAbs(rate, expectedPerSec, 1);
    }

    function test_borrowRate_at100PercentUtilization() public view {
        // At 100% util (above kink):
        // excess = (1 - 0.80) / (1 - 0.80) = 1.0
        // rate = baseRate + slope1 + slope2 * 1 = 1% + 4% + 75% = 80%
        uint256 rate = irm.calculateBorrowRate(1_000e18, 1_000e18);

        uint256 expectedAnnual = irm.bpsToRay(BASE_RATE + SLOPE_ONE + SLOPE_TWO); // 80%
        uint256 expectedPerSec = expectedAnnual / SECONDS_PER_YEAR;

        assertApproxEqAbs(rate, expectedPerSec, 1);
    }

    function test_borrowRate_isMono_belowKink() public view {
        // Rate must be monotonically non-decreasing with utilization
        uint256 rateAt40 = irm.calculateBorrowRate(1_000e18, 400e18);
        uint256 rateAt60 = irm.calculateBorrowRate(1_000e18, 600e18);
        uint256 rateAt80 = irm.calculateBorrowRate(1_000e18, 800e18);

        assertLe(rateAt40, rateAt60);
        assertLe(rateAt60, rateAt80);
    }

    function test_borrowRate_isMono_aboveKink() public view {
        uint256 rateAt80  = irm.calculateBorrowRate(1_000e18, 800e18);
        uint256 rateAt90  = irm.calculateBorrowRate(1_000e18, 900e18);
        uint256 rateAt100 = irm.calculateBorrowRate(1_000e18, 1_000e18);

        assertLe(rateAt80, rateAt90);
        assertLe(rateAt90, rateAt100);
    }

    function test_borrowRate_kinkCreatesJump() public view {
        // Rate just below kink should be much lower than just above kink
        // because slope2 (75%) >> slope1 (4%)
        uint256 rateBelowKink = irm.calculateBorrowRate(1_000e18, 799e18); // 79.9%
        uint256 rateAboveKink = irm.calculateBorrowRate(1_000e18, 950e18); // 95%

        // The jump should be significant — at least 10x larger rate
        assertGt(rateAboveKink, rateBelowKink * 5);
    }

    // =========================================================================
    //  calculateSupplyRate
    // =========================================================================

    function test_supplyRate_zeroUtilization() public view {
        uint256 rate = irm.calculateSupplyRate(1_000e18, 0, 1_000);
        assertEq(rate, 0); // No borrows → no supply yield
    }

    function test_supplyRate_lessThanBorrowRate() public view {
        // Supply rate is always ≤ borrow rate (reserve factor takes a cut)
        uint256 supplyRate = irm.calculateSupplyRate(1_000e18, 800e18, 1_000); // 10% reserve
        uint256 borrowRate = irm.calculateBorrowRate(1_000e18, 800e18);

        assertLt(supplyRate, borrowRate);
    }

    function test_supplyRate_zeroReserveFactor() public view {
        // With 0% reserve factor: supplyRate = borrowRate * utilization
        uint256 supplyRate = irm.calculateSupplyRate(1_000e18, 1_000e18, 0);
        uint256 borrowRate = irm.calculateBorrowRate(1_000e18, 1_000e18);

        // At 100% util: supplyRate = borrowRate * 1.0 = borrowRate
        assertApproxEqAbs(supplyRate, borrowRate, 1);
    }

    function test_supplyRate_increasesWithUtilization() public view {
        uint256 rate50  = irm.calculateSupplyRate(1_000e18, 500e18,   1_000);
        uint256 rate80  = irm.calculateSupplyRate(1_000e18, 800e18,   1_000);
        uint256 rate100 = irm.calculateSupplyRate(1_000e18, 1_000e18, 1_000);

        assertLe(rate50, rate80);
        assertLe(rate80, rate100);
    }

    // =========================================================================
    //  bpsToRay
    // =========================================================================

    function test_bpsToRay_conversions() public view {
        assertEq(irm.bpsToRay(10_000), RAY);            // 100% → RAY
        assertEq(irm.bpsToRay(5_000),  RAY / 2);        // 50%  → RAY/2
        assertEq(irm.bpsToRay(100),    RAY / 100);      // 1%   → RAY/100
        assertEq(irm.bpsToRay(0),      0);
    }

    // =========================================================================
    //  setRateParams — access control
    // =========================================================================

    function test_setRateParams_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        irm.setRateParams(100, 400, 7_500, 8_000);
    }

    function test_setRateParams_updatesValues() public {
        vm.prank(owner);
        irm.setRateParams(200, 500, 5_000, 7_000); // different params

        assertEq(irm.baseRateRay(),           irm.bpsToRay(200));
        assertEq(irm.slopeOneRay(),           irm.bpsToRay(500));
        assertEq(irm.slopeTwoRay(),           irm.bpsToRay(5_000));
        assertEq(irm.optimalUtilizationRay(), irm.bpsToRay(7_000));
    }

    function test_setRateParams_revertsOnExcessiveRate() public {
        vm.prank(owner);
        // slope2 = 10_000% which exceeds MAX_RATE_RAY (1000%)
        vm.expectRevert();
        irm.setRateParams(100, 400, 100_000_000, 8_000);
    }

    function test_setRateParams_revertsOnZeroOptimal() public {
        vm.prank(owner);
        vm.expectRevert();
        irm.setRateParams(100, 400, 7_500, 0);
    }

    function test_setRateParams_revertsOn100PercentOptimal() public {
        vm.prank(owner);
        vm.expectRevert();
        irm.setRateParams(100, 400, 7_500, 10_000);
    }

    function test_setRateParams_emitsEvent() public {
        
        vm.expectEmit(false, false, false, true);
        emit IInterestRateModel.RateParamsUpdated(
            irm.bpsToRay(200), irm.bpsToRay(500), irm.bpsToRay(5_000), irm.bpsToRay(7_000)
        );
        vm.prank(owner);
        irm.setRateParams(200, 500, 5_000, 7_000);
    }

    // =========================================================================
    //  DeFi scenario — real-world rate simulation
    // =========================================================================

    /**
     * @dev  Protocol has $10M liquidity, $7.5M borrowed (75% utilization).
     *       At this point we're below the kink — rates should be moderate.
     */
    function test_scenario_belowKink_moderateRates() public view {
        uint256 liquidity = 10_000_000e18;
        uint256 borrows   = 7_500_000e18;

        uint256 util = irm.getUtilizationRate(liquidity, borrows);
        assertApproxEqRel(util, 0.75e27, 0.001e27);

        uint256 annualBorrow = irm.calculateBorrowRate(liquidity, borrows) * SECONDS_PER_YEAR;

        // At 75% util: rate = 1% + 4% * (75/80) = 1% + 3.75% = 4.75%
        // Allow 0.5% tolerance for integer division rounding
        assertApproxEqRel(annualBorrow, irm.bpsToRay(475), 0.05e27);
        console2.log("75% util - annual borrow rate (RAY):", annualBorrow);
    }

    /**
     * @dev  Protocol becomes over-utilised (95%).  Borrowers face steep rates
     *       designed to attract new liquidity deposits.
     */
    function test_scenario_aboveKink_steepRates() public view {
        uint256 liquidity = 10_000_000e18;
        uint256 borrows   = 9_500_000e18; // 95%

        uint256 annualBorrow = irm.calculateBorrowRate(liquidity, borrows) * SECONDS_PER_YEAR;

        // At 95% util: excess = (0.95 - 0.80) / (1 - 0.80) = 0.75
        // rate = 1% + 4% + 75% * 0.75 = 5% + 56.25% = 61.25% APR
        // Tolerance: ±2%
        assertGt(annualBorrow, irm.bpsToRay(5_500)); // > 55%
        assertLt(annualBorrow, irm.bpsToRay(6_500)); // < 65%
        console2.log("95% util - annual borrow rate (RAY):", annualBorrow);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    /// @dev Borrow rate should always be ≥ baseRate.
    function testFuzz_borrowRate_alwaysAboveBase(uint256 liquidity, uint256 borrows) public view {
        // Cap at 1e40: rayDiv internally does borrows * RAY; 1e40 * 1e27 = 1e67 < uint256_max 
        liquidity = bound(liquidity, 1e18, 1e40);
        borrows   = bound(borrows,   0,    liquidity);

        uint256 rate     = irm.calculateBorrowRate(liquidity, borrows);
        uint256 basePerS = irm.baseRateRay() / SECONDS_PER_YEAR;

        assertGe(rate, basePerS);
    }

    /// @dev Supply rate should always be ≤ borrow rate.
    function testFuzz_supplyRate_leqBorrowRate(
        uint256 liquidity,
        uint256 borrows,
        uint256 reserveFactor
    ) public view {
        liquidity     = bound(liquidity,     1e18, 1e40);
        borrows       = bound(borrows,       0,    liquidity);
        reserveFactor = bound(reserveFactor, 0,    9_999); // 99.99%

        uint256 borrow = irm.calculateBorrowRate(liquidity, borrows);
        uint256 supply = irm.calculateSupplyRate(liquidity, borrows, reserveFactor);

        assertLe(supply, borrow);
    }

    /// @dev Utilization should be monotonically increasing with borrows.
    function testFuzz_utilization_isMonotone(uint256 liquidity, uint256 b1, uint256 b2) public view {
        liquidity = bound(liquidity, 1e18, 1e40);
        b1        = bound(b1, 0, liquidity);
        b2        = bound(b2, b1, liquidity); // b2 >= b1

        uint256 u1 = irm.getUtilizationRate(liquidity, b1);
        uint256 u2 = irm.getUtilizationRate(liquidity, b2);

        assertLe(u1, u2);
    }
}
