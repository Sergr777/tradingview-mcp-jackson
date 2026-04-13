/**
 * Sistema 2: VWAP Bounce
 * Estrategia: Rebotes en VWAP con confirmación de volumen
 * Tasa éxito esperada: 55-65%
 */

export class VWAPBounce {
  constructor(config = {}) {
    this.vwapThreshold = config.vwapThreshold || 0.001; // 0.1%
    this.volumeMultiplier = config.volumeMultiplier || 1.2;
    this.stopLoss = config.stopLoss || 0.003; // 0.3%
    this.takeProfit = config.takeProfit || 0.006; // 0.6%

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
        confidence: 0.65,
        reason: 'VWAP Bounce LONG - Rebound from below',
        system: 'VWAP_BOUNCE'
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
        confidence: 0.65,
        reason: 'VWAP Bounce SHORT - Rejection from above',
        system: 'VWAP_BOUNCE'
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

      // Time-based exit (15 períodos = 75 minutos)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 15 && !exitPrice) {
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
