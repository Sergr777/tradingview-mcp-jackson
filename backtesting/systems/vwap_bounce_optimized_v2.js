/**
 * VWAP Bounce - OPTIMIZADO V2
 * Optimizaciones implementadas:
 * 1. Filtros más estrictos: RSI 65/35 → 60/40
 * 2. Filtrar horas 9:00-11:00 (peores horas)
 * 3. Aumentar volumen confirm: 1.2x → 1.5x
 * 4. Aumentar ligeramente take profit: 0.75% → 0.80%
 */

export class VWAPBounceOptimizedV2 {
  constructor(config = {}) {
    this.vwapThreshold = config.vwapThreshold || 0.0015; // 0.15%

    // Optimización V2: Aumentar volumen confirm
    this.volumeMultiplier = config.volumeMultiplier || 1.5; // 1.2x → 1.5x

    this.stopLoss = config.stopLoss || 0.0025; // 0.25%

    // Optimización V2: Aumentar take profit
    this.takeProfit = config.takeProfit || 0.008; // 0.75% → 0.80%

    // Optimización V2: Filtros RSI más estrictos
    this.rsiLongThreshold = config.rsiLongThreshold || 60; // 65 → 60
    this.rsiShortThreshold = config.rsiShortThreshold || 40; // 35 → 40

    // Optimización V2: Filtrar horas malas
    this.filterBadHours = config.filterBadHours !== false;
    this.badHours = [9, 10, 11]; // 9am-11pm

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

    const deviation = (price - vwap) / vwap;
    const volumeConfirm = volume > avgVolume * this.volumeMultiplier;

    // Detectar rebote desde abajo (LONG)
    if (deviation > -this.vwapThreshold &&
        deviation < 0 &&
        volumeConfirm &&
        rsi < this.rsiLongThreshold) { // Filtro RSI más estricto

      const stopLoss = price * (1 - this.stopLoss);
      const takeProfit = price * (1 + this.takeProfit);

      return {
        type: 'LONG',
        entry: price,
        stop: stopLoss,
        target: takeProfit,
        confidence: 0.70,
        reason: `VWAP V2 LONG - RSI: ${rsi.toFixed(1)}, Dev: ${(deviation * 100).toFixed(3)}%`,
        system: 'VWAP_BOUNCE_OPT_V2'
      };
    }

    // Detectar rechazo desde arriba (SHORT)
    if (deviation < this.vwapThreshold &&
        deviation > 0 &&
        volumeConfirm &&
        rsi > this.rsiShortThreshold) { // Filtro RSI más estricto

      const stopLoss = price * (1 + this.stopLoss);
      const takeProfit = price * (1 - this.takeProfit);

      return {
        type: 'SHORT',
        entry: price,
        stop: stopLoss,
        target: takeProfit,
        confidence: 0.70,
        reason: `VWAP V2 SHORT - RSI: ${rsi.toFixed(1)}, Dev: ${(deviation * 100).toFixed(3)}%`,
        system: 'VWAP_BOUNCE_OPT_V2'
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
