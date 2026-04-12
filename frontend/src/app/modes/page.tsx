// "use client";

// import { useState, useCallback } from "react";
// import { useAccount, useChainId, useReadContract } from "wagmi";
// import { LENDING_POOL_ABI,LENDING_POOL_EXTENDED_ABI } from "@/constants/abis";
// import { getAddresses } from "@/constants/addresses";
// import { useTx } from "@/hooks/useTx";
// import { InfoTip } from "@/components/ui/Tooltip";
// import { ConnectButton } from "@rainbow-me/rainbowkit";


// // ── E-Mode categories ─────────────────────────────────────────────────────────
// const CATEGORIES = [
//   {
//     id: 0, label: "Standard", icon: "○", color: "#64748b",
//     ltv: null, liqThresh: null, liqBonus: null,
//     assets: [], active: true,
//     tagline: "Default per-asset parameters",
//     description: "No E-Mode. Each asset uses its own LTV and liquidation threshold as configured by governance.",
//   },
//   {
//     id: 1, label: "ETH Correlated", icon: "◈", color: "#22d3ee",
//     ltv: "90%", liqThresh: "93%", liqBonus: "5%",
//     assets: ["WETH","stETH","rETH"], active: true,
//     tagline: "Up to 90% LTV for ETH-pegged assets",
//     description: "ETH and liquid staking tokens move together. Lower liquidation risk allows significantly higher borrowing power.",
//     ltvBoost: "+10%",
//   },
//   {
//     id: 2, label: "Stablecoins", icon: "⊕", color: "#a78bfa",
//     ltv: "97%", liqThresh: "97.5%", liqBonus: "2%",
//     assets: ["USDC","USDT","DAI"], active: true,
//     tagline: "Up to 97% LTV for stablecoin pairs",
//     description: "All stablecoins target $1. Near-zero price divergence enables maximum capital efficiency — borrow $97 of USDT for every $100 of USDC.",
//     ltvBoost: "+12%",
//   },
//   {
//     id: 3, label: "BTC Correlated", icon: "⌁", color: "#f59e0b",
//     ltv: "88%", liqThresh: "91%", liqBonus: "6%",
//     assets: ["WBTC","tBTC"], active: false,
//     tagline: "Coming soon",
//     description: "BTC-pegged assets for higher capital efficiency on wrapped Bitcoin positions.",
//     ltvBoost: "+8%",
//   },
// ];

// const ISOLATED = [
//   {
//     symbol: "LINK", color: "#3b82f6", debtCeiling: "$500,000",
//     utilization: 38, ltv: "65%", risk: "Medium", riskColor: "#f59e0b",
//     allowedBorrows: ["USDC"],
//     reason: "LINK is a mid-cap oracle token with higher volatility. Isolation mode caps maximum protocol exposure to $500K, limiting damage from any oracle attack.",
//   },
// ];

// function CategoryCard({ cat, selected, onSelect }: {
//   cat: typeof CATEGORIES[0]; selected: boolean; onSelect: ()=>void;
// }) {
//   const c = cat.color;
//   return (
//     <button onClick={onSelect} disabled={!cat.active}
//       style={{
//         textAlign:"left", width:"100%",
//         background: selected ? `${c}0d` : "var(--bg-card)",
//         border: `1px solid ${selected ? c+"50" : "var(--border)"}`,
//         borderRadius:16, padding:20,
//         cursor: cat.active ? "pointer" : "not-allowed",
//         opacity: cat.active ? 1 : 0.4,
//         transition: "all 0.18s",
//         boxShadow: selected ? `0 0 0 1px ${c}30, 0 4px 24px ${c}12` : "var(--shadow-card)",
//         position: "relative", overflow: "hidden",
//       }}>
//       {/* Selected glow overlay */}
//       {selected && <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg,${c}06,transparent)`, pointerEvents:"none" }} />}

//       <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
//         <div style={{ display:"flex", alignItems:"center", gap:10 }}>
//           {/* Icon */}
//           <div style={{ width:42, height:42, borderRadius:12, background:`${c}15`, border:`1px solid ${c}25`,
//             display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:c }}>
//             {cat.icon}
//           </div>
//           <div>
//             <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, color:"var(--text-primary)", lineHeight:1.2 }}>
//               {cat.label}
//             </p>
//             <p style={{ fontFamily:"var(--font-mono)", fontSize:10, color: cat.active?c:"var(--text-muted)", marginTop:1 }}>
//               {cat.tagline}
//             </p>
//           </div>
//         </div>
//         {/* Radio */}
//         <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0,
//           background: selected?c:"transparent", border:`2px solid ${selected?c:"var(--border)"}`,
//           display:"flex", alignItems:"center", justifyContent:"center" }}>
//           {selected && <span style={{ color:"#030712", fontSize:12, fontWeight:800 }}>✓</span>}
//         </div>
//       </div>

