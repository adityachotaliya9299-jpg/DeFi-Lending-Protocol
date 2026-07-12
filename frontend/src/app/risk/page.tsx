"use client";

import { PageShell, Stat, TokenIcon, Reveal } from "@/components/ui/kit";
import { useProtocolData } from "@/hooks/useProtocolData";
import { CONTRACT_ADDRESSES, EXT_ADDRESSES } from "@/constants/addresses";

/* Static risk parameters (per CollateralManager configuration) */
const RISK_PARAMS = [
  { symbol: "WETH", ltv: 80, liqThreshold: 82.5, bonus: 5 },
  { symbol: "USDC", ltv: 85, liqThreshold: 88, bonus: 4 },
  { symbol: "LINK", ltv: 70, liqThreshold: 75, bonus: 7.5 },
];

const FINDINGS = [
  { id: "H-01/02", sev: "High", title: "Supply-cap check copied into borrow/repay/withdraw — DoS vector", status: "Fixed" },
  { id: "H-03", sev: "High", title: "E-Mode health factor used RAY instead of WAD — liquidation bypass", status: "Fixed" },
  { id: "H-04", sev: "High", title: "StableDebt _accrueInterest() no-op — interest lost on multi-mint", status: "Fixed" },
  { id: "H-05", sev: "High", title: "Governance quorum bypass with zero token supply", status: "Partial" },
  { id: "H-06", sev: "High", title: "TrancheVault senior cap skipped on first deposit", status: "Fixed" },
  { id: "H-07", sev: "High", title: "NFT liquidate() never pulled debt from liquidator — free loot", status: "Fixed" },
  { id: "H-08", sev: "High", title: "LoopStrategy 1:1 price assumption on cross-asset positions", status: "Partial" },
];

const DEFENSES = [
  { glyph: "⏸", title: "Per-asset pause", desc: "SecurityHardening can freeze a single market without stopping the protocol." },
  { glyph: "◭", title: "Commit-reveal", desc: "Sensitive parameter changes are committed before execution to resist front-running." },
  { glyph: "⏱", title: "Rate limits", desc: "Outflow rate limiting caps how fast liquidity can leave in a single window." },
  { glyph: "◉", title: "Weighted-median oracle", desc: "Up to 5 Chainlink feeds per asset; stale, reverting and negative feeds are excluded. Minimum 2 valid feeds." },
  { glyph: "⛶", title: "Supply & borrow caps", desc: "Every reserve carries hard caps that bound worst-case exposure." },
  { glyph: "☰", title: "CEI everywhere", desc: "Checks-effects-interactions with single-entry reentrancy guards on all state-changing paths." },
];

