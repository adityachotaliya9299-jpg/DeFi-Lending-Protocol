"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, AmountField, Reveal, EmptyState, Stat, TokenIcon } from "@/components/ui/kit";
import { RISK_GOVERNANCE_ABI } from "@/constants/abisExtended";
import { EXT_ADDRESSES } from "@/constants/addresses";
import { useProtocolData } from "@/hooks/useProtocolData";
import { useTx } from "@/hooks/useTx";

const GOV = EXT_ADDRESSES.RISK_GOVERNANCE;

const PARAMS = ["Max LTV", "Liq. threshold", "Liq. bonus", "Reserve factor"];
const MAX_LISTED = 8;

export default function GovernancePage() {
  const { isConnected } = useAccount();
  const { assets } = useProtocolData();
  const [symbol, setSymbol] = useState("WETH");
  const [paramType, setParamType] = useState(0);
  const [newValue, setNewValue] = useState("");

  const asset = assets.find(a => a.symbol === symbol);

  const { data: count, refetch: refetchCount } = useReadContract({
    address: GOV, abi: RISK_GOVERNANCE_ABI, functionName: "proposalCount",
    query: { refetchInterval: 15_000 },
  });

  const n = Number(count ?? 0n);
  const ids = useMemo(
    () => Array.from({ length: Math.min(n, MAX_LISTED) }, (_, i) => BigInt(n - 1 - i)),
    [n],
  );

  const { data: proposals, refetch: refetchProps } = useReadContracts({
    contracts: ids.flatMap(id => [
      { address: GOV, abi: RISK_GOVERNANCE_ABI, functionName: "getProposal" as const, args: [id] as const },
      { address: GOV, abi: RISK_GOVERNANCE_ABI, functionName: "isVotingActive" as const, args: [id] as const },
    ]),
    query: { enabled: ids.length > 0, refetchInterval: 15_000 },
  });

  const proposeTx = useTx("Create proposal");
  const voteTx = useTx("Cast vote");
  const execTx = useTx("Execute proposal");
  if (proposeTx.isSuccess) refetchCount();
  if (voteTx.isSuccess || execTx.isSuccess) refetchProps();

  const symbolOf = (addr: string) =>
    assets.find(a => a.address.toLowerCase() === addr.toLowerCase())?.symbol ?? `${addr.slice(0, 6)}…`;

  return (
    <PageShell
      eyebrow="Risk governance · Phase 4"
      title={<>Parameters, <span className="grad-text">by consensus.</span></>}
      sub="Token-weighted voting over the risk surface — every LTV, threshold, bonus and reserve factor passes through a vote and a timelock."
      wide
    >
      <div className="grid-3" style={{ marginBottom: 26 }}>
        <Stat label="Total proposals" value={<span className="num">{n}</span>} />
        <Stat label="Voting period" value="3 days" sub="Then a 1-day timelock" accent="var(--azure)" />
        <Stat label="Adjustable params" value="4" sub="LTV · threshold · bonus · reserve factor" accent="var(--violet)" />
      </div>

      <div className="split">
        {/* proposal list */}
        <Reveal>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: 17 }}>Recent proposals</h3>
            </div>
            {n === 0 ? (
              <EmptyState icon="⬢" title="No proposals yet" sub="Be the first to propose a risk-parameter change." />
            ) : (
              <div>
                {ids.map((id, i) => {
                  const p = proposals?.[i * 2]?.result as any;
                  const active = (proposals?.[i * 2 + 1]?.result as boolean) ?? false;
                  if (!p || !p.exists) return null;
                  const forV = Number(p.forVotes) / 1e18;
                  const agV = Number(p.againstVotes) / 1e18;
                  const total = forV + agV;
                  const pct = total > 0 ? (forV / total) * 100 : 0;
                  return (
                    <div key={id.toString()} style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                          <span className="num" style={{ color: "var(--violet)" }}>#{id.toString()}</span>
                          <b style={{ fontFamily: "var(--font-display)", fontSize: 14.5 }}>
                            {symbolOf(p.asset)} · {PARAMS[p.paramType] ?? `param ${p.paramType}`} → {(Number(p.newValue) / 100).toFixed(2)}%
                          </b>
                        </span>
                        {p.executed
                          ? <span className="chip chip-mint">executed</span>
                          : active
                            ? <span className="chip chip-azure">voting</span>
                            : <span className="chip chip-gold">timelock / ready</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                        <div className="meter" style={{ flex: 1, height: 8 }}>
                          <span style={{ width: `${pct}%` }} />
                        </div>
                        <span className="num" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {forV.toFixed(0)} for · {agV.toFixed(0)} against
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="btn btn-ghost btn-sm" disabled={!active || voteTx.isPending || !isConnected}
                          onClick={() => voteTx.write({ address: GOV, abi: RISK_GOVERNANCE_ABI, functionName: "castVote", args: [id, true] })}>
                          ✓ For
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={!active || voteTx.isPending || !isConnected}
                          onClick={() => voteTx.write({ address: GOV, abi: RISK_GOVERNANCE_ABI, functionName: "castVote", args: [id, false] })}>
                          ✗ Against
                        </button>
                        {!p.executed && !active && (
                          <button className="btn btn-primary btn-sm" disabled={execTx.isPending || !isConnected}
                            onClick={() => execTx.write({ address: GOV, abi: RISK_GOVERNANCE_ABI, functionName: "execute", args: [id] })}>
                            Execute
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Reveal>

        {/* propose */}
        <Reveal delay={90}>
          <div className="card card-aurora card-sheen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <h3 style={{ fontSize: 17 }}>New proposal</h3>
            {!isConnected ? (
              <EmptyState icon="⬢" title="Connect to propose" action={<ConnectButton />} />
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {assets.map(a => (
                    <button key={a.symbol}
                      className={`btn btn-sm ${symbol === a.symbol ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setSymbol(a.symbol)}>
                      <TokenIcon symbol={a.symbol} size={17} /> {a.symbol}
                    </button>
                  ))}
                </div>

                <div className="field">
                  <div className="field-label"><span>Parameter</span></div>
                  <div className="field-box" style={{ padding: "10px 14px" }}>
                    <select value={paramType} onChange={e => setParamType(Number(e.target.value))}>
                      {PARAMS.map((p, i) => <option key={p} value={i}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <AmountField label="New value (bps)" value={newValue} onChange={setNewValue}
                  suffix="bps" placeholder="8000"
                  hint={newValue ? `= ${(Number(newValue) / 100).toFixed(2)}%` : undefined} />

                <button className="btn btn-primary btn-block btn-lg"
                  disabled={!asset || !Number(newValue) || proposeTx.isPending}
                  onClick={() => proposeTx.write({
                    address: GOV, abi: RISK_GOVERNANCE_ABI, functionName: "propose",
                    args: [asset!.address, paramType, BigInt(newValue || "0")],
                  })}>
                  {proposeTx.isPending ? "Submitting…" : "Submit proposal"}
                </button>

                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  Voting runs for 3 days with token-weighted power; passed proposals sit in a
                  1-day timelock before anyone can execute them.
                </p>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
