"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Tabs, AmountField, TokenIcon, Reveal, EmptyState } from "@/components/ui/kit";
import { STABLECOIN_ADDRESSES, TOKEN_ADDRESSES, CONTRACT_ADDRESSES } from "@/constants/addresses";
import { ERC20_ABI, PRICE_ORACLE_ABI } from "@/constants/abis";
import { useTokenBalance, useTokenAllowance, useAssetPrice } from "@/hooks/useProtocol";
import { useTx } from "@/hooks/useTx";

const VAULT_ABI = [
  { name: "depositAndMint",     type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "collateral", type: "address" }, { name: "collateralAmount", type: "uint256" }, { name: "pUSDAmount", type: "uint256" }], outputs: [] },
  { name: "mintPUSD",           type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "collateral", type: "address" }, { name: "pUSDAmount", type: "uint256" }], outputs: [] },
  { name: "burnPUSD",           type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "collateral", type: "address" }, { name: "pUSDAmount", type: "uint256" }], outputs: [] },
  { name: "withdrawCollateral", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "collateral", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

const VAULT = STABLECOIN_ADDRESSES.STABLECOIN_VAULT;
const PUSD  = STABLECOIN_ADDRESSES.PUSD;
const WETH  = TOKEN_ADDRESSES.WETH;

function RatioGauge({ ratio }: { ratio: number }) {
  const info =
    ratio === 0   ? { color: "var(--text-muted)", label: "NO DEBT" } :
    ratio >= 200  ? { color: "var(--mint)",  label: "SAFE" } :
    ratio >= 150  ? { color: "var(--azure)", label: "HEALTHY" } :
    ratio >= 130  ? { color: "var(--amber)", label: "AT RISK" } :
                    { color: "var(--coral)", label: "LIQUIDATABLE" };
  const R = 84, C = Math.PI * R;
  const frac = Math.min(Math.max(ratio, 0), 300) / 300;
  return (
    <div style={{ position: "relative", width: 210, margin: "0 auto" }}>
      <svg width="210" height="130" viewBox="0 0 200 124">
        <path d="M 16 108 A 84 84 0 0 1 184 108" fill="none" stroke="var(--border-strong)" strokeWidth="4" strokeLinecap="round" />
        <path d="M 16 108 A 84 84 0 0 1 184 108" fill="none" stroke={info.color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
          style={{ transition: "stroke-dashoffset 1s var(--ease-out), stroke .3s", filter: `drop-shadow(0 0 8px ${info.color})` }} />
      </svg>
      <div style={{ position: "absolute", inset: "40% 0 0", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 32, color: info.color }}>
          {ratio === 0 ? "—" : `${ratio.toFixed(0)}%`}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".24em", color: "var(--text-muted)" }}>{info.label}</div>
      </div>
    </div>
  );
}

type Tab = "mint" | "burn" | "withdraw";

