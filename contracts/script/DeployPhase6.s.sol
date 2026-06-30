// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {SecurityHardening} from "../src/security/SecurityHardening.sol";
import {MulticallBatch}    from "../src/utils/MulticallBatch.sol";

/**
 * @title DeployPhase6
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Deploys Phase 6 contracts to Sepolia
 *
 * Run:
 *   forge script script/DeployPhase6.s.sol \
 *     --rpc-url $SEPOLIA_RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $ETHERSCAN_API_KEY \
 *     -vvvv
 *
 *   - SecurityHardening: per-asset pause, commit-reveal liquidations, rate limits
 *   - MulticallBatch: batch protocol calls in one tx
 *   - GasBenchmark: test-only, not deployed
 */
contract DeployPhase6 is Script {

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerKey);

        // 6.2 SecurityHardening
        SecurityHardening sec = new SecurityHardening(deployer);
        console2.log("SecurityHardening:", address(sec));

        // 6.3 MulticallBatch (no constructor args)
        MulticallBatch mc = new MulticallBatch();
        console2.log("MulticallBatch:", address(mc));

        vm.stopBroadcast();

        console2.log("\n=== PHASE 6 DEPLOYMENT SUMMARY ===");
        console2.log("SecurityHardening:", address(sec));
        console2.log("MulticallBatch:   ", address(mc));
    }
}
