"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const VAULT_ABI = [
  { name: "depositAndMint",     type: "function", inputs: [{ name: "collateral", type: "address" }, { name: "collateralAmount", type: "uint256" }, { name: "pUSDAmount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { name: "mintPUSD",           type: "function", inputs: [{ name: "collateral", type: "address" }, { name: "pUSDAmount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { name: "burnPUSD",           type: "function", inputs: [{ name: "collateral", type: "address" }, { name: "pUSDAmount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { name: "withdrawCollateral", type: "function", inputs: [{ name: "collateral", type: "address" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
] as const;

const ERC20_ABI = [
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
] as const;

const WETH = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81" as `0x${string}`;
const VAULT_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const WETH_PRICE = 2000;

function getRatioState(ratio: number) {
  if (ratio === 0)    return { color: "var(--text-muted)", label: "—",            glow: "transparent" };
  if (ratio >= 200)   return { color: "#34d399",           label: "Safe",          glow: "rgba(52,211,153,0.15)" };
  if (ratio >= 150)   return { color: "var(--cyan)",       label: "Healthy",       glow: "rgba(34,211,238,0.12)" };
  if (ratio >= 130)   return { color: "#f59e0b",           label: "At Risk",       glow: "rgba(245,158,11,0.15)" };
  return               { color: "#ef4444",                 label: "Liquidatable",  glow: "rgba(239,68,68,0.15)" };
}

function InputBox({ label, value, onChange, token, max, onMax }: {
  label: string; value: string; onChange: (v: string) => void;
  token: string; max?: string; onMax?: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
        {max && onMax && (
          <button onClick={onMax} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)", background: "none", border: "none", cursor: "pointer" }}>
            MAX: {max}
          </button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", gap: 10 }}
        className="input-focus-border">
        <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="0.00"
          style={{ flex: 1, background: "transparent", border: "none", outline: "none",
            fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color: "var(--text-primary)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)",
          background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "4px 10px", flexShrink: 0 }}>{token}</span>
      </div>
    </div>
  );
}

export default function VaultPage() {
  useScrollAnimation();
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<"open"|"manage"|"close">("open");
  const [collAmt, setCollAmt] = useState("");
  const [mintAmt, setMintAmt] = useState("");
  const [burnAmt, setBurnAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: pending } = useWaitForTransactionReceipt({ hash: txHash });

  // Live ratio calculation
  const collNum  = parseFloat(collAmt  || "0");
  const mintNum  = parseFloat(mintAmt  || "0");
  const collUsd  = collNum * WETH_PRICE;
  const previewRatio = mintNum > 0 ? Math.round((collUsd / mintNum) * 100) : 0;
  const ratioState = getRatioState(previewRatio);

  // Mock position (replace with actual contract reads)
  const MOCK_COLL = 1.5;
  const MOCK_DEBT = 1500;
  const MOCK_RATIO = Math.round((MOCK_COLL * WETH_PRICE / MOCK_DEBT) * 100);
  const posState = getRatioState(MOCK_RATIO);

  const TABS = [
    { id: "open"   as const, label: "Open Vault",  color: "var(--cyan)"  },
    { id: "manage" as const, label: "Manage",      color: "#a78bfa"      },
    { id: "close"  as const, label: "Close",       color: "#f59e0b"      },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Header */}
      <div className="reveal mb-10">
        <p className="section-label mb-1">pUSD Stablecoin</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(1.6rem,3vw,2.1rem)", color: "var(--text-primary)", marginBottom: 6 }}>
              Collateralised Debt Positions
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 520, lineHeight: 1.7 }}>
              Deposit WETH, mint <strong style={{ color: "var(--cyan)" }}>pUSD</strong> stablecoins. MakerDAO-inspired CDP system
              with 150% min collateralisation, 2% annual stability fee, and 10% liquidation bonus.
            </p>
          </div>
          {!isConnected && <ConnectButton />}
        </div>
      </div>

      {/* Key params */}
      <div className="reveal reveal-delay-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 32 }}>
        {[
          { label: "Min Ratio",    value: "150%",   color: "var(--cyan)", sub: "Minting floor"         },
          { label: "Liq Ratio",    value: "130%",   color: "#ef4444",     sub: "Liquidation trigger"   },
          { label: "Liq Bonus",    value: "10%",    color: "#34d399",     sub: "Liquidator reward"     },
          { label: "Stability Fee", value: "2% APR", color: "#a78bfa",    sub: "Annual interest on debt" },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color, marginBottom: 4 }}>{value}</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 24, alignItems: "start" }}>

        {/* Left — position + action */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Existing position */}
          <div className="reveal" style={{ background: "var(--bg-card)", border: `1px solid ${posState.color}35`, borderRadius: 18,
            boxShadow: `0 0 24px ${posState.glow}`, overflow: "hidden" }}>
            <div style={{ height: 3, background: `linear-gradient(90deg, ${posState.color}, transparent)` }} />
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>Your Vault</p>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: posState.color,
                  background: `${posState.color}15`, border: `1px solid ${posState.color}30`,
                  borderRadius: 20, padding: "3px 10px" }}>{posState.label}</span>
              </div>

              {/* Big ratio display */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 52, fontWeight: 500, color: posState.color, lineHeight: 1 }}>
                  {MOCK_RATIO}%
                </p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Collateralisation ratio</p>
              </div>

              {/* Ratio bar */}
              <div style={{ position: "relative", height: 10, background: "rgba(0,0,0,0.3)", borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ position: "absolute", left: `${(130/300)*100}%`, top: 0, width: 2, height: "100%", background: "rgba(239,68,68,0.5)" }} />
                <div style={{ position: "absolute", left: `${(150/300)*100}%`, top: 0, width: 2, height: "100%", background: "rgba(245,158,11,0.5)" }} />
                <div style={{ width: `${Math.min(MOCK_RATIO/300*100, 100)}%`, height: "100%",
                  background: `linear-gradient(90deg, #ef4444 0%, #f59e0b 30%, ${posState.color} 100%)`, borderRadius: 5 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#ef4444" }}>Liq 130%</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#f59e0b" }}>Min 150%</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#34d399" }}>Safe 200%+</span>
              </div>

              {/* Position stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10, marginTop: 20 }}>
                {[
                  { label: "Collateral",   value: `${MOCK_COLL} WETH`,            color: "var(--cyan)"  },
                  { label: "Debt (pUSD)",  value: `${MOCK_DEBT.toLocaleString()}`, color: "#f87171"      },
                  { label: "Coll. Value",  value: `$${(MOCK_COLL*WETH_PRICE).toLocaleString()}`, color: "var(--text-primary)" },
                  { label: "Stability Fee", value: "~$30 / yr",                   color: "var(--text-muted)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{label}</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500, color }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action panel — tabs */}
          <div className="reveal reveal-delay-1" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden" }}>
            {/* Tab row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid var(--border)" }}>
              {TABS.map(({ id, label, color: c }) => (
                <button key={id} onClick={() => setTab(id)}
                  style={{ padding: "16px 8px", border: "none", background: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontWeight: tab === id ? 700 : 500, fontSize: 13,
                    color: tab === id ? c : "var(--text-muted)",
                    borderBottom: tab === id ? `2px solid ${c}` : "2px solid transparent",
                    transition: "all 0.15s" }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding: 24 }}>
              {/* OPEN */}
              {tab === "open" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <InputBox label="WETH to deposit" value={collAmt} onChange={setCollAmt} token="WETH" />
                  <InputBox label="pUSD to mint"    value={mintAmt} onChange={setMintAmt} token="pUSD" />
                  {collNum > 0 && mintNum > 0 && (
                    <div style={{ background: `${ratioState.color}10`, border: `1px solid ${ratioState.color}30`, borderRadius: 12, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Preview ratio</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500, color: ratioState.color }}>
                          {previewRatio}%
                        </span>
                      </div>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: previewRatio >= 150 ? "#34d399" : "#ef4444", marginTop: 4 }}>
                        {previewRatio >= 150 ? "✓ Above 150% minimum" : "✗ Below 150% minimum — reduce mint amount"}
                      </p>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => {}} disabled={pending || !collAmt || !isConnected}
                      style={{ flex: 1, borderRadius: 12, padding: "13px 0", border: "none", cursor: "pointer",
                        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
                        background: "#f59e0b", color: "#030712", opacity: !collAmt ? 0.5 : 1 }}>
                      Approve WETH
                    </button>
                    <button disabled={pending || !collAmt || !mintAmt || !isConnected || previewRatio < 150}
                      style={{ flex: 1, borderRadius: 12, padding: "13px 0", border: "none", cursor: "pointer",
                        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
                        background: "var(--cyan)", color: "#030712",
                        opacity: (!collAmt || !mintAmt || previewRatio < 150) ? 0.5 : 1 }}>
                      {pending ? "Opening…" : "Open Vault →"}
                    </button>
                  </div>
                </div>
              )}

              {/* MANAGE */}
              {tab === "manage" && (
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 16 }}>Mint more pUSD</p>
                  <InputBox label="Amount to mint" value={mintAmt} onChange={setMintAmt} token="pUSD" />
                  <button style={{ width: "100%", borderRadius: 12, padding: "13px 0", border: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, background: "#a78bfa", color: "#030712",
                    marginTop: 12, opacity: !mintAmt ? 0.5 : 1 }}>Mint pUSD</button>

                  <div style={{ height: 1, background: "var(--border)", margin: "24px 0" }} />

                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 16 }}>
                    Repay pUSD
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>
                      Debt: {MOCK_DEBT.toLocaleString()} pUSD
                    </span>
                  </p>
                  <InputBox label="Amount to repay" value={burnAmt} onChange={setBurnAmt} token="pUSD"
                    max={String(MOCK_DEBT)} onMax={() => setBurnAmt(String(MOCK_DEBT))} />
                  <button style={{ width: "100%", borderRadius: 12, padding: "13px 0", border: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, background: "#34d399", color: "#030712",
                    marginTop: 12, opacity: !burnAmt ? 0.5 : 1 }}>
                    {pending ? "Repaying…" : "Repay pUSD"}
                  </button>
                </div>
              )}

              {/* CLOSE */}
              {tab === "close" && (
                <div>
                  <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: 14, marginBottom: 20 }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#f59e0b", marginBottom: 4 }}>⚠ Repay debt first</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                      Burn all pUSD before withdrawing, or maintain 150% ratio after withdrawal.
                    </p>
                  </div>
                  <InputBox label="WETH to withdraw" value={withdrawAmt} onChange={setWithdrawAmt} token="WETH"
                    max={String(MOCK_COLL)} onMax={() => setWithdrawAmt(String(MOCK_COLL))} />
                  <button style={{ width: "100%", borderRadius: 12, padding: "13px 0", border: "none", cursor: "pointer",
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, background: "#f59e0b", color: "#030712",
                    marginTop: 12, opacity: !withdrawAmt ? 0.5 : 1 }}>
                    {pending ? "Withdrawing…" : "Withdraw WETH"}
                  </button>
                </div>
              )}

              {txHash && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 14 }}>
                  Tx: {txHash.slice(0,10)}…{txHash.slice(-8)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right — info panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 88 }}>

          {/* How CDPs work */}
          <div className="reveal" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 16 }}>How CDPs work</p>
            {[
              { n: "1", text: "Deposit WETH collateral into your vault" },
              { n: "2", text: "Mint pUSD up to 66% of collateral value (150% ratio)" },
              { n: "3", text: "Use pUSD — swap, lend, provide liquidity" },
              { n: "4", text: "Burn pUSD + stability fee to recover collateral" },
            ].map(({ n, text }) => (
              <div key={n} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(34,211,238,0.12)",
                  border: "1px solid rgba(34,211,238,0.25)", display: "flex", alignItems: "center",
                  justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)" }}>{n}</span>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6, paddingTop: 2 }}>{text}</p>
              </div>
            ))}
          </div>

          {/* MakerDAO comparison */}
          <div className="reveal reveal-delay-1" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 16 }}>
              MakerDAO comparison
            </p>
            {[
              ["Ilk",    "CollateralConfig"],
              ["Urn",    "Vault struct"    ],
              ["Jug",    "Stability fee"   ],
              ["Cat",    "liquidate()"     ],
              ["Vow",    "ProtocolTreasury"],
              ["DAI",    "pUSD (ERC-20)"  ],
            ].map(([maker, ours]) => (
              <div key={maker} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0",
                borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#a78bfa" }}>{maker}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cyan)" }}>{ours}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}