//       <p style={{ fontSize:12.5, color:"var(--text-muted)", lineHeight:1.65, marginBottom: cat.ltv ? 14 : 0 }}>
//         {cat.description}
//       </p>

//       {cat.ltv && (
//         <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
//           {[["Max LTV", cat.ltv],["Liq. Threshold", cat.liqThresh],["Liq. Bonus", cat.liqBonus]].map(([l,v])=>(
//             <div key={l as string} style={{ background:"rgba(0,0,0,0.25)", borderRadius:9, padding:"9px 11px" }}>
//               <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:3 }}>{l}</p>
//               <p style={{ fontFamily:"var(--font-mono)", fontSize:16, fontWeight:500, color:c }}>{v}</p>
//             </div>
//           ))}
//         </div>
//       )}

//       {cat.ltvBoost && (
//         <div style={{ position:"absolute", top:14, right:48,
//           background:`${c}18`, border:`1px solid ${c}30`, borderRadius:20,
//           padding:"2px 8px", fontFamily:"var(--font-mono)", fontSize:10, color:c }}>
//           LTV {cat.ltvBoost}
//         </div>
//       )}
//     </button>
//   );
// }

// export default function ModesPage() {
//   const { isConnected } = useAccount();
//   const chainId = useChainId();
//   const [tab, setTab] = useState<"emode"|"isolation">("emode");
//   const [selected, setSelected] = useState(0);

//   const eModeTx = useTx("Set E-Mode");
//   const cat = CATEGORIES.find(c=>c.id===selected)!;

//   let poolAddr: `0x${string}` = "0x0";
//   try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

//   // Read current user E-Mode from chain
//   const { address } = useAccount();
//   const { data: currentEMode } = useReadContract({
//   address: poolAddr,
//   abi: LENDING_POOL_EXTENDED_ABI,  
//   functionName: "userEModeCategory",
//   args: address ? [address] : undefined,
//   query: { enabled: !!address && poolAddr !== "0x0" },
// });
//   const currentEModeNum = currentEMode !== undefined ? Number(currentEMode) : null;

//   const handleActivate = useCallback(() => {
//     if (!isConnected) return;
//     eModeTx.write({
//       address: poolAddr,
//       abi: LENDING_POOL_ABI,
//       functionName: "setUserEMode",
//       args: [selected],
//     });
//   }, [selected, poolAddr, eModeTx, isConnected]);

//   return (
//     <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

//       {/* Header */}
//       <div style={{ marginBottom:28 }}>
//         <p className="section-label" style={{ marginBottom:4 }}>Advanced Modes</p>
//         <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:16 }}>
//           <div>
//             <h1 style={{ fontFamily:"var(--font-display)", fontWeight:800,
//               fontSize:"clamp(1.6rem,3vw,2.1rem)", color:"var(--text-primary)", marginBottom:6 }}>
//               E-Mode & Isolation Mode
//             </h1>
//             <p style={{ color:"var(--text-secondary)", fontSize:14, maxWidth:520, lineHeight:1.7 }}>
//               Inspired by Aave v3. E-Mode unlocks up to 97% LTV for correlated assets.
//               Isolation Mode limits risk exposure on volatile collateral.
//             </p>
//           </div>
//           {!isConnected && <ConnectButton />}
//         </div>
//       </div>

//       {/* Tab switcher */}
//       <div style={{ display:"inline-flex", background:"var(--bg-card)", border:"1px solid var(--border)",
//         borderRadius:14, padding:4, gap:4, marginBottom:28 }}>
//         {([
//           { id:"emode"     as const, label:"⚡ Efficiency Mode" },
//           { id:"isolation" as const, label:"🔒 Isolation Mode"  },
//         ]).map(({ id, label }) => (
//           <button key={id} onClick={() => setTab(id)}
//             style={{ padding:"9px 22px", borderRadius:10, border:"none", cursor:"pointer",
//               fontFamily:"var(--font-display)", fontWeight:tab===id?700:500, fontSize:13,
//               background: tab===id ? "var(--cyan)" : "transparent",
//               color: tab===id ? "#030712" : "var(--text-secondary)",
//               transition:"all 0.15s" }}>
//             {label}
//           </button>
//         ))}
//       </div>

