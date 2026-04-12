"use client";

import Link from "next/link";

const LINKS = {
  Protocol: [
    { label: "Markets",    href: "/"          },
    { label: "Dashboard",  href: "/dashboard" },
    { label: "Portfolio",  href: "/portfolio" },
    { label: "Liquidate",  href: "/liquidate" },
  ],
  Contracts: [
    { label: "LendingPool",    href: "https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0" },
    { label: "PriceOracle",    href: "https://sepolia.etherscan.io/address/0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc" },
    { label: "Governance",     href: "https://sepolia.etherscan.io/address/0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc" },
    { label: "Treasury",       href: "https://sepolia.etherscan.io/address/0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3" },
  ],
  Resources: [
    { label: "GitHub",      href: "https://github.com" },
    { label: "Docs",        href: "#" },
    { label: "Audit Notes", href: "#" },
    { label: "The Graph",   href: "https://thegraph.com/studio" },
  ],
};

const STATS = [
  { label: "Total Assets",  value: "3"       },
  { label: "Network",       value: "Sepolia" },
  { label: "Tests",         value: "371"     },
  { label: "Contracts",     value: "10"      },
];

export function Footer() {
  return (
    <footer className="relative mt-24">
      {/* --- Footer Styles --- */}
      <style>{`
        .footer-glass {
          background: var(--bg-card);
          backdrop-filter: blur(20px);
          border-top: 1px solid var(--border);
        }
        .footer-glow-line {
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 80%; max-width: 800px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(34,211,238,0.4), transparent);
          box-shadow: 0 0 20px rgba(34,211,238,0.5);
        }
        .stat-glass-pill {
          background: var(--bg-base);
          border: 1px solid var(--border);
          border-radius: 20px;
          transition: all 0.3s ease;
        }
        .stat-glass-pill:hover {
          background: var(--bg-card);
          border-color: rgba(34,211,238,0.4);
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(34,211,238,0.1);
        }
        .footer-link {
          color: var(--text-muted);
          text-decoration: none;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
        }
        .footer-link:hover {
          color: var(--cyan);
          transform: translateX(4px);
        }
        .footer-micro-label {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
      `}</style>

      <div className="footer-glass pt-12 pb-8 relative z-10">
        <div className="footer-glow-line" />
        <div className="mx-auto max-w-7xl px-6">

          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-12 mb-12" style={{ borderBottom: "1px solid var(--border)" }}>
            {STATS.map(({ label, value }) => (
              <div key={label} className="stat-glass-pill flex flex-col items-center justify-center py-6 px-4">
                <span style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {value}
                </span>
                <span className="footer-micro-label mt-2" style={{ color: "var(--cyan)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Main Links Grid ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-10 pb-12">

            {/* Brand Column */}
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-10 w-10 flex items-center justify-center rounded-xl"
                  style={{ background: "linear-gradient(135deg, var(--cyan), #818cf8)", boxShadow: "0 4px 14px rgba(34,211,238,0.2)" }}>
                  <span className="text-slate-950 font-black text-lg">⬡</span>
                </div>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  LendFi
                </span>
              </div>
              <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 280, marginBottom: 20 }}>
                A production-grade DeFi lending protocol with Chainlink oracles,
                two-slope interest model, and on-chain governance.
              </p>
              
              {/* Live Status Indicator */}
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border" style={{ background: "rgba(52,211,153,0.05)", borderColor: "rgba(52,211,153,0.2)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 10px #34d399", animation: "blink 2s infinite" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#34d399", letterSpacing: "0.05em" }}>
                  OPERATIONAL ON SEPOLIA
                </span>
              </div>
            </div>

            {/* Link Groups */}
            {Object.entries(LINKS).map(([group, links]) => (
              <div key={group} className="col-span-1">
                <p className="footer-micro-label mb-6" style={{ color: "var(--text-primary)" }}>{group}</p>
                <ul className="space-y-4">
                  {links.map(({ label, href }) => {
                    const isExternal = href.startsWith("http");
                    return (
                      <li key={label}>
                        <Link href={href}
                          target={isExternal ? "_blank" : undefined}
                          rel={isExternal ? "noopener noreferrer" : undefined}
                          className="footer-link"
                          style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500 }}>
                          {label}
                          {isExternal && (
                            <span style={{ opacity: 0.5, marginLeft: 6, fontSize: 12 }}>↗</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* ── Bottom Bar ── */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8"
            style={{ borderTop: "1px solid var(--border)" }}>

            {/* Built by Signature */}
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
              Built by{" "}
              <a
                href="https://adityachotaliya.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: 14,
                  background: "linear-gradient(135deg, var(--cyan) 0%, #a78bfa 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  textDecoration: "none",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { (e.currentTarget.style.filter = "brightness(1.1)"); }}
                onMouseLeave={e => { (e.currentTarget.style.filter = "none"); }}
              >
                Aditya Chotaliya
              </a>
            </p>

            {/* Testnet Warning Badge */}
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl border" style={{ background: "rgba(245,158,11,0.05)", borderColor: "rgba(245,158,11,0.2)" }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Testnet Only</span>
                <span className="hidden sm:block" style={{ color: "var(--border)" }}>|</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  Not audited. Do not use real funds.
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </footer>
  );
}