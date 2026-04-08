// ─────────────────────────────────────────────────────────────────────────────
//  LendingPool event handlers — AssemblyScript for The Graph
// ─────────────────────────────────────────────────────────────────────────────

import {
  BigDecimal, BigInt, Address, ethereum, log
} from "@graphprotocol/graph-ts";

import {
  Deposit as DepositEvent,
  Withdraw as WithdrawEvent,
  Borrow as BorrowEvent,
  Repay as RepayEvent,
  Liquidation as LiquidationEvent,
  InterestAccrued as InterestAccruedEvent,
  AssetInitialised as AssetInitialisedEvent,
  LendingPool,
} from "../generated/LendingPool/LendingPool";

import {
  Protocol, Market, Account, Position,
  Deposit, Withdraw, Borrow, Repay, Liquidation,
  InterestSnapshot, DailyMarketSnapshot, DailyProtocolSnapshot,
} from "../generated/schema";

import { ERC20 } from "../generated/LendingPool/ERC20";

// ── Constants ─────────────────────────────────────────────────────────────────

const WAD = BigDecimal.fromString("1000000000000000000"); // 1e18
const RAY = BigDecimal.fromString("1000000000000000000000000000"); // 1e27
const ZERO_BD = BigDecimal.fromString("0");
const ONE_BD  = BigDecimal.fromString("1");
const PROTOCOL_ID = "1";
const SECONDS_PER_YEAR = BigDecimal.fromString("31536000");

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOrCreateProtocol(): Protocol {
  let p = Protocol.load(PROTOCOL_ID);
  if (p == null) {
    p = new Protocol(PROTOCOL_ID);
    p.totalDepositUsd = ZERO_BD;
    p.totalBorrowUsd  = ZERO_BD;
    p.totalReserveUsd = ZERO_BD;
    p.cumulativeLiquidations = 0;
    p.assetCount = 0;
    p.updatedAt = BigInt.fromI32(0);
  }
  return p;
}

function getOrCreateAccount(address: Address, timestamp: BigInt): Account {
  let id = address.toHexString();
  let a  = Account.load(id);
  if (a == null) {
    a = new Account(id);
    a.totalDepositUsd  = ZERO_BD;
    a.totalBorrowUsd   = ZERO_BD;
    a.healthFactor     = ZERO_BD;
    a.depositCount     = 0;
    a.borrowCount      = 0;
    a.repayCount       = 0;
    a.liquidationCount = 0;
    a.liquidatorCount  = 0;
    a.firstSeenAt      = timestamp;
    a.lastSeenAt       = timestamp;
  } else {
    a.lastSeenAt = timestamp;
  }
  return a;
}

function getOrCreateMarket(assetAddress: Address): Market {
  let id = assetAddress.toHexString();
  let m  = Market.load(id);
  if (m == null) {
    m = new Market(id);
    m.asset = id;

    // Read on-chain metadata
    let erc20 = ERC20.bind(assetAddress);
    let symbolCall  = erc20.try_symbol();
    let decCall     = erc20.try_decimals();
    m.symbol   = symbolCall.reverted  ? "UNKNOWN" : symbolCall.value;
    m.decimals = decCall.reverted     ? 18        : decCall.value;

    m.liquidityIndex      = ONE_BD;
    m.borrowIndex         = ONE_BD;
    m.totalScaledDeposits = ZERO_BD;
    m.totalScaledBorrows  = ZERO_BD;
    m.lastUpdateTimestamp = BigInt.fromI32(0);
    m.totalDepositUsd     = ZERO_BD;
    m.totalBorrowUsd      = ZERO_BD;
    m.utilizationRate     = ZERO_BD;
    m.ltv                 = 0;
    m.liquidationThreshold = 0;
    m.liquidationBonus    = 0;
    m.reserveFactor       = 0;
    m.depositCount        = 0;
    m.borrowCount         = 0;
    m.repayCount          = 0;
    m.liquidationCount    = 0;
  }
  return m;
}

function getOrCreatePosition(user: Address, asset: Address, timestamp: BigInt): Position {
  let id = user.toHexString() + "-" + asset.toHexString();
  let p  = Position.load(id);
  if (p == null) {
    p = new Position(id);
    p.account              = user.toHexString();
    p.market               = asset.toHexString();
    p.asset                = asset.toHexString();
    p.scaledDepositBalance = ZERO_BD;
    p.scaledBorrowBalance  = ZERO_BD;
    p.currentDepositAmount = ZERO_BD;
    p.currentBorrowAmount  = ZERO_BD;
    p.updatedAt            = timestamp;
  }
  return p;
}

function wadToDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(WAD);
}

function rayToDecimal(value: BigInt): BigDecimal {
  return value.toBigDecimal().div(RAY);
}

function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
}

function getDayId(timestamp: BigInt): i32 {
  return (timestamp.toI32() / 86400);
}

