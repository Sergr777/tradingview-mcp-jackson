/**
 * Backtest Comparativo: VWAP Bounce - 4 Versiones
 * Original + 3 Optimizaciones
 */

import { readFileSync, writeFileSync } from 'fs';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { VWAPBounceOpt1Conservative } from './systems/vwap_bounce_opt1_conservative.js';
import { VWAPBounceOpt2Aggressive } from './systems/vwap_bounce_opt2_aggressive.js';
import { VWAPBounceOpt3Balanced } from './systems/vwap_bounce_opt3_balanced.js';

class BacktestVWAPComparison {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
  }

  run(dataFile) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         VWAP BOUNCE - COMPARATIVA 4 VERSIONES                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Cargar datos
    console.log('📖 Cargando datos históricos...');
    const data = JSON.parse(readFileSync(dataFile));

    console.log(`✅ ${data.timestamps.length.toLocaleString()} velas cargadas`);
    console.log(`📅 Período: ${new Date(data.timestamps[0]).toLocaleDateString()} - ${new Date(data.timestamps[data.timestamps.length - 1]).toLocaleDateString()}\n`);

    // Definir sistemas a probar
    const systems = [
      { name: 'ORIGINAL', class: VWAPBounce },
      { name: 'OPT1_CONSERVATIVE', class: VWAPBounceOpt1Conservative },
      { name: 'OPT2_AGGRESSIVE', class: VWAPBounceOpt2Aggressive },
      { name: 'OPT3_BALANCED', class: VWAPBounceOpt3Balanced }
    ];

    // Ejecutar backtest para cada sistema
    const results = {};

    for (const sys of systems) {
      console.log(`╔════════════════════════════════════════════════════════════╗`);
      console.log(`║  EJECUTANDO: VWAP BOUNCE ${sys.name.padEnd(30)} ║`);
      console.log('╚════════════════════════════════════════════════════════════╝');

      const system = new sys.class();
      const result = this.runSystem(system, data, sys.name);
      results[sys.name] = result;

      console.log(`\n📊 Resultados ${sys.name}:`);
      console.log(`   Trades: ${result.totalTrades}`);
      console.log(`   Win Rate: ${(result.winRate * 100).toFixed(2)}%`);
      console.log(`   Total PnL: ${(result.totalPnL * 100).toFixed(2)}%`);
      console.log(`   Max Drawdown: ${(result.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`   Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
      console.log(`   Profit Factor: ${result.profitFactor.toFixed(2)}\n`);
    }

    // Guardar resultados
    writeFileSync(
      'backtesting/results/vwap_bounce_comparison.json',
      JSON.stringify(results, null, 2)
    );

    // Mostrar comparativa final
    this.showComparison(results);

    console.log('\n💾 Resultados guardados en: backtesting/results/vwap_bounce_comparison.json');

    return results;
  }

  runSystem(system, data, systemName) {
    system.trades = [];
    system.positions = [];

    let signalsDetected = 0;

    for (let i = 0; i < data.timestamps.length; i++) {
      const signal = system.detect(data, i);

      if (signal) {
        signalsDetected++;
        system.execute(signal, data, i);
      }

      system.managePositions(data, i);

      if (i % 20000 === 0 && i > 0) {
        // console.log(`   Procesando ${i.toLocaleString()} / ${data.timestamps.length.toLocaleString()} velas...`);
      }
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

    const stats = this.calculateStats(system.trades, systemName);
    stats.signalsDetected = signalsDetected;
    return stats;
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

  showComparison(results) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  COMPARATIVA FINAL                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const versions = Object.values(results);

    // Ordenar por total PnL
    versions.sort((a, b) => b.totalPnL - a.totalPnL);

    console.log(
      'Versión'.padEnd(20) +
      'Trades'.padStart(10) +
      'Win Rate'.padStart(12) +
      'Total PnL'.padStart(12) +
      'Sharpe'.padStart(10) +
      'Max DD'.padStart(10) +
      'Profit F'.padStart(10)
    );

    console.log('─'.repeat(94));

    for (const ver of versions) {
      const medal = ver.totalPnL === versions[0].totalPnL ? '🏆' : '  ';
      console.log(
        (medal + ' ' + ver.systemName).padEnd(20) +
        ver.totalTrades.toString().padStart(10) +
        (ver.winRate * 100).toFixed(2) + '%'.padStart(11) +
        (ver.totalPnL * 100).toFixed(2) + '%'.padStart(11) +
        ver.sharpeRatio.toFixed(2).padStart(10) +
        (ver.maxDrawdown * 100).toFixed(2) + '%'.padStart(9) +
        ver.profitFactor.toFixed(2).padStart(10)
      );
    }

    // Mejor versión
    const bestVersion = versions[0];
    console.log('\n🏆 MEJOR VERSIÓN:', bestVersion.systemName);
    console.log(`   Total PnL: ${(bestVersion.totalPnL * 100).toFixed(2)}%`);
    console.log(`   Win Rate: ${(bestVersion.winRate * 100).toFixed(2)}%`);
    console.log(`   Sharpe Ratio: ${bestVersion.sharpeRatio.toFixed(2)}`);
    console.log(`   Max Drawdown: ${(bestVersion.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`   Profit Factor: ${bestVersion.profitFactor.toFixed(2)}`);

    // Análisis de mejoras vs Original
    const original = results['ORIGINAL'];
    if (original && bestVersion.systemName !== 'ORIGINAL') {
      console.log('\n📈 MEJORA VS ORIGINAL:');
      console.log(`   Win Rate: ${(original.winRate * 100).toFixed(2)}% → ${(bestVersion.winRate * 100).toFixed(2)}%`);
      console.log(`   Total PnL: ${(original.totalPnL * 100).toFixed(2)}% → ${(bestVersion.totalPnL * 100).toFixed(2)}%`);
      console.log(`   Sharpe Ratio: ${original.sharpeRatio.toFixed(2)} → ${bestVersion.sharpeRatio.toFixed(2)}`);
      console.log(`   Profit Factor: ${original.profitFactor.toFixed(2)} → ${bestVersion.profitFactor.toFixed(2)}`);

      const pnlImprovement = ((bestVersion.totalPnL - original.totalPnL) / Math.abs(original.totalPnL) * 100);
      console.log(`   💰 Mejora PnL: ${pnlImprovement > 0 ? '+' : ''}${pnlImprovement.toFixed(1)}%`);
    }

    // Exit reasons comparison
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              EXIT REASONS COMPARISON                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    for (const ver of versions) {
      const exitReasons = {};
      for (const trade of ver.trades) {
        if (!exitReasons[trade.exitReason]) {
          exitReasons[trade.exitReason] = 0;
        }
        exitReasons[trade.exitReason]++;
      }

      console.log(`📊 ${ver.systemName}:`);
      for (const [reason, count] of Object.entries(exitReasons)) {
        const pct = (count / ver.totalTrades * 100).toFixed(1);
        console.log(`      ${reason}: ${count} (${pct}%)`);
      }
      console.log('');
    }
  }
}

// Ejecutar
const engine = new BacktestVWAPComparison();
engine.run('backtesting/data/btcusdt_5m_2years_indicators.json');
