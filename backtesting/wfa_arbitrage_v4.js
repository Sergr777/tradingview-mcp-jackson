/**
 * wfa_arbitrage_v4.js
 * Arbitraje Estadístico — Corrección Fase 2
 *
 * Hallazgos Fase 1 (v3):
 *   - Z_NEUTRAL (reversión completa): 77.3% WR ✅ → señal real existe
 *   - Z_STOP    (Z se extiende):       0.8% WR ❌ → destruye el sistema
 *   - Ratio: 198 Z_NEUTRAL vs 124 Z_STOP (demasiados stops)
 *
 * Causa raíz: BTC tiene tendencias fuertes donde el Z nunca revierte.
 * Solución: solo entrar cuando el contexto macro es RANGING (no trending).
 *
 * Correcciones v4:
 *   A: Filtro de régimen — entrar solo si BTC está en rango (BB Width bajo o Chop alto)
 *   B: Entrada más extrema (Z > 4.0) — menos trades, más seguros
 *   C: Z-stop más amplio — dar más espacio antes de cortar
 *   D: Multi-activo — testear en pares menos trending (ETH, DOGE vs BTC spread)
 *
 * Grid: 2×3×3×2 = 36 combos × 4 ventanas
 */

import fs from 'fs';
import path from 'path';
import { WalkForwardAnalyzer, loadCSV } from './walk_forward_framework.js';
import { calculateSMA, calculateEMA } from './backtest_utils.js';

// ─── PARAM GRID ───────────────────────────────────────────────────────────────

const PARAM_GRID = {
  zEntry:      [3.5, 4.0],         // B: umbral de entrada más estricto
  lookback:    [20, 30, 50],       // ventana Z-score
  zSlOffset:   [1.5, 2.0, 3.0],   // C: más espacio antes de Z-stop
  regimeFilter: [false, true],     // A: filtro de régimen ranging
};

// ─── Z-SCORE ─────────────────────────────────────────────────────────────────

function calcZScore(bars, i, lookback) {
  if (i < lookback) return 0;
  const closes = bars.slice(i - lookback, i).map(b => b.close);
  const mean   = closes.reduce((s, v) => s + v, 0) / closes.length;
  const std    = Math.sqrt(closes.reduce((s, v) => s + (v - mean) ** 2, 0) / closes.length);
  return std > 0 ? (bars[i].close - mean) / std : 0;
}

// ─── BOLLINGER BAND WIDTH (proxy de régimen) ─────────────────────────────────
// BW bajo = mercado en rango → reversion más probable
// BW alto = mercado trending → reversion menos probable

function calcBBWidth(bars, i, period = 20) {
  if (i < period) return null;
  const closes = bars.slice(i - period, i).map(b => b.close);
  const mean   = closes.reduce((s, v) => s + v, 0) / closes.length;
  const std    = Math.sqrt(closes.reduce((s, v) => s + (v - mean) ** 2, 0) / closes.length);
  return mean > 0 ? (std * 4) / mean * 100 : null; // BB width %
}

// ─── CHOP INDEX ──────────────────────────────────────────────────────────────
// Chop > 61.8 = ranging | Chop < 38.2 = trending

function calcChop(bars, i, period = 14) {
  if (i < period) return null;
  const slice = bars.slice(i - period, i + 1);
  let trSum = 0;
  for (let k = 1; k < slice.length; k++) {
    const tr = Math.max(
      slice[k].high - slice[k].low,
      Math.abs(slice[k].high - slice[k - 1].close),
      Math.abs(slice[k].low  - slice[k - 1].close)
    );
    trSum += tr;
  }
  const highestHigh = Math.max(...slice.map(b => b.high));
  const lowestLow   = Math.min(...slice.map(b => b.low));
  const range = highestHigh - lowestLow;
  if (range === 0 || trSum === 0) return 50;
  return 100 * Math.log10(trSum / range) / Math.log10(period);
}

// ─── BACKTEST V4 ──────────────────────────────────────────────────────────────