function getOrCreateDailyProtocol(timestamp: BigInt): DailyProtocolSnapshot {
  let dayId = getDayId(timestamp);
  let id    = dayId.toString();
  let snap  = DailyProtocolSnapshot.load(id);
  if (snap == null) {
    snap = new DailyProtocolSnapshot(id);
    snap.date                = dayId;
    snap.totalDepositUsd     = ZERO_BD;
    snap.totalBorrowUsd      = ZERO_BD;
    snap.dailyDepositUsd     = ZERO_BD;
    snap.dailyBorrowUsd      = ZERO_BD;
    snap.dailyLiquidationUsd = ZERO_BD;
    snap.activeUsers         = 0;
  }
  return snap;
}

function getOrCreateDailyMarket(market: Market, timestamp: BigInt): DailyMarketSnapshot {
  let dayId = getDayId(timestamp);
  let id    = market.id + "-" + dayId.toString();
  let snap  = DailyMarketSnapshot.load(id);
  if (snap == null) {
    snap = new DailyMarketSnapshot(id);
    snap.market          = market.id;
    snap.date            = dayId;
    snap.totalDepositUsd = market.totalDepositUsd;
    snap.totalBorrowUsd  = market.totalBorrowUsd;
    snap.utilizationRate = market.utilizationRate;
    snap.supplyApy       = ZERO_BD;
    snap.borrowApy       = ZERO_BD;
  }
  return snap;
}

// ── Event handlers ────────────────────────────────────────────────────────────

export function handleAssetInitialised(event: AssetInitialisedEvent): void {
  let market   = getOrCreateMarket(event.params.asset);
  let protocol = getOrCreateProtocol();

  protocol.assetCount += 1;
  protocol.updatedAt   = event.block.timestamp;

  market.save();
  protocol.save();
  log.info("Asset initialised: {}", [event.params.asset.toHexString()]);
}

export function handleDeposit(event: DepositEvent): void {
  let market  = getOrCreateMarket(event.params.asset);
  let account = getOrCreateAccount(event.params.user, event.block.timestamp);
  let pos     = getOrCreatePosition(event.params.user, event.params.asset, event.block.timestamp);

  let amountBd = event.params.amount.toBigDecimal()
    .div(BigDecimal.fromString(pow10(market.decimals)));

  // Create event entity
  let ev       = new Deposit(eventId(event));
  ev.account   = account.id;
  ev.market    = market.id;
  ev.asset     = market.id;
  ev.amount    = amountBd;
  ev.amountUsd = ZERO_BD; // oracle not available in subgraph; set to 0
  ev.blockNumber = event.block.number;
  ev.timestamp   = event.block.timestamp;
  ev.txHash      = event.transaction.hash.toHexString();
  ev.save();

  // Update market
  market.depositCount += 1;
  market.save();

  // Update account
  account.depositCount += 1;
  account.save();

  // Update position
  pos.updatedAt = event.block.timestamp;
  pos.save();

  // Update daily snapshots
  let dailyProtocol = getOrCreateDailyProtocol(event.block.timestamp);
  dailyProtocol.dailyDepositUsd = dailyProtocol.dailyDepositUsd.plus(ev.amountUsd);
  dailyProtocol.save();
}

export function handleWithdraw(event: WithdrawEvent): void {
  let market  = getOrCreateMarket(event.params.asset);
  let account = getOrCreateAccount(event.params.user, event.block.timestamp);

  let amountBd = event.params.amount.toBigDecimal()
    .div(BigDecimal.fromString(pow10(market.decimals)));

  let ev       = new Withdraw(eventId(event));
  ev.account   = account.id;
  ev.market    = market.id;
  ev.asset     = market.id;
  ev.amount    = amountBd;
  ev.amountUsd = ZERO_BD;
  ev.blockNumber = event.block.number;
  ev.timestamp   = event.block.timestamp;
  ev.txHash      = event.transaction.hash.toHexString();
  ev.save();

  market.save();
  account.save();
}

export function handleBorrow(event: BorrowEvent): void {
  let market  = getOrCreateMarket(event.params.asset);
  let account = getOrCreateAccount(event.params.user, event.block.timestamp);
  let pos     = getOrCreatePosition(event.params.user, event.params.asset, event.block.timestamp);

  let amountBd = event.params.amount.toBigDecimal()
    .div(BigDecimal.fromString(pow10(market.decimals)));

  let ev       = new Borrow(eventId(event));
  ev.account   = account.id;
  ev.market    = market.id;
  ev.asset     = market.id;
  ev.amount    = amountBd;
  ev.amountUsd = ZERO_BD;
  ev.blockNumber = event.block.number;
  ev.timestamp   = event.block.timestamp;
  ev.txHash      = event.transaction.hash.toHexString();
  ev.save();

  market.borrowCount += 1;
  market.save();

  account.borrowCount += 1;
  account.save();

  pos.updatedAt = event.block.timestamp;
  pos.save();

  let dailyProtocol = getOrCreateDailyProtocol(event.block.timestamp);
  dailyProtocol.dailyBorrowUsd = dailyProtocol.dailyBorrowUsd.plus(ev.amountUsd);
  dailyProtocol.save();
}

