/**
 * SISTEMA ESPECIALISTA: US Session Open (9:30am-11am EST)
 * Características:
 * - Apertura de Wall Street
 * - Alta volatilidad inicial
 * - Fake breaks comunes
 * - Ideal para: Turtle Soup + confirmaciones
 */

export class USSessionOpenSpecialist {
  constructor(config = {}) {
    // Horario: 9:30am-11am EST (14:30-16:00 UTC)
    this.startHour = config.startHour || 14.5;
    this.endHour = config.endHour || 16;

    // Estrategia: Turtle Soup mejorado con confirmaciones
    this.highLowPeriod = config.highLowPeriod || 20;
    this.rsiLongThreshold = config.rsiLongThreshold || 38;
    this.rsiShortThreshold = config.rsiShortThreshold || 62;
    this.highLowThreshold = config.highLowThreshold || 0.0008; // 0.08% (muy sensible)

    this.stopLossMultiplier = config.stopLossMultiplier || 0.0035;
    this.takeProfitMultiplier = config.takeProfitMultiplier || 0.008;

    this.positions = [];
    this.trades = [];
  }

  detect(data, i) {
    if (i < this.highLowPeriod + 14) return null;

    // Filtrar por hora (solo operar en US Session Open)
    const date = new Date(data.timestamps[i]);
    const hour = date.getHours() + date.getMinutes() / 60;

    if (hour < this.startHour || hour >= this.endHour) {
      return null;
    }

    const currentHigh = data.highs[i];
    const currentLow = data.lows[i];
    const high20 = data.high20_corrected[i];
    const low20 = data.low20_corrected[i];
    const rsi = data.rsi[i];
    const volume = data.volumes[i];

    if (high20 === null || low20 === null || rsi === null) return null;

    const volumesSlice = data.volumes.slice(i - 20, i);
    const avgVolume = volumesSlice.reduce((a, b) => a + b, 0) / 20;

    // Detectar barrida de high (false breakout)
    if (currentHigh > high20) {
      const highBreakout = (currentHigh - high20) / high20;

      if (highBreakout > this.highLowThreshold &&
          rsi < this.rsiShortThreshold &&
          volume > avgVolume * 0.6) {

        return {
          type: 'SHORT',
          entry: currentHigh,
          stop: currentHigh * (1 + this.stopLossMultiplier),
          target: currentHigh * (1 - this.takeProfitMultiplier),
          confidence: 0.55,
          reason: `US Open SHORT - Breakout: ${(highBreakout * 100).toFixed(3)}%, RSI: ${rsi.toFixed(1)}`,
          system: 'US_SESSION_OPEN_SPECIALIST'
        };
      }
    }

    // Detectar barrida de low (false breakout)
    if (currentLow < low20) {
      const lowBreakout = (low20 - currentLow) / low20;

      if (lowBreakout > this.highLowThreshold &&
          rsi > this.rsiLongThreshold &&
          volume > avgVolume * 0.6) {

        return {
          type: 'LONG',
          entry: currentLow,
          stop: currentLow * (1 - this.stopLossMultiplier),
          target: currentLow * (1 + this.takeProfitMultiplier),
          confidence: 0.55,
          reason: `US Open LONG - Breakout: ${(lowBreakout * 100).toFixed(3)}%, RSI: ${rsi.toFixed(1)}`,
          system: 'US_SESSION_OPEN_SPECIALIST'
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
      } else {
        if (currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit;
          exitReason = 'TAKE_PROFIT';
        } else if (currentPrice >= pos.stopLoss) {
          exitPrice = pos.stopLoss;
          exitReason = 'STOP_LOSS';
        }
      }

      // Time-based exit (15 períodos = 75 min)
      const entryIndex = data.timestamps.findIndex(t => t === pos.entryTime);
      if (i - entryIndex >= 15 && !exitPrice) {
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
