# LendFi Security Audit — Scope Document

**Audit Ref:** LFI-2026-07
**Commit Hash:** 1374d96  
**Repository:** https://github.com/adityachotaliya9299-jpg/DeFi-Lending-Protocol  
**Branch:** main  
**Date Locked:** July 1, 2026  
**Solidity Version:** 0.8.24  
**Compiler Optimizations:** 200 runs  
**Network:** Ethereum Sepolia (Chain ID 11155111)  
**Auditor:** [Aditya Chotaliya](https://adityachotaliya.xyz/)

---

## In-Scope: contracts/src/ (45 files)

### core/ (6 files) — HIGHEST PRIORITY
| File | Role |
|------|------|
| LendingPool.sol | Core: deposit, borrow, repay, withdraw, liquidate |
| CollateralManager.sol | LTV, liquidation threshold, asset config |
| LiquidationEngine.sol | External liquidation helper |
| FlashLoanProvider.sol | Flash loan base contract |
| BadDebtSocialisation.sol | Index reduction for residual debt |
| CreditDelegation.sol | Credit delegation with expiry |

### governance/ (3 files) — HIGH PRIORITY
| File | Role |
|------|------|
| Governance.sol | Protocol parameter governance |
| GovernanceTimelock.sol | Timelocked execution |
| RiskGovernance.sol | Token-weighted risk param voting |

### oracle/ (3 files) — HIGH PRIORITY
| File | Role |
|------|------|
| PriceOracle.sol | Chainlink price feed wrapper |
| OracleAggregator.sol | N-source weighted median oracle |
| OracleWithTWAP.sol | TWAP-enhanced oracle |

### tokens/ (3 files) — HIGH PRIORITY
| File | Role |
|------|------|
| LendingToken.sol | ERC-20 lToken receipt |
| VariableDebtToken.sol | Non-transferable variable debt ERC-20 |
| StableDebtToken.sol | Non-transferable stable debt ERC-20 |

### stablecoin/ (2 files) — MEDIUM PRIORITY
| File | Role |
|------|------|
| ProtocolStablecoin.sol | pUSD ERC-20 stablecoin |
| StablecoinVault.sol | CDP-style vault for pUSD |

### interest/ (2 files) — MEDIUM PRIORITY
| File | Role |
|------|------|
| InterestRateModel.sol | Two-slope kinked borrow rate model |
| ReserveInterestRateStrategy.sol | Aave-compatible per-reserve strategy |

### derivatives/ (1 file) — MEDIUM PRIORITY
| File | Role |
|------|------|
| IRSwap.sol | Cash-settled interest rate swap |

### tranches/ (1 file) — MEDIUM PRIORITY
| File | Role |
|------|------|
| TrancheVault.sol | Senior/Junior yield tranche structure |

### nft/ (1 file) — MEDIUM PRIORITY
| File | Role |
|------|------|
| NFTCollateralManager.sol | ERC-721 collateral with floor price oracle |

### leverage/ (1 file) — MEDIUM PRIORITY
| File | Role |
|------|------|
| LoopStrategy.sol | Leveraged loop position builder |

### crosschain/ (1 file) — MEDIUM PRIORITY
| File | Role |
|------|------|
| CrossChainMessenger.sol | LayerZero-compatible state messenger |

### vault/ (1 file) — LOWER PRIORITY
| File | Role |
|------|------|
| YieldVault.sol | ERC-4626 lToken wrapper |

### revenue/ (1 file) — LOWER PRIORITY
| File | Role |
|------|------|
| RevenueDistributor.sol | Epoch-based revenue split |

### points/ (1 file) — LOWER PRIORITY
| File | Role |
|------|------|
| PointsAccounting.sol | Incentive points accrual |

### security/ (1 file) — LOWER PRIORITY
| File | Role |
|------|------|
| SecurityHardening.sol | Circuit breakers, commit-reveal, rate limits |

### liquidation/ (1 file) — LOWER PRIORITY
| File | Role |
|------|------|
| LiquidationPathFinder.sol | Multi-collateral path optimizer |

### utils/ (1 file) — LOWER PRIORITY
| File | Role |
|------|------|
| MulticallBatch.sol | Batch call utility |

### treasury/ (1 file) — LOWER PRIORITY
| File | Role |
|------|------|
| ProtocolTreasury.sol | Protocol fee treasury |

### math/ (2 files) — LIBRARY
| File | Role |
|------|------|
| WadRayMath.sol | Fixed-point WAD/RAY arithmetic |
| PercentageMath.sol | Basis-point percentage arithmetic |

### modes/ (2 files) — LIBRARY
| File | Role |
|------|------|
| IsolationMode.sol | Isolation mode logic |
| EfficiencyMode.sol | E-mode logic |

### interfaces/ (10 files) — REFERENCE ONLY
ICollateralManager.sol, ICreditDelegationV2.sol, IFlashLoanReceiver.sol,
IInterestRateModel.sol, ILendingPool.sol, IOracleAggregator.sol,
IPointsAccounting.sol, IPriceOracle.sol, IStableDebtToken.sol,
IVariableDebtToken.sol, AggregatorV3Interface.sol

---

## Explicitly Out-of-Scope

| Directory | Reason |
|-----------|--------|
| contracts/test/ | Test files, not production code |
| contracts/script/ | Deployment scripts |
| contracts/src/mocks/ | MockERC20.sol, MockChainlinkFeed.sol — test infrastructure |
| contracts/lib/ | Third-party dependencies (OpenZeppelin, forge-std) |

---

## Protocol Stats at Audit Lock

| Metric | Value |
|--------|-------|
| In-scope source files | 45 |
| Test files | 39 |
| Total tests passing | 670 |
| Deployed contracts (Sepolia) | 27 |
| Lines of Solidity (source) | ~6,400 |
| Lines of Solidity (tests) | ~6,900 |


## BY [ADITYA CHOTALIYA](https://adityachotaliya.xyz/)