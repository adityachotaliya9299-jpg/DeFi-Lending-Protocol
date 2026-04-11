"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";
import { isAddress, parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CREDIT_DELEGATION_ABI, LENDING_POOL_ABI, PRICE_ORACLE_ABI } from "@/constants/abis";
import { CREDIT_DELEGATION_ADDRESS, STABLECOIN_ADDRESSES } from "@/constants/addresses";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";
import { useTx } from "@/hooks/useTx";
import { useProtocolData } from "@/hooks/useProtocolData";
import { InfoTip } from "@/components/ui/Tooltip";

const DELEGATION_ADDR = CREDIT_DELEGATION_ADDRESS;

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 20, overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
        {subtitle && <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--cyan)",
          textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>{subtitle}</p>}
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>{title}</p>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
}

// ── Delegation row ────────────────────────────────────────────────────────────
function DelegationRow({ delegator, asset, onBorrow }: {
  delegator: `0x${string}`; asset: { symbol: string; address: `0x${string}`; decimals: number };
  onBorrow: (delegator: `0x${string}`, asset: `0x${string}`, amount: string) => void;
}) {
  const { address } = useAccount();
  const [borrowAmt, setBorrowAmt] = useState("");

  const { data: delegation } = useReadContract({
    address: DELEGATION_ADDR, abi: CREDIT_DELEGATION_ABI,
    functionName: "getDelegation",
    args: address ? [delegator, address, asset.address] : undefined,
    query: { enabled: !!address && DELEGATION_ADDR !== "0x0" },
  });

  if (!delegation || !delegation.active) return null;

  const available = formatUnits(delegation.amount - delegation.used, asset.decimals);
  const total     = formatUnits(delegation.amount, asset.decimals);
  const used      = formatUnits(delegation.used, asset.decimals);
  const pctUsed   = delegation.amount > 0n
    ? Number((delegation.used * 100n) / delegation.amount) : 0;

  const isExpired = delegation.expiry > 0n && delegation.expiry < BigInt(Math.floor(Date.now()/1000));

  return (
    <div style={{ background: isExpired ? "rgba(239,68,68,0.04)" : "rgba(34,211,238,0.04)",
      border: `1px solid ${isExpired ? "rgba(239,68,68,0.2)" : "rgba(34,211,238,0.15)"}`,
      borderRadius: 14, padding: 18, marginBottom: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
              {delegator.slice(0,6)}…{delegator.slice(-4)}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)",
              background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)",
              borderRadius: 5, padding: "2px 7px" }}>{asset.symbol}</span>
            {isExpired && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#ef4444",
              background: "rgba(239,68,68,0.1)", borderRadius: 5, padding: "2px 7px" }}>Expired</span>}
          </div>
          {delegation.expiry > 0n && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
              Expires: {new Date(Number(delegation.expiry) * 1000).toLocaleDateString()}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>Available</p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500, color: isExpired ? "#ef4444" : "var(--cyan)" }}>
            {parseFloat(available).toFixed(2)} {asset.symbol}
          </p>
        </div>
      </div>

      {/* Usage bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Credit used</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {parseFloat(used).toFixed(2)} / {parseFloat(total).toFixed(2)} {asset.symbol}
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ width: `${pctUsed}%`, height: "100%",
            background: pctUsed > 80 ? "#ef4444" : pctUsed > 60 ? "#f59e0b" : "var(--cyan)",
            borderRadius: 3, transition: "width 0.8s" }} />
        </div>
      </div>

      {/* Borrow action */}
      {!isExpired && (
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" value={borrowAmt} onChange={e => setBorrowAmt(e.target.value)}
            placeholder="Amount to borrow"
            style={{ flex: 1, background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 14,
              color: "var(--text-primary)", outline: "none" }} />
          <button onClick={() => setBorrowAmt(available)}
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: 10,
              padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
            MAX
          </button>
          <button onClick={() => onBorrow(delegator, asset.address, borrowAmt)}
            disabled={!borrowAmt || parseFloat(borrowAmt) <= 0}
            style={{ background: "var(--cyan)", color: "#030712", border: "none", borderRadius: 10,
              padding: "9px 16px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
              cursor: !borrowAmt ? "not-allowed" : "pointer",
              opacity: !borrowAmt ? 0.5 : 1 }}>
            Borrow
          </button>
        </div>
      )}
    </div>
  );
}

