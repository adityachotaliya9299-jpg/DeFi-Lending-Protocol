"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Tabs, AmountField, Reveal, EmptyState, Stat, CountUp } from "@/components/ui/kit";
import { TRANCHE_VAULT_ABI } from "@/constants/abisExtended";
import { ERC20_ABI } from "@/constants/abis";
import { EXT_ADDRESSES, TOKEN_ADDRESSES } from "@/constants/addresses";
import { useTokenAllowance, useTokenBalance } from "@/hooks/useProtocol";
import { useTx } from "@/hooks/useTx";

const VAULT = EXT_ADDRESSES.TRANCHE_VAULT;
const DECIMALS = 6; // underlying is USDC

type Side = "senior" | "junior";
type Mode = "deposit" | "withdraw";

export default function TranchesPage() {
  const { address, isConnected } = useAccount();
  const [side, setSide] = useState<Side>("senior");
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");

  const { data: vaultData } = useReadContracts({
    contracts: [
      { address: VAULT, abi: TRANCHE_VAULT_ABI, functionName: "totalTVL" },
      { address: VAULT, abi: TRANCHE_VAULT_ABI, functionName: "seniorRatioBps" },
      { address: VAULT, abi: TRANCHE_VAULT_ABI, functionName: "getSeniorNAV" },
      { address: VAULT, abi: TRANCHE_VAULT_ABI, functionName: "getJuniorNAV" },
      { address: VAULT, abi: TRANCHE_VAULT_ABI, functionName: "underlying" },
      { address: VAULT, abi: TRANCHE_VAULT_ABI, functionName: "seniorToken" },
      { address: VAULT, abi: TRANCHE_VAULT_ABI, functionName: "juniorToken" },
    ],
    query: { refetchInterval: 15_000 },
  });

  const tvl        = (vaultData?.[0]?.result as bigint) ?? 0n;
  const seniorBps  = Number((vaultData?.[1]?.result as bigint) ?? 0n);
  const seniorNAV  = (vaultData?.[2]?.result as bigint) ?? 0n;
  const juniorNAV  = (vaultData?.[3]?.result as bigint) ?? 0n;
  const underlying = (vaultData?.[4]?.result as `0x${string}`) ?? TOKEN_ADDRESSES.USDC;
  const seniorTok  = vaultData?.[5]?.result as `0x${string}` | undefined;
  const juniorTok  = vaultData?.[6]?.result as `0x${string}` | undefined;

  const shareToken = side === "senior" ? seniorTok : juniorTok;
  const { data: shareBal } = useTokenBalance(shareToken ?? "0x0000000000000000000000000000000000000000");
  const { data: usdcBal } = useTokenBalance(underlying);
  const { data: allowance, refetch: refetchAllow } = useTokenAllowance(underlying, VAULT);

  const approveTx = useTx("Approve USDC");
  const actTx = useTx(mode === "deposit" ? `Deposit ${side}` : `Withdraw ${side}`);
  if (approveTx.isSuccess) refetchAllow();

  const parsed = useMemo(() => {
    try { return amount ? parseUnits(amount, DECIMALS) : 0n; }
    catch { return 0n; }
  }, [amount]);

  const needsApproval = mode === "deposit" && parsed > 0n && (allowance ?? 0n) < parsed;
  const seniorPct = seniorBps / 100;

  const act = () => {
    const fn = mode === "deposit"
      ? (side === "senior" ? "depositSenior" : "depositJunior")
      : (side === "senior" ? "withdrawSenior" : "withdrawJunior");
    actTx.write({ address: VAULT, abi: TRANCHE_VAULT_ABI, functionName: fn, args: [parsed] });
  };

  return (
    <PageShell
      eyebrow="Structured yield · Phase 5"
      title={<>Pick your <span className="grad-text">risk sleeve.</span></>}
      sub="One USDC pool, two claims: Senior earns a protected target yield; Junior levers the excess and absorbs losses first."
    >
      <div className="grid-3" style={{ marginBottom: 26 }}>
        <Stat label="Vault TVL"
          value={<CountUp value={Number(formatUnits(tvl, DECIMALS))} prefix="$" />} sub="USDC underlying" />
        <Stat label="Senior NAV" accent="var(--azure)"
          value={<CountUp value={Number(formatUnits(seniorNAV, DECIMALS))} prefix="$" />} sub="Protected sleeve" />
        <Stat label="Junior NAV" accent="var(--gold)"
          value={<CountUp value={Number(formatUnits(juniorNAV, DECIMALS))} prefix="$" />} sub="First-loss sleeve" />
      </div>

      <div className="split">
        {/* waterfall visual */}
        <Reveal>
          <div className="card card-sheen">
            <h3 style={{ fontSize: 17, marginBottom: 20 }}>The waterfall</h3>

            {/* capital structure bar */}
            <div style={{ display: "flex", height: 58, borderRadius: 14, overflow: "hidden", border: "1px solid var(--border-strong)" }}>
              <div style={{
                width: `${Math.max(4, seniorPct)}%`,
                background: "linear-gradient(100deg, rgba(88,168,255,.85), rgba(88,168,255,.5))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 13, color: "#04101f",
                transition: "width 1s var(--ease-out)",
              }}>
                SENIOR {seniorPct.toFixed(0)}%
              </div>
              <div style={{
                flex: 1,
                background: "linear-gradient(100deg, rgba(245,195,107,.85), rgba(245,195,107,.5))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 13, color: "#231604",
              }}>
                JUNIOR {(100 - seniorPct).toFixed(0)}%
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 24 }}>
              <div style={{ borderLeft: "3px solid var(--azure)", paddingLeft: 14 }}>
                <h4 style={{ fontSize: 15, color: "var(--azure)" }}>Senior</h4>
                <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: "var(--text-secondary)", fontSize: 12.8, lineHeight: 1.9 }}>
                  <li>Paid first from pool yield</li>
                  <li>Target fixed yield (set by governance)</li>
                  <li>Shielded by the junior sleeve</li>
                </ul>
              </div>
              <div style={{ borderLeft: "3px solid var(--gold)", paddingLeft: 14 }}>
                <h4 style={{ fontSize: 15, color: "var(--gold)" }}>Junior</h4>
                <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: "var(--text-secondary)", fontSize: 12.8, lineHeight: 1.9 }}>
                  <li>Receives all excess yield</li>
                  <li>Absorbs bad debt first</li>
                  <li>Levered exposure to pool performance</li>
                </ul>
              </div>
            </div>

            <div className="hr" />
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Audit note: H-06 (senior cap bypass on first deposit) is fixed and covered by regression tests.
            </p>
          </div>
        </Reveal>

        {/* action card */}
        <Reveal delay={90}>
          <div className="card card-aurora card-sheen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {!isConnected ? (
              <EmptyState icon="◪" title="Connect to enter a tranche" action={<ConnectButton />} />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <Tabs value={side} onChange={setSide} options={[
                    { value: "senior", label: "Senior" },
                    { value: "junior", label: "Junior" },
                  ]} />
                  <Tabs value={mode} onChange={setMode} options={[
                    { value: "deposit", label: "Deposit" },
                    { value: "withdraw", label: "Withdraw" },
                  ]} />
                </div>

                <AmountField
                  label={mode === "deposit" ? "USDC to deposit" : `${side} shares to burn`}
                  value={amount} onChange={setAmount}
                  suffix={mode === "deposit" ? "USDC" : side === "senior" ? "sTRN" : "jTRN"}
                  max={mode === "deposit"
                    ? (usdcBal !== undefined ? formatUnits(usdcBal, DECIMALS) : undefined)
                    : (shareBal !== undefined ? formatUnits(shareBal, DECIMALS) : undefined)}
                />

                <div>
                  <div className="inforow"><span>Your {side} shares</span>
                    <b>{shareBal !== undefined ? Number(formatUnits(shareBal, DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</b></div>
                  <div className="inforow"><span>Wallet USDC</span>
                    <b>{usdcBal !== undefined ? Number(formatUnits(usdcBal, DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</b></div>
                </div>

                {needsApproval ? (
                  <button className="btn btn-primary btn-block btn-lg"
                    disabled={parsed === 0n || approveTx.isPending}
                    onClick={() => approveTx.write({
                      address: underlying, abi: ERC20_ABI,
                      functionName: "approve", args: [VAULT, parsed],
                    })}>
                    {approveTx.isPending ? "Approving…" : "Approve USDC"}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-block btn-lg"
                    disabled={parsed === 0n || actTx.isPending} onClick={act}>
                    {actTx.isPending ? "Confirming…" :
                      `${mode === "deposit" ? "Deposit into" : "Withdraw from"} ${side}`}
                  </button>
                )}
              </>
            )}
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
