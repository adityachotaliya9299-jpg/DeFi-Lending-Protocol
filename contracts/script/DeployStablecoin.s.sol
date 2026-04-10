// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2}    from "forge-std/Script.sol";
import {ProtocolStablecoin}   from "../src/stablecoin/ProtocolStablecoin.sol";
import {StablecoinVault}      from "../src/stablecoin/StablecoinVault.sol";
import {GovernanceTimelock}   from "../src/governance/GovernanceTimelock.sol";

/**
 * @title  DeployStablecoin
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Deploys ProtocolStablecoin (pUSD) + StablecoinVault + GovernanceTimelock
 *         and wires them together on Sepolia.
 *
 * Prerequisites:
 *   • Main protocol already deployed via Deploy.s.sol
 *   • PriceOracle address known (has WETH feed registered)
 *   • ProtocolTreasury address known
 *
 * Usage:
 *   forge script script/DeployStablecoin.s.sol \
 *     --rpc-url $SEPOLIA_RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $ETHERSCAN_KEY \
 *     -vvvv
 *
 * Required environment variables:
 *   PRIVATE_KEY          — deployer private key
 *   DEPLOYER_ADDRESS     — deployer wallet address
 *   PRICE_ORACLE         — deployed PriceOracle address
 *   PROTOCOL_TREASURY    — deployed ProtocolTreasury address
 *   WETH_SEPOLIA         — WETH address on Sepolia
 *
 * After deployment, copy the output addresses to frontend/.env.local:
 *   NEXT_PUBLIC_PUSD_ADDRESS=...
 *   NEXT_PUBLIC_STABLECOIN_VAULT=...
 *   NEXT_PUBLIC_GOVERNANCE_TIMELOCK=...
 */
contract DeployStablecoin is Script {

    // ── Sepolia constants ─────────────────────────────────────────────────────
    address constant WETH_SEPOLIA = 0xdd13E55209Fd76AfE204dBda4007C227904f0a81;

    function run() external {
        address deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
        uint256 pk       = vm.envUint("PRIVATE_KEY");

        address oracle   = vm.envOr("PRICE_ORACLE",      address(0));
        address treasury = vm.envOr("PROTOCOL_TREASURY", address(0));

        // Fallback to known Sepolia addresses if env not set
        if (oracle   == address(0)) oracle   = 0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc;
        if (treasury == address(0)) treasury = 0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3;

        console2.log("=== pUSD Stablecoin System Deployment ===");
        console2.log("Deployer:  ", deployer);
        console2.log("Chain ID:  ", block.chainid);
        console2.log("Oracle:    ", oracle);
        console2.log("Treasury:  ", treasury);

        vm.startBroadcast(pk);

        // ── 1. Deploy pUSD ERC-20 token ───────────────────────────────────────
        ProtocolStablecoin pUSD = new ProtocolStablecoin(deployer);
        console2.log("ProtocolStablecoin (pUSD):", address(pUSD));

        // ── 2. Deploy StablecoinVault (CDP engine) ────────────────────────────
        StablecoinVault vault = new StablecoinVault(
            deployer,
            address(pUSD),
            oracle,
            treasury
        );
        console2.log("StablecoinVault:          ", address(vault));

        // ── 3. Grant vault MINTER_ROLE on pUSD ────────────────────────────────
        //    Only the vault should be able to mint pUSD — not even the deployer
        //    in normal operation. Deployer keeps MINTER_ROLE for emergency use.
        pUSD.grantRole(pUSD.MINTER_ROLE(), address(vault));
        console2.log("MINTER_ROLE granted to vault");

        // ── 4. Configure WETH as collateral in vault ──────────────────────────
        //
        //    Parameters:
        //      collateralizationRatio: 150% (15_000 bps) — must over-collateralise
        //      liquidationRatio:       130% (13_000 bps) — liquidation trigger
        //      liquidationBonus:        10% (1_000 bps)  — bonus for liquidators
        //      debtCeiling:           1_000_000 pUSD     — max mintable
        //      stabilityFee:           200 bps            — 2% annual
   
        StablecoinVault.CollateralConfig memory wethCfg = StablecoinVault.CollateralConfig({
            collateralizationRatio: 15_000,
            liquidationRatio:       13_000,
            liquidationBonus:       1_000,
            debtCeiling:            1_000_000e18,
            stabilityFeeBps:        200,
            totalDebt:              0,
            isActive:               true
        });
        vault.setCollateralConfig(WETH_SEPOLIA, wethCfg);
        console2.log("WETH collateral configured in vault");

        // ── 5. Deploy GovernanceTimelock (48-hour delay) ──────────────────────
        //
        //    Role assignments:
        //      PROPOSER_ROLE  → deployer (governance multisig in production)
        //      EXECUTOR_ROLE  → deployer (keeper bot in production)
        //      CANCELLER_ROLE → deployer (guardian multisig in production)
        //
        //    In production:
        //      - Transfer PROPOSER_ROLE to DAO/multisig
        //      - Transfer CANCELLER_ROLE to separate guardian multisig
        //      - Renounce DEFAULT_ADMIN_ROLE from deployer
        //
        address[] memory proposers  = new address[](1); proposers[0]  = deployer;
        address[] memory executors  = new address[](1); executors[0]  = deployer;
        address[] memory cancellers = new address[](1); cancellers[0] = deployer;

        GovernanceTimelock timelock = new GovernanceTimelock(
            deployer,
            proposers,
            executors,
            cancellers,
            48 hours
        );
        console2.log("GovernanceTimelock:       ", address(timelock));
        console2.log("  Min delay: 48 hours");

        vm.stopBroadcast();

        // ── Output addresses ──────────────────────────────────────────────────
        console2.log("");
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("");
        console2.log("=== Add to frontend/.env.local ===");
        console2.log("NEXT_PUBLIC_PUSD_ADDRESS=",        address(pUSD));
        console2.log("NEXT_PUBLIC_STABLECOIN_VAULT=",    address(vault));
        console2.log("NEXT_PUBLIC_GOVERNANCE_TIMELOCK=", address(timelock));
        console2.log("");
        console2.log("=== Next steps ===");
        console2.log("1. Verify contracts on Etherscan (--verify flag above)");
        console2.log("2. Update subgraph to index StablecoinVault events");
        console2.log("3. Transfer PROPOSER_ROLE to governance multisig");
        console2.log("4. Consider revoking deployer MINTER_ROLE on pUSD");
    }
}
