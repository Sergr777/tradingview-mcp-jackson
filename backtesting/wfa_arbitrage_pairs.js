/**
 * wfa_arbitrage_pairs.js
 * Statistical Arbitrage — Pairs Trading Multi-Activo (Fase 2 Consolidación)
 *
 * Evolución desde v4 (Z-score de un solo activo):
 *   v4 resultado: WR 68.95% pero W4 falla (solo 23 trades, régimen cambió)
 *
 * Upgrade: True Pairs Trading
 *   En lugar del Z-score de BTC solo, usar el SPREAD logarítmico entre dos activos
 *   correlacionados. El spread es más estacionario que el precio individual.
 *
 * Lógica:
 *   spread(t) = log(priceA(t)) - log(priceB(t))
 *   Z-score del spread → cuando es extremo, apostar a convergencia
 *   LONG spread: comprar A, vender B (spread se extendió a la baja)
 *   SHORT spread: vender A, comprar B (spread se extendió al alza)
 *
 * Pares testeados:
 *   ETH/BTC  — par madre, máxima correlación
 *   SOL/BTC  — par momentum, alta beta
 *   DOGE/XRP — par especulativo, menor correlación
 *   SOL/ETH  — par altcoins, buena cointegración
 *
 * Filtro de régimen aplicado al SPREAD (Chop del spread):
 *   Si el spread mismo está en tendencia → skip
 *   Si el spread está en rango → entrar
 *
 * Grid: 2×3×3×2 = 36 combos × 4 pares × 4 ventanas
 */

import fs from 'fs';
import path from 'path';
import { WalkForwardAnalyzer, loadCSV, WFA_CONFIG } from './walk_forward_framework.js';

// ─── PARES ────────────────────────────────────────────────────────────────────

const PAIRS = [
  { name: 'ETH/BTC',  fileA: 'ETHUSDT_1h_4y.csv', fileB: 'BTCUSDT_1h_4y.csv' },
  { name: 'SOL/BTC',  fileA: 'SOLUSDT_1h_4y.csv', fileB: 'BTCUSDT_1h_4y.csv' },
  { name: 'SOL/ETH',  fileA: 'SOLUSDT_1h_4y.csv', fileB: 'ETHUSDT_1h_4y.csv' },
  { name: 'DOGE/XRP', fileA: 'DOGEUSDT_1h_4y.csv', fileB: 'XRPUSDT_1h_4y.csv' },
];

// ─── PARAM GRID ───────────────────────────────────────────────────────────────

const PARAM_GRID = {
  zEntry:       [3.0, 3.5],         // umbral de entrada
  lookback:     [24, 48, 72],       // horas de lookback para spread Z-score
  zSlOffset:    [1.5, 2.0, 3.0],   // SL = zEntry + offset
  regimeFilter: [false, true],      // filtro Chop en el spread
};

// ─── CALCULAR SPREAD ─────────────────────────────────────────────────────────

function buildSpreadBars(barsA, barsB) {
  // Alinear por timestamp
  const mapB = new Map(barsB.map(b => [b.time, b.close]));
  const spread = [];
  for (const a of barsA) {
    const bClose = mapB.get(a.time);
    if (!bClose) continue;
    spread.push({
      time:   a.time,
      close:  Math.log(a.close) - Math.log(bClose),
      priceA: a.close,
      priceB: bClose,
    });
  }
  return spread;
}

// ─── Z-SCORE ─────────────────────────────────────────────────────────────────

function calcZScore(values, i, lookback) {
  if (i < lookback) return 0;
  const window = values.slice(i - lookback, i);
  const mean   = window.reduce((s, v) => s + v, 0) / window.length;
  const std    = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length);
  return std > 0 ? (values[i] - mean) / std : 0;
}

// ─── CHOP DEL SPREAD ─────────────────────────────────────────────────────────

function calcSpreadChop(spreads, i, period = 14) {
  if (i < period + 1) return 50;
  const slice = spreads.slice(i - period, i + 1);
  // Simular ATR sobre el spread: |spread[k] - spread[k-1]|
  let trSum = 0;
  for (let k = 1; k < slice.length; k++) {
    trSum += Math.abs(slice[k].close - slice[k - 1].close);
  }
  const highest = Math.max(...slice.map(b => b.close));
  const lowest  = Math.min(...slice.map(b => b.close));
  const range   = highest - lowest;
  if (range === 0 || trSum === 0) return 50;
  return 100 * Math.log10(trSum / range) / Math.log10(period);
}

