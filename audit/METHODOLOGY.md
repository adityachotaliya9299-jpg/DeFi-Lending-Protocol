# LendFi Security Audit — Methodology

**Audit Ref:** LFI-2026-07  
**Commit Hash:** 1374d96  

---

## Review Techniques Applied

### 1. Manual Code Review
Each in-scope contract was read line-by-line against its specification and the threat model. Priority order follows the attack surface hierarchy: core lending → token accounting → oracle → governance → phase-specific additions. Every external/public function was reviewed for: input validation, state mutation ordering, reentrancy exposure, access control correctness, and arithmetic edge cases.

### 2. Business Logic Review
Protocol invariants were derived from the specification and checked against implementation. Key invariants audited:
- liquidityIndex and borrowIndex are monotonically non-decreasing
- getUserDebt() returns values consistent with _scaledBorrows (single source  of truth), not vToken balances
- Health factor calculation matches the spec (liquidationThreshold-adjusted collateral / total debt in USD)
- Total scaled borrows * borrowIndex = sum of individual user debts (modulo rounding)
- Collateral can never be seized beyond what a borrower deposited

### 3. State Machine Analysis
Mapped all valid state transitions for a user position:
  EMPTY → DEPOSITED → BORROWED → (REPAID | LIQUIDATED) → EMPTY
Checked every edge: what happens at exact LTV boundary, what happens when a user tries to borrow after partial liquidation, what happens to dust amounts when scaledBorrow < 1 after repay.

### 4. Access Control Review
Every role was enumerated and every onlyRole/onlyOwner/onlyPool modifier was checked against the intended caller. Particular attention paid to:
- Who can call initAsset() (POOL_ADMIN only, not guardian)
- Whether GUARDIAN can execute governance (it should not)
- Whether POOL_ROLE in PointsAccounting can be granted to arbitrary callers
- Whether commit-reveal in SecurityHardening can be bypassed via role abuse

### 5. Oracle Review
- Staleness check: heartbeat parameter per feed vs block.timestamp
- Negative price: int256 → uint256 cast guard
- Zero price: explicit check before returning
- Weighted median manipulation: can an attacker control enough feeds to shift the median? (requires controlling MIN_VALID_FEEDS sources)
- Decimal normalization: all feeds assumed 8 decimals * 1e10 = WAD

### 6. Flash Loan Review
- Reentrancy during callback: nonReentrant guards on LendingPool
- Repayment enforcement: balance check after callback returns
- Fee accounting: feeIndexDelta applied to liquidityIndex correctly
- Available liquidity: cannot borrow more than totalDeposits - totalBorrows

### 7. Economic Review
- Bad debt: what happens when collateral < debt after full liquidation
- Close factor: 50% per call — sufficient to prevent griefing, not too aggressive to prevent full-liquidation in one step
- Liquidation bonus: does the seized amount ever exceed actual collateral?
- Interest accrual gap: linear vs compound approximation — at what utilization / duration does linearization diverge significantly?
- TrancheVault: can senior depositors exceed MAX_SENIOR_RATIO_BPS through a sequence of deposits and withdrawals without junior buffer recheck?

### 8. Governance Review
- GovernanceTimelock: predecessor dependency correctness
- RiskGovernance: can a proposal execute with quorum = 0 if totalSupply = 0?
- Timelock bypass: can the ADMIN_ROLE bypass the timelock?
- Parameter bounds: what stops governance setting LTV = 10000 (100%)?

### 9. Cross-Chain Review
- Replay protection: nonce per (srcChain, user)
- Trusted remote tampering: can setTrustedRemote be called by non-admin?
- Message ordering: what if messages arrive out of order?
- State divergence: what if a chain-B borrow is recorded but chain-A deposit is later withdrawn?

### 10. NFT Collateral Review
- Floor price manipulation: oracle controlled by single admin
- Partial liquidation: not supported — atomicity risk if floor crashes
  between borrow and liquidation attempt
- ERC721 transfer hooks: onERC721Received correctly implemented

### 11. Invariant & Fuzz Test Review
- 670 tests reviewed for gaps in coverage
- forge coverage run to identify branches with <100% hit rate
- Fuzz seeds reviewed for edge cases (1000 runs per fuzz test)

### 12. Known Vulnerability Pattern Check
Each contract checked against known DeFi vulnerability patterns:
- Read-only reentrancy
- Price oracle front-running
- Donation attacks on share-based vaults (ERC-4626)
- Inflation attack on first depositor
- Sandwich attacks on liquidation
- Governance takeover via token accumulation
- Integer overflow/underflow (mitigated by 0.8.24 built-ins)
- Precision loss in division (rayDiv/rayMul rounding)

---

## Tools Used

| Tool | Purpose |
|------|---------|
| Foundry (forge test) | Test execution, fuzz, invariants |
| forge coverage --ir-minimum | Branch coverage analysis |
| Slither (static analysis) | Automated vulnerability detection |
| Cast | On-chain state queries |
| Manual review | Line-by-line code inspection |

---

## Auditor Assumptions

1. OpenZeppelin v5.x contracts (imported via lib/) are trusted and not re-audited — only custom overrides of OZ functions are reviewed
2. Chainlink price feeds are assumed honest for the oracle review; feed manipulation is treated as an external risk, not a code vulnerability
3. The Sepolia deployment is representative of the mainnet deployment — constructor parameters and initAsset() calls are assumed correct
4. Private keys and deployer address security are out of scope