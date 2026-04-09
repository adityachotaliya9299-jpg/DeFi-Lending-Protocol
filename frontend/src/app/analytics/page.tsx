"use client";

import { useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── Mock chart data generators ────────────────────────────────────────────────
// In production these come from your Graph subgraph

function generateApyData(days: number) {
  const data = [];
  let wethSupply = 1.2, wethBorrow = 1.9;
  let usdcSupply = 2.1, usdcBorrow = 3.4;
  for (let i = days; i >= 0; i--) {
    const date = new Date(); date.setDate(date.getDate() - i);
    wethSupply += (Math.random() - 0.5) * 0.15; wethBorrow += (Math.random() - 0.5) * 0.2;
    usdcSupply += (Math.random() - 0.5) * 0.2;  usdcBorrow += (Math.random() - 0.5) * 0.25;
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      "WETH Supply APY": Math.max(0.1, wethSupply).toFixed(2),
      "WETH Borrow APY": Math.max(0.5, wethBorrow).toFixed(2),
      "USDC Supply APY": Math.max(0.1, usdcSupply).toFixed(2),
      "USDC Borrow APY": Math.max(0.5, usdcBorrow).toFixed(2),
    });
  }
  return data;
}

function generateBorrowVolumeData(days: number) {
  const data = [];
  for (let i = days; i >= 0; i--) {
    const date = new Date(); date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      "WETH": Math.floor(Math.random() * 50000 + 10000),
      "USDC": Math.floor(Math.random() * 80000 + 20000),
      "LINK": Math.floor(Math.random() * 20000 + 5000),
    });
  }
  return data;
}

function generateTvlData(days: number) {
  const data = [];
  let tvl = 150000;
  for (let i = days; i >= 0; i--) {
    const date = new Date(); date.setDate(date.getDate() - i);
    tvl += (Math.random() - 0.45) * 15000;
    tvl = Math.max(80000, tvl);
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      "TVL": Math.floor(tvl),
    });
  }
  return data;
}

function generateLiquidationData(days: number) {
  const data = [];
  for (let i = days; i >= 0; i--) {
    const date = new Date(); date.setDate(date.getDate() - i);
    const hasLiquidation = Math.random() < 0.15; // 15% chance each day
    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      "Liquidations": hasLiquidation ? Math.floor(Math.random() * 5 + 1) : 0,
      "Volume ($)":   hasLiquidation ? Math.floor(Math.random() * 30000 + 5000) : 0,
    });
  }
  return data;
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, prefix = "", suffix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{p.name}:</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
            {prefix}{Number(p.value).toLocaleString("en-US", { maximumFractionDigits: 2 })}{suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Chart card wrapper ─────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, badge, children }: {
  title: string; subtitle?: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="reveal card p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="section-label mb-1">{subtitle ?? "Analytics"}</p>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>{title}</h3>
        </div>
        {badge && <span className="badge badge-cyan text-xs">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

type Range = "7d" | "30d" | "90d";

function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-lg" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", display: "inline-flex" }}>
      {(["7d", "30d", "90d"] as Range[]).map(r => (
        <button key={r} onClick={() => onChange(r)}
          style={{
            padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
            background: value === r ? "var(--cyan)" : "transparent",
            color: value === r ? "#030712" : "var(--text-muted)",
            transition: "all 0.15s",
          }}>
          {r}
        </button>
      ))}
    </div>
  );
}

