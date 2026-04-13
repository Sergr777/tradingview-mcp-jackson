/**
 * Paper Trading con Conexión a TradingView
 * Intenta conectar a TradingView real, fallback a simulación si no disponible
 * Muestra gráfico ASCII con entradas y salidas (SIN indicadores)
 */

import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';

class TradingViewConnected {
  constructor() {
    this.systems = new Map();
    this.trades = [];
    this.priceHistory = [];
    this.running = false;
    this.tickCount = 0;
    this.tvConnected = false;

    // Inicializar sistemas
    this.systems.set('turtle_soup', new TurtleSoupCTR());
    this.systems.set('vwap_bounce', new VWAPBounce());
    this.systems.set('ema_rsi', new EMARSI());

    this.currentData = {
      timestamps: [],
      opens: [],
      highs: [],
      lows: [],
      closes: [],
      volumes: [],
      sma20: [],
      stdDev20: [],
      rsi: [],
      ema8: [],
      vwap: [],
      high20: [],
      low20: []
    };
  }

  // Verificar conexión TradingView
  async checkTradingViewConnection() {
    try {
      const response = await fetch('http://localhost:9222/json/version');
      if (response.ok) {
        const data = await response.json();
        console.log('\n✅ TradingView Detectado:');
        console.log(`   Browser: ${data['Browser'] || 'Unknown'}`);
        console.log(`   CDP Port: 9222`);
        this.tvConnected = true;
        return true;
      }
    } catch (error) {
      console.log('\n⚠️  TradingView Desktop NO detectado');
      console.log('   Usando datos simulados...\n');
      this.tvConnected = false;
      return false;
    }
  }

  // Generar gráfico ASCII
  generateChart() {
    if (this.priceHistory.length < 20) {
      return 'Generando datos...';
    }

    const width = 80;
    const height = 20;
    const recentPrices = this.priceHistory.slice(-width);

    // Encontrar min/max
    const minPrice = Math.min(...recentPrices);
    const maxPrice = Math.max(...recentPrices);
    const priceRange = maxPrice - minPrice;

    // Crear array para el gráfico
    const chart = [];
    for (let y = 0; y < height; y++) {
      chart[y] = Array(width).fill(' ');
    }

    // Mapear precios
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

    // Convertir a string
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

    // Leyenda
    chartStr += '\n📊 Leyenda:\n';
    chartStr += '   ● = Entrada (LONG/SHORT)\n';
    chartStr += '   ○ = Salida (Take Profit/Stop Loss)\n';
    chartStr += '   ┼ = Precio actual\n';

    return chartStr;
  }

