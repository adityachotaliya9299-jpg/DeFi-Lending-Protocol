// Minimal ABIs — only the functions the frontend calls.
// Generate full ABIs with: forge build && cat out/LendingPool.sol/LendingPool.json | jq .abi

export const LENDING_POOL_ABI = [
  // View
  { name: "getReserveData",     type: "function", stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "liquidityIndex",      type: "uint128" },
      { name: "borrowIndex",         type: "uint128" },
      { name: "totalScaledDeposits", type: "uint256" },
      { name: "totalScaledBorrows",  type: "uint256" },
      { name: "lastUpdateTimestamp", type: "uint40"  },
      { name: "lTokenAddress",       type: "address" },
      { name: "isActive",            type: "bool"    },
      { name: "isBorrowEnabled",     type: "bool"    },
    ]}]
  },
  { name: "getUserAccountData", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralUsd",  type: "uint256" },
      { name: "totalDebtUsd",        type: "uint256" },
      { name: "healthFactor",        type: "uint256" },
      { name: "availableBorrowUsd",  type: "uint256" },
    ]
  },
  { name: "getUserHealthFactor", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  { name: "getUserDeposit", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }, { name: "asset", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  { name: "getUserDebt", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }, { name: "asset", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  { name: "getAssetList", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address[]" }]
  },
  { name: "CLOSE_FACTOR_BPS", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }]
  },
  // Write
  { name: "deposit",   type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: []
  },
  { name: "withdraw",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "withdrawn", type: "uint256" }]
  },
  { name: "borrow",    type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: []
  },
  { name: "repay",     type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "repaid", type: "uint256" }]
  },
  { name: "liquidate", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "borrower",        type: "address" },
      { name: "debtAsset",       type: "address" },
      { name: "collateralAsset", type: "address" },
      { name: "debtAmount",      type: "uint256" },
    ],
    outputs: []
  },
  // Events
  { name: "Deposit",    type: "event", inputs: [{ name: "asset", type: "address", indexed: true }, { name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { name: "Borrow",     type: "event", inputs: [{ name: "asset", type: "address", indexed: true }, { name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { name: "Repay",      type: "event", inputs: [{ name: "asset", type: "address", indexed: true }, { name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256" }, { name: "repayer", type: "address", indexed: true }] },
  { name: "Withdraw",   type: "event", inputs: [{ name: "asset", type: "address", indexed: true }, { name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
  { name: "Liquidation", type: "event", inputs: [
    { name: "borrower", type: "address", indexed: true }, { name: "debtAsset", type: "address", indexed: true },
    { name: "collateralAsset", type: "address", indexed: true }, { name: "debtRepaid", type: "uint256" },
    { name: "collateralSeized", type: "uint256" }, { name: "liquidator", type: "address" }
  ]},
] as const;

export const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "decimals",  type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { name: "symbol",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "string" }] },
  { name: "approve",   type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
] as const;

export const PRICE_ORACLE_ABI = [
  { name: "getPrice", type: "function", stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "priceWad", type: "uint256" }] },
] as const;

export const LIQUIDATION_ENGINE_ABI = [
  { name: "isLiquidatable", type: "function", stateMutability: "view",
    inputs: [{ name: "borrower", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { name: "getLiquidationData", type: "function", stateMutability: "view",
    inputs: [{ name: "borrower", type: "address" }],
    outputs: [
      { name: "totalCollateralUsd", type: "uint256" },
      { name: "totalDebtUsd",       type: "uint256" },
      { name: "healthFactor",       type: "uint256" },
      { name: "availableBorrowUsd", type: "uint256" },
      { name: "liquidatable",       type: "bool"    },
    ]
  },
] as const;

// Extended ABI entries for new features
export const LENDING_POOL_EXTENDED_ABI = [
  { name: "paused",         type: "function", stateMutability: "view",        inputs: [], outputs: [{ name: "", type: "bool" }] },
  { name: "pause",          type: "function", stateMutability: "nonpayable",  inputs: [], outputs: [] },
  { name: "unpause",        type: "function", stateMutability: "nonpayable",  inputs: [], outputs: [] },
  { name: "setUserEMode",   type: "function", stateMutability: "nonpayable",  inputs: [{ name: "categoryId", type: "uint8" }], outputs: [] },
  { name: "userEModeCategory", type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint8" }] },
  { name: "GUARDIAN_ROLE",  type: "function", stateMutability: "view",        inputs: [], outputs: [{ name: "", type: "bytes32" }] },
  { name: "hasRole",        type: "function", stateMutability: "view",
    inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "flashLoan",      type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "receiverAddress", type: "address" },
      { name: "asset",           type: "address" },
      { name: "amount",          type: "uint256" },
      { name: "params",          type: "bytes"   },
    ], outputs: [] },
  { name: "maxFlashLoan",   type: "function", stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "flashFee",       type: "function", stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "FLASH_LOAN_FEE_BPS", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

export const CREDIT_DELEGATION_ABI = [
  // View
  { name: "availableCredit", type: "function", stateMutability: "view",
    inputs: [
      { name: "delegator",  type: "address" },
      { name: "delegatee",  type: "address" },
      { name: "asset",      type: "address" },
    ], outputs: [{ name: "", type: "uint256" }] },
  { name: "getDelegation", type: "function", stateMutability: "view",
    inputs: [
      { name: "delegator",  type: "address" },
      { name: "delegatee",  type: "address" },
      { name: "asset",      type: "address" },
    ], outputs: [{ name: "", type: "tuple", components: [
      { name: "amount", type: "uint256" },
      { name: "used",   type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "active", type: "bool"    },
    ]}] },
  { name: "getDelegatorsOf", type: "function", stateMutability: "view",
    inputs: [{ name: "delegatee", type: "address" }],
    outputs: [{ name: "", type: "address[]" }] },
  // Write
  { name: "approveDelegation", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "delegatee", type: "address" },
      { name: "asset",     type: "address" },
      { name: "amount",    type: "uint256" },
      { name: "expiry",    type: "uint256" },
    ], outputs: [] },
  { name: "revokeDelegation", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "delegatee", type: "address" }, { name: "asset", type: "address" }],
    outputs: [] },
  { name: "borrowWithDelegation", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "delegator", type: "address" },
      { name: "asset",     type: "address" },
      { name: "amount",    type: "uint256" },
    ], outputs: [] },
  { name: "repayDelegation", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "delegator", type: "address" },
      { name: "asset",     type: "address" },
      { name: "amount",    type: "uint256" },
    ], outputs: [] },
  // Events
  { name: "DelegationCreated", type: "event", inputs: [
    { name: "delegator", type: "address", indexed: true },
    { name: "delegatee", type: "address", indexed: true },
    { name: "asset",     type: "address", indexed: true },
    { name: "amount",    type: "uint256" },
    { name: "expiry",    type: "uint256" },
  ]},
  { name: "DelegatedBorrow", type: "event", inputs: [
    { name: "delegator", type: "address", indexed: true },
    { name: "delegatee", type: "address", indexed: true },
    { name: "asset",     type: "address", indexed: true },
    { name: "amount",    type: "uint256" },
  ]},
] as const;