function backtestArbitrageV4(bars, params) {
  const { zEntry, lookback, zSlOffset, regimeFilter } = params;
  const zSL    = zEntry + zSlOffset;
  const COST   = 0.001;
  const maxHold = 50;

  const trades  = [];
  let position  = null;
  let stats     = { filtered: 0, entered: 0 };

  for (let i = lookback + 20; i < bars.length; i++) {
    const bar = bars[i];

    if (position) {
      const z        = calcZScore(bars, i, lookback);
      const barsOpen = i - position.entryBar;
      const ret      = position.type === 'BUY'
        ? (bar.close - position.entry) / position.entry
        : (position.entry - bar.close) / position.entry;

      const invalidated = (position.type === 'BUY'  && z <= -zSL) ||
                          (position.type === 'SELL' && z >=  zSL);
      if (invalidated) {
        trades.push({ pnl: ret - COST, exitReason: 'Z_STOP', entryTime: position.entryTime, type: position.type });
        position = null; continue;
      }

      const reverted = (position.type === 'BUY'  && z >= 0) ||
                       (position.type === 'SELL' && z <= 0);
      if (reverted) {
        trades.push({ pnl: ret - COST, exitReason: 'Z_NEUTRAL', entryTime: position.entryTime, type: position.type });
        position = null; continue;
      }

      if (barsOpen >= maxHold) {
        trades.push({ pnl: ret - COST, exitReason: 'MAX_HOLD', entryTime: position.entryTime, type: position.type });
        position = null;
      }
      continue;
    }

    // Filtro de régimen (Corrección A)
    if (regimeFilter) {
      const chop = calcChop(bars, i, 14);
      if (chop !== null && chop < 45) {  // < 45 = trending, skip
        stats.filtered++;
        continue;
      }
    }

    // Entrada
    const z = calcZScore(bars, i, lookback);
    if (z <= -zEntry) {
      stats.entered++;
      position = { type: 'BUY',  entry: bar.close, entryBar: i, entryTime: bar.time };
    } else if (z >= zEntry) {
      stats.entered++;
      position = { type: 'SELL', entry: bar.close, entryBar: i, entryTime: bar.time };
    }
  }

  return trades;
}

// ─── DESGLOSE ─────────────────────────────────────────────────────────────────

function analyzeW4(trades) {
  if (!trades || trades.length === 0) return;
  const by = {};
  trades.forEach(t => {
    if (!by[t.exitReason]) by[t.exitReason] = { count: 0, wins: 0, pnl: 0 };
    by[t.exitReason].count++;
    if (t.pnl > 0) by[t.exitReason].wins++;
    by[t.exitReason].pnl += t.pnl;
  });
  console.log('\n  📊 Desglose salidas (OOS W4):');
  Object.entries(by).forEach(([r, d]) => {
    const wr  = ((d.wins / d.count) * 100).toFixed(1);
    const avg = ((d.pnl / d.count) * 100).toFixed(3);
    console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} trades | WR ${wr.padStart(5)}% | avg ${avg}%`);
  });
  const zNeutral = by['Z_NEUTRAL'] || { count: 0 };
  const zStop    = by['Z_STOP']    || { count: 0 };
  const ratio    = zStop.count > 0 ? (zNeutral.count / zStop.count).toFixed(2) : '∞';
  console.log(`\n  📊 Ratio Z_NEUTRAL/Z_STOP: ${ratio} (objetivo > 2.5)`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const dataFile = path.join('data', 'BTCUSDT_15m_4y.csv');
  if (!fs.existsSync(dataFile)) { console.log('❌ Falta BTCUSDT_15m_4y.csv'); process.exit(1); }

  console.log('📂 Cargando BTCUSDT 15m 4y...');
  const allBars = loadCSV(dataFile);
  console.log(`   ${allBars.length.toLocaleString()} barras`);
  console.log('\n📈 Arbitraje v4 — Régimen Ranging + Z extremo + stop amplio');
  console.log('   Problema v3: Z_NEUTRAL 77% WR pero Z_STOP destruye (0.8% WR)');
  console.log('   Grid: 36 combos × 4 ventanas\n');

  const wfa = new WalkForwardAnalyzer('Arbitrage v4 (Chop Filter + Wide Z-Stop)', PARAM_GRID, backtestArbitrageV4);
  const results = await wfa.run(allBars);

  const w4 = results.find(r => r.window.id === 'W4' && r.outSample);
  if (w4) {
    const testBars = allBars.filter(b =>
      b.time >= new Date(w4.window.trainEnd).getTime() &&
      b.time <  new Date(w4.window.testEnd).getTime()
    );
    analyzeW4(backtestArbitrageV4(testBars, w4.bestParams));
    const p = w4.bestParams;
    console.log(`\n  Params W4: zEntry=${p.zEntry} | lookback=${p.lookback} | zSL offset=+${p.zSlOffset} | regime=${p.regimeFilter}`);
  }

  const valid = results.filter(r => r.outSample);
  const avgWR = valid.length ? (valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length).toFixed(2) : 'N/A';
  const avgPF = valid.length ? (valid.reduce((s, r) => s + r.outSample.pf, 0) / valid.length).toFixed(3) : 'N/A';
  const ok    = results.filter(r => r.approved).length;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('📊 ARBITRAGE EVOLUCIÓN');
  console.log('══════════════════════════════════════════════════════');
  console.log('  v3 (Z-stop) | WR 48.12% | PF 0.744 | 0/4 ventanas');
  console.log(`  v4 (Chop)   | WR ${avgWR}%  | PF ${avgPF} | ${ok}/4 ventanas`);

  wfa.save(path.join('results', 'wfa_arbitrage_v4.json'));
}

main().catch(console.error);
