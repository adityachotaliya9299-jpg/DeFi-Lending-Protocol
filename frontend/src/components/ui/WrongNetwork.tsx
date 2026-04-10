"use client";

import { useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

export function WrongNetworkBanner() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (chainId === sepolia.id || chainId === 31337) return null; // 31337 = local hardhat

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9998,
      background: "linear-gradient(90deg, #ef4444, #dc2626)",
      padding: "10px 20px",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
      boxShadow: "0 2px 20px rgba(239,68,68,0.4)",
    }}>
      <span style={{ fontSize: 16 }}>⚠</span>
      <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "#fff" }}>
        Wrong network — LendFi is deployed on Sepolia testnet
      </p>
      <button
        onClick={() => switchChain({ chainId: sepolia.id })}
        disabled={isPending}
        style={{
          background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 8, padding: "5px 14px", color: "#fff", cursor: "pointer",
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12,
          backdropFilter: "blur(8px)",
        }}>
        {isPending ? "Switching…" : "Switch to Sepolia"}
      </button>
    </div>
  );
}

export function useIsCorrectNetwork() {
  const chainId = useChainId();
  return chainId === sepolia.id || chainId === 31337;
}