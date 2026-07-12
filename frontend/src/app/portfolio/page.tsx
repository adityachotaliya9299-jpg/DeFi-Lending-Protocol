"use client";

import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Stat, CountUp, TokenIcon, EmptyState, Reveal } from "@/components/ui/kit";
import { useProtocolData } from "@/hooks/useProtocolData";

/* Donut chart drawn by hand — composition of collateral vs debt */
function Donut({ slices, size = 190 }: { slices: { label: string; value: number; color: string }[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 74, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} viewBox="0 0 190 190" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="95" cy="95" r={R} fill="none" stroke="var(--bg-input)" strokeWidth="20" />
        {total > 0 && slices.map(s => {
          const frac = s.value / total;
          const dash = `${frac * C} ${C}`;
          const off = -acc * C;
          acc += frac;
          return (
            <circle key={s.label} cx="95" cy="95" r={R} fill="none"
              stroke={s.color} strokeWidth="20" strokeDasharray={dash} strokeDashoffset={off}
              style={{ transition: "stroke-dasharray 1s var(--ease-out)" }} />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="stat-label">Total</span>
        <span className="stat-value" style={{ fontSize: 21 }}>
          ${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}

const COLORS = ["var(--mint)", "var(--azure)", "var(--violet)", "var(--gold)"];

export default function PortfolioPage() {
  const { isConnected, address } = useAccount();
  const { assets, user, isLoading } = useProtocolData();

  const collateralSlices = assets
    .map((a, i) => ({
      label: a.symbol,
      value: Number(formatUnits(user?.deposits[a.symbol] ?? 0n, a.decimals)) * a.priceUsd,
      color: COLORS[i % COLORS.length],
    }))
    .filter(s => s.value > 0);

  const debtSlices = assets
    .map((a, i) => ({
      label: a.symbol,
      value: Number(formatUnits(user?.debts[a.symbol] ?? 0n, a.decimals)) * a.priceUsd,
      color: COLORS[(i + 2) % COLORS.length],
    }))
    .filter(s => s.value > 0);

  return (
    <PageShell
      eyebrow="Portfolio"
      title={<>Asset <span className="grad-text">composition.</span></>}
      sub={address ? `Connected as ${address.slice(0, 6)}…${address.slice(-4)}` : "Connect a wallet to inspect your holdings."}
    >
      {!isConnected ? (
        <div className="card card-aurora" style={{ padding: 60 }}>
          <EmptyState icon="▤" title="No wallet connected" sub="Connect to view your portfolio breakdown." action={<ConnectButton />} />
        </div>
      ) : (
        <>
          <div className="grid-3" style={{ marginBottom: 26 }}>
            <Stat label="Collateral value" loading={isLoading}
              value={<CountUp value={user?.totalCollateralUsd ?? 0} prefix="$" />} />
            <Stat label="Debt value" loading={isLoading}
              value={<CountUp value={user?.totalDebtUsd ?? 0} prefix="$" />} />
            <Stat label="Net position" loading={isLoading} accent="var(--mint)"
              value={<CountUp value={(user?.totalCollateralUsd ?? 0) - (user?.totalDebtUsd ?? 0)} prefix="$" />} />
          </div>

          <div className="grid-2">
            <Reveal>
              <div className="card card-sheen" style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: 17, marginBottom: 22 }}>Collateral mix</h3>
                {collateralSlices.length === 0
                  ? <EmptyState title="No collateral" sub="Supply assets to see your composition." />
                  : (
                    <>
                      <Donut slices={collateralSlices} />
                      <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 22, flexWrap: "wrap" }}>
                        {collateralSlices.map(s => (
                          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                            {s.label}
                            <b className="num" style={{ color: "var(--text-secondary)" }}>
                              ${s.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </b>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div className="card card-sheen" style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: 17, marginBottom: 22 }}>Debt mix</h3>
                {debtSlices.length === 0
                  ? <EmptyState title="No debt" sub="You have no outstanding borrows." />
                  : (
                    <>
                      <Donut slices={debtSlices} />
                      <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 22, flexWrap: "wrap" }}>
                        {debtSlices.map(s => (
                          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                            {s.label}
                            <b className="num" style={{ color: "var(--text-secondary)" }}>
                              ${s.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </b>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
              </div>
            </Reveal>
          </div>

          <Reveal delay={140}>
            <div className="card" style={{ padding: 0, overflow: "hidden", marginTop: 24 }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 17 }}>All positions</h3>
              </div>
              <div className="table-wrap">
                <table className="lf">
                  <thead><tr><th>Asset</th><th>Supplied</th><th>Borrowed</th><th>Net (USD)</th><th>Price</th></tr></thead>
                  <tbody>
                    {assets.map(a => {
                      const dep = Number(formatUnits(user?.deposits[a.symbol] ?? 0n, a.decimals));
                      const debt = Number(formatUnits(user?.debts[a.symbol] ?? 0n, a.decimals));
                      const net = (dep - debt) * a.priceUsd;
                      return (
                        <tr key={a.symbol}>
                          <td><span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><TokenIcon symbol={a.symbol} size={28} /><b style={{ fontFamily: "var(--font-display)" }}>{a.symbol}</b></span></td>
                          <td className="num">{dep.toLocaleString("en-US", { maximumFractionDigits: 5 })}</td>
                          <td className="num">{debt.toLocaleString("en-US", { maximumFractionDigits: 5 })}</td>
                          <td className="num" style={{ color: net >= 0 ? "var(--mint)" : "var(--coral)" }}>
                            {net >= 0 ? "+" : "−"}${Math.abs(net).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                          </td>
                          <td className="num">${a.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </>
      )}
    </PageShell>
  );
}
