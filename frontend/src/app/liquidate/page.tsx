"use client";

import { useState } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseUnits } from "viem";
import { LENDING_POOL_ABI, LIQUIDATION_ENGINE_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { formatHealthFactor, formatUsd, shortenAddress } from "@/lib/format";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

function LiquidationCard({ borrower }: { borrower: `0x${string}` }) {
  const chainId = useChainId();
  const [debtAsset, setDebtAsset] = useState(SUPPORTED_ASSETS[1].symbol);
  const [collAsset, setCollAsset] = useState(SUPPORTED_ASSETS[0].symbol);
  const [amount, setAmount]       = useState("");

  let engineAddr: `0x${string}` = "0x0";
  let poolAddr:   `0x${string}` = "0x0";
  try {
    const a = getAddresses(chainId);
    engineAddr = a.LIQUIDATION_ENGINE;
    poolAddr   = a.LENDING_POOL;
  } catch {}

  const { data: liqData } = useReadContract({
    address: engineAddr, abi: LIQUIDATION_ENGINE_ABI, functionName: "getLiquidationData",
    args: [borrower], query: { enabled: engineAddr !== "0x0" },
  });

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isPending } = useWaitForTransactionReceipt({ hash: txHash });

  if (!liqData) return (
    <div className="card p-6 text-center">
      <div className="text-2xl mb-2" style={{ opacity: 0.4 }}>◎</div>
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading position data…</p>
    </div>
  );

  const [totalColl, totalDebt, hf, , liquidatable] = liqData;
  const hfNum = Number(hf) / 1e18;

  const hfColor = hfNum < 1 ? "#ef4444" : hfNum < 1.2 ? "#f59e0b" : "#10b981";

  const handleLiquidate = () => {
    if (!amount) return;
    const debtInfo = SUPPORTED_ASSETS.find(a => a.symbol === debtAsset)!;
    let debtAddr: `0x${string}` = "0x0";
    let collAddr: `0x${string}` = "0x0";
    try {
      const addrs = getAddresses(chainId);
      debtAddr = (addrs[debtAsset as keyof typeof addrs] as `0x${string}`) ?? "0x0";
      collAddr = (addrs[collAsset as keyof typeof addrs] as `0x${string}`) ?? "0x0";
    } catch {}
    const parsed = parseUnits(amount, debtInfo.decimals);
    writeContract({ address: debtAddr, abi: ERC20_ABI, functionName: "approve", args: [poolAddr, parsed] });
  };

  return (
    <div className="card p-6 reveal reveal-scale"
      style={{ borderColor: liquidatable ? "rgba(239,68,68,0.3)" : "var(--border)" }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            Borrower
          </p>
          <p className="num text-sm" style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>
            {shortenAddress(borrower)}
          </p>
        </div>
        {liquidatable ? (
          <span className="badge badge-red">LIQUIDATABLE</span>
        ) : (
          <span className="badge badge-green">HEALTHY</span>
        )}
      </div>

      {/* Position stats */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { label: "Collateral", value: formatUsd(totalColl), color: "var(--cyan)" },
          { label: "Debt",       value: formatUsd(totalDebt), color: "#f87171" },
          { label: "HF",         value: formatHealthFactor(hf), color: hfColor },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-3 text-center"
            style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
              {label}
            </p>
            <p className="num text-sm" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {liquidatable && (
        <>
          {/* Controls */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                Repay asset
              </label>
              <select value={debtAsset} onChange={e => setDebtAsset(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                {SUPPORTED_ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                Receive collateral
              </label>
              <select value={collAsset} onChange={e => setCollAsset(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                {SUPPORTED_ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
              </select>
            </div>
          </div>

          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder={`Amount of ${debtAsset} to repay`}
            className="input-field mb-4" style={{ fontSize: 14, padding: "10px 14px" }} />

          <div className="rounded-lg px-3 py-2.5 mb-4 text-sm flex items-center gap-2"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399" }}>
            <span>💰</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Liquidators receive 8% bonus on seized collateral
            </span>
          </div>

          <button onClick={handleLiquidate} disabled={isPending || !amount}
            className="w-full rounded-xl py-3 font-bold text-sm transition-all"
            style={{
              fontFamily: "var(--font-display)",
              background: isPending || !amount ? "rgba(239,68,68,0.3)" : "#ef4444",
              color: "#fff",
              border: "none",
              cursor: isPending || !amount ? "not-allowed" : "pointer",
            }}>
            {isPending ? "Processing…" : "Execute Liquidation"}
          </button>
        </>
      )}
    </div>
  );
}

export default function LiquidatePage() {
  useScrollAnimation();
  const { isConnected } = useAccount();
  const [input, setInput]   = useState("");
  const [targets, setTargets] = useState<`0x${string}`[]>([]);

  const addTarget = () => {
    const addr = input.trim() as `0x${string}`;
    if (addr.startsWith("0x") && addr.length === 42 && !targets.includes(addr)) {
      setTargets(prev => [...prev, addr]);
      setInput("");
    }
  };

  const STEPS = [
    { n: "01", title: "Find a position",    body: "A position is liquidatable when its health factor drops below 1.0 due to collateral price decline." },
    { n: "02", title: "Enter the address",  body: "Paste the borrower's wallet address below to check if their position can be liquidated." },
    { n: "03", title: "Earn the bonus",     body: "Repay up to 50% of their debt and receive collateral worth 8% more — your liquidation profit." },
  ];

  if (!isConnected) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="card p-12 text-center max-w-sm w-full">
          <div className="text-5xl mb-4">⚡</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text-primary)", marginBottom: 8 }}>
            Connect Wallet
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Connect your wallet to execute liquidations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10 space-y-10">

      {/* Header */}
      <div className="reveal">
        <p className="section-label mb-1">Liquidations</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "var(--text-primary)", marginBottom: 8 }}>
          Liquidation Engine
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 480 }}>
          Protect the protocol and earn rewards by liquidating undercollateralised positions.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map(({ n, title, body }, i) => (
          <div key={n} className={`reveal reveal-delay-${i + 1} card p-6`}>
            <p className="num-lg num mb-3" style={{ color: "var(--cyan)", opacity: 0.5 }}>{n}</p>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              {title}
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.65 }}>{body}</p>
          </div>
        ))}
      </div>

      {/* Address input */}
      <div className="reveal card p-6">
        <p className="section-label mb-4">Check a position</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTarget()}
            placeholder="0x... borrower address"
            className="input-field flex-1" style={{ fontSize: 14, padding: "11px 14px", fontFamily: "var(--font-mono)" }} />
          <button onClick={addTarget} className="btn-primary px-6 py-3 whitespace-nowrap">
            Check Position
          </button>
        </div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
          Press Enter or click Check Position. Multiple addresses supported.
        </p>
      </div>

      {/* Results */}
      {targets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {targets.map(addr => <LiquidationCard key={addr} borrower={addr} />)}
        </div>
      ) : (
        <div className="reveal card py-20 text-center">
          <div className="text-4xl mb-4" style={{ opacity: 0.25 }}>🏹</div>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            No targets yet. Enter a borrower address above.
          </p>
        </div>
      )}
    </div>
  );
}