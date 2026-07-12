"use client";

import { useMemo, useState } from "react";
import { parseUnits, formatUnits } from "viem";
import { useAccount, useChainId } from "wagmi";
import { LENDING_POOL_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { useTokenBalance, useTokenAllowance } from "@/hooks/useProtocol";
import { useTx } from "@/hooks/useTx";
import { AmountField, TokenIcon } from "@/components/ui/kit";
import type { AssetData } from "@/hooks/useProtocolData";

export type PoolAction = "supply" | "borrow" | "repay" | "withdraw";

const COPY: Record<PoolAction, { title: string; verb: string; blurb: string }> = {
  supply:   { title: "Supply",   verb: "Supply",   blurb: "Deposit into the pool and start earning the supply APY immediately." },
  borrow:   { title: "Borrow",   verb: "Borrow",   blurb: "Borrow against your collateral. Keep your health factor above 1.0." },
  repay:    { title: "Repay",    verb: "Repay",    blurb: "Repay outstanding debt to release borrowing capacity." },
  withdraw: { title: "Withdraw", verb: "Withdraw", blurb: "Withdraw supplied liquidity back to your wallet." },
};

export function ActionModal({ asset, action, onClose, userDeposit, userDebt }: {
  asset: AssetData;
  action: PoolAction;
  onClose: () => void;
  userDeposit?: bigint;
  userDebt?: bigint;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const [amount, setAmount] = useState("");

  const pool = getAddresses(chainId).LENDING_POOL;

  const { data: balance }   = useTokenBalance(asset.address);
  const { data: allowance, refetch: refetchAllowance } = useTokenAllowance(asset.address, pool);

  const approveTx = useTx(`Approve ${asset.symbol}`);
  const actionTx  = useTx(`${COPY[action].verb} ${asset.symbol}`);

  const parsed = useMemo(() => {
    try { return amount ? parseUnits(amount, asset.decimals) : 0n; }
    catch { return 0n; }
  }, [amount, asset.decimals]);

  const needsApproval = (action === "supply" || action === "repay") &&
    parsed > 0n && (allowance ?? 0n) < parsed;

  const maxRaw: bigint =
    action === "supply"   ? (balance ?? 0n) :
    action === "withdraw" ? (userDeposit ?? 0n) :
    action === "repay"    ? (userDebt ?? 0n) :
    0n; // borrow max depends on HF — leave free-form

  const maxStr = maxRaw > 0n ? formatUnits(maxRaw, asset.decimals) : undefined;
  const amountUsd = Number(amount || 0) * asset.priceUsd;

  const doApprove = () => {
    approveTx.write({
      address: asset.address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [pool, parsed],
    });
  };

  const doAction = () => {
    const fn = action === "supply" ? "deposit" : action;
    actionTx.write({
      address: pool,
      abi: LENDING_POOL_ABI,
      functionName: fn,
      args: [asset.address, parsed],
    });
  };

  if (approveTx.isSuccess) refetchAllowance();

  const busy = approveTx.isPending || actionTx.isPending;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TokenIcon symbol={asset.symbol} size={38} />
            <div>
              <h3 style={{ fontSize: 20 }}>{COPY[action].title} {asset.symbol}</h3>
              <div className="stat-sub">${asset.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} / token</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "10px 0 20px" }}>{COPY[action].blurb}</p>

        <AmountField
          label="Amount"
          value={amount}
          onChange={setAmount}
          suffix={asset.symbol}
          max={maxStr}
          hint={amountUsd > 0 ? `≈ $${amountUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : undefined}
        />

        <div style={{ margin: "18px 0 22px" }}>
          <div className="inforow"><span>Supply APY</span><b style={{ color: "var(--mint)" }}>{asset.supplyApy.toFixed(2)}%</b></div>
          <div className="inforow"><span>Borrow APY</span><b style={{ color: "var(--violet)" }}>{asset.borrowApy.toFixed(2)}%</b></div>
          <div className="inforow"><span>Pool utilisation</span><b>{asset.utilization.toFixed(1)}%</b></div>
          {action === "supply" && balance !== undefined && (
            <div className="inforow"><span>Wallet balance</span><b>{Number(formatUnits(balance, asset.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 })} {asset.symbol}</b></div>
          )}
        </div>

        {!address ? (
          <div className="chip chip-danger" style={{ width: "100%", justifyContent: "center", padding: 12 }}>
            Connect a wallet to continue
          </div>
        ) : needsApproval ? (
          <button className="btn btn-primary btn-block btn-lg" disabled={busy || parsed === 0n} onClick={doApprove}>
            {approveTx.isPending ? "Approving…" : `Approve ${asset.symbol}`}
          </button>
        ) : (
          <button className="btn btn-primary btn-block btn-lg" disabled={busy || parsed === 0n} onClick={doAction}>
            {actionTx.isPending ? "Confirming…" : `${COPY[action].verb} ${asset.symbol}`}
          </button>
        )}

        {(action === "supply" || action === "repay") && (
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", textAlign: "center", marginTop: 14, marginBottom: 0 }}>
            Step 1 approves the pool to move your {asset.symbol}; step 2 executes the {action}.
          </p>
        )}
      </div>
    </div>
  );
}
