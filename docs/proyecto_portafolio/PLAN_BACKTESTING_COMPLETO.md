# 📊 PLAN DE BACKTESTING COMPLETO - BTCUSDT 2 AÑOS

**Fecha:** 2026-04-11  
**Objetivo:** Validar 10 sistemas de trading con 2 años de datos históricos BTCUSDT  
**Horizonte:** Enero 2024 - Abril 2026 (2 años)  
**Timeframe:** 5 minutos (principal) + 15 minutos (secundario)

---

## 🎯 OBJETIVOS DEL BACKTESTING

### **Metas Principales:**

1. **Validar每个系统 individualmente**
   - Win rate real vs esperado
   - Maximum drawdown
   - Profit factor
   - Sharpe ratio

2. **Comparar sistemas entre sí**
   - Ranking por rendimiento
   - Análisis de correlación
   - Identificar sistemas redundantes

3. **Validar ORÁCULO multi-sistema**
   - Mejora vs individual
   - Reducción de drawdown
   - Optimización de pesos

4. **Optimizar parámetros**
   - Grid search de parámetros
   - Walk-forward analysis
   - Validación out-of-sample

---

## 📥 FASE 1: OBTENCIÓN DE DATOS HISTÓRICOS

### **1.1 Fuentes de Datos**

**Opción A: Binance API (Recomendada - Gratis)**
```javascript
// Obtener datos históricos de Binance
async function fetchBinanceData(symbol = 'BTCUSDT', interval = '5m', years = 2) {
  const endPoint = 'https://api.binance.com/api/v3/klines';
  
  // Calcular fechas
  const endTime = Date.now();
  const startTime = endTime - (years * 365 * 24 * 60 * 60 * 1000);
  
  // Binance retorna máximo 1000 velas por request
  const limit = 1000;
  const allData = [];
  
  let currentStartTime = startTime;
  
  while (currentStartTime < endTime) {
    const url = `${endPoint}?symbol=${symbol}&interval=${interval}&startTime=${currentStartTime}&endTime=${endTime}&limit=${limit}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    allData.push(...data);
    
    // Avanzar al siguiente lote
    const lastTimestamp = data[data.length - 1][0];
    currentStartTime = lastTimestamp + 1;
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Formatear datos
  return allData.map(kline => ({
    timestamp: kline[0],
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5])
  }));
}
```

**Opción B: Yahoo Finance (Alternativa)**
```javascript
// Usar yfinance vía Python
import yfinance as yf
import pandas as pd

def fetch_yahoo_data(symbol='BTC-USD', period='2y', interval='5m'):
    """
    Obtiene datos de Yahoo Finance
    
    Nota: Yahoo Finance tiene limitaciones en datos de 5min
    Mejor usar para timeframe diario o 1h
    """
    ticker = yf.Ticker(symbol)
    data = ticker.history(period=period, interval=interval)
    
    return data

# Uso
data = fetch_yahoo_data('BTC-USD', period='2y', interval='1h')
data.to_csv('btcusdt_1h_2years.csv')
```

**Opción C: TradingView (Vía MCP)**
```javascript
// Extraer datos desde TradingView MCP
async function fetchTradingViewData(symbol = 'BTCUSDT', timeframe = '5') {
  // NOTA: TradingView MCP tiene límites en datos históricos
  // Útil para validación rápida, no para 2 años completos
  
  const chartState = await mcp_tradingview__chart_get_state();
  const ohlcv = await mcp_tradingview__data_get_ohlcv({
    count: 500, // Máximo 500 velas
    summary: false
  });
  
  return ohlcv;
}
```

### **1.2 Script Completo de Descarga**

```javascript
// download_historical_data.js
import { writeFileSync } from 'fs';
import fetch from 'node-fetch';

