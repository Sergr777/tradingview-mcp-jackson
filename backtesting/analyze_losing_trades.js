/**
 * Análisis Detallado de Trades Perdedores
 * Sistemas: MeanReversion OPT, TurtleSoupCTR CORR, VWAP OPT3
 */

import { readFileSync, writeFileSync } from 'fs';
import { existsSync, mkdirSync } from 'fs';

class LosingTradesAnalyzer {
  constructor() {
    this.systems = ['MeanReversionOptimized', 'TurtleSoupCTRCorrected', 'VWAPBounceOpt3Balanced'];
  }

  analyze() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         ANÁLISIS DE TRADES PERDEDORES                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Cargar resultados
    const results = this.loadResults();

    // Analizar cada sistema
    for (const systemName of this.systems) {
      console.log(`\n╔════════════════════════════════════════════════════════════╗`);
      console.log(`║  ${systemName.padEnd(55)} ║`);
      console.log('╚════════════════════════════════════════════════════════════╝\n');

      const analysis = this.analyzeSystem(results[systemName]);
      this.printAnalysis(systemName, analysis);
    }

    // Comparación cross-sistema
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              COMPARATIVA CROSS-SISTEMA                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    this.printCrossSystemComparison(results);

    // Guardar análisis completo
    const fullAnalysis = this.generateFullReport(results);
    this.saveReport(fullAnalysis);

