/**
 * wfa_ob_fvg_v2.js
 * OB + FVG — Corrección Fase 2
 *
 * Hallazgos Fase 1:
 *   - WR ~39% con señales normales (BULL OB → LONG: 39.5%, BEAR OB → SHORT: 45.5%)
 *   - Invertir señal: BULL OB → SHORT daría ~60%, BEAR OB → LONG daría ~54.5%
 *   - Todos los filtros (sesión, 4h, 1h) se desactivaron en optimización
 *
 * Hipótesis de corrección:
 *   Los OBs en ICT son zonas donde el precio CONTINÚA, no REVIERTE,
 *   a menos que el contexto de tendencia sea el correcto.
 *   La implementación original retestea el OB esperando rebote,
 *   pero el precio con frecuencia sigue en la dirección del impulso.
 *
 * Correcciones v2:
 *   A: Inversión selectiva — testear señal directa vs invertida como parámetro
 *   B: Confirmar con vela de cierre fuera de la zona (no solo tocar)
 *   C: Forzar tendencia 1h activa (sin trend filter = señales aleatorias)
 *   D: Solo usar FVG (más preciso que OB) o solo OB como parámetro
 *
 * Grid: 2×2×2×2×2×2 = 64 combos × 4 ventanas
 */

import fs from 'fs';
import path from 'path';
import { WalkForwardAnalyzer, loadCSV } from './walk_forward_framework.js';
import { calculateEMA, calculateATR } from './backtest_utils.js';

// ─── PARAM GRID ───────────────────────────────────────────────────────────────

const PARAM_GRID = {
  invertSignal:   [false, true],    // A: probar señal invertida
  requireClose:   [false, true],    // B: requiere cierre fuera de zona
  trendFilter1h:  [false, true],    // C: EMA20 > EMA50 en 1h
  useOB:          [true, false],    // D: usar OBs
  useFVG:         [true, false],    // D: usar FVGs
  atrTp:          [2.0, 2.5],       // ratio TP más amplio
};

// ─── SESIÓN ───────────────────────────────────────────────────────────────────

function inTradingSession(timestamp) {
  const h = new Date(timestamp).getUTCHours();
  return h >= 7 && h < 20;
}

// ─── DERIVAR BARRAS 1H ────────────────────────────────────────────────────────

function build1hBars(bars) {
  const out = [];
  for (let i = 0; i + 4 <= bars.length; i += 4) {
    const sl = bars.slice(i, i + 4);
    out.push({ close: sl[sl.length - 1].close, time: sl[0].time });
  }
  return out;
}

// ─── DETECCIÓN OB ────────────────────────────────────────────────────────────

