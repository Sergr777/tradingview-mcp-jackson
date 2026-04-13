/**
 * Backtest Comparativo: V1 vs V2 (Optimizado)
 * Valida mejoras implementadas basadas en análisis de trades perdedores
 */

import { readFileSync, writeFileSync } from 'fs';
import { MeanReversionOptimized } from './systems/mean_reversion_optimized.js';
import { MeanReversionOptimizedV2 } from './systems/mean_reversion_optimized_v2.js';
import { TurtleSoupCTRCorrected } from './systems/turtle_soup_ctr_corrected.js';
import { TurtleSoupCTROptimizedV2 } from './systems/turtle_soup_ctr_optimized_v2.js';
import { VWAPBounceOpt3Balanced } from './systems/vwap_bounce_opt3_balanced.js';
import { VWAPBounceOptimizedV2 } from './systems/vwap_bounce_optimized_v2.js';

class BacktestV1vsV2 {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
  }

  run(dataFile) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         BACKTEST COMPARATIVO V1 vs V2                          ║');
    console.log('║      (Optimizaciones basadas en análisis de pérdidas)           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Cargar datos
    console.log('📖 Cargando datos históricos...');
    const data = JSON.parse(readFileSync(dataFile));

    console.log(`✅ ${data.timestamps.length.toLocaleString()} velas cargadas`);
    console.log(`📅 Período: ${new Date(data.timestamps[0]).toLocaleDateString()} - ${new Date(data.timestamps[data.timestamps.length - 1]).toLocaleDateString()}\n`);

    // Definir sistemas a probar
    const comparisons = [
      {
        name: 'MeanReversion',
        v1: new MeanReversionOptimized(),
        v2: new MeanReversionOptimizedV2(),
        dataFile: 'backtesting/data/btcusdt_5m_2years_indicators.json'
      },
      {
        name: 'TurtleSoupCTR',
        v1: new TurtleSoupCTRCorrected(),
        v2: new TurtleSoupCTROptimizedV2(),
        dataFile: 'backtesting/data/btcusdt_5m_2years_indicators_corrected.json'
      },
      {
        name: 'VWAPBounce',
        v1: new VWAPBounceOpt3Balanced(),
        v2: new VWAPBounceOptimizedV2(),
        dataFile: 'backtesting/data/btcusdt_5m_2years_indicators.json'
      }
    ];

    const results = {};

    // Ejecutar comparaciones
    for (const comp of comparisons) {
      console.log(`╔════════════════════════════════════════════════════════════╗`);
      console.log(`║  ${comp.name.padEnd(55)} ║`);
      console.log('╚════════════════════════════════════════════════════════════╝
');

      console.log('📊 Ejecutando V1...');
      const resultV1 = this.runSystem(comp.v1, data, comp.name + '_V1');

      console.log('📊 Ejecutando V2 (Optimizado)...');
      const resultV2 = this.runSystem(comp.v2, data, comp.name + '_V2');

      results[comp.name] = { v1: resultV1, v2: resultV2 };

      // Mostrar comparación
      this.printComparison(comp.name, resultV1, resultV2);
    }

    // Guardar resultados
    writeFileSync(
      'backtesting/results/v1_vs_v2_comparison.json',
      JSON.stringify(results, null, 2)
    );

    // Resumen final
    this.printFinalSummary(results);

    console.log('\n💾 Resultados guardados en: backtesting/results/v1_vs_v2_comparison.json');

    return results;
  }

  runSystem(system, data, systemName) {
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
          pnl,
          success: pnl > 0,
          exitReason: 'FORCE_CLOSE'
        });
      }
      system.positions = [];
    }

    return this.calculateStats(system.trades, systemName);
  }

  calculateStats(trades, systemName) {
    if (trades.length === 0) {
      return {
        systemName,
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

    return {
      systemName,
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
      sharpeRatio
    };
  }

  printComparison(systemName, v1, v2) {
    const pct = (val) => (val * 100).toFixed(2);
    const fmt = (val) => val.toLocaleString();

    const winRateChange = ((v2.winRate - v1.winRate) * 100).toFixed(1);
    const pnlChange = ((v2.totalPnL - v1.totalPnL) * 100).toFixed(1);
    const sharpeChange = (v2.sharpeRatio - v1.sharpeRatio).toFixed(2);
    const tradesChange = v2.totalTrades - v1.totalTrades;

    console.log('📊 COMPARACIÓN V1 vs V2:');
    console.log(`   Trades: ${fmt(v1.totalTrades)} → ${fmt(v2.totalTrades)} (${tradesChange > 0 ? '+' : ''}${tradesChange})`);
    console.log(`   Win Rate: ${pct(v1.winRate)}% → ${pct(v2.winRate)}% (${winRateChange > 0 ? '+' : ''}${winRateChange}%)`);
    console.log(`   Total PnL: ${pct(v1.totalPnL)}% → ${pct(v2.totalPnL)}% (${pnlChange > 0 ? '+' : ''}${pnlChange}%)`);
    console.log(`   Sharpe: ${v1.sharpeRatio.toFixed(2)} → ${v2.sharpeRatio.toFixed(2)} (${sharpeChange > 0 ? '+' : ''}${sharpeChange})`);
    console.log(`   Profit Factor: ${v1.profitFactor.toFixed(2)} → ${v2.profitFactor.toFixed(2)}`);
    console.log(`   Max DD: ${pct(v1.maxDrawdown)}% → ${pct(v2.maxDrawdown)}%\n`);
  }

  printFinalSummary(results) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  RESUMEN FINAL V1 vs V2                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(
      'Sistema'.padEnd(20) +
      'Win Rate Δ'.padStart(14) +
      'PnL Δ'.padStart(12) +
      'Sharpe Δ'.padStart(12) +
      '¿Mejoró?'.padStart(10)
    );

    console.log('─'.repeat(78));

    for (const [name, data] of Object.entries(results)) {
      const winRateChange = (data.v2.winRate - data.v1.winRate) * 100;
      const pnlChange = (data.v2.totalPnL - data.v1.totalPnL) * 100;
      const sharpeChange = data.v2.sharpeRatio - data.v1.sharpeRatio;
      const improved = winRateChange > 0 || pnlChange > 0 || sharpeChange > 0;

      console.log(
        name.padEnd(20) +
        `${winRateChange > 0 ? '+' : ''}${winRateChange.toFixed(1)}%`.padStart(14) +
        `${pnlChange > 0 ? '+' : ''}${pnlChange.toFixed(1)}%`.padStart(12) +
        `${sharpeChange > 0 ? '+' : ''}${sharpeChange.toFixed(2)}`.padStart(12) +
        (improved ? '✅ SÍ' : '❌ NO').padStart(10)
      );
    }

    console.log('\n🎯 INTERPRETACIÓN:');
    console.log('   ✅ SÍ = La optimización mejoró el sistema');
    console.log('   ❌ NO = La optimización no mejoró (revisar parámetros)');
  }
}

// Ejecutar
const engine = new BacktestV1vsV2();
engine.run('backtesting/data/btcusdt_5m_2years_indicators.json');
