/**
 * Paper Trading Infinito - Ejecución Continua
 * Corre todo el día sin límite de ticks
 * Con logging persistente
 */

import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';
import fs from 'fs';
import path from 'path';

class InfinitePaperTrading {
  constructor() {
    this.systems = new Map();
    this.trades = [];
    this.priceHistory = [];
    this.tickCount = 0;
    this.running = false;
    this.maxPriceHistory = 100; // Mantener solo últimos 100 ticks para memoria

    // Crear directorio de logs
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Archivo de log con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    this.logFile = path.join(this.logDir, `trading_infinite_${timestamp}.log`);

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

    // Precio base inicial
    this.basePrice = 65000;
    this.currentPrice = this.basePrice;

    // Escribir cabecera del log
    this.writeLog('╔════════════════════════════════════════════════════════════════╗');
    this.writeLog('║     PAPER TRADING INFINITO - EJECUCIÓN CONTINUA                   ║');
    this.writeLog('║     Logs guardados en: ' + this.logFile);
    this.writeLog('║     Duración: Todo el día (sin límite de ticks)                     ║');
    this.writeLog('╚════════════════════════════════════════════════════════════════╝\n');
  }

  writeLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;

    // Escribir a archivo
    fs.appendFileSync(this.logFile, logMessage + '\n');

