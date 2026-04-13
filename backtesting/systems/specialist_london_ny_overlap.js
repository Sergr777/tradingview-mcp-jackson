/**
 * SISTEMA ESPECIALISTA: London/NY Overlap (8am-12pm EST)
 * Características:
 * - Mayor volatilidad del día
 * - Máximo volumen
 * - Movimientos direccionales fuertes
 * - Ideal para: Momentum y breakouts
 */

export class LondonNyOverlapSpecialist {
  constructor(config = {}) {
    // Horario: 8am-12pm EST (13:00-17:00 UTC aprox)
    this.startHour = config.startHour || 13; // UTC
    this.endHour = config.endHour || 17;

    // Estrategia: Momentum agresivo
    this.emaPeriod = config.emaPeriod || 8;
    this.emaSlowPeriod = config.emaSlowPeriod || 21;
    this.rsiThreshold = config.rsiThreshold || 50;
    this.adxThreshold = config.adxThreshold || 25; // Requiere tendencia fuerte

    this.stopLoss = config.stopLoss || 0.003; // 0.3% (más ajustado por alta volatilidad)
    this.takeProfit = config.takeProfit || 0.009; // 0.9% (target más grande)

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < Math.max(this.emaPeriod, this.emaSlowPeriod, 14)) return null;

    // Filtrar por hora (solo operar en London/NY overlap)
    const date = new Date(data.timestamps[i]);
    const hour = date.getHours() + date.getMinutes() / 60;

    if (hour < this.startHour || hour >= this.endHour) {
      return null; // Fuera del horario especializado
    }

    const emaFast = data.ema8[i];
    const emaSlow = data.ema20[i];
    const rsi = data.rsi[i];
    const adx = data.adx[i];

    if (emaFast === null || emaSlow === null || rsi === null || adx === null) return null;

    // Requerir tendencia fuerte (ADX > 25)
    if (adx < this.adxThreshold) return null;

    // Detectar cruce alcista (momentum)
    if (emaFast > emaSlow && rsi > this.rsiThreshold) {
      const price = data.closes[i];
      return {
        type: 'LONG',
        entry: price,
        stop: price * (1 - this.stopLoss),
        target: price * (1 + this.takeProfit),
        confidence: 0.70,
        reason: `London/NY LONG - EMA8>EMA21, RSI: ${rsi.toFixed(1)}, ADX: ${adx.toFixed(1)}`,
        system: 'LONDON_NY_OVERLAP_SPECIALIST'
      };
    }

    // Detectar cruce bajista
    if (emaFast < emaSlow && rsi < (100 - this.rsiThreshold)) {
      const price = data.closes[i];
      return {
        type: 'SHORT',
        entry: price,
        stop: price * (1 + this.stopLoss),
        target: price * (1 - this.takeProfit),
        confidence: 0.70,
        reason: `London/NY SHORT - EMA8<EMA21, RSI: ${rsi.toFixed(1)}, ADX: ${adx.toFixed(1)}`,
        system: 'LONDON_NY_OVERLAP_SPECIALIST'
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
      } else {
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }

      // Time-based exit (10 períodos = 50 min)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 10 && !exitPrice) {
        exitPrice = currentPrice;
        exitReason = 'TIME_EXIT';
      }

      if (exitPrice) {
        const pnl = pos.type === 'LONG'
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;

        this.trades.push({
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice,
          pnl,
          success: pnl > 0,
          exitReason,
          duration: i - entryIndex
        });

        this.positions.splice(j, 1);
      }
    }
  }
}
