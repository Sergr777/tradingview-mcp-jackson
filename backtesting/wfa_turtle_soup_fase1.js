/**
 * wfa_turtle_soup_fase1.js
 * Walk-Forward Analysis — Turtle Soup CTR (REVERTIDO A BASELINE)
 *
 * NOTA IMPORTANTE (2026-04-23):
 *   Las optimizaciones de Fase 1 (trailing stop, bias condicional ADX>30,
 *   z-score filter) fueron REVERTIDAS tras backtesting OOS porque
 *   DEGRADARON el sistema: WR cayó de 61.52% a 51.41%, PF de 1.736 a 0.969.
 *
 *   Este archivo ahora usa la lógica BASELINE probada y estable:
 *   - SESSION_END exit (cierra al finalizar sesión)
 *   - NY Bias filter SIEMPRE activo (cuando está habilitado)
 *   - Sin z-score filter
 *   - Sin trailing stop
 *   - Grid de parámetros original (48 combos × 4 ventanas)
 *
 *   Lección: "Simplicity wins". El baseline ya era óptimo.
 *
 * Datos: BTCUSDT 15m 4 años (150K barras)
 * Grid: 2×3×2×2×2 = 48 combos × 4 ventanas (liviano para 8GB RAM)
 */

import fs from 'fs';
import path from 'path';
import { WalkForwardAnalyzer, loadCSV, WFA_CONFIG } from './walk_forward_framework.js';

// ─── PARAM GRID ───────────────────────────────────────────────────────────────

const PARAM_GRID = {
  session:       ['ny_only', 'both'],         // Drill A: solo NY vs London+NY
  minWickPct:    [0.0018, 0.0030, 0.0040],    // Drill B: wick mín (0.18%, 0.30%, 0.40%)
  bufferBars:    [0, 5],                      // Drill C: bars antes de activar SL
  nyBiasFilter:  [false, true],               // Drill D: alineación con primeras 2h NY
  slPct:         [0.006, 0.010],              // SL % fijo
  tpPct:         [0.012, 0.018],              // TP % fijo (R:R 2:1 aprox)
};

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function getHourUTC(timestamp) {
  return new Date(timestamp).getUTCHours();
}

function inNYSession(timestamp) {
  const h = getHourUTC(timestamp);
  return h >= 13 && h < 20;  // 9am-4pm EST
}

function inLondonSession(timestamp) {
  const h = getHourUTC(timestamp);
  return h >= 7 && h < 13;   // 7am-1pm UTC
}

function inSession(timestamp, session) {
  if (session === 'ny_only') return inNYSession(timestamp);
  return inNYSession(timestamp) || inLondonSession(timestamp);
}

// ─── NY BIAS (Drill D) ────────────────────────────────────────────────────────
// Calcula la dirección de las primeras 2h de la sesión NY actual (13-15h UTC)
// para cada barra — se precalcula al inicio para no repetir trabajo

function buildNYBiasMap(bars) {
  // Para cada día, calcula si las primeras 2h de NY son alcistas o bajistas
  const biasMap = {};  // key: "YYYY-MM-DD" → 'BULL' | 'BEAR' | 'NEUTRAL'

  // Agrupar barras por día
  const byDay = {};
  bars.forEach(b => {
    const day = new Date(b.time).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(b);
  });

  Object.entries(byDay).forEach(([day, dayBars]) => {
    // Barras entre 13h y 15h UTC
    const nyOpen = dayBars.filter(b => {
      const h = getHourUTC(b.time);
      return h >= 13 && h < 15;
    });
    if (nyOpen.length < 2) {
      biasMap[day] = 'NEUTRAL';
      return;
    }
    const first = nyOpen[0].open;
    const last  = nyOpen[nyOpen.length - 1].close;
    const change = (last - first) / first;
    biasMap[day] = change > 0.001 ? 'BULL' : change < -0.001 ? 'BEAR' : 'NEUTRAL';
  });

  return biasMap;
}

// ─── DETECCIÓN DE TURTLE SOUP ─────────────────────────────────────────────────

