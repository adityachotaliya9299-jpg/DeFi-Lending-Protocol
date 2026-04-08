"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { LENDING_POOL_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { useUserAccountData, useUserDeposit, useUserDebt, useAssetPrice, useTokenBalance, useTokenAllowance, useReserveData } from "@/hooks/useProtocol";
import { HealthFactorBar } from "@/components/ui/HealthFactorBar";
import { StatCard }        from "@/components/ui/StatCard";
import { formatUsd, formatToken, formatHealthFactor } from "@/lib/format";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { AssetInfo } from "@/types";

// ── Asset action panel ────────────────────────────────────────────────────────
function AssetPanel({ asset }: { asset: AssetInfo }) {
  const chainId     = useChainId();
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [tab, setTab]       = useState<"supply" | "borrow" | "repay" | "withdraw">("supply");

  let resolvedAddr: `0x${string}` = asset.address;
  let poolAddr:     `0x${string}` = "0x0";
  try {
    const addrs  = getAddresses(chainId);
    resolvedAddr = (addrs[asset.symbol as keyof typeof addrs] as `0x${string}`) ?? asset.address;
    poolAddr     = addrs.LENDING_POOL;
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

  const parse = (v: string) => { try { return v ? parseUnits(v, asset.decimals) : 0n; } catch { return 0n; } };
  const parsed = parse(amount);

  const needsApproval = (tab === "supply" || tab === "repay") && allowance !== undefined && parsed > 0n && allowance < parsed;

  const priceUsd   = price   ? Number(price)   / 1e18 : 0;
  const depositUsd = deposit ? (Number(deposit) / 10 ** asset.decimals) * priceUsd : 0;
  const debtUsd    = debt    ? (Number(debt)    / 10 ** asset.decimals) * priceUsd : 0;

  const handleApprove = useCallback(() => {
    writeContract({ address: resolvedAddr, abi: ERC20_ABI, functionName: "approve", args: [poolAddr, parsed] });
  }, [resolvedAddr, poolAddr, parsed, writeContract]);

  const handleSupply   = useCallback(() => { if (!address || !parsed) return; writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "deposit",  args: [resolvedAddr, parsed] }); }, [address, poolAddr, resolvedAddr, parsed, writeContract]);
  const handleBorrow   = useCallback(() => { if (!address || !parsed) return; writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "borrow",   args: [resolvedAddr, parsed] }); }, [address, poolAddr, resolvedAddr, parsed, writeContract]);
  const handleRepay    = useCallback(() => { if (!address || !parsed) return; writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "repay",    args: [resolvedAddr, parsed] }); }, [address, poolAddr, resolvedAddr, parsed, writeContract]);
  const handleWithdraw = useCallback(() => { if (!address || !deposit) return; writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "withdraw", args: [resolvedAddr, deposit] }); }, [address, poolAddr, resolvedAddr, deposit, writeContract]);

  const TABS = [
    { id: "supply",   label: "Supply",   color: "var(--cyan)"  },
    { id: "borrow",   label: "Borrow",   color: "#a78bfa"      },
    { id: "repay",    label: "Repay",    color: "#34d399"      },
    { id: "withdraw", label: "Withdraw", color: "#f59e0b"      },
  ] as const;

  const activeTab = TABS.find(t => t.id === tab)!;

  return (
    <div className="card overflow-hidden">
      {/* Asset header */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={asset.icon} alt={asset.symbol} className="h-10 w-10 rounded-full"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>
                {asset.symbol}
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                ${priceUsd > 0 ? priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
              </p>
            </div>
          </div>
          {reserve?.isBorrowEnabled
            ? <span className="badge badge-green text-xs">Borrowable</span>
            : <span className="badge badge-amber text-xs">Supply Only</span>
          }
        </div>

        {/* Position summary */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-lg p-3" style={{ background: "rgba(34,211,238,0.05)", border: "1px solid var(--border)" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Supplied</p>
            <p className="num" style={{ fontSize: 15, color: "var(--cyan)" }}>
              {deposit && deposit > 0n ? formatToken(deposit, asset.decimals, 4) : "0"}
            </p>
            {depositUsd > 0 && <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>${depositUsd.toFixed(2)}</p>}
          </div>
          <div className="rounded-lg p-3" style={{ background: "rgba(248,113,113,0.05)", border: "1px solid var(--border)" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Borrowed</p>
            <p className="num" style={{ fontSize: 15, color: debt && debt > 0n ? "#f87171" : "var(--text-muted)" }}>
              {debt && debt > 0n ? formatToken(debt, asset.decimals, 4) : "0"}
            </p>
            {debtUsd > 0 && <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>${debtUsd.toFixed(2)}</p>}
          </div>
        </div>
      </div>

      {/* Action area */}
      <div className="p-5">
        {/* Tab switcher */}
        <div className="tabs mb-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setAmount(""); }}
              className="tab"
              style={tab === t.id ? { background: t.color, color: tab === "supply" ? "#030712" : "#fff" } : {}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Input */}
        {tab !== "withdraw" && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Amount
              </span>
              <div className="flex items-center gap-2">
                {tab === "supply" && balance !== undefined && (
                  <>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      Wallet: {formatToken(balance, asset.decimals, 4)}
                    </span>
                    <button onClick={() => setAmount((Number(balance) / 10 ** asset.decimals).toString())}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)", background: "none", border: "none", cursor: "pointer" }}>
                      MAX
                    </button>
                  </>
                )}
                {tab === "repay" && debt !== undefined && debt > 0n && (
                  <>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      Debt: {formatToken(debt, asset.decimals, 4)}
                    </span>
                    <button onClick={() => setAmount((Number(debt) / 10 ** asset.decimals).toString())}
                      style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#f87171", background: "none", border: "none", cursor: "pointer" }}>
                      MAX
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 input-field" style={{ padding: "10px 14px" }}>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent outline-none"
                style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500, color: "var(--text-primary)", border: "none" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{asset.symbol}</span>
            </div>
            {/* USD preview */}
            {parsed > 0n && priceUsd > 0 && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                ≈ ${((Number(parsed) / 10 ** asset.decimals) * priceUsd).toFixed(2)} USD
              </p>
            )}
          </div>
        )}

        {/* Action button */}
        {tab === "supply" && (
          needsApproval ? (
            <button onClick={handleApprove} disabled={isPending || parsed === 0n}
              className="w-full rounded-xl py-3.5 font-bold text-sm transition-all"
              style={{ fontFamily: "var(--font-display)", background: "#f59e0b", color: "#030712", border: "none", cursor: isPending || parsed === 0n ? "not-allowed" : "pointer", opacity: isPending || parsed === 0n ? 0.5 : 1 }}>
              {isPending ? "Approving…" : `Approve ${asset.symbol}`}
            </button>
          ) : (
            <button onClick={handleSupply} disabled={isPending || parsed === 0n || !address}
              className="w-full rounded-xl py-3.5 font-bold text-sm btn-primary"
              style={{ fontFamily: "var(--font-display)" }}>
              {isPending ? "Supplying…" : `Supply ${asset.symbol}`}
            </button>
          )
        )}

        {tab === "borrow" && (
          <button onClick={handleBorrow} disabled={isPending || parsed === 0n || !address || !reserve?.isBorrowEnabled}
            className="w-full rounded-xl py-3.5 font-bold text-sm transition-all"
            style={{ fontFamily: "var(--font-display)", background: "#a78bfa", color: "#030712", border: "none", cursor: isPending || parsed === 0n || !reserve?.isBorrowEnabled ? "not-allowed" : "pointer", opacity: isPending || parsed === 0n ? 0.5 : 1 }}>
            {!reserve?.isBorrowEnabled ? "Borrow Disabled" : isPending ? "Borrowing…" : `Borrow ${asset.symbol}`}
          </button>
        )}

        {tab === "repay" && (
          needsApproval ? (
            <button onClick={handleApprove} disabled={isPending || parsed === 0n}
              className="w-full rounded-xl py-3.5 font-bold text-sm transition-all"
              style={{ fontFamily: "var(--font-display)", background: "#f59e0b", color: "#030712", border: "none", cursor: "pointer" }}>
              {isPending ? "Approving…" : `Approve ${asset.symbol}`}
            </button>
          ) : (
            <button onClick={handleRepay} disabled={isPending || parsed === 0n || !address}
              className="w-full rounded-xl py-3.5 font-bold text-sm transition-all"
              style={{ fontFamily: "var(--font-display)", background: "#34d399", color: "#030712", border: "none", cursor: isPending || parsed === 0n ? "not-allowed" : "pointer", opacity: isPending || parsed === 0n ? 0.5 : 1 }}>
              {isPending ? "Repaying…" : `Repay ${asset.symbol}`}
            </button>
          )
        )}

        {tab === "withdraw" && (
          <button onClick={handleWithdraw} disabled={isPending || !deposit || deposit === 0n || !address}
            className="w-full rounded-xl py-3.5 font-bold text-sm transition-all"
            style={{ fontFamily: "var(--font-display)", background: "#f59e0b", color: "#030712", border: "none", cursor: isPending || !deposit || deposit === 0n ? "not-allowed" : "pointer", opacity: isPending || !deposit || deposit === 0n ? 0.5 : 1 }}>
            {isPending ? "Withdrawing…" : `Withdraw All ${asset.symbol}`}
          </button>
        )}

        {txHash && (
          <p className="text-center mt-3" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            Tx: {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  useScrollAnimation();
  const { address, isConnected } = useAccount();
  const { data: accountData }    = useUserAccountData();
  const [totalCollateral, totalDebt, healthFactor, availBorrow] = accountData ?? [0n, 0n, 0n, 0n];

  if (!isConnected) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center px-4">
        <div className="card p-12 text-center max-w-md w-full">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl"
            style={{ background: "linear-gradient(135deg, var(--cyan-dim), rgba(139,92,246,0.1))", border: "1px solid var(--border-accent)" }}>
            🏦
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--text-primary)", marginBottom: 10 }}>
            Connect your wallet
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.7 }}>
            Connect to Sepolia testnet to supply collateral, borrow assets,
            and manage your DeFi positions.
          </p>
        </div>
      </div>
    );
  }

  const hfNum = healthFactor === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
    ? 999 : Number(healthFactor) / 1e18;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Header */}
      <div className="reveal mb-8">
        <p className="section-label mb-1">Dashboard</p>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.5rem, 3vw, 2rem)", color: "var(--text-primary)" }}>
            Manage Positions
          </h1>
          <p className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all" }}>
            {address}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="reveal reveal-delay-1 grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Supplied"           value={formatUsd(totalCollateral)} accent="cyan"   icon="◈" />
        <StatCard label="Borrowed"           value={formatUsd(totalDebt)}       accent="red"    icon="⌁" />
        <StatCard label="Available to Borrow" value={formatUsd(availBorrow)}   accent="green"  icon="⊕" />
        <StatCard
          label="Health Factor"
          value={formatHealthFactor(healthFactor)}
          accent={hfNum >= 2 ? "cyan" : hfNum >= 1.2 ? "green" : hfNum >= 1.05 ? "yellow" : "red"}
          icon="⬡"
        />
      </div>

      {/* Health factor */}
      {totalDebt > 0n && (
        <div className="reveal reveal-delay-2 card p-6 md:p-8 mb-8">
          <HealthFactorBar healthFactor={healthFactor} size="lg" />
        </div>
      )}

      {/* Asset panels grid */}
      <div className="reveal reveal-delay-3 mb-3">
        <p className="section-label mb-4">Asset Positions</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {SUPPORTED_ASSETS.map((asset, i) => (
          <div key={asset.symbol} className={`reveal reveal-delay-${(i % 3) + 1}`}>
            <AssetPanel asset={asset} />
          </div>
        ))}
      </div>

      {/* Tips section */}
      <div className="reveal reveal-delay-2 mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: "◈", title: "Supply first", body: "Deposit an asset as collateral before you can borrow other assets.", color: "var(--cyan)" },
          { icon: "⬡", title: "Watch your HF", body: "Keep health factor above 1.5 to avoid liquidation when prices move.", color: "#a78bfa" },
          { icon: "⚡", title: "Repay debt", body: "Interest accrues every second. Repay early to minimise total interest paid.", color: "#f59e0b" },
        ].map(({ icon, title, body, color }) => (
          <div key={title} className="rounded-xl p-4 flex gap-3"
            style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
            <span style={{ fontSize: 18, color, flexShrink: 0, marginTop: 2 }}>{icon}</span>
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 4 }}>{title}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}