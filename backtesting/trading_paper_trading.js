/**
 * Paper Trading conectado a TradingView - Solo Price Action con Entradas/Salidas
 */

import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';

class TradingViewPaperTrading {
  constructor() {
    this.systems = new Map();
    this.trades = [];
    this.running = false;

    // Inicializar sistemas
    this.systems.set('turtle_soup', new TurtleSoupCTR());
    this.systems.set('vwap_bounce', new VWAPBounce());
    this.systems.set('ema_rsi', new EMARSI());

    // Estado del mercado
    this.currentData = {
      timestamps: [],
      opens: [],
      highs: [],
      lows: [],
      closes: [],
      volumes: [],
      // Indicadores calculados
      sma20: [],
      stdDev20: [],
      rsi: [],
      ema8: [],
      vwap: [],
      high20: [],
      low20: []
    };
  }

  // Formatear datos para sistemas
  formatData(ohlcvData) {
    this.currentData = {
      timestamps: ohlcvData.timestamps || [],
      opens: ohlcvData.opens || [],
      highs: ohlcvData.highs || [],
      lows: ohlcvData.lows || [],
      closes: ohlcvData.closes || [],
      volumes: ohlcvData.volumes || [],
      // Calcular indicadores
      sma20: this.calculateSMA(ohlcvData.closes || [], 20),
      stdDev20: this.calculateStdDev(ohlcvData.closes || [], 20),
      rsi: this.calculateRSI(ohlcvData.closes || [], 14),
      ema8: this.calculateEMA(ohlcvData.closes || [], 8),
      vwap: this.calculateVWAP(ohlcvData),
      high20: this.calculateHigh20(ohlcvData.highs || [], 20),
      low20: this.calculateLow20(ohlcvData.lows || [], 20)
    };
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

  // Calcular Std Dev
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

  // Calcular RSI
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

  // Calcular EMA
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

  // Calcular VWAP
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

  // Calcular High20
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

  // Calcular Low20
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

  // Detectar señales de todos los sistemas
  detectSignals() {
    const signals = [];
    const currentIndex = this.currentData.closes.length - 1;

    if (currentIndex < 20) {
      return signals;
    }

    // Detectar señales de cada sistema
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
        console.error(`Error en ${systemName}:`, error.message);
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

      console.log('\n🎯 TRADE EJECUTADO:');
      console.log(`   Sistema: ${signal.systemName}`);
      console.log(`   Tipo: ${signal.type}`);
      console.log(`   Entrada: ${signal.entry}`);
      console.log(`   Stop: ${signal.stop}`);
      console.log(`   Target: ${signal.target}`);
      console.log(`   Confianza: ${(signal.confidence * 100).toFixed(0)}%`);
      console.log(`   Razón: ${signal.reason}`);
    }

    return trade;
  }

  // Gestionar posiciones abiertas
  managePositions() {
    const currentIndex = this.currentData.closes.length - 1;

    for (const [systemName, system] of this.systems) {
      try {
        system.managePositions(this.currentData, currentIndex);

        // Actualizar trades cerrados
        for (const trade of system.trades) {
          if (!this.trades.find(t => t.entryTime === trade.entryTime)) {
            this.trades.push({
              ...trade,
              systemName
            });

            console.log('\n✅ TRADE CERRADO:');
            console.log(`   Sistema: ${systemName}`);
            console.log(`   Tipo: ${trade.type}`);
            console.log(`   Entrada: ${trade.entryPrice}`);
            console.log(`   Salida: ${trade.exitPrice}`);
            console.log(`   PnL: ${(trade.pnl * 100).toFixed(2)}%`);
            console.log(`   Razón: ${trade.exitReason}`);
          }
        }
      } catch (error) {
        console.error(`Error gestionando ${systemName}:`, error.message);
      }
    }
  }

  // Mostrar resumen de trades
  showTradeSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESUMEN DE TRADES');
    console.log('='.repeat(70));

    const openTrades = this.trades.filter(t => !t.exitTime);
    const closedTrades = this.trades.filter(t => t.exitTime);

    console.log(`\n📈 Trades Abiertos: ${openTrades.length}`);
    openTrades.forEach((trade, i) => {
      console.log(`   ${i + 1}. ${trade.systemName} ${trade.type} @ ${trade.entryPrice}`);
    });

    console.log(`\n📊 Trades Cerrados: ${closedTrades.length}`);
    if (closedTrades.length > 0) {
      const winRate = (closedTrades.filter(t => t.pnl > 0).length / closedTrades.length * 100).toFixed(1);
      const avgPnL = (closedTrades.reduce((a, t) => a + t.pnl, 0) / closedTrades.length * 100).toFixed(2);

      console.log(`   Win Rate: ${winRate}%`);
      console.log(`   PnL Promedio: ${avgPnL}%`);

      const totalPnL = closedTrades.reduce((a, t) => a + t.pnl, 0) * 100;
      console.log(`   PnL Total: ${totalPnL.toFixed(2)}%`);
    }

