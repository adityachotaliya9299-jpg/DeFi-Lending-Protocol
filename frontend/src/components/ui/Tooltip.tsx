"use client";
import React, { useState, useRef } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ content, children, position = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const posStyle: React.CSSProperties =
    position === "top"    ? { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" } :
    position === "bottom" ? { top:    "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" } :
    position === "left"   ? { right:  "calc(100% + 8px)", top:  "50%", transform: "translateY(-50%)" } :
                            { left:   "calc(100% + 8px)", top:  "50%", transform: "translateY(-50%)" };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div style={{
          position: "absolute", zIndex: 9000, pointerEvents: "none",
          ...posStyle,
          background: "#0d1117", border: "1px solid var(--border-accent)",
          borderRadius: 8, padding: "7px 11px",
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          maxWidth: 240, whiteSpace: "pre-wrap" as React.CSSProperties["whiteSpace"],
          wordBreak: "break-word" as const,
          animation: "fadeIn 0.12s ease",
        }}>
          {content}
          <style>{`@keyframes fadeIn { from{opacity:0;transform:${
            position==="top" ? "translateX(-50%) translateY(4px)" :
            position==="bottom" ? "translateX(-50%) translateY(-4px)" : "translateY(-50%)"
          }} to{opacity:1;transform:${
            position==="top"||position==="bottom" ? "translateX(-50%) translateY(0)" : "translateY(-50%)"
          }} }`}</style>
        </div>
      )}
    </div>
  );
}

// ── Info icon with tooltip ────────────────────────────────────────────────────
export function InfoTip({ text, position = "top" }: { text: string; position?: "top"|"bottom"|"left"|"right" }) {
  return (
    <Tooltip content={text} position={position}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 15, height: 15, borderRadius: "50%",
        background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
        fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
        cursor: "help", flexShrink: 0,
      }}>?</span>
    </Tooltip>
  );
}