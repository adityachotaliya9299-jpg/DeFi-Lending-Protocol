// "use client";

// import { useState, useEffect, useRef } from "react";
// import Link from "next/link";
// import { usePathname } from "next/navigation";
// import { ConnectButton } from "@rainbow-me/rainbowkit";
// import { useTheme } from "@/components/ThemeProvider";


// function SunIcon() {
//   return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
// }
// function MoonIcon() {
//   return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
// }

// // ── Primary nav — 4 items always visible ─────────────────────────────────────
// const PRIMARY_NAV = [
//   { href: "/",          label: "Markets"   },
//   { href: "/dashboard", label: "Dashboard" },
//   { href: "/vault",     label: "Vault"     },
//   { href: "/analytics", label: "Analytics" },
// ];

// // ── "More" dropdown — 5 secondary items ──────────────────────────────────────
// const MORE_NAV = [
//   { href: "/modes",      label: "E-Mode",      icon: "⚡" },
//   { href: "/risk",       label: "Risk",         icon: "🛡" },
//   { href: "/flashloan",  label: "Flash Loans",  icon: "⌁" },
//   { href: "/liquidate",  label: "Liquidate",    icon: "⬡" },
//   { href: "/delegation", label: "Delegation",   icon: "🤝" },
// ];

// export function Navbar() {
//   const pathname = usePathname();
//   const { theme, toggle } = useTheme();
//   const [mobileOpen, setMobileOpen] = useState(false);
//   const [moreOpen,   setMoreOpen]   = useState(false);
//   const [scrolled,   setScrolled]   = useState(false);
//   const moreRef = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     const fn = () => setScrolled(window.scrollY > 12);
//     window.addEventListener("scroll", fn, { passive: true });
//     return () => window.removeEventListener("scroll", fn);
//   }, []);

//   // Close mobile menu on route change
//   useEffect(() => { setMobileOpen(false); setMoreOpen(false); }, [pathname]);

//   // Close "More" dropdown on outside click
//   useEffect(() => {
//     const fn = (e: MouseEvent) => {
//       if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
//         setMoreOpen(false);
//       }
//     };
//     document.addEventListener("mousedown", fn);
//     return () => document.removeEventListener("mousedown", fn);
//   }, []);

//   const isMoreActive = MORE_NAV.some(n => n.href === pathname);

//   return (
//     <>
//       <nav style={{
//         position: "sticky", top: 0, zIndex: 50,
//         background: scrolled ? "rgba(3,7,18,0.9)" : "transparent",
//         backdropFilter: scrolled ? "blur(20px)" : "none",
//         WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
//         borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
//         transition: "all 0.25s",
//       }}>
//         <div style={{ maxWidth: 1280, margin: "0 auto", height: 64,
//           display: "flex", alignItems: "center", justifyContent: "space-between",
//           padding: "0 24px" }}>

//           {/* Logo */}
//           <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
//             <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0,
//               background: "linear-gradient(135deg, var(--cyan), #a78bfa)",
//               display: "flex", alignItems: "center", justifyContent: "center",
//               fontSize: 15, color: "#030712", fontWeight: 700 }}>⬡</div>
//             <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
//               <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16,
//                 color: "var(--text-primary)" }}>LendFi</span>
//               <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--cyan)",
//                 background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)",
//                 borderRadius: 4, padding: "2px 6px", letterSpacing: "0.05em" }}>SEPOLIA</span>
//             </div>
//           </Link>

//           {/* Desktop nav */}
//           <div style={{ display: "flex", alignItems: "center", gap: 2,
//             background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)",
//             borderRadius: 14, padding: 4 }}
//             className="hide-mobile">