// ─── BACKTEST PAIRS ───────────────────────────────────────────────────────────

function backtestPairs(spreadBars, params) {
  const { zEntry, lookback, zSlOffset, regimeFilter } = params;
  const zSL      = zEntry + zSlOffset;
  const COST     = 0.002;  // 2 legs × 0.1% cada uno
  const MAX_HOLD = 72;     // horas máx
  const COST_THRESHOLD = 0.05;  // 5% mín de retorno esperado para evitar microops

  const spreads = spreadBars.map(b => b.close);
  const trades  = [];
  let position  = null;

  for (let i = lookback + 20; i < spreadBars.length; i++) {
    const bar = spreadBars[i];

    if (position) {
      const z        = calcZScore(spreads, i, lookback);
      const barsOpen = i - position.entryBar;
      const ret      = position.dir === 'LONG_SPREAD'
        ? bar.close - position.entrySpread
        : position.entrySpread - bar.close;

      // SL: spread se extiende más allá del umbral de invalidación
      const invalid = (position.dir === 'LONG_SPREAD'  && z <= -zSL) ||
                      (position.dir === 'SHORT_SPREAD'  && z >=  zSL);
      if (invalid) {
        trades.push({ pnl: -COST - 0.01, exitReason: 'Z_STOP', entryTime: position.entryTime });
        position = null; continue;
      }

      // Salida: spread revierte a media
      const reverted = (position.dir === 'LONG_SPREAD'  && z >= 0) ||
                       (position.dir === 'SHORT_SPREAD'  && z <= 0);
      if (reverted) {
        // PnL en % basado en movimiento del spread relativo al tamaño de entrada
        const pnlPct = ret / Math.abs(position.entrySpread || 0.001);
        trades.push({ pnl: Math.min(pnlPct * 0.5, 0.15) - COST, exitReason: 'Z_NEUTRAL', entryTime: position.entryTime });
        position = null; continue;
      }

      if (barsOpen >= MAX_HOLD) {
        trades.push({ pnl: -COST, exitReason: 'MAX_HOLD', entryTime: position.entryTime });
        position = null;
      }
      continue;
    }

    // Filtro de régimen sobre el spread
    if (regimeFilter) {
      const chop = calcSpreadChop(spreadBars, i, 14);
      if (chop < 45) continue;  // spread en tendencia → skip
    }

    const z = calcZScore(spreads, i, lookback);
    if (z <= -zEntry) {
      position = { dir: 'LONG_SPREAD', entrySpread: bar.close, entryBar: i, entryTime: bar.time };
    } else if (z >= zEntry) {
      position = { dir: 'SHORT_SPREAD', entrySpread: bar.close, entryBar: i, entryTime: bar.time };
    }
  }

  return trades;
}

// ─── ANÁLISIS DE PARES ────────────────────────────────────────────────────────

