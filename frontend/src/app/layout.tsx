import type { Metadata } from "next";
import "./globals.css";
import { Providers }        from "./providers";
import { ThemeProvider }    from "@/components/ThemeProvider";
import { Navbar }           from "@/components/layout/Navbar";
import { Footer }           from "@/components/layout/Footer";
import { ToastContainer }   from "@/components/ui/Toast";

export const metadata: Metadata = {
  title:       "LendFi — DeFi Lending Protocol",
  description: "Deposit collateral, borrow assets, and earn yield — fully on-chain on Sepolia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ThemeProvider>
          <Providers>
            <Navbar />
            <main className="min-h-screen">
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