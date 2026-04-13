const fs = require('fs');
const path = require('path');

const CONFIG = {
  symbol: 'BNBUSDT',
  initialCapital: 10000,
  basePositionSize: 0.02,
  emaShort: 9,
  emaLong: 21,
  minVolume: 100000,
  volatilityThreshold: 0.005,
  dataFile: path.join(__dirname, 'backtesting', 'data', 'bnbusdt_5m_2years.json'),
  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_bnb_ml_v3_ultrafast.json')
};

function calculateEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  for (let i = period; i < data.length; i++) ema = (data[i] * k) + (ema * (1 - k));
  return ema;
}

function calculateVolatility(closes, period = 20) {
  if (closes.length < period) return 0;
  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  if (returns.length === 0) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

async function runBacktest() {
  console.log('📊 BNB ML v3 ULTRAFAST (6 meses datos reales)\n');
  const bnbData = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
  const sixMonthData = bnbData.slice(-37500);
  console.log('✅ Datos: ' + sixMonthData.length.toLocaleString() + ' velas');
  console.log('💰 Capital: $' + CONFIG.initialCapital.toLocaleString() + '\n');
  const startTime = Date.now();
  let state = { balance: CONFIG.initialCapital, inPosition: false, trades: [], patternsDetected: 0 };
  for (let i = CONFIG.emaLong + 21; i < sixMonthData.length - 1; i++) {
    if (state.inPosition) {
      const candle = sixMonthData[i];
      const price = candle.close;
      const holdTime = candle.timestamp - state.entryTime;
      let exit = false, reason = null, exitPrice = price;
      if (state.positionType === 'SELL') {
        if (price <= state.takeProfit) { exit = true; reason = 'TP'; exitPrice = state.takeProfit; }
        else if (price >= state.stopLoss) { exit = true; reason = 'SL'; exitPrice = state.stopLoss; }
        else if (holdTime >= 7 * 24 * 60 * 60 * 1000) { exit = true; reason = 'TIME'; }
      } else {
        if (price >= state.takeProfit) { exit = true; reason = 'TP'; exitPrice = state.takeProfit; }
        else if (price <= state.stopLoss) { exit = true; reason = 'SL'; exitPrice = state.stopLoss; }
        else if (holdTime >= 7 * 24 * 60 * 60 * 1000) { exit = true; reason = 'TIME'; }
      }
      if (exit) {
        const pnl = state.positionType === 'SELL' ? (state.entryPrice - exitPrice) / state.entryPrice : (exitPrice - state.entryPrice) / state.entryPrice;
        const pnlAmount = state.balance * CONFIG.basePositionSize * pnl;
        state.balance += pnlAmount;
        const trade = { id: state.trades.length + 1, type: state.positionType, pnl: pnl, pnlAmount: pnlAmount, success: pnl > 0 };
        state.trades.push(trade);
        const emoji = trade.success ? '✅' : '❌';
        console.log(emoji + ' Trade #' + trade.id + ': ' + trade.type + ' | ' + (pnl * 100).toFixed(2) + '% | $' + pnlAmount.toFixed(2) + ' | ' + reason);
        state.inPosition = false;
        state.entryPrice = null;
      }
    } else {
      const candles = sixMonthData.slice(0, i + 1);
      if (candles.length < CONFIG.emaLong + 1) continue;
      const closes = candles.map(c => c.close);
      const volumes = candles.map(c => c.volume);
      const emaShort = calculateEMA(closes, CONFIG.emaShort);
      const emaLong = calculateEMA(closes, CONFIG.emaLong);
      const volatility = calculateVolatility(closes);
      const avgVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
      if (!emaShort || !emaLong || volatility < CONFIG.volatilityThreshold || avgVolume < CONFIG.minVolume) continue;
      const emaDiff = ((emaShort - emaLong) / emaLong) * 100;
      let signal = null;
      if (emaShort > emaLong && emaDiff > 0.1) signal = 'BUY';
      else if (emaShort < emaLong && emaDiff < -0.1) signal = 'SELL';
      if (signal) {
        state.patternsDetected++;
        const candle = sixMonthData[i];
        state.inPosition = true;
        state.positionType = signal;
        state.entryPrice = candle.close;
        state.entryTime = candle.timestamp;
        state.stopLoss = signal === 'SELL' ? candle.close * 1.005 : candle.close * 0.995;
        state.takeProfit = signal === 'SELL' ? candle.close * 0.99 : candle.close * 1.01;
        console.log('🎯 Señal #' + state.patternsDetected + ': ' + signal + ' @ $' + candle.close.toFixed(2));
      }
    }
    if (state.patternsDetected > 0 && state.patternsDetected % 25 === 0) {
      console.log('📊 ' + ((i / sixMonthData.length) * 100).toFixed(0) + '% | Señales: ' + state.patternsDetected + ' | Trades: ' + state.trades.length);
    }
  }
  const results = { summary: { patternsDetected: state.patternsDetected, totalTrades: state.trades.length, winningTrades: state.trades.filter(t => t.success).length, winRate: state.trades.length > 0 ? state.trades.filter(t => t.success).length / state.trades.length : 0, totalPnL: state.trades.reduce((sum, t) => sum + t.pnlAmount, 0), finalBalance: state.balance, totalReturn: (state.balance - CONFIG.initialCapital) / CONFIG.initialCapital }, trades: state.trades };
  const resultsDir = path.dirname(CONFIG.outputFile);
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2));
  console.log('\n✅ BACKTEST COMPLETADO');
  console.log('Señales: ' + results.summary.patternsDetected);
  console.log('Trades: ' + results.summary.totalTrades);
  console.log('WR: ' + (results.summary.winRate * 100).toFixed(2) + '%');
  console.log('Return: ' + (results.summary.totalReturn * 100).toFixed(2) + '%');
  console.log('Profit: $' + results.summary.totalPnL.toFixed(2) + '\n');
}
if (require.main === module) { runBacktest().catch(console.error); }