  // Calcular SMA
  calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        sma.push(null);
        continue;
      }
      const slice = data.slice(i - period + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  calculateStdDev(data, period) {
    const stdDev = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        stdDev.push(null);
        continue;
      }
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
      stdDev.push(Math.sqrt(variance));
    }
    return stdDev;
  }

  calculateRSI(data, period) {
    const rsi = [];
    let gains = 0;
    let losses = 0;

    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        rsi.push(null);
        continue;
      }

      if (i === period) {
        for (let j = 1; j <= period; j++) {
          const change = data[i - j] - data[i - j - 1];
          if (change > 0) gains += change;
          else losses -= change;
        }
      } else {
        const change = data[i] - data[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }

      if (losses === 0) {
        rsi.push(100);
      } else {
        const rs = gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
    return rsi;
  }

  calculateEMA(data, period) {
    const ema = [];
    const multiplier = 2 / (period + 1);

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        ema.push(null);
        continue;
      }

      if (i === period - 1) {
        const slice = data.slice(0, period);
        const sma = slice.reduce((a, b) => a + b, 0) / period;
        ema.push(sma);
      } else {
        const currentEma = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
        ema.push(currentEma);
      }
    }
    return ema;
  }

  calculateVWAP(ohlcvData) {
    const vwap = [];
    let cumulativeTP = 0;
    let cumulativeVolume = 0;

    for (let i = 0; i < ohlcvData.closes.length; i++) {
      const typicalPrice = (ohlcvData.highs[i] + ohlcvData.lows[i] + ohlcvData.closes[i]) / 3;
      cumulativeTP += typicalPrice * (ohlcvData.volumes[i] || 0);
      cumulativeVolume += ohlcvData.volumes[i] || 0;

      if (cumulativeVolume > 0) {
        vwap.push(cumulativeTP / cumulativeVolume);
      } else {
        vwap.push(null);
      }
    }
    return vwap;
  }

  calculateHigh20(data, period) {
    const high20 = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        high20.push(null);
        continue;
      }
      const slice = data.slice(i - period + 1, i + 1);
      high20.push(Math.max(...slice));
    }
    return high20;
  }

  calculateLow20(data, period) {
    const low20 = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        low20.push(null);
        continue;
      }
      const slice = data.slice(i - period + 1, i + 1);
      low20.push(Math.min(...slice));
    }
    return low20;
  }

  // Generar datos iniciales simulados
  generateInitialData() {
    const numCandles = 50;
    const basePrice = 65000;

    for (let i = 0; i < numCandles; i++) {
      const change = (Math.random() - 0.5) * 0.02;
      const price = basePrice * (1 + change);

      this.currentData.timestamps.push(Date.now() - (numCandles - i) * 60000);
      this.currentData.opens.push(price);
      this.currentData.highs.push(price * 1.005);
      this.currentData.lows.push(price * 0.995);
      this.currentData.closes.push(price * (1 + (Math.random() - 0.5) * 0.005));
      this.currentData.volumes.push(1000 + Math.random() * 1000);

      this.priceHistory.push(this.currentData.closes[this.currentData.closes.length - 1]);
    }

    // Calcular indicadores
    this.currentData.sma20 = this.calculateSMA(this.currentData.closes, 20);
    this.currentData.stdDev20 = this.calculateStdDev(this.currentData.closes, 20);
    this.currentData.rsi = this.calculateRSI(this.currentData.closes, 14);
    this.currentData.ema8 = this.calculateEMA(this.currentData.closes, 8);
    this.currentData.vwap = this.calculateVWAP(this.currentData);
    this.currentData.high20 = this.calculateHigh20(this.currentData.highs, 20);
    this.currentData.low20 = this.calculateLow20(this.currentData.lows, 20);
  }

  // Simular siguiente tick
  simulateNextTick() {
    const lastPrice = this.currentData.closes[this.currentData.closes.length - 1];
    const lastTimestamp = this.currentData.timestamps[this.currentData.timestamps.length - 1];

    const change = (Math.random() - 0.5) * 0.002;
    const newPrice = lastPrice * (1 + change);
    const newTimestamp = lastTimestamp + 10000;

    this.currentData.timestamps.push(newTimestamp);
    this.currentData.opens.push(newPrice);
    this.currentData.highs.push(newPrice * 1.0005);
    this.currentData.lows.push(newPrice * 0.9995);
    this.currentData.closes.push(newPrice);
    this.currentData.volumes.push(1000 + Math.random() * 500);

    this.priceHistory.push(newPrice);

    // Recalcular indicadores
    this.currentData.sma20 = this.calculateSMA(this.currentData.closes, 20);
    this.currentData.stdDev20 = this.calculateStdDev(this.currentData.closes, 20);
    this.currentData.rsi = this.calculateRSI(this.currentData.closes, 14);
    this.currentData.ema8 = this.calculateEMA(this.currentData.closes, 8);
    this.currentData.vwap = this.calculateVWAP(this.currentData);
    this.currentData.high20 = this.calculateHigh20(this.currentData.highs, 20);
    this.currentData.low20 = this.calculateLow20(this.currentData.lows, 20);

    // Mantener solo últimos 100
    if (this.currentData.closes.length > 100) {
      for (const key of Object.keys(this.currentData)) {
        this.currentData[key].shift();
      }
    }
  }

  // Detectar señales
  detectSignals() {
    const signals = [];
    const currentIndex = this.currentData.closes.length - 1;

    if (currentIndex < 20) return signals;

    for (const [systemName, system] of this.systems) {
      try {
        const signal = system.detect(this.currentData, currentIndex);
        if (signal) {
          signals.push({
            ...signal,
            systemName,
            timestamp: this.currentData.timestamps[currentIndex],
            price: this.currentData.closes[currentIndex]
          });
        }
      } catch (error) {
        // Silenciar errores
      }
    }

    return signals;
  }

  // Ejecutar trade
  executeTrade(signal) {
    const system = this.systems.get(signal.systemName);
    if (!system) return null;

    const trade = system.execute(signal, this.currentData, this.currentData.closes.length - 1);

    if (trade) {
      this.trades.push({
        ...trade,
        systemName: signal.systemName,
        timestamp: signal.timestamp,
        entryPrice: signal.entry
      });

      console.log('\n🎯 ╔══════════════════════════════════════════════════════════╗');
      console.log(`🎯  📈 ENTRADA EJECUTADA - ${signal.systemName.toUpperCase()}`);
      console.log('🎯 ╚══════════════════════════════════════════════════════════╝');
      console.log(`   Tipo:        ${signal.type}`);
      console.log(`   Precio:       $${signal.entry.toFixed(2)}`);
      console.log(`   Stop Loss:    $${signal.stop.toFixed(2)}`);
      console.log(`   Take Profit:  $${signal.target.toFixed(2)}`);
      console.log(`   Confianza:    ${(signal.confidence * 100).toFixed(0)}%`);
      console.log(`   Razón:       ${signal.reason}`);
    }

    return trade;
  }

  // Gestionar posiciones
  managePositions() {
    const currentIndex = this.currentData.closes.length - 1;

    for (const [systemName, system] of this.systems) {
      try {
        system.managePositions(this.currentData, currentIndex);

        for (const trade of system.trades) {
          if (!this.trades.find(t => t.entryTime === trade.entryTime)) {
            this.trades.push({
              ...trade,
              systemName
            });

            const pnlPct = (trade.pnl * 100).toFixed(2);
            const pnlEmoji = trade.pnl > 0 ? '💰' : '📉';

            console.log('\n✅ ╔══════════════════════════════════════════════════════════╗');
            console.log(`✅  📊 SALIDA EJECUTADA - ${systemName.toUpperCase()}`);
            console.log('✅ ╚══════════════════════════════════════════════════════════╝');
            console.log(`   Tipo:        ${trade.type}`);
            console.log(`   Entrada:     $${trade.entryPrice.toFixed(2)}`);
            console.log(`   Salida:      $${trade.exitPrice.toFixed(2)}`);
            console.log(`   PnL:         ${pnlEmoji} ${pnlPct}%`);
            console.log(`   Razón:       ${trade.exitReason}`);
          }
        }
      } catch (error) {
        // Silenciar errores
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
    console.log('║     📈 PAPER TRADING - TRADINGVIEW CONNECTED                   ║');
    console.log('║     Solo Price Action - Sin Indicadores Técnicos                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Verificar conexión TradingView
    await this.checkTradingViewConnection();

    if (this.tvConnected) {
      console.log('⚠️  NOTA: La integración con TradingView MCP requiere configuración adicional');
      console.log('   Por ahora, usando datos simulados...\n');
    }

    console.log('⚙️  Sistemas Activos:');
    console.log('   • Turtle Soup CTR - Falsas rupturas');
    console.log('   • VWAP Bounce - Rebotes en VWAP');
    console.log('   • EMA+RSI - Momentum con cruce');

    console.log('\n📊 Generando datos históricos iniciales...');
    this.generateInitialData();
    console.log(`   ${this.currentData.closes.length} candles generados`);

    console.log('\n🔄 Iniciando loop de paper trading...');
    console.log('⏳  Presiona Ctrl+C para detener\n');

    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }

      this.tickCount++;
      const currentTime = new Date(this.currentData.timestamps[this.currentData.timestamps.length - 1]);
      const currentPrice = this.currentData.closes[this.currentData.closes.length - 1];

      console.clear();
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║     📈 PAPER TRADING VISUAL - GRÁFICO EN TIEMPO REAL             ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log(`\n📊 Tick ${this.tickCount} - ${currentTime.toLocaleTimeString()}`);
      console.log(`   💰 Precio BTC: $${currentPrice.toFixed(2)} | Trades: ${this.trades.length}`);
      console.log(`   ${this.tvConnected ? '✅' : '⚠️'} TradingView: ${this.tvConnected ? 'Conectado' : 'Simulado'}`);

      // Simular siguiente tick
      this.simulateNextTick();

      // Detectar señales
      const signals = this.detectSignals();

      if (signals.length > 0) {
        console.log(`\n🎯 ${signals.length} señal(es) detectada(s):`);
        signals.forEach((signal, i) => {
          this.executeTrade(signal);
        });
      }

      // Gestionar posiciones
      this.managePositions();

      // Mostrar gráfico
      console.log(this.generateChart());

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

      console.log('\n⏳  Actualización automática cada 3 segundos...');
      console.log('    Presiona Ctrl+C para detener');

    }, 3000);
  }

  stop() {
    this.running = false;
    console.log('\n\n✅ Paper trading detenido');
  }
}

// Iniciar trading
const trading = new TradingViewConnected();
trading.start();

process.on('SIGINT', () => {
  trading.stop();
  process.exit(0);
});
