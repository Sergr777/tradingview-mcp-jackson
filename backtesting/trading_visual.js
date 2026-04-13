/**
 * Paper Trading Visual - Gráfico ASCII con Entradas/Salidas
 * Solo Price Action - Sin Indicadores
 */

class VisualPaperTrading {
  constructor() {
    this.trades = [];
    this.priceHistory = [];
    this.tickCount = 0;
    this.running = false;
  }

  // Generar gráfico ASCII del precio con trades
  generateChartWithTrades() {
    if (this.priceHistory.length < 20) {
      return 'Generando datos...';
    }

    const width = 80;
    const height = 20;
    const recentPrices = this.priceHistory.slice(-width);

    // Encontrar min/max para escalar
    const minPrice = Math.min(...recentPrices);
    const maxPrice = Math.max(...recentPrices);
    const priceRange = maxPrice - minPrice;

    // Crear array para el gráfico
    const chart = [];
    for (let y = 0; y < height; y++) {
      chart[y] = Array(width).fill(' ');
    }

    // Mapear precios al gráfico
    recentPrices.forEach((price, x) => {
      const normalizedY = (price - minPrice) / priceRange;
      const y = Math.floor((1 - normalizedY) * (height - 1));
      if (y >= 0 && y < height) {
        chart[y][x] = '┼';
      }
    });

    // Marcar entradas y salidas
    this.trades.forEach(trade => {
      const tradeIndex = this.priceHistory.indexOf(trade.entryPrice);
      if (tradeIndex >= 0 && tradeIndex < this.priceHistory.length) {
        const price = trade.entryPrice;
        const normalizedY = (price - minPrice) / priceRange;
        const y = Math.floor((1 - normalizedY) * (height - 1));

        if (y >= 0 && y < height) {
          const char = trade.exitPrice ? '○' : '●'; // ● = entrada, ○ = salida
          chart[y][tradeIndex] = char;
        }
      }
    });

    // Convertir array a string
    let chartStr = '\n';
    chartStr += '┌' + '─'.repeat(width - 2) + '┐ Precio BTC (últimos ' + width + ' ticks)\n';

    for (let y = 0; y < height; y++) {
      chartStr += '│' + chart[y].join('') + '│';

      // Agregar etiquetas de precio en los extremos
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

    // Leyenda
    chartStr += '\n📊 Leyenda:\n';
    chartStr += '   ● = Entrada (LONG/SHORT)\n';
    chartStr += '   ○ = Salida (Take Profit/Stop Loss)\n';
    chartStr += '   ┼ = Precio actual\n';

    // Lista de trades recientes
    if (this.trades.length > 0) {
      chartStr += '\n📋 Trades Recientes:\n';
      const recentTrades = this.trades.slice(-10).reverse();
      recentTrades.forEach((trade, i) => {
        const type = trade.type.padEnd(5);
        const entry = `$${trade.entryPrice.toFixed(2)}`;
        const exit = trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : 'Abierto';
        const pnl = trade.pnl ? `${(trade.pnl * 100).toFixed(2)}%` : '-';

        chartStr += `   ${i + 1}. ${type} @ ${entry} → ${exit} (PnL: ${pnl})\n`;
      });
    }

    return chartStr;
  }

  // Generar datos de mercado con señales
  generateMarketWithSignals() {
    const signals = [
      { tick: 5, type: 'LONG', price: 65000, system: 'TurtleSoup', reason: 'Falsa ruptura low' },
      { tick: 10, type: 'SHORT', price: 65200, system: 'VWAP', reason: 'Rechazo VWAP' },
      { tick: 15, type: 'LONG', price: 64800, system: 'EMA+RSI', reason: 'Cruce alcista' },
      { tick: 18, type: 'SHORT', price: 65150, system: 'TurtleSoup', reason: 'Falsa ruptura high' },
      { tick: 22, type: 'LONG', price: 64900, system: 'VWAP', reason: 'Rebote VWAP' },
      { tick: 28, type: 'LONG', price: 65300, system: 'EMA+RSI', reason: 'Momentum alcista' }
    ];

    const exits = [
      { tick: 9, tradeIndex: 0, exitPrice: 65100, reason: 'Take Profit' },
      { tick: 14, tradeIndex: 1, exitPrice: 65000, reason: 'Stop Loss' },
      { tick: 20, tradeIndex: 2, exitPrice: 65000, reason: 'Take Profit' },
      { tick: 25, tradeIndex: 3, exitPrice: 64950, reason: 'Stop Loss' },
      { tick: 30, tradeIndex: 4, exitPrice: 65050, reason: 'Take Profit' }
    ];

    let basePrice = 64800;

    for (let i = 0; i < 35; i++) {
      // Generar precio
      const signal = signals.find(s => s.tick === i);
      const exit = exits.find(e => e.tick === i);

      if (signal) {
        basePrice = signal.price;
      } else {
        // Movimiento aleatorio pequeño
        basePrice += (Math.random() - 0.5) * 100;
      }

      this.priceHistory.push(basePrice);

      // Procesar entrada
      if (signal) {
        this.trades.push({
          tick: i,
          type: signal.type,
          entryPrice: signal.price,
          system: signal.system,
          reason: signal.reason,
          timestamp: Date.now()
        });
      }

      // Procesar salida
      if (exit) {
        const trade = this.trades[exit.tradeIndex];
        if (trade) {
          trade.exitPrice = exit.exitPrice;
          trade.exitReason = exit.reason;
          trade.exitTick = i;

          const pnl = trade.type === 'LONG'
            ? (exit.exitPrice - trade.entryPrice) / trade.entryPrice
            : (trade.entryPrice - exit.exitPrice) / trade.entryPrice;

          trade.pnl = pnl;
        }
      }
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

    // Por sistema
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
    console.log('║     📈 PAPER TRADING VISUAL - GRÁFICO CON ENTRADAS/SALIDAS        ║');
    console.log('║     Solo Price Action - Sin Indicadores Técnicos                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log('\n📊 Generando datos de mercado con trades de ejemplo...');

    // Generar datos
    this.generateMarketWithSignals();

    console.log(`   ${this.priceHistory.length} ticks generados`);
    console.log(`   ${this.trades.length} trades ejecutados`);

    // Mostrar loop
    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }

      this.tickCount++;
      const currentPrice = this.priceHistory[this.priceHistory.length - 1];

      console.clear();
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║     📈 PAPER TRADING VISUAL - GRÁFICO EN TIEMPO REAL                   ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log(`\n📊 Tick ${this.tickCount}/35 | Precio BTC: $${currentPrice.toFixed(2)} | Trades: ${this.trades.length}`);

      // Mostrar gráfico
      console.log(this.generateChartWithTrades());

      // Mostrar estadísticas
      console.log(this.showStats());

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

      if (this.tickCount >= 35) {
        clearInterval(interval);
        this.running = false;
        console.log('\n\n✅ Demo completada');
      }

    }, 2000);
  }

  stop() {
    this.running = false;
    console.log('\n\n✅ Paper trading detenido');
  }
}

// Iniciar trading visual
const trading = new VisualPaperTrading();
trading.start();

process.on('SIGINT', () => {
  trading.stop();
  process.exit(0);
});
