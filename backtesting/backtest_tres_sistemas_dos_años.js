/**
 * 🔄 BACKTEST TRES SISTEMAS DIRECCIONALES - 2 AÑOS
 *
 * Objetivo: Evaluar rendimiento REAL de TurtleSoup, VWAP y EMA+RSI
 *          trabajando juntos con DATOS REALES del mercado
 *
 * Sistemas:
 * 1. TurtleSoupCTR (60% recomendado)
 * 2. VWAPBounce (25% recomendado)
 * 3. EMARSI (10% recomendado)
 *
 * Datos: 210,240 velas de 5 minutos (2 años reales)
 * Output: Análisis completo + optimización de pesos
 */

import { readFileSync, writeFileSync } from 'fs';
import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';

class BacktestTresSistemasDosAños {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
    this.dataFile = config.dataFile || 'data/btcusdt_5m_2years_indicators_corrected.json';
  }

  run() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 BACKTEST TRES SISTEMAS - 2 AÑOS DATOS REALES            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Cargar datos
    console.log('📖 Cargando datos históricos REALES...');
    const data = JSON.parse(readFileSync(this.dataFile));

    console.log(`✅ ${data.timestamps.length.toLocaleString()} velas cargadas`);
    console.log(`📅 Período: ${new Date(data.timestamps[0]).toLocaleDateString()} - ${new Date(data.timestamps[data.timestamps.length - 1]).toLocaleDateString()}`);
    console.log(`⏱️  Duración: ${((data.timestamps[data.timestamps.length - 1] - data.timestamps[0]) / (1000 * 60 * 60 * 24 * 365)).toFixed(2)} años\n`);

    // Ejecutar backtest con diferentes configuraciones de pesos
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  CONFIGURACIONES A PROBAR                                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const configurations = [
      {
        name: 'Configuración ACTUAL (hoy)',
        weights: { turtle_soup: 0.67, vwap_bounce: 0.18, ema_rsi: 0.15 },
        description: 'Basada en volumen de trades de hoy'
      },
      {
        name: 'Configuración OPTIMIZADA (mañana)',
        weights: { turtle_soup: 0.60, vwap_bounce: 0.25, ema_rsi: 0.10 },
        description: 'Basada en Win Rate de hoy'
      },
      {
        name: 'Configuración EQUILIBRADA',
        weights: { turtle_soup: 0.50, vwap_bounce: 0.30, ema_rsi: 0.20 },
        description: 'Mayor peso a VWAP (mejor WR)'
      },
      {
        name: 'Configuración AGRESIVA VWAP',
        weights: { turtle_soup: 0.40, vwap_bounce: 0.40, ema_rsi: 0.20 },
        description: 'Máximo peso a VWAP'
      },
      {
        name: 'Configuración CONSERVADORA',
        weights: { turtle_soup: 0.70, vwap_bounce: 0.20, ema_rsi: 0.10 },
        description: 'Máximo peso a TurtleSoup'
      }
    ];

    const allResults = {};

    for (const config of configurations) {
      console.log(`\n📊 ${config.name}`);
      console.log(`   ${config.description}`);
      console.log(`   Pesos: TurtleSoup ${(config.weights.turtle_soup * 100).toFixed(0)}%, VWAP ${(config.weights.vwap_bounce * 100).toFixed(0)}%, EMA+RSI ${(config.weights.ema_rsi * 100).toFixed(0)}%\n`);

      const result = this.runConfiguration(data, config.weights);
      allResults[config.name] = {
        ...result,
        weights: config.weights,
        description: config.description
      };

      console.log(`✅ ${config.name} completado`);
      console.log(`   Trades: ${result.totalTrades.toLocaleString()}`);
      console.log(`   Win Rate: ${(result.winRate * 100).toFixed(2)}%`);
      console.log(`   PnL Total: ${(result.totalPnL * 100).toFixed(2)}%`);
      console.log(`   Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}\n`);
    }

    // Guardar resultados
    const outputFile = 'results/backtest_tres_sistemas_2años.json';
    writeFileSync(outputFile, JSON.stringify(allResults, null, 2));

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  📊 ANÁLISIS COMPARATIVO DE CONFIGURACIONES                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    this.printComparison(allResults);

    console.log(`\n💾 Resultados guardados en: ${outputFile}`);

    // Encontrar mejor configuración
    const bestConfig = this.findBestConfiguration(allResults);
    console.log(`\n🏆 MEJOR CONFIGURACIÓN: ${bestConfig.name}`);
    console.log(`   Win Rate: ${(bestConfig.winRate * 100).toFixed(2)}%`);
    console.log(`   PnL Total: ${(bestConfig.totalPnL * 100).toFixed(2)}%`);
    console.log(`   Sharpe Ratio: ${bestConfig.sharpeRatio.toFixed(2)}`);
    console.log(`   Pesos: TurtleSoup ${(bestConfig.weights.turtle_soup * 100).toFixed(0)}%, VWAP ${(bestConfig.weights.vwap_bounce * 100).toFixed(0)}%, EMA+RSI ${(bestConfig.weights.ema_rsi * 100).toFixed(0)}%`);

    return allResults;
  }

  runConfiguration(data, weights) {
    // Inicializar sistemas
    const turtleSoup = new TurtleSoupCTR();
    const vwapBounce = new VWAPBounce();
    const emaRsi = new EMARSI();

    const systems = [
      { name: 'turtle_soup', system: turtleSoup, weight: weights.turtle_soup },
      { name: 'vwap_bounce', system: vwapBounce, weight: weights.vwap_bounce },
      { name: 'ema_rsi', system: emaRsi, weight: weights.ema_rsi }
    ];

    let cumulativePnL = 0;
    let equityPeak = this.initialCapital;
    let maxDrawdown = 0;
    const allTrades = [];

    // Iterar sobre cada vela
    for (let i = 0; i < data.timestamps.length; i++) {
      // Ejecutar cada sistema
      for (const sys of systems) {
        // Detectar señales
        const signal = sys.system.detect(data, i);
        if (signal) {
          const trade = sys.system.execute(signal, data, i);
          if (trade) {
            trade.systemName = sys.name;
            trade.weight = sys.weight;
          }
        }

        // Gestionar posiciones
        sys.system.managePositions(data, i);

        // Agregar trades cerrados
        for (const trade of sys.system.trades) {
          if (!allTrades.includes(trade)) {
            allTrades.push({
              ...trade,
              systemName: sys.name,
              weight: sys.weight
            });

            // Aplicar peso del sistema al PnL
            const weightedPnL = trade.pnl * sys.weight;
            cumulativePnL += weightedPnL;

            // Actualizar drawdown
            const equity = this.initialCapital + cumulativePnL;
            if (equity > equityPeak) equityPeak = equity;
            const drawdown = equityPeak > 0 ? (equityPeak - equity) / equityPeak : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          }
        }
      }
    }

    return this.calculateStats(allTrades, maxDrawdown, cumulativePnL);
  }

  calculateStats(trades, maxDrawdown, totalPnL) {
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
    const avgPnL = totalPnL / totalTrades;

    const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnl * t.weight), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl * t.weight), 0));
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

    // Sharpe Ratio
    const pnlValues = trades.map(t => t.pnl * t.weight);
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

  printComparison(allResults) {
    console.log('┌──────────────────────────────────────────────────────────────────────────────────────────┐');
    console.log('│  Configuración                    Trades      WR       PnL       Sharpe    DD         │');
    console.log('├──────────────────────────────────────────────────────────────────────────────────────────┤');

    for (const [name, result] of Object.entries(allResults)) {
      const nameShort = name.substring(0, 30).padEnd(30);
      const trades = result.totalTrades.toLocaleString().padStart(8);
      const wr = (result.winRate * 100).toFixed(2).padStart(6);
      const pnl = (result.totalPnL * 100).toFixed(2).padStart(8);
      const sharpe = result.sharpeRatio.toFixed(2).padStart(8);
      const dd = (result.maxDrawdown * 100).toFixed(2).padStart(8);

      console.log(`│ ${nameShort} ${trades}  ${wr}%  ${pnl}%  ${sharpe}  ${dd}% │`);
    }

    console.log('└──────────────────────────────────────────────────────────────────────────────────────────┘\n');
  }

  findBestConfiguration(allResults) {
    let best = null;
    let bestScore = -Infinity;

    for (const [name, result] of Object.entries(allResults)) {
      // Score: Sharpe Ratio * 2 + WinRate * 1 - MaxDrawdown * 2
      const score = (result.sharpeRatio * 2) + (result.winRate * 100) - (result.maxDrawdown * 200);

      if (score > bestScore) {
        bestScore = score;
        best = { name, ...result, score };
      }
    }

    return best;
  }
}

// Ejecutar backtest
const backtest = new BacktestTresSistemasDosAños();
backtest.run();
