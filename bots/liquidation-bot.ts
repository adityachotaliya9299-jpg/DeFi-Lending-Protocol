/**
 * LendFi Liquidation Bot
 * ======================
 * Monitors all active borrowers every 15 seconds. When a position's
 * health factor drops below 1.0, it executes a liquidation.
 *
 * Strategy:
 *   1. Discover all borrowers via The Graph subgraph (borrowCount > 0)
 *   2. Batch-call getUserHealthFactor for all borrowers
 *   3. If HF < 1.05: add to watch list (monitor closely)
 *   4. If HF < 1.0:  execute liquidate()
 *
 */

import { createPublicClient, createWalletClient, http, formatUnits,
         parseUnits, getContract, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// ── Config ────────────────────────────────────────────────────────────────────

const CONFIG = {
  rpcUrl:          process.env.SEPOLIA_RPC_URL ?? "",
  privateKey:      process.env.BOT_PRIVATE_KEY as `0x${string}` | undefined,
  lendingPool:    (process.env.LENDING_POOL   ?? "0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0") as Address,
  subgraphUrl:     process.env.SUBGRAPH_URL   ?? "",
  pollIntervalMs:  15_000,    // 15 seconds
  watchThreshold:  1.05,      // HF below this → watch closely
  liquidateThreshold: 1.0,    // HF below this → liquidate
  minProfitUsd:    5,         // Minimum USD profit to bother liquidating
  maxGasGwei:      50,        // Skip if gas > 50 gwei
} as const;

// ── ABIs (minimal) ────────────────────────────────────────────────────────────

const POOL_ABI = [
  {
    name: "getUserHealthFactor", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getUserAccountData", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralUsd",  type: "uint256" },
      { name: "totalDebtUsd",        type: "uint256" },
      { name: "healthFactor",        type: "uint256" },
      { name: "availableBorrowUsd",  type: "uint256" },
    ],
  },
  {
    name: "liquidate", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "borrower",        type: "address" },
      { name: "debtAsset",       type: "address" },
      { name: "collateralAsset", type: "address" },
      { name: "debtAmount",      type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getReserveData", type: "function", stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "liquidityIndex",      type: "uint128" },
      { name: "borrowIndex",         type: "uint128" },
      { name: "totalScaledDeposits", type: "uint256" },
      { name: "totalScaledBorrows",  type: "uint256" },
      { name: "lastUpdateTimestamp", type: "uint40"  },
      { name: "lTokenAddress",       type: "address" },
      { name: "isActive",            type: "bool"    },
      { name: "isBorrowEnabled",     type: "bool"    },
    ]}],
  },
  {
    name: "getUserDebt", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }, { name: "asset", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "decimals", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint8" }] },
] as const;

// ── Supported assets (Sepolia) ────────────────────────────────────────────────

const ASSETS: Record<string, Address> = {
  WETH: "0xdd13E55209Fd76AfE204dBda4007C227904f0a81",
  USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
  LINK: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface BorrowerPosition {
  address:         Address;
  healthFactor:    number;
  totalDebtUsd:    number;
  totalCollUsd:    number;
  debtByAsset:     Record<string, bigint>;
  collByAsset:     Record<string, bigint>;
  lastChecked:     number;
}

interface LiquidationOpportunity {
  borrower:        Address;
  debtAsset:       Address;
  debtAssetSymbol: string;
  collAsset:       Address;
  collAssetSymbol: string;
  repayAmount:     bigint;
  hf:              number;
  estimatedProfitUsd: number;
}

// ── State ─────────────────────────────────────────────────────────────────────

const watchList  = new Map<Address, BorrowerPosition>();
const liquidated = new Set<string>(); // txHash of successful liquidations
let   cycleCount = 0;

// ── Clients ───────────────────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain:     sepolia,
  transport: http(CONFIG.rpcUrl || "https://rpc.sepolia.org"),
});

const account = CONFIG.privateKey
  ? privateKeyToAccount(CONFIG.privateKey)
  : null;

const walletClient = account
  ? createWalletClient({ account, chain: sepolia, transport: http(CONFIG.rpcUrl) })
  : null;

// ── Subgraph: fetch all active borrowers ──────────────────────────────────────

