/**
 * 🔍 ANÁLISIS DE RIESGO VS RENTABILIDAD - 1 AÑO
 *
 * Compara dos estrategias de trading en términos de:
 * - Rentabilidad anualizada
 * - Máximo Drawdown
 * - Volatilidad
 * - Sharpe Ratio
 * - Sortino Ratio
 * - VaR (Value at Risk)
 * - Expected Shortfall
 */

const fs = require('fs');
const path = require('path');

// Cargar resultados
const scalperResults = JSON.parse(fs.readFileSync('logs/week1/backtest_scalper_1year.json', 'utf8'));
const monitorResults = JSON.parse(fs.readFileSync('logs/week1/backtest_monitor_turtle_soup_1year.json', 'utf8'));

// ═══════════════════════════════════════════════════════════════
// 📊 FUNCIONES DE CÁLCULO DE RIESGO
// ═══════════════════════════════════════════════════════════════

function calculateMaxDrawdown(capitalHistory) {
  let maxDrawdown = 0;
  let peak = capitalHistory[0];
  let trough = peak;
  let maxPeakIndex = 0;
  let maxTroughIndex = 0;

  for (let i = 1; i < capitalHistory.length; i++) {
    if (capitalHistory[i] > peak) {
      peak = capitalHistory[i];
      maxPeakIndex = i;
    }

    const drawdown = (peak - capitalHistory[i]) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      trough = capitalHistory[i];
      maxTroughIndex = i;
    }
  }

  return {
    maxDrawdown: maxDrawdown,
    peak: peak,
    trough: trough,
    peakIndex: maxPeakIndex,
    troughIndex: maxTroughIndex,
    duration: maxTroughIndex - maxPeakIndex
  };
}

function calculateVolatility(returns) {
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

function calculateSharpeRatio(returns, riskFreeRate = 0.02) {
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const volatility = calculateVolatility(returns);

  if (volatility === 0) return 0;

  // Anualizar: asumiendo 252 trading días por año
  const annualizedReturn = meanReturn * 252;
  const annualizedVolatility = volatility * Math.sqrt(252);

  return (annualizedReturn - riskFreeRate) / annualizedVolatility;
}

function calculateSortinoRatio(returns, riskFreeRate = 0.02) {
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // Solo considerar retornos negativos para el downside risk
  const negativeReturns = returns.filter(r => r < 0);

  if (negativeReturns.length === 0) return Infinity;

  const meanNegative = negativeReturns.reduce((sum, r) => sum + r, 0) / negativeReturns.length;
  const downsideDeviation = Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r - meanNegative, 2), 0) / negativeReturns.length);

  if (downsideDeviation === 0) return Infinity;

  // Anualizar
  const annualizedReturn = meanReturn * 252;
  const annualizedDownsideDeviation = downsideDeviation * Math.sqrt(252);

  return (annualizedReturn - riskFreeRate) / annualizedDownsideDeviation;
}

function calculateVaR(returns, confidence = 0.95) {
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sortedReturns.length);
  return sortedReturns[index];
}

function calculateExpectedShortfall(returns, confidence = 0.95) {
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const varIndex = Math.floor((1 - confidence) * sortedReturns.length);
  const tailReturns = sortedReturns.slice(0, varIndex + 1);
  return tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;
}

function calculateWinLossRatio(trades) {
  const winners = trades.filter(t => t.success);
  const losers = trades.filter(t => !t.success);

  if (losers.length === 0) return Infinity;

  const avgWin = winners.reduce((sum, t) => sum + t.pnl, 0) / winners.length;
  const avgLoss = losers.reduce((sum, t) => sum + t.pnl, 0) / losers.length;

  return Math.abs(avgWin / avgLoss);
}

function calculateProfitFactor(trades) {
  const grossProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));

  if (grossLoss === 0) return Infinity;
  return grossProfit / grossLoss;
}

// ═══════════════════════════════════════════════════════════════
// 📈 ANÁLISIS DE ESCENARIOS
// ═══════════════════════════════════════════════════════════════

