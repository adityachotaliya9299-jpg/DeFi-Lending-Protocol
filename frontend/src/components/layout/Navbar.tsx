"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// ── Primary nav — 4 items always visible ─────────────────────────────────────
const PRIMARY_NAV = [
  { href: "/",          label: "Markets"   },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/vault",     label: "Vault"     },
  { href: "/analytics", label: "Analytics" },
];

// ── "More" dropdown — 5 secondary items ──────────────────────────────────────
const MORE_NAV = [
  { href: "/modes",      label: "E-Mode",      icon: "⚡" },
  { href: "/risk",       label: "Risk",         icon: "🛡" },
  { href: "/flashloan",  label: "Flash Loans",  icon: "⌁" },
  { href: "/liquidate",  label: "Liquidate",    icon: "⬡" },
  { href: "/delegation", label: "Delegation",   icon: "🤝" },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen,   setMoreOpen]   = useState(false);
  const [scrolled,   setScrolled]   = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); setMoreOpen(false); }, [pathname]);

  // Close "More" dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const isMoreActive = MORE_NAV.some(n => n.href === pathname);

  return (
    <>
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: scrolled ? "rgba(3,7,18,0.9)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
        transition: "all 0.25s",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px" }}>

          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(135deg, var(--cyan), #a78bfa)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, color: "#030712", fontWeight: 700 }}>⬡</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16,
                color: "var(--text-primary)" }}>LendFi</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--cyan)",
                background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)",
                borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>SEPOLIA</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 2,
            background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)",
            borderRadius: 14, padding: 4 }}
            className="hide-mobile">

            {/* Primary links */}
            {PRIMARY_NAV.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link key={href} href={href} style={{
                  textDecoration: "none", padding: "7px 16px", borderRadius: 10,
                  fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 13,
                  background: active ? "var(--cyan)" : "transparent",
                  color: active ? "#030712" : "var(--text-secondary)",
                  transition: "all 0.15s", whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}>
                  {label}
                </Link>
              );
            })}

            {/* More dropdown */}
            <div ref={moreRef} style={{ position: "relative" }}>
              <button onClick={() => setMoreOpen(o => !o)}
                style={{
                  padding: "7px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontWeight: isMoreActive ? 700 : 500, fontSize: 13,
                  background: isMoreActive ? "var(--cyan)" : moreOpen ? "rgba(255,255,255,0.07)" : "transparent",
                  color: isMoreActive ? "#030712" : "var(--text-secondary)",
                  display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
                }}>
                More
                <span style={{ fontSize: 9, opacity: 0.7, transform: moreOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
              </button>

              {moreOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0,
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  borderRadius: 16, padding: 6, minWidth: 180,
                  boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px var(--border)",
                  animation: "fadeInDown 0.15s cubic-bezier(0.16,1,0.3,1)",
                  zIndex: 100,
                }}>
                  {MORE_NAV.map(({ href, label, icon }) => {
                    const active = pathname === href;
                    return (
                      <Link key={href} href={href} style={{
                        textDecoration: "none", display: "flex", alignItems: "center",
                        gap: 10, padding: "9px 14px", borderRadius: 10,
                        background: active ? "rgba(34,211,238,0.1)" : "transparent",
                        color: active ? "var(--cyan)" : "var(--text-secondary)",
                        fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 13,
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; } }}
                      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; } }}>
                        <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
                        {label}
                        {active && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", flexShrink: 0 }} />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="hide-mobile">
              <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
            </div>
            {/* Hamburger */}
            <button onClick={() => setMobileOpen(o => !o)}
              className="show-mobile"
              style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border)",
                background: "rgba(0,0,0,0.2)", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 5 }}>
              {[0,1,2].map(i => (
                <span key={i} style={{ display: "block", height: 1.5, width: 16, borderRadius: 1,
                  background: "var(--text-secondary)", transition: "all 0.2s",
                  transform: mobileOpen
                    ? i===0 ? "rotate(45deg) translate(4px,4px)" : i===2 ? "rotate(-45deg) translate(4px,-4px)" : "scaleX(0)"
                    : "none",
                  opacity: mobileOpen && i===1 ? 0 : 1 }} />
              ))}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile slide-in menu */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 49,
        background: "var(--bg-base)", backdropFilter: "blur(20px)",
        transform: mobileOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        padding: 24, overflowY: "auto",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--text-primary)" }}>LendFi</span>
          <button onClick={() => setMobileOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 22 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase",
            letterSpacing: "0.1em", padding: "0 14px", marginBottom: 6 }}>Main</p>
          {PRIMARY_NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{
                textDecoration: "none", padding: "12px 16px", borderRadius: 12,
                fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 15,
                background: active ? "rgba(34,211,238,0.1)" : "transparent",
                color: active ? "var(--cyan)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--border-accent)" : "transparent"}`,
              }}>{label}</Link>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 32 }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase",
            letterSpacing: "0.1em", padding: "0 14px", marginBottom: 6 }}>More</p>
          {MORE_NAV.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{
                textDecoration: "none", padding: "12px 16px", borderRadius: 12,
                fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 15,
                background: active ? "rgba(34,211,238,0.1)" : "transparent",
                color: active ? "var(--cyan)" : "var(--text-secondary)",
                display: "flex", alignItems: "center", gap: 10,
                border: `1px solid ${active ? "var(--border-accent)" : "transparent"}`,
              }}>
                <span style={{ fontSize: 16 }}>{icon}</span>{label}
              </Link>
            );
          })}
        </div>

        <ConnectButton accountStatus="full" chainStatus="full" showBalance={false} />
      </div>

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
          .hide-mobile { display: flex !important; }
        }
      `}</style>
    </>
  );
}