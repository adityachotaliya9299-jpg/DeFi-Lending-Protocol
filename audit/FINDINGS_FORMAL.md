# LendFi Security Audit — Formal Findings
# Audit Ref: LFI-2026-01 | Commit: 1374d96 | Date: July 2026
# Auditor: Aditya Chotaliya | https://adityachotaliya.xyz/

---

## Severity Classification

| Level | Definition |
|-------|-----------|
| **Critical** | Direct loss of funds, no preconditions |
| **High** | Loss of funds or core invariant broken under realistic conditions |
| **Medium** | Protocol malfunction, DoS, or economic harm under specific conditions |
| **Low** | Minor issue, unlikely scenario, or best-practice deviation |
| **Informational** | Code quality, style, documentation |

---
---

# HIGH SEVERITY FINDINGS

---

## [H-01] Supply Cap Validation Applied to Borrow Operations

**Severity:** High
**Status:** Open
**Contract:** `src/core/LendingPool.sol`
**Function:** `borrow()`, `repayWithPermit()`

### Description

The supply cap check — intended to limit the total amount of an asset that can be *deposited* — is incorrectly called inside `borrow()` and `repayWithPermit()`. The check compares current total deposits plus the borrow/repay amount against the supply cap, which is semantically wrong: borrowing does not increase total deposits, and repaying certainly does not.

```solidity
// Inside borrow() — WRONG: supply cap has nothing to do with borrowing
collateralManager.checkSupplyCap(
    asset,
    currentSupply / 10**IERC20Metadata(asset).decimals(),
    amount / 10**IERC20Metadata(asset).decimals()  // ← borrow amount
);
```

### Impact

When total deposits approach the supply cap, **all borrow and repay operations revert**. Users cannot borrow even if the borrow cap has headroom, and — critically — cannot repay existing debt. This is a denial-of-service that locks users into positions they cannot exit.

### Likelihood

High — any active protocol with significant deposits will hit its supply cap during normal operation.

### Proof of Concept

See `POCs/Exploit_H01_SupplyCapDoS.t.sol`

### Recommendation

Remove `checkSupplyCap()` from `borrow()` and `repayWithPermit()`. The supply cap should only be called in `deposit()` and `depositWithPermit()`.

```solidity
// REMOVE from borrow():
// collateralManager.checkSupplyCap(asset, currentSupply / ..., amount / ...);

// REMOVE from repayWithPermit():
// collateralManager.checkSupplyCap(asset, currentSupply / ..., amount / ...);
```

---

## [H-02] Supply Cap Validation Blocks Withdrawals

**Severity:** High
**Status:** Open
**Contract:** `src/core/LendingPool.sol`
**Function:** `withdraw()`

### Description

`withdraw()` calls `checkSupplyCap()` with the withdrawal amount. Since withdrawals *decrease* total deposits, applying a deposit cap to a withdrawal is backwards — at maximum cap utilization, the check `currentSupply + amount > cap` always triggers a revert.

### Impact

Users cannot withdraw their funds when total deposits are at or near the supply cap. This is a fund-locking vulnerability.

### Likelihood

High — same conditions as H-01.

### Recommendation

Remove `checkSupplyCap()` from `withdraw()` entirely.

---

## [H-03] E-Mode Health Factor Check Uses Wrong Precision Unit

**Severity:** High
**Status:** Open
**Contract:** `src/core/LendingPool.sol`, `src/core/CollateralManager.sol`
**Function:** `_getAccountTotals()` (E-Mode path)

### Description

The health factor comparison constant is `HEALTH_FACTOR_OK = 1e18` (WAD precision). However, in the E-Mode code path inside `_getAccountTotals()`, the health factor is calculated in RAY (1e27) precision:

```solidity
// E-Mode path
healthFactor = (adjustedColl * RAY) / totalDebtUsd;  // result in 1e27
```

The subsequent check:
```solidity
if (healthFactor < HEALTH_FACTOR_OK)  // 1e27 < 1e18 → always false
```

A health factor of 0.5 in E-Mode would be returned as `0.5 × 1e27 = 5e26`, which is vastly larger than `HEALTH_FACTOR_OK = 1e18`. The check **always passes** — E-Mode positions can never be liquidated regardless of their true collateral ratio.

### Impact

All E-Mode users are permanently immune to liquidation. If the protocol has E-Mode categories configured, any user can borrow far beyond safe limits in E-Mode and never face liquidation, leading to unrecoverable bad debt accumulation.

