/**
 * VWAP Bounce - OPTIMIZACIÓN 2: AGRESIVA
 * Cambios:
 * - Aumentar vwapThreshold: 0.1% → 0.2% (más señales)
 * - Reducir volumen confirm: 1.2x → 1.0x (menos estricto)
 * - Reducir stop loss: 0.3% → 0.2% (menor riesgo por trade)
 * - Aumentar take profit: 0.6% → 0.9% (mejor R:R 4.5:1)
 * - Aumentar time exit: 15 → 25 períodos
 */

export class VWAPBounceOpt2Aggressive {
  constructor(config = {}) {
    this.vwapThreshold = config.vwapThreshold || 0.002; // 0.1% → 0.2% (más permisivo)
    this.volumeMultiplier = config.volumeMultiplier || 1.0; // 1.2x → 1.0x
    this.stopLoss = config.stopLoss || 0.002; // 0.3% → 0.2%
    this.takeProfit = config.takeProfit || 0.009; // 0.6% → 0.9% (R:R 4.5:1)

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < 100) return null; // VWAP requiere 100 períodos

    const price = data.closes[i];
    const vwap = data.vwap[i];
    const volume = data.volumes[i];

    if (vwap === null) return null;

    // Calcular volumen promedio
    const volumesSlice = data.volumes.slice(i - 20, i);
    const avgVolume = volumesSlice.reduce((a, b) => a + b, 0) / 20;

    const deviation = (price - vwap) / vwap;
    const volumeConfirm = volume > avgVolume * this.volumeMultiplier;

    // Detectar rebote desde abajo (LONG)
    if (deviation > -this.vwapThreshold &&
        deviation < 0 &&
        volumeConfirm) {

      const stopLoss = price * (1 - this.stopLoss);
      const takeProfit = price * (1 + this.takeProfit);

      return {
        type: 'LONG',
        entry: price,
        stop: stopLoss,
        target: takeProfit,
        confidence: 0.60,
        reason: `VWAP Bounce LONG - Dev: ${(deviation * 100).toFixed(3)}%`,
        system: 'VWAP_BOUNCE_OPT2_AGGRESSIVE'
      };
    }

    // Detectar rechazo desde arriba (SHORT)
    if (deviation < this.vwapThreshold &&
        deviation > 0 &&
        volumeConfirm) {

      const stopLoss = price * (1 + this.stopLoss);
      const takeProfit = price * (1 - this.takeProfit);

      return {
        type: 'SHORT',
        entry: price,
        stop: stopLoss,
        target: takeProfit,
        confidence: 0.60,
        reason: `VWAP Bounce SHORT - Dev: ${(deviation * 100).toFixed(3)}%`,
        system: 'VWAP_BOUNCE_OPT2_AGGRESSIVE'
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

      // Time-based exit (25 períodos = 125 minutos)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 25 && !exitPrice) {
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
