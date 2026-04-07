// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test}                from "forge-std/Test.sol";
import {CollateralManager}   from "../../src/core/CollateralManager.sol";
import {ICollateralManager}  from "../../src/interfaces/ICollateralManager.sol";

contract CollateralManagerTest is Test {

    CollateralManager internal cm;
    address internal admin     = makeAddr("admin");
    address internal alice     = makeAddr("alice");
    address internal weth      = makeAddr("weth");
    address internal wbtc      = makeAddr("wbtc");
    address internal usdc      = makeAddr("usdc");

    ICollateralManager.AssetConfig internal ethConfig = ICollateralManager.AssetConfig({
        ltv:                  8_000,  // 80%
        liquidationThreshold: 8_500,  // 85%
        liquidationBonus:     800,    // 8%
        reserveFactor:        1_000,  // 10%
        isActive:             true,
        isBorrowEnabled:      true
    });

    function setUp() public {
        cm = new CollateralManager(admin);
        vm.prank(admin);
        cm.setAssetConfig(weth, ethConfig);
    }

    // =========================================================================
    //  Deployment
    // =========================================================================

    function test_deployment_roleAssigned() public view {
        assertTrue(cm.hasRole(cm.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(cm.hasRole(cm.CONFIGURATOR_ROLE(),  admin));
    }

    function test_deployment_zeroAdminReverts() public {
        vm.expectRevert(ICollateralManager.CollateralManager__ZeroAddress.selector);
        new CollateralManager(address(0));
    }

    // =========================================================================
    //  setAssetConfig
    // =========================================================================

    function test_setAssetConfig_storesCorrectly() public view {
        ICollateralManager.AssetConfig memory cfg = cm.getAssetConfig(weth);
        assertEq(cfg.ltv,                  8_000);
        assertEq(cfg.liquidationThreshold, 8_500);
        assertEq(cfg.liquidationBonus,     800);
        assertEq(cfg.reserveFactor,        1_000);
        assertTrue(cfg.isActive);
        assertTrue(cfg.isBorrowEnabled);
    }

    function test_setAssetConfig_onlyConfigurator() public {
        vm.prank(alice);
        vm.expectRevert();
        cm.setAssetConfig(wbtc, ethConfig);
    }

    function test_setAssetConfig_zeroAssetReverts() public {
        vm.prank(admin);
        vm.expectRevert(ICollateralManager.CollateralManager__ZeroAddress.selector);
        cm.setAssetConfig(address(0), ethConfig);
    }

    function test_setAssetConfig_ltvGeLiqThresholdReverts() public {
        ICollateralManager.AssetConfig memory bad = ethConfig;
        bad.ltv = 8_500; // equal to liquidationThreshold
        vm.prank(admin);
        vm.expectRevert();
        cm.setAssetConfig(wbtc, bad);
    }

    function test_setAssetConfig_ltvAboveMaxReverts() public {
        ICollateralManager.AssetConfig memory bad = ethConfig;
        bad.ltv = 9_600; // above MAX_LTV 9500
        vm.prank(admin);
        vm.expectRevert();
        cm.setAssetConfig(wbtc, bad);
    }

    function test_setAssetConfig_bonusTooHighReverts() public {
        ICollateralManager.AssetConfig memory bad = ethConfig;
        bad.liquidationBonus = 2_001; // above MAX 2000
        vm.prank(admin);
        vm.expectRevert();
        cm.setAssetConfig(wbtc, bad);
    }

    function test_setAssetConfig_reserveFactorTooHighReverts() public {
        ICollateralManager.AssetConfig memory bad = ethConfig;
        bad.reserveFactor = 5_001; // above MAX 5000
        vm.prank(admin);
        vm.expectRevert();
        cm.setAssetConfig(wbtc, bad);
    }

    function test_setAssetConfig_updatesExistingAsset() public {
        ICollateralManager.AssetConfig memory updated = ethConfig;
        updated.ltv = 7_000;
        vm.prank(admin);
        cm.setAssetConfig(weth, updated);
        assertEq(cm.getAssetConfig(weth).ltv, 7_000);
    }

    function test_setAssetConfig_tracksSupportedAssets() public {
        vm.prank(admin);
        cm.setAssetConfig(wbtc, ICollateralManager.AssetConfig({
            ltv: 7_500, liquidationThreshold: 8_000,
            liquidationBonus: 800, reserveFactor: 1_000,
            isActive: true, isBorrowEnabled: true
        }));
        address[] memory assets = cm.getSupportedAssets();
        assertEq(assets.length, 2);
    }

    function test_setAssetConfig_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit ICollateralManager.AssetConfigured(wbtc, ethConfig);
        vm.prank(admin);
        cm.setAssetConfig(wbtc, ethConfig);
    }

    // =========================================================================
    //  isAssetActive / isBorrowEnabled
    // =========================================================================

    function test_isAssetActive_trueForConfigured() public view {
        assertTrue(cm.isAssetActive(weth));
    }

    function test_isAssetActive_falseForUnknown() public view {
        assertFalse(cm.isAssetActive(usdc));
    }

    function test_isBorrowEnabled_correctValues() public view {
        assertTrue(cm.isBorrowEnabled(weth));
        assertFalse(cm.isBorrowEnabled(usdc)); // not configured
    }

    function test_disableAsset() public {
        vm.prank(admin);
        cm.disableAsset(weth);
        assertFalse(cm.isAssetActive(weth));
        assertFalse(cm.isBorrowEnabled(weth));
    }

    // =========================================================================
    //  calculateHealthFactor
    // =========================================================================

    function test_calculateHF_noDebt_returnsMax() public view {
        address[] memory collAssets = new address[](1);
        uint256[] memory collUsds   = new uint256[](1);
        uint256[] memory debtUsds   = new uint256[](0);
        collAssets[0] = weth;
        collUsds[0]   = 10_000e18;

        uint256 hf = cm.calculateHealthFactor(collAssets, collUsds, debtUsds);
        assertEq(hf, type(uint256).max);
    }

    function test_calculateHF_safePosition() public view {
        // $10,000 ETH collateral (85% liqThreshold), $6,000 debt
        // adjustedCollateral = 10000 * 85% = 8500
        // HF = 8500 / 6000 * 1e18 ≈ 1.4167e18
        address[] memory collAssets = new address[](1);
        uint256[] memory collUsds   = new uint256[](1);
        uint256[] memory debtUsds   = new uint256[](1);
        collAssets[0] = weth;
        collUsds[0]   = 10_000e18;
        debtUsds[0]   = 6_000e18;

        uint256 hf = cm.calculateHealthFactor(collAssets, collUsds, debtUsds);
        assertGt(hf, 1e18);
        assertApproxEqRel(hf, 1.4167e18, 0.001e18);
    }

    function test_calculateHF_liquidatable() public view {
        // $10,000 ETH, 85% threshold, $9,500 debt → HF < 1
        address[] memory collAssets = new address[](1);
        uint256[] memory collUsds   = new uint256[](1);
        uint256[] memory debtUsds   = new uint256[](1);
        collAssets[0] = weth;
        collUsds[0]   = 10_000e18;
        debtUsds[0]   = 9_500e18;

        uint256 hf = cm.calculateHealthFactor(collAssets, collUsds, debtUsds);
        assertLt(hf, 1e18);
    }

    function test_calculateHF_multiAsset() public {
        // Add WBTC config
        vm.prank(admin);
        cm.setAssetConfig(wbtc, ICollateralManager.AssetConfig({
            ltv: 7_500, liquidationThreshold: 8_000,
            liquidationBonus: 800, reserveFactor: 1_000,
            isActive: true, isBorrowEnabled: true
        }));

        // $5,000 ETH + $10,000 WBTC collateral, $8,000 debt
        address[] memory collAssets = new address[](2);
        uint256[] memory collUsds   = new uint256[](2);
        uint256[] memory debtUsds   = new uint256[](1);
        collAssets[0] = weth; collUsds[0] = 5_000e18; // adj = 4250
        collAssets[1] = wbtc; collUsds[1] = 10_000e18; // adj = 8000
        debtUsds[0]   = 8_000e18;

        // HF = (4250 + 8000) / 8000 = 1.53125
        uint256 hf = cm.calculateHealthFactor(collAssets, collUsds, debtUsds);
        assertGt(hf, 1e18);
    }

    // =========================================================================
    //  getMaxBorrow
    // =========================================================================

    function test_getMaxBorrow_ethAt80pctLtv() public view {
        // $10,000 ETH at 80% LTV → max borrow = $8,000
        uint256 maxBorrow = cm.getMaxBorrow(weth, 10_000e18);
        assertEq(maxBorrow, 8_000e18);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_calculateHF_zeroDebtIsMax(uint256 collUsd) public view {
        collUsd = bound(collUsd, 0, 1e30);
        address[] memory c = new address[](1);
        uint256[] memory cU = new uint256[](1);
        uint256[] memory dU = new uint256[](0);
        c[0] = weth; cU[0] = collUsd;
        assertEq(cm.calculateHealthFactor(c, cU, dU), type(uint256).max);
    }

    function testFuzz_calculateHF_monotonicInCollateral(
        uint256 coll1, uint256 coll2, uint256 debt
    ) public view {
        coll1 = bound(coll1, 1e18, 1e30);
        coll2 = bound(coll2, coll1, 2 * coll1); // coll2 >= coll1
        debt  = bound(debt,  1e18, coll1);      // always have some debt

        address[] memory c  = new address[](1);
        uint256[] memory cU1 = new uint256[](1);
        uint256[] memory cU2 = new uint256[](1);
        uint256[] memory dU  = new uint256[](1);
        c[0] = weth; dU[0] = debt;
        cU1[0] = coll1; cU2[0] = coll2;

        uint256 hf1 = cm.calculateHealthFactor(c, cU1, dU);
        uint256 hf2 = cm.calculateHealthFactor(c, cU2, dU);
        assertLe(hf1, hf2); // more collateral → higher or equal HF
    }
}
