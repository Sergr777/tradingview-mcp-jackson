/**
 * 📊 BACKTEST BNB - VERSIÓN V3 (DATOS REALES)
 *
 * Cambios vs v2:
 * - Usa datos históricos reales de BNB/USDT (no simulados)
 * - Mantiene filtros relajados de v2
 * - Configuración optimizada para volatilidad real de BNB
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  symbol: 'BNBUSDT',
  initialCapital: 10000,
  basePositionSize: 0.02,  // 2%

  // Indicadores técnicos
  emaShort: 9,
  emaLong: 21,
  rsiPeriod: 14,
  rsiOversold: 35,  // Relajado
  rsiOverbought: 65,  // Relajado

  // Risk Management
  atrPeriod: 14,
  atrMultiplier: 1.5,
  riskRewardRatio: 2.0,
  minRiskPercent: 0.002,  // 0.2%
  maxRiskPercent: 0.008,  // 0.8%

  // 🚀 FILTROS RELAJADOS (v2)
  minVolume: 100000,  // $100K
  volatilityThreshold: 0.005,  // 0.5%

  // Filtro Estacional
  seasonalMultiplier: {
    month1: 1.5,
    months4to6: 0.5,
    normal: 1.0
  },

  maxHoldTime: 7 * 24 * 60 * 60 * 1000,  // 7 días

  // 📁 ARCHIVO DE DATOS REALES
  dataFile: path.join(__dirname, 'backtesting', 'data', 'bnbusdt_5m_2years.json'),

  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_bnb_ml_1year_v3.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'backtest_bnb_ml_1year_v3.log')
};

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

  if (returns.length === 0) return 0;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * Math.sqrt(252);
}

// ═══════════════════════════════════════════════════════════════
// 🎯 SEÑALES DE TRADING (SIMPLIFICADAS)
// ═══════════════════════════════════════════════════════════════

function generateSignal(candles) {
  if (candles.length < CONFIG.emaLong + 1) return null;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const emaShort = calculateEMA(closes, CONFIG.emaShort);
  const emaLong = calculateEMA(closes, CONFIG.emaLong);
  const rsi = calculateRSI(closes, CONFIG.rsiPeriod);
  const atr = calculateATR(highs, lows, closes, CONFIG.atrPeriod);
  const volatility = calculateVolatility(candles);
  const avgVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;

  if (!emaShort || !emaLong || atr === 0) return null;

  // 🚀 FILTROS RELAJADOS
  if (volatility < CONFIG.volatilityThreshold) return null;
  if (avgVolume < CONFIG.minVolume) return null;

  const lastCandle = candles[candles.length - 1];

  // Señal simplificada: solo cruce de EMAs
  const emaDiff = ((emaShort - emaLong) / emaLong) * 100; // % difference

  // Señal LONG: EMA corto cruza hacia arriba sobre EMA largo
  if (emaShort > emaLong && emaDiff > 0.1) {
    return 'BUY';
  }

  // Señal SHORT: EMA corto cruza hacia abajo sobre EMA largo
  if (emaShort < emaLong && emaDiff < -0.1) {
    return 'SELL';
  }

  return null;
}

function getSeasonalMultiplier(timestamp) {
  const date = new Date(timestamp);
  const yearStart = new Date(date.getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((timestamp - yearStart) / (1000 * 60 * 60 * 24));
  const month = Math.floor(dayOfYear / 30) + 1;

  if (month === 1) return CONFIG.seasonalMultiplier.month1;
  if (month >= 4 && month <= 6) return CONFIG.seasonalMultiplier.months4to6;
  return CONFIG.seasonalMultiplier.normal;
}

async function runBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST BNB - VERSIÓN V3 (DATOS REALES)                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Verificar que existe el archivo de datos
    if (!fs.existsSync(CONFIG.dataFile)) {
      console.error('❌ ERROR: Archivo de datos no encontrado');
      console.error(`   Ruta esperada: ${CONFIG.dataFile}`);
      console.error(`\n   💡 Solución: Ejecuta primero: node download_bnb_data.cjs`);
      process.exit(1);
    }

    const bnbData = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));

    console.log(`✅ Datos cargados: ${bnbData.length.toLocaleString()} velas`);
    console.log(`📊 Símbolo: ${CONFIG.symbol}`);
    console.log(`💰 Capital Inicial: $${CONFIG.initialCapital.toLocaleString()}`);
    console.log(`📈 Position Size: ${(CONFIG.basePositionSize * 100).toFixed(1)}%\n`);

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST V3 (DATOS REALES BNB)              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    for (let i = CONFIG.emaLong + CONFIG.rsiPeriod; i < bnbData.length - 1; i++) {
      if (state.inPosition) {
        const currentCandle = bnbData[i];
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
          state.positionSize = null;
        }
      } else {
        const signal = generateSignal(bnbData.slice(0, i + 1));
        if (signal) {
          state.patternsDetected++;
          const currentCandle = bnbData[i];
          const entryPrice = currentCandle.close;

          const recentCandles = bnbData.slice(i - CONFIG.atrPeriod, i + 1);
          const atr = calculateATR(
            recentCandles.map(c => c.high),
            recentCandles.map(c => c.low),
            recentCandles.map(c => c.close),
            CONFIG.atrPeriod
          );

          const slAmount = Math.max(
            atr * CONFIG.atrMultiplier,
            entryPrice * CONFIG.minRiskPercent
          );

          const stopLoss = signal === 'SELL'
            ? entryPrice + slAmount
            : entryPrice - slAmount;

          const takeProfit = signal === 'SELL'
            ? entryPrice - (slAmount * CONFIG.riskRewardRatio)
            : entryPrice + (slAmount * CONFIG.riskRewardRatio);

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
          console.log(`   ATR: $${atr.toFixed(4)} | Position: ${(adjustedPositionSize * 100).toFixed(1)}% | ${dateStr}`);
        }
      }

      if (state.patternsDetected > 0 && state.patternsDetected % 100 === 0) {
        const progress = ((i / bnbData.length) * 100).toFixed(1);
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
      trades: state.trades,
      capitalHistory: state.capitalHistory
    };

    const resultsDir = path.dirname(CONFIG.outputFile);
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(results, null, 2));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ BACKTEST COMPLETADO                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 RESUMEN BNB V3 (DATOS REALES):`);
    console.log(`   Señales: ${results.summary.patternsDetected}`);
    console.log(`   Trades: ${results.summary.totalTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Profit: $${results.summary.totalPnL.toFixed(2)}`);
    console.log(`   Balance Final: $${results.summary.finalBalance.toFixed(2)}`);
    console.log(`   Ejecución: ${executionTime}s\n`);

    // Comparación vs proyección original
    if (results.summary.totalTrades > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('📊 COMPARATIVO vs PROYECCIÓN ORIGINAL:');
      console.log('═══════════════════════════════════════════════════════════\n');

      console.log('Proyección Original (Basado en ETH/SOL):');
      console.log(`   Win Rate Esperado: 48-52%`);
      console.log(`   Return Esperado: +8-15% anual`);
      console.log(`   Trades Esperados: 100-120\n`);

      console.log('Resultado Real (Datos BNB):');
      console.log(`   Win Rate Real: ${(results.summary.winRate * 100).toFixed(2)}%`);
      console.log(`   Return Real: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
      console.log(`   Trades Real: ${results.summary.totalTrades}\n`);

      const expectedReturn = 0.08; // 8% mínimo esperado
      const actualReturn = results.summary.totalReturn;
      const performance = actualReturn >= expectedReturn ? '✅ Cumple' : '❌ Inferior';

      console.log(`Veredicto vs Expectativa: ${performance}`);
    }

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
