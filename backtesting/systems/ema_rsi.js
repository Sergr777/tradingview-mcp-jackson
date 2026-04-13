/**
 * Sistema 3: EMA 8 + RSI
 * Estrategia: Momentum con cruce de medias y confirmación RSI
 * Tasa éxito esperada: 50-60%
 */

export class EMARSI {
  constructor(config = {}) {
    this.emaPeriod = config.emaPeriod || 8;
    this.rsiPeriod = config.rsiPeriod || 14;
    this.rsiThreshold = config.rsiThreshold || 50;
    this.stopLoss = config.stopLoss || 0.004;
    this.takeProfit = config.takeProfit || 0.008;

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < this.emaPeriod + this.rsiPeriod) return null;

    const price = data.closes[i];
    const prevPrice = data.closes[i - 1];
    const ema8 = data.ema8[i];
    const prevEma8 = data.ema8[i - 1];
    const rsi = data.rsi[i];
    const prevRsi = data.rsi[i - 1];

    if (ema8 === null || rsi === null || prevEma8 === null || prevRsi === null) {
      return null;
    }

    // Detectar cruce alcista
    const bullishCrossover = prevPrice < prevEma8 && price > ema8;
    const rsiConfirm = rsi < this.rsiThreshold && rsi > prevRsi;

    if (bullishCrossover && rsiConfirm) {
      return {
        type: 'LONG',
        entry: price,
        stop: price * (1 - this.stopLoss),
        target: price * (1 + this.takeProfit),
        confidence: 0.60,
        reason: 'EMA8+RSI LONG - Bullish crossover',
        system: 'EMA8_RSI'
      };
    }

    // Detectar cruce bajista
    const bearishCrossover = prevPrice > prevEma8 && price < ema8;
    const rsiConfirmBearish = rsi > this.rsiThreshold && rsi < prevRsi;

    if (bearishCrossover && rsiConfirmBearish) {
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.60,
        reason: 'EMA8+RSI SHORT - Bearish crossover',
        system: 'EMA8_RSI'
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
      } else { // SHORT
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }

      // Time-based exit (10 períodos = 50 minutos)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 10 && !exitPrice) {
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