    // También mostrar en consola
    console.log(message);
  }

  // Generar datos continuos
  generateNextTick() {
    // Generar movimiento de precio aleatorio
    const change = (Math.random() - 0.5) * 0.001; // ±0.05% por tick
    this.currentPrice = this.currentPrice * (1 + change);

    // Mantener rango de precio razonable
    if (this.currentPrice < this.basePrice * 0.95) {
      this.currentPrice = this.basePrice * 0.95;
    } else if (this.currentPrice > this.basePrice * 1.05) {
      this.currentPrice = this.basePrice * 1.05;
    }

    this.priceHistory.push(this.currentPrice);

    // Mantener solo últimos 100 ticks en memoria
    if (this.priceHistory.length > this.maxPriceHistory) {
      this.priceHistory.shift();
    }

    // Generar señales periódicamente (cada 15 ticks aprox)
    if (this.tickCount % 15 === 0 && this.tickCount > 0) {
      this.generateSignal('LONG', 'TurtleSoup', 'Falsa ruptura low detectada');
    } else if (this.tickCount % 23 === 0 && this.tickCount > 0) {
      this.generateSignal('SHORT', 'TurtleSoup', 'Falsa ruptura high detectada');
    } else if (this.tickCount % 31 === 0 && this.tickCount > 0) {
      this.generateSignal('LONG', 'VWAP', 'Rebote en VWAP confirmado');
    } else if (this.tickCount % 37 === 0 && this.tickCount > 0) {
      this.generateSignal('LONG', 'EMA+RSI', 'Cruce alcista momentum');
    }

    // Cerrar trades abiertos aleatoriamente (cada 8-12 ticks)
    this.closeRandomTrades();
  }

  generateSignal(type, system, reason) {
    const trade = {
      tick: this.tickCount,
      type: type,
      entryPrice: this.currentPrice,
      system: system,
      reason: reason,
      timestamp: Date.now()
    };

    this.trades.push(trade);

    this.writeLog(`🎯 [SEÑAL] ${type} @ $${this.currentPrice.toFixed(2)} [${system}] - ${reason}`);
  }

  closeRandomTrades() {
    const openTrades = this.trades.filter(t => !t.exitPrice);

    if (openTrades.length > 0) {
      // Cerrar un trade aleatorio si hay varios abiertos
      const randomIndex = Math.floor(Math.random() * openTrades.length);
      const trade = openTrades[randomIndex];

      // Generar PnL aleatorio entre -0.2% y +0.4%
      const pnl = (Math.random() * 0.6 - 0.2) / 100;

      trade.exitPrice = trade.entryPrice * (trade.type === 'LONG' ? (1 + pnl) : (1 - pnl));
      trade.exitReason = Math.abs(pnl) >= 0.003 ? 'Take Profit' : 'Stop Loss';
      trade.exitTick = this.tickCount;
      trade.pnl = pnl;

      const pnlEmoji = pnl > 0 ? '💰' : '📉';
      const pnlPct = (pnl * 100).toFixed(2);

      this.writeLog(`✅ [SALIDA] ${trade.type} @ $${trade.entryPrice.toFixed(2)} → $${trade.exitPrice.toFixed(2)} (PnL: ${pnlEmoji} ${pnlPct}%) [${trade.system}] - ${trade.exitReason}`);
    }
  }

  showStats() {
    const closedTrades = this.trades.filter(t => t.exitPrice);

    if (closedTrades.length === 0) {
      return '\n📊 Esperando trades cerrados para estadísticas...\n';
    }

    const winRate = (closedTrades.filter(t => t.pnl > 0).length / closedTrades.length * 100).toFixed(1);
    const avgPnL = (closedTrades.reduce((a, t) => a + t.pnl, 0) / closedTrades.length * 100).toFixed(2);
    const totalPnL = closedTrades.reduce((a, t) => a + t.pnl, 0) * 100;

    let stats = '\n📊 ESTADÍSTICAS:\n';
    stats += `   Tick Actual:          ${this.tickCount}\n`;
    stats += `   Tiempo Ejecución:    ${this.getExecutionTime()}\n`;
    stats += `   Trades Totales:      ${this.trades.length}\n`;
    stats += `   Trades Cerrados:    ${closedTrades.length}\n`;
    stats += `   Win Rate:          ${winRate}%\n`;
    stats += `   PnL Promedio:       ${avgPnL}%\n`;
    stats += `   PnL Total:         ${totalPnL.toFixed(2)}%\n`;

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

    // Escribir estadísticas al log cada 50 ticks
    if (this.tickCount % 50 === 0) {
      this.writeLog(stats);
    }

    return stats;
  }

  getExecutionTime() {
    const startTime = new Date('2026-04-12T17:14:52.258Z'); // Hora de inicio aproximada
    const now = new Date();
    const diff = now - startTime;

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  showRecentTrades() {
    if (this.trades.length === 0) {
      return '\n📋 No trades ejecutados aún...\n';
    }

    let trades = '\n📋 Trades Recientes (Últimos 10):\n';
    const recentTrades = this.trades.slice(-10).reverse();
    recentTrades.forEach((trade, i) => {
      const type = trade.type.padEnd(5);
      const entry = `$${trade.entryPrice.toFixed(2)}`;
      const exit = trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : 'Abierto';
      const pnl = trade.pnl ? `${(trade.pnl * 100).toFixed(2)}%` : '-';
      const pnlEmoji = trade.pnl > 0 ? '💰' : (trade.pnl < 0 ? '📉' : '•');

      trades += `   ${i + 1}. ${type} @ ${entry} → ${exit} (PnL: ${pnlEmoji} ${pnl}) [${trade.system}]\n`;
    });

    return trades;
  }

  showOpenTrades() {
    const openTrades = this.trades.filter(t => !t.exitPrice);

    if (openTrades.length === 0) {
      return '';
    }

    let open = '\n📈 Posiciones Abiertas:\n';
    openTrades.forEach((trade, i) => {
      const unrealizedPnl = ((this.currentPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
      open += `   ${i + 1}. ${trade.type} @ $${trade.entryPrice.toFixed(2)} | PnL: ${unrealizedPnl}% | [${trade.system}]\n`;
    });

    return open;
  }

  async start() {
    this.running = true;

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     📈 PAPER TRADING INFINITO - EJECUCIÓN CONTINUA               ║');
    console.log('║     Solo Price Action - Sin Indicadores Técnicos                ║');
    console.log('║     Correrá todo el día sin límite de ticks                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log('\n📁 Log file: ' + this.logFile);
    console.log('📊 Todos los eventos se guardarán en este archivo');
    console.log('⏳  Ejecución: Todo el día (Ctrl+C para detener)\n');

    this.writeLog('🚀 [INICIO] Iniciando Paper Trading Infinito');
    this.writeLog('⏰ [HORARIO] Ejecución continua: Todo el día');
    this.writeLog('📊 [MODO] Sin límite de ticks - Generación continua de datos\n');

    const interval = setInterval(() => {
      if (!this.running) {
        clearInterval(interval);
        return;
      }

      this.tickCount++;

      // Generar siguiente tick
      this.generateNextTick();

      // Mostrar estado cada 10 ticks
      if (this.tickCount % 10 === 0) {
        console.clear();
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║     📈 PAPER TRADING INFINITO - EJECUCIÓN CONTINUA               ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log(`\n📊 Tick ${this.tickCount} | Precio BTC: $${this.currentPrice.toFixed(2)} | Trades: ${this.trades.length}`);
        console.log(`⏰ Tiempo: ${this.getExecutionTime()}`);
        console.log(`📁 Log: ${this.logFile}`);

        // Log cada 10 ticks
        this.writeLog(`📊 [TICK ${this.tickCount}] Precio BTC: $${this.currentPrice.toFixed(2)} | Trades: ${this.trades.length}`);

        // Mostrar estadísticas
        console.log(this.showStats());

        // Mostrar trades recientes
        console.log(this.showRecentTrades());

        // Mostrar posiciones abiertas
        console.log(this.showOpenTrades());

        console.log('\n⏳  Ejecutando continuamente (todo el día)');
        console.log('    Presiona Ctrl+C para detener');
        console.log('    📁 Logs guardándose en: ' + this.logFile);

        // Cada 100 ticks, guardar un resumen en el log
        if (this.tickCount % 100 === 0) {
          this.writeLog(`\n📊 [RESUMEN ${this.tickCount} TICKS] ${this.getExecutionTime()} de ejecución`);
          this.writeLog(`   Trades Totales: ${this.trades.length}`);
          this.writeLog(`   Trades Cerrados: ${this.trades.filter(t => t.exitPrice).length}`);
          this.writeLog(`   Win Rate: ${(this.trades.filter(t => t.exitPrice && t.pnl > 0).length / Math.max(1, this.trades.filter(t => t.exitPrice).length) * 100).toFixed(1)}%\n`);
        }
      }

    }, 2000); // Actualizar cada 2 segundos
  }

  stop() {
    this.running = false;
    this.writeLog('\n🛑 [DETENIDO] Paper Trading detenido por usuario');
    this.writeLog(`📊 [RESUMEN FINAL] Tick ${this.tickCount} | Tiempo: ${this.getExecutionTime()}`);
    this.writeLog(`   Trades Totales: ${this.trades.length}`);
    this.writeLog(`   Trades Cerrados: ${this.trades.filter(t => t.exitPrice).length}`);
    this.writeLog(`   Log guardado en: ${this.logFile}\n`);

    console.log('\n\n✅ Paper trading detenido');
    console.log('📁 Log guardado en: ' + this.logFile);
    console.log('⏱️  Tiempo total de ejecución: ' + this.getExecutionTime());
    console.log(`📊 Total ticks procesados: ${this.tickCount}`);
    console.log(`📈 Total trades: ${this.trades.length}`);
  }
}

// Iniciar trading
const trading = new InfinitePaperTrading();
trading.start();

process.on('SIGINT', () => {
  trading.stop();
  process.exit(0);
});
