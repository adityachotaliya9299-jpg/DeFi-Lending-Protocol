interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: "blue" | "green" | "yellow" | "red";
}

export function StatCard({ label, value, sub, accent = "blue" }: StatCardProps) {
  const accentClass = {
    blue:   "border-blue-500/30 text-blue-400",
    green:  "border-emerald-500/30 text-emerald-400",
    yellow: "border-yellow-500/30 text-yellow-400",
    red:    "border-red-500/30 text-red-400",
  }[accent];

  return (
    <div className={`rounded-xl border bg-slate-900 p-5 ${accentClass.split(" ")[0]}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accentClass.split(" ")[1]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}