function detectSweep(bars, i, minWickPct) {
  const bar   = bars[i];
  const lookback = 20;
  if (i < lookback) return null;

  // High/Low de las últimas 20 barras (excluyendo la actual)
  const prev = bars.slice(i - lookback, i);
  const high20 = Math.max(...prev.map(b => b.high));
  const low20  = Math.min(...prev.map(b => b.low));

  const bodyTop    = Math.max(bar.open, bar.close);
  const bodyBottom = Math.min(bar.open, bar.close);
  const wickAbove  = bar.high - bodyTop;
  const wickBelow  = bodyBottom - bar.low;

  // BSL sweep: barre máximos → SHORT (wick arriba, cierre debajo del high20)
  if (bar.high > high20 && bar.close < high20) {
    const wickPct = wickAbove / bar.high;
    if (wickPct >= minWickPct) {
      return { type: 'BSL', direction: 'SELL', sweepLevel: high20 };
    }
  }

  // SSL sweep: barre mínimos → LONG (wick abajo, cierre encima del low20)
  if (bar.low < low20 && bar.close > low20) {
    const wickPct = wickBelow / bar.low;
    if (wickPct >= minWickPct) {
      return { type: 'SSL', direction: 'BUY', sweepLevel: low20 };
    }
  }

  return null;
}

// ─── BACKTEST ─────────────────────────────────────────────────────────────────

function backtestTurtle(bars, params) {
  const { session, minWickPct, bufferBars, nyBiasFilter, slPct, tpPct } = params;
  const trades = [];
  const COST   = 0.001;

  // Precalcular bias NY (Drill D)
  const nyBiasMap = nyBiasFilter ? buildNYBiasMap(bars) : null;

  let position = null;

  for (let i = 25; i < bars.length; i++) {
    const bar = bars[i];

    // Solo operar dentro de sesión configurada
    if (!inSession(bar.time, session)) {
      // Si hay posición abierta y salimos de sesión → cerrar
      if (position) {
        const ret = position.type === 'BUY'
          ? (bar.close - position.entry) / position.entry
          : (position.entry - bar.close) / position.entry;
        trades.push({ ...position, exit: bar.close, pnl: ret - COST, exitReason: 'SESSION_END', exitTime: bar.time });
        position = null;
      }
      continue;
    }

    if (position) {
      const barsOpen = i - position.entryBar;
      const ret      = position.type === 'BUY'
        ? (bar.close - position.entry) / position.entry
        : (position.entry - bar.close) / position.entry;

      // Drill C: en las primeras N barras, usar breakeven en lugar de SL
      if (bufferBars > 0 && barsOpen < bufferBars) {
        // Cierre en breakeven si el precio regresa al entry
        const atBreakeven = (position.type === 'BUY'  && bar.close <= position.entry) ||
                            (position.type === 'SELL' && bar.close >= position.entry);
        if (atBreakeven) {
          trades.push({ ...position, exit: bar.close, pnl: -COST, exitReason: 'BREAKEVEN', exitTime: bar.time });
          position = null;
          continue;
        }
      } else {
        // SL normal
        if (ret < -slPct) {
          trades.push({ ...position, exit: bar.close, pnl: -slPct - COST, exitReason: 'STOP_LOSS', exitTime: bar.time });
          position = null;
          continue;
        }
      }

      // TP
      if (ret >= tpPct) {
        trades.push({ ...position, exit: bar.close, pnl: tpPct - COST, exitReason: 'TAKE_PROFIT', exitTime: bar.time });
        position = null;
        continue;
      }

      continue;
    }

    // Buscar señal
    const sweep = detectSweep(bars, i, minWickPct);
    if (!sweep) continue;

    // Drill D: filtro bias NY (siempre activo cuando nyBiasFilter=true)
    if (nyBiasFilter && nyBiasMap) {
      const day   = new Date(bar.time).toISOString().slice(0, 10);
      const bias  = nyBiasMap[day] || 'NEUTRAL';
      if (bias !== 'NEUTRAL') {
        // SSL (ir LONG) en bias bajista → skip
        if (sweep.type === 'SSL' && bias === 'BEAR') continue;
        // BSL (ir SHORT) en bias alcista → skip
        if (sweep.type === 'BSL' && bias === 'BULL') continue;
      }
    }

    position = {
      type:      sweep.direction,
      entry:     bar.close,
      entryBar:  i,
      entryTime: bar.time,
      sweepType: sweep.type,
      params,
    };
  }

  return trades;
}

// ─── ANÁLISIS DE SESIONES ─────────────────────────────────────────────────────

