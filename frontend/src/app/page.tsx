"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useTypewriter } from "@/hooks/useTypewriter";
import { useProtocolData } from "@/hooks/useProtocolData";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { InfoTip } from "@/components/ui/Tooltip";

// ── Counter animation ─────────────────────────────────────────────────────────
function useCounter(target: number, duration = 1600, start = false) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    let t0: number | null = null;
    const frame = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min((now - t0) / duration, 1);
      setN(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(frame);
      else setN(target);
    };
    requestAnimationFrame(frame);
  }, [target, duration, start]);
  return n;
}

// ── Market card (replaces old table row) ──────────────────────────────────────
function MarketCard({
  symbol,
  icon,
  priceUsd,
  totalDepUsd,
  totalBorUsd,
  utilization,
  supplyApy,
  borrowApy,
  isBorrowEnabled,
}: {
  symbol: string;
  icon: string;
  priceUsd: number;
  totalDepUsd: number;
  totalBorUsd: number;
  utilization: number;
  supplyApy: number;
  borrowApy: number;
  isBorrowEnabled: boolean;
}) {
  const uColor =
    utilization >= 80 ? "#ef4444" : utilization >= 60 ? "#f59e0b" : "#34d399";

  return (
    <div
      className="card"
      style={{ padding: 24, transition: "all 0.2s" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "var(--border-accent)";
        (e.currentTarget as HTMLDivElement).style.transform =
          "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLDivElement).style.transform = "none";
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src={icon}
            alt={symbol}
            style={{ width: 42, height: 42, borderRadius: "50%" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 17,
                color: "var(--text-primary)",
              }}
            >
              {symbol}
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {priceUsd > 0
                ? `$${priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                : "Loading…"}
            </p>
          </div>
        </div>
        {isBorrowEnabled ? (
          <span className="badge badge-cyan" style={{ fontSize: 10 }}>
            Borrowable
          </span>
        ) : (
          <span className="badge badge-amber" style={{ fontSize: 10 }}>
            Supply Only
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 3,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Total Supply
            </p>
            <InfoTip text="Total USD deposited in this market" />
          </div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--cyan)",
            }}
          >
            {totalDepUsd > 0
              ? `$${totalDepUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
        </div>
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 3,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Total Borrowed
            </p>
            <InfoTip text="Total USD borrowed from this market" />
          </div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              fontWeight: 500,
              color: "#f87171",
            }}
          >
            {totalBorUsd > 0
              ? `$${totalBorUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : "—"}
          </p>
        </div>
        <div
          style={{
            background: "rgba(52,211,153,0.06)",
            border: "1px solid rgba(52,211,153,0.12)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 3,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "#34d399",
                textTransform: "uppercase",
              }}
            >
              Supply APY
            </p>
            <InfoTip text="Annual yield for depositors" />
          </div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 17,
              fontWeight: 500,
              color: "#34d399",
            }}
          >
            {supplyApy > 0 ? `${supplyApy.toFixed(2)}%` : "—"}
          </p>
        </div>
        <div
          style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.12)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 3,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "#f59e0b",
                textTransform: "uppercase",
              }}
            >
              Borrow APY
            </p>
            <InfoTip text="Annual cost for borrowers" />
          </div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 17,
              fontWeight: 500,
              color: "#f59e0b",
            }}
          >
            {borrowApy > 0 ? `${borrowApy.toFixed(2)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Utilization */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              Utilization
            </span>
            <InfoTip
              text={
                "% of deposits currently borrowed.\nAbove 80% kink: borrow rate spikes."
              }
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 500,
              color: uColor,
            }}
          >
            {utilization.toFixed(1)}%
          </span>
        </div>
        <div
          style={{
            height: 5,
            borderRadius: 3,
            background: "rgba(255,255,255,0.05)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "80%",
              top: 0,
              width: 1,
              height: "100%",
              background: "rgba(255,255,255,0.2)",
            }}
          />
          <div
            style={{
              width: `${Math.min(utilization, 100)}%`,
              height: "100%",
              background: `linear-gradient(90deg,#34d399,${uColor})`,
              borderRadius: 3,
              transition: "width 1s",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 3,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            0%
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            Optimal 80%
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            100%
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <button
            className="btn-primary"
            style={{
              width: "100%",
              borderRadius: 10,
              padding: "10px 0",
              fontSize: 13,
            }}
          >
            Supply →
          </button>
        </Link>
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <button
            className="btn-secondary"
            disabled={!isBorrowEnabled}
            style={{
              width: "100%",
              borderRadius: 10,
              padding: "10px 0",
              fontSize: 13,
              opacity: isBorrowEnabled ? 1 : 0.4,
              cursor: isBorrowEnabled ? "pointer" : "not-allowed",
            }}
          >
            Borrow
          </button>
        </Link>
      </div>
    </div>
  );
}

// ── Protocol stat card ─────────────────────────────────────────────────────────
function ProtoStat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "20px 24px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 10,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 28,
          fontWeight: 500,
          color,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────────────
function TickerItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 20px",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--cyan)",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
      <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 8 }}>◆</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MarketsPage() {
  useScrollAnimation();
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Unified protocol data — single source of truth
  const { assets, totals, isLoading } = useProtocolData();

  const tests = useCounter(371, 1800, started);
  const contracts = useCounter(10, 1200, started);

  const { displayText } = useTypewriter({
    phrases: [
      "Lend. Borrow.\nEarn yield on-chain.",
      "Deposit.\nEarn yield 24/7.",
      "Borrow.\nAgainst your collateral.",
      "Yield.\nPowered by Chainlink.",
    ],
    typingSpeed: 55,
    deleteSpeed: 28,
    pauseAfter: 2800,
    pauseAfterDelete: 350,
  });

  const TICKER = [
    { label: "Tests Passing", value: "371" },
    { label: "Deployed", value: "Sepolia" },
    { label: "Assets", value: "WETH·USDC·LINK" },
    { label: "Max LTV", value: "80%" },
    { label: "Liq. Bonus", value: "8%" },
    { label: "Oracle", value: "Chainlink+TWAP" },
    { label: "Interest", value: "Two-Slope Kink" },
    { label: "Close Factor", value: "50%" },
    { label: "Timelock", value: "48 Hours" },
    { label: "Credit Delegation", value: "Live" },
  ];

  // Map useProtocolData assets to market cards
  const marketAssets = SUPPORTED_ASSETS.map((sa, i) => {
    const live = assets.find((a) => a.symbol === sa.symbol);
    return {
      symbol: sa.symbol,
      icon: sa.icon,
      priceUsd: live?.priceUsd ?? 0,
      totalDepUsd: live?.totalDepositUsd ?? 0,
      totalBorUsd: live?.totalBorrowUsd ?? 0,
      utilization: live?.utilization ?? 0,
      supplyApy: live?.supplyApy ?? 0,
      borrowApy: live?.borrowApy ?? 0,
      isBorrowEnabled: live?.isBorrowEnabled ?? false,
    };
  });

  return (
    <>
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes ticker-scroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .ticker-track { display:flex; width:max-content; animation:ticker-scroll 35s linear infinite; }
        .ticker-track:hover { animation-play-state:paused; }
        .cursor-blink { display:inline-block; width:3px; height:1em; background:var(--cyan); margin-left:3px;
          vertical-align:text-bottom; animation:blink 1s step-end infinite; border-radius:1px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      {/* ── HERO ── */}
      <section
        style={{
          minHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background orbs */}
        <div
          style={{
            position: "absolute",
            top: "-15%",
            left: "-8%",
            width: "45vw",
            height: "45vw",
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(34,211,238,0.07) 0%,transparent 70%)",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-8%",
            right: "-5%",
            width: "38vw",
            height: "38vw",
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%)",
            filter: "blur(60px)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.04) 1px,transparent 1px)",
            backgroundSize: "32px 32px",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            flex: 1,
            maxWidth: 1280,
            margin: "0 auto",
            width: "100%",
            padding: "64px 24px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 48,
            alignItems: "center",
          }}
        >
          {/* Left */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* Badges */}
            <div
              className="reveal"
              style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
            >
              <span
                className="badge badge-cyan"
                style={{ padding: "4px 12px" }}
              >
                <span className="pulse-dot" style={{ marginRight: 8 }} />
                Live on Sepolia
              </span>
              <span className="badge badge-violet">Chainlink + TWAP</span>
              <span className="badge badge-green">371 Tests</span>
              <span className="badge badge-amber">Credit Delegation</span>
            </div>

            {/* Typewriter */}
            <div
              className="reveal reveal-delay-1"
              style={{ minHeight: "clamp(8rem,16vw,12rem)" }}
            >
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  lineHeight: 1.06,
                  letterSpacing: "-0.03em",
                  fontSize: "clamp(2.4rem,5vw,3.6rem)",
                  color: "var(--text-primary)",
                  whiteSpace: "pre-line",
                }}
              >
                {displayText.split("\n").map((line, i) => (
                  <span key={i}>
                    {i === 0 ? (
                      line.split(" ").map((word, j) => (
                        <span
                          key={j}
                          style={
                            ["Lend.", "Borrow.", "Deposit.", "Yield."].includes(
                              word,
                            )
                              ? { color: "var(--cyan)" }
                              : {}
                          }
                        >
                          {word}{" "}
                        </span>
                      ))
                    ) : (
                      <span
                        style={{
                          background:
                            "linear-gradient(135deg,var(--cyan),#a78bfa)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        {line}
                      </span>
                    )}
                    {i === 0 && <br />}
                  </span>
                ))}
                <span className="cursor-blink" />
              </h1>
            </div>

            <p
              className="reveal reveal-delay-2"
              style={{
                fontSize: 15,
                lineHeight: 1.8,
                color: "var(--text-secondary)",
                maxWidth: 440,
              }}
            >
              A production-grade DeFi lending protocol with Chainlink+TWAP
              oracles, two-slope interest rates, 48-hour governance timelock,
              credit delegation, and pUSD CDP — deployed on Sepolia.
            </p>

            {/* Counters */}
            <div
              className="reveal reveal-delay-3"
              style={{ display: "flex", gap: 28, flexWrap: "wrap" }}
            >
              {[
                { n: tests, label: "tests passing" },
                { n: contracts, label: "live contracts" },
                { n: 3, label: "supported assets" },
              ].map(({ n, label }) => (
                <div
                  key={label}
                  style={{
                    borderRight: "1px solid var(--border)",
                    paddingRight: 24,
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "1.8rem",
                      fontWeight: 500,
                      color: "var(--cyan)",
                      lineHeight: 1,
                    }}
                  >
                    {n}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div
              className="reveal reveal-delay-4"
              style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
            >
              <Link href="/dashboard">
                <button
                  className="btn-primary"
                  style={{ padding: "12px 28px", fontSize: 14 }}
                >
                  Open App →
                </button>
              </Link>
              <a
                href="https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol"
                target="_blank"
                rel="noopener noreferrer"
              >
                <button
                  className="btn-ghost"
                  style={{ padding: "12px 28px", fontSize: 14 }}
                >
                  View Source ↗
                </button>
              </a>
            </div>
          </div>

          {/* Right — protocol status + live data */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              position: "relative",
              zIndex: 1,
            }}
          >
            {/* Live protocol health */}
            <div
              className="card-glow reveal reveal-delay-2"
              style={{ padding: 24 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: "linear-gradient(135deg,var(--cyan),#a78bfa)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                    }}
                  >
                    ⬡
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 14,
                      color: "var(--text-primary)",
                    }}
                  >
                    Protocol Live Status
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="pulse-dot" />
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "#34d399",
                    }}
                  >
                    {totals.isPaused ? "Paused" : "All Systems Normal"}
                  </span>
                </div>
              </div>
              {[
                {
                  label: "Total Value Locked",
                  value:
                    totals.tvlUsd > 0
                      ? `$${totals.tvlUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                      : "—",
                  color: "var(--cyan)",
                },
                {
                  label: "Total Borrowed",
                  value:
                    totals.totalBorrowUsd > 0
                      ? `$${totals.totalBorrowUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                      : "—",
                  color: "#f87171",
                },
                {
                  label: "Avg Supply APY",
                  value:
                    totals.weightedSupplyApy > 0
                      ? `${totals.weightedSupplyApy.toFixed(2)}%`
                      : "—",
                  color: "#34d399",
                },
                {
                  label: "Governance Timelock",
                  value: "48 hours",
                  color: "var(--cyan)",
                },
                {
                  label: "Credit Delegation",
                  value: "Live ✓",
                  color: "#a78bfa",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color,
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Feature badges */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              {[
                {
                  icon: "🛡",
                  c: "#34d399",
                  label: "Security",
                  value: "ReentrancyGuard + CEI",
                },
                {
                  icon: "⏱",
                  c: "var(--cyan)",
                  label: "Timelock",
                  value: "48h governance delay",
                },
                {
                  icon: "⚡",
                  c: "#f59e0b",
                  label: "Flash Loans",
                  value: "0.09% fee",
                },
                {
                  icon: "◈",
                  c: "#a78bfa",
                  label: "E-Mode",
                  value: "Up to 97% LTV",
                },
              ].map(({ icon, c, label, value }) => (
                <div
                  key={label}
                  style={{
                    background: `${c}06`,
                    border: `1px solid ${c}18`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    animation: "float 4s ease-in-out infinite",
                    animationDelay: `${Math.random() * 2}s`,
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 500,
                        color: c,
                      }}
                    >
                      {value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div
          style={{
            overflow: "hidden",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            padding: "11px 0",
            background: "rgba(0,0,0,0.25)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div className="ticker-track">
            {[...TICKER, ...TICKER].map((item, i) => (
              <TickerItem key={i} {...item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Protocol stats ── */}
      <section
        style={{ padding: "60px 24px 0", maxWidth: 1280, margin: "0 auto" }}
      >
        <div
          className="reveal"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 10,
            marginBottom: 48,
          }}
        >
          <ProtoStat
            label="Total Value Locked"
            value={
              totals.tvlUsd > 0
                ? `$${totals.tvlUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : "—"
            }
            color="var(--cyan)"
            sub="Across all markets"
          />
          <ProtoStat
            label="Total Borrowed"
            value={
              totals.totalBorrowUsd > 0
                ? `$${totals.totalBorrowUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : "—"
            }
            color="#f87171"
            sub="Outstanding debt"
          />
          <ProtoStat
            label="Weighted Supply APY"
            value={
              totals.weightedSupplyApy > 0
                ? `${totals.weightedSupplyApy.toFixed(2)}%`
                : "—"
            }
            color="#34d399"
            sub="Avg across all assets"
          />
          <ProtoStat
            label="Tests Passing"
            value="371"
            color="#a78bfa"
            sub="100% — all suites"
          />
        </div>
      </section>

      {/* ── Live Markets ── */}
      <section
        style={{ padding: "0 24px 60px", maxWidth: 1280, margin: "0 auto" }}
      >
        <div
          className="reveal"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <p className="section-label" style={{ marginBottom: 4 }}>
              Live Markets
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "1.5rem",
                color: "var(--text-primary)",
              }}
            >
              Available Assets
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isLoading && (
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
            <ConnectButton
              accountStatus="avatar"
              chainStatus="icon"
              showBalance={false}
            />
          </div>
        </div>

        <div
          className="reveal reveal-delay-1"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
            gap: 16,
          }}
        >
          {marketAssets.map((a) => (
            <MarketCard key={a.symbol} {...a} />
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        style={{
          padding: "60px 24px",
          background: "rgba(0,0,0,0.12)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div
            className="reveal"
            style={{ textAlign: "center", marginBottom: 48 }}
          >
            <p className="section-label" style={{ marginBottom: 8 }}>
              How it works
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(1.6rem,3.5vw,2.2rem)",
                color: "var(--text-primary)",
              }}
            >
              Three steps to earn yield
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 16,
            }}
          >
            {[
              {
                n: "01",
                icon: "◈",
                c: "var(--cyan)",
                title: "Deposit Collateral",
                body: "Supply WETH, USDC, or LINK to earn interest and unlock borrowing power. Receive lTokens as proof of deposit — automatically accruing yield.",
              },
              {
                n: "02",
                icon: "⌁",
                c: "#a78bfa",
                title: "Borrow Assets",
                body: "Borrow against your collateral up to the LTV limit. Health factor must stay above 1.0. E-Mode unlocks up to 97% LTV for correlated assets.",
              },
              {
                n: "03",
                icon: "⬡",
                c: "#34d399",
                title: "Earn & Delegate",
                body: "Earn yield automatically via scaled balances. Or delegate your borrowing power to a trusted address — the credit delegation primitive.",
              },
            ].map(({ n, icon, c, title, body }, i) => (
              <div
                key={n}
                className={`reveal reveal-delay-${i + 1} card`}
                style={{ padding: 28 }}
              >
                <div
                  style={{ display: "flex", alignItems: "flex-start", gap: 16 }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 13,
                        background: `${c}15`,
                        border: `1px solid ${c}30`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        color: c,
                      }}
                    >
                      {icon}
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "1.4rem",
                        fontWeight: 500,
                        color: c,
                        opacity: 0.18,
                      }}
                    >
                      {n}
                    </span>
                  </div>
                  <div>
                    <h3
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: 15,
                        color: "var(--text-primary)",
                        marginBottom: 8,
                      }}
                    >
                      {title}
                    </h3>
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-muted)",
                        lineHeight: 1.75,
                      }}
                    >
                      {body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack ── */}
      <section style={{ padding: "60px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div
            className="reveal"
            style={{ textAlign: "center", marginBottom: 40 }}
          >
            <p className="section-label" style={{ marginBottom: 8 }}>
              Built with
            </p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(1.4rem,3vw,1.9rem)",
                color: "var(--text-primary)",
              }}
            >
              Production-grade tech stack
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6,1fr)",
              gap: 10,
            }}
          >
            {[
              { label: "Solidity", sub: "0.8.24", icon: "⬡" },
              { label: "Foundry", sub: "371 Tests", icon: "⚒" },
              { label: "Chainlink+TWAP", sub: "Dual Oracle", icon: "◈" },
              { label: "Next.js 14", sub: "App Router", icon: "▲" },
              { label: "wagmi v2", sub: "Type-Safe", icon: "⌁" },
              { label: "The Graph", sub: "Subgraph", icon: "⊕" },
            ].map(({ label, sub, icon }, i) => (
              <div
                key={label}
                className={`reveal reveal-delay-${(i % 3) + 1} card`}
                style={{ padding: "18px 12px", textAlign: "center" }}
              >
                <div
                  style={{
                    fontSize: 22,
                    color: "var(--cyan)",
                    marginBottom: 8,
                    opacity: 0.7,
                  }}
                >
                  {icon}
                </div>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "var(--text-primary)",
                  }}
                >
                  {label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginTop: 3,
                  }}
                >
                  {sub}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
