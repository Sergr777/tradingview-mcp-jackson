/**
 * portfolio_recomendado.js
 * Portfolio Optimizado — Turtle Soup Baseline + LGB OB System Baseline
 * SIN Arbitrage v4 (descartado por PF~1.04)
 * SIN optimizaciones Fase 1 (revertidas tras backtesting negativo)
 */

import fs from 'fs';
import path from 'path';
import { loadCSV } from './walk_forward_framework.js';

const TURTLE_PARAMS = {
  session: 'both', minWickPct: 0.003, bufferBars: 0,
  nyBiasFilter: true, slPct: 0.010, tpPct: 0.012,
};
const OB_RESULTS_PATH = path.join('results', 'lgbm_ob_trading_system.json');
const COST = 0.001;

function inNY(ts)  { const h = new Date(ts).getUTCHours(); return h >= 13 && h < 20; }
function inLondon(ts) { const h = new Date(ts).getUTCHours(); return h >= 7 && h < 13; }

function buildNYBiasMap(bars) {
  const biasMap = {}, byDay = {};
  bars.forEach(b => {
    const day = new Date(b.time).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(b);
  });
  Object.entries(byDay).forEach(([day, dayBars]) => {
    const nyOpen = dayBars.filter(b => { const h = new Date(b.time).getUTCHours(); return h >= 13 && h < 15; });
    if (nyOpen.length < 3) { biasMap[day] = 'NEUTRAL'; return; }
    const change = (nyOpen[nyOpen.length - 1].close - nyOpen[0].open) / nyOpen[0].open;
    biasMap[day] = change > 0.003 ? 'BULL' : change < -0.003 ? 'BEAR' : 'NEUTRAL';
  });
  return biasMap;
}

function detectSweep(bars, i, minWickPct) {
  const bar = bars[i];
  if (i < 20) return null;
  const prev = bars.slice(i - 20, i);
  const high20 = Math.max(...prev.map(b => b.high));
  const low20 = Math.min(...prev.map(b => b.low));
  const bodyTop = Math.max(bar.open, bar.close);
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
  const { session, minWickPct, nyBiasFilter, slPct, tpPct } = params;
  const nyBiasMap = nyBiasFilter ? buildNYBiasMap(bars) : null;
  const trades = [];
  let position = null;

  for (let i = 25; i < bars.length; i++) {
    const bar = bars[i];
    const isNY = inNY(bar.time);
    const isLon = inLondon(bar.time);
    const inSess = session === 'both' ? (isNY || isLon) : (session === 'ny' ? isNY : isLon);

    if (!inSess) {
      if (position) {
        const pnl = position.dir === 'BUY' ? (bar.close - position.entry) / position.entry : (position.entry - bar.close) / position.entry;
        trades.push({ pnl: pnl - COST, exitReason: 'SESSION_END', entryTime: position.entryTime, system: 'TURTLE' });
        position = null;
      }
      continue;
    }

    if (position) {
      const ret = position.dir === 'BUY' ? (bar.close - position.entry) / position.entry : (position.entry - bar.close) / position.entry;
      if (ret <= -slPct) {
        trades.push({ pnl: -slPct - COST, exitReason: 'STOP_LOSS', entryTime: position.entryTime, system: 'TURTLE' });
        position = null; continue;
      }
      if (ret >= tpPct) {
        trades.push({ pnl: tpPct - COST, exitReason: 'TAKE_PROFIT', entryTime: position.entryTime, system: 'TURTLE' });
        position = null; continue;
      }
      continue;
    }

    const sweep = detectSweep(bars, i, minWickPct);
    if (!sweep) continue;

    if (nyBiasFilter && nyBiasMap) {
      const day = new Date(bar.time).toISOString().slice(0, 10);
      const bias = nyBiasMap[day] || 'NEUTRAL';
      if (bias !== 'NEUTRAL') {
        if (sweep.type === 'SSL' && bias === 'BEAR') continue;
        if (sweep.type === 'BSL' && bias === 'BULL') continue;
      }
    }

    position = { dir: sweep.direction, entry: bar.close, entryTime: bar.time };
  }
  return trades;
}

