/**
 * Paper Trading Demo - Genera señales activas para mostrar entradas/salidas
 */

import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';

class TradingDemo {
  constructor() {
    this.systems = new Map();
    this.trades = [];
    this.tickCount = 0;

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

  // Generar datos que generen señales
  generateDataWithSignals() {
    const numCandles = 50;
    const basePrice = 65000;

    // Generar datos iniciales normales
    for (let i = 0; i < numCandles; i++) {
      const price = basePrice + (Math.random() - 0.5) * 500;

      this.currentData.timestamps.push(Date.now() - (numCandles - i) * 60000);
      this.currentData.opens.push(price);
      this.currentData.highs.push(price + Math.random() * 50);
      this.currentData.lows.push(price - Math.random() * 50);
      this.currentData.closes.push(price + (Math.random() - 0.5) * 20);
      this.currentData.volumes.push(1000 + Math.random() * 500);
    }

    // Calcular indicadores base
    this.currentData.sma20 = this.calculateSMA(this.currentData.closes, 20);
    this.currentData.stdDev20 = this.calculateStdDev(this.currentData.closes, 20);
    this.currentData.rsi = this.calculateRSI(this.currentData.closes, 14);
    this.currentData.ema8 = this.calculateEMA(this.currentData.closes, 8);
    this.currentData.vwap = this.calculateVWAP(this.currentData);
    this.currentData.high20 = this.calculateHigh20(this.currentData.highs, 20);
    this.currentData.low20 = this.calculateLow20(this.currentData.lows, 20);
  }

  // Agregar candle con señal potencial
  addSignalCandle(signalType) {
    const lastPrice = this.currentData.closes[this.currentData.closes.length - 1];
    const lastTimestamp = this.currentData.timestamps[this.currentData.timestamps.length - 1];

    let newPrice, newHigh, newLow, newVolume;

    if (signalType === 'LONG_TURTLE_SOUP') {
      // Falsa ruptura de low - precio baja mucho y luego revierte
      const low20 = this.currentData.low20[this.currentData.low20.length - 1];
      newPrice = low20 - 50; // Rompe el low20
      newHigh = newPrice + 30;
      newLow = newPrice - 10;
      newVolume = 2000; // Alto volumen
    } else if (signalType === 'SHORT_TURTLE_SOUP') {
      // Falsa ruptura de high
      const high20 = this.currentData.high20[this.currentData.high20.length - 1];
      newPrice = high20 + 50; // Rompe el high20
      newHigh = newPrice + 10;
      newLow = newPrice - 30;
      newVolume = 2000;
    } else if (signalType === 'LONG_VWAP') {
      // Rebote desde abajo de VWAP
      const vwap = this.currentData.vwap[this.currentData.vwap.length - 1];
      newPrice = vwap - 10; // Justo abajo del VWAP
      newHigh = newPrice + 20;
      newLow = newPrice - 10;
      newVolume = 1800;
    } else if (signalType === 'SHORT_VWAP') {
      // Rechazo desde arriba de VWAP
      const vwap = this.currentData.vwap[this.currentData.vwap.length - 1];
      newPrice = vwap + 10; // Justo arriba del VWAP
      newHigh = newPrice + 10;
      newLow = newPrice - 20;
      newVolume = 1800;
    } else if (signalType === 'LONG_EMA_RSI') {
      // Cruce alcista
      const ema8 = this.currentData.ema8[this.currentData.ema8.length - 1];
      newPrice = ema8 + 15; // Cruza desde abajo
      newHigh = newPrice + 20;
      newLow = newPrice - 10;
      newVolume = 1500;
    } else if (signalType === 'SHORT_EMA_RSI') {
      // Cruce bajista
      const ema8 = this.currentData.ema8[this.currentData.ema8.length - 1];
      newPrice = ema8 - 15; // Cruza desde arriba
      newHigh = newPrice + 10;
      newLow = newPrice - 20;
      newVolume = 1500;
    } else {
      // Movimiento normal
      newPrice = lastPrice + (Math.random() - 0.5) * 50;
      newHigh = newPrice + 25;
      newLow = newPrice - 25;
      newVolume = 1000 + Math.random() * 500;
    }

    const newTimestamp = lastTimestamp + 10000; // +10 segundos

    this.currentData.timestamps.push(newTimestamp);
    this.currentData.opens.push(newPrice);
    this.currentData.highs.push(newHigh);
    this.currentData.lows.push(newLow);
    this.currentData.closes.push(newPrice);
    this.currentData.volumes.push(newVolume);

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
        // Silenciar errores de detección
      }
    }

