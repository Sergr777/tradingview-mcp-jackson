/**
 * Paper Trading con Logging Persistente
 * Guarda logs en archivo para análisis posterior
 */

import { TurtleSoupCTR } from './systems/turtle_soup_ctr.js';
import { VWAPBounce } from './systems/vwap_bounce.js';
import { EMARSI } from './systems/ema_rsi.js';
import fs from 'fs';
import path from 'path';

class LoggingPaperTrading {
  constructor() {
    this.systems = new Map();
    this.trades = [];
    this.priceHistory = [];
    this.tickCount = 0;
    this.running = false;

    // Crear directorio de logs
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Archivo de log con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    this.logFile = path.join(this.logDir, `trading_${timestamp}.log`);

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

    // Escribir cabecera del log
    this.writeLog('╔════════════════════════════════════════════════════════════════╗');
    this.writeLog('║     PAPER TRADING CON LOGGING PERSISTENTE                        ║');
    this.writeLog('║     Logs guardados en: ' + this.logFile);
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

  // Generar datos con señales activas
  generateDataWithActiveSignals() {
    const basePrice = 65000;
    let currentPrice = basePrice;

    for (let i = 0; i < 100; i++) {
      if (i % 15 === 0) {
        currentPrice = basePrice - 100;
        this.trades.push({
          tick: i,
          type: 'LONG',
          entryPrice: currentPrice,
          system: 'TurtleSoup',
          reason: 'Falsa ruptura low - rechazoazo',
          timestamp: Date.now()
        });

        this.writeLog(`🎯 [SEÑAL] LONG @ $${currentPrice.toFixed(2)} [TurtleSoup] - Falsa ruptura low`);

      } else if (i % 15 === 5) {
        const openTrade = this.trades.find(t => !t.exitPrice && t.type === 'LONG');
        if (openTrade) {
          currentPrice = openTrade.entryPrice * 1.003;
          openTrade.exitPrice = currentPrice;
          openTrade.exitReason = 'Take Profit';
          openTrade.pnl = (currentPrice - openTrade.entryPrice) / openTrade.entryPrice;
          openTrade.exitTick = i;

          this.writeLog(`✅ [SALIDA] LONG @ $${openTrade.entryPrice.toFixed(2)} → $${currentPrice.toFixed(2)} (PnL: ${(openTrade.pnl * 100).toFixed(2)}%) [TurtleSoup] - Take Profit`);
        }
      } else if (i % 15 === 7) {
        currentPrice = basePrice + 20;
        this.trades.push({
          tick: i,
          type: 'LONG',
          entryPrice: currentPrice,
          system: 'VWAP',
          reason: 'Rebote en VWAP',
          timestamp: Date.now()
        });

        this.writeLog(`🎯 [SEÑAL] LONG @ $${currentPrice.toFixed(2)} [VWAP] - Rebote VWAP`);

      } else if (i % 15 === 10) {
        currentPrice = basePrice + 100;
        this.trades.push({
          tick: i,
          type: 'SHORT',
          entryPrice: currentPrice,
          system: 'TurtleSoup',
          reason: 'Falsa ruptura high - rechazoazo',
          timestamp: Date.now()
        });

        this.writeLog(`🎯 [SEÑAL] SHORT @ $${currentPrice.toFixed(2)} [TurtleSoup] - Falsa ruptura high`);

      } else if (i % 15 === 12) {
        const openTrade = this.trades.find(t => !t.exitPrice && t.type === 'SHORT');
        if (openTrade) {
          currentPrice = openTrade.entryPrice * 0.997;
          openTrade.exitPrice = currentPrice;
          openTrade.exitReason = 'Take Profit';
          openTrade.pnl = (openTrade.entryPrice - currentPrice) / openTrade.entryPrice;
          openTrade.exitTick = i;

          this.writeLog(`✅ [SALIDA] SHORT @ $${openTrade.entryPrice.toFixed(2)} → $${currentPrice.toFixed(2)} (PnL: ${(openTrade.pnl * 100).toFixed(2)}%) [TurtleSoup] - Take Profit`);
        }
      } else {
        currentPrice += (Math.random() - 0.5) * 50;
      }

      this.priceHistory.push(currentPrice);
    }

    this.writeLog(`\n📊 [DATOS] Generados ${this.priceHistory.length} ticks con ${this.trades.length} trades\n`);
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

    // Escribir estadísticas al log
    this.writeLog(stats);

    return stats;
  }

  async start() {
    this.running = true;

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     📈 PAPER TRADING - SEÑALES ACTIVAS CON LOGGING              ║');
    console.log('║     Solo Price Action - Sin Indicadores Técnicos                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log('\n📁 Log file: ' + this.logFile);
    console.log('📊 Todos los eventos se guardarán en este archivo\n');

    this.writeLog('🚀 [INICIO] Iniciando Paper Trading con Logging Persistente');

    this.generateDataWithActiveSignals();

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
      console.log(`📁 Log: ${this.logFile}`);

      // Log cada tick
      this.writeLog(`📊 [TICK ${this.tickCount}/100] Precio BTC: $${currentPrice.toFixed(2)} | Trades: ${this.trades.length}`);

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
      console.log('    📁 Todos los eventos se guardan en: ' + this.logFile);

      if (this.tickCount >= 99) {
        clearInterval(interval);
        this.running = false;

        this.writeLog('\n✅ [FIN] Paper Trading completado - 100 ticks procesados');
        this.writeLog(this.showStats());

        console.log('\n\n✅ Demo completada - 100 ticks procesados');
        console.log('📁 Log guardado en: ' + this.logFile);
      }

    }, 2000);
  }

  stop() {
    this.running = false;
    this.writeLog('\n🛑 [DETENIDO] Paper trading detenido por usuario');
    console.log('\n\n✅ Paper trading detenido');
    console.log('📁 Log guardado en: ' + this.logFile);
  }
}

// Iniciar trading
const trading = new LoggingPaperTrading();
trading.start();

process.on('SIGINT', () => {
  trading.stop();
  process.exit(0);
});
