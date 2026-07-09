# LendFi Security Audit — Privilege Map

**Audit Ref:** LFI-2026-07 | Commit: 1374d96

---

## Role Registry

| Role | keccak256 Hash | Holder(s) | Contract(s) |
|------|----------------|-----------|-------------|
| DEFAULT_ADMIN_ROLE | 0x000...000 | Deployer | All AccessControl contracts |
| POOL_ADMIN_ROLE | keccak256("POOL_ADMIN_ROLE") | Deployer | LendingPool |
| GUARDIAN_ROLE | keccak256("GUARDIAN_ROLE") | Deployer | LendingPool |
| ADMIN_ROLE | keccak256("ADMIN_ROLE") | Deployer | OracleAggregator, PointsAccounting, BadDebtSocialisation, RiskGovernance, SecurityHardening, etc. |
| POOL_ROLE | keccak256("POOL_ROLE") | LendingPool addr | PointsAccounting, BadDebtSocialisation |
| ORACLE_ROLE | keccak256("ORACLE_ROLE") | Deployer | NFTCollateralManager |
| TREASURY_ROLE | keccak256("TREASURY_ROLE") | Deployer | RevenueDistributor |
| ENDPOINT_ROLE | keccak256("ENDPOINT_ROLE") | (unset) | CrossChainMessenger |
| Owner | Ownable pattern | Deployer | PriceOracle, InterestRateModel, Governance, ProtocolTreasury |
| Proposer | GovernanceTimelock | Deployer | GovernanceTimelock |
| Executor | GovernanceTimelock | Deployer | GovernanceTimelock |
| Canceller | GovernanceTimelock | Deployer | GovernanceTimelock |

---

## Permission Matrix

| Action | Required Role | Contract | Risk if Abused |
|--------|--------------|----------|----------------|
| initAsset(asset) | POOL_ADMIN_ROLE | LendingPool | Add malicious asset with fake oracle |
| pause() | GUARDIAN_ROLE | LendingPool | Halt new deposits/borrows indefinitely |
| unpause() | GUARDIAN_ROLE | LendingPool | Resume after malicious pause |
| setTreasury() | POOL_ADMIN_ROLE | LendingPool | Redirect reserve fees to attacker |
| setIsolationConfig() | POOL_ADMIN_ROLE | LendingPool | Expand/remove isolation ceilings |
| setEModeCategory() | POOL_ADMIN_ROLE | LendingPool | Set 100% LTV for any category |
| registerFeed() | Owner | PriceOracle | Set malicious price feed |
| removeFeed() | Owner | PriceOracle | Remove all price feeds → no borrows/withdrawals |
| setRateParams() | Owner | InterestRateModel | Set 0% borrow rate → protocol drained |
| registerFeeds() | ADMIN_ROLE | OracleAggregator | Replace all feeds with attacker-controlled |
| updateFloorPrice() | ORACLE_ROLE | NFTCollateralManager | Set floor = 0 or 10x actual |
| addCollection() | ADMIN_ROLE | NFTCollateralManager | Add fake collection at 70% LTV |
| setVariableRate() | ADMIN_ROLE | IRSwap | Manipulate settlement values |
| absorbBadDebt() | ADMIN_ROLE | TrancheVault | Artificially reduce senior TVL |
| setMaxLeverage() | ADMIN_ROLE | LoopStrategy | Allow 10x leverage on volatile assets |
| setTrustedRemote() | ADMIN_ROLE | CrossChainMessenger | Accept messages from attacker-controlled chain |
| setAssetRate() | ADMIN_ROLE | PointsAccounting | Set 1e30 rate → mint infinite points |
| checkAndUpdateBorrowCooldown() | ADMIN_ROLE | SecurityHardening | Selectively block specific users |
| fundEpoch() | TREASURY_ROLE | RevenueDistributor | Drain contract by funding 0 |
| propose() | Public | RiskGovernance | Anyone can create governance proposals |
| castVote() | Public (token-weighted) | RiskGovernance | Token accumulation attack |
| execute() | Public (post-timelock) | GovernanceTimelock | Anyone can trigger after delay |

---

## Centralization Risk Assessment

**HIGH centralization (single EOA controls critical parameters):**
- PriceOracle: Owner can replace all Chainlink feeds instantly
- NFTCollateralManager: ORACLE_ROLE can set floor price to any value
- IRSwap: ADMIN_ROLE sets variable rates used in settlement

**MEDIUM centralization (protected by timelock):**
- GovernanceTimelock: 1-day minimum delay on parameter changes
- RiskGovernance: 3-day voting + 1-day timelock before LTV changes

**LOW centralization (role is functional, not governance):**
- POOL_ROLE in PointsAccounting / BadDebtSocialisation: held by
  LendingPool contract itself, not a human EOA

---

## Key Observation

ALL privileged roles are currently held by a single deployer EOA (0x72F668Aca488E6d5Aa847f3636aEb0B95413DEF7). On testnet this is acceptable. For mainnet, a Gnosis Safe multisig should hold:
- POOL_ADMIN_ROLE
- GUARDIAN_ROLE
- ADMIN_ROLE on all contracts
- Owner on PriceOracle / InterestRateModel

GovernanceTimelock should become the executor of protocol changes, not direct admin EOA calls.


## BY [ADITYA CHOTALIYA](https://adityachotaliya.xyz/)