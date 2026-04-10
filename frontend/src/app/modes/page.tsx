"use client";

import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const CATEGORIES = [
  {
    id: 0, label: "No E-Mode", icon: "○", color: "#475569",
    ltv: "—", liqThreshold: "—", liqBonus: "—",
    assets: ["All assets"], active: true,
    description: "Standard per-asset LTV applies. No special treatment.",
  },
  {
    id: 1, label: "ETH Correlated", icon: "◈", color: "#22d3ee",
    ltv: "90%", liqThreshold: "93%", liqBonus: "5%",
    assets: ["WETH", "stETH", "rETH"], active: true,
    description: "ETH & liquid staking tokens move together. Higher LTV, lower liquidation risk.",
  },
  {
    id: 2, label: "Stablecoins", icon: "⊕", color: "#a78bfa",
    ltv: "97%", liqThreshold: "97.5%", liqBonus: "2%",
    assets: ["USDC", "USDT", "DAI"], active: true,
    description: "All stablecoins target $1. Near-zero price divergence → maximum capital efficiency.",
  },
  {
    id: 3, label: "BTC Correlated", icon: "⌁", color: "#f59e0b",
    ltv: "88%", liqThreshold: "91%", liqBonus: "6%",
    assets: ["WBTC", "tBTC"], active: false,
    description: "Coming soon — BTC-pegged assets.",
  },
];

const ISOLATED = [
  {
    symbol: "LINK", name: "Chainlink", color: "#3b82f6",
    debtCeiling: "$500,000", utilization: 38, ltv: "65%",
    risk: "Medium", riskColor: "#f59e0b",
    allowedBorrows: ["USDC"],
    reason: "Mid-cap asset with oracle dependency. Isolation caps max protocol exposure.",
  },
];

