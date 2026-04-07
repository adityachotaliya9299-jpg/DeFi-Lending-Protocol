import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function HomePage() {
    return (
        <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
            <div className="text-center space-y-3">
                <h1 className="text-4xl font-bold tracking-tight">
                    DeFi Lending Protocol
                </h1>
                <p className="text-slate-400 text-lg max-w-md">
                    Deposit collateral, borrow assets, and earn yield — fully on-chain.
                </p>
            </div>

            <ConnectButton />

            <p className="text-slate-500 text-sm">
                🚧 Dashboard coming soon — contracts deploying next
            </p>
        </main>
    );
}
