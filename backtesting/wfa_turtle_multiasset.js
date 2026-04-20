/**
 * wfa_turtle_multiasset.js
 * Turtle Soup CRT — Multi-Activo (BTC + ETH + SOL en 1h)
 *
 * Problema v2: NY-only reduce trades a 28-30 por ventana → inestabilidad estadística
 * Solución: sumar señales de 3 activos → ~90 trades por ventana (3× más)
 *
 * Assets: BTC 1h + ETH 1h + SOL 1h (todos con 4 años de datos)
 * Timeframe: 1h (sweep de high/low de las últimas 20h)
 * Sesión: NY only (13-20h UTC) — el hallazgo más sólido de Fase 1
 *
 * Ventajas del 1h vs 15m:
 *   - Sweeps más significativos (captura daily high/low)
 *   - Menos ruido que 15m
 *   - ETH y SOL tienen más volatilidad → más sweeps válidos
 *
 * Arquitectura:
 *   1. Backtest Turtle Soup en BTC_1h
 *   2. Backtest Turtle Soup en ETH_1h (mismos parámetros OOS)
 *   3. Backtest Turtle Soup en SOL_1h (mismos parámetros OOS)
 *   4. Pool all trades → métricas combinadas
 *   5. WFA sobre el pool combinado
 *
 * Grid: 3×2×2×2 = 24 combos × 4 ventanas
 */

import fs from 'fs';
import path from 'path';
import { WalkForwardAnalyzer, loadCSV, calcMetrics, WFA_CONFIG } from './walk_forward_framework.js';

// ─── PARAM GRID ───────────────────────────────────────────────────────────────

const PARAM_GRID = {
  minWickPct:   [0.002, 0.004, 0.007],  // 1h tiene velas más grandes → wick mayor
  requireConfirm: [false, true],         // confirmar con barra siguiente
  slPct:        [0.012, 0.018],          // SL más amplio en 1h
  tpMultiplier: [1.5, 2.0],             // TP = slPct × mult
};

// ─── SESIÓN NY ────────────────────────────────────────────────────────────────

function inNY(timestamp) {
  const h = new Date(timestamp).getUTCHours();
  return h >= 13 && h < 20;
}

// ─── NY BIAS (prime 3h en 1h) ─────────────────────────────────────────────────

function buildNYBiasMap(bars) {
  const biasMap = {};
  const byDay = {};
  bars.forEach(b => {
    const day = new Date(b.time).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(b);
  });
  Object.entries(byDay).forEach(([day, dayBars]) => {
    const nyOpen = dayBars.filter(b => {
      const h = new Date(b.time).getUTCHours();
      return h >= 13 && h < 16;  // primeras 3h de NY en 1h TF
    });
    if (nyOpen.length < 2) { biasMap[day] = 'NEUTRAL'; return; }
    const change = (nyOpen[nyOpen.length - 1].close - nyOpen[0].open) / nyOpen[0].open;
    biasMap[day] = change > 0.003 ? 'BULL' : change < -0.003 ? 'BEAR' : 'NEUTRAL';
  });
  return biasMap;
}

// ─── DETECCIÓN SWEEP (1h adaptado) ───────────────────────────────────────────
// En 1h, 20 barras = 20 horas ≈ 1 día de trading → captura high/low diarios

function detectSweep(bars, i, minWickPct) {
  const bar = bars[i];
  if (i < 20) return null;
  const prev   = bars.slice(i - 20, i);
  const high20 = Math.max(...prev.map(b => b.high));
  const low20  = Math.min(...prev.map(b => b.low));
  const bodyTop    = Math.max(bar.open, bar.close);
  const bodyBottom = Math.min(bar.open, bar.close);

  // BSL sweep: barre high → SHORT
  if (bar.high > high20 && bar.close < high20) {
    const wick = (bar.high - bodyTop) / bar.high;
    if (wick >= minWickPct) return { type: 'BSL', direction: 'SELL', level: high20 };
  }
  // SSL sweep: barre low → LONG
  if (bar.low < low20 && bar.close > low20) {
    const wick = (bodyBottom - bar.low) / bar.low;
    if (wick >= minWickPct) return { type: 'SSL', direction: 'BUY', level: low20 };
  }
  return null;
}

// ─── BACKTEST SINGLE ASSET ───────────────────────────────────────────────────

