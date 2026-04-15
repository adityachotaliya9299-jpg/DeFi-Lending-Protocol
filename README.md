# LendFi — Production-Grade DeFi Lending Protocol

<div align="center">

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity&logoColor=white)](https://soliditylang.org/)
[![Tests](https://img.shields.io/badge/Tests-381%20passing-brightgreen?logo=checkmarx)](https://book.getfoundry.sh/)
[![Network](https://img.shields.io/badge/Sepolia-10%20Verified-blue?logo=ethereum)](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![The Graph](https://img.shields.io/badge/The%20Graph-Subgraph-6747ED)](https://thegraph.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**A full-stack DeFi lending protocol built from scratch.**  
Inspired by Aave v2/v3 and MakerDAO. 10 contracts verified on Sepolia. 381 tests passing.

[**Etherscan**](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0) · [**Whitepaper**](docs/whitepaper.md) · [**Audit Report**](audit/AUDIT_REPORT.md)

</div>

---

## What is LendFi?

LendFi is a non-custodial, permissionless lending protocol featuring:

| Feature | Description |
|---|---|
| **Supply & Borrow** | WETH, USDC, LINK with real Chainlink + TWAP oracle |
| **Two-Slope Interest** | Kink model identical to Aave v2 (80% optimal utilization) |
| **E-Mode** | Up to 97% LTV for correlated assets (Aave v3-inspired) |
| **Isolation Mode** | Global debt ceilings for volatile collateral |
| **Flash Loans** | Zero-collateral atomic borrowing (0.09% fee to depositors) |
| **Credit Delegation** | Lend your borrowing power to trusted addresses — no collateral transfer needed |
| **pUSD Stablecoin** | MakerDAO-style CDP — deposit WETH, mint pUSD |
| **Governance Timelock** | 48-hour delay on all parameter changes |
| **Emergency Pause** | GUARDIAN_ROLE halts deposits/borrows; withdrawals always open |
| **Liquidation Bot** | Automated position monitoring script in `/bots` |
| **Mainnet Fork Tests** | 10 fork tests against real Chainlink feeds and Uniswap v3 |
| **Security Audit** | Self-audit report with 13 findings in `/audit` |

---

## Architecture

```
contracts/src/
├── math/           WadRayMath.sol, PercentageMath.sol
├── interfaces/     ILendingPool, IPriceOracle, ICollateralManager,
│                   IInterestRateModel, IFlashLoanReceiver
├── oracle/         PriceOracle.sol (Chainlink)
│                   OracleWithTWAP.sol (Chainlink + Uniswap v3 TWAP fallback)
├── interest/       InterestRateModel.sol (two-slope kink model)
├── tokens/         LendingToken.sol (lToken, scaled balances — O(1) interest)
├── core/           LendingPool.sol (~750 lines — main contract)
│                   CollateralManager.sol, LiquidationEngine.sol
│                   FlashLoanProvider.sol, CreditDelegation.sol ← unique
├── treasury/       ProtocolTreasury.sol
├── governance/     Governance.sol, GovernanceTimelock.sol (48h delay)
├── stablecoin/     ProtocolStablecoin.sol (pUSD), StablecoinVault.sol (CDP)
├── modes/          IsolationMode.sol, EfficiencyMode.sol
└── mocks/          MockChainlinkFeed.sol, MockERC20.sol

contracts/test/
├── core/           LendingPool, CollateralManager, EdgeCases,
│                   Invariants, MultiUser, CreditDelegation
├── fork/           ForkTest.t.sol — mainnet fork tests (real Chainlink + Uniswap)
├── governance/     Governance, GovernanceTimelock
├── flashloan/      FlashLoan
├── interest/       InterestRateModel
├── math/           WadRayMath, PercentageMath
├── modes/          Modes (E-Mode + Isolation)
├── oracle/         PriceOracle
├── stablecoin/     StablecoinVault
├── tokens/         LendingToken
└── treasury/       ProtocolTreasury

contracts/script/
├── Deploy.s.sol                 — deploys all 7 core contracts
├── SetupAssets.s.sol            — configures WETH/USDC/LINK
├── DeployStablecoin.s.sol       — deploys pUSD + StablecoinVault + Timelock
└── DeployCreditDelegation.s.sol — deploys CreditDelegation contract

frontend/src/
├── app/            10 pages: /, /dashboard, /vault, /modes, /risk,
│                   /analytics, /flashloan, /liquidate, /delegation, /portfolio
├── components/     Navbar (More dropdown), Toast, Tooltip, PauseBanner,
│                   WrongNetwork, HealthFactorBar, StatCard, ClientBanners
├── hooks/          useProtocolData (unified multicall), useTx (tx lifecycle),
│                   useSubgraphPositions, useProtocol, useScrollAnimation
├── constants/      abis.ts (LENDING_POOL + EXTENDED + CREDIT_DELEGATION),
│                   addresses.ts, assets.ts
└── lib/            format.ts, graphql.ts (Apollo + 8 named queries)

subgraph/           The Graph — 11 entities, deployed to Subgraph Studio
bots/               liquidation-bot.ts — automated position monitoring
audit/              AUDIT_REPORT.md — 13 findings, 14 attack vectors tested
docs/               whitepaper.md — 10 sections of protocol design documentation
```

---

## Deployed Contracts — Sepolia Testnet

| Contract | Address | Etherscan |
|---|---|---|
| LendingPool | `0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0` | [View](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0) |
| CollateralManager | `0x2BA6Be87c33acec211B16163997f66aecf73F467` | [View](https://sepolia.etherscan.io/address/0x2BA6Be87c33acec211B16163997f66aecf73F467) |
| PriceOracle | `0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc` | [View](https://sepolia.etherscan.io/address/0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc) |
| InterestRateModel | `0x4924f29EDBa2B85dC098E67c1762696456a8b94A` | [View](https://sepolia.etherscan.io/address/0x4924f29EDBa2B85dC098E67c1762696456a8b94A) |
| LiquidationEngine | `0x6796313464047CeDcCd4a465A3568F93b38C4c9d` | [View](https://sepolia.etherscan.io/address/0x6796313464047CeDcCd4a465A3568F93b38C4c9d) |
| Governance | `0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc` | [View](https://sepolia.etherscan.io/address/0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc) |
| ProtocolTreasury | `0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3` | [View](https://sepolia.etherscan.io/address/0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3) |
| ProtocolStablecoin (pUSD) | `0x233831a3E0Eb8E76570996bA8889C84C59d49D7E` | [View](https://sepolia.etherscan.io/address/0x233831a3E0Eb8E76570996bA8889C84C59d49D7E) |
| StablecoinVault | `0x1155Ed037e879DD359097ccC9F15821dA1a712ef` | [View](https://sepolia.etherscan.io/address/0x1155Ed037e879DD359097ccC9F15821dA1a712ef) |
| GovernanceTimelock | `0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28` | [View](https://sepolia.etherscan.io/address/0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28) |

**Sepolia test assets:** WETH `0xdd13E55...`, USDC `0x94a9D9...`, LINK `0x779877...`

---

## Test Suite — 381 Tests (100% Passing)

```bash
cd contracts
forge test                              # all 381 tests
forge test -vvv                         # verbose output
forge coverage --ir-minimum             # coverage report

# Mainnet fork tests (requires Alchemy key)
export MAINNET_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
forge test --fork-url $MAINNET_RPC --match-path "test/fork/*" -vvv
```

| Suite | Tests | What It Covers |
|---|---|---|
| LendingPool.t.sol | 35 | deposit/borrow/repay/withdraw/liquidate flows |
| CollateralManager.t.sol | 23 | config validation, HF calculation, fuzz |
| EdgeCases.t.sol | 28 | oracle failures, 99% utilization, price crash |
| Invariants.t.sol | 15 | 10 math invariants + fuzz properties |
| MultiUser.t.sol | 11 | 5-user simulations, cascade liquidations |
| CreditDelegation.t.sol | 17 | approve/borrow/repay/expiry/revoke + fuzz |
| FlashLoan.t.sol | 12 | fee, repayment, failure cases |
| **ForkTest.t.sol** | **10** | **Real Chainlink prices, real Uniswap v3 swaps** |
| GovernanceTimelock.t.sol | 16 | schedule/execute/cancel/predecessor chaining |
| Governance.t.sol | 16 | config updates, rate parameter changes |
| InterestRateModel.t.sol | 28 | two-slope kink, monotonicity, boundary |
| PriceOracle.t.sol | 29 | staleness, negative price, WAD normalisation |
| StablecoinVault.t.sol | 19 | CDP mint/burn, liquidation, stability fee |
| LendingToken.t.sol | 30 | scaled balance, interest accrual |
| WadRayMath.t.sol | 30 | fixed-point arithmetic + fuzz roundtrips |
| PercentageMath.t.sol | 28 | BPS arithmetic |
| Modes.t.sol | 18 | E-Mode eligibility, LTV override, isolation |
| ProtocolTreasury.t.sol | 16 | withdraw, access control, events |
| **Total** | **381** | **100% passing** |

---

## Credit Delegation — The Unique Differentiator

Standard DeFi requires collateral ≥ debt. Credit Delegation breaks this:

```solidity
// Alice has 10 WETH deposited → $8,000 borrowing power at 80% LTV
// Alice delegates $5,000 USDC credit to Bob

alice.approveDelegation(
    bob,           // delegatee
    USDC,          // asset
    5000e18,       // max amount (WAD)
    expiry         // optional expiry timestamp
);

// Bob borrows $5,000 USDC with ZERO collateral of his own
bob.borrowWithDelegation(alice, USDC, 5000e18);
// Alice's WETH backs Bob's position
// Alice's health factor drops
// Bob must repay or Alice faces liquidation
```

**Use cases in production (Aave uses this):**
- Market makers needing USDC inventory without locking capital
- Protocol-to-protocol credit lines
- Yield strategy vaults that borrow and farm yield

---

## Interest Rate Model

```
Borrow Rate
    │                                       ╱ Slope 2 (75% APR)
    │                      ───────────────╱
    │                     ╱ Slope 1 (4%)
    │────────────────────
    └────────────────────┬──────────────── Utilization
                        80% (kink)

supplyRate = borrowRate × utilization × (1 − reserveFactor)
```

- Rates stored in **RAY (1e27)** for continuous per-second compounding — prevents rounding to zero
- `newIndex = oldIndex × (1 + ratePerSecond × Δt)` — same as Aave v2

---

## Oracle Security — Dual Source

```
getPrice(asset):
  1. Try Chainlink (primary)
     - Staleness check: block.timestamp - updatedAt ≤ heartbeat
     - Negative/zero guard
     - Incomplete round guard (answeredInRound < roundId)

  2. Try Uniswap v3 TWAP (fallback — 30 min window)

  3. If both valid AND deviation > 10% → use the LOWER price
     → Flash loan attacks can't pump both sources simultaneously

  4. If Chainlink fails → use TWAP
  5. If both fail → revert (safe failure mode)
```

---

## Governance Timelock — Attack Prevention

Without a timelock, a compromised admin key can drain the pool in one block:
1. `setLTV(WETH, 9900)` — allow 99% LTV
2. Deposit 1 WETH as attacker
3. `borrow(USDC, entirePoolBalance)`

With **GovernanceTimelock (48h delay)**, users see the malicious proposal on-chain and have 48 hours to withdraw before execution. `CANCELLER_ROLE` can veto at any point.

---

## Mainnet Fork Tests

Tests run against **real mainnet state** via Alchemy — not mocks:

```bash
export MAINNET_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
forge test --fork-url $MAINNET_RPC --match-path "test/fork/*" -vvv
```

| Test | What It Proves |
|---|---|
| `test_fork_chainlink_eth_price_is_realistic` | Live ETH feed returns $500–$20K, fresh < 2h |
| `test_fork_chainlink_usdc_price_near_peg` | USDC is $0.97–$1.03 at fork time |
| `test_fork_price_wad_normalisation` | Our ×1e10 scaling is correct on real 8-decimal feed |
| `test_fork_swap_eth_for_usdc_on_uniswap` | Real Uniswap v3 swap — implied price > $500/ETH |
| `test_fork_full_protocol_with_real_prices` | Full protocol lifecycle at today's real ETH price |
| `test_fork_liquidation_at_real_prices` | 20% price drop triggers liquidation from 79% LTV |
| `test_fork_flash_loan_fee_vs_uniswap` | Our 0.09% fee is $90 on $100K — competitive |

---

## Liquidation Bot

```bash
cd bots
npm install
cp .env.example .env   # set SEPOLIA_RPC_URL + optional BOT_PRIVATE_KEY
npx ts-node liquidation-bot.ts
```

Runs in **simulation mode** by default (logs what it would do — safe to run without a key).

Every 15 seconds:
1. Queries The Graph for all active borrowers
2. Batch multicalls `getUserAccountData` for all positions (1 RPC call)
3. HF < 1.05 → watch list
4. HF < 1.0 → build opportunity → check profit → execute `liquidate()`

---

## Security

| Measure | Coverage |
|---|---|
| `ReentrancyGuard` | All external state-mutating functions |
| CEI Pattern | Check → Effects → Interactions throughout |
| Chainlink heartbeat | ETH: 3600s, USDC: 86400s — stale prices revert |
| TWAP fallback | Uniswap v3 30-min TWAP when Chainlink unavailable |
| Deviation check | > 10% divergence → use lower (conservative) price |
| 50% Close Factor | Prevents single-call full liquidation |
| Health Factor enforcement | Before every borrow and withdrawal |
| Isolation Mode | Global debt ceiling per volatile asset |
| Governance Timelock | 48h delay — users can exit before changes execute |
| Emergency Pause | GUARDIAN_ROLE halts deposits/borrows; withdrawals always open |
| GUARDIAN_ROLE | Separate from POOL_ADMIN — separation of duties |

**Self-Audit:** See [`audit/AUDIT_REPORT.md`](audit/AUDIT_REPORT.md) — 13 findings (0 critical, 0 high, 3 medium, 4 low, 6 informational), 14 attack vectors tested, 10 invariants verified.

---

## Frontend — 10 Pages

| Route | Description |
|---|---|
| `/` | Live market cards — real TVL, APY, utilization from chain |
| `/dashboard` | Supply/Borrow/Repay/Withdraw with full `useTx` toast lifecycle |
| `/vault` | pUSD CDP — live ratio display, Open/Manage/Close tabs |
| `/modes` | E-Mode category selector + Isolation Mode debt ceiling |
| `/risk` | Protocol Risk Monitor — utilization hero number, trust badges |
| `/analytics` | 5 recharts charts — live subgraph or simulated fallback |
| `/flashloan` | Zero-collateral docs + copy-able arbitrage/liquidation code |
| `/liquidate` | Live address search → real HF from chain → execute liquidation |
| `/delegation` | Grant delegation, borrow with credit, health factor impact |
| `/portfolio` | Position overview + full transaction history from subgraph |

**Key frontend architecture:**
- `useProtocolData` — single batched multicall, all pages share one QueryClient cache
- `useTx` — waiting → submitted (Etherscan link) → confirmed (block) → failed (decoded error)
- `useSubgraphPositions` — full transaction history from The Graph
- `Toast.tsx` — global pub/sub notification system, no external library
- `PauseBanner` — shows to all users when `paused() = true`, guardian-only unpause button
- `WrongNetworkBanner` — red banner + "Switch to Sepolia" button on wrong chain

---

## Quick Start

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 18+

### Contracts

```bash
git clone https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol
cd DeFi-Lending-Protocol/contracts

forge install
forge build
forge test
forge coverage --ir-minimum
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Fill in your values (see Environment Variables below)
npm run build
npm start
```

### Environment Variables

```env
# frontend/.env.local

NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=99d0f6e45d84da0c3341e8ba35298dd1

# Core contracts (Sepolia — already deployed)
NEXT_PUBLIC_LENDING_POOL=0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0
NEXT_PUBLIC_COLLATERAL_MANAGER=0x2BA6Be87c33acec211B16163997f66aecf73F467
NEXT_PUBLIC_PRICE_ORACLE=0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc
NEXT_PUBLIC_WETH=0xdd13E55209Fd76AfE204dBda4007C227904f0a81
NEXT_PUBLIC_USDC=0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8
NEXT_PUBLIC_LINK=0x779877A7B0D9E8603169DdbD7836e478b4624789

# Stablecoin system
NEXT_PUBLIC_PUSD_ADDRESS=0x233831a3E0Eb8E76570996bA8889C84C59d49D7E
NEXT_PUBLIC_STABLECOIN_VAULT=0x1155Ed037e879DD359097ccC9F15821dA1a712ef
NEXT_PUBLIC_GOVERNANCE_TIMELOCK=0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28

# Credit Delegation (deploy via DeployCreditDelegation.s.sol)
NEXT_PUBLIC_CREDIT_DELEGATION=0x9d038E6ecD79b9eE734E5c41477a954b7650cb58

# Optional — enables live analytics charts from The Graph
NEXT_PUBLIC_SUBGRAPH_URL=https://api.studio.thegraph.com/query/4f8dd4ddbc0f6afeb97a9bbe581501f2/defi-lending-protocol/version/latest
```

### Deploy to Sepolia

```bash
cd contracts
source .env

# 1. Core protocol
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY \
  --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY

# 2. Configure assets
forge script script/SetupAssets.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast

# 3. pUSD stablecoin + timelock
forge script script/DeployStablecoin.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY \
  --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY

# 4. Credit delegation
forge script script/DeployCreditDelegation.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY \
  --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.24, Foundry |
| Oracle | Chainlink AggregatorV3Interface + Uniswap v3 TWAP |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Web3 | wagmi v2, viem |
| Wallet | RainbowKit |
| Charts | recharts |
| Indexer | The Graph (GraphQL), Apollo Client |
| Bots | viem v2, TypeScript, ts-node |
| Fonts | Syne + DM Mono + DM Sans |
| Network | Sepolia testnet |

---

## Project Stats

| Metric | Value |
|---|---|
| Smart contract source files | 26 |
| Test suites | 18 |
| Total tests | **381 (100% passing)** |
| Deployed + verified contracts | 10 |
| Frontend pages | 10 |
| TypeScript files | ~36 |
| Lines of Solidity | ~4,200 (source) + ~3,500 (tests) |
| Lines of TypeScript | ~6,000 (frontend + bots) |
| Subgraph entities | 11 |
| Audit findings | 13 (0 critical, 0 high) |

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

Built by [**Aditya Chotaliya**](https://adityachotaliya.vercel.app/)

*This protocol is deployed on Sepolia testnet for portfolio demonstration. It has not been professionally audited. Do not use real funds.*

</div>
