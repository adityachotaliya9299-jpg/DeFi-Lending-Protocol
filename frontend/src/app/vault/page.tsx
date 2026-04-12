"use client";

import { useState, useMemo } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// --- ABIs & Constants ---
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

// --- Helpers ---
function getRatioInfo(ratio: number) {
  if (ratio === 0)    return { color: "var(--text-muted)", label: "No Debt" };
  if (ratio >= 200)   return { color: "#10b981", label: "Safe" };
  if (ratio >= 150)   return { color: "var(--cyan)", label: "Healthy" };
  if (ratio >= 130)   return { color: "#f59e0b", label: "At Risk" };
  return               { color: "#ef4444", label: "Liquidatable" };
}

// --- Components ---
function ArcGauge({ ratio }: { ratio: number }) {
  const info = getRatioInfo(ratio);
  const radius = 80;
  const circumference = Math.PI * radius; // Half circle
  const cappedRatio = Math.min(Math.max(ratio, 0), 300); // Map 0-300%
  const strokeDashoffset = circumference - (cappedRatio / 300) * circumference;

  return (
    <div className="gauge-container">
      <svg width="200" height="110" viewBox="0 0 200 110">
        {/* Background Arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--border)" strokeWidth="12" strokeLinecap="round" />
        {/* Progress Arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={info.color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={ratio === 0 ? circumference : strokeDashoffset}
          style={{ transition: "stroke-dashoffset 1s ease-in-out, stroke 0.3s ease" }} />
      </svg>
      <div className="gauge-content">
        <span className="gauge-value" style={{ color: info.color }}>{ratio}%</span>
        <span className="gauge-label">{info.label}</span>
      </div>
    </div>
  );
}

function ModernInput({ label, value, onChange, symbol, max, onMax }: { 
  label: string; 
  value: string; 
  onChange: (v:string)=>void; 
  symbol: string; 
  max?: string; // <-- Added this missing type definition
  onMax?: ()=>void 
}) {
  return (
    <div className="input-group">
      <div className="input-header">
        <label>{label}</label>
        {onMax && (
          <button onClick={onMax} className="max-btn">
            MAX {max ? `${max}` : ""}
          </button>
        )}
      </div>
      <div className="input-box">
        <input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="0.00" />
        <span className="input-symbol">{symbol}</span>
      </div>
    </div>
  );
}

// --- Main Page ---
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

  // Calculations
  const collNum  = parseFloat(collAmt  || "0");
  const mintNum  = parseFloat(mintAmt  || "0");
  const collUsd  = collNum * WETH_PRICE;
  const previewRatio = mintNum > 0 ? Math.round((collUsd / mintNum) * 100) : 0;
  
  // Mock Data
  const MOCK_COLL = 1.5;
  const MOCK_DEBT = 1500;
  const MOCK_RATIO = Math.round((MOCK_COLL * WETH_PRICE / MOCK_DEBT) * 100);

  return (
    <>
      <style>{`
        /* --- Fully Responsive, Theme-Aware CSS --- */
        .vault-layout {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 24px;
          align-items: start;
        }

        .card-surface {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.05);
        }

        /* Gauge */
        .gauge-container { position: relative; width: 200px; height: 110px; margin: 0 auto; }
        .gauge-content { position: absolute; bottom: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
        .gauge-value { font-family: var(--font-display); font-size: 40px; font-weight: 800; line-height: 1; }
        .gauge-label { font-family: var(--font-mono); font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-top: 4px; }

        /* Metrics Grid */
        .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 32px; }
        .metric-box { background: var(--bg-base); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
        .metric-title { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
        .metric-val { font-family: var(--font-mono); font-size: 20px; font-weight: 600; color: var(--text-primary); }

        /* Tabs */
        .pill-tabs { display: flex; background: var(--bg-base); border-radius: 14px; padding: 6px; border: 1px solid var(--border); margin-bottom: 24px; }
        .pill-btn { flex: 1; padding: 10px; border-radius: 10px; border: none; background: transparent; color: var(--text-muted); font-family: var(--font-display); font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.2s; }
        .pill-btn.active { background: var(--bg-card); color: var(--text-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.1); border: 1px solid var(--border); }

        /* Inputs */
        .input-group { margin-bottom: 20px; }
        .input-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .input-header label { font-family: var(--font-display); font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .max-btn { background: none; border: none; color: var(--cyan); font-family: var(--font-mono); font-size: 11px; font-weight: 600; cursor: pointer; }
        .input-box { display: flex; align-items: center; background: var(--bg-base); border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; transition: border-color 0.2s; }
        .input-box:focus-within { border-color: var(--cyan); }
        .input-box input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary); font-family: var(--font-mono); font-size: 20px; font-weight: 500; }
        .input-symbol { background: var(--bg-card); border: 1px solid var(--border); padding: 4px 10px; border-radius: 8px; font-family: var(--font-mono); font-size: 13px; color: var(--text-secondary); }

        /* Buttons */
        .action-btn { width: 100%; padding: 16px; border-radius: 14px; border: none; font-family: var(--font-display); font-weight: 700; font-size: 15px; cursor: pointer; transition: 0.2s; }
        .btn-primary { background: var(--text-primary); color: var(--bg-base); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-danger { background: #ef4444; color: #fff; }
        .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Receipt */
        .receipt-box { background: var(--bg-base); border: 1px dashed var(--border); border-radius: 14px; padding: 16px; margin-bottom: 20px; }
        .receipt-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .receipt-row:last-child { margin-bottom: 0; }
        .receipt-label { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
        .receipt-val { font-family: var(--font-mono); font-size: 13px; font-weight: 600; color: var(--text-primary); }

        /* Mobile Breakpoints */
        @media (max-width: 900px) {
          .vault-layout { grid-template-columns: 1fr; }
          .metrics-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 md:px-6 py-12">
        
        {/* Header Section */}
        <div className="reveal flex flex-col md:flex-row justify-between md:items-center gap-6 mb-12">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(2rem, 4vw, 2.8rem)", color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}>
              CDP Vault
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 16, maxWidth: 500 }}>
              Mint decentralized <span style={{ color: "var(--cyan)", fontWeight: 600 }}>pUSD</span> by locking WETH. Ensure your collateral ratio stays above 150% to avoid liquidation.
            </p>
          </div>
          {!isConnected && <ConnectButton />}
        </div>

        {/* Main Interface */}
        <div className="vault-layout">
          
          {/* Left: Visualization & Data */}
          <div className="reveal card-surface flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-8">
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Position Health</h3>
                <span style={{ fontSize: 13, color: "var(--text-muted)", background: "var(--bg-base)", padding: "4px 12px", borderRadius: 100, border: "1px solid var(--border)" }}>
                  ID: #1042
                </span>
              </div>
              
              <ArcGauge ratio={MOCK_RATIO} />
            </div>

            <div className="metrics-grid">
              <div className="metric-box">
                <div className="metric-title">Locked WETH</div>
                <div className="metric-val">{MOCK_COLL}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>≈ ${(MOCK_COLL * WETH_PRICE).toLocaleString()}</div>
              </div>
              <div className="metric-box">
                <div className="metric-title">Minted pUSD</div>
                <div className="metric-val" style={{ color: "#ef4444" }}>{MOCK_DEBT.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Debt Balance</div>
              </div>
              <div className="metric-box">
                <div className="metric-title">Liquidation Price</div>
                <div className="metric-val">${Math.round((MOCK_DEBT * 1.3) / MOCK_COLL).toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>WETH Floor</div>
              </div>
              <div className="metric-box">
                <div className="metric-title">Stability Fee</div>
                <div className="metric-val">2.0%</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Annual APR</div>
              </div>
            </div>
          </div>

          {/* Right: Controller */}
          <div className="reveal reveal-delay-1 card-surface">
            
            {/* Custom Segmented Control */}
            <div className="pill-tabs">
              {(["open", "manage", "close"] as const).map((id) => (
                <button key={id} onClick={() => setTab(id)} className={`pill-btn ${tab === id ? 'active' : ''}`}>
                  {id.charAt(0).toUpperCase() + id.slice(1)}
                </button>
              ))}
            </div>

            {/* TAB: OPEN */}
            {tab === "open" && (
              <div className="flex flex-col h-full">
                <ModernInput label="Deposit Collateral" value={collAmt} onChange={setCollAmt} symbol="WETH" />
                <ModernInput label="Borrow Debt" value={mintAmt} onChange={setMintAmt} symbol="pUSD" />
                
                {collNum > 0 && mintNum > 0 && (
                  <div className="receipt-box">
                    <div className="receipt-row">
                      <span className="receipt-label">Expected Ratio</span>
                      <span className="receipt-val" style={{ color: previewRatio >= 150 ? "var(--cyan)" : "#ef4444" }}>{previewRatio}%</span>
                    </div>
                    <div className="receipt-row">
                      <span className="receipt-label">Status</span>
                      <span className="receipt-val">{previewRatio >= 150 ? "Valid Operation" : "Invalid (Below 150%)"}</span>
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4 flex gap-3">
                  <button className="action-btn" disabled={pending || !collAmt || !isConnected} style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                    Approve
                  </button>
                  <button className="action-btn btn-primary" disabled={pending || !collAmt || !mintAmt || !isConnected || previewRatio < 150}>
                    {pending ? "Processing..." : "Open Vault"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: MANAGE */}
            {tab === "manage" && (
              <div className="flex flex-col h-full space-y-6">
                <div>
                  <ModernInput label="Mint Additional" value={mintAmt} onChange={setMintAmt} symbol="pUSD" />
                  <button className="action-btn btn-primary" disabled={!mintAmt}>Mint</button>
                </div>
                
                <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

                <div>
                  <ModernInput label="Repay Debt" value={burnAmt} onChange={setBurnAmt} symbol="pUSD" max={String(MOCK_DEBT)} onMax={() => setBurnAmt(String(MOCK_DEBT))} />
                  <button className="action-btn" disabled={pending || !burnAmt} style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)", marginTop: "16px" }}>
                    {pending ? "Processing..." : "Repay"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: CLOSE */}
            {tab === "close" && (
              <div className="flex flex-col h-full space-y-6">
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 16 }}>
                  <h4 style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>Clear Debt First</h4>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>You must completely repay your pUSD balance to safely unlock and withdraw all WETH collateral.</p>
                </div>

                <ModernInput label="Withdraw Collateral" value={withdrawAmt} onChange={setWithdrawAmt} symbol="WETH" max={String(MOCK_COLL)} onMax={() => setWithdrawAmt(String(MOCK_COLL))} />
                
                <div className="mt-auto pt-4">
                  <button className="action-btn btn-danger" disabled={pending || !withdrawAmt}>
                    {pending ? "Processing..." : "Withdraw WETH"}
                  </button>
                </div>
              </div>
            )}
            
            {txHash && (
              <div className="mt-4 text-center">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--cyan)" }}>Tx: {txHash.slice(0,10)}…{txHash.slice(-8)}</span>
              </div>
            )}

          </div>
        </div>

        {/* Info Footer */}
        <div className="reveal mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card-surface" style={{ padding: 24 }}>
            <h4 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Protocol Mechanics</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "1. Deposit WETH to establish a collateral base.",
                "2. Mint pUSD up to 66% of your collateral value.",
                "3. Your vault accrues a 2% stability fee annually.",
                "4. Burn pUSD to recover your WETH collateral."
              ].map((text, i) => (
                <li key={i} style={{ fontSize: 14, color: "var(--text-secondary)" }}>{text}</li>
              ))}
            </ul>
          </div>
          
          <div className="card-surface" style={{ padding: 24 }}>
            <h4 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>MakerDAO Comparison</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Ilk", "Collateral Config"], ["Urn", "Vault Struct"], ["Jug", "Stability Fee"], ["Cat", "Liquidation Contract"]
              ].map(([maker, ours]) => (
                <div key={maker} className="flex justify-between border-b border-zinc-500/20 pb-2">
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>{maker}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>{ours}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}