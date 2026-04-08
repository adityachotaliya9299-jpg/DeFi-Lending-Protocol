"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton }  from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { href: "/",          label: "Markets"   },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/liquidate", label: "Liquidate" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-blue-400">⬡</span>
          <span className="hidden font-bold text-white sm:block">LendFi</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors
                  ${active
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Wallet connect */}
        <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
      </div>
    </nav>
  );
}