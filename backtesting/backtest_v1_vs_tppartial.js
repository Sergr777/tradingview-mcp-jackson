/**
 * Backtest Comparativo: V1 vs TP-Partial
 * Valida estrategia de take parciales con trailing a break-even
 */

import { readFileSync, writeFileSync } from 'fs';
import { MeanReversionOptimized } from './systems/mean_reversion_optimized.js';
import { MeanReversionTPPartial } from './systems/mean_reversion_tp_partial.js';
import { TurtleSoupCTRCorrected } from './systems/turtle_soup_ctr_corrected.js';
import { TurtleSoupCTRTPPartial } from './systems/turtle_soup_ctr_tp_partial.js';
import { VWAPBounceOpt3Balanced } from './systems/vwap_bounce_opt3_balanced.js';
import { VWAPBounceTPPartial } from './systems/vwap_bounce_tp_partial.js';

class BacktestV1vsTPPartial {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
  }

  run() {
    console.log('============================================================');
    console.log('     BACKTEST COMPARATIVO V1 vs TP-PARTIAL');
    console.log('  (Take Parciales + Trailing a Break-Even)');
    console.log('============================================================\n');

    // Definir sistemas a probar
    const comparisons = [
      {
        name: 'MeanReversion',
        v1: new MeanReversionOptimized(),
        tpp: new MeanReversionTPPartial(),
        dataFile: 'backtesting/data/btcusdt_5m_2years_indicators.json'
      },
      {
        name: 'TurtleSoupCTR',
        v1: new TurtleSoupCTRCorrected(),
        tpp: new TurtleSoupCTRTPPartial(),
        dataFile: 'backtesting/data/btcusdt_5m_2years_indicators_corrected.json'
      },
      {
        name: 'VWAPBounce',
        v1: new VWAPBounceOpt3Balanced(),
        tpp: new VWAPBounceTPPartial(),
        dataFile: 'backtesting/data/btcusdt_5m_2years_indicators.json'
      }
    ];

    const results = {};

    // Ejecutar comparaciones
    for (const comp of comparisons) {
      console.log('============================================================');
      console.log(`  ${comp.name}`);
      console.log('============================================================\n');

      const systemData = JSON.parse(readFileSync(comp.dataFile));

      console.log('Ejecutando V1 (Original)...');
      const resultV1 = this.runSystem(comp.v1, systemData);

      console.log('Ejecutando TP-Partial (Take Parciales)...');
      const resultTPP = this.runSystem(comp.tpp, systemData);

      results[comp.name] = { v1: resultV1, tpp: resultTPP };

      // Mostrar comparación
      this.printComparison(comp.name, resultV1, resultTPP);
    }

    // Guardar resultados
    writeFileSync(
      'backtesting/results/v1_vs_tppartial_comparison.json',
      JSON.stringify(results, null, 2)
    );

    // Resumen final
    this.printFinalSummary(results);

    console.log('\nResultados guardados en: backtesting/results/v1_vs_tppartial_comparison.json');

    return results;
  }

  runSystem(system, data) {
    system.trades = [];
    system.positions = [];

    for (let i = 0; i < data.timestamps.length; i++) {
      const signal = system.detect(data, i);
      if (signal) {
        system.execute(signal, data, i);
      }
      system.managePositions(data, i);
    }

    // Cerrar posiciones abiertas
    if (system.positions.length > 0) {
      for (const pos of system.positions) {
        const lastPrice = data.closes[data.closes.length - 1];
        const pnl = pos.type === 'LONG'
          ? (lastPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - lastPrice) / pos.entryPrice;

        system.trades.push({
          ...pos,
          exitTime: data.timestamps[data.timestamps.length - 1],
          exitPrice: lastPrice,
          pnl: pnl * (pos.currentPositionSize || 1.0),
          success: pnl > 0,
          exitReason: 'FORCE_CLOSE'
        });
      }
      system.positions = [];
    }

    return this.calculateStats(system.trades);
  }

  calculateStats(trades) {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0,
        avgPnL: 0,
        grossProfit: 0,
        grossLoss: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        sharpeRatio: 0
      };
    }

    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.success);
    const losingTrades = trades.filter(t => !t.success);

    const winRate = winningTrades.length / totalTrades;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = totalPnL / totalTrades;

    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

    // Calcular drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let cumulative = 0;

    for (const trade of trades) {
      cumulative += trade.pnl;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = peak > 0 ? (peak - cumulative) / peak : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calcular Sharpe Ratio
    const pnlValues = trades.map(t => t.pnl);
    const avgPnLValue = pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length;
    const stdDevPnL = Math.sqrt(
      pnlValues.reduce((sum, val) => sum + Math.pow(val - avgPnLValue, 2), 0) / pnlValues.length
    );
    const sharpeRatio = stdDevPnL === 0 ? 0 : (avgPnLValue / stdDevPnL) * Math.sqrt(252);

    // Contar TP1 hits
    const tp1Hits = trades.filter(t => t.exitReason === 'TP1').length;
    const tp2Hits = trades.filter(t => t.exitReason === 'TP2').length;
    const slHits = trades.filter(t => t.exitReason === 'STOP_LOSS' || t.exitReason === 'STOP_LOSS_BE').length;

    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnL,
      avgPnL,
      grossProfit,
      grossLoss,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      tp1Hits,
      tp2Hits,
      slHits
    };
  }

  printComparison(systemName, v1, tpp) {
    const pct = (val) => (val * 100).toFixed(2);
    const fmt = (val) => val.toLocaleString();

    const winRateChange = ((tpp.winRate - v1.winRate) * 100).toFixed(1);
    const pnlChange = ((tpp.totalPnL - v1.totalPnL) * 100).toFixed(1);
    const sharpeChange = (tpp.sharpeRatio - v1.sharpeRatio).toFixed(2);
    const ddChange = ((tpp.maxDrawdown - v1.maxDrawdown) * 100).toFixed(1);

    console.log('COMPARACION V1 vs TP-PARTIAL:');
    console.log(`   Trades: ${fmt(v1.totalTrades)} -> ${fmt(tpp.totalTrades)}`);

    if (tpp.tp1Hits !== undefined) {
      console.log(`   TP1 Hits: ${fmt(tpp.tp1Hits)} (${(tpp.tp1Hits / tpp.totalTrades * 100).toFixed(1)}% de trades)`);
      console.log(`   TP2 Hits: ${fmt(tpp.tp2Hits)} (${(tpp.tp2Hits / tpp.totalTrades * 100).toFixed(1)}% de trades)`);
    }

    console.log(`   Win Rate: ${pct(v1.winRate)}% -> ${pct(tpp.winRate)}% (${winRateChange > 0 ? '+' : ''}${winRateChange}%)`);
    console.log(`   Total PnL: ${pct(v1.totalPnL)}% -> ${pct(tpp.totalPnL)}% (${pnlChange > 0 ? '+' : ''}${pnlChange}%)`);
    console.log(`   Sharpe: ${v1.sharpeRatio.toFixed(2)} -> ${tpp.sharpeRatio.toFixed(2)} (${sharpeChange > 0 ? '+' : ''}${sharpeChange})`);
    console.log(`   Max DD: ${pct(v1.maxDrawdown)}% -> ${pct(tpp.maxDrawdown)}% (${ddChange > 0 ? '+' : ''}${ddChange}%)`);
    console.log(`   Profit Factor: ${v1.profitFactor.toFixed(2)} -> ${tpp.profitFactor.toFixed(2)}\n`);
  }

  printFinalSummary(results) {
    console.log('============================================================');
    console.log('              RESUMEN FINAL V1 vs TP-PARTIAL');
    console.log('============================================================\n');

    console.log(
      'Sistema'.padEnd(20) +
      'Win Rate Delta'.padStart(16) +
      'PnL Delta'.padStart(14) +
      'Sharpe Delta'.padStart(14) +
      'Max DD Delta'.padStart(14) +
      '¿Mejoro?'.padStart(10)
    );

    console.log('─'.repeat(102));

    for (const [name, data] of Object.entries(results)) {
      const winRateChange = (data.tpp.winRate - data.v1.winRate) * 100;
      const pnlChange = (data.tpp.totalPnL - data.v1.totalPnL) * 100;
      const sharpeChange = data.tpp.sharpeRatio - data.v1.sharpeRatio;
      const ddChange = (data.tpp.maxDrawdown - data.v1.maxDrawdown) * 100;
      const improved = winRateChange > 0 || pnlChange > 0 || sharpeChange > 0 || ddChange < 0;

      console.log(
        name.padEnd(20) +
        `${winRateChange > 0 ? '+' : ''}${winRateChange.toFixed(1)}%`.padStart(16) +
        `${pnlChange > 0 ? '+' : ''}${pnlChange.toFixed(1)}%`.padStart(14) +
        `${sharpeChange > 0 ? '+' : ''}${sharpeChange.toFixed(2)}`.padStart(14) +
        `${ddChange > 0 ? '+' : ''}${ddChange.toFixed(1)}%`.padStart(14) +
        (improved ? '✅ SI' : '❌ NO').padStart(10)
      );
    }

    console.log('\nESTRATEGIA TP-PARTIAL:');
    console.log('   TP1 = 50% del target (cerrar 50% posicion, mover SL a break-even)');
    console.log('   TP2 = 100% del target (cerrar 50% restante)');
    console.log('   Beneficio: Asegurar ganancias, reducir riesgo, mantener upside');
  }
}

// Ejecutar
const engine = new BacktestV1vsTPPartial();
engine.run();
