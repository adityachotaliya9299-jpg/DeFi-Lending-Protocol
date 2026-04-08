"use client";

import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUsd, formatToken, formatHealthFactor } from "@/lib/format";
import { useUserAccountData, useUserDeposit, useUserDebt, useAssetPrice } from "@/hooks/useProtocol";
import { HealthFactorBar } from "@/components/ui/HealthFactorBar";
import { StatCard }        from "@/components/ui/StatCard";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { getAddresses }    from "@/constants/addresses";
import { LENDING_POOL_ABI, ERC20_ABI } from "@/constants/abis";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

function PositionRow({ symbol, isDebt }: { symbol: string; isDebt: boolean }) {
  const chainId = useChainId();
  const asset   = SUPPORTED_ASSETS.find(a => a.symbol === symbol);
  if (!asset) return null;

  let addr: `0x${string}`     = asset.address;
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

  const amount   = isDebt ? debt : deposit;
  const priceUsd = price  ? Number(price) / 1e18 : 0;
  const usdValue = amount ? (Number(amount) / 10 ** asset.decimals) * priceUsd : 0;

  if (!amount || amount === 0n) return null;

  const handleWithdraw = () => {
    writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "withdraw", args: [addr, amount] });
  };
  const handleApproveRepay = () => {
    writeContract({ address: addr, abi: ERC20_ABI, functionName: "approve", args: [poolAddr, (amount ?? 0n) * 2n] });
  };

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <img src={asset.icon} alt={symbol} className="h-8 w-8 rounded-full"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--text-primary)" }}>
            {symbol}
          </span>
        </div>
      </td>
      <td className="px-5 py-4 text-right">
        <span className="num text-sm" style={{ color: "var(--text-primary)" }}>
          {formatToken(amount, asset.decimals, 6)}
        </span>
      </td>
      <td className="px-5 py-4 text-right">
        <span className="num text-sm" style={{ color: "var(--text-secondary)" }}>
          ${usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </span>
      </td>
      <td className="px-5 py-4 text-right">
        {!isDebt ? (
          <button onClick={handleWithdraw} disabled={isPending} className="btn-secondary text-xs px-3 py-1.5">
            {isPending ? "…" : "Withdraw"}
          </button>
        ) : (
          <button onClick={handleApproveRepay} disabled={isPending} className="btn-secondary text-xs px-3 py-1.5"
            style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}>
            {isPending ? "…" : "Repay"}
          </button>
        )}
      </td>
    </tr>
  );
}

export default function PortfolioPage() {
  useScrollAnimation();
  const { address, isConnected } = useAccount();
  const { data: accountData }    = useUserAccountData();
  const [totalCollateral, totalDebt, healthFactor, availBorrow] = accountData ?? [0n, 0n, 0n, 0n];

  if (!isConnected) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="card p-12 text-center max-w-sm w-full">
          <div className="text-5xl mb-4">🔒</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text-primary)", marginBottom: 8 }}>
            Connect Wallet
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Connect your wallet to view your portfolio positions and health factor.
          </p>
        </div>
      </div>
    );
  }

  const hfNum = healthFactor === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
    ? 999 : Number(healthFactor) / 1e18;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10 space-y-8">

      {/* Header */}
      <div className="reveal">
        <p className="section-label mb-1">Your Portfolio</p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "var(--text-primary)" }}>
            Account Overview
          </h1>
          <span className="num text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", wordBreak: "break-all" }}>
            {address}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="reveal reveal-delay-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Supplied"      value={formatUsd(totalCollateral)} accent="cyan"   icon="◈" />
        <StatCard label="Total Borrowed"      value={formatUsd(totalDebt)}       accent="red"    icon="⌁" />
        <StatCard label="Available to Borrow" value={formatUsd(availBorrow)}     accent="green"  icon="⊕" />
        <StatCard
          label="Health Factor"
          value={formatHealthFactor(healthFactor)}
          accent={hfNum >= 2 ? "cyan" : hfNum >= 1.2 ? "green" : hfNum >= 1.05 ? "yellow" : "red"}
          icon="⬡"
        />
      </div>

      {/* Health factor bar */}
      {totalDebt > 0n && (
        <div className="reveal reveal-delay-2 card p-6 md:p-8">
          <HealthFactorBar healthFactor={healthFactor} size="lg" />
        </div>
      )}

      {/* Supplied positions */}
      <div className="reveal reveal-delay-2">
        <h2 className="mb-3" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text-primary)" }}>
          Supplied Assets
        </h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">USD Value</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_ASSETS.map(a => <PositionRow key={a.symbol} symbol={a.symbol} isDebt={false} />)}
              </tbody>
            </table>
          </div>
          {totalCollateral === 0n && (
            <div className="px-5 py-10 text-center">
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No supplied assets yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Borrowed positions */}
      <div className="reveal reveal-delay-3">
        <h2 className="mb-3" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text-primary)" }}>
          Borrowed Assets
        </h2>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="text-right">Debt</th>
                  <th className="text-right">USD Value</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_ASSETS.map(a => <PositionRow key={a.symbol} symbol={a.symbol} isDebt={true} />)}
              </tbody>
            </table>
          </div>
          {totalDebt === 0n && (
            <div className="px-5 py-10 text-center">
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No active borrows.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}