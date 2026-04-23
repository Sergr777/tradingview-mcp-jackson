/**
 * walk_forward_framework.js
 * Framework genérico de Walk-Forward Analysis (WFA)
 *
 * Arquitectura:
 *   - Rolling windows: Optimizar en año N, testear en año N+1
 *   - 4 ventanas: 2022→2023, 2023→2024, 2024→2025, 2025→2026
 *   - Por cada ventana: grid search → mejor config → test out-of-sample
 *   - Output: WR real, estabilidad de parámetros, equity out-of-sample
 */

import fs from 'fs';
import path from 'path';

// ─── CONFIGURACIÓN WFA ───────────────────────────────────────────────────────

export const WFA_CONFIG = {
  // Ventanas rolling: [inicio_train, fin_train = inicio_test, fin_test]
  windows: [
    { id: 'W1', trainStart: '2022-01-01', trainEnd: '2023-01-01', testEnd: '2024-01-01' },
    { id: 'W2', trainStart: '2023-01-01', trainEnd: '2024-01-01', testEnd: '2025-01-01' },
    { id: 'W3', trainStart: '2024-01-01', trainEnd: '2025-01-01', testEnd: '2026-01-01' },
    { id: 'W4', trainStart: '2025-01-01', trainEnd: '2026-01-01', testEnd: '2026-04-17' },
  ],

  // Criterios de aprobación
  minWR:        0.53,   // WR mínimo OUT-OF-SAMPLE (más conservador que in-sample)
  minTrades:    30,     // mínimo de trades en período de test
  minPF:        1.10,
  maxDD:        0.10,   // 10% DD máximo

  // Scoring: combina WR, PF y trades
  score: (wr, pf, trades, dd) => {
    if (wr < 0.53 || trades < 30 || pf < 1.1) return 0;
    return wr * 0.5 + Math.min(pf / 3, 0.3) + Math.min(trades / 500, 0.15) - dd * 0.05;
  }
};

// ─── UTILIDADES DE DATOS ─────────────────────────────────────────────────────

export function loadCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  return lines.slice(1).map(line => {
    const [time, open, high, low, close, volume] = line.split(',');
    return {
      time: parseInt(time),
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseFloat(volume),
    };
  }).filter(b => !isNaN(b.close));
}

export function slicePeriod(bars, startDate, endDate) {
  const startTs = new Date(startDate).getTime();
  const endTs   = new Date(endDate).getTime();
  return bars.filter(b => b.time >= startTs && b.time < endTs);
}

// ─── MÉTRICAS ────────────────────────────────────────────────────────────────

export function calcMetrics(trades) {
  if (!trades || trades.length === 0) return null;

  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);

  const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // Max drawdown
  let peak = 0, equity = 0, maxDD = 0;
  trades.forEach(t => {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / (peak || 1);
    if (dd > maxDD) maxDD = dd;
  });

  const winRate = wins.length / trades.length;
  const pf      = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;
  const avgTrade = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;

  // Sharpe simplificado (daily returns)
  const dailyPnls = {};
  trades.forEach(t => {
    const day = new Date(t.entryTime).toISOString().slice(0, 10);
    dailyPnls[day] = (dailyPnls[day] || 0) + t.pnl;
  });
  const returns = Object.values(dailyPnls);
  const avgR = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdR = Math.sqrt(returns.reduce((s, r) => s + (r - avgR) ** 2, 0) / returns.length);
  const sharpe = stdR > 0 ? (avgR / stdR) * Math.sqrt(252) : 0;

  return {
    trades:   trades.length,
    winRate:  parseFloat((winRate * 100).toFixed(2)),
    pf:       parseFloat(pf.toFixed(3)),
    sharpe:   parseFloat(sharpe.toFixed(3)),
    maxDD:    parseFloat((maxDD * 100).toFixed(2)),
    totalPnl: parseFloat(trades.reduce((s, t) => s + t.pnl, 0).toFixed(4)),
    avgTrade: parseFloat(avgTrade.toFixed(4)),
  };
}

