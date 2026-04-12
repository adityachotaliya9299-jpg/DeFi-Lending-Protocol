"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { isAddress, parseUnits } from "viem";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { LENDING_POOL_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { ConnectButton } from "@rainbow-me/rainbowkit";

function LiqRow({ addr, hf }: { addr: string; hf: number }) {
  const [amount, setAmount] = useState("");
  const [debtAsset, setDebtAsset] = useState(SUPPORTED_ASSETS[1].address);
  const [collAsset, setCollAsset] = useState(SUPPORTED_ASSETS[0].address);
  const chainId = useChainId();
  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading } = useWaitForTransactionReceipt({ hash: txHash });

  let poolAddr = "0x0" as `0x${string}`;
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  const canLiquidate = hf < 1;
  const hfColor = hf < 1 ? "#ef4444" : hf < 1.2 ? "#f59e0b" : "#10b981";
  const hfBg = hf < 1 ? "rgba(239,68,68,0.1)" : hf < 1.2 ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)";

  return (
    <div className={`app-card transition-all duration-300 ${canLiquidate ? 'border-red-500/40 shadow-[0_8px_30px_rgba(239,68,68,0.08)]' : ''}`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Target Position</p>
          <p className="font-mono text-sm sm:text-base font-medium text-[var(--text-primary)] break-all">{addr}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Health Factor</p>
          <div className="flex items-center gap-3">
            <span 
              className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border"
              style={{ color: hfColor, backgroundColor: hfBg, borderColor: `${hfColor}30` }}
            >
              {hf < 1 ? "Liquidatable" : hf < 1.2 ? "At Risk" : "Safe"}
            </span>
            <span className="font-display text-3xl font-bold leading-none" style={{ color: hfColor }}>
              {hf.toFixed(3)}
            </span>
          </div>
        </div>
      </div>

      {canLiquidate ? (
        <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Repay Asset Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Repay (Debt)</label>
              <div className="relative">
                <select 
                  value={debtAsset} 
                  onChange={(e) => setDebtAsset(e.target.value as `0x${string}`)}
                  className="w-full appearance-none bg-[var(--bg-card)] border border-[var(--border)] rounded-xl py-3 px-4 font-display font-bold text-sm text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] transition-colors cursor-pointer"
                >
                  {SUPPORTED_ASSETS.map(a => <option key={a.symbol} value={a.address}>{a.symbol}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] text-xs">▼</div>
              </div>
            </div>

            {/* Receive Asset Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Receive (Collateral)</label>
              <div className="relative">
                <select 
                  value={collAsset} 
                  onChange={(e) => setCollAsset(e.target.value as `0x${string}`)}
                  className="w-full appearance-none bg-[var(--bg-card)] border border-[var(--border)] rounded-xl py-3 px-4 font-display font-bold text-sm text-[var(--text-primary)] outline-none focus:border-[var(--cyan)] transition-colors cursor-pointer"
                >
                  {SUPPORTED_ASSETS.filter(a => a.address !== debtAsset).map(a => <option key={a.symbol} value={a.address}>{a.symbol}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] text-xs">▼</div>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="flex flex-col gap-2 mb-6">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Repay Amount</label>
            <div className="flex items-center bg-[var(--bg-card)] border border-[var(--border)] focus-within:border-[var(--cyan)] focus-within:shadow-[0_0_0_1px_var(--cyan)] rounded-xl px-4 py-1 transition-all">
              <input 
                type="number" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" 
                className="flex-1 bg-transparent border-none outline-none font-mono text-xl py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
              />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--cyan)] bg-[rgba(34,211,238,0.1)] px-3 py-1.5 rounded-md shrink-0">
                Max 50%
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              if (!amount || !addr) return;
              writeContract({ 
                address: poolAddr, 
                abi: LENDING_POOL_ABI, 
                functionName: "liquidate",
                args: [addr as `0x${string}`, debtAsset as `0x${string}`, collAsset as `0x${string}`, parseUnits(amount, 6)] 
              });
            }}
            disabled={!amount || isLoading}
            className="app-btn w-full !bg-red-500 !text-white hover:!brightness-110 disabled:!bg-red-500/20 disabled:!text-red-500/50"
          >
            {isLoading ? "Executing Liquidation..." : "⚡ Liquidate Position"}
          </button>
          
          {txHash && (
            <p className="font-mono text-xs text-[var(--text-muted)] text-center mt-4">
              Tx Submitted: <span className="text-[var(--cyan)]">{txHash.slice(0,10)}…{txHash.slice(-8)}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3 mt-4">
          <span className="text-xl">🛡️</span>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            This position is currently healthy and protected from liquidation.
          </p>
        </div>
      )}
    </div>
  );
}

export default function LiquidatePage() {
  useScrollAnimation();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const [search, setSearch] = useState("");
  const [queried, setQueried] = useState<string | null>(null);

  let poolAddr = "0x0" as `0x${string}`;
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  const { data: accountData } = useReadContract({
    address: poolAddr, abi: LENDING_POOL_ABI, functionName: "getUserAccountData",
    args: queried ? [queried as `0x${string}`] : undefined,
    query: { enabled: !!queried },
  });

  const [,,hfRaw] = (accountData as bigint[] | undefined) ?? [];
  const hf = hfRaw ? Number(hfRaw) / 1e18 : null;

  const handleSearch = useCallback(() => {
    if (isAddress(search)) setQueried(search);
  }, [search]);

  // Example at-risk positions for demo
  const AT_RISK = [
    { addr: "0xabc...1234", hf: 0.94 },
    { addr: "0xdef...5678", hf: 1.04 },
  ];

  return (
    <>
      <style>{`
        /* Modern App Soft UI CSS */
        .app-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 24px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.03);
        }

        .app-btn {
          padding: 16px 24px;
          border-radius: 16px;
          border: none;
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .app-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.05);
        }
        .app-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        .app-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .btn-cyan {
          background: var(--cyan);
          color: #000;
          box-shadow: 0 4px 14px rgba(34, 211, 238, 0.2);
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 md:px-6 py-12">

        {/* Header */}
        <div className="reveal flex flex-col md:flex-row justify-between md:items-end gap-6 mb-12">
          <div>
            <h2 className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "var(--cyan)" }}>Liquidation Engine</h2>
            <h1 className="font-display font-bold text-[clamp(2.2rem,4vw,3rem)] text-[var(--text-primary)] tracking-tight mb-3">
              Clear Bad Debt
            </h1>
            <p className="text-[var(--text-secondary)] text-base max-w-2xl leading-relaxed">
              Maintain protocol health by liquidating undercollateralised positions. Earn an <strong className="text-[var(--text-primary)]">8% premium bonus</strong> on the collateral you receive.
            </p>
          </div>
          {!isConnected && <ConnectButton />}
        </div>

        {/* Params Grid */}
        <div className="reveal reveal-delay-1 grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: "Liq. Threshold", value: "< 1.0 HF",  color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
            { label: "Liquidation Bonus", value: "8%",     color: "#10b981", bg: "rgba(16,185,129,0.1)" },
            { label: "Close Factor",   value: "50%",       color: "var(--cyan)", bg: "rgba(34,211,238,0.1)" },
            { label: "Risk Zone",      value: "1.0–1.2 HF", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="app-card !p-5 flex flex-col justify-center">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <p className="font-mono text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider truncate">{label}</p>
              </div>
              <p className="font-display text-2xl font-bold truncate" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Search Engine */}
        <div className="reveal app-card mb-12">
          <div className="flex flex-col md:flex-row gap-6 items-end">
            <div className="w-full">
              <label className="block text-sm font-bold text-[var(--text-primary)] mb-3">Target Address Assessment</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Paste 0x... wallet address to inspect"
                  className="flex-1 bg-[var(--bg-base)] border border-[var(--border)] focus:border-[var(--cyan)] focus:shadow-[0_0_0_1px_var(--cyan)] rounded-xl px-5 py-4 font-mono text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)]"
                />
                <button 
                  onClick={handleSearch} 
                  disabled={!isAddress(search || "")}
                  className="app-btn btn-cyan sm:w-auto w-full px-8 shrink-0"
                >
                  Scan Target
                </button>
              </div>
            </div>
          </div>

          {/* Search Result */}
          {hf !== null && queried && (
            <div className="mt-6 animate-fade-in">
              <div 
                className="rounded-2xl p-5 border flex flex-col md:flex-row justify-between md:items-center gap-4"
                style={{ 
                  backgroundColor: hf < 1 ? "rgba(239,68,68,0.05)" : "rgba(16,185,129,0.05)",
                  borderColor: hf < 1 ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)" 
                }}
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[var(--text-muted)] mb-1 truncate">{queried}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">{hf < 1 ? "🔴" : hf < 1.2 ? "🟡" : "🟢"}</span>
                    <p className="font-display font-bold text-sm" style={{ color: hf < 1 ? "#ef4444" : hf < 1.2 ? "#f59e0b" : "#10b981" }}>
                      {hf < 1 ? "Target is Liquidatable" : hf < 1.2 ? "Target is At Risk" : "Target is Healthy"}
                    </p>
                  </div>
                </div>
                <div className="shrink-0">
                  <p className="font-mono text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 text-left md:text-right">Health Factor</p>
                  <p className="font-display text-3xl font-bold leading-none" style={{ color: hf < 1 ? "#ef4444" : hf < 1.2 ? "#f59e0b" : "#10b981" }}>
                    {hf.toFixed(3)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Example positions (Demo) */}
        <div className="reveal mb-16">
          <div className="flex items-center gap-3 mb-6">
            <h3 className="font-display font-bold text-xl text-[var(--text-primary)]">Vulnerable Positions</h3>
            <span className="px-2.5 py-1 rounded-md bg-[var(--bg-card)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest">Demo Data</span>
          </div>
          <div className="flex flex-col gap-6">
            {AT_RISK.map(({ addr, hf: h }) => <LiqRow key={addr} addr={addr} hf={h} />)}
          </div>
        </div>

        {/* How liquidation works */}
        <div className="reveal">
          <h3 className="font-display font-bold text-xl text-[var(--text-primary)] mb-6">The Liquidation Process</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: "1", color: "#ef4444", title: "HF Drops Below 1.0", body: "Market volatility causes collateral value to drop, or accumulated interest pushes debt too high." },
              { icon: "2", color: "#f59e0b", title: "Repay Target Debt",  body: "Liquidators invoke the contract to repay up to 50% (Close Factor) of the user's outstanding debt." },
              { icon: "3", color: "#10b981", title: "Claim 8% Bonus",     body: "Contract transfers the equivalent collateral value plus an 8% premium directly to your wallet." },
              { icon: "4", color: "var(--cyan)", title: "Position Stabilizes", body: "The targeted user's Health Factor recovers. If still below 1.0, further liquidations can occur." },
            ].map(({ icon, color, title, body }) => (
              <div key={title} className="app-card !p-6 flex flex-col h-full">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-mono text-lg font-bold mb-5"
                  style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
                >
                  {icon}
                </div>
                <h4 className="font-display font-bold text-base text-[var(--text-primary)] mb-2">{title}</h4>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed mt-auto">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}