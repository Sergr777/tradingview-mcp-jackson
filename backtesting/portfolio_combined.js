/**
 * portfolio_combined.js
 * Portfolio Manager — Turtle Soup v1 + Arbitrage v4
 *
 * Sistemas validados por WFA:
 *   Turtle Soup v1  — NY+London session | WR 53.35% | 3/4 ventanas
 *   Arbitrage v4    — Chop filter + Z extremo | WR 68.95% | 2/4 ventanas
 *
 * Parámetros consenso (más estables a través de ventanas):
 *   Turtle:    session=both, minWickPct=0.003, nyBiasFilter=true, SL=1%, TP=1.2%
 *   Arbitrage: zEntry=3.5, lookback=50, zSlOffset=3, regimeFilter=true
 *
 * Métricas del portfolio:
 *   - Equity curve combinada
 *   - Sharpe ratio anualizado
 *   - Max Drawdown
 *   - CAGR (4 años)
 *   - Correlación entre sistemas
 *   - Sortino ratio
 *   - Kelly optimal fraction
 *   - Monthly returns breakdown
 *   - Calmar ratio (CAGR / MaxDD)
 */

import fs from 'fs';
import path from 'path';
import { loadCSV } from './walk_forward_framework.js';

// ─── PARÁMETROS CONSENSO ────────────────────────────────────────────────────

const TURTLE_PARAMS = {
  session:      'both',      // NY + London
  minWickPct:   0.003,       // wick mínimo 0.3%
  bufferBars:   0,           // sin buffer
  nyBiasFilter: true,        // filtro bias NY
  slPct:        0.010,       // SL 1%
  tpPct:        0.012,       // TP 1.2%
};

const ARB_PARAMS = {
  zEntry:       3.5,         // entrada en Z extremo
  lookback:     50,          // ventana Z-score (barras 15m)
  zSlOffset:    3.0,         // SL cuando Z se extiende aún más
  regimeFilter: true,        // solo entrar en régimen ranging
};

const COST = 0.001;          // 0.1% por trade (comisión + slippage)

// ─── UTILIDADES ────────────────────────────────────────────────────────────

function inNY(ts)     { const h = new Date(ts).getUTCHours(); return h >= 13 && h < 20; }
function inLondon(ts) { const h = new Date(ts).getUTCHours(); return h >= 7  && h < 13; }

// ─── TURTLE SOUP v1 ────────────────────────────────────────────────────────

function buildNYBiasMap(bars) {
  const biasMap = {};
  const byDay   = {};
  bars.forEach(b => {
    const day = new Date(b.time).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(b);
  });
  Object.entries(byDay).forEach(([day, dayBars]) => {
    const nyOpen = dayBars.filter(b => {
      const h = new Date(b.time).getUTCHours();
      return h >= 13 && h < 16;
    });
    if (nyOpen.length < 3) { biasMap[day] = 'NEUTRAL'; return; }
    const change = (nyOpen[nyOpen.length - 1].close - nyOpen[0].open) / nyOpen[0].open;
    biasMap[day] = change > 0.003 ? 'BULL' : change < -0.003 ? 'BEAR' : 'NEUTRAL';
  });
  return biasMap;
}

