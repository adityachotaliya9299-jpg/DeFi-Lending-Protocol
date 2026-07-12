import type { Metadata } from "next";
import { Syne, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { Providers }       from "./providers";
import { ThemeProvider }   from "@/components/ThemeProvider";
import { Navbar }          from "@/components/layout/Navbar";
import { Footer }          from "@/components/layout/Footer";
import { ToastContainer }  from "@/components/ui/Toast";
import { ClientBanners }   from "@/components/ui/ClientBanners";
import { Nebula }          from "@/components/visual/Nebula";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title:       "LendFi — The Deepfield Lending Protocol",
  description:
    "Deposit, borrow, leverage, hedge and earn — 27 audited contracts on Sepolia. Flash loans, yield tranches, NFT collateral, interest-rate swaps and on-chain governance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${syne.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <ThemeProvider>
          <Providers>
            <Nebula />
            <ClientBanners />
            <Navbar />
            <main style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
              {children}
            </main>
            <Footer />
            <ToastContainer />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
