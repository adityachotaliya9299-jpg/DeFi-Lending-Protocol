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
 * @title  MultiUserTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Simulates realistic multi-user interactions:
 *         - Multiple depositors earning yield
 *         - Multiple borrowers with different risk profiles
 *         - Liquidation cascades
 *         - Interest distribution fairness
 *         - Treasury accumulation over time
 */
contract MultiUserTest is Test {
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
    address internal dave  = makeAddr("dave");
    address internal eve   = makeAddr("eve");

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

        address[5] memory users2 = [alice, bob, carol, dave, eve];
        for (uint256 ui; ui < 5; ui++) {
            address u = users2[ui];
            weth.mint(u, 1_000e18);
            usdc.mint(u, 1_000_000e6);
        }
    }

    function _deposit(address user, address token, uint256 amt) internal {
        vm.startPrank(user); MockERC20(token).approve(address(pool), amt);
        pool.deposit(token, amt); vm.stopPrank();
    }
    function _borrow(address user, address token, uint256 amt) internal {
        vm.prank(user); pool.borrow(token, amt);
    }
    function _repay(address user, address token, uint256 amt) internal {
        vm.startPrank(user); MockERC20(token).approve(address(pool), amt);
        pool.repay(token, amt); vm.stopPrank();
    }

    /// @dev Refresh oracle feeds after vm.warp to prevent staleness reverts.
    function _refreshFeeds() internal {
        ethFeed.setUpdatedAt(block.timestamp);
        usdcFeed.setUpdatedAt(block.timestamp);
    }

    // =========================================================================
    //  Multiple depositors — yield distribution
    // =========================================================================

    function test_multiDeposit_yieldProportionalToAmount() public {
        // Carol deposits 3x Alice. Both earn interest from Bob's borrow.
        _deposit(carol, address(usdc), 30_000e6);
        _deposit(alice, address(usdc), 10_000e6);

        // Bob borrows 30,000 USDC — 75% utilization → meaningful APR
        _deposit(bob, address(weth), 100e18);
        _borrow(bob, address(usdc), 30_000e6);

        vm.warp(block.timestamp + 365 days);
        _refreshFeeds();

        // Trigger accrual
        _deposit(eve, address(usdc), 1);

        uint256 carolBal = pool.getUserDeposit(carol, address(usdc));
        uint256 aliceBal = pool.getUserDeposit(alice, address(usdc));

        // Carol should have ~3x Alice's balance (both earned interest proportionally)
        assertApproxEqRel(carolBal, aliceBal * 3, 0.002e18);
        // Both should have earned more than principal (interest accrued)
        assertGt(carolBal, 30_000e6, "carol should have earned interest");
        assertGt(aliceBal, 10_000e6, "alice should have earned interest");
        console2.log("Carol after 1yr:", carolBal);
        console2.log("Alice after 1yr:", aliceBal);
    }

    function test_multiDeposit_lateDepositorEarnsLess() public {
        _deposit(alice, address(usdc), 10_000e6);
        _deposit(bob,   address(weth), 100e18);
        _borrow(bob, address(usdc), 5_000e6);

        vm.warp(block.timestamp + 180 days);
        _refreshFeeds();

        _deposit(eve, address(usdc), 10_000e6);

        vm.warp(block.timestamp + 180 days);
        _refreshFeeds();

        _deposit(carol, address(usdc), 1);

        uint256 aliceBal = pool.getUserDeposit(alice, address(usdc));
        uint256 eveBal   = pool.getUserDeposit(eve, address(usdc));

        assertGt(aliceBal, eveBal, "early depositor earns more");
    }

    // =========================================================================
    //  Multiple borrowers
    // =========================================================================

    function test_multiBorrow_independentDebtTracking() public {
        _deposit(carol, address(usdc), 200_000e6);
        _deposit(alice, address(weth), 10e18);
        _deposit(bob,   address(weth), 5e18);

        _borrow(alice, address(usdc), 10_000e6);
        _borrow(bob,   address(usdc), 4_000e6);

        assertApproxEqAbs(pool.getUserDebt(alice, address(usdc)), 10_000e6, 100);
        assertApproxEqAbs(pool.getUserDebt(bob,   address(usdc)), 4_000e6,  100);
    }

    function test_multiBorrow_debtGrowsIndependently() public {
        _deposit(carol, address(usdc), 200_000e6);
        _deposit(alice, address(weth), 10e18);
        _deposit(bob,   address(weth), 10e18);

        _borrow(alice, address(usdc), 5_000e6);

        // Warp 30 days — refresh feeds so Bob can borrow without stale oracle
        vm.warp(block.timestamp + 30 days);
        _refreshFeeds();

        _borrow(bob, address(usdc), 5_000e6);

        vm.warp(block.timestamp + 335 days);
        _refreshFeeds();

        _deposit(eve, address(usdc), 1); // trigger accrual

        uint256 aliceDebt = pool.getUserDebt(alice, address(usdc));
        uint256 bobDebt   = pool.getUserDebt(bob,   address(usdc));

        assertGt(aliceDebt, bobDebt, "earlier borrow accrues more interest");
        console2.log("Alice debt (1yr):", aliceDebt);
        console2.log("Bob   debt (~11m):", bobDebt);
    }

    function test_multiBorrow_repaymentDoesNotAffectOthers() public {
        _deposit(carol, address(usdc), 200_000e6);
        _deposit(alice, address(weth), 10e18);
        _deposit(bob,   address(weth), 10e18);

        _borrow(alice, address(usdc), 5_000e6);
        _borrow(bob,   address(usdc), 5_000e6);

        uint256 bobDebtBefore = pool.getUserDebt(bob, address(usdc));
        _repay(alice, address(usdc), type(uint256).max);

        assertApproxEqAbs(pool.getUserDebt(bob, address(usdc)), bobDebtBefore, 1e6);
    }

    // =========================================================================
    //  Treasury accumulation
    // =========================================================================

    function test_treasury_accumulatesReservesOverTime() public {
        _deposit(carol, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 20e18); // $40,000 collateral
        // Borrow 15,000 — HF = 40,000*85%/15,000 = 2.27. Safe for 1 year.
        _borrow(alice, address(usdc), 15_000e6);

        vm.warp(block.timestamp + 365 days);
        _refreshFeeds();

        uint256 treasuryBefore = usdc.balanceOf(address(treasury));

        usdc.mint(alice, 5_000e6); // cover accrued interest
        _repay(alice, address(usdc), type(uint256).max);

        uint256 treasuryAfter = usdc.balanceOf(address(treasury));
        assertGt(treasuryAfter, treasuryBefore, "treasury must accumulate on repayment");
        console2.log("Treasury accumulated:", treasuryAfter - treasuryBefore);
    }

    function test_treasury_accumulatesFromMultipleRepayments() public {
        _deposit(carol, address(usdc), 200_000e6);

        address[3] memory borrowers = [alice, bob, eve];
        for (uint i; i < 3; i++) {
            _deposit(borrowers[i], address(weth), 10e18);
            _borrow(borrowers[i], address(usdc), 8_000e6);
        }

        vm.warp(block.timestamp + 90 days);
        _refreshFeeds();

        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        for (uint i; i < 3; i++) {
            usdc.mint(borrowers[i], 1_000e6);
            _repay(borrowers[i], address(usdc), type(uint256).max);
        }
        assertGt(usdc.balanceOf(address(treasury)), treasuryBefore);
    }

    // =========================================================================
    //  Liquidation cascade
    // =========================================================================

    function test_liquidationCascade_multipleUsersLiquidatable() public {
        _deposit(carol, address(usdc), 500_000e6);

        address[3] memory borrowers = [alice, bob, eve];
        for (uint i; i < 3; i++) {
            _deposit(borrowers[i], address(weth), 5e18);
            _borrow(borrowers[i], address(usdc), 7_000e6);
        }

        ethFeed.setPrice(1_400e8);

        for (uint i; i < 3; i++) {
            assertLt(pool.getUserHealthFactor(borrowers[i]), 1e18);
        }

        for (uint i; i < 3; i++) {
            vm.startPrank(dave);
            usdc.approve(address(pool), 3_500e6);
            pool.liquidate(borrowers[i], address(usdc), address(weth), 3_500e6);
            vm.stopPrank();
        }

        assertGt(weth.balanceOf(dave), 0);
    }

    function test_liquidation_doesNotAffectOtherUsersDeposits() public {
        _deposit(carol, address(usdc), 100_000e6);
        _deposit(alice, address(weth), 5e18);
        _borrow(alice, address(usdc), 7_000e6);

        _deposit(eve, address(usdc), 10_000e6);
        uint256 eveBalBefore = pool.getUserDeposit(eve, address(usdc));

        ethFeed.setPrice(1_400e8);

        vm.startPrank(dave);
        usdc.approve(address(pool), 3_500e6);
        pool.liquidate(alice, address(usdc), address(weth), 3_500e6);
        vm.stopPrank();

        assertApproxEqAbs(pool.getUserDeposit(eve, address(usdc)), eveBalBefore, 1e6);
    }

    // =========================================================================
    //  Full lifecycle
    // =========================================================================

    function test_fullLifecycle_depositBorrowRepayWithdraw() public {
        // 1. Carol provides USDC liquidity
        _deposit(carol, address(usdc), 100_000e6);

        // 2. Alice deposits WETH collateral and borrows USDC
        _deposit(alice, address(weth), 10e18); // $20,000 collateral
        // Borrow at high utilization so interest is non-trivial
        _borrow(alice, address(usdc), 15_000e6); // 15% of pool, good APY

        // 3. Warp 1 year — meaningful interest accumulates
        vm.warp(block.timestamp + 365 days);
        _refreshFeeds();

        // 4. Trigger USDC accrual then check debt has grown
        _deposit(carol, address(usdc), 1); // triggers _accrueInterest on USDC reserve
        uint256 debt = pool.getUserDebt(alice, address(usdc));
        assertGt(debt, 15_000e6, "debt grew with interest");
        console2.log("Debt after 1yr:", debt);

        // 5. Alice repays with interest
        usdc.mint(alice, 5_000e6); // cover accrued interest
        _repay(alice, address(usdc), type(uint256).max);
        assertEq(pool.getUserDebt(alice, address(usdc)), 0);

        // 6. Alice withdraws collateral
        uint256 wethBefore = weth.balanceOf(alice);
        vm.prank(alice); pool.withdraw(address(weth), type(uint256).max);
        assertGt(weth.balanceOf(alice), wethBefore);

        // 7. Carol's deposit grew with interest — verify but don't withdraw all
        //    (reserve cuts reduce pool balance vs accounting balance)
        uint256 carolBal = pool.getUserDeposit(carol, address(usdc));
        assertGt(carolBal, 100_000e6, "Carol earned interest");
        console2.log("Carol deposit after 1yr:", carolBal);
    }

    // =========================================================================
    //  Fuzz — multi-user
    // =========================================================================

    function testFuzz_multiUser_sumOfDebtsIsConsistent(
        uint256 amt1, uint256 amt2, uint256 amt3
    ) public {
        // Keep amounts small so collateral calculation stays valid
        amt1 = bound(amt1, 100e6,  5_000e6);
        amt2 = bound(amt2, 100e6,  5_000e6);
        amt3 = bound(amt3, 100e6,  5_000e6);

        _deposit(carol, address(usdc), 200_000e6);

        address[3] memory borrowers = [alice, bob, eve];
        uint256[3] memory amts = [amt1, amt2, amt3];

        for (uint i; i < 3; i++) {
            // Provide ample WETH collateral: 10e18 per user = $20,000 → safe for any amt in range
            _deposit(borrowers[i], address(weth), 10e18);
            _borrow(borrowers[i], address(usdc), amts[i]);
        }

        ILendingPool.ReserveData memory r = pool.getReserveData(address(usdc));
        uint256 totalBor = uint256(r.totalScaledBorrows).rayMul(r.borrowIndex);

        uint256 sumDebts;
        for (uint i; i < 3; i++) {
            sumDebts += pool.getUserDebt(borrowers[i], address(usdc));
        }

        assertApproxEqAbs(totalBor, sumDebts, 10);
    }
}