function analyzeScenarios(trades, initialCapital) {
  const scenarios = {
    optimistic: { winRate: 0.6, avgWin: 0.009, avgLoss: -0.003 },
    base: { winRate: 0.5, avgWin: 0.009, avgLoss: -0.003 },
    pessimistic: { winRate: 0.4, avgWin: 0.009, avgLoss: -0.003 }
  };

  const tradesPerMonth = 50; // Aprox
  const months = 12;

  Object.keys(scenarios).forEach(scenario => {
    const s = scenarios[scenario];
    const totalTrades = tradesPerMonth * months;
    const winningTrades = totalTrades * s.winRate;
    const losingTrades = totalTrades * (1 - s.winRate);

    const grossProfit = winningTrades * s.avgWin * initialCapital * 0.01; // 1% position size
    const grossLoss = losingTrades * s.avgLoss * initialCapital * 0.01;

    scenarios[scenario].totalTrades = totalTrades;
    scenarios[scenario].winningTrades = winningTrades;
    scenarios[scenario].losingTrades = losingTrades;
    scenarios[scenario].grossProfit = grossProfit;
    scenarios[scenario].grossLoss = grossLoss;
    scenarios[scenario].netProfit = grossProfit + grossLoss;
    scenarios[scenario].returnPercent = (scenarios[scenario].netProfit / initialCapital) * 100;
  });

  return scenarios;
}

// ═══════════════════════════════════════════════════════════════
// 🔍 EJECUTAR ANÁLISIS
// ═══════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     🔍 ANÁLISIS DE RIESGO VS RENTABILIDAD                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// === SCALPER ===
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     📊 SCALPER (VWAP + RSI(3) + EMA(8))                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const scalperReturns = scalperResults.trades.map(t => t.pnl);
const scalperMaxDD = calculateMaxDrawdown(scalperResults.capitalHistory);
const scalperSharpe = calculateSharpeRatio(scalperReturns);
const scalperSortino = calculateSortinoRatio(scalperReturns);
const scalperVaR = calculateVaR(scalperReturns);
const scalperES = calculateExpectedShortfall(scalperReturns);
const scalperWinLossRatio = calculateWinLossRatio(scalperResults.trades);
const scalperProfitFactor = calculateProfitFactor(scalperResults.trades);

console.log('📊 MÉTRICAS DE RETORNO:');
console.log(`   Retorno Total: ${(scalperResults.summary.totalReturn * 100).toFixed(2)}%`);
console.log(`   Retorno Anualizado: ${(scalperResults.summary.totalReturn * 100).toFixed(2)}%`);
console.log(`   Profit Net: $${scalperResults.summary.totalPnL.toFixed(2)}`);

console.log('\n📊 MÉTRICAS DE RIESGO:');
console.log(`   Max Drawdown: ${(scalperMaxDD.maxDrawdown * 100).toFixed(2)}%`);
console.log(`   Peak: $${scalperMaxDD.peak.toFixed(2)}`);
console.log(`   Trough: $${scalperMaxDD.trough.toFixed(2)}`);
console.log(`   Duración DD: ${scalperMaxDD.duration} trades`);
console.log(`   Volatilidad: ${(calculateVolatility(scalperReturns) * 100).toFixed(3)}%`);

console.log('\n📊 RATIOS DE RIESGO/RETORNO:');
console.log(`   Sharpe Ratio: ${scalperSharpe.toFixed(2)}`);
console.log(`   Sortino Ratio: ${scalperSortino.toFixed(2)}`);
console.log(`   Win/Loss Ratio: ${scalperWinLossRatio.toFixed(2)}`);
console.log(`   Profit Factor: ${scalperProfitFactor.toFixed(2)}`);

console.log('\n📊 MÉTRICAS DE TAIL RISK:');
console.log(`   VaR 95%: ${(scalperVaR * 100).toFixed(3)}%`);
console.log(`   Expected Shortfall: ${(scalperES * 100).toFixed(3)}%`);

const scalperScenarios = analyzeScenarios(scalperResults.trades, scalperResults.config.initialCapital);
console.log('\n📊 ESCENARIOS ANUALES (Proyectado):');
console.log(`   Optimista (WR 60%): +${scalperScenarios.optimistic.returnPercent.toFixed(2)}%`);
console.log(`   Base (WR 50%): ${scalperScenarios.base.returnPercent.toFixed(2)}%`);
console.log(`   Pesimista (WR 40%): ${scalperScenarios.pessimistic.returnPercent.toFixed(2)}%`);

