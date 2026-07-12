"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Stat, CountUp, TokenIcon, HealthGauge, EmptyState, Reveal } from "@/components/ui/kit";
import { ActionModal, PoolAction } from "@/components/protocol/ActionModal";
import { useProtocolData, AssetData } from "@/hooks/useProtocolData";

const MAX_HF = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

export default function DashboardPage() {
  const { isConnected } = useAccount();
  const { assets, user, isLoading } = useProtocolData();
  const [modal, setModal] = useState<{ asset: AssetData; action: PoolAction } | null>(null);

  const hf: number | null = user
    ? user.healthFactor === MAX_HF || user.totalDebtUsd === 0
      ? null
      : Number(user.healthFactor) / 1e18
    : null;

  const supplied = assets.filter(a => (user?.deposits[a.symbol] ?? 0n) > 0n);
  const borrowed = assets.filter(a => (user?.debts[a.symbol] ?? 0n) > 0n);

  return (
    <PageShell
      eyebrow="Your command deck"
      title={<>Position <span className="grad-text">overview.</span></>}
      sub="Collateral, debt and health factor in one place — refreshed straight from the LendingPool."
      wide
    >
      {!isConnected ? (
        <div className="card card-aurora" style={{ padding: 60 }}>
          <EmptyState
            icon="◈"
            title="Connect your wallet"
            sub="Connect to Sepolia to see your collateral, debt and health factor."
            action={<ConnectButton />}
          />
        </div>
      ) : (
        <>
          {/* top strip: gauge + stats */}
          <div className="split" style={{ marginBottom: 26 }}>
            <div className="grid-2">
              <Stat label="Total collateral" loading={isLoading}
                value={<CountUp value={user?.totalCollateralUsd ?? 0} prefix="$" />}
                sub="Across all supplied assets" />
              <Stat label="Total debt" loading={isLoading}
                value={<CountUp value={user?.totalDebtUsd ?? 0} prefix="$" />}
                sub="Variable + stable positions" />
              <Stat label="Borrow capacity left" loading={isLoading} accent="var(--azure)"
                value={<CountUp value={user?.availableBorrowUsd ?? 0} prefix="$" />}
                sub="Before hitting your LTV limit" />
              <Stat label="Net worth in protocol" loading={isLoading} accent="var(--mint)"
                value={<CountUp value={(user?.totalCollateralUsd ?? 0) - (user?.totalDebtUsd ?? 0)} prefix="$" />}
                sub="Collateral minus debt" />
            </div>

            <div className="card card-aurora card-sheen" style={{ textAlign: "center", padding: "30px 24px" }}>
              <div className="stat-label" style={{ marginBottom: 16 }}>Health factor</div>
              <HealthGauge hf={hf} />
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 18, marginBottom: 0 }}>
                {hf === null
                  ? "No active debt — your position cannot be liquidated."
                  : hf < 1.1
                    ? "Danger: below 1.0 your collateral becomes liquidatable."
                    : "Liquidation begins if this falls below 1.00."}
              </p>
            </div>
          </div>

          {/* supplied */}
          <Reveal>
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 17 }}>◈ Your supplies</h3>
                <Link href="/markets" className="btn btn-ghost btn-sm">Supply more</Link>
              </div>
              {supplied.length === 0 ? (
                <EmptyState title="Nothing supplied yet" sub="Supply an asset to start earning yield and unlock borrowing power."
                  action={<Link href="/markets" className="btn btn-primary btn-sm">Browse markets</Link>} />
              ) : (
                <div className="table-wrap">
                  <table className="lf">
                    <thead><tr><th>Asset</th><th>Balance</th><th>Value</th><th>APY</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                    <tbody>
                      {supplied.map(a => {
                        const raw = user!.deposits[a.symbol];
                        const amt = Number(formatUnits(raw, a.decimals));
                        return (
                          <tr key={a.symbol}>
                            <td><span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><TokenIcon symbol={a.symbol} size={30} /><b style={{ fontFamily: "var(--font-display)" }}>{a.symbol}</b></span></td>
                            <td className="num">{amt.toLocaleString("en-US", { maximumFractionDigits: 5 })}</td>
                            <td className="num">${(amt * a.priceUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                            <td className="num" style={{ color: "var(--mint)" }}>{a.supplyApy.toFixed(2)}%</td>
                            <td style={{ textAlign: "right" }}>
                              <span style={{ display: "inline-flex", gap: 8 }}>
                                <button className="btn btn-primary btn-sm" onClick={() => setModal({ asset: a, action: "supply" })}>Supply</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ asset: a, action: "withdraw" })}>Withdraw</button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Reveal>

          {/* borrowed */}
          <Reveal delay={80}>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 17 }}>◇ Your borrows</h3>
                <Link href="/markets" className="btn btn-ghost btn-sm">Borrow</Link>
              </div>
              {borrowed.length === 0 ? (
                <EmptyState title="No debt" sub="You haven't borrowed anything. Your health factor is infinite." />
              ) : (
                <div className="table-wrap">
                  <table className="lf">
                    <thead><tr><th>Asset</th><th>Debt</th><th>Value</th><th>APY</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
                    <tbody>
                      {borrowed.map(a => {
                        const raw = user!.debts[a.symbol];
                        const amt = Number(formatUnits(raw, a.decimals));
                        return (
                          <tr key={a.symbol}>
                            <td><span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><TokenIcon symbol={a.symbol} size={30} /><b style={{ fontFamily: "var(--font-display)" }}>{a.symbol}</b></span></td>
                            <td className="num">{amt.toLocaleString("en-US", { maximumFractionDigits: 5 })}</td>
                            <td className="num">${(amt * a.priceUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                            <td className="num" style={{ color: "var(--violet)" }}>{a.borrowApy.toFixed(2)}%</td>
                            <td style={{ textAlign: "right" }}>
                              <span style={{ display: "inline-flex", gap: 8 }}>
                                <button className="btn btn-primary btn-sm" onClick={() => setModal({ asset: a, action: "repay" })}>Repay</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ asset: a, action: "borrow" })}>Borrow more</button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Reveal>
        </>
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
