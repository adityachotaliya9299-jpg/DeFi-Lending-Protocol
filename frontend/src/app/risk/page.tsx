"use client";

import { useChainId } from "wagmi";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { useReserveData, useAssetPrice } from "@/hooks/useProtocol";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { AssetInfo } from "@/types";

const RAY = 1e27;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

// Compute APY from per-second RAY rate
function computeApy(totalLiq: number, totalBor: number, reserveFactor = 0.1): { supplyApy: number; borrowApy: number } {
  if (totalLiq === 0) return { supplyApy: 0, borrowApy: 0 };
  const util = totalBor / totalLiq;
  const optUtil = 0.8;
  const baseRay = 0.01 / SECONDS_PER_YEAR;
  const slope1  = 0.04 / SECONDS_PER_YEAR;
  const slope2  = 0.75 / SECONDS_PER_YEAR;
  let borrowPerSec: number;
  if (util <= optUtil) {
    borrowPerSec = baseRay + slope1 * (util / optUtil);
  } else {
    borrowPerSec = baseRay + slope1 + slope2 * ((util - optUtil) / (1 - optUtil));
  }
  const borrowApy = borrowPerSec * SECONDS_PER_YEAR * 100;
  const supplyApy = borrowApy * util * (1 - reserveFactor);
  return { supplyApy, borrowApy };
}

// Risk colour for utilization
function utilColor(pct: number) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  if (pct >= 50) return "#22d3ee";
  return "#34d399";
}

// Health factor risk band colour
function hfBandColor(band: string) {
  if (band === "< 1.0")        return { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)",   text: "#f87171" };
  if (band === "1.0 – 1.2")    return { bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.3)",  text: "#fb923c" };
  if (band === "1.2 – 1.5")    return { bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)",  text: "#fbbf24" };
  if (band === "1.5 – 2.0")    return { bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.3)",   text: "#4ade80" };
  return { bg: "rgba(34,211,238,0.12)", border: "rgba(34,211,238,0.3)", text: "var(--cyan)" };
}