function analyzePair(name, spreadBars, bestParams) {
  const trades   = backtestPairs(spreadBars, bestParams);
  if (!trades.length) return { name, trades: 0, wr: 0, pf: 0 };

  const wins = trades.filter(t => t.pnl > 0);
  const loss = trades.filter(t => t.pnl <= 0);
  const gw   = wins.reduce((s, t) => s + t.pnl, 0);
  const gl   = Math.abs(loss.reduce((s, t) => s + t.pnl, 0));
  const wr   = (wins.length / trades.length * 100).toFixed(1);
  const pf   = gl > 0 ? (gw / gl).toFixed(3) : gw > 0 ? '∞' : '0';

  // Por tipo de salida
  const by = {};
  trades.forEach(t => {
    if (!by[t.exitReason]) by[t.exitReason] = { c: 0, w: 0 };
    by[t.exitReason].c++;
    if (t.pnl > 0) by[t.exitReason].w++;
  });

  return { name, trades: trades.length, wr, pf, by };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📂 Cargando pares...');
  const dir = 'data';

  // Verificar que todos los archivos existen
  const missing = PAIRS.flatMap(p => [p.fileA, p.fileB])
    .filter((f, i, a) => a.indexOf(f) === i)
    .filter(f => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    console.log('❌ Faltan archivos:', missing.join(', '));
    process.exit(1);
  }

  // Construir spreads
  const pairData = {};
  for (const pair of PAIRS) {
    const barsA  = loadCSV(path.join(dir, pair.fileA));
    const barsB  = loadCSV(path.join(dir, pair.fileB));
    const spread = buildSpreadBars(barsA, barsB);
    pairData[pair.name] = spread;
    console.log(`   ${pair.name.padEnd(10)}: ${spread.length.toLocaleString()} barras sincronizadas`);
  }

  console.log('\n📈 Arbitraje Pairs Trading — 4 pares × WFA 4 ventanas');
  console.log('   Filtro Chop aplicado al SPREAD (no al precio individual)\n');

  // ─── WFA por par ──────────────────────────────────────────────────────────

  const pairResults = {};

  for (const pair of PAIRS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📊 PAR: ${pair.name}`);
    console.log('─'.repeat(60));

    const spreadBars = pairData[pair.name];

    const wfa = new WalkForwardAnalyzer(
      `Arbitrage Pairs — ${pair.name}`,
      PARAM_GRID,
      (bars, params) => backtestPairs(bars, params)
    );

    const results    = await wfa.run(spreadBars);
    const valid      = results.filter(r => r.outSample);
    const avgWR      = valid.length ? (valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length).toFixed(1) : 'N/A';
    const avgPF      = valid.length ? (valid.reduce((s, r) => s + r.outSample.pf, 0) / valid.length).toFixed(3) : 'N/A';
    const approved   = results.filter(r => r.approved).length;

    pairResults[pair.name] = { avgWR, avgPF, approved, results };

    // Desglose W4 del par
    const w4 = results.find(r => r.window.id === 'W4' && r.outSample);
    if (w4) {
      const testSpread = spreadBars.filter(b =>
        b.time >= new Date(w4.window.trainEnd).getTime() &&
        b.time <  new Date(w4.window.testEnd).getTime()
      );
      const detail = analyzePair(pair.name, testSpread, w4.bestParams);
      console.log(`\n  W4 detalle: ${detail.trades} trades | WR ${detail.wr}% | PF ${detail.pf}`);
      if (detail.by) {
        Object.entries(detail.by).forEach(([r, d]) => {
          console.log(`    ${r.padEnd(12)}: ${String(d.c).padStart(4)} trades | WR ${((d.w/d.c)*100).toFixed(1)}%`);
        });
      }
      const p = w4.bestParams;
      console.log(`  Params W4: zEntry=${p.zEntry} | lookback=${p.lookback}h | zSL=+${p.zSlOffset} | regime=${p.regimeFilter}`);
    }

    wfa.save(path.join('results', `wfa_arbitrage_${pair.name.replace('/', '_')}.json`));
  }

  // ─── RESUMEN FINAL ────────────────────────────────────────────────────────

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          ARBITRAGE PAIRS — RESUMEN FINAL                ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Par        │ WR OOS avg │ PF avg  │ Ventanas OK        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  for (const [name, r] of Object.entries(pairResults)) {
    const status = r.approved >= 3 ? '🟢' : r.approved >= 2 ? '🟡' : '🔴';
    console.log(`║  ${status} ${name.padEnd(8)} │  ${String(r.avgWR).padStart(6)}%   │  ${String(r.avgPF).padStart(5)}  │ ${r.approved}/4 ventanas           ║`);
  }
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Referencia: v4 (BTC solo)  WR 68.95% | PF 1.421 | 2/4 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Portfolio combinado: poolear trades de los mejores pares
  console.log('\n📦 Portfolio: seleccionando pares con WR OOS ≥ 60%...');
  const goodPairs = Object.entries(pairResults)
    .filter(([, r]) => parseFloat(r.avgWR) >= 60 && r.approved >= 2)
    .map(([name]) => name);
  if (goodPairs.length > 0) {
    console.log(`  ✅ Pares calificados: ${goodPairs.join(', ')}`);
  } else {
    console.log('  ⚠️  Ningún par supera el umbral — revisar parámetros');
  }
}

main().catch(console.error);
