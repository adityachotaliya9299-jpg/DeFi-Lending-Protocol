# LendFi — Technical Whitepaper v3.0 (Final)

**Author:** Aditya Chotaliya  
**Year:** 2026  

**Tech Stack:** Solidity 0.8.24 · Foundry · Next.js 14 · wagmi v2 · viem · The Graph · Chainlink · Uniswap v3  

- GitHub: https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol  
- Portfolio: https://adityachotaliya.vercel.app/  
- Network: Ethereum Sepolia Testnet  

---

## Abstract

LendFi is a production-grade, non-custodial money market protocol deployed on Ethereum Sepolia. It implements the full architecture of a modern DeFi lending system from scratch.

Key features include:
- Overcollateralized lending and borrowing  
- Two-slope interest rate model  
- O(1) interest distribution via scaled balances  
- Dual oracle system (Chainlink + Uniswap v3 TWAP)  
- CDP-based stablecoin (pUSD)  
- Credit delegation  
- Isolation Mode and Efficiency Mode (E-Mode)  
- Flash loans  
- 48-hour governance timelock  
- Emergency circuit breaker  
- Autonomous liquidation bot  

---

## 1. Problem Statement

### 1.1 Traditional Finance Limitations
- Credit access gated by identity, geography, and approvals  
- Slow loan processing (days to weeks)  
- Opaque margin and risk systems  
- Limited global accessibility  

### 1.2 Gaps in DeFi
- Single oracle dependency  
- No governance delay  
- No credit delegation  
- Centralized stablecoin reliance  
- Manual liquidation processes  
- Weak testing coverage  

---

## 2. Protocol Overview

LendFi replaces intermediaries with composable smart contracts inspired by Aave, MakerDAO, and Compound — but built independently.

**Protocol Stats:**
- 26 Solidity files  
- 381 tests (100% passing)  
- 10 deployed contracts  
- ~13,700 total lines of code  

---

## 3. Smart Contract Architecture

### 3.1 Core Contracts

| Contract | Type |
|----------|------|
| LendingPool | Core |
| CollateralManager | Core |
| PriceOracle | Oracle |
| InterestRateModel | Math |
| LiquidationEngine | Core |
| Governance | Admin |
| GovernanceTimelock | Admin |
| ProtocolTreasury | Admin |
| ProtocolStablecoin (pUSD) | Stablecoin |
| StablecoinVault | CDP |

---

### 3.2 LendingPool

Main user-facing contract handling:
- deposit()  
- borrow()  
- repay()  
- withdraw()  
- liquidate()  
- flashLoan()  

---

### 3.3 O(1) Interest Distribution

```
realBalance = scaledBalance × liquidityIndex
```

- Uses RAY precision (1e27)  
- Prevents rounding loss  
- No per-user updates required  

---

### 3.4 Two-Slope Interest Rate Model

| Zone | Formula | Effect |
|------|--------|--------|
| Below 80% | base + slope1 × U | Encourages borrowing |
| Above 80% | base + slope1 + slope2 × excess | Discourages overuse |

---

### 3.5 Dual Oracle System

Process:
1. Fetch Chainlink price  
2. Fetch Uniswap TWAP  
3. Compare deviation  
4. Use safest value  

- Automatic fallback  
- Manipulation resistant  

---

### 3.6 Governance Timelock

- 48-hour delay  
- Prevents instant malicious upgrades  
- Supports cancellation of proposals  

---

### 3.7 Credit Delegation

Allows borrowing without collateral via trusted relationships.

**Example:**
- Alice deposits WETH  
- Bob borrows using Alice’s credit  
- Alice carries liquidation risk  

---

### 3.8 Modes

#### Isolation Mode
- Restricts risk from volatile assets  

#### Efficiency Mode (E-Mode)

| Category | LTV |
|----------|----|
| Stablecoins | 97% |
| ETH-correlated | 90% |
| BTC-correlated | 88% |

---

### 3.9 Flash Loans

- 0.09% fee  
- Fee distributed to depositors  
- ERC20-agnostic repayment  

---

### 3.10 Stablecoin Vault (pUSD)

| Parameter | Value |
|----------|------|
| Collateral Ratio | 150% |
| Liquidation Ratio | 130% |
| Stability Fee | 2% |

---

## 4. Test Suite

- 381 tests across 18 suites  
- Includes:
  - Unit testing  
  - Fuzz testing  
  - Invariant testing  
  - Integration tests  
  - Mainnet fork testing  

---

## 5. Liquidation Bot

Runs every 15 seconds:

1. Discover borrowers  
2. Check health factor  
3. Identify opportunities  
4. Execute liquidation  

Supports:
- Simulation mode  
- Live execution mode  

---

## 6. Frontend Architecture

### Features
- Single multicall data layer  
- React Query caching  
- Error decoding  

### Pages
- Markets  
- Dashboard  
- Vault  
- Modes  
- Risk  
- Analytics  
- Flashloan  
- Liquidation  
- Delegation  
- Portfolio  

---

## 7. Subgraph

Indexes:
- TVL  
- Borrow data  
- User positions  
- Liquidations  

Provides analytics and historical insights.

---

## 8. Security Architecture

- ReentrancyGuard  
- CEI pattern  
- Dual oracle system  
- Timelock governance  
- Emergency pause  
- Health factor enforcement  
- SafeERC20 usage  

---

## 9. Conclusion

LendFi is a complete, production-grade DeFi lending protocol demonstrating:

- Advanced Solidity engineering  
- Secure economic design  
- Real-world architecture  
- Extensive testing coverage  

---

**Author:** Aditya Chotaliya  
**Role:** DeFi Protocol Engineer  
**Version:** Final v3.0  
