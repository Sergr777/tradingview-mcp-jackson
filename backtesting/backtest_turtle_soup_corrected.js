/**
 * Backtest individual: Turtle Soup CTR CORREGIDO
 * Usa high20_corrected y low20_corrected (ventana de 20 velas ANTERIORES)
 */

import { readFileSync, writeFileSync } from 'fs';
import { TurtleSoupCTRCorrected } from './systems/turtle_soup_ctr_corrected.js';

class BacktestTurtleSoupCorrected {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
    this.maxPositionSize = config.maxPositionSize || 1000;
    this.riskPerTrade = config.riskPerTrade || 0.01;
  }

  run(dataFile) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         TURTLE SOUP CTR - VERSIÓN CORREGIDA                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Cargar datos
    console.log('📖 Cargando datos históricos CORREGIDOS...');
    const data = JSON.parse(readFileSync(dataFile));

    console.log(`✅ ${data.timestamps.length.toLocaleString()} velas cargadas`);
    console.log(`📅 Período: ${new Date(data.timestamps[0]).toLocaleDateString()} - ${new Date(data.timestamps[data.timestamps.length - 1]).toLocaleDateString()}`);
    console.log(`🔧 Usando high20_corrected y low20_corrected\n`);

    // Ejecutar backtest
    const system = new TurtleSoupCTRCorrected();
    system.trades = [];
    system.positions = [];

    let signalsDetected = 0;
    let signalsExecuted = 0;

    console.log('🔍 Ejecutando backtest...\n');

    for (let i = 0; i < data.timestamps.length; i++) {
      const signal = system.detect(data, i);

      if (signal) {
        signalsDetected++;
        const trade = system.execute(signal, data, i);
        if (trade) {
          signalsExecuted++;
        }
      }

      // Gestionar posiciones
      system.managePositions(data, i);

      // Progress cada 10000 velas
      if (i % 10000 === 0 && i > 0) {
        console.log(`   Procesando ${i.toLocaleString()} / ${data.timestamps.length.toLocaleString()} velas...`);
      }
    }

    console.log(`\n✅ Análisis completado`);
    console.log(`📊 Estadísticas:`);
    console.log(`   - Señales detectadas: ${signalsDetected.toLocaleString()}`);
    console.log(`   - Trades ejecutados: ${signalsExecuted.toLocaleString()}`);
    console.log(`   - Posiciones cerradas: ${system.trades.length}\n`);

    // Cerrar posiciones abiertas
    if (system.positions.length > 0) {
      console.log(`⚠️  Cerrando ${system.positions.length} posiciones abiertas...`);
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

    // Calcular estadísticas
    const stats = this.calculateStats(system.trades);

    // Mostrar resultados
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RESULTADOS                               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Trades Totales: ${stats.totalTrades}`);
    console.log(`🎯 Win Rate: ${(stats.winRate * 100).toFixed(2)}%`);
    console.log(`💰 Total PnL: ${(stats.totalPnL * 100).toFixed(2)}%`);
    console.log(`📉 Max Drawdown: ${(stats.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`📈 Sharpe Ratio: ${stats.sharpeRatio.toFixed(2)}`);
    console.log(`💵 Profit Factor: ${stats.profitFactor.toFixed(2)}\n`);

    // Exit reasons
    const exitReasons = {};
    for (const trade of system.trades) {
      if (!exitReasons[trade.exitReason]) {
        exitReasons[trade.exitReason] = 0;
      }
      exitReasons[trade.exitReason]++;
    }

    if (Object.keys(exitReasons).length > 0) {
      console.log('Exit Reasons:');
      for (const [reason, count] of Object.entries(exitReasons)) {
        const pct = (count / stats.totalTrades * 100).toFixed(1);
        console.log(`   ${reason}: ${count} (${pct}%)`);
      }
    }

    // Guardar resultados
    const results = {
      system: 'TurtleSoupCTRCorrected',
      stats,
      trades: system.trades,
      detectionStats: {
        signalsDetected,
        signalsExecuted
      }
    };

    writeFileSync(
      'backtesting/results/turtle_soup_corrected_results.json',
      JSON.stringify(results, null, 2)
    );

    console.log('\n💾 Resultados guardados en: backtesting/results/turtle_soup_corrected_results.json');

    return results;
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
}

// Ejecutar
const engine = new BacktestTurtleSoupCorrected();
engine.run('backtesting/data/btcusdt_5m_2years_indicators_corrected.json');