//       {/* ── E-MODE ── */}
//       {tab === "emode" && (
//         <div>
//           {/* How it works — 3 cards */}
//           <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:28 }}>
//             {[
//               { icon:"◈", c:"var(--cyan)", t:"Correlated assets",  b:"Assets that move together have lower liquidation risk — letting the protocol offer higher LTV safely." },
//               { icon:"⬡", c:"#a78bfa",    t:"LTV boost",           b:"Standard USDC LTV = 85%. Stablecoin E-Mode pushes it to 97% because $1 = $1 regardless of market." },
//               { icon:"⚠", c:"#f59e0b",    t:"All-or-nothing",      b:"E-Mode applies only when ALL your collateral AND debt share the same category. Mixed = standard LTV." },
//             ].map(({ icon, c, t, b }) => (
//               <div key={t} style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
//                 <span style={{ fontSize:24, color:c, display:"block", marginBottom:10 }}>{icon}</span>
//                 <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, color:"var(--text-primary)", marginBottom:6 }}>{t}</p>
//                 <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.65 }}>{b}</p>
//               </div>
//             ))}
//           </div>

//           <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20, alignItems:"start" }}>
//             {/* Category list */}
//             <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
//               {CATEGORIES.map(c => (
//                 <CategoryCard key={c.id} cat={c} selected={selected===c.id} onSelect={()=>setSelected(c.id)} />
//               ))}
//             </div>

//             {/* Action panel */}
//             <div style={{ position:"sticky", top:88 }}>
//               <div style={{ background:"var(--bg-card)", border:`1px solid ${cat.id!==0?cat.color+"35":"var(--border)"}`,
//                 borderRadius:18, overflow:"hidden",
//                 boxShadow: cat.id!==0 ? `0 0 30px ${cat.color}12` : "var(--shadow-card)" }}>
//                 {cat.id!==0 && <div style={{ height:3, background:`linear-gradient(90deg,${cat.color},transparent)` }} />}
//                 <div style={{ padding:22 }}>
//                   {/* Current status */}
//                   {currentEModeNum !== null && (
//                     <div style={{ background:"rgba(0,0,0,0.2)", border:"1px solid var(--border)", borderRadius:10,
//                       padding:"8px 12px", marginBottom:16, display:"flex", justifyContent:"space-between" }}>
//                       <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>Current E-Mode</span>
//                       <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:
//                         CATEGORIES[currentEModeNum]?.color ?? "var(--text-muted)" }}>
//                         {CATEGORIES[currentEModeNum]?.label ?? "Unknown"}
//                       </span>
//                     </div>
//                   )}

//                   <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
//                     <div style={{ width:44, height:44, borderRadius:13, background:`${cat.color}15`,
//                       border:`1px solid ${cat.color}25`, display:"flex", alignItems:"center",
//                       justifyContent:"center", fontSize:20, color:cat.color }}>
//                       {cat.icon}
//                     </div>
//                     <div>
//                       <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase" }}>Selected</p>
//                       <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:16, color:"var(--text-primary)" }}>{cat.label}</p>
//                     </div>
//                   </div>

//                   {cat.ltv ? (
//                     <div style={{ marginBottom:18 }}>
//                       <div style={{ background:"rgba(0,0,0,0.25)", borderRadius:12, padding:14, marginBottom:10 }}>
//                         <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:10 }}>
//                           LTV comparison
//                         </p>
//                         <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
//                           <span style={{ fontSize:12, color:"var(--text-muted)" }}>Standard</span>
//                           <span style={{ fontFamily:"var(--font-mono)", fontSize:16, color:"var(--text-muted)", textDecoration:"line-through" }}>80–85%</span>
//                         </div>
//                         <div style={{ display:"flex", justifyContent:"space-between" }}>
//                           <span style={{ fontSize:12, color:"var(--text-muted)" }}>E-Mode</span>
//                           <span style={{ fontFamily:"var(--font-mono)", fontSize:28, fontWeight:500, color:cat.color }}>{cat.ltv}</span>
//                         </div>
//                       </div>
//                       <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:8 }}>
//                         {[["Liq. Threshold",cat.liqThresh],["Liq. Bonus",cat.liqBonus]].map(([l,v])=>(
//                           <div key={l as string} style={{ background:"rgba(0,0,0,0.2)", borderRadius:10, padding:"10px 12px" }}>
//                             <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:3 }}>{l}</p>
//                             <p style={{ fontFamily:"var(--font-mono)", fontSize:17, fontWeight:500, color:cat.color }}>{v}</p>
//                           </div>
//                         ))}
//                       </div>
//                     </div>
//                   ) : (
//                     <div style={{ background:"rgba(0,0,0,0.15)", borderRadius:10, padding:"12px 14px", marginBottom:18 }}>
//                       <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.6 }}>
//                         Standard parameters — per-asset LTV and liquidation threshold apply.
//                       </p>
//                     </div>
//                   )}

