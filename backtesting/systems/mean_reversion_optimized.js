/**
 * Sistema 4: Mean Reversion (OPTIMIZADO)
 * Estrategia: Reversión a la media con z-score
 * Versión: Parámetros relajados + modo standalone
 */

export class MeanReversionOptimized {
  constructor(config = {}) {
    // PARÁMETROS ORIGINALES (con activación por delta)
    // this.period = 20;
    // this.zScoreThreshold = 2;
    // this.activationDelta = 0.02; // 2% delta agresivos

    // PARÁMETROS OPTIMIZADOS (standalone, más permisivo)
    this.period = config.period || 20;
    this.zScoreThreshold = config.zScoreThreshold || 1.5; // 2 → 1.5 (más sensible)
    this.stopLoss = config.stopLoss || 0.004; // 0.4%
    this.takeProfit = config.takeProfit || 0.008; // 0.8%

    this.positions = [];
    this.trades = [];
  }

  detect(data, i, aggressiveDelta = 0) {
    if (i < this.period) return null;

    const price = data.closes[i];
    const sma20 = data.sma20[i];
    const stdDev = data.stdDev20[i];

    if (sma20 === null || stdDev === null) return null;

    const zScore = (price - sma20) / stdDev;

    // ELIMINADO: Requisito de delta de agresivos
    // Ahora funciona como sistema independiente

    // Precio sobreextendido al alza → SHORT
    if (zScore > this.zScoreThreshold) {
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.55,
        isHedge: false, // Ya no es solo cobertura
        reason: `Mean Reversion SHORT - Z-score: ${zScore.toFixed(2)}`,
        system: 'MEAN_REVERSION_OPT'
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
        reason: `Mean Reversion LONG - Z-score: ${zScore.toFixed(2)}`,
        system: 'MEAN_REVERSION_OPT'
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

      // Time-based exit (12 períodos = 60 minutos)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 12 && !exitPrice) {
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
