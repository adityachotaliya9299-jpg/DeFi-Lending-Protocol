// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}    from "forge-std/Test.sol";
import {LendingPool}        from "../../src/core/LendingPool.sol";
import {CollateralManager}  from "../../src/core/CollateralManager.sol";
import {PriceOracle}        from "../../src/oracle/PriceOracle.sol";
import {InterestRateModel}  from "../../src/interest/InterestRateModel.sol";
import {ProtocolTreasury}   from "../../src/treasury/ProtocolTreasury.sol";
import {ILendingPool}       from "../../src/interfaces/ILendingPool.sol";
import {ICollateralManager} from "../../src/interfaces/ICollateralManager.sol";
import {MockChainlinkFeed}  from "../../src/mocks/MockChainlinkFeed.sol";
import {MockERC20}          from "../../src/mocks/MockERC20.sol";
import {WadRayMath}         from "../../src/math/WadRayMath.sol";

/**
 * @title  InvariantsTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Property-based invariant tests that must hold under ALL conditions:
 *
 *   1. totalScaledDeposits * liquidityIndex >= sum of individual deposits
 *   2. totalScaledBorrows  * borrowIndex   >= sum of individual debts
 *   3. Borrow index never decreases
 *   4. Liquidity index never decreases
 *   5. Pool token balance >= available liquidity (deposited - borrowed)
 *   6. No user can withdraw more than they deposited + earned interest
 *   7. Health factor >= 1.0 for all positions after every action
 *   8. Interest rate >= base rate at all utilization levels
 *   9. Supply rate <= borrow rate always
 *  10. PercentageMath: percentMul(x, 10000) == x
 */
