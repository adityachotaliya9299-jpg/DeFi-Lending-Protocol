"use client";

import { useCallback, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast, decodeError } from "@/components/ui/Toast";
import type { Abi } from "viem";


export function useTx(actionLabel: string) {
  const pendingId = useRef<string | null>(null);

  const { writeContract, data: txHash, isPending: isSignPending, error: writeError } = useWriteContract();
  const { isLoading: isMining, isSuccess, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const write = useCallback(
    (config: Parameters<typeof writeContract>[0]) => {
      // Show "waiting for wallet" toast
      pendingId.current = toast.pending(
        `${actionLabel}`,
        "Confirm in your wallet…"
      );

      writeContract(config, {
        onSuccess(hash) {
          // Wallet signed — update to "pending on chain"
          if (pendingId.current) {
            toast.update(pendingId.current, {
              title:   `${actionLabel} submitted`,
              message: "Waiting for confirmation…",
              txHash:  hash,
              duration: 0,
            });
          }
        },
        onError(err) {
          if (pendingId.current) toast.dismiss(pendingId.current);
          pendingId.current = null;
          toast.error(`${actionLabel} failed`, decodeError(err));
        },
      });
    },
    [writeContract, actionLabel]
  );

  // Watch for mining completion
  if (isSuccess && txHash && pendingId.current) {
    toast.update(pendingId.current, {
      type:     "success",
      title:    `${actionLabel} confirmed`,
      message:  `Block ${receipt?.blockNumber ?? "—"}`,
      txHash,
      duration: 6000,
    });
    pendingId.current = null;
  }

  return {
    write,
    txHash,
    isPending: isSignPending || isMining,
    isSuccess,
  };
}