### Proof of Concept

See `POCs/Exploit_H03_EModeHFBypass.t.sol`

### Recommendation

Unify health factor precision. Either calculate everything in WAD:
```solidity
// E-Mode path — fix:
healthFactor = (adjustedColl * 1e18) / totalDebtUsd;
```
Or change `HEALTH_FACTOR_OK` to `RAY` — but WAD is preferred as it matches the non-E-Mode path.

---

## [H-04] StableDebtToken Interest Accrual Is a No-Op on Multiple Mints

**Severity:** High
**Status:** Open
**Contract:** `src/tokens/StableDebtToken.sol`
**Function:** `_accrueInterest()`, `mint()`

### Description

`_accrueInterest()` only updates the timestamp — it never adds accrued interest to `_principals`:

```solidity
function _accrueInterest(address user) internal {
    uint256 principal = _principals[user];
    if (principal == 0) return;
    uint256 timeDelta = block.timestamp - _lastAccrualTime[user];
    if (timeDelta > 0) {
        _lastAccrualTime[user] = block.timestamp; // ← updates time only
        // MISSING: _principals[user] += (principal * rate * timeDelta) / RAY
    }
}
```

When `mint()` is called on a user with an existing position, `_accrueInterest()` is called first, which resets `_lastAccrualTime` to `block.timestamp`. The interest that accrued between the original borrow and the new borrow is permanently lost — it will never be charged.

### Impact

Protocol loses interest revenue on stable-rate borrowers who make multiple borrows. The loss is: `originalPrincipal × rate × timeSinceFirstBorrow`.

### Proof of Concept

See `POCs/Exploit_H04_StableDebtInterestLoss.t.sol`

### Recommendation

```solidity
function _accrueInterest(address user) internal {
    uint256 principal = _principals[user];
    if (principal == 0) return;
    uint256 timeDelta = block.timestamp - _lastAccrualTime[user];
    if (timeDelta > 0) {
        uint256 interest = (principal * _stableRates[user] * timeDelta) / RAY;
        _principals[user]   += interest;   // ← COMMIT interest to principal
        _ownTotalSupply     += interest;   // ← update supply
        _lastAccrualTime[user] = block.timestamp;
    }
}
```

---

## [H-05] RiskGovernance Quorum Bypass When Token Supply Is Zero

**Severity:** High
**Status:** Open
**Contract:** `src/governance/RiskGovernance.sol`
**Function:** `execute()`

### Description

Quorum is calculated at execution time using a live `totalSupply()` call:

```solidity
uint256 totalSupply    = _getTotalSupply();  // staticcall, returns 0 on failure
uint256 quorumRequired = (totalSupply * MIN_QUORUM_BPS) / BPS_TOTAL;
// If totalSupply == 0: quorumRequired == 0
// Any totalVotes > 0 passes: totalVotes >= quorumRequired
```

`_getTotalSupply()` silently returns 0 if the staticcall fails. In the current deployment the governance token is set to **USDC** (not a dedicated governance token). Any user with a nonzero USDC balance can:

1. `propose(WETH, PARAM_LTV, 9900)` — propose 99% LTV for WETH
2. `castVote(1, true)` — vote with their USDC balance
3. Wait 4 days (voting period + timelock)
4. `execute(1)` — apply parameter change

### Impact