export default function VaultPage() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("mint");
  const [collAmt, setCollAmt] = useState("");
  const [pusdAmt, setPusdAmt] = useState("");

  const { data: wethPriceRaw } = useAssetPrice(WETH);
  const wethPrice = wethPriceRaw ? Number(wethPriceRaw) / 1e18 : 0;

  const { data: wethBal } = useTokenBalance(WETH);
  const { data: pusdBal } = useTokenBalance(PUSD);
  const { data: wethAllowance, refetch: refetchAllow } = useTokenAllowance(WETH, VAULT);

  const approveTx = useTx("Approve WETH");
  const mintTx    = useTx("Mint pUSD");
  const burnTx    = useTx("Burn pUSD");
  const wdTx      = useTx("Withdraw collateral");

  const collParsed = useMemo(() => { try { return collAmt ? parseUnits(collAmt, 18) : 0n; } catch { return 0n; } }, [collAmt]);
  const pusdParsed = useMemo(() => { try { return pusdAmt ? parseUnits(pusdAmt, 18) : 0n; } catch { return 0n; } }, [pusdAmt]);

  const collUsd = Number(collAmt || 0) * wethPrice;
  const previewRatio = Number(pusdAmt || 0) > 0 ? (collUsd / Number(pusdAmt)) * 100 : 0;
  const needsApproval = tab === "mint" && collParsed > 0n && (wethAllowance ?? 0n) < collParsed;

  if (approveTx.isSuccess) refetchAllow();

  const act = () => {
    if (tab === "mint") {
      mintTx.write({ address: VAULT, abi: VAULT_ABI, functionName: "depositAndMint", args: [WETH, collParsed, pusdParsed] });
    } else if (tab === "burn") {
      burnTx.write({ address: VAULT, abi: VAULT_ABI, functionName: "burnPUSD", args: [WETH, pusdParsed] });
    } else {
      wdTx.write({ address: VAULT, abi: VAULT_ABI, functionName: "withdrawCollateral", args: [WETH, collParsed] });
    }
  };
  const busy = approveTx.isPending || mintTx.isPending || burnTx.isPending || wdTx.isPending;

  return (
    <PageShell
      eyebrow="pUSD stablecoin"
      title={<>Mint the <span className="grad-text">protocol dollar.</span></>}
      sub="pUSD is an over-collateralised stablecoin backed by WETH held in the StablecoinVault. Maintain at least 150% collateral or face liquidation at 130%."
    >
      <div className="split">
        <Reveal>
          <div className="card card-aurora card-sheen">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <Tabs value={tab} onChange={setTab} options={[
                { value: "mint", label: "Deposit & Mint" },
                { value: "burn", label: "Burn" },
                { value: "withdraw", label: "Withdraw" },
              ]} />
              <span className="chip chip-mint">WETH ${wethPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            </div>

            {!isConnected ? (
              <EmptyState icon="◍" title="Connect to manage a vault" action={<ConnectButton />} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {(tab === "mint" || tab === "withdraw") && (
                  <AmountField
                    label={tab === "mint" ? "Collateral to deposit" : "Collateral to withdraw"}
                    value={collAmt} onChange={setCollAmt} suffix="WETH"
                    max={tab === "mint" && wethBal ? formatUnits(wethBal, 18) : undefined}
                    hint={collUsd > 0 ? `≈ $${collUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : undefined}
                  />
                )}
                {(tab === "mint" || tab === "burn") && (
                  <AmountField
                    label={tab === "mint" ? "pUSD to mint" : "pUSD to burn"}
                    value={pusdAmt} onChange={setPusdAmt} suffix="pUSD"
                    max={tab === "burn" && pusdBal ? formatUnits(pusdBal, 18) : undefined}
                  />
                )}

                {tab === "mint" && (
                  <div>
                    <div className="inforow"><span>Resulting collateral ratio</span>
                      <b style={{ color: previewRatio === 0 ? undefined : previewRatio >= 150 ? "var(--mint)" : "var(--coral)" }}>
                        {previewRatio === 0 ? "—" : `${previewRatio.toFixed(0)}%`}
                      </b>
                    </div>
                    <div className="inforow"><span>Minimum to mint</span><b>150%</b></div>
                    <div className="inforow"><span>Liquidation below</span><b style={{ color: "var(--coral)" }}>130%</b></div>
                  </div>
                )}

                {needsApproval ? (
                  <button className="btn btn-primary btn-block btn-lg" disabled={busy || collParsed === 0n} onClick={() =>
                    approveTx.write({ address: WETH, abi: ERC20_ABI, functionName: "approve", args: [VAULT, collParsed] })
                  }>
                    {approveTx.isPending ? "Approving…" : "Approve WETH"}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-block btn-lg" onClick={act}
                    disabled={busy || (tab === "mint" ? collParsed === 0n || pusdParsed === 0n : tab === "burn" ? pusdParsed === 0n : collParsed === 0n)}>
                    {busy ? "Confirming…" :
                      tab === "mint" ? "Deposit & Mint pUSD" :
                      tab === "burn" ? "Burn pUSD" : "Withdraw WETH"}
                  </button>
                )}
              </div>
            )}
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div className="card card-sheen" style={{ textAlign: "center" }}>
              <div className="stat-label" style={{ marginBottom: 14 }}>Preview collateral ratio</div>
              <RatioGauge ratio={previewRatio} />
            </div>
            <div className="card">
              <h3 style={{ fontSize: 16, marginBottom: 14 }}>Your balances</h3>
              <div className="inforow">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><TokenIcon symbol="WETH" size={22} /> WETH</span>
                <b>{wethBal !== undefined ? Number(formatUnits(wethBal, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}</b>
              </div>
              <div className="inforow">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><TokenIcon symbol="PUSD" size={22} /> pUSD</span>
                <b>{pusdBal !== undefined ? Number(formatUnits(pusdBal, 18)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</b>
              </div>
              <div className="hr" />
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Vault: {VAULT.slice(0, 8)}…{VAULT.slice(-6)} · pUSD: {PUSD.slice(0, 8)}…{PUSD.slice(-6)}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
