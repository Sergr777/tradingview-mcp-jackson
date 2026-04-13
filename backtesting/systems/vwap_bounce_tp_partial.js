/**
 * VWAP Bounce - CON TAKE PARCIALES
 * Estrategia:
 * - TP1: 50% del recorrido (cerrar 50% posición, mover SL a break-even)
 * - TP2: 100% del target (cerrar 50% restante)
 * - Si SL se mueve a break-even, riesgo cero en la segunda mitad
 */

export class VWAPBounceTPPartial {
  constructor(config = {}) {
    this.vwapThreshold = config.vwapThreshold || 0.0015;
    this.volumeMultiplier = config.volumeMultiplier || 1.2;
    this.stopLoss = config.stopLoss || 0.0025;
    this.takeProfit = config.takeProfit || 0.0075;

    // Filtros RSI
    this.rsiLongThreshold = config.rsiLongThreshold || 65;
    this.rsiShortThreshold = config.rsiShortThreshold || 35;

    // Configuración de take parciales
    this.tp1Ratio = config.tp1Ratio || 0.5; // 50% del target
    this.tp1CloseRatio = config.tp1CloseRatio || 0.5; // Cerrar 50% de posición
    this.moveSLToBreakEven = config.moveSLToBreakEven !== false;

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < 100) return null;

    const price = data.closes[i];
    const vwap = data.vwap[i];
    const volume = data.volumes[i];
    const rsi = data.rsi[i];

    if (vwap === null || rsi === null) return null;

    const volumesSlice = data.volumes.slice(i - 20, i);
    const avgVolume = volumesSlice.reduce((a, b) => a + b, 0) / 20;

    const deviation = (price - vwap) / vwap;
    const volumeConfirm = volume > avgVolume * this.volumeMultiplier;

    if (deviation > -this.vwapThreshold &&
        deviation < 0 &&
        volumeConfirm &&
        rsi < this.rsiLongThreshold) {

      const stopLoss = price * (1 - this.stopLoss);
      const takeProfit = price * (1 + this.takeProfit);

      return {
        type: 'LONG',
        entry: price,
        stop: stopLoss,
        target: takeProfit,
        confidence: 0.68,
        reason: `VWAP TP-Partial LONG - RSI: ${rsi.toFixed(1)}, Dev: ${(deviation * 100).toFixed(3)}%`,
        system: 'VWAP_BOUNCE_TP_PARTIAL'
      };
    }

    if (deviation < this.vwapThreshold &&
        deviation > 0 &&
        volumeConfirm &&
        rsi > this.rsiShortThreshold) {

      const stopLoss = price * (1 + this.stopLoss);
      const takeProfit = price * (1 - this.takeProfit);

      return {
        type: 'SHORT',
        entry: price,
        stop: stopLoss,
        target: takeProfit,
        confidence: 0.68,
        reason: `VWAP TP-Partial SHORT - RSI: ${rsi.toFixed(1)}, Dev: ${(deviation * 100).toFixed(3)}%`,
        system: 'VWAP_BOUNCE_TP_PARTIAL'
      };
    }

    return null;
  }

  execute(signal, data, i) {
    if (this.positions.length > 0) return null;

    const fullTargetMove = signal.type === 'LONG'
      ? signal.target - signal.entry
      : signal.entry - signal.target;

    const trade = {
      system: signal.system,
      entryTime: data.timestamps[i],
      entryPrice: signal.entry,
      type: signal.type,
      stopLoss: signal.stop,
      takeProfit: signal.target,
      tp1: signal.type === 'LONG'
        ? signal.entry + fullTargetMove * this.tp1Ratio
        : signal.entry - fullTargetMove * this.tp1Ratio,
      tp2: signal.target,
      confidence: signal.confidence,
      reason: signal.reason,
      tp1Hit: false,
      slMovedToBreakEven: false,
      originalPositionSize: 1.0,
      currentPositionSize: 1.0
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
      let closeRatio = 1.0;

      if (!pos.tp1Hit) {
        const tp1Hit = pos.type === 'LONG'
          ? currentPrice >= pos.tp1
          : currentPrice <= pos.tp1;

        if (tp1Hit) {
          const tp1Pnl = pos.type === 'LONG'
            ? (pos.tp1 - pos.entryPrice) / pos.entryPrice
            : (pos.entryPrice - pos.tp1) / pos.entryPrice;

          this.trades.push({
            ...pos,
            exitTime: data.timestamps[i],
            exitPrice: pos.tp1,
            pnl: tp1Pnl * pos.tp1CloseRatio,
            success: tp1Pnl > 0,
            exitReason: 'TP1',
            duration: i - data.timestamps.findIndex(t => t === pos.entryTime),
            closeRatio: pos.tp1CloseRatio
          });

          pos.tp1Hit = true;
          pos.currentPositionSize = 1.0 - pos.tp1CloseRatio;

          if (this.moveSLToBreakEven) {
            pos.stopLoss = pos.entryPrice;
            pos.slMovedToBreakEven = true;
          }

          continue;
        }
      }

      const tp2Hit = pos.type === 'LONG'
        ? currentPrice >= pos.tp2
        : currentPrice <= pos.tp2;

      if (tp2Hit) {
        exitPrice = pos.tp2;
        exitReason = 'TP2';
        closeRatio = pos.currentPositionSize;
      }

      if (!exitPrice) {
        const slHit = pos.type === 'LONG'
          ? currentPrice <= pos.stopLoss
          : currentPrice >= pos.stopLoss;

        if (slHit) {
          exitPrice = pos.stopLoss;
          exitReason = pos.slMovedToBreakEven ? 'STOP_LOSS_BE' : 'STOP_LOSS';
          closeRatio = pos.currentPositionSize;
        }
      }

      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 20 && !exitPrice) {
        exitPrice = currentPrice;
        exitReason = 'TIME_EXIT';
        closeRatio = pos.currentPositionSize;
      }

      if (exitPrice) {
        const pnl = pos.type === 'LONG'
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;

        const closedTrade = {
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl: pnl * closeRatio,
          success: pnl > 0,
          exitReason,
          duration: i - entryIndex,
          closeRatio
        };

        this.trades.push(closedTrade);
        this.positions.splice(j, 1);
      }
    }
  }
}
