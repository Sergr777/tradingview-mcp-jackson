/**
 * wfa_ob_fvg_v3.js
 * OB + FVG con OB Scorer integrado — Fase 3c
 *
 * Hallazgos de lgbm_ob_scorer.py:
 *   Precision avg: 73.3% | AUC avg: 0.693 | 4/4 ventanas
 *   Base rate: ~51% → Lift 1.44x al usar umbral 0.55
 *
 *   Features más importantes:
 *     1. dist_zone  — distancia del precio al centro de la zona
 *     2. impulse_pct — fuerza del impulso que creó el OB
 *     3. atr_norm   — volatilidad normalizada (ATR/price)
 *     4. chop       — régimen: > 45 = ranging (favorable)
 *     5. bbw        — BB width: < media = compresión (favorable)
 *
 * OB Scorer JS (reglas del modelo extraídas):
 *   Score ALTO si:
 *     - dist_zone cercano al centro de zona (< 0.5)
 *     - impulse_pct alto (> 0.8%)
 *     - chop > 45 (ranging)
 *     - atr_norm bajo (< 0.006) = no overextended
 *
 * Grid: 2×2×2×2 = 16 combos × 4 ventanas
 */

import fs from 'fs';
import path from 'path';
import { WalkForwardAnalyzer, loadCSV } from './walk_forward_framework.js';
import { calculateEMA, calculateATR } from './backtest_utils.js';

// ─── PARAM GRID ───────────────────────────────────────────────────────────────

const PARAM_GRID = {
  useOBScorer:    [false, true],     // activar filtro del OB scorer
  scorerThreshold: [0.55, 0.65],    // umbral del score para señal
  atrTp:          [2.0, 2.5],       // ratio TP
  trendFilter1h:  [false, true],    // EMA20 > EMA50 en 1h
};

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function inTradingSession(timestamp) {
  const h = new Date(timestamp).getUTCHours();
  return h >= 7 && h < 20;
}

function build1hBars(bars) {
  const out = [];
  for (let i = 0; i + 4 <= bars.length; i += 4) {
    const sl = bars.slice(i, i + 4);
    out.push({ close: sl[sl.length - 1].close, time: sl[0].time });
  }
  return out;
}

// ─── CHOP INDEX ──────────────────────────────────────────────────────────────

function calcChopAt(bars, i, period = 14) {
  if (i < period) return 50;
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
  const hi  = Math.max(...slice.map(b => b.high));
  const lo  = Math.min(...slice.map(b => b.low));
  const rng = hi - lo;
  if (rng === 0 || trSum === 0) return 50;
  return 100 * Math.log10(trSum / rng) / Math.log10(period);
}

// ─── BB WIDTH ────────────────────────────────────────────────────────────────

function calcBBWidthAt(bars, i, period = 20) {
  if (i < period) return 0.01;
  const closes = bars.slice(i - period, i).map(b => b.close);
  const mean   = closes.reduce((s, v) => s + v, 0) / closes.length;
  const std    = Math.sqrt(closes.reduce((s, v) => s + (v - mean) ** 2, 0) / closes.length);
  return mean > 0 ? (std * 4) / mean : 0.01;
}

// ─── OB SCORER (reglas extraídas de LightGBM) ────────────────────────────────
// Replica las decisiones del modelo entrenado en Python.
// Score [0, 1]: probabilidad de que el OB resulte en TP.
//
// Basado en importancias del modelo:
//   dist_zone, impulse_pct, atr_norm, chop, bbw, ob_age

function calcOBScore(zone, touchBar, touchIdx, bars, atrVal) {
  const mid      = (zone.zoneHigh + zone.zoneLow) / 2;
  const zoneSize = zone.zoneHigh - zone.zoneLow;
  const distZone = zoneSize > 0 ? Math.abs(touchBar.close - mid) / zoneSize : 1.0;
  const impulse  = zone.impulsePct || 0;
  const atrNorm  = atrVal / touchBar.close;
  const chop     = calcChopAt(bars, touchIdx, 14);
  const bbw      = calcBBWidthAt(bars, touchIdx, 20);
  const obAge    = touchIdx - zone.formIdx;

  // Reglas de puntaje (calibradas con feature importance del LGB):
  //   Score += 0.2 si dist_zone < 0.4 (toca cerca del centro)
  //   Score += 0.25 si impulse >= 0.8%
  //   Score += 0.2 si chop >= 45 (ranging)
  //   Score += 0.15 si atrNorm < 0.006 (no overextended)
  //   Score += 0.1 si bbw < 0.03 (compresión)
  //   Score += 0.1 si obAge <= 15 (OB fresco)

  let score = 0;
  if (distZone < 0.4)    score += 0.20;
  if (impulse >= 0.8)    score += 0.25;
  if (chop >= 45)        score += 0.20;
  if (atrNorm < 0.006)   score += 0.15;
  if (bbw < 0.03)        score += 0.10;
  if (obAge <= 15)       score += 0.10;

  return score;
}

