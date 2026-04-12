"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/components/ThemeProvider";

function SunIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
}

function MoonIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}

const PRIMARY_NAV = [
  { href: "/",          label: "Markets"   },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/vault",     label: "Vault"     },
  { href: "/analytics", label: "Analytics" },
];

const MORE_NAV = [
  { href: "/modes",      label: "E-Mode",      icon: "⚡" },
  { href: "/risk",       label: "Risk",        icon: "🛡" },
  { href: "/flashloan",  label: "Flash Loans", icon: "⌁" },
  { href: "/liquidate",  label: "Liquidate",   icon: "⬡" },
  { href: "/delegation", label: "Delegation",  icon: "🤝" },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen,   setMoreOpen]   = useState(false);
  const [scrolled,   setScrolled]   = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => { 
    setMobileOpen(false); 
    setMoreOpen(false); 
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; }
  }, [mobileOpen]);

  const isMoreActive = MORE_NAV.some(n => n.href === pathname);

  return (
    <>
      <header className={`nav-header ${scrolled ? "scrolled" : ""}`}>
        <div className="nav-container">
          
          {/* Logo Section */}
          <Link href="/" className="nav-logo">
            <div className="logo-icon">⬡</div>
            <div className="logo-text-group">
              <span className="logo-title">LendFi</span>
              <span className="logo-badge">SEPOLIA</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="desktop-nav hide-mobile">
            {PRIMARY_NAV.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`}>
                  {label}
                </Link>
              );
            })}

            {/* Dropdown Menu */}
            <div ref={moreRef} className="more-dropdown-container">
              <button 
                onClick={() => setMoreOpen(!moreOpen)}
                className={`nav-link more-btn ${isMoreActive ? "active" : ""} ${moreOpen ? "open" : ""}`}
              >
                More
                <span className="chevron">▼</span>
              </button>

              {moreOpen && (
                <div className="dropdown-menu">
                  {MORE_NAV.map(({ href, label, icon }) => {
                    const active = pathname === href;
                    return (
                      <Link key={href} href={href} className={`dropdown-item ${active ? "active" : ""}`}>
                        <span className="dropdown-icon">{icon}</span>
                        <span className="dropdown-label">{label}</span>
                        {active && <span className="active-dot" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          {/* Right Action Section */}
          <div className="nav-actions">
            <button onClick={toggle} className="theme-toggle hide-mobile" aria-label="Toggle Theme">
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <div className="hide-mobile connect-wrapper">
              <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
            </div>

            {/* Mobile Hamburger */}
            <button 
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`hamburger show-mobile ${mobileOpen ? "open" : ""}`}
              aria-label="Toggle Menu"
            >
              <span className="line top"></span>
              <span className="line middle"></span>
              <span className="line bottom"></span>
            </button>
          </div>
        </div>
      </header>

      {pathname !== "/" && <div style={{ height: "104px" }} />}
      
      {/* Mobile Slide-over Menu */}
      <div className={`mobile-menu-overlay ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(false)} />
      <aside className={`mobile-menu ${mobileOpen ? "open" : ""}`}>
        <div className="mobile-header">
          <span className="logo-title" style={{ fontSize: 24 }}>LendFi</span>
          <button onClick={() => setMobileOpen(false)} className="close-btn">✕</button>
        </div>

        <div className="mobile-nav-group">
          <p className="mobile-group-title">Main</p>
          {PRIMARY_NAV.map(({ href, label }) => (
            <Link key={href} href={href} className={`mobile-link ${pathname === href ? "active" : ""}`}>
              {label}
            </Link>
          ))}
        </div>

        <div className="mobile-nav-group">
          <p className="mobile-group-title">More</p>
          {MORE_NAV.map(({ href, label, icon }) => (
            <Link key={href} href={href} className={`mobile-link ${pathname === href ? "active" : ""}`}>
              <span className="mobile-link-icon">{icon}</span>
              {label}
            </Link>
          ))}
        </div>

        <div className="mobile-connect-wrapper">
          <ConnectButton accountStatus="full" chainStatus="full" showBalance={false} />
        </div>
      </aside>

      {/* --- CSS Styles --- */}
      <style>{`
        /* Header Container */
        .nav-header {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 50;
          padding: 20px 24px;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nav-header.scrolled {
          padding: 12px 24px;
        }
        
        .nav-container {
          max-width: 1200px;
          margin: 0 auto;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          border-radius: 20px;
          background: transparent;
          border: 1px solid transparent;
          transition: all 0.4s ease;
        }
        
        .nav-header.scrolled .nav-container {
          background: var(--bg-card); /* Theme aware */
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid var(--border);
          box-shadow: 0 10px 40px -10px rgba(0,0,0,0.1);
        }

        /* Logo */
        .nav-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
        }
        .logo-icon {
          width: 38px; height: 38px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--cyan), #818cf8);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; color: #000; font-weight: 800;
          box-shadow: 0 4px 12px rgba(34, 211, 238, 0.3);
        }
        .logo-text-group {
          display: flex; flex-direction: column; justify-content: center;
        }
        .logo-title {
          font-family: var(--font-display);
          font-weight: 800; font-size: 18px;
          color: var(--text-primary);
          line-height: 1.1;
        }
        .logo-badge {
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 600;
          color: var(--cyan); letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* Desktop Nav */
        .desktop-nav {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-base); /* Theme aware */
          border: 1px solid var(--border);
          border-radius: 100px;
          padding: 6px;
        }
        .nav-link {
          text-decoration: none;
          padding: 8px 18px;
          border-radius: 100px;
          font-family: var(--font-display);
          font-weight: 500; font-size: 14px;
          color: var(--text-secondary);
          transition: all 0.2s ease;
          cursor: pointer;
          background: transparent;
          border: none;
        }
        .nav-link:hover {
          color: var(--text-primary);
          background: var(--bg-card);
        }
        .nav-link.active {
          background: var(--cyan);
          color: #030712;
          font-weight: 700;
          box-shadow: 0 0 16px rgba(34, 211, 238, 0.4);
        }

        /* Dropdown */
        .more-dropdown-container {
          position: relative;
        }
        .more-btn {
          display: flex; align-items: center; gap: 6px;
        }
        .more-btn.open {
          background: var(--bg-card);
          color: var(--text-primary);
        }
        .chevron {
          font-size: 9px;
          opacity: 0.6;
          transition: transform 0.3s ease;
        }
        .more-btn.open .chevron {
          transform: rotate(180deg);
        }
        .dropdown-menu {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          background: var(--bg-card); /* Theme aware */
          backdrop-filter: blur(16px);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 8px;
          min-width: 200px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
          animation: dropIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: top center;
        }
        .dropdown-item {
          text-decoration: none;
          display: flex; align-items: center; gap: 12px;
          padding: 10px 14px;
          border-radius: 10px;
          color: var(--text-secondary);
          font-family: var(--font-display);
          font-size: 14px; font-weight: 500;
          transition: all 0.2s ease;
        }
        .dropdown-item:hover {
          background: var(--bg-base);
          color: var(--text-primary);
        }
        .dropdown-item.active {
          background: rgba(34, 211, 238, 0.1);
          color: var(--cyan);
          font-weight: 600;
        }
        .dropdown-icon {
          font-size: 16px; width: 20px; text-align: center;
        }
        .active-dot {
          margin-left: auto; width: 6px; height: 6px;
          border-radius: 50%; background: var(--cyan);
          box-shadow: 0 0 8px var(--cyan);
        }

        /* Actions */
        .nav-actions {
          display: flex; align-items: center; gap: 12px;
        }
        .theme-toggle, .hamburger {
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: var(--bg-base); /* Theme aware */
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary);
          transition: all 0.2s ease;
        }
        .hamburger {
          border-radius: 12px;
          flex-direction: column;
          gap: 5px;
        }
        .theme-toggle:hover, .hamburger:hover {
          color: var(--text-primary);
          background: var(--bg-card);
        }
        .theme-toggle:hover {
          transform: rotate(15deg);
        }
        .connect-wrapper {
          transition: transform 0.2s ease;
        }
        .connect-wrapper:hover {
          transform: translateY(-1px);
        }

        /* Hamburger */
        .hamburger .line {
          display: block; width: 18px; height: 2px;
          background: var(--text-primary);
          border-radius: 2px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .hamburger.open .top { transform: translateY(7px) rotate(45deg); }
        .hamburger.open .middle { opacity: 0; transform: translateX(10px); }
        .hamburger.open .bottom { transform: translateY(-7px) rotate(-45deg); }

        /* Mobile Menu */
        .mobile-menu-overlay {
          position: fixed; inset: 0;
          background: rgba(0, 0, 0, 0.5); /* Neutral overlay */
          backdrop-filter: blur(4px);
          z-index: 90;
          opacity: 0; pointer-events: none;
          transition: opacity 0.3s ease;
        }
        .mobile-menu-overlay.open {
          opacity: 1; pointer-events: auto;
        }
        
        .mobile-menu {
          position: fixed; top: 0; bottom: 0; right: 0;
          width: 100%; max-width: 340px;
          background: var(--bg-card); /* Theme aware */
          border-left: 1px solid var(--border);
          z-index: 100;
          padding: 32px 24px;
          display: flex; flex-direction: column;
          /* FIX: Translated past 100% and completely hidden to remove shadow bleed */
          transform: translateX(120%);
          visibility: hidden; 
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.4s;
          overflow-y: auto;
          box-shadow: none;
        }
        .mobile-menu.open {
          transform: translateX(0);
          visibility: visible;
          box-shadow: -20px 0 60px rgba(0,0,0,0.3);
        }
        .mobile-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 40px;
        }
        .close-btn {
          background: none; border: none; cursor: pointer;
          color: var(--text-secondary); font-size: 24px;
          transition: color 0.2s;
        }
        .close-btn:hover { color: var(--text-primary); }
        
        .mobile-nav-group { margin-bottom: 32px; display: flex; flex-direction: column; gap: 8px; }
        .mobile-group-title {
          font-family: var(--font-mono); font-size: 11px;
          color: var(--text-muted); text-transform: uppercase;
          letter-spacing: 0.1em; padding: 0 16px; margin-bottom: 8px;
        }
        .mobile-link {
          text-decoration: none; padding: 14px 16px;
          border-radius: 14px; font-family: var(--font-display);
          font-weight: 500; font-size: 16px;
          color: var(--text-secondary);
          display: flex; align-items: center; gap: 12px;
          transition: all 0.2s;
          border: 1px solid transparent;
        }
        .mobile-link:hover {
          background: var(--bg-base);
        }
        .mobile-link.active {
          background: rgba(34, 211, 238, 0.08);
          color: var(--cyan);
          border-color: rgba(34, 211, 238, 0.2);
          font-weight: 700;
        }
        .mobile-link-icon { font-size: 18px; }
        .mobile-connect-wrapper { margin-top: auto; padding-top: 24px; }

        /* Animations */
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Utilities */
        @media (max-width: 860px) {
          .hide-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
          .nav-header { padding: 16px; }
          .nav-header.scrolled { padding: 8px 16px; }
        }
        @media (min-width: 861px) {
          .show-mobile { display: none !important; }
          .hide-mobile { display: flex !important; }
          .mobile-menu { display: none !important; }
          .mobile-menu-overlay { display: none !important; }
        }
      `}</style>
    </>
  );
}