"use client";

import { useMemo, useState } from "react";
import { useReadContracts, useChainId } from "wagmi";
import { formatUnits } from "viem";
import { PageShell, Stat, AmountField, TokenIcon, Reveal } from "@/components/ui/kit";
import { LENDING_POOL_EXTENDED_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { useProtocolData } from "@/hooks/useProtocolData";

const FEE_BPS = 9; // 0.09%

const RECEIVER_SNIPPET = `contract MyFlashReceiver is IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external returns (bool) {
        // 1. use the liquidity: arbitrage, refinance, liquidate...
        // 2. approve repayment of amount + fee
        IERC20(asset).approve(msg.sender, amount + fee);
        return true;
    }
}`;

export default function FlashLoanPage() {
  const chainId = useChainId();
  const { assets } = useProtocolData();
  const [symbol, setSymbol] = useState("USDC");
  const [amount, setAmount] = useState("");

  const pool = getAddresses(chainId).LENDING_POOL;
  const asset = assets.find(a => a.symbol === symbol) ?? assets[0];

  const { data: maxData } = useReadContracts({
    contracts: assets.map(a => ({
      address: pool,
      abi: LENDING_POOL_EXTENDED_ABI,
      functionName: "maxFlashLoan" as const,
      args: [a.address] as const,
    })),
    query: { enabled: assets.length > 0, refetchInterval: 15_000 },
  });

  const maxBySymbol: Record<string, bigint> = {};
  assets.forEach((a, i) => { maxBySymbol[a.symbol] = (maxData?.[i]?.result as bigint) ?? 0n; });

  const amtNum = Number(amount || 0);
  const fee = amtNum * FEE_BPS / 10_000;
  const feeUsd = asset ? fee * asset.priceUsd : 0;

  return (
    <PageShell
      eyebrow="Flash loans"
      title={<>Liquidity, <span className="grad-text">for one block.</span></>}
      sub="Borrow the pool's entire free liquidity without collateral — as long as principal + 0.09% comes back in the same transaction."
    >
      <div className="grid-3" style={{ marginBottom: 26 }}>
        {assets.map(a => (
          <Stat key={a.symbol}
            label={`Max flashable · ${a.symbol}`}
            value={<span className="num">{Number(formatUnits(maxBySymbol[a.symbol] ?? 0n, a.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>}
            sub={`≈ $${(Number(formatUnits(maxBySymbol[a.symbol] ?? 0n, a.decimals)) * a.priceUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
        ))}
      </div>

      <div className="split">
        <Reveal>
          <div className="card card-sheen">
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Fee simulator</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 0 }}>
              Flash loans execute through a receiver contract — simulate the cost here.
            </p>

            <div style={{ display: "flex", gap: 10, margin: "18px 0", flexWrap: "wrap" }}>
              {assets.map(a => (
                <button key={a.symbol}
                  className={`btn btn-sm ${symbol === a.symbol ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setSymbol(a.symbol)}>
                  <TokenIcon symbol={a.symbol} size={18} /> {a.symbol}
                </button>
              ))}
            </div>

            <AmountField label="Loan amount" value={amount} onChange={setAmount} suffix={symbol}
              max={asset ? formatUnits(maxBySymbol[symbol] ?? 0n, asset.decimals) : undefined} />

            <div style={{ marginTop: 18 }}>
              <div className="inforow"><span>Fee rate</span><b>0.09%</b></div>
              <div className="inforow"><span>Fee</span>
                <b style={{ color: "var(--mint)" }}>{fee.toLocaleString("en-US", { maximumFractionDigits: 6 })} {symbol}</b>
              </div>
              <div className="inforow"><span>Fee in USD</span><b>${feeUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
              <div className="inforow"><span>Total repayment</span>
                <b>{(amtNum + fee).toLocaleString("en-US", { maximumFractionDigits: 6 })} {symbol}</b>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div className="card card-aurora" style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 16 }}>Receiver contract</h3>
              <span className="chip chip-violet">Solidity</span>
            </div>
            <pre style={{
              margin: 0, padding: 18, borderRadius: 14,
              background: "var(--bg-input)", border: "1px solid var(--border)",
              fontFamily: "var(--font-mono)", fontSize: 11.6, lineHeight: 1.7,
              color: "var(--text-secondary)", overflowX: "auto",
            }}>{RECEIVER_SNIPPET}</pre>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "14px 0 0" }}>
              Call <code className="num" style={{ color: "var(--mint)" }}>flashLoan(receiver, asset, amount, params)</code>{" "}
              on the LendingPool. If the receiver fails to repay principal + fee, the whole transaction reverts —
              the pool can never lose funds.
            </p>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
