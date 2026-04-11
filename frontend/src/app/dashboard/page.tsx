"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { LENDING_POOL_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import {
  useUserAccountData, useUserDeposit, useUserDebt,
  useAssetPrice, useTokenBalance, useTokenAllowance, useReserveData,
} from "@/hooks/useProtocol";
import { useTx } from "@/hooks/useTx";
import { HealthFactorBar } from "@/components/ui/HealthFactorBar";
import { formatUsd, formatToken, formatHealthFactor } from "@/lib/format";
import { InfoTip } from "@/components/ui/Tooltip";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AssetInfo } from "@/types";

const RAY = 1e27;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

function computeApy(totalLiq: number, totalBor: number, rf = 0.1) {
  if (totalLiq === 0) return { supplyApy: 0, borrowApy: 0 };
  const util = totalBor / totalLiq, opt = 0.8;
  const base = 0.01/SECONDS_PER_YEAR, s1 = 0.04/SECONDS_PER_YEAR, s2 = 0.75/SECONDS_PER_YEAR;
  const bps = util <= opt ? base + s1*(util/opt) : base + s1 + s2*((util-opt)/(1-opt));
  const borrowApy = bps * SECONDS_PER_YEAR * 100;
  return { supplyApy: borrowApy * util * (1 - rf), borrowApy };
}

// ── Single number stat ────────────────────────────────────────────────────────
function Stat({ label, value, color, tip }: { label: string; value: string; color: string; tip?: string }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</p>
        {tip && <InfoTip text={tip} />}
      </div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, color, letterSpacing: "-0.02em" }}>{value}</p>
    </div>
  );
}

