/**
 * Sistema 1: Turtle Soup CTR
 * Estrategia: Falsas rupturas de High/Low 20 períodos
 * Tasa éxito esperada: 40-60%
 */

export class TurtleSoupCTR {
  constructor(config = {}) {
    this.highLowPeriod = config.highLowPeriod || 20;
    this.rsiLongThreshold = config.rsiLongThreshold || 35;
    this.rsiShortThreshold = config.rsiShortThreshold || 65;
    this.highLowThreshold = config.highLowThreshold || 0.002; // 0.2%
    this.stopLossMultiplier = config.stopLossMultiplier || 0.004; // 0.4%
    this.takeProfitMultiplier = config.takeProfitMultiplier || 0.012; // 1.2%

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < this.highLowPeriod + 14) return null; // Necesita High/Low 20 + RSI 14

    const currentHigh = data.highs[i];
    const currentLow = data.lows[i];
    const high20 = data.high20[i];
    const low20 = data.low20[i];
    const rsi = data.rsi[i];
    const volume = data.volumes[i];

    // Calcular volumen promedio
    const volumesSlice = data.volumes.slice(i - 20, i);
    const avgVolume = volumesSlice.reduce((a, b) => a + b, 0) / 20;

    // Detectar nueva barrida de high
    if (currentHigh > high20 && high20 !== null) {
      const highBreakout = (currentHigh - high20) / high20;

      if (highBreakout > this.highLowThreshold &&
          rsi < this.rsiShortThreshold &&
          rsi !== null &&
          volume > avgVolume) {

        const stopLoss = currentHigh * (1 + this.stopLossMultiplier);
        const takeProfit = currentHigh * (1 - this.takeProfitMultiplier);

        return {
          type: 'SHORT',
          entry: currentHigh,
          stop: stopLoss,
          target: takeProfit,
          confidence: 0.50,
          reason: 'Turtle Soup SHORT - False breakout high',
          system: 'TURTLE_SOUP_CTR'
        };
      }
    }

    // Detectar nueva barrida de low
    if (currentLow < low20 && low20 !== null) {
      const lowBreakout = (low20 - currentLow) / low20;

      if (lowBreakout > this.highLowThreshold &&
          rsi > this.rsiLongThreshold &&
          rsi !== null &&
          volume > avgVolume) {

        const stopLoss = currentLow * (1 - this.stopLossMultiplier);
        const takeProfit = currentLow * (1 + this.takeProfitMultiplier);

        return {
          type: 'LONG',
          entry: currentLow,
          stop: stopLoss,
          target: takeProfit,
          confidence: 0.50,
          reason: 'Turtle Soup LONG - False breakout low',
          system: 'TURTLE_SOUP_CTR'
        };
      }
    }

    return null;
  }

  execute(signal, data, i) {
    // Solo ejecutar si no hay posición abierta
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
        // Check take profit
        if (currentPrice >= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        }
        // Check stop loss
        else if (currentPrice <= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      } else { // SHORT
        // Check take profit
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        }
        // Check stop loss
        else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }

      // Time-based exit (20 períodos = 100 minutos en 5m)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 20 && !exitPrice) {
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
