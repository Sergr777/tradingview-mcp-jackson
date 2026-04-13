/**
 * Script de diagnóstico para TP-Partial
 */

import { readFileSync } from 'fs';
import { MeanReversionTPPartial } from './backtesting/systems/mean_reversion_tp_partial.js';

const data = JSON.parse(readFileSync('backtesting/data/btcusdt_5m_2years_indicators.json'));

const system = new MeanReversionTPPartial();
system.trades = [];
system.positions = [];

let tp1Count = 0;
let tp2Count = 0;
let slCount = 0;

console.log('Ejecutando backtest (primeras 1000 velas)...');

for (let i = 0; i < Math.min(1000, data.timestamps.length); i++) {
  const signal = system.detect(data, i);
  if (signal) {
    system.execute(signal, data, i);
  }
  system.managePositions(data, i);

  // Contar trades por tipo
  for (const t of system.trades) {
    if (t.exitReason === 'TP1') tp1Count++;
    if (t.exitReason === 'TP2') tp2Count++;
    if (t.exitReason.includes('STOP_LOSS')) slCount++;
  }
}

console.log('\\n=== RESULTADOS (primeras 1000 velas) ===');
console.log('Trades totales:', system.trades.length);
console.log('TP1 hits:', tp1Count);
console.log('TP2 hits:', tp2Count);
console.log('SL hits:', slCount);

if (system.trades.length > 0) {
  const totalPnL = system.trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  console.log('\\nTotal PnL:', (totalPnL * 100).toFixed(2) + '%');

  console.log('\\n=== MUESTRA DE TRADES ===');
  for (let i = 0; i < Math.min(5, system.trades.length); i++) {
    const t = system.trades[i];
    console.log(\`Trade \${i+1}: \${t.exitReason}, PnL: \${(t.pnl * 100).toFixed(3)}%, CloseRatio: \${t.closeRatio}\`);
  }
}

console.log('\\nPosiciones abiertas restantes:', system.positions.length);
