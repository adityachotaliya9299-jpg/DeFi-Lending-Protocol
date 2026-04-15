"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import {
  apolloClient, checkSubgraphHealth,
  USER_POSITIONS_QUERY, USER_HISTORY_QUERY,
  SubgraphPosition, HistoryEvent, LiqHistoryEvent,
} from "@/lib/graphql";

export interface SubgraphData {
  positions:    SubgraphPosition[];
  deposits:     HistoryEvent[];
  borrows:      HistoryEvent[];
  repays:       HistoryEvent[];
  withdraws:    HistoryEvent[];
  liquidations: LiqHistoryEvent[];
  depositCount: number;
  borrowCount:  number;
  isLive:       boolean;
  isLoading:    boolean;
}

const EMPTY: SubgraphData = {
  positions: [], deposits: [], borrows: [], repays: [],
  withdraws: [], liquidations: [], depositCount: 0,
  borrowCount: 0, isLive: false, isLoading: false,
};

/**
 * useSubgraphPositions
 *
 * Fetches a user's complete on-chain history from The Graph subgraph.
 * Returns positions (current balances), full transaction history
 * (deposits/borrows/repays/withdraws), and liquidation events.
 *
 * Falls back to empty data gracefully when subgraph is not configured.
 */
export function useSubgraphPositions(): SubgraphData {
  const { address } = useAccount();
  const [data, setData] = useState<SubgraphData>(EMPTY);

  useEffect(() => {
    if (!address) { setData(EMPTY); return; }

    let cancelled = false;
    setData(prev => ({ ...prev, isLoading: true }));

    const fetch = async () => {
      const healthy = await checkSubgraphHealth();
      if (!healthy || cancelled) {
        if (!cancelled) setData({ ...EMPTY, isLoading: false });
        return;
      }

      const userLower = address.toLowerCase();

      try {
        const [posRes, histRes] = await Promise.all([
          apolloClient.query({
            query: USER_POSITIONS_QUERY,
            variables: { user: userLower },
          }),
          apolloClient.query({
            query: USER_HISTORY_QUERY,
            variables: { user: userLower },
          }),
        ]);

        if (cancelled) return;

        const account      = (posRes.data  as any)?.account;
        const positions    = account?.positions ?? [];
        const hist         = histRes.data as any;

        setData({
          positions,
          deposits:     hist?.deposits    ?? [],
          borrows:      hist?.borrows     ?? [],
          repays:       hist?.repays      ?? [],
          withdraws:    hist?.withdraws   ?? [],
          liquidations: hist?.liquidations ?? [],
          depositCount: account?.depositCount ?? 0,
          borrowCount:  account?.borrowCount  ?? 0,
          isLive:    true,
          isLoading: false,
        });
      } catch (err: any) {
        console.warn("[useSubgraphPositions] query failed:", err.message);
        if (!cancelled) setData({ ...EMPTY, isLoading: false });
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [address]);

  return data;
}