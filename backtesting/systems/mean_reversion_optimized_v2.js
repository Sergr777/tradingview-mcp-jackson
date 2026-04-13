/**
 * Mean Reversion - OPTIMIZADO V2
 * Optimizaciones implementadas:
 * 1. Filtrar horas 10:00-12:00 (peores horas)
 * 2. Reducir time exit: 12 → 8 períodos
 * 3. Aumentar ligeramente take profit: 0.8% → 0.85%
 */

export class MeanReversionOptimizedV2 {
  constructor(config = {}) {
    this.period = config.period || 20;
    this.zScoreThreshold = config.zScoreThreshold || 1.5;
    this.stopLoss = config.stopLoss || 0.004; // 0.4%
    this.takeProfit = config.takeProfit || 0.0085; // 0.8% → 0.85%

    // Optimización V2: Reducir time exit
    this.timeExitPeriods = config.timeExitPeriods || 8; // 12 → 8

    // Optimización V2: Filtrar peores horas
    this.filterBadHours = config.filterBadHours !== false;
    this.badHours = [10, 11, 12]; // 10am-12pm

    this.positions = [];
    this.trades = [];
  }

  detect(data, i, aggressiveDelta = 0) {
    if (i < this.period) return null;

    const price = data.closes[i];
    const sma20 = data.sma20[i];
    const stdDev = data.stdDev20[i];

    if (sma20 === null || stdDev === null) return null;

    // Optimización V2: Filtrar horas malas
    if (this.filterBadHours) {
      const hour = new Date(data.timestamps[i]).getHours();
      if (this.badHours.includes(hour)) {
        return null; // Skip trades en horas malas
      }
    }

    const zScore = (price - sma20) / stdDev;

    // Precio sobreextendido al alza → SHORT
    if (zScore > this.zScoreThreshold) {
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.55,
        isHedge: false,
        reason: `Mean Reversion V2 SHORT - Z-score: ${zScore.toFixed(2)}`,
        system: 'MEAN_REVERSION_OPT_V2'
      };
    }

    // Precio sobreextendido a la baja → LONG
    if (zScore < -this.zScoreThreshold) {
      return {
        type: 'LONG',
        entry: price,
        stop: price * (1 - this.stopLoss),
        target: price * (1 + this.takeProfit),
        confidence: 0.55,
        isHedge: false,
        reason: `Mean Reversion V2 LONG - Z-score: ${zScore.toFixed(2)}`,
        system: 'MEAN_REVERSION_OPT_V2'
      };
    }

    return null;
  }

  execute(signal, data, i) {
    if (this.positions.length > 0) return null;

    const trade = {
      system: signal.system,
      entryTime: data.timestamps[i],
      entryPrice: signal.entry,
      type: signal.type,
      stopLoss: signal.stop,
      takeProfit: signal.target,
      confidence: signal.confidence,
      isHedge: signal.isHedge,
      reason: signal.reason
    };

    this.positions.push(trade);
    return trade;
  }

  managePositions(data, i) {
    for (let j = this.positions.length - 1; j >= 0; j--) {
      const pos = this.positions[j];
      const currentPrice = data.closes[i];

      let exitPrice = null;
      let exitReason = null;

      if (pos.type === 'LONG') {
        if (currentPrice >= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice <= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      } else { // SHORT
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }

      // Optimización V2: Time-based exit reducido
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= this.timeExitPeriods && !exitPrice) {
        exitPrice = currentPrice;
        exitReason = 'TIME_EXIT';
      }

      if (exitPrice) {
        const pnl = pos.type === 'LONG'
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;

        const closedTrade = {
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl,
          success: pnl > 0,
          exitReason,
          duration: i - entryIndex
        };

        this.trades.push(closedTrade);
        this.positions.splice(j, 1);
      }
    }
  }
}