function analyzeBySession(trades, bars) {
  const ny     = { count: 0, wins: 0, pnl: 0 };
  const london = { count: 0, wins: 0, pnl: 0 };

  trades.forEach(t => {
    const h = getHourUTC(t.entryTime);
    const bucket = (h >= 13 && h < 20) ? ny : london;
    bucket.count++;
    if (t.pnl > 0) bucket.wins++;
    bucket.pnl += t.pnl;
  });

  console.log('\n  📊 Desglose por sesión (OOS W4):');
  ['NY (13-20h)', 'London (7-13h)'].forEach((label, idx) => {
    const d = idx === 0 ? ny : london;
    if (d.count === 0) { console.log(`    ${label}: sin trades`); return; }
    const wr  = ((d.wins / d.count) * 100).toFixed(1);
    const avg = ((d.pnl / d.count) * 100).toFixed(3);
    console.log(`    ${label.padEnd(16)}: ${String(d.count).padStart(4)} trades | WR ${wr}% | avg ${avg}%`);
  });

  const byReason = {};
  trades.forEach(t => {
    if (!byReason[t.exitReason]) byReason[t.exitReason] = { count: 0, wins: 0 };
    byReason[t.exitReason].count++;
    if (t.pnl > 0) byReason[t.exitReason].wins++;
  });
  console.log('\n  📊 Salidas:');
  Object.entries(byReason).forEach(([r, d]) => {
    const wr = ((d.wins / d.count) * 100).toFixed(1);
    console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} trades | WR ${wr}%`);
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const dataFile = path.join('data', 'BTCUSDT_15m_4y.csv');
  if (!fs.existsSync(dataFile)) {
    console.log('❌ Datos no encontrados: data/BTCUSDT_15m_4y.csv');
    process.exit(1);
  }

  console.log('📂 Cargando datos 4 años BTCUSDT 15m...');
  const allBars = loadCSV(dataFile);
  console.log(`   ${allBars.length.toLocaleString()} barras`);
  console.log('\n🐢 Turtle Soup WFA — BASELINE (Revertido post-optimización)');
  console.log('   Grid: 48 combos × 4 ventanas (RAM-friendly)\n');

  const wfa = new WalkForwardAnalyzer(
    'Turtle Soup CTR (NY + Wick Filter) — BASELINE',
    PARAM_GRID,
    backtestTurtle
  );

  const results = await wfa.run(allBars);

  // Desglose sesión en W4
  const w4 = results.find(r => r.window.id === 'W4' && r.outSample);
  if (w4) {
    const testBars = allBars.filter(b =>
      b.time >= new Date(w4.window.trainEnd).getTime() &&
      b.time <  new Date(w4.window.testEnd).getTime()
    );
    const trades = backtestTurtle(testBars, w4.bestParams);
    analyzeBySession(trades, testBars);
    console.log(`\n  Params W4: session=${w4.bestParams.session} | wick≥${(w4.bestParams.minWickPct*100).toFixed0?.() ?? (w4.bestParams.minWickPct*100)}% | buffer=${w4.bestParams.bufferBars}bars | nyBias=${w4.bestParams.nyBiasFilter} | SL=${(w4.bestParams.slPct*100).toFixed1?.() ?? (w4.bestParams.slPct*100)}% | TP=${(w4.bestParams.tpPct*100).toFixed1?.() ?? (w4.bestParams.tpPct*100)}%`);
  }

  // Comparación base vs pretemporada
  const valid = results.filter(r => r.outSample);
  const avgWR = valid.length ? (valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length).toFixed(2) : 'N/A';
  const avgPF = valid.length ? (valid.reduce((s, r) => s + r.outSample.pf, 0) / valid.length).toFixed(3) : 'N/A';
  const ok    = results.filter(r => r.approved).length;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('📊 TURTLE SOUP — COMPARACIÓN');
  console.log('══════════════════════════════════════════════════════');
  console.log('  Base (1 año IS) | WR 53.05% | London+NY | wick 0.18%');
  console.log(`  WFA baseline    | WR ${avgWR}%  | PF ${avgPF} | ${ok}/4 ventanas aprobadas`);
  console.log('  Fase 1 (opt)    | REVERTIDO — ver docs/optimizacion_recomendada/');

  wfa.save(path.join('results', 'wfa_turtle_soup.json'));
}

main().catch(console.error);
