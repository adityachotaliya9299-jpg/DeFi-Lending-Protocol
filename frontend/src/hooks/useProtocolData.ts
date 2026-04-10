"use client";

/**
 * useProtocolData — Single source of truth for all protocol data.
 *
 * ONE batched multicall fetches everything. Every page (dashboard, risk,
 * analytics, portfolio, markets) reads from this shared cache via React Query.
 * No duplicate RPC calls. No stale inconsistencies between pages.
 *
 * Architecture:
 *   useProtocolData() → useReadContracts (batched) → QueryClient cache
 *                                                        ↑
 *   Dashboard, Risk, Analytics, Portfolio all read here ─┘
 */

import { useReadContracts, useAccount, useChainId, usePublicClient } from "wagmi";
import { useState, useEffect } from "react";
import { LENDING_POOL_ABI, PRICE_ORACLE_ABI, LENDING_POOL_EXTENDED_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";
import { SUPPORTED_ASSETS } from "@/constants/assets";

const RAY = 1e27;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AssetData {
  symbol:         string;
  address:        `0x${string}`;
  decimals:       number;
  priceUsd:       number;        // WAD-normalised
  totalDepositUsd:number;
  totalBorrowUsd: number;
  availableLiq:   number;        // USD
  utilization:    number;        // 0–100
  supplyApy:      number;        // %
  borrowApy:      number;        // %
  ltv:            number;        // bps
  liqThreshold:   number;        // bps
  liquidityIndex: bigint;
  borrowIndex:    bigint;
  totalScaledDeposits: bigint;
  totalScaledBorrows:  bigint;
  isBorrowEnabled:boolean;
  isActive:       boolean;
}

export interface ProtocolTotals {
  tvlUsd:              number;
  totalBorrowUsd:      number;
  totalAvailableUsd:   number;
  weightedSupplyApy:   number;
  weightedBorrowApy:   number;
  isPaused:            boolean;
}

export interface UserData {
  totalCollateralUsd: number;
  totalDebtUsd:       number;
  healthFactor:       bigint;
  availableBorrowUsd: number;
  deposits:           Record<string, bigint>;  // symbol → raw amount
  debts:              Record<string, bigint>;
}

export interface ProtocolData {
  assets:        AssetData[];
  totals:        ProtocolTotals;
  user:          UserData | null;
  isLoading:     boolean;
  isError:       boolean;
  lastUpdated:   number;     // timestamp ms
  refetch:       ()=>void;
}

// ── APY calculation ───────────────────────────────────────────────────────────
function calcApy(totalLiq: number, totalBor: number, rf = 0.1) {
  if (totalLiq === 0) return { supplyApy: 0, borrowApy: 0 };
  const util = totalBor / totalLiq, opt = 0.8;
  const base = 0.01/SECONDS_PER_YEAR, s1 = 0.04/SECONDS_PER_YEAR, s2 = 0.75/SECONDS_PER_YEAR;
  const bps  = util <= opt ? base + s1*(util/opt) : base + s1 + s2*((util-opt)/(1-opt));
  const borrowApy = bps * SECONDS_PER_YEAR * 100;
  return { supplyApy: borrowApy * util * (1 - rf), borrowApy };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useProtocolData(): ProtocolData {
  const { address } = useAccount();
  const chainId     = useChainId();
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  let poolAddr:   `0x${string}` = "0x0";
  let oracleAddr: `0x${string}` = "0x0";

  try {
    const addrs = getAddresses(chainId);
    poolAddr   = addrs.LENDING_POOL;
    oracleAddr = addrs.PRICE_ORACLE;
  } catch {}

  // Resolved asset addresses
  const assetAddrs = SUPPORTED_ASSETS.map(a => {
    try {
      const addrs = getAddresses(chainId);
      return (addrs[a.symbol as keyof typeof addrs] as `0x${string}`) ?? a.address;
    } catch { return a.address; }
  });

  // ── Build batched multicall contracts array ───────────────────────────────
  const contracts: any[] = [];

  // 1. paused()
  contracts.push({ address: poolAddr, abi: LENDING_POOL_EXTENDED_ABI, functionName: "paused" });

  // 2. Per-asset: getReserveData + getPrice  (2 calls × 3 assets = 6)
  assetAddrs.forEach(addr => {
    contracts.push({ address: poolAddr,   abi: LENDING_POOL_ABI,   functionName: "getReserveData", args: [addr] });
    contracts.push({ address: oracleAddr, abi: PRICE_ORACLE_ABI,   functionName: "getPrice",       args: [addr] });
  });

  // 3. User data (if connected): getUserAccountData + getUserDeposit×3 + getUserDebt×3
  if (address) {
    contracts.push({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "getUserAccountData", args: [address] });
    assetAddrs.forEach(addr => {
      contracts.push({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "getUserDeposit", args: [address, addr] });
    });
    assetAddrs.forEach(addr => {
      contracts.push({ address: poolAddr, abi: LENDING_POOL_ABI, functionName: "getUserDebt", args: [address, addr] });
    });
  }

  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts,
    query: {
      enabled:        poolAddr !== "0x0" && oracleAddr !== "0x0",
      refetchInterval: 15_000,
      staleTime:       10_000,
    },
  });

  // ── Parse results ─────────────────────────────────────────────────────────
  if (!data || isLoading) {
    return {
      assets: [], totals: { tvlUsd:0, totalBorrowUsd:0, totalAvailableUsd:0,
        weightedSupplyApy:0, weightedBorrowApy:0, isPaused:false },
      user: null, isLoading, isError, lastUpdated, refetch,
    };
  }

  let idx = 0;

  // 1. Paused
  const isPaused = (data[idx++]?.result as boolean) ?? false;

  // 2. Assets
  const assets: AssetData[] = SUPPORTED_ASSETS.map((asset, i) => {
    const reserveRaw = data[idx++]?.result as any;
    const priceRaw   = data[idx++]?.result as bigint | undefined;

    if (!reserveRaw || priceRaw === undefined) {
      return {
        symbol: asset.symbol, address: assetAddrs[i], decimals: asset.decimals,
        priceUsd: 0, totalDepositUsd: 0, totalBorrowUsd: 0, availableLiq: 0,
        utilization: 0, supplyApy: 0, borrowApy: 0, ltv: 0, liqThreshold: 0,
        liquidityIndex: 1n, borrowIndex: 1n, totalScaledDeposits: 0n, totalScaledBorrows: 0n,
        isBorrowEnabled: false, isActive: false,
      };
    }

    const priceUsd        = Number(priceRaw) / 1e18;
    const liquidityIndex  = BigInt(reserveRaw.liquidityIndex);
    const borrowIndex     = BigInt(reserveRaw.borrowIndex);
    const totalDep        = (Number(reserveRaw.totalScaledDeposits) * Number(liquidityIndex)) / RAY;
    const totalBor        = (Number(reserveRaw.totalScaledBorrows)  * Number(borrowIndex))    / RAY;
    const totalDepUsd     = (totalDep / 10**asset.decimals) * priceUsd;
    const totalBorUsd     = (totalBor / 10**asset.decimals) * priceUsd;
    const utilization     = totalDep > 0 ? (totalBor / totalDep) * 100 : 0;
    const rf              = asset.symbol === "USDC" ? 0.05 : 0.1;
    const { supplyApy, borrowApy } = calcApy(totalDep, totalBor, rf);

    return {
      symbol: asset.symbol, address: assetAddrs[i], decimals: asset.decimals,
      priceUsd, totalDepositUsd: totalDepUsd, totalBorrowUsd: totalBorUsd,
      availableLiq: totalDepUsd - totalBorUsd,
      utilization, supplyApy, borrowApy,
      ltv: 0, liqThreshold: 0,  // from CollateralManager — extend if needed
      liquidityIndex, borrowIndex,
      totalScaledDeposits: BigInt(reserveRaw.totalScaledDeposits),
      totalScaledBorrows:  BigInt(reserveRaw.totalScaledBorrows),
      isBorrowEnabled: reserveRaw.isBorrowEnabled ?? false,
      isActive:        reserveRaw.isActive        ?? false,
    };
  });

  // Protocol totals
  const tvlUsd          = assets.reduce((s,a) => s + a.totalDepositUsd, 0);
  const totalBorrowUsd  = assets.reduce((s,a) => s + a.totalBorrowUsd,  0);
  const totalAvailableUsd = assets.reduce((s,a) => s + a.availableLiq, 0);
  const weightedSupplyApy = tvlUsd > 0
    ? assets.reduce((s,a) => s + a.supplyApy * a.totalDepositUsd, 0) / tvlUsd : 0;
  const weightedBorrowApy = totalBorrowUsd > 0
    ? assets.reduce((s,a) => s + a.borrowApy * a.totalBorrowUsd, 0) / totalBorrowUsd : 0;

  const totals: ProtocolTotals = {
    tvlUsd, totalBorrowUsd, totalAvailableUsd,
    weightedSupplyApy, weightedBorrowApy, isPaused,
  };

  // 3. User
  let user: UserData | null = null;
  if (address) {
    const accountRaw = data[idx++]?.result as bigint[] | undefined;
    const deposits: Record<string,bigint> = {};
    const debts:    Record<string,bigint> = {};

    SUPPORTED_ASSETS.forEach((a, i) => {
      deposits[a.symbol] = (data[idx++]?.result as bigint) ?? 0n;
    });
    SUPPORTED_ASSETS.forEach((a, i) => {
      debts[a.symbol] = (data[idx++]?.result as bigint) ?? 0n;
    });

    if (accountRaw) {
      const MAX_HF = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      user = {
        totalCollateralUsd: Number(accountRaw[0]) / 1e18,
        totalDebtUsd:       Number(accountRaw[1]) / 1e18,
        healthFactor:       accountRaw[2] as bigint,
        availableBorrowUsd: Number(accountRaw[3]) / 1e18,
        deposits,
        debts,
      };
    }
  }

  return { assets, totals, user, isLoading: false, isError, lastUpdated, refetch };
}