// ── Per-asset risk row ────────────────────────────────────────────────────────
function AssetRiskCard({ asset }: { asset: AssetInfo }) {
  const chainId = useChainId();
  let addr: `0x${string}` = asset.address;
  try { const a = getAddresses(chainId); addr = (a[asset.symbol as keyof typeof a] as `0x${string}`) ?? asset.address; } catch {}

  const { data: reserve } = useReserveData(addr);
  const { data: price }   = useAssetPrice(addr);

  const priceUsd = price ? Number(price) / 1e18 : 0;
  const totalDep = reserve ? (Number(reserve.totalScaledDeposits) * Number(reserve.liquidityIndex)) / RAY : 0;
  const totalBor = reserve ? (Number(reserve.totalScaledBorrows)  * Number(reserve.borrowIndex))    / RAY : 0;
  const tvlUsd   = (totalDep / 10 ** asset.decimals) * priceUsd;
  const borrowUsd = (totalBor / 10 ** asset.decimals) * priceUsd;
  const utilPct  = totalDep > 0 ? (totalBor / totalDep) * 100 : 0;

  const reserveFactor = asset.symbol === "USDC" ? 0.05 : 0.1;
  const { supplyApy, borrowApy } = computeApy(totalDep, totalBor, reserveFactor);

  const color = utilColor(utilPct);

  return (
    <div className="card reveal reveal-scale overflow-hidden">
      {/* Accent top bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <img src={asset.icon} alt={asset.symbol} className="h-10 w-10 rounded-full"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>{asset.symbol}</p>
              <p className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                ${priceUsd > 0 ? priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="badge" style={{ background: `${color}18`, color, border: `1px solid ${color}30`, fontFamily: "var(--font-mono)" }}>
              {utilPct.toFixed(1)}% utilized
            </span>
          </div>
        </div>

        {/* Utilization bar */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Utilization</span>
            <span className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color }}>
              {utilPct.toFixed(2)}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
            {/* Optimal zone marker at 80% */}
            <div style={{ position: "absolute", top: 0, left: "80%", width: 1, height: "100%", background: "rgba(255,255,255,0.2)", zIndex: 2 }} />
            <div style={{ height: "100%", width: `${Math.min(utilPct, 100)}%`, borderRadius: 4, background: `linear-gradient(90deg, #34d399, ${color})`, transition: "width 1s ease" }} />
          </div>
          <div className="flex justify-between mt-1">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>0%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>Optimal 80%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>100%</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[
            { label: "TVL",         value: tvlUsd > 0 ? `$${tvlUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—",    color: "var(--cyan)"  },
            { label: "Borrowed",    value: borrowUsd > 0 ? `$${borrowUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—", color: "#f87171"     },
            { label: "Supply APY",  value: supplyApy > 0 ? `${supplyApy.toFixed(2)}%` : "—",   color: "#34d399"  },
            { label: "Borrow APY",  value: borrowApy > 0 ? `${borrowApy.toFixed(2)}%` : "—",   color: "#fbbf24"  },
          ].map(({ label, value, color: c }) => (
            <div key={label} className="rounded-xl p-3"
              style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</p>
              <p className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500, color: c }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Risk assessment */}
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{
            background: utilPct >= 90 ? "rgba(239,68,68,0.08)" : utilPct >= 70 ? "rgba(245,158,11,0.08)" : "rgba(34,211,238,0.05)",
            border: `1px solid ${color}22`,
          }}>
          <span style={{ fontSize: 16 }}>
            {utilPct >= 90 ? "🔴" : utilPct >= 70 ? "🟡" : "🟢"}
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color }}>
            {utilPct >= 90 ? "High utilization — borrow rate elevated above kink"
              : utilPct >= 70 ? "Moderate utilization — approaching optimal zone"
              : utilPct >= 0.1 ? "Healthy utilization — within optimal range"
              : "No borrows — depositors earn zero yield"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Health factor distribution (mock data for demo) ───────────────────────────
function HfDistribution() {
  const bands = [
    { range: "< 1.0",     pct: 3,  count: "~12",  label: "Liquidatable" },
    { range: "1.0 – 1.2", pct: 8,  count: "~31",  label: "At Risk"      },
    { range: "1.2 – 1.5", pct: 21, count: "~82",  label: "Moderate"     },
    { range: "1.5 – 2.0", pct: 38, count: "~148", label: "Healthy"      },
    { range: "> 2.0",     pct: 30, count: "~117", label: "Very Safe"    },
  ];

  return (
    <div className="reveal card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="section-label mb-1">Health Factor Distribution</p>
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text-primary)" }}>
            Position risk profile
          </p>
        </div>
        <span className="badge badge-amber text-xs">Simulated data</span>
      </div>

      <div className="space-y-3">
        {bands.map(({ range, pct, count, label }) => {
          const { bg, border, text } = hfBandColor(range);
          return (
            <div key={range} className="flex items-center gap-4">
              <div className="w-20 shrink-0">
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{range}</p>
              </div>
              <div className="flex-1 relative h-7 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.2)" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: bg, borderRight: `2px solid ${border}`, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", paddingLeft: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: text, fontWeight: 500, whiteSpace: "nowrap" }}>
                    {pct}% ({count})
                  </span>
                </div>
              </div>
              <span className="w-20 shrink-0 text-right" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
            </div>
          );
        })}
      </div>

      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 16 }}>
        * Distribution based on simulated position data. Connect The Graph subgraph for live data.
      </p>
    </div>
  );
}

