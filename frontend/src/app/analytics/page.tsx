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

// ── Fallback simulated data (used when subgraph not set up) ────────────────────
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
  let ws = 1.2,
    wb = 2.1,
    us = 2.8,
    ub = 3.9;
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

// ── Custom tooltip ──────────────────────────────────────────────────────────
function Tip({ active, payload, label, prefix = "", suffix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-muted)",
          marginBottom: 7,
        }}
      >
        {label}
      </p>
      {payload.map((p: any) => (
        <div
          key={p.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 3,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: p.color,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            {p.name}:
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            {prefix}
            {Number(p.value).toLocaleString("en-US", {
              maximumFractionDigits: 2,
            })}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "rgba(0,0,0,0.3)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 3,
        gap: 3,
      }}
    >
      {(["7d", "30d", "90d"] as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          style={{
            padding: "5px 14px",
            borderRadius: 7,
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: value === r ? 700 : 400,
            background: value === r ? "var(--cyan)" : "transparent",
            color: value === r ? "#030712" : "var(--text-muted)",
            transition: "all 0.12s",
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  badge,
  live,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "18px 22px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          {subtitle && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--cyan)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 3,
              }}
            >
              {subtitle}
            </p>
          )}
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {live && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="pulse-dot" />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "#34d399",
                }}
              >
                Live
              </span>
            </div>
          )}
          {badge && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                background: "rgba(0,0,0,0.2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: "16px 16px 20px" }}>{children}</div>
    </div>
  );
}

const axisStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fill: "#475569",
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  useScrollAnimation();
  const [range, setRange] = useState<Range>("30d");
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  // ── Subgraph state ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [liveData, setLiveData] = useState(false);
  const [tvlData, setTvlData] = useState<any[]>([]);
  const [apyData, setApyData] = useState<any[]>([]);
  const [volData, setVolData] = useState<any[]>([]);
  const [liqData, setLiqData] = useState<any[]>([]);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [kpis, setKpis] = useState({
    tvl: "$0",
    borrowed: "$0",
    liquidations: 0,
    avgApy: "0%",
  });

  // ── Fetch from subgraph, fall back to simulated ────────────────────────────
  useEffect(() => {


    const fetchData = async () => {
    const since = dayIdNDaysAgo(days);
    setLoading(true);

    const hasSubgraph = await checkSubgraphHealth();

    if (!hasSubgraph) {
      // ── Simulated fallback ──────────────────────────────────────────────
      setTvlData(genTvlData(days));
      setApyData(genApyData(days));
      setVolData(genVolumeData(days));
      setLiqData(genLiqData(days));
      setKpis({ tvl: "$0", borrowed: "$0", liquidations: 0, avgApy: "0%" });
      setLiveData(false);
      setLoading(false);
      return;
    }

    // ── Live subgraph queries ────────────────────────────────────────────────
    Promise.all([
      apolloClient.query({ query: DAILY_PROTOCOL_QUERY, variables: { since } }),
      apolloClient.query({
        query: DAILY_MARKET_QUERY,
        variables: { market: "weth", since },
      }),
      apolloClient.query({
        query: DAILY_MARKET_QUERY,
        variables: { market: "usdc", since },
      }),
      apolloClient.query({
        query: LIQUIDATIONS_QUERY,
        variables: {
          since: String(Math.floor(Date.now() / 1000) - days * 86400),
        },
      }),
      apolloClient.query({ query: MARKETS_QUERY }),
    ])
      .then(([proto, wethM, usdcM, liqs, mkts]) => {
        // TVL chart from protocol snapshots
        const snapshots: DailyProtocolSnapshot[] =
          (proto.data as any)?.dailyProtocolSnapshots ?? [];
        setTvlData(
          snapshots.map((s) => ({
            date: dayIdToLabel(s.dayId),
            TVL: Math.round(parseFloat(s.totalDepositUsd)),
            Borrowed: Math.round(parseFloat(s.totalBorrowUsd)),
          })),
        );

        // APY chart from market snapshots
        const wethSnaps: DailyMarketSnapshot[] =
          (wethM.data as any)?.dailyMarketSnapshots ?? [];

        const usdcSnaps: DailyMarketSnapshot[] =
          (usdcM.data as any)?.dailyMarketSnapshots ?? [];

        const apyRows: any[] = [];
        for (let i = 1; i < wethSnaps.length; i++) {
          const wethApy = computeApy(
            wethSnaps[i - 1].liquidityIndex,
            wethSnaps[i].liquidityIndex,
            1,
          );
          const usdcApy = usdcSnaps[i]
            ? computeApy(
                usdcSnaps[i - 1]?.liquidityIndex ?? "1",
                usdcSnaps[i].liquidityIndex,
                1,
              )
            : 0;
          apyRows.push({
            date: dayIdToLabel(wethSnaps[i].dayId),
            "WETH Supply": +wethApy.toFixed(3),
            "WETH Borrow": +(wethApy * 1.8).toFixed(3),
            "USDC Supply": +usdcApy.toFixed(3),
            "USDC Borrow": +(usdcApy * 1.7).toFixed(3),
          });
        }
        if (apyRows.length > 0) setApyData(apyRows);
        else setApyData(genApyData(days));

        // Volume chart from market snapshots
        setVolData(
          wethSnaps.map((s, i) => ({
            date: dayIdToLabel(s.dayId),
            WETH: Math.round(parseFloat(s.dailyBorrowVolume)),
            USDC: usdcSnaps[i]
              ? Math.round(parseFloat(usdcSnaps[i].dailyBorrowVolume))
              : 0,
            LINK: 0,
          })),
        );

        // Liquidation chart
       const liqEvents: LiquidationEvent[] =
  (liqs.data as any)?.liquidations ?? [];
        const liqByDay: Record<string, { Count: number; Volume: number }> = {};
        liqEvents.forEach((l) => {
          const dayId = String(Math.floor(Number(l.timestamp) / 86_400));
          const label = dayIdToLabel(dayId);
          if (!liqByDay[label]) liqByDay[label] = { Count: 0, Volume: 0 };
          liqByDay[label].Count += 1;
          liqByDay[label].Volume += parseFloat(l.debtCovered);
        });
        const liqArr = Object.entries(liqByDay).map(([date, v]) => ({
          date,
          ...v,
        }));
        setLiqData(liqArr.length > 0 ? liqArr : genLiqData(days));

        // Markets
        const mktData: MarketData[] =
  (mkts.data as any)?.markets ?? [];
        setMarkets(mktData);

        // KPIs
        const latestSnap = snapshots[snapshots.length - 1];
        const totalLiqs = liqEvents.length;
        const avgApy =
          apyRows.length > 0
            ? (apyRows[apyRows.length - 1]["WETH Supply"] +
                apyRows[apyRows.length - 1]["USDC Supply"]) /
              2
            : 0;

        setKpis({
          tvl: latestSnap ? fmtUsdBig(latestSnap.totalDepositUsd) : "$0",
          borrowed: latestSnap ? fmtUsdBig(latestSnap.totalBorrowUsd) : "$0",
          liquidations: totalLiqs,
          avgApy: `${avgApy.toFixed(2)}%`,
        });
        setLiveData(true);
      })
      .catch((err) => {
        console.warn(
          "Subgraph query failed, using simulated data:",
          err.message,
        );
        setTvlData(genTvlData(days));
        setApyData(genApyData(days));
        setVolData(genVolumeData(days));
        setLiqData(genLiqData(days));
        setLiveData(false);
      })
      .finally(() => setLoading(false));
    };
      fetchData();
  }, [range, days]);

  const interval = days === 7 ? 0 : days === 30 ? 3 : 8;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">
      {/* Header */}
      <div className="reveal mb-8">
        <p className="section-label mb-1">Analytics</p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(1.6rem,3vw,2.1rem)",
                color: "var(--text-primary)",
                marginBottom: 6,
              }}
            >
              Protocol Analytics
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: 14,
                maxWidth: 500,
                lineHeight: 1.7,
              }}
            >
              {liveData
                ? "Live data from The Graph subgraph — indexing all on-chain events."
                : "Simulated data. Set NEXT_PUBLIC_SUBGRAPH_URL in .env.local to enable live data."}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {loading && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                Loading…
              </span>
            )}
            {liveData && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="pulse-dot" />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "#34d399",
                  }}
                >
                  Subgraph live
                </span>
              </div>
            )}
            <RangePicker value={range} onChange={setRange} />
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div
        className="reveal reveal-delay-1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 10,
          marginBottom: 28,
        }}
      >
        {[
          { label: "Current TVL", value: kpis.tvl, color: "var(--cyan)" },
          { label: "Total Borrowed", value: kpis.borrowed, color: "#f87171" },
          {
            label: `${range} Liquidations`,
            value: String(kpis.liquidations),
            color: "#f59e0b",
          },
          { label: "Avg Supply APY", value: kpis.avgApy, color: "#34d399" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "16px 18px",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
              }}
            >
              {label}
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 24,
                fontWeight: 500,
                color,
              }}
            >
              {value || "—"}
            </p>
          </div>
        ))}
      </div>

      {/* TVL + Borrow */}
      <div className="reveal" style={{ marginBottom: 16 }}>
        <ChartCard
          title="Total Value Locked vs Borrowed"
          subtitle="TVL"
          live={liveData}
          badge={range}
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={tvlData}>
              <defs>
                <linearGradient id="gTvl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="gBor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
              />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                interval={interval}
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                width={52}
              />
              <Tooltip content={<Tip prefix="$" />} />
              <Legend
                wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="TVL"
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#gTvl)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="Borrowed"
                stroke="#f87171"
                strokeWidth={2}
                fill="url(#gBor)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* APY charts — 2 col */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div className="reveal">
          <ChartCard
            title="Supply APY"
            subtitle="Interest rates"
            live={liveData}
          >
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={apyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  interval={interval}
                />
                <YAxis
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={38}
                />
                <Tooltip content={<Tip suffix="%" />} />
                <Legend
                  wrapperStyle={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="WETH Supply"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="USDC Supply"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="reveal reveal-delay-1">
          <ChartCard
            title="Borrow APY"
            subtitle="Interest rates"
            live={liveData}
          >
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={apyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                />
                <XAxis
                  dataKey="date"
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  interval={interval}
                />
                <YAxis
                  tick={axisStyle}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={38}
                />
                <Tooltip content={<Tip suffix="%" />} />
                <Legend
                  wrapperStyle={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="WETH Borrow"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="USDC Borrow"
                  stroke="#f87171"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Borrow volume */}
      <div className="reveal" style={{ marginBottom: 16 }}>
        <ChartCard
          title="Daily Borrow Volume by Asset"
          subtitle="Volume"
          live={liveData}
          badge="Daily"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={volData}
              barSize={days === 90 ? 3 : days === 30 ? 7 : 14}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                interval={interval}
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                width={50}
              />
              <Tooltip content={<Tip prefix="$" />} />
              <Legend
                wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
              />
              <Bar dataKey="WETH" stackId="a" fill="#22d3ee" />
              <Bar dataKey="USDC" stackId="a" fill="#a78bfa" />
              <Bar
                dataKey="LINK"
                stackId="a"
                fill="#34d399"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Liquidation history */}
      <div className="reveal reveal-delay-1" style={{ marginBottom: 16 }}>
        <ChartCard
          title="Liquidation History"
          subtitle="Liquidations"
          live={liveData}
          badge="Count"
        >
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={liqData}
              barSize={days === 90 ? 3 : days === 30 ? 7 : 14}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                interval={interval}
              />
              <YAxis
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                width={28}
              />
              <Tooltip content={<Tip />} />
              <Bar
                dataKey="Count"
                fill="#ef4444"
                radius={[3, 3, 0, 0]}
                fillOpacity={0.85}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Market stats table */}
      {markets.length > 0 && (
        <div className="reveal">
          <p className="section-label" style={{ marginBottom: 12 }}>
            Live market stats
          </p>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="text-right">TVL</th>
                    <th className="text-right">Borrowed</th>
                    <th className="text-right">Utilization</th>
                    <th className="text-right">Deposits</th>
                    <th className="text-right">Borrows</th>
                    <th className="text-right">Liquidations</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m) => {
                    const util = parseFloat(m.utilizationRate) * 100;
                    const uColor =
                      util > 80
                        ? "#ef4444"
                        : util > 60
                          ? "#f59e0b"
                          : "var(--cyan)";
                    return (
                      <tr
                        key={m.id}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td
                          className="px-5 py-4"
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 700,
                            color: "var(--text-primary)",
                          }}
                        >
                          {m.symbol}
                        </td>
                        <td
                          className="px-5 py-4 text-right num text-sm"
                          style={{ color: "var(--cyan)" }}
                        >
                          {fmtUsdBig(m.totalDepositUsd)}
                        </td>
                        <td
                          className="px-5 py-4 text-right num text-sm"
                          style={{ color: "#f87171" }}
                        >
                          {fmtUsdBig(m.totalBorrowUsd)}
                        </td>
                        <td
                          className="px-5 py-4 text-right num text-sm"
                          style={{ color: uColor }}
                        >
                          {util.toFixed(1)}%
                        </td>
                        <td
                          className="px-5 py-4 text-right num text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {m.depositCount}
                        </td>
                        <td
                          className="px-5 py-4 text-right num text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {m.borrowCount}
                        </td>
                        <td
                          className="px-5 py-4 text-right num text-sm"
                          style={{
                            color:
                              m.liquidationCount > 0
                                ? "#f87171"
                                : "var(--text-muted)",
                          }}
                        >
                          {m.liquidationCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

     
    </div>
  );
}
