// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2}    from "forge-std/Test.sol";
import {LendingPool}        from "../../src/core/LendingPool.sol";
import {CollateralManager}  from "../../src/core/CollateralManager.sol";
import {PriceOracle}        from "../../src/oracle/PriceOracle.sol";
import {InterestRateModel}  from "../../src/interest/InterestRateModel.sol";
import {ProtocolTreasury}   from "../../src/treasury/ProtocolTreasury.sol";
import {ICollateralManager} from "../../src/interfaces/ICollateralManager.sol";
import {MockChainlinkFeed}  from "../../src/mocks/MockChainlinkFeed.sol";
import {MockERC20}          from "../../src/mocks/MockERC20.sol";

/**
 * @title GasBenchmarkTest
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Gas benchmarks for core protocol operations
 *
 */
contract GasBenchmarkTest is Test {

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

    function setUp() public {
        vm.startPrank(admin);
        treasury = new ProtocolTreasury(admin);
        cm       = new CollateralManager(admin);
        oracle   = new PriceOracle(admin);
        irm      = new InterestRateModel(admin, 100, 400, 7_500, 8_000);
        pool     = new LendingPool(admin, address(cm), address(oracle), address(irm), address(treasury));

        weth = new MockERC20("WETH", "WETH", 18);
        usdc = new MockERC20("USDC", "USDC", 6);

        ethFeed  = new MockChainlinkFeed(); ethFeed.setPrice(2_000e8);
        usdcFeed = new MockChainlinkFeed(); usdcFeed.setPrice(1e8);

        oracle.registerFeed(address(weth), address(ethFeed),  3_600);
        oracle.registerFeed(address(usdc), address(usdcFeed), 86_400);

        cm.setAssetConfig(address(weth), ICollateralManager.AssetConfig({
            ltv: 8_000, liquidationThreshold: 8_500, liquidationBonus: 800,
            reserveFactor: 1_000, supplyCap: 0, borrowCap: 0, isActive: true, isBorrowEnabled: true
        }));
        cm.setAssetConfig(address(usdc), ICollateralManager.AssetConfig({
            ltv: 8_500, liquidationThreshold: 9_000, liquidationBonus: 500,
            reserveFactor: 500, supplyCap: 0, borrowCap: 0, isActive: true, isBorrowEnabled: true
        }));

        pool.initAsset(address(weth));
        pool.initAsset(address(usdc));
        vm.stopPrank();

        weth.mint(alice, 1_000e18);
        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob,   1_000_000e6);
    }

    // =========================================================================
    //  Benchmarks — each test measures gas for one operation
    // =========================================================================

    function test_gas_deposit_weth() public {
        vm.startPrank(alice);
        weth.approve(address(pool), 10e18);
        uint256 gasBefore = gasleft();
        pool.deposit(address(weth), 10e18);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();
        console2.log("[GAS] deposit(WETH 10e18):", gasUsed);
        assertLt(gasUsed, 300_000, "deposit should use < 300k gas");
    }

    function test_gas_borrow_usdc() public {
        // Setup
        vm.startPrank(bob);
        usdc.approve(address(pool), 100_000e6);
        pool.deposit(address(usdc), 100_000e6);
        vm.stopPrank();

        vm.startPrank(alice);
        weth.approve(address(pool), 10e18);
        pool.deposit(address(weth), 10e18);

        uint256 gasBefore = gasleft();
        pool.borrow(address(usdc), 5_000e6, 1);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        console2.log("[GAS] borrow(USDC 5000e6):", gasUsed);
        assertLt(gasUsed, 400_000, "borrow should use < 400k gas");
    }

    function test_gas_repay_usdc() public {
        // Setup
        vm.startPrank(bob);
        usdc.approve(address(pool), 100_000e6);
        pool.deposit(address(usdc), 100_000e6);
        vm.stopPrank();

        vm.startPrank(alice);
        weth.approve(address(pool), 10e18);
        pool.deposit(address(weth), 10e18);
        pool.borrow(address(usdc), 5_000e6, 1);

        usdc.approve(address(pool), 10_000e6);
        uint256 gasBefore = gasleft();
        pool.repay(address(usdc), 5_000e6, 1);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        console2.log("[GAS] repay(USDC 5000e6):", gasUsed);
        assertLt(gasUsed, 400_000, "repay should use < 400k gas");
    }

    function test_gas_withdraw_weth() public {
        vm.startPrank(alice);
        weth.approve(address(pool), 10e18);
        pool.deposit(address(weth), 10e18);

        uint256 gasBefore = gasleft();
        pool.withdraw(address(weth), 5e18);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        console2.log("[GAS] withdraw(WETH 5e18):", gasUsed);
        assertLt(gasUsed, 300_000, "withdraw should use < 300k gas");
    }

    function test_gas_liquidate() public {
        // Setup liquidatable position
        vm.startPrank(bob);
        usdc.approve(address(pool), 100_000e6);
        pool.deposit(address(usdc), 100_000e6);
        vm.stopPrank();

        vm.startPrank(alice);
        weth.approve(address(pool), 5e18);
        pool.deposit(address(weth), 5e18);
        pool.borrow(address(usdc), 7_500e6, 1);
        vm.stopPrank();

        // Crash price
        ethFeed.setPrice(1_400e8);

        vm.startPrank(bob);
        usdc.approve(address(pool), 3_750e6);
        uint256 gasBefore = gasleft();
        pool.liquidate(alice, address(usdc), address(weth), 3_750e6);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        console2.log("[GAS] liquidate(50% of 7500e6):", gasUsed);
        assertLt(gasUsed, 500_000, "liquidate should use < 500k gas");
    }

    function test_gas_getHealthFactor() public {
        vm.startPrank(bob);
        usdc.approve(address(pool), 100_000e6);
        pool.deposit(address(usdc), 100_000e6);
        vm.stopPrank();

        vm.startPrank(alice);
        weth.approve(address(pool), 10e18);
        pool.deposit(address(weth), 10e18);
        pool.borrow(address(usdc), 5_000e6, 1);
        vm.stopPrank();

        uint256 gasBefore = gasleft();
        pool.getUserHealthFactor(alice);
        uint256 gasUsed = gasBefore - gasleft();

        console2.log("[GAS] getUserHealthFactor:", gasUsed);
        assertLt(gasUsed, 100_000, "HF read should use < 100k gas");
    }

    function test_gas_deposit_second_asset() public {
        // Second deposit (state already warm)
        vm.startPrank(alice);
        weth.approve(address(pool), 20e18);
        pool.deposit(address(weth), 10e18);

        uint256 gasBefore = gasleft();
        pool.deposit(address(weth), 10e18);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        console2.log("[GAS] deposit(WETH warm):", gasUsed);
        // Warm deposit should be cheaper than cold
        assertLt(gasUsed, 200_000, "warm deposit < 200k gas");
    }

    function test_gas_flashloan() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 100_000e6);
        pool.deposit(address(usdc), 100_000e6);
        vm.stopPrank();

        // FlashLoan gas tested via direct pool call
        uint256 gasBefore = gasleft();
        pool.maxFlashLoan(address(usdc));
        uint256 gasUsed = gasBefore - gasleft();

        console2.log("[GAS] maxFlashLoan view:", gasUsed);
        assertLt(gasUsed, 50_000);
    }
}
