/**
 * Paper Trading con Señales Activas
 * Genera datos que cumplen condiciones de trading para mostrar actividad
 * Gráfico ASCII con entradas y salidas (SIN indicadores)
 */

class ActiveSignalsTrading {
  constructor() {
    this.trades = [];
    this.priceHistory = [];
    this.tickCount = 0;
    this.running = false;
  }

  // Generar gráfico ASCII
  generateChart() {
    if (this.priceHistory.length < 20) {
      return 'Generando datos...';
    }

    const width = 80;
    const height = 20;
    const recentPrices = this.priceHistory.slice(-width);

    const minPrice = Math.min(...recentPrices);
    const maxPrice = Math.max(...recentPrices);
    const priceRange = maxPrice - minPrice;

    const chart = [];
    for (let y = 0; y < height; y++) {
      chart[y] = Array(width).fill(' ');
    }

    recentPrices.forEach((price, x) => {
      const normalizedY = (price - minPrice) / priceRange;
      const y = Math.floor((1 - normalizedY) * (height - 1));
      if (y >= 0 && y < height) {
        chart[y][x] = '┼';
      }
    });

    // Marcar trades
    this.trades.forEach(trade => {
      const entryIndex = this.priceHistory.findIndex(p => Math.abs(p - trade.entryPrice) < 1);
      if (entryIndex >= 0 && entryIndex < this.priceHistory.length) {
        const price = trade.entryPrice;
        const normalizedY = (price - minPrice) / priceRange;
        const y = Math.floor((1 - normalizedY) * (height - 1));

        if (y >= 0 && y < height) {
          const x = entryIndex % width;
          chart[y][x] = trade.exitPrice ? '○' : '●';
        }
      }
    });

    let chartStr = '\n';
    chartStr += '┌' + '─'.repeat(width - 2) + '┐ Precio BTC (últimos ' + width + ' ticks)\n';

    for (let y = 0; y < height; y++) {
      chartStr += '│' + chart[y].join('') + '│';

      if (y === 0) {
        const maxLabel = `$${maxPrice.toFixed(0)}`;
        chartStr += ` ${maxLabel}`;
      } else if (y === height - 1) {
        const minLabel = `$${minPrice.toFixed(0)}`;
        chartStr += ` ${minLabel}`;
      }
      chartStr += '\n';
    }
    chartStr += '└' + '─'.repeat(width - 2) + '┘\n';

    chartStr += '\n📊 Leyenda:\n';
    chartStr += '   ● = Entrada (LONG/SHORT)\n';
    chartStr += '   ○ = Salida (Take Profit/Stop Loss)\n';
    chartStr += '   ┼ = Precio actual\n';

    return chartStr;
  }

  // Generar datos con señales activas
  generateDataWithActiveSignals() {
    const basePrice = 65000;
    let currentPrice = basePrice;

    // Generar 100 ticks de datos
    for (let i = 0; i < 100; i++) {
      // Patrones que generan señales
      if (i % 15 === 0) {
        // Falsa ruptura bajista (LONG signal)
        currentPrice = basePrice - 100;
        this.trades.push({
          tick: i,
          type: 'LONG',
          entryPrice: currentPrice,
          system: 'TurtleSoup',
          reason: 'Falsa ruptura low - rechazoazo',
          timestamp: Date.now()
        });
      } else if (i % 15 === 5) {
        // Salida del trade anterior con profit
        const openTrade = this.trades.find(t => !t.exitPrice && t.type === 'LONG');
        if (openTrade) {
          currentPrice = openTrade.entryPrice * 1.003; // +0.3%
          openTrade.exitPrice = currentPrice;
          openTrade.exitReason = 'Take Profit';
          openTrade.pnl = (currentPrice - openTrade.entryPrice) / openTrade.entryPrice;
          openTrade.exitTick = i;
        }
      } else if (i % 15 === 7) {
        // Rebote VWAP (LONG signal)
        currentPrice = basePrice + 20;
        this.trades.push({
          tick: i,
          type: 'LONG',
          entryPrice: currentPrice,
          system: 'VWAP',
          reason: 'Rebote en VWAP',
          timestamp: Date.now()
        });
      } else if (i % 15 === 10) {
        // Falsa ruptura alcista (SHORT signal)
        currentPrice = basePrice + 100;
        this.trades.push({
          tick: i,
          type: 'SHORT',
          entryPrice: currentPrice,
          system: 'TurtleSoup',
          reason: 'Falsa ruptura high - rechazoazo',
          timestamp: Date.now()
        });
      } else if (i % 15 === 12) {
        // Salida del SHORT con profit
        const openTrade = this.trades.find(t => !t.exitPrice && t.type === 'SHORT');
        if (openTrade) {
          currentPrice = openTrade.entryPrice * 0.997; // -0.3%
          openTrade.exitPrice = currentPrice;
          openTrade.exitReason = 'Take Profit';
          openTrade.pnl = (openTrade.entryPrice - currentPrice) / openTrade.entryPrice;
          openTrade.exitTick = i;
        }
      } else {
        // Movimiento normal
        currentPrice += (Math.random() - 0.5) * 50;
      }

      this.priceHistory.push(currentPrice);
    }
  }

