"use client";

import { useChainId } from "wagmi";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { useReserveData, useAssetPrice } from "@/hooks/useProtocol";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
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
  if (pct >= 90) return "#ef4444"; // Red
  if (pct >= 70) return "#f59e0b"; // Amber
  if (pct >= 40) return "var(--cyan)"; // Cyan
  return "#10b981"; // Emerald
}


function LocalTip({ text }: { text: string }) {
  return (
    <div className="custom-tip-container">
      <div className="custom-tip-icon">?</div>
      <div className="custom-tip-popup">{text}</div>
    </div>
  );
}

function RiskMeter({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="relative h-2 rounded-full bg-[var(--bg-base)] border border-[var(--border)] overflow-hidden">
      {/* 80% Optimal Marker */}
      <div className="absolute left-[80%] top-0 bottom-0 w-[2px] bg-[var(--text-muted)] z-10" />
      <div 
        className="h-full rounded-full transition-all duration-1000 ease-out"
        style={{ 
          width: `${Math.min(pct, 100)}%`, 
          background: `linear-gradient(90deg, #10b981 0%, ${color} 100%)`,
        }} 
      />
    </div>
  );
}

// ── Helper to generate clean CSS icons instead of broken images ──
function getAssetIconDetails(symbol: string) {
  if (symbol.includes("ETH")) return { char: "♦", bg: "rgba(99, 102, 241, 0.1)", color: "#6366f1", border: "rgba(99, 102, 241, 0.2)" };
  if (symbol.includes("USDC")) return { char: "$", bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "rgba(16, 185, 129, 0.2)" };
  if (symbol.includes("LINK")) return { char: "⬡", bg: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", border: "rgba(59, 130, 246, 0.2)" };
  return { char: "🪙", bg: "var(--bg-base)", color: "var(--text-primary)", border: "var(--border)" };
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
    : utilPct >= 0.1 ? { label: "Normal",   c: "#10b981" }
    : { label: "Inactive", c: "var(--text-muted)" };

  const iconDetails = getAssetIconDetails(asset.symbol);

  return (
    <div className="app-card hover:-translate-y-1 transition-transform duration-300 flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0"
            style={{ backgroundColor: iconDetails.bg, color: iconDetails.color, border: `1px solid ${iconDetails.border}` }}
          >
            {iconDetails.char}
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-xl text-[var(--text-primary)] truncate">{asset.symbol}</h3>
            <p className="font-mono text-sm text-[var(--text-muted)] truncate">
              ${priceUsd > 0 ? priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
            </p>
          </div>
        </div>
        <span 
          className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border shrink-0"
          style={{ color: riskLevel.c, backgroundColor: `${riskLevel.c}10`, borderColor: `${riskLevel.c}30` }}
        >
          {riskLevel.label}
        </span>
      </div>

      {/* Utilization */}
      <div className="mb-6">
        <div className="flex justify-between items-end mb-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Utilization</span>
            <LocalTip text={"Borrowed ÷ Deposited.\nAbove 80% optimal: borrow rate spikes sharply."} />
          </div>
          <span className="font-mono text-lg font-bold" style={{ color }}>{utilPct.toFixed(2)}%</span>
        </div>
        <RiskMeter pct={utilPct} color={color} />
        <div className="flex justify-between mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
          <span>0%</span>
          <span className="text-[var(--text-primary)] font-bold">Optimal 80%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: "TVL",        value: tvlUsd>0 ? `$${tvlUsd.toLocaleString("en-US",{maximumFractionDigits:0})}` : "—", color: "var(--text-primary)", tip: "Total deposits in USD" },
          { label: "Borrowed",   value: borrowUsd>0 ? `$${borrowUsd.toLocaleString("en-US",{maximumFractionDigits:0})}` : "—", color: "#ef4444", tip: "Total outstanding borrows" },
          { label: "Supply APY", value: supplyApy>0 ? `${supplyApy.toFixed(2)}%` : "—", color: "#10b981", tip: "Annual yield for depositors" },
          { label: "Borrow APY", value: borrowApy>0 ? `${borrowApy.toFixed(2)}%` : "—", color: "#f59e0b", tip: "Annual cost for borrowers" },
        ].map(({ label, value, color: c, tip }) => (
          <div key={label} className="bg-[var(--bg-base)] border border-[var(--border)] rounded-xl p-3 flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider truncate">{label}</span>
              <LocalTip text={tip} />
            </div>
            <p className="font-mono text-base sm:text-lg font-bold truncate" style={{ color: c }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Risk Message */}
      <div 
        className="rounded-xl p-4 flex gap-3 items-start border mt-auto"
        style={{ backgroundColor: `${color}08`, borderColor: `${color}20` }}
      >
        <span className="text-lg leading-none mt-0.5 shrink-0">
          {utilPct>=90?"🔴":utilPct>=70?"🟡":"🟢"}
        </span>
        <p className="text-sm font-medium leading-relaxed break-words" style={{ color: "var(--text-primary)" }}>
          {utilPct>=90 ? "High utilization — borrow rate is above the 80% optimal kink. New borrows are expensive."
            : utilPct>=70 ? "Approaching the 80% optimal kink — interest rates will steepen soon."
            : utilPct>=0.1 ? "Healthy operation — within the optimal utilization range."
            : "No active borrows — depositors are currently earning zero yield."}
        </p>
      </div>
    </div>
  );
}

function TrustBadge({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="app-card !p-4 lg:!p-5 flex items-center gap-3 lg:gap-4 min-w-0">
      <div 
        className="w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center text-lg lg:text-xl shrink-0"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[9px] lg:text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 truncate">{label}</p>
        <p className="font-display text-xs lg:text-sm font-bold text-[var(--text-primary)] truncate">{value}</p>
      </div>
    </div>
  );
}

export default function RiskPage() {
  useScrollAnimation();

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
        
        .app-table-wrapper {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 24px;
          overflow-x: auto;
          box-shadow: 0 4px 24px rgba(0,0,0,0.03);
        }
        
        .app-table {
          width: 100%;
          min-width: 800px;
          border-collapse: collapse;
          text-align: left;
        }
        
        .app-table th {
          background: var(--bg-base);
          padding: 16px 24px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        
        .app-table td {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          color: var(--text-primary);
        }
        
        .app-table tr:last-child td {
          border-bottom: none;
        }
        
        .app-table tr:hover td {
          background: var(--bg-base);
        }

        .badge {
          display: inline-flex;
          padding: 6px 12px;
          border-radius: 100px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border: 1px solid;
        }
        .badge-green { background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.2); }
        .badge-red { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }

        /* Custom Tooltip Fix */
        .custom-tip-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: help;
        }
        .custom-tip-icon {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--border);
          color: var(--text-muted);
          font-size: 9px;
          font-family: var(--font-mono);
          font-weight: bold;
          display: flex; align-items: center; justify-content: center;
        }
        .custom-tip-popup {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          width: max-content;
          max-width: 240px;
          background: var(--text-primary);
          color: var(--bg-base);
          padding: 8px 12px;
          border-radius: 8px;
          font-family: var(--font-sans, sans-serif);
          font-size: 11px;
          font-weight: 500;
          line-height: 1.5;
          text-align: center;
          white-space: pre-wrap; /* Allows \n to work, but wraps if too long */
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
          z-index: 100;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        /* Small triangle arrow for tooltip */
        .custom-tip-popup::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-width: 5px;
          border-style: solid;
          border-color: var(--text-primary) transparent transparent transparent;
        }
        .custom-tip-container:hover .custom-tip-popup {
          opacity: 1;
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 md:px-6 py-12">

        {/* Header */}
        <div className="reveal flex flex-col md:flex-row justify-between md:items-end gap-6 mb-12">
          <div>
            <h2 className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: "var(--cyan)" }}>Risk Dashboard</h2>
            <h1 className="font-display font-bold text-[clamp(2.2rem,4vw,3rem)] text-[var(--text-primary)] tracking-tight mb-3">
              Protocol Monitor
            </h1>
            <p className="text-[var(--text-secondary)] text-base max-w-2xl leading-relaxed">
              Real-time visibility into utilization, APY, and protocol safety metrics. Monitoring the exact parameters utilized by Aave and Compound.
            </p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--bg-base)]">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-500">Live Network</span>
          </div>
        </div>

        {/* Trust badges */}
        <div className="reveal reveal-delay-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
          <TrustBadge icon="🛡️" label="Security"   value="ReentrancyGuard" color="#10b981" />
          <TrustBadge icon="🔮" label="Oracle"     value="Chainlink"       color="var(--cyan)" />
          <TrustBadge icon="⚡" label="Liquidation" value="8% Bonus"        color="#f59e0b" />
          <TrustBadge icon="⚖️" label="Close Factor" value="50% per call"    color="#8b5cf6" />
          <TrustBadge icon="⏸️" label="Pause Ctrl"  value="Guardian Role"   color="#10b981" />
          <TrustBadge icon="⏱️" label="Timelock"   value="48-Hour Delay"   color="var(--cyan)" />
        </div>

        {/* Per-asset cards */}
        <div className="reveal mb-12">
          <h3 className="font-display font-bold text-2xl text-[var(--text-primary)] mb-6">Market Health</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SUPPORTED_ASSETS.map(a => <AssetRiskCard key={a.symbol} asset={a} />)}
          </div>
        </div>

        {/* Risk Indicators */}
        <div className="reveal mb-12">
          <h3 className="font-display font-bold text-2xl text-[var(--text-primary)] mb-6">Security Architecture</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon:"🔮", color:"#10b981", title:"Oracle Staleness Protection", value:"Active",   desc:"Every price read validates the Chainlink heartbeat (ETH: 1h, USDC: 24h). Stale prices instantly block borrows." },
              { icon:"🛡️", color:"#10b981", title:"Reentrancy Guard",            value:"All Fns",  desc:"OpenZeppelin ReentrancyGuard implemented on every state-mutating external function." },
              { icon:"📐", color:"#10b981", title:"CEI Pattern",                 value:"Enforced", desc:"Check-Effects-Interactions architecture throughout. Internal state updates before any external calls." },
              { icon:"⏱️", color:"var(--cyan)", title:"Governance Timelock",      value:"48 Hours", desc:"All parameter changes mandate a 48-hour delay, giving users time to exit before execution." },
              { icon:"⚠️", color:"#f59e0b", title:"No Oracle Fallback (Testnet)", value:"Chainlink Only", desc:"Production environment should integrate Uniswap v3 TWAP fallback. OracleWithTWAP.sol is staged." },
              { icon:"⚠️", color:"#ef4444", title:"Testnet Demonstration",        value:"Sepolia",  desc:"Not audited. Do not deposit real funds. This is a portfolio demonstration protocol." },
            ].map(({ icon, color, title, value, desc }) => (
              <div key={title} className="app-card !p-6 flex flex-col h-full min-w-0">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{icon}</span>
                    <h4 className="font-display font-bold text-base text-[var(--text-primary)] leading-tight truncate">{title}</h4>
                  </div>
                </div>
                <div className="mb-4">
                  <span 
                    className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border inline-block"
                    style={{ color, backgroundColor: `${color}10`, borderColor: `${color}30` }}
                  >
                    {value}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed mt-auto break-words">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Parameter table */}
        <div className="reveal">
          <h3 className="font-display font-bold text-2xl text-[var(--text-primary)] mb-6">System Parameters</h3>
          <div className="app-table-wrapper">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      Max LTV <LocalTip text={"Max borrow ÷ collateral value.\nBorrowing is blocked above this limit."} />
                    </div>
                  </th>
                  <th className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      Liq. Threshold <LocalTip text={"Position is liquidatable when\ncollateral / debt drops below this."} />
                    </div>
                  </th>
                  <th className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      Liq. Bonus <LocalTip text={"Extra collateral liquidators receive\nas reward for repaying bad debt."} />
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
                  <tr key={sym}>
                    <td className="font-display font-bold text-lg">{sym}</td>
                    <td className="text-right font-mono font-bold text-[var(--cyan)]">{ltv}</td>
                    <td className="text-right font-mono font-bold text-amber-500">{liqThresh}</td>
                    <td className="text-right font-mono font-bold text-emerald-500">{bonus}</td>
                    <td className="text-right font-mono font-medium text-[var(--text-muted)]">{rf}</td>
                    <td className="text-center">
                      {active ? <span className="badge badge-green">Active</span>
                              : <span className="badge badge-red">Paused</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}