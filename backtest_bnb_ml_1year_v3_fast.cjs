/**
 * 📊 BACKTEST BNB - VERSIÓN V3 RÁPIDA (1 AÑO DATOS REALES)
 *
 * Versión optimizada para ejecutar más rápido
 * Usa solo 1 año de datos en lugar de 2
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  symbol: 'BNBUSDT',
  initialCapital: 10000,
  basePositionSize: 0.02,

  emaShort: 9,
  emaLong: 21,
  rsiPeriod: 14,
  rsiOversold: 35,
  rsiOverbought: 65,

  atrPeriod: 14,
  atrMultiplier: 1.5,
  riskRewardRatio: 2.0,

  minVolume: 100000,
  volatilityThreshold: 0.005,

  maxHoldTime: 7 * 24 * 60 * 60 * 1000,

  dataFile: path.join(__dirname, 'backtesting', 'data', 'bnbusdt_5m_2years.json'),
  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_bnb_ml_1year_v3_fast.json')
};

// Cálculos simplificados (mismo código que v3)
function calculateEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] * k) + (ema * (1 - k));
  }
  return ema;
}

function calculateRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateATR(highs, lows, closes, period) {
  if (highs.length < period + 1) return 0;
  let trueRanges = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trueRanges.push(tr);
  }
  return trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
}

function calculateVolatility(closes, period = 20) {
  if (closes.length < period) return 0;
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

async function runBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST BNB V3 FAST (1 AÑO DATOS REALES)               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    const bnbData = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));

    // Usar solo último año (aprox 75k velas)
    const oneYearData = bnbData.slice(-75000);

    console.log(`✅ Datos cargados: ${oneYearData.length.toLocaleString()} velas (1 año)`);
    console.log(`📊 Símbolo: ${CONFIG.symbol}`);
    console.log(`💰 Capital: $${CONFIG.initialCapital.toLocaleString()}\n`);

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST...                                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    let state = {
      balance: CONFIG.initialCapital,
      inPosition: false,
      positionType: null,
      entryPrice: null,
      entryTime: null,
      stopLoss: null,
      takeProfit: null,
      positionSize: null,
      trades: [],
      patternsDetected: 0
    };

    for (let i = CONFIG.emaLong + CONFIG.rsiPeriod; i < oneYearData.length - 1; i++) {
      if (state.inPosition) {
        const currentCandle = oneYearData[i];
        const currentPrice = currentCandle.close;
        const holdTime = currentCandle.timestamp - state.entryTime;

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
          } else if (holdTime >= CONFIG.maxHoldTime) {
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
          } else if (holdTime >= CONFIG.maxHoldTime) {
            shouldExit = true;
            exitReason = 'MAX_HOLD_TIME';
          }
        }

        if (shouldExit) {
          let pnl = state.positionType === 'SELL'
            ? (state.entryPrice - exitPrice) / state.entryPrice
            : (exitPrice - state.entryPrice) / state.entryPrice;

          const pnlAmount = state.balance * state.positionSize * pnl;
          state.balance += pnlAmount;

          const trade = {
            id: state.trades.length + 1,
            type: state.positionType,
            entryPrice: state.entryPrice,
            exitPrice: exitPrice,
            entryTime: new Date(state.entryTime).toISOString(),
            exitTime: new Date(currentCandle.timestamp).toISOString(),
            duration: holdTime / (24 * 60 * 60 * 1000),
            pnl: pnl,
            pnlAmount: pnlAmount,
            exitReason: exitReason,
            success: pnl > 0
          };

          state.trades.push(trade);

          const emoji = trade.success ? '✅' : '❌';
          console.log(`${emoji} Trade #${trade.id}: ${trade.type} | P&L: ${(pnl * 100).toFixed(2)}% | $${pnlAmount.toFixed(2)} | ${exitReason}`);

          state.inPosition = false;
          state.entryPrice = null;
          state.takeProfit = null;
          state.stopLoss = null;
          state.positionSize = null;
        }
      } else {
        const candles = oneYearData.slice(0, i + 1);
        if (candles.length < CONFIG.emaLong + 1) continue;

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const volumes = candles.map(c => c.volume);

        const emaShort = calculateEMA(closes, CONFIG.emaShort);
        const emaLong = calculateEMA(closes, CONFIG.emaLong);
        const volatility = calculateVolatility(closes);
        const avgVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;

        if (!emaShort || !emaLong) continue;
        if (volatility < CONFIG.volatilityThreshold) continue;
        if (avgVolume < CONFIG.minVolume) continue;

        const emaDiff = ((emaShort - emaLong) / emaLong) * 100;
        let signal = null;

        if (emaShort > emaLong && emaDiff > 0.1) signal = 'BUY';
        else if (emaShort < emaLong && emaDiff < -0.1) signal = 'SELL';

        if (signal) {
          state.patternsDetected++;
          const currentCandle = oneYearData[i];
          const entryPrice = currentCandle.close;

          const recentCandles = oneYearData.slice(i - CONFIG.atrPeriod, i + 1);
          const atr = calculateATR(
            recentCandles.map(c => c.high),
            recentCandles.map(c => c.low),
            recentCandles.map(c => c.close),
            CONFIG.atrPeriod
          );

          const slAmount = Math.max(atr * CONFIG.atrMultiplier, entryPrice * 0.002);
          const stopLoss = signal === 'SELL' ? entryPrice + slAmount : entryPrice - slAmount;
          const takeProfit = signal === 'SELL'
            ? entryPrice - (slAmount * CONFIG.riskRewardRatio)
            : entryPrice + (slAmount * CONFIG.riskRewardRatio);

          state.inPosition = true;
          state.positionType = signal;
          state.entryPrice = entryPrice;
          state.entryTime = currentCandle.timestamp;
          state.stopLoss = stopLoss;
          state.takeProfit = takeProfit;
          state.positionSize = CONFIG.basePositionSize;

          const dateStr = new Date(currentCandle.timestamp).toISOString().split('T')[0];
          console.log(`🎯 Señal #${state.patternsDetected}: ${signal} @ $${entryPrice.toFixed(2)} | SL: $${stopLoss.toFixed(2)} | TP: $${takeProfit.toFixed(2)} | ${dateStr}`);
        }
      }

      if (state.patternsDetected > 0 && state.patternsDetected % 50 === 0) {
        const progress = ((i / oneYearData.length) * 100).toFixed(1);
        console.log(`📊 Progreso: ${progress}% | Señales: ${state.patternsDetected} | Trades: ${state.trades.length}`);
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
        executionTime: executionTime
      },
      trades: state.trades
    };

    const resultsDir = path.dirname(CONFIG.outputFile);
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ BACKTEST COMPLETADO                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 RESUMEN BNB V3 FAST (DATOS REALES):`);
    console.log(`   Señales: ${results.summary.patternsDetected}`);
    console.log(`   Trades: ${results.summary.totalTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Profit: $${results.summary.totalPnL.toFixed(2)}`);
    console.log(`   Balance: $${results.summary.finalBalance.toFixed(2)}`);
    console.log(`   Tiempo: ${executionTime}s\n`);

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
