# LendFi — Production-Grade DeFi Lending Protocol

<div align="center">

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Foundry-Tests%20338%20%E2%9C%93-orange)](https://book.getfoundry.sh/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![Network](https://img.shields.io/badge/Network-Sepolia-blue)](https://sepolia.etherscan.io/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**A full-stack DeFi lending protocol built from scratch — inspired by Aave v2/v3 and MakerDAO.**

[Live App](https://lendfi.vercel.app) · [Etherscan](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0) · [Subgraph](https://thegraph.com/studio)

</div>

---

## What is LendFi?

LendFi is a production-grade DeFi lending protocol with:

- **Deposit** WETH, USDC, or LINK — earn yield via automated interest accrual
- **Borrow** against your collateral with real Chainlink price feeds
- **Flash Loans** — uncollateralised atomic borrowing (0.09% fee)
- **pUSD Stablecoin** — mint a CDP-backed stablecoin against WETH (MakerDAO-style)
- **E-Mode** — 97% LTV for stablecoin-to-stablecoin borrowing (Aave v3-inspired)
- **Isolation Mode** — risk-capped borrowing for volatile assets
- **On-chain Governance** — update risk parameters, interest rates, asset configs

Everything is deployed on Sepolia with 338 Foundry tests passing.

---

## Architecture

```
defi-lending-protocol/
├── contracts/
│   ├── src/
│   │   ├── math/           WadRayMath.sol, PercentageMath.sol
│   │   ├── interfaces/     ILendingPool, IPriceOracle, ICollateralManager,
│   │   │                   IInterestRateModel, IFlashLoanReceiver
│   │   ├── oracle/         PriceOracle.sol (Chainlink wrapper)
│   │   ├── interest/       InterestRateModel.sol (two-slope kink model)
│   │   ├── tokens/         LendingToken.sol (lToken receipt token)
│   │   ├── core/           LendingPool.sol, CollateralManager.sol,
│   │   │                   LiquidationEngine.sol, FlashLoanProvider.sol
│   │   ├── treasury/       ProtocolTreasury.sol
│   │   ├── governance/     Governance.sol
│   │   ├── stablecoin/     ProtocolStablecoin.sol, StablecoinVault.sol
│   │   ├── modes/          IsolationMode.sol, EfficiencyMode.sol
│   │   └── mocks/          MockChainlinkFeed.sol, MockERC20.sol
│   └── test/               338 tests across 15 suites
├── frontend/               Next.js 14
│   └── src/
│       ├── app/            9 pages: markets, dashboard, vault, modes,
│       │                   risk, analytics, flashloan, liquidate, portfolio
│       ├── components/     ThemeProvider, Navbar, Footer, StatCard,
│       │                   HealthFactorBar, DepositModal, BorrowModal
│       ├── hooks/          useProtocol, useScrollAnimation, useTypewriter
│       ├── constants/      abis, addresses, assets
│       └── lib/            format.ts, graphql.ts (Apollo Client)
├── subgraph/               The Graph (11 entities, Sepolia)
└── audit-notes/            SECURITY.md (10 attack vectors documented)
```

---

## Deployed Contracts (Sepolia)

| Contract | Address |
|---|---|
| LendingPool | [`0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0`](https://sepolia.etherscan.io/address/0xF4886e1Ab9b3EC821feB94eEf1C4Bf6bf0fa09A0) |
| CollateralManager | [`0x2BA6Be87c33acec211B16163997f66aecf73F467`](https://sepolia.etherscan.io/address/0x2BA6Be87c33acec211B16163997f66aecf73F467) |
| PriceOracle | [`0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc`](https://sepolia.etherscan.io/address/0x746DE549Dea06A7871B4FBA32309DBA01D0A98bc) |
| InterestRateModel | [`0x4924f29EDBa2B85dC098E67c1762696456a8b94A`](https://sepolia.etherscan.io/address/0x4924f29EDBa2B85dC098E67c1762696456a8b94A) |
| LiquidationEngine | [`0x6796313464047CeDcCd4a465A3568F93b38C4c9d`](https://sepolia.etherscan.io/address/0x6796313464047CeDcCd4a465A3568F93b38C4c9d) |
| Governance | [`0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc`](https://sepolia.etherscan.io/address/0xcDE9E0BAc0Bb74ADE45ea44B8b47eF684F045Ebc) |
| ProtocolTreasury | [`0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3`](https://sepolia.etherscan.io/address/0x6636a50dde7eEfB90dc71b6E02C54CdabeAb6Ce3) |

---

## Core Features

### Interest Rate Model (Two-Slope Kink)

```
Borrow Rate
    │                                    ╱
    │                                   ╱  Slope 2 (steep)
    │                   ───────────────╱
    │                  ╱ Slope 1
    │─────────────────
    └──────────────────┬───────────────── Utilization
                      80% (kink)
```

- **Base rate:** 1% APR at 0% utilization
- **Slope 1:** Linear to 5% APR at the 80% kink
- **Slope 2:** Steep jump to ~75% APR at 100% — strongly disincentivises overborrowing
- Supply rate = Borrow rate × Utilization × (1 − Reserve factor)

### Scaled Balances (Same as Aave)

Interest accrues via global index updates. No per-user loops required.

```
scaledDeposit[user] = deposit / liquidityIndexAtDepositTime
currentBalance      = scaledDeposit × currentLiquidityIndex
```

Every deposit/borrow/repay triggers `_accrueInterest()` which updates both the liquidity index and borrow index linearly with `block.timestamp`.

### Flash Loans

```solidity
interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 fee,        // 0.09% of amount
        address initiator,
        bytes calldata params
    ) external returns (bool);
}
```

The pool transfers tokens to your receiver, calls `executeOperation()`, then checks `balanceOf(self) >= original + fee`. If you don't transfer back — entire tx reverts. Fee distributes to depositors via liquidity index bump.

### pUSD CDP (MakerDAO-inspired)

| Parameter | Value |
|---|---|
| Min collateralisation ratio | 150% |
| Liquidation ratio | 130% |
| Liquidation bonus | 10% |
| Stability fee | 2% APR |
| Close factor | 50% per call |
| Debt ceiling | 1,000,000 pUSD (WETH) |

### E-Mode Categories

| Category | Assets | LTV | Liq. Threshold |
|---|---|---|---|
| 0 — Standard | All | Per-asset | Per-asset |
| 1 — ETH Correlated | WETH, stETH, rETH | **90%** | 93% |
| 2 — Stablecoins | USDC, USDT, DAI | **97%** | 97.5% |
| 3 — BTC Correlated | WBTC, tBTC | **88%** | 91% |

### Isolation Mode

Risky assets can only be used as collateral in isolation mode:
- Can only borrow approved stablecoins (not ETH or other volatile assets)
- Global debt ceiling caps total exposure to that asset across all users

---

## Test Suite

```
forge test
```

| Suite | Tests | What it covers |
|---|---|---|
| LendingPool.t.sol | 35 | Core deposit/borrow/repay/liquidate flows |
| CollateralManager.t.sol | 23 | Config validation, HF calculation, fuzz |
| EdgeCases.t.sol | 28 | Oracle 0/negative, 99% utilization, price crash |
| Invariants.t.sol | 15 | 10 mathematical invariants + fuzz properties |
| MultiUser.t.sol | 11 | 5-user simulations, cascade liquidations |
| FlashLoan.t.sol | 12 | Fee, repayment, failure cases |
| StablecoinVault.t.sol | 19 | CDP mint/burn, liquidation, stability fee |
| Modes.t.sol | 18 | E-Mode eligibility, LTV override, isolation |
| InterestRateModel.t.sol | 28 | Two-slope kink, monotonicity |
| PriceOracle.t.sol | 29 | Staleness, negative price, WAD normalisation |
| LendingToken.t.sol | 30 | Scaled balance, interest accrual |
| WadRayMath.t.sol | 30 | Fixed-point arithmetic + fuzz roundtrips |
| PercentageMath.t.sol | 28 | BPS arithmetic |
| Governance.t.sol | 16 | Config updates, rate params |
| ProtocolTreasury.t.sol | 16 | Withdraw, access control |
| **Total** | **338** | **100% passing** |

```bash
forge coverage --ir-minimum   # stack-too-deep resolved via --ir-minimum
```

---

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Node.js](https://nodejs.org/) >= 18
- [Git](https://git-scm.com/)

### Clone & Setup

```bash
git clone https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol
cd DeFi-Lending-Protocol
```

### Contracts

```bash
cd contracts
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
# Fill in your .env.local (see Environment Variables below)
npm run dev       # development
npm run build     # production build
npm start         # start production server
```

### Environment Variables

```env
# frontend/.env.local

NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_id
NEXT_PUBLIC_ALCHEMY_ID=your_alchemy_id
NEXT_PUBLIC_CHAIN_ID=11155111

# Optional — The Graph subgraph URL
NEXT_PUBLIC_SUBGRAPH_URL=https://api.studio.thegraph.com/query/...
```

---

## Deployment

### Deploy to Sepolia

```bash
cd contracts

# Copy and fill in your env
cp .env.example .env

# Deploy all 7 contracts
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify

# Setup assets (WETH, USDC, LINK)
forge script script/SetupAssets.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### Deploy Subgraph

```bash
cd subgraph
npm install -g @graphprotocol/graph-cli
graph auth YOUR_DEPLOY_KEY
graph deploy --studio defi-lending-protocol
```

---

## Security

### Measures Implemented

| Measure | Where |
|---|---|
| `ReentrancyGuard` | All external state-mutating functions |
| CEI pattern | Check → Effects → Interactions throughout |
| Chainlink staleness check | Every price read in PriceOracle |
| Close factor (50%) | Prevents full single-call liquidation |
| Health factor enforcement | Before every borrow and withdrawal |
| AccessControl roles | Pool admin, configurator, minter |
| Oracle price guards | Negative, zero, stale, incomplete round |
| Isolation debt ceiling | Caps max loss from volatile collateral |

### Known Limitations (Testnet)

- No governance timelock — parameter changes are immediate
- Single Chainlink feed per asset — no TWAP fallback
- pUSD assumes 1:1 USD peg — no stability module (PSM) yet
- No emergency pause / circuit breaker

See [`audit-notes/SECURITY.md`](audit-notes/SECURITY.md) for full threat model.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.24 |
| Testing | Foundry (forge), 1000 fuzz runs |
| Oracle | Chainlink AggregatorV3Interface |
| Frontend | Next.js 14, TypeScript |
| Web3 | wagmi v2, viem |
| Wallet | RainbowKit |
| Charts | recharts |
| Indexer | The Graph (GraphQL) |
| Fonts | Syne, DM Mono, DM Sans |
| Deploy | Sepolia testnet, Vercel |

---

## Frontend Pages

| Route | Description |
|---|---|
| `/` | Markets — live prices, supply/borrow actions |
| `/dashboard` | Manage all positions in one place |
| `/vault` | pUSD CDP — deposit WETH, mint stablecoin |
| `/modes` | E-Mode selector + Isolation Mode info |
| `/risk` | Protocol risk dashboard — utilization, APY, HF distribution |
| `/analytics` | Historical charts — TVL, APY, borrow volume, liquidations |
| `/flashloan` | Flash loan docs + arbitrage/liquidation code examples |
| `/liquidate` | Liquidation engine — search positions, execute liquidations |
| `/portfolio` | Your positions overview |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Run tests: `forge test`
4. Commit: `git commit -m 'feat: add my feature'`
5. Push: `git push origin feature/my-feature`
6. Open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

Built by [Aditya Chotaliya](https://adityachotaliya.vercel.app/)

</div>
