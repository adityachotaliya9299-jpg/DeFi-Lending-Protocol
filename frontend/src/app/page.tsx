"use client";

import { useEffect, useRef, useState } from "react";
import { useChainId } from "wagmi";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { useReserveData, useAssetPrice } from "@/hooks/useProtocol";
import { DepositModal } from "@/components/protocol/DepositModal";
import { BorrowModal }  from "@/components/protocol/BorrowModal";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { AssetInfo } from "@/types";

// ── Animated counter hook ──────────────────────────────────────────────────
function useCounter(target: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
      else setCount(target);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

// ── Floating protocol card ─────────────────────────────────────────────────
function FloatingCard({ icon, label, value, color, delay }: {
  icon: string; label: string; value: string; color: string; delay: string;
}) {
  return (
    <div className="floating-card"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${color}25`,
        borderRadius: 14,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${color}15`,
        animation: `float 4s ease-in-out infinite`,
        animationDelay: delay,
        backdropFilter: "blur(12px)",
      }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, color,
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</p>
        <p style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 15, color: "var(--text-primary)" }}>{value}</p>
      </div>
    </div>
  );
}

// ── Ticker item ──────────────────────────────────────────────────────────
function TickerItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-6 shrink-0">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--cyan)", fontWeight: 500 }}>
        {value}
      </span>
      <span style={{ color: "var(--border)", fontSize: 10 }}>◆</span>
    </div>
  );
}