High — governance can be hijacked by any USDC holder. Currently mitigated only because `_applyParam()` silently fails (CollateralManager doesn't implement `updateParam()`). Once properly wired, this becomes critical.

### Proof of Concept

See `POCs/Exploit_H05_GovernanceQuorumBypass.t.sol`

### Recommendation

1. Deploy a dedicated ERC20Votes governance token; replace USDC as `governanceToken`
2. Snapshot `totalSupply` at proposal creation time, not execution time
3. Revert if `_getTotalSupply()` returns 0:
```solidity
uint256 totalSupply = _getTotalSupply();
require(totalSupply > 0, "governance token supply is zero");
```

---

## [H-06] TrancheVault Senior Cap Skipped on First Deposit

**Severity:** High
**Status:** Open
**Contract:** `src/tranches/TrancheVault.sol`
**Function:** `depositSenior()`

### Description

```solidity
uint256 currentTotalTVL = seniorTVL + juniorTVL;
if (currentTotalTVL > 0) {  // ← skipped when TVL is 0
    // ... cap check ...
}
if (currentTotalTVL > 0 && juniorTVL == 0)  // ← also skipped
    revert TrancheVault__InsufficientJuniorBuffer();
```

Both the senior concentration cap (80% max) and the junior buffer requirement are gated on `currentTotalTVL > 0`. The very first deposit bypasses both checks, allowing a user to deposit as senior with zero junior TVL — defeating the core design invariant.

### Impact

The first depositor can establish a 100% senior position with no first-loss junior buffer. If bad debt occurs, senior depositors absorb it directly with no protection.

### Recommendation

```solidity
// Remove the currentTotalTVL > 0 guard — junior must ALWAYS exist first
require(juniorTVL > 0 || msg.sender == initialJuniorDepositor,
    "junior deposit required first");
```
Or: enforce that the very first action must be `depositJunior()` by adding a state flag.

---

## [H-07] NFTCollateralManager liquidate() Never Collects Debt Repayment

**Severity:** High
**Status:** Open
**Contract:** `src/nft/NFTCollateralManager.sol`
**Function:** `liquidate()`

### Description

```solidity
function liquidate(address borrower, address collection, uint256 tokenId)
    external nonReentrant
{
    // ...health check...
    address prevOwner = pos.owner;
    delete positions[collection][tokenId];
    // Transfer NFT to liquidator — but NEVER pull debt from msg.sender!
    IERC721(collection).safeTransferFrom(address(this), msg.sender, tokenId);
    emit NFTLiquidated(prevOwner, msg.sender, collection, tokenId, debt);
}
```

The function transfers the NFT to the liquidator but never calls `IERC20(borrowToken).safeTransferFrom(msg.sender, ...)` to collect the debt repayment. Any caller can liquidate any unhealthy NFT position and receive the NFT for free.

### Impact

Complete fund loss for borrowers — their collateral NFT is stolen without any debt being repaid.

### Recommendation

```solidity
// Add before deleting position:
uint256 debt = pos.borrowedAmount;
IERC20(borrowToken).safeTransferFrom(msg.sender, address(this), debt);
```

---

## [H-08] LoopStrategy Uses 1:1 Price Assumption for Cross-Asset Positions

**Severity:** High
**Status:** Open
**Contract:** `src/leverage/LoopStrategy.sol`
**Function:** `openPosition()`

### Description

```solidity
// Simplified: assume 1:1 price (real impl needs oracle)
uint256 toBorrow = (currentCollateral * ltvBps) / BPS_TOTAL;
```

The borrow amount is calculated in raw token units without price conversion. For a position with WETH as collateral and USDC as borrow:
- `currentCollateral = 1e18` (1 WETH)
- `toBorrow = 1e18 × 7000 / 10000 = 7e17 USDC`
- Attempting to borrow 700,000,000,000 USDC ($700B) from the pool — rejected

For same-asset loops, borrowing the collateral asset and re-depositing it creates circular dependency that health factor checks should catch.

### Impact

`openPosition()` is non-functional for any realistic mixed-asset leveraged position.

### Recommendation

Integrate the oracle before computing `toBorrow`:
```solidity
uint256 colValueUsd  = oracle.getValueInUsd(collateralAsset, currentCollateral);
uint256 borrowUsd    = (colValueUsd * ltvBps) / BPS_TOTAL;
uint256 borrowPrice  = oracle.getPrice(borrowAsset);
uint256 toBorrow     = (borrowUsd * (10 ** borrowDecimals)) / borrowPrice;
```

---

## [H-09] Duplicate _hasBorrow Block in borrow() — Latent Double-Push Bug

**Severity:** High (code quality / latent)
**Status:** Open
**Contract:** `src/core/LendingPool.sol`
**Function:** `borrow()`

### Description

The `_hasBorrow` tracking block appears twice consecutively in `borrow()`. The first execution sets `_hasBorrow[msg.sender][asset] = true`, making the second block dead code. However, if a future refactor moves or removes the first block, the second block could execute on a position that was already pushed, adding a duplicate entry to `_userBorrows[msg.sender]`.

### Impact

Currently no exploit. Latent: duplicate `_userBorrows` entry would break health factor iteration (double-counting debt) and prevent the position from ever being fully closed.

### Recommendation

Remove the second duplicate block entirely. One clean block, correctly positioned after the mode-based mint.

---
---

# MEDIUM SEVERITY FINDINGS

---

## [M-01] Supply Cap Checked on Withdrawal Blocks Fund Access

**Severity:** Medium
**Status:** Open
**Contract:** `src/core/LendingPool.sol` — `withdraw()`

Covered in H-02 but also impacts withdrawal specifically. See H-02.

---

## [M-02] Stable Debt Excluded from Interest Rate Utilization Calculation

**Severity:** Medium
**Status:** Open
**Contract:** `src/core/LendingPool.sol` — `_accrueInterest()`

### Description

```solidity
uint256 totalBorrow = IVariableDebtToken(reserve.variableDebtTokenAddress).totalSupply();
// ← StableDebtToken.totalSupply() never added
```

Stable borrows exist as a separate balance (`_ownTotalSupply` in StableDebtToken) but are never included in the utilization ratio fed to InterestRateModel. Result: interest rates are systematically too low when stable debt exists.

### Impact

Depositors earn less than they should; variable borrowers pay less than market rate. Economic model diverges from reality proportionally to stable borrow usage.

### Recommendation

```solidity
uint256 varBorrow    = IVariableDebtToken(reserve.variableDebtTokenAddress).totalSupply();
uint256 stableBorrow = IStableDebtToken(reserve.stableDebtTokenAddress).totalSupply();
uint256 totalBorrow  = varBorrow + stableBorrow;
```

---

## [M-03] Isolation Mode Debt Ceiling Never Decremented After Liquidation

**Severity:** Medium
**Status:** Open
**Contract:** `src/core/LendingPool.sol` — `liquidate()`

### Description

`borrow()` increments `isolationCurrentDebt[collateralAsset]`. `liquidate()` never decrements it. After liquidations, the isolation debt ceiling fills permanently, blocking future borrows against that isolated collateral even when the debt has been fully repaid/liquidated.

### Recommendation

```solidity
// In liquidate(), after repaying debt:
if (isolationCurrentDebt[collateralAsset] >= repaidUsd) {
    isolationCurrentDebt[collateralAsset] -= repaidUsd;
} else {
    isolationCurrentDebt[collateralAsset] = 0;
}
```

---

## [M-04] OracleAggregator Weighted Median Returns Lowest Price with Equal Weights

**Severity:** Medium
**Status:** Open
**Contract:** `src/oracle/OracleAggregator.sol` — `getPrice()`

### Description

```solidity
uint256 halfWeight = totalValidWeight / 2;  // integer division truncates
uint256 cumWeight;
for (uint256 i; i < validCount; i++) {
    cumWeight += validWeights[i];
    if (cumWeight >= halfWeight) return validPrices[i]; // returns at first hit
}
```

With 2 equal-weight feeds (5000 each): `halfWeight = 5000`, cumWeight after feed[0] = 5000 ≥ 5000 → always returns the lower (first in sorted order) price. The true median of two values should be their average.

### Recommendation

```solidity
uint256 halfWeight = (totalValidWeight / 2) + 1; // strict majority
```

---

## [M-05] RiskGovernance Vote Weight Not Snapshotted — Double Vote Attack

**Severity:** Medium
**Status:** Open
**Contract:** `src/governance/RiskGovernance.sol` — `castVote()`

### Description

```solidity
uint256 weight = _getVoteWeight(msg.sender); // reads CURRENT balance
```

Vote weight is read at vote time, not at proposal creation time. A user can:
1. Accumulate tokens
2. Vote with full weight
3. Transfer tokens to a second address
4. Vote again with same tokens from second address

This enables governance attacks with far less capital than intended.

### Recommendation

Use OpenZeppelin ERC20Votes with `getPastVotes(voter, proposalSnapshot)`.

---

## [M-06] RiskGovernance propose() Has No Parameter Bounds

**Severity:** Medium
**Status:** Open
**Contract:** `src/governance/RiskGovernance.sol` — `propose()`

### Description

`newValue` is unconstrained — proposals for `LTV = 10000` (100%) or `LTV = type(uint256).max` can be created and potentially passed.

### Recommendation

```solidity
if (paramType == PARAM_LTV)            require(newValue <= 9_500, "ltv max 95%");
if (paramType == PARAM_LIQ_THRESHOLD)  require(newValue <= 9_900, "threshold max 99%");
if (paramType == PARAM_LIQ_BONUS)      require(newValue <= 2_000, "bonus max 20%");
if (paramType == PARAM_RESERVE_FACTOR) require(newValue <= 5_000, "fee max 50%");
```

---

## [M-07] TrancheVault distributeYield() Creates Phantom TVL

**Severity:** Medium
**Status:** Open
**Contract:** `src/tranches/TrancheVault.sol` — `distributeYield()`

### Description

`distributeYield(yieldAmount)` increments `seniorTVL` and `juniorTVL` but never transfers the actual `yieldAmount` of underlying tokens into the contract. The TVL increases on paper but the contract balance does not, making later withdrawals fail.

### Recommendation

```solidity
function distributeYield(uint256 yieldAmount) external onlyRole(ADMIN_ROLE) {
    if (yieldAmount == 0) revert TrancheVault__ZeroAmount();
    underlying.safeTransferFrom(msg.sender, address(this), yieldAmount); // ← ADD
    // ... rest of function
}
```

---

## [M-08] SecurityHardening commitLiquidation() Overwriteable — Defeats Front-Running Protection

**Severity:** Medium
**Status:** Open
**Contract:** `src/security/SecurityHardening.sol` — `commitLiquidation()`

### Description

Anyone can overwrite any existing commit by calling `commitLiquidation()` with the same hash:
```solidity
function commitLiquidation(bytes32 commitHash) external {
    commits[commitHash] = LiquidationCommit({...}); // unconditional overwrite
```

An attacker who sees a legitimate commit in the mempool can frontrun it with the same hash, replacing the honest liquidator's address with their own.

### Recommendation

```solidity
require(commits[commitHash].liquidator == address(0), "commit exists");
```

---

## [M-09] CrossChainMessenger sendMessage() Is Fully Permissionless

**Severity:** Medium
**Status:** Open
**Contract:** `src/crosschain/CrossChainMessenger.sol` — `sendMessage()`

### Description

No access control on `sendMessage()`. Anyone can emit `MessageSent` events for any user and any message type. In a real LayerZero deployment, this triggers actual cross-chain relay.

### Recommendation

Add `onlyRole(POOL_ROLE)` to restrict to verified callers.

---

## [M-10] NFTCollateralManager Liquidation Threshold Hardcoded at LTV+5%

**Severity:** Medium
**Status:** Open
**Contract:** `src/nft/NFTCollateralManager.sol` — `_getHealthFactor()`

### Description

```solidity
uint256 adjustedCollateral = (currentFloor * (cfg.ltvBps + 500)) / BPS_TOTAL;
```

500 BPS (5%) buffer is hardcoded for all collections regardless of volatility profile.

### Recommendation

Add `liquidationThresholdBps` to `CollectionConfig` and use it instead of the hardcoded 500.

---

## [M-11] LoopStrategy closePosition() Leaves Orphaned Interest Debt

**Severity:** Medium
**Status:** Open
**Contract:** `src/leverage/LoopStrategy.sol` — `closePosition()`

### Description

`closePosition()` pulls `pos.totalDebt` from the user (the original borrowed principal) but the actual pool debt = `totalDebt + accrued interest`. After close, the strategy is deleted but the interest debt remains in the pool against the strategy contract address.

### Recommendation

Query actual debt before pulling:
```solidity
uint256 actualDebt = ILendingPool(pool).getUserDebt(address(this), pos.borrowAsset);
IERC20(pos.borrowAsset).safeTransferFrom(msg.sender, address(this), actualDebt);
```

---

## [M-12] StableDebtToken Rate Overwrite on Second Borrow

**Severity:** Medium
**Status:** Open
**Contract:** `src/tokens/StableDebtToken.sol` — `mint()`

### Description

```solidity
_stableRates[user] = stableRate; // unconditionally overwrites previous rate
```

A second stable borrow at a different rate replaces the first rate globally, applying the new rate to the entire combined principal — including the original borrow.

### Recommendation

Use weighted average rate:
```solidity
uint256 oldPrincipal = _principals[user];
if (oldPrincipal > 0) {
    _stableRates[user] = (oldPrincipal * _stableRates[user] + amount * stableRate)
                         / (oldPrincipal + amount);
}
```

---
---

# LOW SEVERITY FINDINGS

---

## [L-01] LendingPool repayWithPermit() Contains Redundant Second vToken Burn

**L-02] LendingPool borrow() Isolation Check After Health Factor (Gas Waste)

