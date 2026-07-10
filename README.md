<div align="center">

# 🏦 LendFi Protocol

### Production-Grade Full-Stack DeFi Lending Protocol

[![Tests](https://img.shields.io/badge/tests-670%20passing-brightgreen?style=for-the-badge&logo=checkmarx)](https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?style=for-the-badge&logo=solidity)](https://soliditylang.org)
[![Foundry](https://img.shields.io/badge/Foundry-tested-orange?style=for-the-badge)](https://getfoundry.sh)
[![Network](https://img.shields.io/badge/Sepolia-deployed-627EEA?style=for-the-badge&logo=ethereum)](https://sepolia.etherscan.io)
[![Audited](https://img.shields.io/badge/Audited-LFI--2026--01-blue?style=for-the-badge&logo=shieldsdotio)](./contracts/audit)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**[Live App](https://lendfi-protocol.vercel.app/) · [Audit Report](./contracts/audit/LendFi_Audit_Report.pdf) · [Portfolio](https://adityachotaliya.vercel.app/)**

</div>

---

## What Is LendFi?

LendFi is a production-grade decentralised lending protocol built entirely from scratch — smart contracts, frontend, subgraph, liquidation bot, and formal security audit. Inspired by Aave v3 in architecture, every line of Solidity, every test, and every deployment script was written independently.

The protocol lets users:

- **Deposit** crypto assets (WETH, USDC, LINK) to earn yield
- **Borrow** against collateral at variable or fixed (stable) rates
- **Flash loan** from the pool at a 0.09% fee
- **Leverage** positions up to 4x via single-transaction loop strategies
- **Swap** variable-rate debt for fixed-rate via interest rate swaps
- **Invest** in structured Senior/Junior yield tranches
- **Use NFTs** as collateral (floor-price oracle based)
- **Earn points** for protocol activity, redeemable via governance
- **Vote** on risk parameters through on-chain governance

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.24, Foundry |
| Standards | ERC-20, ERC-721, ERC-4626, ERC-2612 (Permit) |
| Libraries | OpenZeppelin v5, WadRayMath, PercentageMath |
| Oracles | Chainlink + custom N-source weighted median aggregator |
| Frontend | Next.js 14, wagmi v2, viem, RainbowKit, Tailwind CSS |
| Indexing | The Graph (subgraph) + Apollo Client |
| Bot | TypeScript liquidation bot with multicall batching |
| Deployment | Vercel (frontend), Sepolia testnet (contracts) |

---

## Protocol Stats

| Metric | Value |
|--------|-------|
| Test suites | 39 |
| Tests passing | **670 / 670** |
| Source contracts (in-scope) | 45 files |
| Deployed contracts (Sepolia) | 27 contracts |
| Lines of Solidity | ~18,800 (source + tests) |
| Security findings | 37 (0 Critical, 9 High, 12 Med, 10 Low, 6 Info) |
| Audit reference | LFI-2026-01 |

---

## Architecture

```
User
 │
 ├── deposit / borrow / repay / withdraw / liquidate
 │         ↓
 │    LendingPool.sol  ← core state machine
 │         │
 │    ┌────┴────────────────────────────────┐
 │    │                                     │
 │  CollateralManager         InterestRateModel
 │  (LTV, liquidation          (two-slope kinked
 │   threshold, caps)           utilization curve)
 │    │                                     │
 │  PriceOracle ─── OracleAggregator       │
 │  (Chainlink)    (N-source weighted       │
 │                  median, anti-manip)     │
 │    │                                     │
 │  Tokens                             Governance
 │  ├── LendingToken (lToken)          ├── Governance.sol
 │  ├── VariableDebtToken              ├── GovernanceTimelock
 │  └── StableDebtToken                └── RiskGovernance
 │
 └── Phase 4-6 Extensions
     ├── YieldVault (ERC-4626)
     ├── LoopStrategy (leverage)
     ├── IRSwap (rate swap)
     ├── TrancheVault (senior/junior)
     ├── NFTCollateralManager
     ├── CrossChainMessenger (LayerZero)
     ├── OracleAggregator
     ├── PointsAccounting
     ├── RevenueDistributor
     ├── SecurityHardening
     └── MulticallBatch
```

---

## Development Phases

### ✅ Phase 1 — Core Security Hardening
> Supply/borrow caps per asset · ERC-2612 permit gasless approvals · receiveAToken in liquidations

### ✅ Phase 2 — Debt Token Architecture
> VariableDebtToken (non-transferable ERC-20) · scaled balance accounting · credit delegation

### ✅ Phase 3 — Advanced Protocol Features
> StableDebtToken (fixed-rate mode) · OracleAggregator (N-source weighted median) · PointsAccounting · BadDebtSocialisation · ReserveInterestRateStrategy (Aave v3-compatible)

### ✅ Phase 4 — Cross-Chain & Yield Infrastructure
> CrossChainMessenger (LayerZero-compatible) · YieldVault (ERC-4626) · LoopStrategy (1-tx leverage) · RiskGovernance (token-weighted voting) · RevenueDistributor (epoch-based splits)

### ✅ Phase 5 — Derivatives & Advanced DeFi
> IRSwap (cash-settled rate swap) · TrancheVault (Senior/Junior yield structure) · LiquidationPathFinder (multi-collateral optimizer) · NFTCollateralManager (ERC-721 collateral)

### ✅ Phase 6 — Production Hardening
> GasBenchmarks · SecurityHardening (per-asset pause, commit-reveal, rate limits) · MulticallBatch (batch calls in one tx)

### ✅ Security Audit — LFI-2026-01
> Manual review of 45 contracts · 39 findings · 6 PoC exploits · Remediation verified · Full PDF report

---

## Deployed Contracts (Sepolia)

### Phase 1-2 — Core Protocol

| Contract | Address |
|----------|---------|
| LendingPool | [`0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0`](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0) |
| CollateralManager | [`0x2BA6Be87c33acec211B16163997f66aecf73F467`](https://sepolia.etherscan.io/address/0x2BA6Be87c33acec211B16163997f66aecf73F467) |
| PriceOracle | [`0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc`](https://sepolia.etherscan.io/address/0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc) |
| InterestRateModel | [`0x4924f29EDBa2B85dC098E67c1762696456a8b94A`](https://sepolia.etherscan.io/address/0x4924f29EDBa2B85dC098E67c1762696456a8b94A) |
| LiquidationEngine | [`0x6796313464047CeDcCd4a465A3568F93b38C4c9d`](https://sepolia.etherscan.io/address/0x6796313464047CeDcCd4a465A3568F93b38C4c9d) |
| Governance | [`0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc`](https://sepolia.etherscan.io/address/0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc) |
| GovernanceTimelock | [`0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28`](https://sepolia.etherscan.io/address/0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28) |
| ProtocolTreasury | [`0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3`](https://sepolia.etherscan.io/address/0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3) |
| ProtocolStablecoin (pUSD) | [`0x233831a3E0Eb8E76570996bA8889C84C59d49D7E`](https://sepolia.etherscan.io/address/0x233831a3E0Eb8E76570996bA8889C84C59d49D7E) |
| StablecoinVault | [`0x1155Ed037e879DD359097ccC9F15821dA1a712ef`](https://sepolia.etherscan.io/address/0x1155Ed037e879DD359097ccC9F15821dA1a712ef) |

### Phase 3 — Advanced Features

| Contract | Address |
|----------|---------|
| OracleAggregator | [`0x15385976e93e63daAeC2de92eF838Fde64Cb9b4D`](https://sepolia.etherscan.io/address/0x15385976e93e63daAeC2de92eF838Fde64Cb9b4D) |
| PointsAccounting | [`0x0B198a88139ef4FbC92d26C50317a87DAE0ffb1C`](https://sepolia.etherscan.io/address/0x0B198a88139ef4FbC92d26C50317a87DAE0ffb1C) |
| BadDebtSocialisation | [`0xc503366ACB1774C22ea0507eFFDb3B9F9461039d`](https://sepolia.etherscan.io/address/0xc503366ACB1774C22ea0507eFFDb3B9F9461039d) |
| ReserveInterestRateStrategy | [`0x847172E460e8651069169395ec0d1c795A09275b`](https://sepolia.etherscan.io/address/0x847172E460e8651069169395ec0d1c795A09275b) |

### Phase 4 — Cross-Chain & Yield

| Contract | Address |
|----------|---------|
| CrossChainMessenger | [`0x8219AEBbA5E88D02abbfbE4A28442bDBbF2e65d7`](https://sepolia.etherscan.io/address/0x8219AEBbA5E88D02abbfbE4A28442bDBbF2e65d7) |
| YieldVault (USDC) | [`0x9f9E08aC42C9BA5fb550eB86786fDa154beA87De`](https://sepolia.etherscan.io/address/0x9f9E08aC42C9BA5fb550eB86786fDa154beA87De) |
| LoopStrategy | [`0x53D9d6E45202FD91218DFb24bd437F84E6e9f414`](https://sepolia.etherscan.io/address/0x53D9d6E45202FD91218DFb24bd437F84E6e9f414) |
| RiskGovernance | [`0xdF5B53a39743822F0E8C730c0e51a7d06164f047`](https://sepolia.etherscan.io/address/0xdF5B53a39743822F0E8C730c0e51a7d06164f047) |
| RevenueDistributor | [`0xf81b5f8005EBa6D1681F38ecA6Df60A33987d50a`](https://sepolia.etherscan.io/address/0xf81b5f8005EBa6D1681F38ecA6Df60A33987d50a) |

### Phase 5 — Derivatives & Advanced DeFi

| Contract | Address |
|----------|---------|
| IRSwap | [`0x98152bCae8df521F822cFdb2E3434B216D1ddea9`](https://sepolia.etherscan.io/address/0x98152bCae8df521F822cFdb2E3434B216D1ddea9) |
| TrancheVault | [`0xD940d380D319Bf37E10E3ad62ba4fA4CdCC760a6`](https://sepolia.etherscan.io/address/0xD940d380D319Bf37E10E3ad62ba4fA4CdCC760a6) |
| LiquidationPathFinder | [`0x92fDa378C1bD05e7399e378ba4B661980767F567`](https://sepolia.etherscan.io/address/0x92fDa378C1bD05e7399e378ba4B661980767F567) |
| NFTCollateralManager | [`0x9813D0F52Afd25A6BC0851644B5342817d7cec2A`](https://sepolia.etherscan.io/address/0x9813D0F52Afd25A6BC0851644B5342817d7cec2A) |

### Phase 6 — Production Hardening

| Contract | Address |
|----------|---------|
| SecurityHardening | [`0x001Aa6dd462DDeC1fc63D91cca056ff5852185AD`](https://sepolia.etherscan.io/address/0x001Aa6dd462DDeC1fc63D91cca056ff5852185AD) |
| MulticallBatch | [`0x8eC6d026a9EE09c701121F0A5D3a8768c753A117`](https://sepolia.etherscan.io/address/0x8eC6d026a9EE09c701121F0A5D3a8768c753A117) |

### Sepolia Test Assets

| Asset | Address |
|-------|---------|
| WETH | `0xdd13E55209Fd76AfE204dBda4007C227904f0a81` |
| USDC | `0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8` |
| LINK | `0x779877A7B0D9E8603169DdbD7836e478b4624789` |

---

## Security Audit

The protocol underwent a full internal security audit (LFI-2026-01) covering all 45 in-scope contracts at commit [`1374d96`](https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol/commit/1374d96).

### Findings Summary

| Severity | Count | Resolved |
|----------|-------|---------|
| Critical | 0 | — |
| High | 9 | 7 fixed, 2 partial |
| Medium | 12 | 11 fixed, 1 partial |
| Low | 10 | Advisory |
| Informational | 6 | Advisory |
| **Total** | **37** | |

### Key High Findings (Fixed)

| ID | Finding | Status |
|----|---------|--------|
| H-01/02 | Supply cap validation applied to borrow/repay/withdraw — DoS | ✅ Fixed |
| H-03 | E-Mode health factor uses RAY instead of WAD — liquidation bypass | ✅ Fixed |
| H-04 | StableDebt `_accrueInterest()` no-op — interest lost on multi-mint | ✅ Fixed |
| H-05 | Governance quorum bypass with zero token supply | ⚠️ Partial |
| H-06 | TrancheVault senior cap skipped on first deposit | ✅ Fixed |
| H-07 | NFT `liquidate()` never pulls debt from liquidator | ✅ Fixed |
| H-08 | LoopStrategy 1:1 price assumption breaks cross-asset positions | ⚠️ Partial |

### Audit Deliverables

```
contracts/audit/
├── LendFi_Audit_Report.pdf      ← Full 9-section PDF report
├── Findings.xlsx                ← 37 findings spreadsheet
├── Remediation_Report.md        ← Post-fix verification
├── POCs/
│   ├── Exploit_H01_SupplyCapDoS.t.sol
│   ├── Exploit_H03_EModeHFBypass.t.sol
│   ├── Exploit_H04_StableDebtInterestLoss.t.sol
│   ├── Exploit_H05_GovernanceQuorumBypass.t.sol
│   ├── Exploit_H06_TrancheVaultSeniorCapBypass.t.sol
│   └── Exploit_H07_NFTLiquidationFreeLoot.t.sol
├── SCOPE.md
├── METHODOLOGY.md
├── THREAT_MODEL.md
└── PRIVILEGE_MAP.md
```

---

## Repository Structure

```
DeFi-Lending-Protocol/
├── contracts/
│   ├── src/
│   │   ├── core/           LendingPool, CollateralManager, LiquidationEngine,
│   │   │                   FlashLoanProvider, BadDebtSocialisation, CreditDelegation
│   │   ├── tokens/         LendingToken, VariableDebtToken, StableDebtToken
│   │   ├── oracle/         PriceOracle, OracleAggregator, OracleWithTWAP
│   │   ├── governance/     Governance, GovernanceTimelock, RiskGovernance
│   │   ├── interest/       InterestRateModel, ReserveInterestRateStrategy
│   │   ├── stablecoin/     ProtocolStablecoin, StablecoinVault
│   │   ├── derivatives/    IRSwap
│   │   ├── tranches/       TrancheVault
│   │   ├── nft/            NFTCollateralManager
│   │   ├── leverage/       LoopStrategy
│   │   ├── crosschain/     CrossChainMessenger
│   │   ├── vault/          YieldVault
│   │   ├── revenue/        RevenueDistributor
│   │   ├── points/         PointsAccounting
│   │   ├── security/       SecurityHardening
│   │   ├── liquidation/    LiquidationPathFinder
│   │   ├── treasury/       ProtocolTreasury
│   │   ├── utils/          MulticallBatch
│   │   ├── math/           WadRayMath, PercentageMath
│   │   ├── modes/          IsolationMode, EfficiencyMode
│   │   └── interfaces/     10 interface files
│   ├── test/               39 test suites (670 tests)
│   ├── script/             Deployment scripts
│   └── audit/              Security audit deliverables
└── frontend/               Next.js 14 application
```

---

## Getting Started

### Prerequisites

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Clone & Build

```bash
git clone https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol.git
cd DeFi-Lending-Protocol/contracts
forge install
forge build
```

### Run Tests

```bash
# Full test suite (670 tests)
forge test

# With gas report
forge test --gas-report

# Specific suite
forge test --match-path "test/core/LendingPool.t.sol" -vv

# Coverage
forge coverage --ir-minimum

# Fork tests (requires Sepolia RPC)
forge test --match-path "test/fork/ForkTest.t.sol" \
  --fork-url $SEPOLIA_RPC_URL -vv

# PoC exploits
forge test --match-path "audit/POCs/*" -vv
```

### Environment Setup

Create `contracts/.env`:

```env
SEPOLIA_RPC_URL=https://...
PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...
MAINNET_RPC=https://...
```

### Deploy

```bash
# Phase 1-2 (core protocol — already deployed)
# forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL \
#   --private-key $PRIVATE_KEY --broadcast --verify -vvvv

# Phase 3-5
forge script script/DeployPhase4And5.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY \
  --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY -vvvv

# Phase 6
forge script script/DeployPhase6.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY \
  --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY -vvvv
```

### Frontend

```bash
cd frontend
npm install

# Set environment variables in frontend/.env.local
# (see contracts/audit/README.md for full .env.local block)

npm run build && npm start
```

---

## Frontend Pages

| Route | Feature |
|-------|---------|
| `/` | Dashboard — portfolio overview, health factor, positions |
| `/markets` | All assets — supply/borrow rates, utilization |
| `/vault` | StablecoinVault — mint/redeem pUSD |
| `/flashloan` | Flash loan interface |
| `/liquidate` | Liquidation scanner and executor |
| `/analytics` | Protocol analytics — TVL, volume, rates |
| `/portfolio` | User positions, debt, collateral |
| `/delegation` | Credit delegation management |
| `/governance` | Governance proposals and voting |
| `/risk` | Risk parameter dashboard |

---

## Key Design Decisions

**Scaled balance accounting** — every deposit and borrow is stored as a scaled amount (actual / index). This means interest accrues automatically without touching individual user positions — the index does all the work.

**Dual source of truth** — `_scaledBorrows` is the canonical debt record used for health factor calculations. VariableDebtToken and StableDebtToken are ERC-20 view layers for wallet compatibility and credit delegation — they are never used for internal math.

**Single-entry nonReentrant** — all state-changing LendingPool functions are individually guarded. Callbacks (flash loans, ERC-721 receiver) are handled after state updates (CEI pattern throughout).

**Mode-based borrowing** — `borrow(asset, amount, mode)` with mode=1 for variable rate and mode=2 for stable rate. Each mode has an independent debt token; both count toward the health factor.

**Weighted median oracle** — OracleAggregator supports up to 5 Chainlink feeds per asset with configurable weights. Stale, reverting, and negative feeds are automatically excluded. Requires MIN_VALID_FEEDS=2 to return a price.

---

## Lessons Learned

Building a protocol at this scale revealed several non-obvious Solidity patterns:

- `NEXT_PUBLIC_` env vars are embedded at **build time** — `npm run build && npm start`, never `npm run dev` for production config
- `forge coverage` requires `--ir-minimum` for large contracts (stack too deep otherwise)
- OpenZeppelin v5 makes `_balances` and `_totalSupply` **private**, not protected — custom debt tokens need their own tracking
- When inheriting `ERC20` + a custom interface extending `IERC20`, override lists must include `(ERC20, IERC20)` explicitly
- Solidity rejects compile-time float division constants — `0.04e27 / (365 days)` must be pre-computed
- Supply cap checks copy-pasted into borrow/repay/withdraw — a semantic error that became the most impactful audit finding

---

## Audit

Full security audit completed July 2026 — see [`contracts/audit/`](./contracts/audit/) for all deliverables including the PDF report, PoC exploits, and remediation verification.

---

## Author

**Aditya Chotaliya**

- Portfolio: [adityachotaliya.vercel.app](https://adityachotaliya.vercel.app/)
- GitHub: [@adityachotaliya9299-jpg](https://github.com/adityachotaliya9299-jpg)

---

<div align="center">

Built with Foundry · Deployed on Sepolia · Audited LFI-2026-01

</div>