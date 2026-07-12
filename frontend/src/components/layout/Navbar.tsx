"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/components/ThemeProvider";
import { Logo } from "@/components/brand/Logo";

/* ── Navigation model ───────────────────────────────────────────────────────── */

type NavItem = { href: string; label: string; desc?: string; glyph: string };
type NavGroup = { label: string; items: NavItem[] };

const DIRECT: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", glyph: "◈" },
  { href: "/markets",   label: "Markets",   glyph: "◎" },
];

const GROUPS: NavGroup[] = [
  {
    label: "Earn",
    items: [
      { href: "/yield",    label: "Yield Vault",    desc: "ERC-4626 auto-compounding USDC", glyph: "✦" },
      { href: "/tranches", label: "Tranches",       desc: "Senior / Junior structured yield", glyph: "◪" },
      { href: "/points",   label: "Points",         desc: "Earn protocol points for activity", glyph: "❖" },
      { href: "/vault",    label: "pUSD Vault",     desc: "Mint the protocol stablecoin", glyph: "◍" },
    ],
  },
  {
    label: "Trade",
    items: [
      { href: "/leverage",  label: "Leverage",       desc: "Loop up to 4× in one transaction", glyph: "⟠" },
      { href: "/swap",      label: "Rate Swap",      desc: "Swap variable for fixed rates", glyph: "⇄" },
      { href: "/flashloan", label: "Flash Loans",    desc: "Uncollateralised, 0.09% fee", glyph: "⌁" },
      { href: "/nft",       label: "NFT Collateral", desc: "Borrow against ERC-721 floors", glyph: "◨" },
    ],
  },
  {
    label: "Protocol",
    items: [
      { href: "/portfolio",  label: "Portfolio",  desc: "Your positions in detail", glyph: "▤" },
      { href: "/analytics",  label: "Analytics",  desc: "TVL, rates and utilisation", glyph: "◫" },
      { href: "/governance", label: "Governance", desc: "Vote on risk parameters", glyph: "⬢" },
      { href: "/risk",       label: "Risk & Audit", desc: "Parameters and LFI-2026-01", glyph: "⛨" },
      { href: "/liquidate",  label: "Liquidations", desc: "Scan and execute", glyph: "◬" },
      { href: "/delegation", label: "Delegation",  desc: "Delegate borrowing power", glyph: "⧉" },
      { href: "/modes",      label: "E-Mode",      desc: "Efficiency & isolation modes", glyph: "⚡" },
    ],
  },
];

const ALL_ITEMS = [...DIRECT, ...GROUPS.flatMap(g => g.items)];



