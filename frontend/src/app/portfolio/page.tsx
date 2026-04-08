"use client";

import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUsd, formatToken, formatHealthFactor, healthFactorColor } from "@/lib/format";
import { useUserAccountData, useUserDeposit, useUserDebt, useAssetPrice } from "@/hooks/useProtocol";
import { HealthFactorBar } from "@/components/ui/HealthFactorBar";
import { StatCard }        from "@/components/ui/StatCard";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { getAddresses }    from "@/constants/addresses";
import { LENDING_POOL_ABI, ERC20_ABI } from "@/constants/abis";

// ── Single position row ───────────────────────────────────────────────────────
function PositionRow({ symbol, isDebt }: { symbol: string; isDebt: boolean }) {
  const chainId = useChainId();
  const asset   = SUPPORTED_ASSETS.find(a => a.symbol === symbol);
  if (!asset) return null;

  let addr: `0x${string}` = asset.address;
  let poolAddr: `0x${string}` = "0x0";
  try {
    const addrs = getAddresses(chainId);
    addr     = (addrs[symbol as keyof typeof addrs] as `0x${string}`) ?? asset.address;
    poolAddr = addrs.LENDING_POOL;
  } catch {}

  const { data: deposit } = useUserDeposit(addr);
  const { data: debt }    = useUserDebt(addr);
  const { data: price }   = useAssetPrice(addr);
  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isPending } = useWaitForTransactionReceipt({ hash: txHash });

  const amount  = isDebt ? debt   : deposit;
  const priceUsd = price ? Number(price) / 1e18 : 0;
  const usdValue = amount ? (Number(amount) / 10 ** asset.decimals) * priceUsd : 0;

  if (!amount || amount === 0n) return null;

  const handleWithdraw = () => {
    writeContract({
      address: poolAddr, abi: LENDING_POOL_ABI,
      functionName: "withdraw", args: [addr, amount],
    });
  };

  const handleRepayFull = () => {
    // First approve, then repay
    writeContract({
      address: addr, abi: ERC20_ABI,
      functionName: "approve",
      args: [poolAddr, amount * 2n], // 2x to cover accrued interest
    });
  };

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <img src={asset.icon} alt={asset.symbol} className="h-7 w-7 rounded-full"
            onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
          <span className="font-semibold text-white">{asset.symbol}</span>
        </div>
      </td>
      <td className="px-5 py-4 text-right font-medium text-white">
        {formatToken(amount, asset.decimals, 6)} {asset.symbol}
      </td>
      <td className="px-5 py-4 text-right text-slate-300">
        ${usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
      </td>
      <td className="px-5 py-4 text-right">
        {!isDebt ? (
          <button
            onClick={handleWithdraw}
            disabled={isPending}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-blue-500 hover:text-blue-400 transition disabled:opacity-50"
          >
            {isPending ? "…" : "Withdraw"}
          </button>
        ) : (
          <button
            onClick={handleRepayFull}
            disabled={isPending}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-red-400 hover:text-red-400 transition disabled:opacity-50"
          >
            {isPending ? "…" : "Repay"}
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Portfolio page ────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { data: accountData }    = useUserAccountData();

  if (!isConnected) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-slate-400">Connect your wallet to view your portfolio.</p>
        </div>
      </main>
    );
  }

  const [totalCollateral, totalDebt, healthFactor, availBorrow] = accountData ?? [0n, 0n, 0n, 0n];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Portfolio</h1>
        <p className="mt-1 text-slate-400 font-mono text-sm">{address}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Collateral"   value={formatUsd(totalCollateral)} accent="blue"   />
        <StatCard label="Total Debt"         value={formatUsd(totalDebt)}       accent="red"    />
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

      {/* Deposits */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Your Deposits</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3 text-right">Balance</th>
                <th className="px-5 py-3 text-right">USD Value</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORTED_ASSETS.map(a => <PositionRow key={a.symbol} symbol={a.symbol} isDebt={false} />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Borrows */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Your Borrows</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3 text-right">Debt</th>
                <th className="px-5 py-3 text-right">USD Value</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORTED_ASSETS.map(a => <PositionRow key={a.symbol} symbol={a.symbol} isDebt={true} />)}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}