/**
 * Recalcular high20 y low20 correctamente
 * El high20/low20 debe ser de las 20 velas ANTERIORES (no incluir la actual)
 */

import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('backtesting/data/btcusdt_5m_2years_indicators.json'));

console.log('📊 Recalculando high20 y low20 (versión corregida)...');

// Recalcular high20 y low20 (ventana de 20 velas ANTERIORES)
const high20_corrected = [];
const low20_corrected = [];

for (let i = 0; i < data.highs.length; i++) {
  if (i < 20) {
    // No hay suficientes velas anteriores
    high20_corrected.push(null);
    low20_corrected.push(null);
  } else {
    // Usar las 20 velas ANTERIORES (i-20 a i-1), no incluir la actual
    high20_corrected.push(Math.max(...data.highs.slice(i - 20, i)));
    low20_corrected.push(Math.min(...data.lows.slice(i - 20, i)));
  }
}

// Verificar breakouts con la versión corregida
let highBreakouts = 0;
let lowBreakouts = 0;
let highBreakoutSamples = [];
let lowBreakoutSamples = [];

for (let i = 20; i < data.highs.length; i++) {
  const highBreakout = data.highs[i] > high20_corrected[i];
  const lowBreakout = data.lows[i] < low20_corrected[i];

  if (highBreakout) {
    highBreakouts++;
    if (highBreakoutSamples.length < 20) {
      highBreakoutSamples.push({
        i,
        high: data.highs[i],
        high20: high20_corrected[i],
        diff: ((data.highs[i] - high20_corrected[i]) / high20_corrected[i] * 100).toFixed(4)
      });
    }
  }

  if (lowBreakout) {
    lowBreakouts++;
    if (lowBreakoutSamples.length < 20) {
      lowBreakoutSamples.push({
        i,
        low: data.lows[i],
        low20: low20_corrected[i],
        diff: ((low20_corrected[i] - data.lows[i]) / low20_corrected[i] * 100).toFixed(4)
      });
    }
  }
}

console.log(`\n✅ Recálculo completado`);
console.log(`\n📊 ESTADÍSTICAS CON VERSIÓN CORREGIDA:`);
console.log(`   High breakouts: ${highBreakouts.toLocaleString()} (${(highBreakouts / (data.highs.length - 20) * 100).toFixed(2)}%)`);
console.log(`   Low breakouts: ${lowBreakouts.toLocaleString()} (${(lowBreakouts / (data.lows.length - 20) * 100).toFixed(2)}%)`);

if (highBreakoutSamples.length > 0) {
  console.log(`\n📈 Muestras de High Breakouts:`);
  highBreakoutSamples.forEach(s => {
    console.log(`   [${s.i}] high: ${s.high.toFixed(2)}, high20: ${s.high20.toFixed(2)}, diff: +${s.diff}%`);
  });
}

if (lowBreakoutSamples.length > 0) {
  console.log(`\n📉 Muestras de Low Breakouts:`);
  lowBreakoutSamples.forEach(s => {
    console.log(`   [${s.i}] low: ${s.low.toFixed(2)}, low20: ${s.low20.toFixed(2)}, diff: -${s.diff}%`);
  });
}

// Guardar versión corregida
data.high20_corrected = high20_corrected;
data.low20_corrected = low20_corrected;

writeFileSync(
  'backtesting/data/btcusdt_5m_2years_indicators_corrected.json',
  JSON.stringify(data, null, 2)
);

console.log(`\n💾 Datos corregidos guardados en: backtesting/data/btcusdt_5m_2years_indicators_corrected.json`);

console.log(`\n🔍 Ahora podemos ejecutar Turtle Soup con high20_corrected y low20_corrected`);
