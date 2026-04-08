"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { sepolia, mainnet, hardhat } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

const config = getDefaultConfig({
  appName:   "DeFi Lending Protocol",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID",
  // Sepolia first — that's our primary deploy target
  chains:    [sepolia, mainnet, hardhat],
  ssr:       true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:    30_000,   // 30 s
      refetchInterval: 15_000, // 15 s
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor:           "#3b82f6",
            accentColorForeground: "white",
            borderRadius:          "medium",
            fontStack:             "system",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}