**[L-03] StableDebtToken Dust Principal Not Cleared After Rounding

**[L-04] PriceOracle answeredInRound Check Deprecated on L2 Deployments

**[L-05] OracleAggregator Missing Round Completeness Check in _tryGetPrice()

**[L-06] GovernanceTimelock schedule() Accepts address(0) as Target

**[L-07] RiskGovernance _applyParam() Silently Swallows Failures

**[L-08] CrossChainMessenger lzReceive() ENDPOINT_ROLE Never Enforced

**[L-09] TrancheVault Share Inflation Attack on First Deposit

**[L-10] SecurityHardening checkPriceDeviation() Emits Event (State-Mutating Validator)

*(Low findings abbreviated — full details in RAW_FINDINGS.md F-08 through F-20 and F-28 through F-37)*

---
---

# INFORMATIONAL FINDINGS

**[I-01]** CollateralManager: LTV = 0 not documented as intentional (F-10)
**[I-02]** LendingPool/StableDebtToken: Hardcoded stable rate 1e15 placeholder (F-15)
**[I-03]** PriceOracle: Silent heartbeat clamp should revert (F-17)
**[I-04]** PriceOracle: Precision analysis — no issue found (F-18)
**[I-05]** OracleAggregator: Import statement after interface definition (F-21)
**[I-06]** GovernanceTimelock: updateDelay() event ordering correct — confirmed (F-24)

