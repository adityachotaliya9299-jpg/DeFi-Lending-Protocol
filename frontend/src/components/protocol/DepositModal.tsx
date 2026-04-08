"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { LENDING_POOL_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { AssetInfo } from "@/types";
import { formatToken } from "@/lib/format";
import { useTokenBalance, useTokenAllowance } from "@/hooks/useProtocol";

interface Props {
  asset: AssetInfo;
  onClose: () => void;
}

type Step = "input" | "approve" | "deposit" | "done";

export function DepositModal({ asset, onClose }: Props) {
  const { address }   = useAccount();
  const chainId       = useChainId();
  const [amount, setAmount] = useState("");
  const [step, setStep]     = useState<Step>("input");

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  const { data: balance }    = useTokenBalance(asset.address);
  const { data: allowance }  = useTokenAllowance(asset.address, poolAddr);

  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isTxPending } = useWaitForTransactionReceipt({ hash: txHash });

  const parsedAmount = amount
    ? (() => { try { return parseUnits(amount, asset.decimals); } catch { return 0n; } })()
    : 0n;

  const needsApproval = allowance !== undefined && parsedAmount > 0n && allowance < parsedAmount;

  const handleApprove = useCallback(async () => {
    if (!address) return;
    setStep("approve");
    writeContract({
      address: asset.address,
      abi:     ERC20_ABI,
      functionName: "approve",
      args:    [poolAddr, parsedAmount],
    });
  }, [address, asset.address, poolAddr, parsedAmount, writeContract]);

  const handleDeposit = useCallback(async () => {
    if (!address || parsedAmount === 0n) return;
    setStep("deposit");
    writeContract({
      address: poolAddr,
      abi:     LENDING_POOL_ABI,
      functionName: "deposit",
      args:    [asset.address, parsedAmount],
    });
  }, [address, asset.address, poolAddr, parsedAmount, writeContract]);

  const setMax = () => {
    if (balance !== undefined) {
      setAmount((Number(balance) / 10 ** asset.decimals).toString());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={asset.icon} alt={asset.symbol} className="h-6 w-6" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
            <h2 className="text-lg font-bold text-white">Deposit {asset.symbol}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Amount input */}
        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">Amount</span>
            <button onClick={setMax} className="text-xs text-blue-400 hover:text-blue-300">
              Max: {balance !== undefined ? formatToken(balance, asset.decimals) : "—"}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder:text-slate-600"
            />
            <span className="text-sm font-medium text-slate-400">{asset.symbol}</span>
          </div>
        </div>

        {/* Action buttons */}
        {needsApproval ? (
          <button
            onClick={handleApprove}
            disabled={isTxPending || parsedAmount === 0n}
            className="w-full rounded-xl bg-yellow-500 py-3.5 font-bold text-black transition hover:bg-yellow-400 disabled:opacity-50"
          >
            {isTxPending ? "Approving…" : `Approve ${asset.symbol}`}
          </button>
        ) : (
          <button
            onClick={handleDeposit}
            disabled={isTxPending || parsedAmount === 0n || !address}
            className="w-full rounded-xl bg-blue-600 py-3.5 font-bold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {isTxPending ? "Depositing…" : `Deposit ${asset.symbol}`}
          </button>
        )}

        {txHash && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Tx: {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </p>
        )}
      </div>
    </div>
  );
}