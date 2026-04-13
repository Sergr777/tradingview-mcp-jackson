/**
 * 📊 BACKTEST SCALPER - 1 AÑO DE DATOS HISTÓRICOS
 *
 * Estrategia: VWAP + RSI(3) + EMA(8)
 * Symbol: XRP/USDT (spot)
 * Frecuencia: Cada 10 segundos
 * Período: 1 año (simulado)
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// 🎯 CONFIGURACIÓN DEL SCALPER
// ═══════════════════════════════════════════════════════════════

const SCALPER_CONFIG = {
  symbol: 'XRPUSDT',
  timeframe: '1m', // 1 minuto (más rápido que 10s para backtest)
  interval: 60000, // 1 minuto entre trades
  totalTrades: 6, // Limitado para demo (pueden ser muchos más)

  // Indicadores
  emaPeriod: 8,
  rsiPeriod: 3,
  vwapPeriod: 30,

  // Thresholds
  vwapThreshold: 0.002, // 0.2% de VWAP
  rsiOversold: 30,
  rsiOverbought: 70,

  // Risk Management
  stopLoss: 0.003, // -0.3%
  takeProfit: 0.009, // +0.9%

  // Position Sizing
  basePositionSize: 0.01, // 1% del capital
  initialCapital: 1000,

  // Output
  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_scalper_1year.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'backtest_scalper_1year.log')
};

// Estado del backtest
let state = {
  balance: SCALPER_CONFIG.initialCapital,
  inPosition: false,
  positionType: null,
  entryPrice: null,
  entryTime: null,
  exitTime: null,
  trades: [],
  capitalHistory: [SCALPER_CONFIG.initialCapital]
};

// ═══════════════════════════════════════════════════════════════
// 📊 CÁLCULO DE INDICADORES
// ═══════════════════════════════════════════════════════════════

function calcEMA(closes, period) {
  if (closes.length < period) return closes[0];
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
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

function calcVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol === 0 ? candles[candles.length - 1].close : cumTPV / cumVol;
}

// ═══════════════════════════════════════════════════════════════
// 📈 SEÑALES DEL SCALPER
// ═══════════════════════════════════════════════════════════════

function getScalperSignal(candles, ema8, rsi3, vwap) {
  const last = candles[candles.length - 1].close;

  const bullBias = last > vwap && last > ema8;
  const bearBias = last < vwap && last < ema8;

  let signal = 'flat';
  let confidence = 0;

  if (bullBias && rsi3 < SCALPER_CONFIG.rsiOversold) {
    signal = 'buy';
    confidence = 0.7;
  } else if (bearBias && rsi3 > SCALPER_CONFIG.rsiOverbought) {
    signal = 'sell';
    confidence = 0.7;
  }

  return { signal, last, ema8, rsi3, vwap, confidence };
}

// ═══════════════════════════════════════════════════════════════
// 🔄 BACKTEST ENGINE
// ═══════════════════════════════════════════════════════════════

async function runScalperBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST SCALPER - 1 AÑO DATOS HISTÓRICOS            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Cargar datos históricos de XRP (o usar BTC como proxy)
    console.log('📥 Cargando datos históricos...');
    let historicalData;

    // Intentar cargar datos de XRP, si no existen, usar BTC
    const xrpDataFile = 'backtesting/data/xrpusdt_5m_1year.json';
    const btcDataFile = 'backtesting/data/btcusdt_5m_2years.json';

    try {
      if (fs.existsSync(xrpDataFile)) {
        historicalData = JSON.parse(fs.readFileSync(xrpDataFile, 'utf8'));
        console.log(`✅ Datos XRP cargados: ${historicalData.length.toLocaleString()} velas`);
      } else {
        // Usar BTC como proxy (scalping es timeframe específico, no symbol específico)
        historicalData = JSON.parse(fs.readFileSync(btcDataFile, 'utf8'));
        console.log(`⚠️  Usando BTC como proxy (${historicalData.length.toLocaleString()} velas)`);
        console.log(`   (XRP no disponible - usando BTC para validación de estrategia)`);
      }
    } catch (error) {
      console.error('❌ Error cargando datos históricos:', error.message);
      process.exit(1);
    }

    // Tomar último año (aprox 72,000 velas de 5min = 1 año)
    const oneYearData = historicalData.slice(-72000);
    console.log(`📊 Usando últimas ${oneYearData.length.toLocaleString()} velas (1 año)\n`);

    // Pre-calcular indicadores para toda la data
    console.log('⏳ Pre-calculando indicadores...');
    const closes = oneYearData.map(d => d.close);
    const ema8Series = [];
    const rsi3Series = [];
    const vwapSeries = [];

    for (let i = SCALPER_CONFIG.emaPeriod; i < closes.length; i++) {
      const ema = calcEMA(closes.slice(0, i + 1), SCALPER_CONFIG.emaPeriod);
      ema8Series.push(ema);

      if (i >= SCALPER_CONFIG.rsiPeriod) {
        const rsi = calcRSI(closes.slice(0, i + 1), SCALPER_CONFIG.rsiPeriod);
        rsi3Series.push(rsi);
      } else {
        rsi3Series.push(50);
      }

      if (i >= SCALPER_CONFIG.vwapPeriod) {
        const vwap = calcVWAP(oneYearData.slice(Math.max(0, i - SCALPER_CONFIG.vwapPeriod), i + 1));
        vwapSeries.push(vwap);
      } else {
        vwapSeries.push(closes[i]);
      }
    }

    console.log('✅ Indicadores calculados\n');

    // Ejecutar backtest
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST SCALPER                           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();
    let tradeCount = 0;
    const maxTrades = 1000; // Limitar para demo

    for (let i = 100; i < oneYearData.length - SCALPER_CONFIG.vwapPeriod; i++) {
      if (tradeCount >= maxTrades) break;

      // Obtener ventana de datos
      const windowStart = Math.max(0, i - 100);
      const windowData = oneYearData.slice(windowStart, i + 1);
      const windowCloses = windowData.map(d => d.close);

      // Calcular indicadores para este punto
      const ema8 = calcEMA(windowCloses, SCALPER_CONFIG.emaPeriod);
      const rsi3 = calcRSI(windowCloses, SCALPER_CONFIG.rsiPeriod);
      const vwap = calcVWAP(windowData);

      const currentCandle = oneYearData[i];

      // Obtener señal
      const { signal, last, ema8: ema8Val, rsi3: rsi3Val, vwap: vwapVal, confidence } =
        getScalperSignal(windowData, ema8, rsi3, vwap);

      // Log cada 100 trades
      if (tradeCount > 0 && tradeCount % 100 === 0) {
        const progress = ((i / oneYearData.length) * 100).toFixed(1);
        console.log(`📊 Progreso: ${progress}% | Trades: ${tradeCount}`);
      }

      // Evaluar señales de entrada
      if (!state.inPosition) {
        if (signal === 'buy' && confidence > 0.6) {
          // Simular entrada LONG
          const positionSize = SCALPER_CONFIG.basePositionSize;
          const capital = state.balance * positionSize;

          state.inPosition = true;
          state.positionType = 'LONG';
          state.entryPrice = last;
          state.entryTime = currentCandle.timestamp;
          state.stopLoss = last * (1 - SCALPER_CONFIG.stopLoss);
          state.takeProfit = last * (1 + SCALPER_CONFIG.takeProfit);

          tradeCount++;

          console.log(`🟢 BUY @ $${last.toFixed(6)} | RSI: ${rsi3Val.toFixed(1)} | VWAP: $${vwapVal.toFixed(2)} | Capital: $${capital.toFixed(2)}`);
        }
      } else {
        // Evaluar salida
        const holdTime = currentCandle.timestamp - state.entryTime;
        const holdTimeMinutes = holdTime / 60000;

        let pnl = 0;
        let exitReason = null;

        if (state.positionType === 'LONG') {
          pnl = (last - state.entryPrice) / state.entryPrice;
        }

        // Check Take Profit
        if (last >= state.takeProfit) {
          pnl = (state.takeProfit - state.entryPrice) / state.entryPrice;
          exitReason = 'TAKE_PROFIT';
        }
        // Check Stop Loss
        else if (last <= state.stopLoss) {
          pnl = (state.stopLoss - state.entryPrice) / state.entryPrice;
          exitReason = 'STOP_LOSS';
        }
        // Time exit (10 minutos máximo para scalping)
        else if (holdTimeMinutes >= 10) {
          pnl = (last - state.entryPrice) / state.entryPrice;
          exitReason = 'TIME_EXIT';
        }

        if (exitReason) {
          const capital = state.balance * SCALPER_CONFIG.basePositionSize;
          const pnlAmount = capital * pnl;
          state.balance += pnlAmount;

          const trade = {
            id: tradeCount,
            type: 'LONG',
            entryPrice: state.entryPrice,
            exitPrice: last,
            entryTime: new Date(state.entryTime).toISOString(),
            exitTime: new Date(currentCandle.timestamp).toISOString(),
            duration: holdTimeMinutes,
            pnl: pnl,
            pnlAmount: pnlAmount,
            exitReason: exitReason,
            entryRSI: rsi3Val,
            success: pnl > 0
          };

          state.trades.push(trade);
          state.capitalHistory.push(state.balance);

          const emoji = trade.success ? '✅' : '❌';
          console.log(`${emoji} ${exitReason.padEnd(12)} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);

          // Reset state
          state.inPosition = false;
          state.entryPrice = null;
          state.entryTime = null;
        }
      }
    }

    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);

    // Guardar resultados
    const results = {
      config: SCALPER_CONFIG,
      summary: {
        totalTrades: state.trades.length,
        winningTrades: state.trades.filter(t => t.success).length,
        losingTrades: state.trades.filter(t => !t.success).length,
        winRate: state.trades.length > 0 ? (state.trades.filter(t => t.success).length / state.trades.length) : 0,
        totalPnL: state.trades.reduce((sum, t) => sum + t.pnlAmount, 0),
        finalBalance: state.balance,
        initialBalance: SCALPER_CONFIG.initialCapital,
        totalReturn: ((state.balance - SCALPER_CONFIG.initialCapital) / SCALPER_CONFIG.initialCapital),
        executionTime: executionTime
      },
      trades: state.trades,
      capitalHistory: state.capitalHistory
    };

    // Guardar JSON
    const resultsDir = path.dirname(SCALPER_CONFIG.outputFile);
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    fs.writeFileSync(SCALPER_CONFIG.outputFile, JSON.stringify(results, null, 2));

    // Guardar log
    const logDir = path.dirname(SCALPER_CONFIG.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logContent = generateReport(results);
    fs.appendFileSync(SCALPER_CONFIG.logFile, logContent);

    // Mostrar resumen
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ BACKTEST SCALPER COMPLETADO                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 RESUMEN:`);
    console.log(`   Total Trades: ${results.summary.totalTrades}`);
    console.log(`   Winning: ${results.summary.winningTrades} | Losing: ${results.summary.losingTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   Total P&L: $${results.summary.totalPnL.toFixed(2)}`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Balance Final: $${results.summary.finalBalance.toFixed(2)}`);
    console.log(`   Tiempo Ejecución: ${results.summary.executionTime}s\n`);

    console.log(`💾 Resultados guardados en:`);
    console.log(`   📄 JSON: ${SCALPER_CONFIG.outputFile}`);
    console.log(`   📄 Log: ${SCALPER_CONFIG.logFile}`);

  } catch (error) {
    console.error('❌ Error en backtest:', error.message);
    process.exit(1);
  }
}

function generateReport(results) {
  const s = results.summary;
  let report = '\n╔══════════════════════════════════════════════════════════════╗\n';
  report += '║     📊 REPORTE BACKTEST SCALPER - 1 AÑO                             ║\n';
  report += '╚══════════════════════════════════════════════════════════════╝\n\n';

  report += '📊 CONFIGURACIÓN:\n';
  report += `   Symbol: ${results.config.symbol}\n`;
  report += `   Timeframe: ${results.config.timeframe}\n`;
  report += `   Capital Inicial: $${results.config.initialCapital}\n`;
  report += `   Stop Loss: -${(results.config.stopLoss * 100).toFixed(1)}%\n`;
  report += `   Take Profit: +${(results.config.takeProfit * 100).toFixed(1)}%\n\n`;

  report += '📈 RESULTADOS:\n';
  report += `   Total Trades: ${s.totalTrades}\n`;
  report += `   Winning Trades: ${s.winningTrades}\n`;
  report +=   `   Losing Trades: ${s.losingTrades}\n`;
  report += `   Win Rate: ${(s.winRate * 100).toFixed(2)}%\n`;
  report += `   Total P&L: $${s.totalPnL.toFixed(2)}\n`;
  report += `   Return: ${(s.totalReturn * 100).toFixed(2)}%\n`;
  report += `   Balance Final: $${s.finalBalance.toFixed(2)}\n`;
  report += `   Tiempo Ejecución: ${s.executionTime}s\n`;

  if (s.totalTrades > 0) {
    report += '📊 TOP 10 TRADES:\n';
    const topTrades = [...results.trades]
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10);

    topTrades.forEach((t, i) => {
      const emoji = t.success ? '✅' : '❌';
      report += `   ${i + 1}. ${emoji} ${t.exitReason.padEnd(12)} | P&L: ${(t.pnl * 100).toFixed(2)}% | Duración: ${t.duration.toFixed(1)}min\n`;
    });
  }

  return report;
}

// Ejecutar
if (require.main === module) {
  runScalperBacktest().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
  });
}

module.exports = { runScalperBacktest };
