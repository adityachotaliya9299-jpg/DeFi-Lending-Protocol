# LendFi Bots

## Liquidation Bot

Monitors all active borrowers and executes liquidations when HF < 1.0.

### Setup

```bash
cd bots
npm install
cp .env.example .env
# Edit .env with your values
```

### Run

```bash
# Simulation mode (no private key needed — just logs what it would do)
npx ts-node liquidation-bot.ts

# Live mode (set BOT_PRIVATE_KEY in .env first)
npx ts-node liquidation-bot.ts
```

### How it works

1. Every 15 seconds: queries The Graph for active borrowers
2. Batch multicall: gets health factor for all borrowers at once (1 RPC call)
3. HF < 1.05 → adds to watch list
4. HF < 1.0  → builds liquidation opportunity and executes

### Profitability

The bot checks estimated profit before executing:
- Liquidation bonus = 8% of debt repaid
- A $10,000 USDC repayment → ~$800 in extra WETH received
- Gas cost ~200k gwei × current gas price

Set `minProfitUsd` in the config to skip small liquidations.

### Safety

- Use a **dedicated wallet** with only enough balance to repay debt
- Never use your main wallet as the bot wallet
- The bot runs in simulation mode if no private key is set
