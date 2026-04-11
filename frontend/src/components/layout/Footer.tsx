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
  { label: "Contracts",     value: "10"       },
];

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", marginTop: 80 }}>
      <div className="glow-line" />

      <div className="mx-auto max-w-7xl px-4 md:px-6">

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 py-8"
          style={{ borderBottom: "1px solid var(--border)" }}>
          {STATS.map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-4 gap-1">
              <span className="num" style={{ fontFamily: "var(--font-mono)", fontSize: "1.6rem", fontWeight: 500, color: "var(--cyan)" }}>
                {value}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-12">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 flex items-center justify-center rounded-lg"
                style={{ background: "linear-gradient(135deg, var(--cyan), #a78bfa)" }}>
                <span className="text-slate-950 font-bold text-sm">⬡</span>
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--text-primary)" }}>
                LendFi
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 220 }}>
              A production-grade DeFi lending protocol with Chainlink oracles,
              two-slope interest model, and on-chain governance.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <span className="pulse-dot" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#34d399" }}>
                Live on Sepolia
              </span>
            </div>
          </div>

          {/* Link groups */}
          {Object.entries(LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="section-label mb-4">{group}</p>
              <ul className="space-y-2.5">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="text-sm transition-colors duration-150"
                      style={{ color: "var(--text-muted)", textDecoration: "none" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}>
                      {label}
                      {href.startsWith("http") && (
                        <span style={{ opacity: 0.4, marginLeft: 4, fontSize: 10 }}>↗</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-6"
          style={{ borderTop: "1px solid var(--border)" }}>

          {/* Built by — name always highlighted */}
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
            Built by{" "}
            <a
              href="https://adityachotaliya.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 13,
                background: "linear-gradient(135deg, var(--cyan) 0%, #a78bfa 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                textDecoration: "none",
                letterSpacing: "-0.01em",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Aditya Chotaliya
            </a>
          </p>

          <div className="flex items-center gap-4 flex-wrap justify-center">
            <span className="badge badge-amber">Testnet Only</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
              Not audited. Do not use real funds.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}