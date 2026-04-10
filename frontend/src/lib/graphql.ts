import { ApolloClient, InMemoryCache, HttpLink, gql } from "@apollo/client";

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  "https://api.studio.thegraph.com/query/YOUR_ID/defi-lending-protocol/version/latest";

export const apolloClient = new ApolloClient({
  link:  new HttpLink({ uri: SUBGRAPH_URL }),
  cache: new InMemoryCache(),
  defaultOptions: { query: { fetchPolicy: "network-only" } },
});

// ── Subgraph health check ──────────────────────────────────────────────────────
// Call this to test if the subgraph is actually reachable and returning data.
export async function checkSubgraphHealth(): Promise<boolean> {
  const url = SUBGRAPH_URL;
  if (!url || url.includes("YOUR_ID")) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ _meta { block { number } } }" }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    return !!json?.data?._meta?.block?.number;
  } catch {
    return false;
  }
}

export const PROTOCOL_QUERY = gql`
  query Protocol {
    protocol(id: "1") {
      totalDepositUsd totalBorrowUsd totalReserveUsd
      cumulativeLiquidations assetCount updatedAt
    }
  }
`;

export const MARKETS_QUERY = gql`
  query Markets {
    markets {
      id symbol liquidityIndex borrowIndex
      totalScaledDeposits totalScaledBorrows
      totalDepositUsd totalBorrowUsd utilizationRate
      ltv liquidationThreshold reserveFactor
      depositCount borrowCount repayCount liquidationCount
    }
  }
`;

export const DAILY_PROTOCOL_QUERY = gql`
  query DailyProtocol($since: BigInt!) {
    dailyProtocolSnapshots(
      where: { dayId_gte: $since }
      orderBy: dayId orderDirection: asc first: 90
    ) {
      dayId totalDepositUsd totalBorrowUsd
      dailyDepositVolume dailyBorrowVolume
      dailyRepayVolume dailyLiquidationVolume cumulativeLiquidations
    }
  }
`;

export const DAILY_MARKET_QUERY = gql`
  query DailyMarket($market: String!, $since: BigInt!) {
    dailyMarketSnapshots(
      where: { market: $market, dayId_gte: $since }
      orderBy: dayId orderDirection: asc first: 90
    ) {
      dayId liquidityIndex borrowIndex
      totalDepositUsd totalBorrowUsd utilizationRate dailyBorrowVolume
    }
  }
`;

export const LIQUIDATIONS_QUERY = gql`
  query Liquidations($since: BigInt!) {
    liquidations(
      where: { timestamp_gte: $since }
      orderBy: timestamp orderDirection: asc first: 200
    ) {
      id timestamp collateralAsset debtAsset
      debtCovered collateralSeized liquidator
    }
  }
`;

export type DailyProtocolSnapshot = {
  dayId: string; totalDepositUsd: string; totalBorrowUsd: string;
  dailyDepositVolume: string; dailyBorrowVolume: string;
  dailyRepayVolume: string; dailyLiquidationVolume: string;
  cumulativeLiquidations: string;
};
export type DailyMarketSnapshot = {
  dayId: string; liquidityIndex: string; borrowIndex: string;
  totalDepositUsd: string; totalBorrowUsd: string;
  utilizationRate: string; dailyBorrowVolume: string;
};
export type LiquidationEvent = {
  id: string; timestamp: string; collateralAsset: string;
  debtAsset: string; debtCovered: string; collateralSeized: string; liquidator: string;
};
export type MarketData = {
  id: string; symbol: string; liquidityIndex: string; borrowIndex: string;
  totalScaledDeposits: string; totalScaledBorrows: string;
  totalDepositUsd: string; totalBorrowUsd: string; utilizationRate: string;
  ltv: number; liquidationThreshold: number; reserveFactor: number;
  depositCount: number; borrowCount: number; repayCount: number; liquidationCount: number;
};

export function dayIdToLabel(dayId: string): string {
  return new Date(Number(dayId) * 86_400 * 1000)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export function fmtUsdBig(val: string): string {
  const n = parseFloat(val);
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n/1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
export function computeApy(indexOld: string, indexNew: string, daysElapsed: number): number {
  if (daysElapsed <= 0) return 0;
  const old = parseFloat(indexOld), nw = parseFloat(indexNew);
  if (old <= 0 || nw <= old) return 0;
  return ((1 + (nw/old - 1)) ** (365/daysElapsed) - 1) * 100;
}
export function dayIdNDaysAgo(n: number): string {
  return String(Math.floor((Date.now()/1000 - n*86_400) / 86_400));
}