    console.log('\n💾 Análisis guardado en: backtesting/analysis/losing_trades_analysis.md');
  }

  loadResults() {
    const results = {};

    // MeanReversion OPT
    const mrResults = JSON.parse(readFileSync('backtesting/results/backtest_results_v2.json'));
    results['MeanReversionOptimized'] = mrResults.MeanReversionOptimized;

    // TurtleSoupCTR CORR
    const tsResults = JSON.parse(readFileSync('backtesting/results/turtle_soup_corrected_results.json'));
    results['TurtleSoupCTRCorrected'] = tsResults.stats;
    results['TurtleSoupCTRCorrected'].trades = tsResults.trades;

    // VWAP OPT3
    const vwapResults = JSON.parse(readFileSync('backtesting/results/vwap_bounce_comparison.json'));
    results['VWAPBounceOpt3Balanced'] = vwapResults.OPT3_BALANCED;

    return results;
  }

  analyzeSystem(systemData) {
    const trades = systemData.trades;
    const losingTrades = trades.filter(t => !t.success);
    const winningTrades = trades.filter(t => t.success);

    const analysis = {
      total: trades.length,
      winning: winningTrades.length,
      losing: losingTrades.length,
      losingByReason: {},
      losingByType: { LONG: 0, SHORT: 0 },
      avgLoss: 0,
      medianLoss: 0,
      maxLoss: 0,
      minLoss: 0,
      stdDevLoss: 0,
      avgDuration: 0,
      avgDurationByReason: {},
      lossesBySize: {
        tiny: 0,    // < 0.1%
        small: 0,   // 0.1% - 0.2%
        medium: 0,  // 0.2% - 0.3%
        large: 0,   // 0.3% - 0.5%
        huge: 0     // > 0.5%
      },
      nearMisses: 0,  // Trades que perdieron < 0.1%
      catastrophicLosses: 0,  // Trades que perdieron > 1%
      timeDecay: 0,  // Pérdidas por TIME_EXIT
      stopLossHits: 0,  // Pérdidas por STOP_LOSS
      worstHours: [],
      bestHours: [],
      hourlyLossRate: {},
      lossesByMonth: {},
      avgWinVsAvgLoss: 0,
      profitFactorWithoutWorst: 0,
      lossesClusterAnalysis: {}
    };

    // Análisis por razón de salida
    for (const trade of losingTrades) {
      const reason = trade.exitReason;

      if (!analysis.losingByReason[reason]) {
        analysis.losingByReason[reason] = [];
      }
      analysis.losingByReason[reason].push(trade);

      // Por tipo
      if (trade.type === 'LONG') {
        analysis.losingByType.LONG++;
      } else {
        analysis.losingByType.SHORT++;
      }

      // Duración promedio por razón
      if (!analysis.avgDurationByReason[reason]) {
        analysis.avgDurationByReason[reason] = { sum: 0, count: 0 };
      }
      analysis.avgDurationByReason[reason].sum += trade.duration || 0;
      analysis.avgDurationByReason[reason].count++;
    }

    // Estadísticas de pérdida
    const losses = losingTrades.map(t => Math.abs(t.pnl));
    analysis.avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    analysis.maxLoss = Math.max(...losses);
    analysis.minLoss = Math.min(...losses);

    // Mediana
    const sorted = losses.sort((a, b) => a - b);
    analysis.medianLoss = sorted[Math.floor(sorted.length / 2)];

    // Desviación estándar
    const mean = analysis.avgLoss;
    analysis.stdDevLoss = Math.sqrt(
      losses.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / losses.length
    );

    // Duración promedio
    const durations = losingTrades.map(t => t.duration || 0).filter(d => d > 0);
    analysis.avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Promedio de duración por razón
    for (const reason in analysis.avgDurationByReason) {
      const data = analysis.avgDurationByReason[reason];
      data.avg = data.sum / data.count;
    }

    // Clasificación por tamaño
    for (const loss of losses) {
      const lossPct = loss * 100;
      if (lossPct < 0.1) analysis.lossesBySize.tiny++;
      else if (lossPct < 0.2) analysis.lossesBySize.small++;
      else if (lossPct < 0.3) analysis.lossesBySize.medium++;
      else if (lossPct < 0.5) analysis.lossesBySize.large++;
      else analysis.lossesBySize.huge++;
    }

    // Near misses y catastrophic losses
    analysis.nearMisses = losses.filter(l => l * 100 < 0.1).length;
    analysis.catastrophicLosses = losses.filter(l => l * 100 > 1.0).length;

    // TIME_EXIT vs STOP_LOSS
    analysis.timeDecay = (analysis.losingByReason['TIME_EXIT'] || []).length;
    analysis.stopLossHits = (analysis.losingByReason['STOP_LOSS'] || []).length;

    // Análisis por hora del día
    analysis.hourlyLossRate = this.analyzeByHour(losingTrades);

    // Análisis por mes
    analysis.lossesByMonth = this.analyzeByMonth(losingTrades);

    // Comparación ganadores vs perdedores
    const wins = winningTrades.map(t => t.pnl);
    const avgWin = wins.reduce((a, b) => a + b, 0) / wins.length;
    analysis.avgWinVsAvgLoss = avgWin / analysis.avgLoss;

    // Profit factor sin el 10% peor de trades
    const sortedTrades = [...trades].sort((a, b) => b.pnl - a.pnl);
    const worst10 = Math.floor(trades.length * 0.1);
    const withoutWorst = sortedTrades.slice(0, trades.length - worst10);
    const grossProfit = withoutWorst.filter(t => t.success).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(withoutWorst.filter(t => !t.success).reduce((s, t) => s + t.pnl, 0));
    analysis.profitFactorWithoutWorst = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

    return analysis;
  }

  analyzeByHour(losingTrades) {
    const hourlyData = {};

    for (const trade of losingTrades) {
      const date = new Date(trade.entryTime);
      const hour = date.getHours();

      if (!hourlyData[hour]) {
        hourlyData[hour] = { count: 0, totalLoss: 0 };
      }

      hourlyData[hour].count++;
      hourlyData[hour].totalLoss += Math.abs(trade.pnl);
    }

    // Ordenar por pérdida total
    const sorted = Object.entries(hourlyData)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        ...data,
        avgLoss: data.totalLoss / data.count
      }))
      .sort((a, b) => b.totalLoss - a.totalLoss);

    return {
      worst5: sorted.slice(0, 5),
      best5: sorted.slice(-5).reverse(),
      hourly: hourlyData
    };
  }

  analyzeByMonth(losingTrades) {
    const monthlyData = {};

    for (const trade of losingTrades) {
      const date = new Date(trade.entryTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { count: 0, totalLoss: 0 };
      }

      monthlyData[monthKey].count++;
      monthlyData[monthKey].totalLoss += Math.abs(trade.pnl);
    }

    return monthlyData;
  }

  printAnalysis(systemName, analysis) {
    const pct = (val) => (val * 100).toFixed(2);
    const fmt = (val) => val.toLocaleString();

    console.log('📊 ESTADÍSTICAS GENERALES DE PÉRDIDAS:');
    console.log(`   Total Trades: ${fmt(analysis.total)}`);
    console.log(`   Ganadores: ${fmt(analysis.winning)} (${pct(analysis.winning / analysis.total)}%)`);
    console.log(`   Perdedores: ${fmt(analysis.losing)} (${pct(analysis.losing / analysis.total)}%)`);
    console.log('');

    console.log('💰 TAMAÑO DE PÉRDIDAS:');
    console.log(`   Pérdida Promedio: ${pct(analysis.avgLoss)}%`);
    console.log(`   Pérdida Mediana: ${pct(analysis.medianLoss)}%`);
    console.log(`   Pérdida Máxima: ${pct(analysis.maxLoss)}%`);
    console.log(`   Pérdida Mínima: ${pct(analysis.minLoss)}%`);
    console.log(`   Desviación Estándar: ${pct(analysis.stdDevLoss)}%`);
    console.log('');

    console.log('📉 DISTRIBUCIÓN POR TAMAÑO:');
    console.log(`   Tiny (< 0.1%): ${fmt(analysis.lossesBySize.tiny)} (${pct(analysis.lossesBySize.tiny / analysis.losing)}%)`);
    console.log(`   Small (0.1-0.2%): ${fmt(analysis.lossesBySize.small)} (${pct(analysis.lossesBySize.small / analysis.losing)}%)`);
    console.log(`   Medium (0.2-0.3%): ${fmt(analysis.lossesBySize.medium)} (${pct(analysis.lossesBySize.medium / analysis.losing)}%)`);
    console.log(`   Large (0.3-0.5%): ${fmt(analysis.lossesBySize.large)} (${pct(analysis.lossesBySize.large / analysis.losing)}%)`);
    console.log(`   Huge (> 0.5%): ${fmt(analysis.lossesBySize.huge)} (${pct(analysis.lossesBySize.huge / analysis.losing)}%)`);
    console.log('');

    console.log('🎯 NEAR MISSES & CATASTROPHIC:');
    console.log(`   Near Misses (< 0.1%): ${fmt(analysis.nearMisses)} (${pct(analysis.nearMisses / analysis.losing)}%)`);
    console.log(`   Catastrophic (> 1.0%): ${fmt(analysis.catastrophicLosses)} (${pct(analysis.catastrophicLosses / analysis.losing)}%)`);
    console.log('');

    console.log('⏱️  RAZONES DE SALIDA:');
    for (const [reason, trades] of Object.entries(analysis.losingByReason)) {
      const count = trades.length;
      const pctVal = (count / analysis.losing * 100).toFixed(1);
      const avgDur = analysis.avgDurationByReason[reason]?.avg.toFixed(0) || 'N/A';

      console.log(`   ${reason}: ${fmt(count)} (${pctVal}%) - Duración prom: ${avgDur} períodos`);
    }
    console.log('');

    console.log('📊 LONG vs SHORT:');
    console.log(`   LONG perdedores: ${fmt(analysis.losingByType.LONG)} (${pct(analysis.losingByType.LONG / analysis.losing)}%)`);
    console.log(`   SHORT perdedores: ${fmt(analysis.losingByType.SHORT)} (${pct(analysis.losingByType.SHORT / analysis.losing)}%)`);
    console.log('');

    console.log('⏰ PEORES HORAS (mayor pérdida acumulada):');
    for (const hour of analysis.hourlyLossRate.worst5.slice(0, 3)) {
      console.log(`   ${hour.hour}:00 - ${fmt(hour.count)} trades, pérdida total: ${pct(hour.totalLoss)}%, prom: ${pct(hour.avgLoss)}%`);
    }
    console.log('');

    console.log('📈 RATIO GANADOR/PERDEDOR:');
    console.log(`   Avg Win / Avg Loss: ${analysis.avgWinVsAvgLoss.toFixed(2)}x`);
    console.log(`   Profit Factor sin 10% peor: ${analysis.profitFactorWithoutWorst.toFixed(2)}`);
    console.log('');
  }

  printCrossSystemComparison(results) {
    const comparison = {};

    for (const [name, data] of Object.entries(results)) {
      const losingTrades = data.trades.filter(t => !t.success);
      const losses = losingTrades.map(t => Math.abs(t.pnl));

      comparison[name] = {
        losingCount: losingTrades.length,
        losingPct: (losingTrades.length / data.trades.length * 100).toFixed(1),
        avgLoss: (losses.reduce((a, b) => a + b, 0) / losses.length * 100).toFixed(2),
        maxLoss: (Math.max(...losses) * 100).toFixed(2),
        stopLossRate: (losingTrades.filter(t => t.exitReason === 'STOP_LOSS').length / losingTrades.length * 100).toFixed(1),
        timeExitRate: (losingTrades.filter(t => t.exitReason === 'TIME_EXIT').length / losingTrades.length * 100).toFixed(1)
      };
    }

    console.log(
      'Sistema'.padEnd(30) +
      'Perdedores'.padStart(12) +
      'Avg Loss'.padStart(12) +
      'Max Loss'.padStart(12) +
      'SL Rate'.padStart(10) +
      'TE Rate'.padStart(10)
    );

    console.log('─'.repeat(98));

    for (const [name, stats] of Object.entries(comparison)) {
      console.log(
        name.padEnd(30) +
        `${stats.losingCount} (${stats.losingPct}%)`.padStart(12) +
        `${stats.avgLoss}%`.padStart(12) +
        `${stats.maxLoss}%`.padStart(12) +
        `${stats.stopLossRate}%`.padStart(10) +
        `${stats.timeExitRate}%`.padStart(10)
      );
    }
  }

  generateFullReport(results) {
    let report = '# 📉 ANÁLISIS DETALLADO DE TRADES PERDEDORES\n\n';
    report += '**Fecha:** 2026-04-11\n';
    report += '**Sistemas Analizados:** 3 (MeanReversion OPT, TurtleSoupCTR CORR, VWAP OPT3)\n\n';
    report += '---\n\n';

    for (const [systemName, data] of Object.entries(results)) {
      const losingTrades = data.trades.filter(t => !t.success);
      const losses = losingTrades.map(t => Math.abs(t.pnl));

      report += `## 🔴 ${systemName}\n\n`;

      report += '### Estadísticas Generales\n\n';
      report += `- **Total Trades:** ${data.trades.length.toLocaleString()}\n`;
      report += `- **Trades Perdedores:** ${losingTrades.length.toLocaleString()} (${(losingTrades.length / data.trades.length * 100).toFixed(1)}%)\n`;
      report += `- **Pérdida Promedio:** ${(losses.reduce((a, b) => a + b, 0) / losses.length * 100).toFixed(2)}%\n`;
      report += `- **Pérdida Máxima:** ${(Math.max(...losses) * 100).toFixed(2)}%\n`;
      report += `- **Pérdida Mediana:** ${(losses.sort((a, b) => a - b)[Math.floor(losses.length / 2)] * 100).toFixed(2)}%\n\n`;

      report += '### Razones de Salida\n\n';
      const reasons = {};
      for (const trade of losingTrades) {
        reasons[trade.exitReason] = (reasons[trade.exitReason] || 0) + 1;
      }

      for (const [reason, count] of Object.entries(reasons)) {
        const pct = (count / losingTrades.length * 100).toFixed(1);
        report += `- **${reason}:** ${count.toLocaleString()} (${pct}%)\n`;
      }

      report += '\n---\n\n';
    }

    return report;
  }

  saveReport(report) {
    const dir = 'backtesting/analysis';

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(`${dir}/losing_trades_analysis.md`, report);
  }
}

// Ejecutar análisis
const analyzer = new LosingTradesAnalyzer();
analyzer.analyze();
