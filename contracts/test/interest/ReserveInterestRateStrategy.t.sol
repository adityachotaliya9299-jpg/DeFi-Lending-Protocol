// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {
    ReserveInterestRateStrategy
} from "../../src/interest/ReserveInterestRateStrategy.sol";
import {WadRayMath} from "../../src/math/WadRayMath.sol";

/**
 * @title ReserveInterestRateStrategyTest
 * @author Aditya Chotaliya [https://adityachotaliya.xyz/]
 * @notice 8 tests for Aave-compatible per-reserve interest rate strategy
 */
contract ReserveInterestRateStrategyTest is Test {
    using WadRayMath for uint256;

    ReserveInterestRateStrategy internal strategy;

    address internal admin = makeAddr("admin");

    uint256 constant RAY = 1e27;

    // Typical params: 80% optimal, 0% base, 4% slope1, 75% slope2
    uint256 constant OPTIMAL = 0.8e27; // 80%
    uint256 constant BASE = 0;
    uint256 constant SLOPE1_VAR = 1268391679; // 4% APR in per-second RAY (0.04e27 / 31536000)
    uint256 constant SLOPE2_VAR = 23782343750; // 75% APR in per-second RAY
    uint256 constant SLOPE1_STB = 158548959; // 0.5% APR in per-second RAY
    uint256 constant SLOPE2_STB = 19025875000; // 60% APR in per-second RAY
    uint256 constant RESERVE_FACTOR = 1_000; // 10% BPS

    function setUp() public {
        strategy = new ReserveInterestRateStrategy(
            admin,
            OPTIMAL,
            BASE,
            SLOPE1_VAR,
            SLOPE2_VAR,
            SLOPE1_STB,
            SLOPE2_STB
        );
    }

    // =========================================================================
    //  Deployment
    // =========================================================================

    function test_deployment_paramsStored() public view {
        assertEq(strategy.optimalUtilizationRate(), OPTIMAL);
        assertEq(strategy.baseVariableBorrowRate(), BASE);
        assertEq(strategy.variableRateSlope1(), SLOPE1_VAR);
        assertEq(strategy.variableRateSlope2(), SLOPE2_VAR);
    }

    function test_deployment_zeroOptimalReverts() public {
        vm.expectRevert(
            ReserveInterestRateStrategy
                .Strategy__OptimalUtilizationZero
                .selector
        );
        new ReserveInterestRateStrategy(
            admin,
            0,
            BASE,
            SLOPE1_VAR,
            SLOPE2_VAR,
            SLOPE1_STB,
            SLOPE2_STB
        );
    }

    // =========================================================================
    //  calculateInterestRates — rate logic
    // =========================================================================

    function test_rates_zeroUtilization() public view {
        (uint256 liqRate, uint256 stableRate, uint256 varRate) = strategy
            .calculateInterestRates(100_000e6, 0, 0, 0, RESERVE_FACTOR);

        assertEq(varRate, BASE, "variable rate = base at 0% util");
        assertEq(liqRate, 0, "liquidity rate = 0 at 0% util");
        console2.log("Variable rate at 0% util:", varRate);
        console2.log("Stable rate at 0% util:", stableRate);
    }

    function test_rates_belowOptimal_linearSlope() public view {
        // 50% utilization (below 80% optimal)
        uint256 avail = 50_000e18;
        uint256 borr = 50_000e18;

        (uint256 liqRate, , uint256 varRate) = strategy.calculateInterestRates(
            avail,
            0,
            borr,
            0,
            RESERVE_FACTOR
        );

        assertGt(varRate, BASE, "rate should be above base");
        assertGt(liqRate, 0, "supply rate should be positive");
    }

    function test_rates_aboveOptimal_steepSlope() public view {
        // 95% utilization (above 80% optimal)
        uint256 avail = 5_000e6;
        uint256 borr = 95_000e6;

        (, , uint256 varRate95) = strategy.calculateInterestRates(
            avail,
            0,
            borr,
            0,
            RESERVE_FACTOR
        );

        // 50% utilization for comparison
        (, , uint256 varRate50) = strategy.calculateInterestRates(
            50_000e6,
            0,
            50_000e6,
            0,
            RESERVE_FACTOR
        );

        assertGt(varRate95, varRate50, "rate at 95% > rate at 50%");
        console2.log("Variable rate at 95% util:", varRate95);
        console2.log("Variable rate at 50% util:", varRate50);
    }

    function test_rates_stableAlwaysAboveVariable() public view {
        // At high utilization (90%), slope2 kicks in — stable gets bigger buffer
        uint256 avail = 10_000e18;
        uint256 borr = 90_000e18;

        (, uint256 stableRate, uint256 varRate) = strategy
            .calculateInterestRates(avail, 0, borr, 0, RESERVE_FACTOR);

        // Stable rate = variable rate + 10% buffer always
        assertGe(
            stableRate,
            varRate / 10,
            "stable must include variable buffer"
        );
        console2.log("Variable rate:", varRate);
        console2.log("Stable rate:", stableRate);
    }

    function test_rates_liquidityRateLteVariableRate() public view {
        uint256 avail = 20_000e6;
        uint256 borr = 80_000e6;

        (uint256 liqRate, , uint256 varRate) = strategy.calculateInterestRates(
            avail,
            0,
            borr,
            0,
            RESERVE_FACTOR
        );

        // Net supply rate always < gross borrow rate (due to reserve factor)
        assertLt(
            liqRate,
            varRate,
            "supply rate < borrow rate due to reserve factor"
        );
    }

    // =========================================================================
    //  updateStrategy
    // =========================================================================

    function test_updateStrategy_onlyAdmin() public {
        vm.prank(makeAddr("random"));
        vm.expectRevert();
        strategy.updateStrategy(
            OPTIMAL,
            BASE,
            SLOPE1_VAR,
            SLOPE2_VAR,
            SLOPE1_STB,
            SLOPE2_STB
        );
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_rates_variableRateMonotonicInUtilization(
        uint256 avail1,
        uint256 borr1,
        uint256 avail2,
        uint256 borr2
    ) public view {
        avail1 = bound(avail1, 1e6, 1_000_000e6);
        borr1 = bound(borr1, 0, avail1);
        avail2 = bound(avail2, 1e6, 1_000_000e6);
        borr2 = bound(borr2, 0, avail2);

        uint256 total1 = avail1 + borr1;
        uint256 total2 = avail2 + borr2;

        uint256 util1 = total1 == 0 ? 0 : borr1.rayDiv(total1);
        uint256 util2 = total2 == 0 ? 0 : borr2.rayDiv(total2);

        (, , uint256 rate1) = strategy.calculateInterestRates(
            avail1,
            0,
            borr1,
            0,
            RESERVE_FACTOR
        );
        (, , uint256 rate2) = strategy.calculateInterestRates(
            avail2,
            0,
            borr2,
            0,
            RESERVE_FACTOR
        );

        if (util1 < util2) {
            assertLe(rate1, rate2, "higher util = higher rate");
        } else if (util1 > util2) {
            assertGe(rate1, rate2, "lower util = lower rate");
        }
    }
}