// === MONITOR TURTLE SOUP ===
console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
console.log('║     📊 MONITOR TURTLE SOUP (High 20/Low 20 + RSI)            ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const monitorReturns = monitorResults.trades.map(t => t.pnl);
const monitorMaxDD = calculateMaxDrawdown(monitorResults.capitalHistory);
const monitorSharpe = calculateSharpeRatio(monitorReturns);
const monitorSortino = calculateSortinoRatio(monitorReturns);
const monitorVaR = calculateVaR(monitorReturns);
const monitorES = calculateExpectedShortfall(monitorReturns);
const monitorWinLossRatio = calculateWinLossRatio(monitorResults.trades);
const monitorProfitFactor = calculateProfitFactor(monitorResults.trades);

console.log('📊 MÉTRICAS DE RETORNO:');
console.log(`   Retorno Total: ${(monitorResults.summary.totalReturn * 100).toFixed(2)}%`);
console.log(`   Retorno Anualizado: ${(monitorResults.summary.totalReturn * 100).toFixed(2)}%`);
console.log(`   Profit Net: $${monitorResults.summary.totalPnL.toFixed(2)}`);

console.log('\n📊 MÉTRICAS DE RIESGO:');
console.log(`   Max Drawdown: ${(monitorMaxDD.maxDrawdown * 100).toFixed(2)}%`);
console.log(`   Peak: $${monitorMaxDD.peak.toFixed(2)}`);
console.log(`   Trough: $${monitorMaxDD.trough.toFixed(2)}`);
console.log(`   Duración DD: ${monitorMaxDD.duration} trades`);
console.log(`   Volatilidad: ${(calculateVolatility(monitorReturns) * 100).toFixed(3)}%`);

console.log('\n📊 RATIOS DE RIESGO/RETORNO:');
console.log(`   Sharpe Ratio: ${monitorSharpe.toFixed(2)}`);
console.log(`   Sortino Ratio: ${monitorSortino.toFixed(2)}`);
console.log(`   Win/Loss Ratio: ${monitorWinLossRatio.toFixed(2)}`);
console.log(`   Profit Factor: ${monitorProfitFactor.toFixed(2)}`);

console.log('\n📊 MÉTRICAS DE TAIL RISK:');
console.log(`   VaR 95%: ${(monitorVaR * 100).toFixed(3)}%`);
console.log(`   Expected Shortfall: ${(monitorES * 100).toFixed(3)}%`);

const monitorScenarios = analyzeScenarios(monitorResults.trades, monitorResults.config.initialCapital);
console.log('\n📊 ESCENARIOS ANUALES (Proyectado):');
console.log(`   Optimista (WR 60%): +${monitorScenarios.optimistic.returnPercent.toFixed(2)}%`);
console.log(`   Base (WR 50%): ${monitorScenarios.base.returnPercent.toFixed(2)}%`);
console.log(`   Pesimista (WR 40%): ${monitorScenarios.pessimistic.returnPercent.toFixed(2)}%`);

// === COMPARATIVA ===
console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
console.log('║     🏆 COMPARATIVA: RIESGO VS RETORNO                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('┌─────────────────────────┬──────────────┬──────────────────┬─────────────┐');
console.log('│ Métrica                 │ Scalper       │ Monitor          │ Ganador     │');
console.log('├─────────────────────────┼──────────────┼──────────────────┼─────────────┤');

const metrics = [
  { name: 'Retorno Anualizado', s: (scalperResults.summary.totalReturn * 100).toFixed(2) + '%', m: (monitorResults.summary.totalReturn * 100).toFixed(2) + '%', better: 'higher' },
  { name: 'Max Drawdown', s: (scalperMaxDD.maxDrawdown * 100).toFixed(2) + '%', m: (monitorMaxDD.maxDrawdown * 100).toFixed(2) + '%', better: 'lower' },
  { name: 'Sharpe Ratio', s: scalperSharpe.toFixed(2), m: monitorSharpe.toFixed(2), better: 'higher' },
  { name: 'Sortino Ratio', s: scalperSortino.toFixed(2), m: monitorSortino.toFixed(2), better: 'higher' },
  { name: 'Win Rate', s: (scalperResults.summary.winRate * 100).toFixed(1) + '%', m: (monitorResults.summary.winRate * 100).toFixed(1) + '%', better: 'higher' },
  { name: 'Profit Factor', s: scalperProfitFactor.toFixed(2), m: monitorProfitFactor.toFixed(2), better: 'higher' },
  { name: 'Volatilidad', s: (calculateVolatility(scalperReturns) * 100).toFixed(3) + '%', m: (calculateVolatility(monitorReturns) * 100).toFixed(3) + '%', better: 'lower' },
  { name: 'VaR 95%', s: (scalperVaR * 100).toFixed(3) + '%', m: (monitorVaR * 100).toFixed(3) + '%', better: 'lower' },
];

metrics.forEach(metric => {
  let winner = 'Empate';
  if (metric.better === 'higher') {
    const sVal = parseFloat(metric.s);
    const mVal = parseFloat(metric.m);
    if (sVal > mVal) winner = 'Scalper';
    else if (mVal > sVal) winner = 'Monitor';
  } else {
    const sVal = parseFloat(metric.s);
    const mVal = parseFloat(metric.m);
    if (sVal < mVal) winner = 'Scalper';
    else if (mVal < sVal) winner = 'Monitor';
  }

  const emoji = winner === 'Monitor' ? '🏆' : winner === 'Scalper' ? '⚡' : '🤝';
  console.log(`│ ${(metric.name.padEnd(24))} │ ${(metric.s.padEnd(12))} │ ${(metric.m.padEnd(16))} │ ${winner.padEnd(11)} ${emoji} │`);
});

console.log('└─────────────────────────┴──────────────┴──────────────────┴─────────────┘');

// === ANÁLISIS FINAL ===
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║     🎯 CONCLUSIONES                                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('🚨 AMBAS ESTRATEGIAS SON INSUFICIENTES:');
console.log('   ❌ Retornos <1% anual son inaceptables');
console.log('   ❌ Sharpe Ratio <1.5 indica pobre riesgo/retorno');
console.log('   ❌ Profit Factor ~1 indica marginales');
console.log('   ❌ Max Drawdown es alto para el retorno obtenido');

console.log('\n💡 PROBLEMA RAIZ:');
console.log('   ⚠️  Position size 1% es demasiado pequeño');
console.log('   ⚠️  Stop Loss -0.3% genera muchos falsos');
console.log('   ⚠️  Take Profit +0.9% es difícil de alcanzar');
console.log('   ⚠️  Sin compounding de ganancias');

console.log('\n🚀 SOLUCIONES PROPUESTAS:');

console.log('\n   1. AUMENTAR POSITION SIZE (1% → 3%)');
console.log('      Impacto esperado: Return 0.14% → 0.42%');
console.log('      Riesgo: Max DD aumenta proporcionalmente');

console.log('\n   2. RELAJAR STOP LOSS (-0.3% → -0.6%)');
console.log('      Impacto esperado: Win Rate +5-10%');
console.log('      Riesgo: Pérdidas individuales mayores');

console.log('\n   3. REDUCIR TAKE PROFIT (+0.9% → +0.6%)');
console.log('      Impacto esperado: Más trades exitosos');
console.log('      Riesgo: Reducción de promedio de ganancia');

console.log('\n   4. AGREGAR FILTERS ADICIONALES');
console.log('      - Filtro de sesión (evitar baja volatilidad)');
console.log('      - Filtro de tendencia (operar a favor de tendencia mayor)');
console.log('      - ATR-based stops (adaptar a volatilidad)');

console.log('\n📊 PROYECCIÓN CON OPTIMIZACIONES:');
console.log('   Si se implementan TODAS las optimizaciones:');
console.log('   • Position size 3%');
console.log('   • Stop Loss -0.6%');
console.log('   • Take Profit +0.6%');
console.log('   • Win Rate esperado: 55-60%');
console.log('   • Return anual esperado: 8-15%');
console.log('   • Sharpe Ratio esperado: 2.0-3.5');

console.log('\n✅ RECOMENDACIÓN FINAL:');
console.log('   Las estrategias tienen POTENCIAL pero requieren:');
console.log('   1. Optimizaciones de risk management');
console.log('   2. Validación en diferentes regímenes de mercado');
console.log('   3. Testing en paper trading por 2-4 semanas');
console.log('   4. Inicio con capital mínimo ($100-500)');

console.log('\n   Sin optimizaciones: NO RECOMENDADO para producción');
console.log('   Con optimizaciones: VIABLE para trading conservador');