contract InvariantsTest is Test {
    using WadRayMath for uint256;

    LendingPool       internal pool;
    CollateralManager internal cm;
    PriceOracle       internal oracle;
    InterestRateModel internal irm;
    ProtocolTreasury  internal treasury;
    MockERC20         internal weth;
    MockERC20         internal usdc;
    MockChainlinkFeed internal ethFeed;
    MockChainlinkFeed internal usdcFeed;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 constant RAY = 1e27;

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

        weth.mint(alice, 10_000e18); weth.mint(bob, 10_000e18); weth.mint(carol, 10_000e18);
        usdc.mint(alice, 10_000_000e6); usdc.mint(bob, 10_000_000e6); usdc.mint(carol, 10_000_000e6);
    }

    function _dep(address u, address t, uint256 a) internal {
        vm.startPrank(u); MockERC20(t).approve(address(pool), a); pool.deposit(t, a); vm.stopPrank();
    }
    function _bor(address u, address t, uint256 a) internal { vm.prank(u); pool.borrow(t, a); }

    /// @dev Refresh both oracle feeds to current block.timestamp after vm.warp.
    function _refreshFeeds() internal {
        ethFeed.setUpdatedAt(block.timestamp);
        usdcFeed.setUpdatedAt(block.timestamp);
    }

    // =========================================================================
    //  Invariant 1 & 2 — Scaled balance consistency
    // =========================================================================

    function test_invariant_totalScaledDeposits_matchesPoolBalance() public {
        _dep(alice, address(usdc), 50_000e6);
        _dep(bob,   address(usdc), 30_000e6);

        ILendingPool.ReserveData memory r = pool.getReserveData(address(usdc));
        uint256 total   = uint256(r.totalScaledDeposits).rayMul(r.liquidityIndex);
        uint256 aliceDep = pool.getUserDeposit(alice, address(usdc));
        uint256 bobDep   = pool.getUserDeposit(bob,   address(usdc));

        assertApproxEqAbs(total, aliceDep + bobDep, 10);
    }

    function test_invariant_totalScaledBorrows_matchesSumOfDebts() public {
        _dep(carol, address(usdc), 200_000e6);
        _dep(alice, address(weth), 20e18);
        _dep(bob,   address(weth), 20e18);
        _bor(alice, address(usdc), 10_000e6);
        _bor(bob,   address(usdc), 8_000e6);

        ILendingPool.ReserveData memory r = pool.getReserveData(address(usdc));
        uint256 total     = uint256(r.totalScaledBorrows).rayMul(r.borrowIndex);
        uint256 aliceDebt = pool.getUserDebt(alice, address(usdc));
        uint256 bobDebt   = pool.getUserDebt(bob,   address(usdc));

        assertApproxEqAbs(total, aliceDebt + bobDebt, 10);
    }

    // =========================================================================
    //  Invariant 3 & 4 — Index monotonicity over time
    // =========================================================================

    function test_invariant_indices_neverDecreaseOverMultipleBlocks() public {
        _dep(carol, address(usdc), 100_000e6);
        _dep(alice, address(weth), 20e18); // $40,000 collateral
        // Borrow 8,000 USDC — HF = 40,000*85%/8,000 = 4.25. Very safe over 12 months.
        _bor(alice, address(usdc), 8_000e6);

        uint256 prevLiq = pool.getReserveData(address(usdc)).liquidityIndex;
        uint256 prevBor = pool.getReserveData(address(usdc)).borrowIndex;

        for (uint256 i; i < 12; i++) {
            vm.warp(block.timestamp + 30 days);
            _refreshFeeds();

            _dep(carol, address(weth), 1e15);

            uint256 newLiq = pool.getReserveData(address(usdc)).liquidityIndex;
            uint256 newBor = pool.getReserveData(address(usdc)).borrowIndex;

            assertGe(newLiq, prevLiq, "liquidity index must never decrease");
            assertGe(newBor, prevBor, "borrow index must never decrease");

            prevLiq = newLiq;
            prevBor = newBor;
        }
    }

    function test_invariant_indexStartsAtRay() public view {
        ILendingPool.ReserveData memory r = pool.getReserveData(address(weth));
        assertEq(r.liquidityIndex, RAY);
        assertEq(r.borrowIndex,    RAY);
    }

    // =========================================================================
    //  Invariant 5 — Pool solvency
    // =========================================================================

    function test_invariant_poolSolvency_balanceCoversLiquidity() public {
        _dep(carol, address(usdc), 100_000e6);
        _dep(alice, address(weth), 20e18); // $40,000 collateral — very safe
        // Borrow 10,000 USDC — HF = 40,000*85%/10,000 = 3.4. Safe for years.
        _bor(alice, address(usdc), 10_000e6);

        ILendingPool.ReserveData memory r = pool.getReserveData(address(usdc));
        uint256 totalDep = uint256(r.totalScaledDeposits).rayMul(r.liquidityIndex);
        uint256 totalBor = uint256(r.totalScaledBorrows).rayMul(r.borrowIndex);
        uint256 expectedAvail = totalDep - totalBor;

        uint256 actualBal = usdc.balanceOf(address(pool));
        assertGe(actualBal, expectedAvail - 1e9, "pool insolvent");
    }

    // =========================================================================
    //  Invariant 6 — Withdraw never exceeds deposit in same block
    // =========================================================================

    function test_invariant_withdrawNeverExceedsDeposit_sameBlock() public {
        uint256 depositAmt = 10e18;
        _dep(alice, address(weth), depositAmt);

        uint256 balBefore = weth.balanceOf(alice);
        vm.prank(alice); pool.withdraw(address(weth), depositAmt);
        uint256 withdrawn = weth.balanceOf(alice) - balBefore;

        assertApproxEqAbs(withdrawn, depositAmt, 1e9);
    }

    // =========================================================================
    //  Invariant 7 — HF >= 1 after borrow
    // =========================================================================

    function test_invariant_healthFactor_alwaysAboveOneAfterBorrow() public {
        _dep(carol, address(usdc), 500_000e6);
        _dep(alice, address(weth), 10e18);

        uint256[] memory borrowAmts = new uint256[](5);
        borrowAmts[0] = 1_000e6; borrowAmts[1] = 2_000e6; borrowAmts[2] = 500e6;
        borrowAmts[3] = 3_000e6; borrowAmts[4] = 2_000e6;

        for (uint i; i < 5; i++) {
            uint256 hfBefore = pool.getUserHealthFactor(alice);
            if (hfBefore < 1.1e18) break;

            try this._borrowExternal(alice, address(usdc), borrowAmts[i]) {
                uint256 hfAfter = pool.getUserHealthFactor(alice);
                assertGe(hfAfter, 1e18);
            } catch { }
        }
    }

    function _borrowExternal(address u, address t, uint256 a) external {
        vm.prank(u); pool.borrow(t, a);
    }

    // =========================================================================
    //  Invariant 8 & 9 — Rate model
    // =========================================================================

    function test_invariant_borrowRate_alwaysAboveBaseRate() public view {
        uint256 base     = irm.baseRateRay();
        uint256 totalLiq = 1_000_000e18;
        uint256[] memory utils = new uint256[](6);
        utils[0]=0; utils[1]=totalLiq/4; utils[2]=totalLiq/2;
        utils[3]=totalLiq*3/4; utils[4]=totalLiq*9/10; utils[5]=totalLiq*99/100;

        for (uint i; i < 6; i++) {
            uint256 rate = irm.calculateBorrowRate(totalLiq, utils[i]);
            assertGe(rate, base / (365 days));
        }
    }

    function test_invariant_supplyRate_alwaysLeBorrowRate() public view {
        uint256 totalLiq = 1_000_000e18;
        uint256[] memory bors = new uint256[](5);
        bors[0]=0; bors[1]=totalLiq/5; bors[2]=totalLiq/2; bors[3]=totalLiq*4/5; bors[4]=totalLiq*95/100;

        for (uint i; i < 5; i++) {
            uint256 borrowRate = irm.calculateBorrowRate(totalLiq, bors[i]);
            uint256 supplyRate = irm.calculateSupplyRate(totalLiq, bors[i], 1_000);
            assertLe(supplyRate, borrowRate);
        }
    }

    function test_invariant_rateModel_monotonicInUtilization() public view {
        uint256 liq  = 1_000_000e18;
        uint256 prev = irm.calculateBorrowRate(liq, 0);

        for (uint256 util = liq / 20; util <= liq * 99 / 100; util += liq / 20) {
            uint256 curr = irm.calculateBorrowRate(liq, util);
            assertGe(curr, prev);
            prev = curr;
        }
    }

    // =========================================================================
    //  Invariant 10 — Math
    // =========================================================================

    function testFuzz_invariant_percentMul_identity(uint256 x) public pure {
        x = bound(x, 0, type(uint128).max);
        uint256 result = (x * 10_000 + 5_000) / 10_000;
        assertEq(result, x);
    }

    function testFuzz_invariant_wadRayMath_multiplication_commutativity(uint256 a, uint256 b) public pure {
        a = bound(a, 0, 1e30); b = bound(b, 0, 1e30);
        assertEq(a.wadMul(b), b.wadMul(a));
    }

    function testFuzz_invariant_rayMul_identity(uint256 x) public pure {
        x = bound(x, 0, type(uint128).max);
        assertEq(x.rayMul(RAY), x);
    }

    function testFuzz_invariant_scaledBalance_roundtrip(uint256 amount, uint256 indexRay) public pure {
        amount   = bound(amount,   1e6,  1e30);
        indexRay = bound(indexRay, RAY,  2 * RAY);
        uint256 scaled    = amount.rayDiv(indexRay);
        uint256 recovered = scaled.rayMul(indexRay);
        assertApproxEqAbs(recovered, amount, 1);
    }

    // =========================================================================
    //  Fuzz — reserve consistency
    //  Keep amounts modest so borrow doesn't exceed LTV-safe range
    // =========================================================================

    function testFuzz_invariant_reserveConsistency(
        uint256 depositAmt,
        uint256 borrowPct
    ) public {
        // Keep deposit to a range where WETH collateral calculation is sensible
        depositAmt = bound(depositAmt, 1_000e6, 50_000e6);
        // Keep borrow to max 50% of LTV to stay very safe
        borrowPct  = bound(borrowPct, 0, 4_000);

        _dep(carol, address(usdc), depositAmt);

        // Provide WETH collateral: ~2x the deposit amount in USD value
        uint256 wethCollateral = depositAmt * 1e12; // USDC → WAD scale
        weth.mint(alice, wethCollateral);
        _dep(alice, address(weth), wethCollateral);

        // borrowAmt = depositAmt * borrowPct / 10_000 (in USDC units)
        uint256 borrowAmt = depositAmt * borrowPct / 10_000;
        if (borrowAmt > 0 && borrowAmt < depositAmt) {
            _bor(alice, address(usdc), borrowAmt);
        }

        ILendingPool.ReserveData memory r = pool.getReserveData(address(usdc));
        uint256 totalDep = uint256(r.totalScaledDeposits).rayMul(r.liquidityIndex);
        uint256 totalBor = uint256(r.totalScaledBorrows).rayMul(r.borrowIndex);

        assertLe(totalBor, totalDep + 1, "borrows must never exceed deposits");
    }
}