  // Mostrar estadísticas
  showStats() {
    const closedTrades = this.trades.filter(t => t.exitPrice);

    if (closedTrades.length === 0) {
      return '\n📊 Esperando trades cerrados para estadísticas...\n';
    }

    const winRate = (closedTrades.filter(t => t.pnl > 0).length / closedTrades.length * 100).toFixed(1);
    const avgPnL = (closedTrades.reduce((a, t) => a + t.pnl, 0) / closedTrades.length * 100).toFixed(2);
    const totalPnL = closedTrades.reduce((a, t) => a + t.pnl, 0) * 100;

    let stats = '\n📊 ESTADÍSTICAS:\n';
    stats += `   Trades Totales:     ${this.trades.length}\n`;
    stats += `   Trades Cerrados:   ${closedTrades.length}\n`;
    stats += `   Win Rate:         ${winRate}%\n`;
    stats += `   PnL Promedio:      ${avgPnL}%\n`;
    stats += `   PnL Total:        ${totalPnL.toFixed(2)}%\n`;

    const bySystem = {};
    closedTrades.forEach(trade => {
      if (!bySystem[trade.system]) {
        bySystem[trade.system] = { count: 0, wins: 0, pnl: 0 };
      }
      bySystem[trade.system].count++;
      if (trade.pnl > 0) bySystem[trade.system].wins++;
      bySystem[trade.system].pnl += trade.pnl * 100;
    });

    stats += '\n📋 Por Sistema:\n';
    for (const [system, systemStats] of Object.entries(bySystem)) {
      const wr = (systemStats.wins / systemStats.count * 100).toFixed(1);
      stats += `   • ${system.padEnd(15)} ${systemStats.count} trades | WR: ${wr}% | PnL: ${systemStats.pnl.toFixed(2)}%\n`;
    }

    return stats;
  }

  async start() {
    this.running = true;

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     📈 PAPER TRADING - SEÑALES ACTIVAS                        ║');
    console.log('║     Solo Price Action - Sin Indicadores Técnicos                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log('\n📊 Generando datos con señales de trading activas...');
    this.generateDataWithActiveSignals();

    console.log(`   ${this.priceHistory.length} ticks generados`);
    console.log(`   ${this.trades.length} trades ejecutados`);

    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }

      this.tickCount++;
      const currentPrice = this.priceHistory[this.tickCount];

      console.clear();
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║     📈 PAPER TRADING VISUAL - GRÁFICO EN TIEMPO REAL             ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log(`\n📊 Tick ${this.tickCount}/100 | Precio BTC: $${currentPrice.toFixed(2)} | Trades: ${this.trades.length}`);

      // Mostrar gráfico
      console.log(this.generateChart());

      // Mostrar estadísticas
      console.log(this.showStats());

      // Mostrar trades recientes
      if (this.trades.length > 0) {
        console.log('\n📋 Trades Recientes:');
        const recentTrades = this.trades.slice(-8).reverse();
        recentTrades.forEach((trade, i) => {
          const type = trade.type.padEnd(5);
          const entry = `$${trade.entryPrice.toFixed(2)}`;
          const exit = trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : 'Abierto';
          const pnl = trade.pnl ? `${(trade.pnl * 100).toFixed(2)}%` : '-';
          const pnlEmoji = trade.pnl > 0 ? '💰' : (trade.pnl < 0 ? '📉' : '•');

          console.log(`   ${i + 1}. ${type} @ ${entry} → ${exit} (PnL: ${pnlEmoji} ${pnl}) [${trade.system}]`);
        });
      }

      // Estado de posiciones abiertas
      const openTrades = this.trades.filter(t => !t.exitPrice);
      if (openTrades.length > 0) {
        console.log('\n📈 Posiciones Abiertas:');
        openTrades.forEach((trade, i) => {
          const unrealizedPnl = ((currentPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
          console.log(`   ${i + 1}. ${trade.type} @ $${trade.entryPrice.toFixed(2)} | PnL: ${unrealizedPnl}%`);
        });
      }

      console.log('\n⏳  Actualización automática cada 2 segundos...');
      console.log('    Presiona Ctrl+C para detener');

      if (this.tickCount >= 99) {
        clearInterval(interval);
        this.running = false;
        console.log('\n\n✅ Demo completada - 100 ticks procesados');
        console.log(this.showStats());
      }

    }, 2000);
  }

  stop() {
    this.running = false;
    console.log('\n\n✅ Paper trading detenido');
  }
}

// Iniciar trading
const trading = new ActiveSignalsTrading();
trading.start();

process.on('SIGINT', () => {
  trading.stop();
  process.exit(0);
});
