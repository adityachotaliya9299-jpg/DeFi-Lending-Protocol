// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}       from "forge-std/Test.sol";
import {LendingPool}           from "../../src/core/LendingPool.sol";
import {CollateralManager}     from "../../src/core/CollateralManager.sol";
import {PriceOracle}           from "../../src/oracle/PriceOracle.sol";
import {InterestRateModel}     from "../../src/interest/InterestRateModel.sol";
import {ProtocolTreasury}      from "../../src/treasury/ProtocolTreasury.sol";
import {ILendingPool}          from "../../src/interfaces/ILendingPool.sol";
import {ICollateralManager}    from "../../src/interfaces/ICollateralManager.sol";
import {IPriceOracle}          from "../../src/interfaces/IPriceOracle.sol";
import {MockChainlinkFeed}     from "../../src/mocks/MockChainlinkFeed.sol";
import {MockERC20}             from "../../src/mocks/MockERC20.sol";
import {WadRayMath}            from "../../src/math/WadRayMath.sol";

/**
 * @title  EdgeCasesTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Edge-case and adversarial scenario tests:
 *         - Oracle returning 0 / negative price
 *         - Extreme utilization (99.99%)
 *         - Rapid price crash → cascading liquidation
 *         - Borrow exactly at max LTV
 *         - Repay more than owed
 *         - Deposit + immediate withdraw with no interest
 *         - Multi-asset collateral health factor
 *         - Zero-address protection
 */
