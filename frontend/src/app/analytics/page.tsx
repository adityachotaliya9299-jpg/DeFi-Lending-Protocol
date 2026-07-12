"use client";

import { PageShell, Stat, CountUp, TokenIcon, UtilBar, Reveal } from "@/components/ui/kit";
import { useProtocolData } from "@/hooks/useProtocolData";

/**
 * Interest-rate model curve — rendered directly from the protocol's two-slope
 * kinked formula (base 1%, slope1 4% to 80% optimal, slope2 75% past the kink).
 */
function RateCurve({ currentUtil }: { currentUtil: number }) {
  const W = 640, H = 240, PAD = 40;
  const rate = (u: number) => {
    const opt = 0.8;
    return u <= opt
      ? 1 + 4 * (u / opt)
      : 1 + 4 + 75 * ((u - opt) / (1 - opt));
  };
  const maxRate = rate(1);
  const pts: string[] = [];
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    const x = PAD + (W - PAD * 2) * u;
    const y = H - PAD - (H - PAD * 2) * (rate(u) / maxRate);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const cu = Math.min(1, Math.max(0, currentUtil / 100));
  const cx = PAD + (W - PAD * 2) * cu;
  const cy = H - PAD - (H - PAD * 2) * (rate(cu) / maxRate);
  const kinkX = PAD + (W - PAD * 2) * 0.8;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      <defs>
        <linearGradient id="rc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--mint)" />
          <stop offset="0.8" stopColor="var(--azure)" />
          <stop offset="1" stopColor="var(--coral)" />
        </linearGradient>
      </defs>
      {/* grid */}
      {[0, 25, 50, 75, 100].map(g => {
        const x = PAD + (W - PAD * 2) * (g / 100);
        return (
          <g key={g}>
            <line x1={x} y1={PAD} x2={x} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
            <text x={x} y={H - PAD + 18} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">{g}%</text>
          </g>
        );
      })}
      {/* kink marker */}
      <line x1={kinkX} y1={PAD} x2={kinkX} y2={H - PAD} stroke="var(--violet)" strokeWidth="1" strokeDasharray="4 5" />
      <text x={kinkX} y={PAD - 8} textAnchor="middle" fontSize="10" fill="var(--violet)" fontFamily="var(--font-mono)">kink 80%</text>
      {/* curve */}
      <path d={pts.join(" ")} fill="none" stroke="url(#rc)" strokeWidth="3" strokeLinecap="round" />
      {/* current utilisation dot */}
      <circle cx={cx} cy={cy} r="6" fill="var(--mint)" style={{ filter: "drop-shadow(0 0 8px var(--mint))" }}>
        <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={cx} y={cy - 14} textAnchor="middle" fontSize="11" fill="var(--text-primary)" fontFamily="var(--font-mono)">
        now · {currentUtil.toFixed(1)}%
      </text>
      <text x={PAD} y={PAD - 8} fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)">borrow APR →</text>
    </svg>
  );
}

/* horizontal bar comparison */
function HBar({ label, value, max, color, fmt }: { label: string; value: number; max: number; color: string; fmt: (n: number) => string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{label}</span>
        <span className="num" style={{ color: "var(--text-secondary)" }}>{fmt(value)}</span>
      </div>
      <div className="meter" style={{ height: 9 }}>
        <span style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { assets, totals, isLoading } = useProtocolData();
  const maxDep = Math.max(1, ...assets.map(a => a.totalDepositUsd));
  const avgUtil = assets.length
    ? assets.reduce((s, a) => s + a.utilization * a.totalDepositUsd, 0) / Math.max(1, assets.reduce((s, a) => s + a.totalDepositUsd, 0))
    : 0;

  return (
    <PageShell
      eyebrow="Analytics"
      title={<>Protocol <span className="grad-text">telemetry.</span></>}
      sub="Live reserve metrics, utilisation and the interest-rate model that prices every borrow."
      wide
    >
      <div className="grid-4" style={{ marginBottom: 26 }}>
        <Stat label="TVL" loading={isLoading} value={<CountUp value={totals.tvlUsd} prefix="$" />} />
        <Stat label="Borrowed" loading={isLoading} value={<CountUp value={totals.totalBorrowUsd} prefix="$" />} />
        <Stat label="Weighted supply APY" loading={isLoading} accent="var(--mint)" value={<CountUp value={totals.weightedSupplyApy} suffix="%" />} />
        <Stat label="Weighted borrow APY" loading={isLoading} accent="var(--violet)" value={<CountUp value={totals.weightedBorrowApy} suffix="%" />} />
      </div>

      <div className="split" style={{ marginBottom: 24 }}>
        <Reveal>
          <div className="card card-sheen">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 17 }}>Interest-rate model</h3>
              <span className="chip chip-azure">two-slope · kinked</span>
            </div>
            <RateCurve currentUtil={avgUtil} />
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "12px 0 0" }}>
              Base 1% APR, +4% to the 80% optimal point, then +75% past the kink —
              steep rates defend the pool&apos;s last liquidity.
            </p>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div className="card card-sheen">
            <h3 style={{ fontSize: 17, marginBottom: 20 }}>Deposits by asset</h3>
            {assets.map((a, i) => (
              <HBar key={a.symbol} label={a.symbol} value={a.totalDepositUsd} max={maxDep}
                color={["var(--mint)", "var(--azure)", "var(--violet)"][i % 3]}
                fmt={n => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
            ))}
            <div className="hr" />
            <h3 style={{ fontSize: 17, margin: "18px 0 20px" }}>Borrows by asset</h3>
            {assets.map((a, i) => (
              <HBar key={a.symbol} label={a.symbol} value={a.totalBorrowUsd} max={maxDep}
                color={["var(--violet)", "var(--gold)", "var(--coral)"][i % 3]}
                fmt={n => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
            ))}
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: 17 }}>Reserve detail</h3>
          </div>
          <div className="table-wrap">
            <table className="lf">
              <thead>
                <tr><th>Asset</th><th>Price</th><th>Supplied</th><th>Borrowed</th><th>Available</th><th>Utilisation</th><th>Status</th></tr>
              </thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.symbol}>
                    <td><span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><TokenIcon symbol={a.symbol} size={28} /><b style={{ fontFamily: "var(--font-display)" }}>{a.symbol}</b></span></td>
                    <td className="num">${a.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                    <td className="num">${a.totalDepositUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="num">${a.totalBorrowUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="num">${a.availableLiq.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td><UtilBar pct={a.utilization} /></td>
                    <td>
                      {a.isActive
                        ? <span className="chip chip-mint">active</span>
                        : <span className="chip chip-danger">frozen</span>}
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