// ── Asset action card ─────────────────────────────────────────────────────────
function AssetCard({ asset }: { asset: AssetInfo }) {
  const chainId = useChainId();
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"supply"|"borrow"|"repay"|"withdraw">("supply");

  let assetAddr: `0x${string}` = asset.address;
  let poolAddr: `0x${string}` = "0x0";
  try {
    const a = getAddresses(chainId);
    assetAddr = (a[asset.symbol as keyof typeof a] as `0x${string}`) ?? asset.address;
    poolAddr  = a.LENDING_POOL;
  } catch {}

  const { data: deposit }   = useUserDeposit(assetAddr);
  const { data: debt }      = useUserDebt(assetAddr);
  const { data: balance }   = useTokenBalance(assetAddr);
  const { data: allowance } = useTokenAllowance(assetAddr, poolAddr);
  const { data: price }     = useAssetPrice(assetAddr);
  const { data: reserve }   = useReserveData(assetAddr);

  const approveTx  = useTx(`Approve ${asset.symbol}`);
  const supplyTx   = useTx(`Supply ${asset.symbol}`);
  const borrowTx   = useTx(`Borrow ${asset.symbol}`);
  const repayTx    = useTx(`Repay ${asset.symbol}`);
  const withdrawTx = useTx(`Withdraw ${asset.symbol}`);
  const isPending  = [approveTx,supplyTx,borrowTx,repayTx,withdrawTx].some(t=>t.isPending);

  const parse = (v: string) => { try { return v ? parseUnits(v, asset.decimals) : 0n; } catch { return 0n; } };
  const parsed = parse(amount);
  const priceUsd = price ? Number(price)/1e18 : 0;

  const totalDep = reserve ? (Number(reserve.totalScaledDeposits)*Number(reserve.liquidityIndex))/RAY : 0;
  const totalBor = reserve ? (Number(reserve.totalScaledBorrows) *Number(reserve.borrowIndex))   /RAY : 0;
  const utilPct  = totalDep > 0 ? (totalBor/totalDep)*100 : 0;
  const rf       = asset.symbol==="USDC" ? 0.05 : 0.1;
  const { supplyApy, borrowApy } = computeApy(totalDep, totalBor, rf);

  const needsApproval = (tab==="supply"||tab==="repay") && allowance!==undefined && parsed>0n && allowance<parsed;

  const uColor = utilPct>=80?"#ef4444":utilPct>=60?"#f59e0b":"#34d399";

  const TABS = [
    { id:"supply"   as const, label:"Supply",   bg:"var(--cyan)", text:"#030712" },
    { id:"borrow"   as const, label:"Borrow",   bg:"#a78bfa",     text:"#030712" },
    { id:"repay"    as const, label:"Repay",     bg:"#34d399",     text:"#030712" },
    { id:"withdraw" as const, label:"Withdraw", bg:"#f59e0b",     text:"#030712" },
  ];
  const activeTab = TABS.find(t=>t.id===tab)!;

  const actionDisabled = isPending || parsed===0n || !address;
  const withdrawDisabled = isPending || !deposit || deposit===0n || !address;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 20,
      overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* Color stripe */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${activeTab.bg}, transparent)` }} />

      {/* Asset header */}
      <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: `${activeTab.bg}15`,
              border: `1px solid ${activeTab.bg}30`, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 22, overflow: "hidden" }}>
              <img src={asset.icon} alt={asset.symbol} style={{ width: 28, height: 28 }}
                onError={e => { (e.target as HTMLImageElement).style.display="none"; }} />
            </div>
            <div>
              <p style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:17, color:"var(--text-primary)", letterSpacing:"-0.01em" }}>
                {asset.symbol}
              </p>
              <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
                {priceUsd>0 ? `$${priceUsd.toLocaleString("en-US",{maximumFractionDigits:2})}` : "Loading…"}
              </p>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ display:"flex", gap:14 }}>
              <div>
                <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"#34d399", textTransform:"uppercase", marginBottom:1 }}>Supply APY</p>
                <p style={{ fontFamily:"var(--font-mono)", fontSize:15, fontWeight:500, color:"#34d399" }}>
                  {supplyApy>0 ? `${supplyApy.toFixed(2)}%` : "—"}
                </p>
              </div>
              <div>
                <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"#f59e0b", textTransform:"uppercase", marginBottom:1 }}>Borrow APY</p>
                <p style={{ fontFamily:"var(--font-mono)", fontSize:15, fontWeight:500, color:"#f59e0b" }}>
                  {borrowApy>0 ? `${borrowApy.toFixed(2)}%` : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* My balances */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <div style={{ borderRadius:12, padding:"10px 14px", background:"rgba(34,211,238,0.05)", border:"1px solid rgba(34,211,238,0.1)" }}>
            <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:3 }}>Supplied</p>
            <p style={{ fontFamily:"var(--font-mono)", fontSize:15, fontWeight:500, color:"var(--cyan)" }}>
              {deposit&&deposit>0n ? formatToken(deposit,asset.decimals,4) : "0.0000"}
            </p>
          </div>
          <div style={{ borderRadius:12, padding:"10px 14px", background:"rgba(248,113,113,0.05)", border:"1px solid rgba(248,113,113,0.1)" }}>
            <p style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase", marginBottom:3 }}>Borrowed</p>
            <p style={{ fontFamily:"var(--font-mono)", fontSize:15, fontWeight:500, color:debt&&debt>0n?"#f87171":"var(--text-muted)" }}>
              {debt&&debt>0n ? formatToken(debt,asset.decimals,4) : "0.0000"}
            </p>
          </div>
        </div>

        {/* Pool util bar */}
        <div style={{ marginTop:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text-muted)", textTransform:"uppercase" }}>Pool utilization</span>
              <InfoTip text="% of deposited liquidity currently borrowed.\nAbove 80%: borrow rates spike sharply." />
            </div>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:11, fontWeight:500, color:uColor }}>{utilPct.toFixed(1)}%</span>
          </div>
          <div style={{ height:5, borderRadius:3, background:"rgba(255,255,255,0.05)", overflow:"hidden", position:"relative" }}>
            <div style={{ position:"absolute", left:"80%", top:0, width:1, height:"100%", background:"rgba(255,255,255,0.2)" }} />
            <div style={{ width:`${Math.min(utilPct,100)}%`, height:"100%",
              background:`linear-gradient(90deg,#34d399,${uColor})`, borderRadius:3, transition:"width 1s" }} />
          </div>
        </div>
      </div>

      {/* Action zone */}
      <div style={{ padding:"18px 22px", flex:1, display:"flex", flexDirection:"column", gap:14 }}>

        {/* Tab pills */}
        <div style={{ display:"flex", gap:6 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setAmount(""); }}
              style={{ flex:1, padding:"8px 0", borderRadius:10, border:"none", cursor:"pointer",
                fontFamily:"var(--font-display)", fontWeight:tab===t.id?700:500, fontSize:12,
                background: tab===t.id ? t.bg : "rgba(255,255,255,0.04)",
                color: tab===t.id ? t.text : "var(--text-muted)",
                transition:"all 0.15s", letterSpacing:"0.01em" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Amount input */}
        {tab !== "withdraw" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", textTransform:"uppercase" }}>Amount</span>
              {tab==="supply" && balance!==undefined && (
                <button onClick={() => setAmount((Number(balance)/10**asset.decimals).toString())}
                  style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--cyan)", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  Wallet: {formatToken(balance,asset.decimals,4)} MAX
                </button>
              )}
              {tab==="repay" && debt!==undefined && debt>0n && (
                <button onClick={() => setAmount((Number(debt)/10**asset.decimals).toString())}
                  style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"#f87171", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  Debt: {formatToken(debt,asset.decimals,4)} MAX
                </button>
              )}
            </div>
            <div style={{ display:"flex", alignItems:"center", background:"rgba(0,0,0,0.3)",
              border:`1px solid ${amount?"var(--border-accent)":"var(--border)"}`,
              borderRadius:13, padding:"12px 16px", gap:10, transition:"border-color 0.15s" }}>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"
                style={{ flex:1, background:"transparent", border:"none", outline:"none",
                  fontFamily:"var(--font-mono)", fontSize:22, fontWeight:500, color:"var(--text-primary)" }} />
              <span style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text-muted)",
                background:"rgba(255,255,255,0.06)", borderRadius:7, padding:"4px 10px" }}>{asset.symbol}</span>
            </div>
            {parsed>0n && priceUsd>0 && (
              <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)", marginTop:5 }}>
                ≈ ${((Number(parsed)/10**asset.decimals)*priceUsd).toFixed(2)} USD
              </p>
            )}
          </div>
        )}

        {/* Buttons */}
        <div style={{ marginTop:"auto" }}>
          {tab==="supply" && (needsApproval ? (
            <ActionBtn label={isPending?"Approving…":`Approve ${asset.symbol}`}
              onClick={() => approveTx.write({ address:assetAddr, abi:ERC20_ABI, functionName:"approve", args:[poolAddr,parsed] })}
              disabled={isPending||parsed===0n} color="#f59e0b" />
          ) : (
            <ActionBtn label={isPending?"Supplying…":`Supply ${asset.symbol}`}
              onClick={() => address && supplyTx.write({ address:poolAddr, abi:LENDING_POOL_ABI, functionName:"deposit", args:[assetAddr,parsed] })}
              disabled={actionDisabled} color="var(--cyan)" textColor="#030712" />
          ))}
          {tab==="borrow" && (
            <ActionBtn
              label={!reserve?.isBorrowEnabled ? "Borrow disabled for this asset"
                : isPending ? "Borrowing…" : `Borrow ${asset.symbol}`}
              onClick={() => address && borrowTx.write({ address:poolAddr, abi:LENDING_POOL_ABI, functionName:"borrow", args:[assetAddr,parsed] })}
              disabled={actionDisabled||!reserve?.isBorrowEnabled} color="#a78bfa" textColor="#030712" />
          )}
          {tab==="repay" && (needsApproval ? (
            <ActionBtn label={isPending?"Approving…":`Approve ${asset.symbol}`}
              onClick={() => approveTx.write({ address:assetAddr, abi:ERC20_ABI, functionName:"approve", args:[poolAddr,parsed] })}
              disabled={isPending||parsed===0n} color="#f59e0b" />
          ) : (
            <ActionBtn label={isPending?"Repaying…":`Repay ${asset.symbol}`}
              onClick={() => address && repayTx.write({ address:poolAddr, abi:LENDING_POOL_ABI, functionName:"repay", args:[assetAddr,parsed] })}
              disabled={actionDisabled} color="#34d399" textColor="#030712" />
          ))}
          {tab==="withdraw" && (
            <ActionBtn label={isPending?"Withdrawing…":`Withdraw all ${asset.symbol}`}
              onClick={() => address && deposit && withdrawTx.write({ address:poolAddr, abi:LENDING_POOL_ABI, functionName:"withdraw", args:[assetAddr,deposit] })}
              disabled={withdrawDisabled} color="#f59e0b" textColor="#030712" />
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, color, textColor="#fff" }: {
  label: string; onClick: ()=>void; disabled: boolean; color: string; textColor?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width:"100%", padding:"13px 0", borderRadius:12, border:"none",
        cursor: disabled?"not-allowed":"pointer",
        fontFamily:"var(--font-display)", fontWeight:700, fontSize:14,
        background: disabled ? "rgba(255,255,255,0.06)" : color,
        color: disabled ? "rgba(255,255,255,0.25)" : textColor,
        transition:"all 0.15s",
        transform: "scale(1)",
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.transform="scale(1.01)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform="scale(1)"; }}>
      {label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { data: accountData } = useUserAccountData();
  const [tc, td, hf, ab] = (accountData as bigint[]|undefined) ?? [0n,0n,0n,0n];

  const hfNum = hf === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
    ? 999 : Number(hf)/1e18;

  const hfColor = hfNum >= 2 ? "#34d399" : hfNum >= 1.2 ? "var(--cyan)" : hfNum >= 1.05 ? "#f59e0b" : "#ef4444";

  if (!isConnected) {
    return (
      <div style={{ display:"flex", minHeight:"75vh", alignItems:"center", justifyContent:"center", padding:"0 24px" }}>
        <div style={{ maxWidth:420, width:"100%", textAlign:"center" }}>
          <div style={{ width:72, height:72, borderRadius:22, margin:"0 auto 24px",
            background:"linear-gradient(135deg,rgba(34,211,238,0.15),rgba(139,92,246,0.12))",
            border:"1px solid var(--border-accent)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30 }}>🏦</div>
          <h2 style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:24, color:"var(--text-primary)", marginBottom:10 }}>
            Connect your wallet
          </h2>
          <p style={{ color:"var(--text-muted)", fontSize:14, lineHeight:1.75, marginBottom:24 }}>
            Connect to Sepolia testnet to supply collateral, borrow assets, and manage your DeFi positions in real time.
          </p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <p className="section-label" style={{ marginBottom:4 }}>Dashboard</p>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
          <h1 style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:"clamp(1.5rem,2.5vw,2rem)", color:"var(--text-primary)" }}>
            Your Positions
          </h1>
          <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text-muted)" }}>
            {address?.slice(0,6)}…{address?.slice(-4)}
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-4" style={{ marginBottom:18 }}>
        <Stat label="Total Supplied"  value={formatUsd(tc)} color="var(--cyan)"
          tip="Total USD value of all your deposited collateral" />
        <Stat label="Total Borrowed"  value={formatUsd(td)} color="#f87171"
          tip="Total USD value of outstanding debt across all assets" />
        <Stat label="Available Borrow" value={formatUsd(ab)} color="#34d399"
          tip="How much more you can borrow based on current LTV limits" />
        <div style={{ background:`${hfColor}08`, border:`1px solid ${hfColor}35`, borderRadius:16, padding:"18px 22px",
          boxShadow: td>0n ? `0 0 24px ${hfColor}18` : "var(--shadow-card)",
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:6 }}>
              <p style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.1em" }}>Health Factor</p>
              <InfoTip text={"HF = adjusted collateral ÷ total debt.\nBelow 1.0 = liquidatable.\nKeep above 1.5 for safety."} />
            </div>
            <p className="hero-number" style={{ color:hfColor }}>
              {formatHealthFactor(hf)}
            </p>
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:hfColor, marginBottom:4,
              background:`${hfColor}12`, border:`1px solid ${hfColor}25`, borderRadius:8, padding:"4px 10px" }}>
              {hfNum>=999?"No borrows":hfNum>=2?"Very Safe":hfNum>=1.5?"Safe":hfNum>=1.2?"Monitor":hfNum>=1.05?"At Risk":"Liquidatable"}
            </p>
            <p style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>
              {td>0n ? "Active position" : "No borrows yet"}
            </p>
          </div>
        </div>
      </div>

      {/* Health factor bar */}
      {td > 0n && (
        <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:16,
          padding:"20px 24px", marginBottom:24 }}>
          <HealthFactorBar healthFactor={hf} size="lg" />
        </div>
      )}

      {/* Asset cards */}
      <p className="section-label" style={{ marginBottom:14 }}>Asset Positions</p>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(340px,1fr))", gap:16 }}>
        {SUPPORTED_ASSETS.map(a => <AssetCard key={a.symbol} asset={a} />)}
      </div>

      {/* Risk tips */}
      <div className="grid-3" style={{ marginTop:24 }}>
        {[
          { c:"var(--cyan)", icon:"◈", t:"Supply first", b:"Deposit an asset as collateral before you can borrow. Your health factor starts at ∞." },
          { c:"#a78bfa",    icon:"⬡", t:"Monitor HF",   b:"Health factor below 1.5 means you're vulnerable to price swings. Add collateral to stay safe." },
          { c:"#f59e0b",    icon:"⚡", t:"Repay early",  b:"Borrow interest compounds every second. Repaying reduces debt and protects from liquidation." },
        ].map(({ c, icon, t, b }) => (
          <div key={t} style={{ background:`${c}06`, border:`1px solid ${c}15`, borderRadius:14, padding:"14px 16px", display:"flex", gap:10 }}>
            <span style={{ fontSize:15, color:c, flexShrink:0 }}>{icon}</span>
            <div>
              <p style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:12, color:"var(--text-primary)", marginBottom:3 }}>{t}</p>
              <p style={{ fontSize:12, color:"var(--text-muted)", lineHeight:1.55 }}>{b}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}