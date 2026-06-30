// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CrossChainMessenger}  from "../src/crosschain/CrossChainMessenger.sol";
import {YieldVault}           from "../src/vault/YieldVault.sol";
import {LoopStrategy}         from "../src/leverage/LoopStrategy.sol";
import {RiskGovernance}       from "../src/governance/RiskGovernance.sol";
import {RevenueDistributor}   from "../src/revenue/RevenueDistributor.sol";

import {IRSwap}                    from "../src/derivatives/IRSwap.sol";
import {TrancheVault}              from "../src/tranches/TrancheVault.sol";
import {LiquidationPathFinder}     from "../src/liquidation/LiquidationPathFinder.sol";
import {NFTCollateralManager}      from "../src/nft/NFTCollateralManager.sol";

import {OracleAggregator}          from "../src/oracle/OracleAggregator.sol";
import {PointsAccounting}          from "../src/points/PointsAccounting.sol";
import {BadDebtSocialisation}      from "../src/core/BadDebtSocialisation.sol";
import {ReserveInterestRateStrategy} from "../src/interest/ReserveInterestRateStrategy.sol";

/**
 * @title DeployPhase4And5
 * @author Aditya Chotaliya [https://adityachotaliya.vercel.app/]
 * @notice Deploys all Phase 3 (new), Phase 4, and Phase 5 contracts to Sepolia
 *
 * Run:
 *   forge script script/DeployPhase4And5.s.sol \
 *     --rpc-url $SEPOLIA_RPC \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $ETHERSCAN_API_KEY \
 *     -vvvv
 *
 * Already deployed (Phase 1-2):
 *   LendingPool:         0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0
 *   CollateralManager:   0x2BA6Be87c33acec211B16163997f66aecf73F467
 *   PriceOracle:         0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc
 *   InterestRateModel:   0x4924f29EDBa2B85dC098E67c1762696456a8b94A
 *   LiquidationEngine:   0x6796313464047CeDcCd4a465A3568F93b38C4c9d
 *   Governance:          0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc
 *   ProtocolTreasury:    0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3
 *   ProtocolStablecoin:  0x233831a3E0Eb8E76570996bA8889C84C59d49D7E
 *   StablecoinVault:     0x1155Ed037e879DD359097ccC9F15821dA1a712ef
 *   GovernanceTimelock:  0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28
 */