//                   <button onClick={handleActivate} disabled={eModeTx.isPending||!isConnected||selected===currentEModeNum}
//                     style={{ width:"100%", borderRadius:12, padding:"14px 0", border:"none",
//                       cursor: eModeTx.isPending||!isConnected||selected===currentEModeNum ? "not-allowed":"pointer",
//                       fontFamily:"var(--font-display)", fontWeight:700, fontSize:14,
//                       background: !isConnected ? "rgba(255,255,255,0.06)"
//                         : selected===currentEModeNum ? "rgba(255,255,255,0.06)"
//                         : cat.id===0 ? "rgba(100,116,139,0.3)"
//                         : cat.color,
//                       color: !isConnected||selected===currentEModeNum ? "rgba(255,255,255,0.2)"
//                         : cat.id===0 ? "var(--text-secondary)" : "#030712",
//                       transition:"all 0.15s" }}>
//                     {!isConnected ? "Connect Wallet"
//                       : selected===currentEModeNum ? "Already Active"
//                       : eModeTx.isPending ? "Activating…"
//                       : cat.id===0 ? "Exit E-Mode"
//                       : `Activate ${cat.label}`}
//                   </button>
//                   {eModeTx.txHash && (
//                     <p style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", textAlign:"center", marginTop:10 }}>
//                       Tx: {eModeTx.txHash.slice(0,10)}…
//                     </p>
//                   )}
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ── ISOLATION ── */}
//       {tab === "isolation" && (
//         <div>
//           {/* Explainer */}
//           <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:28 }}>
//             {[
//               { icon:"🔒", c:"#f59e0b", t:"What is isolation?",   b:"Risky/new assets get a global debt ceiling — the maximum USD that ALL users combined can borrow against that asset." },
//               { icon:"⊕", c:"#ef4444", t:"Borrow restrictions",   b:"While using isolated collateral you can ONLY borrow approved stablecoins. No volatile assets like ETH or LINK." },
//               { icon:"◈", c:"#34d399", t:"Why it matters",         b:"Without isolation, a volatile asset could be used to drain the pool via oracle manipulation. The ceiling caps max loss." },
//             ].map(({ icon, c, t, b }) => (
//               <div key={t} style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
//                 <span style={{ fontSize:22, display:"block", marginBottom:10 }}>{icon}</span>
//                 <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, color:"var(--text-primary)", marginBottom:6 }}>{t}</p>
//                 <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.65 }}>{b}</p>
//               </div>
//             ))}
//           </div>

//           {/* Isolated assets */}
//           <p className="section-label" style={{ marginBottom:14 }}>Isolated assets</p>
//           {ISOLATED.map(a => (
//             <div key={a.symbol} style={{ background:"var(--bg-card)", border:"1px solid rgba(245,158,11,0.3)",
//               borderRadius:18, overflow:"hidden", boxShadow:"0 0 20px rgba(245,158,11,0.06)", marginBottom:16 }}>
//               <div style={{ height:3, background:"linear-gradient(90deg,#f59e0b,transparent)" }} />
//               <div style={{ padding:24 }}>
//                 <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16, marginBottom:18 }}>
//                   <div style={{ display:"flex", alignItems:"center", gap:12 }}>
//                     <div style={{ width:46, height:46, borderRadius:14, background:"rgba(59,130,246,0.12)",
//                       border:"1px solid rgba(59,130,246,0.25)", display:"flex", alignItems:"center",
//                       justifyContent:"center", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"#60a5fa" }}>⬡</div>
//                     <div>
//                       <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
//                         <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:"var(--text-primary)" }}>{a.symbol}</span>
//                         <span className="badge badge-amber">Isolated</span>
//                       </div>
//                     </div>
//                   </div>
//                   <div style={{ display:"flex", gap:22 }}>
//                     {[["Debt Ceiling",a.debtCeiling,"#f59e0b"],["Max LTV",a.ltv,"var(--cyan)"],["Risk",a.risk,a.riskColor]].map(([l,v,c])=>(
//                       <div key={l as string} style={{ textAlign:"right" }}>
//                         <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:2 }}>{l}</p>
//                         <p style={{ fontFamily:"var(--font-mono)", fontSize:16, fontWeight:500, color:c as string }}>{v as string}</p>
//                       </div>
//                     ))}
//                   </div>
//                 </div>

