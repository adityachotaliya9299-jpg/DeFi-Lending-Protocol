"use client";

import { useState } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { LENDING_POOL_ABI, LIQUIDATION_ENGINE_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { formatHealthFactor, healthFactorColor, formatUsd, shortenAddress } from "@/lib/format";
import { useReadContract } from "wagmi";

// ── Liquidation card for a single address ────────────────────────────────────
function LiquidationCard({ borrower }: { borrower: `0x${string}` }) {
  const chainId = useChainId();
  const [debtAsset, setDebtAsset]   = useState(SUPPORTED_ASSETS[2].symbol); // USDC
  const [collAsset, setCollAsset]   = useState(SUPPORTED_ASSETS[0].symbol); // WETH
  const [amount, setAmount]         = useState("");

  let engineAddr: `0x${string}` = "0x0";
  let poolAddr:   `0x${string}` = "0x0";
  try {
    const addrs = getAddresses(chainId);
    engineAddr  = addrs.LIQUIDATION_ENGINE;
    poolAddr    = addrs.LENDING_POOL;
  } catch {}

  const { data: liqData } = useReadContract({
    address: engineAddr,
    abi:     LIQUIDATION_ENGINE_ABI,
    functionName: "getLiquidationData",
    args:    [borrower],
    query:   { enabled: engineAddr !== "0x0" },
  });

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isPending } = useWaitForTransactionReceipt({ hash: txHash });

  if (!liqData) return null;
  const [totalColl, totalDebt, hf, , liquidatable] = liqData;
  if (!liquidatable) return null;

  const debtAssetInfo = SUPPORTED_ASSETS.find(a => a.symbol === debtAsset)!;

  const handleLiquidate = () => {
    if (!amount) return;
    const debtAddr = (() => {
      try {
        const addrs = getAddresses(chainId);
        return (addrs[debtAsset as keyof typeof addrs] as `0x${string}`) ?? "0x0";
      } catch { return "0x0" as `0x${string}`; }
    })();
    const collAddr = (() => {
      try {
        const addrs = getAddresses(chainId);
        return (addrs[collAsset as keyof typeof addrs] as `0x${string}`) ?? "0x0";
      } catch { return "0x0" as `0x${string}`; }
    })();

    const parsedAmount = parseUnits(amount, debtAssetInfo.decimals);

    // Approve then liquidate
    writeContract({
      address: debtAddr,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [poolAddr, parsedAmount],
    });
  };

  return (
    <div className="rounded-2xl border border-red-900/50 bg-slate-900 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 mb-1">Borrower</p>
          <p className="font-mono text-sm text-white">{shortenAddress(borrower)}</p>
        </div>
        <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400 ring-1 ring-red-500/30">
          LIQUIDATABLE
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-slate-800 p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Collateral</p>
          <p className="mt-1 font-bold text-white text-sm">{formatUsd(totalColl)}</p>
        </div>
        <div className="rounded-lg bg-slate-800 p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Debt</p>
          <p className="mt-1 font-bold text-white text-sm">{formatUsd(totalDebt)}</p>
        </div>
        <div className="rounded-lg bg-slate-800 p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Health Factor</p>
          <p className={`mt-1 font-bold text-sm ${healthFactorColor(hf)}`}>
            {formatHealthFactor(hf)}
          </p>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Debt asset to repay</label>
            <select
              value={debtAsset}
              onChange={e => setDebtAsset(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              {SUPPORTED_ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Collateral to receive</label>
            <select
              value={collAsset}
              onChange={e => setCollAsset(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              {SUPPORTED_ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Amount to repay</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`0.00 ${debtAsset}`}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-red-500"
          />
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-emerald-900/20 p-3 text-xs text-emerald-400 ring-1 ring-emerald-800/50">
        💰 Liquidators earn an 8% bonus on seized collateral
      </div>

      <button
        onClick={handleLiquidate}
        disabled={isPending || !amount}
        className="w-full rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-500 transition disabled:opacity-50"
      >
        {isPending ? "Processing…" : "Liquidate Position"}
      </button>
    </div>
  );
}

// ── Liquidate page ────────────────────────────────────────────────────────────
export default function LiquidatePage() {
  const { isConnected } = useAccount();
  const [manualAddr, setManualAddr] = useState("");
  const [targets, setTargets]       = useState<`0x${string}`[]>([]);

  const addTarget = () => {
    const addr = manualAddr.trim() as `0x${string}`;
    if (addr.startsWith("0x") && addr.length === 42 && !targets.includes(addr)) {
      setTargets(prev => [...prev, addr]);
      setManualAddr("");
    }
  };

  if (!isConnected) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">⚡</p>
          <p className="text-slate-400">Connect your wallet to liquidate positions.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Liquidations</h1>
        <p className="mt-1 text-slate-400">
          Repay undercollateralised positions and earn an 8% liquidation bonus.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { step: "1", title: "Find a position",   body: "A position is liquidatable when its health factor drops below 1.0." },
          { step: "2", title: "Repay their debt",  body: "You repay up to 50% of the borrower's outstanding debt." },
          { step: "3", title: "Receive collateral", body: "You receive the equivalent collateral plus an 8% bonus." },
        ].map(({ step, title, body }) => (
          <div key={step} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <span className="text-2xl font-black text-blue-500">{step}</span>
            <p className="mt-2 font-semibold text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-400">{body}</p>
          </div>
        ))}
      </div>

      {/* Manual address lookup */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold text-white">Enter borrower address</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={manualAddr}
            onChange={e => setManualAddr(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTarget()}
            placeholder="0x..."
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
          />
          <button
            onClick={addTarget}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 transition"
          >
            Check
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Paste any borrower address to check if their position is liquidatable.
        </p>
      </div>

      {/* Liquidation cards */}
      {targets.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {targets.map(addr => <LiquidationCard key={addr} borrower={addr} />)}
        </div>
      )}

      {targets.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center">
          <p className="text-5xl mb-4">🏹</p>
          <p className="text-slate-500">No targets yet. Enter a borrower address above to check their health factor.</p>
        </div>
      )}
    </main>
  );
}