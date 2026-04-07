"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
    RainbowKitProvider,
    getDefaultConfig,
    darkTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { mainnet, sepolia, hardhat } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

const config = getDefaultConfig({
    appName:     "DeFi Lending Protocol",
    projectId:   process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
    chains:      [mainnet, sepolia, hardhat],
    ssr:         true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    theme={darkTheme({
                        accentColor:          "#3b82f6",
                        accentColorForeground: "white",
                        borderRadius:         "medium",
                        fontStack:            "system",
                    })}
                >
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
