import { readFileSync } from 'fs';

const results = JSON.parse(readFileSync('./backtesting/results/backtest_results.json'));

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     RESULTADOS DE BACKTESTING - BTCUSDT 2 AÑOS                ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const systems = Object.values(results);

// Ordenar por total PnL
systems.sort((a, b) => b.totalPnL - a.totalPnL);

console.log(
  'Sistema'.padEnd(20) +
  'Trades'.padStart(10) +
  'Win Rate'.padStart(12) +
  'Total PnL'.padStart(12) +
  'Sharpe'.padStart(10) +
  'Max DD'.padStart(10) +
  'Profit F'.padStart(10)
);

console.log('─'.repeat(84));

for (const system of systems) {
  console.log(
    system.systemName.padEnd(20) +
    system.totalTrades.toString().padStart(10) +
    (system.winRate * 100).toFixed(2) + '%'.padStart(11) +
    (system.totalPnL * 100).toFixed(2) + '%'.padStart(11) +
    system.sharpeRatio.toFixed(2).padStart(10) +
    (system.maxDrawdown * 100).toFixed(2) + '%'.padStart(9) +
    system.profitFactor.toFixed(2).padStart(10)
  );
}

// Mejor sistema
const bestSystem = systems[0];
console.log('\n🏆 MEJOR SISTEMA:', bestSystem.systemName);
console.log(`   Total PnL: ${(bestSystem.totalPnL * 100).toFixed(2)}%`);
console.log(`   Win Rate: ${(bestSystem.winRate * 100).toFixed(2)}%`);
console.log(`   Sharpe Ratio: ${bestSystem.sharpeRatio.toFixed(2)}`);
console.log(`   Max Drawdown: ${(bestSystem.maxDrawdown * 100).toFixed(2)}%`);
console.log(`   Profit Factor: ${bestSystem.profitFactor.toFixed(2)}`);

// Análisis detallado
console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                  ANÁLISIS DETALLADO                          ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

for (const system of systems) {
  if (system.totalTrades === 0) {
    console.log(`📊 ${system.systemName}`);
    console.log(`   ⚠️  NO GENERÓ TRADES (parámetros muy estrictos)`);
    console.log('');
    continue;
  }

  console.log(`📊 ${system.systemName}`);
  console.log(`   Trades Totales: ${system.totalTrades.toLocaleString()}`);
  console.log(`   Trades Ganadores: ${system.winningTrades.toLocaleString()}`);
  console.log(`   Trades Perdedores: ${system.losingTrades.toLocaleString()}`);
  console.log(`   Win Rate: ${(system.winRate * 100).toFixed(2)}%`);
  console.log(`   Profit Factor: ${system.profitFactor.toFixed(2)}`);
  console.log(`   Gross Profit: ${(system.grossProfit * 100).toFixed(2)}%`);
  console.log(`   Gross Loss: ${(system.grossLoss * 100).toFixed(2)}%`);
  console.log(`   Avg PnL por Trade: ${(system.avgPnL * 100).toFixed(4)}%`);
  console.log(`   Max Drawdown: ${(system.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`   Sharpe Ratio: ${system.sharpeRatio.toFixed(2)}`);

  // Exit reasons
  const exitReasons = {};
  for (const trade of system.trades) {
    if (!exitReasons[trade.exitReason]) {
      exitReasons[trade.exitReason] = 0;
    }
    exitReasons[trade.exitReason]++;
  }

  console.log(`   Exit Reasons:`);
  for (const [reason, count] of Object.entries(exitReasons)) {
    const pct = (count / system.totalTrades * 100).toFixed(1);
    console.log(`      ${reason}: ${count.toLocaleString()} (${pct}%)`);
  }

  console.log('');
}

// Ejecutar
showResults();
