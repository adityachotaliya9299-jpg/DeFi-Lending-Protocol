# LendFi — Production-Grade DeFi Lending Protocol

<div align="center">

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![Tests](https://img.shields.io/badge/Tests-371%20passing-brightgreen)](https://book.getfoundry.sh/)
[![Network](https://img.shields.io/badge/Sepolia-Verified-blue)](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**A full-stack DeFi lending protocol built from scratch — inspired by Aave v2/v3 and MakerDAO.**

[Live App](https://lendfi.vercel.app) · [Etherscan](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0) · [Whitepaper](docs/whitepaper.md)

</div>

---

## What is LendFi?

LendFi is a production-grade, non-custodial DeFi lending protocol with:

- **Supply & Borrow** — WETH, USDC, LINK with real Chainlink price feeds
- **Two-slope interest rates** — kink model identical to Aave v2
- **E-Mode** — up to 97% LTV for correlated assets (Aave v3-inspired)
- **Isolation Mode** — debt ceilings for risky assets
- **Flash Loans** — uncollateralised atomic borrowing (0.09% fee)
- **Credit Delegation** — lend your borrowing power to trusted addresses (unique differentiator)
- **pUSD Stablecoin** — MakerDAO-style CDP backed by WETH
- **48-hour Governance Timelock** — malicious changes can be caught and cancelled
- **Emergency Pause** — GUARDIAN_ROLE can halt deposits/borrows instantly
- **Dual Oracle** — Chainlink + Uniswap v3 TWAP fallback

---

## Architecture

```
contracts/src/
├── math/           WadRayMath.sol, PercentageMath.sol
├── interfaces/     ILendingPool, IPriceOracle, ICollateralManager, IInterestRateModel, IFlashLoanReceiver
├── oracle/         PriceOracle.sol (Chainlink), OracleWithTWAP.sol (Chainlink+TWAP)
├── interest/       InterestRateModel.sol (two-slope kink)
├── tokens/         LendingToken.sol (lToken, scaled balances)
├── core/           LendingPool.sol, CollateralManager.sol,
│                   LiquidationEngine.sol, FlashLoanProvider.sol,
│                   CreditDelegation.sol
├── treasury/       ProtocolTreasury.sol
├── governance/     Governance.sol, GovernanceTimelock.sol (48h delay)
├── stablecoin/     ProtocolStablecoin.sol, StablecoinVault.sol
├── modes/          IsolationMode.sol, EfficiencyMode.sol
└── mocks/          MockChainlinkFeed.sol, MockERC20.sol

frontend/src/
├── app/            9 pages: /, /dashboard, /vault, /modes, /risk,
│                   /analytics, /flashloan, /liquidate, /portfolio
├── components/     Navbar, Toast, Tooltip, PauseBanner, WrongNetwork,
│                   HealthFactorBar, StatCard
├── hooks/          useProtocolData (unified), useTx, useProtocol, useScrollAnimation
├── constants/      abis, addresses, assets
└── lib/            format.ts, graphql.ts (Apollo + The Graph)

subgraph/           11 entities, deployed to Subgraph Studio
docs/               whitepaper.md
```

---

## Deployed Contracts (Sepolia)

| Contract | Address | Status |
|---|---|---|
| LendingPool | [`0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0`](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0) | ✅ Verified |
| CollateralManager | [`0x2BA6Be87c33acec211B16163997f66aecf73F467`](https://sepolia.etherscan.io/address/0x2BA6Be87c33acec211B16163997f66aecf73F467) | ✅ Verified |
| PriceOracle | [`0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc`](https://sepolia.etherscan.io/address/0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc) | ✅ Verified |
| InterestRateModel | [`0x4924f29EDBa2B85dC098E67c1762696456a8b94A`](https://sepolia.etherscan.io/address/0x4924f29EDBa2B85dC098E67c1762696456a8b94A) | ✅ Verified |
| LiquidationEngine | [`0x6796313464047CeDcCd4a465A3568F93b38C4c9d`](https://sepolia.etherscan.io/address/0x6796313464047CeDcCd4a465A3568F93b38C4c9d) | ✅ Verified |
| Governance | [`0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc`](https://sepolia.etherscan.io/address/0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc) | ✅ Verified |
| ProtocolTreasury | [`0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3`](https://sepolia.etherscan.io/address/0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3) | ✅ Verified |
| ProtocolStablecoin (pUSD) | [`0x233831a3E0Eb8E76570996bA8889C84C59d49D7E`](https://sepolia.etherscan.io/address/0x233831a3E0Eb8E76570996bA8889C84C59d49D7E) | ✅ Verified |
| StablecoinVault | [`0x1155Ed037e879DD359097ccC9F15821dA1a712ef`](https://sepolia.etherscan.io/address/0x1155Ed037e879DD359097ccC9F15821dA1a712ef) | ✅ Verified |
| GovernanceTimelock | [`0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28`](https://sepolia.etherscan.io/address/0x6809Df5b59ca7bb2fcC60D19851E748A9C1d5F28) | ✅ Verified |

---

## Test Suite — 371 Tests (100% Passing)

```bash
cd contracts
forge test              # run all 371 tests
forge test -vv          # verbose output
forge coverage --ir-minimum  # coverage report
```

| Suite | Tests | Coverage |
|---|---|---|
| LendingPool.t.sol | 35 | Core deposit/borrow/repay/liquidate flows |
| CollateralManager.t.sol | 23 | Config, health factor calculation, fuzz |
| EdgeCases.t.sol | 28 | Oracle failures, 99% utilization, price crash |
| Invariants.t.sol | 15 | 10 mathematical invariants + fuzz properties |
| MultiUser.t.sol | 11 | 5-user simulations, cascade liquidations |
| FlashLoan.t.sol | 12 | Fee, repayment, failure cases |
| StablecoinVault.t.sol | 19 | CDP mint/burn, liquidation, stability fee |
| Modes.t.sol | 18 | E-Mode, isolation, fuzz |
| GovernanceTimelock.t.sol | 16 | Schedule, execute, cancel, predecessor |
| InterestRateModel.t.sol | 28 | Two-slope, monotonicity, kink |
| PriceOracle.t.sol | 29 | Staleness, negative price, round completion |
| LendingToken.t.sol | 30 | Scaled balance, interest accrual |
| WadRayMath.t.sol | 30 | Fixed-point arithmetic + fuzz |
| PercentageMath.t.sol | 28 | BPS arithmetic |
| Governance.t.sol | 16 | Config updates, rate params |
| ProtocolTreasury.t.sol | 16 | Withdraw, access control |
| CreditDelegation.t.sol | 17 | Approve, borrow, repay, expiry, fuzz |
| **Total** | **371** | **100% passing** |

---

## Credit Delegation — The Unique Differentiator

The one feature that separates LendFi from "just another Aave clone":

```solidity
// Alice has 10 WETH deposited → $8,000 borrowing power
// Alice delegates $5,000 USDC credit to Bob

alice.approveDelegation(bob, USDC, 5000e18, expiry);

// Bob borrows $5,000 USDC with ZERO collateral of his own
bob.borrowWithDelegation(alice, USDC, 5000e18);
// Alice's WETH backs Bob's debt
// Alice's health factor drops
// Bob must repay or Alice faces liquidation
```

**Use cases:** Market makers, protocol-to-protocol credit lines, yield strategy vaults.

---

## Interest Rate Model

```
Borrow Rate
    │                                          ╱ Slope 2 (75% APR)
    │                          ───────────────╱
    │                         ╱ Slope 1 (4%)
    │────────────────────────
    └─────────────────────────┬──────────────── Utilization
                             80% (kink)

supplyRate = borrowRate × utilization × (1 − reserveFactor)
```

Rates stored in RAY (1e27) for continuous per-second compounding — prevents rounding to zero.

---

## Quick Start

### Prerequisites
- [Foundry](https://book.getfoundry.sh/)
- Node.js 18+

### Contracts
```bash
cd contracts
forge install
forge build
forge test
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# Fill in your .env.local
npm run dev
```

### Environment Variables
```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_id
NEXT_PUBLIC_ALCHEMY_ID=your_alchemy_key

# Optional — enables live analytics charts
NEXT_PUBLIC_SUBGRAPH_URL=https://api.studio.thegraph.com/query/YOUR_ID/...
```

### Deploy to Sepolia
```bash
cd contracts
source .env
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify
forge script script/SetupAssets.s.sol --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast
forge script script/DeployStablecoin.s.sol --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast --verify
```

---

## Security

| Measure | Implementation |
|---|---|
| Reentrancy Guard | All external state-mutating functions |
| CEI Pattern | Check → Effects → Interactions throughout |
| Oracle staleness | Heartbeat check on every price read |
| Oracle TWAP fallback | Uniswap v3 as secondary when Chainlink fails |
| Close factor | 50% max per liquidation call |
| Health factor | Enforced before every borrow and withdrawal |
| Governance timelock | 48h delay — users can exit before changes take effect |
| Emergency pause | GUARDIAN_ROLE halts deposits/borrows; withdrawals always open |
| Isolation mode | Global debt ceiling caps exposure to volatile assets |

See [`docs/whitepaper.md`](docs/whitepaper.md) for full threat model and attack vector analysis.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.24, Foundry |
| Oracle | Chainlink AggregatorV3Interface + Uniswap v3 TWAP |
| Frontend | Next.js 14, TypeScript |
| Web3 | wagmi v2, viem |
| Wallet | RainbowKit |
| Charts | recharts |
| Indexer | The Graph (GraphQL, Apollo Client) |
| Fonts | Syne + DM Mono + DM Sans |
| Network | Sepolia testnet |

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
Built by <a href="https://adityachotaliya.vercel.app/">Aditya Chotaliya</a>
</div>
