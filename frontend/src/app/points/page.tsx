"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Reveal, EmptyState, CountUp, TokenIcon } from "@/components/ui/kit";
import { POINTS_ABI } from "@/constants/abisExtended";
import { EXT_ADDRESSES } from "@/constants/addresses";
import { useProtocolData } from "@/hooks/useProtocolData";
import { useTx } from "@/hooks/useTx";

const POINTS = EXT_ADDRESSES.POINTS_ACCOUNTING;

export default function PointsPage() {
  const { address, isConnected } = useAccount();
  const { assets } = useProtocolData();

  const { data: totalPoints, refetch } = useReadContract({
    address: POINTS, abi: POINTS_ABI, functionName: "getUserPoints",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  // pending points per asset per mode (1 = deposit, 2 = borrow)
  const { data: pending } = useReadContracts({
    contracts: address
      ? assets.flatMap(a => ([1n, 2n] as const).map(mode => ({
          address: POINTS,
          abi: POINTS_ABI,
          functionName: "getPendingPoints" as const,
          args: [address, a.address, mode] as const,
        })))
      : [],
    query: { enabled: !!address && assets.length > 0, refetchInterval: 15_000 },
  });

  const accrueTx = useTx("Accrue points");
  if (accrueTx.isSuccess) refetch();

  const rows = assets.map((a, i) => ({
    asset: a,
    supplyPending: (pending?.[i * 2]?.result as bigint) ?? 0n,
    borrowPending: (pending?.[i * 2 + 1]?.result as bigint) ?? 0n,
  }));
  const totalPending = rows.reduce((s, r) => s + Number(r.supplyPending) + Number(r.borrowPending), 0) / 1e18;
  const points = totalPoints !== undefined ? Number(totalPoints) / 1e18 : 0;

  return (
    <PageShell
      eyebrow="Points program · Phase 3"
      title={<>Activity becomes <span className="grad-text">signal.</span></>}
      sub="Every second of supplying and borrowing accrues points on-chain — redeemable through governance decisions, not promises."
    >
      {!isConnected ? (
        <div className="card card-aurora" style={{ padding: 60 }}>
          <EmptyState icon="❖" title="Connect to see your points" action={<ConnectButton />} />
        </div>
      ) : (
        <>
          <div className="split" style={{ marginBottom: 24 }}>
            <Reveal>
              <div className="card card-aurora card-sheen" style={{ textAlign: "center", padding: "44px 24px", overflow: "hidden" }}>
                <div className="stat-label">Your realised points</div>
                <div className="stat-value aurora-live" style={{ fontSize: "clamp(48px, 8vw, 84px)", margin: "14px 0 4px" }}>
                  <CountUp value={points} decimals={2} />
                </div>
                <div className="stat-sub">+{totalPending.toFixed(4)} pending accrual</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
                  <span className="chip chip-gold">1 pt / $1 supplied / day</span>
                  <span className="chip chip-violet">2 pts / $1 borrowed / day</span>
                </div>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div className="card card-sheen">
                <h3 style={{ fontSize: 16, marginBottom: 14 }}>How points work</h3>
                {[
                  ["Accrue", "Balances are checkpointed on every pool interaction; time × balance × rate = points."],
                  ["Claim", "Anyone can call accruePoints to checkpoint a user — no keeper needed."],
                  ["Redeem", "Governance controls redemption — points are protocol-native reputation."],
                ].map(([t, d], i) => (
                  <div key={t} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                    <span style={{
                      width: 30, height: 30, flexShrink: 0, borderRadius: 9,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: "var(--aurora-soft)", border: "1px solid var(--border-strong)",
                      color: "var(--gold)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 12,
                    }}>{i + 1}</span>
                    <div>
                      <b style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{t}</b>
                      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "3px 0 0" }}>{d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 17 }}>Pending accrual by position</h3>
              </div>
              <div className="table-wrap">
                <table className="lf">
                  <thead><tr><th>Asset</th><th>Supply-side pending</th><th>Borrow-side pending</th><th style={{ textAlign: "right" }}>Checkpoint</th></tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.asset.symbol}>
                        <td><span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><TokenIcon symbol={r.asset.symbol} size={28} /><b style={{ fontFamily: "var(--font-display)" }}>{r.asset.symbol}</b></span></td>
                        <td className="num" style={{ color: "var(--mint)" }}>+{(Number(r.supplyPending) / 1e18).toFixed(6)}</td>
                        <td className="num" style={{ color: "var(--violet)" }}>+{(Number(r.borrowPending) / 1e18).toFixed(6)}</td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn btn-ghost btn-sm" disabled={accrueTx.isPending || !address}
                            onClick={() => accrueTx.write({
                              address: POINTS, abi: POINTS_ABI, functionName: "accruePoints",
                              args: [address!, r.asset.address, 1n],
                            })}>
                            Accrue
                          </button>
                        </td>
                      </tr>
                    ))}
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