// ── My outgoing delegation row ────────────────────────────────────────────────
function OutgoingRow({ delegatee, asset, onRevoke }: {
  delegatee: `0x${string}`;
  asset: { symbol: string; address: `0x${string}`; decimals: number; color: string };
  onRevoke: () => void;
}) {
  const { address } = useAccount();

  const { data: delegation } = useReadContract({
    address: DELEGATION_ADDR, abi: CREDIT_DELEGATION_ABI,
    functionName: "getDelegation",
    args: address ? [address, delegatee, asset.address] : undefined,
    query: { enabled: !!address },
  });

  if (!delegation?.active) return null;

  const total = formatUnits(delegation.amount, asset.decimals);
  const used  = formatUnits(delegation.used,   asset.decimals);
  const pct   = delegation.amount > 0n ? Number((delegation.used * 100n) / delegation.amount) : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 90px 80px", gap: 12,
      alignItems: "center", padding: "12px 16px",
      borderBottom: "1px solid var(--border)", fontSize: 13 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
        {delegatee.slice(0,6)}…{delegatee.slice(-4)}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: asset.color }}>{asset.symbol}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>
        {parseFloat(total).toFixed(2)}
      </div>
      <div>
        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%",
            background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "var(--cyan)", borderRadius: 2 }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{pct}% used</span>
      </div>
      <button onClick={onRevoke}
        style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 8, padding: "5px 10px", fontFamily: "var(--font-mono)", fontSize: 11,
          color: "#f87171", cursor: "pointer" }}>
        Revoke
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DelegationPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { user } = useProtocolData();

  // Grant delegation form state
  const [grantTo,     setGrantTo]     = useState("");
  const [grantAsset,  setGrantAsset]  = useState(SUPPORTED_ASSETS[1].symbol); // default USDC
  const [grantAmount, setGrantAmount] = useState("");
  const [grantDays,   setGrantDays]   = useState("");

  // Tx hooks
  const grantTx  = useTx("Grant Delegation");
  const revokeTx = useTx("Revoke Delegation");
  const borrowTx = useTx("Borrow with Delegation");
  const repayTx  = useTx("Repay Delegation");

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  const selectedAsset = SUPPORTED_ASSETS.find(a => a.symbol === grantAsset)!;
  let resolvedAssetAddr: `0x${string}` = selectedAsset.address;
  try {
    const addrs = getAddresses(chainId);
    resolvedAssetAddr = (addrs[grantAsset as keyof typeof addrs] as `0x${string}`) ?? selectedAsset.address;
  } catch {}

  // Who has delegated TO me?
  const { data: myDelegators } = useReadContract({
    address: DELEGATION_ADDR, abi: CREDIT_DELEGATION_ABI,
    functionName: "getDelegatorsOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && DELEGATION_ADDR !== "0x0", refetchInterval: 15_000 },
  });

  // Health factor preview — what happens if we borrow
  const hfNum = user?.healthFactor
    ? user.healthFactor === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      ? 999 : Number(user.healthFactor) / 1e18
    : null;

  const hfColor = !hfNum ? "var(--text-muted)"
    : hfNum >= 2 ? "#34d399" : hfNum >= 1.2 ? "var(--cyan)"
    : hfNum >= 1.05 ? "#f59e0b" : "#ef4444";

  const handleGrant = useCallback(() => {
    if (!isAddress(grantTo) || !grantAmount) return;
    const amount = parseUnits(grantAmount, selectedAsset.decimals);
    const expiry = grantDays
      ? BigInt(Math.floor(Date.now() / 1000) + Number(grantDays) * 86400)
      : 0n;

    grantTx.write({
      address: DELEGATION_ADDR, abi: CREDIT_DELEGATION_ABI,
      functionName: "approveDelegation",
      args: [grantTo as `0x${string}`, resolvedAssetAddr, amount, expiry],
    });
  }, [grantTo, grantAmount, grantDays, resolvedAssetAddr, selectedAsset, grantTx]);

  const handleBorrow = useCallback((delegator: `0x${string}`, asset: `0x${string}`, amount: string) => {
    const assetInfo = SUPPORTED_ASSETS.find(a => a.address === asset || a.symbol === asset);
    const decimals  = assetInfo?.decimals ?? 18;
    borrowTx.write({
      address: DELEGATION_ADDR, abi: CREDIT_DELEGATION_ABI,
      functionName: "borrowWithDelegation",
      args: [delegator, asset, parseUnits(amount, decimals)],
    });
  }, [borrowTx]);

  const handleRevoke = useCallback((delegatee: `0x${string}`, assetAddr: `0x${string}`) => {
    revokeTx.write({
      address: DELEGATION_ADDR, abi: CREDIT_DELEGATION_ABI,
      functionName: "revokeDelegation",
      args: [delegatee, assetAddr],
    });
  }, [revokeTx]);

  const ASSET_COLORS: Record<string, string> = {
    WETH: "var(--cyan)", USDC: "#a78bfa", LINK: "#3b82f6",
  };

  if (!isConnected) {
    return (
      <div style={{ display: "flex", minHeight: "70vh", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, margin: "0 auto 24px",
            background: "linear-gradient(135deg,rgba(34,211,238,0.12),rgba(167,139,250,0.1))",
            border: "1px solid var(--border-accent)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 30 }}>🤝</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "var(--text-primary)", marginBottom: 10 }}>
            Credit Delegation
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.75, marginBottom: 24 }}>
            Lend your borrowing power to trusted addresses — or borrow against someone's delegated credit.
          </p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p className="section-label" style={{ marginBottom: 4 }}>Unique Feature</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800,
              fontSize: "clamp(1.5rem,2.5vw,2rem)", color: "var(--text-primary)", marginBottom: 6 }}>
              Credit Delegation
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 540, lineHeight: 1.75 }}>
              Lend your borrowing power without moving collateral. The borrower gets USDC with
              zero collateral — your WETH backs their position. Only for trusted parties.
            </p>
          </div>
          {/* HF indicator */}
          {hfNum !== null && (
            <div style={{ background: "var(--bg-card)", border: `1px solid ${hfColor}30`,
              borderRadius: 14, padding: "14px 20px", textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
                Your Health Factor
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, color: hfColor }}>
                {hfNum >= 999 ? "∞" : hfNum.toFixed(3)}
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {hfNum >= 999 ? "No borrows" : hfNum >= 1.5 ? "Safe to delegate" : hfNum >= 1.2 ? "Caution" : "⚠ At risk"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Warning when HF is low */}
      {hfNum !== null && hfNum < 1.5 && hfNum < 999 && (
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", gap: 12 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠</span>
          <p style={{ fontSize: 13, color: "#f87171", lineHeight: 1.65 }}>
            Your health factor is below 1.5. Delegating credit will cause the delegatee's
            borrows to count against your collateral. This could put your position at risk of liquidation.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Grant new delegation */}
          <Section title="Grant Delegation" subtitle="Outgoing · You delegate to someone">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Delegatee address */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Delegate to (address)
                  </label>
                  <InfoTip text="The wallet that can borrow against your collateral. Must be a trusted address or smart contract." />
                </div>
                <input value={grantTo} onChange={e => setGrantTo(e.target.value)}
                  placeholder="0x…"
                  style={{ width: "100%", background: "rgba(0,0,0,0.25)", border: `1px solid ${grantTo && !isAddress(grantTo) ? "#ef4444" : "var(--border)"}`,
                    borderRadius: 12, padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13,
                    color: "var(--text-primary)", outline: "none" }} />
                {grantTo && !isAddress(grantTo) && (
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#ef4444", marginTop: 4 }}>
                    Invalid Ethereum address
                  </p>
                )}
              </div>

              {/* Asset + amount row */}
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Asset</label>
                  <select value={grantAsset} onChange={e => setGrantAsset(e.target.value)}
                    style={{ width: "100%", background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)",
                      borderRadius: 12, padding: "11px 12px", fontFamily: "var(--font-mono)", fontSize: 13,
                      color: "var(--text-primary)", outline: "none", colorScheme: "dark" }}>
                    {SUPPORTED_ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Max Amount</label>
                  <input type="number" value={grantAmount} onChange={e => setGrantAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    style={{ width: "100%", background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)",
                      borderRadius: 12, padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 14,
                      color: "var(--text-primary)", outline: "none" }} />
                </div>
              </div>

              {/* Expiry */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Expiry (days from now)
                  </label>
                  <InfoTip text="0 = no expiry. Set an expiry to auto-revoke after a time period — strongly recommended for security." />
                </div>
                <input type="number" value={grantDays} onChange={e => setGrantDays(e.target.value)}
                  placeholder="0 = no expiry"
                  style={{ width: "100%", background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)",
                    borderRadius: 12, padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 14,
                    color: "var(--text-primary)", outline: "none" }} />
                {grantDays && Number(grantDays) > 0 && (
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#34d399", marginTop: 4 }}>
                    Expires: {new Date(Date.now() + Number(grantDays)*86400*1000).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Risk summary */}
              {grantAmount && grantTo && isAddress(grantTo) && (
                <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
                  borderRadius: 12, padding: "12px 16px" }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#fbbf24", marginBottom: 4 }}>
                    ⚠ Risk summary
                  </p>
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.65 }}>
                    If <strong style={{ color: "var(--text-primary)" }}>{grantTo.slice(0,6)}…</strong> borrows{" "}
                    <strong style={{ color: "var(--cyan)" }}>{grantAmount} {grantAsset}</strong> and doesn't repay,
                    your health factor drops. Your collateral could be liquidated. Only delegate to audited contracts or trusted wallets.
                  </p>
                </div>
              )}

              <button onClick={handleGrant}
                disabled={grantTx.isPending || !grantTo || !isAddress(grantTo) || !grantAmount}
                style={{ width: "100%", borderRadius: 12, padding: "13px 0", border: "none",
                  cursor: !grantTo || !grantAmount ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14,
                  background: !grantTo || !grantAmount || !isAddress(grantTo)
                    ? "rgba(255,255,255,0.06)" : "var(--cyan)",
                  color: !grantTo || !grantAmount || !isAddress(grantTo)
                    ? "rgba(255,255,255,0.2)" : "#030712",
                  transition: "all 0.15s" }}>
                {grantTx.isPending ? "Approving…" : "Grant Delegation →"}
              </button>
            </div>
          </Section>

          {/* My outgoing delegations */}
          <Section title="My Delegations" subtitle="Outgoing · Active grants">
            <div>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 90px 80px", gap: 12,
                padding: "6px 16px 10px", marginBottom: 4 }}>
                {["Delegatee","Asset","Limit","Used",""].map(h => (
                  <p key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</p>
                ))}
              </div>
              {/* Rows — replace with real data when delegation deployed */}
              <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 12, padding: "20px", textAlign: "center" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                  No active delegations
                </p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                  Grant a delegation above to see it here
                </p>
              </div>
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Incoming delegations — borrow zone */}
          <Section title="Borrow with Delegation" subtitle="Incoming · Credit granted to you">
            <div>
              {myDelegators && (myDelegators as `0x${string}`[]).length > 0 ? (
                <div>
                  {(myDelegators as `0x${string}`[]).map(delegator =>
                    SUPPORTED_ASSETS.map(asset => {
                      let assetAddr: `0x${string}` = asset.address;
                      try {
                        const addrs = getAddresses(chainId);
                        assetAddr = (addrs[asset.symbol as keyof typeof addrs] as `0x${string}`) ?? asset.address;
                      } catch {}
                      return (
                        <DelegationRow
                          key={`${delegator}-${asset.symbol}`}
                          delegator={delegator}
                          asset={{ ...asset, address: assetAddr }}
                          onBorrow={handleBorrow}
                        />
                      );
                    })
                  )}
                </div>
              ) : (
                <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 12, padding: "28px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>🤝</div>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 6 }}>
                    No credit delegated to you
                  </p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                    When someone grants you a credit delegation,<br />it will appear here and you can borrow against it.
                  </p>
                </div>
              )}
            </div>
          </Section>

          {/* How it works */}
          <Section title="How Credit Delegation Works" subtitle="Explainer">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { n:"1", c:"var(--cyan)", icon:"◈",
                  title:"Delegator deposits collateral",
                  body:"Alice deposits 10 WETH. This gives her $8,000 of borrowing power at 80% LTV." },
                { n:"2", c:"#a78bfa", icon:"⬡",
                  title:"Alice delegates credit to Bob",
                  body:"Alice approves Bob to use $5,000 USDC of her borrowing power. She sets an expiry." },
                { n:"3", c:"#34d399", icon:"⊕",
                  title:"Bob borrows with no collateral",
                  body:"Bob calls borrowWithDelegation(). Bob gets $5,000 USDC. Alice's HF drops." },
                { n:"4", c:"#f59e0b", icon:"⚠",
                  title:"Bob must repay or Alice is liquidated",
                  body:"Alice's WETH backs Bob's debt. If Bob defaults, Alice faces liquidation. Trust is essential." },
              ].map(({ n, c, icon, title, body }) => (
                <div key={n} style={{ display: "flex", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: `${c}15`,
                    border: `1px solid ${c}25`, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 15, color: c, flexShrink: 0 }}>{icon}</div>
                  <div style={{ paddingTop: 2 }}>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
                      color: "var(--text-primary)", marginBottom: 4 }}>{title}</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Warning box */}
          <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 14, padding: 18 }}>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: "#f87171", marginBottom: 8 }}>
              🔴 Security considerations
            </p>
            {[
              "Only delegate to audited smart contracts or deeply trusted wallets",
              "Always set an expiry — stale delegations can be exploited",
              "Monitor your health factor actively when delegating",
              "Use revokeDelegation() immediately if you suspect misuse",
            ].map(item => (
              <div key={item} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ color: "#f87171", flexShrink: 0, fontSize: 12 }}>→</span>
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}