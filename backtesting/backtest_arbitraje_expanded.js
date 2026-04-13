/**
 * BACKTEST COMPARATIVO: ARBITRAJE ORIGINAL vs EXPANDIDO
 *
 * Compara:
 * 1. Arbitraje Original ($2,000, 2 pares)
 * 2. Arbitraje Expandido ($5,000, 5 pares)
 * 3. Portafolio Completo con cada versión
 */

import { readFileSync, writeFileSync } from 'fs';
import { StatisticalArbitragePairs } from './systems/statistical_arbitrage_pairs.js';
import { StatisticalArbitragePairsExpanded } from './systems/statistical_arbitrage_pairs_expanded.js';
import { AsianSessionSpecialist } from './systems/specialist_asian_session.js';
import { USSessionOpenSpecialist } from './systems/specialist_us_session_open.js';
import { MeanReversionTPPartial } from './systems/mean_reversion_tp_partial.js';

class ArbitrageComparisonBacktest {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
  }

  run() {
    console.log('============================================================');
    console.log('  BACKTEST COMPARATIVO: ARBITRAJE ORIGINAL vs EXPANDIDO');
    console.log('============================================================\n');

    // Cargar datos
    console.log('Cargando datos históricos...');
    const data = JSON.parse(readFileSync('data/btcusdt_5m_2years_indicators_corrected.json'));
    console.log(`${data.timestamps.length.toLocaleString()} velas cargadas\n`);

    // Ejecutar backtests
    console.log('============================================================');
    console.log('  EJECUTANDO: ARBITRAJE ORIGINAL ($2,000, 2 pares)');
    console.log('============================================================\n');

    const originalArbitrage = this.runArbitrageOriginal(data);

    console.log('\n============================================================');
    console.log('  EJECUTANDO: ARBITRAJE EXPANDIDO ($5,000, 5 pares)');
    console.log('============================================================\n');

    const expandedArbitrage = this.runArbitrageExpanded(data);

    console.log('\n============================================================');
    console.log('  EJECUTANDO: PORTAFOLIO CON ARBITRAJE ORIGINAL');
    console.log('============================================================\n');

    const portfolioOriginal = this.runPortfolioWithArbitrage(data, 'original');

    console.log('\n============================================================');
    console.log('  EJECUTANDO: PORTAFOLIO CON ARBITRAJE EXPANDIDO');
    console.log('============================================================\n');

    const portfolioExpanded = this.runPortfolioWithArbitrage(data, 'expanded');

    // Guardar resultados
    const results = {
      arbitrageOriginal: originalArbitrage,
      arbitrageExpanded: expandedArbitrage,
      portfolioOriginal: portfolioOriginal,
      portfolioExpanded: portfolioExpanded
    };

    writeFileSync(
      'results/arbitrage_expanded_comparison.json',
      JSON.stringify(results, null, 2)
    );

    // Mostrar comparaciones
    this.printArbitrageComparison(originalArbitrage, expandedArbitrage);
    this.printPortfolioComparison(portfolioOriginal, portfolioExpanded);

    console.log('\nResultados guardados en: results/arbitrage_expanded_comparison.json');

    return results;
  }

  /**
   * Backtest arbitraje original ($2,000, 2 pares)
   */
  runArbitrageOriginal(data) {
    const arbitrageSystem = new StatisticalArbitragePairs();

    let cumulativePnL = 0;
    let equityPeak = this.initialCapital;
    let maxDrawdown = 0;
    const allTrades = [];

    for (let i = 0; i < data.timestamps.length; i++) {
      const signal = arbitrageSystem.detect(data, i);
      if (signal) {
        arbitrageSystem.execute(signal, data, i);
      }

      arbitrageSystem.managePositions(data, i);

      for (const trade of arbitrageSystem.trades) {
        if (!allTrades.includes(trade)) {
          allTrades.push(trade);
          cumulativePnL += trade.pnl;

          const equity = this.initialCapital + cumulativePnL;
          if (equity > equityPeak) equityPeak = equity;
          const drawdown = equityPeak > 0 ? (equityPeak - equity) / equityPeak : 0;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
      }
    }

    return this.calculateStats(allTrades, maxDrawdown);
  }

  /**
   * Backtest arbitraje expandido ($5,000, 5 pares)
   */
  runArbitrageExpanded(data) {
    const arbitrageSystem = new StatisticalArbitragePairsExpanded();

    let cumulativePnL = 0;
    let equityPeak = this.initialCapital;
    let maxDrawdown = 0;
    const allTrades = [];

    for (let i = 0; i < data.timestamps.length; i++) {
      const signal = arbitrageSystem.detect(data, i);
      if (signal) {
        arbitrageSystem.execute(signal, data, i);
      }

      arbitrageSystem.managePositions(data, i);

      for (const trade of arbitrageSystem.trades) {
        if (!allTrades.includes(trade)) {
          allTrades.push(trade);
          cumulativePnL += trade.pnl;

          const equity = this.initialCapital + cumulativePnL;
          if (equity > equityPeak) equityPeak = equity;
          const drawdown = equityPeak > 0 ? (equityPeak - equity) / equityPeak : 0;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
      }
    }

    return this.calculateStats(allTrades, maxDrawdown);
  }

  /**
   * Backtest portafolio completo con arbitraje
   */
  runPortfolioWithArbitrage(data, arbitrageType) {
    // Sistemas especialistas (reducidos para dejar espacio a arbitraje)
    const asianSpecialist = new AsianSessionSpecialist();
    const usOpenSpecialist = new USSessionOpenSpecialist();
    const meanReversionTP = new MeanReversionTPPartial();

    // Sistema de arbitraje
    const arbitrageSystem = arbitrageType === 'expanded'
      ? new StatisticalArbitragePairsExpanded()
      : new StatisticalArbitragePairs();

    let cumulativePnL = 0;
    let equityPeak = this.initialCapital;
    let maxDrawdown = 0;
    const allTrades = [];

    for (let i = 0; i < data.timestamps.length; i++) {
      // Ejecutar especialistas
      const asianSignal = asianSpecialist.detect(data, i);
      if (asianSignal) {
        asianSpecialist.execute(asianSignal, data, i);
      }
      asianSpecialist.managePositions(data, i);

      const usOpenSignal = usOpenSpecialist.detect(data, i);
      if (usOpenSignal) {
        usOpenSpecialist.execute(usOpenSignal, data, i);
      }
      usOpenSpecialist.managePositions(data, i);

      const meanRevSignal = meanReversionTP.detect(data, i);
      if (meanRevSignal) {
        meanReversionTP.execute(meanRevSignal, data, i);
      }
      meanReversionTP.managePositions(data, i);

      // Ejecutar arbitraje
      const arbSignal = arbitrageSystem.detect(data, i);
      if (arbSignal) {
        arbitrageSystem.execute(arbSignal, data, i);
      }
      arbitrageSystem.managePositions(data, i);

      // Agregar trades de todos los sistemas
      const allSystems = [asianSpecialist, usOpenSpecialist, meanReversionTP, arbitrageSystem];

      for (const system of allSystems) {
        for (const trade of system.trades) {
          if (!allTrades.includes(trade)) {
            allTrades.push(trade);
            cumulativePnL += trade.pnl;

            const equity = this.initialCapital + cumulativePnL;
            if (equity > equityPeak) equityPeak = equity;
            const drawdown = equityPeak > 0 ? (equityPeak - equity) / equityPeak : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          }
        }
      }
    }

    return this.calculateStats(allTrades, maxDrawdown);
  }

  /**
   * Calcula estadísticas
   */
  calculateStats(trades, maxDrawdown) {
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

    const pnlValues = trades.map(t => t.pnl);
    const avgPnLValue = pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length;
    const stdDevPnL = Math.sqrt(
      pnlValues.reduce((sum, val) => sum + Math.pow(val - avgPnLValue, 2), 0) / pnlValues.length
    );
    const sharpeRatio = stdDevPnL === 0 ? 0 : (avgPnLValue / stdDevPnL) * Math.sqrt(252);

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
      sharpeRatio
    };
  }

  /**
   * Imprime comparación de arbitraje
   */
  printArbitrageComparison(original, expanded) {
    const pct = (val) => (val * 100).toFixed(2);
    const fmt = (val) => val.toLocaleString();

    console.log('\n============================================================');
    console.log('         COMPARATIVA: ARBITRAJE ORIGINAL vs EXPANDIDO');
    console.log('============================================================\n');

    console.log(
      'Métrica'.padEnd(20) +
      'Original ($2K)'.padStart(18) +
      'Expandido ($5K)'.padStart(18) +
      'Diferencia'.padStart(12)
    );

    console.log('─'.repeat(78));

    const pnlDiff = ((expanded.totalPnL - original.totalPnL) * 100).toFixed(1);
    const ddDiff = ((expanded.maxDrawdown - original.maxDrawdown) * 100).toFixed(1);
    const sharpeDiff = (expanded.sharpeRatio - original.sharpeRatio).toFixed(2);

    console.log(
      'Trades'.padEnd(20) +
      fmt(original.totalTrades).padStart(18) +
      fmt(expanded.totalTrades).padStart(18) +
      fmt(expanded.totalTrades - original.totalTrades).padStart(12)
    );

    console.log(
      'Win Rate'.padEnd(20) +
      pct(original.winRate) + '%'.padStart(15) +
      pct(expanded.winRate) + '%'.padStart(15) +
      ((expanded.winRate - original.winRate) * 100).toFixed(1) + '%'.padStart(10)
    );

    console.log(
      'Total PnL'.padEnd(20) +
      pct(original.totalPnL) + '%'.padStart(15) +
      pct(expanded.totalPnL) + '%'.padStart(15) +
      (pnlDiff > 0 ? '+' : '') + pnlDiff + '%'.padStart(10)
    );

    console.log(
      'Max Drawdown'.padEnd(20) +
      pct(original.maxDrawdown) + '%'.padStart(15) +
      pct(expanded.maxDrawdown) + '%'.padStart(15) +
      (ddDiff > 0 ? '+' : '') + ddDiff + '%'.padStart(10)
    );

    console.log(
      'Sharpe Ratio'.padEnd(20) +
      original.sharpeRatio.toFixed(2).padStart(18) +
      expanded.sharpeRatio.toFixed(2).padStart(18) +
      (sharpeDiff > 0 ? '+' : '') + sharpeDiff.padStart(10)
    );

    console.log(
      'Profit Factor'.padEnd(20) +
      original.profitFactor.toFixed(2).padStart(18) +
      expanded.profitFactor.toFixed(2).padStart(18) +
      (expanded.profitFactor - original.profitFactor).toFixed(2).padStart(10)
    );

    // Veredicto
    console.log('\n=== VEREDICTO ===');
    if (expanded.sharpeRatio > original.sharpeRatio &&
        expanded.maxDrawdown <= original.maxDrawdown * 1.1) {
      console.log('✅ El ARBITRAJE EXPANDIDO es MEJOR');
      console.log('   - Mayor diversificación de pares');
      console.log('   - Mejor relación riesgo/retorno');
      console.log('   - Recomendado: $5,000 en arbitraje');
    } else {
      console.log('⚠️ El ARBITRAJE ORIGINAL es suficiente');
      console.log('   - Mantener $2,000 en arbitraje');
      console.log('   - Usar $3,000 adicionales en otros sistemas');
    }
  }

  /**
   * Imprime comparación de portafolios
   */
  printPortfolioComparison(original, expanded) {
    const pct = (val) => (val * 100).toFixed(2);
    const fmt = (val) => val.toLocaleString();

    console.log('\n============================================================');
    console.log('    COMPARATIVA: PORTAFOLIO ORIGINAL vs EXPANDIDO');
    console.log('============================================================\n');

    console.log(
      'Métrica'.padEnd(20) +
      'Portafolio Original'.padStart(20) +
      'Portafolio Expandido'.padStart(20) +
      'Diferencia'.padStart(12)
    );

    console.log('─'.repeat(82));

    const pnlDiff = ((expanded.totalPnL - original.totalPnL) * 100).toFixed(1);
    const ddDiff = ((expanded.maxDrawdown - original.maxDrawdown) * 100).toFixed(1);
    const sharpeDiff = (expanded.sharpeRatio - original.sharpeRatio).toFixed(2);

    console.log(
      'Trades'.padEnd(20) +
      fmt(original.totalTrades).padStart(20) +
      fmt(expanded.totalTrades).padStart(20) +
      fmt(expanded.totalTrades - original.totalTrades).padStart(12)
    );

    console.log(
      'Win Rate'.padEnd(20) +
      pct(original.winRate) + '%'.padStart(17) +
      pct(expanded.winRate) + '%'.padStart(17) +
      ((expanded.winRate - original.winRate) * 100).toFixed(1) + '%'.padStart(10)
    );

    console.log(
      'Total PnL'.padEnd(20) +
      pct(original.totalPnL) + '%'.padStart(17) +
      pct(expanded.totalPnL) + '%'.padStart(17) +
      (pnlDiff > 0 ? '+' : '') + pnlDiff + '%'.padStart(10)
    );

    console.log(
      'Max Drawdown'.padEnd(20) +
      pct(original.maxDrawdown) + '%'.padStart(17) +
      pct(expanded.maxDrawdown) + '%'.padStart(17) +
      (ddDiff > 0 ? '+' : '') + ddDiff + '%'.padStart(10)
    );

    console.log(
      'Sharpe Ratio'.padEnd(20) +
      original.sharpeRatio.toFixed(2).padStart(20) +
      expanded.sharpeRatio.toFixed(2).padStart(20) +
      (sharpeDiff > 0 ? '+' : '') + sharpeDiff.padStart(10)
    );

    console.log(
      'Profit Factor'.padEnd(20) +
      original.profitFactor.toFixed(2).padStart(20) +
      expanded.profitFactor.toFixed(2).padStart(20) +
      (expanded.profitFactor - original.profitFactor).toFixed(2).padStart(10)
    );

    // Veredicto final
    console.log('\n=== VEREDICTO FINAL ===');
    if (expanded.sharpeRatio > original.sharpeRatio * 1.1) {
      console.log('✅ PORTAFOLIO EXPANDIDO es RECOMENDADO');
      console.log('   - Sharpe Ratio > 10% mejor');
      console.log('   - Configuración: $13,000');
      console.log('   - Arbitraje: $5,000 (38%)');
      console.log('   - Asian: $3,500, MeanRev: $3,500, US Open: $1,000');
    } else if (Math.abs(expanded.sharpeRatio - original.sharpeRatio) < 0.1) {
      console.log('🤝 AMBOS PORTAFOLIOS son SIMILARES');
      console.log('   - Diferencia < 10% en Sharpe');
      console.log('   - Elegir según preferencia de riesgo');
    } else {
      console.log('⚠️ PORTAFOLIO ORIGINAL es preferible');
      console.log('   - Mejor relación riesgo/retorno');
      console.log('   - Mantener $12,000 original');
    }
  }
}

// Ejecutar
const engine = new ArbitrageComparisonBacktest();
engine.run();
