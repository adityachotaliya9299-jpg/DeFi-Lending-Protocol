"use client";

import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { useState, useCallback } from "react";
import { LENDING_POOL_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { useUserAccountData, useUserDeposit, useUserDebt, useAssetPrice, useTokenBalance, useTokenAllowance, useReserveData } from "@/hooks/useProtocol";
import { HealthFactorBar } from "@/components/ui/HealthFactorBar";
import { StatCard }        from "@/components/ui/StatCard";
import { formatUsd, formatToken, formatHealthFactor, formatBps } from "@/lib/format";
import { AssetInfo } from "@/types";

// ── Quick Action Panel per asset ─────────────────────────────────────────────
function AssetActionRow({ asset }: { asset: AssetInfo }) {
  const chainId = useChainId();
  const { address } = useAccount();
  const [depositAmt, setDepositAmt] = useState("");
  const [borrowAmt,  setBorrowAmt]  = useState("");
  const [tab, setTab] = useState<"deposit" | "borrow" | "repay" | "withdraw">("deposit");

  let resolvedAddr: `0x${string}` = asset.address;
  let poolAddr:     `0x${string}` = "0x0";
  try {
    const addrs    = getAddresses(chainId);
    resolvedAddr   = (addrs[asset.symbol as keyof typeof addrs] as `0x${string}`) ?? asset.address;
    poolAddr       = addrs.LENDING_POOL;
  } catch {}

  const resolvedAsset = { ...asset, address: resolvedAddr };

  const { data: deposit }   = useUserDeposit(resolvedAddr);
  const { data: debt }      = useUserDebt(resolvedAddr);
  const { data: balance }   = useTokenBalance(resolvedAddr);
  const { data: allowance } = useTokenAllowance(resolvedAddr, poolAddr);
  const { data: price }     = useAssetPrice(resolvedAddr);
  const { data: reserve }   = useReserveData(resolvedAddr);

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isPending }        = useWaitForTransactionReceipt({ hash: txHash });

  const parse = (val: string) => {
    try { return val ? parseUnits(val, asset.decimals) : 0n; } catch { return 0n; }
  };

  const parsedDeposit = parse(depositAmt);
  const parsedBorrow  = parse(borrowAmt);

  const needsApproval = tab === "deposit" && allowance !== undefined
    && parsedDeposit > 0n && allowance < parsedDeposit;

  const needsRepayApproval = tab === "repay" && allowance !== undefined
    && parsedBorrow > 0n && allowance < parsedBorrow;

  const handleApprove = useCallback(() => {
    const amount = tab === "repay" ? parsedBorrow : parsedDeposit;
    writeContract({ address: resolvedAddr, abi: ERC20_ABI, functionName: "approve", args: [poolAddr, amount] });
  }, [resolvedAddr, poolAddr, parsedDeposit, parsedBorrow, tab, writeContract]);

  const handleDeposit = useCallback(() => {
    if (!address || parsedDeposit === 0n) return;
    writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "deposit", args: [resolvedAddr, parsedDeposit] });
  }, [address, poolAddr, resolvedAddr, parsedDeposit, writeContract]);

  const handleBorrow = useCallback(() => {
    if (!address || parsedBorrow === 0n) return;
    writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "borrow", args: [resolvedAddr, parsedBorrow] });
  }, [address, poolAddr, resolvedAddr, parsedBorrow, writeContract]);

  const handleRepay = useCallback(() => {
    if (!address || parsedBorrow === 0n) return;
    writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "repay", args: [resolvedAddr, parsedBorrow] });
  }, [address, poolAddr, resolvedAddr, parsedBorrow, writeContract]);

  const handleWithdraw = useCallback(() => {
    if (!address || !deposit) return;
    writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "withdraw", args: [resolvedAddr, deposit] });
  }, [address, poolAddr, resolvedAddr, deposit, writeContract]);

  const priceUsd   = price ? Number(price) / 1e18 : 0;
  const depositUsd = deposit ? (Number(deposit) / 10 ** asset.decimals) * priceUsd : 0;
  const debtUsd    = debt    ? (Number(debt)    / 10 ** asset.decimals) * priceUsd : 0;

  const TABS = ["deposit", "borrow", "repay", "withdraw"] as const;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      {/* Asset header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={asset.icon} alt={asset.symbol} className="h-9 w-9 rounded-full"
            onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
          <div>
            <p className="font-bold text-white">{asset.symbol}</p>
            <p className="text-xs text-slate-500">${priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="text-right">
          {deposit && deposit > 0n && (
            <p className="text-xs text-emerald-400">Supplied: {formatToken(deposit, asset.decimals, 4)} (${depositUsd.toFixed(2)})</p>
          )}
          {debt && debt > 0n && (
            <p className="text-xs text-red-400">Borrowed: {formatToken(debt, asset.decimals, 4)} (${debtUsd.toFixed(2)})</p>
          )}
          {balance !== undefined && (
            <p className="text-xs text-slate-500">Wallet: {formatToken(balance, asset.decimals, 4)}</p>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mb-4 flex rounded-lg bg-slate-800 p-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition
              ${tab === t ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Input */}
      {(tab === "deposit" || tab === "borrow" || tab === "repay") && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
          <input
            type="number"
            value={tab === "deposit" ? depositAmt : borrowAmt}
            onChange={e => tab === "deposit" ? setDepositAmt(e.target.value) : setBorrowAmt(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-lg font-bold text-white outline-none placeholder:text-slate-600"
          />
          <span className="text-sm text-slate-400">{asset.symbol}</span>
          {tab === "deposit" && balance !== undefined && (
            <button onClick={() => setDepositAmt((Number(balance) / 10 ** asset.decimals).toString())}
              className="text-xs text-blue-400 hover:text-blue-300">MAX</button>
          )}
          {(tab === "repay") && debt !== undefined && (
            <button onClick={() => setBorrowAmt((Number(debt) / 10 ** asset.decimals).toString())}
              className="text-xs text-red-400 hover:text-red-300">MAX</button>
          )}
        </div>
      )}

      {/* Action button */}
      {tab === "deposit" && (
        needsApproval ? (
          <button onClick={handleApprove} disabled={isPending || parsedDeposit === 0n}
            className="w-full rounded-xl bg-yellow-500 py-3 font-bold text-black hover:bg-yellow-400 disabled:opacity-50 transition">
            {isPending ? "Approving…" : `Approve ${asset.symbol}`}
          </button>
        ) : (
          <button onClick={handleDeposit} disabled={isPending || parsedDeposit === 0n || !address}
            className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition">
            {isPending ? "Depositing…" : "Deposit"}
          </button>
        )
      )}

      {tab === "borrow" && (
        <button onClick={handleBorrow} disabled={isPending || parsedBorrow === 0n || !address || !reserve?.isBorrowEnabled}
          className="w-full rounded-xl bg-violet-600 py-3 font-bold text-white hover:bg-violet-500 disabled:opacity-50 transition">
          {!reserve?.isBorrowEnabled ? "Borrow Disabled" : isPending ? "Borrowing…" : "Borrow"}
        </button>
      )}

      {tab === "repay" && (
        needsRepayApproval ? (
          <button onClick={handleApprove} disabled={isPending || parsedBorrow === 0n}
            className="w-full rounded-xl bg-yellow-500 py-3 font-bold text-black hover:bg-yellow-400 disabled:opacity-50 transition">
            {isPending ? "Approving…" : `Approve ${asset.symbol}`}
          </button>
        ) : (
          <button onClick={handleRepay} disabled={isPending || parsedBorrow === 0n || !address}
            className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition">
            {isPending ? "Repaying…" : "Repay"}
          </button>
        )
      )}

      {tab === "withdraw" && (
        <button onClick={handleWithdraw} disabled={isPending || !deposit || deposit === 0n || !address}
          className="w-full rounded-xl bg-orange-600 py-3 font-bold text-white hover:bg-orange-500 disabled:opacity-50 transition">
          {isPending ? "Withdrawing…" : "Withdraw All"}
        </button>
      )}

      {txHash && (
        <p className="mt-2 text-center text-xs text-slate-500">
          Tx: {txHash.slice(0, 10)}…{txHash.slice(-8)}
        </p>
      )}
    </div>
  );
}

