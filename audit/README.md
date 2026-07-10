# LendFi Security Audit — LFI-2026-01

**Auditor:** Aditya Chotaliya  
**Date:** July 2026  
**Commit Audited:** `1374d96`  
**Repository:** https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol  
**Protocol Live:** https://lendfi-protocol.vercel.app/

---

## Audit Deliverables

| File | Description |
|------|-------------|
| `LendFi_Audit_Report.pdf` | Full audit report (assembled in Phase H) |
| `Findings.csv` | Structured findings spreadsheet |
| `SCOPE.md` | In-scope contracts and exclusions |
| `METHODOLOGY.md` | Review techniques and tools |
| `THREAT_MODEL.md` | Attack surface and threat categories |
| `PRIVILEGE_MAP.md` | Role registry and permission matrix |
| `RAW_FINDINGS.md` | Detailed raw findings from manual review |
| `FINDINGS_FORMAL.md` | Formal findings in report format |
| `POCs/` | Proof-of-concept exploit contracts |
| `README.md` | This file |

---

## Summary of Findings

| Severity | Count |
|----------|-------|
| High | 9 |
| Medium | 12 |
| Low | 10 |
| Informational | 6 |
| **Total** | **37** |

---

## Critical / High Findings (Action Required)

### H-01 — Supply Cap DoS on Borrow and Repay
**File:** `src/core/LendingPool.sol`  
**Fix:** Remove `checkSupplyCap()` from `borrow()`, `repayWithPermit()`, `withdraw()`

### H-02 — Supply Cap Blocks Withdrawals  
**File:** `src/core/LendingPool.sol`  
**Fix:** Same as H-01

### H-03 — E-Mode Health Factor RAY vs WAD Mismatch
**File:** `src/core/LendingPool.sol`  
**Fix:** Change `(adjustedColl * RAY) / totalDebt` to `(adjustedColl * 1e18) / totalDebt`

### H-04 — StableDebtToken _accrueInterest() Is a No-Op
**File:** `src/tokens/StableDebtToken.sol`  
**Fix:** Add `_principals[user] += interest` inside `_accrueInterest()`

### H-05 — RiskGovernance Quorum Bypassed With Zero Supply
**File:** `src/governance/RiskGovernance.sol`  
**Fix:** Snapshot totalSupply at proposal time; revert if 0; use real gov token

### H-06 — TrancheVault Senior Cap Skipped on First Deposit
**File:** `src/tranches/TrancheVault.sol`  
**Fix:** Remove `currentTotalTVL > 0` guard; always require junior TVL > 0

### H-07 — NFTCollateralManager liquidate() Never Pulls Debt
**File:** `src/nft/NFTCollateralManager.sol`  
**Fix:** `IERC20(borrowToken).safeTransferFrom(msg.sender, address(this), debt)` before NFT transfer

### H-08 — LoopStrategy 1:1 Price Assumption
**File:** `src/leverage/LoopStrategy.sol`  
**Fix:** Use oracle price conversion for cross-asset positions

### H-09 — Duplicate _hasBorrow Block
**File:** `src/core/LendingPool.sol`  
**Fix:** Remove the second duplicate block in `borrow()`

---

## Proof-of-Concept Exploits

| File | Finding | Demonstrates |
|------|---------|-------------|
| `POCs/Exploit_H01_SupplyCapDoS.t.sol` | H-01 | Borrow/repay blocked at supply cap |
| `POCs/Exploit_H03_EModeHFBypass.t.sol` | H-03 | E-Mode positions immune to liquidation |
| `POCs/Exploit_H04_StableDebtInterestLoss.t.sol` | H-04 | Interest lost on multi-mint |
| `POCs/Exploit_H05_GovernanceQuorumBypass.t.sol` | H-05 | Single voter passes governance |
| `POCs/Exploit_H06_TrancheVaultSeniorCapBypass.t.sol` | H-06 | 100% senior without junior buffer |
| `POCs/Exploit_H07_NFTLiquidationFreeLoot.t.sol` | H-07 | NFT stolen for free in liquidation |

---

## Running the PoCs

```bash
cd contracts

# Run individual PoC
forge test --match-path "audit/POCs/Exploit_H01_SupplyCapDoS.t.sol" -vv

# Run all PoCs
forge test --match-path "audit/POCs/*" -vv
```

---

## Remediation Status

All findings currently **Open**. Remediation review (Phase G) pending.
After fixes are applied, status will be updated to:
- ✅ Resolved
- ⚠️ Partially Resolved  
- ❌ Unresolved

---

## Scope

**In scope:** `contracts/src/` — 45 files  
**Out of scope:** `contracts/test/`, `contracts/script/`, `contracts/src/mocks/`, `contracts/lib/`  
**Commit:** `1374d96` (Jul 1, 2026)