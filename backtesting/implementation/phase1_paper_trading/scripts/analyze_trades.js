#!/usr/bin/env node
/**
 * Trade Analysis Script
 * Analyze trading performance and generate insights
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const safetyLogPath = join(process.cwd(), '../safety-check-log.json');

if (!existsSync(safetyLogPath)) {
  console.error('❌ safety-check-log.json not found');
  process.exit(1);
}

const trades = JSON.parse(readFileSync(safetyLogPath, 'utf8'));

// Parse command line arguments
const args = process.argv.slice(2);
const lastArg = args.indexOf('--last');
const hours = lastArg !== -1 ? parseInt(args[lastArg + 1]) : 24;

// Filter by time if specified
let filteredTrades = trades;
if (lastArg !== -1) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  filteredTrades = trades.filter(t => new Date(t.timestamp) > cutoff);
}

console.log(`\n📊 Trade Analysis Report`);
console.log(`Period: Last ${hours} hours`);
console.log(`Total Trades: ${filteredTrades.length}\n`);

// ============================================================================
// Signal Distribution
// ============================================================================
console.log('📋 Signal Distribution:');
const signals = {};
filteredTrades.forEach(t => {
  signals[t.signal] = (signals[t.signal] || 0) + 1;
});
Object.entries(signals).sort((a, b) => b[1] - a[1]).forEach(([sig, count]) => {
  const pct = ((count / filteredTrades.length) * 100).toFixed(1);
  console.log(`  ${sig.toUpperCase().padEnd(10)}: ${count.toString().padStart(5)} (${pct}%)`);
});

// ============================================================================
// Order Execution
// ============================================================================
console.log('\n📋 Order Execution:');
const placed = filteredTrades.filter(t => t.orderPlaced);
const skipped = filteredTrades.filter(t => t.skipped);
const failed = filteredTrades.filter(t => !t.orderPlaced && !t.skipped);

console.log(`  ✅ Orders Placed:   ${placed.length} (${((placed.length / filteredTrades.length) * 100).toFixed(1)}%)`);
console.log(`  ⏭️  Skipped:         ${skipped.length} (${((skipped.length / filteredTrades.length) * 100).toFixed(1)}%)`);
console.log(`  ❌ Failed:          ${failed.length} (${((failed.length / filteredTrades.length) * 100).toFixed(1)}%)`);

// ============================================================================
// Side Distribution (for placed orders)
// ============================================================================
if (placed.length > 0) {
  console.log('\n📋 Trade Side Distribution:');
  const sides = { buy: 0, sell: 0 };
  placed.forEach(t => {
    if (t.side) sides[t.side]++;
  });
  console.log(`  BUY:  ${sides.buy}`);
  console.log(`  SELL: ${sides.sell}`);

  // ============================================================================
  // Win Rate Analysis
  // ============================================================================
  console.log('\n📋 Win Rate Analysis:');

  // Pair up trades (buy + sell)
  const buyTrades = placed.filter(t => t.side === 'buy');
  let wins = 0;
  let losses = 0;
  let totalPnL = 0;

  buyTrades.forEach(buy => {
    const sell = placed.find(s =>
      s.side === 'sell' &&
      new Date(s.timestamp) > new Date(buy.timestamp) &&
      s.tick > buy.tick
    );

    if (sell) {
      const entryPrice = buy.price;
      const exitPrice = sell.price;
      const pnl = ((exitPrice - entryPrice) / entryPrice) * 100;

      if (pnl > 0) wins++;
      else losses++;

      totalPnL += pnl;
    }
  });

  const total = wins + losses;
  if (total > 0) {
    const winRate = ((wins / total) * 100).toFixed(1);
    const avgPnL = (totalPnL / total).toFixed(2);

    console.log(`  Total Trades: ${total}`);
    console.log(`  Wins: ${wins}`);
    console.log(`  Losses: ${losses}`);
    console.log(`  Win Rate: ${winRate}%`);

    if (winRate >= 50) {
      console.log(`  Status: ✅ Excellent`);
    } else if (winRate >= 45) {
      console.log(`  Status: 🟡 Good`);
    } else if (winRate >= 40) {
      console.log(`  Status: 🟠 Monitor`);
    } else {
      console.log(`  Status: 🔴 Alert`);
    }

    console.log(`  Average PnL: ${avgPnL}%`);
  } else {
    console.log(`  ⚠️  Insufficient completed trades for win rate analysis`);
  }
}

// ============================================================================
// Recent Activity
// ============================================================================
console.log('\n📋 Recent Activity (Last 10):');
const recent = filteredTrades.slice(-10).reverse();
recent.forEach(t => {
  const status = t.orderPlaced ? '✅' : (t.skipped ? '⏭️' : '❌');
  const time = new Date(t.timestamp).toLocaleTimeString();
  const side = t.side ? t.side.toUpperCase().padEnd(4) : '    ';
  console.log(`  ${status} ${time} - ${t.signal.toUpperCase().padEnd(6)} - ${side} - Price: $${t.price?.toFixed(4) || 'N/A'}`);
});

// ============================================================================
// Skip Reasons
// ============================================================================
const skips = filteredTrades.filter(t => t.skipReason);
if (skips.length > 0) {
  console.log('\n📋 Skip Reasons:');
  const reasons = {};
  skips.forEach(t => {
    reasons[t.skipReason] = (reasons[t.skipReason] || 0) + 1;
  });
  Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
    console.log(`  ${count}x - ${reason}`);
  });
}

// ============================================================================
// Error Summary
// ============================================================================
const errors = filteredTrades.filter(t => !t.orderPlaced && !t.skipped);
if (errors.length > 0) {
  console.log('\n📋 Error Summary:');
  const errorMessages = {};
  errors.forEach(t => {
    const msg = t.orderId || 'Unknown error';
    errorMessages[msg] = (errorMessages[msg] || 0) + 1;
  });
  Object.entries(errorMessages).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([msg, count]) => {
    console.log(`  ${count}x - ${msg}`);
  });
}

console.log('\n' + '='.repeat(50) + '\n');

// ============================================================================
// Performance Assessment
// ============================================================================
const winRate = total > 0 ? (wins / total) * 100 : 0;
let status = 'UNKNOWN';
let color = '⚪';

if (total > 0) {
  if (winRate >= 50) {
    status = 'EXCELLENT';
    color = '🟢';
  } else if (winRate >= 45) {
    status = 'GOOD';
    color = '🟡';
  } else if (winRate >= 40) {
    status = 'MONITOR';
    color = '🟠';
  } else {
    status = 'ALERT';
    color = '🔴';
  }
}

console.log(`Overall Status: ${color} ${status}\n`);
