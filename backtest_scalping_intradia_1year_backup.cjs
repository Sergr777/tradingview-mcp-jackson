/**
 * 📊 BACKTEST SCALPING INTRADÍA - 1 AÑO
 *
 * Estrategia: Manipulación de Máximos/Mínimos + Vacío M1
 * Symbol: BTCUSDT (o GBPUSD si está disponible)
 * Timeframes: H1 (análisis) + M1 (entradas)
 * Horarios: Londres (9-11am) o NY (2-4:30pm) hora España
 * Período: 1 año
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// 🎯 CONFIGURACIÓN DE LA ESTRATEGIA
// ═══════════════════════════════════════════════════════════════

const SCALPING_CONFIG = {
  symbol: 'BTCUSDT',
  timeframes: {
    analysis: '1h',  // H1 para detectar máximos/mínimos
    entry: '1m'      // M1 para confirmación de vacío
  },

  // Horarios operativos (hora España = UTC+1/UTC+2)
  sessions: {
    london: {
      start: 8,   // 9am hora España (ajustar según DST)
      end: 10,    // 11am hora España
      name: 'Londres'
    },
    newYork: {
      start: 13,  // 2pm hora España (ajustar según DST)
      end: 15.5,  // 4:30pm hora España
      name: 'Nueva York'
    }
  },

  // Indicadores para detectar máximos/mínimos
  lookbackPeriod: 20,  // Velas hacia atrás para buscar máximo/mínimo relevante

  // Confirmación de vacío en M1
  voidCandles: 3,        // Necesario vacío entre vela 1 y 3
  voidThreshold: 0.1,   // 10% del rango promedio de la vela

  // Gestión de riesgo
  stopLossBuffer: 0.001,  // 0.1% por debajo del mínimo/máximo
  tp1Ratio: 0.002,         // TP1 = 0.2% (1:2 risk:reward)
  tp2Ratio: 0.004,         // TP2 = 0.4% (1:4 risk:reward)

  // Position sizing
  basePositionSize: 0.02,  // 2% del capital (más agresivo que estrategias anteriores)
  initialCapital: 1000,

  // Salida parcial
  tp1ClosePercent: 0.5,    // Cerrar 50% en TP1
  moveToBreakeven: true,   // Mover SL a breakeven después de TP1

  // Salida total
  maxHoldTime: 60 * 60 * 1000,  // Máximo 1 hora en posición
  timeExit: 30 * 60 * 1000,    // Salir después de 30 min si no hay TP

  // Output
  outputFile: path.join(__dirname, 'logs', 'week1', 'backtest_scalping_intradia_1year.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'backtest_scalping_intradia_1year.log')
};

// Estado del backtest
let state = {
  balance: SCALPING_CONFIG.initialCapital,
  inPosition: false,
  positionType: null,
  entryPrice: null,
  entryTime: null,
  stopLoss: null,
  tp1: null,
  tp2: null,
  tp1Hit: false,
  tp1Size: 0,  // Cantidad cerrada en TP1
  tp2Size: 0,  // Cantidad restante para TP2
  trades: [],
  capitalHistory: [SCALPING_CONFIG.initialCapital],
  patternsDetected: 0,
  voidsDetected: 0
};

// ═══════════════════════════════════════════════════════════════
// 📊 FUNCIONES DE ANÁLISIS
// ═══════════════════════════════════════════════════════════════

/**
 * Detecta si un rompimiento es válido (manipulación de máximo/mínimo)
 */
function isValidBreakout(candles, direction) {
  if (candles.length < SCALPING_CONFIG.lookbackPeriod) return false;

  const recentCandles = candles.slice(-SCALPING_CONFIG.lookbackPeriod);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);

  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const lastCandle = candles[candles.length - 1];

  if (direction === 'sell') {
    // Romper máximo: el máximo debe ser relevante y el precio actual debe estar cerca
    const lastHigh = lastCandle.high;
    const isNearHigh = lastHigh >= maxHigh * 0.999; // Dentro del 0.1% del máximo
    return isNearHigh;
  } else {
    // Romper mínimo: el mínimo debe ser relevante y el precio actual debe estar cerca
    const lastLow = lastCandle.low;
    const isNearLow = lastLow <= minLow * 1.001; // Dentro del 0.1% del mínimo
    return isNearLow;
  }
}

