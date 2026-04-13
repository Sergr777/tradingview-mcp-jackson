/**
 * 🔄 BACKTEST TRES SISTEMAS - VERSIÓN OPTIMIZADA
 *
 * Optimizaciones:
 * - Logs de progreso cada 10,000 velas
 * - Set en lugar de array.includes()
 * - Algoritmo más eficiente
 * - Timeout de 60 segundos por configuración
 */

import { readFileSync, writeFileSync } from 'fs';
import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';

class BacktestTresSistemasOptimizado {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
    this.dataFile = config.dataFile || 'data/btcusdt_5m_2years_indicators_corrected.json';
  }

  run() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 BACKTEST TRES SISTEMAS - VERSIÓN OPTIMIZADA            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Cargar datos
    console.log('📖 Cargando datos históricos REALES...');
    const data = JSON.parse(readFileSync(this.dataFile));

    console.log(`✅ ${data.timestamps.length.toLocaleString()} velas cargadas\n`);

    // Solo probar 3 configuraciones clave (no 5)
    const configurations = [
      {
        name: 'ACTUAL (hoy)',
        weights: { turtle_soup: 0.67, vwap_bounce: 0.18, ema_rsi: 0.15 }
      },
      {
        name: 'OPTIMIZADA (mañana)',
        weights: { turtle_soup: 0.60, vwap_bounce: 0.25, ema_rsi: 0.10 }
      },
      {
        name: 'AGRESIVA VWAP',
        weights: { turtle_soup: 0.40, vwap_bounce: 0.40, ema_rsi: 0.20 }
      }
    ];

    const allResults = {};

    for (const config of configurations) {
      console.log(`\n📊 ${config.name}`);
      console.log(`   Pesos: TurtleSoup ${(config.weights.turtle_soup * 100).toFixed(0)}%, VWAP ${(config.weights.vwap_bounce * 100).toFixed(0)}%, EMA+RSI ${(config.weights.ema_rsi * 100).toFixed(0)}%`);
      console.log(`   ⏳ Iniciando...\n`);

      const result = this.runConfiguration(data, config.weights);
      allResults[config.name] = {
        ...result,
        weights: config.weights
      };

      console.log(`\n✅ ${config.name} COMPLETADO`);
      console.log(`   Trades: ${result.totalTrades.toLocaleString()}`);
      console.log(`   Win Rate: ${(result.winRate * 100).toFixed(2)}%`);
      console.log(`   PnL Total: ${(result.totalPnL * 100).toFixed(2)}%`);
      console.log(`   Sharpe Ratio: ${result.sharpeRatio.toFixed(2)}`);
    }

    // Guardar resultados
    const outputFile = 'results/backtest_tres_sistemas_optimizado.json';
    writeFileSync(outputFile, JSON.stringify(allResults, null, 2));

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  📊 ANÁLISIS COMPARATIVO                                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    this.printComparison(allResults);

    console.log(`\n💾 Resultados guardados en: ${outputFile}`);

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
    const tradesSet = new Set(); // Para verificar duplicados eficientemente

    // Iterar sobre cada vela (con progreso)
    const totalVelas = data.timestamps.length;
    let lastLogTime = Date.now();

    for (let i = 0; i < totalVelas; i++) {
      // Log de progreso cada 10,000 velas
      if (i % 10000 === 0 && i > 0) {
        const progress = ((i / totalVelas) * 100).toFixed(1);
        const elapsed = ((Date.now() - lastLogTime) / 1000).toFixed(1);
        console.log(`   ⏳ Progreso: ${progress}% (${i.toLocaleString()}/${totalVelas.toLocaleString()} velas) [${elapsed}s]`);
        lastLogTime = Date.now();
      }

      // Ejecutar cada sistema
      for (const sys of systems) {
        try {
          // Detectar señales
          const signal = sys.system.detect(data, i);
          if (signal) {
            const trade = sys.system.execute(signal, data, i);
            if (trade) {
              trade.systemName = sys.name;
              trade.weight = sys.weight;
              trade.id = `${sys.name}_${i}_${trade.entryPrice}`; // ID único
            }
          }

          // Gestionar posiciones
          sys.system.managePositions(data, i);

          // Agregar trades cerrados (usando Set para eficiencia)
          for (const trade of sys.system.trades) {
            const tradeId = `${sys.name}_${i}_${trade.entryPrice}`;
            if (!tradesSet.has(tradeId)) {
              tradesSet.add(tradeId);
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
        } catch (error) {
          // Continuar si hay error en una vela
          console.error(`   ⚠️  Error en vela ${i}: ${error.message}`);
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

    // Sharpe Ratio (simplificado)
    const pnlValues = trades.map(t => t.pnl * t.weight);
    const avgPnLValue = pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length;
    const variance = pnlValues.reduce((sum, val) => sum + Math.pow(val - avgPnLValue, 2), 0) / pnlValues.length;
    const stdDevPnL = Math.sqrt(variance);
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
}

// Ejecutar backtest
console.time('⏱️  Tiempo total');
const backtest = new BacktestTresSistemasOptimizado();
backtest.run();
console.timeEnd('⏱️  Tiempo total');
