"use client";

import { useChainId } from "wagmi";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { useReserveData, useAssetPrice } from "@/hooks/useProtocol";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { InfoTip } from "@/components/ui/Tooltip";
import { AssetInfo } from "@/types";

const RAY = 1e27;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

function computeApy(totalLiq: number, totalBor: number, rf = 0.1) {
  if (totalLiq === 0) return { supplyApy: 0, borrowApy: 0 };
  const util = totalBor / totalLiq;
  const base = 0.01 / SECONDS_PER_YEAR, s1 = 0.04 / SECONDS_PER_YEAR, s2 = 0.75 / SECONDS_PER_YEAR;
  const optUtil = 0.8;
  const bps = util <= optUtil ? base + s1*(util/optUtil) : base + s1 + s2*((util-optUtil)/(1-optUtil));
  const borrowApy = bps * SECONDS_PER_YEAR * 100;
  return { supplyApy: borrowApy * util * (1-rf), borrowApy };
}

function utilColor(pct: number) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  if (pct >= 40) return "var(--cyan)";
  return "#34d399";
}

function RiskMeter({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "80%", top: 0, width: 1, height: "100%", background: "rgba(255,255,255,0.2)", zIndex: 1 }} />
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%",
        background: `linear-gradient(90deg, #34d399 0%, ${color} 100%)`,
        borderRadius: 4, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
    </div>
  );
}

function AssetRiskCard({ asset }: { asset: AssetInfo }) {
  const chainId = useChainId();
  let addr: `0x${string}` = asset.address;
  try { const a = getAddresses(chainId); addr = (a[asset.symbol as keyof typeof a] as `0x${string}`) ?? asset.address; } catch {}

  const { data: reserve } = useReserveData(addr);
  const { data: price }   = useAssetPrice(addr);

  const priceUsd  = price ? Number(price)/1e18 : 0;
  const totalDep  = reserve ? (Number(reserve.totalScaledDeposits)*Number(reserve.liquidityIndex))/RAY : 0;
  const totalBor  = reserve ? (Number(reserve.totalScaledBorrows) *Number(reserve.borrowIndex))   /RAY : 0;
  const tvlUsd    = (totalDep / 10**asset.decimals) * priceUsd;
  const borrowUsd = (totalBor / 10**asset.decimals) * priceUsd;
  const utilPct   = totalDep > 0 ? (totalBor/totalDep)*100 : 0;
  const rf        = asset.symbol === "USDC" ? 0.05 : 0.1;
  const { supplyApy, borrowApy } = computeApy(totalDep, totalBor, rf);
  const color = utilColor(utilPct);

  const riskLevel = utilPct >= 90 ? { label: "Critical", c: "#ef4444" }
    : utilPct >= 70 ? { label: "Elevated", c: "#f59e0b" }
    : utilPct >= 0.1 ? { label: "Normal",   c: "#34d399" }
    : { label: "No activity", c: "var(--text-muted)" };

  return (
    <div style={{ background: "var(--bg-card)", border: `1px solid var(--border)`, borderRadius: 18, overflow: "hidden",
      transition: "border-color 0.2s", boxShadow: "var(--shadow-card)" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = color + "40")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ padding: 22 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src={asset.icon} alt={asset.symbol} style={{ width: 42, height: 42, borderRadius: "50%" }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>{asset.symbol}</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                ${priceUsd > 0 ? priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
              </p>
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: riskLevel.c,
            background: `${riskLevel.c}12`, border: `1px solid ${riskLevel.c}25`,
            borderRadius: 20, padding: "3px 10px" }}>{riskLevel.label}</span>
        </div>

        {/* Utilization */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>Utilization</span>
              <InfoTip text={"Borrowed ÷ Deposited.\nAbove 80% kink: borrow rate spikes sharply."} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500, color }}>{utilPct.toFixed(2)}%</span>
          </div>
          <RiskMeter pct={utilPct} color={color} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>0%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(255,255,255,0.25)" }}>Optimal 80%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>100%</span>
          </div>
        </div>

        {/* 4-stat grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: "TVL",        value: tvlUsd>0 ? `$${tvlUsd.toLocaleString("en-US",{maximumFractionDigits:0})}` : "—", color: "var(--cyan)", tip: "Total deposits in USD" },
            { label: "Borrowed",   value: borrowUsd>0 ? `$${borrowUsd.toLocaleString("en-US",{maximumFractionDigits:0})}` : "—", color: "#f87171", tip: "Total outstanding borrows" },
            { label: "Supply APY", value: supplyApy>0 ? `${supplyApy.toFixed(2)}%` : "—", color: "#34d399", tip: "Annual yield for depositors" },
            { label: "Borrow APY", value: borrowApy>0 ? `${borrowApy.toFixed(2)}%` : "—", color: "#f59e0b", tip: "Annual cost for borrowers" },
          ].map(({ label, value, color: c, tip }) => (
            <div key={label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>{label}</span>
                <InfoTip text={tip} />
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500, color: c }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Risk message */}
        <div style={{ background: `${color}06`, border: `1px solid ${color}18`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 8 }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>
            {utilPct>=90?"🔴":utilPct>=70?"🟡":"🟢"}
          </span>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, lineHeight: 1.55 }}>
            {utilPct>=90 ? "High utilization — borrow rate is above the 80% kink. New borrows are expensive."
              : utilPct>=70 ? "Approaching the 80% optimal — rates will steepen soon."
              : utilPct>=0.1 ? "Healthy — within optimal utilization range."
              : "No active borrows — depositors earn zero yield."}
          </p>
        </div>
      </div>
    </div>
  );
}

