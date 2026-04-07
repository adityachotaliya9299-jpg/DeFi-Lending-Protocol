import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
    title:       "DeFi Lending Protocol",
    description: "Deposit, borrow, and earn yield on your crypto assets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="antialiased bg-surface text-white">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}