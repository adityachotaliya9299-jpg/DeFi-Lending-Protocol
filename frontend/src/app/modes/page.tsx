"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { LENDING_POOL_ABI,LENDING_POOL_EXTENDED_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { useTx } from "@/hooks/useTx";
import { InfoTip } from "@/components/ui/Tooltip";
import { ConnectButton } from "@rainbow-me/rainbowkit";


// ── E-Mode categories ─────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: 0, label: "Standard", icon: "○", color: "#64748b",
    ltv: null, liqThresh: null, liqBonus: null,
    assets: [], active: true,
    tagline: "Default per-asset parameters",
    description: "No E-Mode. Each asset uses its own LTV and liquidation threshold as configured by governance.",
  },
  {
    id: 1, label: "ETH Correlated", icon: "◈", color: "#22d3ee",
    ltv: "90%", liqThresh: "93%", liqBonus: "5%",
    assets: ["WETH","stETH","rETH"], active: true,
    tagline: "Up to 90% LTV for ETH-pegged assets",
    description: "ETH and liquid staking tokens move together. Lower liquidation risk allows significantly higher borrowing power.",
    ltvBoost: "+10%",
  },
  {
    id: 2, label: "Stablecoins", icon: "⊕", color: "#a78bfa",
    ltv: "97%", liqThresh: "97.5%", liqBonus: "2%",
    assets: ["USDC","USDT","DAI"], active: true,
    tagline: "Up to 97% LTV for stablecoin pairs",
    description: "All stablecoins target $1. Near-zero price divergence enables maximum capital efficiency — borrow $97 of USDT for every $100 of USDC.",
    ltvBoost: "+12%",
  },
  {
    id: 3, label: "BTC Correlated", icon: "⌁", color: "#f59e0b",
    ltv: "88%", liqThresh: "91%", liqBonus: "6%",
    assets: ["WBTC","tBTC"], active: false,
    tagline: "Coming soon",
    description: "BTC-pegged assets for higher capital efficiency on wrapped Bitcoin positions.",
    ltvBoost: "+8%",
  },
];

const ISOLATED = [
  {
    symbol: "LINK", color: "#3b82f6", debtCeiling: "$500,000",
    utilization: 38, ltv: "65%", risk: "Medium", riskColor: "#f59e0b",
    allowedBorrows: ["USDC"],
    reason: "LINK is a mid-cap oracle token with higher volatility. Isolation mode caps maximum protocol exposure to $500K, limiting damage from any oracle attack.",
  },
];

