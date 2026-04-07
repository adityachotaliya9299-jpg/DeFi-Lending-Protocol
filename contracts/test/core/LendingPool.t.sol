// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}     from "forge-std/Test.sol";
import {LendingPool}         from "../../src/core/LendingPool.sol";
import {CollateralManager}   from "../../src/core/CollateralManager.sol";
import {LiquidationEngine}   from "../../src/core/LiquidationEngine.sol";
import {ILendingPool}        from "../../src/interfaces/ILendingPool.sol";
import {ICollateralManager}  from "../../src/interfaces/ICollateralManager.sol";
import {PriceOracle}         from "../../src/oracle/PriceOracle.sol";
import {InterestRateModel}   from "../../src/interest/InterestRateModel.sol";
import {ProtocolTreasury}    from "../../src/treasury/ProtocolTreasury.sol";
import {MockChainlinkFeed}   from "../../src/mocks/MockChainlinkFeed.sol";
import {MockERC20}           from "../../src/mocks/MockERC20.sol";
import {WadRayMath}          from "../../src/math/WadRayMath.sol";

/**
 * @title  LendingPoolTest
 * @notice Full integration test suite — covers deposit, borrow, repay,
 *         withdraw, interest accrual, and liquidation.
 */
contract LendingPoolTest is Test {
    using WadRayMath for uint256;

    // ─── Protocol contracts ───────────────────────────────────────────────────

    LendingPool        internal pool;
    CollateralManager  internal cm;
    PriceOracle        internal oracle;
    InterestRateModel  internal irm;
    ProtocolTreasury   internal treasury;
    LiquidationEngine  internal liquidator;

    // ─── Mock assets + feeds ─────────────────────────────────────────────────

    MockERC20          internal weth;
    MockERC20          internal usdc;
    MockChainlinkFeed  internal ethFeed;
    MockChainlinkFeed  internal usdcFeed;

    // ─── Actors ───────────────────────────────────────────────────────────────

    address internal admin     = makeAddr("admin");
    address internal alice     = makeAddr("alice");  // depositor / borrower
    address internal bob       = makeAddr("bob");    // liquidator
    address internal carol     = makeAddr("carol");  // depositor

    uint256 constant RAY = 1e27;

    // ─── Setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        vm.startPrank(admin);

        // Deploy infrastructure
        treasury  = new ProtocolTreasury(admin);
        cm        = new CollateralManager(admin);
        oracle    = new PriceOracle(admin);
        irm       = new InterestRateModel(admin, 100, 400, 7_500, 8_000);

        // Deploy main pool
        pool = new LendingPool(
            admin,
            address(cm),
            address(oracle),
            address(irm),
            address(treasury)
        );

        // Deploy liquidation engine
        liquidator = new LiquidationEngine(address(pool), address(oracle));

        // Deploy mock tokens
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        usdc = new MockERC20("USD Coin",      "USDC", 6);

        // Deploy + configure feeds
        ethFeed  = new MockChainlinkFeed();
        usdcFeed = new MockChainlinkFeed();
        ethFeed.setPrice(2_000e8);   // $2,000
        usdcFeed.setPrice(1e8);      // $1.00

        oracle.registerFeed(address(weth), address(ethFeed),  3_600);
        oracle.registerFeed(address(usdc), address(usdcFeed), 86_400);

        // Configure assets in CollateralManager
        cm.setAssetConfig(address(weth), ICollateralManager.AssetConfig({
            ltv:                  8_000,  // 80% LTV
            liquidationThreshold: 8_500,  // 85% liq threshold
            liquidationBonus:     800,    // 8% bonus
            reserveFactor:        1_000,  // 10%
            isActive:             true,
            isBorrowEnabled:      true
        }));
        cm.setAssetConfig(address(usdc), ICollateralManager.AssetConfig({
            ltv:                  8_500,
            liquidationThreshold: 9_000,
            liquidationBonus:     500,
            reserveFactor:        500,
            isActive:             true,
            isBorrowEnabled:      true
        }));

        // Initialise assets in pool (deploys lTokens)
        pool.initAsset(address(weth));
        pool.initAsset(address(usdc));

        vm.stopPrank();

        // Fund actors
        weth.mint(alice, 100e18);
        weth.mint(bob,   100e18);
        weth.mint(carol, 100e18);
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob,   100_000e6);
        usdc.mint(carol, 100_000e6);
    }

    // =========================================================================
    //  Helpers
    // =========================================================================

    function _deposit(address user, address asset, uint256 amount) internal {
        vm.startPrank(user);
        MockERC20(asset).approve(address(pool), amount);
        pool.deposit(asset, amount);
        vm.stopPrank();
    }

    function _borrow(address user, address asset, uint256 amount) internal {
        vm.prank(user);
        pool.borrow(asset, amount);
    }

    function _repay(address user, address asset, uint256 amount) internal {
        vm.startPrank(user);
        MockERC20(asset).approve(address(pool), amount);
        pool.repay(asset, amount);
        vm.stopPrank();
    }

    // =========================================================================
    //  initAsset
    // =========================================================================

    function test_initAsset_createsReserve() public view {
        ILendingPool.ReserveData memory r = pool.getReserveData(address(weth));
        assertTrue(r.isActive);
        assertEq(r.liquidityIndex, RAY);
        assertEq(r.borrowIndex,    RAY);
        assertNotEq(r.lTokenAddress, address(0));
    }

    function test_initAsset_idempotent() public {
        // Re-initialising should not revert
        vm.prank(admin);
        pool.initAsset(address(weth));
        ILendingPool.ReserveData memory r = pool.getReserveData(address(weth));
        assertTrue(r.isActive); // unchanged
    }

    function test_initAsset_onlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.initAsset(address(weth));
    }

    // =========================================================================
    //  deposit
    // =========================================================================

    function test_deposit_transfersTokens() public {
        uint256 amount = 5e18;
        uint256 balBefore = weth.balanceOf(address(pool));

        _deposit(alice, address(weth), amount);

        assertEq(weth.balanceOf(address(pool)), balBefore + amount);
    }

    function test_deposit_mintsLTokens() public {
        _deposit(alice, address(weth), 5e18);

        ILendingPool.ReserveData memory r = pool.getReserveData(address(weth));
        address lToken = r.lTokenAddress;
        assertEq(MockERC20(lToken).balanceOf(alice), 5e18);
    }

    function test_deposit_updatesScaledBalance() public {
        _deposit(alice, address(weth), 10e18);
        assertEq(pool.getUserDeposit(alice, address(weth)), 10e18);
    }

    function test_deposit_zeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(ILendingPool.LendingPool__ZeroAmount.selector);
        pool.deposit(address(weth), 0);
    }

    function test_deposit_inactiveAssetReverts() public {
        MockERC20 rand = new MockERC20("Rand", "RND", 18);
        vm.prank(alice);
        vm.expectRevert();
        pool.deposit(address(rand), 1e18);
    }

    function test_deposit_emitsEvent() public {
        vm.startPrank(alice);
        weth.approve(address(pool), 5e18);
        vm.expectEmit(true, true, false, true);
        emit ILendingPool.Deposit(address(weth), alice, 5e18);
        pool.deposit(address(weth), 5e18);
        vm.stopPrank();
    }

    function test_deposit_multipleUsers_accumulatesCorrectly() public {
        _deposit(alice, address(weth), 5e18);
        _deposit(carol, address(weth), 3e18);

        ILendingPool.ReserveData memory r = pool.getReserveData(address(weth));
        // totalScaledDeposits * liquidityIndex ≈ 8e18
        uint256 totalDep = r.totalScaledDeposits.rayMul(r.liquidityIndex);
        assertApproxEqAbs(totalDep, 8e18, 2);
    }

    // =========================================================================
    //  borrow
    // =========================================================================

    function test_borrow_basicFlow() public {
        // Alice deposits 10 ETH collateral, borrows 5,000 USDC
        _deposit(alice, address(weth), 10e18);
        // Carol provides USDC liquidity
        _deposit(carol, address(usdc), 50_000e6);

        uint256 balBefore = usdc.balanceOf(alice);
        _borrow(alice, address(usdc), 5_000e6);
        assertEq(usdc.balanceOf(alice), balBefore + 5_000e6);
    }

    function test_borrow_exceedingLtvReverts() public {
        _deposit(alice, address(weth), 1e18);    // $2,000 collateral
        _deposit(carol, address(usdc), 50_000e6);

        vm.prank(alice);
        vm.expectRevert();
        pool.borrow(address(usdc), 1_800e6); // HF = 1700/1800 = 0.944 < 1 → reverts
    }

    function test_borrow_zeroAmountReverts() public {
        _deposit(alice, address(weth), 10e18);
        vm.prank(alice);
        vm.expectRevert(ILendingPool.LendingPool__ZeroAmount.selector);
        pool.borrow(address(usdc), 0);
    }

    function test_borrow_exceedingLiquidityReverts() public {
        _deposit(alice, address(weth), 100e18); // lots of collateral
        // No USDC in pool
        vm.prank(alice);
        vm.expectRevert(ILendingPool.LendingPool__InsufficientLiquidity.selector);
        pool.borrow(address(usdc), 1_000e6);
    }

    function test_borrow_reducesAvailableLiquidity() public {
        _deposit(carol, address(usdc), 10_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice, address(usdc), 5_000e6);

        ILendingPool.ReserveData memory r = pool.getReserveData(address(usdc));
        uint256 totalDep = r.totalScaledDeposits.rayMul(r.liquidityIndex);
        uint256 totalBor = r.totalScaledBorrows .rayMul(r.borrowIndex);
        assertApproxEqAbs(totalDep - totalBor, 5_000e6, 5);
    }

    // =========================================================================
    //  repay
    // =========================================================================

    function test_repay_reducesDebt() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice,  address(usdc), 5_000e6);

        uint256 debtBefore = pool.getUserDebt(alice, address(usdc));
        assertGt(debtBefore, 0);

        _repay(alice, address(usdc), 2_500e6);

        uint256 debtAfter = pool.getUserDebt(alice, address(usdc));
        assertApproxEqAbs(debtAfter, debtBefore - 2_500e6, 5e6);
    }

    function test_repay_fullDebtClearsPosition() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice,  address(usdc), 1_000e6);

        uint256 debt = pool.getUserDebt(alice, address(usdc));
        assertGt(debt, 0);

        // Give Alice enough to cover debt + reserve cut (pool takes 5% reserve)
        usdc.mint(alice, debt);

        vm.startPrank(alice);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(address(usdc), type(uint256).max); 
        vm.stopPrank();

        assertEq(pool.getUserDebt(alice, address(usdc)), 0);
    }

    function test_repay_sendsReserveToTreasury() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice,  address(usdc), 10_000e6);

        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        _repay(alice, address(usdc), 10_000e6);

        // USDC reserve factor is 500 bps = 5% (set in setUp)
        uint256 expectedFee = 10_000e6 * 500 / 10_000; // 5% = 500e6
        uint256 treasuryAfter = usdc.balanceOf(address(treasury));
        assertApproxEqAbs(treasuryAfter - treasuryBefore, expectedFee, 100);
    }

    function test_repay_emitsEvent() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice, address(usdc), 1_000e6);

        vm.startPrank(alice);
        usdc.approve(address(pool), 1_000e6);
        vm.expectEmit(true, true, false, false);
        emit ILendingPool.Repay(address(usdc), alice, 0, alice);
        pool.repay(address(usdc), 1_000e6);
        vm.stopPrank();
    }

    // =========================================================================
    //  withdraw
    // =========================================================================

    function test_withdraw_returnsTokens() public {
        _deposit(alice, address(weth), 5e18);

        uint256 balBefore = weth.balanceOf(alice);
        vm.prank(alice);
        pool.withdraw(address(weth), 3e18);

        assertEq(weth.balanceOf(alice), balBefore + 3e18);
    }

    function test_withdraw_belowHealthFactorReverts() public {
        // Alice deposits ETH and borrows USDC — withdrawing collateral tanks HF
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 5e18);   // $10,000 collateral
        _borrow(alice,  address(usdc), 7_000e6); // $7,000 debt (HF ≈ 1.21)

        // Withdrawing all ETH would make HF = 0
        vm.prank(alice);
        vm.expectRevert();
        pool.withdraw(address(weth), 5e18);
    }

    function test_withdraw_partialOk() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 10e18); // $20,000
        _borrow(alice,  address(usdc), 5_000e6); // $5,000 debt

        // Can withdraw some ETH while keeping HF > 1
        vm.prank(alice);
        pool.withdraw(address(weth), 3e18); // reduces collateral to $14,000

        uint256 hf = pool.getUserHealthFactor(alice);
        assertGt(hf, 1e18);
    }

    function test_withdraw_noBalanceReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.withdraw(address(weth), 1e18);
    }

    // =========================================================================
    //  Interest accrual
    // =========================================================================

    function test_interestAccrual_indexGrowsOverTime() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice, address(usdc), 5_000e6);

        ILendingPool.ReserveData memory before = pool.getReserveData(address(usdc));

        // Advance 365 days
        vm.warp(block.timestamp + 365 days);

        // Trigger accrual on USDC specifically — must touch the USDC reserve
        _deposit(carol, address(usdc), 1e6);

        ILendingPool.ReserveData memory after_ = pool.getReserveData(address(usdc));

        assertGt(after_.borrowIndex,    before.borrowIndex);
        assertGt(after_.liquidityIndex, before.liquidityIndex);

        console2.log("borrow index after 1 year:", after_.borrowIndex);
        console2.log("liquidity index after 1 year:", after_.liquidityIndex);
    }

    function test_interestAccrual_debtGrowsOverTime() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice, address(usdc), 5_000e6);

        uint256 debtBefore = pool.getUserDebt(alice, address(usdc));

        vm.warp(block.timestamp + 365 days);

        // Touch pool to trigger accrual
        vm.prank(carol);
        usdc.approve(address(pool), 1);
        vm.prank(carol);
        pool.deposit(address(usdc), 1);

        uint256 debtAfter = pool.getUserDebt(alice, address(usdc));
        assertGt(debtAfter, debtBefore);
        console2.log("Debt after 1 year ($USDC e6):", debtAfter);
    }

    // =========================================================================
    //  Health factor
    // =========================================================================

    function test_healthFactor_noDebt_isMax() public {
        _deposit(alice, address(weth), 5e18);
        assertEq(pool.getUserHealthFactor(alice), type(uint256).max);
    }

    function test_healthFactor_correctCalculation() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 5e18);    // $10,000
        _borrow(alice,  address(usdc), 5_000e6); // $5,000 debt

        // adjustedCollateral = $10,000 * 85% = $8,500
        // HF = $8,500 / $5,000 = 1.7
        uint256 hf = pool.getUserHealthFactor(alice);
        assertApproxEqRel(hf, 1.7e18, 0.01e18);
    }

    function test_getUserAccountData_returnsCorrectValues() public {
        _deposit(carol, address(usdc), 50_000e6);
        _deposit(alice, address(weth), 5e18);    // $10,000
        _borrow(alice,  address(usdc), 4_000e6); // $4,000

        (uint256 totalColl, uint256 totalDebt, uint256 hf, uint256 avail) =
            pool.getUserAccountData(alice);

        assertApproxEqRel(totalColl, 10_000e18, 0.01e18);
        assertApproxEqRel(totalDebt, 4_000e18,  0.01e18);
        assertGt(hf, 1e18);
        assertGt(avail, 0);
    }

    // =========================================================================
    //  Liquidation
    // =========================================================================

    function test_liquidation_basicFlow() public {
        // Setup: Alice deposits 5 ETH ($10,000), borrows 7,500 USDC
        _deposit(carol, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 5e18);       // $10,000
        _borrow(alice, address(usdc), 7_500e6);     // $7,500 (HF = 8500/7500 = 1.133)

        // ETH price crashes 30% → $1,400
        ethFeed.setPrice(1_400e8);

        // New collateral value = 5 * $1,400 = $7,000
        // adjustedCollateral = $7,000 * 85% = $5,950
        // HF = $5,950 / $7,500 ≈ 0.793 → LIQUIDATABLE

        uint256 hf = pool.getUserHealthFactor(alice);
        assertLt(hf, 1e18);

        // Bob liquidates: repays half of Alice's debt
        uint256 debtAmount = 3_750e6; // 50% close factor

        vm.startPrank(bob);
        usdc.approve(address(pool), debtAmount);
        uint256 collBefore = weth.balanceOf(bob);
        pool.liquidate(alice, address(usdc), address(weth), debtAmount);
        uint256 collAfter = weth.balanceOf(bob);
        vm.stopPrank();

        // Bob should have received ETH
        assertGt(collAfter, collBefore);
        console2.log("Collateral seized (WETH e18):", collAfter - collBefore);

        // Alice's debt should be reduced
        uint256 aliceDebtAfter = pool.getUserDebt(alice, address(usdc));
        assertLt(aliceDebtAfter, 7_500e6);
    }

    function test_liquidation_healthyPositionReverts() public {
        _deposit(carol, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice, address(usdc), 1_000e6);

        // HF is high, position is healthy
        vm.startPrank(bob);
        usdc.approve(address(pool), 500e6);
        vm.expectRevert();
        pool.liquidate(alice, address(usdc), address(weth), 500e6);
        vm.stopPrank();
    }

    function test_liquidation_sameAssetReverts() public {
        vm.prank(bob);
        vm.expectRevert(ILendingPool.LendingPool__SameAsset.selector);
        pool.liquidate(alice, address(usdc), address(usdc), 500e6);
    }

    function test_liquidation_engineIsLiquidatable() public {
        _deposit(carol, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 5e18);
        _borrow(alice, address(usdc), 7_500e6);
        ethFeed.setPrice(1_400e8); // crash

        assertTrue(liquidator.isLiquidatable(alice));
    }

    function test_liquidation_engineNotLiquidatable() public {
        _deposit(carol, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice, address(usdc), 1_000e6);

        assertFalse(liquidator.isLiquidatable(alice));
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    /// @dev Any deposit amount should result in correct scaled balance.
    function testFuzz_deposit_scaledBalanceCorrect(uint256 amount) public {
        amount = bound(amount, 1e6, 50e18);
        weth.mint(alice, amount);

        _deposit(alice, address(weth), amount);

        uint256 balance = pool.getUserDeposit(alice, address(weth));
        assertApproxEqAbs(balance, amount, 2);
    }

    /// @dev Health factor should always be > 1 when debt <= LTV * collateral.
    function testFuzz_borrow_hfAboveOneWithinLtv(uint256 depositAmt, uint256 borrowPct) public {
        depositAmt = bound(depositAmt, 1e18, 20e18);
        borrowPct  = bound(borrowPct,  1,    7_000); // borrow up to 70% of max (< 80% LTV)

        // Carol needs enough USDC to cover max possible borrow:
        // 20 ETH * $2000 * 80% LTV = $32,000 = 32_000e6 — mint plenty
        usdc.mint(carol, 200_000e6);
        _deposit(carol, address(usdc), 200_000e6);
        weth.mint(alice, depositAmt);
        _deposit(alice, address(weth), depositAmt);

        // Max borrow = depositAmt * $2000 * 80% = depositAmt * 1600
        uint256 collUsd   = depositAmt * 2_000 / 1e12; // in USDC units (6 dec)
        uint256 maxBorrow = collUsd * 8_000 / 10_000;
        uint256 toBorrow  = maxBorrow * borrowPct / 10_000;

        if (toBorrow == 0) return;

        _borrow(alice, address(usdc), toBorrow);

        assertGt(pool.getUserHealthFactor(alice), 1e18);
    }
}
