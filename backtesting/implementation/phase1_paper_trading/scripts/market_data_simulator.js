/**
 * Market Data Simulator for Paper Trading
 *
 * Genera datos de mercado realistas para paper trading con:
 * - OHLCV data para 4 pares principales (BTC, ETH, SOL, BNB)
 * - Indicadores técnicos calculados (RSI, BB, EMA, VWAP)
 * - Volatilidad realista basada en sesiones de trading
 * - Eventos de news ocasionales
 * - Spread y slippage realistas
 *
 * Uso:
 * node market_data_simulator.js [options]
 *
 * Opciones:
 * --interval    Intervalo de velas en ms (default: 10000 = 10s)
 * --duration    Duración en horas (default: 24)
 * --output      Archivo de salida JSON (default: market_data.json)
 * --symbols     Símbolos separados por coma (default: BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT)
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== CONFIGURACIÓN ====================

const CONFIG = {
  // Pares disponibles con sus características
  symbols: {
    BTCUSDT: {
      basePrice: 95000,
      volatility: 0.002,      // 0.2% volatilidad base
      spread: 15,             // $15 spread
      tickSize: 0.01,
      lotSize: 0.00001,
      minNotional: 5,
      sessions: {
        asian: { volatility: 0.0015, volume: 0.6 },
        london: { volatility: 0.0025, volume: 1.2 },
        ny: { volatility: 0.003, volume: 1.5 },
        overlap: { volatility: 0.004, volume: 2.0 }
      }
    },
    ETHUSDT: {
      basePrice: 3500,
      volatility: 0.003,      // 0.3% volatilidad base
      spread: 2,              // $2 spread
      tickSize: 0.001,
      lotSize: 0.0001,
      minNotional: 5,
      sessions: {
        asian: { volatility: 0.002, volume: 0.7 },
        london: { volatility: 0.0035, volume: 1.3 },
        ny: { volatility: 0.004, volume: 1.6 },
        overlap: { volatility: 0.005, volume: 2.2 }
      }
    },
    SOLUSDT: {
      basePrice: 240,
      volatility: 0.004,      // 0.4% volatilidad base (más volátil)
      spread: 0.1,            // $0.10 spread
      tickSize: 0.001,
      lotSize: 0.01,
      minNotional: 5,
      sessions: {
        asian: { volatility: 0.003, volume: 0.8 },
        london: { volatility: 0.005, volume: 1.4 },
        ny: { volatility: 0.006, volume: 1.8 },
        overlap: { volatility: 0.008, volume: 2.5 }
      }
    },
    BNBUSDT: {
      basePrice: 620,
      volatility: 0.0025,     // 0.25% volatilidad base
      spread: 0.5,            // $0.50 spread
      tickSize: 0.01,
      lotSize: 0.001,
      minNotional: 5,
      sessions: {
        asian: { volatility: 0.002, volume: 0.65 },
        london: { volatility: 0.003, volume: 1.25 },
        ny: { volatility: 0.0035, volume: 1.55 },
        overlap: { volatility: 0.0045, volume: 2.1 }
      }
    }
  },

  // Horarios de sesión (timezone: EST)
  sessions: {
    asian: { start: 20, end: 24 },      // 8pm - 12am EST
    asian2: { start: 0, end: 4 },       // 12am - 4am EST (continuación)
    london: { start: 4, end: 8 },       // 4am - 8am EST
    nyOverlap: { start: 8, end: 12 },   // 8am - 12pm EST (London/NY overlap)
    ny: { start: 12, end: 16 },         // 12pm - 4pm EST
    evening: { start: 16, end: 20 }     // 4pm - 8pm EST
  },

  // Eventos de news configuración
  newsEvents: {
    probability: 0.005,      // 0.5% probabilidad por vela
    impact: {
      LOW: { multiplier: 1.5, duration: 3 },
      MEDIUM: { multiplier: 2.5, duration: 5 },
      HIGH: { multiplier: 4.0, duration: 10 },
      EXTREME: { multiplier: 6.0, duration: 20 }
    },
    types: [
      { name: 'FOMC', impact: 'EXTREME', sessions: ['nyOverlap', 'ny'] },
      { name: 'CPI', impact: 'HIGH', sessions: ['nyOverlap', 'ny'] },
      { name: 'NFP', impact: 'HIGH', sessions: ['nyOverlap'] },
      { name: 'ETH Upgrade', impact: 'MEDIUM', sessions: ['asian', 'asian2'] },
      { name: 'BTC ETF', impact: 'HIGH', sessions: ['london', 'nyOverlap'] },
      { name: 'Regulatory', impact: 'MEDIUM', sessions: ['ny'] },
      { name: 'Tech Earnings', impact: 'MEDIUM', sessions: ['ny'] }
    ]
  },

  // Indicadores técnicos
  indicators: {
    rsi: { period: 14 },
    ema: { periods: [8, 21, 55] },
    bollinger: { period: 20, stdDev: 2 },
    vwap: { anchored: false }
  }
};

// ==================== UTILIDADES MATEMÁTICAS ====================

class MathUtils {
  static boxMuller() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  static gaussianRandom(mean = 0, stdDev = 1) {
    return mean + stdDev * this.boxMuller();
  }

  static clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  static roundTo(value, decimals) {
    return Number(value.toFixed(decimals));
  }
}

// ==================== CALCULADORA DE INDICADORES ====================

class IndicatorCalculator {
  static calculateSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }

  static calculateEMA(data, period) {
    if (data.length < period) return null;

    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;

    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  static calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;

    let gains = 0, losses = 0;

    // Primer cálculo
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

  static calculateBollingerBands(closes, period = 20, stdDev = 2) {
    if (closes.length < period) return null;

    const slice = closes.slice(-period);
    const sma = slice.reduce((sum, val) => sum + val, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      middle: sma,
      upper: sma + stdDev * std,
      lower: sma - stdDev * std,
      stdDev: std
    };
  }

  static calculateVWAP(hlcs, volumes) {
    if (hlcs.length === 0) return null;

    let totalVolume = 0;
    let totalValue = 0;

    for (let i = 0; i < hlcs.length; i++) {
      const typicalPrice = (hlcs[i].high + hlcs[i].low + hlcs[i].close) / 3;
      totalValue += typicalPrice * volumes[i];
      totalVolume += volumes[i];
    }

    return totalValue / totalVolume;
  }
}

// ==================== SIMULADOR DE MERCADO ====================

class MarketDataSimulator {
  constructor(options = {}) {
    this.symbols = options.symbols || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    this.interval = options.interval || 10000; // 10 segundos
    this.duration = options.duration * 3600000 || 24 * 3600000; // horas a ms
    this.startTime = Date.now();
    this.endTime = this.startTime + this.duration;

    // Estado interno
    this.currentPrices = {};
    this.priceHistory = {};
    this.activeNewsEvents = [];
    this.data = {};

    // Inicializar
    this.initialize();
  }

  initialize() {
    for (const symbol of this.symbols) {
      const config = CONFIG.symbols[symbol];
      this.currentPrices[symbol] = config.basePrice;
      this.priceHistory[symbol] = [config.basePrice];
      this.data[symbol] = [];
    }
  }

  getCurrentSession(timestamp) {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const day = date.getDay();

    // Weekend - menor volumen
    if (day === 0 || day === 6) {
      return { name: 'weekend', volatilityMultiplier: 0.5, volumeMultiplier: 0.3 };
    }

    // Determinar sesión actual
    if (hour >= CONFIG.sessions.asian.start && hour < CONFIG.sessions.asian.end) {
      return { name: 'asian', volatilityMultiplier: 1, volumeMultiplier: 1 };
    } else if (hour >= CONFIG.sessions.asian2.start && hour < CONFIG.sessions.asian2.end) {
      return { name: 'asian', volatilityMultiplier: 0.9, volumeMultiplier: 0.8 };
    } else if (hour >= CONFIG.sessions.london.start && hour < CONFIG.sessions.london.end) {
      return { name: 'london', volatilityMultiplier: 1.2, volumeMultiplier: 1.3 };
    } else if (hour >= CONFIG.sessions.nyOverlap.start && hour < CONFIG.sessions.nyOverlap.end) {
      return { name: 'overlap', volatilityMultiplier: 1.8, volumeMultiplier: 2.0 };
    } else if (hour >= CONFIG.sessions.ny.start && hour < CONFIG.sessions.ny.end) {
      return { name: 'ny', volatilityMultiplier: 1.4, volumeMultiplier: 1.5 };
    } else {
      return { name: 'evening', volatilityMultiplier: 0.7, volumeMultiplier: 0.6 };
    }
  }

  generateNewsEvent(timestamp) {
    // Probabilidad de news
    if (Math.random() > CONFIG.newsEvents.probability) return null;

    const session = this.getCurrentSession(timestamp);

    // Filtrar eventos por sesión
    const availableEvents = CONFIG.newsEvents.types.filter(e =>
      e.sessions.includes(session.name)
    );

    if (availableEvents.length === 0) return null;

    const event = availableEvents[Math.floor(Math.random() * availableEvents.length)];
    const impact = CONFIG.newsEvents.impact[event.impact];

    return {
      id: `${event.name}_${timestamp}`,
      name: event.name,
      impact: event.impact,
      timestamp,
      volatilityMultiplier: impact.multiplier,
      duration: impact.duration * 60000, // convertir a ms
      direction: Math.random() > 0.5 ? 1 : -1
    };
  }

  updateNewsEvents(timestamp) {
    // Remover eventos expirados
    this.activeNewsEvents = this.activeNewsEvents.filter(e =>
      timestamp < e.timestamp + e.duration
    );

    // Generar nuevos eventos
    const newEvent = this.generateNewsEvent(timestamp);
    if (newEvent) {
      this.activeNewsEvents.push(newEvent);
    }
  }

  getNewsMultiplier(symbol) {
    let multiplier = 1;

    for (const event of this.activeNewsEvents) {
      // BTC y ETH son más sensibles a noticias macro
      const sensitivity = (symbol === 'BTCUSDT' || symbol === 'ETHUSDT') ? 1 : 0.7;
      multiplier *= (1 + (event.volatilityMultiplier - 1) * sensitivity * 0.3);
    }

    return MathUtils.clamp(multiplier, 0.5, 3);
  }

  generateCandle(symbol, timestamp) {
    const config = CONFIG.symbols[symbol];
    const session = this.getCurrentSession(timestamp);

    // Mapear sesiones a configuraciones disponibles
    const sessionMap = {
      'asian': 'asian',
      'asian2': 'asian',
      'london': 'london',
      'overlap': 'overlap',
      'ny': 'ny',
      'evening': 'asian',
      'weekend': 'asian'
    };

    const sessionKey = sessionMap[session.name] || 'asian';
    const sessionConfig = config.sessions[sessionKey] || { volatility: 1, volume: 1 };

    // Calcular volatilidad efectiva
    const newsMultiplier = this.getNewsMultiplier(symbol);
    const baseVolatility = config.volatility * sessionConfig.volatility;
    const effectiveVolatility = baseVolatility * newsMultiplier;

    // Generar movimiento de precio
    const priceChange = MathUtils.gaussianRandom(0, effectiveVolatility);
    const currentPrice = this.currentPrices[symbol];

    // Aplicar cambio con posible gap
    const gapProbability = 0.02 * newsMultiplier;
    const hasGap = Math.random() < gapProbability;
    const gapSize = hasGap ? MathUtils.gaussianRandom(0, effectiveVolatility * 2) : 0;

    let open = currentPrice;
    if (hasGap) {
      open = currentPrice * (1 + gapSize);
    }

    const close = open * (1 + priceChange);
    const highLowRange = Math.abs(priceChange) * (0.5 + Math.random());
    const high = Math.max(open, close) * (1 + highLowRange * 0.5);
    const low = Math.min(open, close) * (1 - highLowRange * 0.5);

    // Generar volumen
    const baseVolume = 1000000 / config.basePrice; // volumen base en USD
    const volume = baseVolume * sessionConfig.volume * (0.5 + Math.random());

    // Aplicar spread
    const bid = close - config.spread / 2;
    const ask = close + config.spread / 2;

    // Actualizar estado
    this.currentPrices[symbol] = close;
    this.priceHistory[symbol].push(close);

    // Calcular indicadores
    const closes = this.priceHistory[symbol];
    const hlcs = this.data[symbol].map(d => ({ high: d.high, low: d.low, close: d.close }));
    const volumes = this.data[symbol].map(d => d.volume);

    const indicators = {
      rsi: IndicatorCalculator.calculateRSI(closes, CONFIG.indicators.rsi.period),
      ema8: IndicatorCalculator.calculateEMA(closes, 8),
      ema21: IndicatorCalculator.calculateEMA(closes, 21),
      ema55: IndicatorCalculator.calculateEMA(closes, 55),
      bollinger: IndicatorCalculator.calculateBollingerBands(
        closes,
        CONFIG.indicators.bollinger.period,
        CONFIG.indicators.bollinger.stdDev
      )
    };

    // VWAP si hay suficientes datos
    if (hlcs.length > 0) {
      const allHlcs = [...hlcs, { high, low, close }];
      const allVolumes = [...volumes, volume];
      indicators.vwap = IndicatorCalculator.calculateVWAP(allHlcs, allVolumes);
    }

    return {
      timestamp,
      datetime: new Date(timestamp).toISOString(),
      symbol,
      open: MathUtils.roundTo(open, config.tickSize),
      high: MathUtils.roundTo(high, config.tickSize),
      low: MathUtils.roundTo(low, config.tickSize),
      close: MathUtils.roundTo(close, config.tickSize),
      volume: MathUtils.roundTo(volume, 2),
      bid: MathUtils.roundTo(bid, config.tickSize),
      ask: MathUtils.roundTo(ask, config.tickSize),
      spread: config.spread,
      indicators
    };
  }

  simulate() {
    console.log(`🚀 Iniciando simulación de mercado...`);
    console.log(`📊 Símbolos: ${this.symbols.join(', ')}`);
    console.log(`⏱️  Intervalo: ${this.interval}ms`);
    console.log(`⏰ Duración: ${this.duration / 3600000} horas`);
    console.log(`🕐 Inicio: ${new Date(this.startTime).toISOString()}`);
    console.log(`🕐 Fin: ${new Date(this.endTime).toISOString()}`);
    console.log('');

    let timestamp = this.startTime;
    let barCount = 0;
    const totalBars = Math.floor(this.duration / this.interval);

    while (timestamp < this.endTime) {
      // Actualizar eventos de news
      this.updateNewsEvents(timestamp);

      // Generar vela para cada símbolo
      for (const symbol of this.symbols) {
        const candle = this.generateCandle(symbol, timestamp);
        this.data[symbol].push(candle);
      }

      barCount++;

      // Progress cada 10%
      if (barCount % Math.floor(totalBars / 10) === 0) {
        const progress = Math.round((barCount / totalBars) * 100);
        console.log(`⏳ Progreso: ${progress}% (${barCount}/${totalBars} velas)`);
      }

      timestamp += this.interval;
    }

    // Generar resumen
    const summary = this.generateSummary();

    return {
      metadata: {
        startTime: this.startTime,
        endTime: this.endTime,
        interval: this.interval,
        duration: this.duration,
        symbols: this.symbols,
        totalBars: barCount,
        newsEvents: this.activeNewsEvents.length + barCount * CONFIG.newsEvents.probability
      },
      summary,
      data: this.data
    };
  }

  generateSummary() {
    const summary = {};

    for (const symbol of this.symbols) {
      const candles = this.data[symbol];
      if (candles.length === 0) continue;

      const first = candles[0];
      const last = candles[candles.length - 1];

      // Calcular estadísticas
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const volumes = candles.map(c => c.volume);

      summary[symbol] = {
        startPrice: first.open,
        endPrice: last.close,
        high: Math.max(...highs),
        low: Math.min(...lows),
        change: last.close - first.open,
        changePercent: ((last.close - first.open) / first.open) * 100,
        avgVolume: volumes.reduce((a, b) => a + b, 0) / volumes.length,
        totalVolume: volumes.reduce((a, b) => a + b, 0),
        candles: candles.length,
        volatility: this.calculateVolatility(candles)
      };
    }

    return summary;
  }

  calculateVolatility(candles) {
    if (candles.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    // Volatilidad anualizada (asumiendo datos continuos)
    return Math.sqrt(variance) * Math.sqrt(365 * 24 * 60 * 60 / (this.interval / 1000));
  }
}

// ==================== CLI ====================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    interval: 10000,
    duration: 24,
    output: null,
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--interval' && args[i + 1]) {
      options.interval = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--duration' && args[i + 1]) {
      options.duration = parseFloat(args[i + 1]);
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (arg === '--symbols' && args[i + 1]) {
      options.symbols = args[i + 1].split(',');
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Market Data Simulator for Paper Trading

Usage: node market_data_simulator.js [options]

Options:
  --interval <ms>     Candle interval in milliseconds (default: 10000)
  --duration <hours>  Simulation duration in hours (default: 24)
  --output <file>     Output JSON file (default: market_data_<timestamp>.json)
  --symbols <list>    Comma-separated symbols (default: BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT)
  --help, -h          Show this help

Examples:
  # Simular 6 horas con velas de 10 segundos
  node market_data_simulator.js --duration 6

  # Simular solo BTC y ETH por 12 horas
  node market_data_simulator.js --symbols BTCUSDT,ETHUSDT --duration 12

  # Usar velas de 1 minuto
  node market_data_simulator.js --interval 60000 --duration 48
      `);
      process.exit(0);
    }
  }

  // Default output filename
  if (!options.output) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    options.output = `market_data_${timestamp}.json`;
  }

  return options;
}

async function main() {
  const options = parseArgs();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       MARKET DATA SIMULATOR - PAPER TRADING            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Crear simulador
  const simulator = new MarketDataSimulator(options);

  // Ejecutar simulación
  const result = simulator.simulate();

  console.log('');
  console.log('✅ Simulación completada!');
  console.log('');
  console.log('📊 RESUMEN:');
  console.log('─────────────────────────────────────────────────────────');

  for (const [symbol, stats] of Object.entries(result.summary)) {
    console.log(`
${symbol}:
  Precio Inicial: $${stats.startPrice.toLocaleString()}
  Precio Final:   $${stats.endPrice.toLocaleString()}
  Rango:          $${stats.low.toLocaleString()} - $${stats.high.toLocaleString()}
  Cambio:         ${stats.changePercent.toFixed(2)}%
  Volatilidad:    ${(stats.volatility * 100).toFixed(2)}% anualizada
  Volumen Prom:   ${stats.avgVolume.toFixed(2)}
  Total Velas:    ${stats.candles}
    `);
  }

  console.log('─────────────────────────────────────────────────────────');
  console.log(`⏱️  Tiempo total: ${result.metadata.duration / 3600000} horas`);
  console.log(`📈 Velas generadas: ${result.metadata.totalBars}`);
  console.log(`📰 Eventos news estimados: ${Math.round(result.metadata.newsEvents)}`);
  console.log('');

  // Guardar a archivo
  const outputDir = dirname(options.output);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(options.output, JSON.stringify(result, null, 2));
  console.log(`💾 Datos guardados en: ${options.output}`);
  console.log('');
  console.log('📋 Estructura del JSON:');
  console.log('   {');
  console.log('     metadata: { startTime, endTime, interval, symbols, ... },');
  console.log('     summary: { BTCUSDT: { startPrice, endPrice, ... }, ... },');
  console.log('     data: {');
  console.log('       BTCUSDT: [{ timestamp, open, high, low, close, volume, indicators }],');
  console.log('       ETHUSDT: [...],');
  console.log('       ...');
  console.log('     }');
  console.log('   }');
}

// Ejecutar si se llama directamente
main().catch(console.error);

export { MarketDataSimulator, IndicatorCalculator, CONFIG };
