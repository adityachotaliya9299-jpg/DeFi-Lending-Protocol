"use client";

import Link from "next/link";
import { OrbitalField } from "@/components/visual/OrbitalField";
import { Reveal, CountUp, TokenIcon } from "@/components/ui/kit";
import { useProtocolData } from "@/hooks/useProtocolData";

/* ═══════════════════════════════════════════════════════════════════════════
   LANDING — the Deepfield front door.
   ═══════════════════════════════════════════════════════════════════════════ */

const FEATURES = [
  {
    glyph: "◈", title: "Lend & Borrow", href: "/markets", accent: "var(--mint)",
    desc: "Deposit WETH, USDC or LINK and borrow against them at variable or fixed rates, driven by a two-slope kinked interest curve.",
    tag: "Core", big: true,
  },
  {
    glyph: "⟠", title: "4× Leverage Loops", href: "/leverage", accent: "var(--azure)",
    desc: "Open a leveraged position in a single transaction — LoopStrategy folds deposit-borrow cycles for you.",
    tag: "Phase 4",
  },
  {
    glyph: "⇄", title: "Interest-Rate Swaps", href: "/swap", accent: "var(--violet)",
    desc: "Hedge rate volatility: swap variable exposure for a fixed leg, cash-settled at maturity.",
    tag: "Phase 5",
  },
  {
    glyph: "◪", title: "Senior / Junior Tranches", href: "/tranches", accent: "var(--gold)",
    desc: "Structured yield with a protected senior sleeve and a levered junior sleeve that absorbs first loss.",
    tag: "Phase 5",
  },
  {
    glyph: "⌁", title: "Flash Loans", href: "/flashloan", accent: "var(--mint)",
    desc: "Uncollateralised liquidity at 0.09% — borrow, execute, repay inside one atomic transaction.",
    tag: "Core",
  },
  {
    glyph: "◨", title: "NFT Collateral", href: "/nft", accent: "var(--violet)",
    desc: "Borrow stables against ERC-721 floor prices with oracle-tracked valuations and full liquidation flow.",
    tag: "Phase 5",
  },
  {
    glyph: "✦", title: "ERC-4626 Yield Vault", href: "/yield", accent: "var(--azure)",
    desc: "Set-and-forget USDC vault that compounds lending yield into a standard tokenised share.",
    tag: "Phase 4",
  },
  {
    glyph: "⬢", title: "On-chain Governance", href: "/governance", accent: "var(--gold)",
    desc: "Token-weighted voting over LTVs, thresholds and caps — with a timelock between vote and execution.",
    tag: "Phase 4", big: true,
  },
];

const PHASES = [
  { n: "01", t: "Core Security Hardening", d: "Supply & borrow caps, ERC-2612 permits, liquidation receive-aToken" },
  { n: "02", t: "Debt Token Architecture", d: "Scaled-balance debt tokens and credit delegation" },
  { n: "03", t: "Advanced Rates & Oracles", d: "Stable-rate debt, N-source weighted-median oracle, points" },
  { n: "04", t: "Cross-chain & Yield", d: "LayerZero messenger, ERC-4626 vault, loop leverage, risk governance" },
  { n: "05", t: "Derivatives", d: "IR swaps, yield tranches, NFT collateral, liquidation pathfinder" },
  { n: "06", t: "Production Hardening", d: "Per-asset pause, commit-reveal, rate limits, gas benchmarks" },
];