function detectSweep(bars, i, minWickPct) {
  const bar = bars[i];
  if (i < 20) return null;
  const prev    = bars.slice(i - 20, i);
  const high20  = Math.max(...prev.map(b => b.high));
  const low20   = Math.min(...prev.map(b => b.low));
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

function backtestTurtleSoup(bars, params) {
  const { session, minWickPct, bufferBars, nyBiasFilter, slPct, tpPct } = params;
  const nyBiasMap = buildNYBiasMap(bars);
  const trades    = [];
  let position    = null;
  let pending     = null;

  for (let i = 25; i < bars.length; i++) {
    const bar     = bars[i];
    const isNY    = inNY(bar.time);
    const isLon   = inLondon(bar.time);
    const inSess  = session === 'both' ? (isNY || isLon) : (session === 'ny' ? isNY : isLon);

    if (!inSess) {
      if (position) {
        const ret = position.dir === 'BUY'
          ? (bar.close - position.entry) / position.entry
          : (position.entry - bar.close) / position.entry;
        trades.push({ pnl: ret - COST, exitReason: 'SESSION_END',
                      entryTime: position.entryTime, system: 'TURTLE' });
        position = null;
      }
      pending = null;
      continue;
    }

    if (pending && !position) {
      const s = pending;
      if (bufferBars === 0 || (i - s.signalBar) >= bufferBars) {
        const confirmed = s.direction === 'BUY' ? bar.close > s.level : bar.close < s.level;
        if (confirmed) {
          position = { dir: s.direction, entry: bar.close, entryTime: bar.time };
        }
        pending = null;
      }
    }

    if (position) {
      const ret = position.dir === 'BUY'
        ? (bar.close - position.entry) / position.entry
        : (position.entry - bar.close) / position.entry;
      if (ret <= -slPct) {
        trades.push({ pnl: -slPct - COST, exitReason: 'STOP_LOSS',
                      entryTime: position.entryTime, system: 'TURTLE' });
        position = null; continue;
      }
      if (ret >= tpPct) {
        trades.push({ pnl: tpPct - COST, exitReason: 'TAKE_PROFIT',
                      entryTime: position.entryTime, system: 'TURTLE' });
        position = null; continue;
      }
      continue;
    }

    const sweep = detectSweep(bars, i, minWickPct);
    if (!sweep) continue;

    if (nyBiasFilter) {
      const day  = new Date(bar.time).toISOString().slice(0, 10);
      const bias = nyBiasMap[day] || 'NEUTRAL';
      if (bias !== 'NEUTRAL') {
        if (sweep.type === 'SSL' && bias === 'BEAR') continue;
        if (sweep.type === 'BSL' && bias === 'BULL') continue;
      }
    }

    if (bufferBars > 0) {
      pending = { ...sweep, signalBar: i };
    } else {
      position = { dir: sweep.direction, entry: bar.close, entryTime: bar.time };
    }
  }

  return trades;
}

// ─── ARBITRAGE v4 ──────────────────────────────────────────────────────────

function calcZScore(bars, i, lookback) {
  if (i < lookback) return 0;
  const closes = bars.slice(i - lookback, i).map(b => b.close);
  const mean   = closes.reduce((s, v) => s + v, 0) / closes.length;
  const std    = Math.sqrt(closes.reduce((s, v) => s + (v - mean) ** 2, 0) / closes.length);
  return std > 0 ? (bars[i].close - mean) / std : 0;
}

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
  const hi  = Math.max(...slice.map(b => b.high));
  const lo  = Math.min(...slice.map(b => b.low));
  const rng = hi - lo;
  if (rng === 0 || trSum === 0) return 50;
  return 100 * Math.log10(trSum / rng) / Math.log10(period);
}

function backtestArbitrage(bars, params) {
  const { zEntry, lookback, zSlOffset, regimeFilter } = params;
  const zSL     = zEntry + zSlOffset;
  const maxHold = 50;
  const trades  = [];
  let position  = null;

  for (let i = lookback + 20; i < bars.length; i++) {
    const bar = bars[i];

    if (position) {
      const z        = calcZScore(bars, i, lookback);
      const barsOpen = i - position.entryBar;
      const ret      = position.type === 'BUY'
        ? (bar.close - position.entry) / position.entry
        : (position.entry - bar.close) / position.entry;

      const invalid = (position.type === 'BUY'  && z <= -zSL) ||
                      (position.type === 'SELL' && z >=  zSL);
      if (invalid) {
        trades.push({ pnl: ret - COST, exitReason: 'Z_STOP',
                      entryTime: position.entryTime, system: 'ARBITRAGE' });
        position = null; continue;
      }

      const reverted = (position.type === 'BUY'  && z >= 0) ||
                       (position.type === 'SELL' && z <= 0);
      if (reverted) {
        trades.push({ pnl: ret - COST, exitReason: 'Z_NEUTRAL',
                      entryTime: position.entryTime, system: 'ARBITRAGE' });
        position = null; continue;
      }

      if (barsOpen >= maxHold) {
        trades.push({ pnl: ret - COST, exitReason: 'MAX_HOLD',
                      entryTime: position.entryTime, system: 'ARBITRAGE' });
        position = null;
      }
      continue;
    }

    if (regimeFilter) {
      const chop = calcChop(bars, i, 14);
      if (chop !== null && chop < 45) continue;
    }

    const z = calcZScore(bars, i, lookback);
    if (z <= -zEntry) {
      position = { type: 'BUY',  entry: bar.close, entryBar: i, entryTime: bar.time };
    } else if (z >= zEntry) {
      position = { type: 'SELL', entry: bar.close, entryBar: i, entryTime: bar.time };
    }
  }

  return trades;
}

