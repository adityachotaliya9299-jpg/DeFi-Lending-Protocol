"use client";
import { formatHealthFactor } from "@/lib/format";

interface Props { healthFactor: bigint; size?: "sm" | "lg"; }

export function HealthFactorBar({ healthFactor, size = "sm" }: Props) {
  const MAX_UINT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const isInfinite = healthFactor === MAX_UINT;
  const hfNum = isInfinite ? 999 : Number(healthFactor) / 1e18;

  const pct = Math.min((hfNum / 3) * 100, 100);

  const { color, bgColor, label } =
    hfNum < 1.05 ? { color: "#ef4444", bgColor: "rgba(239,68,68,0.15)", label: "Liquidatable" }
    : hfNum < 1.2  ? { color: "#f97316", bgColor: "rgba(249,115,22,0.15)", label: "Risky" }
    : hfNum < 1.5  ? { color: "#f59e0b", bgColor: "rgba(245,158,11,0.15)", label: "Moderate" }
    : hfNum < 2.0  ? { color: "#10b981", bgColor: "rgba(16,185,129,0.15)", label: "Healthy" }
    :                { color: "#22d3ee", bgColor: "rgba(34,211,238,0.15)", label: "Safe" };

  const display = formatHealthFactor(healthFactor);

  return (
    <div className="w-full">
      <div className="flex items-end justify-between mb-3">
        <div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
            Health Factor
          </p>
          <div className="flex items-baseline gap-2">
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: size === "lg" ? "2.5rem" : "1.4rem",
              fontWeight: 500,
              color,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}>
              {display}
            </span>
            <span className="badge" style={{ background: bgColor, color, border: `1px solid ${color}30`, fontSize: 10 }}>
              {label}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>Liquidation at &lt;1.0</p>
        </div>
      </div>

      {/* Track */}
      <div className="relative h-2 w-full rounded-full overflow-hidden"
        style={{ background: "var(--border)" }}>
        {/* Danger zone marker */}
        <div className="absolute top-0 h-full w-px z-10"
          style={{ left: "33.3%", background: "rgba(239,68,68,0.4)" }} />
        {/* Fill */}
        <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, #ef4444, ${color})`,
          }} />
      </div>

      <div className="flex justify-between mt-1.5">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#f87171" }}>Liquidation</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>1.0</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)" }}>Safe zone →</span>
      </div>
    </div>
  );
}