async function downloadHistoricalData() {
  console.log('📥 Descargando datos históricos de BTCUSDT...');
  
  try {
    // Descargar datos de 5min
    const data5m = await fetchBinanceData('BTCUSDT', '5m', 2);
    writeFileSync(
      'backtesting/data/btcusdt_5m_2years.json',
      JSON.stringify(data5m, null, 2)
    );
    console.log(`✅ Datos 5m guardados: ${data5m.length} velas`);
    
    // Descargar datos de 15min
    const data15m = await fetchBinanceData('BTCUSDT', '15m', 2);
    writeFileSync(
      'backtesting/data/btcusdt_15m_2years.json',
      JSON.stringify(data15m, null, 2)
    );
    console.log(`✅ Datos 15m guardados: ${data15m.length} velas`);
    
    // Descargar datos de 1h (para análisis macro)
    const data1h = await fetchBinanceData('BTCUSDT', '1h', 2);
    writeFileSync(
      'backtesting/data/btcusdt_1h_2years.json',
      JSON.stringify(data1h, null, 2)
    );
    console.log(`✅ Datos 1h guardados: ${data1h.length} velas`);
    
    // Estadísticas
    console.log('\n📊 Estadísticas de Datos:');
    console.log(`   Período: ${new Date(data5m[0].timestamp).toLocaleDateString()} - ${new Date(data5m[data5m.length-1].timestamp).toLocaleDateString()}`);
    console.log(`   Velas 5m: ${data5m.length.toLocaleString()}`);
    console.log(`   Velas 15m: ${data15m.length.toLocaleString()}`);
    console.log(`   Velas 1h: ${data1h.length.toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Error descargando datos:', error);
  }
}

// Ejecutar
downloadHistoricalData();
```

### **1.3 Calcular Indicadores Necesarios**

```javascript
// calculate_indicators.js
import { readFileSync, writeFileSync } from 'fs';

function calculateSMA(data, period) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
      continue;
    }
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}

function calculateEMA(data, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  ema[0] = data[0]; // Primera EMA es el precio
  
  for (let i = 1; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  
  return ema;
}

function calculateRSI(closes, period = 14) {
  const rsi = [];
  const gains = [];
  const losses = [];
  
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      rsi.push(null);
      continue;
    }
    
    const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

function calculateATR(highs, lows, closes, period = 14) {
  const tr = [];
  
  // True Range
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) {
      tr.push(highs[i] - lows[i]);
    } else {
      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      tr.push(Math.max(hl, hc, lc));
    }
  }
  
  // ATR (SMA de True Range)
  return calculateSMA(tr, period);
}

function calculateVWAP(data, period = 100) {
  const vwap = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      vwap.push(null);
      continue;
    }
    
    const slice = data.slice(i - period + 1, i + 1);
    const totalPV = slice.reduce((sum, d) => sum + (d.high + d.low + d.close) / 3 * d.volume, 0);
    const totalVolume = slice.reduce((sum, d) => sum + d.volume, 0);
    
    vwap.push(totalPV / totalVolume);
  }
  
  return vwap;
}

function calculateADX(highs, lows, closes, period = 14) {
  // Simplificado - versión completa requiere más cálculos
  const tr = [];
  const plusDM = [];
  const minusDM = [];
  
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  
  // Smoothed values
  const atr = calculateSMA(tr, period);
  const plusDI = calculateSMA(plusDM, period);
  const minusDI = calculateSMA(minusDM, period);
  
  // DX y ADX
  const dx = [];
  for (let i = 0; i < atr.length; i++) {
    if (atr[i] === 0) {
      dx.push(0);
    } else {
      const sum = plusDI[i] + minusDI[i];
      dx.push(sum === 0 ? 0 : (Math.abs(plusDI[i] - minusDI[i]) / sum) * 100);
    }
  }
  
  return calculateSMA(dx, period);
}

// Procesar datos completos
function processHistoricalData() {
  console.log('📊 Calculando indicadores...');
  
  // Cargar datos
  const data = JSON.parse(readFileSync('backtesting/data/btcusdt_5m_2years.json'));
  
  // Extraer arrays
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);
  
  // Calcular indicadores
  const indicators = {
    timestamps: data.map(d => d.timestamp),
    opens: data.map(d => d.open),
    highs,
    lows,
    closes,
    volumes,
    
    // Indicadores
    sma20: calculateSMA(closes, 20),
    ema8: calculateEMA(closes, 8),
    ema20: calculateEMA(closes, 20),
    rsi: calculateRSI(closes, 14),
    atr: calculateATR(highs, lows, closes, 14),
    atrSMA: null, // Se calcula después
    vwap: calculateVWAP(data, 100),
    adx: calculateADX(highs, lows, closes, 14),
    
    // High/Low 20 períodos
    high20: calculateSMA(highs, 20).map((h, i) => {
      if (i < 19) return null;
      return Math.max(...highs.slice(i - 19, i + 1));
    }),
    low20: calculateSMA(lows, 20).map((l, i) => {
      if (i < 19) return null;
      return Math.min(...lows.slice(i - 19, i + 1));
    })
  };
  
  // Calcular ATR SMA
  indicators.atrSMA = calculateSMA(indicators.atr.filter(a => a !== null), 20);
  
  // Guardar
  writeFileSync(
    'backtesting/data/btcusdt_5m_2years_indicators.json',
    JSON.stringify(indicators, null, 2)
  );
  
  console.log('✅ Indicadores calculados y guardados');
  console.log(`   Total velas: ${data.length.toLocaleString()}`);
  console.log(`   Indicadores: ${Object.keys(indicators).length}`);
}

// Ejecutar
processHistoricalData();
```

---

## 🎯 FASE 2: IMPLEMENTACIÓN DE SISTEMAS DE TRADING

### **2.1 Sistema 1: Turtle Soup CTR**

```javascript
// backtesting/systems/turtle_soup_ctr.js
export class TurtleSoupCTR {
  constructor(config = {}) {
    this.highLowPeriod = config.highLowPeriod || 20;
    this.rsiLongThreshold = config.rsiLongThreshold || 35;
    this.rsiShortThreshold = config.rsiShortThreshold || 65;
    this.highLowThreshold = config.highLowThreshold || 0.002; // 0.2%
    this.minVolume = config.minVolume || 20;
    
    this.positions = [];
    this.trades = [];
  }
  
  detect(data, i) {
    if (i < this.highLowPeriod) return null;
    
    const currentHigh = data.highs[i];
    const currentLow = data.lows[i];
    const high20 = data.high20[i];
    const low20 = data.low20[i];
    const rsi = data.rsi[i];
    const volume = data.volumes[i];
    const avgVolume = data.volumes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
    
    // Detectar nueva barrida de high
    if (currentHigh > high20) {
      const highBreakout = (currentHigh - high20) / high20;
      
      if (highBreakout > this.highLowThreshold &&
          rsi < this.rsiShortThreshold &&
          volume > avgVolume * (this.minVolume / 20)) {
        return {
          type: 'SHORT',
          entry: currentHigh,
          stop: high20 * 1.001,
          target: currentHigh * (1 - this.highLowThreshold * 3),
          confidence: 0.5,
          reason: 'Turtle Soup SHORT - False breakout'
        };
      }
    }
    
    // Detectar nueva barrida de low
    if (currentLow < low20) {
      const lowBreakout = (low20 - currentLow) / low20;
      
      if (lowBreakout > this.highLowThreshold &&
          rsi > this.rsiLongThreshold &&
          volume > avgVolume * (this.minVolume / 20)) {
        return {
          type: 'LONG',
          entry: currentLow,
          stop: low20 * 0.999,
          target: currentLow * (1 + this.highLowThreshold * 3),
          confidence: 0.5,
          reason: 'Turtle Soup LONG - False breakout'
        };
      }
    }
    
    return null;
  }
  
  execute(signal, data, i) {
    const trade = {
      system: 'TURTLE_SOUP_CTR',
      entryTime: data.timestamps[i],
      entryPrice: signal.entry,
      type: signal.type,
      stopLoss: signal.stop,
      takeProfit: signal.target,
      confidence: signal.confidence,
      reason: signal.reason
    };
    
    this.positions.push(trade);
    return trade;
  }
  
  managePositions(data, i) {
    for (let j = this.positions.length - 1; j >= 0; j--) {
      const pos = this.positions[j];
      const currentPrice = data.closes[i];
      
      // Check exit conditions
      let exitPrice = null;
      let exitReason = null;
      
      if (pos.type === 'LONG') {
        if (currentPrice >= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice <= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      } else { // SHORT
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }
      
      // Time-based exit (10 períodos)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 10 && !exitPrice) {
        exitPrice = currentPrice;
        exitReason = 'TIME_EXIT';
      }
      
      if (exitPrice) {
        const pnl = pos.type === 'LONG' 
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;
        
        const closedTrade = {
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl,
          success: pnl > 0,
          exitReason
        };
        
        this.trades.push(closedTrade);
        this.positions.splice(j, 1);
      }
    }
  }
}
```

### **2.2 Sistema 2: VWAP Bounce**

```javascript
// backtesting/systems/vwap_bounce.js
export class VWAPBounce {
  constructor(config = {}) {
    this.vwapThreshold = config.vwapThreshold || 0.001; // 0.1%
    this.volumeMultiplier = config.volumeMultiplier || 1.2;
    this.stopLoss = config.stopLoss || 0.003; // 0.3%
    this.takeProfit = config.takeProfit || 0.006; // 0.6%
    
    this.positions = [];
    this.trades = [];
  }
  
  detect(data, i) {
    if (i < 100) return null; // VWAP requiere 100 períodos
    
    const price = data.closes[i];
    const vwap = data.vwap[i];
    const volume = data.volumes[i];
    const avgVolume = data.volumes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
    
    const deviation = (price - vwap) / vwap;
    const volumeConfirm = volume > avgVolume * this.volumeMultiplier;
    
    // Detectar rebote desde abajo
    if (deviation > -this.vwapThreshold && 
        deviation < 0 &&
        volumeConfirm) {
      return {
        type: 'LONG',
        entry: price,
        stop: price * (1 - this.stopLoss),
        target: price * (1 + this.takeProfit),
        confidence: 0.65,
        reason: 'VWAP Bounce LONG'
      };
    }
    
    // Detectar rechazo desde arriba
    if (deviation < this.vwapThreshold &&
        deviation > 0 &&
        volumeConfirm) {
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.65,
        reason: 'VWAP Bounce SHORT'
      };
    }
    
    return null;
  }
  
  execute(signal, data, i) {
    const trade = {
      system: 'VWAP_BOUNCE',
      entryTime: data.timestamps[i],
      entryPrice: signal.entry,
      type: signal.type,
      stopLoss: signal.stop,
      takeProfit: signal.target,
      confidence: signal.confidence,
      reason: signal.reason
    };
    
    this.positions.push(trade);
    return trade;
  }
  
  managePositions(data, i) {
    // Similar a Turtle Soup
    for (let j = this.positions.length - 1; j >= 0; j--) {
      const pos = this.positions[j];
      const currentPrice = data.closes[i];
      
      let exitPrice = null;
      let exitReason = null;
      
      if (pos.type === 'LONG') {
        if (currentPrice >= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice <= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      } else {
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }
      
      if (exitPrice) {
        const pnl = pos.type === 'LONG' 
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;
        
        const closedTrade = {
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl,
          success: pnl > 0,
          exitReason
        };
        
        this.trades.push(closedTrade);
        this.positions.splice(j, 1);
      }
    }
  }
}
```

### **2.3 Sistema 3: EMA 8 + RSI**

```javascript
// backtesting/systems/ema_rsi.js
export class EMARSI {
  constructor(config = {}) {
    this.emaPeriod = config.emaPeriod || 8;
    this.rsiPeriod = config.rsiPeriod || 14;
    this.rsiThreshold = config.rsiThreshold || 50;
    this.stopLoss = config.stopLoss || 0.004;
    this.takeProfit = config.takeProfit || 0.008;
    
    this.positions = [];
    this.trades = [];
  }
  
  detect(data, i) {
    if (i < this.emaPeriod) return null;
    
    const price = data.closes[i];
    const prevPrice = data.closes[i - 1];
    const ema8 = data.ema8[i];
    const rsi = data.rsi[i];
    const prevRsi = data.rsi[i - 1];
    
    // Detectar cruce alcista
    const bullishCrossover = prevPrice < ema8 && price > ema8;
    const rsiConfirm = rsi < this.rsiThreshold && rsi > prevRsi;
    
    if (bullishCrossover && rsiConfirm) {
      return {
        type: 'LONG',
        entry: price,
        stop: price * (1 - this.stopLoss),
        target: price * (1 + this.takeProfit),
        confidence: 0.60,
        reason: 'EMA8+RSI LONG'
      };
    }
    
    // Detectar cruce bajista
    const bearishCrossover = prevPrice > ema8 && price < ema8;
    const rsiConfirmBearish = rsi > this.rsiThreshold && rsi < prevRsi;
    
    if (bearishCrossover && rsiConfirmBearish) {
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.60,
        reason: 'EMA8+RSI SHORT'
      };
    }
    
    return null;
  }
  
  execute(signal, data, i) {
    const trade = {
      system: 'EMA8_RSI',
      entryTime: data.timestamps[i],
      entryPrice: signal.entry,
      type: signal.type,
      stopLoss: signal.stop,
      takeProfit: signal.target,
      confidence: signal.confidence,
      reason: signal.reason
    };
    
    this.positions.push(trade);
    return trade;
  }
  
  managePositions(data, i) {
    // Similar a sistemas anteriores
    for (let j = this.positions.length - 1; j >= 0; j--) {
      const pos = this.positions[j];
      const currentPrice = data.closes[i];
      
      let exitPrice = null;
      let exitReason = null;
      
      if (pos.type === 'LONG') {
        if (currentPrice >= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice <= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      } else {
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }
      
      if (exitPrice) {
        const pnl = pos.type === 'LONG' 
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;
        
        const closedTrade = {
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl,
          success: pnl > 0,
          exitReason
        };
        
        this.trades.push(closedTrade);
        this.positions.splice(j, 1);
      }
    }
  }
}
```

### **2.4 Sistema 4: Mean Reversion**

```javascript
// backtesting/systems/mean_reversion.js
export class MeanReversion {
  constructor(config = {}) {
    this.period = config.period || 20;
    this.zScoreThreshold = config.zScoreThreshold || 2;
    this.stopLoss = config.stopLoss || 0.005;
    this.takeProfit = config.takeProfit || 0.0075;
    this.activationDelta = config.activationDelta || 0.02;
    
    this.positions = [];
    this.trades = [];
  }
  
  detect(data, i, aggressiveDelta = 0) {
    if (i < this.period) return null;
    
    const price = data.closes[i];
    const sma20 = data.sma20[i];
    const stdDev = this.calculateStdDev(data.closes.slice(i - this.period, i));
    const zScore = (price - sma20) / stdDev;
    
    // Solo activar si delta de agresivos es significativo
    if (Math.abs(aggressiveDelta) < this.activationDelta) {
      return null;
    }
    
    // Precio sobreextendido al alza → SHORT
    if (zScore > this.zScoreThreshold) {
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.55,
        isHedge: true,
        reason: 'Mean Reversion SHORT'
      };
    }
    
    // Precio sobreextendido a la baja → LONG
    if (zScore < -this.zScoreThreshold) {
      return {
        type: 'LONG',
        entry: price,
        stop: price * (1 - this.stopLoss),
        target: price * (1 + this.takeProfit),
        confidence: 0.55,
        isHedge: true,
        reason: 'Mean Reversion LONG'
      };
    }
    
    return null;
  }
  
  calculateStdDev(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const squareDiffs = arr.map(value => Math.pow(value - mean, 2));
    const variance = squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(variance);
  }
  
  execute(signal, data, i) {
    const trade = {
      system: 'MEAN_REVERSION',
      entryTime: data.timestamps[i],
      entryPrice: signal.entry,
      type: signal.type,
      stopLoss: signal.stop,
      takeProfit: signal.target,
      confidence: signal.confidence,
      isHedge: signal.isHedge,
      reason: signal.reason
    };
    
    this.positions.push(trade);
    return trade;
  }
  
  managePositions(data, i) {
    // Similar a sistemas anteriores
    for (let j = this.positions.length - 1; j >= 0; j--) {
      const pos = this.positions[j];
      const currentPrice = data.closes[i];
      
      let exitPrice = null;
      let exitReason = null;
      
      if (pos.type === 'LONG') {
        if (currentPrice >= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice <= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      } else {
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }
      
      if (exitPrice) {
        const pnl = pos.type === 'LONG' 
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;
        
        const closedTrade = {
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl,
          success: pnl > 0,
          exitReason
        };
        
        this.trades.push(closedTrade);
        this.positions.splice(j, 1);
      }
    }
  }
}
```

---

## 🔄 FASE 3: MOTOR DE BACKTESTING

### **3.1 Motor Principal**

```javascript
// backtesting/backtest_engine.js
import { readFileSync, writeFileSync } from 'fs';
import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';
import { MeanReversion } from './systems/mean_reversion.js';

class BacktestEngine {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 10000;
    this.maxPositionSize = config.maxPositionSize || 1000;
    this.riskPerTrade = config.riskPerTrade || 0.01;
    
    this.systems = [];
    this.allTrades = [];
  }
  
  addSystem(system) {
    this.systems.push(system);
  }
  
  run(dataFile) {
    console.log('🔄 Iniciando backtest...');
    
    // Cargar datos
    const data = JSON.parse(readFileSync(dataFile));
    
    console.log(`📊 Datos cargados: ${data.timestamps.length.toLocaleString()} velas`);
    console.log(`📅 Período: ${new Date(data.timestamps[0]).toLocaleDateString()} - ${new Date(data.timestamps[data.timestamps.length - 1]).toLocaleDateString()}`);
    
    // Ejecutar backtest para cada sistema
    const results = {};
    
    for (const system of this.systems) {
      console.log(`\n🎯 Ejecutando: ${system.constructor.name}`);
      
      const systemResult = this.runSystem(system, data);
      results[system.constructor.name] = systemResult;
      
      console.log(`   Trades: ${systemResult.totalTrades}`);
      console.log(`   Win Rate: ${(systemResult.winRate * 100).toFixed(2)}%`);
      console.log(`   Total PnL: ${(systemResult.totalPnL * 100).toFixed(2)}%`);
    }
    
    // Guardar resultados
    writeFileSync(
      'backtesting/results/backtest_results.json',
      JSON.stringify(results, null, 2)
    );
    
    console.log('\n✅ Backtest completado!');
    console.log('📄 Resultados guardados en: backtesting/results/backtest_results.json');
    
    return results;
  }
  
  runSystem(system, data) {
    system.trades = [];
    system.positions = [];
    
    // Iterar sobre cada vela
    for (let i = 0; i < data.timestamps.length; i++) {
      // Detectar señales
      const signal = system.detect(data, i);
      
      if (signal) {
        system.execute(signal, data, i);
      }
      
      // Gestionar posiciones abiertas
      system.managePositions(data, i);
    }
    
    // Calcular estadísticas
    return this.calculateStats(system.trades, system.constructor.name);
  }
  
  calculateStats(trades, systemName) {
    if (trades.length === 0) {
      return {
        systemName,
        totalTrades: 0,
        winRate: 0,
        totalPnL: 0,
        avgPnL: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        profitFactor: 0
      };
    }
    
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.success);
    const losingTrades = trades.filter(t => !t.success);
    
    const winRate = winningTrades.length / totalTrades;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = totalPnL / totalTrades;
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
    
    // Calcular drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let cumulative = 0;
    
    for (const trade of trades) {
      cumulative += trade.pnl;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = (peak - cumulative) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    // Calcular Sharpe Ratio (simplificado)
    const pnlValues = trades.map(t => t.pnl);
    const avgPnLValue = pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length;
    const stdDevPnL = Math.sqrt(
      pnlValues.reduce((sum, val) => sum + Math.pow(val - avgPnLValue, 2), 0) / pnlValues.length
    );
    const sharpeRatio = stdDevPnL === 0 ? 0 : (avgPnLValue / stdDevPnL) * Math.sqrt(252); // Anualizado
    
    return {
      systemName,
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnL,
      avgPnL,
      grossProfit,
      grossLoss,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      trades
    };
  }
}

// Ejemplo de uso
async function runBacktest() {
  const engine = new BacktestEngine({
    initialCapital: 10000,
    maxPositionSize: 1000,
    riskPerTrade: 0.01
  });
  
  // Agregar sistemas
  engine.addSystem(new TurtleSoupCTR());
  engine.addSystem(new VWAPBounce());
  engine.addSystem(new EMARSI());
  engine.addSystem(new MeanReversion());
  
  // Ejecutar backtest
  const results = engine.run('backtesting/data/btcusdt_5m_2years_indicators.json');
  
  return results;
}

runBacktest();
```

---

## 📊 FASE 4: ANÁLISIS DE RESULTADOS

### **4.1 Script de Análisis**

```javascript
// backtesting/analyze_results.js
import { readFileSync } from 'fs';

function analyzeResults() {
  console.log('📊 Analizando resultados de backtest...\n');
  
  const results = JSON.parse(readFileSync('backtesting/results/backtest_results.json'));
  
  // Tabla comparativa
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    COMPARATIVA DE SISTEMAS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const systems = Object.values(results);
  
  // Ordenar por total PnL
  systems.sort((a, b) => b.totalPnL - a.totalPnL);
  
  console.log(
    'Sistema'.padEnd(20) +
    'Trades'.padStart(10) +
    'Win Rate'.padStart(12) +
    'Total PnL'.padStart(12) +
    'Sharpe'.padStart(10) +
    'Max DD'.padStart(10)
  );
  
  console.log('─'.repeat(74));
  
  for (const system of systems) {
    console.log(
      system.systemName.padEnd(20) +
      system.totalTrades.toString().padStart(10) +
      (system.winRate * 100).toFixed(2) + '%'.padStart(11) +
      (system.totalPnL * 100).toFixed(2) + '%'.padStart(11) +
      system.sharpeRatio.toFixed(2).padStart(10) +
      (system.maxDrawdown * 100).toFixed(2) + '%'.padStart(9)
    );
  }
  
  // Encontrar el mejor sistema
  const bestSystem = systems[0];
  console.log('\n🏆 MEJOR SISTEMA:', bestSystem.systemName);
  console.log(`   Total PnL: ${(bestSystem.totalPnL * 100).toFixed(2)}%`);
  console.log(`   Win Rate: ${(bestSystem.winRate * 100).toFixed(2)}%`);
  console.log(`   Sharpe Ratio: ${bestSystem.sharpeRatio.toFixed(2)}`);
  console.log(`   Max Drawdown: ${(bestSystem.maxDrawdown * 100).toFixed(2)}%`);
  
  // Análisis adicional
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    ANÁLISIS DETALLADO');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  for (const system of systems) {
    console.log(`\n📈 ${system.systemName}`);
    console.log(`   Trades Totales: ${system.totalTrades}`);
    console.log(`   Trades Ganadores: ${system.winningTrades}`);
    console.log(`   Trades Perdedores: ${system.losingTrades}`);
    console.log(`   Win Rate: ${(system.winRate * 100).toFixed(2)}%`);
    console.log(`   Profit Factor: ${system.profitFactor.toFixed(2)}`);
    console.log(`   Gross Profit: ${(system.grossProfit * 100).toFixed(2)}%`);
    console.log(`   Gross Loss: ${(system.grossLoss * 100).toFixed(2)}%`);
    console.log(`   Avg PnL por Trade: ${(system.avgPnL * 100).toFixed(4)}%`);
    console.log(`   Max Drawdown: ${(system.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`   Sharpe Ratio: ${system.sharpeRatio.toFixed(2)}`);
    
    // Análisis de trades por mes
    const tradesByMonth = {};
    for (const trade of system.trades) {
      const date = new Date(trade.entryTime);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!tradesByMonth[monthKey]) {
        tradesByMonth[monthKey] = [];
      }
      tradesByMonth[monthKey].push(trade);
    }
    
    console.log(`\n   📅 Rendimiento por Mes:`);
    for (const [month, trades] of Object.entries(tradesByMonth)) {
      const monthPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
      const monthWinRate = trades.filter(t => t.success).length / trades.length;
      console.log(`      ${month}: ${(monthPnL * 100).toFixed(2)}% (${trades.length} trades, ${(monthWinRate * 100).toFixed(1)}% win rate)`);
    }
  }
  
  // Recomendaciones
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    RECOMENDACIONES');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const profitableSystems = systems.filter(s => s.totalPnL > 0);
  const highWinRateSystems = systems.filter(s => s.winRate > 0.55);
  const lowDrawdownSystems = systems.filter(s => s.maxDrawdown < 0.15);
  
  console.log(`✅ Sistemas Rentables: ${profitableSystems.length}/${systems.length}`);
  console.log(`🎯 Sistemas con Win Rate >55%: ${highWinRateSystems.length}/${systems.length}`);
  console.log(`🛡️ Sistemas con Max DD <15%: ${lowDrawdownSystems.length}/${systems.length}`);
  
  if (profitableSystems.length > 0) {
    console.log('\n💡 Sistemas Recomendados para Implementar:');
    for (const system of profitableSystems) {
      if (system.winRate > 0.50 && system.maxDrawdown < 0.20) {
        console.log(`   ⭐ ${system.systemName}`);
        console.log(`      Win Rate: ${(system.winRate * 100).toFixed(2)}%`);
        console.log(`      Total PnL: ${(system.totalPnL * 100).toFixed(2)}%`);
        console.log(`      Max DD: ${(system.maxDrawdown * 100).toFixed(2)}%`);
      }
    }
  }
}

analyzeResults();
```

---

## 🚀 FASE 5: EJECUCIÓN COMPLETA

### **5.1 Script de Ejecución Completa**

```javascript
// backtesting/run_complete_backtest.js
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

function runCompleteBacktest() {
  console.log('🚀 Iniciando Backtest Completo - BTCUSDT 2 Años\n');
  
  // Paso 1: Descargar datos
  console.log('📥 PASO 1: Descargando datos históricos...');
  if (!existsSync('backtesting/data/btcusdt_5m_2years.json')) {
    execSync('node backtesting/download_data.js', { stdio: 'inherit' });
  } else {
    console.log('   ✅ Datos ya descargados');
  }
  
  // Paso 2: Calcular indicadores
  console.log('\n📊 PASO 2: Calculando indicadores...');
  if (!existsSync('backtesting/data/btcusdt_5m_2years_indicators.json')) {
    execSync('node backtesting/calculate_indicators.js', { stdio: 'inherit' });
  } else {
    console.log('   ✅ Indicadores ya calculados');
  }
  
  // Paso 3: Ejecutar backtest
  console.log('\n🔄 PASO 3: Ejecutando backtest...');
  execSync('node backtesting/backtest_engine.js', { stdio: 'inherit' });
  
  // Paso 4: Analizar resultados
  console.log('\n📈 PASO 4: Analizando resultados...');
  execSync('node backtesting/analyze_results.js', { stdio: 'inherit' });
  
  console.log('\n✅ BACKTEST COMPLETO FINALIZADO!');
  console.log('📄 Resultados guardados en: backtesting/results/');
}

runCompleteBacktest();
```

---

## 📋 ESTRUCTURA DE DIRECTORIOS

```
backtesting/
├── data/
│   ├── btcusdt_5m_2years.json
│   ├── btcusdt_5m_2years_indicators.json
│   ├── btcusdt_15m_2years.json
│   └── btcusdt_1h_2years.json
├── systems/
│   ├── turtle_soup_ctr.js
│   ├── vwap_bounce.js
│   ├── ema_rsi.js
│   ├── mean_reversion.js
│   ├── liquidity_sweep.js
│   ├── order_flow.js
│   ├── support_resistance.js
│   ├── fibonacci_retracement.js
│   ├── session_breakout.js
│   └── breakout_rango.js
├── results/
│   ├── backtest_results.json
│   ├── individual_systems/
│   └── optimization/
├── download_data.js
├── calculate_indicators.js
├── backtest_engine.js
├── analyze_results.js
└── run_complete_backtest.js
```

---

## 🎯 PRÓXIMOS PASOS

### **HOY:**

1. **Crear estructura de directorios**
   ```bash
   mkdir -p backtesting/{data,systems,results,results/individual_systems,results/optimization}
   ```

2. **Descargar datos históricos**
   ```bash
   node backtesting/download_data.js
   ```

3. **Calcular indicadores**
   ```bash
   node backtesting/calculate_indicators.js
   ```

### **ESTA SEMANA:**

4. **Implementar 4 sistemas base**
   - Turtle Soup CTR
   - VWAP Bounce
   - EMA 8 + RSI
   - Mean Reversion

5. **Ejecutar backtest inicial**
   ```bash
   node backtesting/run_complete_backtest.js
   ```

6. **Analizar resultados**
   - ¿Cuál sistema tiene mejor Win Rate?
   - ¿Cuál tiene mejor Sharpe Ratio?
   - ¿Cuál tiene menor Drawdown?

---

## 📊 MÉTRICAS ESPERADAS

| Sistema | Win Rate Esperado | Win Rate Real (Backtest) | ¿Validado? |
|---------|-------------------|-------------------------|------------|
| Turtle Soup CTR | 40-60% | ??? | Pendiente |
| VWAP Bounce | 55-65% | ??? | Pendiente |
| EMA 8 + RSI | 50-60% | ??? | Pendiente |
| Mean Reversion | 50-60% | ??? | Pendiente |

---

**¿Listo para comenzar el backtesting?** 🚀📊
