"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/components/ThemeProvider";

const NAV = [
  { href: "/",           label: "Markets"    },
  { href: "/dashboard",  label: "Dashboard"  },
  { href: "/vault",      label: "pUSD Vault" },
  { href: "/modes",      label: "E-Mode"     },
  { href: "/risk",       label: "Risk"       },
  { href: "/analytics",  label: "Analytics"  },
  { href: "/flashloan",  label: "Flash Loans" },
  { href: "/liquidate",  label: "Liquidate"   },
  { href: "/delegation", label: "Delegation"  },
];

function SunIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
}
function MoonIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [open, setOpen]     = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <nav className="sticky top-0 z-50 transition-all duration-300" style={{
        background: scrolled ? "rgba(3,7,18,0.88)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
      }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 flex items-center justify-center rounded-lg"
              style={{ background: "linear-gradient(135deg, var(--cyan), #a78bfa)" }}>
              <span className="text-slate-950 font-bold text-sm">⬡</span>
            </div>
            <div className="hidden sm:block">
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>LendFi</span>
              <span className="ml-1.5 badge badge-cyan" style={{ fontSize: 9 }}>SEPOLIA</span>
            </div>
          </Link>

          {/* Desktop nav — scrollable for all 8 items */}
          <div className="hidden lg:flex items-center gap-0.5 rounded-xl p-1 overflow-x-auto" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)", maxWidth: "60vw" }}>
            {NAV.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link key={href} href={href}
                  className="rounded-lg px-3 py-2 text-xs whitespace-nowrap transition-all duration-150"
                  style={{ fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, background: active ? "var(--cyan)" : "transparent", color: active ? "#030712" : "var(--text-secondary)", textDecoration: "none" }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}>
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            <button onClick={toggle} className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer" }}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="hidden sm:block">
              <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
            </div>
            <button onClick={() => setOpen(!open)} className="flex lg:hidden h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-lg"
              style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", cursor: "pointer" }}>
              <span style={{ display: "block", height: 1, width: 16, background: "var(--text-secondary)", transition: "all 0.2s", transform: open ? "rotate(45deg) translate(2px,2px)" : "" }} />
              <span style={{ display: "block", height: 1, width: 16, background: "var(--text-secondary)", transition: "all 0.2s", opacity: open ? 0 : 1 }} />
              <span style={{ display: "block", height: 1, width: 16, background: "var(--text-secondary)", transition: "all 0.2s", transform: open ? "rotate(-45deg) translate(2px,-2px)" : "" }} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <div className={`mobile-menu ${open ? "open" : ""}`}>
        <div className="flex items-center justify-between mb-8">
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--text-primary)" }}>LendFi</span>
          <button onClick={() => setOpen(false)} style={{ color: "var(--text-muted)", fontSize: 24, background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
        <div className="flex flex-col gap-2 mb-8">
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-4 py-4"
                style={{ fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 15, background: active ? "var(--cyan-dim)" : "transparent", color: active ? "var(--cyan)" : "var(--text-secondary)", border: `1px solid ${active ? "var(--border-accent)" : "transparent"}`, textDecoration: "none" }}>
                {label}
              </Link>
            );
          })}
        </div>
        <button onClick={toggle} className="btn-ghost flex items-center gap-2 mb-6" style={{ cursor: "pointer" }}>
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <ConnectButton accountStatus="full" chainStatus="full" showBalance={false} />
      </div>
    </>
  );
}