//                 {/* Utilization bar */}
//                 <div style={{ marginBottom:16 }}>
//                   <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
//                     <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>Global debt used</span>
//                     <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"#f59e0b" }}>{a.utilization}% of {a.debtCeiling}</span>
//                   </div>
//                   <div style={{ height:6, borderRadius:3, background:"rgba(255,255,255,0.05)", overflow:"hidden" }}>
//                     <div style={{ width:`${a.utilization}%`, height:"100%", background:"linear-gradient(90deg,#f59e0b,#ef4444)", borderRadius:3 }} />
//                   </div>
//                 </div>

//                 <div style={{ background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.18)", borderRadius:12, padding:14, marginBottom:16 }}>
//                   <p style={{ fontSize:12.5, color:"var(--text-muted)", lineHeight:1.65, marginBottom:10 }}>{a.reason}</p>
//                   <div style={{ display:"flex", alignItems:"center", gap:8 }}>
//                     <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>Only borrowable:</span>
//                     {a.allowedBorrows.map(b => (
//                       <span key={b} style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"#34d399",
//                         background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.2)",
//                         borderRadius:6, padding:"3px 10px" }}>{b}</span>
//                     ))}
//                   </div>
//                 </div>

//                 <p className="section-label" style={{ marginBottom:10 }}>What changes with isolated LINK collateral</p>
//                 <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
//                   {[
//                     ["✓","Deposit LINK as collateral","#34d399"],
//                     ["✓","Borrow USDC against LINK","#34d399"],
//                     ["✗","Borrow WETH against LINK","#ef4444"],
//                     ["✗","Mix LINK + WETH as collateral","#ef4444"],
//                     ["✓","Repay and withdraw normally","#34d399"],
//                     ["⚠","Global ceiling: $500K cap","#f59e0b"],
//                   ].map(([icon,text,c]) => (
//                     <div key={text as string} style={{ display:"flex", alignItems:"center", gap:8,
//                       background:`${c as string}06`, border:`1px solid ${c as string}15`,
//                       borderRadius:10, padding:"9px 12px" }}>
//                       <span style={{ fontSize:12, color:c as string, fontWeight:700, flexShrink:0 }}>{icon}</span>
//                       <span style={{ fontSize:11.5, color:"var(--text-secondary)", lineHeight:1.4 }}>{text}</span>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }









//new code 



"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { LENDING_POOL_ABI, LENDING_POOL_EXTENDED_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { useTx } from "@/hooks/useTx";
import { InfoTip } from "@/components/ui/Tooltip";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// ── E-Mode categories ─────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: 0, label: "Standard Mode", icon: "○", color: "#64748b",
    ltv: null, liqThresh: null, liqBonus: null,
    assets: [], active: true,
    tagline: "Default per-asset parameters",
    description: "No E-Mode. Each asset uses its own LTV and liquidation threshold as configured by governance.",
  },
  {
    id: 1, label: "ETH Correlated", icon: "◈", color: "#0ea5e9", // Blue/Cyan
    ltv: "90%", liqThresh: "93%", liqBonus: "5%",
    assets: ["WETH","stETH","rETH"], active: true,
    tagline: "Up to 90% LTV for ETH-pegged assets",
    description: "ETH and liquid staking tokens move together. Lower liquidation risk allows significantly higher borrowing power.",
    ltvBoost: "+10%",
  },
  {
    id: 2, label: "Stablecoins", icon: "⊞", color: "#8b5cf6", // Violet
    ltv: "97%", liqThresh: "97.5%", liqBonus: "2%",
    assets: ["USDC","USDT","DAI"], active: true,
    tagline: "Up to 97% LTV for stablecoin pairs",
    description: "All stablecoins target $1. Near-zero price divergence enables maximum capital efficiency — borrow $97 against $100.",
    ltvBoost: "+12%",
  },
  {
    id: 3, label: "BTC Correlated", icon: "₿", color: "#f59e0b", // Amber
    ltv: "88%", liqThresh: "91%", liqBonus: "6%",
    assets: ["WBTC","tBTC"], active: false,
    tagline: "Coming soon via governance",
    description: "BTC-pegged assets for higher capital efficiency on wrapped Bitcoin positions.",
    ltvBoost: "+8%",
  },
];