// ── Market table row ──────────────────────────────────────────────────────
function MarketRow({ asset }: { asset: AssetInfo }) {
  const chainId = useChainId();
  const [modal, setModal] = useState<"deposit" | "borrow" | null>(null);

  let addr: `0x${string}` = asset.address;
  try {
    const addrs = getAddresses(chainId);
    addr = (addrs[asset.symbol as keyof typeof addrs] as `0x${string}`) ?? asset.address;
  } catch {}

  const resolvedAsset = { ...asset, address: addr };
  const { data: reserve } = useReserveData(addr);
  const { data: price }   = useAssetPrice(addr);

  const totalDep = reserve ? (Number(reserve.totalScaledDeposits) * Number(reserve.liquidityIndex)) / 1e27 : 0;
  const totalBor = reserve ? (Number(reserve.totalScaledBorrows)  * Number(reserve.borrowIndex))    / 1e27 : 0;
  const util     = totalDep > 0 ? (totalBor / totalDep) * 100 : 0;
  const priceUsd = price ? Number(price) / 1e18 : 0;
  const supplyUsd = (totalDep / 10 ** asset.decimals) * priceUsd;

  return (
    <>
      <tr style={{ borderBottom: "1px solid var(--border)" }}>
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <img src={asset.icon} alt={asset.symbol} className="h-9 w-9 rounded-full"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                {asset.symbol}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{asset.name}</p>
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-right">
          <span className="num text-sm" style={{ color: "var(--text-primary)" }}>
            {priceUsd > 0 ? `$${priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
          </span>
        </td>
        <td className="px-5 py-4 text-right">
          <span className="num text-sm" style={{ color: "var(--text-secondary)" }}>
            {supplyUsd > 0 ? `$${supplyUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
          </span>
        </td>
        <td className="px-5 py-4">
          <div className="flex flex-col gap-1.5" style={{ minWidth: 100 }}>
            <span className="num text-xs" style={{ color: util > 80 ? "#f87171" : util > 60 ? "#fbbf24" : "var(--cyan)" }}>
              {util.toFixed(1)}%
            </span>
            <div className="util-bar">
              <div className="util-bar-fill" style={{ width: `${Math.min(util, 100)}%` }} />
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setModal("deposit")} className="btn-primary text-xs px-4 py-2">Supply</button>
            <button onClick={() => setModal("borrow")} disabled={!reserve?.isBorrowEnabled} className="btn-secondary text-xs px-4 py-2">Borrow</button>
          </div>
        </td>
      </tr>
      {modal === "deposit" && <tr><td colSpan={5}><DepositModal asset={resolvedAsset} onClose={() => setModal(null)} /></td></tr>}
      {modal === "borrow"  && <tr><td colSpan={5}><BorrowModal  asset={resolvedAsset} onClose={() => setModal(null)} /></td></tr>}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function MarketsPage() {
  useScrollAnimation();
  const [started, setStarted] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  const tests    = useCounter(235, 1600, started);
  const contracts = useCounter(7,   1200, started);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), 400);
    return () => clearTimeout(timer);
  }, []);

  const TICKER_ITEMS = [
    { label: "Tests Passing",     value: "235" },
    { label: "Deployed",          value: "Sepolia" },
    { label: "Assets",            value: "WETH · USDC · LINK" },
    { label: "LTV",               value: "Up to 85%" },
    { label: "Liq. Bonus",        value: "8%" },
    { label: "Close Factor",      value: "50%" },
    { label: "Interest Model",    value: "Two-Slope" },
    { label: "Oracle",            value: "Chainlink" },
  ];

  return (
    <>
      {/* ── Floating card animation keyframe ── */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px);  }
          50%       { transform: translateY(-8px); }
        }
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: ticker-scroll 28s linear infinite;
        }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>

      {/* ── HERO — Asymmetric split layout ── */}
      <section ref={heroRef} className="relative overflow-hidden"
        style={{ minHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* Orb backgrounds */}
        <div className="absolute pointer-events-none" style={{
          top: "-20%", left: "-10%", width: "50vw", height: "50vw",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
        <div className="absolute pointer-events-none" style={{
          bottom: "-10%", right: "-5%", width: "40vw", height: "40vw",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }} />

        {/* Dot grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />

        <div className="flex-1 mx-auto w-full max-w-7xl px-4 md:px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-16 lg:py-24">

          {/* Left column — text */}
          <div className="flex flex-col gap-7 relative z-10">

            {/* Badge row */}
            <div className="reveal flex items-center gap-3 flex-wrap">
              <span className="badge badge-cyan px-3 py-1.5 text-xs">
                <span className="pulse-dot mr-2" /> Live on Sepolia
              </span>
              <span className="badge badge-violet text-xs">Chainlink Oracles</span>
              <span className="badge badge-green text-xs">235 Tests</span>
            </div>

            {/* Headline */}
            <div className="reveal reveal-delay-1">
              <h1 style={{
                fontFamily: "var(--font-display)", fontWeight: 800, lineHeight: 1.05,
                letterSpacing: "-0.035em",
                fontSize: "clamp(2.8rem, 6vw, 4.2rem)",
                color: "var(--text-primary)",
              }}>
                Lend.{" "}
                <span style={{ color: "var(--cyan)" }}>Borrow.</span>
                <br />
                Earn yield
                <span style={{
                  display: "inline-block", marginLeft: 12,
                  background: "linear-gradient(135deg, var(--cyan), #a78bfa)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>on-chain.</span>
              </h1>
            </div>

            {/* Description */}
            <p className="reveal reveal-delay-2"
              style={{ fontSize: 16, lineHeight: 1.75, color: "var(--text-secondary)", maxWidth: 440 }}>
              A production-grade DeFi lending protocol with real Chainlink price feeds,
              two-slope interest rates, and on-chain governance — deployed and verified on Sepolia.
            </p>

            {/* Counter stats row */}
            <div className="reveal reveal-delay-3 flex items-center gap-6 flex-wrap">
              {[
                { n: tests,     label: "tests passing",   suffix: "" },
                { n: contracts, label: "verified contracts", suffix: "" },
                { n: 3,         label: "live assets",      suffix: "" },
              ].map(({ n, label, suffix }) => (
                <div key={label} style={{ borderRight: "1px solid var(--border)", paddingRight: 24 }}
                  className="last:border-0 last:pr-0">
                  <p className="num" style={{ fontFamily: "var(--font-mono)", fontSize: "1.8rem", fontWeight: 500, color: "var(--cyan)", lineHeight: 1 }}>
                    {n}{suffix}
                  </p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="reveal reveal-delay-4 flex flex-wrap gap-3">
              <Link href="/dashboard">
                <button className="btn-primary px-7 py-3.5 text-sm">Open App →</button>
              </Link>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                <button className="btn-ghost px-7 py-3.5 text-sm">View Source ↗</button>
              </a>
            </div>
          </div>

          {/* Right column — floating cards */}
          <div className="hidden lg:flex flex-col gap-4 relative z-10 pl-8">

            {/* Main protocol card */}
            <div className="card-glow p-6 reveal reveal-delay-2">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center text-sm"
                    style={{ background: "linear-gradient(135deg, var(--cyan), #a78bfa)" }}>
                    ⬡
                  </div>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                    Protocol Health
                  </span>
                </div>
                <span className="badge badge-green text-xs">All Systems Normal</span>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Oracle Status",      value: "Chainlink ✓",   color: "#34d399" },
                  { label: "Interest Model",     value: "Two-Slope ✓",   color: "#34d399" },
                  { label: "Governance",         value: "Active ✓",      color: "#34d399" },
                  { label: "Smart Contract",     value: "Verified ✓",    color: "#34d399" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating asset cards */}
            <div className="grid grid-cols-2 gap-3">
              <FloatingCard icon="◈" label="Max LTV (WETH)"   value="80%"       color="var(--cyan)"  delay="0s"   />
              <FloatingCard icon="⌁" label="Liq. Bonus"       value="8%"        color="#a78bfa"       delay="0.8s" />
              <FloatingCard icon="⬡" label="Close Factor"     value="50%"       color="#34d399"       delay="1.4s" />
              <FloatingCard icon="⊕" label="Reserve Factor"   value="10%"       color="#f59e0b"       delay="0.4s" />
            </div>

            {/* Security badge */}
            <div className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: "rgba(34,211,238,0.04)", border: "1px solid var(--border-accent)" }}>
              <span style={{ fontSize: 20 }}>🛡</span>
              <div>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                  Audit-ready security
                </p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  10 attack vectors documented · ReentrancyGuard · Chainlink staleness checks
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Ticker bar */}
        <div className="overflow-hidden border-t border-b py-3 relative z-10"
          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.2)" }}>
          <div className="ticker-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <TickerItem key={i} {...item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Markets table ── */}
      <section className="px-4 md:px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="reveal flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <p className="section-label mb-1">Live Markets</p>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.4rem", color: "var(--text-primary)" }}>
                Available assets
              </h2>
            </div>
            <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
          </div>
          <div className="reveal card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Total Supply</th>
                    <th>Utilization</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {SUPPORTED_ASSETS.map(asset => <MarketRow key={asset.symbol} asset={asset} />)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-4 md:px-6 py-20"
        style={{ background: "rgba(0,0,0,0.15)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto max-w-7xl">
          <div className="reveal text-center mb-14">
            <p className="section-label mb-2">How it works</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.75rem,3.5vw,2.4rem)", color: "var(--text-primary)" }}>
              Three steps to earn yield
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-8 left-1/4 right-1/4 h-px"
              style={{ background: "linear-gradient(90deg, transparent, var(--cyan-glow), transparent)" }} />

            {[
              { n: "01", icon: "◈", title: "Deposit Collateral",  body: "Supply WETH, USDC, or LINK to earn interest and unlock borrowing power. Receive lTokens representing your position.", color: "var(--cyan)" },
              { n: "02", icon: "⌁", title: "Borrow Assets",       body: "Borrow against your collateral up to the maximum LTV ratio. Health factor must stay above 1.0.", color: "#a78bfa" },
              { n: "03", icon: "⬡", title: "Earn & Repay",        body: "Interest accrues automatically via scaled balances. Repay at any time and withdraw your collateral plus yield.", color: "#34d399" },
            ].map(({ n, icon, title, body, color }, i) => (
              <div key={n} className={`reveal reveal-delay-${i + 1} card p-7 relative`}>
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center gap-3">
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: `${color}15`, border: `1px solid ${color}30`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, color,
                    }}>
                      {icon}
                    </div>
                    <span className="num" style={{ fontFamily: "var(--font-mono)", fontSize: "1.6rem", fontWeight: 500, color, opacity: 0.25 }}>
                      {n}
                    </span>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 10 }}>
                      {title}
                    </h3>
                    <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.7 }}>{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack ── */}
      <section className="px-4 md:px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="reveal text-center mb-12">
            <p className="section-label mb-2">Built with</p>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "var(--text-primary)" }}>
              Production-grade tech stack
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Solidity",    sub: "0.8.24",     icon: "⬡" },
              { label: "Foundry",     sub: "Testing",    icon: "⚒" },
              { label: "Chainlink",   sub: "Oracles",    icon: "◈" },
              { label: "Next.js",     sub: "14",         icon: "▲" },
              { label: "wagmi",       sub: "v2",         icon: "⌁" },
              { label: "The Graph",   sub: "Subgraph",   icon: "⊕" },
            ].map(({ label, sub, icon }, i) => (
              <div key={label}
                className={`reveal reveal-delay-${(i % 3) + 1} card p-5 text-center`}>
                <div style={{ fontSize: 24, color: "var(--cyan)", marginBottom: 8, opacity: 0.7 }}>{icon}</div>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{label}</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}