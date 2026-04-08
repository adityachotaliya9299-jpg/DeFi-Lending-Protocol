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

/**
 * @title  Deploy
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Deploys and wires the full DeFi Lending Protocol.
 *
 * Usage — local Anvil:
 *   anvil
 *   forge script script/Deploy.s.sol --rpc-url http://localhost:8545 \
 *     --private-key $PRIVATE_KEY --broadcast -vvvv
 *
 * Usage — Sepolia testnet:
 *   forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL \
 *     --private-key $PRIVATE_KEY --broadcast --verify \
 *     --etherscan-api-key $ETHERSCAN_KEY -vvvv
 *
 * Environment variables required:
 *   DEPLOYER_ADDRESS   — address that will own all contracts
 *   PRIVATE_KEY        — deployer private key (never commit this!)
 *
 * The script outputs a JSON file at broadcast/Deploy.s.sol/<chainid>/run-latest.json
 * with all deployed addresses — import this into the frontend .env.local.
 */
contract Deploy is Script {

    // ── Deployment results — read by SetupAssets.s.sol ──────────────────────
    CollateralManager  public cm;
    PriceOracle        public oracle;
    InterestRateModel  public irm;
    ProtocolTreasury   public treasury;
    LendingPool        public pool;
    LiquidationEngine  public liquidationEngine;
    Governance         public governance;

    function run() external {
        address deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
        uint256 pk       = vm.envUint("PRIVATE_KEY");

        console2.log("=== DeFi Lending Protocol Deployment ===");
        console2.log("Deployer:  ", deployer);
        console2.log("Chain ID:  ", block.chainid);
        console2.log("Block:     ", block.number);

        vm.startBroadcast(pk);

        // ── 1. Protocol Treasury ─────────────────────────────────────────────
        treasury = new ProtocolTreasury(deployer);
        console2.log("ProtocolTreasury:  ", address(treasury));

        // ── 2. Collateral Manager ────────────────────────────────────────────
        cm = new CollateralManager(deployer);
        console2.log("CollateralManager: ", address(cm));

        // ── 3. Price Oracle ──────────────────────────────────────────────────
        oracle = new PriceOracle(deployer);
        console2.log("PriceOracle:       ", address(oracle));

        // ── 4. Interest Rate Model (1% base, 4% slope1, 75% slope2, 80% kink)
        irm = new InterestRateModel(deployer, 100, 400, 7_500, 8_000);
        console2.log("InterestRateModel: ", address(irm));

        // ── 5. Lending Pool ──────────────────────────────────────────────────
        pool = new LendingPool(
            deployer,
            address(cm),
            address(oracle),
            address(irm),
            address(treasury)
        );
        console2.log("LendingPool:       ", address(pool));

        // ── 6. Liquidation Engine ────────────────────────────────────────────
        liquidationEngine = new LiquidationEngine(address(pool), address(oracle));
        console2.log("LiquidationEngine: ", address(liquidationEngine));

        // ── 7. Governance ────────────────────────────────────────────────────
        governance = new Governance(deployer, address(cm), address(irm));
        console2.log("Governance:        ", address(governance));

        // ── 8. Wire roles ────────────────────────────────────────────────────
        // Governance gets CONFIGURATOR_ROLE on CollateralManager
        cm.grantRole(cm.CONFIGURATOR_ROLE(), address(governance));

        // Transfer IRM ownership to Governance
        irm.transferOwnership(address(governance));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment complete ===");
        console2.log("Run SetupAssets.s.sol next to configure assets.");
        _writeAddresses();
    }

    function _writeAddresses() internal view {
        console2.log("");
        console2.log("=== Copy to frontend/.env.local ===");
        console2.log("NEXT_PUBLIC_LENDING_POOL=",        address(pool));
        console2.log("NEXT_PUBLIC_COLLATERAL_MANAGER=",  address(cm));
        console2.log("NEXT_PUBLIC_PRICE_ORACLE=",        address(oracle));
        console2.log("NEXT_PUBLIC_INTEREST_RATE_MODEL=", address(irm));
        console2.log("NEXT_PUBLIC_TREASURY=",            address(treasury));
        console2.log("NEXT_PUBLIC_LIQUIDATION_ENGINE=",  address(liquidationEngine));
        console2.log("NEXT_PUBLIC_GOVERNANCE=",          address(governance));
    }
}
