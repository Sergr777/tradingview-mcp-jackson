/**
 * REAL-TIME MONITORING SYSTEM - PAPER TRADING PHASE 1
 *
 * Monitors trading performance metrics in real-time with:
 * - PnL tracking (per system and total)
 * - Win Rate (rolling 50 trades)
 * - Max Drawdown calculation
 * - Trades per hour
 * - Average slippage
 * - Execution latency
 * - Alert system for risk limits
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class RealTimeMonitor {
  constructor(configPath) {
    // Load configuration
    const configData = JSON.parse(readFileSync(configPath, 'utf8'));
    this.config = configData;

    // Risk thresholds from config
    this.thresholds = {
      maxDailyLossPct: this.config.risk_management.circuit_breakers.max_daily_loss_pct,
      maxWeeklyLossPct: this.config.risk_management.circuit_breakers.max_weekly_loss_pct,
      maxDrawdownPct: this.config.risk_management.circuit_breakers.max_drawdown_pct,
      minWinRate: this.config.criteria_exito.win_rate_minimo
    };

    // System tracking
    this.systems = new Map();
    this.initializeSystemTracking();

    // Metrics state
    this.metrics = {
      timestamp: null,
      total: {
        capital: this.config.capital_operativo,
        initialCapital: this.config.capital_operativo,
        pnl: 0,
        pnlPct: 0,
        winRate: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        maxDrawdown: 0,
        maxDrawdownPct: 0,
        equityPeak: this.config.capital_operativo,
        tradesPerHour: 0,
        avgSlippage: 0,
        avgLatency: 0,
        dailyPnL: 0,
        dailyPnLPct: 0,
        weeklyPnL: 0,
        weeklyPnLPct: 0
      },
      systems: {},
      alerts: [],
      lastUpdate: null
    };

    // Rolling trades for win rate calculation
    this.rollingTrades = [];
    this.rollingWindow = 50;

    // Hourly trade tracking
    this.hourlyTrades = [];

    // Slippage and latency tracking
    this.executionMetrics = [];

    // Daily/weekly tracking
    this.dailyTrades = [];
    this.weeklyTrades = [];
    this.sessionStart = new Date();
    this.dayStart = new Date();
    this.weekStart = new Date();

    // Alert state
    this.alertHistory = [];
    this.activeAlerts = new Set();

    // Ensure logs directory exists
    this.logsDir = join(__dirname, '../../logs');
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true });
    }

    // Monitor state
    this.isRunning = false;
    this.updateInterval = 10000; // 10 seconds
  }

  initializeSystemTracking() {
    for (const [key, systemConfig] of Object.entries(this.config.systems)) {
      if (systemConfig.enabled) {
        this.systems.set(key, {
          name: systemConfig.name,
          capital: systemConfig.capital,
          initialCapital: systemConfig.capital,
          pnl: 0,
          pnlPct: 0,
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          maxDrawdown: 0,
          equityCurve: [systemConfig.capital],
          equityPeak: systemConfig.capital,
          trades: []
        });
      }
    }
  }

  /**
   * Start the monitoring system
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Monitor ya está corriendo');
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     📡 REAL-TIME MONITORING SYSTEM                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    this.isRunning = true;
    this.metrics.timestamp = new Date().toISOString();
    this.metrics.lastUpdate = new Date().toISOString();

    // Load existing state if available
    await this.loadState();

    // Print initial status
    this.printStatus();

    // Start monitoring loop
    this.monitoringLoop();
  }

  /**
   * Main monitoring loop - updates metrics every 10 seconds
   */
  async monitoringLoop() {
    while (this.isRunning) {
      try {
        // Update timestamp
        const now = new Date();
        this.metrics.timestamp = now.toISOString();

        // Recalculate all metrics
        this.recalculateMetrics();

        // Check for alerts
        this.checkAlerts();

        // Save metrics to file
        this.saveMetrics();

        // Print status update
        this.printUpdate();

        // Clean old data
        this.cleanupOldData();

      } catch (error) {
        console.error(`❌ Error en monitoring loop: ${error.message}`);
      }

      // Wait for next update
      await this.sleep(this.updateInterval);
    }
  }

  /**
   * Recalculate all metrics based on current trades
   */
  recalculateMetrics() {
    const now = new Date();

    // Update total metrics
    this.metrics.total.capital = this.calculateCurrentCapital();
    this.metrics.total.pnl = this.metrics.total.capital - this.metrics.total.initialCapital;
    this.metrics.total.pnlPct = (this.metrics.total.pnl / this.metrics.total.initialCapital) * 100;

    // Calculate win rate (rolling 50 trades)
    this.metrics.total.winRate = this.calculateRollingWinRate();

    // Update trade counts
    this.metrics.total.totalTrades = this.rollingTrades.length;
    this.metrics.total.winningTrades = this.rollingTrades.filter(t => t.pnl > 0).length;
    this.metrics.total.losingTrades = this.rollingTrades.filter(t => t.pnl <= 0).length;

    // Calculate max drawdown
    const dd = this.calculateMaxDrawdown();
    this.metrics.total.maxDrawdown = dd.drawdown;
    this.metrics.total.maxDrawdownPct = dd.drawdownPct;

    // Update equity peak
    if (this.metrics.total.capital > this.metrics.total.equityPeak) {
      this.metrics.total.equityPeak = this.metrics.total.capital;
    }

    // Calculate trades per hour
    this.metrics.total.tradesPerHour = this.calculateTradesPerHour();

    // Calculate average slippage
    this.metrics.total.avgSlippage = this.calculateAvgSlippage();

    // Calculate average latency
    this.metrics.total.avgLatency = this.calculateAvgLatency();

    // Calculate daily PnL
    this.metrics.total.dailyPnL = this.calculateDailyPnL();
    this.metrics.total.dailyPnLPct = (this.metrics.total.dailyPnL / this.metrics.total.initialCapital) * 100;

    // Calculate weekly PnL
    this.metrics.total.weeklyPnL = this.calculateWeeklyPnL();
    this.metrics.total.weeklyPnLPct = (this.metrics.total.weeklyPnL / this.metrics.total.initialCapital) * 100;

    // Update per-system metrics
    for (const [key, system] of this.systems) {
      const sysMetrics = this.calculateSystemMetrics(key);
      this.metrics.systems[key] = sysMetrics;
    }

    this.metrics.lastUpdate = now.toISOString();
  }

  /**
   * Calculate current capital across all systems
   */
  calculateCurrentCapital() {
    let capital = this.metrics.total.initialCapital;

    for (const trade of this.rollingTrades) {
      capital += trade.pnl || 0;
    }

    return capital;
  }

  /**
   * Calculate rolling win rate (last 50 trades)
   */
  calculateRollingWinRate() {
    if (this.rollingTrades.length === 0) return 0;

    const recentTrades = this.rollingTrades.slice(-this.rollingWindow);
    const winners = recentTrades.filter(t => t.pnl > 0).length;

    return (winners / recentTrades.length) * 100;
  }

  /**
   * Calculate max drawdown from equity curve
   */
  calculateMaxDrawdown() {
    let peak = this.metrics.total.initialCapital;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;

    for (const trade of this.rollingTrades) {
      const currentEquity = peak + (trade.pnl || 0);

      if (currentEquity > peak) {
        peak = currentEquity;
      }

      const drawdown = peak - currentEquity;
      const drawdownPct = (drawdown / peak) * 100;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPct = drawdownPct;
      }
    }

    return { drawdown: maxDrawdown, drawdownPct: maxDrawdownPct };
  }

  /**
   * Calculate trades per hour
   */
  calculateTradesPerHour() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentTrades = this.hourlyTrades.filter(t => {
      const tradeTime = new Date(t.timestamp);
      return tradeTime >= oneHourAgo;
    });

    return recentTrades.length;
  }

  /**
   * Calculate average slippage
   */
  calculateAvgSlippage() {
    if (this.executionMetrics.length === 0) return 0;

    const slippages = this.executionMetrics.map(m => m.slippage || 0);
    const sum = slippages.reduce((a, b) => a + b, 0);

    return sum / slippages.length;
  }

  /**
   * Calculate average execution latency
   */
  calculateAvgLatency() {
    if (this.executionMetrics.length === 0) return 0;

    const latencies = this.executionMetrics.map(m => m.latency || 0);
    const sum = latencies.reduce((a, b) => a + b, 0);

    return sum / latencies.length;
  }

  /**
   * Calculate daily PnL
   */
  calculateDailyPnL() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const todayTrades = this.dailyTrades.filter(t => {
      const tradeTime = new Date(t.timestamp);
      return tradeTime >= dayStart;
    });

    return todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  }

  /**
   * Calculate weekly PnL
   */
  calculateWeeklyPnL() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);

    const weekTrades = this.weeklyTrades.filter(t => {
      const tradeTime = new Date(t.timestamp);
      return tradeTime >= weekStart;
    });

    return weekTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  }

  /**
   * Calculate metrics for a specific system
   */
  calculateSystemMetrics(systemKey) {
    const system = this.systems.get(systemKey);
    if (!system) return null;

    const systemTrades = system.trades;
    const totalPnL = systemTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winningTrades = systemTrades.filter(t => t.pnl > 0).length;

    return {
      name: system.name,
      capital: system.initialCapital + totalPnL,
      initialCapital: system.initialCapital,
      pnl: totalPnL,
      pnlPct: (totalPnL / system.initialCapital) * 100,
      totalTrades: systemTrades.length,
      winningTrades,
      losingTrades: systemTrades.length - winningTrades,
      winRate: systemTrades.length > 0 ? (winningTrades / systemTrades.length) * 100 : 0
    };
  }

  /**
   * Check for alerts based on thresholds
   */
  checkAlerts() {
    const alerts = [];
    const now = new Date();

    // Daily loss alert
    if (this.metrics.total.dailyPnLPct < -this.thresholds.maxDailyLossPct * 100) {
      const alert = {
        type: 'DAILY_LOSS',
        severity: 'HIGH',
        message: `Daily loss ${this.metrics.total.dailyPnLPct.toFixed(2)}% exceeds threshold -${(this.thresholds.maxDailyLossPct * 100).toFixed(0)}%`,
        value: this.metrics.total.dailyPnLPct,
        threshold: -this.thresholds.maxDailyLossPct * 100,
        timestamp: now.toISOString()
      };

      if (!this.activeAlerts.has('DAILY_LOSS')) {
        alerts.push(alert);
        this.activeAlerts.add('DAILY_LOSS');
        console.log(`\n🚨 [DAILY_LOSS] ${alert.message}`);
      }
    } else {
      this.activeAlerts.delete('DAILY_LOSS');
    }

    // Weekly loss alert
    if (this.metrics.total.weeklyPnLPct < -this.thresholds.maxWeeklyLossPct * 100) {
      const alert = {
        type: 'WEEKLY_LOSS',
        severity: 'CRITICAL',
        message: `Weekly loss ${this.metrics.total.weeklyPnLPct.toFixed(2)}% exceeds threshold -${(this.thresholds.maxWeeklyLossPct * 100).toFixed(0)}%`,
        value: this.metrics.total.weeklyPnLPct,
        threshold: -this.thresholds.maxWeeklyLossPct * 100,
        timestamp: now.toISOString()
      };

      if (!this.activeAlerts.has('WEEKLY_LOSS')) {
        alerts.push(alert);
        this.activeAlerts.add('WEEKLY_LOSS');
        console.log(`\n🚨🚨 [WEEKLY_LOSS] ${alert.message}`);
      }
    } else {
      this.activeAlerts.delete('WEEKLY_LOSS');
    }

    // Drawdown alert
    if (this.metrics.total.maxDrawdownPct > this.thresholds.maxDrawdownPct * 100) {
      const alert = {
        type: 'MAX_DRAWDOWN',
        severity: 'CRITICAL',
        message: `Max drawdown ${this.metrics.total.maxDrawdownPct.toFixed(2)}% exceeds threshold ${(this.thresholds.maxDrawdownPct * 100).toFixed(0)}%`,
        value: this.metrics.total.maxDrawdownPct,
        threshold: this.thresholds.maxDrawdownPct * 100,
        timestamp: now.toISOString()
      };

      if (!this.activeAlerts.has('MAX_DRAWDOWN')) {
        alerts.push(alert);
        this.activeAlerts.add('MAX_DRAWDOWN');
        console.log(`\n🚨🚨 [MAX_DRAWDOWN] ${alert.message}`);
      }
    } else {
      this.activeAlerts.delete('MAX_DRAWDOWN');
    }

    // Win rate alert
    if (this.metrics.total.winRate < this.thresholds.minWinRate * 100 && this.metrics.total.totalTrades >= 20) {
      const alert = {
        type: 'LOW_WIN_RATE',
        severity: 'MEDIUM',
        message: `Win rate ${this.metrics.total.winRate.toFixed(1)}% below threshold ${(this.thresholds.minWinRate * 100).toFixed(0)}%`,
        value: this.metrics.total.winRate,
        threshold: this.thresholds.minWinRate * 100,
        timestamp: now.toISOString()
      };

      if (!this.activeAlerts.has('LOW_WIN_RATE')) {
        alerts.push(alert);
        this.activeAlerts.add('LOW_WIN_RATE');
        console.log(`\n⚠️  [LOW_WIN_RATE] ${alert.message}`);
      }
    } else {
      this.activeAlerts.delete('LOW_WIN_RATE');
    }

    // Store alerts
    this.metrics.alerts = alerts;
    if (alerts.length > 0) {
      this.alertHistory.push(...alerts);
    }
  }

  /**
   * Add a trade to the monitoring system
   */
  addTrade(trade) {
    const enrichedTrade = {
      ...trade,
      timestamp: trade.timestamp || new Date().toISOString(),
      pnl: trade.pnl || 0,
      slippage: trade.slippage || 0,
      latency: trade.latency || 0,
      system: trade.system || 'unknown'
    };

    // Add to rolling trades
    this.rollingTrades.push(enrichedTrade);

    // Keep only last 50 for rolling metrics
    if (this.rollingTrades.length > this.rollingWindow) {
      this.rollingTrades.shift();
    }

    // Add to hourly trades
    this.hourlyTrades.push(enrichedTrade);

    // Clean old hourly trades (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.hourlyTrades = this.hourlyTrades.filter(t => new Date(t.timestamp) >= oneDayAgo);

    // Add to daily trades
    this.dailyTrades.push(enrichedTrade);

    // Add to weekly trades
    this.weeklyTrades.push(enrichedTrade);

    // Clean old weekly trades (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    this.weeklyTrades = this.weeklyTrades.filter(t => new Date(t.timestamp) >= thirtyDaysAgo);

    // Add to execution metrics
    if (enrichedTrade.slippage > 0 || enrichedTrade.latency > 0) {
      this.executionMetrics.push({
        slippage: enrichedTrade.slippage,
        latency: enrichedTrade.latency,
        timestamp: enrichedTrade.timestamp
      });

      // Keep only last 100 execution metrics
      if (this.executionMetrics.length > 100) {
        this.executionMetrics.shift();
      }
    }

    // Add to system-specific tracking
    if (this.systems.has(enrichedTrade.system)) {
      const system = this.systems.get(enrichedTrade.system);
      system.trades.push(enrichedTrade);

      // Update equity curve
      const lastEquity = system.equityCurve[system.equityCurve.length - 1] || system.initialCapital;
      system.equityCurve.push(lastEquity + enrichedTrade.pnl);

      // Update equity peak
      const currentEquity = system.equityCurve[system.equityCurve.length - 1];
      if (currentEquity > system.equityPeak) {
        system.equityPeak = currentEquity;
      }
    }
  }

  /**
   * Save metrics to file
   */
  saveMetrics() {
    const date = new Date().toISOString().split('T')[0];
    const filename = join(this.logsDir, `metrics_${date}.json`);

    try {
      // Read existing data if file exists
      let existingData = [];
      if (existsSync(filename)) {
        existingData = JSON.parse(readFileSync(filename, 'utf8'));
      }

      // Add current metrics
      existingData.push({
        timestamp: this.metrics.timestamp,
        metrics: JSON.parse(JSON.stringify(this.metrics))
      });

      // Keep only last 1000 entries per file
      if (existingData.length > 1000) {
        existingData = existingData.slice(-1000);
      }

      writeFileSync(filename, JSON.stringify(existingData, null, 2));
    } catch (error) {
      console.error(`Error saving metrics: ${error.message}`);
    }
  }

  /**
   * Load previous state from logs
   */
  async loadState() {
    try {
      const files = readdirSync(this.logsDir)
        .filter(f => f.startsWith('metrics_') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length > 0) {
        const latestFile = join(this.logsDir, files[0]);
        const data = JSON.parse(readFileSync(latestFile, 'utf8'));

        if (data.length > 0) {
          const latestEntry = data[data.length - 1];
          console.log(`📂 Estado cargado: ${latestFile}`);

          // Restore rolling trades from latest state
          // Note: This is a simplified restoration
          // In production, you'd want more sophisticated state restoration
        }
      }
    } catch (error) {
      console.log('ℹ️  No previous state found, starting fresh');
    }
  }

  /**
   * Clean old data to prevent memory issues
   */
  cleanupOldData() {
    // Clean daily trades older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.dailyTrades = this.dailyTrades.filter(t => new Date(t.timestamp) >= sevenDaysAgo);

    // Clean alert history (keep last 100)
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }
  }

  /**
   * Print current status
   */
  printStatus() {
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│  📊 MONITOR STATUS                                                 │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│  Update Interval:    ${(this.updateInterval / 1000).toFixed(0)}s                                        │`);
    console.log(`│  Rolling Window:     ${this.rollingWindow} trades                                   │`);
    console.log(`│  Active Systems:     ${this.systems.size}                                        │`);
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│  ALERT THRESHOLDS:                                               │');
    console.log(`│  • Daily Loss:        -${(this.thresholds.maxDailyLossPct * 100).toFixed(0)}%                                   │`);
    console.log(`│  • Weekly Loss:       -${(this.thresholds.maxWeeklyLossPct * 100).toFixed(0)}%                                  │`);
    console.log(`│  • Max Drawdown:      ${(this.thresholds.maxDrawdownPct * 100).toFixed(0)}%                                   │`);
    console.log(`│  • Min Win Rate:      ${(this.thresholds.minWinRate * 100).toFixed(0)}%                                   │`);
    console.log('└─────────────────────────────────────────────────────────────────┘\n');
  }

  /**
   * Print metrics update
   */
  printUpdate() {
    const m = this.metrics.total;
    const time = new Date(this.metrics.timestamp).toLocaleTimeString();

    console.log(`\n📡 [${time}] ────────────────────────────────────────────────────`);
    console.log(`  💰 Capital:      $${m.capital.toFixed(2)} (${m.pnlPct >= 0 ? '+' : ''}${m.pnlPct.toFixed(2)}%)`);
    console.log(`  📈 PnL Total:    $${m.pnl.toFixed(2)} (${m.pnl >= 0 ? '🟢' : '🔴'})`);
    console.log(`  🎯 Win Rate:     ${m.winRate.toFixed(1)}% (${m.totalTrades} trades)`);
    console.log(`  📉 Max DD:       ${m.maxDrawdownPct.toFixed(2)}% ($${m.maxDrawdown.toFixed(2)})`);
    console.log(`  ⚡ Trades/Hr:    ${m.tradesPerHour.toFixed(1)}`);
    console.log(`  💸 Slippage:     ${(m.avgSlippage * 100).toFixed(3)}%`);
    console.log(`  ⏱️  Latency:      ${m.avgLatency.toFixed(0)}ms`);

    // Daily/Weekly PnL
    if (m.dailyPnLPct < 0) {
      console.log(`  📅 Daily:        ${m.dailyPnLPct.toFixed(2)}% ${m.dailyPnLPct < -this.thresholds.maxDailyLossPct * 100 ? '🚨' : ''}`);
    } else {
      console.log(`  📅 Daily:        ${m.dailyPnLPct.toFixed(2)}%`);
    }

    if (m.weeklyPnLPct < 0) {
      console.log(`  📆 Weekly:       ${m.weeklyPnLPct.toFixed(2)}% ${m.weeklyPnLPct < -this.thresholds.maxWeeklyLossPct * 100 ? '🚨' : ''}`);
    } else {
      console.log(`  📆 Weekly:       ${m.weeklyPnLPct.toFixed(2)}%`);
    }

    // Per-system breakdown
    if (Object.keys(this.metrics.systems).length > 0) {
      console.log('\n  ┌─ SYSTEMS ────────────────────────────────────────────────┐');
      for (const [key, sys] of Object.entries(this.metrics.systems)) {
        if (sys) {
          const status = sys.pnl >= 0 ? '🟢' : '🔴';
          console.log(`  │ ${status} ${sys.name.substring(0, 20).padEnd(20)} $${sys.pnl.toFixed(2).padEnd(8)} (${sys.winRate.toFixed(0)}%) │`);
        }
      }
      console.log('  └───────────────────────────────────────────────────────────┘');
    }

    // Active alerts
    if (this.activeAlerts.size > 0) {
      console.log(`\n  🚨 ACTIVE ALERTS: ${Array.from(this.activeAlerts).join(', ')}`);
    }
  }

  /**
   * Get metrics as JSON for external dashboards
   */
  getMetricsJSON() {
    return JSON.stringify({
      timestamp: this.metrics.timestamp,
      total: this.metrics.total,
      systems: this.metrics.systems,
      alerts: this.metrics.alerts,
      activeAlerts: Array.from(this.activeAlerts),
      uptime: Date.now() - this.sessionStart.getTime()
    }, null, 2);
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 50) {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Stop the monitoring system
   */
  stop() {
    console.log('\n🛑 Deteniendo monitor...');
    this.isRunning = false;

    // Save final metrics
    this.saveMetrics();

    // Print summary
    this.printSummary();

    console.log('✅ Monitor detenido');
  }

  /**
   * Print monitoring summary
   */
  printSummary() {
    const m = this.metrics.total;
    const uptime = Date.now() - this.sessionStart.getTime();
    const uptimeMinutes = (uptime / 60000).toFixed(1);

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     📊 MONITORING SUMMARY                                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Uptime:           ${uptimeMinutes} minutes`);
    console.log(`Total Trades:     ${m.totalTrades}`);
    console.log(`Final Capital:    $${m.capital.toFixed(2)}`);
    console.log(`Total PnL:        $${m.pnl.toFixed(2)} (${m.pnlPct.toFixed(2)}%)`);
    console.log(`Win Rate:         ${m.winRate.toFixed(1)}%`);
    console.log(`Max Drawdown:     ${m.maxDrawdownPct.toFixed(2)}%`);
    console.log(`Avg Slippage:     ${(m.avgSlippage * 100).toFixed(3)}%`);
    console.log(`Avg Latency:      ${m.avgLatency.toFixed(0)}ms`);
    console.log(`Total Alerts:     ${this.alertHistory.length}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in other modules
export { RealTimeMonitor };

// Main execution for standalone monitoring
async function main() {
  const monitor = new RealTimeMonitor(
    join(__dirname, '../../config/systems_config.json')
  );

  await monitor.start();

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });

  // Demo: Add some simulated trades for testing
  console.log('\nℹ️  Monitor corriendo. Para probar, añade trades vía monitor.addTrade()');
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}
