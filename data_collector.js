/**
 * 📊 DATA COLLECTOR - Semana 1 Pilotaje
 *
 * Captura datos de TradingView MCP cada 10 minutos
 * Sin agentes, solo datos baseline para análisis posterior
 *
 * Uso: node data_collector.js
 */

const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURACIÓN
// ==========================================

const CONFIG = {
  symbol: 'BTCUSDT',
  timeframe: '5m',
  collectInterval: 600000, // 10 minutos en ms
  dataFile: path.join(__dirname, 'logs', 'week1', 'data_raw.json'),
  logFile: path.join(__dirname, 'logs', 'week1', 'collection.log')
};

// ==========================================
// FUNCIONES DE CÁLCULO (Background)
// ==========================================

function calcVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol === 0 ? candles[candles.length - 1].close : cumTPV / cumVol;
}

function calcEMA(closes, period = 8) {
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcHighLow(candles, period = 20) {
  const recent = candles.slice(-period);
  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));
  return { high, low };
}

// ==========================================
// FUNCIÓN PRINCIPAL DE CAPTURA
// ==========================================

/**
 * Captura un data point completo del gráfico actual
 *
 * NOTA: Esta función usa las herramientas MCP de TradingView
 * que deben estar disponibles en el entorno de Claude Code
 */
async function collectDataPoint() {
  const timestamp = new Date().toISOString();

  console.log(`\n📊 [${timestamp}] Capturando data point...`);

  try {
    // ESTO ES UN TEMPLATE - La implementación real usaría:
    // const chartState = await mcp_tradingview__chart_get_state();
    // const studyValues = await mcp__tradingview__data_get_study_values();
    // const quote = await mcp__tradingview__quote_get({ symbol: CONFIG.symbol });
    // const ohlcv = await mcp__tradingview__data_get_ohlcv({ count: 100, summary: true });

    // TEMPLATE DE DATA POINT (cuando MCP esté disponible)
    const dataPoint = {
      timestamp: timestamp,
      symbol: CONFIG.symbol,
      timeframe: CONFIG.timeframe,

      // Datos de precio (cuando MCP disponible)
      price: null, // vendría de quote.last
      ohlc: {
        open: null,
        high: null,
        low: null,
        close: null
      },
      volume: null,

      // Indicadores visibles (TradingView cuenta limitada: 2)
      indicators_visible: {
        rsi: null, // vendría de studyValues.RSI
        volume: null // vendría de studyValues.Volume
      },

      // Indicadores background (calculados desde OHLCV)
      indicators_background: {
        vwap: null, // calcVWAP(candles)
        ema8: null, // calcEMA(closes, 8)
        high20: null, // high20 de candles
        low20: null // low20 de candles
      },

      // Análisis manual (durante Semana 1)
      turtle_soup_detected: false,
      turtle_soup_type: null, // "long" o "short"
      manual_signal: null, // "buy", "sell", "hold"
      confidence: null,

      // Si se ejecuta operación (opcional)
      action_taken: null, // "buy", "sell", null
      action_result: null, // "success", "fail", null
      pnl: null,

      // Notas de contexto
      notes: ""
    };

    console.log(`  ✅ Data point capturado`);
    console.log(`  📈 Precio: ${dataPoint.price || 'N/A'}`);
    console.log(`  📊 RSI: ${dataPoint.indicators_visible.rsi || 'N/A'}`);
    console.log(`  📉 Volume: ${dataPoint.volume || 'N/A'}`);

    return dataPoint;

  } catch (error) {
    console.error(`  ❌ Error capturando data point:`, error.message);

    // Retornar data point con error marcado
    return {
      timestamp: timestamp,
      symbol: CONFIG.symbol,
      error: error.message,
      notes: "Error en captura - verificar conexión TradingView MCP"
    };
  }
}

// ==========================================
// ALMACENAMIENTO DE DATOS
// ==========================================

