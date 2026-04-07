// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test}               from "forge-std/Test.sol";
import {Governance}         from "../../src/governance/Governance.sol";
import {CollateralManager}  from "../../src/core/CollateralManager.sol";
import {ICollateralManager} from "../../src/interfaces/ICollateralManager.sol";
import {InterestRateModel}  from "../../src/interest/InterestRateModel.sol";

contract GovernanceTest is Test {

    Governance        internal gov;
    CollateralManager internal cm;
    InterestRateModel internal irm;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal weth  = makeAddr("weth");
    address internal usdc  = makeAddr("usdc");

    ICollateralManager.AssetConfig internal ethConfig = ICollateralManager.AssetConfig({
        ltv:                  8_000,
        liquidationThreshold: 8_500,
        liquidationBonus:     800,
        reserveFactor:        1_000,
        isActive:             true,
        isBorrowEnabled:      true
    });

    function setUp() public {
        vm.startPrank(owner);

        cm  = new CollateralManager(owner);
        irm = new InterestRateModel(owner, 100, 400, 7_500, 8_000);
        gov = new Governance(owner, address(cm), address(irm));

        // Grant governance CONFIGURATOR_ROLE on CollateralManager
        cm.grantRole(cm.CONFIGURATOR_ROLE(), address(gov));

        // Transfer IRM ownership to governance
        irm.transferOwnership(address(gov));

        vm.stopPrank();
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    function test_deployment_ownerSet() public view {
        assertEq(gov.owner(), owner);
    }

    function test_deployment_zeroAddressReverts() public {
         vm.expectRevert();
        new Governance(address(0), address(cm), address(irm));
    }

    function test_deployment_immutables() public view {
        assertEq(address(gov.collateralManager()), address(cm));
        assertEq(address(gov.interestRateModel()),  address(irm));
    }

    // ─── configureAsset ───────────────────────────────────────────────────────

    function test_configureAsset_setsConfig() public {
        vm.prank(owner);
        gov.configureAsset(weth, ethConfig);

        ICollateralManager.AssetConfig memory cfg = cm.getAssetConfig(weth);
        assertEq(cfg.ltv, 8_000);
        assertEq(cfg.liquidationThreshold, 8_500);
        assertTrue(cfg.isActive);
    }

    function test_configureAsset_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        gov.configureAsset(weth, ethConfig);
    }

    function test_configureAsset_emitsEvents() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit Governance.AssetConfigProposed(weth, ethConfig);
        gov.configureAsset(weth, ethConfig);
    }

    function test_configureAsset_updateExisting() public {
        vm.startPrank(owner);
        gov.configureAsset(weth, ethConfig);

        ICollateralManager.AssetConfig memory updated = ethConfig;
        updated.ltv = 7_000;
        gov.configureAsset(weth, updated);
        vm.stopPrank();

        assertEq(cm.getAssetConfig(weth).ltv, 7_000);
    }

    function test_getAssetConfig_delegatesToCm() public {
        vm.prank(owner);
        gov.configureAsset(weth, ethConfig);

        ICollateralManager.AssetConfig memory cfg = gov.getAssetConfig(weth);
        assertEq(cfg.ltv, ethConfig.ltv);
    }

    // ─── disableAsset ─────────────────────────────────────────────────────────

    function test_disableAsset_setsInactive() public {
        vm.startPrank(owner);
        gov.configureAsset(weth, ethConfig);
        gov.disableAsset(weth);
        vm.stopPrank();

        assertFalse(cm.isAssetActive(weth));
        assertFalse(cm.isBorrowEnabled(weth));
    }

    function test_disableAsset_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        gov.disableAsset(weth);
    }

    // ─── setInterestRateParams ────────────────────────────────────────────────

    function test_setInterestRateParams_updatesModel() public {
        vm.prank(owner);
        gov.setInterestRateParams(200, 500, 5_000, 7_000);

        (uint256 base, uint256 s1, uint256 s2, uint256 opt) = gov.getCurrentRateParams();
        assertEq(base, irm.bpsToRay(200));
        assertEq(s1,   irm.bpsToRay(500));
        assertEq(s2,   irm.bpsToRay(5_000));
        assertEq(opt,  irm.bpsToRay(7_000));
    }

    function test_setInterestRateParams_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        gov.setInterestRateParams(200, 500, 5_000, 7_000);
    }

    function test_setInterestRateParams_emitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit Governance.RateParamsUpdated(200, 500, 5_000, 7_000);
        gov.setInterestRateParams(200, 500, 5_000, 7_000);
    }

    function test_setInterestRateParams_invalidRevertsFromModel() public {
        vm.prank(owner);
        vm.expectRevert(); // irm will revert on 0 optimalUtil
        gov.setInterestRateParams(100, 400, 7_500, 0);
    }

    // ─── getCurrentRateParams ─────────────────────────────────────────────────

    function test_getCurrentRateParams_defaultValues() public view {
        (uint256 base, uint256 s1, uint256 s2, uint256 opt) = gov.getCurrentRateParams();
        assertEq(base, irm.bpsToRay(100));
        assertEq(s1,   irm.bpsToRay(400));
        assertEq(s2,   irm.bpsToRay(7_500));
        assertEq(opt,  irm.bpsToRay(8_000));
    }

    // ─── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_configureAsset_ltvAlwaysBeforeThreshold(
        uint256 ltv,
        uint256 threshold
    ) public {
        ltv       = bound(ltv,       1_000, 9_000);
        threshold = bound(threshold, ltv + 1, 9_500);

        ICollateralManager.AssetConfig memory cfg = ICollateralManager.AssetConfig({
            ltv:                  ltv,
            liquidationThreshold: threshold,
            liquidationBonus:     500,
            reserveFactor:        500,
            isActive:             true,
            isBorrowEnabled:      true
        });

        vm.prank(owner);
        gov.configureAsset(weth, cfg);

        ICollateralManager.AssetConfig memory stored = cm.getAssetConfig(weth);
        assertLt(stored.ltv, stored.liquidationThreshold);
    }
}
