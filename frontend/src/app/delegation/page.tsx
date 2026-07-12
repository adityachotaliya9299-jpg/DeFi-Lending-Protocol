"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Tabs, AmountField, Reveal, EmptyState } from "@/components/ui/kit";
import { CREDIT_DELEGATION_ABI } from "@/constants/abis";
import { CREDIT_DELEGATION_ADDRESS } from "@/constants/addresses";
import { useProtocolData } from "@/hooks/useProtocolData";
import { useTx } from "@/hooks/useTx";

type Tab = "grant" | "borrow";

export default function DelegationPage() {
  const { address, isConnected } = useAccount();
  const { assets } = useProtocolData();
  const [tab, setTab] = useState<Tab>("grant");
  const [counterparty, setCounterparty] = useState("");
  const [symbol, setSymbol] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("30");

  const configured = CREDIT_DELEGATION_ADDRESS !== "0x0";
  const asset = assets.find(a => a.symbol === symbol);
  const valid = isAddress(counterparty);

  const parsed = useMemo(() => {
    try { return amount && asset ? parseUnits(amount, asset.decimals) : 0n; }
    catch { return 0n; }
  }, [amount, asset]);

  const { data: credit } = useReadContract({
    address: CREDIT_DELEGATION_ADDRESS,
    abi: CREDIT_DELEGATION_ABI,
    functionName: "availableCredit",
    args: valid && address && asset
      ? (tab === "grant"
          ? [address, counterparty as `0x${string}`, asset.address]
          : [counterparty as `0x${string}`, address, asset.address])
      : undefined,
    query: { enabled: configured && valid && !!address && !!asset, refetchInterval: 15_000 },
  });

  const grantTx  = useTx("Approve delegation");
  const revokeTx = useTx("Revoke delegation");
  const borrowTx = useTx("Delegated borrow");

  return (
    <PageShell
      eyebrow="Credit delegation"
      title={<>Lend your <span className="grad-text">borrowing power.</span></>}
      sub="Delegate unused credit to another address — they borrow against your collateral, your terms, your expiry."
    >
      {!configured && (
        <div className="chip chip-danger" style={{ marginBottom: 20, padding: "10px 18px" }}>
          ⚠ NEXT_PUBLIC_CREDIT_DELEGATION is not configured — set it in .env.local to enable this page.
        </div>
      )}

      {!isConnected ? (
        <div className="card card-aurora" style={{ padding: 60 }}>
          <EmptyState icon="⧉" title="Connect to manage delegations" action={<ConnectButton />} />
        </div>
      ) : (
        <div className="split">
          <Reveal>
            <div className="card card-sheen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Tabs value={tab} onChange={setTab} options={[
                { value: "grant",  label: "Grant credit" },
                { value: "borrow", label: "Borrow as delegatee" },
              ]} />

              <div className="field">
                <div className="field-label">
                  <span>{tab === "grant" ? "Delegatee address" : "Delegator address"}</span>
                </div>
                <div className="field-box">
                  <input type="text" placeholder="0x…" value={counterparty}
                    onChange={e => setCounterparty(e.target.value.trim())} style={{ fontSize: 15 }} />
                </div>
              </div>

              <div className="field">
                <div className="field-label"><span>Asset</span></div>
                <div className="field-box" style={{ padding: "10px 14px" }}>
                  <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                    {assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                  </select>
                </div>
              </div>

              <AmountField label={tab === "grant" ? "Credit line" : "Amount to borrow"}
                value={amount} onChange={setAmount} suffix={symbol} />

              {tab === "grant" && (
                <AmountField label="Expiry (days from now)" value={days} onChange={setDays} suffix="days" placeholder="30" />
              )}

              {tab === "grant" ? (
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="btn btn-primary btn-lg" style={{ flex: 1 }}
                    disabled={!configured || !valid || parsed === 0n || grantTx.isPending || !asset}
                    onClick={() => grantTx.write({
                      address: CREDIT_DELEGATION_ADDRESS, abi: CREDIT_DELEGATION_ABI,
                      functionName: "approveDelegation",
                      args: [counterparty as `0x${string}`, asset!.address, parsed,
                        BigInt(Math.floor(Date.now() / 1000) + Number(days || 30) * 86400)],
                    })}>
                    {grantTx.isPending ? "Confirming…" : "Grant credit"}
                  </button>
                  <button className="btn btn-ghost btn-lg"
                    disabled={!configured || !valid || revokeTx.isPending || !asset}
                    onClick={() => revokeTx.write({
                      address: CREDIT_DELEGATION_ADDRESS, abi: CREDIT_DELEGATION_ABI,
                      functionName: "revokeDelegation",
                      args: [counterparty as `0x${string}`, asset!.address],
                    })}>
                    Revoke
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary btn-block btn-lg"
                  disabled={!configured || !valid || parsed === 0n || borrowTx.isPending || !asset}
                  onClick={() => borrowTx.write({
                    address: CREDIT_DELEGATION_ADDRESS, abi: CREDIT_DELEGATION_ABI,
                    functionName: "borrowWithDelegation",
                    args: [counterparty as `0x${string}`, asset!.address, parsed],
                  })}>
                  {borrowTx.isPending ? "Confirming…" : "Borrow with delegation"}
                </button>
              )}
            </div>
          </Reveal>

          <Reveal delay={90}>
            <div className="card card-aurora">
              <h3 style={{ fontSize: 16, marginBottom: 16 }}>Live credit line</h3>
              <div className="stat-value" style={{ fontSize: 34 }}>
                {credit !== undefined && asset
                  ? `${Number(formatUnits(credit as bigint, asset.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${symbol}`
                  : "—"}
              </div>
              <div className="stat-sub" style={{ marginTop: 6 }}>
                {tab === "grant"
                  ? "Remaining credit you have granted to this delegatee"
                  : "Credit still available for you to draw from this delegator"}
              </div>
              <div className="hr" />
              <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13, lineHeight: 2 }}>
                <li>Delegator supplies collateral to the pool.</li>
                <li>Delegator grants a credit line with an expiry.</li>
                <li>Delegatee borrows — debt lands on the delegator&apos;s account.</li>
                <li>Anyone can repay via <code className="num">repayDelegation</code>.</li>
              </ol>
            </div>
          </Reveal>
        </div>
      )}
    </PageShell>
  );
}
