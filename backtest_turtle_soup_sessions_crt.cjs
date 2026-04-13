/**
 * 📊 BACKTEST TURTLE SOUP - SESIONES LONDRES & NUEVA YORK (CRT)
 *
 * Estrategia Turtle Soup clásica con filtros de sesión:
 * - Sesión Londres: 9-11am hora España (8-10 UTC)
 * - Sesión Nueva York: 2-4:30pm hora España (13-15.5 UTC)
 *
 * Optimizaciones aplicadas:
 * - Solo operar en sesiones de alta volatilidad
 * - TP/SL ajustados a movimiento intraday
 * - Position size aumentado por mejor probabilidad
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  symbol: 'BTCUSDT',
  initialCapital: 10000,
  basePositionSize: 0.025,  // 2.5% (aumentado para sesiones cortas)

  // Indicadores Turtle Soup
  highLowPeriod: 20,
  highLowThreshold: 0.002,
  rsiPeriod: 3,
  rsiLongThreshold: 30,
  rsiShortThreshold: 70,
  minVolume: 20,

  // 🕐 SESIONES CRT (Londres & Nueva York)
  sessions: {
    london: {
      name: 'Londres',
      startHour: 8,   // 9am hora España = 8am UTC
      endHour: 10,    // 11am hora España = 10am UTC
      description: 'Apertura Londres - Alta volatilidad'
    },
    newYork: {
      name: 'Nueva York',
      startHour: 13,  // 2pm hora España = 1pm UTC
      endHour: 15.5,  // 4:30pm hora España = 3:30pm UTC
      description: 'Apertura NY - Máxima volatilidad'
    }
  },

  // Risk Management (optimizado para sesiones intraday)
  STOP_LOSS: 0.006,     // -0.6% (más relajado para evitar ruido intraday)
  TAKE_PROFIT: 0.009,   // +0.9% (manteniendo R:R 1.5:1)
  MIN_HOLD_TIME: 16 * 60 * 1000,  // 16 minutos
  MAX_HOLD_TIME: 30 * 60 * 1000,  // 30 minutos (ventana intraday)

  // Timezone para filtrado
  timezone: 'UTC',

  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_turtle_soup_sessions_crt.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'backtest_turtle_soup_sessions_crt.log')
};

let state = {
  balance: CONFIG.initialCapital,
  inPosition: false,
  positionType: null,
  entryPrice: null,
  entryTime: null,
  stopLoss: null,
  takeProfit: null,
  trades: [],
  capitalHistory: [CONFIG.initialCapital],
  patternsDetected: 0,
  tradesBySession: {
    london: { trades: 0, wins: 0, profit: 0 },
    newYork: { trades: 0, wins: 0, profit: 0 }
  }
};

function calculateRSI(candles, period) {
  if (candles.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function detectTurtleSoupPattern(candles) {
  if (candles.length < CONFIG.highLowPeriod + 1) return null;

  const recentCandles = candles.slice(-CONFIG.highLowPeriod - 1);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const lastCandle = recentCandles[recentCandles.length - 1];
  const rsi = calculateRSI(recentCandles, CONFIG.rsiPeriod);

  const closeToHigh = Math.abs(lastCandle.high - maxHigh) / maxHigh < CONFIG.highLowThreshold;
  const closeToLow = Math.abs(lastCandle.low - minLow) / minLow < CONFIG.highLowThreshold;

  if (closeToHigh && rsi > CONFIG.rsiShortThreshold && lastCandle.volume >= CONFIG.minVolume) {
    return 'SELL';
  } else if (closeToLow && rsi < CONFIG.rsiLongThreshold && lastCandle.volume >= CONFIG.minVolume) {
    return 'BUY';
  }

  return null;
}

function isInSession(timestamp) {
  const date = new Date(timestamp);
  const hour = date.getUTCHours(); // Usar UTC para consistencia

  // Verificar sesión Londres
  if (hour >= CONFIG.sessions.london.startHour && hour < CONFIG.sessions.london.endHour) {
    return { inSession: true, session: 'london', hour: hour };
  }

  // Verificar sesión Nueva York
  if (hour >= CONFIG.sessions.newYork.startHour && hour < CONFIG.sessions.newYork.endHour) {
    return { inSession: true, session: 'newYork', hour: hour };
  }

  return { inSession: false, session: null, hour: hour };
}

async function runBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST TURTLE SOUP - SESIONES CRT (Londres + NY)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    const btcDataFile = 'backtesting/data/btcusdt_5m_2years.json';
    const historicalData = JSON.parse(fs.readFileSync(btcDataFile, 'utf8'));
    const oneYearData = historicalData.slice(-72000);

    console.log(`✅ Datos cargados: ${oneYearData.length.toLocaleString()} velas`);
    console.log(`📊 Símbolo: ${CONFIG.symbol}`);
    console.log(`💰 Capital Inicial: $${CONFIG.initialCapital.toLocaleString()}\n`);

    console.log('🕐 SESIONES CRT ACTIVAS:');
    console.log(`   🇬🇧 LONDRES: ${CONFIG.sessions.london.startHour}:00-${CONFIG.sessions.london.endHour}:00 UTC (${CONFIG.sessions.london.description})`);
    console.log(`   🇺🇸 NUEVA YORK: ${CONFIG.sessions.newYork.startHour}:00-${CONFIG.sessions.newYork.endHour}:00 UTC (${CONFIG.sessions.newYork.description})`);
    console.log(`   ⏱️  Total: 6.5 horas/día de trading activo\n`);

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST CON FILTRO DE SESIONES                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();
    let sessionStats = { london: {}, newYork: {} };

    for (let i = CONFIG.highLowPeriod; i < oneYearData.length - 1; i++) {
      const currentCandle = oneYearData[i];
      const sessionInfo = isInSession(currentCandle.timestamp);

      // Solo procesar si estamos en sesión activa
      if (!sessionInfo.inSession) continue;

      if (state.inPosition) {
        const currentPrice = currentCandle.close;
        const holdTime = currentCandle.timestamp - state.entryTime;
        const holdTimeMinutes = holdTime / 60000;

        let shouldExit = false;
        let exitReason = null;
        let exitPrice = currentPrice;

        if (state.positionType === 'SELL') {
          if (currentPrice <= state.takeProfit) {
            shouldExit = true;
            exitReason = 'TAKE_PROFIT';
            exitPrice = state.takeProfit;
          } else if (currentPrice >= state.stopLoss) {
            shouldExit = true;
            exitReason = 'STOP_LOSS';
            exitPrice = state.stopLoss;
          } else if (holdTimeMinutes >= CONFIG.MAX_HOLD_TIME / 60000) {
            shouldExit = true;
            exitReason = 'MAX_HOLD_TIME';
          }
        } else {
          if (currentPrice >= state.takeProfit) {
            shouldExit = true;
            exitReason = 'TAKE_PROFIT';
            exitPrice = state.takeProfit;
          } else if (currentPrice <= state.stopLoss) {
            shouldExit = true;
            exitReason = 'STOP_LOSS';
            exitPrice = state.stopLoss;
          } else if (holdTimeMinutes >= CONFIG.MAX_HOLD_TIME / 60000) {
            shouldExit = true;
            exitReason = 'MAX_HOLD_TIME';
          }
        }

        // Verificar si salimos de sesión
        const nextCandleSession = isInSession(currentCandle.timestamp + 5 * 60000);
        if (!nextCandleSession.inSession && holdTimeMinutes >= CONFIG.MIN_HOLD_TIME / 60000) {
          shouldExit = true;
          exitReason = 'SESSION_END';
        }

        if (shouldExit) {
          let pnl;
          if (state.positionType === 'SELL') {
            pnl = (state.entryPrice - exitPrice) / state.entryPrice;
          } else {
            pnl = (exitPrice - state.entryPrice) / state.entryPrice;
          }

          const pnlAmount = state.balance * CONFIG.basePositionSize * pnl;
          state.balance += pnlAmount;

          const trade = {
            id: state.trades.length + 1,
            type: state.positionType,
            entryPrice: state.entryPrice,
            exitPrice: exitPrice,
            entryTime: new Date(state.entryTime).toISOString(),
            exitTime: new Date(currentCandle.timestamp).toISOString(),
            duration: holdTimeMinutes,
            pnl: pnl,
            pnlAmount: pnlAmount,
            exitReason: exitReason,
            session: state.entrySession,
            success: pnl > 0
          };

          state.trades.push(trade);
          state.capitalHistory.push(state.balance);

          // Actualizar estadísticas por sesión
          if (state.entrySession) {
            state.tradesBySession[state.entrySession].trades++;
            if (pnl > 0) {
              state.tradesBySession[state.entrySession].wins++;
              state.tradesBySession[state.entrySession].profit += pnlAmount;
            }
          }

          const emoji = trade.success ? '✅' : '❌';
          const sessionLabel = trade.session === 'london' ? '🇬🇧' : '🇺🇸';
          console.log(`${emoji} [${sessionLabel} ${trade.session.toUpperCase()}] Trade #${trade.id}: ${trade.type} | P&L: ${(pnl * 100).toFixed(2)}% | $${pnlAmount.toFixed(2)} | ${exitReason} | ${holdTimeMinutes.toFixed(0)}min`);

          state.inPosition = false;
          state.entryPrice = null;
          state.takeProfit = null;
          state.stopLoss = null;
          state.entrySession = null;
        }
      } else {
        // Solo buscar señales durante sesiones activas
        const pattern = detectTurtleSoupPattern(oneYearData.slice(0, i + 1));
        if (pattern) {
          state.patternsDetected++;
          const entryPrice = currentCandle.close;

          let stopLoss, takeProfit;
          if (pattern === 'SELL') {
            stopLoss = entryPrice * (1 + CONFIG.STOP_LOSS);
            takeProfit = entryPrice * (1 - CONFIG.TAKE_PROFIT);
          } else {
            stopLoss = entryPrice * (1 - CONFIG.STOP_LOSS);
            takeProfit = entryPrice * (1 + CONFIG.TAKE_PROFIT);
          }

          state.inPosition = true;
          state.positionType = pattern;
          state.entryPrice = entryPrice;
          state.entryTime = currentCandle.timestamp;
          state.stopLoss = stopLoss;
          state.takeProfit = takeProfit;
          state.entrySession = sessionInfo.session;

          const sessionLabel = sessionInfo.session === 'london' ? '🇬🇧' : '🇺🇸';
          console.log(`\n🎯 [${sessionLabel} ${sessionInfo.session.toUpperCase()}] Patrón #${state.patternsDetected}: ${pattern} @ $${entryPrice.toFixed(2)}`);
          console.log(`   SL: $${stopLoss.toFixed(2)} | TP: $${takeProfit.toFixed(2)} | Hora: ${sessionInfo.hour}:00 UTC`);
        }
      }

      // Progreso cada 100 patrones
      if (state.patternsDetected > 0 && state.patternsDetected % 100 === 0) {
        const progress = ((i / oneYearData.length) * 100).toFixed(1);
        console.log(`📊 Progreso: ${progress}% | Patrones: ${state.patternsDetected} | Trades: ${state.trades.length}`);
      }
    }

    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);

    const results = {
      config: CONFIG,
      summary: {
        patternsDetected: state.patternsDetected,
        totalTrades: state.trades.length,
        winningTrades: state.trades.filter(t => t.success).length,
        losingTrades: state.trades.filter(t => !t.success).length,
        winRate: state.trades.length > 0 ? (state.trades.filter(t => t.success).length / state.trades.length) : 0,
        totalPnL: state.trades.reduce((sum, t) => sum + t.pnlAmount, 0),
        finalBalance: state.balance,
        initialBalance: CONFIG.initialCapital,
        totalReturn: (state.balance - CONFIG.initialCapital) / CONFIG.initialCapital,
        executionTime: executionTime,
        sessionStats: {
          london: state.tradesBySession.london,
          newYork: state.tradesBySession.newYork
        }
      },
      trades: state.trades,
      capitalHistory: state.capitalHistory
    };

    const resultsDir = path.dirname(CONFIG.outputFile);
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ BACKTEST COMPLETADO                                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 RESUMEN TURTLE SOUP - SESIONES CRT:`);
    console.log(`   Patrones: ${results.summary.patternsDetected}`);
    console.log(`   Trades: ${results.summary.totalTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Profit: $${results.summary.totalPnL.toFixed(2)}`);
    console.log(`   Balance Final: $${results.summary.finalBalance.toFixed(2)}\n`);

    console.log(`📈 ESTADÍSTICAS POR SESIÓN:`);
    console.log(`\n   🇬🇧 LONDRES (9-11am España):`);
    console.log(`      Trades: ${results.summary.sessionStats.london.trades || 0}`);
    console.log(`      Wins: ${results.summary.sessionStats.london.wins || 0}`);
    console.log(`      Profit: $${(results.summary.sessionStats.london.profit || 0).toFixed(2)}`);

    console.log(`\n   🇺🇸 NUEVA YORK (2-4:30pm España):`);
    console.log(`      Trades: ${results.summary.sessionStats.newYork.trades || 0}`);
    console.log(`      Wins: ${results.summary.sessionStats.newYork.wins || 0}`);
    console.log(`      Profit: $${(results.summary.sessionStats.newYork.profit || 0).toFixed(2)}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runBacktest().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
  });
}

module.exports = { runBacktest };
