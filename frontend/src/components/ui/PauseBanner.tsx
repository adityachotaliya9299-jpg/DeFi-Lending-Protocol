"use client";

import { useChainId, useAccount, useReadContract } from "wagmi";
import { LENDING_POOL_ABI, LENDING_POOL_EXTENDED_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { useTx } from "@/hooks/useTx";

export function PauseBanner() {
  const chainId = useChainId();
  const { address } = useAccount();

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  const { data: isPaused } = useReadContract({
    address: poolAddr, abi: LENDING_POOL_EXTENDED_ABI,
    functionName: "paused",
    query: { refetchInterval: 10_000, enabled: poolAddr !== "0x0" },
  });

  const { data: guardianRole } = useReadContract({
    address: poolAddr, abi: LENDING_POOL_EXTENDED_ABI,
    functionName: "GUARDIAN_ROLE",
    query: { enabled: poolAddr !== "0x0" },
  });

  const { data: isGuardian } = useReadContract({
    address: poolAddr, abi: LENDING_POOL_EXTENDED_ABI,
    functionName: "hasRole",
    args: guardianRole && address ? [guardianRole as `0x${string}`, address] : undefined,
    query: { enabled: !!guardianRole && !!address },
  });

  const unpauseTx = useTx("Unpause Protocol");
  const pauseTx   = useTx("Pause Protocol");

  if (!isPaused && !isGuardian) return null;

  return (
    <>
      {/* PAUSED — shown to everyone */}
      {isPaused && (
        <div style={{
          background: "linear-gradient(90deg, rgba(239,68,68,0.12), rgba(239,68,68,0.08))",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 14, padding: "14px 20px", margin: "0 0 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(239,68,68,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🛑</div>
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "#f87171", marginBottom: 2 }}>
                Protocol Paused
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                New deposits and borrows are suspended. Withdrawals and repayments are still available.
              </p>
            </div>
          </div>
          {isGuardian && (
            <button onClick={() => unpauseTx.write({ address: poolAddr, abi: LENDING_POOL_EXTENDED_ABI, functionName: "unpause", args: [] })}
              disabled={unpauseTx.isPending}
              style={{ background: "#34d399", color: "#030712", border: "none", borderRadius: 10,
                padding: "9px 18px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
                cursor: "pointer", flexShrink: 0 }}>
              {unpauseTx.isPending ? "Unpausing…" : "Unpause Protocol"}
            </button>
          )}
        </div>
      )}

      {/* GUARDIAN CONTROLS — only shown to guardian when NOT paused */}
      {!isPaused && isGuardian && (
        <div style={{
          background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: 14, padding: "12px 18px", margin: "0 0 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#fbbf24" }}>
              You have GUARDIAN_ROLE — emergency pause available
            </p>
          </div>
          <button onClick={() => pauseTx.write({ address: poolAddr, abi: LENDING_POOL_EXTENDED_ABI, functionName: "pause", args: [] })}
            disabled={pauseTx.isPending}
            style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8, padding: "7px 14px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12,
              cursor: "pointer", flexShrink: 0 }}>
            {pauseTx.isPending ? "Pausing…" : "Emergency Pause"}
          </button>
        </div>
      )}
    </>
  );
}   