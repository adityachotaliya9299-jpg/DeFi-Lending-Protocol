// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2}    from "forge-std/Script.sol";
import {CreditDelegation}     from "../src/core/CreditDelegation.sol";

contract DeployCreditDelegation is Script {
    // Known Sepolia LendingPool
    address constant LENDING_POOL = 0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0;

    function run() external {
        uint256 pk      = vm.envUint("PRIVATE_KEY");
        address deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);

        console2.log("Deploying CreditDelegation...");
        console2.log("Deployer:     ", deployer);
        console2.log("LendingPool:  ", LENDING_POOL);

        vm.startBroadcast(pk);
        CreditDelegation cd = new CreditDelegation(LENDING_POOL);
        vm.stopBroadcast();

        console2.log("CreditDelegation deployed:", address(cd));
        console2.log("");
        console2.log("=== Add to frontend/.env.local ===");
        console2.log("NEXT_PUBLIC_CREDIT_DELEGATION=", address(cd));
    }
}