async function fetchBorrowersFromSubgraph(): Promise<Address[]> {
  if (!CONFIG.subgraphUrl) {
    console.log("  [subgraph] No SUBGRAPH_URL set — using hardcoded test addresses");
    return [];
  }

  const query = `{
    accounts(where: { borrowCount_gt: 0 }, first: 1000, orderBy: id) {
      id
    }
  }`;

  try {
    const res = await fetch(CONFIG.subgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as any;
    const borrowers = (json?.data?.accounts ?? []).map((a: any) => a.id as Address);
    console.log(`  [subgraph] Found ${borrowers.length} active borrowers`);
    return borrowers;
  } catch (err: any) {
    console.warn(`  [subgraph] Query failed: ${err.message}`);
    return [];
  }
}

// ── Check health factors ──────────────────────────────────────────────────────

async function checkHealthFactors(borrowers: Address[]): Promise<BorrowerPosition[]> {
  if (borrowers.length === 0) return [];

  console.log(`  [check] Fetching HF for ${borrowers.length} positions...`);

  // Batch multicall — all at once
  const calls = borrowers.map(addr => ({
    address: CONFIG.lendingPool,
    abi:     POOL_ABI,
    functionName: "getUserAccountData" as const,
    args:    [addr] as const,
  }));

  const results = await publicClient.multicall({ contracts: calls });

  const positions: BorrowerPosition[] = [];

  for (let i = 0; i < borrowers.length; i++) {
    const res = results[i];
    if (res.status === "failure") continue;

    const [totalCollWad, totalDebtWad, hfRaw] = res.result as readonly bigint[];
    const MAX_HF = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

    if (hfRaw === MAX_HF) continue; // No borrows

    const hf             = Number(hfRaw) / 1e18;
    const totalCollUsd   = Number(totalCollWad) / 1e18;
    const totalDebtUsd   = Number(totalDebtWad) / 1e18;

    positions.push({
      address:     borrowers[i],
      healthFactor:hf,
      totalDebtUsd,
      totalCollUsd,
      debtByAsset: {},
      collByAsset: {},
      lastChecked: Date.now(),
    });
  }

  return positions;
}

// ── Find best liquidation opportunity for a position ─────────────────────────

async function findLiqOpportunity(
  pos: BorrowerPosition
): Promise<LiquidationOpportunity | null> {

  // Find largest debt asset
  let maxDebt    = 0n;
  let debtAsset: Address | null = null;
  let debtSymbol = "";

  for (const [sym, addr] of Object.entries(ASSETS)) {
    try {
      const debt = await publicClient.readContract({
        address: CONFIG.lendingPool, abi: POOL_ABI,
        functionName: "getUserDebt", args: [pos.address, addr],
      }) as bigint;
      if (debt > maxDebt) { maxDebt = debt; debtAsset = addr; debtSymbol = sym; }
    } catch {}
  }

  if (!debtAsset || maxDebt === 0n) return null;

  // Use a different asset as collateral (simplified — find first non-debt asset)
  const collSymbol = Object.keys(ASSETS).find(s => s !== debtSymbol) ?? "WETH";
  const collAsset  = ASSETS[collSymbol];

  // 50% close factor — repay half
  const decimals    = debtSymbol === "USDC" ? 6 : 18;
  const repayAmount = maxDebt / 2n;

  // Estimated profit: 8% liquidation bonus on repaid amount
  const debtUsd          = Number(formatUnits(repayAmount, decimals));
  const estimatedProfit  = debtUsd * 0.08; // 8% bonus

  return {
    borrower:           pos.address,
    debtAsset,
    debtAssetSymbol:    debtSymbol,
    collAsset,
    collAssetSymbol:    collSymbol,
    repayAmount,
    hf:                 pos.healthFactor,
    estimatedProfitUsd: estimatedProfit,
  };
}

// ── Execute liquidation ───────────────────────────────────────────────────────

async function executeLiquidation(opp: LiquidationOpportunity): Promise<boolean> {
  if (!walletClient || !account) {
    console.log(`  [liq] SIMULATION ONLY (no BOT_PRIVATE_KEY set)`);
    console.log(`  [liq] Would liquidate: ${opp.borrower.slice(0,8)}…`);
    console.log(`  [liq] Repay: ${formatUnits(opp.repayAmount, opp.debtAssetSymbol==="USDC"?6:18)} ${opp.debtAssetSymbol}`);
    console.log(`  [liq] Est profit: $${opp.estimatedProfitUsd.toFixed(2)}`);
    return true; // Simulate success
  }

  // Check gas price
  const feeData    = await publicClient.estimateFeesPerGas();
  const gasPriceGwei = Number(feeData.maxFeePerGas ?? 0n) / 1e9;
  if (gasPriceGwei > CONFIG.maxGasGwei) {
    console.warn(`  [liq] Gas too high: ${gasPriceGwei.toFixed(1)} gwei > ${CONFIG.maxGasGwei} gwei limit`);
    return false;
  }

  try {
    // 1. Approve repay asset to pool
    const botUSDC = await publicClient.readContract({
      address: opp.debtAsset, abi: ERC20_ABI,
      functionName: "balanceOf", args: [account.address],
    }) as bigint;

    if (botUSDC < opp.repayAmount) {
      console.warn(`  [liq] Insufficient ${opp.debtAssetSymbol} balance for liquidation`);
      console.warn(`  [liq] Have: ${formatUnits(botUSDC, opp.debtAssetSymbol==="USDC"?6:18)}, Need: ${formatUnits(opp.repayAmount, opp.debtAssetSymbol==="USDC"?6:18)}`);
      return false;
    }

    const approveTx = await walletClient.writeContract({
      address: opp.debtAsset, abi: ERC20_ABI,
      functionName: "approve", args: [CONFIG.lendingPool, opp.repayAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // 2. Execute liquidation
    const liqTx = await walletClient.writeContract({
      address: CONFIG.lendingPool, abi: POOL_ABI,
      functionName: "liquidate",
      args: [opp.borrower, opp.debtAsset, opp.collAsset, opp.repayAmount],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: liqTx });
    console.log(`  ✅ Liquidation confirmed! Block: ${receipt.blockNumber}`);
    console.log(`  TX: https://sepolia.etherscan.io/tx/${liqTx}`);
    liquidated.add(liqTx);
    return true;

  } catch (err: any) {
    console.error(`  ❌ Liquidation failed: ${err.message?.slice(0,100)}`);
    return false;
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function runCycle() {
  cycleCount++;
  const ts = new Date().toISOString();
  console.log(`\n${"─".repeat(60)}`);
  console.log(`[${ts}] Cycle #${cycleCount}`);

  // 1. Discover borrowers
  const borrowers = await fetchBorrowersFromSubgraph();

  if (borrowers.length === 0) {
    console.log("  [info] No borrowers found. Set SUBGRAPH_URL to discover positions.");
    return;
  }

  // 2. Check health factors
  const positions = await checkHealthFactors(borrowers);

  // 3. Categorise
  const atRisk    = positions.filter(p => p.healthFactor < CONFIG.watchThreshold && p.healthFactor > CONFIG.liquidateThreshold);
  const toLiquidate = positions.filter(p => p.healthFactor < CONFIG.liquidateThreshold);

  console.log(`  [summary] ${positions.length} positions checked`);
  console.log(`  [summary] ${atRisk.length} at risk (HF ${CONFIG.liquidateThreshold}–${CONFIG.watchThreshold})`);
  console.log(`  [summary] ${toLiquidate.length} liquidatable (HF < ${CONFIG.liquidateThreshold})`);

  // 4. Log at-risk positions
  for (const pos of atRisk) {
    console.log(`  ⚠️  AT RISK  ${pos.address.slice(0,8)}… HF=${pos.healthFactor.toFixed(4)} debt=$${pos.totalDebtUsd.toFixed(0)}`);
    watchList.set(pos.address, pos);
  }

  // 5. Execute liquidations
  for (const pos of toLiquidate) {
    console.log(`  🔴 LIQUIDATABLE ${pos.address.slice(0,8)}… HF=${pos.healthFactor.toFixed(4)}`);

    const opp = await findLiqOpportunity(pos);
    if (!opp) { console.log("  [liq] Could not build opportunity"); continue; }
    if (opp.estimatedProfitUsd < CONFIG.minProfitUsd) {
      console.log(`  [liq] Skipping — profit $${opp.estimatedProfitUsd.toFixed(2)} < min $${CONFIG.minProfitUsd}`);
      continue;
    }

    await executeLiquidation(opp);
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         LendFi Liquidation Bot — Starting                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`Chain:         Sepolia`);
  console.log(`LendingPool:   ${CONFIG.lendingPool}`);
  console.log(`Poll interval: ${CONFIG.pollIntervalMs/1000}s`);
  console.log(`Wallet:        ${account?.address ?? "SIMULATION MODE (no key)"}`);
  console.log(`Subgraph:      ${CONFIG.subgraphUrl || "NOT SET — add SUBGRAPH_URL to .env"}`);
  console.log("");

  if (!account) {
    console.log("⚠️  Running in SIMULATION MODE — set BOT_PRIVATE_KEY in .env to enable real liquidations");
  }

  // Run immediately then on interval
  await runCycle();
  setInterval(runCycle, CONFIG.pollIntervalMs);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});