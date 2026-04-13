/**
 * SISTEMA DE PAPER TRADING - FASE 1 (COMPLETO)
 *
 * Ejecuta 4 sistemas + arbitraje en modo paper trading
 * Valida funcionamiento antes de producción con dinero real
 *
 * Features implementadas:
 * - Detección real de señales con datos simulados
 * - Conexión con market_data_simulator.js
 * - Lógica de detección real de cada sistema
 * - Cálculo real de PnL
 * - Tracking de Win Rate
 * - Cálculo de Max Drawdown correcto
 * - Integración con AI agents
 * - Integración con real_time_monitor.js
 * - Persistencia de estado
 */

import { AsianSessionSpecialist } from '../../systems/specialist_asian_session.js';
import { MeanReversionTPPartial } from '../../systems/mean_reversion_tp_partial.js';
import { USSessionOpenSpecialist } from '../../systems/specialist_us_session_open.js';
import { StatisticalArbitragePairsExpanded } from '../../systems/statistical_arbitrage_pairs_expanded.js';
import { NewsFilterSystem } from '../../systems/news_filter_system.js';
import { InvestCriptoAIAgentsClient } from '../../integration/invest_criptoai_api/agents_client.js';
import { RealTimeMonitor } from './real_time_monitor.js';
import { MarketDataSimulator, IndicatorCalculator } from './market_data_simulator.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class PaperTradingSystem {
  constructor(configPath) {
    // Cargar configuración
    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
    this.config = configData;

    // Inicializar clientes
    this.aiClient = new InvestCriptoAIAgentsClient({
      baseUrl: this.config.ai_integration.api_url,
      enabled: this.config.ai_integration.enabled,
      timeout: this.config.ai_integration.timeout
    });

    this.newsFilter = new NewsFilterSystem({
      preEventWindow: this.config.news_filter.pre_event_window,
      postEventWindow: this.config.news_filter.post_event_window
    });

    // Inicializar sistemas
    this.systems = new Map();
    this.initializeSystems();

    // Estado del portafolio
    this.portfolio = {
      capital: this.config.capital_operativo,
      initialCapital: this.config.capital_operativo,
      totalPnL: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      equity: [],
      maxDrawdown: 0,
      equityPeak: this.config.capital_operativo,
      currentDrawdown: 0
    };

    // Estado de positions por sistema
    this.openPositions = [];

    // Trading state
    this.isRunning = false;
    this.trades = [];
    this.signals = [];
    this.startTime = null;

    // Market data simulator
    this.marketSimulator = null;
    this.currentData = null;
    this.currentBarIndex = 0;

    // Real-time monitor integration
    this.monitor = null;

    // Logs directory
    this.logsDir = join(__dirname, '../../logs');
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true });
    }
  }

  initializeSystems() {
    console.log('🔧 Inicializando sistemas de trading...');

    // Asian Session Specialist
    if (this.config.systems.asian_session.enabled) {
      this.systems.set('asian_session', new AsianSessionSpecialist({
        ...this.config.systems.asian_session.parameters,
        capital: this.config.systems.asian_session.capital,
        aiClient: this.aiClient,
        newsFilter: this.newsFilter,
        useAIEnsemble: this.config.systems.asian_session.use_ai_ensemble,
        useNewsFilter: this.config.systems.asian_session.news_filter_enabled
      }));
      console.log('  ✅ Asian Session Specialist inicializado');
    }

    // Mean Reversion
    if (this.config.systems.mean_reversion.enabled) {
      this.systems.set('mean_reversion', new MeanReversionTPPartial({
        ...this.config.systems.mean_reversion.parameters,
        capital: this.config.systems.mean_reversion.capital,
        aiClient: this.aiClient,
        newsFilter: this.newsFilter,
        useAIEnsemble: this.config.systems.mean_reversion.use_ai_ensemble,
        useNewsFilter: this.config.systems.mean_reversion.news_filter_enabled
      }));
      console.log('  ✅ Mean Reversion V1 + TP inicializado');
    }

    // US Session Open
    if (this.config.systems.us_session_open.enabled) {
      this.systems.set('us_session_open', new USSessionOpenSpecialist({
        ...this.config.systems.us_session_open.parameters,
        capital: this.config.systems.us_session_open.capital,
        aiClient: this.aiClient,
        newsFilter: this.newsFilter,
        useAIEnsemble: this.config.systems.us_session_open.use_ai_ensemble,
        useNewsFilter: this.config.systems.us_session_open.news_filter_enabled
      }));
      console.log('  ✅ US Session Open Specialist inicializado');
    }

    // Statistical Arbitraje
    if (this.config.systems.arbitraje.enabled) {
      this.systems.set('arbitraje', new StatisticalArbitragePairsExpanded({
        pairs: this.config.systems.arbitraje.parameters.pairs,
        capital: this.config.systems.arbitraje.capital,
        aiClient: this.aiClient
      }));
      console.log('  ✅ Statistical Arbitraje Expandido inicializado');
    }

    console.log(`\n📊 ${this.systems.size} sistemas inicializados`);
    console.log(`💰 Capital operativo: $${this.portfolio.capital.toLocaleString()}`);
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  El sistema ya está corriendo');
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║        🚀 PAPER TRADING - FASE 1 (Semana 1-2)                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    this.isRunning = true;
    this.startTime = Date.now();

    // Verificar health de AI API
    console.log('🔍 Verificando conexión con InvestCripto AI...');
    const health = await this.aiClient.healthCheck();
    console.log(`  Status: ${health.status}`);

    if (health.status === 'unhealthy') {
      console.log('  ⚠️  AI API no disponible - usando modo fallback');
    } else {
      console.log('  ✅ AI API disponible');
    }

    // Mostrar configuración
    this.printConfig();

    // Inicializar simulador de mercado
    console.log('\n🎲 Inicializando simulador de mercado...');
    this.marketSimulator = new MarketDataSimulator({
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
      interval: 10000, // 10 segundos
      duration: 24 * 7 // 7 días
    });

    // Generar datos históricos
    console.log('📊 Generando datos históricos...');
    const simulationResult = this.marketSimulator.simulate();
    this.currentData = this.formatSimulatorData(simulationResult);
    this.currentBarIndex = 100; // Empezar con suficientes datos históricos

    console.log(`✅ Datos generados: ${this.currentData.timestamps.length} velas\n`);

    // Inicializar monitor en tiempo real
    console.log('📡 Inicializando monitor en tiempo real...');
    this.monitor = new RealTimeMonitor(configPath);
    await this.monitor.start();
    console.log('✅ Monitor iniciado\n');

    // Iniciar loop principal
    console.log('🔄 Iniciando loop principal...');
    console.log('⏳  Presiona Ctrl+C para detener\n');

    this.tradingLoop();
  }

  /**
   * Formatea datos del simulador al formato esperado por los sistemas
   */
  formatSimulatorData(simulationResult) {
    const btcData = simulationResult.data.BTCUSDT;

    const formatted = {
      timestamps: btcData.map(c => c.timestamp),
      opens: btcData.map(c => c.open),
      highs: btcData.map(c => c.high),
      lows: btcData.map(c => c.low),
      closes: btcData.map(c => c.close),
      volumes: btcData.map(c => c.volume)
    };

    // Calcular indicadores
    const closes = formatted.closes;
    const highs = formatted.highs;
    const lows = formatted.lows;

    // SMA20 y StdDev20
    formatted.sma20 = [];
    formatted.stdDev20 = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < 20) {
        formatted.sma20.push(null);
        formatted.stdDev20.push(null);
      } else {
        const slice = closes.slice(i - 20, i + 1);
        const sma = slice.reduce((a, b) => a + b, 0) / 20;
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / 20;
        formatted.sma20.push(sma);
        formatted.stdDev20.push(Math.sqrt(variance));
      }
    }

    // RSI14
    formatted.rsi = [];
    for (let i = 0; i < closes.length; i++) {
      formatted.rsi.push(IndicatorCalculator.calculateRSI(closes.slice(0, i + 1), 14));
    }

    // High20 y Low20 (para Turtle Soup)
    formatted.high20_corrected = [];
    formatted.low20_corrected = [];
    for (let i = 0; i < highs.length; i++) {
      if (i < 20) {
        formatted.high20_corrected.push(null);
        formatted.low20_corrected.push(null);
      } else {
        formatted.high20_corrected.push(Math.max(...highs.slice(i - 20, i)));
        formatted.low20_corrected.push(Math.min(...lows.slice(i - 20, i)));
      }
    }

    return formatted;
  }

  printConfig() {
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│  ⚙️  CONFIGURACIÓN                                               │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│  Fase:               ${this.config.fase.padEnd(40)} │`);
    console.log(`│  Capital Total:       $${this.config.capital_total.toLocaleString().padEnd(10)} │`);
    console.log(`│  Capital Operativo:   $${this.config.capital_operativo.toLocaleString().padEnd(10)} │`);
    console.log(`│  Reserva:             $${this.config.capital_reserva.toLocaleString().padEnd(10)} │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│  SISTEMAS ACTIVOS:                                            │');

    for (const [key, system] of this.systems) {
      const conf = this.config.systems[key];
      const pct = (conf.porcentaje_portafolio * 100).toFixed(1);
      console.log(`│  • ${conf.name.padEnd(25)} $${conf.capital.toLocaleString().padEnd(7)} (${pct}%) │`);
    }

    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│  INTEGRACIÓN IA:                                              │');
    console.log(`│  • AI Ensemble:        ${this.config.ai_integration.enabled ? '✅ ACTIVO' : '❌ INACTIVO'.padEnd(25)} │`);
    console.log(`│  • News Filter:        ${this.config.news_filter.enabled ? '✅ ACTIVO' : '❌ INACTIVO'.padEnd(25)} │`);
    console.log(`│  • Take Partial:       ${this.config.systems.mean_reversion.take_partial_enabled ? '✅ ACTIVO' : '❌ INACTIVO'.padEnd(25)} │`);
    console.log('└─────────────────────────────────────────────────────────────┘\n');
  }

  async tradingLoop() {
    let tick = 0;
    const maxBars = this.currentData.timestamps.length;

    while (this.isRunning && this.currentBarIndex < maxBars) {
      tick++;

      const currentTimestamp = this.currentData.timestamps[this.currentBarIndex];
      const currentDate = new Date(currentTimestamp);

      console.log(`\n📊 Tick ${tick} - Bar ${this.currentBarIndex}/${maxBars} - ${currentDate.toISOString()}`);

      // 1. Gestionar posiciones abiertas (antes de detectar nuevas señales)
      await this.manageOpenPositions();

      // 2. Detectar nuevas señales
      for (const [systemName, system] of this.systems) {
        // Detectar señal
        const signal = await this.simulateSignal(systemName, this.currentBarIndex);

        if (signal) {
          console.log(`  🎯 ${systemName}: ${signal.type} ${signal.symbol || signal.pairName} @ ${signal.entry?.toFixed(2) || signal.entry1?.toFixed(2)}`);

          // Verificar NewsFilter
          const newsCheck = this.newsFilter.isHighImpactTime(currentTimestamp);
          if (newsCheck.isHighImpact) {
            console.log(`    🚫 NewsFilter bloqueó: ${newsCheck.reason}`);
            continue;
          }

          // Procesar señal con AI
          const processed = await this.processWithAI(signal);

          if (processed.approve) {
            console.log(`    ✅ Aprobado por IA (conf: ${processed.confidence?.toFixed(2) || processed.final_confidence?.toFixed(2)})`);

            // Ejecutar trade
            const trade = await this.executeTrade(signal, processed);

            if (trade) {
              console.log(`    💱 Trade ejecutado: ${trade.order_id}`);
              this.trades.push(trade);
              this.openPositions.push(trade);
            }
          } else {
            console.log(`    ❌ Rechazado por IA: ${processed.reasoning}`);
          }
        }
      }

      // 3. Actualizar métricas del portafolio
      this.updateMetrics();

      // 4. Mostrar estado actual
      if (tick % 5 === 0) {
        this.printCurrentState();
      }

      // 5. Guardar estado periódicamente
      if (tick % 50 === 0) {
        this.saveState();
      }

      // 6. Avanzar a la siguiente vela
      this.currentBarIndex++;

      // 7. Pequeña pausa para no saturar la consola
      await this.sleep(100);
    }

    // Loop terminado
    console.log('\n✅ Loop de trading finalizado');
    this.stop();
  }

  async simulateSignal(systemName, barIndex) {
    const data = this.currentData;

    try {
      const system = this.systems.get(systemName);

      switch (systemName) {
        case 'asian_session':
          return system.detect(data, barIndex);

        case 'mean_reversion':
          return system.detect(data, barIndex);

        case 'us_session_open':
          return system.detect(data, barIndex);

        case 'arbitraje':
          return system.detect(data, barIndex);

        default:
          return null;
      }
    } catch (error) {
      console.error(`    ⚠️  Error detectando señal para ${systemName}: ${error.message}`);
      return null;
    }
  }

  async processWithAI(signal) {
    try {
      // Si AI ensemble está activado, enviar a agents
      if (this.config.ai_integration.enabled) {
        const decision = await this.aiClient.sendSignal(signal);

        return {
          approve: decision.approve,
          confidence: decision.final_confidence || decision.confidence,
          reasoning: decision.reasoning,
          positionSize: decision.position_size
        };
      }

      // Si no hay AI, aprobar automáticamente
      return {
        approve: true,
        confidence: signal.confidence || 0.5,
        reasoning: 'AI desactivado - auto-aprobado',
        positionSize: 1.0
      };

    } catch (error) {
      console.error(`    ⚠️  Error procesando con IA: ${error.message}`);

      // Fallback: aprobar con confianza media
      return {
        approve: true,
        confidence: 0.5,
        reasoning: 'Error IA - auto-aprobado con confianza media',
        positionSize: 1.0
      };
    }
  }

  async executeTrade(signal, aiDecision) {
    const timestamp = this.currentData.timestamps[this.currentBarIndex];

    // Calcular tamaño de posición
    const systemName = signal.system;
    const systemConfig = this.config.systems[systemName];
    const capital = systemConfig?.capital || 1000;
    const positionSize = capital * (aiDecision.positionSize || 1.0);

    let trade;

    if (systemName === 'STATISTICAL_ARBITRAGE_EXPANDED') {
      // Trade de arbitraje (par)
      trade = {
        order_id: `PAPER-ARB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        system: signal.system,
        type: signal.type,
        pairName: signal.pairName,
        symbol1: signal.symbol1,
        symbol2: signal.symbol2,
        entry1: signal.entry1,
        entry2: signal.entry2,
        stopLoss1: signal.stopLoss1,
        stopLoss2: signal.stopLoss2,
        targetRatio: signal.targetRatio,
        meanRatio: signal.meanRatio,
        stdDev: signal.stdDev,
        zScore: signal.zScore,
        correlation: signal.correlation,
        capital: positionSize,
        ai_confidence: aiDecision.confidence,
        ai_reasoning: aiDecision.reasoning,
        timestamp: timestamp,
        status: 'OPEN',
        pnl: 0,
        duration: 0
      };
    } else {
      // Trade normal
      trade = {
        order_id: `PAPER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        system: signal.system,
        action: signal.type,
        symbol: signal.symbol || 'BTCUSDT',
        entry_price: signal.entry,
        stop_loss: signal.stop,
        take_profit: signal.target,
        capital: positionSize,
        ai_confidence: aiDecision.confidence,
        ai_reasoning: aiDecision.reasoning,
        timestamp: timestamp,
        status: 'OPEN',
        pnl: 0,
        duration: 0
      };
    }

    return trade;
  }

  async manageOpenPositions() {
    if (this.openPositions.length === 0) return;

    const data = this.currentData;
    const i = this.currentBarIndex;

    // Procesar cada posición abierta
    for (let j = this.openPositions.length - 1; j >= 0; j--) {
      const position = this.openPositions[j];
      position.duration++;

      let closedTrade = null;

      if (position.system === 'STATISTICAL_ARBITRAGE_EXPANDED') {
        closedTrade = await this.manageArbitragePosition(position, i);
      } else {
        closedTrade = await this.manageNormalPosition(position, i);
      }

      if (closedTrade) {
        // Remover de posiciones abiertas
        this.openPositions.splice(j, 1);

        // Actualizar portafolio
        this.updatePortfolioAfterTrade(closedTrade);
      }
    }
  }

  async manageNormalPosition(position, barIndex) {
    const data = this.currentData;
    const currentPrice = data.closes[barIndex];

    let exitPrice = null;
    let exitReason = null;

    if (position.action === 'LONG') {
      if (currentPrice >= position.take_profit) {
        exitPrice = position.take_profit;
        exitReason = 'TAKE_PROFIT';
      } else if (currentPrice <= position.stop_loss) {
        exitPrice = position.stop_loss;
        exitReason = 'STOP_LOSS';
      }
    } else { // SHORT
      if (currentPrice <= position.take_profit) {
        exitPrice = position.take_profit;
        exitReason = 'TAKE_PROFIT';
      } else if (currentPrice >= position.stop_loss) {
        exitPrice = position.stop_loss;
        exitReason = 'STOP_LOSS';
      }
    }

    // Time-based exit
    if (!exitPrice && position.duration >= 15) {
      exitPrice = currentPrice;
      exitReason = 'TIME_EXIT';
    }

    if (exitPrice) {
      const pnl = position.action === 'LONG'
        ? (exitPrice - position.entry_price) / position.entry_price
        : (position.entry_price - exitPrice) / position.entry_price;

      return {
        ...position,
        exit_price: exitPrice,
        exit_timestamp: data.timestamps[barIndex],
        pnl,
        success: pnl > 0,
        exit_reason: exitReason,
        status: 'CLOSED'
      };
    }

    return null;
  }

  async manageArbitragePosition(position, barIndex) {
    const system = this.systems.get('arbitraje');

    // Generar precios actuales para el par
    const btcPrices = this.currentData.closes.slice(0, barIndex + 1);
    const pricesData = system.generatePricesForPairs(btcPrices, barIndex);

    const currentPrice1 = pricesData[position.symbol1];
    const currentPrice2 = pricesData[position.symbol2];

    if (!currentPrice1 || !currentPrice2) return null;

    const currentRatio = currentPrice1 / currentPrice2;
    const zScoreCurrent = position.stdDev === 0 ? 0 :
      (currentRatio - position.meanRatio) / position.stdDev;

    let exitPrice1 = null;
    let exitPrice2 = null;
    let exitReason = null;

    // Salida por Z-score revertido
    if (Math.abs(zScoreCurrent) < 0.4) {
      exitPrice1 = currentPrice1;
      exitPrice2 = currentPrice2;
      exitReason = 'Z_SCORE_MEAN_REVERSION';
    }
    // Salida por Stop Loss
    else if (position.type === 'PAIR_SHORT') {
      if (currentPrice1 >= position.stopLoss1 || currentPrice2 <= position.stopLoss2) {
        exitPrice1 = currentPrice1;
        exitPrice2 = currentPrice2;
        exitReason = 'STOP_LOSS';
      }
    } else if (position.type === 'PAIR_LONG') {
      if (currentPrice1 <= position.stopLoss1 || currentPrice2 >= position.stopLoss2) {
        exitPrice1 = currentPrice1;
        exitPrice2 = currentPrice2;
        exitReason = 'STOP_LOSS';
      }
    }
    // Salida por tiempo
    else if (position.duration >= 18) {
      exitPrice1 = currentPrice1;
      exitPrice2 = currentPrice2;
      exitReason = 'TIME_EXIT';
    }

    if (exitPrice1 && exitPrice2) {
      const pnl1 = position.type === 'PAIR_SHORT'
        ? (position.entry1 - exitPrice1) / position.entry1
        : (exitPrice1 - position.entry1) / position.entry1;

      const pnl2 = position.type === 'PAIR_SHORT'
        ? (exitPrice2 - position.entry2) / position.entry2
        : (position.entry2 - exitPrice2) / position.entry2;

      const totalPnl = (pnl1 + pnl2) / 2;

      return {
        ...position,
        exit1: exitPrice1,
        exit2: exitPrice2,
        exit_timestamp: this.currentData.timestamps[barIndex],
        pnl1,
        pnl2,
        pnl: totalPnl,
        success: totalPnl > 0,
        exit_reason: exitReason,
        status: 'CLOSED'
      };
    }

    return null;
  }

  updatePortfolioAfterTrade(trade) {
    const pnlAmount = trade.capital * trade.pnl;
    this.portfolio.capital += pnlAmount;
    this.portfolio.totalPnL += pnlAmount;
    this.portfolio.totalTrades++;

    if (trade.pnl > 0) {
      this.portfolio.winningTrades++;
    } else {
      this.portfolio.losingTrades++;
    }

    // Actualizar Win Rate
    this.portfolio.winRate = this.portfolio.winningTrades / this.portfolio.totalTrades;

    // Actualizar equity curve
    this.portfolio.equity.push({
      timestamp: trade.exit_timestamp || Date.now(),
      value: this.portfolio.capital
    });

    // Actualizar peak y drawdown
    if (this.portfolio.capital > this.portfolio.equityPeak) {
      this.portfolio.equityPeak = this.portfolio.capital;
      this.portfolio.currentDrawdown = 0;
    } else {
      this.portfolio.currentDrawdown =
        (this.portfolio.equityPeak - this.portfolio.capital) / this.portfolio.equityPeak;

      if (this.portfolio.currentDrawdown > this.portfolio.maxDrawdown) {
        this.portfolio.maxDrawdown = this.portfolio.currentDrawdown;
      }
    }

    // Enviar trade al monitor
    if (this.monitor) {
      this.monitor.addTrade({
        ...trade,
        capital: trade.capital,
        timestamp: trade.exit_timestamp || new Date().toISOString()
      });
    }

    console.log(`    📊 Trade cerrado: ${trade.exit_reason} | PnL: ${(trade.pnl * 100).toFixed(2)}% | Capital: $${this.portfolio.capital.toFixed(2)}`);
  }

  updateMetrics() {
    // Actualizar PnL de posiciones abiertas (marcando a mercado)
    for (const position of this.openPositions) {
      if (position.system !== 'STATISTICAL_ARBITRAGE_EXPANDED') {
        const currentPrice = this.currentData.closes[this.currentBarIndex];

        if (position.action === 'LONG') {
          position.unrealizedPnl = (currentPrice - position.entry_price) / position.entry_price;
        } else {
          position.unrealizedPnl = (position.entry_price - currentPrice) / position.entry_price;
        }
      }
    }
  }

  printCurrentState() {
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│  📈 ESTADO ACTUAL                                              │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│  Capital:             $${this.portfolio.capital.toFixed(2).padStart(12)} │`);
    console.log(`│  PnL Total:           $${this.portfolio.totalPnL.toFixed(2).padStart(12)} │`);
    console.log(`│  PnL %:               ${(this.portfolio.totalPnL / this.portfolio.initialCapital * 100).toFixed(2)}%`.padEnd(62) + '│');
    console.log(`│  Win Rate:            ${(this.portfolio.winRate * 100).toFixed(1)}%`.padEnd(62) + '│');
    console.log(`│  Max Drawdown:        ${(this.portfolio.maxDrawdown * 100).toFixed(2)}%`.padEnd(62) + '│');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│  TRADES:                                                      │');
    console.log(`│  Total:               ${this.portfolio.totalTrades.toString().padStart(12)} │`);
    console.log(`│  Ganadores:           ${this.portfolio.winningTrades.toString().padStart(12)} │`);
    console.log(`│  Perdedores:          ${this.portfolio.losingTrades.toString().padStart(12)} │`);
    console.log(`│  Abiertos:            ${this.openPositions.length.toString().padStart(12)} │`);
    console.log('└─────────────────────────────────────────────────────────────┘');
  }

  saveState() {
    const state = {
      timestamp: new Date().toISOString(),
      portfolio: this.portfolio,
      trades: this.trades,
      openPositions: this.openPositions,
      config: this.config,
      currentBarIndex: this.currentBarIndex
    };

    const filename = join(this.logsDir, `state_${Date.now()}.json`);
    writeFileSync(filename, JSON.stringify(state, null, 2));

    console.log(`  💾 Estado guardado: ${filename}`);
  }

  stop() {
    if (!this.isRunning) return;

    console.log('\n🛑 Deteniendo paper trading...');
    this.isRunning = false;

    // Detener monitor
    if (this.monitor) {
      this.monitor.stop();
    }

    // Cerrar todas las posiciones abiertas
    if (this.openPositions.length > 0) {
      console.log(`\n📊 Cerrando ${this.openPositions.length} posiciones abiertas...`);

      const finalPrice = this.currentData.closes[this.currentBarIndex - 1];

      for (const position of this.openPositions) {
        if (position.system !== 'STATISTICAL_ARBITRAGE_EXPANDED') {
          position.exit_price = finalPrice;
          position.exit_timestamp = Date.now();
          position.pnl = position.action === 'LONG'
            ? (finalPrice - position.entry_price) / position.entry_price
            : (position.entry_price - finalPrice) / position.entry_price;
          position.success = position.pnl > 0;
          position.exit_reason = 'SYSTEM_SHUTDOWN';
          position.status = 'CLOSED';

          this.updatePortfolioAfterTrade(position);
          this.trades.push(position);
        }
      }

      this.openPositions = [];
    }

    // Guardar estado final
    this.saveState();

    // Generar reporte
    this.generateReport();

    console.log('✅ Paper trading detenido');
  }

  generateReport() {
    const duration = (Date.now() - this.startTime) / 1000 / 60; // minutos
    const totalPnLPct = (this.portfolio.totalPnL / this.portfolio.initialCapital) * 100;
    const winRatePct = this.portfolio.winRate * 100;
    const maxDDPct = this.portfolio.maxDrawdown * 100;

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║        📊 REPORTE FINAL DE PAPER TRADING                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  💰 CAPITAL                                                   │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│  Capital Inicial:     $${this.portfolio.initialCapital.toFixed(2).padStart(12)} │`);
    console.log(`│  Capital Final:       $${this.portfolio.capital.toFixed(2).padStart(12)} │`);
    console.log(`│  PnL Total:           $${this.portfolio.totalPnL.toFixed(2).padStart(12)} │`);
    console.log(`│  PnL %:               ${totalPnLPct.toFixed(2)}%`.padEnd(62) + '│');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│  📈 ESTADÍSTICAS                                              │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│  Total Trades:        ${this.portfolio.totalTrades.toString().padStart(12)} │`);
    console.log(`│  Win Rate:            ${winRatePct.toFixed(1)}%`.padEnd(62) + '│');
    console.log(`│  Max Drawdown:        ${maxDDPct.toFixed(2)}%`.padEnd(62) + '│');
    console.log(`│  Duración:            ${duration.toFixed(0)} minutos`.padEnd(62) + '│');
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    // Reporte por sistema
    console.log('📊 Reporte por Sistema:');
    console.log('─────────────────────────────────────────────────────────');

    const tradesBySystem = {};
    for (const trade of this.trades) {
      if (!tradesBySystem[trade.system]) {
        tradesBySystem[trade.system] = {
          total: 0,
          winning: 0,
          losing: 0,
          totalPnL: 0
        };
      }

      tradesBySystem[trade.system].total++;
      tradesBySystem[trade.system].totalPnL += trade.pnl || 0;

      if (trade.success) {
        tradesBySystem[trade.system].winning++;
      } else {
        tradesBySystem[trade.system].losing++;
      }
    }

    for (const [system, stats] of Object.entries(tradesBySystem)) {
      const winRate = (stats.winning / stats.total) * 100;
      const avgPnL = (stats.totalPnL / stats.total) * 100;

      console.log(`\n${system}:`);
      console.log(`  Trades:     ${stats.total}`);
      console.log(`  Win Rate:   ${winRate.toFixed(1)}%`);
      console.log(`  PnL Prom:   ${avgPnL.toFixed(2)}%`);
    }

    console.log('\n─────────────────────────────────────────────────────────\n');

    // Guardar reporte a archivo
    const reportData = {
      timestamp: new Date().toISOString(),
      duration_minutes: duration,
      portfolio: this.portfolio,
      tradesBySystem,
      trades: this.trades
    };

    const reportFile = join(this.logsDir, `report_final_${Date.now()}.json`);
    writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
    console.log(`💾 Reporte guardado en: ${reportFile}\n`);

    // Evaluar criterios de éxito
    this.evaluateSuccessCriteria();
  }

  evaluateSuccessCriteria() {
    const criteria = this.config.criteria_exito;
    const winRatePct = this.portfolio.winRate * 100;
    const totalPnLPct = (this.portfolio.totalPnL / this.portfolio.initialCapital) * 100;
    const maxDDPct = this.portfolio.maxDrawdown * 100;

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║        ✅ CRITERIOS DE ÉXITO                                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const checks = [
      {
        name: 'Win Rate Mínimo',
        required: `${(criteria.win_rate_minimo * 100).toFixed(0)}%`,
        actual: `${winRatePct.toFixed(1)}%`,
        passed: winRatePct >= criteria.win_rate_minimo * 100
      },
      {
        name: 'PnL Mínimo',
        required: `>${(criteria.pnl_minimo_pct * 100).toFixed(0)}%`,
        actual: `${totalPnLPct.toFixed(2)}%`,
        passed: totalPnLPct >= criteria.pnl_minimo_pct * 100
      },
      {
        name: 'Max Drawdown Máximo',
        required: `<${(criteria.max_dd_maximo_pct * 100).toFixed(0)}%`,
        actual: `${maxDDPct.toFixed(2)}%`,
        passed: maxDDPct <= criteria.max_dd_maximo_pct * 100
      },
      {
        name: 'Trades Mínimos',
        required: `≥${criteria.trades_minimos}`,
        actual: `${this.portfolio.totalTrades}`,
        passed: this.portfolio.totalTrades >= criteria.trades_minimos
      }
    ];

    let allPassed = true;

    for (const check of checks) {
      const icon = check.passed ? '✅' : '❌';
      console.log(`${icon} ${check.name.padEnd(25)} ${check.required.padStart(10)} | ${check.actual.padStart(10)}`);

      if (!check.passed) allPassed = false;
    }

    console.log('\n' + '─'.repeat(64));

    if (allPassed) {
      console.log('🎉 ¡TODOS LOS CRITERIOS DE ÉXITO CUMPLIDOS!');
      console.log('✅ El sistema está listo para pasar a FASE 2 (Trading Real)');
    } else {
      console.log('⚠️  ALGUNOS CRITERIOS NO FUERON CUMPLIDOS');
      console.log('📋 Se recomienda ajustar parámetros antes de pasar a producción');
    }

    console.log('');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const configPath = join(__dirname, '../../config/systems_config.json');

  const system = new PaperTradingSystem(configPath);

  await system.start();

  // Manejar Ctrl+C
  process.on('SIGINT', () => {
    system.stop();
    process.exit(0);
  });

  // Manejar SIGTERM
  process.on('SIGTERM', () => {
    system.stop();
    process.exit(0);
  });
}

main().catch(console.error);
