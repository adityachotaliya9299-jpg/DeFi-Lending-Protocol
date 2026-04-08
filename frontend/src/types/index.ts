export interface AssetConfig {
  ltv: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint;
  reserveFactor: bigint;
  isActive: boolean;
  isBorrowEnabled: boolean;
}

export interface ReserveData {
  liquidityIndex: bigint;
  borrowIndex: bigint;
  totalScaledDeposits: bigint;
  totalScaledBorrows: bigint;
  lastUpdateTimestamp: bigint;
  lTokenAddress: `0x${string}`;
  isActive: boolean;
  isBorrowEnabled: boolean;
}

export interface UserAccountData {
  totalCollateralUsd: bigint;
  totalDebtUsd: bigint;
  healthFactor: bigint;
  availableBorrowUsd: bigint;
}

export interface AssetInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
}

export interface MarketRow {
  asset: AssetInfo;
  price: bigint;
  totalSupplyUsd: bigint;
  totalBorrowUsd: bigint;
  utilizationPct: number;
  supplyApyPct: number;
  borrowApyPct: number;
  ltv: number;
  liquidationThreshold: number;
  lTokenAddress: `0x${string}`;
}

export interface UserPosition {
  asset: AssetInfo;
  depositAmount: bigint;
  depositUsd: bigint;
  debtAmount: bigint;
  debtUsd: bigint;
}