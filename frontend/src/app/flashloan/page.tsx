"use client";

import { useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const ARBITRAGE_CODE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFlashLoanReceiver} from "./interfaces/IFlashLoanReceiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title  ArbitrageReceiver
 * @notice Borrow USDC → buy WETH on DEX A → sell on DEX B → repay + profit
 */
contract ArbitrageReceiver is IFlashLoanReceiver {
    address public immutable pool;

    function executeOperation(
        address asset,   // USDC
        uint256 amount,  // borrowed amount
        uint256 fee,     // 0.09% of amount
        address,
        bytes calldata
    ) external override returns (bool) {
        // 1. Your strategy runs here — e.g. buy low, sell high
        uint256 wethBought   = _buyOnDexA(asset, amount);
        uint256 usdcReceived = _sellOnDexB(wethBought);

        // 2. TRANSFER back (not approve) — pool checks balanceOf
        require(usdcReceived >= amount + fee, "not profitable");
        IERC20(asset).transfer(pool, amount + fee);
        // profit stays in this contract

        return true;
    }

    function runArbitrage(uint256 borrowAmt) external {
        ILendingPool(pool).flashLoan(
            address(this), USDC, borrowAmt, ""
        );
    }
}`;

const LIQUIDATION_CODE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFlashLoanReceiver} from "./interfaces/IFlashLoanReceiver.sol";

/**
 * @title  FlashLiquidator
 * @notice Liquidate without capital. Borrow debt asset → liquidate →
 *         sell received collateral → repay → keep the spread.
 */
contract FlashLiquidator is IFlashLoanReceiver {
    address public immutable pool;

    function executeOperation(
        address debtAsset,
        uint256 amount,
        uint256 fee,
        address,
        bytes calldata params
    ) external override returns (bool) {
        // Decode which position to liquidate
        (address borrower, address collateral) =
            abi.decode(params, (address, address));

        // Liquidate — receive collateral at 8% discount
        IERC20(debtAsset).approve(pool, amount);
        ILendingPool(pool).liquidate(
            borrower, debtAsset, collateral, amount
        );

        // Sell the seized collateral back to debt asset
        uint256 colAmt   = IERC20(collateral).balanceOf(address(this));
        uint256 proceeds = _sell(collateral, debtAsset, colAmt);

        // Repay flash loan — profit = proceeds - amount - fee
        IERC20(debtAsset).transfer(pool, amount + fee);
        return true;
    }
}`;

function CodePanel({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{title}</span>
        </div>
        <button onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: copied ? "#34d399" : "rgba(255,255,255,0.4)",
            background: "none", border: "none", cursor: "pointer", transition: "color 0.15s" }}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 380 }}>
        <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.75, color: "#e2e8f0",
          padding: "20px 24px", margin: 0 }}>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

