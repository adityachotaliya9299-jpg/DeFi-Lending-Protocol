"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useProtocolData } from "@/hooks/useProtocolData";
import { useSubgraphPositions } from "@/hooks/useSubgraphPositions";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { formatTimestamp } from "@/lib/graphql";

// ── Shared card style matching your new UI ─────────────────────────────────
const CARD_STYLE = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 24,
  padding: 28,
  boxShadow: "0 4px 24px rgba(0,0,0,0.03)",
};

type HistoryTab = "all" | "deposits" | "borrows" | "repays" | "withdraws" | "liquidations";

const EVENT_COLORS: Record<string, string> = {
  deposits:     "#10b981",
  borrows:      "#f43f5e",
  repays:       "#0ea5e9",
  withdraws:    "#f59e0b",
  liquidations: "#8b5cf6",
};

const EVENT_ICONS: Record<string, string> = {
  deposits: "↓", borrows: "↑", repays: "↩", withdraws: "↗", liquidations: "⚡",
};

function formatUsdVal(raw: string): string {
  const n = parseFloat(raw || "0");
  if (n >= 1_000_000) return `$${(n/1e6).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n/1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ ...CARD_STYLE, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color }}>{value}</span>
    </div>
  );
}

export default function PortfolioPage() {
  useScrollAnimation();
  const { address, isConnected } = useAccount();
  const { user, assets, isLoading: chainLoading } = useProtocolData();
  const subgraph = useSubgraphPositions();
  const [histTab, setHistTab] = useState<HistoryTab>("all");

  if (!isConnected) {
    return (
      <div style={{ display: "flex", minHeight: "70vh", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, margin: "0 auto 24px",
            background: "linear-gradient(135deg,rgba(14,165,233,0.12),rgba(139,92,246,0.1))",
            border: "1px solid var(--border-accent)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 30 }}>◈</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "var(--text-primary)", marginBottom: 10 }}>
            Your Portfolio
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.75, marginBottom: 24 }}>
            Connect your wallet to see your positions, health factor, and full transaction history.
          </p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  const hfRaw = user?.healthFactor ?? 0n;
  const MAX_HF = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const hfNum  = hfRaw === MAX_HF ? 999 : Number(hfRaw) / 1e18;
  const hfColor = hfNum >= 2 ? "#10b981" : hfNum >= 1.2 ? "#0ea5e9" : hfNum >= 1.05 ? "#f59e0b" : "#f43f5e";

  // Combine on-chain + subgraph history into one feed
  const allEvents = [
    ...subgraph.deposits.map(e => ({ ...e, type: "deposits" })),
    ...subgraph.borrows.map(e  => ({ ...e, type: "borrows"  })),
    ...subgraph.repays.map(e   => ({ ...e, type: "repays"   })),
    ...subgraph.withdraws.map(e=> ({ ...e, type: "withdraws"  })),
  ].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

  const filteredEvents = histTab === "all"         ? allEvents
    : histTab === "liquidations" ? subgraph.liquidations
    : allEvents.filter(e => e.type === histTab);

  const HIST_TABS: { id: HistoryTab; label: string }[] = [
    { id: "all",          label: "All" },
    { id: "deposits",     label: "Deposits" },
    { id: "borrows",      label: "Borrows" },
    { id: "repays",       label: "Repays" },
    { id: "withdraws",    label: "Withdrawals" },
    { id: "liquidations", label: "Liquidations" },
  ];

  return (
    <>
      <style>{`
        .app-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 24px; padding: 28px; box-shadow: 0 4px 24px rgba(0,0,0,0.03); }
        .ios-tabs { display: inline-flex; background: var(--bg-base); padding: 4px; border-radius: 100px; border: 1px solid var(--border); flex-wrap: wrap; gap: 2px; }
        .ios-tab-btn { padding: 7px 18px; border-radius: 100px; border: none; background: transparent; font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .ios-tab-btn.active { background: var(--bg-card); color: var(--text-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid var(--border); }
        .history-row { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--border); transition: background 0.15s; }
        .history-row:last-child { border-bottom: none; }
        .event-badge { width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; flex-shrink: 0; }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 md:px-6 py-12">

        {/* Header */}
        <div className="reveal mb-10">
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--cyan)", marginBottom: 6 }}>Portfolio</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14 }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.8rem,3vw,2.4rem)", color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 6 }}>
                Your Positions
              </h1>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                {address?.slice(0,6)}…{address?.slice(-4)}
                {subgraph.isLive && <span style={{ marginLeft: 10, color: "#10b981" }}>● Live subgraph</span>}
                {!subgraph.isLive && <span style={{ marginLeft: 10, color: "var(--text-muted)" }}>(chain data only)</span>}
              </p>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="reveal reveal-delay-1 grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatPill label="Total Supplied"      value={user ? `$${user.totalCollateralUsd.toFixed(0)}` : "—"} color="#0ea5e9" />
          <StatPill label="Total Borrowed"      value={user ? `$${user.totalDebtUsd.toFixed(0)}`       : "—"} color="#f43f5e" />
          <StatPill label="Available to Borrow" value={user ? `$${user.availableBorrowUsd.toFixed(0)}` : "—"} color="#10b981" />
          <div style={{ ...CARD_STYLE, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
            border: `1px solid ${hfColor}30`, background: `${hfColor}06` }}>
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Health Factor</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: hfColor }}>
                {hfNum >= 999 ? "∞" : hfNum.toFixed(2)}
              </span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: hfColor,
              background: `${hfColor}15`, border: `1px solid ${hfColor}25`, borderRadius: 8, padding: "5px 12px" }}>
              {hfNum >= 999 ? "Safe" : hfNum >= 2 ? "Very Safe" : hfNum >= 1.5 ? "Healthy" : hfNum >= 1.2 ? "Monitor" : "At Risk"}
            </span>
          </div>
        </div>

        {/* Per-asset positions */}
        <div className="reveal mb-8" style={{ ...CARD_STYLE }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--text-primary)", marginBottom: 22 }}>
            Active Positions
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead>
                <tr>
                  {["Asset","Supplied","Borrowed","Supply APY","Borrow APY","Utilization"].map(h => (
                    <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", padding: "0 16px 14px", textAlign: h === "Asset" ? "left" : "right", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_ASSETS.map((sa, idx) => {
                  const live   = assets.find(a => a.symbol === sa.symbol);
                  const dep    = user?.deposits?.[sa.symbol] ?? 0n;
                  const debt   = user?.debts?.[sa.symbol]    ?? 0n;
                  const hasPos = dep > 0n || debt > 0n;

                  return (
                    <tr key={sa.symbol} style={{ opacity: hasPos ? 1 : 0.4 }}>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <img src={sa.icon} alt={sa.symbol} style={{ width: 32, height: 32, borderRadius: "50%" }}
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{sa.symbol}</span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: dep > 0n ? "#0ea5e9" : "var(--text-muted)" }}>
                          {dep > 0n ? `${(Number(dep) / 10**sa.decimals).toFixed(4)}` : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: debt > 0n ? "#f43f5e" : "var(--text-muted)" }}>
                          {debt > 0n ? `${(Number(debt) / 10**sa.decimals).toFixed(4)}` : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#10b981" }}>
                          {live?.supplyApy ? `${live.supplyApy.toFixed(2)}%` : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#f59e0b" }}>
                          {live?.borrowApy ? `${live.borrowApy.toFixed(2)}%` : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", borderBottom: "1px solid var(--border)" }}>
                        {live ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: live.utilization > 80 ? "#f43f5e" : live.utilization > 60 ? "#f59e0b" : "#0ea5e9" }}>
                              {live.utilization.toFixed(1)}%
                            </span>
                            <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(live.utilization, 100)}%`, height: "100%",
                                background: live.utilization > 80 ? "#f43f5e" : live.utilization > 60 ? "#f59e0b" : "#0ea5e9", borderRadius: 2 }} />
                            </div>
                          </div>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transaction history */}
        <div className="reveal" style={{ ...CARD_STYLE }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--text-primary)", marginBottom: 4 }}>
                Transaction History
              </h2>
              {!subgraph.isLive && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  Set NEXT_PUBLIC_SUBGRAPH_URL in .env.local for full history
                </p>
              )}
            </div>
            <div className="ios-tabs">
              {HIST_TABS.map(({ id, label }) => (
                <button key={id} onClick={() => setHistTab(id)} className={`ios-tab-btn ${histTab === id ? "active" : ""}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* History list */}
          {!subgraph.isLive ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>📊</div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 8 }}>
                Full history requires The Graph
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
                Add your subgraph URL to see all deposits, borrows, repayments, and liquidations.
              </p>
              <div style={{ marginTop: 20, background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 18px", display: "inline-block" }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--cyan)" }}>
                  NEXT_PUBLIC_SUBGRAPH_URL=https://...
                </code>
              </div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
                No {histTab === "all" ? "transactions" : histTab} found for this address.
              </p>
            </div>
          ) : (
            <div>
              {histTab !== "liquidations"
                ? (filteredEvents as any[]).slice(0, 50).map((e: any) => {
                    const c = EVENT_COLORS[e.type] ?? "var(--cyan)";
                    return (
                      <div key={e.id} className="history-row">
                        <div className="event-badge" style={{ background: `${c}15`, color: c }}>
                          {EVENT_ICONS[e.type]}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", textTransform: "capitalize" }}>
                              {e.type.slice(0, -1)} {e.market?.symbol}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: c }}>
                              {formatUsdVal(e.amountUsd ?? "0")}
                            </span>
                          </div>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                            {formatTimestamp(e.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                : subgraph.liquidations.slice(0, 20).map((l) => (
                    <div key={l.id} className="history-row">
                      <div className="event-badge" style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>⚡</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "#f43f5e" }}>
                            Liquidated
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#f43f5e" }}>
                            {formatUsdVal(l.debtCovered)}
                          </span>
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                          {formatTimestamp(l.timestamp)} · Liquidator: {l.liquidator.slice(0,8)}…
                        </span>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>
    </>
  );
}