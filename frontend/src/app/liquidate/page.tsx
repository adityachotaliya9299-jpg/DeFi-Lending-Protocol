"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { isAddress } from "viem";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { LENDING_POOL_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { ConnectButton } from "@rainbow-me/rainbowkit";

function HFBadge({ hf }: { hf: number }) {
  let color = "#34d399", label = "Safe", bg = "rgba(52,211,153,0.1)", border = "rgba(52,211,153,0.25)";
  if (hf < 1)    { color = "#ef4444"; label = "Liquidatable"; bg = "rgba(239,68,68,0.12)"; border = "rgba(239,68,68,0.3)"; }
  else if (hf < 1.2) { color = "#f59e0b"; label = "At Risk";      bg = "rgba(245,158,11,0.1)";  border = "rgba(245,158,11,0.25)"; }
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color, background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: "4px 12px" }}>
      {label} ({hf.toFixed(3)})
    </span>
  );
}

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
  const hfColor = hf < 1 ? "#ef4444" : hf < 1.2 ? "#f59e0b" : "#34d399";

  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid ${hf < 1 ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
      borderRadius: 16, overflow: "hidden",
      boxShadow: hf < 1 ? "0 0 20px rgba(239,68,68,0.08)" : "var(--shadow-card)" }}>
      {hf < 1 && <div style={{ height: 3, background: "linear-gradient(90deg, #ef4444, transparent)" }} />}
      <div style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Position</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)", wordBreak: "break-all" }}>{addr}</p>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Health Factor</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 500, color: hfColor, lineHeight: 1 }}>{hf.toFixed(3)}</p>
          </div>
        </div>

        {canLiquidate ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>Repay (debt asset)</p>
                <select value={debtAsset} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDebtAsset(e.target.value as `0x${string}`)}
                  style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: 10,
                    padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)", outline: "none" }}>
                  {SUPPORTED_ASSETS.map(a => <option key={a.symbol} value={a.address}>{a.symbol}</option>)}
                </select>
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>Receive (collateral)</p>
                <select value={collAsset} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCollAsset(e.target.value as `0x${string}`)}
                  style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: 10,
                    padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)", outline: "none" }}>
                  {SUPPORTED_ASSETS.filter(a => a.address !== debtAsset).map(a => <option key={a.symbol} value={a.address}>{a.symbol}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", gap: 8 }}>
              <input type="number" value={amount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
                placeholder="Repay amount" style={{ flex: 1, background: "transparent", border: "none", outline: "none",
                  fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--text-primary)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "3px 8px" }}>
                Max 50%
              </span>
            </div>
            <button
              onClick={() => {
                if (!amount || !addr) return;
                const { parseUnits } = require("viem");
                writeContract({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "liquidate",
                  args: [addr as `0x${string}`, debtAsset as `0x${string}`, collAsset as `0x${string}`, parseUnits(amount, 6)] });
              }}
              disabled={!amount || isLoading}
              style={{ width: "100%", borderRadius: 12, padding: "13px 0", border: "none", cursor: !amount ? "not-allowed" : "pointer",
                fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14,
                background: amount ? "#ef4444" : "rgba(239,68,68,0.15)",
                color: amount ? "#fff" : "rgba(239,68,68,0.4)", transition: "all 0.15s" }}>
              {isLoading ? "Liquidating…" : "⚡ Liquidate Position"}
            </button>
            {txHash && <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>Tx: {txHash.slice(0,10)}…</p>}
          </div>
        ) : (
          <div style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 10, padding: "12px 16px" }}>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              This position is healthy (HF ≥ 1.0). No liquidation possible.
            </p>
          </div>
        )}
      </div>
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
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Header */}
      <div className="reveal mb-10">
        <p className="section-label mb-1">Liquidation Engine</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.6rem,3vw,2.1rem)", color: "var(--text-primary)", marginBottom: 6 }}>
              Liquidate Positions
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 500, lineHeight: 1.7 }}>
              Earn an 8% bonus by repaying debt of undercollateralised positions. Maximum 50% of debt per call (close factor).
            </p>
          </div>
          {!isConnected && <ConnectButton />}
        </div>
      </div>

      {/* Params */}
      <div className="reveal reveal-delay-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 32 }}>
        {[
          { label: "Liq. Threshold", value: "< 1.0 HF",  color: "#ef4444"      },
          { label: "Liquidation Bonus", value: "8%",     color: "#34d399"      },
          { label: "Close Factor",   value: "50%",        color: "var(--cyan)"  },
          { label: "Risk Zone",      value: "1.0–1.2 HF", color: "#f59e0b"     },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="reveal" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, padding: 24, marginBottom: 28 }}>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 14 }}>
          Check any position
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="0x... wallet address"
            style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: 12,
              padding: "13px 16px", fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text-primary)",
              outline: "none" }} />
          <button onClick={handleSearch} disabled={!isAddress(search || "")}
            className="btn-primary" style={{ padding: "13px 24px", flexShrink: 0 }}>
            Check →
          </button>
        </div>

        {hf !== null && queried && (
          <div style={{ marginTop: 16, background: hf < 1 ? "rgba(239,68,68,0.06)" : "rgba(52,211,153,0.06)",
            border: `1px solid ${hf < 1 ? "rgba(239,68,68,0.2)" : "rgba(52,211,153,0.2)"}`,
            borderRadius: 12, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{queried}</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: hf < 1 ? "#ef4444" : "#34d399" }}>
                {hf < 1 ? "⚡ Liquidatable" : hf < 1.2 ? "⚠ At risk" : "✓ Healthy"}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>Health Factor</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 500, color: hf < 1 ? "#ef4444" : hf < 1.2 ? "#f59e0b" : "#34d399", lineHeight: 1 }}>
                {hf.toFixed(3)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Example positions */}
      <div className="reveal reveal-delay-1">
        <p className="section-label" style={{ marginBottom: 14 }}>Example positions (demo data)</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {AT_RISK.map(({ addr, hf: h }) => <LiqRow key={addr} addr={addr} hf={h} />)}
        </div>
      </div>

      {/* How liquidation works */}
      <div className="reveal" style={{ marginTop: 32 }}>
        <p className="section-label" style={{ marginBottom: 14 }}>How liquidation works</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
          {[
            { icon: "1", color: "#ef4444", title: "Position goes below HF 1.0",  body: "When collateral value drops or debt grows, health factor falls below 1.0." },
            { icon: "2", color: "#f59e0b", title: "Liquidator repays debt",       body: "You repay up to 50% of borrower's debt by transferring the debt asset." },
            { icon: "3", color: "#34d399", title: "Receive collateral + 8% bonus", body: "You receive collateral worth debt_repaid × 1.08. Profit is the spread." },
            { icon: "4", color: "var(--cyan)", title: "HF recovers or position closes", body: "After liquidation HF improves. Multiple calls may be needed if HF < 0.5." },
          ].map(({ icon, color, title, body }) => (
            <div key={title} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}15`, border: `1px solid ${color}30`,
                display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color }}>{icon}</span>
              </div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>{title}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}