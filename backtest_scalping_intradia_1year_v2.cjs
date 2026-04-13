/**
 * 📊 BACKTEST SCALPING INTRADÍA - 1 AÑO (VERSIÓN CORREGIDA)
 *
 * Estrategia: Manipulación de Máximos/Mínimos + Vacío M1
 * TP1/TP2 + Stop Loss dinámico
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  symbol: 'BTCUSDT',
  lookbackPeriod: 20,
  voidCandles: 3,
  stopLossBuffer: 0.001,
  tp1Ratio: 0.002,
  tp2Ratio: 0.004,
  basePositionSize: 0.02,
  initialCapital: 1000,
  tp1ClosePercent: 0.5,
  maxHoldTime: 60 * 60 * 1000,
  timeExit: 30 * 60 * 1000,
  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_scalping_intradia_1year.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'backtest_scalping_intradia_1year.log')
};

let state = {
  balance: CONFIG.initialCapital,
  inPosition: false,
  positionType: null,
  entryPrice: null,
  entryTime: null,
  stopLoss: null,
  tp1: null,
  tp2: null,
  tp1Hit: false,
  trades: [],
  capitalHistory: [CONFIG.initialCapital],
  patternsDetected: 0
};

function isValidBreakout(candles, direction) {
  if (candles.length < CONFIG.lookbackPeriod) return false;

  const recentCandles = candles.slice(-CONFIG.lookbackPeriod);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const lastCandle = candles[candles.length - 1];

  if (direction === 'sell') {
    const lastHigh = lastCandle.high;
    return lastHigh >= maxHigh * 0.999;
  } else {
    const lastLow = lastCandle.low;
    return lastLow <= minLow * 1.001;
  }
}

function detectVoid(minuteCandles) {
  if (minuteCandles.length < 3) return { hasVoid: false };

  const candle1 = minuteCandles[minuteCandles.length - 3];
  const candle3 = minuteCandles[minuteCandles.length - 1];

  const high1 = candle1.high;
  const low1 = candle1.low;
  const high3 = candle3.high;
  const low3 = candle3.low;

  const hasVoid = (low3 > high1) || (high3 < low1);

  if (hasVoid) {
    const avgRange = (candle1.high - candle1.low + candle3.high - candle3.low) / 2;
    const voidSize = Math.abs(high3 - low1) / avgRange;
    return { hasVoid: true, voidSize: voidSize };
  }

  return { hasVoid: false };
}

async function runBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST SCALPING INTRADÍA - 1 AÑO                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    const btcDataFile = 'backtesting/data/btcusdt_5m_2years.json';
    const historicalData = JSON.parse(fs.readFileSync(btcDataFile, 'utf8'));
    const oneYearData = historicalData.slice(-72000);

    console.log(`✅ Datos cargados: ${oneYearData.length.toLocaleString()} velas`);
    console.log(`📊 Usando 1 año de datos\n`);

    const hourlyData = aggregateToHourly(oneYearData);
    console.log(`✅ ${hourlyData.length.toLocaleString()} velas H1 generadas\n`);

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST                                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    for (let i = CONFIG.lookbackPeriod; i < hourlyData.length - 1; i++) {
      const hourlyCandle = hourlyData[i];

      const sellSignal = isValidBreakout(hourlyData.slice(0, i + 1), 'sell');
      const buySignal = isValidBreakout(hourlyData.slice(0, i + 1), 'buy');

      if (!sellSignal && !buySignal) continue;

      state.patternsDetected++;

      const minuteCandles = getMinuteCandlesForHour(oneYearData, hourlyCandle.timestamp);
      if (minuteCandles.length < 3) continue;

      const voidInfo = detectVoid(minuteCandles);
      if (!voidInfo.hasVoid) continue;

      const tradeDirection = sellSignal ? 'SELL' : 'BUY';
      const currentPrice = hourlyCandle.close;
      const recentCandles = hourlyData.slice(i - CONFIG.lookbackPeriod, i + 1);
      const maxHigh = Math.max(...recentCandles.map(c => c.high));
      const minLow = Math.min(...recentCandles.map(c => c.low));

      let entryPrice, stopLoss, tp1, tp2;

      if (tradeDirection === 'SELL') {
        entryPrice = currentPrice;
        stopLoss = maxHigh * (1 + CONFIG.stopLossBuffer);
        tp1 = entryPrice * (1 - CONFIG.tp1Ratio);
        tp2 = entryPrice * (1 - CONFIG.tp2Ratio);
      } else {
        entryPrice = currentPrice;
        stopLoss = minLow * (1 - CONFIG.stopLossBuffer);
        tp1 = entryPrice * (1 + CONFIG.tp1Ratio);
        tp2 = entryPrice * (1 + CONFIG.tp2Ratio);
      }

      state.inPosition = true;
      state.positionType = tradeDirection;
      state.entryPrice = entryPrice;
      state.entryTime = hourlyCandle.timestamp;
      state.stopLoss = stopLoss;
      state.tp1 = tp1;
      state.tp2 = tp2;
      state.tp1Hit = false;

      console.log(`\n🎯 PATRÓN #${state.patternsDetected}: ${tradeDirection} @ $${entryPrice.toFixed(2)}`);
      console.log(`   SL: $${stopLoss.toFixed(2)} | TP1: $${tp1.toFixed(2)} | TP2: $${tp2.toFixed(2)}`);
      console.log(`   Vacío: ${voidInfo.voidSize.toFixed(3)}`);

      // Variables para acumular TP1
      let tp1PnlAccumulated = 0;
      let tp1AmountAccumulated = 0;

      for (let j = i + 1; j < Math.min(i + 20, hourlyData.length); j++) {
        const nextCandle = hourlyData[j];
        const nextPrice = nextCandle.close;
        const holdTime = nextCandle.timestamp - state.entryTime;
        const holdTimeMinutes = holdTime / 60000;

        let pnl = 0;
        let exitReason = null;
        let exitPrice = nextPrice;
        let totalPnl = 0;

        if (tradeDirection === 'SELL') {
          if (!state.tp1Hit && nextPrice <= tp1) {
            const tp1Pnl = (state.entryPrice - tp1) / state.entryPrice;
            const tp1Amount = state.balance * (CONFIG.basePositionSize * CONFIG.tp1ClosePercent) * tp1Pnl;
            state.balance += tp1Amount;

            tp1PnlAccumulated = tp1Pnl;
            tp1AmountAccumulated = tp1Amount;

            console.log(`   ✅ TP1 ALCANZADO @ $${nextPrice.toFixed(2)} | +${(tp1Pnl * 100).toFixed(2)}%`);
            state.stopLoss = state.entryPrice;
            state.tp1Hit = true;
            continue;
          } else if (nextPrice <= tp2) {
            const tp2Pnl = (state.entryPrice - tp2) / state.entryPrice;
            const tp2Size = CONFIG.basePositionSize * (state.tp1Hit ? (1 - CONFIG.tp1ClosePercent) : 1);
            const tp2Amount = state.balance * tp2Size * tp2Pnl;
            state.balance += tp2Amount;

            pnl = tp2Pnl;
            exitReason = 'TP2';
            exitPrice = nextPrice;

            if (state.tp1Hit) {
              totalPnl = tp1AmountAccumulated + tp2Amount;
            } else {
              totalPnl = tp2Amount;
            }

            const trade = {
              id: state.trades.length + 1,
              type: 'SELL',
              entryPrice: state.entryPrice,
              exitPrice: exitPrice,
              entryTime: new Date(state.entryTime).toISOString(),
              exitTime: new Date(nextCandle.timestamp).toISOString(),
              duration: holdTimeMinutes,
              pnl: pnl,
              pnlAmount: totalPnl,
              exitReason: exitReason,
              tp1Hit: state.tp1Hit,
              success: pnl > 0
            };

            state.trades.push(trade);
            state.capitalHistory.push(state.balance);

            const emoji = trade.success ? '✅' : '❌';
            console.log(`   ${emoji} ${exitReason}${state.tp1Hit ? ' (TP1+TP2)' : ''} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);
            break;
          } else if (nextPrice >= stopLoss) {
            const slPnl = (state.entryPrice - stopLoss) / state.entryPrice;
            const slAmount = state.balance * CONFIG.basePositionSize * slPnl;
            state.balance += slAmount;

            pnl = slPnl;
            exitReason = 'STOP_LOSS';

            const trade = {
              id: state.trades.length + 1,
              type: 'SELL',
              entryPrice: state.entryPrice,
              exitPrice: nextPrice,
              entryTime: new Date(state.entryTime).toISOString(),
              exitTime: new Date(nextCandle.timestamp).toISOString(),
              duration: holdTimeMinutes,
              pnl: pnl,
              pnlAmount: slAmount,
              exitReason: exitReason,
              tp1Hit: state.tp1Hit,
              success: false
            };

            state.trades.push(trade);
            state.capitalHistory.push(state.balance);

            console.log(`   ❌ STOP_LOSS | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);
            break;
          } else if (holdTimeMinutes >= CONFIG.timeExit / 60000) {
            const timePnl = (state.entryPrice - nextPrice) / state.entryPrice;
            const timeAmount = state.balance * CONFIG.basePositionSize * timePnl;
            state.balance += timeAmount;

            pnl = timePnl;
            exitReason = 'TIME_EXIT';

            const trade = {
              id: state.trades.length + 1,
              type: 'SELL',
              entryPrice: state.entryPrice,
              exitPrice: nextPrice,
              entryTime: new Date(state.entryTime).toISOString(),
              exitTime: new Date(nextCandle.timestamp).toISOString(),
              duration: holdTimeMinutes,
              pnl: pnl,
              pnlAmount: timeAmount,
              exitReason: exitReason,
              tp1Hit: state.tp1Hit,
              success: pnl > 0
            };

            state.trades.push(trade);
            state.capitalHistory.push(state.balance);

            const emoji = trade.success ? '✅' : '❌';
            console.log(`   ${emoji} TIME_EXIT | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);
            break;
          }
        } else {
          // Lógica simétrica para BUY
          if (!state.tp1Hit && nextPrice >= tp1) {
            const tp1Pnl = (tp1 - state.entryPrice) / state.entryPrice;
            const tp1Amount = state.balance * (CONFIG.basePositionSize * CONFIG.tp1ClosePercent) * tp1Pnl;
            state.balance += tp1Amount;

            tp1PnlAccumulated = tp1Pnl;
            tp1AmountAccumulated = tp1Amount;

            console.log(`   ✅ TP1 ALCANZADO @ $${nextPrice.toFixed(2)} | +${(tp1Pnl * 100).toFixed(2)}%`);
            state.stopLoss = state.entryPrice;
            state.tp1Hit = true;
            continue;
          } else if (nextPrice >= tp2) {
            const tp2Pnl = (tp2 - state.entryPrice) / state.entryPrice;
            const tp2Size = CONFIG.basePositionSize * (state.tp1Hit ? (1 - CONFIG.tp1ClosePercent) : 1);
            const tp2Amount = state.balance * tp2Size * tp2Pnl;
            state.balance += tp2Amount;

            pnl = tp2Pnl;
            exitReason = 'TP2';
            exitPrice = nextPrice;

            if (state.tp1Hit) {
              totalPnl = tp1AmountAccumulated + tp2Amount;
            } else {
              totalPnl = tp2Amount;
            }

            const trade = {
              id: state.trades.length + 1,
              type: 'BUY',
              entryPrice: state.entryPrice,
              exitPrice: exitPrice,
              entryTime: new Date(state.entryTime).toISOString(),
              exitTime: new Date(nextCandle.timestamp).toISOString(),
              duration: holdTimeMinutes,
              pnl: pnl,
              pnlAmount: totalPnl,
              exitReason: exitReason,
              tp1Hit: state.tp1Hit,
              success: pnl > 0
            };

            state.trades.push(trade);
            state.capitalHistory.push(state.balance);

            const emoji = trade.success ? '✅' : '❌';
            console.log(`   ${emoji} ${exitReason}${state.tp1Hit ? ' (TP1+TP2)' : ''} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);
            break;
          } else if (nextPrice <= stopLoss) {
            const slPnl = (stopLoss - state.entryPrice) / state.entryPrice;
            const slAmount = state.balance * CONFIG.basePositionSize * slPnl;
            state.balance += slAmount;

            pnl = slPnl;
            exitReason = 'STOP_LOSS';

            const trade = {
              id: state.trades.length + 1,
              type: 'BUY',
              entryPrice: state.entryPrice,
              exitPrice: nextPrice,
              entryTime: new Date(state.entryTime).toISOString(),
              exitTime: new Date(nextCandle.timestamp).toISOString(),
              duration: holdTimeMinutes,
              pnl: pnl,
              pnlAmount: slAmount,
              exitReason: exitReason,
              tp1Hit: state.tp1Hit,
              success: false
            };

            state.trades.push(trade);
            state.capitalHistory.push(state.balance);

            console.log(`   ❌ STOP_LOSS | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);
            break;
          } else if (holdTimeMinutes >= CONFIG.timeExit / 60000) {
            const timePnl = (nextPrice - state.entryPrice) / state.entryPrice;
            const timeAmount = state.balance * CONFIG.basePositionSize * timePnl;
            state.balance += timeAmount;

            pnl = timePnl;
            exitReason = 'TIME_EXIT';

            const trade = {
              id: state.trades.length + 1,
              type: 'BUY',
              entryPrice: state.entryPrice,
              exitPrice: nextPrice,
              entryTime: new Date(state.entryTime).toISOString(),
              exitTime: new Date(nextCandle.timestamp).toISOString(),
              duration: holdTimeMinutes,
              pnl: pnl,
              pnlAmount: timeAmount,
              exitReason: exitReason,
              tp1Hit: state.tp1Hit,
              success: pnl > 0
            };

            state.trades.push(trade);
            state.capitalHistory.push(state.balance);

            const emoji = trade.success ? '✅' : '❌';
            console.log(`   ${emoji} TIME_EXIT | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);
            break;
          }
        }

        if (exitReason) {
          state.inPosition = false;
          state.entryPrice = null;
          break;
        }
      }

      if (state.patternsDetected > 0 && state.patternsDetected % 50 === 0) {
        const progress = ((i / hourlyData.length) * 100).toFixed(1);
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
        tp1Hits: state.trades.filter(t => t.tp1Hit).length,
        totalPnL: state.trades.reduce((sum, t) => sum + t.pnlAmount, 0),
        finalBalance: state.balance,
        initialBalance: CONFIG.initialCapital,
        totalReturn: ((state.balance - CONFIG.initialCapital) / CONFIG.initialCapital),
        executionTime: executionTime
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

    console.log(`📊 RESUMEN:`);
    console.log(`   Patrones: ${results.summary.patternsDetected}`);
    console.log(`   Trades: ${results.summary.totalTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   TP1 Hits: ${results.summary.tp1Hits}`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Balance Final: $${results.summary.finalBalance.toFixed(2)}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function aggregateToHourly(fiveMinData) {
  const hourlyData = [];
  let currentHour = null;
  let hourCandles = [];

  for (const candle of fiveMinData) {
    const date = new Date(candle.timestamp);
    const hour = date.getHours();

    if (currentHour === null || hour !== currentHour) {
      if (hourCandles.length > 0) {
        hourlyData.push(aggregateCandles(hourCandles));
      }
      currentHour = hour;
      hourCandles = [];
    }

    hourCandles.push(candle);
  }

  if (hourCandles.length > 0) {
    hourlyData.push(aggregateCandles(hourCandles));
  }

  return hourlyData;
}

function aggregateCandles(candles) {
  return {
    timestamp: candles[0].timestamp,
    open: candles[0].open,
    high: Math.max(...candles.map(c => c.high)),
    low: Math.min(...candles.map(c => c.low)),
    close: candles[candles.length - 1].close,
    volume: candles.reduce((sum, c) => sum + c.volume, 0)
  };
}

function getMinuteCandlesForHour(fiveMinData, hourTimestamp) {
  const hourStart = hourTimestamp;
  const hourEnd = hourStart + 60 * 60 * 1000;
  return fiveMinData.filter(c => c.timestamp >= hourStart && c.timestamp < hourEnd);
}

if (require.main === module) {
  runBacktest().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
  });
}

module.exports = { runBacktest };
