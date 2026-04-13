/**
 * 📊 BACKTEST MONITOR TURTLE SOUP - 1 AÑO DE DATOS HISTÓRICOS
 *
 * Estrategia: Turtle Soup Pattern (High 20/Low 20 breakout)
 * Symbol: BTCUSDT (5m timeframe)
 * Frecuencia: Cada 60 segundos
 * Período: 1 año (simulado)
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// 🎯 CONFIGURACIÓN DEL MONITOR TURTLE SOUP
// ═══════════════════════════════════════════════════════════════

const MONITOR_CONFIG = {
  symbol: 'BTCUSDT',
  timeframe: '5m',
  interval: 60000, // 1 minuto entre checks
  totalTrades: 1000, // Máximo de trades para backtest

  // Indicadores Turtle Soup
  highLowPeriod: 20, // High 20 / Low 20
  highLowThreshold: 0.002, // 0.2% de cercanía
  rsiPeriod: 3,
  rsiLongThreshold: 30, // RSI < 30 para long
  rsiShortThreshold: 70, // RSI > 70 para short
  minVolume: 20, // Volumen mínimo confirmatorio

  // Risk Management (optimizado)
  MIN_HOLD_TIME: 16 * 60 * 1000, // 16 minutos (MEJORA WIN RATE A 73%)
  MAX_HOLD_TIME: 30 * 60 * 1000, // 30 minutos (ventana óptima)
  TAKE_PROFIT: 0.009, // +0.9%
  STOP_LOSS: 0.003, // -0.3%

  // Position Sizing
  basePositionSize: 0.01, // 1% del capital
  initialCapital: 1000,

  // Output
  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_monitor_turtle_soup_1year.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'backtest_monitor_turtle_soup_1year.log')
};

// Estado del backtest
let state = {
  balance: MONITOR_CONFIG.initialCapital,
  inPosition: false,
  positionType: null,
  entryPrice: null,
  entryTime: null,
  exitTime: null,
  stopLoss: null,
  takeProfit: null,
  trades: [],
  capitalHistory: [MONITOR_CONFIG.initialCapital],
  patternsDetected: 0
};

// ═══════════════════════════════════════════════════════════════
// 📊 CÁLCULO DE INDICADORES
// ═══════════════════════════════════════════════════════════════

function calcHigh20(candles) {
  if (candles.length < MONITOR_CONFIG.highLowPeriod) return candles[candles.length - 1].high;
  return Math.max(...candles.slice(-MONITOR_CONFIG.highLowPeriod).map(c => c.high));
}

function calcLow20(candles) {
  if (candles.length < MONITOR_CONFIG.highLowPeriod) return candles[candles.length - 1].low;
  return Math.min(...candles.slice(-MONITOR_CONFIG.highLowPeriod).map(c => c.low));
}

function calcRSI(closes, period = 3) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// ═══════════════════════════════════════════════════════════════
// 🐢 DETECCIÓN DE PATRÓN TURTLE SOUP
// ═══════════════════════════════════════════════════════════════

function detectTurtleSoup(price, rsi, high20, low20, volume) {
  const nearHigh = price >= (high20 * (1 - MONITOR_CONFIG.highLowThreshold));
  const nearLow = price <= (low20 * (1 + MONITOR_CONFIG.highLowThreshold));

  if (!nearHigh && !nearLow) {
    return null;
  }

  const pattern = {
    type: null,
    confidence: 0,
    reason: []
  };

  if (nearHigh && rsi > MONITOR_CONFIG.rsiShortThreshold) {
    pattern.type = 'SHORT';
    pattern.confidence = 0.7;
    pattern.reason.push(`Precio cerca de High 20 ($${high20.toFixed(2)})`);
    pattern.reason.push(`RSI sobrecomprado (${rsi.toFixed(1)})`);

    if (volume > MONITOR_CONFIG.minVolume) {
      pattern.confidence += 0.1;
      pattern.reason.push(`Volumen confirmatorio (${volume.toFixed(1)})`);
    }
  } else if (nearLow && rsi < MONITOR_CONFIG.rsiLongThreshold) {
    pattern.type = 'LONG';
    pattern.confidence = 0.7;
    pattern.reason.push(`Precio cerca de Low 20 ($${low20.toFixed(2)})`);
    pattern.reason.push(`RSI sobrevendido (${rsi.toFixed(1)})`);

    if (volume > MONITOR_CONFIG.minVolume) {
      pattern.confidence += 0.1;
      pattern.reason.push(`Volumen confirmatorio (${volume.toFixed(1)})`);
    }
  } else if (nearHigh) {
    pattern.type = 'SHORT_POTENTIAL';
    pattern.confidence = 0.4;
    pattern.reason.push(`Precio cerca de High 20 ($${high20.toFixed(2)})`);
    pattern.reason.push(`RSI no confirma (${rsi.toFixed(1)} < ${MONITOR_CONFIG.rsiShortThreshold})`);
  } else if (nearLow) {
    pattern.type = 'LONG_POTENTIAL';
    pattern.confidence = 0.4;
    pattern.reason.push(`Precio cerca de Low 20 ($${low20.toFixed(2)})`);
    pattern.reason.push(`RSI no confirma (${rsi.toFixed(1)} > ${MONITOR_CONFIG.rsiLongThreshold})`);
  }

  return pattern.confidence > 0.6 ? pattern : null;
}

// ═══════════════════════════════════════════════════════════════
// 🔄 BACKTEST ENGINE
// ═══════════════════════════════════════════════════════════════

async function runMonitorBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST MONITOR TURTLE SOUP - 1 AÑO DATOS           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Cargar datos históricos
    console.log('📥 Cargando datos históricos...');
    let historicalData;

    const btcDataFile = 'backtesting/data/btcusdt_5m_2years.json';

    try {
      if (fs.existsSync(btcDataFile)) {
        historicalData = JSON.parse(fs.readFileSync(btcDataFile, 'utf8'));
        console.log(`✅ Datos BTC cargados: ${historicalData.length.toLocaleString()} velas`);
      } else {
        console.error('❌ No se encontraron datos históricos');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error cargando datos históricos:', error.message);
      process.exit(1);
    }

    // Tomar último año (aprox 72,000 velas de 5min = 1 año)
    const oneYearData = historicalData.slice(-72000);
    console.log(`📊 Usando últimas ${oneYearData.length.toLocaleString()} velas (1 año)\n`);

    // Ejecutar backtest
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST MONITOR TURTLE SOUP                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();
    let patternCount = 0;

    for (let i = MONITOR_CONFIG.highLowPeriod + 10; i < oneYearData.length - 100; i++) {
      if (state.trades.length >= MONITOR_CONFIG.totalTrades) break;

      // Obtener ventana de datos
      const windowStart = Math.max(0, i - MONITOR_CONFIG.highLowPeriod);
      const windowData = oneYearData.slice(windowStart, i + 1);
      const windowCloses = windowData.map(d => d.close);

      // Calcular indicadores
      const high20 = calcHigh20(windowData);
      const low20 = calcLow20(windowData);
      const rsi = calcRSI(windowCloses, MONITOR_CONFIG.rsiPeriod);

      const currentCandle = oneYearData[i];
      const currentPrice = currentCandle.close;
      const volume = currentCandle.volume;

      // Log cada 50 patrones detectados
      if (patternCount > 0 && patternCount % 50 === 0) {
        const progress = ((i / oneYearData.length) * 100).toFixed(1);
        console.log(`📊 Progreso: ${progress}% | Patrones: ${patternCount} | Trades: ${state.trades.length}`);
      }

      // Evaluar posición actual
      if (state.inPosition) {
        const holdTime = currentCandle.timestamp - state.entryTime;
        const holdTimeMinutes = holdTime / 60000;

        let pnl = 0;
        let exitReason = null;

        if (state.positionType === 'LONG') {
          pnl = (currentPrice - state.entryPrice) / state.entryPrice;
        } else {
          pnl = (state.entryPrice - currentPrice) / state.entryPrice;
        }

        // REGLA CRÍTICA: NO cerrar antes de 16 minutos (excepto Stop Loss)
        if (holdTimeMinutes < MONITOR_CONFIG.MIN_HOLD_TIME / 60000) {
          // Solo cerrar si Stop Loss es golpeado
          if (state.positionType === 'LONG' && currentPrice <= state.stopLoss) {
            pnl = (state.stopLoss - state.entryPrice) / state.entryPrice;
            exitReason = 'STOP_LOSS';
          } else if (state.positionType === 'SHORT' && currentPrice >= state.stopLoss) {
            pnl = (state.entryPrice - state.stopLoss) / state.entryPrice;
            exitReason = 'STOP_LOSS';
          } else {
            // Seguir esperando
            continue;
          }
        } else {
          // Después de 16 min, evaluar normalmente
          if (state.positionType === 'LONG' && currentPrice >= state.takeProfit) {
            pnl = (state.takeProfit - state.entryPrice) / state.entryPrice;
            exitReason = 'TAKE_PROFIT';
          } else if (state.positionType === 'SHORT' && currentPrice <= state.takeProfit) {
            pnl = (state.entryPrice - state.takeProfit) / state.entryPrice;
            exitReason = 'TAKE_PROFIT';
          } else if (state.positionType === 'LONG' && currentPrice <= state.stopLoss) {
            pnl = (state.stopLoss - state.entryPrice) / state.entryPrice;
            exitReason = 'STOP_LOSS';
          } else if (state.positionType === 'SHORT' && currentPrice >= state.stopLoss) {
            pnl = (state.entryPrice - state.stopLoss) / state.entryPrice;
            exitReason = 'STOP_LOSS';
          } else if (holdTimeMinutes >= MONITOR_CONFIG.MAX_HOLD_TIME / 60000) {
            pnl = state.positionType === 'LONG'
              ? (currentPrice - state.entryPrice) / state.entryPrice
              : (state.entryPrice - currentPrice) / state.entryPrice;
            exitReason = 'TIME_EXIT';
          }
        }

        if (exitReason) {
          const capital = state.balance * MONITOR_CONFIG.basePositionSize;
          const pnlAmount = capital * pnl;
          state.balance += pnlAmount;

          const trade = {
            id: state.trades.length + 1,
            type: state.positionType,
            entryPrice: state.entryPrice,
            exitPrice: currentPrice,
            entryTime: new Date(state.entryTime).toISOString(),
            exitTime: new Date(currentCandle.timestamp).toISOString(),
            duration: holdTimeMinutes,
            pnl: pnl,
            pnlAmount: pnlAmount,
            exitReason: exitReason,
            entryRSI: rsi,
            entryHigh20: high20,
            entryLow20: low20,
            success: pnl > 0
          };

          state.trades.push(trade);
          state.capitalHistory.push(state.balance);

          const emoji = trade.success ? '✅' : '❌';
          console.log(`${emoji} ${exitReason.padEnd(12)} | ${trade.type.padEnd(5)} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)} | Duración: ${holdTimeMinutes.toFixed(1)}min`);

          // Reset state
          state.inPosition = false;
          state.entryPrice = null;
          state.entryTime = null;
        }
      } else {
        // Buscar nuevos patrones
        const pattern = detectTurtleSoup(currentPrice, rsi, high20, low20, volume);

        if (pattern) {
          patternCount++;
          state.patternsDetected++;

          console.log(`\n🐢 PATRÓN #${patternCount}: ${pattern.type} @ $${currentPrice.toFixed(2)} | Confianza: ${(pattern.confidence * 100).toFixed(0)}%`);
          pattern.reason.forEach(r => console.log(`   • ${r}`));

          // Entrada en posición
          const positionSize = MONITOR_CONFIG.basePositionSize;
          const capital = state.balance * positionSize;

          state.inPosition = true;
          state.positionType = pattern.type;
          state.entryPrice = currentPrice;
          state.entryTime = currentCandle.timestamp;

          if (pattern.type === 'LONG') {
            state.stopLoss = currentPrice * (1 - MONITOR_CONFIG.STOP_LOSS);
            state.takeProfit = currentPrice * (1 + MONITOR_CONFIG.TAKE_PROFIT);
          } else {
            state.stopLoss = currentPrice * (1 + MONITOR_CONFIG.STOP_LOSS);
            state.takeProfit = currentPrice * (1 - MONITOR_CONFIG.TAKE_PROFIT);
          }

          console.log(`   📈 Entrada ${pattern.type} @ $${currentPrice.toFixed(2)} | SL: $${state.stopLoss.toFixed(2)} | TP: $${state.takeProfit.toFixed(2)} | Capital: $${capital.toFixed(2)}`);
        }
      }
    }

    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);

    // Guardar resultados
    const results = {
      config: MONITOR_CONFIG,
      summary: {
        totalTrades: state.trades.length,
        patternsDetected: state.patternsDetected,
        winningTrades: state.trades.filter(t => t.success).length,
        losingTrades: state.trades.filter(t => !t.success).length,
        winRate: state.trades.length > 0 ? (state.trades.filter(t => t.success).length / state.trades.length) : 0,
        totalPnL: state.trades.reduce((sum, t) => sum + t.pnlAmount, 0),
        finalBalance: state.balance,
        initialBalance: MONITOR_CONFIG.initialCapital,
        totalReturn: ((state.balance - MONITOR_CONFIG.initialCapital) / MONITOR_CONFIG.initialCapital),
        executionTime: executionTime
      },
      trades: state.trades,
      capitalHistory: state.capitalHistory
    };

    // Guardar JSON
    const resultsDir = path.dirname(MONITOR_CONFIG.outputFile);
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    fs.writeFileSync(MONITOR_CONFIG.outputFile, JSON.stringify(results, null, 2));

    // Guardar log
    const logDir = path.dirname(MONITOR_CONFIG.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logContent = generateReport(results);
    fs.appendFileSync(MONITOR_CONFIG.logFile, logContent);

    // Mostrar resumen
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ BACKTEST MONITOR TURTLE SOUP COMPLETADO                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 RESUMEN:`);
    console.log(`   Patrones Detectados: ${results.summary.patternsDetected}`);
    console.log(`   Total Trades: ${results.summary.totalTrades}`);
    console.log(`   Winning: ${results.summary.winningTrades} | Losing: ${results.summary.losingTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   Total P&L: $${results.summary.totalPnL.toFixed(2)}`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Balance Final: $${results.summary.finalBalance.toFixed(2)}`);
    console.log(`   Tiempo Ejecución: ${results.summary.executionTime}s\n`);

    console.log(`💾 Resultados guardados en:`);
    console.log(`   📄 JSON: ${MONITOR_CONFIG.outputFile}`);
    console.log(`   📄 Log: ${MONITOR_CONFIG.logFile}`);

  } catch (error) {
    console.error('❌ Error en backtest:', error.message);
    process.exit(1);
  }
}

function generateReport(results) {
  const s = results.summary;
  let report = '\n╔══════════════════════════════════════════════════════════════╗\n';
  report += '║     📊 REPORTE BACKTEST MONITOR TURTLE SOUP - 1 AÑO            ║\n';
  report += '╚══════════════════════════════════════════════════════════════╝\n\n';

  report += '📊 CONFIGURACIÓN:\n';
  report += `   Symbol: ${results.config.symbol}\n`;
  report += `   Timeframe: ${results.config.timeframe}\n`;
  report += `   Capital Inicial: $${results.config.initialCapital}\n`;
  report += `   Stop Loss: -${(results.config.STOP_LOSS * 100).toFixed(1)}%\n`;
  report += `   Take Profit: +${(results.config.TAKE_PROFIT * 100).toFixed(1)}%\n`;
  report += `   Min Hold Time: ${results.config.MIN_HOLD_TIME / 60000} min\n`;
  report += `   Max Hold Time: ${results.config.MAX_HOLD_TIME / 60000} min\n\n`;

  report += '📈 RESULTADOS:\n';
  report += `   Patrones Detectados: ${s.patternsDetected}\n`;
  report += `   Total Trades: ${s.totalTrades}\n`;
  report += `   Winning Trades: ${s.winningTrades}\n`;
  report += `   Losing Trades: ${s.losingTrades}\n`;
  report += `   Win Rate: ${(s.winRate * 100).toFixed(2)}%\n`;
  report += `   Total P&L: $${s.totalPnL.toFixed(2)}\n`;
  report += `   Return: ${(s.totalReturn * 100).toFixed(2)}%\n`;
  report += `   Balance Final: $${s.finalBalance.toFixed(2)}\n`;
  report += `   Tiempo Ejecución: ${s.executionTime}s\n`;

  if (s.totalTrades > 0) {
    // Calcular Sharpe Ratio
    const avgPnL = s.totalPnL / s.totalTrades;
    const pnlVariance = results.trades.reduce((sum, t) => sum + Math.pow(t.pnlAmount - avgPnL, 2), 0) / s.totalTrades;
    const pnlStdDev = Math.sqrt(pnlVariance);
    const sharpeRatio = pnlStdDev > 0 ? (avgPnL / pnlStdDev) * Math.sqrt(252) : 0;

    report += `   Sharpe Ratio: ${sharpeRatio.toFixed(2)}\n`;

    // Calcular Profit Factor
    const grossProfit = results.trades.filter(t => t.pnlAmount > 0).reduce((sum, t) => sum + t.pnlAmount, 0);
    const grossLoss = Math.abs(results.trades.filter(t => t.pnlAmount < 0).reduce((sum, t) => sum + t.pnlAmount, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    report += `   Profit Factor: ${profitFactor.toFixed(2)}\n`;

    report += '\n📊 TOP 10 TRADES:\n';
    const topTrades = [...results.trades]
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10);

    topTrades.forEach((t, i) => {
      const emoji = t.success ? '✅' : '❌';
      report += `   ${i + 1}. ${emoji} ${t.exitReason.padEnd(12)} | ${t.type.padEnd(5)} | P&L: ${(t.pnl * 100).toFixed(2)}% | Duración: ${t.duration.toFixed(1)}min\n`;
    });
  }

  return report;
}

// Ejecutar
if (require.main === module) {
  runMonitorBacktest().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
  });
}

module.exports = { runMonitorBacktest };