export function handleRepay(event: RepayEvent): void {
  let market  = getOrCreateMarket(event.params.asset);
  let account = getOrCreateAccount(event.params.user, event.block.timestamp);

  let amountBd = event.params.amount.toBigDecimal()
    .div(BigDecimal.fromString(pow10(market.decimals)));

  let ev       = new Repay(eventId(event));
  ev.account   = account.id;
  ev.market    = market.id;
  ev.asset     = market.id;
  ev.amount    = amountBd;
  ev.amountUsd = ZERO_BD;
  ev.repayer   = event.params.repayer.toHexString();
  ev.blockNumber = event.block.number;
  ev.timestamp   = event.block.timestamp;
  ev.txHash      = event.transaction.hash.toHexString();
  ev.save();

  market.repayCount += 1;
  market.save();

  account.repayCount += 1;
  account.save();
}

export function handleLiquidation(event: LiquidationEvent): void {
  let debtMarket  = getOrCreateMarket(event.params.debtAsset);
  let borrower    = getOrCreateAccount(event.params.borrower,   event.block.timestamp);
  let liquidator  = getOrCreateAccount(event.params.liquidator, event.block.timestamp);
  let protocol    = getOrCreateProtocol();

  let debtDecimals = debtMarket.decimals;
  let collDecimals = debtMarket.decimals; // approximate — use debt market decimals

  let debtRepaid = event.params.debtRepaid.toBigDecimal()
    .div(BigDecimal.fromString(pow10(debtDecimals)));
  let collSeized = event.params.collateralSeized.toBigDecimal()
    .div(BigDecimal.fromString(pow10(collDecimals)));

  let ev                    = new Liquidation(eventId(event));
  ev.borrower               = borrower.id;
  ev.liquidator             = liquidator.id;
  ev.market                 = debtMarket.id;
  ev.debtAsset              = event.params.debtAsset.toHexString();
  ev.collateralAsset        = event.params.collateralAsset.toHexString();
  ev.debtRepaid             = debtRepaid;
  ev.debtRepaidUsd          = ZERO_BD;
  ev.collateralSeized       = collSeized;
  ev.collateralSeizedUsd    = ZERO_BD;
  ev.profit                 = ZERO_BD;
  ev.blockNumber            = event.block.number;
  ev.timestamp              = event.block.timestamp;
  ev.txHash                 = event.transaction.hash.toHexString();
  ev.save();

  debtMarket.liquidationCount += 1;
  debtMarket.save();

  borrower.liquidationCount += 1;
  borrower.save();

  liquidator.liquidatorCount += 1;
  liquidator.save();

  protocol.cumulativeLiquidations += 1;
  protocol.updatedAt = event.block.timestamp;
  protocol.save();

  let dailyProtocol = getOrCreateDailyProtocol(event.block.timestamp);
  dailyProtocol.dailyLiquidationUsd = dailyProtocol.dailyLiquidationUsd.plus(ev.debtRepaidUsd);
  dailyProtocol.save();
}

export function handleInterestAccrued(event: InterestAccruedEvent): void {
  let market = getOrCreateMarket(event.params.asset);

  let newLiqIdx = rayToDecimal(event.params.liquidityIndex);
  let newBorIdx = rayToDecimal(event.params.borrowIndex);

  // Derive approximate APY from index growth rate
  // annualAPY ≈ (newIndex / oldIndex - 1) * (secondsPerYear / deltaT)
  let supplyApy = ZERO_BD;
  let borrowApy = ZERO_BD;

  if (market.lastUpdateTimestamp.gt(BigInt.fromI32(0))) {
    let deltaT = event.block.timestamp.minus(market.lastUpdateTimestamp);
    if (deltaT.gt(BigInt.fromI32(0))) {
      let deltaTBD = deltaT.toBigDecimal();
      let supplyGrowth = newLiqIdx.div(market.liquidityIndex).minus(ONE_BD);
      let borrowGrowth = newBorIdx.div(market.borrowIndex).minus(ONE_BD);
      supplyApy = supplyGrowth.times(SECONDS_PER_YEAR).div(deltaTBD);
      borrowApy = borrowGrowth.times(SECONDS_PER_YEAR).div(deltaTBD);
    }
  }

  // Save snapshot
  let snap           = new InterestSnapshot(eventId(event));
  snap.market        = market.id;
  snap.liquidityIndex = newLiqIdx;
  snap.borrowIndex   = newBorIdx;
  snap.supplyApy     = supplyApy;
  snap.borrowApy     = borrowApy;
  snap.blockNumber   = event.block.number;
  snap.timestamp     = event.block.timestamp;
  snap.save();

  // Update market indices
  market.liquidityIndex      = newLiqIdx;
  market.borrowIndex         = newBorIdx;
  market.lastUpdateTimestamp = event.block.timestamp;
  market.save();

  // Update daily snapshot
  let daily        = getOrCreateDailyMarket(market, event.block.timestamp);
  daily.supplyApy  = supplyApy;
  daily.borrowApy  = borrowApy;
  daily.save();
}

// ── Utility ───────────────────────────────────────────────────────────────────

function pow10(n: i32): string {
  let result = "1";
  for (let i = 0; i < n; i++) result += "0";
  return result;
}