    // Por sistema
    console.log('\n📋 Por Sistema:');
    const bySystem = {};
    closedTrades.forEach(trade => {
      if (!bySystem[trade.systemName]) {
        bySystem[trade.systemName] = { count: 0, wins: 0, totalPnL: 0 };
      }
      bySystem[trade.systemName].count++;
      if (trade.pnl > 0) bySystem[trade.systemName].wins++;
      bySystem[trade.systemName].totalPnL += trade.pnl * 100;
    });

    for (const [system, stats] of Object.entries(bySystem)) {
      const wr = (stats.wins / stats.count * 100).toFixed(1);
      console.log(`   ${system}: ${stats.count} trades, WR: ${wr}%, PnL: ${stats.totalPnL.toFixed(2)}%`);
    }

    console.log('='.repeat(70));
  }

  // Simular datos iniciales
  generateInitialData() {
    const numCandles = 50;
    const basePrice = 65000; // BTC

    for (let i = 0; i < numCandles; i++) {
      const change = (Math.random() - 0.5) * 0.02; // ±1% volatilidad
      const price = basePrice * (1 + change);

      this.currentData.timestamps.push(Date.now() - (numCandles - i) * 60000);
      this.currentData.opens.push(price);
      this.currentData.highs.push(price * 1.005);
      this.currentData.lows.push(price * 0.995);
      this.currentData.closes.push(price * (1 + (Math.random() - 0.5) * 0.005));
      this.currentData.volumes.push(1000 + Math.random() * 1000);
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

    // Simular movimiento aleatorio pequeño
    const change = (Math.random() - 0.5) * 0.002; // ±0.1%
    const newPrice = lastPrice * (1 + change);
    const newTimestamp = lastTimestamp + 10000; // +10 segundos

    // Agregar nuevo candle
    this.currentData.timestamps.push(newTimestamp);
    this.currentData.opens.push(newPrice);
    this.currentData.highs.push(newPrice * 1.0005);
    this.currentData.lows.push(newPrice * 0.9995);
    this.currentData.closes.push(newPrice);
    this.currentData.volumes.push(1000 + Math.random() * 500);

    // Recalcular indicadores
    this.currentData.sma20 = this.calculateSMA(this.currentData.closes, 20);
    this.currentData.stdDev20 = this.calculateStdDev(this.currentData.closes, 20);
    this.currentData.rsi = this.calculateRSI(this.currentData.closes, 14);
    this.currentData.ema8 = this.calculateEMA(this.currentData.closes, 8);
    this.currentData.vwap = this.calculateVWAP(this.currentData);
    this.currentData.high20 = this.calculateHigh20(this.currentData.highs, 20);
    this.currentData.low20 = this.calculateLow20(this.currentData.lows, 20);

    // Mantener solo últimos 100 candles
    if (this.currentData.closes.length > 100) {
      for (const key of Object.keys(this.currentData)) {
        this.currentData[key].shift();
      }
    }
  }

  // Loop principal de trading
  async start() {
    this.running = true;
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     🚀 PAPER TRADING - SOLO PRICE ACTION                       ║');
    console.log('║     Mostrando solo gráfico con entradas y salidas               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log('\n⚙️  Sistemas Activos:');
    console.log('   • Turtle Soup CTR - Falsas rupturas');
    console.log('   • VWAP Bounce - Rebotes en VWAP');
    console.log('   • EMA+RSI - Momentum con cruce');

    console.log('\n📊 Generando datos históricos iniciales...');
    this.generateInitialData();
    console.log(`   ${this.currentData.closes.length} candles generados`);

    console.log('\n🔄 Iniciando loop de paper trading...');
    console.log('⏳  Presiona Ctrl+C para detener\n');

    let tickCount = 0;

    const interval = setInterval(async () => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }

      tickCount++;
      const currentTime = new Date(this.currentData.timestamps[this.currentData.timestamps.length - 1]);
      console.log(`\n📊 Tick ${tickCount} - ${currentTime.toLocaleTimeString()}`);
      console.log(`   Precio actual: ${this.currentData.closes[this.currentData.closes.length - 1].toFixed(2)}`);

      // Simular siguiente tick
      this.simulateNextTick();

      // Detectar señales
      const signals = this.detectSignals();

      if (signals.length > 0) {
        console.log(`\n🎯 ${signals.length} señales detectadas:`);
        signals.forEach((signal, i) => {
          console.log(`   ${i + 1}. ${signal.systemName} ${signal.type} @ ${signal.entry.toFixed(2)}`);

          // Ejecutar trade
          this.executeTrade(signal);
        });
      } else {
        console.log('   ✅ No hay señales en este tick');
      }

      // Gestionar posiciones
      this.managePositions();

      // Mostrar resumen cada 5 ticks
      if (tickCount % 5 === 0) {
        this.showTradeSummary();
      }

    }, 5000); // Cada 5 segundos
  }

  stop() {
    this.running = false;
    console.log('\n\n✅ Paper trading detenido');
    this.showTradeSummary();
  }
}

// Iniciar paper trading
const trading = new TradingViewPaperTrading();

trading.start();

// Manejar Ctrl+C
process.on('SIGINT', () => {
  trading.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  trading.stop();
  process.exit(0);
});
