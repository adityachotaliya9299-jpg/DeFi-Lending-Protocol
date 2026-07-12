"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, AmountField, Reveal, EmptyState, Stat } from "@/components/ui/kit";
import { IRSWAP_ABI } from "@/constants/abisExtended";
import { ERC20_ABI } from "@/constants/abis";
import { EXT_ADDRESSES } from "@/constants/addresses";
import { useProtocolData } from "@/hooks/useProtocolData";
import { useTokenAllowance } from "@/hooks/useProtocol";
import { useTx } from "@/hooks/useTx";

const IRSWAP = EXT_ADDRESSES.IRSWAP;

export default function SwapPage() {
  const { isConnected } = useAccount();
  const { assets } = useProtocolData();
  const [symbol, setSymbol] = useState("USDC");
  const [notional, setNotional] = useState("");
  const [fixedRate, setFixedRate] = useState("500"); // bps
  const [durationDays, setDurationDays] = useState("30");
  const [lookupId, setLookupId] = useState("");

  const asset = assets.find(a => a.symbol === symbol);

  const { data: swapCount } = useReadContract({
    address: IRSWAP, abi: IRSWAP_ABI, functionName: "swapCount",
    query: { refetchInterval: 15_000 },
  });
  const { data: varRate } = useReadContract({
    address: IRSWAP, abi: IRSWAP_ABI, functionName: "variableRates",
    args: asset ? [asset.address] : undefined,
    query: { enabled: !!asset, refetchInterval: 15_000 },
  });

  const id = lookupId !== "" && !isNaN(Number(lookupId)) ? BigInt(lookupId) : undefined;
  const { data: swap } = useReadContract({
    address: IRSWAP, abi: IRSWAP_ABI, functionName: "getSwap",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: id !== undefined },
  });
  const { data: settlement } = useReadContract({
    address: IRSWAP, abi: IRSWAP_ABI, functionName: "previewSettlement",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: id !== undefined && !!swap?.exists },
  });
  const { data: matured } = useReadContract({
    address: IRSWAP, abi: IRSWAP_ABI, functionName: "isMatured",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: id !== undefined && !!swap?.exists },
  });

  const parsed = useMemo(() => {
    try { return notional && asset ? parseUnits(notional, asset.decimals) : 0n; }
    catch { return 0n; }
  }, [notional, asset]);

  const { data: allowance, refetch: refetchAllow } = useTokenAllowance(
    asset?.address ?? "0x0000000000000000000000000000000000000000", IRSWAP);
  const approveTx = useTx(`Approve ${symbol}`);
  const openTx = useTx("Open rate swap");
  const settleTx = useTx("Settle swap");
  if (approveTx.isSuccess) refetchAllow();

  // collateral posted = 10% of notional (per contract design)
  const collateralNeeded = parsed / 10n;
  const needsApproval = parsed > 0n && (allowance ?? 0n) < collateralNeeded;
  const varRateBps = varRate !== undefined ? Number(varRate) : undefined;

  return (
    <PageShell
      eyebrow="Interest-rate swap · Phase 5"
      title={<>Fix your <span className="grad-text">funding cost.</span></>}
      sub="Pay fixed, receive variable. If variable rates rise above your fixed leg, the swap pays you — a hedge for borrowers, cash-settled at maturity."
    >
      <div className="grid-3" style={{ marginBottom: 26 }}>
        <Stat label="Total swaps opened" value={<span className="num">{swapCount?.toString() ?? "—"}</span>} />
        <Stat label={`Variable rate · ${symbol}`} accent="var(--azure)"
          value={varRateBps !== undefined ? `${(varRateBps / 100).toFixed(2)}%` : "—"}
          sub="Current floating leg (annualised)" />
        <Stat label="Collateral requirement" value="10%" sub="Of notional, posted at open" accent="var(--violet)" />
      </div>

      <div className="split">
        <Reveal>
          <div className="card card-aurora card-sheen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <h3 style={{ fontSize: 17 }}>Open a swap — pay fixed</h3>
            {!isConnected ? (
              <EmptyState icon="⇄" title="Connect to open a swap" action={<ConnectButton />} />
            ) : (
              <>
                <div className="field">
                  <div className="field-label"><span>Reference asset</span></div>
                  <div className="field-box" style={{ padding: "10px 14px" }}>
                    <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                      {assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                    </select>
                  </div>
                </div>

                <AmountField label="Notional" value={notional} onChange={setNotional} suffix={symbol} />
                <div className="grid-2" style={{ gap: 14 }}>
                  <AmountField label="Fixed rate (bps)" value={fixedRate} onChange={setFixedRate} suffix="bps" placeholder="500" />
                  <AmountField label="Duration (days)" value={durationDays} onChange={setDurationDays} suffix="days" placeholder="30" />
                </div>

                <div>
                  <div className="inforow"><span>Your fixed leg</span>
                    <b style={{ color: "var(--mint)" }}>{(Number(fixedRate || 0) / 100).toFixed(2)}% p.a.</b></div>
                  <div className="inforow"><span>Floating leg at open</span>
                    <b style={{ color: "var(--azure)" }}>{varRateBps !== undefined ? `${(varRateBps / 100).toFixed(2)}% p.a.` : "—"}</b></div>
                  <div className="inforow"><span>Collateral to post</span>
                    <b>{asset && parsed > 0n ? `${Number(formatUnits(collateralNeeded, asset.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${symbol}` : "—"}</b></div>
                </div>

                {needsApproval ? (
                  <button className="btn btn-primary btn-block btn-lg"
                    disabled={parsed === 0n || approveTx.isPending || !asset}
                    onClick={() => approveTx.write({
                      address: asset!.address, abi: ERC20_ABI,
                      functionName: "approve", args: [IRSWAP, collateralNeeded],
                    })}>
                    {approveTx.isPending ? "Approving…" : `Approve ${symbol} collateral`}
                  </button>
                ) : (
                  <button className="btn btn-primary btn-block btn-lg"
                    disabled={parsed === 0n || openTx.isPending || !asset || !Number(fixedRate) || !Number(durationDays)}
                    onClick={() => openTx.write({
                      address: IRSWAP, abi: IRSWAP_ABI, functionName: "openSwap",
                      args: [asset!.address, parsed, BigInt(fixedRate), BigInt(Number(durationDays) * 86400)],
                    })}>
                    {openTx.isPending ? "Opening…" : "Open swap"}
                  </button>
                )}
              </>
            )}
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div className="card card-sheen" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 style={{ fontSize: 17 }}>Inspect & settle</h3>
            <AmountField label="Swap ID" value={lookupId} onChange={setLookupId} placeholder="0" suffix="#" />

            {swap?.exists ? (
              <>
                <div>
                  <div className="inforow"><span>Owner</span><b>{swap.user.slice(0, 8)}…{swap.user.slice(-6)}</b></div>
                  <div className="inforow"><span>Notional</span>
                    <b>{asset ? Number(formatUnits(swap.notional, asset.decimals)).toLocaleString("en-US") : swap.notional.toString()}</b></div>
                  <div className="inforow"><span>Fixed leg</span><b>{(Number(swap.fixedRateBps) / 100).toFixed(2)}%</b></div>
                  <div className="inforow"><span>Variable at open</span><b>{(Number(swap.variableRateAtOpen) / 100).toFixed(2)}%</b></div>
                  <div className="inforow"><span>Maturity</span>
                    <b>{new Date(Number(swap.maturity) * 1000).toLocaleDateString()}</b></div>
                  <div className="inforow"><span>Status</span>
                    {swap.settled
                      ? <span className="chip">settled</span>
                      : matured
                        ? <span className="chip chip-mint">matured — settle now</span>
                        : <span className="chip chip-azure">running</span>}
                  </div>
                  {settlement !== undefined && (
                    <div className="inforow"><span>Projected settlement</span>
                      <b style={{ color: (settlement as bigint) >= 0n ? "var(--mint)" : "var(--coral)" }}>
                        {(settlement as bigint) >= 0n ? "receives " : "owes "}
                        {asset ? Number(formatUnits((settlement as bigint) < 0n ? -(settlement as bigint) : (settlement as bigint), asset.decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 }) : ""} {symbol}
                      </b>
                    </div>
                  )}
                </div>
                <button className="btn btn-primary btn-block"
                  disabled={!matured || swap.settled || settleTx.isPending}
                  onClick={() => settleTx.write({
                    address: IRSWAP, abi: IRSWAP_ABI, functionName: "settleSwap", args: [id!],
                  })}>
                  {settleTx.isPending ? "Settling…" : swap.settled ? "Already settled" : matured ? "Settle swap" : "Not yet matured"}
                </button>
              </>
            ) : lookupId !== "" ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>No swap found with that ID.</p>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
                Enter a swap ID (0 … {swapCount !== undefined && swapCount > 0n ? (swapCount - 1n).toString() : "0"}) to preview its
                cash settlement.
              </p>
            )}
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