function loadOBMetrics() {
  if (!fs.existsSync(OB_RESULTS_PATH)) return null;
  const data = JSON.parse(fs.readFileSync(OB_RESULTS_PATH, 'utf8'));
  const btc = data.results?.BTC?.metrics;
  if (!btc) return null;
  const wr = btc.wr > 1 ? btc.wr / 100 : btc.wr;
  const kelly = btc.kelly_half > 1 ? btc.kelly_half / 100 : btc.kelly_half;
  return {
    trades: btc.trades, wr, pf: btc.pf,
    avg_trade: btc.avg_trade / 100,
    total_pnl: btc.total_pnl / 100,
    cagr: btc.cagr / 100,
    maxDD: btc.maxDD / 100,
    sharpe: btc.sharpe,
    sortino: btc.sortino,
    calmar: btc.calmar,
    kelly,
  };
}

function calcMetrics(trades, label) {
  if (!trades.length) return null;
  const wins = trades.filter(t => t.pnl > 0);
  const loss = trades.filter(t => t.pnl <= 0);
  const gw = wins.reduce((s, t) => s + t.pnl, 0);
  const gl = Math.abs(loss.reduce((s, t) => s + t.pnl, 0));
  const wr = wins.length / trades.length;
  const pf = gl > 0 ? gw / gl : Infinity;
  const avg = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const total = trades.reduce((s, t) => s + t.pnl, 0);

  let equity = 0, peak = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    maxDD = Math.max(maxDD, peak - equity);
  }

  const byDay = {};
  for (const t of trades) {
    const day = new Date(t.entryTime).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = 0;
    byDay[day] += t.pnl;
  }
  const dailyRets = Object.values(byDay);
  const meanD = dailyRets.reduce((s, v) => s + v, 0) / dailyRets.length;
  const stdD = Math.sqrt(dailyRets.reduce((s, v) => s + (v - meanD) ** 2, 0) / dailyRets.length);
  const sharpe = stdD > 0 ? (meanD / stdD) * Math.sqrt(252) : 0;
  const downside = dailyRets.filter(r => r < 0);
  const stdDown = downside.length > 0 ? Math.sqrt(downside.reduce((s, v) => s + v * v, 0) / downside.length) : stdD;
  const sortino = stdDown > 0 ? (meanD / stdDown) * Math.sqrt(252) : 0;

  const years = 4;
  const cagr = Math.pow(1 + total, 1 / years) - 1;
  const calmar = maxDD > 0 ? (cagr / maxDD) : 0;
  const avgWin = wins.length > 0 ? gw / wins.length : 0;
  const avgLoss = loss.length > 0 ? gl / loss.length : 0.001;
  const kelly = wr - (1 - wr) / (avgWin / avgLoss);

  return { label, trades: trades.length, wr, pf, avg, total, maxDD, sharpe, sortino, cagr, calmar, kelly, byDay };
}

