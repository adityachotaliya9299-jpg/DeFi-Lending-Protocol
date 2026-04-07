// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {PercentageMath} from "../../src/math/PercentageMath.sol";

contract PercentageMathHarness {
    function percentMul(uint256 v, uint256 bps) external pure returns (uint256) { return PercentageMath.percentMul(v, bps); }
    function percentDiv(uint256 v, uint256 bps) external pure returns (uint256) { return PercentageMath.percentDiv(v, bps); }
    function validatePercentage(uint256 bps)    external pure                   { PercentageMath.validatePercentage(bps); }
}

contract PercentageMathTest is Test {
    PercentageMathHarness internal h;

    uint256 constant PERCENTAGE_FACTOR      = 10_000;
    uint256 constant HALF_PERCENTAGE_FACTOR = 5_000;
    uint256 constant WAD                    = 1e18;

    function setUp() public { h = new PercentageMathHarness(); }

    // =========================================================================
    //  percentMul
    // =========================================================================

    function test_percentMul_75pct()           public pure { assertEq(PercentageMath.percentMul(10_000e18, 7_500), 7_500e18); }
    function test_percentMul_100pct()          public pure { assertEq(PercentageMath.percentMul(42e18, 10_000),    42e18); }
    function test_percentMul_0pct()            public pure { assertEq(PercentageMath.percentMul(99e18, 0),         0); }
    function test_percentMul_zeroValue()       public pure { assertEq(PercentageMath.percentMul(0, 7_500),         0); }
    function test_percentMul_50pct()           public pure { assertEq(PercentageMath.percentMul(1_000e18, 5_000),  500e18); }
    function test_percentMul_1bps()            public pure { assertEq(PercentageMath.percentMul(10_000, 1),        1); }
    function test_percentMul_liquidationBonus() public pure { assertEq(PercentageMath.percentMul(5_000e18, 800),   400e18); }

    function test_percentMul_roundsHalfUp() public pure {
        assertEq(PercentageMath.percentMul(1, 5_000), 1); // exactly half → up
        assertEq(PercentageMath.percentMul(1, 4_999), 0); // just below   → down
    }

    function test_percentMul_revertsOnOverflow() public {
        (bool ok,) = address(h).call(abi.encodeCall(PercentageMathHarness.percentMul, (type(uint256).max, 10_000)));
        assertFalse(ok, "should revert");
    }

    // =========================================================================
    //  percentDiv
    // =========================================================================

    function test_percentDiv_75pct()  public pure { assertEq(PercentageMath.percentDiv(7_500e18, 7_500), 10_000e18); }
    function test_percentDiv_100pct() public pure { assertEq(PercentageMath.percentDiv(42e18, 10_000),   42e18); }

    function test_percentDiv_revertsOnZero() public {
        (bool ok,) = address(h).call(abi.encodeCall(PercentageMathHarness.percentDiv, (1e18, 0)));
        assertFalse(ok, "should revert on zero");
    }

    function test_percentDiv_revertsOnOverflow() public {
        (bool ok,) = address(h).call(abi.encodeCall(PercentageMathHarness.percentDiv, (type(uint256).max, 1)));
        assertFalse(ok, "should revert on overflow");
    }

    // bps >= 5000 guarantees max rounding error = HALF_PCTF/bps <= 1
    function testFuzz_percentDiv_inverseOfMul(uint256 value, uint256 bps) public {
        value = bound(value, 1,     1e30);
        bps   = bound(bps,   5_000, PERCENTAGE_FACTOR);   // >= 50% is the key bound
        uint256 scaled = PercentageMath.percentMul(value, bps);
        vm.assume(scaled > 0);
        uint256 recovered = PercentageMath.percentDiv(scaled, bps);
        uint256 diff = recovered > value ? recovered - value : value - recovered;
        assertLe(diff, 1);
    }

    // =========================================================================
    //  Validation helpers
    // =========================================================================

    function test_validatePercentage_valid() public pure {
        PercentageMath.validatePercentage(0);
        PercentageMath.validatePercentage(5_000);
        PercentageMath.validatePercentage(10_000);
    }

    function test_validatePercentage_revertsAbove100() public {
        (bool ok,) = address(h).call(abi.encodeCall(PercentageMathHarness.validatePercentage, (10_001)));
        assertFalse(ok, "should revert above 100%");
    }

    function test_isValidPercentage() public pure {
        assertTrue(PercentageMath.isValidPercentage(0));
        assertTrue(PercentageMath.isValidPercentage(10_000));
        assertFalse(PercentageMath.isValidPercentage(10_001));
        assertFalse(PercentageMath.isValidPercentage(type(uint256).max));
    }

    // =========================================================================
    //  Health factor
    // =========================================================================

    function test_healthFactor_safe() public pure {
        uint256 hf = PercentageMath.calculateHealthFactor(10_000e18, 8_500, 6_000e18);
        assertGt(hf, 1e18);
        assertApproxEqRel(hf, 1.4167e18, 0.001e18);
    }

    function test_healthFactor_atBoundary() public pure {
        assertEq(PercentageMath.calculateHealthFactor(10_000e18, 8_000, 8_000e18), 1e18);
    }

    function test_healthFactor_liquidatable() public pure {
        uint256 hf = PercentageMath.calculateHealthFactor(10_000e18, 8_000, 9_000e18);
        assertLt(hf, 1e18);
        assertFalse(PercentageMath.isHealthy(hf));
    }

    function test_healthFactor_noDebt() public pure {
        assertEq(PercentageMath.calculateHealthFactor(10_000e18, 8_500, 0), type(uint256).max);
        assertTrue(PercentageMath.isHealthy(type(uint256).max));
    }

    function test_isHealthy() public pure {
        assertTrue(PercentageMath.isHealthy(1.01e18));
        assertTrue(PercentageMath.isHealthy(1e18));
        assertFalse(PercentageMath.isHealthy(0.99e18));
        assertFalse(PercentageMath.isHealthy(0));
    }

    // =========================================================================
    //  Conversions
    // =========================================================================

    function test_wadToBps() public pure {
        assertEq(PercentageMath.wadToBps(0.75e18), 7_500);
        assertEq(PercentageMath.wadToBps(1e18),    10_000);
        assertEq(PercentageMath.wadToBps(0),       0);
    }

    function test_bpsToWad() public pure {
        assertEq(PercentageMath.bpsToWad(7_500),  0.75e18);
        assertEq(PercentageMath.bpsToWad(10_000), 1e18);
        assertEq(PercentageMath.bpsToWad(0),      0);
    }

    function testFuzz_bpsWadRoundtrip(uint256 bps) public pure {
        bps = bound(bps, 0, PERCENTAGE_FACTOR);
        assertEq(PercentageMath.wadToBps(PercentageMath.bpsToWad(bps)), bps);
    }

    // =========================================================================
    //  DeFi scenarios
    // =========================================================================

    function test_scenario_depositAndBorrow() public pure {
        uint256 collateral    = 10_000e18;
        uint256 ltv           = 8_000;
        uint256 liqThreshold  = 8_500;

        uint256 maxBorrow = PercentageMath.percentMul(collateral, ltv);
        assertEq(maxBorrow, 8_000e18);

        uint256 borrowed = 7_000e18;
        uint256 hf       = PercentageMath.calculateHealthFactor(collateral, liqThreshold, borrowed);
        assertTrue(PercentageMath.isHealthy(hf));
        console2.log("Initial HF (WAD):", hf);

        // ETH drops 20%
        uint256 newCollateral = PercentageMath.percentMul(collateral, 8_000);
        uint256 newHf         = PercentageMath.calculateHealthFactor(newCollateral, liqThreshold, borrowed);
        assertFalse(PercentageMath.isHealthy(newHf));
        console2.log("Post-crash HF (WAD):", newHf);
    }

    function test_scenario_liquidationBonus() public pure {
        uint256 debtToRepay = 5_000e18;
        uint256 collateralToSeize = PercentageMath.percentMul(debtToRepay, PERCENTAGE_FACTOR + 800);
        assertEq(collateralToSeize, 5_400e18);
        console2.log("Liquidator profit (WAD):", collateralToSeize - debtToRepay);
    }

    function test_scenario_protocolFee() public pure {
        uint256 interest    = 1_000e18;
        uint256 fee         = PercentageMath.percentMul(interest, 90);
        uint256 lenderShare = interest - fee;
        assertEq(fee, 9e18);
        assertEq(lenderShare, 991e18);
    }
}
