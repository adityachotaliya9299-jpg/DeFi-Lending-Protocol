"use client";

import { useAccount, useChainId, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Reveal, EmptyState } from "@/components/ui/kit";
import { LENDING_POOL_EXTENDED_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { useTx } from "@/hooks/useTx";

const CATEGORIES = [
  {
    id: 0, name: "Standard", accent: "var(--text-secondary)",
    desc: "Default risk parameters apply per asset. Full freedom across all collateral.",
    ltv: "70–85%", threshold: "75–88%",
  },
  {
    id: 1, name: "Stablecoin E-Mode", accent: "var(--mint)",
    desc: "Correlated stable assets unlock a much higher LTV — capital efficiency for stable-on-stable strategies.",
    ltv: "up to 97%", threshold: "98%",
  },
  {
    id: 2, name: "ETH-correlated", accent: "var(--azure)",
    desc: "ETH and liquid-staking derivatives share price beta, allowing tighter parameters.",
    ltv: "up to 93%", threshold: "95%",
  },
];

export default function ModesPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const pool = getAddresses(chainId).LENDING_POOL;

  const { data: currentMode, refetch } = useReadContract({
    address: pool,
    abi: LENDING_POOL_EXTENDED_ABI,
    functionName: "userEModeCategory",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const tx = useTx("Set E-Mode");
  if (tx.isSuccess) refetch();

  const active = Number(currentMode ?? 0);

  return (
    <PageShell
      eyebrow="Efficiency mode"
      title={<>Unlock <span className="grad-text">capital efficiency.</span></>}
      sub="E-Mode raises your borrowing power when collateral and debt belong to the same price-correlated category."
    >
      {!isConnected ? (
        <div className="card card-aurora" style={{ padding: 60 }}>
          <EmptyState icon="⚡" title="Connect to select an E-Mode" action={<ConnectButton />} />
        </div>
      ) : (
        <div className="grid-3">
          {CATEGORIES.map((c, i) => {
            const isActive = active === c.id;
            return (
              <Reveal key={c.id} delay={i * 70}>
                <div className={`card card-sheen hoverable ${isActive ? "card-aurora" : ""}`}
                  style={{ height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{
                      width: 44, height: 44, borderRadius: 13,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-display)", fontWeight: 800,
                      background: "var(--aurora-soft)", border: "1px solid var(--border-strong)",
                      color: c.accent,
                    }}>{c.id}</span>
                    {isActive && <span className="chip chip-mint">ACTIVE</span>}
                  </div>
                  <h3 style={{ fontSize: 18 }}>{c.name}</h3>
                  <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7, flex: 1 }}>{c.desc}</p>
                  <div>
                    <div className="inforow"><span>Max LTV</span><b style={{ color: c.accent }}>{c.ltv}</b></div>
                    <div className="inforow"><span>Liq. threshold</span><b>{c.threshold}</b></div>
                  </div>
                  <button
                    className={`btn btn-block ${isActive ? "btn-ghost" : "btn-primary"}`}
                    disabled={isActive || tx.isPending}
                    onClick={() => tx.write({
                      address: pool, abi: LENDING_POOL_EXTENDED_ABI,
                      functionName: "setUserEMode", args: [c.id],
                    })}>
                    {isActive ? "Current mode" : tx.isPending ? "Confirming…" : `Switch to ${c.name}`}
                  </button>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      <Reveal delay={200}>
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>⚠ Switching rules</h3>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.8 }}>
            You can only enter an E-Mode category if all your current debt belongs to that category,
            and only exit if your health factor stays above 1.0 under standard parameters afterwards.
            The audit&apos;s H-03 finding (RAY/WAD mismatch in the E-Mode health check) is fixed and
            regression-tested.
          </p>
        </div>
      </Reveal>
    </PageShell>
  );
}