function CategoryCard({ cat, selected, onSelect }: {
  cat: typeof CATEGORIES[0]; selected: boolean; onSelect: () => void;
}) {
  const c = cat.color;
  return (
    <button onClick={onSelect} disabled={!cat.active}
      style={{
        width: "100%", textAlign: "left", background: selected ? `${c}10` : "var(--bg-card)",
        border: `1px solid ${selected ? c : "var(--border)"}`,
        borderRadius: 14, padding: 20, cursor: cat.active ? "pointer" : "not-allowed",
        opacity: cat.active ? 1 : 0.45, transition: "all 0.18s",
        boxShadow: selected ? `0 0 0 1px ${c}40, 0 4px 20px ${c}15` : "var(--shadow-card)",
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `${c}18`, border: `1px solid ${c}35`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: c }}>
            {cat.icon}
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.2 }}>
              {cat.label}
            </p>
            {!cat.active && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Coming soon</span>}
          </div>
        </div>
        <div style={{ width: 20, height: 20, borderRadius: "50%",
          background: selected ? c : "transparent",
          border: `2px solid ${selected ? c : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {selected && <span style={{ color: "#030712", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: cat.id === 0 ? 0 : 14 }}>
        {cat.description}
      </p>
      {cat.id !== 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {[["LTV", cat.ltv], ["Liq. Thresh", cat.liqThreshold], ["Bonus", cat.liqBonus]].map(([lbl, val]) => (
            <div key={lbl} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 3 }}>{lbl}</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 500, color: c }}>{val}</p>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        {cat.assets.map(a => (
          <span key={a} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: c, background: `${c}12`,
            border: `1px solid ${c}20`, borderRadius: 4, padding: "2px 8px" }}>{a}</span>
        ))}
      </div>
    </button>
  );
}

export default function ModesPage() {
  useScrollAnimation();
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<"emode" | "isolation">("emode");
  const [selected, setSelected] = useState(0);

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: pending } = useWaitForTransactionReceipt({ hash: txHash });

  const cat = CATEGORIES.find(c => c.id === selected)!;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Header */}
      <div className="reveal mb-8">
        <p className="section-label mb-1">Advanced Modes</p>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.6rem,3vw,2.1rem)", color: "var(--text-primary)", marginBottom: 6 }}>
              E-Mode & Isolation Mode
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 520, lineHeight: 1.7 }}>
              Aave v3-inspired risk features. E-Mode unlocks higher LTV for correlated assets.
              Isolation Mode limits protocol exposure to volatile collateral.
            </p>
          </div>
          {!isConnected && <ConnectButton />}
        </div>
      </div>

      {/* Tab switcher — pill style, NOT using .reveal */}
      <div style={{ display: "inline-flex", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 4, marginBottom: 28, gap: 4 }}>
        {([
          { id: "emode" as const,     label: "⚡ Efficiency Mode" },
          { id: "isolation" as const, label: "🔒 Isolation Mode"  },
        ]).map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer",
              fontFamily: "var(--font-display)", fontWeight: tab === id ? 700 : 500, fontSize: 13,
              background: tab === id ? "var(--cyan)" : "transparent",
              color: tab === id ? "#030712" : "var(--text-secondary)",
              transition: "all 0.15s",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── E-MODE TAB ── */}
      {tab === "emode" && (
        <div>
          {/* How it works — 3 cards */}
          <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12, marginBottom: 28 }}>
            {[
              { icon: "◈", color: "var(--cyan)",  title: "Correlated assets",   body: "When collateral and debt move together in price, liquidation risk is much lower, allowing higher LTV." },
              { icon: "⬡", color: "#a78bfa",       title: "LTV boost",           body: "Standard USDC LTV = 85%. In Stablecoin E-Mode, LTV = 97% — same $1 peg removes price risk." },
              { icon: "⚠", color: "#f59e0b",       title: "Opt-in per user",     body: "E-Mode is optional. If your assets span categories, standard LTV applies automatically." },
            ].map(({ icon, color, title, body }) => (
              <div key={title} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 22, color, marginBottom: 10 }}>{icon}</div>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>{title}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65 }}>{body}</p>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
            {/* Category list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {CATEGORIES.map(c => (
                <CategoryCard key={c.id} cat={c} selected={selected === c.id} onSelect={() => setSelected(c.id)} />
              ))}
            </div>

            {/* Sticky action panel */}
            <div style={{ position: "sticky", top: 88 }}>
              <div style={{ background: "var(--bg-card)", border: `1px solid ${cat.color === "#475569" ? "var(--border)" : cat.color + "35"}`, borderRadius: 18,
                boxShadow: cat.id !== 0 ? `0 0 30px ${cat.color}18` : "var(--shadow-card)", overflow: "hidden" }}>
                {/* Color accent top */}
                {cat.id !== 0 && <div style={{ height: 3, background: `linear-gradient(90deg, ${cat.color}, transparent)` }} />}
                <div style={{ padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${cat.color}18`,
                      border: `1px solid ${cat.color}30`, display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 18, color: cat.color }}>{cat.icon}</div>
                    <div>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Selected</p>
                      <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{cat.label}</p>
                    </div>
                  </div>

                  {cat.id !== 0 ? (
                    <>
                      {/* LTV comparison */}
                      <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>LTV boost</p>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Standard</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--text-secondary)", textDecoration: "line-through" }}>80–85%</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>E-Mode</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, color: cat.color }}>{cat.ltv}</span>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                        {[["Liq. Threshold", cat.liqThreshold], ["Liq. Bonus", cat.liqBonus]].map(([l, v]) => (
                          <div key={l} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 12px" }}>
                            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{l}</p>
                            <p style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500, color: cat.color }}>{v}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 10, marginBottom: 16 }}>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>No E-Mode — standard per-asset LTV parameters apply.</p>
                    </div>
                  )}

                  <button disabled={pending || !isConnected}
                    style={{ width: "100%", borderRadius: 12, padding: "14px 0", border: "none", cursor: isConnected ? "pointer" : "not-allowed",
                      fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14,
                      background: isConnected ? cat.id === 0 ? "rgba(71,85,105,0.3)" : cat.color : "rgba(255,255,255,0.06)",
                      color: isConnected && cat.id !== 0 ? "#030712" : "var(--text-muted)",
                      opacity: pending ? 0.6 : 1, transition: "all 0.15s" }}>
                    {!isConnected ? "Connect Wallet" : pending ? "Activating…" : cat.id === 0 ? "Disable E-Mode" : `Activate ${cat.label}`}
                  </button>
                  {txHash && <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 10 }}>Tx: {txHash.slice(0,10)}…</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ISOLATION TAB ── */}
      {tab === "isolation" && (
        <div>
          {/* Explainer */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12, marginBottom: 28 }}>
            {[
              { icon: "🔒", color: "#f59e0b", title: "What is isolation mode?", body: "Risky / new assets can be collateral but have a global debt ceiling — capping total protocol exposure to that asset." },
              { icon: "⊕", color: "#ef4444",  title: "Borrow restrictions",     body: "When using isolated collateral you can ONLY borrow approved stablecoins. No ETH or volatile assets." },
              { icon: "◈", color: "#34d399",  title: "Why this matters",        body: "Without isolation, a new asset could drain the pool via oracle manipulation. The ceiling caps the maximum possible loss." },
            ].map(({ icon, color, title, body }) => (
              <div key={title} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--text-primary)", marginBottom: 6 }}>{title}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65 }}>{body}</p>
              </div>
            ))}
          </div>

          {/* Isolated assets */}
          <p className="section-label" style={{ marginBottom: 14 }}>Isolated collateral assets</p>
          {ISOLATED.map(a => (
            <div key={a.symbol} style={{ background: "var(--bg-card)", border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 16,
              overflow: "hidden", boxShadow: "0 0 20px rgba(245,158,11,0.06)", marginBottom: 16 }}>
              <div style={{ height: 3, background: "linear-gradient(90deg, #f59e0b, transparent)" }} />
              <div style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>⬡</span>
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--text-primary)" }}>{a.symbol}</span>
                        <span className="badge badge-amber">Isolated</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{a.name}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 20 }}>
                    {[["Debt Ceiling", a.debtCeiling, "#f59e0b"], ["Max LTV", a.ltv, "var(--cyan)"], ["Risk", a.risk, a.riskColor]].map(([lbl, val, col]) => (
                      <div key={lbl} style={{ textAlign: "right" }}>
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>{lbl}</p>
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500, color: col }}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Debt ceiling bar */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>Global debt used</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#f59e0b" }}>{a.utilization}% of {a.debtCeiling}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ width: `${a.utilization}%`, height: "100%", background: "linear-gradient(90deg, #f59e0b, #ef4444)", borderRadius: 3 }} />
                  </div>
                </div>

                <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: 12, padding: 14 }}>
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 10 }}>{a.reason}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>Only borrowable:</span>
                    {a.allowedBorrows.map(b => (
                      <span key={b} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#34d399",
                        background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
                        borderRadius: 6, padding: "3px 10px" }}>{b}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* What changes */}
          <p className="section-label" style={{ marginBottom: 14 }}>When using LINK as collateral</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 8 }}>
            {[
              { icon: "✓", text: "Deposit LINK as collateral",    allowed: true  },
              { icon: "✓", text: "Borrow USDC against LINK",      allowed: true  },
              { icon: "✗", text: "Borrow WETH against LINK",      allowed: false },
              { icon: "✗", text: "Mix LINK + WETH as collateral", allowed: false },
              { icon: "✓", text: "Repay and withdraw normally",   allowed: true  },
              { icon: "⚠", text: "Global ceiling: $500K total",  allowed: null  },
            ].map(({ icon, text, allowed }) => {
              const col = allowed === true ? "#34d399" : allowed === false ? "#ef4444" : "#f59e0b";
              return (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 10,
                  background: `${col}08`, border: `1px solid ${col}18`, borderRadius: 10, padding: "10px 14px" }}>
                  <span style={{ fontSize: 13, color: col, fontWeight: 700, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}