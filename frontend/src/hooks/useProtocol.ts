"use client";

import { useReadContract, useReadContracts, useAccount, useChainId } from "wagmi";
import { LENDING_POOL_ABI, PRICE_ORACLE_ABI, ERC20_ABI } from "@/constants/abis";
import { getAddresses } from "@/constants/addresses";

const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

// ── Hook: user's full account summary ────────────────────────────────────────

export function useUserAccountData() {
  const { address } = useAccount();
  const chainId     = useChainId();

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  return useReadContract({
    address: poolAddr,
    abi:     LENDING_POOL_ABI,
    functionName: "getUserAccountData",
    args:    address ? [address] : undefined,
    query:   { enabled: !!address && poolAddr !== "0x0", refetchInterval: 15_000 },
  });
}

// ── Hook: health factor ───────────────────────────────────────────────────────

export function useHealthFactor() {
  const { address } = useAccount();
  const chainId     = useChainId();

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  return useReadContract({
    address: poolAddr,
    abi:     LENDING_POOL_ABI,
    functionName: "getUserHealthFactor",
    args:    address ? [address] : undefined,
    query:   { enabled: !!address && poolAddr !== "0x0", refetchInterval: 15_000 },
  });
}

// ── Hook: reserve data for a single asset ────────────────────────────────────

export function useReserveData(assetAddress: `0x${string}`) {
  const chainId = useChainId();

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  return useReadContract({
    address: poolAddr,
    abi:     LENDING_POOL_ABI,
    functionName: "getReserveData",
    args:    [assetAddress],
    query:   { enabled: poolAddr !== "0x0", refetchInterval: 15_000 },
  });
}

// ── Hook: user deposit for an asset ──────────────────────────────────────────

export function useUserDeposit(assetAddress: `0x${string}`) {
  const { address } = useAccount();
  const chainId     = useChainId();

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  return useReadContract({
    address: poolAddr,
    abi:     LENDING_POOL_ABI,
    functionName: "getUserDeposit",
    args:    address ? [address, assetAddress] : undefined,
    query:   { enabled: !!address && poolAddr !== "0x0", refetchInterval: 15_000 },
  });
}

// ── Hook: user debt for an asset ──────────────────────────────────────────────

export function useUserDebt(assetAddress: `0x${string}`) {
  const { address } = useAccount();
  const chainId     = useChainId();

  let poolAddr: `0x${string}` = "0x0";
  try { poolAddr = getAddresses(chainId).LENDING_POOL; } catch {}

  return useReadContract({
    address: poolAddr,
    abi:     LENDING_POOL_ABI,
    functionName: "getUserDebt",
    args:    address ? [address, assetAddress] : undefined,
    query:   { enabled: !!address && poolAddr !== "0x0", refetchInterval: 15_000 },
  });
}

// ── Hook: asset price from oracle ────────────────────────────────────────────

export function useAssetPrice(assetAddress: `0x${string}`) {
  const chainId = useChainId();

  let oracleAddr: `0x${string}` = "0x0";
  try { oracleAddr = getAddresses(chainId).PRICE_ORACLE; } catch {}

  return useReadContract({
    address: oracleAddr,
    abi:     PRICE_ORACLE_ABI,
    functionName: "getPrice",
    args:    [assetAddress],
    query:   { enabled: oracleAddr !== "0x0", refetchInterval: 30_000 },
  });
}

// ── Hook: token balance ───────────────────────────────────────────────────────

export function useTokenBalance(tokenAddress: `0x${string}`) {
  const { address } = useAccount();

  return useReadContract({
    address: tokenAddress,
    abi:     ERC20_ABI,
    functionName: "balanceOf",
    args:    address ? [address] : undefined,
    query:   { enabled: !!address, refetchInterval: 15_000 },
  });
}

// ── Hook: token allowance ─────────────────────────────────────────────────────

export function useTokenAllowance(tokenAddress: `0x${string}`, spender: `0x${string}`) {
  const { address } = useAccount();

  return useReadContract({
    address: tokenAddress,
    abi:     ERC20_ABI,
    functionName: "allowance",
    args:    address ? [address, spender] : undefined,
    query:   { enabled: !!address, refetchInterval: 10_000 },
  });
}