// ─── MOTOR WFA ───────────────────────────────────────────────────────────────

export class WalkForwardAnalyzer {
  constructor(systemName, paramGrid, backtestFn) {
    this.systemName  = systemName;
    this.paramGrid   = paramGrid;   // array de objetos de parámetros
    this.backtestFn  = backtestFn;  // fn(bars, params) → trades[]
    this.results     = [];
  }

  // Genera todas las combinaciones del grid
  expandGrid(grid) {
    const keys = Object.keys(grid);
    const combinations = [{}];
    keys.forEach(key => {
      const newCombinations = [];
      grid[key].forEach(val => {
        combinations.forEach(combo => {
          newCombinations.push({ ...combo, [key]: val });
        });
      });
      combinations.length = 0;
      combinations.push(...newCombinations);
    });
    return combinations;
  }

  // Optimiza sobre datos de entrenamiento
  optimize(trainBars) {
    const combinations = Array.isArray(this.paramGrid)
      ? this.paramGrid
      : this.expandGrid(this.paramGrid);

    let best = null;
    let bestScore = -Infinity;

    combinations.forEach((params, i) => {
      if (i % 100 === 0) process.stdout.write(`\r    Grid search: ${i}/${combinations.length}...`);

      const trades = this.backtestFn(trainBars, params);
      if (!trades || trades.length < WFA_CONFIG.minTrades) return;

      const m = calcMetrics(trades);
      if (!m) return;

      const score = WFA_CONFIG.score(m.winRate / 100, m.pf, m.trades, m.maxDD / 100);
      if (score > bestScore) {
        bestScore = score;
        best = { params, metrics: m, score };
      }
    });

    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    return best;
  }

