// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CollateralManager} from "../../src/core/CollateralManager.sol";
import {ICollateralManager} from "../../src/interfaces/ICollateralManager.sol";
import {MockERC20}           from "../../src/mocks/MockERC20.sol";

/**
 * @title  SupplyBorrowCapsTest
 * @notice Tests for the Phase 1 supply cap and borrow cap features.
 *
 * Test coverage:
 *   - Supply cap: 0 means unlimited
 *   - Supply cap: rejects deposit that would exceed cap
 *   - Supply cap: allows deposit exactly at cap
 *   - Borrow cap: 0 means unlimited
 *   - Borrow cap: rejects borrow that would exceed cap
 *   - Borrow cap: allows borrow exactly at cap
 *   - setSupplyCap emits SupplyCapUpdated event
 *   - setBorrowCap emits BorrowCapUpdated event
 *   - Only CONFIGURATOR_ROLE can update caps
 *   - Fuzz: any amount within cap always passes
 */
contract SupplyBorrowCapsTest is Test {
    CollateralManager public cm;
    address public admin    = makeAddr("admin");
    address public attacker = makeAddr("attacker");
    address public WETH     = makeAddr("weth");
    address public USDC     = makeAddr("usdc");

    ICollateralManager.AssetConfig baseConfig = ICollateralManager.AssetConfig({
        ltv:                  8_000,
        liquidationThreshold: 8_500,
        liquidationBonus:       800,
        reserveFactor:        1_000,
        supplyCap:                0, // unlimited by default
        borrowCap:                0, // unlimited by default
        isActive:              true,
        isBorrowEnabled:       true
    });

    function setUp() public {
        vm.prank(admin);
        cm = new CollateralManager(admin);

        vm.startPrank(admin);
        cm.setAssetConfig(WETH, baseConfig);
        cm.setAssetConfig(USDC, baseConfig);
        vm.stopPrank();
    }

    // ── Supply cap tests ──────────────────────────────────────────────────────

    function test_supplyCap_zeroMeansUnlimited() public view {
        // Should not revert — 0 = unlimited
        cm.checkSupplyCap(WETH, 0, type(uint256).max);
    }

    function test_supplyCap_allowsDepositBelowCap() public {
        vm.prank(admin);
        cm.setSupplyCap(WETH, 1_000e18); // 1,000 WETH cap

        // 400 existing + 500 new = 900 — below cap, should pass
        cm.checkSupplyCap(WETH, 400e18, 500e18);
    }

    function test_supplyCap_allowsDepositExactlyAtCap() public {
        vm.prank(admin);
        cm.setSupplyCap(WETH, 1_000e18);

        // 400 existing + 600 new = exactly 1000 — should pass
        cm.checkSupplyCap(WETH, 400e18, 600e18);
    }

    function test_supplyCap_rejectsDepositExceedingCap() public {
        vm.prank(admin);
        cm.setSupplyCap(WETH, 1_000e18);

        // 400 existing + 601 new = 1001 — exceeds cap, must revert
        vm.expectRevert(
            abi.encodeWithSelector(
                ICollateralManager.CollateralManager__SupplyCapExceeded.selector,
                WETH, 1_000e18, 1_001e18
            )
        );
        cm.checkSupplyCap(WETH, 400e18, 601e18);
    }

    function test_supplyCap_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ICollateralManager.SupplyCapUpdated(WETH, 0, 5_000e18);

        vm.prank(admin);
        cm.setSupplyCap(WETH, 5_000e18);
    }

    function test_supplyCap_onlyConfigurator() public {
        vm.prank(attacker);
        vm.expectRevert();
        cm.setSupplyCap(WETH, 100e18);
    }

    function test_supplyCap_getterReturnsCorrectValue() public {
        vm.prank(admin);
        cm.setSupplyCap(WETH, 9_999e18);
        assertEq(cm.getSupplyCap(WETH), 9_999e18);
    }

    function test_supplyCap_canBeReset_toUnlimited() public {
        vm.startPrank(admin);
        cm.setSupplyCap(WETH, 1_000e18);
        cm.setSupplyCap(WETH, 0); // reset to unlimited
        vm.stopPrank();

        // Should not revert with very large amount
        cm.checkSupplyCap(WETH, 0, type(uint256).max);
    }

    // ── Borrow cap tests ──────────────────────────────────────────────────────

    function test_borrowCap_zeroMeansUnlimited() public view {
        cm.checkBorrowCap(USDC, 0, type(uint256).max);
    }

    function test_borrowCap_allowsBorrowBelowCap() public {
        vm.prank(admin);
        cm.setBorrowCap(USDC, 8_000_000e6); // 8M USDC cap

        cm.checkBorrowCap(USDC, 3_000_000e6, 4_000_000e6);
    }

    function test_borrowCap_allowsBorrowExactlyAtCap() public {
        vm.prank(admin);
        cm.setBorrowCap(USDC, 8_000_000e6);

        cm.checkBorrowCap(USDC, 4_000_000e6, 4_000_000e6);
    }

    function test_borrowCap_rejectsBorrowExceedingCap() public {
        vm.prank(admin);
        cm.setBorrowCap(USDC, 8_000_000e6);

        vm.expectRevert(
            abi.encodeWithSelector(
                ICollateralManager.CollateralManager__BorrowCapExceeded.selector,
                USDC, 8_000_000e6, 8_000_001e6
            )
        );
        cm.checkBorrowCap(USDC, 4_000_000e6, 4_000_001e6);
    }

    function test_borrowCap_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ICollateralManager.BorrowCapUpdated(USDC, 0, 1_000_000e6);

        vm.prank(admin);
        cm.setBorrowCap(USDC, 1_000_000e6);
    }

    function test_borrowCap_onlyConfigurator() public {
        vm.prank(attacker);
        vm.expectRevert();
        cm.setBorrowCap(USDC, 100e6);
    }

    function test_borrowCap_getterReturnsCorrectValue() public {
        vm.prank(admin);
        cm.setBorrowCap(USDC, 7_500_000e6);
        assertEq(cm.getBorrowCap(USDC), 7_500_000e6);
    }

    // ── Fuzz tests ────────────────────────────────────────────────────────────

    function testFuzz_supplyCap_withinCapAlwaysPasses(
        uint128 cap,
        uint128 current,
        uint128 deposit
    ) public {
        vm.assume(cap > 0);
        vm.assume(current <= cap);
        vm.assume(uint256(current) + uint256(deposit) <= uint256(cap));

        vm.prank(admin);
        cm.setSupplyCap(WETH, cap);

        // Should never revert when within bounds
        cm.checkSupplyCap(WETH, current, deposit);
    }

    function testFuzz_borrowCap_withinCapAlwaysPasses(
        uint128 cap,
        uint128 current,
        uint128 borrow
    ) public {
        vm.assume(cap > 0);
        vm.assume(current <= cap);
        vm.assume(uint256(current) + uint256(borrow) <= uint256(cap));

        vm.prank(admin);
        cm.setBorrowCap(USDC, cap);

        cm.checkBorrowCap(USDC, current, borrow);
    }

    function testFuzz_supplyCap_exceedingAlwaysReverts(
        uint128 cap,
        uint128 current,
        uint128 deposit
    ) public {
        vm.assume(cap > 0);
        vm.assume(current <= cap);
        vm.assume(uint256(current) + uint256(deposit) > uint256(cap));

        vm.prank(admin);
        cm.setSupplyCap(WETH, cap);

        vm.expectRevert();
        cm.checkSupplyCap(WETH, current, deposit);
    }
}
