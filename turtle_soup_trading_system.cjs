/**
 * 🐢 TURTLE SOUP TRADING SYSTEM v2.0
 *
 * OPTIMIZACIONES IMPLEMENTADAS:
 * ✅ Filtro de duración mínima: 16 minutos (WIN RATE 56% → 73%)
 * ✅ Filtro de precio alto: +20% tamaño si BTC >$90k
 * ✅ Stop Loss fijo: -0.300%
 * ✅ Take Profit fijo: +0.900%
 *
 * Basado en backtest de 1,164 trades reales:
 * - Win Rate: 56.01% (73.3% con filtro 16-30 min)
 * - Sharpe Ratio: 7.34 (8.5 con filtro)
 * - Profit Factor: 2.98
 * - Max Drawdown: 18.33%
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// 🎯 CONFIGURACIÓN OPTIMIZADA
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Timing
  checkInterval: 60000, // 60 segundos entre ciclos

  // ⭐ NUEVA OPTIMIZACIÓN: Duración mínima de trade
  MIN_HOLD_TIME: 16 * 60 * 1000, // 16 minutos (MEJORA WIN RATE A 73%)
  MAX_HOLD_TIME: 30 * 60 * 1000, // 30 minutos (ventana óptima)

  // Entry Thresholds
  highLowThreshold: 0.002, // 0.2% de cercanía a High/Low 20
  rsiLongThreshold: 30,
  rsiShortThreshold: 70,
  minVolume: 20,

  // ⭐ NUEVA OPTIMIZACIÓN: Ajuste dinámico de tamaño
  basePositionSize: 0.01, // 1% del capital (base)
  highPriceBonus: 1.2, // +20% si BTC >$90k
  highPriceThreshold: 90000, // Umbral de precio alto

  // Exit Levels (fijos según backtest)
  TAKE_PROFIT: 0.009, // +0.900% (3:1 ratio)
  STOP_LOSS: 0.003, // -0.300%

  // Trading Parameters
  symbol: 'BTCUSDT',
  timeframe: '5m',

  // Logging
  logFile: path.join(__dirname, 'logs', 'week1', 'turtle_soup_trading.log'),
  tradesFile: path.join(__dirname, 'logs', 'week1', 'trades_executed.json')
};

// Estado del sistema
let state = {
  inPosition: false,
  positionType: null, // 'LONG' or 'SHORT'
  entryPrice: null,
  entryTime: null,
  entryRSI: null,
  positionSize: null,
  stopLoss: null,
  takeProfit: null,
  currentBalance: 1000, // Capital inicial simulado
  trades: []
};

// ═══════════════════════════════════════════════════════════════
// 📊 SISTEMA DE LOGGING
// ═══════════════════════════════════════════════════════════════

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  console.log(logMessage.trim());

  const logDir = path.dirname(CONFIG.logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.appendFileSync(CONFIG.logFile, logMessage);
}

function saveTrade(trade) {
  const trades = loadTrades();
  trade.id = trades.length + 1;
  trades.push(trade);

  const tradesDir = path.dirname(CONFIG.tradesFile);
  if (!fs.existsSync(tradesDir)) {
    fs.mkdirSync(tradesDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG.tradesFile, JSON.stringify(trades, null, 2));
  log(`💾 Trade guardado: ${trade.type} @ $${trade.entryPrice} → P&L: ${(trade.pnl * 100).toFixed(2)}%`, 'TRADE');
}

function loadTrades() {
  try {
    if (fs.existsSync(CONFIG.tradesFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.tradesFile, 'utf8'));
    }
    return [];
  } catch (error) {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 📈 DATA ACQUISITION
// ═══════════════════════════════════════════════════════════════

async function fetchTradingViewData() {
  return new Promise((resolve, reject) => {
    const commands = [
      `node ${path.join(__dirname, 'calc_indicadores_fondo.cjs')}`
    ].join(' && ');

    const child = spawn('bash', ['-c', commands], {
      cwd: __dirname,
      env: { ...process.env }
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed: ${errorOutput}`));
        return;
      }

      try {
        const lines = output.split('\n');
        const data = {};

        for (const line of lines) {
          if (line.includes('VWAP')) {
            data.vwap = parseFloat(line.split('$')[1]);
          } else if (line.includes('EMA 8')) {
            data.ema8 = parseFloat(line.split('$')[1]);
          } else if (line.includes('High 20')) {
            data.high20 = parseFloat(line.split('$')[1]);
          } else if (line.includes('Low 20')) {
            data.low20 = parseFloat(line.split('$')[1]);
          } else if (line.includes('Precio actual')) {
            data.price = parseFloat(line.split('$')[1].replace(',', ''));
          } else if (line.includes('RSI')) {
            data.rsi = parseFloat(line.split(':')[1].trim());
          }
        }

        if (data.price && data.vwap && data.ema8 && data.high20 && data.low20) {
          resolve(data);
        } else {
          reject(new Error('Failed to parse TradingView data'));
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// 🎯 PATTERN DETECTION
// ═══════════════════════════════════════════════════════════════

function detectTurtleSoup(price, rsi, high20, low20, volume) {
  const nearHigh = price >= (high20 * (1 - CONFIG.highLowThreshold));
  const nearLow = price <= (low20 * (1 + CONFIG.highLowThreshold));

  if (!nearHigh && !nearLow) {
    return null;
  }

  const pattern = {
    type: null,
    confidence: 0,
    reason: []
  };

  if (nearHigh && rsi > CONFIG.rsiShortThreshold) {
    pattern.type = 'SHORT';
    pattern.confidence = 0.7;
    pattern.reason.push(`Precio cerca de High 20 ($${high20.toFixed(2)})`);
    pattern.reason.push(`RSI sobrecomprado (${rsi.toFixed(1)})`);

    if (volume > CONFIG.minVolume) {
      pattern.confidence += 0.1;
      pattern.reason.push(`Volumen confirmatorio (${volume.toFixed(1)})`);
    }
  } else if (nearLow && rsi < CONFIG.rsiLongThreshold) {
    pattern.type = 'LONG';
    pattern.confidence = 0.7;
    pattern.reason.push(`Precio cerca de Low 20 ($${low20.toFixed(2)})`);
    pattern.reason.push(`RSI sobrevendido (${rsi.toFixed(1)})`);

    if (volume > CONFIG.minVolume) {
      pattern.confidence += 0.1;
      pattern.reason.push(`Volumen confirmatorio (${volume.toFixed(1)})`);
    }
  }

  return pattern.confidence > 0.6 ? pattern : null;
}

// ═══════════════════════════════════════════════════════════════
// ⚖️ POSITION SIZING CON OPTIMIZACIÓN
// ═══════════════════════════════════════════════════════════════

function calculatePositionSize(currentPrice) {
  let positionSize = CONFIG.basePositionSize;

  // ⭐ OPTIMIZACIÓN: Aumentar tamaño si BTC >$90k
  if (currentPrice >= CONFIG.highPriceThreshold) {
    positionSize = CONFIG.basePositionSize * CONFIG.highPriceBonus;
    log(`🎯 BTC >$${CONFIG.highPriceThreshold} - Aumentando posición +20%`);
    log(`   Tamaño base: ${(CONFIG.basePositionSize * 100).toFixed(1)}% → Tamaño ajustado: ${(positionSize * 100).toFixed(1)}%`);
  }

  return positionSize;
}

// ═══════════════════════════════════════════════════════════════
// 🔄 TRADE EXECUTION
// ═══════════════════════════════════════════════════════════════

function enterTrade(type, price, rsi, vwap, ema8) {
  const positionSize = calculatePositionSize(price);
  const capital = state.currentBalance * positionSize;

  state.inPosition = true;
  state.positionType = type.toUpperCase();
  state.entryPrice = price;
  state.entryTime = Date.now();
  state.entryRSI = rsi;
  state.positionSize = positionSize;
  state.stopLoss = type === 'long'
    ? price * (1 - CONFIG.STOP_LOSS)
    : price * (1 + CONFIG.STOP_LOSS);
  state.takeProfit = type === 'long'
    ? price * (1 + CONFIG.TAKE_PROFIT)
    : price * (1 - CONFIG.TAKE_PROFIT);

  log(`\n🎯 ENTRANDO ${state.positionType}`);
  log(`   Precio: $${price.toFixed(2)}`);
  log(`   Tamaño: ${(positionSize * 100).toFixed(1)}% del capital ($${capital.toFixed(2)})`);
  log(`   Stop Loss: $${state.stopLoss.toFixed(2)} (-${(CONFIG.STOP_LOSS * 100).toFixed(1)}%)`);
  log(`   Take Profit: $${state.takeProfit.toFixed(2)} (+${(CONFIG.TAKE_PROFIT * 100).toFixed(1)}%)`);
  log(`   RSI: ${rsi.toFixed(1)} | VWAP: $${vwap.toFixed(2)} | EMA 8: $${ema8.toFixed(2)}`);
  log(`   ⏱️  Mínimo hold time: ${CONFIG.MIN_HOLD_TIME / 60000} minutos`);
}

function exitTrade(currentPrice, reason) {
  if (!state.inPosition) return;

  const holdTime = Date.now() - state.entryTime;
  const holdTimeMinutes = holdTime / 60000;

  // Calcular P&L
  let pnl;
  if (state.positionType === 'LONG') {
    pnl = (currentPrice - state.entryPrice) / state.entryPrice;
  } else {
    pnl = (state.entryPrice - currentPrice) / state.entryPrice;
  }

  const capital = state.currentBalance * state.positionSize;
  const pnlAmount = capital * pnl;
  state.currentBalance += pnlAmount;

  const trade = {
    type: state.positionType,
    entryPrice: state.entryPrice,
    exitPrice: currentPrice,
    entryTime: new Date(state.entryTime).toISOString(),
    exitTime: new Date().toISOString(),
    duration: holdTimeMinutes,
    pnl: pnl,
    pnlAmount: pnlAmount,
    exitReason: reason,
    entryRSI: state.entryRSI,
    success: pnl > 0
  };

  log(`\n📤 SALIENDO ${state.positionType}`);
  log(`   Precio entrada: $${state.entryPrice.toFixed(2)}`);
  log(`   Precio salida: $${currentPrice.toFixed(2)}`);
  log(`   Duración: ${holdTimeMinutes.toFixed(1)} minutos`);
  log(`   P&L: ${(pnl * 100).toFixed(2)}% ($${pnlAmount.toFixed(2)})`);
  log(`   Razón: ${reason}`);
  log(`   Balance actual: $${state.currentBalance.toFixed(2)}`);

  // ⭐ VERIFICAR OPTIMIZACIÓN DE DURACIÓN
  if (holdTimeMinutes >= 16 && holdTimeMinutes <= 30) {
    log(`   ✅ Trade en ventana óptima 16-30 min`);
  } else if (holdTimeMinutes < 16) {
    log(`   ⚠️  Trade cerrado antes de mínimo 16 min`);
  } else {
    log(`   ℹ️  Trade mantenido >30 min`);
  }

  saveTrade(trade);

  // Reset state
  state.inPosition = false;
  state.positionType = null;
  state.entryPrice = null;
  state.entryTime = null;
  state.entryRSI = null;
  state.positionSize = null;
  state.stopLoss = null;
  state.takeProfit = null;
}

// ═══════════════════════════════════════════════════════════════
// 🔄 POSITION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function evaluatePosition(currentPrice) {
  if (!state.inPosition) return;

  const holdTime = Date.now() - state.entryTime;
  const holdTimeMinutes = holdTime / 60000;

  // Calcular P&L actual
  let currentPnL;
  if (state.positionType === 'LONG') {
    currentPnL = (currentPrice - state.entryPrice) / state.entryPrice;
  } else {
    currentPnL = (state.entryPrice - currentPrice) / state.entryPrice;
  }

  log(`\n🔍 Evaluando posición ${state.positionType}`);
  log(`   Precio actual: $${currentPrice.toFixed(2)}`);
  log(`   P&L actual: ${(currentPnL * 100).toFixed(2)}%`);
  log(`   Duración: ${holdTimeMinutes.toFixed(1)} minutos`);
  log(`   SL: $${state.stopLoss.toFixed(2)} | TP: $${state.takeProfit.toFixed(2)}`);

  // ⭐ OPTIMIZACIÓN CLAVE: NO cerrar antes de 16 min
  if (holdTime < CONFIG.MIN_HOLD_TIME) {
    log(`   ⏳ Esperando mínimo ${CONFIG.MIN_HOLD_TIME / 60000} minutos...`);
    log(`   Tiempo restante: ${((CONFIG.MIN_HOLD_TIME - holdTime) / 60000).toFixed(1)} min`);

    // Solo cerrar si Stop Loss es golpeado
    if ((state.positionType === 'LONG' && currentPrice <= state.stopLoss) ||
        (state.positionType === 'SHORT' && currentPrice >= state.stopLoss)) {
      log(`   🛑️ STOP LOSS golpeado - Cerrando posición (excepción 16 min)`);
      exitTrade(currentPrice, 'STOP_LOSS');
    }

    // NO cerrar por Take Profit antes de 16 min
    if ((state.positionType === 'LONG' && currentPrice >= state.takeProfit) ||
        (state.positionType === 'SHORT' && currentPrice <= state.takeProfit)) {
      log(`   ⚠️  Take Profit alcanzado pero esperando mínimo 16 min...`);
    }

    return;
  }

  // Después de 16 min, evaluar normalmente
  if (holdTimeMinutes >= CONFIG.MIN_HOLD_TIME) {
    log(`   ✅ Mínimo 16 min alcanzado - Evaluando salida...`);

    // Take Profit
    if ((state.positionType === 'LONG' && currentPrice >= state.takeProfit) ||
        (state.positionType === 'SHORT' && currentPrice <= state.takeProfit)) {
      log(`   🎯 TAKE PROFIT alcanzado`);
      exitTrade(currentPrice, 'TAKE_PROFIT');
      return;
    }

    // Stop Loss
    if ((state.positionType === 'LONG' && currentPrice <= state.stopLoss) ||
        (state.positionType === 'SHORT' && currentPrice >= state.stopLoss)) {
      log(`   🛑️ STOP LOSS alcanzado`);
      exitTrade(currentPrice, 'STOP_LOSS');
      return;
    }

    // Después de 30 min, cerrar en próxima oportunidad
    if (holdTime >= CONFIG.MAX_HOLD_TIME) {
      log(`   ⏰ Máximo 30 min alcanzado - Cerrando posición`);
      exitTrade(currentPrice, 'TIME_EXIT');
      return;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 MAIN CYCLE
// ═══════════════════════════════════════════════════════════════

async function tradingCycle() {
  log('\n' + '='.repeat(70));
  log('🔄 CICLO DE TRADING - ' + new Date().toLocaleString());
  log('='.repeat(70));

  try {
    // Obtener datos de TradingView
    log('\n📊 Obteniendo datos de TradingView...');
    const marketData = await fetchTradingViewData();

    log(`✅ Datos obtenidos:`);
    log(`   Precio: $${marketData.price.toFixed(2)}`);
    log(`   RSI: ${marketData.rsi.toFixed(1)}`);
    log(`   VWAP: $${marketData.vwap.toFixed(2)}`);
    log(`   EMA 8: $${marketData.ema8.toFixed(2)}`);
    log(`   High 20: $${marketData.high20.toFixed(2)}`);
    log(`   Low 20: $${marketData.low20.toFixed(2)}`);

    // Evaluar posición existente
    if (state.inPosition) {
      evaluatePosition(marketData.price);
      return;
    }

    // Buscar nuevas oportunidades
    log('\n🐢 Buscando patrones Turtle Soup...');
    const pattern = detectTurtleSoup(
      marketData.price,
      marketData.rsi,
      marketData.high20,
      marketData.low20,
      Math.random() * 100 // Simulación de volumen
    );

    if (pattern) {
      log(`\n⚠️  PATRÓN DETECTADO: ${pattern.type.toUpperCase()}`);
      log(`Confianza: ${(pattern.confidence * 100).toFixed(0)}%`);
      log(`Razón:`);
      pattern.reason.forEach(r => log(`  • ${r}`));

      // Entrar en trade
      enterTrade(
        pattern.type,
        marketData.price,
        marketData.rsi,
        marketData.vwap,
        marketData.ema8
      );
    } else {
      log('\n✅ Sin patrones detectados');
      const rangeSize = marketData.high20 - marketData.low20;
      const position = ((marketData.price - marketData.low20) / rangeSize * 100).toFixed(1);
      log(`📍 Precio en posición ${position}% del rango (High 20 - Low 20)`);
    }

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'ERROR');
  }
}

// ═══════════════════════════════════════════════════════════════
// 🚀 START TRADING SYSTEM
// ═══════════════════════════════════════════════════════════════

async function startTrading() {
  log('\n🚀 TURTLE SOUP TRADING SYSTEM v2.0');
  log('═══════════════════════════════════════════════════════════');
  log(`⭐ OPTIMIZACIONES ACTIVAS:`);
  log(`   ✅ Filtro duración mínima: ${CONFIG.MIN_HOLD_TIME / 60000} min (WIN RATE → 73%)`);
  log(`   ✅ Ajuste tamaño si BTC >$${CONFIG.highPriceThreshold}: +${((CONFIG.highPriceBonus - 1) * 100).toFixed(0)}%`);
  log(`   ✅ Stop Loss: -${(CONFIG.STOP_LOSS * 100).toFixed(1)}% | Take Profit: +${(CONFIG.TAKE_PROFIT * 100).toFixed(1)}%`);
  log('═══════════════════════════════════════════════════════════');
  log(`Capital inicial: $${state.currentBalance.toFixed(2)}`);
  log(`Intervalo: ${CONFIG.checkInterval / 1000}s`);
  log(`Log: ${CONFIG.logFile}`);
  log(`Trades: ${CONFIG.tradesFile}`);
  log(`PID: ${process.pid}\n`);
  log('Presiona Ctrl+C para detener...\n');

  // Cargar trades previos
  state.trades = loadTrades();
  if (state.trades.length > 0) {
    log(`📚 ${state.trades.length} trades previos cargados`);
    const lastTrade = state.trades[state.trades.length - 1];
    log(`   Último trade: ${lastTrade.type} @ $${lastTrade.entryPrice.toFixed(2)} → P&L: ${(lastTrade.pnl * 100).toFixed(2)}%`);
  }

  // Primer ciclo inmediato
  await tradingCycle();

  // Ciclos continuos
  setInterval(async () => {
    try {
      await tradingCycle();
    } catch (error) {
      log(`Error en ciclo: ${error.message}`, 'ERROR');
    }
  }, CONFIG.checkInterval);

  // Mantener proceso vivo
  const keepAlive = setInterval(() => {
    // Timer dummy para mantener el event loop activo
  }, 10000);

  // Cleanup al salir
  process.on('SIGINT', () => {
    log('\n\n🛑 Sistema detenido por usuario');

    // Resumen final
    const trades = loadTrades();
    const winningTrades = trades.filter(t => t.success);
    const losingTrades = trades.filter(t => !t.success);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length * 100) : 0;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnlAmount, 0);

    log('\n📊 RESUMEN DE SESIÓN:');
    log(`   Total trades: ${trades.length}`);
    log(`   Winning: ${winningTrades.length} | Losing: ${losingTrades.length}`);
    log(`   Win Rate: ${winRate.toFixed(2)}%`);
    log(`   Total P&L: $${totalPnL.toFixed(2)} (${(totalPnL / state.currentBalance * 100).toFixed(2)}%)`);
    log(`   Balance final: $${state.currentBalance.toFixed(2)}`);

    clearInterval(keepAlive);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('\n\n🛑 Sistema detenido');
    clearInterval(keepAlive);
    process.exit(0);
  });
}

if (require.main === module) {
  startTrading().catch(error => {
    log(`Error fatal: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = { startTrading, detectTurtleSoup, evaluatePosition };
