/**
 * Mean Reversion - CON TAKE PARCIALES
 * Estrategia:
 * - TP1: 50% del recorrido (cerrar 50% posición, mover SL a break-even)
 * - TP2: 100% del target (cerrar 50% restante)
 * - Si SL se mueve a break-even, riesgo cero en la segunda mitad
 */

export class MeanReversionTPPartial {
  constructor(config = {}) {
    this.period = config.period || 20;
    this.zScoreThreshold = config.zScoreThreshold || 1.5;
    this.stopLoss = config.stopLoss || 0.004; // 0.4%
    this.takeProfit = config.takeProfit || 0.008; // 0.8%

    // Configuración de take parciales
    this.tp1Ratio = config.tp1Ratio || 0.5; // 50% del target
    this.tp1CloseRatio = config.tp1CloseRatio || 0.5; // Cerrar 50% de posición
    this.moveSLToBreakEven = config.moveSLToBreakEven !== false; // Mover SL a break-even

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < this.period) return null;

    const price = data.closes[i];
    const sma20 = data.sma20[i];
    const stdDev = data.stdDev20[i];

    if (sma20 === null || stdDev === null) return null;

    const zScore = (price - sma20) / stdDev;

    // Precio sobreextendido al alza → SHORT
    if (zScore > this.zScoreThreshold) {
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.55,
        isHedge: false,
        reason: `Mean Reversion TP-Patial SHORT - Z-score: ${zScore.toFixed(2)}`,
        system: 'MEAN_REVERSION_TP_PARTIAL'
      };
    }

    // Precio sobreextendido a la baja → LONG
    if (zScore < -this.zScoreThreshold) {
      return {
        type: 'LONG',
        entry: price,
        stop: price * (1 - this.stopLoss),
        target: price * (1 + this.takeProfit),
        confidence: 0.55,
        isHedge: false,
        reason: `Mean Reversion TP-Partial LONG - Z-score: ${zScore.toFixed(2)}`,
        system: 'MEAN_REVERSION_TP_PARTIAL'
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
      tp1: signal.type === 'LONG'
        ? signal.entry * (1 + this.takeProfit * this.tp1Ratio)
        : signal.entry * (1 - this.takeProfit * this.tp1Ratio),
      tp2: signal.target,
      confidence: signal.confidence,
      isHedge: signal.isHedge,
      reason: signal.reason,
      // Track partial position state
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
      let closeRatio = 1.0; // Porción de posición a cerrar

      // Calcular TP1 (mitad del recorrido)
      if (!pos.tp1Hit) {
        const tp1Hit = pos.type === 'LONG'
          ? currentPrice >= pos.tp1
          : currentPrice <= pos.tp1;

        if (tp1Hit) {
          console.log(`   TP1 HIT: ${pos.type} @ ${currentPrice.toFixed(2)} - Cerrando 50%, moviendo SL a break-even`);

          // Cerrar 50% en TP1
          const tp1Pnl = pos.type === 'LONG'
            ? (pos.tp1 - pos.entryPrice) / pos.entryPrice
            : (pos.entryPrice - pos.tp1) / pos.entryPrice;

          this.trades.push({
            ...pos,
            exitTime: data.timestamps[i],
            exitPrice: pos.tp1,
            pnl: tp1Pnl * pos.tp1CloseRatio, // PnL proporcional al 50% cerrado
            success: tp1Pnl > 0,
            exitReason: 'TP1',
            duration: i - data.timestamps.findIndex(t => t === pos.entryTime),
            closeRatio: pos.tp1CloseRatio
          });

          // Actualizar estado
          pos.tp1Hit = true;
          pos.currentPositionSize = 1.0 - pos.tp1CloseRatio; // 50% restante

          // Mover stop loss a break-even
          if (this.moveSLToBreakEven) {
            pos.stopLoss = pos.entryPrice; // Break-even
            pos.slMovedToBreakEven = true;
          }

          // No cerrar la posición principal, continuar con 50% restante
          continue;
        }
      }

      // TP2 (target completo) para el 50% restante
      const tp2Hit = pos.type === 'LONG'
        ? currentPrice >= pos.tp2
        : currentPrice <= pos.tp2;

      if (tp2Hit) {
        exitPrice = pos.tp2;
        exitReason = 'TP2';
        closeRatio = pos.currentPositionSize; // Cerrar el 50% restante
      }

      // Stop Loss (afecta solo a la porción restante)
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

      // Time-based exit (12 períodos = 60 minutos)
      if (!exitPrice) {
        const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
        if (i - entryIndex >= 12) {
          exitPrice = currentPrice;
          exitReason = 'TIME_EXIT';
          closeRatio = pos.currentPositionSize;
        }
      }

      if (exitPrice) {
        const pnl = pos.type === 'LONG'
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;

        const closedTrade = {
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl: pnl * closeRatio, // PnL proporcional a la porción cerrada
          success: pnl > 0,
          exitReason,
          duration: i - data.timestamps.findIndex(t => t === pos.entryTime),
          closeRatio
        };

        this.trades.push(closedTrade);
        this.positions.splice(j, 1);
      }
    }
  }
}