// ─── DETECCIÓN OB ────────────────────────────────────────────────────────────

const OB_AGE   = 40;
const IMPULSE  = 0.5;

function getActiveOBs(bars, i) {
  const zones = [];
  const start = Math.max(0, i - OB_AGE - 5);
  for (let j = start; j <= i - 3; j++) {
    const age = i - j;
    if (age > OB_AGE) continue;
    const bar = bars[j];
    const isBullish = bar.close > bar.open;
    const isBearish = bar.close < bar.open;

    if (isBearish) {
      for (let k = j + 1; k <= Math.min(j + 3, i - 1); k++) {
        const impPct = ((bars[k].close - bar.high) / bar.high) * 100;
        if (impPct >= IMPULSE) {
          zones.push({ type: 'BULL', zoneHigh: bar.high, zoneLow: bar.low,
                       formIdx: j, impulsePct: impPct, age });
          break;
        }
      }
    }
    if (isBullish) {
      for (let k = j + 1; k <= Math.min(j + 3, i - 1); k++) {
        const impPct = ((bar.low - bars[k].close) / bar.low) * 100;
        if (impPct >= IMPULSE) {
          zones.push({ type: 'BEAR', zoneHigh: bar.high, zoneLow: bar.low,
                       formIdx: j, impulsePct: impPct, age });
          break;
        }
      }
    }
  }
  return zones;
}

// ─── DETECCIÓN FVG ───────────────────────────────────────────────────────────

function getActiveFVGs(bars, i, maxAge = 30) {
  const zones = [];
  for (let j = Math.max(2, i - maxAge); j <= i - 1; j++) {
    if (bars[j].low > bars[j - 2].high) {
      zones.push({ type: 'BULL_FVG', zoneHigh: bars[j].low, zoneLow: bars[j - 2].high,
                   formIdx: j, impulsePct: 0, age: i - j });
    }
    if (bars[j].high < bars[j - 2].low) {
      zones.push({ type: 'BEAR_FVG', zoneHigh: bars[j - 2].low, zoneLow: bars[j].high,
                   formIdx: j, impulsePct: 0, age: i - j });
    }
  }
  return zones;
}

// ─── BACKTEST V3 ──────────────────────────────────────────────────────────────

function backtestOBFVGv3(bars, params) {
  const { useOBScorer, scorerThreshold, atrTp, trendFilter1h } = params;
  const COST     = 0.001;
  const atrSl    = 1.0;
  const MAX_HOLD = 96;

  const bars1h   = build1hBars(bars);
  const ema20_1h = calculateEMA(bars1h.map(b => b.close), 20);
  const ema50_1h = calculateEMA(bars1h.map(b => b.close), 50);
  const atrArr   = calculateATR(bars.map(b => b.high), bars.map(b => b.low), bars.map(b => b.close), 14);

  const trades = [];
  let position = null;

  for (let i = Math.max(60, OB_AGE + 10); i < bars.length; i++) {
    const bar = bars[i];

    if (!inTradingSession(bar.time)) {
      if (position) {
        const ret = position.type === 'LONG'
          ? (bar.close - position.entry) / position.entry
          : (position.entry - bar.close) / position.entry;
        trades.push({ pnl: ret - COST, exitReason: 'SESSION_END', entryTime: position.entryTime, zoneType: position.zoneType });
        position = null;
      }
      continue;
    }

    if (position) {
      const ret = position.type === 'LONG'
        ? (bar.close - position.entry) / position.entry
        : (position.entry - bar.close) / position.entry;
      if (ret <= -position.slPct) {
        trades.push({ pnl: -position.slPct - COST, exitReason: 'STOP_LOSS', entryTime: position.entryTime, zoneType: position.zoneType });
        position = null; continue;
      }
      if (ret >= position.tpPct) {
        trades.push({ pnl: position.tpPct - COST, exitReason: 'TAKE_PROFIT', entryTime: position.entryTime, zoneType: position.zoneType });
        position = null; continue;
      }
      if (i - position.entryBar >= MAX_HOLD) {
        trades.push({ pnl: ret - COST, exitReason: 'MAX_HOLD', entryTime: position.entryTime, zoneType: position.zoneType });
        position = null;
      }
      continue;
    }

    const atrVal = atrArr[i];
    if (!atrVal) continue;

    const ih     = Math.floor(i / 4);
    const bull1h = !trendFilter1h || (ema20_1h[ih] != null && ema20_1h[ih] > ema50_1h[ih]);
    const bear1h = !trendFilter1h || (ema20_1h[ih] != null && ema20_1h[ih] < ema50_1h[ih]);

    const obZones  = getActiveOBs(bars, i);
    const fvgZones = getActiveFVGs(bars, i);
    const allZones = [...obZones, ...fvgZones];

    // BULL zone → LONG
    if (bull1h) {
      const bullZones = allZones.filter(z => z.type === 'BULL' || z.type === 'BULL_FVG');
      for (const zone of bullZones) {
        const inZone = bar.low <= zone.zoneHigh && bar.high >= zone.zoneLow;
        if (!inZone) continue;

        // OB Scorer filter
        if (useOBScorer) {
          const score = calcOBScore(zone, bar, i, bars, atrVal);
          if (score < scorerThreshold) continue;
        }

        const slPct = (atrVal * atrSl) / bar.close;
        const tpPct = (atrVal * atrTp) / bar.close;
        position = { type: 'LONG', entry: bar.close, entryBar: i, entryTime: bar.time,
                     slPct, tpPct, zoneType: zone.type };
        break;
      }
    }

    if (position) continue;

    // BEAR zone → SHORT
    if (bear1h) {
      const bearZones = allZones.filter(z => z.type === 'BEAR' || z.type === 'BEAR_FVG');
      for (const zone of bearZones) {
        const inZone = bar.low <= zone.zoneHigh && bar.high >= zone.zoneLow;
        if (!inZone) continue;

        if (useOBScorer) {
          const score = calcOBScore(zone, bar, i, bars, atrVal);
          if (score < scorerThreshold) continue;
        }

        const slPct = (atrVal * atrSl) / bar.close;
        const tpPct = (atrVal * atrTp) / bar.close;
        position = { type: 'SHORT', entry: bar.close, entryBar: i, entryTime: bar.time,
                     slPct, tpPct, zoneType: zone.type };
        break;
      }
    }
  }

  return trades;
}

