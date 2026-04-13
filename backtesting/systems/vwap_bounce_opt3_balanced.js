/**
 * VWAP Bounce - OPTIMIZACIÓN 3: BALANCEADA
 * Cambios:
 * - Aumentar vwapThreshold: 0.1% → 0.15% (moderadamente más permisivo)
 * - Mantener volumen confirm: 1.2x (sin cambios)
 * - Añadir filtro RSI suave (evitar extremos)
 * - Reducir stop loss: 0.3% → 0.25%
 * - Aumentar take profit: 0.6% → 0.75% (R:R 3:1)
 * - Aumentar time exit: 15 → 20 períodos
 */

export class VWAPBounceOpt3Balanced {
  constructor(config = {}) {
    this.vwapThreshold = config.vwapThreshold || 0.0015; // 0.1% → 0.15%
    this.volumeMultiplier = config.volumeMultiplier || 1.2; // Sin cambios
    this.stopLoss = config.stopLoss || 0.0025; // 0.3% → 0.25%
    this.takeProfit = config.takeProfit || 0.0075; // 0.6% → 0.75% (R:R 3:1)

    // Filtros suaves
    this.rsiLongThreshold = config.rsiLongThreshold || 65; // No LONG si RSI > 65
    this.rsiShortThreshold = config.rsiShortThreshold || 35; // No SHORT si RSI < 35

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < 100) return null; // VWAP requiere 100 períodos

    const price = data.closes[i];
    const vwap = data.vwap[i];
    const volume = data.volumes[i];
    const rsi = data.rsi[i];

    if (vwap === null || rsi === null) return null;

    // Calcular volumen promedio
    const volumesSlice = data.volumes.slice(i - 20, i);
    const avgVolume = volumesSlice.reduce((a, b) => a + b, 0) / 20;

    const deviation = (price - vwap) / vwap;
    const volumeConfirm = volume > avgVolume * this.volumeMultiplier;

    // Detectar rebote desde abajo (LONG)
    if (deviation > -this.vwapThreshold &&
        deviation < 0 &&
        volumeConfirm &&
        rsi < this.rsiLongThreshold) { // Filtro RSI suave

      const stopLoss = price * (1 - this.stopLoss);
      const takeProfit = price * (1 + this.takeProfit);

      return {
        type: 'LONG',
        entry: price,
        stop: stopLoss,
        target: takeProfit,
        confidence: 0.68,
        reason: `VWAP Bounce LONG - RSI: ${rsi.toFixed(1)}, Dev: ${(deviation * 100).toFixed(3)}%`,
        system: 'VWAP_BOUNCE_OPT3_BALANCED'
      };
    }

    // Detectar rechazo desde arriba (SHORT)
    if (deviation < this.vwapThreshold &&
        deviation > 0 &&
        volumeConfirm &&
        rsi > this.rsiShortThreshold) { // Filtro RSI suave

      const stopLoss = price * (1 + this.stopLoss);
      const takeProfit = price * (1 - this.takeProfit);

      return {
        type: 'SHORT',
        entry: price,
        stop: stopLoss,
        target: takeProfit,
        confidence: 0.68,
        reason: `VWAP Bounce SHORT - RSI: ${rsi.toFixed(1)}, Dev: ${(deviation * 100).toFixed(3)}%`,
        system: 'VWAP_BOUNCE_OPT3_BALANCED'
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

      // Time-based exit (20 períodos = 100 minutos)
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