// ─── MÉTRICAS ──────────────────────────────────────────────────────────────

function calcMetrics(trades, label) {
  if (!trades.length) return null;

  const wins  = trades.filter(t => t.pnl > 0);
  const loss  = trades.filter(t => t.pnl <= 0);
  const gw    = wins.reduce((s, t) => s + t.pnl, 0);
  const gl    = Math.abs(loss.reduce((s, t) => s + t.pnl, 0));
  const wr    = wins.length / trades.length;
  const pf    = gl > 0 ? gw / gl : Infinity;
  const avg   = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const total = trades.reduce((s, t) => s + t.pnl, 0);

  // Equity curve
  let equity = 0;
  let peak   = 0;
  let maxDD  = 0;
  const equityArr = [];
  for (const t of trades) {
    equity += t.pnl;
    equityArr.push(equity);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe (daily returns proxy: group by day)
  const byDay = {};
  for (const t of trades) {
    const day = new Date(t.entryTime).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = 0;
    byDay[day] += t.pnl;
  }
  const dailyRets = Object.values(byDay);
  const meanD     = dailyRets.reduce((s, v) => s + v, 0) / dailyRets.length;
  const stdD      = Math.sqrt(dailyRets.reduce((s, v) => s + (v - meanD) ** 2, 0) / dailyRets.length);
  const sharpe    = stdD > 0 ? (meanD / stdD) * Math.sqrt(252) : 0;

  // Sortino (only downside deviation)
  const downside  = dailyRets.filter(r => r < 0);
  const stdDown   = downside.length > 0
    ? Math.sqrt(downside.reduce((s, v) => s + v * v, 0) / downside.length)
    : stdD;
  const sortino   = stdDown > 0 ? (meanD / stdDown) * Math.sqrt(252) : 0;

  // CAGR (asumiendo 4 años de datos)
  const years = 4;
  const cagr  = Math.pow(1 + total, 1 / years) - 1;

  // Calmar
  const calmar = maxDD > 0 ? (cagr / maxDD) : 0;

  // Kelly fraction
  const avgWin  = wins.length > 0 ? gw / wins.length : 0;
  const avgLoss = loss.length > 0 ? gl / loss.length : 0.001;
  const kelly   = (wr - (1 - wr) / (avgWin / avgLoss));

  return {
    label, trades: trades.length, wr, pf, avg, total,
    maxDD, sharpe, sortino, cagr, calmar, kelly,
    equityArr, dailyRets, byDay,
  };
}

function calcCorrelation(retsByDay1, retsByDay2) {
  // Unión de días con actividad en cualquier sistema
  const allDays = new Set([...Object.keys(retsByDay1), ...Object.keys(retsByDay2)]);
  const r1 = [], r2 = [];
  for (const day of allDays) {
    r1.push(retsByDay1[day] || 0);
    r2.push(retsByDay2[day] || 0);
  }
  const m1 = r1.reduce((s, v) => s + v, 0) / r1.length;
  const m2 = r2.reduce((s, v) => s + v, 0) / r2.length;
  const cov  = r1.reduce((s, v, i) => s + (v - m1) * (r2[i] - m2), 0) / r1.length;
  const std1 = Math.sqrt(r1.reduce((s, v) => s + (v - m1) ** 2, 0) / r1.length);
  const std2 = Math.sqrt(r2.reduce((s, v) => s + (v - m2) ** 2, 0) / r2.length);
  return (std1 > 0 && std2 > 0) ? cov / (std1 * std2) : 0;
}

function monthlyReturns(trades) {
  const byMonth = {};
  for (const t of trades) {
    const ym = new Date(t.entryTime).toISOString().slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = 0;
    byMonth[ym] += t.pnl;
  }
  return byMonth;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  const dataFile = path.join('data', 'BTCUSDT_15m_4y.csv');
  if (!fs.existsSync(dataFile)) {
    console.log('Falta BTCUSDT_15m_4y.csv'); process.exit(1);
  }

  console.log('Cargando BTCUSDT 15m 4 anos...');
  const bars = loadCSV(dataFile);
  console.log(`  ${bars.length.toLocaleString()} barras | ${new Date(bars[0].time).toISOString().slice(0,10)} -> ${new Date(bars[bars.length-1].time).toISOString().slice(0,10)}`);

  // Correr ambos sistemas
  console.log('\nEjecutando sistemas...');
  const turtleTrades = backtestTurtleSoup(bars, TURTLE_PARAMS);
  const arbTrades    = backtestArbitrage(bars, ARB_PARAMS);
  console.log(`  Turtle Soup: ${turtleTrades.length} trades`);
  console.log(`  Arbitrage:   ${arbTrades.length} trades`);

  // Calcular métricas individuales
  const mTurtle = calcMetrics(turtleTrades, 'Turtle Soup v1');
  const mArb    = calcMetrics(arbTrades,    'Arbitrage v4');

  // Portfolio combinado (50/50, igual sizing)
  const allTrades = [...turtleTrades, ...arbTrades]
    .sort((a, b) => a.entryTime - b.entryTime);
  const mPortfolio = calcMetrics(allTrades, 'Portfolio Combinado');

  // Correlación
  const corr = calcCorrelation(mTurtle.byDay, mArb.byDay);

  // Monthly returns
  const monthlyT = monthlyReturns(turtleTrades);
  const monthlyA = monthlyReturns(arbTrades);
  const monthlyP = monthlyReturns(allTrades);

  // ─── OUTPUT ──────────────────────────────────────────────────────────────

  console.log('\n');
  console.log('='.repeat(65));
  console.log('PORTFOLIO MANAGER — Turtle Soup v1 + Arbitrage v4');
  console.log('='.repeat(65));
  console.log('\nPARAMETROS:');
  console.log('  Turtle:    session=both | wick>=0.3% | SL=1% | TP=1.2% | nyBias=true');
  console.log('  Arbitrage: zEntry=3.5 | lookback=50 | zSL+3.0 | chop>=45');

  console.log('\n' + '-'.repeat(65));
  console.log('SISTEMA INDIVIDUAL');
  console.log('-'.repeat(65));
  for (const m of [mTurtle, mArb, mPortfolio]) {
    if (!m) continue;
    console.log(`\n  ${m.label}`);
    console.log(`    Trades      : ${m.trades}`);
    console.log(`    Win Rate    : ${(m.wr * 100).toFixed(2)}%`);
    console.log(`    Profit Factor: ${m.pf.toFixed(3)}`);
    console.log(`    Avg Trade   : ${(m.avg * 100).toFixed(4)}%`);
    console.log(`    Total PnL   : ${(m.total * 100).toFixed(2)}%`);
    console.log(`    CAGR (4y)   : ${(m.cagr * 100).toFixed(2)}%`);
    console.log(`    Max DD      : ${(m.maxDD * 100).toFixed(2)}%`);
    console.log(`    Sharpe      : ${m.sharpe.toFixed(3)}`);
    console.log(`    Sortino     : ${m.sortino.toFixed(3)}`);
    console.log(`    Calmar      : ${m.calmar.toFixed(3)}`);
    console.log(`    Kelly f     : ${(m.kelly * 100).toFixed(1)}%`);
  }

  console.log('\n' + '-'.repeat(65));
  console.log('CORRELACION ENTRE SISTEMAS');
  console.log('-'.repeat(65));
  console.log(`  Turtle vs Arbitrage: r = ${corr.toFixed(3)}`);
  if (Math.abs(corr) < 0.3) {
    console.log('  BAJA correlacion — diversificacion efectiva');
  } else if (Math.abs(corr) < 0.6) {
    console.log('  MODERADA correlacion — diversificacion parcial');
  } else {
    console.log('  ALTA correlacion — poco beneficio de diversificacion');
  }

  // Diversification benefit: reduccion de volatilidad
  const stdTurtle = calcStd(mTurtle.dailyRets);
  const stdArb    = calcStd(mArb.dailyRets);
  const stdPortfolio = calcStd(calcPortfolioDailyRets(mTurtle.byDay, mArb.byDay));
  const expectedStd  = 0.5 * Math.sqrt(stdTurtle**2 + stdArb**2 + 2*corr*stdTurtle*stdArb);
  console.log(`\n  Vol Turtle     : ${(stdTurtle * Math.sqrt(252) * 100).toFixed(2)}% anual`);
  console.log(`  Vol Arbitrage  : ${(stdArb    * Math.sqrt(252) * 100).toFixed(2)}% anual`);
  console.log(`  Vol Portfolio  : ${(stdPortfolio * Math.sqrt(252) * 100).toFixed(2)}% anual`);
  console.log(`  Vol reducida   : ${((1 - stdPortfolio/Math.max(stdTurtle,stdArb)) * 100).toFixed(1)}% vs el mejor individual`);

  console.log('\n' + '-'.repeat(65));
  console.log('MONTHLY RETURNS PORTFOLIO (% acumulado por mes)');
  console.log('-'.repeat(65));
  const months = Object.keys(monthlyP).sort();
  let cumulative = 0;
  let posMonths = 0, negMonths = 0;
  for (const m of months) {
    cumulative += monthlyP[m];
    const pct   = (monthlyP[m] * 100).toFixed(2).padStart(7);
    const cum   = (cumulative * 100).toFixed(2).padStart(8);
    const flag  = monthlyP[m] > 0 ? '+' : '-';
    if (monthlyP[m] > 0) posMonths++; else negMonths++;
    console.log(`  ${m}  ${flag}${pct}%   cum: ${cum}%`);
  }
  console.log(`\n  Meses positivos: ${posMonths} | Meses negativos: ${negMonths} | Ratio: ${(posMonths/(posMonths+negMonths)*100).toFixed(0)}%`);

  console.log('\n' + '-'.repeat(65));
  console.log('SIZING RECOMENDADO (Kelly fraccionado)');
  console.log('-'.repeat(65));
  const kellyT  = Math.max(0, mTurtle.kelly);
  const kellyA  = Math.max(0, mArb.kelly);
  const halfKT  = (kellyT / 2 * 100).toFixed(1);
  const halfKA  = (kellyA / 2 * 100).toFixed(1);
  console.log(`  Turtle Soup  Kelly full: ${(kellyT*100).toFixed(1)}% | Half-Kelly: ${halfKT}%`);
  console.log(`  Arbitrage v4 Kelly full: ${(kellyA*100).toFixed(1)}% | Half-Kelly: ${halfKA}%`);
  console.log(`  Recomendado: usar Half-Kelly para cada sistema`);
  console.log(`    Turtle  : ${halfKT}% del capital por trade`);
  console.log(`    Arbitrage: ${halfKA}% del capital por trade`);

  console.log('\n' + '='.repeat(65));
  console.log('RESUMEN EJECUTIVO');
  console.log('='.repeat(65));
  console.log(`  Portfolio 4y PnL : ${(mPortfolio.total * 100).toFixed(2)}%`);
  console.log(`  CAGR             : ${(mPortfolio.cagr * 100).toFixed(2)}% anual`);
  console.log(`  Sharpe           : ${mPortfolio.sharpe.toFixed(3)}`);
  console.log(`  Max Drawdown     : ${(mPortfolio.maxDD * 100).toFixed(2)}%`);
  console.log(`  Calmar (CAGR/DD) : ${mPortfolio.calmar.toFixed(3)}`);
  console.log(`  Trades totales   : ${mPortfolio.trades}`);
  console.log(`  Correlacion r    : ${corr.toFixed(3)}`);

  // Guardar resultados
  const output = {
    fecha: new Date().toISOString(),
    params: { turtle: TURTLE_PARAMS, arbitrage: ARB_PARAMS },
    turtle:    serializeMetrics(mTurtle),
    arbitrage: serializeMetrics(mArb),
    portfolio: serializeMetrics(mPortfolio),
    correlation: corr,
    monthlyPortfolio: monthlyP,
    sizing: {
      turtleHalfKelly: parseFloat(halfKT),
      arbitrageHalfKelly: parseFloat(halfKA),
    },
  };

  const outPath = path.join('results', 'portfolio_combined.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nResultados guardados: ${outPath}`);
}

function calcStd(arr) {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

function calcPortfolioDailyRets(d1, d2) {
  const allDays = new Set([...Object.keys(d1), ...Object.keys(d2)]);
  const rets = [];
  for (const day of allDays) {
    rets.push((d1[day] || 0) + (d2[day] || 0));
  }
  return rets;
}

function serializeMetrics(m) {
  if (!m) return null;
  return {
    trades: m.trades, wr: m.wr, pf: m.pf, avg: m.avg,
    totalPnl: m.total, cagr: m.cagr, maxDD: m.maxDD,
    sharpe: m.sharpe, sortino: m.sortino, calmar: m.calmar, kelly: m.kelly,
  };
}

main().catch(console.error);