// ── Dashboard page ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { data: accountData }    = useUserAccountData();

  if (!isConnected) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-5xl">🏦</p>
          <h2 className="text-2xl font-bold text-white">DeFi Dashboard</h2>
          <p className="text-slate-400">Connect your wallet to deposit, borrow, repay, and withdraw.</p>
        </div>
      </main>
    );
  }

  const [totalCollateral, totalDebt, healthFactor, availBorrow] = accountData ?? [0n, 0n, 0n, 0n];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 font-mono text-sm text-slate-400">{address}</p>
      </div>

      {/* Account stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Supplied"     value={formatUsd(totalCollateral)} accent="blue"   />
        <StatCard label="Total Borrowed"     value={formatUsd(totalDebt)}       accent="red"    />
        <StatCard label="Available to Borrow" value={formatUsd(availBorrow)}   accent="green"  />
        <StatCard
          label="Health Factor"
          value={formatHealthFactor(healthFactor)}
          accent={Number(healthFactor) / 1e18 >= 2 ? "green" : Number(healthFactor) / 1e18 >= 1.2 ? "yellow" : "red"}
        />
      </div>

      {/* Health factor bar */}
      {totalDebt > 0n && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <HealthFactorBar healthFactor={healthFactor} size="lg" />
        </div>
      )}

      {/* Asset action panels */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-white">Manage Positions</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {SUPPORTED_ASSETS.map(asset => (
            <AssetActionRow key={asset.symbol} asset={asset} />
          ))}
        </div>
      </div>
    </main>
  );
}