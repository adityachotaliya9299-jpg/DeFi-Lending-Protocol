// Formatting utilities for the protocol UI

const WAD = BigInt("1000000000000000000"); // 1e18

/** Format a WAD (1e18) value to a human-readable USD string. */
export function formatUsd(wad: bigint, decimals = 2): string {
  const num = Number(wad) / 1e18;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/** Format a token amount given its decimals. */
export function formatToken(amount: bigint, decimals: number, places = 4): string {
  const num = Number(amount) / 10 ** decimals;
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  });
}

/** Format a WAD health factor (1e18 = 1.0). */
export function formatHealthFactor(hf: bigint): string {
  if (hf === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"))
    return "∞";
  const num = Number(hf) / 1e18;
  return num.toFixed(2);
}

/** Health factor colour class for Tailwind. */
export function healthFactorColor(hf: bigint): string {
  if (hf === BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"))
    return "text-emerald-400";
  const num = Number(hf) / 1e18;
  if (num >= 2.0)  return "text-emerald-400";
  if (num >= 1.5)  return "text-green-400";
  if (num >= 1.2)  return "text-yellow-400";
  if (num >= 1.05) return "text-orange-400";
  return "text-red-400";
}

/** Format a percentage expressed in basis points (10_000 = 100%). */
export function formatBps(bps: bigint | number): string {
  const n = typeof bps === "bigint" ? Number(bps) : bps;
  return (n / 100).toFixed(2) + "%";
}

/** Format APY from a per-second RAY rate. */
export function formatApy(perSecondRay: bigint): string {
  const SECONDS_PER_YEAR = 365 * 24 * 3600;
  const annualRate = (Number(perSecondRay) / 1e27) * SECONDS_PER_YEAR * 100;
  return annualRate.toFixed(2) + "%";
}

/** Format utilization from RAY (1e27 = 100%). */
export function formatUtilization(utilizationRay: bigint): string {
  const pct = (Number(utilizationRay) / 1e27) * 100;
  return pct.toFixed(1) + "%";
}

/** Shorten an Ethereum address. */
export function shortenAddress(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}