function CategoryCard({ cat, selected, onSelect }: {
  cat: typeof CATEGORIES[0]; selected: boolean; onSelect: ()=>void;
}) {
  const c = cat.color;
  return (
    <button onClick={onSelect} disabled={!cat.active}
      style={{
        textAlign:"left", width:"100%",
        background: selected ? `${c}0d` : "var(--bg-card)",
        border: `1px solid ${selected ? c+"50" : "var(--border)"}`,
        borderRadius:16, padding:20,
        cursor: cat.active ? "pointer" : "not-allowed",
        opacity: cat.active ? 1 : 0.4,
        transition: "all 0.18s",
        boxShadow: selected ? `0 0 0 1px ${c}30, 0 4px 24px ${c}12` : "var(--shadow-card)",
        position: "relative", overflow: "hidden",
      }}>
      {/* Selected glow overlay */}
      {selected && <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg,${c}06,transparent)`, pointerEvents:"none" }} />}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Icon */}
          <div style={{ width:42, height:42, borderRadius:12, background:`${c}15`, border:`1px solid ${c}25`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:c }}>
            {cat.icon}
          </div>
          <div>
            <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, color:"var(--text-primary)", lineHeight:1.2 }}>
              {cat.label}
            </p>
            <p style={{ fontFamily:"var(--font-mono)", fontSize:10, color: cat.active?c:"var(--text-muted)", marginTop:1 }}>
              {cat.tagline}
            </p>
          </div>
        </div>
        {/* Radio */}
        <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0,
          background: selected?c:"transparent", border:`2px solid ${selected?c:"var(--border)"}`,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          {selected && <span style={{ color:"#030712", fontSize:12, fontWeight:800 }}>✓</span>}
        </div>
      </div>

      <p style={{ fontSize:12.5, color:"var(--text-muted)", lineHeight:1.65, marginBottom: cat.ltv ? 14 : 0 }}>
        {cat.description}
      </p>

      {cat.ltv && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
          {[["Max LTV", cat.ltv],["Liq. Threshold", cat.liqThresh],["Liq. Bonus", cat.liqBonus]].map(([l,v])=>(
            <div key={l as string} style={{ background:"rgba(0,0,0,0.25)", borderRadius:9, padding:"9px 11px" }}>
              <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:3 }}>{l}</p>
              <p style={{ fontFamily:"var(--font-mono)", fontSize:16, fontWeight:500, color:c }}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {cat.ltvBoost && (
        <div style={{ position:"absolute", top:14, right:48,
          background:`${c}18`, border:`1px solid ${c}30`, borderRadius:20,
          padding:"2px 8px", fontFamily:"var(--font-mono)", fontSize:10, color:c }}>
          LTV {cat.ltvBoost}
        </div>
      )}
    </button>
  );
}

export default function ModesPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const [tab, setTab] = useState<"emode"|"isolation">("emode");
  const [selected, setSelected] = useState(0);

  const eModeTx = useTx("Set E-Mode");
  const cat = CATEGORIES.find(c=>c.id===selected)!;

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  // Read current user E-Mode from chain
  const { address } = useAccount();
  const { data: currentEMode } = useReadContract({
  address: poolAddr,
  abi: LENDING_POOL_EXTENDED_ABI,  
  functionName: "userEModeCategory",
  args: address ? [address] : undefined,
  query: { enabled: !!address && poolAddr !== "0x0" },
});
  const currentEModeNum = currentEMode !== undefined ? Number(currentEMode) : null;

  const handleActivate = useCallback(() => {
    if (!isConnected) return;
    eModeTx.write({
      address: poolAddr,
      abi: LENDING_POOL_ABI,
      functionName: "setUserEMode",
      args: [selected],
    });
  }, [selected, poolAddr, eModeTx, isConnected]);

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <p className="section-label" style={{ marginBottom:4 }}>Advanced Modes</p>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:16 }}>
          <div>
            <h1 style={{ fontFamily:"var(--font-display)", fontWeight:800,
              fontSize:"clamp(1.6rem,3vw,2.1rem)", color:"var(--text-primary)", marginBottom:6 }}>
              E-Mode & Isolation Mode
            </h1>
            <p style={{ color:"var(--text-secondary)", fontSize:14, maxWidth:520, lineHeight:1.7 }}>
              Inspired by Aave v3. E-Mode unlocks up to 97% LTV for correlated assets.
              Isolation Mode limits risk exposure on volatile collateral.
            </p>
          </div>
          {!isConnected && <ConnectButton />}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display:"inline-flex", background:"var(--bg-card)", border:"1px solid var(--border)",
        borderRadius:14, padding:4, gap:4, marginBottom:28 }}>
        {([
          { id:"emode"     as const, label:"⚡ Efficiency Mode" },
          { id:"isolation" as const, label:"🔒 Isolation Mode"  },
        ]).map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:"9px 22px", borderRadius:10, border:"none", cursor:"pointer",
              fontFamily:"var(--font-display)", fontWeight:tab===id?700:500, fontSize:13,
              background: tab===id ? "var(--cyan)" : "transparent",
              color: tab===id ? "#030712" : "var(--text-secondary)",
              transition:"all 0.15s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── E-MODE ── */}
      {tab === "emode" && (
        <div>
          {/* How it works — 3 cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:28 }}>
            {[
              { icon:"◈", c:"var(--cyan)", t:"Correlated assets",  b:"Assets that move together have lower liquidation risk — letting the protocol offer higher LTV safely." },
              { icon:"⬡", c:"#a78bfa",    t:"LTV boost",           b:"Standard USDC LTV = 85%. Stablecoin E-Mode pushes it to 97% because $1 = $1 regardless of market." },
              { icon:"⚠", c:"#f59e0b",    t:"All-or-nothing",      b:"E-Mode applies only when ALL your collateral AND debt share the same category. Mixed = standard LTV." },
            ].map(({ icon, c, t, b }) => (
              <div key={t} style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
                <span style={{ fontSize:24, color:c, display:"block", marginBottom:10 }}>{icon}</span>
                <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, color:"var(--text-primary)", marginBottom:6 }}>{t}</p>
                <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.65 }}>{b}</p>
              </div>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20, alignItems:"start" }}>
            {/* Category list */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {CATEGORIES.map(c => (
                <CategoryCard key={c.id} cat={c} selected={selected===c.id} onSelect={()=>setSelected(c.id)} />
              ))}
            </div>

            {/* Action panel */}
            <div style={{ position:"sticky", top:88 }}>
              <div style={{ background:"var(--bg-card)", border:`1px solid ${cat.id!==0?cat.color+"35":"var(--border)"}`,
                borderRadius:18, overflow:"hidden",
                boxShadow: cat.id!==0 ? `0 0 30px ${cat.color}12` : "var(--shadow-card)" }}>
                {cat.id!==0 && <div style={{ height:3, background:`linear-gradient(90deg,${cat.color},transparent)` }} />}
                <div style={{ padding:22 }}>
                  {/* Current status */}
                  {currentEModeNum !== null && (
                    <div style={{ background:"rgba(0,0,0,0.2)", border:"1px solid var(--border)", borderRadius:10,
                      padding:"8px 12px", marginBottom:16, display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>Current E-Mode</span>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:
                        CATEGORIES[currentEModeNum]?.color ?? "var(--text-muted)" }}>
                        {CATEGORIES[currentEModeNum]?.label ?? "Unknown"}
                      </span>
                    </div>
                  )}

                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                    <div style={{ width:44, height:44, borderRadius:13, background:`${cat.color}15`,
                      border:`1px solid ${cat.color}25`, display:"flex", alignItems:"center",
                      justifyContent:"center", fontSize:20, color:cat.color }}>
                      {cat.icon}
                    </div>
                    <div>
                      <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase" }}>Selected</p>
                      <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:16, color:"var(--text-primary)" }}>{cat.label}</p>
                    </div>
                  </div>

                  {cat.ltv ? (
                    <div style={{ marginBottom:18 }}>
                      <div style={{ background:"rgba(0,0,0,0.25)", borderRadius:12, padding:14, marginBottom:10 }}>
                        <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:10 }}>
                          LTV comparison
                        </p>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                          <span style={{ fontSize:12, color:"var(--text-muted)" }}>Standard</span>
                          <span style={{ fontFamily:"var(--font-mono)", fontSize:16, color:"var(--text-muted)", textDecoration:"line-through" }}>80–85%</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                          <span style={{ fontSize:12, color:"var(--text-muted)" }}>E-Mode</span>
                          <span style={{ fontFamily:"var(--font-mono)", fontSize:28, fontWeight:500, color:cat.color }}>{cat.ltv}</span>
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:8 }}>
                        {[["Liq. Threshold",cat.liqThresh],["Liq. Bonus",cat.liqBonus]].map(([l,v])=>(
                          <div key={l as string} style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"10px 12px" }}>
                            <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:3 }}>{l}</p>
                            <p style={{ fontFamily:"var(--font-mono)", fontSize:17, fontWeight:500, color:cat.color }}>{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ background:"rgba(0,0,0,0.15)", borderRadius:10, padding:"12px 14px", marginBottom:18 }}>
                      <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.6 }}>
                        Standard parameters — per-asset LTV and liquidation threshold apply.
                      </p>
                    </div>
                  )}

                  <button onClick={handleActivate} disabled={eModeTx.isPending||!isConnected||selected===currentEModeNum}
                    style={{ width:"100%", borderRadius:12, padding:"14px 0", border:"none",
                      cursor: eModeTx.isPending||!isConnected||selected===currentEModeNum ? "not-allowed":"pointer",
                      fontFamily:"var(--font-display)", fontWeight:700, fontSize:14,
                      background: !isConnected ? "rgba(255,255,255,0.06)"
                        : selected===currentEModeNum ? "rgba(255,255,255,0.06)"
                        : cat.id===0 ? "rgba(100,116,139,0.3)"
                        : cat.color,
                      color: !isConnected||selected===currentEModeNum ? "rgba(255,255,255,0.2)"
                        : cat.id===0 ? "var(--text-secondary)" : "#030712",
                      transition:"all 0.15s" }}>
                    {!isConnected ? "Connect Wallet"
                      : selected===currentEModeNum ? "Already Active"
                      : eModeTx.isPending ? "Activating…"
                      : cat.id===0 ? "Exit E-Mode"
                      : `Activate ${cat.label}`}
                  </button>
                  {eModeTx.txHash && (
                    <p style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", textAlign:"center", marginTop:10 }}>
                      Tx: {eModeTx.txHash.slice(0,10)}…
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ISOLATION ── */}
      {tab === "isolation" && (
        <div>
          {/* Explainer */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:28 }}>
            {[
              { icon:"🔒", c:"#f59e0b", t:"What is isolation?",   b:"Risky/new assets get a global debt ceiling — the maximum USD that ALL users combined can borrow against that asset." },
              { icon:"⊕", c:"#ef4444", t:"Borrow restrictions",   b:"While using isolated collateral you can ONLY borrow approved stablecoins. No volatile assets like ETH or LINK." },
              { icon:"◈", c:"#34d399", t:"Why it matters",         b:"Without isolation, a volatile asset could be used to drain the pool via oracle manipulation. The ceiling caps max loss." },
            ].map(({ icon, c, t, b }) => (
              <div key={t} style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
                <span style={{ fontSize:22, display:"block", marginBottom:10 }}>{icon}</span>
                <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, color:"var(--text-primary)", marginBottom:6 }}>{t}</p>
                <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.65 }}>{b}</p>
              </div>
            ))}
          </div>

          {/* Isolated assets */}
          <p className="section-label" style={{ marginBottom:14 }}>Isolated assets</p>
          {ISOLATED.map(a => (
            <div key={a.symbol} style={{ background:"var(--bg-card)", border:"1px solid rgba(245,158,11,0.3)",
              borderRadius:18, overflow:"hidden", boxShadow:"0 0 20px rgba(245,158,11,0.06)", marginBottom:16 }}>
              <div style={{ height:3, background:"linear-gradient(90deg,#f59e0b,transparent)" }} />
              <div style={{ padding:24 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16, marginBottom:18 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:46, height:46, borderRadius:14, background:"rgba(59,130,246,0.12)",
                      border:"1px solid rgba(59,130,246,0.25)", display:"flex", alignItems:"center",
                      justifyContent:"center", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"#60a5fa" }}>⬡</div>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                        <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:"var(--text-primary)" }}>{a.symbol}</span>
                        <span className="badge badge-amber">Isolated</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:22 }}>
                    {[["Debt Ceiling",a.debtCeiling,"#f59e0b"],["Max LTV",a.ltv,"var(--cyan)"],["Risk",a.risk,a.riskColor]].map(([l,v,c])=>(
                      <div key={l as string} style={{ textAlign:"right" }}>
                        <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:2 }}>{l}</p>
                        <p style={{ fontFamily:"var(--font-mono)", fontSize:16, fontWeight:500, color:c as string }}>{v as string}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Utilization bar */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>Global debt used</span>
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"#f59e0b" }}>{a.utilization}% of {a.debtCeiling}</span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:"rgba(255,255,255,0.05)", overflow:"hidden" }}>
                    <div style={{ width:`${a.utilization}%`, height:"100%", background:"linear-gradient(90deg,#f59e0b,#ef4444)", borderRadius:3 }} />
                  </div>
                </div>

                <div style={{ background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.18)", borderRadius:12, padding:14, marginBottom:16 }}>
                  <p style={{ fontSize:12.5, color:"var(--text-muted)", lineHeight:1.65, marginBottom:10 }}>{a.reason}</p>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>Only borrowable:</span>
                    {a.allowedBorrows.map(b => (
                      <span key={b} style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"#34d399",
                        background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.2)",
                        borderRadius:6, padding:"3px 10px" }}>{b}</span>
                    ))}
                  </div>
                </div>

                <p className="section-label" style={{ marginBottom:10 }}>What changes with isolated LINK collateral</p>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {[
                    ["✓","Deposit LINK as collateral","#34d399"],
                    ["✓","Borrow USDC against LINK","#34d399"],
                    ["✗","Borrow WETH against LINK","#ef4444"],
                    ["✗","Mix LINK + WETH as collateral","#ef4444"],
                    ["✓","Repay and withdraw normally","#34d399"],
                    ["⚠","Global ceiling: $500K cap","#f59e0b"],
                  ].map(([icon,text,c]) => (
                    <div key={text as string} style={{ display:"flex", alignItems:"center", gap:8,
                      background:`${c as string}06`, border:`1px solid ${c as string}15`,
                      borderRadius:10, padding:"9px 12px" }}>
                      <span style={{ fontSize:12, color:c as string, fontWeight:700, flexShrink:0 }}>{icon}</span>
                      <span style={{ fontSize:11.5, color:"var(--text-secondary)", lineHeight:1.4 }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}