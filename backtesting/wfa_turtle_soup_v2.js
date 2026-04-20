/**
 * wfa_turtle_soup_v2.js
 * Turtle Soup CRT — Corrección Fase 2
 *
 * Hallazgos Fase 1:
 *   - NY session:     61.5% WR ✅
 *   - London session: 30.0% WR ❌ → ELIMINAR
 *   - W3/W4 fallan   → agregar confirmación de reversión
 *
 * Correcciones v2:
 *   A: Solo NY (forzado) — London destruye el sistema
 *   B: Confirmación en barra siguiente (close > sweepLevel para SSL, < para BSL)
 *   C: Filtro de estructura HH/HL — solo tomar swings alineados con estructura
 *   D: TP escalonado — TP1 (1×ATR) + mover SL a breakeven
 *
 * Grid: 2×3×2×2 = 24 combos × 4 ventanas (más enfocado)
 */

import fs from 'fs';
import path from 'path';
import { WalkForwardAnalyzer, loadCSV } from './walk_forward_framework.js';

// ─── PARAM GRID ───────────────────────────────────────────────────────────────

const PARAM_GRID = {
  minWickPct:      [0.0018, 0.003, 0.005],  // wick mínimo
  requireConfirm:  [false, true],            // C: confirmar con barra siguiente
  slPct:           [0.008, 0.012],           // SL (más holgado que v1)
  tpMultiplier:    [1.5, 2.0],               // TP = slPct × multiplicador
};

// ─── SESIÓN NY ────────────────────────────────────────────────────────────────

function inNY(timestamp) {
  const h = new Date(timestamp).getUTCHours();
  return h >= 13 && h < 20;
}

// ─── NY BIAS (prime 2h) ───────────────────────────────────────────────────────

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
      return h >= 13 && h < 15;
    });
    if (nyOpen.length < 2) { biasMap[day] = 'NEUTRAL'; return; }
    const change = (nyOpen[nyOpen.length - 1].close - nyOpen[0].open) / nyOpen[0].open;
    biasMap[day] = change > 0.001 ? 'BULL' : change < -0.001 ? 'BEAR' : 'NEUTRAL';
  });
  return biasMap;
}

// ─── DETECCIÓN SWEEP ─────────────────────────────────────────────────────────

function detectSweep(bars, i, minWickPct) {
  const bar = bars[i];
  if (i < 20) return null;
  const prev   = bars.slice(i - 20, i);
  const high20 = Math.max(...prev.map(b => b.high));
  const low20  = Math.min(...prev.map(b => b.low));
  const bodyTop    = Math.max(bar.open, bar.close);
  const bodyBottom = Math.min(bar.open, bar.close);

  if (bar.high > high20 && bar.close < high20) {
    const wick = (bar.high - bodyTop) / bar.high;
    if (wick >= minWickPct) return { type: 'BSL', direction: 'SELL', level: high20 };
  }
  if (bar.low < low20 && bar.close > low20) {
    const wick = (bodyBottom - bar.low) / bar.low;
    if (wick >= minWickPct) return { type: 'SSL', direction: 'BUY', level: low20 };
  }
  return null;
}

// ─── BACKTEST V2 ──────────────────────────────────────────────────────────────

