/**
 * Backtest Portafolio Completo: Especialistas + Hedge
 *
 * Arquitectura:
 * 1. 3 Sistemas Especialistas (por sesión)
 * 2. 1 Sistema de Hedge (protección)
 * 3. Comparación: Con Hedge vs Sin Hedge
 */

import { readFileSync, writeFileSync } from 'fs';
import { LondonNyOverlapSpecialist } from './systems/specialist_london_ny_overlap.js';
import { AsianSessionSpecialist } from './systems/specialist_asian_session.js';
import { USSessionOpenSpecialist } from './systems/specialist_us_session_open.js';
import { PortfolioHedgeSystem } from './systems/portfolio_hedge_system.js';

class PortfolioBacktest {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
  }

  run() {
    console.log('============================================================');
    console.log('     BACKTEST PORTAFOLIO: ESPECIALISTAS + HEDGE');
    console.log('============================================================\n');

    // Cargar datos
    console.log('Cargando datos historicos...');
    const data = JSON.parse(readFileSync('data/btcusdt_5m_2years_indicators_corrected.json'));
    console.log(`${data.timestamps.length.toLocaleString()} velas cargadas\n`);

    // Ejecutar backtest SIN hedge (baseline)
    console.log('============================================================');
    console.log('  EJECUTANDO: PORTAFOLIO SIN HEDGE');
    console.log('============================================================\n');

    const resultsWithoutHedge = this.runBacktest(data, false);

    console.log('\n============================================================');
    console.log('  EJECUTANDO: PORTAFOLIO CON HEDGE');
    console.log('============================================================\n');

    const resultsWithHedge = this.runBacktest(data, true);

    // Guardar resultados
    const results = {
      withoutHedge: resultsWithoutHedge,
      withHedge: resultsWithHedge
    };

    writeFileSync(
      'results/portfolio_specialists_comparison.json',
      JSON.stringify(results, null, 2)
    );

    // Mostrar comparación
    this.printComparison(resultsWithoutHedge, resultsWithHedge);

    console.log('\nResultados guardados en: results/portfolio_specialists_comparison.json');

    return results;
  }

  runBacktest(data, withHedge) {
    // Inicializar sistemas especialistas
    const specialists = [
      new LondonNyOverlapSpecialist(),
      new AsianSessionSpecialist(),
      new USSessionOpenSpecialist()
    ];

    const hedgeSystem = withHedge ? new PortfolioHedgeSystem() : null;

    let cumulativePnL = 0;
    let equityPeak = this.initialCapital; // Track equity peak, not PnL peak
    let maxDrawdown = 0;
    const allTrades = [];
    const allPositions = []; // Todas las posiciones abiertas

    // Iterar sobre cada vela
    for (let i = 0; i < data.timestamps.length; i++) {
      // Ejecutar especialistas
      for (const specialist of specialists) {
        const signal = specialist.detect(data, i);
        if (signal) {
          const trade = specialist.execute(signal, data, i);
          if (trade) {
            allPositions.push({
              ...trade,
              specialist: specialist.constructor.name
            });
          }
        }

        // Gestionar posiciones del especialista
        specialist.managePositions(data, i);

        // Agregar trades cerrados a allTrades
        for (const trade of specialist.trades) {
          if (!allTrades.includes(trade)) {
            allTrades.push(trade);
            cumulativePnL += trade.pnl;

            // Actualizar drawdown (CORRECTED: track equity, not PnL)
            const equity = this.initialCapital + cumulativePnL;
            if (equity > equityPeak) equityPeak = equity;
            const drawdown = equityPeak > 0 ? (equityPeak - equity) / equityPeak : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          }
        }
      }

      // Ejecutar hedge si está habilitado
      if (hedgeSystem && withHedge) {
        // Detectar si se necesita hedge
        const hedgeSignal = hedgeSystem.detect(data, i, allTrades, cumulativePnL, allPositions);

        if (hedgeSignal) {
          if (hedgeSignal.type === 'CLOSE_HEDGE') {
            hedgeSystem.execute(hedgeSignal, data, i);
          } else {
            const hedgeTrade = hedgeSystem.execute(hedgeSignal, data, i);
            if (hedgeTrade) {
              allPositions.push({
                ...hedgeTrade,
                specialist: 'HEDGE_SYSTEM'
              });
            }
          }
        }

        // Gestionar posiciones de hedge
        hedgeSystem.managePositions(data, i, cumulativePnL);

        // Agregar trades de hedge a allTrades
        for (const trade of hedgeSystem.trades) {
          if (!allTrades.includes(trade)) {
            allTrades.push(trade);
            cumulativePnL += trade.pnl;

            // Actualizar drawdown (CORRECTED: track equity, not PnL)
            const equity = this.initialCapital + cumulativePnL;
            if (equity > equityPeak) equityPeak = equity;
            const drawdown = equityPeak > 0 ? (equityPeak - equity) / equityPeak : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          }
        }
      }
    }

    // Cerrar posiciones abiertas al final
    if (allPositions.length > 0) {
      for (const pos of allPositions) {
        const lastPrice = data.closes[data.closes.length - 1];
        const pnl = pos.type === 'LONG'
          ? (lastPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - lastPrice) / pos.entryPrice;

        allTrades.push({
          ...pos,
          exitTime: data.timestamps[data.timestamps.length - 1],
          exitPrice: lastPrice,
          pnl,
          success: pnl > 0,
          exitReason: 'FORCE_CLOSE'
        });

        cumulativePnL += pnl;
      }
    }

    // Calcular estadísticas
    return this.calculateStats(allTrades, withHedge);
  }

  calculateStats(trades, withHedge) {
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

    // Recalcular max drawdown (CORRECTED: track equity, not PnL)
    let maxDrawdown = 0;
    let equityPeak = this.initialCapital;
    let cumulative = 0;

    for (const trade of trades) {
      cumulative += trade.pnl;
      const equity = this.initialCapital + cumulative;
      if (equity > equityPeak) equityPeak = equity;
      const drawdown = equityPeak > 0 ? (equityPeak - equity) / equityPeak : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Sharpe Ratio
    const pnlValues = trades.map(t => t.pnl);
    const avgPnLValue = pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length;
    const stdDevPnL = Math.sqrt(
      pnlValues.reduce((sum, val) => sum + Math.pow(val - avgPnLValue, 2), 0) / pnlValues.length
    );
    const sharpeRatio = stdDevPnL === 0 ? 0 : (avgPnLValue / stdDevPnL) * Math.sqrt(252);

    // Agrupar por especialista
    const bySpecialist = {};
    for (const trade of trades) {
      const spec = trade.specialist || 'UNKNOWN';
      if (!bySpecialist[spec]) {
        bySpecialist[spec] = [];
      }
      bySpecialist[spec].push(trade);
    }

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
      bySpecialist
    };
  }

  printComparison(withoutHedge, withHedge) {
    const pct = (val) => (val * 100).toFixed(2);
    const fmt = (val) => val.toLocaleString();

    console.log('============================================================');
    console.log('              COMPARATIVA FINAL');
    console.log('============================================================\n');

    console.log(
      'Métrica'.padEnd(20) +
      'Sin Hedge'.padStart(18) +
      'Con Hedge'.padStart(18) +
      'Diferencia'.padStart(12)
    );

    console.log('─'.repeat(78));

    const pnlDiff = ((withHedge.totalPnL - withoutHedge.totalPnL) * 100).toFixed(1);
    const ddDiff = ((withHedge.maxDrawdown - withoutHedge.maxDrawdown) * 100).toFixed(1);
    const sharpeDiff = (withHedge.sharpeRatio - withoutHedge.sharpeRatio).toFixed(2);

    console.log(
      'Trades'.padEnd(20) +
      fmt(withoutHedge.totalTrades).padStart(18) +
      fmt(withHedge.totalTrades).padStart(18) +
      fmt(withHedge.totalTrades - withoutHedge.totalTrades).padStart(12)
    );

    console.log(
      'Win Rate'.padEnd(20) +
      pct(withoutHedge.winRate) + '%'.padStart(15) +
      pct(withHedge.winRate) + '%'.padStart(15) +
      ((withHedge.winRate - withoutHedge.winRate) * 100).toFixed(1) + '%'.padStart(10)
    );

    console.log(
      'Total PnL'.padEnd(20) +
      pct(withoutHedge.totalPnL) + '%'.padStart(15) +
      pct(withHedge.totalPnL) + '%'.padStart(15) +
      (pnlDiff > 0 ? '+' : '') + pnlDiff + '%'.padStart(10)
    );

    console.log(
      'Max Drawdown'.padEnd(20) +
      pct(withoutHedge.maxDrawdown) + '%'.padStart(15) +
      pct(withHedge.maxDrawdown) + '%'.padStart(15) +
      (ddDiff > 0 ? '+' : '') + ddDiff + '%'.padStart(10)
    );

    console.log(
      'Sharpe Ratio'.padEnd(20) +
      withoutHedge.sharpeRatio.toFixed(2).padStart(18) +
      withHedge.sharpeRatio.toFixed(2).padStart(18) +
      (sharpeDiff > 0 ? '+' : '') + sharpeDiff.padStart(10)
    );

    console.log(
      'Profit Factor'.padEnd(20) +
      withoutHedge.profitFactor.toFixed(2).padStart(18) +
      withHedge.profitFactor.toFixed(2).padStart(18) +
      (withHedge.profitFactor - withoutHedge.profitFactor).toFixed(2).padStart(10)
    );

    console.log('\n=== RENDIMIENTO POR ESPECIALISTA ===');
    console.log('\nSin Hedge:');
    for (const [spec, trades] of Object.entries(withoutHedge.bySpecialist)) {
      const specPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
      console.log(`  ${spec}: ${trades.length} trades, PnL: ${pct(specPnL)}%`);
    }

    console.log('\nCon Hedge:');
    for (const [spec, trades] of Object.entries(withHedge.bySpecialist)) {
      const specPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
      console.log(`  ${spec}: ${trades.length} trades, PnL: ${pct(specPnL)}%`);
    }

    // Veredicto
    const hedgeImprovesDD = withHedge.maxDrawdown < withoutHedge.maxDrawdown;
    const hedgeImprovesSharpe = withHedge.sharpeRatio > withoutHedge.sharpeRatio;
    const hedgeImprovesPnL = withHedge.totalPnL > withoutHedge.totalPnL;

    console.log('\n=== VEREDICTO ===');
    if (hedgeImprovesDD || hedgeImprovesSharpe || hedgeImprovesPnL) {
      console.log('✅ El HEDGE MEJORA el portafolio');
      if (hedgeImprovesDD) console.log('   - Reduce drawdown');
      if (hedgeImprovesSharpe) console.log('   - Mejora Sharpe Ratio');
      if (hedgeImprovesPnL) console.log('   - Aumenta PnL');
    } else {
      console.log('❌ El HEDGE NO MEJORA el portafolio (recomendado no usar)');
    }
  }
}

// Ejecutar
const engine = new PortfolioBacktest();
engine.run();
