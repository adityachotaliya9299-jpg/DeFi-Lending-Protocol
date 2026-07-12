"use client";

import { useMemo, useState } from "react";
import { useChainId, useReadContract } from "wagmi";
import { isAddress, parseUnits } from "viem";
import { PageShell, AmountField, TokenIcon, Reveal, HealthGauge } from "@/components/ui/kit";
import { LENDING_POOL_ABI, LIQUIDATION_ENGINE_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { useProtocolData } from "@/hooks/useProtocolData";
import { useTokenAllowance } from "@/hooks/useProtocol";
import { useTx } from "@/hooks/useTx";

const MAX_HF = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

export default function LiquidatePage() {
  const chainId = useChainId();
  const { assets } = useProtocolData();
  const addrs = getAddresses(chainId);

  const [borrower, setBorrower] = useState("");
  const [debtSym, setDebtSym] = useState("USDC");
  const [collSym, setCollSym] = useState("WETH");
  const [amount, setAmount] = useState("");

  const valid = isAddress(borrower);
  const debtAsset = assets.find(a => a.symbol === debtSym);
  const collAsset = assets.find(a => a.symbol === collSym);

  const { data: liqData, isFetching } = useReadContract({
    address: addrs.LIQUIDATION_ENGINE,
    abi: LIQUIDATION_ENGINE_ABI,
    functionName: "getLiquidationData",
    args: valid ? [borrower as `0x${string}`] : undefined,
    query: { enabled: valid, refetchInterval: 12_000 },
  });

  const parsed = useMemo(() => {
    try { return amount && debtAsset ? parseUnits(amount, debtAsset.decimals) : 0n; }
    catch { return 0n; }
  }, [amount, debtAsset]);

  const { data: allowance, refetch: refetchAllow } = useTokenAllowance(
    debtAsset?.address ?? "0x0000000000000000000000000000000000000000",
    addrs.LENDING_POOL,
  );
  const approveTx = useTx(`Approve ${debtSym}`);
  const liqTx = useTx("Liquidate position");
  if (approveTx.isSuccess) refetchAllow();

  const hf = liqData
    ? (liqData[2] === MAX_HF ? null : Number(liqData[2]) / 1e18)
    : undefined;
  const liquidatable = liqData?.[4] ?? false;
  const needsApproval = parsed > 0n && (allowance ?? 0n) < parsed;

  return (
    <PageShell
      eyebrow="Liquidations"
      title={<>Keep the pool <span className="grad-text">solvent.</span></>}
      sub="Scan any borrower. If their health factor is below 1.0, repay part of their debt and seize discounted collateral (up to the 50% close factor)."
    >
      <div className="split">
        <Reveal>
          <div className="card card-sheen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="field">
              <div className="field-label"><span>Borrower address</span></div>
              <div className="field-box">
                <input type="text" placeholder="0x…" value={borrower}
                  onChange={e => setBorrower(e.target.value.trim())}
                  style={{ fontSize: 15 }} />
              </div>
            </div>

            <div className="grid-2" style={{ gap: 14 }}>
              <div className="field">
                <div className="field-label"><span>Debt asset (you repay)</span></div>
                <div className="field-box" style={{ padding: "10px 14px" }}>
                  <select value={debtSym} onChange={e => setDebtSym(e.target.value)}>
                    {assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <div className="field-label"><span>Collateral (you seize)</span></div>
                <div className="field-box" style={{ padding: "10px 14px" }}>
                  <select value={collSym} onChange={e => setCollSym(e.target.value)}>
                    {assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <AmountField label="Debt to repay" value={amount} onChange={setAmount} suffix={debtSym} />

            {needsApproval ? (
              <button className="btn btn-primary btn-block btn-lg"
                disabled={!valid || parsed === 0n || approveTx.isPending || !debtAsset}
                onClick={() => approveTx.write({
                  address: debtAsset!.address, abi: ERC20_ABI,
                  functionName: "approve", args: [addrs.LENDING_POOL, parsed],
                })}>
                {approveTx.isPending ? "Approving…" : `Approve ${debtSym}`}
              </button>
            ) : (
              <button className="btn btn-danger btn-block btn-lg"
                disabled={!valid || !liquidatable || parsed === 0n || liqTx.isPending || !debtAsset || !collAsset}
                onClick={() => liqTx.write({
                  address: addrs.LENDING_POOL, abi: LENDING_POOL_ABI,
                  functionName: "liquidate",
                  args: [borrower as `0x${string}`, debtAsset!.address, collAsset!.address, parsed],
                })}>
                {liqTx.isPending ? "Liquidating…" : liquidatable ? "Execute liquidation" : "Position is healthy"}
              </button>
            )}
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div className="card card-aurora card-sheen" style={{ textAlign: "center" }}>
            <div className="stat-label" style={{ marginBottom: 16 }}>Target health factor</div>
            {!valid ? (
              <p style={{ color: "var(--text-muted)", padding: "40px 0" }}>Enter a borrower address to scan.</p>
            ) : isFetching && !liqData ? (
              <p className="skeleton" style={{ width: 140, height: 60, margin: "40px auto" }} />
            ) : (
              <>
                <HealthGauge hf={hf ?? null} />
                <div style={{ marginTop: 20, textAlign: "left" }}>
                  <div className="inforow"><span>Collateral</span>
                    <b>${liqData ? (Number(liqData[0]) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</b></div>
                  <div className="inforow"><span>Debt</span>
                    <b>${liqData ? (Number(liqData[1]) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</b></div>
                  <div className="inforow"><span>Status</span>
                    {liquidatable
                      ? <span className="chip chip-danger">LIQUIDATABLE</span>
                      : <span className="chip chip-mint">HEALTHY</span>}
                  </div>
                </div>
              </>
            )}
            <div className="hr" />
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, textAlign: "left" }}>
              Liquidators receive the seized collateral plus a bonus. Close factor caps a single
              liquidation at 50% of the borrower&apos;s debt.
            </p>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