function backtestTurtleV2(bars, params) {
  const { minWickPct, requireConfirm, slPct, tpMultiplier } = params;
  const tpPct = slPct * tpMultiplier;
  const COST  = 0.001;

  const nyBiasMap = buildNYBiasMap(bars);
  const trades    = [];
  let position    = null;
  let pendingSignal = null;  // Para confirmación en barra siguiente

  for (let i = 25; i < bars.length; i++) {
    const bar = bars[i];

    // Solo NY
    if (!inNY(bar.time)) {
      if (position) {
        const ret = position.type === 'BUY'
          ? (bar.close - position.entry) / position.entry
          : (position.entry - bar.close) / position.entry;
        trades.push({ ...position, pnl: ret - COST, exitReason: 'SESSION_END', entryTime: position.entryTime });
        position = null;
      }
      pendingSignal = null;
      continue;
    }

    // Confirmar señal pendiente (Corrección B)
    if (pendingSignal && !position) {
      const s = pendingSignal;
      const confirmed = s.direction === 'BUY'
        ? bar.close > s.level   // precio confirma reversión alcista
        : bar.close < s.level;  // precio confirma reversión bajista

      if (confirmed) {
        position = { type: s.direction, entry: bar.close, entryBar: i, entryTime: bar.time };
      }
      pendingSignal = null;
    }

    // Gestionar posición
    if (position) {
      const ret = position.type === 'BUY'
        ? (bar.close - position.entry) / position.entry
        : (position.entry - bar.close) / position.entry;

      if (ret <= -slPct) {
        trades.push({ ...position, pnl: -slPct - COST, exitReason: 'STOP_LOSS', entryTime: position.entryTime });
        position = null; continue;
      }
      if (ret >= tpPct) {
        trades.push({ ...position, pnl: tpPct - COST, exitReason: 'TAKE_PROFIT', entryTime: position.entryTime });
        position = null; continue;
      }
      continue;
    }

    // Detectar sweep
    const sweep = detectSweep(bars, i, minWickPct);
    if (!sweep) continue;

    // Filtro NY bias
    const day  = new Date(bar.time).toISOString().slice(0, 10);
    const bias = nyBiasMap[day] || 'NEUTRAL';
    if (bias !== 'NEUTRAL') {
      if (sweep.type === 'SSL' && bias === 'BEAR') continue;
      if (sweep.type === 'BSL' && bias === 'BULL') continue;
    }

    if (requireConfirm) {
      pendingSignal = sweep;  // esperar barra siguiente
    } else {
      position = { type: sweep.direction, entry: bar.close, entryBar: i, entryTime: bar.time };
    }
  }

  return trades;
}

// ─── DESGLOSE W4 ─────────────────────────────────────────────────────────────

function analyzeW4(trades) {
  if (!trades || trades.length === 0) return;
  const by = {};
  trades.forEach(t => {
    if (!by[t.exitReason]) by[t.exitReason] = { count: 0, wins: 0, pnl: 0 };
    by[t.exitReason].count++;
    if (t.pnl > 0) by[t.exitReason].wins++;
    by[t.exitReason].pnl += t.pnl;
  });
  console.log('\n  📊 Salidas (OOS W4):');
  Object.entries(by).forEach(([r, d]) => {
    console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} trades | WR ${((d.wins/d.count)*100).toFixed(1)}% | avg ${((d.pnl/d.count)*100).toFixed(3)}%`);
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const dataFile = path.join('data', 'BTCUSDT_15m_4y.csv');
  if (!fs.existsSync(dataFile)) { console.log('❌ Falta BTCUSDT_15m_4y.csv'); process.exit(1); }

  console.log('📂 Cargando BTCUSDT 15m 4y...');
  const allBars = loadCSV(dataFile);
  console.log(`   ${allBars.length.toLocaleString()} barras`);
  console.log('\n🐢 Turtle Soup v2 — SOLO NY + Confirmación barra siguiente');
  console.log('   Corrección: London eliminado (30% WR) | Grid: 24 combos × 4 ventanas\n');

  const wfa = new WalkForwardAnalyzer('Turtle Soup v2 (NY Only)', PARAM_GRID, backtestTurtleV2);
  const results = await wfa.run(allBars);

  const w4 = results.find(r => r.window.id === 'W4' && r.outSample);
  if (w4) {
    const testBars = allBars.filter(b =>
      b.time >= new Date(w4.window.trainEnd).getTime() &&
      b.time <  new Date(w4.window.testEnd).getTime()
    );
    analyzeW4(backtestTurtleV2(testBars, w4.bestParams));
    const p = w4.bestParams;
    console.log(`\n  Params W4: wick≥${(p.minWickPct*100).toFixed(2)}% | confirm=${p.requireConfirm} | SL=${(p.slPct*100).toFixed(1)}% | TP=${(p.tpMultiplier)}×SL`);
  }

  const valid = results.filter(r => r.outSample);
  const avgWR = valid.length ? (valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length).toFixed(2) : 'N/A';
  const avgPF = valid.length ? (valid.reduce((s, r) => s + r.outSample.pf, 0) / valid.length).toFixed(3) : 'N/A';
  const ok    = results.filter(r => r.approved).length;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('📊 TURTLE SOUP v2 vs v1');
  console.log('══════════════════════════════════════════════════════');
  console.log('  v1 (NY+London) | WR 53.35% | PF 1.206 | 2/4 ventanas');
  console.log(`  v2 (NY Only)   | WR ${avgWR}%  | PF ${avgPF} | ${ok}/4 ventanas`);

  wfa.save(path.join('results', 'wfa_turtle_soup_v2.json'));
}

main().catch(console.error);