export function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); setOpenGroup(null); }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const enterGroup = (label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenGroup(label);
  };
  const leaveGroup = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenGroup(null), 180);
  };

  return (
    <>
      <header className={`lf-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="lf-nav-inner" ref={navRef}>
          <Link href="/" style={{ textDecoration: "none" }} aria-label="LendFi home">
            <Logo size={36} />
          </Link>

          <nav className="lf-links hide-m">
            {DIRECT.map(item => (
              <Link key={item.href} href={item.href}
                className={`lf-link ${pathname === item.href ? "active" : ""}`}>
                {item.label}
              </Link>
            ))}
            {GROUPS.map(group => {
              const groupActive = group.items.some(i => i.href === pathname);
              const open = openGroup === group.label;
              return (
                <div key={group.label} className="lf-group"
                  onMouseEnter={() => enterGroup(group.label)}
                  onMouseLeave={leaveGroup}>
                  <button
                    className={`lf-link ${groupActive ? "active" : ""} ${open ? "open" : ""}`}
                    onClick={() => setOpenGroup(open ? null : group.label)}>
                    {group.label}
                    <svg width="9" height="6" viewBox="0 0 9 6" style={{ transition: "transform .25s", transform: open ? "rotate(180deg)" : "none" }}>
                      <path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                  {open && (
                    <div className="lf-dropdown">
                      {group.items.map(item => (
                        <Link key={item.href} href={item.href}
                          className={`lf-drop-item ${pathname === item.href ? "active" : ""}`}>
                          <span className="lf-drop-glyph">{item.glyph}</span>
                          <span>
                            <span className="lf-drop-label">{item.label}</span>
                            {item.desc && <span className="lf-drop-desc">{item.desc}</span>}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="hide-m">
            <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
          </div>
            <button onClick={() => setMobileOpen(v => !v)}
              className={`lf-burger show-m ${mobileOpen ? "open" : ""}`} aria-label="Menu">
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      {/* spacer for fixed nav on inner pages */}
      {pathname !== "/" && <div style={{ height: 96 }} />}

      {/* mobile menu */}
      <div className={`lf-mob-overlay ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(false)} />
      <aside className={`lf-mob ${mobileOpen ? "open" : ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
          <Logo size={32} />
          <button onClick={() => setMobileOpen(false)} className="lf-iconbtn" aria-label="Close">✕</button>
        </div>
        <div className="lf-mob-group">
          {DIRECT.map(i => (
            <Link key={i.href} href={i.href} className={`lf-mob-link ${pathname === i.href ? "active" : ""}`}>
              <span className="lf-drop-glyph">{i.glyph}</span>{i.label}
            </Link>
          ))}
        </div>
        {GROUPS.map(g => (
          <div key={g.label} className="lf-mob-group">
            <p className="lf-mob-title">{g.label}</p>
            {g.items.map(i => (
              <Link key={i.href} href={i.href} className={`lf-mob-link ${pathname === i.href ? "active" : ""}`}>
                <span className="lf-drop-glyph">{i.glyph}</span>{i.label}
              </Link>
            ))}
          </div>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <ConnectButton accountStatus="full" chainStatus="full" showBalance={false} />
        </div>
      </aside>

      <style>{`
        .lf-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 18px 22px;
          transition: padding 0.4s var(--ease-out);
        }
        .lf-nav.scrolled { padding: 10px 22px; }
        .lf-nav-inner {
          max-width: 1280px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
          gap: 18px;
          padding: 10px 18px;
          border-radius: 18px;
          border: 1px solid transparent;
          transition: all 0.4s var(--ease-out);
        }
        .lf-nav.scrolled .lf-nav-inner {
          background: var(--bg-glass);
          border-color: var(--border-strong);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
          box-shadow: 0 14px 40px -18px rgba(0,0,0,.6);
        }
        .lf-links { display: flex; align-items: center; gap: 2px; }
        .lf-link {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--font-display);
          font-size: 14px; font-weight: 600;
          color: var(--text-secondary);
          text-decoration: none;
          background: none; border: none; cursor: pointer;
          padding: 9px 15px; border-radius: 100px;
          transition: color .2s, background .2s;
        }
        .lf-link:hover, .lf-link.open { color: var(--text-primary); background: var(--surface-overlay); }
        .lf-link.active {
          color: var(--mint);
          background: rgba(70,245,201,.09);
          box-shadow: inset 0 0 0 1px rgba(70,245,201,.25);
        }
        .lf-group { position: relative; }
        .lf-dropdown {
          position: absolute; top: calc(100% + 14px); left: 50%;
          transform: translateX(-50%);
          min-width: 300px;
          background: var(--bg-elev);
          border: 1px solid var(--border-strong);
          border-radius: 20px;
          padding: 10px;
          box-shadow: 0 30px 70px -20px rgba(0,0,0,.7), var(--glow-violet);
          animation: navdrop .28s var(--ease-out) both;
        }
        @keyframes navdrop {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(.97); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        .lf-drop-item {
          display: flex; align-items: flex-start; gap: 13px;
          padding: 11px 13px; border-radius: 13px;
          text-decoration: none;
          transition: background .2s;
        }
        .lf-drop-item:hover { background: var(--surface-overlay); }
        .lf-drop-item.active { background: rgba(70,245,201,.08); box-shadow: inset 0 0 0 1px rgba(70,245,201,.2); }
        .lf-drop-glyph {
          width: 30px; height: 30px; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 9px;
          background: var(--aurora-soft);
          border: 1px solid var(--border-strong);
          color: var(--mint);
          font-size: 14px;
        }
        .lf-drop-label {
          display: block;
          font-family: var(--font-display); font-weight: 700; font-size: 13.5px;
          color: var(--text-primary);
        }
        .lf-drop-desc { display: block; font-size: 11.5px; color: var(--text-muted); margin-top: 1px; }
        .lf-iconbtn {
          width: 38px; height: 38px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--bg-glass); border: 1px solid var(--border-strong);
          color: var(--text-secondary); cursor: pointer;
          transition: all .25s;
          backdrop-filter: blur(10px);
        }
        .lf-iconbtn:hover { color: var(--mint); border-color: var(--mint); transform: rotate(12deg); }
        .lf-burger {
          width: 40px; height: 40px; border-radius: 12px;
          display: none; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
          background: var(--bg-glass); border: 1px solid var(--border-strong);
          cursor: pointer;
        }
        .lf-burger span {
          width: 17px; height: 2px; border-radius: 2px;
          background: var(--text-primary);
          transition: all .3s var(--ease-out);
        }
        .lf-burger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
        .lf-burger.open span:nth-child(2) { opacity: 0; }
        .lf-burger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
        .lf-mob-overlay {
          position: fixed; inset: 0; z-index: 140;
          background: rgba(2,4,10,.6); backdrop-filter: blur(5px);
          opacity: 0; pointer-events: none; transition: opacity .3s;
        }
        .lf-mob-overlay.open { opacity: 1; pointer-events: auto; }
        .lf-mob {
          position: fixed; top: 0; right: 0; bottom: 0; z-index: 150;
          width: min(340px, 88vw);
          background: var(--bg-elev);
          border-left: 1px solid var(--border-strong);
          padding: 24px 22px 34px;
          display: flex; flex-direction: column;
          overflow-y: auto;
          transform: translateX(110%); visibility: hidden;
          transition: transform .45s var(--ease-out), visibility .45s;
        }
        .lf-mob.open { transform: none; visibility: visible; }
        .lf-mob-group { margin-bottom: 18px; display: flex; flex-direction: column; gap: 3px; }
        .lf-mob-title {
          font-family: var(--font-mono); font-size: 10px; letter-spacing: .22em;
          text-transform: uppercase; color: var(--text-muted);
          margin: 8px 4px 6px;
        }
        .lf-mob-link {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 12px; border-radius: 12px;
          text-decoration: none;
          font-family: var(--font-display); font-weight: 600; font-size: 15px;
          color: var(--text-secondary);
          transition: background .2s, color .2s;
        }
        .lf-mob-link:hover { background: var(--surface-overlay); color: var(--text-primary); }
        .lf-mob-link.active { color: var(--mint); background: rgba(70,245,201,.08); }
        @media (max-width: 1060px) {
          .hide-m { display: none !important; }
          .show-m, .lf-burger { display: flex !important; }
        }
        @media (min-width: 1061px) {
          .show-m { display: none !important; }
        }
      `}</style>
    </>
  );
}
