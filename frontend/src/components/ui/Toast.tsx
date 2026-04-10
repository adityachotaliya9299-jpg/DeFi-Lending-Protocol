"use client";

import { useEffect, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "pending" | "info";

export interface ToastItem {
  id:      string;
  type:    ToastType;
  title:   string;
  message?: string;
  txHash?: string;
  duration?: number; // ms, 0 = sticky
}

// ── Global toast store (simple pub/sub, no external lib needed) ───────────────
type Listener = (toasts: ToastItem[]) => void;
let _toasts:   ToastItem[] = [];
let _listeners: Listener[] = [];

function notify() { _listeners.forEach(fn => fn([..._toasts])); }

export const toast = {
  show(item: Omit<ToastItem, "id">): string {
    const id = Math.random().toString(36).slice(2);
    _toasts = [{ ...item, id }, ..._toasts].slice(0, 5);
    notify();
    if (item.duration !== 0) {
      setTimeout(() => toast.dismiss(id), item.duration ?? 5000);
    }
    return id;
  },
  dismiss(id: string) {
    _toasts = _toasts.filter(t => t.id !== id);
    notify();
  },
  pending(title: string, message?: string) {
    return toast.show({ type: "pending", title, message, duration: 0 });
  },
  success(title: string, message?: string, txHash?: string) {
    return toast.show({ type: "success", title, message, txHash, duration: 6000 });
  },
  error(title: string, message?: string) {
    return toast.show({ type: "error", title, message, duration: 8000 });
  },
  info(title: string, message?: string) {
    return toast.show({ type: "info", title, message, duration: 4000 });
  },
  update(id: string, item: Partial<ToastItem>) {
    _toasts = _toasts.map(t => t.id === id ? { ...t, ...item } : t);
    // Re-schedule auto-dismiss if duration changed
    if (item.duration && item.duration > 0) {
      setTimeout(() => toast.dismiss(id), item.duration);
    }
    notify();
  },
};

// ── useToasts hook ─────────────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    _listeners.push(setToasts);
    setToasts([..._toasts]);
    return () => { _listeners = _listeners.filter(fn => fn !== setToasts); };
  }, []);
  return toasts;
}

// ── Decode revert reason ──────────────────────────────────────────────────────
export function decodeError(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? "Unknown error");

  // Common wagmi/viem error patterns
  if (msg.includes("User rejected"))         return "Transaction rejected in wallet";
  if (msg.includes("insufficient funds"))    return "Insufficient ETH for gas";
  if (msg.includes("HealthFactorTooLow"))    return "Health factor would drop below 1.0";
  if (msg.includes("InsufficientLiquidity")) return "Not enough liquidity in pool";
  if (msg.includes("BorrowNotEnabled"))      return "Borrowing is disabled for this asset";
  if (msg.includes("ZeroAmount"))            return "Amount cannot be zero";
  if (msg.includes("InsufficientBalance"))   return "No debt to repay";
  if (msg.includes("SameAsset"))             return "Collateral and debt asset must differ";
  if (msg.includes("ZeroAddress"))           return "Invalid address";
  if (msg.includes("AssetNotSupported"))     return "Asset not supported by protocol";
  if (msg.includes("IsolationBorrowNotAllowed")) return "Isolated collateral can only borrow stablecoins";
  if (msg.includes("IsolationDebtCeiling"))  return "Isolation debt ceiling reached";
  if (msg.includes("Paused"))                return "Protocol is paused — withdrawals still available";
  if (msg.includes("gas"))                   return "Transaction ran out of gas — try higher limit";

  // Try to extract a clean reason
  const revertMatch = msg.match(/reverted with reason string '(.+?)'/);
  if (revertMatch) return revertMatch[1];

  const shortMsg = msg.split("\n")[0].slice(0, 80);
  return shortMsg || "Transaction failed";
}

// ── Icon components ────────────────────────────────────────────────────────────
function Icon({ type }: { type: ToastType }) {
  if (type === "pending") return (
    <div style={{ width: 20, height: 20, borderRadius: "50%",
      border: "2px solid var(--cyan)", borderTopColor: "transparent",
      animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
  );
  if (type === "success") return (
    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#34d399",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ color: "#030712", fontSize: 11, fontWeight: 700 }}>✓</span>
    </div>
  );
  if (type === "error") return (
    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#ef4444",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✕</span>
    </div>
  );
  return (
    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--cyan)",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ color: "#030712", fontSize: 11, fontWeight: 700 }}>i</span>
    </div>
  );
}

// ── ToastContainer ────────────────────────────────────────────────────────────
export function ToastContainer() {
  const toasts = useToasts();

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
        .toast-item { animation: slideIn 0.25s cubic-bezier(0.16,1,0.3,1); }
      `}</style>
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        display: "flex", flexDirection: "column-reverse", gap: 10, maxWidth: 360, width: "100%" }}>
        {toasts.map(t => (
          <ToastCard key={t.id} toast={t} onDismiss={() => toast.dismiss(t.id)} />
        ))}
      </div>
    </>
  );
}

function ToastCard({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const borderColor = t.type === "success" ? "#34d399"
    : t.type === "error"   ? "#ef4444"
    : t.type === "pending" ? "var(--cyan)"
    : "var(--border-accent)";

  return (
    <div className="toast-item" style={{ background: "var(--bg-card)", border: `1px solid ${borderColor}30`,
      borderLeft: `3px solid ${borderColor}`, borderRadius: 14,
      padding: "14px 16px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      backdropFilter: "blur(16px)", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <Icon type={t.type} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13,
          color: "var(--text-primary)", marginBottom: t.message || t.txHash ? 4 : 0 }}>{t.title}</p>
        {t.message && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)",
            lineHeight: 1.5 }}>{t.message}</p>
        )}
        {t.txHash && (
          <a href={`https://sepolia.etherscan.io/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--cyan)",
              textDecoration: "none", display: "block", marginTop: 4 }}>
            {t.txHash.slice(0,10)}…{t.txHash.slice(-8)} ↗
          </a>
        )}
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer",
        color: "var(--text-muted)", fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 0 }}>✕</button>
    </div>
  );
}