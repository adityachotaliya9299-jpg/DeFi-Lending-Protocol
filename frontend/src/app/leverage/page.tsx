"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, AmountField, TokenIcon, Reveal, EmptyState } from "@/components/ui/kit";
import { LOOP_STRATEGY_ABI } from "@/constants/abisExtended";
import { ERC20_ABI } from "@/constants/abis";
import { EXT_ADDRESSES } from "@/constants/addresses";
import { useProtocolData } from "@/hooks/useProtocolData";
import { useTokenBalance, useTokenAllowance } from "@/hooks/useProtocol";
import { useTx } from "@/hooks/useTx";

const LOOP = EXT_ADDRESSES.LOOP_STRATEGY;

/** leverage = (1 - ltv^loops) / (1 - ltv) — geometric series of re-deposits */
function calcLeverage(ltvBps: number, loops: number) {
  const r = ltvBps / 10_000;
  if (r >= 1) return loops + 1;
  let sum = 0;
  for (let i = 0; i <= loops; i++) sum += Math.pow(r, i);
  return sum;
}

export default function LeveragePage() {
  const { address, isConnected } = useAccount();
  const { assets } = useProtocolData();
  const [collSym, setCollSym] = useState("WETH");
  const [amount, setAmount] = useState("");
  const [loops, setLoops] = useState(3);
  const [ltv, setLtv] = useState(6000); // bps

  const collAsset = assets.find(a => a.symbol === collSym);

  const { data: position, refetch } = useReadContract({
    address: LOOP, abi: LOOP_STRATEGY_ABI, functionName: "getPosition",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const { data: balance } = useTokenBalance(collAsset?.address ?? "0x0000000000000000000000000000000000000000");
  const { data: allowance, refetch: refetchAllow } = useTokenAllowance(
    collAsset?.address ?? "0x0000000000000000000000000000000000000000", LOOP);

  const approveTx = useTx(`Approve ${collSym}`);
  const openTx = useTx("Open leveraged position");
  const closeTx = useTx("Close position");
  if (approveTx.isSuccess) refetchAllow();
  if (openTx.isSuccess || closeTx.isSuccess) refetch();

  const parsed = useMemo(() => {
    try { return amount && collAsset ? parseUnits(amount, collAsset.decimals) : 0n; }
    catch { return 0n; }
  }, [amount, collAsset]);

  const leverage = calcLeverage(ltv, loops);
  const exposure = Number(amount || 0) * leverage;
  const exposureUsd = collAsset ? exposure * collAsset.priceUsd : 0;
  const needsApproval = parsed > 0n && (allowance ?? 0n) < parsed;
  const hasPosition = position?.isOpen ?? false;

  return (
    <PageShell
      eyebrow="Loop leverage · Phase 4"
      title={<>Leverage in <span className="grad-text">one transaction.</span></>}
      sub="LoopStrategy folds the deposit → borrow → re-deposit cycle into a single call — up to 4× exposure, unwound just as atomically."
    >
      <div className="split">
        <Reveal>
          <div className="card card-aurora card-sheen" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {!isConnected ? (
              <EmptyState icon="⟠" title="Connect to open a position" action={<ConnectButton />} />
            ) : hasPosition ? (
              <>
                <h3 style={{ fontSize: 18 }}>Your open position</h3>
                <div>
                  <div className="inforow"><span>Collateral asset</span>
                    <b>{assets.find(a => a.address.toLowerCase() === position!.collateralAsset.toLowerCase())?.symbol ?? position!.collateralAsset.slice(0, 8)}</b></div>
                  <div className="inforow"><span>Initial collateral</span>
                    <b>{collAsset ? Number(formatUnits(position!.initialCollateral, collAsset.decimals)).toLocaleString("en-US", { maximumFractionDigits: 5 }) : "—"}</b></div>
                  <div className="inforow"><span>Total collateral (looped)</span>
                    <b style={{ color: "var(--mint)" }}>{collAsset ? Number(formatUnits(position!.totalCollateral, collAsset.decimals)).toLocaleString("en-US", { maximumFractionDigits: 5 }) : "—"}</b></div>
                  <div className="inforow"><span>Total debt</span>
                    <b style={{ color: "var(--coral)" }}>{collAsset ? Number(formatUnits(position!.totalDebt, collAsset.decimals)).toLocaleString("en-US", { maximumFractionDigits: 5 }) : "—"}</b></div>
                  <div className="inforow"><span>Loops executed</span><b>{position!.loops.toString()}</b></div>
                </div>
                <button className="btn btn-danger btn-block btn-lg" disabled={closeTx.isPending}
                  onClick={() => closeTx.write({ address: LOOP, abi: LOOP_STRATEGY_ABI, functionName: "closePosition" })}>
                  {closeTx.isPending ? "Unwinding…" : "Close & unwind position"}
                </button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {assets.map(a => (
                    <button key={a.symbol}
                      className={`btn btn-sm ${collSym === a.symbol ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setCollSym(a.symbol)}>
                      <TokenIcon symbol={a.symbol} size={18} /> {a.symbol}
                    </button>
                  ))}
                </div>

                <AmountField label="Initial collateral" value={amount} onChange={setAmount} suffix={collSym}
                  max={balance !== undefined && collAsset ? formatUnits(balance, collAsset.decimals) : undefined} />

                <div className="field">
                  <div className="field-label">
                    <span>Loops</span><span style={{ letterSpacing: 0 }}>{loops}×</span>
                  </div>
                  <input type="range" min={1} max={5} step={1} value={loops}
                    onChange={e => setLoops(Number(e.target.value))} className="lf-range" />
                </div>

                <div className="field">
                  <div className="field-label">
                    <span>LTV per loop</span><span style={{ letterSpacing: 0 }}>{(ltv / 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min={2000} max={7500} step={250} value={ltv}
                    onChange={e => setLtv(Number(e.target.value))} className="lf-range" />
                </div>

                {needsApproval ? (
                  <button className="btn btn-primary btn-block btn-lg"
                    disabled={parsed === 0n || approveTx.isPending || !collAsset}
                    onClick={() => approveTx.write({
                      address: collAsset!.address, abi: ERC20_ABI,
                      functionName: "approve", args: [LOOP, parsed],
                    })}>
                    {approveTx.isPending ? "Approving…" : `Approve ${collSym}`}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-block btn-lg"
                    disabled={parsed === 0n || openTx.isPending || !collAsset}
                    onClick={() => openTx.write({
                      address: LOOP, abi: LOOP_STRATEGY_ABI, functionName: "openPosition",
                      args: [collAsset!.address, collAsset!.address, parsed, BigInt(loops), BigInt(ltv)],
                    })}>
                    {openTx.isPending ? "Looping…" : `Open ${leverage.toFixed(2)}× position`}
                  </button>
                )}
              </>
            )}
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* leverage readout */}
            <div className="card card-sheen" style={{ textAlign: "center", padding: "30px 24px" }}>
              <div className="stat-label">Projected leverage</div>
              <div className="stat-value aurora-live" style={{ fontSize: 58, margin: "10px 0" }}>
                {leverage.toFixed(2)}×
              </div>
              <div className="stat-sub">
                {exposure > 0
                  ? <>total exposure ≈ <b className="num">{exposure.toLocaleString("en-US", { maximumFractionDigits: 4 })} {collSym}</b> (${exposureUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })})</>
                  : "enter an amount to project exposure"}
              </div>
              {/* loop visual */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 7, marginTop: 26, height: 90 }}>
                {Array.from({ length: loops + 1 }, (_, i) => {
                  const h = Math.pow(ltv / 10_000, i) * 90;
                  return (
                    <div key={i} style={{
                      width: 30, height: Math.max(6, h), borderRadius: 6,
                      background: i === 0 ? "var(--aurora)" : "var(--aurora-soft)",
                      border: "1px solid var(--border-strong)",
                      transition: "height .5s var(--ease-out)",
                    }} title={`loop ${i}`} />
                  );
                })}
              </div>
              <div className="stat-sub" style={{ marginTop: 10 }}>each bar = collateral added per loop</div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 15.5, marginBottom: 10 }}>⚠ Leverage cuts both ways</h3>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.75 }}>
                A {leverage.toFixed(1)}× position multiplies both yield and drawdown. A{" "}
                {(100 / leverage).toFixed(0)}% adverse move can wipe your equity. The audit&apos;s H-08 finding
                (cross-asset pricing) means same-asset loops are the safe configuration on testnet.
              </p>
            </div>
          </div>
        </Reveal>
      </div>

      <style>{`
        .lf-range {
          width: 100%;
          accent-color: #46f5c9;
          height: 32px;
          cursor: pointer;
        }
      `}</style>
    </PageShell>
  );
}