function TrustBadge({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${color}08`,
      border: `1px solid ${color}20`, borderRadius: 12, padding: "12px 16px" }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>{label}</p>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color }}>{value}</p>
      </div>
    </div>
  );
}

export default function RiskPage() {
  useScrollAnimation();

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Header */}
      <div className="reveal mb-8">
        <p className="section-label mb-1">Risk Dashboard</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800,
              fontSize: "clamp(1.6rem,3vw,2.1rem)", color: "var(--text-primary)", marginBottom: 6 }}>
              Protocol Risk Monitor
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 500, lineHeight: 1.7 }}>
              Real-time visibility into utilization, APY, and protocol safety — the same data Aave and Compound use.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="pulse-dot" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#34d399" }}>Live data</span>
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="reveal reveal-delay-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 28 }}>
        <TrustBadge icon="🛡" label="Security"      value="ReentrancyGuard"   color="#34d399" />
        <TrustBadge icon="◈" label="Oracle"         value="Chainlink"         color="var(--cyan)" />
        <TrustBadge icon="⚡" label="Liquidation"   value="8% bonus"          color="#f59e0b" />
        <TrustBadge icon="⬡" label="Close Factor"  value="50% per call"      color="#a78bfa" />
        <TrustBadge icon="🔒" label="Pause Control" value="GUARDIAN_ROLE"     color="#34d399" />
        <TrustBadge icon="⏱" label="Timelock"      value="48-hour delay"     color="var(--cyan)" />
      </div>

      {/* Per-asset cards */}
      <div className="reveal mb-6">
        <p className="section-label mb-4">Per-Asset Metrics</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
          {SUPPORTED_ASSETS.map(a => <AssetRiskCard key={a.symbol} asset={a} />)}
        </div>
      </div>

      {/* Risk Indicators */}
      <div className="reveal mb-8">
        <p className="section-label mb-4">Protocol Risk Assessment</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          {[
            { icon:"◈", color:"#34d399", title:"Oracle Staleness Protection",  value:"Active",   desc:"Every price read checks Chainlink heartbeat (ETH: 1h, USDC: 24h). Stale prices block borrows." },
            { icon:"🛡", color:"#34d399", title:"Reentrancy Guard",             value:"All fns",  desc:"OpenZeppelin ReentrancyGuard on every state-mutating external function." },
            { icon:"⬡", color:"#34d399", title:"CEI Pattern",                  value:"Enforced", desc:"Check-Effects-Interactions throughout. State updated before external calls." },
            { icon:"⏱", color:"var(--cyan)", title:"Governance Timelock",      value:"48 hours", desc:"All parameter changes require 48-hour delay. Users can exit before changes take effect." },
            { icon:"⚠", color:"#f59e0b", title:"No Oracle Fallback (Testnet)", value:"Chainlink only", desc:"Production should add Uniswap v3 TWAP fallback. OracleWithTWAP.sol is ready to deploy." },
            { icon:"⚠", color:"#f59e0b", title:"Testnet Only",                 value:"Sepolia",  desc:"Not audited. Do not use real funds. This is a portfolio demonstration protocol." },
          ].map(({ icon, color, title, value, desc }) => (
            <div key={title} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, color }}>{icon}</span>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{title}</p>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color,
                  background: `${color}12`, border: `1px solid ${color}25`, borderRadius: 6, padding: "2px 8px", flexShrink: 0 }}>{value}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Parameter table */}
      <div className="reveal">
        <p className="section-label mb-4">Risk Parameters</p>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="text-right">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      LTV <InfoTip text={"Max borrow ÷ collateral value.\nBorrowing is blocked above this."} position="bottom" />
                    </div>
                  </th>
                  <th className="text-right">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      Liq. Threshold <InfoTip text={"Position is liquidatable when\ncollateral / debt drops below this."} position="bottom" />
                    </div>
                  </th>
                  <th className="text-right">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      Liq. Bonus <InfoTip text={"Extra collateral liquidators receive\nas reward for repaying bad debt."} position="bottom" />
                    </div>
                  </th>
                  <th className="text-right">Reserve Factor</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { sym:"WETH", ltv:"80%", liqThresh:"85%", bonus:"8%",  rf:"10%", active:true },
                  { sym:"USDC", ltv:"85%", liqThresh:"90%", bonus:"5%",  rf:"5%",  active:true },
                  { sym:"LINK", ltv:"65%", liqThresh:"70%", bonus:"10%", rf:"10%", active:true },
                ].map(({ sym, ltv, liqThresh, bonus, rf, active }) => (
                  <tr key={sym} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-4" style={{ fontFamily:"var(--font-display)", fontWeight:700, color:"var(--text-primary)" }}>{sym}</td>
                    <td className="px-5 py-4 text-right num text-sm" style={{ color:"var(--cyan)" }}>{ltv}</td>
                    <td className="px-5 py-4 text-right num text-sm" style={{ color:"#f59e0b" }}>{liqThresh}</td>
                    <td className="px-5 py-4 text-right num text-sm" style={{ color:"#34d399" }}>{bonus}</td>
                    <td className="px-5 py-4 text-right num text-sm" style={{ color:"var(--text-secondary)" }}>{rf}</td>
                    <td className="px-5 py-4 text-center">
                      {active ? <span className="badge badge-green" style={{ fontSize:10 }}>Active</span>
                               : <span className="badge badge-red"   style={{ fontSize:10 }}>Paused</span>}
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