"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, parseUnits, formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { PageShell, Tabs, AmountField, Reveal, EmptyState, HealthGauge } from "@/components/ui/kit";
import { NFT_COLLATERAL_ABI, ERC721_ABI } from "@/constants/abisExtended";
import { EXT_ADDRESSES } from "@/constants/addresses";
import { useTx } from "@/hooks/useTx";

const NFT_CM = EXT_ADDRESSES.NFT_COLLATERAL;
const MAX_HF = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

type Mode = "deposit" | "borrow" | "withdraw";

export default function NftPage() {
  const { isConnected } = useAccount();
  const [mode, setMode] = useState<Mode>("deposit");
  const [collection, setCollection] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [amount, setAmount] = useState("");

  const validCol = isAddress(collection);
  const idOk = tokenId !== "" && !isNaN(Number(tokenId));
  const idBig = idOk ? BigInt(tokenId) : undefined;

  const { data: position } = useReadContract({
    address: NFT_CM, abi: NFT_COLLATERAL_ABI, functionName: "getPosition",
    args: validCol && idBig !== undefined ? [collection as `0x${string}`, idBig] : undefined,
    query: { enabled: validCol && idBig !== undefined, refetchInterval: 15_000 },
  });
  const { data: hfRaw } = useReadContract({
    address: NFT_CM, abi: NFT_COLLATERAL_ABI, functionName: "getHealthFactor",
    args: validCol && idBig !== undefined ? [collection as `0x${string}`, idBig] : undefined,
    query: { enabled: validCol && idBig !== undefined && !!position?.hasLoan, refetchInterval: 15_000 },
  });
  const { data: maxBorrow } = useReadContract({
    address: NFT_CM, abi: NFT_COLLATERAL_ABI, functionName: "getMaxBorrow",
    args: validCol ? [collection as `0x${string}`] : undefined,
    query: { enabled: validCol, refetchInterval: 30_000 },
  });

  const approveTx = useTx("Approve NFT");
  const actTx = useTx(
    mode === "deposit" ? "Deposit NFT" : mode === "borrow" ? "Borrow against NFT" : "Withdraw NFT");

  const parsed = useMemo(() => {
    try { return amount ? parseUnits(amount, 6) : 0n; } // USDC-denominated debt
    catch { return 0n; }
  }, [amount]);

  const hf = position?.hasLoan && hfRaw !== undefined
    ? (hfRaw === MAX_HF ? null : Number(hfRaw) / 1e18)
    : null;

  const act = () => {
    if (!validCol || idBig === undefined) return;
    if (mode === "deposit") {
      actTx.write({ address: NFT_CM, abi: NFT_COLLATERAL_ABI, functionName: "depositNFT", args: [collection as `0x${string}`, idBig] });
    } else if (mode === "borrow") {
      actTx.write({ address: NFT_CM, abi: NFT_COLLATERAL_ABI, functionName: "borrow", args: [collection as `0x${string}`, idBig, parsed] });
    } else {
      actTx.write({ address: NFT_CM, abi: NFT_COLLATERAL_ABI, functionName: "withdrawNFT", args: [collection as `0x${string}`, idBig] });
    }
  };

  return (
    <PageShell
      eyebrow="NFT collateral · Phase 5"
      title={<>Your JPEG is <span className="grad-text">collateral now.</span></>}
      sub="Lock an ERC-721 from a whitelisted collection, borrow against its oracle floor price, and reclaim it when the loan is repaid."
    >
      <div className="split">
        <Reveal>
          <div className="card card-aurora card-sheen" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {!isConnected ? (
              <EmptyState icon="◨" title="Connect to use NFT collateral" action={<ConnectButton />} />
            ) : (
              <>
                <Tabs value={mode} onChange={setMode} options={[
                  { value: "deposit", label: "Deposit" },
                  { value: "borrow", label: "Borrow" },
                  { value: "withdraw", label: "Withdraw" },
                ]} />

                <div className="field">
                  <div className="field-label"><span>Collection address</span></div>
                  <div className="field-box">
                    <input type="text" placeholder="0x… (whitelisted ERC-721)" value={collection}
                      onChange={e => setCollection(e.target.value.trim())} style={{ fontSize: 15 }} />
                  </div>
                </div>

                <AmountField label="Token ID" value={tokenId} onChange={setTokenId} placeholder="1" suffix="#" />

                {mode === "borrow" && (
                  <AmountField label="Borrow amount" value={amount} onChange={setAmount} suffix="USDC"
                    hint={maxBorrow !== undefined ? `max/NFT: ${Number(formatUnits(maxBorrow as bigint, 6)).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : undefined} />
                )}

                {mode === "deposit" && (
                  <button className="btn btn-ghost btn-block"
                    disabled={!validCol || idBig === undefined || approveTx.isPending}
                    onClick={() => approveTx.write({
                      address: collection as `0x${string}`, abi: ERC721_ABI,
                      functionName: "approve", args: [NFT_CM, idBig!],
                    })}>
                    {approveTx.isPending ? "Approving…" : "1 · Approve NFT transfer"}
                  </button>
                )}

                <button className="btn btn-primary btn-block btn-lg"
                  disabled={!validCol || idBig === undefined || actTx.isPending || (mode === "borrow" && parsed === 0n)}
                  onClick={act}>
                  {actTx.isPending ? "Confirming…" :
                    mode === "deposit" ? "2 · Deposit NFT" :
                    mode === "borrow" ? "Borrow USDC" : "Withdraw NFT"}
                </button>
              </>
            )}
          </div>
        </Reveal>

        <Reveal delay={90}>
          <div className="card card-sheen" style={{ textAlign: "center" }}>
            <div className="stat-label" style={{ marginBottom: 14 }}>Position inspector</div>
            {position && position.owner !== "0x0000000000000000000000000000000000000000" ? (
              <>
                {position.hasLoan ? <HealthGauge hf={hf} /> : (
                  <div style={{ padding: "22px 0" }}>
                    <div style={{ fontSize: 40 }}>◨</div>
                    <div className="chip chip-mint" style={{ marginTop: 10 }}>DEPOSITED · NO LOAN</div>
                  </div>
                )}
                <div style={{ textAlign: "left", marginTop: 16 }}>
                  <div className="inforow"><span>Owner</span><b>{position.owner.slice(0, 8)}…{position.owner.slice(-6)}</b></div>
                  <div className="inforow"><span>Floor at deposit</span>
                    <b>${Number(formatUnits(position.floorPriceAtDeposit, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 })}</b></div>
                  <div className="inforow"><span>Borrowed</span>
                    <b style={{ color: position.hasLoan ? "var(--coral)" : undefined }}>
                      {Number(formatUnits(position.borrowedAmount, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC
                    </b></div>
                  <div className="inforow"><span>Deposited</span>
                    <b>{new Date(Number(position.depositTime) * 1000).toLocaleDateString()}</b></div>
                </div>
              </>
            ) : (
              <p style={{ color: "var(--text-muted)", padding: "36px 0", fontSize: 13.5 }}>
                Enter a collection + token ID to inspect its vault position.
              </p>
            )}
            <div className="hr" />
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, textAlign: "left" }}>
              Floor prices come from the protocol oracle with per-collection LTVs. Audit finding H-07
              (liquidation not pulling debt) is fixed — liquidators now pay before they loot.
            </p>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