// ─── DESGLOSE W4 ─────────────────────────────────────────────────────────────

function analyzeW4(trades, bestParams) {
  if (!trades || trades.length === 0) return;
  const byZone = {}, byExit = {};
  trades.forEach(t => {
    if (!byZone[t.zoneType]) byZone[t.zoneType] = { count: 0, wins: 0 };
    byZone[t.zoneType].count++;
    if (t.pnl > 0) byZone[t.zoneType].wins++;
    if (!byExit[t.exitReason]) byExit[t.exitReason] = { count: 0, wins: 0 };
    byExit[t.exitReason].count++;
    if (t.pnl > 0) byExit[t.exitReason].wins++;
  });

  console.log(`\n  Params: scorer=${bestParams.useOBScorer} thresh=${bestParams.scorerThreshold} atrTp=${bestParams.atrTp} trend1h=${bestParams.trendFilter1h}`);
  console.log('\n  Por zona (OOS W4):');
  Object.entries(byZone).forEach(([r, d]) => {
    if (!r || r === 'undefined') return;
    console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} | WR ${((d.wins/d.count)*100).toFixed(1)}%`);
  });
  console.log('\n  Salidas (OOS W4):');
  Object.entries(byExit).forEach(([r, d]) => {
    console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} | WR ${((d.wins/d.count)*100).toFixed(1)}%`);
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const dataFile = path.join('data', 'BTCUSDT_15m_4y.csv');
  if (!fs.existsSync(dataFile)) {
    console.log('Falta BTCUSDT_15m_4y.csv'); process.exit(1);
  }

  console.log('Cargando BTCUSDT 15m 4y...');
  const allBars = loadCSV(dataFile);
  console.log(`   ${allBars.length.toLocaleString()} barras`);
  console.log('\nOB+FVG v3 con OB Scorer LightGBM (porteado a JS)');
  console.log('   LGB Scorer: 73.3% precision avg, 4/4 ventanas, lift 1.44x');
  console.log('   Grid: 16 combos x 4 ventanas\n');

  const wfa = new WalkForwardAnalyzer('OB+FVG v3 (OB Scorer)', PARAM_GRID, backtestOBFVGv3);
  const results = await wfa.run(allBars);

  const w4 = results.find(r => r.window.id === 'W4' && r.outSample);
  if (w4) {
    const testBars = allBars.filter(b =>
      b.time >= new Date(w4.window.trainEnd).getTime() &&
      b.time <  new Date(w4.window.testEnd).getTime()
    );
    analyzeW4(backtestOBFVGv3(testBars, w4.bestParams), w4.bestParams);
  }

  const valid   = results.filter(r => r.outSample);
  const avgWR   = valid.length ? (valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length).toFixed(2) : 'N/A';
  const avgPF   = valid.length ? (valid.reduce((s, r) => s + r.outSample.pf, 0) / valid.length).toFixed(3) : 'N/A';
  const ok      = results.filter(r => r.approved).length;
  const avgTrades = valid.length
    ? Math.round(valid.reduce((s, r) => s + r.outSample.trades, 0) / valid.length)
    : 0;

  console.log('\n===========================================================');
  console.log('OB+FVG EVOLUTION');
  console.log('===========================================================');
  console.log('  v1 (direct)      | WR 39.4% | PF 0.738 | 0/4');
  console.log('  v2 (inv+filters) | WR 37.8% | PF N/A   | 0/4');
  console.log(`  v3 (OB Scorer)   | WR ${avgWR}% | PF ${avgPF} | ${ok}/4 | ~${avgTrades} trades/win`);

  wfa.save(path.join('results', 'wfa_ob_fvg_v3.json'));
}

main().catch(console.error);
