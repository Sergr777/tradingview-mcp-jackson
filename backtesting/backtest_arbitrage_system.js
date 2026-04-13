/**
 * BACKTEST SISTEMA DE ARBITRAJE ESTADÍSTICO
 *
 * Compara:
 * 1. Solo Arbitraje
 * 2. Portafolio Completo (3 especialistas + Arbitraje)
 */

import { readFileSync, writeFileSync } from 'fs';
import { StatisticalArbitragePairs } from './systems/statistical_arbitrage_pairs.js';
import { AsianSessionSpecialist } from './systems/specialist_asian_session.js';
import { USSessionOpenSpecialist } from './systems/specialist_us_session_open.js';
import { MeanReversionTPPartial } from './systems/mean_reversion_tp_partial.js';

class ArbitrageBacktest {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
  }

  run() {
    console.log('============================================================');
    console.log('     BACKTEST SISTEMA DE ARBITRAJE ESTADÍSTICO');
    console.log('============================================================\n');

    // Cargar datos
    console.log('Cargando datos históricos...');
    const data = JSON.parse(readFileSync('data/btcusdt_5m_2years_indicators_corrected.json'));
    console.log(`${data.timestamps.length.toLocaleString()} velas cargadas\n`);

    // Ejecutar backtest SOLO arbitraje
    console.log('============================================================');
    console.log('  EJECUTANDO: SOLO ARBITRAJE');
    console.log('============================================================\n');

    const arbitrageResults = this.runArbitrageOnly(data);

    // Ejecutar backtest PORTAFOLIO COMPLETO
    console.log('\n============================================================');
    console.log('  EJECUTANDO: PORTAFOLIO COMPLETO (Especialistas + Arbitraje)');
    console.log('============================================================\n');

    const portfolioResults = this.runPortfolioWithArbitrage(data);

    // Guardar resultados
    const results = {
      arbitrageOnly: arbitrageResults,
      portfolioWithArbitrage: portfolioResults
    };

    writeFileSync(
      'results/arbitrage_comparison.json',
      JSON.stringify(results, null, 2)
    );

    // Mostrar comparación
    this.printComparison(arbitrageResults, portfolioResults);

    console.log('\nResultados guardados en: results/arbitrage_comparison.json');

    return results;
  }

  /**
   * Backtest SOLO sistema de arbitraje
   */
  runArbitrageOnly(data) {
    const arbitrageSystem = new StatisticalArbitragePairs();

    let cumulativePnL = 0;
    let equityPeak = this.initialCapital;
    let maxDrawdown = 0;
    const allTrades = [];

    for (let i = 0; i < data.timestamps.length; i++) {
      // Detectar oportunidades
      const signal = arbitrageSystem.detect(data, i);
      if (signal) {
        const trade = arbitrageSystem.execute(signal, data, i);
        if (trade) {
          // No agregamos a positions, ya que execute() lo maneja
        }
      }

      // Gestionar posiciones
      arbitrageSystem.managePositions(data, i);

      // Agregar trades cerrados
      for (const trade of arbitrageSystem.trades) {
        if (!allTrades.includes(trade)) {
          allTrades.push(trade);
          cumulativePnL += trade.pnl;

          // Actualizar drawdown
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
   * Backtest portafolio completo (especialistas + arbitraje)
   */
  runPortfolioWithArbitrage(data) {
    // Sistemas especialistas
    const asianSpecialist = new AsianSessionSpecialist();
    const usOpenSpecialist = new USSessionOpenSpecialist();
    const meanReversionTP = new MeanReversionTPPartial();

    // Sistema de arbitraje
    const arbitrageSystem = new StatisticalArbitragePairs();

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

            // Actualizar drawdown
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

    // Sharpe Ratio
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
   * Imprime comparación
   */
  printComparison(arbitrageOnly, portfolioWithArb) {
    const pct = (val) => (val * 100).toFixed(2);
    const fmt = (val) => val.toLocaleString();

    console.log('============================================================');
    console.log('              COMPARATIVA ARBITRAJE vs PORTAFOLIO');
    console.log('============================================================\n');

    console.log(
      'Métrica'.padEnd(20) +
      'Solo Arbitraje'.padStart(18) +
      'Portafolio Completo'.padStart(18) +
      'Diferencia'.padStart(12)
    );

    console.log('─'.repeat(78));

    const pnlDiff = ((portfolioWithArb.totalPnL - arbitrageOnly.totalPnL) * 100).toFixed(1);
    const ddDiff = ((portfolioWithArb.maxDrawdown - arbitrageOnly.maxDrawdown) * 100).toFixed(1);
    const sharpeDiff = (portfolioWithArb.sharpeRatio - arbitrageOnly.sharpeRatio).toFixed(2);

    console.log(
      'Trades'.padEnd(20) +
      fmt(arbitrageOnly.totalTrades).padStart(18) +
      fmt(portfolioWithArb.totalTrades).padStart(18) +
      fmt(portfolioWithArb.totalTrades - arbitrageOnly.totalTrades).padStart(12)
    );

    console.log(
      'Win Rate'.padEnd(20) +
      pct(arbitrageOnly.winRate) + '%'.padStart(15) +
      pct(portfolioWithArb.winRate) + '%'.padStart(15) +
      ((portfolioWithArb.winRate - arbitrageOnly.winRate) * 100).toFixed(1) + '%'.padStart(10)
    );

    console.log(
      'Total PnL'.padEnd(20) +
      pct(arbitrageOnly.totalPnL) + '%'.padStart(15) +
      pct(portfolioWithArb.totalPnL) + '%'.padStart(15) +
      (pnlDiff > 0 ? '+' : '') + pnlDiff + '%'.padStart(10)
    );

    console.log(
      'Max Drawdown'.padEnd(20) +
      pct(arbitrageOnly.maxDrawdown) + '%'.padStart(15) +
      pct(portfolioWithArb.maxDrawdown) + '%'.padStart(15) +
      (ddDiff > 0 ? '+' : '') + ddDiff + '%'.padStart(10)
    );

    console.log(
      'Sharpe Ratio'.padEnd(20) +
      arbitrageOnly.sharpeRatio.toFixed(2).padStart(18) +
      portfolioWithArb.sharpeRatio.toFixed(2).padStart(18) +
      (sharpeDiff > 0 ? '+' : '') + sharpeDiff.padStart(10)
    );

    console.log(
      'Profit Factor'.padEnd(20) +
      arbitrageOnly.profitFactor.toFixed(2).padStart(18) +
      portfolioWithArb.profitFactor.toFixed(2).padStart(18) +
      (portfolioWithArb.profitFactor - arbitrageOnly.profitFactor).toFixed(2).padStart(10)
    );

    // Veredicto
    console.log('\n=== VEREDICTO ===');
    if (portfolioWithArb.sharpeRatio > arbitrageOnly.sharpeRatio &&
        portfolioWithArb.profitFactor > arbitrageOnly.profitFactor) {
      console.log('✅ El ARBITRAJE MEJORA el portafolio');
      console.log('   - Aumenta la diversificación');
      console.log('   - Reduce correlación entre estrategias');
      console.log('   - Mejora relación riesgo/retorno');
    } else {
      console.log('⚠️ El ARBITRAJE NO APORTA valor significativo');
      console.log('   - Considerar ajustar parámetros');
      console.log('   - O probar otros pares de trading');
    }
  }
}

// Ejecutar
const engine = new ArbitrageBacktest();
engine.run();
