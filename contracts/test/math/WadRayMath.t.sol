// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {WadRayMath} from "../../src/math/WadRayMath.sol";

contract WadRayMathHarness {
    function wadMul(uint256 a, uint256 b) external pure returns (uint256) { return WadRayMath.wadMul(a, b); }
    function wadDiv(uint256 a, uint256 b) external pure returns (uint256) { return WadRayMath.wadDiv(a, b); }
    function rayMul(uint256 a, uint256 b) external pure returns (uint256) { return WadRayMath.rayMul(a, b); }
    function rayDiv(uint256 a, uint256 b) external pure returns (uint256) { return WadRayMath.rayDiv(a, b); }
    function wadToRay(uint256 a)          external pure returns (uint256) { return WadRayMath.wadToRay(a); }
}

contract WadRayMathTest is Test {
    using WadRayMath for uint256;

    WadRayMathHarness internal h;

    uint256 constant WAD           = 1e18;
    uint256 constant HALF_WAD      = 0.5e18;
    uint256 constant RAY           = 1e27;
    uint256 constant WAD_RAY_RATIO = 1e9;

    function setUp() public { h = new WadRayMathHarness(); }

    // =========================================================================
    //  wadMul
    // =========================================================================

    function test_wadMul_basic() public pure {
        assertEq(WadRayMath.wadMul(1.5e18, 2e18), 3e18);
    }

    function test_wadMul_identity() public pure {
        uint256 a = 42.7e18;
        assertEq(WadRayMath.wadMul(a, WAD), a);
        assertEq(WadRayMath.wadMul(WAD, a), a);
    }

    function test_wadMul_zero() public pure {
        assertEq(WadRayMath.wadMul(0, 1e18), 0);
        assertEq(WadRayMath.wadMul(1e18, 0), 0);
    }

    function test_wadMul_roundsHalfUp() public pure {
        assertEq(WadRayMath.wadMul(1, HALF_WAD),     1);
        assertEq(WadRayMath.wadMul(1, HALF_WAD - 1), 0);
    }

    function test_wadMul_revertsOnOverflow() public {
        (bool ok,) = address(h).call(abi.encodeCall(WadRayMathHarness.wadMul, (type(uint256).max, 2e18)));
        assertFalse(ok, "should revert");
    }

    function testFuzz_wadMul_identity(uint256 a) public pure {
        a = bound(a, 0, type(uint256).max / WAD);
        assertEq(WadRayMath.wadMul(a, WAD), a);
    }

    function testFuzz_wadMul_commutative(uint256 a, uint256 b) public pure {
        a = bound(a, 0, 1e36);
        b = bound(b, 0, 1e36);
        assertEq(WadRayMath.wadMul(a, b), WadRayMath.wadMul(b, a));
    }

    // =========================================================================
    //  wadDiv
    // =========================================================================

    function test_wadDiv_basic() public pure {
        assertEq(WadRayMath.wadDiv(WAD,     2 * WAD), 0.5e18);
        assertEq(WadRayMath.wadDiv(3 * WAD, 2 * WAD), 1.5e18);
    }

    function test_wadDiv_identity() public pure {
        assertEq(WadRayMath.wadDiv(99.9e18, WAD), 99.9e18);
    }

    function test_wadDiv_revertsOnZero() public {
        (bool ok,) = address(h).call(abi.encodeCall(WadRayMathHarness.wadDiv, (1e18, 0)));
        assertFalse(ok, "should revert on zero");
    }

    function test_wadDiv_roundsHalfUp() public pure {
        assertEq(WadRayMath.wadDiv(1, WAD),       1);
        assertEq(WadRayMath.wadDiv(1, 3),         333_333_333_333_333_333);
        assertEq(WadRayMath.wadDiv(1, 2e18),      1);
        assertEq(WadRayMath.wadDiv(1, 2e18 + 1),  0);
    }

    // b >= WAD guarantees max rounding error = HALF_WAD/b <= 0.5 < 1
    function testFuzz_wadDiv_inverseOfWadMul(uint256 a, uint256 b) public {
        a = bound(a, 1,   1e36);
        b = bound(b, WAD, 1e36);
        uint256 product = WadRayMath.wadMul(a, b);
        vm.assume(product > 0);
        uint256 recovered = WadRayMath.wadDiv(product, b);
        assertLe(WadRayMath.wadAbs(recovered, a), 1);
    }

    // =========================================================================
    //  rayMul
    // =========================================================================

    function test_rayMul_basic() public pure {
        assertEq(WadRayMath.rayMul(1.05e27, RAY), 1.05e27);
        assertEq(WadRayMath.rayMul(RAY,     RAY), RAY);
    }

    function test_rayMul_zero() public pure {
        assertEq(WadRayMath.rayMul(0, RAY), 0);
        assertEq(WadRayMath.rayMul(RAY, 0), 0);
    }

    function test_rayMul_compounds() public pure {
        assertApproxEqAbs(WadRayMath.rayMul(1.01e27, 1.01e27), 1.0201e27, 1);
    }

    function test_rayMul_revertsOnOverflow() public {
        (bool ok,) = address(h).call(abi.encodeCall(WadRayMathHarness.rayMul, (type(uint256).max, 2)));
        assertFalse(ok, "should revert");
    }

    function testFuzz_rayMul_identity(uint256 a) public pure {
        a = bound(a, 0, type(uint256).max / RAY);
        assertEq(WadRayMath.rayMul(a, RAY), a);
    }

    // =========================================================================
    //  rayDiv
    // =========================================================================

    function test_rayDiv_basic() public pure {
        assertEq(WadRayMath.rayDiv(RAY,     4 * RAY), 0.25e27);
        assertEq(WadRayMath.rayDiv(3 * RAY, 2 * RAY), 1.5e27);
    }

    function test_rayDiv_identity() public pure {
        assertEq(WadRayMath.rayDiv(2.5e27, RAY), 2.5e27);
    }

    function test_rayDiv_revertsOnZero() public {
        (bool ok,) = address(h).call(abi.encodeCall(WadRayMathHarness.rayDiv, (RAY, 0)));
        assertFalse(ok, "should revert on zero");
    }

    // b >= RAY guarantees max rounding error = HALF_RAY/b <= 0.5 < 1
    function testFuzz_rayDiv_inverseOfRayMul(uint256 a, uint256 b) public {
        a = bound(a, 1,   1e45);
        b = bound(b, RAY, 1e45);
        // Skip if a*b would overflow rayMul's guard (a*b must fit in uint256)
        // 5e26 = HALF_RAY — can't reference internal constant directly
        vm.assume(a <= (type(uint256).max - 5e26) / b);
        uint256 product = WadRayMath.rayMul(a, b);
        vm.assume(product > 0);
        uint256 recovered = WadRayMath.rayDiv(product, b);
        assertLe(WadRayMath.wadAbs(recovered, a), 1);
    }

    // =========================================================================
    //  Conversions
    // =========================================================================

    function test_rayToWad_exact() public pure {
        assertEq(WadRayMath.rayToWad(RAY),    WAD);
        assertEq(WadRayMath.rayToWad(2.5e27), 2.5e18);
    }

    function test_rayToWad_roundsHalfUp() public pure {
        assertEq(WadRayMath.rayToWad(RAY + 5e8), WAD + 1);
        assertEq(WadRayMath.rayToWad(RAY + 4e8), WAD);
    }

    function test_wadToRay_exact() public pure {
        assertEq(WadRayMath.wadToRay(WAD),    RAY);
        assertEq(WadRayMath.wadToRay(2.5e18), 2.5e27);
        assertEq(WadRayMath.wadToRay(0),      0);
    }

    function test_wadToRay_revertsOnOverflow() public {
        (bool ok,) = address(h).call(abi.encodeCall(WadRayMathHarness.wadToRay, (type(uint256).max)));
        assertFalse(ok, "should revert");
    }

    function testFuzz_conversionRoundtrip(uint256 a) public pure {
        a = bound(a, 0, type(uint256).max / WAD_RAY_RATIO);
        assertEq(WadRayMath.rayToWad(WadRayMath.wadToRay(a)), a);
    }

    // =========================================================================
    //  Utilities
    // =========================================================================

    function test_min() public pure {
        assertEq(WadRayMath.min(3, 7), 3);
        assertEq(WadRayMath.min(7, 3), 3);
        assertEq(WadRayMath.min(5, 5), 5);
    }

    function test_max() public pure {
        assertEq(WadRayMath.max(3, 7), 7);
        assertEq(WadRayMath.max(7, 3), 7);
        assertEq(WadRayMath.max(5, 5), 5);
    }

    function testFuzz_minMaxInvariant(uint256 a, uint256 b) public pure {
        assertLe(WadRayMath.min(a, b), WadRayMath.max(a, b));
        if (a <= type(uint256).max - b) {
            assertEq(WadRayMath.min(a, b) + WadRayMath.max(a, b), a + b);
        }
    }

    // =========================================================================
    //  DeFi scenario
    // =========================================================================

    function test_compoundInterest_yearlySimulation() public pure {
        uint256 dailyRate = RAY + (RAY / 10 / 365);
        uint256 index     = RAY;
        for (uint256 i = 0; i < 365; i++) {
            index = WadRayMath.rayMul(index, dailyRate);
        }
        assertGt(index, 1.09e27);
        assertLt(index, 1.11e27);
        console2.log("Year-end index (RAY):", index);
    }
}
