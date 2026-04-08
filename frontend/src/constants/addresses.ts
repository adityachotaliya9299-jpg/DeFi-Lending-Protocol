
const e = (key: string, fallback = "0x0") =>
  (process.env[key] ?? fallback) as `0x${string}`;

export const CONTRACT_ADDRESSES = {
  LENDING_POOL:       e("NEXT_PUBLIC_LENDING_POOL"),
  COLLATERAL_MANAGER: e("NEXT_PUBLIC_COLLATERAL_MANAGER"),
  PRICE_ORACLE:       e("NEXT_PUBLIC_PRICE_ORACLE"),
  GOVERNANCE:         e("NEXT_PUBLIC_GOVERNANCE"),
  LIQUIDATION_ENGINE: e("NEXT_PUBLIC_LIQUIDATION_ENGINE"),
} as const;

export const TOKEN_ADDRESSES = {
  WETH: e("NEXT_PUBLIC_WETH"),
  WBTC: e("NEXT_PUBLIC_WBTC"),
  USDC: e("NEXT_PUBLIC_USDC"),
  LINK: e("NEXT_PUBLIC_LINK"),
} as const;

export const LTOKEN_ADDRESSES = {
  LWETH: e("NEXT_PUBLIC_LWETH"),
  LWBTC: e("NEXT_PUBLIC_LWBTC"),
  LUSDC: e("NEXT_PUBLIC_LUSDC"),
  LLINK: e("NEXT_PUBLIC_LLINK"),
} as const;

// Convenience: get lending pool address (throws if not set)
export function getLendingPoolAddress(): `0x${string}` {
  const addr = CONTRACT_ADDRESSES.LENDING_POOL;
  if (addr === "0x0") throw new Error("NEXT_PUBLIC_LENDING_POOL not set in .env.local");
  return addr;
}

// Legacy helper used by hooks — resolves by symbol or contract name
export function getAddresses(chainId: number) {
  return {
    LENDING_POOL:       CONTRACT_ADDRESSES.LENDING_POOL,
    COLLATERAL_MANAGER: CONTRACT_ADDRESSES.COLLATERAL_MANAGER,
    PRICE_ORACLE:       CONTRACT_ADDRESSES.PRICE_ORACLE,
    GOVERNANCE:         CONTRACT_ADDRESSES.GOVERNANCE,
    LIQUIDATION_ENGINE: CONTRACT_ADDRESSES.LIQUIDATION_ENGINE,
    WETH:  TOKEN_ADDRESSES.WETH,
    WBTC:  TOKEN_ADDRESSES.WBTC,
    USDC:  TOKEN_ADDRESSES.USDC,
    LINK:  TOKEN_ADDRESSES.LINK,
    LWETH: LTOKEN_ADDRESSES.LWETH,
    LWBTC: LTOKEN_ADDRESSES.LWBTC,
    LUSDC: LTOKEN_ADDRESSES.LUSDC,
    LLINK: LTOKEN_ADDRESSES.LLINK,
  } as const;
}