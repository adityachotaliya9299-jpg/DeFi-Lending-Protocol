"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Tabs, AmountField, Reveal, EmptyState, Stat, CountUp } from "@/components/ui/kit";
import { YIELD_VAULT_ABI } from "@/constants/abisExtended";
import { ERC20_ABI } from "@/constants/abis";
import { EXT_ADDRESSES, TOKEN_ADDRESSES } from "@/constants/addresses";
import { useTokenAllowance, useTokenBalance } from "@/hooks/useProtocol";
import { useTx } from "@/hooks/useTx";

const VAULT = EXT_ADDRESSES.YIELD_VAULT;
const DECIMALS = 6; // USDC vault

type Mode = "deposit" | "redeem";

export default function YieldPage() {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");

  const { data: vaultData } = useReadContracts({
    contracts: [
      { address: VAULT, abi: YIELD_VAULT_ABI, functionName: "totalAssets" },
      { address: VAULT, abi: YIELD_VAULT_ABI, functionName: "totalSupply" },
      { address: VAULT, abi: YIELD_VAULT_ABI, functionName: "managementFeeBps" },
      { address: VAULT, abi: YIELD_VAULT_ABI, functionName: "asset" },
    ],
    query: { refetchInterval: 15_000 },
  });
  const totalAssets = (vaultData?.[0]?.result as bigint) ?? 0n;
  const totalSupply = (vaultData?.[1]?.result as bigint) ?? 0n;
  const feeBps      = Number((vaultData?.[2]?.result as bigint) ?? 0n);
  const underlying  = (vaultData?.[3]?.result as `0x${string}`) ?? TOKEN_ADDRESSES.USDC;

  const sharePrice = totalSupply > 0n
    ? Number(formatUnits(totalAssets, DECIMALS)) / Number(formatUnits(totalSupply, DECIMALS))
    : 1;

  const { data: shares } = useReadContract({
    address: VAULT, abi: YIELD_VAULT_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: usdcBal } = useTokenBalance(underlying);
  const { data: allowance, refetch: refetchAllow } = useTokenAllowance(underlying, VAULT);

  const parsed = useMemo(() => {
    try { return amount ? parseUnits(amount, DECIMALS) : 0n; }
    catch { return 0n; }
  }, [amount]);

  const { data: preview } = useReadContract({
    address: VAULT, abi: YIELD_VAULT_ABI,
    functionName: mode === "deposit" ? "previewDeposit" : "previewRedeem",
    args: parsed > 0n ? [parsed] : undefined,
    query: { enabled: parsed > 0n },
  });

  const approveTx = useTx("Approve USDC");
  const actTx = useTx(mode === "deposit" ? "Deposit to vault" : "Redeem shares");
  if (approveTx.isSuccess) refetchAllow();

  const needsApproval = mode === "deposit" && parsed > 0n && (allowance ?? 0n) < parsed;
  const myValue = shares !== undefined ? Number(formatUnits(shares as bigint, DECIMALS)) * sharePrice : 0;

  return (
    <PageShell
      eyebrow="ERC-4626 vault · Phase 4"
      title={<>Yield on <span className="grad-text">autopilot.</span></>}
      sub="Deposit USDC once — the vault routes it into the lending pool and compounds interest into a rising share price."
    >
      <div className="grid-4" style={{ marginBottom: 26 }}>
        <Stat label="Vault TVL" value={<CountUp value={Number(formatUnits(totalAssets, DECIMALS))} prefix="$" />} />
        <Stat label="Share price" accent="var(--mint)"
          value={<CountUp value={sharePrice} prefix="$" decimals={4} />} sub="grows as interest accrues" />
        <Stat label="Management fee" value={`${(feeBps / 100).toFixed(2)}%`} sub="On yield, not principal" />
        <Stat label="Your position" accent="var(--azure)"
          value={<CountUp value={myValue} prefix="$" />}
          sub={shares !== undefined ? `${Number(formatUnits(shares as bigint, DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 2 })} yvUSDC` : "—"} />
      </div>

      <div className="split">
        <Reveal>
          <div className="card card-aurora card-sheen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {!isConnected ? (
              <EmptyState icon="✦" title="Connect to use the vault" action={<ConnectButton />} />
            ) : (
              <>
                <Tabs value={mode} onChange={setMode} options={[
                  { value: "deposit", label: "Deposit" },
                  { value: "redeem", label: "Redeem" },
                ]} />

                <AmountField
                  label={mode === "deposit" ? "USDC amount" : "yvUSDC shares"}
                  value={amount} onChange={setAmount}
                  suffix={mode === "deposit" ? "USDC" : "yvUSDC"}
                  max={mode === "deposit"
                    ? (usdcBal !== undefined ? formatUnits(usdcBal, DECIMALS) : undefined)
                    : (shares !== undefined ? formatUnits(shares as bigint, DECIMALS) : undefined)}
                />

                <div>
                  <div className="inforow">
                    <span>{mode === "deposit" ? "You will receive" : "You will get back"}</span>
                    <b style={{ color: "var(--mint)" }}>
                      {preview !== undefined
                        ? `${Number(formatUnits(preview as bigint, DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${mode === "deposit" ? "yvUSDC" : "USDC"}`
                        : "—"}
                    </b>
                  </div>
                  <div className="inforow"><span>Exchange rate</span><b>1 yvUSDC = ${sharePrice.toFixed(4)}</b></div>
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
                    disabled={parsed === 0n || actTx.isPending || !address}
                    onClick={() => {
                      if (mode === "deposit") {
                        actTx.write({ address: VAULT, abi: YIELD_VAULT_ABI, functionName: "deposit", args: [parsed, address!] });
                      } else {
                        actTx.write({ address: VAULT, abi: YIELD_VAULT_ABI, functionName: "redeem", args: [parsed, address!, address!] });
                      }
                    }}>
                    {actTx.isPending ? "Confirming…" : mode === "deposit" ? "Deposit USDC" : "Redeem USDC"}
                  </button>
                )}
              </>
            )}
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div className="card card-sheen">
            <h3 style={{ fontSize: 17, marginBottom: 16 }}>How it compounds</h3>
            {[
              ["01", "Deposit USDC", "The vault mints yvUSDC shares at the current exchange rate."],
              ["02", "Auto-lend", "Underlying USDC is supplied to the LendingPool, earning the supply APY."],
              ["03", "Index accrual", "Interest raises totalAssets every block — no harvest transactions needed."],
              ["04", "Redeem anytime", "Burn shares for principal plus accrued yield, minus the small management fee."],
            ].map(([n, t, d]) => (
              <div key={n} style={{ display: "flex", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="num" style={{ color: "var(--mint)", fontSize: 13 }}>{n}</span>
                <div>
                  <b style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{t}</b>
                  <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "3px 0 0" }}>{d}</p>
                </div>
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "14px 0 0" }}>
              Standard ERC-4626 interface — composable with any vault aggregator.
            </p>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
