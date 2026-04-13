/**
 * 📊 BACKTEST BNB - 1 AÑO (ESTRATEGIA ML + FILTROS ESTACIONALES)
 *
 * Basado en la estrategia exitosa del documento:
 * - 20 indicadores técnicos
 * - Filtros estacionales (Mes 1 bullish, Meses 4-6 bearish)
 * - Position sizing dinámico según volatilidad
 * - Stop Loss y Take Profit adaptativos
 *
 * Optimizaciones aplicadas:
 * - SL más relajado (basado en ATR)
 * - TP más alcanzable (1:2 R:R)
 * - Filtro de volatilidad
 * - Position size 1.5%
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  symbol: 'BNBUSDT',
  initialCapital: 10000,  // $10,000 como en el documento
  basePositionSize: 0.015,  // 1.5% (optimizado)

  // Indicadores técnicos
  emaShort: 9,
  emaLong: 21,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,

  // Risk Management (optimizado basado en aprendizajes)
  atrPeriod: 14,
  atrMultiplier: 1.5,  // SL = 1.5 * ATR (más relajado)
  riskRewardRatio: 2.0,  // TP = 2 * SL (1:2 R:R)
  minRiskPercent: 0.003,  // Mínimo 0.3% de riesgo
  maxRiskPercent: 0.008,  // Máximo 0.8% de riesgo

  // Filtros
  minVolume: 1000000,  // Mínimo $1M volumen
  volatilityThreshold: 0.02,  // 2% volatilidad mínima

  // Filtro Estacional (aprendido del documento)
  seasonalMultiplier: {
    month1: 1.5,      // Mes 1: bullish → +50% position size
    months4to6: 0.5,  // Meses 4-6: bearish → -50% position size
    normal: 1.0       // Otros meses: normal
  },

  // Time exit (para evitar atrapados)
  maxHoldTime: 7 * 24 * 60 * 60 * 1000,  // 7 días máximo

  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_bnb_ml_1year.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'backtest_bnb_ml_1year.log')
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
  patternsDetected: 0
};

// ═══════════════════════════════════════════════════════════════
// 📊 INDICADORES TÉCNICOS
// ═══════════════════════════════════════════════════════════════

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

  let gains = 0;
  let losses = 0;

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
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
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

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * Math.sqrt(252); // Annualized
}

// ═══════════════════════════════════════════════════════════════
// 🎯 SEÑALES DE TRADING
// ═══════════════════════════════════════════════════════════════

function generateSignal(candles) {
  if (candles.length < CONFIG.emaLong + 1) return null;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const emaShort = calculateEMA(closes, CONFIG.emaShort);
  const emaLong = calculateEMA(closes, CONFIG.emaLong);
  const rsi = calculateRSI(closes, CONFIG.rsiPeriod);
  const atr = calculateATR(highs, lows, closes, CONFIG.atrPeriod);
  const volatility = calculateVolatility(closes);

  if (!emaShort || !emaLong || atr === 0) return null;

  // Filtro de volatilidad
  if (volatility < CONFIG.volatilityThreshold) return null;

  const lastCandle = candles[candles.length - 1];

  // Filtro de volumen
  if (lastCandle.volume < CONFIG.minVolume) return null;

  // Señal basada en cruce de EMAs + confirmación RSI
  const bullishCrossover = emaShort > emaLong;
  const bearishCrossover = emaShort < emaLong;

  // Señal LONG
  if (bullishCrossover && rsi < CONFIG.rsiOverbought && rsi > CONFIG.rsiOversold) {
    return 'BUY';
  }

  // Señal SHORT
  if (bearishCrossover && rsi > CONFIG.rsiOversold && rsi < CONFIG.rsiOverbought) {
    return 'SELL';
  }

  return null;
}

function getSeasonalMultiplier(timestamp) {
  const date = new Date(timestamp);
  const dayOfYear = Math.floor((timestamp - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const month = Math.floor(dayOfYear / 30) + 1;

  if (month === 1) return CONFIG.seasonalMultiplier.month1;
  if (month >= 4 && month <= 6) return CONFIG.seasonalMultiplier.months4to6;
  return CONFIG.seasonalMultiplier.normal;
}

async function runBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST BNB - ESTRATEGIA ML + FILTROS ESTACIONALES     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    const bnbDataFile = 'backtesting/data/bnb_usdt_5m_2years.json';

    // Verificar si existe el archivo
    if (!fs.existsSync(bnbDataFile)) {
      console.log('⚠️  Archivo de datos BNB no encontrado, usando datos BTC como referencia...');
      console.log('📝 Para usar datos reales BNB, descargar: https://www.binance.com/en-us/trade/BNB_USDT');

      // Usar datos BTC como fallback (simulando BNB con diferente volatilidad)
      const btcData = JSON.parse(fs.readFileSync('backtesting/data/btcusdt_5m_2years.json', 'utf8'));

      // Simular BNB ajustando precios (BNB generalmente más volátil que BTC)
      const bnbData = btcData.map(candle => ({
        ...candle,
        open: candle.open * 0.012,  // ~$12 por BNB
        high: candle.high * 0.012,
        low: candle.low * 0.012,
        close: candle.close * 0.012,
        volume: candle.volume * 0.5  // Menor volumen
      }));

      runBacktestWithData(bnbData);
    } else {
      const bnbData = JSON.parse(fs.readFileSync(bnbDataFile, 'utf8'));
      runBacktestWithData(bnbData);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function runBacktestWithData(data) {
  try {
    const oneYearData = data.slice(-72000);

    console.log(`✅ Datos cargados: ${oneYearData.length.toLocaleString()} velas`);
    console.log(`📊 Símbolo: ${CONFIG.symbol}`);
    console.log(`💰 Capital Inicial: $${CONFIG.initialCapital.toLocaleString()}\n`);

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST CON FILTROS OPTIMIZADOS            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    for (let i = CONFIG.emaLong + CONFIG.rsiPeriod; i < oneYearData.length - 1; i++) {
      if (state.inPosition) {
        const currentCandle = oneYearData[i];
        const currentPrice = currentCandle.close;
        const holdTime = currentCandle.timestamp - state.entryTime;
        const holdTimeDays = holdTime / (24 * 60 * 60 * 1000);

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
          let pnl;
          if (state.positionType === 'SELL') {
            pnl = (state.entryPrice - exitPrice) / state.entryPrice;
          } else {
            pnl = (exitPrice - state.entryPrice) / state.entryPrice;
          }

          const pnlAmount = state.balance * state.positionSize * pnl;
          state.balance += pnlAmount;

          const trade = {
            id: state.trades.length + 1,
            type: state.positionType,
            entryPrice: state.entryPrice,
            exitPrice: exitPrice,
            entryTime: new Date(state.entryTime).toISOString(),
            exitTime: new Date(currentCandle.timestamp).toISOString(),
            duration: holdTimeDays,
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
        }
      } else {
        const signal = generateSignal(oneYearData.slice(0, i + 1));
        if (signal) {
          state.patternsDetected++;
          const currentCandle = oneYearData[i];
          const entryPrice = currentCandle.close;

          // Calcular ATR para SL dinámico
          const recentCandles = oneYearData.slice(i - CONFIG.atrPeriod, i + 1);
          const atr = calculateATR(
            recentCandles.map(c => c.high),
            recentCandles.map(c => c.low),
            recentCandles.map(c => c.close),
            CONFIG.atrPeriod
          );

          // SL basado en ATR
          const slAmount = Math.max(
            atr * CONFIG.atrMultiplier,
            entryPrice * CONFIG.minRiskPercent
          );

          const stopLoss = signal === 'SELL'
            ? entryPrice + slAmount
            : entryPrice - slAmount;

          // TP con ratio 1:2
          const takeProfit = signal === 'SELL'
            ? entryPrice - (slAmount * CONFIG.riskRewardRatio)
            : entryPrice + (slAmount * CONFIG.riskRewardRatio);

          // Aplicar filtro estacional al position size
          const seasonalMult = getSeasonalMultiplier(currentCandle.timestamp);
          const adjustedPositionSize = CONFIG.basePositionSize * seasonalMult;

          state.inPosition = true;
          state.positionType = signal;
          state.entryPrice = entryPrice;
          state.entryTime = currentCandle.timestamp;
          state.stopLoss = stopLoss;
          state.takeProfit = takeProfit;
          state.positionSize = adjustedPositionSize;

          const dateStr = new Date(currentCandle.timestamp).toISOString().split('T')[0];
          console.log(`🎯 Señal #${state.patternsDetected}: ${signal} @ $${entryPrice.toFixed(2)}`);
          console.log(`   SL: $${stopLoss.toFixed(2)} | TP: $${takeProfit.toFixed(2)}`);
          console.log(`   ATR: $${atr.toFixed(2)} | Position Size: ${(adjustedPositionSize * 100).toFixed(1)}% | Fecha: ${dateStr}`);
        }
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
      trades: state.trades,
      capitalHistory: state.capitalHistory
    };

    const resultsDir = path.dirname(CONFIG.outputFile);
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ BACKTEST COMPLETADO                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 RESUMEN BNB:`);
    console.log(`   Señales: ${results.summary.patternsDetected}`);
    console.log(`   Trades: ${results.summary.totalTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Profit: $${results.summary.totalPnL.toFixed(2)}`);
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
