# LendFi Security Audit — Threat Model

**Audit Ref:** LFI-2026-07 | Commit: 1374d96

---

## Attack Surface Categories

### T1 — Oracle Manipulation
**Risk:** HIGH
An attacker who can influence price feed output can borrow more than
their collateral justifies, or prevent legitimate liquidations.

Scenarios:
- T1a: Single Chainlink feed returns manipulated answer before heartbeat
  expires (stale but in-window) → PriceOracle accepts incorrect price
- T1b: In OracleAggregator with N=2 feeds, attacker controls 1 feed →
  cannot shift median (needs majority weight). Safe with N>=3.
- T1c: Admin (ORACLE_ROLE) sets malicious feed address → all prices
  manipulated. Privileged risk, not on-chain exploitable.
- T1d: NFTCollateralManager floor price set by single admin call →
  single point of manipulation for NFT borrow capacity

### T2 — Flash Loan Abuse
**Risk:** MEDIUM
Flash loans provide temporary capital. Combined with price oracle reads,
they can enable attack patterns.

Scenarios:
- T2a: Flash loan → deposit → borrow at inflated LTV → repay flash loan
  → withdraw excess. Prevented by health factor check after borrow.
- T2b: Flash loan → liquidate many positions in one block → return.
  Legitimate use, not an attack.
- T2c: Flash loan callback reenters LendingPool.borrow() →
  nonReentrant prevents this.

### T3 — Reentrancy
**Risk:** MEDIUM (mitigated by guards)
LendingPool uses nonReentrant on deposit/borrow/repay/withdraw/liquidate.
Risk exists if any external call happens BEFORE state update (CEI violation).

Scenarios:
- T3a: ERC-20 transfer callbacks (e.g. ERC-777 tokens) before state update
  → LendFi only supports standard ERC-20s (no transfer callbacks)
- T3b: LendingToken.mint() calls back into LendingPool → LendingToken has no LendingPool call in its implementation
- T3c: Read-only reentrancy: pool state mid-transaction could be read by OracleAggregator or LiquidationPathFinder via staticcall. Both are view-only consumers of pool data, not state-mutating integrations here.

### T4 — Governance Attacks
**Risk:** MEDIUM
Both on-chain governance systems (GovernanceTimelock, RiskGovernance) have privileged execution paths.

Scenarios:
- T4a: Malicious proposal sets LTV = 10000 (100%) → all collateral can be borrowed → protocol drained after proposal executes. Requires quorum.
- T4b: Governance token concentration → 51% attack on RiskGovernance
- T4c: Timelock predecessor manipulation → force-executing a proposal by satisfying a fake predecessor
- T4d: GUARDIAN pauses protocol indefinitely without POOL_ADMIN unpause ability → locked funds risk

### T5 — Arithmetic & Precision
**Risk:** MEDIUM
All math is in WAD/RAY fixed-point. Rounding errors accumulate over time.

Scenarios:
- T5a: rayDiv rounding in scaledRepay calculation → user's scaled debt never reaches exactly zero → dust position stuck forever
- T5b: Linear interest approximation vs compound → at 90%+ utilization over long periods, linear significantly understates actual debt
- T5c: percentMul with BPS_TOTAL=10000 — can a 0 reserveFactor result in 0 treasury accrual even when fees are expected?

### T6 — Liquidation Integrity
**Risk:** HIGH
Liquidation is the protocol's primary solvency mechanism. Failures here lead to bad debt accumulation.

Scenarios:
- T6a: Collateral-to-seize calculation overflow — (seizeUsd * 10^decimals) / collateralPrice could overflow for large notionals with small prices
- T6b: Close factor bypass — can a liquidator repay > 50% in a single call by manipulating debtAmount parameter? (capped at maxClose internally)
- T6c: Post-liquidation health factor: after liquidation, borrower's HF should improve. Is this always guaranteed?
- T6d: Dust collateral: after liquidation, scaledDeposit rounds to 0 but lToken.burn() tries to burn non-zero amount → underflow?