---
---

# SUMMARY TABLE

| ID | Severity | Status | Contract | Title |
|----|----------|--------|----------|-------|
| H-01 | High | Open | LendingPool | Supply cap on borrow — DoS |
| H-02 | High | Open | LendingPool | Supply cap on withdrawal — fund lock |
| H-03 | High | Open | LendingPool/CM | E-Mode HF uses RAY not WAD |
| H-04 | High | Open | StableDebtToken | _accrueInterest() no-op |
| H-05 | High | Open | RiskGovernance | Zero-supply quorum bypass |
| H-06 | High | Open | TrancheVault | Senior cap skipped first deposit |
| H-07 | High | Open | NFTCollateralManager | liquidate() never pulls debt |
| H-08 | High | Open | LoopStrategy | 1:1 price assumption |
| H-09 | High | Open | LendingPool | Duplicate _hasBorrow block |
| M-01 | Medium | Open | LendingPool | Supply cap on withdrawal |
| M-02 | Medium | Open | LendingPool | Stable debt excluded utilization |
| M-03 | Medium | Open | LendingPool | Isolation debt not decremented |
| M-04 | Medium | Open | OracleAggregator | Median returns lower bound |
| M-05 | Medium | Open | RiskGovernance | Vote weight not snapshotted |
| M-06 | Medium | Open | RiskGovernance | No parameter bounds |
| M-07 | Medium | Open | TrancheVault | distributeYield phantom TVL |
| M-08 | Medium | Open | SecurityHardening | commitLiquidation overwriteable |
| M-09 | Medium | Open | CrossChainMessenger | sendMessage permissionless |
| M-10 | Medium | Open | NFTCollateralManager | Hardcoded liquidation buffer |
| M-11 | Medium | Open | LoopStrategy | Stale debt in closePosition |
| M-12 | Medium | Open | StableDebtToken | Rate overwrite on second mint |
| L-01 | Low | Open | LendingPool | Redundant vToken burn |
| L-02 | Low | Open | LendingPool | Isolation check ordering |
| L-03 | Low | Open | StableDebtToken | Dust principal not cleared |
| L-04 | Low | Open | PriceOracle | answeredInRound L2 deprecated |
| L-05 | Low | Open | OracleAggregator | Missing round completeness |
| L-06 | Low | Open | GovernanceTimelock | Zero address target allowed |
| L-07 | Low | Open | RiskGovernance | _applyParam silent failure |
| L-08 | Low | Open | CrossChainMessenger | ENDPOINT_ROLE not enforced |
| L-09 | Low | Open | TrancheVault | Share inflation attack |
| L-10 | Low | Open | SecurityHardening | checkPriceDeviation stateful |
| I-01 | Info | — | CollateralManager | ltv=0 undocumented |
| I-02 | Info | — | LendingPool | Hardcoded stable rate |
| I-03 | Info | — | PriceOracle | Silent heartbeat clamp |
| I-04 | Info | — | PriceOracle | Precision review (no issue) |
| I-05 | Info | — | OracleAggregator | Import ordering |
| I-06 | Info | — | GovernanceTimelock | Event ordering correct |

**TOTALS: 9 High | 12 Medium | 10 Low | 6 Informational = 37 Findings**