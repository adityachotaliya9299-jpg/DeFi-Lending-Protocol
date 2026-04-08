"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { LENDING_POOL_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { AssetInfo } from "@/types";
import { formatUsd } from "@/lib/format";
import { useUserAccountData } from "@/hooks/useProtocol";

interface Props {
  asset: AssetInfo;
  onClose: () => void;
}

export function BorrowModal({ asset, onClose }: Props) {
  const { address }  = useAccount();
  const chainId      = useChainId();
  const [amount, setAmount] = useState("");

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  const { data: accountData } = useUserAccountData();
  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isTxPending } = useWaitForTransactionReceipt({ hash: txHash });

  const parsedAmount = amount
    ? (() => { try { return parseUnits(amount, asset.decimals); } catch { return 0n; } })()
    : 0n;

  const available = accountData ? accountData[3] : 0n; // availableBorrowUsd

  const handleBorrow = useCallback(() => {
    if (!address || parsedAmount === 0n) return;
    writeContract({
      address: poolAddr,
      abi:     LENDING_POOL_ABI,
      functionName: "borrow",
      args:    [asset.address, parsedAmount],
    });
  }, [address, asset.address, poolAddr, parsedAmount, writeContract]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={asset.icon} alt={asset.symbol} className="h-6 w-6" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
            <h2 className="text-lg font-bold text-white">Borrow {asset.symbol}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="mb-3 flex justify-between rounded-lg bg-slate-800 p-3 text-xs">
          <span className="text-slate-400">Available to borrow</span>
          <span className="font-bold text-emerald-400">
            {available ? formatUsd(available) : "—"}
          </span>
        </div>

        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800 p-4">
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

        <button
          onClick={handleBorrow}
          disabled={isTxPending || parsedAmount === 0n || !address}
          className="w-full rounded-xl bg-violet-600 py-3.5 font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          {isTxPending ? "Borrowing…" : `Borrow ${asset.symbol}`}
        </button>

        {txHash && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Tx: {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </p>
        )}
      </div>
    </div>
  );
}