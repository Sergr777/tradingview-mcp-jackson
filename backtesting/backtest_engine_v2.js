/**
 * Motor de Backtesting V2
 * Incluye sistemas optimizados con parámetros relajados
 */

import { readFileSync, writeFileSync } from 'fs';
import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';
import { MeanReversion } from './systems/mean_reversion.js';
import { TurtleSoupCTROptimized } from './systems/turtle_soup_ctr_optimized.js';
import { MeanReversionOptimized } from './systems/mean_reversion_optimized.js';

class BacktestEngineV2 {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
    this.maxPositionSize = config.maxPositionSize || 1000;
    this.riskPerTrade = config.riskPerTrade || 0.01;

    this.systems = [];
    this.allTrades = [];
  }

  addSystem(system) {
    this.systems.push(system);
  }

  run(dataFile) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         BACKTESTING V2 - SISTEMAS OPTIMIZADOS                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Cargar datos
    console.log('📖 Cargando datos históricos...');
    const data = JSON.parse(readFileSync(dataFile));

    console.log(`✅ ${data.timestamps.length.toLocaleString()} velas cargadas`);
    console.log(`📅 Período: ${new Date(data.timestamps[0]).toLocaleDateString()} - ${new Date(data.timestamps[data.timestamps.length - 1]).toLocaleDateString()}`);
    console.log(`⏱️  Duración: ${((data.timestamps[data.timestamps.length - 1] - data.timestamps[0]) / (1000 * 60 * 60 * 24 * 365)).toFixed(2)} años\n`);

    // Ejecutar backtest para cada sistema
    const results = {};

    for (const system of this.systems) {
      console.log(`╔════════════════════════════════════════════════════════════╗`);
      console.log(`║  EJECUTANDO: ${system.constructor.name.padEnd(45)} ║`);
      console.log('╚════════════════════════════════════════════════════════════╝');

      const startTime = Date.now();
      const systemResult = this.runSystem(system, data);
      const endTime = Date.now();

      results[system.constructor.name] = systemResult;

      console.log(`\n✅ Completado en ${((endTime - startTime) / 1000).toFixed(2)} segundos`);
      console.log(`📊 Trades: ${systemResult.totalTrades}`);
      console.log(`🎯 Win Rate: ${(systemResult.winRate * 100).toFixed(2)}%`);
      console.log(`💰 Total PnL: ${(systemResult.totalPnL * 100).toFixed(2)}%`);
      console.log(`📉 Max Drawdown: ${(systemResult.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`📈 Sharpe Ratio: ${systemResult.sharpeRatio.toFixed(2)}\n`);
    }

    // Guardar resultados
    writeFileSync(
      'backtesting/results/backtest_results_v2.json',
      JSON.stringify(results, null, 2)
    );

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              BACKTEST V2 COMPLETADO                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('💾 Resultados guardados en: backtesting/results/backtest_results_v2.json');

    return results;
  }

  runSystem(system, data) {
    system.trades = [];
    system.positions = [];

    // Variables para tracking
    let maxDrawdown = 0;
    let peak = 0;
    let cumulative = 0;

    // Iterar sobre cada vela
    for (let i = 0; i < data.timestamps.length; i++) {
      // Detectar señales
      const signal = system.detect(data, i);

      if (signal) {
        const trade = system.execute(signal, data, i);
        if (trade) {
          // Actualizar tracking de drawdown
          cumulative += (trade.confidence - 0.5) * 0.01;
          if (cumulative > peak) peak = cumulative;
          const drawdown = peak > 0 ? (peak - cumulative) / peak : 0;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
      }

      // Gestionar posiciones abiertas
      system.managePositions(data, i);
    }

    // Cerrar posiciones abiertas al final
    if (system.positions.length > 0) {
      console.log(`   ⚠️  Cerrando ${system.positions.length} posiciones abiertas...`);
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
    return this.calculateStats(system.trades, system.constructor.name);
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
        sharpeRatio: 0,
        trades: []
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
      sharpeRatio,
      trades
    };
  }
}

// Función principal
async function runBacktestV2() {
  console.log('🚀 INICIANDO BACKTEST V2 - SISTEMAS OPTIMIZADOS\n');

  const engine = new BacktestEngineV2({
    initialCapital: 10000,
    maxPositionSize: 1000,
    riskPerTrade: 0.01
  });

  // Agregar sistemas (ORIGINALES + OPTIMIZADOS)
  console.log('📊 Inicializando sistemas de trading...\n');

  // Sistemas originales que funcionaron
  engine.addSystem(new EMARSI());
  engine.addSystem(new VWAPBounce());

  // Sistemas optimizados
  engine.addSystem(new TurtleSoupCTROptimized());
  engine.addSystem(new MeanReversionOptimized());

  console.log(`✅ ${engine.systems.length} sistemas cargados`);
  console.log('   - EMA8RSI (original)');
  console.log('   - VWAPBounce (original)');
  console.log('   - TurtleSoupCTR OPTIMIZADO');
  console.log('   - MeanReversion OPTIMIZADO\n');

  // Ejecutar backtest
  const results = engine.run('backtesting/data/btcusdt_5m_2years_indicators.json');

  return results;
}

// Ejecutar
runBacktestV2();
