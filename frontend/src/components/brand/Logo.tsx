"use client";

import { useId } from "react";

/**
 * LendFi brand mark — "the vault aperture".
 * A hexagonal vault ring with an ascending liquidity glyph (three rising bars
 * forming an abstract L). Drawn once, scaled anywhere. Aurora gradient stroke.
 */

export function LogoMark({ size = 40, glow = true }: { size?: number; glow?: boolean }) {
  // unique, hydration-stable gradient ids so multiple instances don't collide
  const id = `lfg${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden
      style={glow ? { filter: "drop-shadow(0 0 10px rgba(70,245,201,.45))" } : undefined}>
      <defs>
        <linearGradient id={`${id}-a`} x1="8" y1="56" x2="56" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#46f5c9" />
          <stop offset="0.55" stopColor="#58a8ff" />
          <stop offset="1" stopColor="#9d7bff" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="16" y1="52" x2="48" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#46f5c9" />
          <stop offset="1" stopColor="#58a8ff" />
        </linearGradient>
      </defs>

      {/* outer hex ring */}
      <path
        d="M32 3.5 L56.5 17.5 V46.5 L32 60.5 L7.5 46.5 V17.5 Z"
        stroke={`url(#${id}-a)`}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      {/* inner hex, rotated feel via inset */}
      <path
        d="M32 13 L48 22.3 V41.7 L32 51 L16 41.7 V22.3 Z"
        stroke={`url(#${id}-a)`}
        strokeOpacity="0.35"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* ascending liquidity bars — abstract L */}
      <rect x="22" y="34" width="6" height="10" rx="2" fill={`url(#${id}-b)`} />
      <rect x="30" y="27" width="6" height="17" rx="2" fill={`url(#${id}-b)`} fillOpacity="0.8" />
      <rect x="38" y="20" width="6" height="24" rx="2" fill={`url(#${id}-b)`} fillOpacity="0.55" />
      {/* base line of the L */}
      <rect x="22" y="44" width="22" height="3.4" rx="1.7" fill={`url(#${id}-b)`} />
    </svg>
  );
}

export function Logo({ size = 36, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
      <LogoMark size={size} />
      {withText && (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: size * 0.52,
            letterSpacing: "-0.01em",
            color: "var(--text-primary)",
          }}>
            Lend<span className="grad-text">Fi</span>
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: Math.max(8.5, size * 0.24),
            letterSpacing: "0.3em",
            color: "var(--text-muted)",
            marginTop: 3,
            textTransform: "uppercase",
          }}>
            Protocol
          </span>
        </span>
      )}
    </span>
  );
}
