/**
 * 📊 BACKTEST MONITOR TURTLE SOUP - 1 AÑO (VERSIÓN OPTIMIZADA)
 *
 * Optimizaciones implementadas:
 * - Position size: 1% → 2%
 * - Stop Loss: -0.3% → -0.6%
 * - Take Profit: +0.9% → +0.6%
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// 🎯 CONFIGURACIÓN OPTIMIZADA
// ═══════════════════════════════════════════════════════════════

const MONITOR_CONFIG = {
  symbol: 'BTCUSDT',
  timeframe: '5m',
  interval: 60000,
  totalTrades: 1000,

  // Indicadores Turtle Soup
  highLowPeriod: 20,
  highLowThreshold: 0.002,
  rsiPeriod: 3,
  rsiLongThreshold: 30,
  rsiShortThreshold: 70,
  minVolume: 20,

  // 🚀 OPTIMIZACIONES
  MIN_HOLD_TIME: 16 * 60 * 1000,
  MAX_HOLD_TIME: 30 * 60 * 1000,
  TAKE_PROFIT: 0.006, // +0.6% (antes +0.9%)
  STOP_LOSS: 0.006, // -0.6% (antes -0.3%)

  // Position Size aumentado
  basePositionSize: 0.02, // 2% (antes 1%)
  initialCapital: 1000,

  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_monitor_turtle_soup_1year_optimized.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'backtest_monitor_turtle_soup_1year_optimized.log')
};

let state = {
  balance: MONITOR_CONFIG.initialCapital,
  inPosition: false,
  positionType: null,
  entryPrice: null,
  entryTime: null,
  stopLoss: null,
  takeProfit: null,
  trades: [],
  capitalHistory: [MONITOR_CONFIG.initialCapital],
  patternsDetected: 0
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
  if (candles.length < MONITOR_CONFIG.highLowPeriod + 1) return null;

  const recentCandles = candles.slice(-MONITOR_CONFIG.highLowPeriod - 1);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const lastCandle = recentCandles[recentCandles.length - 1];
  const rsi = calculateRSI(recentCandles, MONITOR_CONFIG.rsiPeriod);

  const closeToHigh = Math.abs(lastCandle.high - maxHigh) / maxHigh < MONITOR_CONFIG.highLowThreshold;
  const closeToLow = Math.abs(lastCandle.low - minLow) / minLow < MONITOR_CONFIG.highLowThreshold;

  if (closeToHigh && rsi > MONITOR_CONFIG.rsiShortThreshold && lastCandle.volume >= MONITOR_CONFIG.minVolume) {
    return 'SELL';
  } else if (closeToLow && rsi < MONITOR_CONFIG.rsiLongThreshold && lastCandle.volume >= MONITOR_CONFIG.minVolume) {
    return 'BUY';
  }

  return null;
}

async function runBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST MONITOR TURTLE SOUP - 1 AÑO (OPTIMIZADO)      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    const btcDataFile = 'backtesting/data/btcusdt_5m_2years.json';
    const historicalData = JSON.parse(fs.readFileSync(btcDataFile, 'utf8'));
    const oneYearData = historicalData.slice(-72000);

    console.log(`✅ Datos cargados: ${oneYearData.length.toLocaleString()} velas`);
    console.log(`📊 Período: 1 año\n`);

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST OPTIMIZADO                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    for (let i = MONITOR_CONFIG.highLowPeriod; i < oneYearData.length - 1; i++) {
      if (state.inPosition) {
        const currentCandle = oneYearData[i];
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
          } else if (holdTimeMinutes >= MONITOR_CONFIG.MAX_HOLD_TIME / 60000) {
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
          } else if (holdTimeMinutes >= MONITOR_CONFIG.MAX_HOLD_TIME / 60000) {
            shouldExit = true;
            exitReason = 'MAX_HOLD_TIME';
          }
        }

        if (shouldExit) {
          let pnl;
          if (state.positionType === 'SELL') {
            pnl = (state.entryPrice - exitPrice) / state.entryPrice;
          } else {
            pnl = (exitPrice - state.entryPrice) / state.entryPrice;
          }

          const pnlAmount = state.balance * MONITOR_CONFIG.basePositionSize * pnl;
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
            success: pnl > 0
          };

          state.trades.push(trade);
          state.capitalHistory.push(state.balance);

          const emoji = trade.success ? '✅' : '❌';
          console.log(`${emoji} Trade #${trade.id}: ${trade.type} | P&L: ${(pnl * 100).toFixed(2)}% | $${pnlAmount.toFixed(2)} | ${exitReason}`);

          state.inPosition = false;
          state.entryPrice = null;
          state.takeProfit = null;
          state.stopLoss = null;

          if (state.trades.length >= MONITOR_CONFIG.totalTrades) break;
        }
      } else {
        const pattern = detectTurtleSoupPattern(oneYearData.slice(0, i + 1));
        if (pattern) {
          state.patternsDetected++;
          const currentCandle = oneYearData[i];
          const entryPrice = currentCandle.close;

          let stopLoss, takeProfit;
          if (pattern === 'SELL') {
            stopLoss = entryPrice * (1 + MONITOR_CONFIG.STOP_LOSS);
            takeProfit = entryPrice * (1 - MONITOR_CONFIG.TAKE_PROFIT);
          } else {
            stopLoss = entryPrice * (1 - MONITOR_CONFIG.STOP_LOSS);
            takeProfit = entryPrice * (1 + MONITOR_CONFIG.TAKE_PROFIT);
          }

          state.inPosition = true;
          state.positionType = pattern;
          state.entryPrice = entryPrice;
          state.entryTime = currentCandle.timestamp;
          state.stopLoss = stopLoss;
          state.takeProfit = takeProfit;

          console.log(`🎯 Patrón #${state.patternsDetected}: ${pattern} @ $${entryPrice.toFixed(2)}`);
          console.log(`   SL: $${stopLoss.toFixed(2)} | TP: $${takeProfit.toFixed(2)}`);
        }
      }
    }

    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);

    const results = {
      config: MONITOR_CONFIG,
      summary: {
        patternsDetected: state.patternsDetected,
        totalTrades: state.trades.length,
        winningTrades: state.trades.filter(t => t.success).length,
        losingTrades: state.trades.filter(t => !t.success).length,
        winRate: state.trades.length > 0 ? (state.trades.filter(t => t.success).length / state.trades.length) : 0,
        totalPnL: state.trades.reduce((sum, t) => sum + t.pnlAmount, 0),
        finalBalance: state.balance,
        initialBalance: MONITOR_CONFIG.initialCapital,
        totalReturn: (state.balance - MONITOR_CONFIG.initialCapital) / MONITOR_CONFIG.initialCapital,
        executionTime: executionTime
      },
      trades: state.trades,
      capitalHistory: state.capitalHistory
    };

    const resultsDir = path.dirname(MONITOR_CONFIG.outputFile);
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(MONITOR_CONFIG.outputFile, JSON.stringify(results, null, 2));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ BACKTEST COMPLETADO                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 RESUMEN OPTIMIZADO:`);
    console.log(`   Patrones: ${results.summary.patternsDetected}`);
    console.log(`   Trades: ${results.summary.totalTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Balance Final: $${results.summary.finalBalance.toFixed(2)}`);
    console.log(`   Ejecución: ${executionTime}s`);

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