const ISOLATED = [
  {
    symbol: "LINK", color: "#3b82f6", debtCeiling: "$500,000",
    utilization: 38, ltv: "65%", risk: "Medium", riskColor: "#f59e0b",
    allowedBorrows: ["USDC"],
    reason: "LINK is a mid-cap oracle token with higher volatility. Isolation mode caps maximum protocol exposure to $500K, limiting damage from any potential oracle attack.",
  },
];

// --- Modern App Category Card ---
function CategoryCard({ cat, selected, onSelect }: {
  cat: typeof CATEGORIES[0]; selected: boolean; onSelect: ()=>void;
}) {
  const c = cat.color;
  return (
    <div 
      onClick={() => cat.active && onSelect()} 
      className={`app-cat-card ${selected ? 'selected' : ''} ${!cat.active ? 'disabled' : ''}`}
      style={{ '--accent': c } as any}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-4">
          <div className="app-cat-icon" style={{ backgroundColor: `${c}15`, color: c }}>
            {cat.icon}
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-primary">{cat.label}</h3>
            <p className="text-sm font-medium" style={{ color: cat.active ? c : "var(--text-muted)" }}>{cat.tagline}</p>
          </div>
        </div>
        <div className="app-radio">
          {selected && <div className="app-radio-inner" style={{ backgroundColor: c }} />}
        </div>
      </div>

      <p className="text-sm text-muted mt-4 leading-relaxed">
        {cat.description}
      </p>

      {/* Expanded Details when selected */}
      {selected && cat.ltv && (
        <div className="app-cat-expanded animate-slide-down">
          <div className="app-stat-box">
            <span className="app-stat-label">Max LTV</span>
            <span className="app-stat-value" style={{ color: c }}>{cat.ltv}</span>
          </div>
          <div className="app-stat-box">
            <span className="app-stat-label">Liquidation Threshold</span>
            <span className="app-stat-value" style={{ color: c }}>{cat.liqThresh}</span>
          </div>
          <div className="app-stat-box">
            <span className="app-stat-label">Liquidation Bonus</span>
            <span className="app-stat-value" style={{ color: c }}>{cat.liqBonus}</span>
          </div>
        </div>
      )}
    </div>
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
    <>
      <style>{`
        /* Modern App Soft UI CSS */
        .text-primary { color: var(--text-primary); }
        .text-secondary { color: var(--text-secondary); }
        .text-muted { color: var(--text-muted); }

        .app-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 24px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.03);
          padding: 24px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        
        /* iOS-Style Segmented Control */
        .ios-tabs-container {
          display: flex;
          justify-content: center;
          margin-bottom: 40px;
        }
        .ios-tabs {
          display: inline-flex;
          background: var(--bg-base);
          padding: 6px;
          border-radius: 100px;
          border: 1px solid var(--border);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
        }
        .ios-tab-btn {
          padding: 12px 32px;
          border-radius: 100px;
          border: none;
          background: transparent;
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ios-tab-btn.active {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          border: 1px solid var(--border);
        }

        /* Category Cards */
        .app-cat-card {
          background: var(--bg-base);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 24px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .app-cat-card:hover:not(.disabled) {
          border-color: var(--text-muted);
          transform: translateY(-2px);
        }
        .app-cat-card.selected {
          background: var(--bg-card);
          border-color: var(--accent);
          box-shadow: 0 8px 30px rgba(0,0,0,0.06), 0 0 0 1px var(--accent);
        }
        .app-cat-card.disabled {
          opacity: 0.5;
          cursor: not-allowed;
          filter: grayscale(1);
        }
        .app-cat-icon {
          width: 48px; height: 48px;
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px;
        }
        .app-radio {
          width: 24px; height: 24px;
          border-radius: 50%;
          border: 2px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s ease;
        }
        .app-cat-card.selected .app-radio {
          border-color: var(--accent);
        }
        .app-radio-inner {
          width: 12px; height: 12px;
          border-radius: 50%;
          animation: pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .app-cat-expanded {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }
        .app-stat-box {
          background: var(--bg-base);
          padding: 12px;
          border-radius: 12px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .app-stat-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .app-stat-value { font-family: var(--font-mono); font-size: 18px; font-weight: 700; }

        /* Action Panel */
        .app-action-panel {
          position: sticky;
          top: 100px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.06);
        }

        .app-btn {
          width: 100%;
          padding: 18px;
          border-radius: 16px;
          border: none;
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .app-btn:hover:not(:disabled) {
          transform: scale(0.98);
          filter: brightness(1.05);
        }
        .app-btn:active:not(:disabled) {
          transform: scale(0.95);
        }
        .app-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        /* Animations */
        @keyframes pop-in {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fade-in {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade { animation: fade-in 0.4s ease forwards; }

      `}</style>

      <div className="mx-auto max-w-7xl px-4 md:px-6 py-12">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 mb-8 text-center md:text-left">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(2.2rem, 4vw, 3rem)", color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}>
              Efficiency & Risk
            </h1>
            <p className="text-secondary text-base max-w-2xl mx-auto md:mx-0 leading-relaxed">
              Unlock maximum borrowing power for correlated assets using <strong className="text-primary">E-Mode</strong>, or protect the protocol using <strong className="text-primary">Isolation Mode</strong>.
            </p>
          </div>
          {!isConnected && <div className="flex justify-center"><ConnectButton /></div>}
        </div>

        {/* Tab Switcher */}
        <div className="ios-tabs-container">
          <div className="ios-tabs">
            <button onClick={() => setTab("emode")} className={`ios-tab-btn ${tab === "emode" ? 'active' : ''}`}>
              ⚡ E-Mode
            </button>
            <button onClick={() => setTab("isolation")} className={`ios-tab-btn ${tab === "isolation" ? 'active' : ''}`}>
              🔒 Isolation Mode
            </button>
          </div>
        </div>

        {/* ── E-MODE VIEW ── */}
        {tab === "emode" && (
          <div className="animate-fade">
            
            {/* Explainer Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {[
                { icon:"◈", t:"Correlated Assets", b:"Assets that move together have lower liquidation risk — allowing the protocol to safely offer higher LTVs." },
                { icon:"📈", t:"LTV Boost", b:"Standard stablecoin LTV is ~80%. E-Mode pushes it to 97% because $1 = $1 regardless of market volatility." },
                { icon:"⚖️", t:"Strict Rules", b:"E-Mode applies ONLY when all your collateral and debt share the same category. Mixed bags revert to standard LTV." },
              ].map(({ icon, t, b }) => (
                <div key={t} className="app-card flex flex-col gap-3">
                  <span className="text-3xl">{icon}</span>
                  <h4 className="font-display font-bold text-lg text-primary">{t}</h4>
                  <p className="text-sm text-muted leading-relaxed">{b}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
              
              {/* Left: Categories */}
              <div className="flex flex-col gap-6">
                <h3 className="font-display font-bold text-xl text-primary px-2">Select Category</h3>
                {CATEGORIES.map(c => (
                  <CategoryCard key={c.id} cat={c} selected={selected===c.id} onSelect={()=>setSelected(c.id)} />
                ))}
              </div>

              {/* Right: Action Panel */}
              <div className="app-action-panel">
                
                {/* Current Status Badge */}
                {currentEModeNum !== null && (
                  <div className="flex justify-between items-center bg-green-500/10 border border-green-500/20 px-4 py-3 rounded-xl mb-8">
                    <span className="text-xs font-bold text-green-600 uppercase tracking-wide">Active Status</span>
                    <span className="text-sm font-bold text-green-700">
                      {CATEGORIES[currentEModeNum]?.label ?? "Unknown"}
                    </span>
                  </div>
                )}

                <div className="mb-8">
                  <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Configuration Summary</p>
                  <h2 className="font-display text-3xl font-bold" style={{ color: cat.id !== 0 ? cat.color : "var(--text-primary)" }}>
                    {cat.label}
                  </h2>
                </div>

                {cat.ltv ? (
                  <div className="mb-10">
                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-5 mb-4">
                      <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-4">Borrowing Power Increase</p>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-muted">Standard Max LTV</span>
                        <span className="font-mono text-base text-muted line-through">80%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-base font-bold text-primary">New Max LTV</span>
                        <span className="font-mono text-2xl font-bold" style={{ color: cat.color }}>{cat.ltv}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-500/5 border border-gray-500/10 rounded-2xl p-5 mb-10">
                    <p className="text-sm text-muted leading-relaxed">
                      You are opting out of E-Mode. Your borrowing power will be determined by the standard, individual risk parameters of each asset you supply.
                    </p>
                  </div>
                )}

                <button 
                  onClick={handleActivate} 
                  disabled={eModeTx.isPending || !isConnected || selected === currentEModeNum}
                  className="app-btn"
                  style={{
                    backgroundColor: !isConnected ? "var(--border)" 
                      : selected === currentEModeNum ? "var(--bg-base)" 
                      : cat.id === 0 ? "var(--text-primary)" 
                      : cat.color,
                    color: !isConnected || selected === currentEModeNum ? "var(--text-muted)" 
                      : cat.id === 0 ? "var(--bg-base)" 
                      : "#fff",
                  }}
                >
                  {!isConnected ? "Connect Wallet"
                    : selected === currentEModeNum ? "Currently Active"
                    : eModeTx.isPending ? "Confirming..."
                    : cat.id === 0 ? "Disable E-Mode"
                    : `Activate ${cat.label}`}
                </button>
                
                {eModeTx.txHash && (
                  <div className="mt-4 text-center">
                    <span className="text-xs font-medium text-blue-500">
                      Transaction submitted: {eModeTx.txHash.slice(0,8)}…
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── ISOLATION VIEW ── */}
        {tab === "isolation" && (
          <div className="animate-fade">
            
            {/* Explainer Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              {[
                { icon:"🔒", t:"Debt Ceilings", b:"Risky assets get a global debt ceiling — capping the maximum USD that all users combined can borrow against them." },
                { icon:"🛡️", t:"Borrow Restrictions", b:"When using isolated collateral, you can ONLY borrow highly-liquid stablecoins. Volatile borrowing is disabled." },
                { icon:"🧱", t:"Protocol Protection", b:"Isolation prevents an attacker from manipulating an illiquid asset's oracle to drain the entire lending pool." },
              ].map(({ icon, t, b }) => (
                <div key={t} className="app-card flex flex-col gap-3">
                  <span className="text-3xl">{icon}</span>
                  <h4 className="font-display font-bold text-lg text-primary">{t}</h4>
                  <p className="text-sm text-muted leading-relaxed">{b}</p>
                </div>
              ))}
            </div>

            <h3 className="font-display font-bold text-xl text-primary px-2 mb-6">Isolated Markets</h3>
            
            {ISOLATED.map(a => (
              <div key={a.symbol} className="app-card !p-0 overflow-hidden mb-8">
                {/* Top Banner */}
                <div className="px-8 py-6 flex flex-col md:flex-row justify-between md:items-center gap-6 border-b border-[var(--border)] bg-[var(--bg-base)]">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-2xl text-blue-500 border border-blue-500/20">
                      ⬡
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="font-display text-2xl font-bold text-primary">{a.symbol}</h2>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 uppercase tracking-wide">
                          Isolated
                        </span>
                      </div>
                      <p className="text-sm text-muted font-medium">Chainlink Oracle Feed Active</p>
                    </div>
                  </div>

                  <div className="flex gap-8">
                    <div className="text-left md:text-right">
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Debt Ceiling</p>
                      <p className="font-mono text-xl font-bold text-primary">{a.debtCeiling}</p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Max LTV</p>
                      <p className="font-mono text-xl font-bold text-blue-500">{a.ltv}</p>
                    </div>
                  </div>
                </div>

                {/* Main Content */}
                <div className="p-8">
                  {/* Progress Bar */}
                  <div className="mb-10 max-w-3xl">
                    <div className="flex justify-between items-end mb-3">
                      <span className="text-sm font-bold text-primary">Global Utilization</span>
                      <span className="font-mono text-sm font-bold" style={{ color: a.riskColor }}>
                        {a.utilization}% Used
                      </span>
                    </div>
                    <div className="h-3 w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full" 
                        style={{ width: `${a.utilization}%`, background: `linear-gradient(90deg, #f59e0b, #ef4444)` }} 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div>
                      <h4 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Isolation Rationale</h4>
                      <p className="text-sm text-primary leading-relaxed bg-[var(--bg-base)] p-5 rounded-2xl border border-[var(--border)]">
                        {a.reason}
                      </p>
                      
                      <div className="mt-6 flex items-center gap-3">
                        <span className="text-sm font-bold text-muted">Approved Quote Assets:</span>
                        {a.allowedBorrows.map(b => (
                          <span key={b} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            {b}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Rules Matrix</h4>
                      <div className="bg-[var(--bg-base)] rounded-2xl border border-[var(--border)] p-5 flex flex-col gap-4">
                        {[
                          ["✅", "Deposit LINK as collateral", "text-emerald-500"],
                          ["✅", "Borrow USDC against LINK", "text-emerald-500"],
                          ["❌", "Borrow WETH against LINK", "text-red-500"],
                          ["❌", "Mix LINK + WETH as collateral", "text-red-500"],
                        ].map(([icon, text, colorClass]) => (
                          <div key={text} className="flex items-center gap-4">
                            <span className={`text-lg ${colorClass}`}>{icon}</span>
                            <span className="text-sm font-medium text-primary">{text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </>
  );
}