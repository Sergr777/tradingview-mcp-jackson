/**
 * SISTEMA ESPECIALISTA: Asian Session (8pm-12am EST)
 * Características:
 * - Baja volatilidad
 * - Rangos laterales
 * - Movimientos de mean reversion
 * - Ideal para: Reversión a la media
 */

export class AsianSessionSpecialist {
  constructor(config = {}) {
    // Horario: 8pm-12am EST (00:00-04:00 UTC)
    this.startHour = config.startHour || 0;
    this.endHour = config.endHour || 4;

    // Estrategia: Mean reversion en rangos
    this.period = config.period || 20;
    this.zScoreThreshold = config.zScoreThreshold || 1.8; // Más estricto (menos señales)

    this.stopLoss = config.stopLoss || 0.0035; // 0.35%
    this.takeProfit = config.takeProfit || 0.007; // 0.7% (target más conservador)

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < this.period + 14) return null;

    // Filtrar por hora (solo operar en Asian session)
    const date = new Date(data.timestamps[i]);
    const hour = date.getHours() + date.getMinutes() / 60;

    if (hour < this.startHour || hour >= this.endHour) {
      return null; // Fuera del horario especializado
    }

    const price = data.closes[i];
    const sma20 = data.sma20[i];
    const stdDev = data.stdDev20[i];
    const rsi = data.rsi[i];

    if (sma20 === null || stdDev === null || rsi === null) return null;

    const zScore = (price - sma20) / stdDev;

    // Reversión desde sobrecompra (SHORT)
    if (zScore > this.zScoreThreshold && rsi > 65) {
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.60,
        reason: `Asian SHORT - Z: ${zScore.toFixed(2)}, RSI: ${rsi.toFixed(1)}`,
        system: 'ASIAN_SESSION_SPECIALIST'
      };
    }

    // Reversión desde sobreventa (LONG)
    if (zScore < -this.zScoreThreshold && rsi < 35) {
      return {
        type: 'LONG',
        entry: price,
        stop: price * (1 - this.stopLoss),
        target: price * (1 + this.takeProfit),
        confidence: 0.60,
        reason: `Asian LONG - Z: ${zScore.toFixed(2)}, RSI: ${rsi.toFixed(1)}`,
        system: 'ASIAN_SESSION_SPECIALIST'
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
      } else {
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }

      // Time-based exit (15 períodos = 75 min, más tiempo en rangos)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 15 && !exitPrice) {
        exitPrice = currentPrice;
        exitReason = 'TIME_EXIT';
      }

      if (exitPrice) {
        const pnl = pos.type === 'LONG'
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;

        this.trades.push({
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl,
          success: pnl > 0,
          exitReason,
          duration: i - entryIndex
        });

        this.positions.splice(j, 1);
      }
    }
  }
}