function backtestTurtle1h(bars, params, symbol = '') {
  const { minWickPct, requireConfirm, slPct, tpMultiplier } = params;
  const tpPct = slPct * tpMultiplier;
  const COST  = 0.001;

  const nyBiasMap   = buildNYBiasMap(bars);
  const trades      = [];
  let position      = null;
  let pendingSignal = null;

  for (let i = 25; i < bars.length; i++) {
    const bar = bars[i];

    if (!inNY(bar.time)) {
      if (position) {
        const ret = position.type === 'BUY'
          ? (bar.close - position.entry) / position.entry
          : (position.entry - bar.close) / position.entry;
        trades.push({ pnl: ret - COST, exitReason: 'SESSION_END', entryTime: position.entryTime, symbol });
        position = null;
      }
      pendingSignal = null;
      continue;
    }

    // Confirmar señal pendiente
    if (pendingSignal && !position) {
      const s = pendingSignal;
      const confirmed = s.direction === 'BUY' ? bar.close > s.level : bar.close < s.level;
      if (confirmed) {
        position = { type: s.direction, entry: bar.close, entryBar: i, entryTime: bar.time };
      }
      pendingSignal = null;
    }

    if (position) {
      const ret = position.type === 'BUY'
        ? (bar.close - position.entry) / position.entry
        : (position.entry - bar.close) / position.entry;

      if (ret <= -slPct) {
        trades.push({ pnl: -slPct - COST, exitReason: 'STOP_LOSS', entryTime: position.entryTime, symbol });
        position = null; continue;
      }
      if (ret >= tpPct) {
        trades.push({ pnl: tpPct - COST, exitReason: 'TAKE_PROFIT', entryTime: position.entryTime, symbol });
        position = null; continue;
      }
      continue;
    }

    const sweep = detectSweep(bars, i, minWickPct);
    if (!sweep) continue;

    const day  = new Date(bar.time).toISOString().slice(0, 10);
    const bias = nyBiasMap[day] || 'NEUTRAL';
    if (bias !== 'NEUTRAL') {
      if (sweep.type === 'SSL' && bias === 'BEAR') continue;
      if (sweep.type === 'BSL' && bias === 'BULL') continue;
    }

    if (requireConfirm) {
      pendingSignal = sweep;
    } else {
      position = { type: sweep.direction, entry: bar.close, entryBar: i, entryTime: bar.time };
    }
  }

  return trades;
}

// ─── BACKTEST MULTI-ASSET (pool) ─────────────────────────────────────────────

function backtestMultiAsset(btc, eth, sol) {
  return function(bars, params) {
    // 'bars' es BTC (el activo primario del WFA)
    // Determinar rango temporal de esta ventana
    const start = bars[0].time;
    const end   = bars[bars.length - 1].time;

    // Filtrar ETH y SOL al mismo rango
    const ethSlice = eth.filter(b => b.time >= start && b.time <= end);
    const solSlice = sol.filter(b => b.time >= start && b.time <= end);

    // Backtest en los 3 activos
    const tradesBTC = backtestTurtle1h(bars,     params, 'BTC');
    const tradesETH = backtestTurtle1h(ethSlice, params, 'ETH');
    const tradeSOL  = backtestTurtle1h(solSlice, params, 'SOL');

    // Pool combinado
    return [...tradesBTC, ...tradesETH, ...tradeSOL];
  };
}

// ─── ANÁLISIS W4 ─────────────────────────────────────────────────────────────

