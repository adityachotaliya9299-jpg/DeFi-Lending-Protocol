"use client";

import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { CONTRACT_ADDRESSES, EXT_ADDRESSES, STABLECOIN_ADDRESSES } from "@/constants/addresses";

const NAV = {
  Markets: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Markets", href: "/markets" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Analytics", href: "/analytics" },
  ],
  Earn: [
    { label: "Yield Vault", href: "/yield" },
    { label: "Tranches", href: "/tranches" },
    { label: "Points", href: "/points" },
    { label: "pUSD Vault", href: "/vault" },
  ],
  Trade: [
    { label: "Leverage", href: "/leverage" },
    { label: "Rate Swap", href: "/swap" },
    { label: "Flash Loans", href: "/flashloan" },
    { label: "NFT Collateral", href: "/nft" },
  ],
  Protocol: [
    { label: "Governance", href: "/governance" },
    { label: "Risk & Audit", href: "/risk" },
    { label: "Liquidations", href: "/liquidate" },
    { label: "Delegation", href: "/delegation" },
  ],
};

const DEPLOYED: { name: string; addr: string }[] = [
  { name: "LendingPool",        addr: CONTRACT_ADDRESSES.LENDING_POOL },
  { name: "CollateralManager",  addr: CONTRACT_ADDRESSES.COLLATERAL_MANAGER },
  { name: "PriceOracle",        addr: CONTRACT_ADDRESSES.PRICE_ORACLE },
  { name: "LiquidationEngine",  addr: CONTRACT_ADDRESSES.LIQUIDATION_ENGINE },
  { name: "YieldVault",         addr: EXT_ADDRESSES.YIELD_VAULT },
  { name: "LoopStrategy",       addr: EXT_ADDRESSES.LOOP_STRATEGY },
  { name: "IRSwap",             addr: EXT_ADDRESSES.IRSWAP },
  { name: "TrancheVault",       addr: EXT_ADDRESSES.TRANCHE_VAULT },
  { name: "NFTCollateral",      addr: EXT_ADDRESSES.NFT_COLLATERAL },
  { name: "RiskGovernance",     addr: EXT_ADDRESSES.RISK_GOVERNANCE },
  { name: "pUSD",               addr: STABLECOIN_ADDRESSES.PUSD },
  { name: "SecurityHardening",  addr: EXT_ADDRESSES.SECURITY_HARDENING },
];

export function Footer() {
  return (
    <footer style={{ position: "relative", zIndex: 1, marginTop: 40 }}>
      {/* deployed contracts marquee */}
      <div className="marquee" style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--bg-glass)", backdropFilter: "blur(12px)" }}>
        <div className="marquee-track">
          {[...DEPLOYED, ...DEPLOYED].map((c, i) => (
            <a key={i}
              href={`https://sepolia.etherscan.io/address/${c.addr}`}
              target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none", whiteSpace: "nowrap" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--mint)", boxShadow: "0 0 8px var(--mint)" }} />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12.5, color: "var(--text-secondary)" }}>{c.name}</span>
              <span className="num" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                {c.addr.slice(0, 6)}…{c.addr.slice(-4)}
              </span>
            </a>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 24px 30px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(4, 1fr)", gap: 32 }} className="lf-foot-grid">
          <div>
            <Logo size={40} />
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, maxWidth: 280, marginTop: 16, lineHeight: 1.7 }}>
              A production-grade DeFi lending protocol built from scratch —
              27 contracts, 670 passing tests, audited under LFI-2026-01.
              Live on Sepolia.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
              <span className="chip chip-mint">670 tests</span>
              <span className="chip chip-azure">Sepolia</span>
              <span className="chip chip-violet">Audited</span>
            </div>
          </div>
          {Object.entries(NAV).map(([group, links]) => (
            <div key={group}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 14 }}>
                {group}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {links.map(l => (
                  <Link key={l.href} href={l.href}
                    style={{ textDecoration: "none", color: "var(--text-secondary)", fontSize: 13.5, transition: "color .2s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--mint)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-secondary)")}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", marginTop: 44, paddingTop: 22, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            © 2026 LendFi Protocol · Built by{" "}
            <a href="https://adityachotaliya.vercel.app/" target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)" }}>
              Aditya Chotaliya
            </a>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
            <LogoMark size={16} glow={false} /> TESTNET DEPLOYMENT — NOT FINANCIAL ADVICE
          </span>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .lf-foot-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 540px) {
          .lf-foot-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}