function saveDataPoint(dataPoint) {
  try {
    // Leer datos existentes
    let allData = [];
    if (fs.existsSync(CONFIG.dataFile)) {
      const content = fs.readFileSync(CONFIG.dataFile, 'utf8');
      allData = JSON.parse(content);
    }

    // Añadir nuevo data point
    allData.push(dataPoint);

    // Guardar
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(allData, null, 2));

    console.log(`  💾 Guardado en ${CONFIG.dataFile}`);
    console.log(`  📊 Total data points: ${allData.length}`);

    // Log simple
    const logEntry = `[${dataPoint.timestamp}] Data point #${allData.length} - Price: ${dataPoint.price || 'N/A'}\n`;
    fs.appendFileSync(CONFIG.logFile, logEntry);

  } catch (error) {
    console.error(`  ❌ Error guardando data point:`, error.message);
  }
}

// ==========================================
// ANÁLISIS MANUAL DE TURTLE SOUP
// ==========================================

/**
 * Función helper para análisis manual
 * Cuando detectes un patrón Turtle Soup visualmente,
 * llama esta función para registrarlo
 */
function recordTurtleSoup(type, confidence, notes) {
  const dataPoint = {
    timestamp: new Date().toISOString(),
    symbol: CONFIG.symbol,
    timeframe: CONFIG.timeframe,

    // Marcar como detección manual
    turtle_soup_detected: true,
    turtle_soup_type: type, // "long" o "short"
    manual_signal: type === "long" ? "buy" : "sell",
    confidence: confidence,
    notes: notes || "Detección manual Turtle Soup",

    // Otros campos null
    price: null,
    volume: null,
    indicators_visible: { rsi: null, volume: null },
    indicators_background: { vwap: null, ema8: null, high20: null, low20: null }
  };

  saveDataPoint(dataPoint);
  console.log(`\n✅ Turtle Soup ${type} registrado manualmente`);
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================

async function startCollection() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 DATA COLLECTOR - Semana 1 Pilotaje');
  console.log('='.repeat(70));
  console.log(`\nConfiguración:`);
  console.log(`  Symbol: ${CONFIG.symbol}`);
  console.log(`  Timeframe: ${CONFIG.timeframe}`);
  console.log(`  Intervalo: ${CONFIG.collectInterval / 1000} segundos`);
  console.log(`  Archivo datos: ${CONFIG.dataFile}`);
  console.log(`  Archivo log: ${CONFIG.logFile}`);

  console.log(`\n📋 Instrucciones:`);
  console.log(`  1. Asegúrate de que TradingView Desktop esté abierto`);
  console.log(`  2. Navega al gráfico ${CONFIG.symbol} ${CONFIG.timeframe}`);
  console.log(`  3. Configura indicadores: RSI + Volume visibles`);
  console.log(`  4. Deja este script corriendo en background`);
  console.log(`  5. Cuando veas un patrón Turtle Soup, usa recordTurtleSoup()`);

  console.log(`\n🚀 Iniciando captura de datos...`);
  console.log('='.repeat(70) + '\n');

  // Captura inmediata al inicio
  const dataPoint = await collectDataPoint();
  saveDataPoint(dataPoint);

  // Loop de captura cada 10 minutos
  setInterval(async () => {
    const dp = await collectDataPoint();
    saveDataPoint(dp);
  }, CONFIG.collectInterval);

  // Exponer función global para registro manual
  global.recordTurtleSoup = recordTurtleSoup;

  console.log('\n✅ Colección iniciada. Presiona Ctrl+C para detener.');
  console.log('💡 Para registrar Turtle Soup manualmente: recordTurtleSoup("long", 0.75, "notas")\n');
}

// ==========================================
// EJECUCIÓN
// ==========================================

if (require.main === module) {
  startCollection().catch(console.error);
}

module.exports = {
  collectDataPoint,
  saveDataPoint,
  recordTurtleSoup,
  calcVWAP,
  calcEMA,
  calcHighLow
};