  // Ejecuta WFA completo
  async run(allBars) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 WALK-FORWARD: ${this.systemName}`);
    console.log(`${'='.repeat(60)}`);

    const windowResults = [];

    for (const win of WFA_CONFIG.windows) {
      console.log(`\n📅 Ventana ${win.id}: Train [${win.trainStart} → ${win.trainEnd}] | Test [${win.trainEnd} → ${win.testEnd}]`);

      const trainBars = slicePeriod(allBars, win.trainStart, win.trainEnd);
      const testBars  = slicePeriod(allBars, win.trainEnd,  win.testEnd);

      if (trainBars.length < 500) {
        console.log(`    ⚠️  Datos insuficientes: ${trainBars.length} barras de entrenamiento`);
        continue;
      }

      console.log(`    📊 Train: ${trainBars.length} barras | Test: ${testBars.length} barras`);

      // Optimización en datos de entrenamiento
      console.log(`    🔍 Optimizando parámetros...`);
      const best = this.optimize(trainBars);

      if (!best) {
        console.log(`    ❌ No se encontró configuración válida en train`);
        windowResults.push({ window: win, status: 'NO_CONFIG' });
        continue;
      }

      console.log(`    ✅ Mejor config in-sample: WR ${best.metrics.winRate}% | PF ${best.metrics.pf} | ${best.metrics.trades} trades`);

      // Test out-of-sample con los mejores parámetros
      const testTrades  = this.backtestFn(testBars, best.params);
      const testMetrics = testTrades ? calcMetrics(testTrades) : null;

      if (!testMetrics) {
        console.log(`    ❌ Sin trades en período de test`);
        windowResults.push({ window: win, status: 'NO_TEST_TRADES', bestParams: best.params, inSample: best.metrics });
        continue;
      }

      const approved = testMetrics.winRate >= WFA_CONFIG.minWR * 100 &&
                       testMetrics.trades  >= WFA_CONFIG.minTrades &&
                       testMetrics.pf      >= WFA_CONFIG.minPF;

      console.log(`    📈 Out-of-sample: WR ${testMetrics.winRate}% | PF ${testMetrics.pf} | ${testMetrics.trades} trades | ${approved ? '✅ APROBADO' : '❌ RECHAZADO'}`);

      windowResults.push({
        window:     win,
        status:     approved ? 'APPROVED' : 'REJECTED',
        bestParams: best.params,
        inSample:   best.metrics,
        outSample:  testMetrics,
        wfRatio:    testMetrics.winRate / best.metrics.winRate, // 1.0 = perfecto, < 0.9 = overfitting
        approved,
      });
    }

    // Análisis de resultados
    this.results = windowResults;
    this.printSummary(windowResults);

    return windowResults;
  }

  printSummary(results) {
    const valid = results.filter(r => r.outSample);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📋 RESUMEN WFA — ${this.systemName}`);
    console.log(`${'─'.repeat(60)}`);

    if (valid.length === 0) {
      console.log('  Sin ventanas válidas con out-of-sample.');
      return;
    }

    console.log(`  Ventana | In-Sample WR | Out-Sample WR | WF Ratio | Estado`);
    console.log(`  ${'─'.repeat(55)}`);
    results.forEach(r => {
      if (!r.outSample) {
        console.log(`  ${r.window.id}      | N/A          | N/A           | N/A      | ${r.status}`);
        return;
      }
      const wfr = r.wfRatio.toFixed(3);
      const overfitWarning = r.wfRatio < 0.90 ? ' ⚠️ overfit' : '';
      console.log(`  ${r.window.id}      | ${String(r.inSample.winRate+'%').padEnd(12)} | ${String(r.outSample.winRate+'%').padEnd(13)} | ${wfr}    | ${r.status}${overfitWarning}`);
    });

    const avgOOSWR = valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length;
    const avgISWR  = valid.reduce((s, r) => s + r.inSample.winRate, 0) / valid.length;
    const avgRatio = valid.reduce((s, r) => s + r.wfRatio, 0) / valid.length;

    console.log(`  ${'─'.repeat(55)}`);
    console.log(`  PROMEDIO | ${String(avgISWR.toFixed(2)+'%').padEnd(12)} | ${String(avgOOSWR.toFixed(2)+'%').padEnd(13)} | ${avgRatio.toFixed(3)}    |`);
    console.log(`\n  WF Ratio < 0.90 indica overfitting severo.`);
    console.log(`  WF Ratio > 0.95 indica parámetros robustos.`);

    // Parámetros más estables (los que aparecen en más ventanas)
    this.analyzeParameterStability(valid);
  }

  analyzeParameterStability(validResults) {
    if (validResults.length < 2) return;

    console.log(`\n  🔬 Estabilidad de parámetros:`);
    const allParams = validResults.map(r => r.bestParams);
    const keys = Object.keys(allParams[0] || {});

    keys.forEach(key => {
      const values = allParams.map(p => p[key]);
      const unique = [...new Set(values)];
      const stable = unique.length === 1 || (unique.length <= 2 && values.length >= 3);
      console.log(`    ${key.padEnd(20)}: ${values.join(', ')} ${stable ? '✅ estable' : '⚠️ variable'}`);
    });
  }

  // Exportar resultados
  save(outputPath) {
    const output = {
      system:    this.systemName,
      fecha:     new Date().toISOString(),
      windows:   WFA_CONFIG.windows,
      results:   this.results,
      summary: {
        avgInSampleWR:  this.results.filter(r => r.inSample).reduce((s, r) => s + r.inSample.winRate, 0) / this.results.filter(r => r.inSample).length || 0,
        avgOutSampleWR: this.results.filter(r => r.outSample).reduce((s, r) => s + r.outSample.winRate, 0) / this.results.filter(r => r.outSample).length || 0,
        approvedWindows: this.results.filter(r => r.approved).length,
        totalWindows:    this.results.length,
      }
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n💾 Resultados guardados: ${outputPath}`);
  }
}
