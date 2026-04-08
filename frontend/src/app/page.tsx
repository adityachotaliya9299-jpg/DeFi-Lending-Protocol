"use client";

import { useState } from "react";
import { useChainId } from "wagmi";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { useReserveData, useAssetPrice } from "@/hooks/useProtocol";
import { DepositModal } from "@/components/protocol/DepositModal";
import { BorrowModal }  from "@/components/protocol/BorrowModal";
import { formatUsd, formatBps } from "@/lib/format";
import { AssetInfo } from "@/types";

// ── Single market row ─────────────────────────────────────────────────────────
function MarketRow({ asset }: { asset: AssetInfo }) {
  const chainId = useChainId();
  const [modal, setModal] = useState<"deposit" | "borrow" | null>(null);

  let addr = asset.address;
  try {
    const addrs = getAddresses(chainId);
    const key = asset.symbol as keyof typeof addrs;
    addr = (addrs[key] as `0x${string}`) ?? asset.address;
  } catch {}

  const resolvedAsset = { ...asset, address: addr };

  const { data: reserve }  = useReserveData(addr);
  const { data: price }    = useAssetPrice(addr);

  const totalDep = reserve
    ? (Number(reserve.totalScaledDeposits) * Number(reserve.liquidityIndex)) / 1e27
    : 0;
  const totalBor = reserve
    ? (Number(reserve.totalScaledBorrows) * Number(reserve.borrowIndex)) / 1e27
    : 0;
  const util = totalDep > 0 ? (totalBor / totalDep) * 100 : 0;

  const priceUsd = price ? Number(price) / 1e18 : 0;
  const supplyUsd = totalDep / 10 ** asset.decimals * priceUsd;
  const borrowUsd = totalBor / 10 ** asset.decimals * priceUsd;

  return (
    <>
      <tr className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors">
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <img src={asset.icon} alt={asset.symbol} className="h-8 w-8 rounded-full"
              onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
            <div>
              <p className="font-semibold text-white">{asset.symbol}</p>
              <p className="text-xs text-slate-500">{asset.name}</p>
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-right font-medium text-white">
          {priceUsd > 0 ? `$${priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
        </td>
        <td className="px-5 py-4 text-right text-slate-300">
          {supplyUsd > 0 ? `$${(supplyUsd / 1e6).toFixed(2)}M` : "—"}
        </td>
        <td className="px-5 py-4 text-right text-slate-300">
          {borrowUsd > 0 ? `$${(borrowUsd / 1e6).toFixed(2)}M` : "—"}
        </td>
        <td className="px-5 py-4 text-right">
          <div className="inline-flex w-24 flex-col gap-1">
            <span className="text-right text-sm text-slate-400">{util.toFixed(1)}%</span>
            <div className="h-1.5 w-full rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(util, 100)}%` }} />
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setModal("deposit")}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition"
            >
              Deposit
            </button>
            <button
              onClick={() => setModal("borrow")}
              disabled={!reserve?.isBorrowEnabled}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition disabled:opacity-40"
            >
              Borrow
            </button>
          </div>
        </td>
      </tr>

      {modal === "deposit" && (
        <tr><td colSpan={6}>
          <DepositModal asset={resolvedAsset} onClose={() => setModal(null)} />
        </td></tr>
      )}
      {modal === "borrow" && (
        <tr><td colSpan={6}>
          <BorrowModal asset={resolvedAsset} onClose={() => setModal(null)} />
        </td></tr>
      )}
    </>
  );
}

// ── Markets page ──────────────────────────────────────────────────────────────
export default function MarketsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Markets</h1>
        <p className="mt-1 text-slate-400">Deposit collateral and borrow assets against it.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-5 py-4">Asset</th>
              <th className="px-5 py-4 text-right">Price</th>
              <th className="px-5 py-4 text-right">Total Supply</th>
              <th className="px-5 py-4 text-right">Total Borrow</th>
              <th className="px-5 py-4 text-right">Utilization</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {SUPPORTED_ASSETS.map(asset => (
              <MarketRow key={asset.symbol} asset={asset} />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}