function analyzeW4(trades) {
  if (!trades || trades.length === 0) return;

  // Por activo
  const bySymbol = {};
  trades.forEach(t => {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { count: 0, wins: 0, pnl: 0 };
    bySymbol[t.symbol].count++;
    if (t.pnl > 0) bySymbol[t.symbol].wins++;
    bySymbol[t.symbol].pnl += t.pnl;
  });

  console.log('\n  📊 Por activo (OOS W4):');
  Object.entries(bySymbol).forEach(([sym, d]) => {
    if (!sym) return;
    const wr  = ((d.wins / d.count) * 100).toFixed(1);
    const avg = ((d.pnl / d.count) * 100).toFixed(3);
    console.log(`    ${sym.padEnd(6)}: ${String(d.count).padStart(4)} trades | WR ${wr.padStart(5)}% | avg ${avg}%`);
  });

  // Por salida
  const byExit = {};
  trades.forEach(t => {
    if (!byExit[t.exitReason]) byExit[t.exitReason] = { count: 0, wins: 0 };
    byExit[t.exitReason].count++;
    if (t.pnl > 0) byExit[t.exitReason].wins++;
  });
  console.log('\n  📊 Por salida (OOS W4):');
  Object.entries(byExit).forEach(([r, d]) => {
    const wr = ((d.wins / d.count) * 100).toFixed(1);
    console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} trades | WR ${wr}%`);
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const dir = 'data';
  const files = {
    btc: 'BTCUSDT_1h_4y.csv',
    eth: 'ETHUSDT_1h_4y.csv',
    sol: 'SOLUSDT_1h_4y.csv',
  };

  for (const [k, f] of Object.entries(files)) {
    if (!fs.existsSync(path.join(dir, f))) {
      console.log(`❌ Falta: ${f}`); process.exit(1);
    }
  }

  console.log('📂 Cargando BTC + ETH + SOL (1h 4 años)...');
  const btcBars = loadCSV(path.join(dir, files.btc));
  const ethBars = loadCSV(path.join(dir, files.eth));
  const solBars = loadCSV(path.join(dir, files.sol));

  console.log(`   BTC: ${btcBars.length.toLocaleString()} barras`);
  console.log(`   ETH: ${ethBars.length.toLocaleString()} barras`);
  console.log(`   SOL: ${solBars.length.toLocaleString()} barras`);

  console.log('\n🐢 Turtle Soup Multi-Activo — BTC+ETH+SOL 1h NY Session');
  console.log('   Objetivo: 3× más trades por ventana (>90 vs ~30 en v2 NY-only)');
  console.log('   Grid: 24 combos × 4 ventanas\n');

  const backtestFn = backtestMultiAsset(btcBars, ethBars, solBars);

  const wfa = new WalkForwardAnalyzer(
    'Turtle Soup Multi-Asset (BTC+ETH+SOL 1h NY)',
    PARAM_GRID,
    backtestFn
  );

  const results = await wfa.run(btcBars);  // BTC marca las ventanas temporales

  // Desglose W4
  const w4 = results.find(r => r.window.id === 'W4' && r.outSample);
  if (w4) {
    const start = new Date(w4.window.trainEnd).getTime();
    const end   = new Date(w4.window.testEnd).getTime();
    const btcW4 = btcBars.filter(b => b.time >= start && b.time < end);
    const ethW4 = ethBars.filter(b => b.time >= start && b.time < end);
    const solW4 = solBars.filter(b => b.time >= start && b.time < end);

    const allTrades = [
      ...backtestTurtle1h(btcW4, w4.bestParams, 'BTC'),
      ...backtestTurtle1h(ethW4, w4.bestParams, 'ETH'),
      ...backtestTurtle1h(solW4, w4.bestParams, 'SOL'),
    ];

    analyzeW4(allTrades);
    const p = w4.bestParams;
    console.log(`\n  Params W4: wick≥${(p.minWickPct*100).toFixed(2)}% | confirm=${p.requireConfirm} | SL=${(p.slPct*100).toFixed(1)}% | TP=${p.tpMultiplier}×SL`);
  }

  const valid = results.filter(r => r.outSample);
  const avgWR = valid.length ? (valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length).toFixed(2) : 'N/A';
  const avgPF = valid.length ? (valid.reduce((s, r) => s + r.outSample.pf, 0) / valid.length).toFixed(3) : 'N/A';
  const ok    = results.filter(r => r.approved).length;
  const avgTrades = valid.length
    ? Math.round(valid.reduce((s, r) => s + r.outSample.trades, 0) / valid.length)
    : 0;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       TURTLE SOUP MULTI-ACTIVO — RESUMEN                ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Versión            │  WR OOS  │ PF    │ Trades/win     ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  v1 BTC 15m NY+LON  │  53.35%  │ 1.206 │ ~160           ║');
  console.log('║  v2 BTC 15m NY only │  48.05%  │ 1.167 │ ~30 ❌ bajo    ║');
  console.log(`║  v3 BTC+ETH+SOL 1h  │  ${avgWR.padStart(6)}%  │ ${String(avgPF).padStart(5)} │ ~${String(avgTrades).padStart(3)} / ${ok}/4 win     ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  wfa.save(path.join('results', 'wfa_turtle_multiasset.json'));
}

main().catch(console.error);
