"use client";

import { useState, useEffect } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  apolloClient,
  checkSubgraphHealth,
  DAILY_PROTOCOL_QUERY,
  DAILY_MARKET_QUERY,
  LIQUIDATIONS_QUERY,
  MARKETS_QUERY,
  DailyProtocolSnapshot,
  DailyMarketSnapshot,
  LiquidationEvent,
  MarketData,
  dayIdToLabel,
  fmtUsdBig,
  computeApy,
  dayIdNDaysAgo,
} from "@/lib/graphql";

type Range = "7d" | "30d" | "90d";

// ── Fallback simulated data ──────────────────────────────────────────────────
function genTvlData(days: number) {
  const data = [];
  let tvl = 150_000;
  for (let i = days; i >= 0; i--) {
    tvl = Math.max(80_000, tvl + (Math.random() - 0.45) * 12_000);
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      TVL: Math.floor(tvl),
      Borrowed: Math.floor(tvl * (0.35 + Math.random() * 0.2)),
    });
  }
  return data;
}
function genApyData(days: number) {
  const data = [];
  let ws = 1.2, wb = 2.1, us = 2.8, ub = 3.9;
  for (let i = days; i >= 0; i--) {
    ws += (Math.random() - 0.5) * 0.12;
    wb += (Math.random() - 0.5) * 0.18;
    us += (Math.random() - 0.5) * 0.18;
    ub += (Math.random() - 0.5) * 0.22;
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      "WETH Supply": +Math.max(0.1, ws).toFixed(2),
      "WETH Borrow": +Math.max(0.5, wb).toFixed(2),
      "USDC Supply": +Math.max(0.1, us).toFixed(2),
      "USDC Borrow": +Math.max(0.5, ub).toFixed(2),
    });
  }
  return data;
}
function genVolumeData(days: number) {
  const data = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      WETH: Math.floor(Math.random() * 45_000 + 8_000),
      USDC: Math.floor(Math.random() * 75_000 + 15_000),
      LINK: Math.floor(Math.random() * 18_000 + 3_000),
    });
  }
  return data;
}
function genLiqData(days: number) {
  const data = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const hasLiq = Math.random() < 0.15;
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Count: hasLiq ? Math.floor(Math.random() * 5 + 1) : 0,
      Volume: hasLiq ? Math.floor(Math.random() * 28_000 + 4_000) : 0,
    });
  }
  return data;
}