/**
 * Detecta "vacío" (imbalance) en M1
 * El vacío existe cuando la vela 1 y la vela 3 no se tocan
 */
function detectVoid(minuteCandles) {
  if (minuteCandles.length < 3) return false;

  const candle1 = minuteCandles[minuteCandles.length - 3];
  const candle2 = minuteCandles[minuteCandles.length - 2];
  const candle3 = minuteCandles[minuteCandles.length - 1];

  // Verificar que la vela 1 y la vela 3 no se toquen
  const high1 = candle1.high;
  const low1 = candle1.low;
  const high3 = candle3.high;
  const low3 = candle3.low;

  // Hay vacío si el rango de la vela 1 y la vela 3 no se superponen
  const hasVoid = (low3 > high1) || (high3 < low1);

  if (hasVoid) {
    // Calcular el tamaño del vacío como porcentaje del rango promedio
    const avgRange = (candle1.high - candle1.low + candle2.high - candle2.low + candle3.high - candle3.low) / 3;
    const voidSize = Math.abs(high3 - low1) / avgRange;

    return {
      hasVoid: true,
      voidSize: voidSize,
      direction: low3 > high1 ? 'up' : 'down' // up = gap hacia arriba, down = gap hacia abajo
    };
  }

  return { hasVoid: false };
}

/**
 * Verifica si estamos en horario operativo
 */
function isInOperatingSession(timestamp) {
  const date = new Date(timestamp);
  const hour = date.getHours() + date.getMinutes() / 60;

  // Sesión de Londres: 8-10 (9-11am hora España)
  const inLondon = hour >= SCALPING_CONFIG.sessions.london.start &&
                   hour <= SCALPING_CONFIG.sessions.london.end;

  // Sesión de Nueva York: 13-15.5 (2-4:30pm hora España)
  const inNewYork = hour >= SCALPING_CONFIG.sessions.newYork.start &&
                    hour <= SCALPING_CONFIG.sessions.newYork.end;

  return inLondon || inNewYork;
}

// ═══════════════════════════════════════════════════════════════
// 🔄 BACKTEST ENGINE
// ═══════════════════════════════════════════════════════════════

