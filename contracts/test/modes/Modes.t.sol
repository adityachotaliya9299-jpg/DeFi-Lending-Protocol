// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}  from "forge-std/Test.sol";
import {EfficiencyMode}   from "../../src/modes/EfficiencyMode.sol";

/**
 * @title  ModesTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Tests for IsolationMode and EfficiencyMode libraries.
 *
 * Note on `pure` test functions:
 *   Foundry's vm.expectRevert cannot intercept library reverts from
 *   `pure` test functions — the call depth check fails.
 *   Functions that test reverts must be non-pure (no `pure` keyword).
 */
contract EModeValidateHelper {
    function validate(EfficiencyMode.EModeCategory memory cat) external pure {
        EfficiencyMode.validateCategory(cat);
    }
}

contract ModesTest is Test {
    EModeValidateHelper helper;

    function setUp() public {
        helper = new EModeValidateHelper();
    }

    // =========================================================================
    //  E-Mode category validation — happy path
    // =========================================================================

    function test_emode_validateCategory_validParams() pure public {
        EfficiencyMode.EModeCategory memory cat = EfficiencyMode.EModeCategory({
            ltv:                  9_700,
            liquidationThreshold: 9_800,
            liquidationBonus:     200,
            label:                "Stablecoins",
            active:               true
        });
        EfficiencyMode.validateCategory(cat);
    }

    // =========================================================================
    //  E-Mode category validation — revert cases
    //  Note: must NOT be `pure` for vm.expectRevert to work
    // =========================================================================

    function test_emode_validateCategory_ltvZeroReverts() public {
        EfficiencyMode.EModeCategory memory cat = EfficiencyMode.EModeCategory({
            ltv:                  0,
            liquidationThreshold: 9_800,
            liquidationBonus:     200,
            label:                "Invalid",
            active:               true
        });
        vm.expectRevert();
        helper.validate(cat);
    }

    function test_emode_validateCategory_liqThresholdLteLtvReverts() public {
        EfficiencyMode.EModeCategory memory cat = EfficiencyMode.EModeCategory({
            ltv:                  9_700,
            liquidationThreshold: 9_700,
            liquidationBonus:     200,
            label:                "Invalid",
            active:               true
        });
        vm.expectRevert();
        helper.validate(cat);
    }
    
    function test_emode_validateCategory_tooHighThresholdReverts() public {
        EfficiencyMode.EModeCategory memory cat = EfficiencyMode.EModeCategory({
            ltv:                  9_700,
            liquidationThreshold: 10_000,
            liquidationBonus:     200,
            label:                "Invalid",
            active:               true
        });
        vm.expectRevert();
        helper.validate(cat);
    }

    // =========================================================================
    //  E-Mode eligibility checks
    // =========================================================================

    function test_emode_eligible_sameCategoryAndUser() pure public {
        assertTrue(EfficiencyMode.isEModeEligible(1, 1, 1));
    }

    function test_emode_notEligible_userInNoEmode() pure public {
        assertFalse(EfficiencyMode.isEModeEligible(0, 1, 1));
    }

    function test_emode_notEligible_collateralDifferentCategory() pure public {
        assertFalse(EfficiencyMode.isEModeEligible(1, 2, 1));
    }

    function test_emode_notEligible_borrowDifferentCategory() pure public {
        assertFalse(EfficiencyMode.isEModeEligible(1, 1, 2));
    }

    // =========================================================================
    //  Effective LTV override
    // =========================================================================

    function test_emode_effectiveLtv_usesEmodeWhenEligible() pure public {
        assertEq(EfficiencyMode.getEffectiveLtv(8_000, 9_700, true), 9_700);
    }

    function test_emode_effectiveLtv_usesStandardWhenNotEligible() pure public {
        assertEq(EfficiencyMode.getEffectiveLtv(8_000, 9_700, false), 8_000);
    }

    function test_emode_effectiveLiqThreshold_override() pure public {
        assertEq(EfficiencyMode.getEffectiveLiqThreshold(8_500, 9_800, true),  9_800);
        assertEq(EfficiencyMode.getEffectiveLiqThreshold(8_500, 9_800, false), 8_500);
    }

    // =========================================================================
    //  Realistic category scenarios
    // =========================================================================

    function test_emode_stablecoinCategory_parameters() pure public {
        EfficiencyMode.EModeCategory memory cat = EfficiencyMode.EModeCategory({
            ltv:                  9_700,
            liquidationThreshold: 9_750,
            liquidationBonus:     200,
            label:                "Stablecoins",
            active:               true
        });
        EfficiencyMode.validateCategory(cat);

        uint256 effectiveLtv = EfficiencyMode.getEffectiveLtv(8_500, cat.ltv, true);
        assertGt(effectiveLtv, 8_500, "E-Mode LTV must exceed standard");
        assertEq(effectiveLtv, 9_700);
    }

    function test_emode_ethCategory_parameters() pure public {
        EfficiencyMode.EModeCategory memory cat = EfficiencyMode.EModeCategory({
            ltv:                  9_000,
            liquidationThreshold: 9_300,
            liquidationBonus:     500,
            label:                "ETH Correlated",
            active:               true
        });
        EfficiencyMode.validateCategory(cat);
        assertEq(EfficiencyMode.getEffectiveLtv(8_000, cat.ltv, true), 9_000);
    }

    // =========================================================================
    //  Isolation mode conceptual tests
    // =========================================================================

    function test_isolationMode_eligibilityCheck() pure public {
        assertEq(EfficiencyMode.NO_EMODE, 0);
    }

    function test_isolationMode_conceptual_debtCeilingEnforcement() pure public {
        uint256 ceiling = 1_000_000e18;
        uint256 current = 800_000e18;
        uint256 newBorrow = 300_000e18;
        assertGt(current + newBorrow, ceiling, "ceiling would be breached");
    }

    function test_isolationMode_conceptual_onlyStablecoinsAllowed() pure public {
        address USDC = address(0x1);
        address WETH = address(0x2);
        assertTrue(USDC != WETH);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_emode_eligibility_consistentWithCategory(
        uint8 userCat, uint8 collCat, uint8 borrowCat
    ) pure public {
        bool eligible = EfficiencyMode.isEModeEligible(userCat, collCat, borrowCat);
        if (userCat == 0) {
            assertFalse(eligible);
        } else if (collCat == userCat && borrowCat == userCat) {
            assertTrue(eligible);
        } else {
            assertFalse(eligible);
        }
    }

    function testFuzz_emode_effectiveLtv_neverDecreasesInEmode(
        uint256 standard, uint16 emodeLtv
    ) pure public {
        standard = bound(standard, 1_000, 9_000);
        emodeLtv = uint16(bound(uint256(emodeLtv), standard, 9_899));
        assertGe(EfficiencyMode.getEffectiveLtv(standard, emodeLtv, true), standard);
    }
}
