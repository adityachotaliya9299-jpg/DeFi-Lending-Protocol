// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}       from "forge-std/Test.sol";
import {StablecoinVault}       from "../../src/stablecoin/StablecoinVault.sol";
import {ProtocolStablecoin}    from "../../src/stablecoin/ProtocolStablecoin.sol";
import {PriceOracle}           from "../../src/oracle/PriceOracle.sol";
import {MockChainlinkFeed}     from "../../src/mocks/MockChainlinkFeed.sol";
import {MockERC20}             from "../../src/mocks/MockERC20.sol";

/**
 * @title  StablecoinVaultTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Tests for CDP-style stablecoin vault (MakerDAO-inspired pUSD).
 */
contract StablecoinVaultTest is Test {

    StablecoinVault    internal vault;
    ProtocolStablecoin internal pUSD;
    PriceOracle        internal oracle;
    MockERC20          internal weth;
    MockChainlinkFeed  internal ethFeed;

    address internal admin    = makeAddr("admin");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal treasury = makeAddr("treasury");

    StablecoinVault.CollateralConfig internal ethCfg;

    function setUp() public {
        vm.startPrank(admin);

        weth    = new MockERC20("WETH", "WETH", 18);
        ethFeed = new MockChainlinkFeed();
        ethFeed.setPrice(2_000e8); // $2,000

        oracle = new PriceOracle(admin);
        oracle.registerFeed(address(weth), address(ethFeed), 3_600);

        pUSD  = new ProtocolStablecoin(admin);
        vault = new StablecoinVault(admin, address(pUSD), address(oracle), treasury);

        // Grant vault MINTER_ROLE
        pUSD.grantRole(pUSD.MINTER_ROLE(), address(vault));

        ethCfg = StablecoinVault.CollateralConfig({
            collateralizationRatio: 15_000,   // 150%
            liquidationRatio:       13_000,   // 130%
            liquidationBonus:       1_000,    // 10%
            debtCeiling:            1_000_000e18,
            stabilityFeeBps:        200,      // 2% annual
            totalDebt:              0,
            isActive:               true
        });

        vault.setCollateralConfig(address(weth), ethCfg);
        vm.stopPrank();

        weth.mint(alice, 100e18);
        weth.mint(bob,   100e18);
    }

    function _depositAndMint(address user, uint256 collAmt, uint256 mintAmt) internal {
        vm.startPrank(user);
        weth.approve(address(vault), collAmt);
        vault.depositAndMint(address(weth), collAmt, mintAmt);
        vm.stopPrank();
    }

    // =========================================================================
    //  Deployment
    // =========================================================================

    function test_deployment_configStored() public view {
        (uint256 collRatio, uint256 liqRatio,,,,, bool isActive) =
            vault.collateralConfigs(address(weth));
        assertEq(collRatio, 15_000);
        assertEq(liqRatio,  13_000);
        assertTrue(isActive);
    }

    // =========================================================================
    //  Deposit
    // =========================================================================

    function test_depositCollateral_storesAmount() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 5e18);
        vault.depositCollateral(address(weth), 5e18);
        vm.stopPrank();

        assertEq(vault.getVault(alice, address(weth)).collateralAmount, 5e18);
    }

    function test_depositCollateral_zeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(StablecoinVault.Vault__ZeroAmount.selector);
        vault.depositCollateral(address(weth), 0);
    }

    // =========================================================================
    //  Mint pUSD
    // =========================================================================

    function test_mint_basicFlow() public {
        _depositAndMint(alice, 1e18, 1_000e18);
        assertEq(pUSD.balanceOf(alice), 1_000e18);
        assertEq(vault.getVault(alice, address(weth)).debtAmount, 1_000e18);
    }

    function test_mint_ratioIsCorrect() public {
        _depositAndMint(alice, 1e18, 1_000e18);
        // collUsd = $2,000, debt = $1,000 → ratio = 200% = 20,000 bps
        assertEq(vault.getCollateralisationRatio(alice, address(weth)), 20_000);
    }

    function test_mint_belowRatioReverts() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1e18);
        vault.depositCollateral(address(weth), 1e18);
        vm.expectRevert();
        vault.mintPUSD(address(weth), 1_500e18); // 133% < 150% → revert
        vm.stopPrank();
    }

    function test_mint_debtCeilingReverts() public {
        weth.mint(alice, 10_000e18);
        vm.startPrank(alice);
        weth.approve(address(vault), 10_000e18);
        vault.depositCollateral(address(weth), 10_000e18);
        vm.expectRevert();
        vault.mintPUSD(address(weth), 2_000_000e18); // > 1M ceiling
        vm.stopPrank();
    }

    function test_mint_emitsEvent() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1e18);
        vault.depositCollateral(address(weth), 1e18);
        vm.expectEmit(true, true, false, true);
        emit StablecoinVault.PUSDMinted(alice, address(weth), 1_000e18);
        vault.mintPUSD(address(weth), 1_000e18);
        vm.stopPrank();
    }

    // =========================================================================
    //  Burn pUSD
    // =========================================================================

    function test_burn_reducesDebt() public {
        _depositAndMint(alice, 2e18, 1_000e18);
        vm.prank(alice);
        vault.burnPUSD(address(weth), 500e18);
        assertEq(vault.getVault(alice, address(weth)).debtAmount, 500e18);
        assertEq(pUSD.balanceOf(alice), 500e18);
    }

    function test_burn_moreThanDebt_capsAtDebt() public {
        _depositAndMint(alice, 2e18, 500e18);
        vm.prank(alice);
        vault.burnPUSD(address(weth), 10_000e18);
        assertEq(vault.getVault(alice, address(weth)).debtAmount, 0);
        assertEq(pUSD.balanceOf(alice), 0);
    }

    // =========================================================================
    //  Withdraw
    // =========================================================================

    function test_withdraw_withNoDebt_returnsCollateral() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 5e18);
        vault.depositCollateral(address(weth), 5e18);
        uint256 before = weth.balanceOf(alice);
        vault.withdrawCollateral(address(weth), 5e18);
        vm.stopPrank();
        assertEq(weth.balanceOf(alice) - before, 5e18);
    }

    function test_withdraw_withDebt_checkRatio() public {
        // 2 ETH @ $2,000 = $4,000, mint $2,000 → ratio 200%
        _depositAndMint(alice, 2e18, 2_000e18);
        // Withdraw 1 ETH → $2,000/$2,000 = 100% < 150% → revert
        vm.prank(alice);
        vm.expectRevert();
        vault.withdrawCollateral(address(weth), 1e18);
    }

    function test_withdraw_partialAllowed() public {
        // 3 ETH → $6,000, mint $2,000 → ratio 300%
        _depositAndMint(alice, 3e18, 2_000e18);
        // Withdraw 1 ETH → $4,000/$2,000 = 200% — still above 150%
        vm.prank(alice);
        vault.withdrawCollateral(address(weth), 1e18);
        assertEq(vault.getVault(alice, address(weth)).collateralAmount, 2e18);
    }

    // =========================================================================
    //  Liquidation
    // =========================================================================

    function test_isLiquidatable_safeThenUnsafe() public {
        _depositAndMint(alice, 1e18, 1_000e18);
        assertFalse(vault.isLiquidatable(alice, address(weth)));

        // Price drops to $1,200 → ratio = 120% < 130%
        ethFeed.setPrice(1_200e8);
        assertTrue(vault.isLiquidatable(alice, address(weth)));
    }

    function test_liquidation_basicFlow() public {
        // Alice mints at 150% ratio: 1 ETH @ $2,000, mint $1,333
        _depositAndMint(alice, 1e18, 1_333e18);

        // Price drops 20%: $1,600 → ratio 120% < 130% → liquidatable
        ethFeed.setPrice(1_600e8);
        assertTrue(vault.isLiquidatable(alice, address(weth)));

        // Bob needs pUSD to liquidate — use admin to mint (has MINTER_ROLE)
        vm.prank(admin);
        pUSD.mint(bob, 1_000e18);

        uint256 bobWethBefore = weth.balanceOf(bob);
        vm.prank(bob);
        vault.liquidate(alice, address(weth), 500e18);

        assertGt(weth.balanceOf(bob), bobWethBefore, "liquidator received collateral");
    }

    function test_liquidation_safeVaultReverts() public {
        _depositAndMint(alice, 2e18, 1_000e18); // 200% ratio — safe

        vm.prank(admin);
        pUSD.mint(bob, 1_000e18);

        vm.prank(bob);
        vm.expectRevert();
        vault.liquidate(alice, address(weth), 500e18);
    }

    // =========================================================================
    //  Stability fee
    // =========================================================================

    function test_stabilityFee_accruesToTreasury() public {
        _depositAndMint(alice, 2e18, 1_000e18);

        uint256 treasuryBefore = pUSD.balanceOf(treasury);

        vm.warp(block.timestamp + 365 days);

        // burnPUSD triggers _accrueStabilityFee
        vm.prank(alice);
        vault.burnPUSD(address(weth), 1e18);

        assertGt(pUSD.balanceOf(treasury), treasuryBefore,
            "treasury should receive stability fee");
        console2.log("Stability fee:", pUSD.balanceOf(treasury) - treasuryBefore);
    }

    function test_stabilityFee_increasesDebt() public {
        _depositAndMint(alice, 2e18, 1_000e18);
        uint256 debtBefore = vault.getVault(alice, address(weth)).debtAmount;

        vm.warp(block.timestamp + 365 days);

        // depositCollateral now calls _accrueStabilityFee
        vm.startPrank(alice);
        weth.approve(address(vault), 1e15);
        vault.depositCollateral(address(weth), 1e15);
        vm.stopPrank();

        uint256 debtAfter = vault.getVault(alice, address(weth)).debtAmount;
        assertGt(debtAfter, debtBefore, "stability fee increases debt");
        console2.log("Debt before:", debtBefore);
        console2.log("Debt after :", debtAfter);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_vault_ratioAlwaysMeetsMinAfterMint(
        uint256 collAmt,
        uint256 mintPct
    ) public {
        collAmt = bound(collAmt, 1e18,  50e18);
        mintPct = bound(mintPct, 1,     6_000); // max 60% of max-mintable

        uint256 collUsd     = (collAmt * 2_000e18) / 1e18;
        uint256 maxMintable = (collUsd * 10_000)   / 15_000;
        uint256 mintAmt     = maxMintable * mintPct / 10_000;
        if (mintAmt == 0) return;

        weth.mint(alice, collAmt);
        _depositAndMint(alice, collAmt, mintAmt);

        assertGe(vault.getCollateralisationRatio(alice, address(weth)), 15_000);
    }
}
