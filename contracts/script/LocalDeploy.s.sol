// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CollateralManager}  from "../src/core/CollateralManager.sol";
import {LendingPool}        from "../src/core/LendingPool.sol";
import {LiquidationEngine}  from "../src/core/LiquidationEngine.sol";
import {PriceOracle}        from "../src/oracle/PriceOracle.sol";
import {InterestRateModel}  from "../src/interest/InterestRateModel.sol";
import {ProtocolTreasury}   from "../src/treasury/ProtocolTreasury.sol";
import {Governance}         from "../src/governance/Governance.sol";
import {ICollateralManager} from "../src/interfaces/ICollateralManager.sol";
import {MockChainlinkFeed}  from "../src/mocks/MockChainlinkFeed.sol";
import {MockERC20}          from "../src/mocks/MockERC20.sol";

/**
 * @title  LocalDeploy
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Full local deployment using mock tokens and Chainlink feeds.
 *         Use this for Anvil / local development.
 *
 * Usage:
 *   anvil
 *   forge script script/LocalDeploy.s.sol --rpc-url http://localhost:8545 \
 *     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
 *     --broadcast -vvvv
 *
 * The first Anvil private key is used by default (no env vars needed).
 */
contract LocalDeploy is Script {

    function run() external {
        uint256 pk       = vm.envOr("PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(pk);

        console2.log("=== Local Deploy ===");
        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);

        // ── Mock tokens ───────────────────────────────────────────────────────
        MockERC20 weth = new MockERC20("Wrapped Ether",   "WETH", 18);
        MockERC20 wbtc = new MockERC20("Wrapped Bitcoin", "WBTC", 8);
        MockERC20 usdc = new MockERC20("USD Coin",        "USDC", 6);
        MockERC20 link = new MockERC20("Chainlink",       "LINK", 18);

        // Mint test tokens to deployer
        weth.mint(deployer, 1_000e18);
        wbtc.mint(deployer, 100e8);
        usdc.mint(deployer, 1_000_000e6);
        link.mint(deployer, 100_000e18);

        // ── Mock Chainlink feeds ──────────────────────────────────────────────
        MockChainlinkFeed ethFeed  = new MockChainlinkFeed();
        MockChainlinkFeed btcFeed  = new MockChainlinkFeed();
        MockChainlinkFeed usdcFeed = new MockChainlinkFeed();
        MockChainlinkFeed linkFeed = new MockChainlinkFeed();

        ethFeed.setPrice(2_000e8);
        btcFeed.setPrice(60_000e8);
        usdcFeed.setPrice(1e8);
        linkFeed.setPrice(15e8);

        // ── Core protocol ─────────────────────────────────────────────────────
        ProtocolTreasury   treasury  = new ProtocolTreasury(deployer);
        CollateralManager  cm        = new CollateralManager(deployer);
        PriceOracle        oracle    = new PriceOracle(deployer);
        InterestRateModel  irm       = new InterestRateModel(deployer, 100, 400, 7_500, 8_000);
        LendingPool        pool      = new LendingPool(deployer, address(cm), address(oracle), address(irm), address(treasury));
        LiquidationEngine  liqEngine = new LiquidationEngine(address(pool), address(oracle));
        Governance         governance = new Governance(deployer, address(cm), address(irm));

        // ── Register feeds ────────────────────────────────────────────────────
        oracle.registerFeed(address(weth), address(ethFeed),  3_600);
        oracle.registerFeed(address(wbtc), address(btcFeed),  3_600);
        oracle.registerFeed(address(usdc), address(usdcFeed), 86_400);
        oracle.registerFeed(address(link), address(linkFeed), 3_600);

        // ── Configure assets ──────────────────────────────────────────────────
        cm.setAssetConfig(address(weth), ICollateralManager.AssetConfig({ ltv: 8_000, liquidationThreshold: 8_500, liquidationBonus: 800,   reserveFactor: 1_000, isActive: true, isBorrowEnabled: true }));
        cm.setAssetConfig(address(wbtc), ICollateralManager.AssetConfig({ ltv: 7_500, liquidationThreshold: 8_000, liquidationBonus: 800,   reserveFactor: 1_000, isActive: true, isBorrowEnabled: true }));
        cm.setAssetConfig(address(usdc), ICollateralManager.AssetConfig({ ltv: 8_500, liquidationThreshold: 9_000, liquidationBonus: 500,   reserveFactor: 500,   isActive: true, isBorrowEnabled: true }));
        cm.setAssetConfig(address(link), ICollateralManager.AssetConfig({ ltv: 6_500, liquidationThreshold: 7_000, liquidationBonus: 1_000, reserveFactor: 1_000, isActive: true, isBorrowEnabled: true }));

        // ── Init assets in pool ───────────────────────────────────────────────
        pool.initAsset(address(weth));
        pool.initAsset(address(wbtc));
        pool.initAsset(address(usdc));
        pool.initAsset(address(link));

        // ── Wire governance ───────────────────────────────────────────────────
        cm.grantRole(cm.CONFIGURATOR_ROLE(), address(governance));
        irm.transferOwnership(address(governance));

        vm.stopBroadcast();

        console2.log("\n=== Addresses (paste into .env.local) ===");
        console2.log("NEXT_PUBLIC_CHAIN_ID=31337");
        console2.log("NEXT_PUBLIC_LENDING_POOL=",        address(pool));
        console2.log("NEXT_PUBLIC_COLLATERAL_MANAGER=",  address(cm));
        console2.log("NEXT_PUBLIC_PRICE_ORACLE=",        address(oracle));
        console2.log("NEXT_PUBLIC_GOVERNANCE=",          address(governance));
        console2.log("NEXT_PUBLIC_LIQUIDATION_ENGINE=",  address(liqEngine));
        console2.log("\n=== Token Addresses ===");
        console2.log("NEXT_PUBLIC_WETH=",  address(weth));
        console2.log("NEXT_PUBLIC_WBTC=",  address(wbtc));
        console2.log("NEXT_PUBLIC_USDC=",  address(usdc));
        console2.log("NEXT_PUBLIC_LINK=",  address(link));
        console2.log("\n=== lToken Addresses ===");
        console2.log("NEXT_PUBLIC_LWETH=", pool.getReserveData(address(weth)).lTokenAddress);
        console2.log("NEXT_PUBLIC_LWBTC=", pool.getReserveData(address(wbtc)).lTokenAddress);
        console2.log("NEXT_PUBLIC_LUSDC=", pool.getReserveData(address(usdc)).lTokenAddress);
        console2.log("NEXT_PUBLIC_LLINK=", pool.getReserveData(address(link)).lTokenAddress);
    }
}