    return signals;
  }

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
      console.log(`   Stop Loss:    $${signal.stop.toFixed(2)} (${((signal.stop - signal.entry) / signal.entry * 100).toFixed(2)}%)`);
      console.log(`   Take Profit:  $${signal.target.toFixed(2)} (${((signal.target - signal.entry) / signal.entry * 100).toFixed(2)}%)`);
      console.log(`   Confianza:    ${(signal.confidence * 100).toFixed(0)}%`);
      console.log(`   Razón:       ${signal.reason}`);
    }

    return trade;
  }

  managePositions() {
    const currentIndex = this.currentData.closes.length - 1;

    for (const [systemName, system] of this.systems) {
      try {
        const positionsBefore = system.positions.length;
        system.managePositions(this.currentData, currentIndex);

        // Verificar si se cerraron posiciones
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
            console.log(`   Duración:    ${trade.duration} ticks`);
          }
        }
      } catch (error) {
        // Silenciar errores
      }
    }
  }

  showTradeSummary() {
    const openTrades = this.trades.filter(t => !t.exitTime);
    const closedTrades = this.trades.filter(t => t.exitTime);

    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 RESUMEN DE TRADING - PAPER TRADING');
    console.log('═'.repeat(70));

    console.log(`\n📈 Trades Abiertos: ${openTrades.length}`);
    if (openTrades.length > 0) {
      openTrades.forEach((trade, i) => {
        const currentPnl = ((this.currentData.closes[this.currentData.closes.length - 1] - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
        console.log(`   ${i + 1}. ${trade.systemName} ${trade.type} @ $${trade.entryPrice.toFixed(2)} (PnL: ${currentPnl}%)`);
      });
    }

    console.log(`\n📊 Trades Cerrados: ${closedTrades.length}`);
    if (closedTrades.length > 0) {
      const winRate = (closedTrades.filter(t => t.pnl > 0).length / closedTrades.length * 100).toFixed(1);
      const avgPnL = (closedTrades.reduce((a, t) => a + t.pnl, 0) / closedTrades.length * 100).toFixed(2);
      const totalPnL = closedTrades.reduce((a, t) => a + t.pnl, 0) * 100;

      console.log(`   ✅ Win Rate:    ${winRate}%`);
      console.log(`   📈 PnL Promedio: ${avgPnL}%`);
      console.log(`   💰 PnL Total:   ${totalPnL.toFixed(2)}%`);
    }

    // Por sistema
    console.log('\n📋 Rendimiento por Sistema:');
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
      const pnl = stats.totalPnL.toFixed(2);
      console.log(`   • ${system.padEnd(20)} ${stats.count} trades | WR: ${wr}% | PnL: ${pnl}%`);
    }

    console.log('═'.repeat(70));
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          🚀 PAPER TRADING DEMO - ENTRADAS Y SALIDAS               ║');
    console.log('║          Solo Price Action - Sin Indicadores Visuales               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log('\n⚙️  Sistemas Activos:');
    console.log('   • Turtle Soup CTR - Falsas rupturas');
    console.log('   • VWAP Bounce - Rebotes en VWAP');
    console.log('   • EMA+RSI - Momentum con cruce');

    console.log('\n📊 Generando datos históricos...');
    this.generateDataWithSignals();
    console.log(`   ${this.currentData.closes.length} candles listos`);

    console.log('\n🔄 Iniciando demo de trading...');
    console.log('   Generando señales de ejemplo para mostrar entradas/salidas');
    console.log('⏳  Se detendrá automáticamente después de 30 ticks\n');

    // Secuencia de señales predefinidas
    const signalSequence = [
      'LONG_TURTLE_SOUP',
      'normal',
      'normal',
      'SHORT_VWAP',
      'normal',
      'LONG_EMA_RSI',
      'normal',
      'SHORT_TURTLE_SOUP',
      'LONG_VWAP',
      'normal',
      'SHORT_EMA_RSI',
      'normal',
      'normal',
      'LONG_TURTLE_SOUP',
      'SHORT_VWAP',
      'LONG_EMA_RSI'
    ];

    let signalIndex = 0;

    const interval = setInterval(() => {
      this.tickCount++;
      const currentTime = new Date(this.currentData.timestamps[this.currentData.timestamps.length - 1]);
      const currentPrice = this.currentData.closes[this.currentData.closes.length - 1];

      console.log(`\n📊 Tick ${this.tickCount} - ${currentTime.toLocaleTimeString()}`);
      console.log(`   💰 Precio BTC: $${currentPrice.toFixed(2)}`);

      // Agregar candle según secuencia
      if (signalIndex < signalSequence.length) {
        const signalType = signalSequence[signalIndex];
        console.log(`   📊 Patrón: ${signalType}`);
        this.addSignalCandle(signalType);
        signalIndex++;
      } else {
        this.addSignalCandle('normal');
      }

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

      // Mostrar resumen cada 5 ticks
      if (this.tickCount % 5 === 0 || this.tickCount === 30) {
        this.showTradeSummary();
      }

      // Detener después de 30 ticks
      if (this.tickCount >= 30) {
        clearInterval(interval);
        console.log('\n\n✅ Demo completada - 30 ticks procesados');
        this.showTradeSummary();
        console.log('\n🎯 El paper trading seguirá corriendo en segundo plano...');
        console.log('   Puedes ver más trades dejándolo correr más tiempo.');
      }

    }, 2000); // Cada 2 segundos
  }
}

// Iniciar demo
const demo = new TradingDemo();
demo.start();

process.on('SIGINT', () => {
  console.log('\n\n✅ Demo detenida por usuario');
  process.exit(0);
});
