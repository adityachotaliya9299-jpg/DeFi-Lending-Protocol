"use client";

import { useState } from "react";
import { PageShell, Stat, CountUp, TokenIcon, UtilBar, Sparkline, Reveal } from "@/components/ui/kit";
import { ActionModal, PoolAction } from "@/components/protocol/ActionModal";
import { useProtocolData, AssetData } from "@/hooks/useProtocolData";

export default function MarketsPage() {
  const { assets, totals, user, isLoading } = useProtocolData();
  const [modal, setModal] = useState<{ asset: AssetData; action: PoolAction } | null>(null);

  return (
    <PageShell
      eyebrow="Money markets"
      title={<>Every market, <span className="grad-text">one pool.</span></>}
      sub="Live reserve data streamed from the LendingPool every 15 seconds. Supply to earn, borrow against your collateral."
      wide
    >
      <div className="grid-4" style={{ marginBottom: 28 }}>
        <Stat label="Total value locked" loading={isLoading}
          value={<CountUp value={totals.tvlUsd} prefix="$" />} />
        <Stat label="Total borrowed" loading={isLoading}
          value={<CountUp value={totals.totalBorrowUsd} prefix="$" />} />
        <Stat label="Available liquidity" loading={isLoading}
          value={<CountUp value={totals.totalAvailableUsd} prefix="$" />} />
        <Stat label="Avg supply APY" loading={isLoading} accent="var(--mint)"
          value={<CountUp value={totals.weightedSupplyApy} suffix="%" />} />
      </div>

      <Reveal>
        <div className="card card-sheen" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="lf">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Price</th>
                  <th>Total supplied</th>
                  <th>Supply APY</th>
                  <th>Total borrowed</th>
                  <th>Borrow APY</th>
                  <th>Utilisation</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(assets.length ? assets : Array(3).fill(null)).map((a: AssetData | null, i: number) => (
                  <tr key={a?.symbol ?? i}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                        {a ? <TokenIcon symbol={a.symbol} size={34} /> : <span className="skeleton" style={{ display: "inline-block", width: 34, height: 34, borderRadius: "50%" }} />}
                        <span>
                          <b style={{ fontFamily: "var(--font-display)", display: "block" }}>{a?.symbol ?? "····"}</b>
                          {a && !a.isBorrowEnabled && <span className="chip" style={{ fontSize: 9, padding: "1px 8px" }}>collateral only</span>}
                        </span>
                      </span>
                    </td>
                    <td className="num">{a ? `$${a.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : <span className="skeleton">00000</span>}</td>
                    <td className="num">{a ? `$${a.totalDepositUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : <span className="skeleton">00000</span>}</td>
                    <td>
                      {a ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                          <span className="num" style={{ color: "var(--mint)", fontWeight: 600 }}>{a.supplyApy.toFixed(2)}%</span>
                          <Sparkline seed={`${a.symbol}-s`} value={a.supplyApy} width={64} height={22} />
                        </span>
                      ) : <span className="skeleton">0.00%</span>}
                    </td>
                    <td className="num">{a ? `$${a.totalBorrowUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : <span className="skeleton">00000</span>}</td>
                    <td>
                      {a ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                          <span className="num" style={{ color: "var(--violet)", fontWeight: 600 }}>{a.borrowApy.toFixed(2)}%</span>
                          <Sparkline seed={`${a.symbol}-b`} value={a.borrowApy} color="var(--violet)" width={64} height={22} />
                        </span>
                      ) : <span className="skeleton">0.00%</span>}
                    </td>
                    <td>{a ? <UtilBar pct={a.utilization} /> : <span className="skeleton">▮▮▮▮</span>}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {a && (
                        <span style={{ display: "inline-flex", gap: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => setModal({ asset: a, action: "supply" })}>Supply</button>
                          <button className="btn btn-ghost btn-sm" disabled={!a.isBorrowEnabled}
                            onClick={() => setModal({ asset: a, action: "borrow" })}>Borrow</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      {totals.isPaused && (
        <div className="chip chip-danger" style={{ marginTop: 18, padding: "10px 18px" }}>
          ⚠ Protocol is paused — deposits and borrows are temporarily disabled.
        </div>
      )}

      {modal && (
        <ActionModal
          asset={modal.asset}
          action={modal.action}
          onClose={() => setModal(null)}
          userDeposit={user?.deposits[modal.asset.symbol]}
          userDebt={user?.debts[modal.asset.symbol]}
        />
      )}
    </PageShell>
  );
}