export default function Landing() {
  const { totals, assets, isLoading } = useProtocolData();

  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.9 }}>
          <div style={{ width: "min(1000px, 100%)" }}>
            <OrbitalField height={720} />
          </div>
        </div>

        <div style={{ position: "relative", textAlign: "center", padding: "140px 24px 40px", maxWidth: 980, margin: "0 auto" }}>
          <div className="animate-fade-in" style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
            <span className="eyebrow">27 contracts · 670 tests · audited LFI-2026-01</span>
          </div>

          <h1 className="animate-fade-in" style={{ fontSize: "clamp(44px, 8vw, 92px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.02, animationDelay: "80ms" }}>
            Liquidity from<br />
            <span className="aurora-live">the deep field.</span>
          </h1>

          <p className="animate-fade-in" style={{ color: "var(--text-secondary)", fontSize: "clamp(15px, 2vw, 18px)", maxWidth: 620, margin: "26px auto 0", lineHeight: 1.75, animationDelay: "160ms" }}>
            LendFi is a full-stack lending protocol built from scratch — lend, borrow,
            leverage, hedge and govern across six phases of audited Solidity.
            Every feature below is live on Sepolia.
          </p>

          <div className="animate-fade-in" style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 40, flexWrap: "wrap", animationDelay: "240ms" }}>
            <Link href="/dashboard" className="btn btn-primary btn-lg">Launch App ↗</Link>
            <Link href="/risk" className="btn btn-ghost btn-lg">Read the Audit</Link>
          </div>

          {/* live stats strip */}
          <div className="animate-fade-in" style={{ display: "flex", gap: 0, justifyContent: "center", marginTop: 72, flexWrap: "wrap", animationDelay: "320ms" }}>
            {[
              { label: "Total value locked", value: totals.tvlUsd, prefix: "$" },
              { label: "Total borrowed", value: totals.totalBorrowUsd, prefix: "$" },
              { label: "Best supply APY", value: assets.length ? Math.max(0, ...assets.map(a => a.supplyApy)) : 0, suffix: "%" },
              { label: "Live assets", value: assets.filter(a => a.isActive).length, decimals: 0 },
            ].map((s, i) => (
              <div key={s.label} style={{ padding: "6px 34px", borderLeft: i > 0 ? "1px solid var(--border-strong)" : "none", minWidth: 170 }}>
                <div className={`stat-value ${isLoading ? "skeleton" : ""}`} style={{ fontSize: 30 }}>
                  <CountUp value={s.value} prefix={s.prefix ?? ""} suffix={s.suffix ?? ""} decimals={s.decimals ?? 2} />
                </div>
                <div className="stat-label" style={{ marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* scroll cue */}
        <div style={{ position: "absolute", bottom: 26, left: "50%", transform: "translateX(-50%)", color: "var(--text-muted)", fontSize: 20, animation: "float-y 2.6s ease-in-out infinite" }}>
          ↓
        </div>
      </section>

      {/* ── LIVE MARKETS TEASER ──────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 90px" }}>
        <Reveal>
          <div className="card card-aurora card-sheen" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 26px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="stat-label">Live markets · Sepolia</div>
                <h2 style={{ fontSize: 22, marginTop: 6 }}>Money markets, streaming on-chain</h2>
              </div>
              <Link href="/markets" className="btn btn-ghost btn-sm">All markets →</Link>
            </div>
            <div className="table-wrap">
              <table className="lf">
                <thead>
                  <tr><th>Asset</th><th>Price</th><th>Supply APY</th><th>Borrow APY</th><th>Utilisation</th></tr>
                </thead>
                <tbody>
                  {(assets.length ? assets : [null, null, null]).map((a, i) => (
                    <tr key={a?.symbol ?? i}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                          {a ? <TokenIcon symbol={a.symbol} size={30} /> : <span className="skeleton" style={{ display: "inline-block", width: 30, height: 30, borderRadius: "50%" }} />}
                          <b style={{ fontFamily: "var(--font-display)" }}>{a?.symbol ?? "····"}</b>
                        </span>
                      </td>
                      <td className="num">{a ? `$${a.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : <span className="skeleton">0000</span>}</td>
                      <td className="num" style={{ color: "var(--mint)" }}>{a ? `${a.supplyApy.toFixed(2)}%` : <span className="skeleton">0.00%</span>}</td>
                      <td className="num" style={{ color: "var(--violet)" }}>{a ? `${a.borrowApy.toFixed(2)}%` : <span className="skeleton">0.00%</span>}</td>
                      <td className="num">{a ? `${a.utilization.toFixed(1)}%` : <span className="skeleton">00.0%</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FEATURE BENTO ────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 90px" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <span className="eyebrow">The full stack</span>
            <h2 style={{ fontSize: "clamp(30px, 4.5vw, 44px)", marginTop: 18 }}>
              Eight primitives. <span className="grad-text">One protocol.</span>
            </h2>
          </div>
        </Reveal>

        <div className="lf-bento">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className={f.big ? "span2" : ""}>
              <Link href={f.href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
                <div className="card card-sheen hoverable" style={{ height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{
                      width: 46, height: 46, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, color: f.accent,
                      background: "var(--aurora-soft)", border: "1px solid var(--border-strong)",
                      boxShadow: `0 0 22px -6px ${f.accent}`,
                    }}>{f.glyph}</span>
                    <span className="chip">{f.tag}</span>
                  </div>
                  <h3 style={{ fontSize: 19 }}>{f.title}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13.8, margin: 0, lineHeight: 1.7, flex: 1 }}>{f.desc}</p>
                  <span style={{ color: f.accent, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>
                    Open →
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── PHASES TIMELINE ──────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px 90px" }}>
        <Reveal>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <span className="eyebrow">Engineering log</span>
            <h2 style={{ fontSize: "clamp(30px, 4.5vw, 44px)", marginTop: 18 }}>
              Six phases, <span className="grad-text">shipped in order.</span>
            </h2>
          </div>
        </Reveal>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 27, top: 10, bottom: 10, width: 2, background: "linear-gradient(var(--mint), var(--azure), var(--violet))", opacity: 0.4 }} />
          {PHASES.map((p, i) => (
            <Reveal key={p.n} delay={i * 70}>
              <div style={{ display: "flex", gap: 24, padding: "16px 0", alignItems: "flex-start" }}>
                <span style={{
                  width: 56, height: 56, flexShrink: 0, borderRadius: 16,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16,
                  background: "var(--bg-elev)", border: "1px solid var(--border-strong)",
                  color: "var(--mint)", position: "relative", zIndex: 1,
                }}>{p.n}</span>
                <div className="card" style={{ flex: 1, padding: "18px 22px" }}>
                  <h3 style={{ fontSize: 17 }}>{p.t}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13.5, margin: "6px 0 0" }}>{p.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── AUDIT ────────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 100px" }}>
        <Reveal>
          <div className="card card-aurora" style={{ padding: "clamp(28px, 5vw, 56px)", textAlign: "center", overflow: "hidden" }}>
            <div style={{ fontSize: 44, marginBottom: 18 }}>⛨</div>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)" }}>
              Audited. Exploited. <span className="grad-text">Fixed.</span>
            </h2>
            <p style={{ color: "var(--text-secondary)", maxWidth: 640, margin: "18px auto 0", lineHeight: 1.75 }}>
              LFI-2026-01 covered all 45 in-scope contracts: 37 findings, 6 working
              proof-of-concept exploits, and a verified remediation pass. Zero criticals.
              The full report, PoCs and threat model ship in this repository.
            </p>
            <div style={{ display: "flex", gap: 28, justifyContent: "center", marginTop: 36, flexWrap: "wrap" }}>
              {[
                ["0", "Critical"], ["9", "High"], ["12", "Medium"], ["10", "Low"], ["6", "Info"],
              ].map(([n, l]) => (
                <div key={l} style={{ minWidth: 84 }}>
                  <div className="stat-value" style={{ fontSize: 34, color: l === "Critical" ? "var(--mint)" : undefined }}>{n}</div>
                  <div className="stat-label" style={{ marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 38 }}>
              <Link href="/risk" className="btn btn-primary">Explore risk & audit →</Link>
            </div>
          </div>
        </Reveal>
      </section>

      <style>{`
        .lf-bento {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .lf-bento .span2 { grid-column: span 2; }
        @media (max-width: 980px) {
          .lf-bento { grid-template-columns: 1fr 1fr; }
          .lf-bento .span2 { grid-column: span 2; }
        }
        @media (max-width: 620px) {
          .lf-bento { grid-template-columns: 1fr; }
          .lf-bento .span2 { grid-column: span 1; }
        }
      `}</style>
    </div>
  );
}