export default function FlashLoanPage() {
  useScrollAnimation();
  const [codeTab, setCodeTab] = useState<"arb" | "liq">("arb");

  const FLOW = [
    { n: "01", icon: "⚡", color: "var(--cyan)", title: "Call flashLoan()",     body: "You call pool.flashLoan(receiver, asset, amount). Zero collateral. No credit check." },
    { n: "02", icon: "→",  color: "#a78bfa",     title: "Tokens arrive",        body: "Pool transfers the exact `amount` to your receiver contract before any checks." },
    { n: "03", icon: "⚙",  color: "#34d399",     title: "executeOperation()",   body: "Your code runs. Arbitrage, liquidate, refinance, collateral swap — anything." },
    { n: "04", icon: "↩",  color: "#f59e0b",     title: "You TRANSFER back",    body: "You must TRANSFER (not approve) amount + fee back to pool before returning true." },
    { n: "05", icon: "✓",  color: "#34d399",     title: "Balance check",        body: "Pool verifies balanceOf(self) ≥ original + fee. If not — entire tx reverts. No risk." },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">

      {/* Hero header */}
      <div className="reveal" style={{ marginBottom: 40 }}>
        <p className="section-label" style={{ marginBottom: 6 }}>Flash Loans</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(2rem,4vw,2.8rem)",
          color: "var(--text-primary)", marginBottom: 10, lineHeight: 1.05 }}>
          Zero-collateral<br />
          <span style={{ background: "linear-gradient(135deg,var(--cyan),#a78bfa)", WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent", backgroundClip: "text" }}>atomic borrowing.</span>
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, maxWidth: 520, lineHeight: 1.75 }}>
          Borrow any amount from the pool with no collateral. Execute your strategy. Repay in the same block.
          If you don't repay — the transaction never happened.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          {[
            { label: "Fee",           value: "0.09%",    color: "var(--cyan)"  },
            { label: "Repay window",  value: "1 tx",     color: "#34d399"      },
            { label: "Collateral",    value: "None",     color: "#a78bfa"      },
            { label: "Risk to pool",  value: "Zero",     color: "#f59e0b"      },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--bg-card)", border: `1px solid var(--border)`,
              borderRadius: 12, padding: "12px 18px", display: "flex", gap: 14, alignItems: "center" }}>
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 2 }}>{label}</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500, color }}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Available pools */}
      <div className="reveal reveal-delay-1" style={{ marginBottom: 40 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>Available liquidity</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { symbol: "WETH", icon: "◈", color: "var(--cyan)",  available: "Live on Sepolia" },
            { symbol: "USDC", icon: "⊕", color: "#34d399",      available: "Live on Sepolia" },
            { symbol: "LINK", icon: "⌁", color: "#a78bfa",      available: "Live on Sepolia" },
          ].map(({ symbol, icon, color, available }) => (
            <div key={symbol} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14,
              padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}12`, border: `1px solid ${color}25`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color }}>
                  {icon}
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{symbol}</p>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>0.09% fee</p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#34d399",
                  background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
                  borderRadius: 6, padding: "3px 8px" }}>{available}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works — timeline */}
      <div className="reveal" style={{ marginBottom: 40 }}>
        <p className="section-label" style={{ marginBottom: 16 }}>How it works</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
          <div style={{ position: "absolute", left: 20, top: 20, bottom: 20, width: 1,
            background: "linear-gradient(180deg, var(--cyan), rgba(34,211,238,0.1))" }} />
          {FLOW.map(({ n, icon, color, title, body }) => (
            <div key={n} style={{ display: "flex", gap: 16, alignItems: "flex-start", paddingLeft: 4 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12,
                border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, color, flexShrink: 0, zIndex: 1, background: "var(--bg-base)" }}>
                {icon}
              </div>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12,
                padding: "14px 18px", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", opacity: 0.5 }}>{n}</span>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{title}</p>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Code examples */}
      <div className="reveal reveal-delay-1" style={{ marginBottom: 32 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>Code examples</p>
        <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, gap: 3, marginBottom: 16 }}>
          {([
            { id: "arb" as const,  label: "DEX Arbitrage"    },
            { id: "liq" as const,  label: "Flash Liquidation" },
          ]).map(({ id, label }) => (
            <button key={id} onClick={() => setCodeTab(id)}
              style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "var(--font-display)", fontWeight: codeTab === id ? 700 : 500, fontSize: 12,
                background: codeTab === id ? "var(--cyan)" : "transparent",
                color: codeTab === id ? "#030712" : "var(--text-muted)", transition: "all 0.12s" }}>
              {label}
            </button>
          ))}
        </div>
        {codeTab === "arb" ? <CodePanel code={ARBITRAGE_CODE}  title="ArbitrageReceiver.sol" />
                           : <CodePanel code={LIQUIDATION_CODE} title="FlashLiquidator.sol"   />}
      </div>

      {/* 3 critical rules */}
      <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {[
          { icon: "→",  color: "#ef4444", title: "TRANSFER, not approve", body: "Pool reads balanceOf(self) after your call. You must push tokens back — pool never calls transferFrom." },
          { icon: "⚡", color: "var(--cyan)", title: "Single transaction", body: "Borrow + strategy + repayment all happen atomically. A failed repayment reverts everything instantly." },
          { icon: "⬡", color: "#34d399", title: "Fee to depositors",     body: "The 0.09% fee bumps the liquidity index, distributing yield proportionally to all lToken holders." },
        ].map(({ icon, color, title, body }) => (
          <div key={title} style={{ background: `${color}06`, border: `1px solid ${color}20`, borderRadius: 14, padding: 20 }}>
            <span style={{ fontSize: 24, color, display: "block", marginBottom: 10 }}>{icon}</span>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 8 }}>{title}</p>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.65 }}>{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}