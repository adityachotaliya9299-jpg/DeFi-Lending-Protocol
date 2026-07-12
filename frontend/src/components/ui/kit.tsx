"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   LendFi UI kit — shared primitives for the Deepfield design system.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Reveal: animate children into view on scroll ──────────────────────────── */
export function Reveal({ children, delay = 0, className = "" }: {
  children: ReactNode; delay?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("in");
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ── CountUp: animated numeric display ─────────────────────────────────────── */
export function CountUp({ value, prefix = "", suffix = "", decimals = 2, duration = 1200 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number; duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (!isFinite(value)) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className="num">
      {prefix}
      {display.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ── PageShell: page header with eyebrow / title / sub ─────────────────────── */
export function PageShell({ eyebrow, title, sub, children, wide = false, actions }: {
  eyebrow: string; title: ReactNode; sub?: ReactNode; children: ReactNode; wide?: boolean; actions?: ReactNode;
}) {
  return (
    <div className={`page ${wide ? "page-wide" : ""}`}>
      <header className="page-head animate-fade-in">
        <span className="eyebrow">{eyebrow}</span>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <div>
            <h1 className="page-title">{title}</h1>
            {sub && <p className="page-sub" style={{ margin: 0 }}>{sub}</p>}
          </div>
          {actions}
        </div>
      </header>
      {children}
    </div>
  );
}

/* ── Stat block ────────────────────────────────────────────────────────────── */
export function Stat({ label, value, sub, accent, loading }: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: string; loading?: boolean;
}) {
  return (
    <div className="card card-sheen hoverable" style={{ padding: "22px 24px" }}>
      <div className="stat-label" style={{ marginBottom: 10 }}>{label}</div>
      <div className={`stat-value ${loading ? "skeleton" : ""}`} style={accent ? { color: accent } : undefined}>
        {loading ? "0000" : value}
      </div>
      {sub && <div className="stat-sub" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────────────── */
export function Tabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="tabs">
      {options.map(o => (
        <button key={o.value} className={`tab ${value === o.value ? "active" : ""}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── AmountField ───────────────────────────────────────────────────────────── */
export function AmountField({ label, value, onChange, suffix, max, hint, placeholder = "0.00" }: {
  label: string; value: string; onChange: (v: string) => void;
  suffix?: ReactNode; max?: string; hint?: ReactNode; placeholder?: string;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {hint && <span style={{ textTransform: "none", letterSpacing: 0 }}>{hint}</span>}
      </div>
      <div className="field-box">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
        {max !== undefined && (
          <button className="max-btn" onClick={() => onChange(max)}>MAX</button>
        )}
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

/* ── EmptyState ────────────────────────────────────────────────────────────── */
export function EmptyState({ icon, title, sub, action }: {
  icon?: ReactNode; title: string; sub?: string; action?: ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", color: "var(--text-secondary)" }}>
      <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.8 }}>{icon ?? "◇"}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--text-primary)" }}>
        {title}
      </div>
      {sub && <p style={{ fontSize: 14, maxWidth: 380, margin: "8px auto 0" }}>{sub}</p>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}

/* ── HealthGauge: animated SVG arc for health factor ───────────────────────── */
export function HealthGauge({ hf, size = 210 }: { hf: number | null; size?: number }) {
  // hf null = no debt (∞)
  const clamped = hf === null ? 3 : Math.max(0, Math.min(hf, 3));
  const frac = clamped / 3;
  const R = 84;
  const CIRC = Math.PI * R;
  const color =
    hf === null ? "var(--mint)" :
    hf >= 2 ? "var(--mint)" :
    hf >= 1.5 ? "var(--azure)" :
    hf >= 1.1 ? "var(--amber)" : "var(--coral)";
  const label =
    hf === null ? "NO DEBT" :
    hf >= 2 ? "EXCELLENT" :
    hf >= 1.5 ? "HEALTHY" :
    hf >= 1.1 ? "CAUTION" : "AT RISK";

  return (
    <div style={{ position: "relative", width: size, margin: "0 auto" }}>
      <svg width={size} height={size * 0.62} viewBox="0 0 200 124">
        <defs>
          <linearGradient id="hg-grad" x1="0" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff6e7f" />
            <stop offset="0.4" stopColor="#ffb454" />
            <stop offset="0.7" stopColor="#58a8ff" />
            <stop offset="1" stopColor="#46f5c9" />
          </linearGradient>
        </defs>
        <path d="M 16 108 A 84 84 0 0 1 184 108" fill="none" stroke="var(--border-strong)" strokeWidth="4" strokeLinecap="round" />
        <path
          d="M 16 108 A 84 84 0 0 1 184 108"
          fill="none"
          stroke="url(#hg-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - frac)}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)", filter: `drop-shadow(0 0 8px ${hf !== null && hf < 1.1 ? "rgba(255,110,127,.6)" : "rgba(70,245,201,.45)"})` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: "38% 0 0", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: size * 0.16, color, lineHeight: 1 }}>
          {hf === null ? "∞" : hf > 99 ? "99+" : hf.toFixed(2)}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.24em", color: "var(--text-muted)", marginTop: 6 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

/* ── Sparkline: deterministic decorative micro-chart ───────────────────────── */
export function Sparkline({ seed, value, color = "var(--mint)", width = 96, height = 30 }: {
  seed: string; value: number; color?: string; width?: number; height?: number;
}) {
  // deterministic pseudo-random walk from seed + current value so it's stable per asset
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967295;
  };
  const N = 22;
  const pts: number[] = [];
  let v = 0.5;
  for (let i = 0; i < N; i++) {
    v += (rand() - 0.48) * 0.22;
    v = Math.max(0.08, Math.min(0.92, v));
    pts.push(v);
  }
  // bias the tail toward the live value's parity so it feels connected
  pts[N - 1] = Math.max(0.1, Math.min(0.9, 0.35 + (value % 10) / 18));
  const step = width / (N - 1);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${((1 - p) * height).toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  const gid = `sl-${h}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ── TokenIcon: hand-drawn SVG marks, no CDN ───────────────────────────────── */
export function TokenIcon({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const s = symbol.toUpperCase();
  const common = { width: size, height: size, viewBox: "0 0 32 32", style: { display: "block", flexShrink: 0 } as const };

  if (s.includes("ETH")) return (
    <svg {...common}>
      <circle cx="16" cy="16" r="16" fill="#1b2340" />
      <path d="M16 5 L23 16.2 L16 20.5 L9 16.2 Z" fill="#8ba6ff" />
      <path d="M16 5 L23 16.2 L16 13.4 Z" fill="#aabfff" />
      <path d="M16 22.4 L22.6 18 L16 27 L9.4 18 Z" fill="#8ba6ff" opacity="0.8" />
    </svg>
  );
  if (s.includes("USDC") || s === "PUSD") return (
    <svg {...common}>
      <circle cx="16" cy="16" r="16" fill={s === "PUSD" ? "#123b32" : "#173a63"} />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke={s === "PUSD" ? "#46f5c9" : "#6db2ff"} strokeWidth="2" strokeDasharray="44 8" strokeLinecap="round" />
      <text x="16" y="21" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="12" fill={s === "PUSD" ? "#46f5c9" : "#6db2ff"}>$</text>
    </svg>
  );
  if (s.includes("LINK")) return (
    <svg {...common}>
      <circle cx="16" cy="16" r="16" fill="#20264d" />
      <path d="M16 6 L24 11 V21 L16 26 L8 21 V11 Z" fill="none" stroke="#7c9dff" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M16 12 L19.5 14.2 V18 L16 20 L12.5 18 V14.2 Z" fill="#7c9dff" />
    </svg>
  );
  if (s.includes("BTC")) return (
    <svg {...common}>
      <circle cx="16" cy="16" r="16" fill="#3d2a12" />
      <text x="16" y="21.5" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="15" fill="#f5c36b">₿</text>
    </svg>
  );
  // generic
  return (
    <svg {...common}>
      <circle cx="16" cy="16" r="16" fill="#1c2438" />
      <text x="16" y="21" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="11" fill="#94a5c6">
        {s.slice(0, 2)}
      </text>
    </svg>
  );
}

/* ── UtilBar: utilization meter with label ─────────────────────────────────── */
export function UtilBar({ pct }: { pct: number }) {
  const danger = pct > 85;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 120 }}>
      <div className={`meter ${danger ? "danger" : ""}`} style={{ flex: 1 }}>
        <span style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="num" style={{ fontSize: 12.5, color: danger ? "var(--coral)" : "var(--text-secondary)", width: 44, textAlign: "right" }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}
