// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CollateralManager}  from "../src/core/CollateralManager.sol";
import {LendingPool}        from "../src/core/LendingPool.sol";
import {PriceOracle}        from "../src/oracle/PriceOracle.sol";
import {ICollateralManager} from "../src/interfaces/ICollateralManager.sol";

/**
 * @title  SetupAssets
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Registers Chainlink feeds and configures WETH, USDC, LINK on Sepolia.
 *
 * NOTE: WBTC is excluded — there is no standard WBTC ERC-20 deployed on Sepolia
 * testnet (the address 0x8f3C... is a Polygon mainnet address, not Sepolia).
 * WBTC can be added later by deploying a mock WBTC or when Aave/other protocols
 * deploy a canonical WBTC on Sepolia.
 *
 * Usage:
 *   export LENDING_POOL_ADDRESS=0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0
 *   export COLLATERAL_MANAGER_ADDRESS=0x2BA6Be87c33acec211B16163997f66aecf73F467
 *   export PRICE_ORACLE_ADDRESS=0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc
 *
 *   forge script script/SetupAssets.s.sol --rpc-url $SEPOLIA_RPC_URL \
 *     --private-key $PRIVATE_KEY --broadcast -vvvv
 */
contract SetupAssets is Script {

    // ── Sepolia Chainlink price feeds ─────────────────────────────────────────
    // Source: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1
    address constant WETH_USD_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant USDC_USD_FEED = 0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E;
    address constant LINK_USD_FEED = 0xc59E3633BAAC79493d908e63626716e204A45EdF;

    // ── Sepolia ERC-20 token addresses ────────────────────────────────────────
    // WETH — Aave Sepolia test WETH (has decimals() and symbol())
    address constant WETH = 0xdd13E55209Fd76AfE204dBda4007C227904f0a81;
    // USDC — Aave Sepolia test USDC (6 decimals)
    address constant USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
    // LINK — Chainlink official Sepolia LINK (18 decimals)
    address constant LINK = 0x779877A7B0D9E8603169DdbD7836e478b4624789;

    function run() external {
        address deployer  = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
        uint256 pk        = vm.envUint("PRIVATE_KEY");
        address poolAddr  = vm.envAddress("LENDING_POOL_ADDRESS");
        address cmAddr    = vm.envAddress("COLLATERAL_MANAGER_ADDRESS");
        address oracleAddr = vm.envAddress("PRICE_ORACLE_ADDRESS");

        LendingPool       pool   = LendingPool(poolAddr);
        CollateralManager cm     = CollateralManager(cmAddr);
        PriceOracle       oracle = PriceOracle(oracleAddr);

        console2.log("=== Setting up 3 assets on Sepolia (chain", block.chainid, ") ===");
        console2.log("Deployer:", deployer);
        console2.log("Pool:    ", poolAddr);

        vm.startBroadcast(pk);

        // ── 1. Register Chainlink feeds ──────────────────────────────────────
        // WETH/USDC/LINK feeds are live on Sepolia
        oracle.registerFeed(WETH, WETH_USD_FEED, 3_600);   // 1-hour heartbeat
        oracle.registerFeed(USDC, USDC_USD_FEED, 86_400);  // 24-hour heartbeat (stablecoin)
        oracle.registerFeed(LINK, LINK_USD_FEED, 3_600);
        console2.log("3 feeds registered (WETH, USDC, LINK)");

        // ── 2. Configure risk parameters ─────────────────────────────────────

        // WETH — blue-chip, 80% LTV, 85% liquidation threshold
        cm.setAssetConfig(WETH, ICollateralManager.AssetConfig({
            ltv:                  8_000,
            liquidationThreshold: 8_500,
            liquidationBonus:     800,
            reserveFactor:        1_000,
            isActive:             true,
            isBorrowEnabled:      true
        }));

        // USDC — stablecoin, high LTV, low liquidation bonus
        cm.setAssetConfig(USDC, ICollateralManager.AssetConfig({
            ltv:                  8_500,
            liquidationThreshold: 9_000,
            liquidationBonus:     500,
            reserveFactor:        500,
            isActive:             true,
            isBorrowEnabled:      true
        }));

        // LINK — more volatile, conservative LTV
        cm.setAssetConfig(LINK, ICollateralManager.AssetConfig({
            ltv:                  6_500,
            liquidationThreshold: 7_000,
            liquidationBonus:     1_000,
            reserveFactor:        1_000,
            isActive:             true,
            isBorrowEnabled:      true
        }));
        console2.log("Risk parameters configured");

        // ── 3. Initialise assets in pool (deploys lTokens) ───────────────────
        pool.initAsset(WETH);
        pool.initAsset(USDC);
        pool.initAsset(LINK);
        console2.log("Assets initialised in LendingPool");

        vm.stopBroadcast();

        // ── Print lToken addresses for .env.local ────────────────────────────
        console2.log("");
        console2.log("=== Add to frontend/.env.local ===");
        console2.log("NEXT_PUBLIC_LWETH=", pool.getReserveData(WETH).lTokenAddress);
        console2.log("NEXT_PUBLIC_LUSDC=", pool.getReserveData(USDC).lTokenAddress);
        console2.log("NEXT_PUBLIC_LLINK=", pool.getReserveData(LINK).lTokenAddress);
        console2.log("");
        
    }
}