async function runScalpingBacktest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📊 BACKTEST SCALPING INTRADÍA - 1 AÑO                    ║');
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
      console.error('❌ Error cargando datos:', error.message);
      process.exit(1);
    }

    // Tomar último año
    const oneYearData = historicalData.slice(-72000);
    console.log(`📊 Usando últimas ${oneYearData.length.toLocaleString()} velas (1 año)\n`);

    // Agrupar velas en H1 para análisis
    console.log('⏳ Agrupando velas en H1 para análisis...');
    const hourlyData = aggregateToHourly(oneYearData);
    console.log(`✅ ${hourlyData.length.toLocaleString()} velas H1 generadas\n`);

    // Ejecutar backtest
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🔄 EJECUTANDO BACKTEST SCALPING INTRADÍA                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();
    let tradeCount = 0;

    // Iterar sobre velas H1
    for (let i = SCALPING_CONFIG.lookbackPeriod; i < hourlyData.length - 1; i++) {
      const hourlyCandle = hourlyData[i];

      // Verificar si estamos en horario operativo
      if (!isInOperatingSession(hourlyCandle.timestamp)) {
        continue;
      }

      // Buscar rompimiento de máximo o mínimo
      const sellSignal = isValidBreakout(hourlyData.slice(0, i + 1), 'sell');
      const buySignal = isValidBreakout(hourlyData.slice(0, i + 1), 'buy');

      if (!sellSignal && !buySignal) {
        continue;
      }

      state.patternsDetected++;

      // Buscar confirmación en M1 (velas de 5min que componen la vela H1)
      const minuteCandles = getMinuteCandlesForHour(oneYearData, hourlyCandle.timestamp);

      if (minuteCandles.length < 3) {
        continue;
      }

      const voidInfo = detectVoid(minuteCandles);

      if (!voidInfo.hasVoid) {
        continue;
      }

      state.voidsDetected++;

      // Determinar dirección del trade
      const tradeDirection = sellSignal ? 'SELL' : 'BUY';

      // Calcular niveles de entrada, SL, TP1, TP2
      const currentPrice = hourlyCandle.close;
      const recentCandles = hourlyData.slice(i - SCALPING_CONFIG.lookbackPeriod, i + 1);
      const recentHighs = recentCandles.map(c => c.high);
      const recentLows = recentCandles.map(c => c.low);
      const maxHigh = Math.max(...recentHighs);
      const minLow = Math.min(...recentLows);

      let entryPrice, stopLoss, tp1, tp2;

      if (tradeDirection === 'SELL') {
        // Venta: Rompiendo máximo
        entryPrice = currentPrice;
        stopLoss = maxHigh * (1 + SCALPING_CONFIG.stopLossBuffer); // SL por encima del máximo
        tp1 = entryPrice * (1 - SCALPING_CONFIG.tp1Ratio);
        tp2 = entryPrice * (1 - SCALPING_CONFIG.tp2Ratio);
      } else {
        // Compra: Rompiendo mínimo
        entryPrice = currentPrice;
        stopLoss = minLow * (1 - SCALPING_CONFIG.stopLossBuffer); // SL por debajo del mínimo
        tp1 = entryPrice * (1 + SCALPING_CONFIG.tp1Ratio);
        tp2 = entryPrice * (1 + SCALPING_CONFIG.tp2Ratio);
      }

      // Entrada en posición
      state.inPosition = true;
      state.positionType = tradeDirection;
      state.entryPrice = entryPrice;
      state.entryTime = hourlyCandle.timestamp;
      state.stopLoss = stopLoss;
      state.tp1 = tp1;
      state.tp2 = tp2;
      state.tp1Hit = false;
      state.tp1Size = SCALPING_CONFIG.basePositionSize * SCALPING_CONFIG.tp1ClosePercent;
      state.tp2Size = SCALPING_CONFIG.basePositionSize * (1 - SCALPING_CONFIG.tp1ClosePercent);

      console.log(`\n🎯 PATRÓN #${state.patternsDetected}: ${tradeDirection} @ $${entryPrice.toFixed(2)}`);
      console.log(`   SL: $${stopLoss.toFixed(2)} | TP1: $${tp1.toFixed(2)} | TP2: $${tp2.toFixed(2)}`);
      console.log(`   Vacío detectado: ${voidInfo.voidSize.toFixed(3)} | Sesión: ${isInOperatingSession(hourlyCandle.timestamp) ? 'SÍ' : 'NO'}`);

      // Buscar salida en velas futuras
      for (let j = i + 1; j < Math.min(i + 20, hourlyData.length); j++) {
        const nextCandle = hourlyData[j];
        const nextPrice = nextCandle.close;
        const holdTime = nextCandle.timestamp - state.entryTime;
        const holdTimeMinutes = holdTime / 60000;

        let pnl = 0;
        let exitReason = null;
        let exitPrice = nextPrice;

        if (tradeDirection === 'SELL') {
          // Evaluar salidas para venta
          if (!state.tp1Hit && nextPrice <= tp1) {
            // TP1 alcanzado
            const tp1Pnl = (state.entryPrice - tp1) / state.entryPrice;
            const tp1Amount = state.balance * state.tp1Size * tp1Pnl;
            state.balance += tp1Amount;

            console.log(`   ✅ TP1 ALCANZADO @ $${nextPrice.toFixed(2)} | P&L: +${(tp1Pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);

            // Mover SL a breakeven
            state.stopLoss = state.entryPrice;
            state.tp1Hit = true;
            state.tp1Size = 0; // Ya cerramos esta parte
            continue;
          } else if (nextPrice <= tp2) {
            // TP2 alcanzado
            const tp2Pnl = (state.entryPrice - tp2) / state.entryPrice;
            const tp2Amount = state.balance * state.tp2Size * tp2Pnl;
            state.balance += tp2Amount;

            pnl = tp1Pnl || tp2Pnl;
            exitReason = 'TP2';
            exitPrice = nextPrice;

            const totalPnl = tp1Pnl ?
              (state.balance * SCALPING_CONFIG.basePositionSize * SCALPING_CONFIG.tp1ClosePercent * tp1Pnl) + tp2Amount :
              tp2Amount;

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
            console.log(`   ${emoji} ${exitReason} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)} | Duración: ${holdTimeMinutes.toFixed(1)}min`);

            break;
          } else if (nextPrice >= stopLoss) {
            // Stop Loss
            const slPnl = (state.entryPrice - stopLoss) / state.entryPrice;
            const slAmount = state.balance * SCALPING_CONFIG.basePositionSize * slPnl;
            state.balance += slAmount;

            pnl = slPnl;
            exitReason = 'STOP_LOSS';
            exitPrice = nextPrice;

            const trade = {
              id: state.trades.length + 1,
              type: 'SELL',
              entryPrice: state.entryPrice,
              exitPrice: exitPrice,
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

            const emoji = '❌';
            console.log(`   ${emoji} ${exitReason} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)} | Duración: ${holdTimeMinutes.toFixed(1)}min`);

            break;
          } else if (holdTimeMinutes >= SCALPING_CONFIG.timeExit / 60000) {
            // Time Exit
            const timePnl = (state.entryPrice - nextPrice) / state.entryPrice;
            const timeAmount = state.balance * SCALPING_CONFIG.basePositionSize * timePnl;
            state.balance += timeAmount;

            pnl = timePnl;
            exitReason = 'TIME_EXIT';
            exitPrice = nextPrice;

            const trade = {
              id: state.trades.length + 1,
              type: 'SELL',
              entryPrice: state.entryPrice,
              exitPrice: exitPrice,
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
            console.log(`   ${emoji} ${exitReason} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)} | Duración: ${holdTimeMinutes.toFixed(1)}min`);

            break;
          }
        } else {
          // Evaluar salidas para compra (simétrico pero invertido)
          if (!state.tp1Hit && nextPrice >= tp1) {
            // TP1 alcanzado
            const tp1Pnl = (tp1 - state.entryPrice) / state.entryPrice;
            const tp1Amount = state.balance * state.tp1Size * tp1Pnl;
            state.balance += tp1Amount;

            console.log(`   ✅ TP1 ALCANZADO @ $${nextPrice.toFixed(2)} | P&L: +${(tp1Pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)}`);

            state.stopLoss = state.entryPrice;
            state.tp1Hit = true;
            state.tp1Size = 0;
            continue;
          } else if (nextPrice >= tp2) {
            // TP2 alcanzado
            const tp2Pnl = (tp2 - state.entryPrice) / state.entryPrice;
            const tp2Amount = state.balance * state.tp2Size * tp2Pnl;
            state.balance += tp2Amount;

            pnl = tp2Pnl;
            exitReason = 'TP2';
            exitPrice = nextPrice;

            const totalPnl = tp1Pnl ?
              (state.balance * SCALPING_CONFIG.basePositionSize * SCALPING_CONFIG.tp1ClosePercent * tp1Pnl) + tp2Amount :
              tp2Amount;

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
            console.log(`   ${emoji} ${exitReason} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)} | Duración: ${holdTimeMinutes.toFixed(1)}min`);

            break;
          } else if (nextPrice <= stopLoss) {
            // Stop Loss
            const slPnl = (stopLoss - state.entryPrice) / state.entryPrice;
            const slAmount = state.balance * SCALPING_CONFIG.basePositionSize * slPnl;
            state.balance += slAmount;

            pnl = slPnl;
            exitReason = 'STOP_LOSS';
            exitPrice = nextPrice;

            const trade = {
              id: state.trades.length + 1,
              type: 'BUY',
              entryPrice: state.entryPrice,
              exitPrice: exitPrice,
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

            const emoji = '❌';
            console.log(`   ${emoji} ${exitReason} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)} | Duración: ${holdTimeMinutes.toFixed(1)}min`);

            break;
          } else if (holdTimeMinutes >= SCALPING_CONFIG.timeExit / 60000) {
            // Time Exit
            const timePnl = (nextPrice - state.entryPrice) / state.entryPrice;
            const timeAmount = state.balance * SCALPING_CONFIG.basePositionSize * timePnl;
            state.balance += timeAmount;

            pnl = timePnl;
            exitReason = 'TIME_EXIT';
            exitPrice = nextPrice;

            const trade = {
              id: state.trades.length + 1,
              type: 'BUY',
              entryPrice: state.entryPrice,
              exitPrice: exitPrice,
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
            console.log(`   ${emoji} ${exitReason} | P&L: ${(pnl * 100).toFixed(2)}% | Balance: $${state.balance.toFixed(2)} | Duración: ${holdTimeMinutes.toFixed(1)}min`);

            break;
          }
        }

        // Reset después de salir
        if (exitReason) {
          state.inPosition = false;
          state.entryPrice = null;
          state.entryTime = null;
          break;
        }
      }

      // Log de progreso
      if (state.patternsDetected > 0 && state.patternsDetected % 10 === 0) {
        const progress = ((i / hourlyData.length) * 100).toFixed(1);
        console.log(`📊 Progreso: ${progress}% | Patrones: ${state.patternsDetected} | Trades: ${state.trades.length}`);
      }
    }

    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);

    // Guardar resultados
    const results = {
      config: SCALPING_CONFIG,
      summary: {
        patternsDetected: state.patternsDetected,
        voidsDetected: state.voidsDetected,
        totalTrades: state.trades.length,
        winningTrades: state.trades.filter(t => t.success).length,
        losingTrades: state.trades.filter(t => !t.success).length,
        winRate: state.trades.length > 0 ? (state.trades.filter(t => t.success).length / state.trades.length) : 0,
        tp1Hits: state.trades.filter(t => t.tp1Hit).length,
        totalPnL: state.trades.reduce((sum, t) => sum + t.pnlAmount, 0),
        finalBalance: state.balance,
        initialBalance: SCALPING_CONFIG.initialCapital,
        totalReturn: ((state.balance - SCALPING_CONFIG.initialCapital) / SCALPING_CONFIG.initialCapital),
        executionTime: executionTime
      },
      trades: state.trades,
      capitalHistory: state.capitalHistory
    };

    // Guardar JSON
    const resultsDir = path.dirname(SCALPING_CONFIG.outputFile);
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    fs.writeFileSync(SCALPING_CONFIG.outputFile, JSON.stringify(results, null, 2));

    // Guardar log
    const logDir = path.dirname(SCALPING_CONFIG.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logContent = generateReport(results);
    fs.appendFileSync(SCALPING_CONFIG.logFile, logContent);

    // Mostrar resumen
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ BACKTEST SCALPING INTRADÍA COMPLETADO                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 RESUMEN:`);
    console.log(`   Patrones Detectados: ${results.summary.patternsDetected}`);
    console.log(`   Vacíos Confirmados: ${results.summary.voidsDetected}`);
    console.log(`   Total Trades: ${results.summary.totalTrades}`);
    console.log(`   Winning: ${results.summary.winningTrades} | Losing: ${results.summary.losingTrades}`);
    console.log(`   Win Rate: ${(results.summary.winRate * 100).toFixed(2)}%`);
    console.log(`   TP1 Hits: ${results.summary.tp1Hits}`);
    console.log(`   Total P&L: $${results.summary.totalPnL.toFixed(2)}`);
    console.log(`   Return: ${(results.summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`   Balance Final: $${results.summary.finalBalance.toFixed(2)}`);
    console.log(`   Tiempo Ejecución: ${results.summary.executionTime}s\n`);

    console.log(`💾 Resultados guardados en:`);
    console.log(`   📄 JSON: ${SCALPING_CONFIG.outputFile}`);
    console.log(`   📄 Log: ${SCALPING_CONFIG.logFile}`);

  } catch (error) {
    console.error('❌ Error en backtest:', error.message);
    process.exit(1);
  }
}

/**
 * Agrupa velas de 5min en velas de 1 hora
 */
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

  // Última hora
  if (hourCandles.length > 0) {
    hourlyData.push(aggregateCandles(hourCandles));
  }

  return hourlyData;
}

/**
 * Agrupa múltiples velas en una sola
 */
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

/**
 * Obtiene las velas de 5min que componen una vela de 1 hora
 */
function getMinuteCandlesForHour(fiveMinData, hourTimestamp) {
  const hourStart = hourTimestamp;
  const hourEnd = hourStart + 60 * 60 * 1000; // 1 hora después

  return fiveMinData.filter(c => c.timestamp >= hourStart && c.timestamp < hourEnd);
}

function generateReport(results) {
  const s = results.summary;
  let report = '\n╔══════════════════════════════════════════════════════════════╗\n';
  report += '║     📊 REPORTE BACKTEST SCALPING INTRADÍA - 1 AÑO               ║\n';
  report += '╚══════════════════════════════════════════════════════════════╝\n\n';

  report += '📊 CONFIGURACIÓN:\n';
  report += `   Symbol: ${results.config.symbol}\n`;
  report += `   Timeframes: H1 (análisis) + M1 (entradas)\n`;
  report += `   Capital Inicial: $${results.config.initialCapital}\n`;
  report += `   Position Size: ${(results.config.basePositionSize * 100).toFixed(0)}%\n`;
  report += `   TP1 Ratio: ${(results.config.tp1Ratio * 100).toFixed(1)}%\n`;
  report += `   TP2 Ratio: ${(results.config.tp2Ratio * 100).toFixed(1)}%\n`;
  report += `   TP1 Close: ${(results.config.tp1ClosePercent * 100).toFixed(0)}%\n\n`;

  report += '📈 RESULTADOS:\n';
  report += `   Patrones Detectados: ${s.patternsDetected}\n`;
  report += `   Vacíos Confirmados: ${s.voidsDetected}\n`;
  report += `   Total Trades: ${s.totalTrades}\n`;
  report += `   Winning Trades: ${s.winningTrades}\n`;
  report += `   Losing Trades: ${s.losingTrades}\n`;
  report += `   Win Rate: ${(s.winRate * 100).toFixed(2)}%\n`;
  report += `   TP1 Hits: ${s.tp1Hits} (${((s.tp1Hits / s.totalTrades) * 100).toFixed(1)}% de trades)\n`;
  report += `   Total P&L: $${s.totalPnL.toFixed(2)}\n`;
  report += `   Return: ${(s.totalReturn * 100).toFixed(2)}%\n`;
  report += `   Balance Final: $${s.finalBalance.toFixed(2)}\n`;
  report += `   Tiempo Ejecución: ${s.executionTime}s\n`;

  if (s.totalTrades > 0) {
    // Calcular Sharpe Ratio
    const returns = results.trades.map(t => t.pnl);
    const avgPnL = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const pnlVariance = returns.reduce((sum, r) => sum + Math.pow(r - avgPnL, 2), 0) / returns.length;
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
      const tp1Info = t.tp1Hit ? ' (TP1+TP2)' : '';
      report += `   ${i + 1}. ${emoji} ${t.exitReason.padEnd(12)} | ${t.type.padEnd(4)}${tp1Info} | P&L: ${(t.pnl * 100).toFixed(2)}% | Duración: ${t.duration.toFixed(1)}min\n`;
    });
  }

  return report;
}

// Ejecutar
if (require.main === module) {
  runScalpingBacktest().catch(error => {
    console.error('Error fatal:', error.message);
    process.exit(1);
  });
}

module.exports = { runScalpingBacktest };
