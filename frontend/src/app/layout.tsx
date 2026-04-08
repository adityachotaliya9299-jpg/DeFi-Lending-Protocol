import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar }    from "@/components/layout/Navbar";

export const metadata: Metadata = {
  title:       "LendFi — DeFi Lending Protocol",
  description: "Deposit collateral, borrow assets, and earn yield — fully on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white antialiased">
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}