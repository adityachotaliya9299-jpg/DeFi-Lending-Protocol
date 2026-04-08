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