// ── Analytics page ────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  useScrollAnimation();
  const [range, setRange] = useState<Range>("30d");
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  const apyData         = generateApyData(days);
  const volumeData      = generateBorrowVolumeData(days);
  const tvlData         = generateTvlData(days);
  const liquidationData = generateLiquidationData(days);

  // Summary stats
  const totalLiquidations = liquidationData.reduce((s, d) => s + d["Liquidations"], 0);
  const peakTvl = Math.max(...tvlData.map(d => d.TVL));
  const avgBorrowApy = apyData.reduce((s, d) => s + Number(d["WETH Borrow APY"]), 0) / apyData.length;

  const axisStyle = { fontFamily: "var(--font-mono)", fontSize: 10, fill: "#475569" };

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10 space-y-8">

      {/* Header */}
      <div className="reveal">
        <p className="section-label mb-1">Analytics</p>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "var(--text-primary)", marginBottom: 8 }}>
              Protocol Analytics
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 500 }}>
              Historical APY trends, borrow volume, TVL, and liquidation data powered by The Graph subgraph.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <RangePicker value={range} onChange={setRange} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
              * Simulated data — connect subgraph for live
            </span>
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="reveal reveal-delay-1 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Peak TVL",        value: `$${(peakTvl / 1000).toFixed(0)}K`,      color: "var(--cyan)" },
          { label: "Avg Borrow APY",  value: `${avgBorrowApy.toFixed(2)}%`,            color: "#fbbf24" },
          { label: `${range} Liquidations`, value: String(totalLiquidations),           color: "#f87171" },
          { label: "Subgraph Status", value: "Synced",                                  color: "#34d399" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-5">
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</p>
            <p className="num" style={{ fontFamily: "var(--font-mono)", fontSize: "1.5rem", fontWeight: 500, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* TVL chart */}
      <ChartCard title="Total Value Locked" subtitle="TVL" badge={`${range}`}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={tvlData}>
            <defs>
              <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={Math.floor(days / 6)} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} width={55} />
            <Tooltip content={<CustomTooltip prefix="$" />} />
            <Area type="monotone" dataKey="TVL" stroke="#22d3ee" strokeWidth={2} fill="url(#tvlGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* APY charts — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Supply APY" subtitle="Interest rates">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={apyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={Math.floor(days / 4)} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={40} />
              <Tooltip content={<CustomTooltip suffix="%" />} />
              <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11 }} />
              <Line type="monotone" dataKey="WETH Supply APY" stroke="#22d3ee" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="USDC Supply APY" stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Borrow APY" subtitle="Interest rates">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={apyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={Math.floor(days / 4)} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={40} />
              <Tooltip content={<CustomTooltip suffix="%" />} />
              <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11 }} />
              <Line type="monotone" dataKey="WETH Borrow APY" stroke="#fbbf24" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="USDC Borrow APY" stroke="#f87171" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Borrow volume */}
      <ChartCard title="Borrow Volume by Asset" subtitle="Volume" badge="Daily">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={volumeData} barSize={range === "90d" ? 4 : range === "30d" ? 8 : 16}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={Math.floor(days / 6)} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} width={50} />
            <Tooltip content={<CustomTooltip prefix="$" />} />
            <Legend wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11 }} />
            <Bar dataKey="WETH" stackId="a" fill="#22d3ee" radius={[0, 0, 0, 0]} />
            <Bar dataKey="USDC" stackId="a" fill="#a78bfa" />
            <Bar dataKey="LINK" stackId="a" fill="#34d399" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Liquidations */}
      <ChartCard title="Liquidation Events" subtitle="Liquidations" badge="Count + Volume">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={liquidationData} barSize={range === "90d" ? 4 : range === "30d" ? 8 : 16}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={Math.floor(days / 6)} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={30} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="Liquidations" fill="#ef4444" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            Liquidations spike when ETH price drops sharply. The close factor (50%) limits single-call liquidations,
            protecting borrowers from full position closure.
          </p>
        </div>
      </ChartCard>

      {/* Subgraph info */}
      <div className="reveal card p-6">
        <div className="flex items-start gap-4">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(34,211,238,0.1)", border: "1px solid var(--border-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
            ⊕
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 8 }}>
              Connect The Graph for live data
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.65, maxWidth: 600, marginBottom: 12 }}>
              The subgraph is deployed and indexing all deposits, borrows, repayments, and liquidation events
              from block 10610131 on Sepolia. Connect Apollo Client to replace simulated data with real historical data.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="https://thegraph.com/studio" target="_blank" rel="noopener noreferrer">
                <button className="btn-secondary text-xs px-4 py-2">Subgraph Studio ↗</button>
              </a>
              <span className="badge badge-cyan text-xs">11 entities indexed</span>
              <span className="badge badge-green text-xs">Sepolia block 10610131+</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}