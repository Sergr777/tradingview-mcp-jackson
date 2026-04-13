/**
 * Sistema 1: Turtle Soup CTR (ULTRA-PERMISIVO)
 * Estrategia: Falsas rupturas de High/Low 20 períodos
 * Versión: Parámetros extremadamente relajados para debugging
 */

export class TurtleSoupCTRULTRA {
  constructor(config = {}) {
    // PARÁMETROS ULTRA-PERMISIVOS (para debugging)
    this.highLowPeriod = config.highLowPeriod || 20;
    this.rsiLongThreshold = config.rsiLongThreshold || 45; // 40 → 45 (casi sin filtro)
    this.rsiShortThreshold = config.rsiShortThreshold || 55; // 60 → 55 (casi sin filtro)
    this.highLowThreshold = config.highLowThreshold || 0.0001; // 0.1% → 0.01% (cualquier ruptura)
    this.stopLossMultiplier = config.stopLossMultiplier || 0.003; // 0.3%
    this.takeProfitMultiplier = config.takeProfitMultiplier || 0.009; // 0.9%

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < this.highLowPeriod + 14) return null;

    const currentHigh = data.highs[i];
    const currentLow = data.lows[i];
    const high20 = data.high20[i];
    const low20 = data.low20[i];
    const rsi = data.rsi[i];
    const volume = data.volumes[i];

    if (high20 === null || low20 === null || rsi === null) return null;

    // Calcular volumen promedio
    const volumesSlice = data.volumes.slice(i - 20, i);
    const avgVolume = volumesSlice.reduce((a, b) => a + b, 0) / 20;

    // Detectar nueva barrida de high (SIN filtro de volumen)
    if (currentHigh > high20) {
      const highBreakout = (currentHigh - high20) / high20;

      if (highBreakout > this.highLowThreshold &&
          rsi < this.rsiShortThreshold) {

        const stopLoss = currentHigh * (1 + this.stopLossMultiplier);
        const takeProfit = currentHigh * (1 - this.takeProfitMultiplier);

        return {
          type: 'SHORT',
          entry: currentHigh,
          stop: stopLoss,
          target: takeProfit,
          confidence: 0.50,
          reason: `Turtle Soup SHORT ULTRA - Breakout: ${(highBreakout * 100).toFixed(3)}%, RSI: ${rsi.toFixed(1)}`,
          system: 'TURTLE_SOUP_CTR_ULTRA'
        };
      }
    }

    // Detectar nueva barrida de low (SIN filtro de volumen)
    if (currentLow < low20) {
      const lowBreakout = (low20 - currentLow) / low20;

      if (lowBreakout > this.highLowThreshold &&
          rsi > this.rsiLongThreshold) {

        const stopLoss = currentLow * (1 - this.stopLossMultiplier);
        const takeProfit = currentLow * (1 + this.takeProfitMultiplier);

        return {
          type: 'LONG',
          entry: currentLow,
          stop: stopLoss,
          target: takeProfit,
          confidence: 0.50,
          reason: `Turtle Soup LONG ULTRA - Breakout: ${(lowBreakout * 100).toFixed(3)}%, RSI: ${rsi.toFixed(1)}`,
          system: 'TURTLE_SOUP_CTR_ULTRA'
        };
      }
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