### T7 — Stable Debt Accounting
**Risk:** HIGH (developer gut feeling confirmed)
StableDebtToken uses its own _ownTotalSupply separate from ERC-20's
_totalSupply. The dual-tracking (vToken + _scaledBorrows) was a known source of bugs during development.

Scenarios:
- T7a: After repay(mode=2), _scaledBorrows reduced but sToken.burn() not called correctly → user's stable debt shows 0 in internal accounting but sToken.balanceOf() still shows non-zero debt
- T7b: Stable debt interest accrual: _lastAccrualTime updated on _accrueInterest() call but balanceOf() recomputes from scratch → is there a window where accrued interest is counted twice?
- T7c: Multiple mints: second mint at different rate overwrites _stableRates[user] — previous debt still accrues at new rate?

### T8 — ERC-4626 Share Inflation
**Risk:** MEDIUM
YieldVault uses convertToShares() = amount * totalSupply / totalAssets.
When totalSupply = 0 (first deposit), returns 1:1. Classic inflation attack:

Scenarios:
- T8a: Attacker deposits 1 wei → gets 1 share → directly transfers lTokens to vault (inflating totalAssets) → next depositor gets 0 shares due to rounding → attacker redeems 1 share for all assets

### T9 — Cross-Chain State Divergence
**Risk:** MEDIUM
CrossChainMessenger tracks balances locally. No on-chain verification that the source chain state is valid.

Scenarios:
- T9a: User sends MSG_DEPOSIT on chain A but MSG_WITHDRAW before it arrives on chain B → nonce ordering prevents out-of-order processing
- T9b: Chain A borrow recorded on chain B, but chain A position is liquidated → chain B crossChainBorrows never decremented
- T9c: Attacker calls lzReceive directly with a crafted payload from an address not in trustedRemotes → reverts with UntrustedRemote

### T10 — NFT Floor Price Single Point of Failure
**Risk:** MEDIUM
NFTCollateralManager floor prices are set by a single ORACLE_ROLE call. No TWAP, no aggregation, no deviation check.

Scenarios:
- T10a: Admin sets floor price to 0 → all NFT positions have HF = 0 → immediate liquidation cascade
- T10b: Admin sets floor price 10x actual → massive over-borrowing against NFT collateral → protocol becomes insolvent on price correction

### T11 — Bad Debt Socialisation Edge Cases
**Risk:** LOW-MEDIUM
BadDebtSocialisation.calculateIndexReduction() is called by pool (POOL_ROLE) but the actual liquidityIndex update must happen in LendingPool — there is no LendingPool code that actually calls this contract yet.

Scenarios:
- T11a: calculateIndexReduction is not wired into LendingPool.liquidate()
  → bad debt is NEVER socialised despite the contract existing → bad debt accumulates silently in protocol

### T12 — LoopStrategy Leverage Amplification
**Risk:** LOW (bounded by maxLeverageBps)
LoopStrategy does multiple borrow calls in a loop. Each borrow triggers a health factor check.

Scenarios:
- T12a: At exactly maxLeverage, a tiny price movement triggers all looped positions simultaneously → cascade liquidation
- T12b: LoopStrategy holds user's collateral between loops — if the LendingPool call fails mid-loop, user's collateral is stuck in the strategy contract

---

## Summary Risk Matrix

| ID | Category | Severity | Likelihood |
|----|----------|----------|------------|
| T1a | Oracle stale-in-window | High | Low |
| T1d | NFT single-admin oracle | High | Medium |
| T3a | ERC-777 reentrancy | Low | Very Low |
| T4a | Governance parameter abuse | Critical | Low |
| T5b | Linear interest understatement | Medium | High |
| T6a | Liquidation overflow | High | Low |
| T6d | Dust collateral underflow | Medium | Medium |
| T7a | Stable debt mode=2 repay bug | High | Medium |
| T7c | Multi-mint rate overwrite | Medium | Medium |
| T8a | ERC-4626 inflation attack | High | Low |
| T9b | Cross-chain borrow orphan | Medium | Low |
| T11a | BadDebt not wired to pool | High | Certain |
| T12b | LoopStrategy stuck collateral | Medium | Low |