function getActiveOBs(bars, i, impulseMinPct, maxAge) {
  const zones = [];
  const start = Math.max(0, i - maxAge - 5);
  for (let j = start; j <= i - 3; j++) {
    const age = i - j;
    if (age > maxAge) continue;
    const bar = bars[j];
    const isBullish = bar.close > bar.open;
    const isBearish = bar.close < bar.open;

    if (isBearish) {
      for (let k = j + 1; k <= Math.min(j + 3, i - 1); k++) {
        if (((bars[k].close - bar.high) / bar.high) * 100 >= impulseMinPct) {
          zones.push({ type: 'BULL', zoneHigh: bar.high, zoneLow: bar.low, age });
          break;
        }
      }
    }
    if (isBullish) {
      for (let k = j + 1; k <= Math.min(j + 3, i - 1); k++) {
        if (((bar.low - bars[k].close) / bar.low) * 100 >= impulseMinPct) {
          zones.push({ type: 'BEAR', zoneHigh: bar.high, zoneLow: bar.low, age });
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
      zones.push({ type: 'BULL_FVG', zoneHigh: bars[j].low, zoneLow: bars[j - 2].high, age: i - j });
    }
    if (bars[j].high < bars[j - 2].low) {
      zones.push({ type: 'BEAR_FVG', zoneHigh: bars[j - 2].low, zoneLow: bars[j].high, age: i - j });
    }
  }
  return zones;
}

// ─── BACKTEST V2 ──────────────────────────────────────────────────────────────

function backtestOBFVGv2(bars, params) {
  const { invertSignal, requireClose, trendFilter1h, useOB, useFVG, atrTp } = params;
  const COST     = 0.001;
  const atrSl    = 1.0;
  const OB_AGE   = 40;
  const MAX_HOLD = 96;
  const IMPULSE  = 0.5;

  if (!useOB && !useFVG) return [];

  // Pre-calcular 1h
  const bars1h   = build1hBars(bars);
  const ema20_1h = calculateEMA(bars1h.map(b => b.close), 20);
  const ema50_1h = calculateEMA(bars1h.map(b => b.close), 50);
  const atrArr   = calculateATR(bars.map(b => b.high), bars.map(b => b.low), bars.map(b => b.close), 14);

  const trades  = [];
  let position  = null;

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

    // Tendencia 1h
    const ih        = Math.floor(i / 4);
    const bull1h    = !trendFilter1h || (ema20_1h[ih] != null && ema20_1h[ih] > ema50_1h[ih]);
    const bear1h    = !trendFilter1h || (ema20_1h[ih] != null && ema20_1h[ih] < ema50_1h[ih]);

    // Zonas activas
    const obZones  = useOB  ? getActiveOBs(bars, i, IMPULSE, OB_AGE) : [];
    const fvgZones = useFVG ? getActiveFVGs(bars, i) : [];

    // Dirección según inversión de señal
    // invertSignal=false: BULL zona → LONG (ICT clásico)
    // invertSignal=true : BULL zona → SHORT (contra-tendencia / continuación)

    const entryLong  = invertSignal ? bear1h : bull1h;
    const entryShort = invertSignal ? bull1h : bear1h;

    if (entryLong) {
      const zones = invertSignal
        ? [ ...obZones.filter(z => z.type === 'BEAR'), ...fvgZones.filter(z => z.type === 'BEAR_FVG') ]
        : [ ...obZones.filter(z => z.type === 'BULL'), ...fvgZones.filter(z => z.type === 'BULL_FVG') ];

      for (const zone of zones) {
        const inZone = bar.low <= zone.zoneHigh && bar.high >= zone.zoneLow;
        if (!inZone) continue;

        // Corrección B: cierre fuera de zona (precio no se quedó dentro)
        if (requireClose && bar.close < zone.zoneLow) continue;

        const slPct = (atrVal * atrSl) / bar.close;
        const tpPct = (atrVal * atrTp) / bar.close;
        position = { type: 'LONG', entry: bar.close, entryBar: i, entryTime: bar.time, slPct, tpPct, zoneType: zone.type };
        break;
      }
    }

    if (position) continue;

    if (entryShort) {
      const zones = invertSignal
        ? [ ...obZones.filter(z => z.type === 'BULL'), ...fvgZones.filter(z => z.type === 'BULL_FVG') ]
        : [ ...obZones.filter(z => z.type === 'BEAR'), ...fvgZones.filter(z => z.type === 'BEAR_FVG') ];

      for (const zone of zones) {
        const inZone = bar.low <= zone.zoneHigh && bar.high >= zone.zoneLow;
        if (!inZone) continue;

        // Corrección B
        if (requireClose && bar.close > zone.zoneHigh) continue;

        const slPct = (atrVal * atrSl) / bar.close;
        const tpPct = (atrVal * atrTp) / bar.close;
        position = { type: 'SHORT', entry: bar.close, entryBar: i, entryTime: bar.time, slPct, tpPct, zoneType: zone.type };
        break;
      }
    }
  }

  return trades;
}

// ─── DESGLOSE ─────────────────────────────────────────────────────────────────

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
  console.log(`\n  📊 invertSignal=${bestParams.invertSignal} | requireClose=${bestParams.requireClose} | trend1h=${bestParams.trendFilter1h} | OB=${bestParams.useOB} | FVG=${bestParams.useFVG}`);
  console.log('\n  📊 Por zona (OOS W4):');
  Object.entries(byZone).forEach(([r, d]) => {
    if (!r || r === 'undefined') return;
    console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} | WR ${((d.wins/d.count)*100).toFixed(1)}%`);
  });
  console.log('\n  📊 Salidas (OOS W4):');
  Object.entries(byExit).forEach(([r, d]) => {
    console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} | WR ${((d.wins/d.count)*100).toFixed(1)}%`);
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const dataFile = path.join('data', 'BTCUSDT_15m_4y.csv');
  if (!fs.existsSync(dataFile)) { console.log('❌ Falta BTCUSDT_15m_4y.csv'); process.exit(1); }

  console.log('📂 Cargando BTCUSDT 15m 4y...');
  const allBars = loadCSV(dataFile);
  console.log(`   ${allBars.length.toLocaleString()} barras`);
  console.log('\n🧱 OB+FVG v2 — Prueba inversión de señal + filtros estrictos');
  console.log('   Grid: 64 combos × 4 ventanas\n');

  const wfa = new WalkForwardAnalyzer('OB+FVG v2 (Señal Invertida)', PARAM_GRID, backtestOBFVGv2);
  const results = await wfa.run(allBars);

  const w4 = results.find(r => r.window.id === 'W4' && r.outSample);
  if (w4) {
    const testBars = allBars.filter(b =>
      b.time >= new Date(w4.window.trainEnd).getTime() &&
      b.time <  new Date(w4.window.testEnd).getTime()
    );
    analyzeW4(backtestOBFVGv2(testBars, w4.bestParams), w4.bestParams);
  }

  const valid = results.filter(r => r.outSample);
  const avgWR = valid.length ? (valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length).toFixed(2) : 'N/A';
  const avgPF = valid.length ? (valid.reduce((s, r) => s + r.outSample.pf, 0) / valid.length).toFixed(3) : 'N/A';
  const ok    = results.filter(r => r.approved).length;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('📊 OB+FVG v2 vs v1');
  console.log('══════════════════════════════════════════════════════');
  console.log('  v1 (señal directa) | WR 39.40% | PF 0.738 | 0/4 ventanas');
  console.log(`  v2 (corregida)     | WR ${avgWR}%  | PF ${avgPF} | ${ok}/4 ventanas`);

  wfa.save(path.join('results', 'wfa_ob_fvg_v2.json'));
}

main().catch(console.error);