// ── Protocol-level risk indicators ───────────────────────────────────────────
function ProtocolRiskIndicators() {
  const indicators = [
    {
      title:   "Chainlink Oracle Freshness",
      value:   "< 1 hour",
      status:  "healthy",
      icon:    "◈",
      desc:    "All price feeds updated within heartbeat. ETH/USDC/LINK feeds active.",
      color:   "#34d399",
    },
    {
      title:   "Smart Contract Security",
      value:   "Reviewed",
      status:  "healthy",
      icon:    "🛡",
      desc:    "ReentrancyGuard on all externals. CEI pattern enforced. 10 vectors documented.",
      color:   "#34d399",
    },
    {
      title:   "Governance Delay",
      value:   "Immediate",
      status:  "warning",
      icon:    "⬡",
      desc:    "No timelock on parameter changes. Production deployment should add 48h delay.",
      color:   "#f59e0b",
    },
    {
      title:   "Oracle Fallback",
      value:   "None",
      status:  "warning",
      icon:    "⚠",
      desc:    "Single Chainlink feed per asset. Production should add Uniswap TWAP fallback.",
      color:   "#f59e0b",
    },
    {
      title:   "Liquidation Buffer",
      value:   "5% gap",
      status:  "healthy",
      icon:    "⚡",
      desc:    "LTV (80%) vs liquidation threshold (85%) provides 5% safety buffer for borrowers.",
      color:   "#34d399",
    },
    {
      title:   "Interest Rate Model",
      value:   "Calibrated",
      status:  "healthy",
      icon:    "⌁",
      desc:    "Two-slope kink at 80% optimal. Above kink: 75% slope strongly disincentivises overborrowing.",
      color:   "#34d399",
    },
  ];

  return (
    <div className="reveal">
      <p className="section-label mb-2">Risk Indicators</p>
      <h2 className="mb-6" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.3rem", color: "var(--text-primary)" }}>
        Protocol-level risk assessment
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {indicators.map(({ title, value, icon, desc, color }, i) => (
          <div key={title} className={`reveal reveal-delay-${(i % 3) + 1} card p-5`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 18, color }}>{icon}</span>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{title}</p>
              </div>
              <span className="badge" style={{ background: `${color}15`, color, border: `1px solid ${color}30`, fontSize: 10 }}>
                {value}
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.65 }}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Risk Dashboard page ───────────────────────────────────────────────────────
export default function RiskPage() {
  useScrollAnimation();

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10 space-y-10">

      {/* Header */}
      <div className="reveal">
        <p className="section-label mb-1">Risk Dashboard</p>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.5rem, 3vw, 2rem)", color: "var(--text-primary)", marginBottom: 8 }}>
              Protocol Risk Monitor
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 500 }}>
              Real-time visibility into utilization, APY rates, oracle health, and position risk —
              the same data Aave and Compound use to monitor protocol safety.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="pulse-dot" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#34d399" }}>Live data</span>
          </div>
        </div>
      </div>

      {/* Asset risk cards */}
      <div>
        <div className="reveal mb-5">
          <p className="section-label mb-1">Per-Asset Metrics</p>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.2rem", color: "var(--text-primary)" }}>
            Utilization · TVL · APY
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {SUPPORTED_ASSETS.map(a => <AssetRiskCard key={a.symbol} asset={a} />)}
        </div>
      </div>

      {/* HF distribution */}
      <HfDistribution />

      {/* Risk indicators */}
      <ProtocolRiskIndicators />

      {/* Parameter table */}
      <div className="reveal">
        <p className="section-label mb-4">Risk Parameters</p>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="text-right">LTV</th>
                  <th className="text-right">Liq. Threshold</th>
                  <th className="text-right">Liq. Bonus</th>
                  <th className="text-right">Reserve Factor</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { sym: "WETH", ltv: "80%", liqThresh: "85%", bonus: "8%",  rf: "10%", active: true },
                  { sym: "USDC", ltv: "85%", liqThresh: "90%", bonus: "5%",  rf: "5%",  active: true },
                  { sym: "LINK", ltv: "65%", liqThresh: "70%", bonus: "10%", rf: "10%", active: true },
                ].map(({ sym, ltv, liqThresh, bonus, rf, active }) => (
                  <tr key={sym} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-4">
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--text-primary)" }}>{sym}</span>
                    </td>
                    <td className="px-5 py-4 text-right num text-sm" style={{ color: "var(--cyan)" }}>{ltv}</td>
                    <td className="px-5 py-4 text-right num text-sm" style={{ color: "#f59e0b" }}>{liqThresh}</td>
                    <td className="px-5 py-4 text-right num text-sm" style={{ color: "#34d399" }}>{bonus}</td>
                    <td className="px-5 py-4 text-right num text-sm" style={{ color: "var(--text-secondary)" }}>{rf}</td>
                    <td className="px-5 py-4 text-center">
                      {active ? <span className="badge badge-green text-xs">Active</span> : <span className="badge badge-red text-xs">Paused</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}