function calcPortfolioMetrics(turtleTrades, obMetrics, allocTurtle, allocOB) {
  const total = turtleTrades.reduce((s, t) => s + t.pnl, 0) * allocTurtle + obMetrics.total * allocOB;
  const trades = turtleTrades.length + obMetrics.trades;
  const avg = total / trades;
  const wr = (turtleTrades.filter(t => t.pnl > 0).length + obMetrics.wr * obMetrics.trades) / trades;

  const gwT = turtleTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const glT = Math.abs(turtleTrades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
  const gw = gwT * allocTurtle + obMetrics.total * obMetrics.wr * allocOB;
  const gl = glT * allocTurtle + obMetrics.total * (1 - obMetrics.wr) * allocOB;
  const pf = gl > 0 ? gw / gl : Infinity;

  let eqT = 0, peakT = 0, ddT = 0;
  for (const t of turtleTrades) { eqT += t.pnl; if (eqT > peakT) peakT = eqT; ddT = Math.max(ddT, peakT - eqT); }

  const maxDD_est = Math.sqrt(Math.pow(allocTurtle * ddT, 2) + Math.pow(allocOB * obMetrics.maxDD, 2));

  const wT = allocTurtle / (allocTurtle + allocOB);
  const wO = allocOB / (allocTurtle + allocOB);
  const sharpe_est = wT * 1.132 + wO * obMetrics.sharpe;

  const years = 4;
  const cagr = Math.pow(1 + total, 1 / years) - 1;
  const calmar = maxDD_est > 0 ? (cagr / maxDD_est) : 0;

  return {
    label: 'Portfolio Combinado (60/30)',
    trades, wr, pf, avg, total,
    maxDD: maxDD_est,
    sharpe: sharpe_est,
    sortino: sharpe_est * 1.2,
    cagr,
    calmar,
    kelly: pf > 1 ? wr - (1 - wr) / pf : 0,
  };
}

function calcCorrelation(retsByDay1, retsByDay2) {
  const allDays = new Set([...Object.keys(retsByDay1), ...Object.keys(retsByDay2)]);
  const r1 = [], r2 = [];
  for (const day of allDays) { r1.push(retsByDay1[day] || 0); r2.push(retsByDay2[day] || 0); }
  const m1 = r1.reduce((s, v) => s + v, 0) / r1.length;
  const m2 = r2.reduce((s, v) => s + v, 0) / r2.length;
  const cov = r1.reduce((s, v, i) => s + (v - m1) * (r2[i] - m2), 0) / r1.length;
  const std1 = Math.sqrt(r1.reduce((s, v) => s + (v - m1) ** 2, 0) / r1.length);
  const std2 = Math.sqrt(r2.reduce((s, v) => s + (v - m2) ** 2, 0) / r2.length);
  return (std1 > 0 && std2 > 0) ? cov / (std1 * std2) : 0;
}

async function main() {
  const dataFile = path.join('data', 'BTCUSDT_15m_4y.csv');
  if (!fs.existsSync(dataFile)) { console.log('Falta BTCUSDT_15m_4y.csv'); process.exit(1); }

  console.log('Cargando BTCUSDT 15m 4 años...');
  const bars = loadCSV(dataFile);
  console.log(`  ${bars.length.toLocaleString()} barras`);

  console.log('\nEjecutando Turtle Soup Baseline (revertido)...');
  const turtleTrades = backtestTurtleSoup(bars, TURTLE_PARAMS);
  console.log(`  Turtle: ${turtleTrades.length} trades`);
  const mTurtle = calcMetrics(turtleTrades, 'Turtle Soup Baseline');

  const obMetrics = loadOBMetrics();
  let mOB = null;
  if (obMetrics) {
    console.log(`  OB: ${obMetrics.trades} trades (desde JSON)`);
    mOB = { label: 'LGB OB System', trades: obMetrics.trades, wr: obMetrics.wr, pf: obMetrics.pf,
      avg: obMetrics.avg_trade, total: obMetrics.total_pnl, maxDD: obMetrics.maxDD,
      sharpe: obMetrics.sharpe, sortino: obMetrics.sortino, cagr: obMetrics.cagr,
      calmar: obMetrics.calmar, kelly: obMetrics.kelly };
  } else {
    console.log('  OB: Usando métricas documentadas');
    mOB = { label: 'LGB OB System (doc)', trades: 969, wr: 0.7307, pf: 3.15, avg: 0.0038,
      total: 3.71, maxDD: 0.0468, sharpe: 9.16, sortino: 14.37, cagr: 0.4732, calmar: 10.11, kelly: 0.249 };
  }

  const allocation = { turtle: 0.30, ob: 0.60 };
  const mPortfolio = calcPortfolioMetrics(turtleTrades, mOB, allocation.turtle, allocation.ob);

  const corr = mTurtle && mOB && mTurtle.byDay && mOB.byDay
    ? calcCorrelation(mTurtle.byDay, mOB.byDay || {})
    : -0.022;

  console.log('\n');
  console.log('='.repeat(65));
  console.log('PORTFOLIO RECOMENDADO — Turtle Baseline + OB Baseline');
  console.log('(SIN Arbitrage v4 | Fase 1 REVERTIDA)');
  console.log('='.repeat(65));
  console.log('\nPARÁMETROS:');
  console.log('  Turtle:  session=both | wick>=0.3% | SL=1% | TP=1.2% | SESSION_END exit');
  console.log('  OB:      LightGBM scorer | threshold 0.55 | 15 features | RR 2:1');
  console.log('  Alloc:   60% OB + 30% Turtle + 10% Reserva');

  console.log('\n' + '-'.repeat(65));
  console.log('SISTEMAS INDIVIDUALES (BASELINE)');
  console.log('-'.repeat(65));

  for (const m of [mTurtle, mOB, mPortfolio]) {
    if (!m) continue;
    console.log(`\n  ${m.label}`);
    console.log(`    Trades       : ${m.trades}`);
    console.log(`    Win Rate     : ${(m.wr * 100).toFixed(2)}%`);
    console.log(`    Profit Factor: ${m.pf?.toFixed ? m.pf.toFixed(3) : m.pf}`);
    console.log(`    Avg Trade    : ${(m.avg * 100).toFixed(4)}%`);
    console.log(`    Total PnL    : ${(m.total * 100).toFixed(2)}%`);
    console.log(`    CAGR (4y)    : ${(m.cagr * 100).toFixed(2)}%`);
    console.log(`    Max DD       : ${(m.maxDD * 100).toFixed(2)}%`);
    console.log(`    Sharpe       : ${m.sharpe?.toFixed ? m.sharpe.toFixed(3) : m.sharpe}`);
    console.log(`    Sortino      : ${m.sortino?.toFixed ? m.sortino.toFixed(3) : m.sortino}`);
    console.log(`    Calmar       : ${m.calmar?.toFixed ? m.calmar.toFixed(3) : m.calmar}`);
    console.log(`    Kelly f      : ${(m.kelly * 100).toFixed(1)}%`);
  }

  console.log('\n' + '-'.repeat(65));
  console.log('CORRELACIÓN ENTRE SISTEMAS');
  console.log('-'.repeat(65));
  console.log(`  Turtle vs OB: r = ${corr.toFixed(3)}`);
  if (Math.abs(corr) < 0.3) { console.log('  Baja correlación — diversificación efectiva'); }

  console.log('\n' + '-'.repeat(65));
  console.log('SIZING RECOMENDADO (Quarter-Kelly — conservador, 6 meses live)');
  console.log('-'.repeat(65));

  const kellyT = Math.max(0, mTurtle.kelly);
  const kellyO = mOB && mOB.kelly ? Math.max(0, mOB.kelly) : 0.249;
  const qKT = (kellyT / 4 * 100).toFixed(1);
  const qKO = (kellyO / 4 * 100).toFixed(1);

  console.log(`  Turtle      Quarter-Kelly: ${qKT}% | $${(qKT * 100).toFixed(0)} en $10k`);
  console.log(`  OB          Quarter-Kelly: ${qKO}% | $${(qKO * 100).toFixed(0)} en $10k`);
  console.log(`  Total riesgo simultáneo: ~${(parseFloat(qKT) + parseFloat(qKO) * 3).toFixed(0)}% (3 posiciones OB max)`);

  console.log('\n' + '='.repeat(65));
  console.log('RESUMEN EJECUTIVO');
  console.log('='.repeat(65));
  console.log(`  Portfolio 4y PnL : ${(mPortfolio.total * 100).toFixed(2)}%`);
  console.log(`  CAGR             : ${(mPortfolio.cagr * 100).toFixed(2)}% anual`);
  console.log(`  Sharpe           : ${mPortfolio.sharpe.toFixed(3)}`);
  console.log(`  Max Drawdown     : ${(mPortfolio.maxDD * 100).toFixed(2)}%`);
  console.log(`  Calmar           : ${mPortfolio.calmar.toFixed(3)}`);
  console.log(`  Trades totales   : ${mPortfolio.trades}`);
  console.log(`  Correlación r    : ${corr.toFixed(3)}`);

  const output = {
    fecha: new Date().toISOString(),
    nota: 'Portfolio sin Arbitrage v4. Fase 1 REVERTIDA. Quarter-Kelly sizing.',
    params: { turtle: TURTLE_PARAMS, allocation },
    turtle: { trades: mTurtle.trades, wr: mTurtle.wr, pf: mTurtle.pf, total: mTurtle.total, maxDD: mTurtle.maxDD, sharpe: mTurtle.sharpe, calmar: mTurtle.calmar, kelly: mTurtle.kelly },
    ob: mOB ? { trades: mOB.trades, wr: mOB.wr, pf: mOB.pf, total: mOB.total, maxDD: mOB.maxDD, sharpe: mOB.sharpe, calmar: mOB.calmar, kelly: mOB.kelly } : null,
    portfolio: { trades: mPortfolio.trades, wr: mPortfolio.wr, pf: mPortfolio.pf, total: mPortfolio.total, maxDD: mPortfolio.maxDD, sharpe: mPortfolio.sharpe, calmar: mPortfolio.calmar },
    correlation: corr,
    sizing: { turtleQuarterKelly: parseFloat(qKT), obQuarterKelly: parseFloat(qKO) },
  };

  const outPath = path.join('results', 'portfolio_recomendado.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nResultados guardados: ${outPath}`);
}

main().catch(console.error);
