/**
 * Monitor de Patrones Turtle Soup en Tiempo Real
 * Usa TradingView MCP para detectar setups de Turtle Soup automáticamente
 */

const fs = require('fs');
const path = require('path');

// Configuración
const CONFIG = {
  checkInterval: 60000, // 60 segundos entre checks
  highLowThreshold: 0.002, // 0.2% de cercanía a High 20 / Low 20
  rsiLongThreshold: 30, // RSI < 30 para Turtle Soup LONG
  rsiShortThreshold: 70, // RSI > 70 para Turtle Soup SHORT
  minVolume: 20, // Volumen mínimo para considerar señal válida
  logFile: path.join(__dirname, 'logs', 'week1', 'turtle_soup_monitor.log'),
  signalsFile: path.join(__dirname, 'logs', 'week1', 'signals.json')
};

// Estado global
let lastHigh20 = 0;
let lastLow20 = 0;
let lastRSI = 50;
let lastPrice = 0;
let checkCount = 0;

/**
 * Escribe log con timestamp
 */
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;

  console.log(logMessage.trim());

  // Guardar en archivo
  const logDir = path.dirname(CONFIG.logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.appendFileSync(CONFIG.logFile, logMessage);
}

/**
 * Carga señales existentes
 */
function loadSignals() {
  try {
    if (fs.existsSync(CONFIG.signalsFile)) {
      const data = fs.readFileSync(CONFIG.signalsFile, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    log(`Error cargando señales: ${error.message}`, 'ERROR');
    return [];
  }
}

/**
 * Guarda nueva señal
 */
function saveSignal(signal) {
  const signals = loadSignals();
  signal.id = signals.length + 1;
  signals.push(signal);

  const signalsDir = path.dirname(CONFIG.signalsFile);
  if (!fs.existsSync(signalsDir)) {
    fs.mkdirSync(signalsDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG.signalsFile, JSON.stringify(signals, null, 2));
  log(`Señal guardada: ${signal.signal} @ $${signal.price}`, 'SIGNAL');
}

/**
 * Calcula VWAP de datos OHLCV
 */
function calculateVWAP(bars) {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
  }

  return cumulativeTPV / cumulativeVolume;
}

/**
 * Calcula EMA
 */
function calculateEMA(bars, period) {
  if (bars.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = bars.slice(0, period).reduce((sum, bar) => sum + bar.close, 0) / period;

  for (let i = period; i < bars.length; i++) {
    ema = (bars[i].close - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calcula High/Low 20
 */
function calculateHighLow20(bars) {
  const period = 20;
  if (bars.length < period) return null;

  const lastBars = bars.slice(-period);
  const high = Math.max(...lastBars.map(bar => bar.high));
  const low = Math.min(...lastBars.map(bar => bar.low));

  return { high, low };
}

/**
 * Detecta patrón Turtle Soup
 */
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
    pattern.type = 'short';
    pattern.confidence = 0.7;
    pattern.reason.push(`Precio cerca de High 20 ($${high20.toFixed(2)})`);
    pattern.reason.push(`RSI sobrecomprado (${rsi.toFixed(1)})`);

    if (volume > CONFIG.minVolume) {
      pattern.confidence += 0.1;
      pattern.reason.push(`Volumen confirmatorio (${volume.toFixed(1)})`);
    }
  } else if (nearLow && rsi < CONFIG.rsiLongThreshold) {
    pattern.type = 'long';
    pattern.confidence = 0.7;
    pattern.reason.push(`Precio cerca de Low 20 ($${low20.toFixed(2)})`);
    pattern.reason.push(`RSI sobrevendido (${rsi.toFixed(1)})`);

    if (volume > CONFIG.minVolume) {
      pattern.confidence += 0.1;
      pattern.reason.push(`Volumen confirmatorio (${volume.toFixed(1)})`);
    }
  } else if (nearHigh) {
    pattern.type = 'short_potential';
    pattern.confidence = 0.4;
    pattern.reason.push(`Precio cerca de High 20 ($${high20.toFixed(2)})`);
    pattern.reason.push(`RSI no confirma (${rsi.toFixed(1)} < ${CONFIG.rsiShortThreshold})`);
  } else if (nearLow) {
    pattern.type = 'long_potential';
    pattern.confidence = 0.4;
    pattern.reason.push(`Precio cerca de Low 20 ($${low20.toFixed(2)})`);
    pattern.reason.push(`RSI no confirma (${rsi.toFixed(1)} > ${CONFIG.rsiLongThreshold})`);
  }

  return pattern.confidence > 0.3 ? pattern : null;
}

/**
 * Simula obtención de datos (placeholder para integración con TradingView MCP)
 */
async function fetchMarketData() {
  // NOTA: Esta función debe ser reemplazada con llamadas reales a TradingView MCP
  // Por ahora, simula datos para demostrar el flujo

  const mockData = {
    price: 71884.98 + (Math.random() - 0.5) * 200,
    rsi: 44.23 + (Math.random() - 0.5) * 20,
    volume: Math.random() * 100,
    high20: 72550,
    low20: 70522.77
  };

  return mockData;
}

/**
 * Procesa un ciclo de monitoreo
 */
async function monitorCycle() {
  checkCount++;
  log(`\n${'='.repeat(60)}`);
  log(`Ciclo de monitoreo #${checkCount}`);
  log(`${'='.repeat(60)}\n`);

  try {
    // Obtener datos del mercado
    log('Obteniendo datos del mercado...');
    const marketData = await fetchMarketData();

    lastPrice = marketData.price;
    lastRSI = marketData.rsi;
    lastHigh20 = marketData.high20;
    lastLow20 = marketData.low20;

    log(`Precio: $${lastPrice.toFixed(2)}`);
    log(`RSI: ${lastRSI.toFixed(1)}`);
    log(`High 20: $${lastHigh20.toFixed(2)}`);
    log(`Low 20: $${lastLow20.toFixed(2)}`);
    log(`Volumen: ${marketData.volume.toFixed(1)}`);

    // Detectar patrón Turtle Soup
    log('\nDetectando patrones Turtle Soup...');
    const pattern = detectTurtleSoup(
      lastPrice,
      lastRSI,
      lastHigh20,
      lastLow20,
      marketData.volume
    );

    if (pattern) {
      log(`\n⚠️  PATRÓN DETECTADO: ${pattern.type.toUpperCase()}`);
      log(`Confianza: ${(pattern.confidence * 100).toFixed(0)}%`);
      log(`Razón:`);
      pattern.reason.forEach(r => log(`  - ${r}`));

      // Guardar señal si confianza > 60%
      if (pattern.confidence > 0.6) {
        const signal = {
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().split(' ')[0],
          symbol: 'BTCUSDT',
          timeframe: '5m',
          price: lastPrice,
          signal: pattern.type === 'long' ? 'buy' : 'sell',
          rsi: lastRSI,
          vwap: null, // Se calcularía con datos reales
          ema8: null, // Se calcularía con datos reales
          volume: marketData.volume,
          turtleSoupSetup: true,
          breakoutLevel: pattern.type === 'long' ? lastLow20 : lastHigh20,
          outcome: 'waiting',
          notes: pattern.reason.join('; ')
        };

        saveSignal(signal);
        log(`\n✅ Señal guardada en signals.json`);
      } else {
        log(`\n⏸️  Confianza baja (${(pattern.confidence * 100).toFixed(0)}%) - monitoreando...`);
      }
    } else {
      log('\n✅ No se detectaron patrones Turtle Soup');
      log(`   Precio en el medio del rango ($${lastLow20.toFixed(2)} - $${lastHigh20.toFixed(2)})`);
    }

    // Análisis de distancia a extremos
    const rangeSize = lastHigh20 - lastLow20;
    const distanceToHigh = ((lastHigh20 - lastPrice) / rangeSize * 100).toFixed(1);
    const distanceToLow = ((lastPrice - lastLow20) / rangeSize * 100).toFixed(1);

    log(`\n📍 Distancia a extremos:`);
    log(`   - High 20: ${distanceToHigh}% del rango`);
    log(`   - Low 20: ${distanceToLow}% del rango`);

  } catch (error) {
    log(`Error en ciclo de monitoreo: ${error.message}`, 'ERROR');
  }
}

/**
 * Inicia el monitoreo
 */
async function startMonitoring() {
  log('\n🚀 INICIANDO MONITOR DE TURTLE SOUP');
  log(`Intervalo: ${CONFIG.checkInterval / 1000} segundos`);
  log(`Umbral High/Low: ±${(CONFIG.highLowThreshold * 100).toFixed(1)}%`);
  log(`Señal guardada en: ${CONFIG.logFile}`);
  log(`Signals guardadas en: ${CONFIG.signalsFile}\n`);

  // Primer ciclo inmediato
  await monitorCycle();

  // Ciclos continuos
  setInterval(async () => {
    await monitorCycle();
  }, CONFIG.checkInterval);
}

// Manejo de cierre graceful
process.on('SIGINT', () => {
  log('\n\n🛑 Monitoreo detenido por usuario');
  log(`Total de ciclos: ${checkCount}`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('\n\n🛑 Monitoreo detenido');
  log(`Total de ciclos: ${checkCount}`);
  process.exit(0);
});

// Iniciar
if (require.main === module) {
  startMonitoring().catch(error => {
    log(`Error fatal: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = { startMonitoring, monitorCycle, detectTurtleSoup };
