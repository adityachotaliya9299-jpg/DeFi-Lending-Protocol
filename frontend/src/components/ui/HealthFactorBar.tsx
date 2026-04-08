"use client";

import { formatHealthFactor, healthFactorColor } from "@/lib/format";

interface Props {
  healthFactor: bigint;
  size?: "sm" | "lg";
}

export function HealthFactorBar({ healthFactor, size = "sm" }: Props) {
  const MAX_UINT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const isInfinite = healthFactor === MAX_UINT;
  const hfNum = isInfinite ? 999 : Number(healthFactor) / 1e18;

  // Progress bar: 0→red, 1→orange, 1.5→yellow, 2→green
  const clampedPct = Math.min((hfNum / 3) * 100, 100);
  const barColor   =
    hfNum < 1.05 ? "bg-red-500" :
    hfNum < 1.2  ? "bg-orange-500" :
    hfNum < 1.5  ? "bg-yellow-500" :
    hfNum < 2.0  ? "bg-green-500" :
                   "bg-emerald-500";

  const textColor = healthFactorColor(healthFactor);
  const display   = formatHealthFactor(healthFactor);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Health Factor</span>
        <span className={`font-bold ${size === "lg" ? "text-2xl" : "text-sm"} ${textColor}`}>
          {display}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>Liquidation</span>
        <span>Safe zone</span>
      </div>
    </div>
  );
}