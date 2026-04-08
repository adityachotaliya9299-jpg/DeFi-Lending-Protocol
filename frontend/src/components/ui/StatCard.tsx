interface StatCardProps {
  label:   string;
  value:   string;
  sub?:    string;
  accent?: "cyan" | "green" | "yellow" | "red" | "violet";
  icon?:   string;
}

const ACCENT_MAP = {
  cyan:   { color: "var(--cyan)",     bg: "var(--cyan-dim)",              border: "var(--border-accent)" },
  green:  { color: "#34d399",         bg: "rgba(16,185,129,0.1)",         border: "rgba(52,211,153,0.25)" },
  yellow: { color: "#fbbf24",         bg: "rgba(245,158,11,0.1)",         border: "rgba(251,191,36,0.25)" },
  red:    { color: "#f87171",         bg: "rgba(239,68,68,0.1)",          border: "rgba(248,113,113,0.25)" },
  violet: { color: "#a78bfa",         bg: "rgba(139,92,246,0.1)",         border: "rgba(167,139,250,0.25)" },
};

export function StatCard({ label, value, sub, accent = "cyan", icon }: StatCardProps) {
  const a = ACCENT_MAP[accent];
  return (
    <div className="card p-5 flex flex-col gap-2"
      style={{ borderColor: a.border }}>
      <div className="flex items-center justify-between">
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {label}
        </p>
        {icon && (
          <span className="text-lg" style={{ opacity: 0.6 }}>{icon}</span>
        )}
      </div>
      <p className="num" style={{ fontFamily: "var(--font-mono)", fontSize: "1.75rem", fontWeight: 500, color: a.color, letterSpacing: "-0.03em", lineHeight: 1 }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{sub}</p>
      )}
    </div>
  );
}