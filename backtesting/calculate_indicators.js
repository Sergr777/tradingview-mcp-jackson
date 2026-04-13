import { readFileSync, writeFileSync, existsSync } from 'fs';

/**
 * Calcula indicadores técnicos para datos históricos
 * SMA, EMA, RSI, ATR, VWAP, ADX, High/Low 20
 */

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

  // Primera EMA es el primer precio
  ema[0] = data[0];

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
    const totalPV = slice.reduce((sum, d) => sum + ((d.high + d.low + d.close) / 3) * d.volume, 0);
    const totalVolume = slice.reduce((sum, d) => sum + d.volume, 0);

    vwap.push(totalPV / totalVolume);
  }

  return vwap;
}

function calculateADX(highs, lows, closes, period = 14) {
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
    if (atr[i] === 0 || !plusDI[i] || !minusDI[i]) {
      dx.push(0);
    } else {
      const sum = plusDI[i] + minusDI[i];
      dx.push(sum === 0 ? 0 : (Math.abs(plusDI[i] - minusDI[i]) / sum) * 100);
    }
  }

  return calculateSMA(dx, period);
}

function calculateStdDev(arr, period) {
  const stdDev = [];

  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) {
      stdDev.push(null);
      continue;
    }

    const slice = arr.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const squareDiffs = slice.map(value => Math.pow(value - mean, 2));
    const variance = squareDiffs.reduce((a, b) => a + b, 0) / period;
    stdDev.push(Math.sqrt(variance));
  }

  return stdDev;
}

async function processHistoricalData() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         CÁLCULO DE INDICADORES TÉCNICOS                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Cargar datos
    console.log('📖 Cargando datos históricos...');
    const data = JSON.parse(readFileSync('backtesting/data/btcusdt_5m_2years.json'));
    console.log(`✅ ${data.length.toLocaleString()} velas cargadas`);

    // Extraer arrays
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    console.log('\n📊 Calculando indicadores...');

    // Calcular indicadores principales
    console.log('   SMA(20)...');
    const sma20 = calculateSMA(closes, 20);

    console.log('   EMA(8)...');
    const ema8 = calculateEMA(closes, 8);

    console.log('   EMA(20)...');
    const ema20 = calculateEMA(closes, 20);

    console.log('   RSI(14)...');
    const rsi = calculateRSI(closes, 14);

    console.log('   ATR(14)...');
    const atr = calculateATR(highs, lows, closes, 14);

    console.log('   ATR SMA(20)...');
    const atrSMA = calculateSMA(atr.filter(a => a !== null), 20);

    console.log('   VWAP(100)...');
    const vwap = calculateVWAP(data, 100);

    console.log('   ADX(14)...');
    const adx = calculateADX(highs, lows, closes, 14);

    console.log('   High/Low(20)...');
    const high20 = [];
    const low20 = [];

    for (let i = 0; i < data.length; i++) {
      if (i < 19) {
        high20.push(null);
        low20.push(null);
      } else {
        high20.push(Math.max(...highs.slice(i - 19, i + 1)));
        low20.push(Math.min(...lows.slice(i - 19, i + 1)));
      }
    }

    console.log('   StdDev(20)...');
    const stdDev20 = calculateStdDev(closes, 20);

    // Crear objeto de indicadores
    const indicators = {
      timestamps: data.map(d => d.timestamp),
      opens: data.map(d => d.open),
      highs,
      lows,
      closes,
      volumes,

      // Indicadores calculados
      sma20,
      ema8,
      ema20,
      rsi,
      atr,
      atrSMA,
      vwap,
      adx,
      high20,
      low20,
      stdDev20
    };

    // Guardar
    console.log('\n💾 Guardando indicadores...');
    writeFileSync(
      'backtesting/data/btcusdt_5m_2years_indicators.json',
      JSON.stringify(indicators, null, 2)
    );

    // Estadísticas
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  INDICADORES CALCULADOS                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Indicadores guardados: ${Object.keys(indicators).length}`);
    console.log(`📊 Total velas procesadas: ${data.length.toLocaleString()}`);

    // Muestra de primeros datos
    console.log('\n📋 Muestra de datos (primeras 5 velas con indicadores):');
    console.log('─'.repeat(120));

    for (let i = 20; i < 25; i++) {
      const date = new Date(indicators.timestamps[i]);
      console.log(`${date.toLocaleString()} | Close: ${indicators.closes[i].toFixed(2)} | RSI: ${indicators.rsi[i]?.toFixed(2) || 'N/A'} | ADX: ${indicators.adx[i]?.toFixed(2) || 'N/A'} | ATR: ${indicators.atr[i]?.toFixed(2) || 'N/A'}`);
    }

    // Verificación de integridad
    console.log('\n🔍 Verificación de integridad:');
    const nullCount = {
      sma20: sma20.filter(v => v === null).length,
      ema8: ema8.filter(v => v === null).length,
      rsi: rsi.filter(v => v === null).length,
      atr: atr.filter(v => v === null).length,
      vwap: vwap.filter(v => v === null).length,
      adx: adx.filter(v => v === null).length
    };

    for (const [indicator, count] of Object.entries(nullCount)) {
      const pct = ((count / indicators.timestamps.length) * 100).toFixed(1);
      console.log(`   ${indicator.padEnd(10)}: ${count.toLocaleString()} valores nulos (${pct}%)`);
    }

    console.log('\n✅ CÁLCULO COMPLETADO!');
    console.log('📂 Archivo: backtesting/data/btcusdt_5m_2years_indicators.json');

  } catch (error) {
    console.error('\n❌ Error procesando datos:', error.message);
    process.exit(1);
  }
}

// Ejecutar
processHistoricalData();