//             {/* Primary links */}
//             {PRIMARY_NAV.map(({ href, label }) => {
//               const active = pathname === href;
//               return (
//                 <Link key={href} href={href} style={{
//                   textDecoration: "none", padding: "7px 16px", borderRadius: 10,
//                   fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 13,
//                   background: active ? "var(--cyan)" : "transparent",
//                   color: active ? "#030712" : "var(--text-secondary)",
//                   transition: "all 0.15s", whiteSpace: "nowrap",
//                 }}
//                 onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
//                 onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}>
//                   {label}
//                 </Link>
//               );
//             })}

//             {/* More dropdown */}
//             <div ref={moreRef} style={{ position: "relative" }}>
//               <button onClick={() => setMoreOpen(o => !o)}
//                 style={{
//                   padding: "7px 14px", borderRadius: 10, border: "none", cursor: "pointer",
//                   fontFamily: "var(--font-display)", fontWeight: isMoreActive ? 700 : 500, fontSize: 13,
//                   background: isMoreActive ? "var(--cyan)" : moreOpen ? "rgba(255,255,255,0.07)" : "transparent",
//                   color: isMoreActive ? "#030712" : "var(--text-secondary)",
//                   display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
//                 }}>
//                 More
//                 <span style={{ fontSize: 9, opacity: 0.7, transform: moreOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
//               </button>

//               {moreOpen && (
//                 <div style={{
//                   position: "absolute", top: "calc(100% + 8px)", right: 0,
//                   background: "var(--bg-card)", border: "1px solid var(--border)",
//                   borderRadius: 16, padding: 6, minWidth: 180,
//                   boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px var(--border)",
//                   animation: "fadeInDown 0.15s cubic-bezier(0.16,1,0.3,1)",
//                   zIndex: 100,
//                 }}>
//                   {MORE_NAV.map(({ href, label, icon }) => {
//                     const active = pathname === href;
//                     return (
//                       <Link key={href} href={href} style={{
//                         textDecoration: "none", display: "flex", alignItems: "center",
//                         gap: 10, padding: "9px 14px", borderRadius: 10,
//                         background: active ? "rgba(34,211,238,0.1)" : "transparent",
//                         color: active ? "var(--cyan)" : "var(--text-secondary)",
//                         fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 13,
//                         transition: "all 0.12s",
//                       }}
//                       onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; } }}
//                       onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; } }}>
//                         <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>{icon}</span>
//                         {label}
//                         {active && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", flexShrink: 0 }} />}
//                       </Link>
//                     );
//                   })}
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Right side */}
//           <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
//             <button onClick={toggle} className="hide-mobile"
//               style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border)",
//                 background: "rgba(0,0,0,0.2)", cursor: "pointer", display: "flex",
//                 alignItems: "center", justifyContent: "center", color: "var(--text-secondary)",
//                 flexShrink: 0 }}>
//               {theme === "dark" ? <SunIcon /> : <MoonIcon />}
//             </button>
//             <div className="hide-mobile">
//               <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
//             </div>
//             {/* Hamburger */}
//             <button onClick={() => setMobileOpen(o => !o)}
//               className="show-mobile"
//               style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border)",
//                 background: "rgba(0,0,0,0.2)", cursor: "pointer",
//                 display: "flex", flexDirection: "column", alignItems: "center",
//                 justifyContent: "center", gap: 5 }}>
//               {[0,1,2].map(i => (
//                 <span key={i} style={{ display: "block", height: 1.5, width: 16, borderRadius: 1,
//                   background: "var(--text-secondary)", transition: "all 0.2s",
//                   transform: mobileOpen
//                     ? i===0 ? "rotate(45deg) translate(4px,4px)" : i===2 ? "rotate(-45deg) translate(4px,-4px)" : "scaleX(0)"
//                     : "none",
//                   opacity: mobileOpen && i===1 ? 0 : 1 }} />
//               ))}
//             </button>
//           </div>
//         </div>
//       </nav>