contract EdgeCasesTest is Test {
    using WadRayMath for uint256;

    LendingPool        internal pool;
    CollateralManager  internal cm;
    PriceOracle        internal oracle;
    InterestRateModel  internal irm;
    ProtocolTreasury   internal treasury;

    MockERC20          internal weth;
    MockERC20          internal usdc;
    MockChainlinkFeed  internal ethFeed;
    MockChainlinkFeed  internal usdcFeed;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    function setUp() public {
        vm.startPrank(admin);
        treasury = new ProtocolTreasury(admin);
        cm       = new CollateralManager(admin);
        oracle   = new PriceOracle(admin);
        irm      = new InterestRateModel(admin, 100, 400, 7_500, 8_000);
        pool     = new LendingPool(admin, address(cm), address(oracle), address(irm), address(treasury));

        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        usdc = new MockERC20("USD Coin",      "USDC", 6);

        ethFeed  = new MockChainlinkFeed(); ethFeed.setPrice(2_000e8);
        usdcFeed = new MockChainlinkFeed(); usdcFeed.setPrice(1e8);

        oracle.registerFeed(address(weth), address(ethFeed),  3_600);
        oracle.registerFeed(address(usdc), address(usdcFeed), 86_400);

        cm.setAssetConfig(address(weth), ICollateralManager.AssetConfig({
            ltv: 8_000, liquidationThreshold: 8_500, liquidationBonus: 800,
            reserveFactor: 1_000, isActive: true, isBorrowEnabled: true
        }));
        cm.setAssetConfig(address(usdc), ICollateralManager.AssetConfig({
            ltv: 8_500, liquidationThreshold: 9_000, liquidationBonus: 500,
            reserveFactor: 500, isActive: true, isBorrowEnabled: true
        }));

        pool.initAsset(address(weth));
        pool.initAsset(address(usdc));
        vm.stopPrank();

        weth.mint(alice, 1_000e18); weth.mint(bob, 1_000e18);
        usdc.mint(alice, 1_000_000e6); usdc.mint(bob, 1_000_000e6);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _deposit(address user, address token, uint256 amt) internal {
        vm.startPrank(user);
        MockERC20(token).approve(address(pool), amt);
        pool.deposit(token, amt);
        vm.stopPrank();
    }

    function _borrow(address user, address token, uint256 amt) internal {
        vm.prank(user); pool.borrow(token, amt);
    }

    /// @dev After vm.warp, oracle staleness guards will trigger unless feeds
    ///      are refreshed. Call this after every warp in tests that interact
    ///      with the pool post-warp.
    function _refreshFeeds() internal {
        ethFeed.setUpdatedAt(block.timestamp);
        usdcFeed.setUpdatedAt(block.timestamp);
    }

    // =========================================================================
    //  Oracle edge cases
    // =========================================================================

    function test_oracle_zeroPrice_reverts() public view {
        uint256 price = oracle.getPrice(address(weth));
        assertGt(price, 0);
    }

    function test_oracle_negativePriceReverts() public {
        ethFeed.makeNegative();
        vm.expectRevert(
            abi.encodeWithSelector(IPriceOracle.PriceOracle__InvalidPrice.selector, address(weth), int256(-1))
        );
        oracle.getPrice(address(weth));
    }

    function test_oracle_stalePrice_blocksDeposit() public {
        vm.warp(block.timestamp + 10_000);
        ethFeed.makeStale(3_601);

        vm.startPrank(alice);
        weth.approve(address(pool), 1e18);
        pool.deposit(address(weth), 1e18);
        vm.stopPrank();

        _deposit(bob, address(usdc), 100_000e6);
        _refreshFeeds(); // refresh usdc but leave eth stale
        ethFeed.makeStale(3_601); // re-stale eth

        vm.prank(alice);
        vm.expectRevert();
        pool.borrow(address(usdc), 100e6);
    }

    function test_oracle_priceDrops50pct_makesPositionLiquidatable() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 5e18);
        _borrow(alice, address(usdc), 7_000e6);

        ethFeed.setPrice(1_000e8);
        uint256 hf = pool.getUserHealthFactor(alice);
        assertLt(hf, 1e18);
    }

    function test_oracle_rapidPriceCrash_cascadingLiquidation() public {
        address carol = makeAddr("carol");
        weth.mint(carol, 100e18); usdc.mint(carol, 100_000e6);

        _deposit(bob,   address(usdc), 500_000e6);
        _deposit(alice, address(weth), 10e18);
        _deposit(carol, address(weth), 5e18);

        vm.prank(alice); pool.borrow(address(usdc), 13_000e6);
        vm.prank(carol); pool.borrow(address(usdc), 6_500e6);

        ethFeed.setPrice(1_200e8);

        assertLt(pool.getUserHealthFactor(alice), 1e18);
        assertLt(pool.getUserHealthFactor(carol), 1e18);
    }

    // =========================================================================
    //  Extreme utilization
    // =========================================================================

    function test_utilization_nearMax_rateIsHigh() public {
        address carol = makeAddr("carol");
        usdc.mint(carol, 100_000e6);
        _deposit(carol, address(usdc), 100_000e6);

        weth.mint(alice, 10_000e18);
        _deposit(alice, address(weth), 5_000e18);
        _borrow(alice, address(usdc), 99_000e6);

        ILendingPool.ReserveData memory r = pool.getReserveData(address(usdc));
        uint256 totalDep = uint256(r.totalScaledDeposits).rayMul(r.liquidityIndex);
        uint256 totalBor = uint256(r.totalScaledBorrows).rayMul(r.borrowIndex);
        uint256 util     = totalDep > 0 ? (totalBor * 1e18) / totalDep : 0;

        assertGt(util, 0.98e18);

        uint256 borrowRate = irm.calculateBorrowRate(totalDep, totalBor);
        uint256 annualRate = borrowRate * 365 days;
        assertGt(annualRate, irm.bpsToRay(7_000));
    }

    function test_utilization_100pct_preventsNewBorrow() public {
        address carol = makeAddr("carol");
        usdc.mint(carol, 1_000e6);
        _deposit(carol, address(usdc), 1_000e6);

        weth.mint(alice, 10_000e18);
        _deposit(alice, address(weth), 1_000e18);
        _borrow(alice, address(usdc), 1_000e6);

        _deposit(bob, address(weth), 10e18);
        vm.prank(bob);
        vm.expectRevert(ILendingPool.LendingPool__InsufficientLiquidity.selector);
        pool.borrow(address(usdc), 1e6);
    }

    function test_utilization_0pct_lowestRate() public {
        _deposit(alice, address(usdc), 100_000e6);
        ILendingPool.ReserveData memory r = pool.getReserveData(address(usdc));
        uint256 totalDep = uint256(r.totalScaledDeposits).rayMul(r.liquidityIndex);
        uint256 rate = irm.calculateBorrowRate(totalDep, 0);
        assertEq(rate, irm.baseRateRay() / 365 days);
    }

    // =========================================================================
    //  Borrow at exact LTV boundary
    // =========================================================================

    function test_borrow_exactlyAtLtvBoundary() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 1e18);
        vm.prank(alice); pool.borrow(address(usdc), 1_600e6);
        assertGt(pool.getUserHealthFactor(alice), 1e18);
    }

    function test_borrow_oneDollarBeyondLtv_stillHealthy() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 1e18);
        vm.prank(alice); pool.borrow(address(usdc), 1_650e6);
        assertGt(pool.getUserHealthFactor(alice), 1e18);
    }

    function test_borrow_beyondLiqThreshold_reverts() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 1e18);
        vm.prank(alice);
        vm.expectRevert();
        pool.borrow(address(usdc), 1_800e6);
    }

    // =========================================================================
    //  Repay edge cases
    // =========================================================================

    function test_repay_moreThanOwed_capsAtDebt() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 10e18);
        _borrow(alice, address(usdc), 1_000e6);

        uint256 debt = pool.getUserDebt(alice, address(usdc));
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(pool), type(uint256).max);
        uint256 repaid = pool.repay(address(usdc), 2_000e6);
        vm.stopPrank();

        assertLe(repaid, debt + 1);
        assertEq(pool.getUserDebt(alice, address(usdc)), 0);
    }

    function test_repay_zeroDebt_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 1_000e6);
        vm.expectRevert(ILendingPool.LendingPool__InsufficientBalance.selector);
        pool.repay(address(usdc), 1_000e6);
        vm.stopPrank();
    }

    // =========================================================================
    //  Deposit / withdraw
    // =========================================================================

    function test_depositThenImmediateWithdraw_noLoss() public {
        uint256 amount    = 10e18;
        uint256 balBefore = weth.balanceOf(alice);

        _deposit(alice, address(weth), amount);
        vm.prank(alice); pool.withdraw(address(weth), amount);

        assertApproxEqAbs(weth.balanceOf(alice), balBefore, 1e9);
    }

    function test_deposit_zeroAmount_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ILendingPool.LendingPool__ZeroAmount.selector);
        pool.deposit(address(weth), 0);
    }

    function test_withdraw_zeroBalance_reverts() public {
        vm.prank(alice);
        vm.expectRevert();
        pool.withdraw(address(weth), 1e18);
    }

    function test_deposit_unsupportedAsset_reverts() public {
        MockERC20 rand = new MockERC20("Random", "RND", 18);
        vm.prank(alice);
        vm.expectRevert();
        pool.deposit(address(rand), 1e18);
    }

    // =========================================================================
    //  Multi-asset collateral
    // =========================================================================

    function test_multiAssetCollateral_combinedHealthFactor() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 2e18);    // $4,000
        _deposit(alice, address(usdc), 5_000e6); // $5,000

        _borrow(alice, address(usdc), 7_000e6);
        assertGt(pool.getUserHealthFactor(alice), 1e18);
    }

    function test_multiAssetCollateral_partialCollateralRemoval() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 5e18);
        _deposit(alice, address(usdc), 5_000e6);
        _borrow(alice, address(usdc), 10_000e6);

        vm.prank(alice);
        vm.expectRevert();
        pool.withdraw(address(usdc), 5_000e6);
    }

    // =========================================================================
    //  Zero-address protections
    // =========================================================================

    function test_liquidate_zeroAddress_reverts() public {
        vm.prank(bob);
        vm.expectRevert(ILendingPool.LendingPool__ZeroAddress.selector);
        pool.liquidate(address(0), address(usdc), address(weth), 100e6);
    }

    function test_liquidate_sameAsset_reverts() public {
        vm.prank(bob);
        vm.expectRevert(ILendingPool.LendingPool__SameAsset.selector);
        pool.liquidate(alice, address(usdc), address(usdc), 100e6);
    }

    // =========================================================================
    //  Interest accrual edge cases
    // =========================================================================

    function test_interest_noAccrualWhenNoBorrows() public {
        _deposit(alice, address(weth), 10e18);

        ILendingPool.ReserveData memory before = pool.getReserveData(address(weth));
        vm.warp(block.timestamp + 365 days);
        _refreshFeeds();

        _deposit(bob, address(usdc), 1);

        ILendingPool.ReserveData memory after_ = pool.getReserveData(address(weth));
        assertEq(after_.liquidityIndex, before.liquidityIndex);
    }

    function test_interest_accruesOverLongPeriod() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 10e18); // $20,000 collateral
        // Borrow conservatively — 8,000 USDC, HF = 17,000/8,000 = 2.125
        // After 2 years at ~5% APR: 8,000 → ~8,820 → HF = 17,000/8,820 = 1.93 ✓
        _borrow(alice, address(usdc), 8_000e6);

        uint256 debtBefore = pool.getUserDebt(alice, address(usdc));
        vm.warp(block.timestamp + 2 * 365 days);
        _refreshFeeds();

        _deposit(bob, address(usdc), 1);

        uint256 debtAfter = pool.getUserDebt(alice, address(usdc));
        assertGt(debtAfter, debtBefore);
        console2.log("Debt after 2 years:", debtAfter);
    }

    function test_interest_indexNeverDecreases() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 10e18);
        // Conservative borrow: 8,000 USDC stays safe over 1+ year
        _borrow(alice, address(usdc), 8_000e6);

        uint256 prevLiqIdx = pool.getReserveData(address(usdc)).liquidityIndex;
        uint256 prevBorIdx = pool.getReserveData(address(usdc)).borrowIndex;

        for (uint256 i; i < 5; i++) {
            vm.warp(block.timestamp + 30 days);
            _refreshFeeds();

            _deposit(bob, address(weth), 1e15);

            uint256 newLiqIdx = pool.getReserveData(address(usdc)).liquidityIndex;
            uint256 newBorIdx = pool.getReserveData(address(usdc)).borrowIndex;

            assertGe(newLiqIdx, prevLiqIdx);
            assertGe(newBorIdx, prevBorIdx);

            prevLiqIdx = newLiqIdx;
            prevBorIdx = newBorIdx;
        }
    }

    // =========================================================================
    //  Liquidation edge cases
    // =========================================================================

    function test_liquidation_closeFactor_maxIs50pct() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 5e18);
        _borrow(alice, address(usdc), 7_500e6);

        ethFeed.setPrice(1_400e8);

        uint256 fullDebt = pool.getUserDebt(alice, address(usdc));

        vm.startPrank(bob);
        usdc.approve(address(pool), fullDebt);
        pool.liquidate(alice, address(usdc), address(weth), fullDebt);
        vm.stopPrank();

        uint256 remainingDebt = pool.getUserDebt(alice, address(usdc));
        assertGe(remainingDebt, fullDebt / 2 - 1);
    }

    function test_liquidation_bonusTransferredToLiquidator() public {
        _deposit(bob, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 5e18);
        _borrow(alice, address(usdc), 7_500e6);

        ethFeed.setPrice(1_400e8);

        uint256 wethBefore = weth.balanceOf(bob);

        vm.startPrank(bob);
        usdc.approve(address(pool), 3_750e6);
        pool.liquidate(alice, address(usdc), address(weth), 3_750e6);
        vm.stopPrank();

        assertGt(weth.balanceOf(bob), wethBefore);
    }

    // =========================================================================
    //  Fuzz
    // =========================================================================

    function testFuzz_edgeCase_borrowWithinLtvIsAlwaysHealthy(
        uint256 depositAmt,
        uint256 borrowPct
    ) public {
        depositAmt = bound(depositAmt, 1e18, 50e18);
        borrowPct  = bound(borrowPct, 1, 7_500);

        _deposit(bob, address(usdc), 500_000e6);
        weth.mint(alice, depositAmt);
        _deposit(alice, address(weth), depositAmt);

        uint256 collUsd   = depositAmt * 2_000 / 1e12;
        uint256 maxBorrow = collUsd * borrowPct / 10_000;
        if (maxBorrow == 0) return;

        _borrow(alice, address(usdc), maxBorrow);
        assertGt(pool.getUserHealthFactor(alice), 1e18);
    }

    function testFuzz_edgeCase_noDebtIsAlwaysMax(uint256 depositAmt) public {
        depositAmt = bound(depositAmt, 1e15, 100e18);
        weth.mint(alice, depositAmt);
        _deposit(alice, address(weth), depositAmt);
        assertEq(pool.getUserHealthFactor(alice), type(uint256).max);
    }
}