contract DeployPhase4And5 is Script {

    // ── Existing deployed addresses ───────────────────────────────────────────
    address constant LENDING_POOL        = 0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0;
    address constant COLLATERAL_MANAGER  = 0x2BA6Be87c33acec211B16163997f66aecf73F467;
    address constant PRICE_ORACLE        = 0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc;
    address constant INTEREST_RATE_MODEL = 0x4924f29EDBa2B85dC098E67c1762696456a8b94A;
    address constant TREASURY            = 0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3;
    address constant GOVERNANCE          = 0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc;
    address constant TIMELOCK            = 0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28;

    // ── Sepolia token addresses ───────────────────────────────────────────────
    address constant WETH = 0xdd13E55209Fd76AfE204dBda4007C227904f0a81;
    address constant USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;
    address constant LINK = 0x779877A7B0D9E8603169DdbD7836e478b4624789;

    // ── LToken addresses (from Phase 1-2 initAsset calls) ────────────────────
  
    address constant WETH_LTOKEN = 0x003A4248a0a8f25C276Bc1ce7F4aa2F0D43eF136;
    address constant USDC_LTOKEN = 0x26f41927B91D564D4F1AeC11b620E617f33F1a06;
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerKey);

        // =====================================================================

        // 3.2 OracleAggregator
        OracleAggregator oracleAgg = new OracleAggregator(deployer);
        console2.log("OracleAggregator:", address(oracleAgg));

        // 3.3 PointsAccounting
        PointsAccounting points = new PointsAccounting(deployer, LENDING_POOL);
        console2.log("PointsAccounting:", address(points));

        // 3.4 BadDebtSocialisation
        BadDebtSocialisation bds = new BadDebtSocialisation(deployer, LENDING_POOL);
        console2.log("BadDebtSocialisation:", address(bds));

        // 3.5 ReserveInterestRateStrategy (USDC params: 80% optimal, 4% slope1, 75% slope2)
        ReserveInterestRateStrategy rateStrategy = new ReserveInterestRateStrategy(
            deployer,
            0.8e27,        // 80% optimal utilization
            0,             // 0% base rate
            1268391679,    // 4% APR slope1 per second (in RAY)
            23782343750,   // 75% APR slope2 per second
            158548959,     // 0.5% stable slope1
            19025875000    // 60% stable slope2
        );
        console2.log("ReserveInterestRateStrategy:", address(rateStrategy));

        // =====================================================================

        // 4.1 CrossChainMessenger (Sepolia = LayerZero chain ID 10161)
        CrossChainMessenger ccm = new CrossChainMessenger(deployer, 10161);
        console2.log("CrossChainMessenger:", address(ccm));

        // 4.2 YieldVault - USDC vault
  
        YieldVault usdcVault;
        if (USDC_LTOKEN != address(0)) {
            usdcVault = new YieldVault(
                USDC,
                USDC_LTOKEN,
                LENDING_POOL,
                TREASURY,
                deployer,
                "LendFi USDC Vault",
                "lfUSDC"
            );
            console2.log("YieldVault (USDC):", address(usdcVault));
        } else {
            console2.log("YieldVault SKIPPED - fill USDC_LTOKEN first");
        }

        // 4.3 LoopStrategy
        LoopStrategy loop = new LoopStrategy(deployer, LENDING_POOL, LENDING_POOL);
        console2.log("LoopStrategy:", address(loop));

        // 4.4 RiskGovernance
        RiskGovernance riskGov = new RiskGovernance(deployer, COLLATERAL_MANAGER, USDC);
        console2.log("RiskGovernance:", address(riskGov));

        // 4.5 RevenueDistributor - 60% stakers, 30% LPs, 10% DAO
        RevenueDistributor revDist = new RevenueDistributor(
            deployer,
            deployer,   // DAO = deployer for now (replace with multisig/timelock)
            USDC,       // Revenue in USDC
            6_000,      // 60% stakers
            3_000,      // 30% LPs
            1_000       // 10% DAO
        );
        console2.log("RevenueDistributor:", address(revDist));

        // =====================================================================

        // 5.1 IRSwap - settlement in USDC
        IRSwap irSwap = new IRSwap(deployer, USDC);
        console2.log("IRSwap:", address(irSwap));

        // Set initial variable rates for WETH and USDC
        irSwap.setVariableRate(WETH, 300); // 3% APR variable
        irSwap.setVariableRate(USDC, 500); // 5% APR variable

        // 5.2 TrancheVault - USDC tranches, 5% target senior yield
        TrancheVault tranche = new TrancheVault(deployer, USDC, 500);
        console2.log("TrancheVault:", address(tranche));
        console2.log("  SeniorToken:", address(tranche.seniorToken()));
        console2.log("  JuniorToken:", address(tranche.juniorToken()));

        // 5.3 LiquidationPathFinder
        LiquidationPathFinder pathFinder = new LiquidationPathFinder(
            deployer,
            LENDING_POOL,
            PRICE_ORACLE,
            COLLATERAL_MANAGER
        );
        console2.log("LiquidationPathFinder:", address(pathFinder));

        // 5.4 NFTCollateralManager - borrow in USDC
        NFTCollateralManager nftCM = new NFTCollateralManager(deployer, USDC);
        console2.log("NFTCollateralManager:", address(nftCM));

        vm.stopBroadcast();

        // =====================================================================
        //  SUMMARY
        // =====================================================================
        console2.log("\n=== DEPLOYMENT SUMMARY ===");
        console2.log("Phase 3 (new):");
        console2.log("  OracleAggregator:            ", address(oracleAgg));
        console2.log("  PointsAccounting:            ", address(points));
        console2.log("  BadDebtSocialisation:        ", address(bds));
        console2.log("  ReserveInterestRateStrategy: ", address(rateStrategy));
        console2.log("Phase 4:");
        console2.log("  CrossChainMessenger:         ", address(ccm));
        console2.log("  LoopStrategy:                ", address(loop));
        console2.log("  RiskGovernance:              ", address(riskGov));
        console2.log("  RevenueDistributor:          ", address(revDist));
        console2.log("Phase 5:");
        console2.log("  IRSwap:                      ", address(irSwap));
        console2.log("  TrancheVault:                ", address(tranche));
        console2.log("  LiquidationPathFinder:       ", address(pathFinder));
        console2.log("  NFTCollateralManager:        ", address(nftCM));
    }
}