//       {/* Mobile slide-in menu */}
//       <div style={{
//         position: "fixed", inset: 0, zIndex: 49,
//         background: "var(--bg-base)", backdropFilter: "blur(20px)",
//         transform: mobileOpen ? "translateX(0)" : "translateX(100%)",
//         transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
//         padding: 24, overflowY: "auto",
//         display: "flex", flexDirection: "column",
//       }}>
//         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
//           <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--text-primary)" }}>LendFi</span>
//           <button onClick={() => setMobileOpen(false)}
//             style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 22 }}>✕</button>
//         </div>

//         <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
//           <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase",
//             letterSpacing: "0.1em", padding: "0 14px", marginBottom: 6 }}>Main</p>
//           {PRIMARY_NAV.map(({ href, label }) => {
//             const active = pathname === href;
//             return (
//               <Link key={href} href={href} style={{
//                 textDecoration: "none", padding: "12px 16px", borderRadius: 12,
//                 fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 15,
//                 background: active ? "rgba(34,211,238,0.1)" : "transparent",
//                 color: active ? "var(--cyan)" : "var(--text-secondary)",
//                 border: `1px solid ${active ? "var(--border-accent)" : "transparent"}`,
//               }}>{label}</Link>
//             );
//           })}
//         </div>

//         <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 32 }}>
//           <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase",
//             letterSpacing: "0.1em", padding: "0 14px", marginBottom: 6 }}>More</p>
//           {MORE_NAV.map(({ href, label, icon }) => {
//             const active = pathname === href;
//             return (
//               <Link key={href} href={href} style={{
//                 textDecoration: "none", padding: "12px 16px", borderRadius: 12,
//                 fontFamily: "var(--font-display)", fontWeight: active ? 700 : 500, fontSize: 15,
//                 background: active ? "rgba(34,211,238,0.1)" : "transparent",
//                 color: active ? "var(--cyan)" : "var(--text-secondary)",
//                 display: "flex", alignItems: "center", gap: 10,
//                 border: `1px solid ${active ? "var(--border-accent)" : "transparent"}`,
//               }}>
//                 <span style={{ fontSize: 16 }}>{icon}</span>{label}
//               </Link>
//             );
//           })}
//         </div>

//         <ConnectButton accountStatus="full" chainStatus="full" showBalance={false} />
//       </div>

//       <style>{`
//         @keyframes fadeInDown {
//           from { opacity: 0; transform: translateY(-6px); }
//           to   { opacity: 1; transform: translateY(0); }
//         }
//         @media (max-width: 768px) {
//           .hide-mobile { display: none !important; }
//           .show-mobile { display: flex !important; }
//         }
//         @media (min-width: 769px) {
//           .show-mobile { display: none !important; }
//           .hide-mobile { display: flex !important; }
//         }
//       `}</style>
//     </>
//   );
// }




// NEW CODE 


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
          background: rgba(10, 10, 15, 0.7);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 10px 40px -10px rgba(0,0,0,0.3);
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
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
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
          background: rgba(255, 255, 255, 0.05);
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
          background: rgba(255, 255, 255, 0.08);
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
          background: rgba(15, 15, 20, 0.95);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 8px;
          min-width: 200px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.6);
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
          background: rgba(255, 255, 255, 0.06);
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
        .theme-toggle {
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary);
          transition: all 0.2s ease;
        }
        .theme-toggle:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.08);
          transform: rotate(15deg);
        }
        .connect-wrapper {
          transition: transform 0.2s ease;
        }
        .connect-wrapper:hover {
          transform: translateY(-1px);
        }

        /* Hamburger */
        .hamburger {
          width: 44px; height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 5px;
          cursor: pointer;
        }
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
          background: rgba(0, 0, 0, 0.4);
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
          background: var(--bg-card, #0a0a0f);
          border-left: 1px solid rgba(255,255,255,0.05);
          z-index: 100;
          padding: 32px 24px;
          display: flex; flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: -20px 0 60px rgba(0,0,0,0.5);
          overflow-y: auto;
        }
        .mobile-menu.open {
          transform: translateX(0);
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



