/**
 * Minimal ABIs for the Phase 4-6 contracts, hand-derived from
 * contracts/src — only the functions the frontend calls.
 */

/* ── YieldVault (ERC-4626 style, USDC) ───────────────────────────────────── */
export const YIELD_VAULT_ABI = [
  { name: "asset",           type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "totalAssets",     type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "totalSupply",     type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "balanceOf",       type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "managementFeeBps",type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "convertToShares", type: "function", stateMutability: "view", inputs: [{ name: "assets", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "convertToAssets", type: "function", stateMutability: "view", inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "previewDeposit",  type: "function", stateMutability: "view", inputs: [{ name: "assets", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "previewRedeem",   type: "function", stateMutability: "view", inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "deposit",         type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }] },
  { name: "redeem",          type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }],
    outputs: [{ name: "assets", type: "uint256" }] },
] as const;

/* ── LoopStrategy (1-tx leverage) ────────────────────────────────────────── */
export const LOOP_STRATEGY_ABI = [
  { name: "maxLeverageBps", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "getPosition",    type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "collateralAsset",   type: "address" },
      { name: "borrowAsset",       type: "address" },
      { name: "initialCollateral", type: "uint256" },
      { name: "totalCollateral",   type: "uint256" },
      { name: "totalDebt",         type: "uint256" },
      { name: "loops",             type: "uint256" },
      { name: "isOpen",            type: "bool"    },
    ]}] },
  { name: "calculateLeverage", type: "function", stateMutability: "pure",
    inputs: [{ name: "ltvBps", type: "uint256" }, { name: "loops", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "openPosition", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "collateralAsset", type: "address" },
      { name: "borrowAsset",     type: "address" },
      { name: "initialAmount",   type: "uint256" },
      { name: "loops",           type: "uint256" },
      { name: "ltvBps",          type: "uint256" },
    ], outputs: [] },
  { name: "closePosition", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

/* ── IRSwap (interest-rate swap) ─────────────────────────────────────────── */
export const IRSWAP_ABI = [
  { name: "swapCount",       type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "variableRates",   type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "settlementToken", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "getSwap",         type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "user",               type: "address" },
      { name: "asset",              type: "address" },
      { name: "notional",           type: "uint256" },
      { name: "fixedRateBps",       type: "uint256" },
      { name: "variableRateAtOpen", type: "uint256" },
      { name: "openTime",           type: "uint256" },
      { name: "maturity",           type: "uint256" },
      { name: "collateralPosted",   type: "uint256" },
      { name: "settled",            type: "bool"    },
      { name: "exists",             type: "bool"    },
    ]}] },
  { name: "previewSettlement", type: "function", stateMutability: "view",
    inputs: [{ name: "swapId", type: "uint256" }],
    outputs: [{ name: "payerOwes", type: "int256" }] },
  { name: "isMatured", type: "function", stateMutability: "view",
    inputs: [{ name: "swapId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "openSwap", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "asset",        type: "address" },
      { name: "notional",     type: "uint256" },
      { name: "fixedRateBps", type: "uint256" },
      { name: "duration",     type: "uint256" },
    ], outputs: [{ name: "swapId", type: "uint256" }] },
  { name: "settleSwap", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "swapId", type: "uint256" }], outputs: [] },
] as const;

/* ── TrancheVault (senior / junior) ──────────────────────────────────────── */
export const TRANCHE_VAULT_ABI = [
  { name: "underlying",      type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "seniorToken",     type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "juniorToken",     type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "totalTVL",        type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "seniorRatioBps",  type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "getSeniorNAV",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "getJuniorNAV",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "depositSenior",   type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [{ name: "shares", type: "uint256" }] },
  { name: "depositJunior",   type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [{ name: "shares", type: "uint256" }] },
  { name: "withdrawSenior",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "amount", type: "uint256" }] },
  { name: "withdrawJunior",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "amount", type: "uint256" }] },
] as const;

/* ── NFTCollateralManager ────────────────────────────────────────────────── */
export const NFT_COLLATERAL_ABI = [
  { name: "getMaxBorrow", type: "function", stateMutability: "view",
    inputs: [{ name: "collection", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "getHealthFactor", type: "function", stateMutability: "view",
    inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "isLiquidatable", type: "function", stateMutability: "view",
    inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "getPosition", type: "function", stateMutability: "view",
    inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "owner",               type: "address" },
      { name: "collection",          type: "address" },
      { name: "tokenId",             type: "uint256" },
      { name: "floorPriceAtDeposit", type: "uint256" },
      { name: "borrowedAmount",      type: "uint256" },
      { name: "depositTime",         type: "uint256" },
      { name: "hasLoan",             type: "bool"    },
    ]}] },
  { name: "depositNFT", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { name: "withdrawNFT", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "collection", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { name: "borrow", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "collection", type: "address" },
      { name: "tokenId",    type: "uint256" },
      { name: "amount",     type: "uint256" },
    ], outputs: [] },
  { name: "liquidate", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "borrower",   type: "address" },
      { name: "collection", type: "address" },
      { name: "tokenId",    type: "uint256" },
    ], outputs: [] },
] as const;

/* ── PointsAccounting ────────────────────────────────────────────────────── */
export const POINTS_ABI = [
  { name: "getUserPoints", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "getPendingPoints", type: "function", stateMutability: "view",
    inputs: [
      { name: "user",  type: "address" },
      { name: "asset", type: "address" },
      { name: "mode",  type: "uint256" },
    ], outputs: [{ name: "", type: "uint256" }] },
  { name: "accruePoints", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "user",  type: "address" },
      { name: "asset", type: "address" },
      { name: "mode",  type: "uint256" },
    ], outputs: [] },
] as const;

/* ── RiskGovernance ──────────────────────────────────────────────────────── */
export const RISK_GOVERNANCE_ABI = [
  { name: "proposalCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "governanceToken", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "getProposal", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "proposer",     type: "address" },
      { name: "asset",        type: "address" },
      { name: "paramType",    type: "uint8"   },
      { name: "newValue",     type: "uint256" },
      { name: "votingEnds",   type: "uint256" },
      { name: "timelockEnds", type: "uint256" },
      { name: "forVotes",     type: "uint256" },
      { name: "againstVotes", type: "uint256" },
      { name: "executed",     type: "bool"    },
      { name: "exists",       type: "bool"    },
    ]}] },
  { name: "isVotingActive", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "hasPassedVote", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "propose", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "asset",     type: "address" },
      { name: "paramType", type: "uint8"   },
      { name: "newValue",  type: "uint256" },
    ], outputs: [{ name: "proposalId", type: "uint256" }] },
  { name: "castVote", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "proposalId", type: "uint256" }, { name: "support", type: "bool" }], outputs: [] },
  { name: "execute", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "proposalId", type: "uint256" }], outputs: [] },
] as const;

/* ── ERC-721 minimal ─────────────────────────────────────────────────────── */
export const ERC721_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { name: "ownerOf", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { name: "setApprovalForAll", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
] as const;
