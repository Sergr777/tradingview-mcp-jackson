/**
 * Turtle Soup CTR - OPTIMIZADO V2
 * Optimizaciones implementadas:
 * 1. Reducir stop loss rate: 0.3% → 0.35% (menos activaciones)
 * 2. Aumentar take profit: 0.9% → 1.0% (mejor R:R)
 * 3. Filtrar horas 10:00-11:00 (peores horas)
 */

export class TurtleSoupCTROptimizedV2 {
  constructor(config = {}) {
    // PARÁMETROS BASE
    this.highLowPeriod = config.highLowPeriod || 20;
    this.rsiLongThreshold = config.rsiLongThreshold || 40;
    this.rsiShortThreshold = config.rsiShortThreshold || 60;
    this.highLowThreshold = config.highLowThreshold || 0.001;

    // Optimización V2: Aumentar stop loss
    this.stopLossMultiplier = config.stopLossMultiplier || 0.0035; // 0.3% → 0.35%

    // Optimización V2: Aumentar take profit
    this.takeProfitMultiplier = config.takeProfitMultiplier || 0.01; // 0.9% → 1.0%

    // Optimización V2: Filtrar horas malas
    this.filterBadHours = config.filterBadHours !== false;
    this.badHours = [10, 11]; // 10am-11pm

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < this.highLowPeriod + 14) return null;

    const currentHigh = data.highs[i];
    const currentLow = data.lows[i];
    const high20 = data.high20_corrected[i];
    const low20 = data.low20_corrected[i];
    const rsi = data.rsi[i];
    const volume = data.volumes[i];

    if (high20 === null || low20 === null || rsi === null) return null;

    // Optimización V2: Filtrar horas malas
    if (this.filterBadHours) {
      const hour = new Date(data.timestamps[i]).getHours();
      if (this.badHours.includes(hour)) {
        return null; // Skip trades en horas malas
      }
    }

    // Calcular volumen promedio
    const volumesSlice = data.volumes.slice(i - 20, i);
    const avgVolume = volumesSlice.reduce((a, b) => a + b, 0) / 20;

    // Detectar nueva barrida de high
    if (currentHigh > high20) {
      const highBreakout = (currentHigh - high20) / high20;

      if (highBreakout > this.highLowThreshold &&
          rsi < this.rsiShortThreshold &&
          volume > avgVolume * 0.5) {

        const stopLoss = currentHigh * (1 + this.stopLossMultiplier);
        const takeProfit = currentHigh * (1 - this.takeProfitMultiplier);

        return {
          type: 'SHORT',
          entry: currentHigh,
          stop: stopLoss,
          target: takeProfit,
          confidence: 0.52, // Ligeramente menor (0.50 → 0.52)
          reason: `Turtle Soup V2 SHORT - Breakout: ${(highBreakout * 100).toFixed(3)}%, RSI: ${rsi.toFixed(1)}`,
          system: 'TURTLE_SOUP_CTR_OPT_V2'
        };
      }
    }

    // Detectar nueva barrida de low
    if (currentLow < low20) {
      const lowBreakout = (low20 - currentLow) / low20;

      if (lowBreakout > this.highLowThreshold &&
          rsi > this.rsiLongThreshold &&
          volume > avgVolume * 0.5) {

        const stopLoss = currentLow * (1 - this.stopLossMultiplier);
        const takeProfit = currentLow * (1 + this.takeProfitMultiplier);

        return {
          type: 'LONG',
          entry: currentLow,
          stop: stopLoss,
          target: takeProfit,
          confidence: 0.52,
          reason: `Turtle Soup V2 LONG - Breakout: ${(lowBreakout * 100).toFixed(3)}%, RSI: ${rsi.toFixed(1)}`,
          system: 'TURTLE_SOUP_CTR_OPT_V2'
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