export default function RiskPage() {
  const { totals, isLoading } = useProtocolData();

  return (
    <PageShell
      eyebrow="Risk & audit"
      title={<>Engineered to <span className="grad-text">fail safely.</span></>}
      sub="Risk parameters, oracle architecture and the complete LFI-2026-01 audit trail."
      wide
    >
      {/* audit summary */}
      <div className="grid-4" style={{ marginBottom: 26 }}>
        <Stat label="Audit reference" value={<span style={{ fontSize: 22 }}>LFI-2026-01</span>} sub="45 contracts in scope" />
        <Stat label="Findings" value="37" sub="0 critical · 9 high · 12 med" />
        <Stat label="PoC exploits written" value="6" sub="All reproduced in Foundry" accent="var(--violet)" />
        <Stat label="Tests passing" value="670" sub="39 suites, incl. fork tests" accent="var(--mint)" />
      </div>

      <div className="split" style={{ marginBottom: 24 }}>
        {/* risk parameters */}
        <Reveal>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 17 }}>Collateral risk parameters</h3>
              <span className="chip">CollateralManager</span>
            </div>
            <div className="table-wrap">
              <table className="lf">
                <thead><tr><th>Asset</th><th>Max LTV</th><th>Liq. threshold</th><th>Liq. bonus</th><th>Buffer</th></tr></thead>
                <tbody>
                  {RISK_PARAMS.map(r => (
                    <tr key={r.symbol}>
                      <td><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><TokenIcon symbol={r.symbol} size={26} /><b style={{ fontFamily: "var(--font-display)" }}>{r.symbol}</b></span></td>
                      <td className="num">{r.ltv}%</td>
                      <td className="num" style={{ color: "var(--amber)" }}>{r.liqThreshold}%</td>
                      <td className="num" style={{ color: "var(--mint)" }}>+{r.bonus}%</td>
                      <td>
                        <div className="meter" style={{ width: 90 }}>
                          <span style={{ width: `${(r.liqThreshold - r.ltv) * 12}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "14px 24px" }}>
              The gap between max LTV and liquidation threshold is your safety buffer before liquidation can begin.
            </p>
          </div>
        </Reveal>

        {/* protocol status */}
        <Reveal delay={90}>
          <div className="card card-aurora card-sheen">
            <h3 style={{ fontSize: 17, marginBottom: 18 }}>Protocol status</h3>
            <div className="inforow"><span>Global pause</span>
              {totals.isPaused
                ? <span className="chip chip-danger">PAUSED</span>
                : <span className="chip chip-mint">OPERATIONAL</span>}
            </div>
            <div className="inforow"><span>Close factor</span><b>50%</b></div>
            <div className="inforow"><span>Flash loan fee</span><b>0.09%</b></div>
            <div className="inforow"><span>Oracle quorum</span><b>2+ valid feeds</b></div>
            <div className="hr" />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.16em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 12 }}>Security contracts</p>
            {[
              ["SecurityHardening", EXT_ADDRESSES.SECURITY_HARDENING],
              ["OracleAggregator", EXT_ADDRESSES.ORACLE_AGGREGATOR],
              ["BadDebtSocialisation", EXT_ADDRESSES.BAD_DEBT],
              ["GovernanceTimelock", CONTRACT_ADDRESSES.GOVERNANCE],
            ].map(([name, addr]) => (
              <a key={name} href={`https://sepolia.etherscan.io/address/${addr}`} target="_blank" rel="noreferrer"
                className="inforow" style={{ textDecoration: "none" }}>
                <span>{name}</span>
                <b style={{ color: "var(--azure)" }}>{(addr as string).slice(0, 6)}…{(addr as string).slice(-4)} ↗</b>
              </a>
            ))}
          </div>
        </Reveal>
      </div>

      {/* defenses grid */}
      <Reveal>
        <h3 style={{ fontSize: 20, margin: "34px 0 18px" }}>Defence in depth</h3>
      </Reveal>
      <div className="grid-3" style={{ marginBottom: 34 }}>
        {DEFENSES.map((d, i) => (
          <Reveal key={d.title} delay={i * 50}>
            <div className="card hoverable" style={{ height: "100%" }}>
              <span style={{ fontSize: 22, color: "var(--mint)" }}>{d.glyph}</span>
              <h4 style={{ fontSize: 15.5, margin: "12px 0 8px" }}>{d.title}</h4>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.65 }}>{d.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* audit findings table */}
      <Reveal>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ fontSize: 17 }}>High-severity findings — LFI-2026-01</h3>
            <a className="btn btn-ghost btn-sm"
              href="https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol"
              target="_blank" rel="noreferrer">Full report on GitHub ↗</a>
          </div>
          <div className="table-wrap">
            <table className="lf">
              <thead><tr><th>ID</th><th>Finding</th><th>Severity</th><th>Status</th></tr></thead>
              <tbody>
                {FINDINGS.map(f => (
                  <tr key={f.id}>
                    <td className="num" style={{ color: "var(--violet)" }}>{f.id}</td>
                    <td style={{ maxWidth: 480 }}>{f.title}</td>
                    <td><span className="chip chip-danger">{f.sev}</span></td>
                    <td>
                      {f.status === "Fixed"
                        ? <span className="chip chip-mint">✓ Fixed</span>
                        : <span className="chip chip-gold">◐ Partial</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </PageShell>
  );
}