// ── Custom Tooltip ───────────────────────────────────────────────────────────
function Tip({ active, payload, label, prefix = "", suffix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <p className="tooltip-label">{label}</p>
      <div className="tooltip-body">
        {payload.map((p: any) => (
          <div key={p.name} className="tooltip-item">
            <div className="tooltip-dot" style={{ background: p.color }} />
            <span className="tooltip-name">{p.name}:</span>
            <span className="tooltip-value">
              {prefix}
              {Number(p.value).toLocaleString("en-US", { maximumFractionDigits: 2 })}
              {suffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modern Chart Wrapper ─────────────────────────────────────────────────────
function AppChartCard({ title, subtitle, live, badge, children }: { title: string; subtitle?: string; live?: boolean; badge?: string; children: React.ReactNode }) {
  return (
    <div className="app-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          {subtitle && <p className="text-xs font-bold tracking-wider uppercase mb-1" style={{ color: "var(--cyan)" }}>{subtitle}</p>}
          <h3 className="font-display font-bold text-xl text-primary">{title}</h3>
        </div>
        <div className="flex items-center gap-3">
          {live && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Live</span>
            </div>
          )}
          {badge && (
            <span className="px-3 py-1.5 rounded-full bg-[var(--bg-base)] border border-[var(--border)] text-[10px] font-bold uppercase tracking-wider text-muted">
              {badge}
            </span>
          )}
        </div>
      </div>
      <div style={{ width: "100%", height: "260px" }}>{children}</div>
    </div>
  );
}

const axisStyle = { fontFamily: "var(--font-mono)", fontSize: 11, fill: "var(--text-muted)" };

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  useScrollAnimation();
  const [range, setRange] = useState<Range>("30d");
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  const [loading, setLoading] = useState(false);
  const [liveData, setLiveData] = useState(false);
  const [tvlData, setTvlData] = useState<any[]>([]);
  const [apyData, setApyData] = useState<any[]>([]);
  const [volData, setVolData] = useState<any[]>([]);
  const [liqData, setLiqData] = useState<any[]>([]);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [kpis, setKpis] = useState({ tvl: "$0", borrowed: "$0", liquidations: 0, avgApy: "0%" });

  useEffect(() => {
    const fetchData = async () => {
      const since = dayIdNDaysAgo(days);
      setLoading(true);
      const hasSubgraph = await checkSubgraphHealth();

      if (!hasSubgraph) {
        setTvlData(genTvlData(days)); setApyData(genApyData(days));
        setVolData(genVolumeData(days)); setLiqData(genLiqData(days));
        setKpis({ tvl: "$0", borrowed: "$0", liquidations: 0, avgApy: "0%" });
        setLiveData(false); setLoading(false); return;
      }

      Promise.all([
        apolloClient.query({ query: DAILY_PROTOCOL_QUERY, variables: { since } }),
        apolloClient.query({ query: DAILY_MARKET_QUERY, variables: { market: "weth", since } }),
        apolloClient.query({ query: DAILY_MARKET_QUERY, variables: { market: "usdc", since } }),
        apolloClient.query({ query: LIQUIDATIONS_QUERY, variables: { since: String(Math.floor(Date.now() / 1000) - days * 86400) } }),
        apolloClient.query({ query: MARKETS_QUERY }),
      ]).then(([proto, wethM, usdcM, liqs, mkts]) => {
        const snapshots: DailyProtocolSnapshot[] = (proto.data as any)?.dailyProtocolSnapshots ?? [];
        setTvlData(snapshots.map((s) => ({ date: dayIdToLabel(s.dayId), TVL: Math.round(parseFloat(s.totalDepositUsd)), Borrowed: Math.round(parseFloat(s.totalBorrowUsd)) })));

        const wethSnaps: DailyMarketSnapshot[] = (wethM.data as any)?.dailyMarketSnapshots ?? [];
        const usdcSnaps: DailyMarketSnapshot[] = (usdcM.data as any)?.dailyMarketSnapshots ?? [];
        const apyRows: any[] = [];
        
        for (let i = 1; i < wethSnaps.length; i++) {
          const wethApy = computeApy(wethSnaps[i - 1].liquidityIndex, wethSnaps[i].liquidityIndex, 1);
          const usdcApy = usdcSnaps[i] ? computeApy(usdcSnaps[i - 1]?.liquidityIndex ?? "1", usdcSnaps[i].liquidityIndex, 1) : 0;
          apyRows.push({
            date: dayIdToLabel(wethSnaps[i].dayId),
            "WETH Supply": +wethApy.toFixed(3), "WETH Borrow": +(wethApy * 1.8).toFixed(3),
            "USDC Supply": +usdcApy.toFixed(3), "USDC Borrow": +(usdcApy * 1.7).toFixed(3),
          });
        }
        if (apyRows.length > 0) setApyData(apyRows); else setApyData(genApyData(days));

        setVolData(wethSnaps.map((s, i) => ({
          date: dayIdToLabel(s.dayId), WETH: Math.round(parseFloat(s.dailyBorrowVolume)),
          USDC: usdcSnaps[i] ? Math.round(parseFloat(usdcSnaps[i].dailyBorrowVolume)) : 0, LINK: 0,
        })));

        const liqEvents: LiquidationEvent[] = (liqs.data as any)?.liquidations ?? [];
        const liqByDay: Record<string, { Count: number; Volume: number }> = {};
        liqEvents.forEach((l) => {
          const dayId = String(Math.floor(Number(l.timestamp) / 86_400));
          const label = dayIdToLabel(dayId);
          if (!liqByDay[label]) liqByDay[label] = { Count: 0, Volume: 0 };
          liqByDay[label].Count += 1;
          liqByDay[label].Volume += parseFloat(l.debtCovered);
        });
        const liqArr = Object.entries(liqByDay).map(([date, v]) => ({ date, ...v }));
        setLiqData(liqArr.length > 0 ? liqArr : genLiqData(days));

        const mktData: MarketData[] = (mkts.data as any)?.markets ?? [];
        setMarkets(mktData);

        const latestSnap = snapshots[snapshots.length - 1];
        const totalLiqs = liqEvents.length;
        const avgApy = apyRows.length > 0 ? (apyRows[apyRows.length - 1]["WETH Supply"] + apyRows[apyRows.length - 1]["USDC Supply"]) / 2 : 0;

        setKpis({
          tvl: latestSnap ? fmtUsdBig(latestSnap.totalDepositUsd) : "$0",
          borrowed: latestSnap ? fmtUsdBig(latestSnap.totalBorrowUsd) : "$0",
          liquidations: totalLiqs,
          avgApy: `${avgApy.toFixed(2)}%`,
        });
        setLiveData(true);
      }).catch((err) => {
        console.warn("Subgraph query failed, using simulated data:", err.message);
        setTvlData(genTvlData(days)); setApyData(genApyData(days));
        setVolData(genVolumeData(days)); setLiqData(genLiqData(days));
        setLiveData(false);
      }).finally(() => setLoading(false));
    };
    fetchData();
  }, [range, days]);

  const interval = days === 7 ? 0 : days === 30 ? 3 : 8;

  return (
    <>
      <style>{`
        /* Modern App Soft UI CSS */
        .text-primary { color: var(--text-primary); }
        .text-secondary { color: var(--text-secondary); }
        .text-muted { color: var(--text-muted); }

        .app-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 24px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.03);
          padding: 28px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        /* iOS-Style Segmented Control */
        .ios-tabs {
          display: inline-flex;
          background: var(--bg-base);
          padding: 6px;
          border-radius: 100px;
          border: 1px solid var(--border);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
        }
        .ios-tab-btn {
          padding: 8px 24px;
          border-radius: 100px;
          border: none;
          background: transparent;
          font-family: var(--font-mono);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ios-tab-btn.active {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          border: 1px solid var(--border);
        }

        /* Custom Tooltip */
        .custom-tooltip {
          background: var(--bg-card);
          backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.1);
        }
        .tooltip-label {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 12px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
        }
        .tooltip-body { display: flex; flex-direction: column; gap: 8px; }
        .tooltip-item { display: flex; align-items: center; gap: 8px; }
        .tooltip-dot { width: 10px; height: 10px; border-radius: 4px; }
        .tooltip-name { font-family: var(--font-display); font-size: 13px; color: var(--text-secondary); }
        .tooltip-value { font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: var(--text-primary); margin-left: auto; }

        /* Modern Table */
        .app-table-wrapper {
          overflow-x: auto;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--bg-base);
        }
        .app-table { width: 100%; min-width: 800px; border-collapse: collapse; text-align: left; }
        .app-table th {
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          background: rgba(0,0,0,0.02);
        }
        .app-table td {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--text-primary);
        }
        .app-table tr:last-child td { border-bottom: none; }
        .app-table tr:hover td { background: var(--bg-card); }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 md:px-6 py-12">
        
        {/* Header */}
        <div className="reveal flex flex-col md:flex-row justify-between md:items-end gap-6 mb-12">
          <div>
            <h1 className="font-display font-bold text-[clamp(2.2rem,4vw,3rem)] text-primary tracking-tight mb-2">
              Protocol Analytics
            </h1>
            <p className="text-secondary text-sm max-w-xl leading-relaxed">
              {liveData
                ? "Live data streamed directly from The Graph subgraph, indexing all on-chain events in real-time."
                : "Displaying simulated data. Configure your subgraph URL to enable live network indexing."}
            </p>
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className="flex items-center gap-3">
              {loading && <span className="text-xs font-mono text-muted animate-pulse">Syncing Network...</span>}
            </div>
            <div className="ios-tabs">
              {(["7d", "30d", "90d"] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={`ios-tab-btn ${range === r ? 'active' : ''}`}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div className="reveal reveal-delay-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {[
            { label: "Current TVL", value: kpis.tvl, c: "#0ea5e9" }, // Blue
            { label: "Total Borrowed", value: kpis.borrowed, c: "#f43f5e" }, // Rose
            { label: `${range} Liquidations`, value: String(kpis.liquidations), c: "#f59e0b" }, // Amber
            { label: "Average Supply APY", value: kpis.avgApy, c: "#10b981" }, // Emerald
          ].map(({ label, value, c }) => (
            <div key={label} className="app-card !p-6 flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span>
              <span className="font-mono text-3xl font-bold" style={{ color: c }}>{value || "—"}</span>
            </div>
          ))}
        </div>

        {/* TVL + Borrow */}
        <div className="reveal mb-8">
          <AppChartCard title="Liquidity & Debt" subtitle="Protocol Health" live={liveData} badge={range}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tvlData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gTvl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gBor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={interval} dy={10} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} width={60} />
                <Tooltip content={<Tip prefix="$" />} cursor={{ stroke: 'var(--border)', strokeWidth: 2, strokeDasharray: '4 4' }} />
                <Legend wrapperStyle={{ fontFamily: "var(--font-display)", fontSize: 13, paddingTop: "20px" }} iconType="circle" />
                <Area type="monotone" dataKey="TVL" stroke="#0ea5e9" strokeWidth={3} fill="url(#gTvl)" activeDot={{ r: 6, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="Borrowed" stroke="#f43f5e" strokeWidth={3} fill="url(#gBor)" activeDot={{ r: 6, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </AppChartCard>
        </div>

        {/* APY Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="reveal">
            <AppChartCard title="Supply APY" subtitle="Yields" live={liveData}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={apyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={interval} dy={10} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={60} />
                  <Tooltip content={<Tip suffix="%" />} cursor={{ stroke: 'var(--border)' }} />
                  <Legend wrapperStyle={{ fontFamily: "var(--font-display)", fontSize: 13, paddingTop: "20px" }} iconType="circle" />
                  <Line type="monotone" dataKey="WETH Supply" stroke="#0ea5e9" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="USDC Supply" stroke="#8b5cf6" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </AppChartCard>
          </div>
          
          <div className="reveal reveal-delay-1">
            <AppChartCard title="Borrow APY" subtitle="Interest" live={liveData}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={apyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={interval} dy={10} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={60} />
                  <Tooltip content={<Tip suffix="%" />} cursor={{ stroke: 'var(--border)' }} />
                  <Legend wrapperStyle={{ fontFamily: "var(--font-display)", fontSize: 13, paddingTop: "20px" }} iconType="circle" />
                  <Line type="monotone" dataKey="WETH Borrow" stroke="#f59e0b" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="USDC Borrow" stroke="#f43f5e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </AppChartCard>
          </div>
        </div>

        {/* Volume & Liquidations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div className="reveal">
            <AppChartCard title="Borrow Volume" subtitle="Activity" live={liveData} badge="Daily">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volData} margin={{ top: 10, right: 0, left: -10, bottom: 0 }} barSize={days === 90 ? 4 : days === 30 ? 8 : 16}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={interval} dy={10} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} width={60} />
                  <Tooltip content={<Tip prefix="$" />} cursor={{ fill: 'var(--bg-base)', opacity: 0.5 }} />
                  <Legend wrapperStyle={{ fontFamily: "var(--font-display)", fontSize: 13, paddingTop: "20px" }} iconType="circle" />
                  <Bar dataKey="WETH" stackId="a" fill="#0ea5e9" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="USDC" stackId="a" fill="#8b5cf6" />
                  <Bar dataKey="LINK" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </AppChartCard>
          </div>

          <div className="reveal reveal-delay-1">
            <AppChartCard title="Liquidations" subtitle="Risk Events" live={liveData} badge="Count">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={liqData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }} barSize={days === 90 ? 4 : days === 30 ? 8 : 16}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={interval} dy={10} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<Tip />} cursor={{ fill: 'var(--bg-base)', opacity: 0.5 }} />
                  <Bar dataKey="Count" fill="#f43f5e" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </AppChartCard>
          </div>
        </div>

        {/* Market Stats Table */}
        {markets.length > 0 && (
          <div className="reveal mb-12">
            <h3 className="font-display font-bold text-xl text-primary px-2 mb-6">Market Overview</h3>
            <div className="app-table-wrapper">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="text-right">Total Value Locked</th>
                    <th className="text-right">Total Borrowed</th>
                    <th className="text-right">Utilization</th>
                    <th className="text-right">Suppliers</th>
                    <th className="text-right">Borrowers</th>
                    <th className="text-right">Liquidations</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m) => {
                    const util = parseFloat(m.utilizationRate) * 100;
                    const uColor = util > 80 ? "#f43f5e" : util > 60 ? "#f59e0b" : "var(--cyan)";
                    return (
                      <tr key={m.id}>
                        <td className="font-bold">{m.symbol}</td>
                        <td className="text-right" style={{ color: "#0ea5e9" }}>{fmtUsdBig(m.totalDepositUsd)}</td>
                        <td className="text-right" style={{ color: "#f43f5e" }}>{fmtUsdBig(m.totalBorrowUsd)}</td>
                        <td className="text-right">
                          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${uColor}15`, color: uColor }}>
                            {util.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-right text-secondary">{m.depositCount}</td>
                        <td className="text-right text-secondary">{m.borrowCount}</td>
                        <td className="text-right">
                          {m.liquidationCount > 0 
                            ? <span className="text-red-500 font-bold">{m.liquidationCount}</span>
                            : <span className="text-muted">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

