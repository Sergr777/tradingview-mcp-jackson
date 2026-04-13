/**
 * SISTEMA DE COBERTURA (HEDGE SYSTEM)
 * Propósito: Proteger portafolio contra drawdowns excesivos
 *
 * Estrategia:
 * - Monitorea PnL acumulado de los sistemas principales
 * - Se activa cuando drawdown > threshold (ej: -5%)
 * - Abre posiciones opuestas para reducir exposición neta
 * - Cierra cuando drawdown se recupera (< -2%)
 *
 * NO es un sistema autónomo - es un SEGURO del portafolio
 */

export class PortfolioHedgeSystem {
  constructor(config = {}) {
    // Umbrales de activación
    this.drawdownThreshold = config.drawdownThreshold || 0.05; // 5% drawdown
    this.recoveryThreshold = config.recoveryThreshold || 0.02; // 2% recovery

    // Configuración de hedge
    this.hedgeRatio = config.hedgeRatio || 0.5; // Cubrir 50% de exposición
    this.hedgeLookbackPeriod = config.hedgeLookbackPeriod || 20; // Períodos para calcular exposición

    // Parámetros de trades de hedge
    this.stopLoss = config.stopLoss || 0.002; // 0.2% (muy ajustado)
    this.takeProfit = config.takeProfit || 0.005; // 0.5% (target conservador)

    this.positions = [];
    this.trades = [];
    this.isHedging = false;
  }

  /**
   * Calcula exposición neta del portafolio
   * @param {Array} openPositions - Posiciones abiertas de los sistemas principales
   * @returns {Object} { netExposure, longExposure, shortExposure }
   */
  calculateNetExposure(openPositions) {
    let longExposure = 0;
    let shortExposure = 0;

    for (const pos of openPositions) {
      if (pos.type === 'LONG') {
        longExposure += pos.entryPrice;
      } else {
        shortExposure += pos.entryPrice;
      }
    }

    const netExposure = longExposure - shortExposure;

    return {
      netExposure,
      longExposure,
      shortExposure,
      netType: netExposure > 0 ? 'LONG' : netExposure < 0 ? 'SHORT' : 'NEUTRAL'
    };
  }

  /**
   * Detecta si se necesita hedge
   * @param {Array} mainSystemsTrades - Trades de los sistemas principales
   * @param {Number} cumulativePnL - PnL acumulado del portafolio
   * @returns {Object|null} Signal de hedge o null
   */
  detect(data, i, mainSystemsTrades, cumulativePnL, openPositions) {
    // Si el drawdown es menor al threshold, no hacer nada
    if (cumulativePnL > -this.drawdownThreshold) {
      // Si estamos hedgeados y la recuperación se alcanzó, cerrar hedge
      if (this.isHedging && cumulativePnL > -this.recoveryThreshold) {
        return {
          type: 'CLOSE_HEDGE',
          reason: `Recovery alcanzada - PnL: ${(cumulativePnL * 100).toFixed(2)}%`,
          system: 'PORTFOLIO_HEDGE'
        };
      }
      return null;
    }

    // Drawdown excesivo - activar hedge
    if (cumulativePnL < -this.drawdownThreshold && !this.isHedging) {
      const exposure = this.calculateNetExposure(openPositions);

      // Si no hay exposición neta significativa, no hedge
      if (Math.abs(exposure.netExposure) < 100) {
        return null;
      }

      // Abrir posición opuesta a la exposición neta
      const currentPrice = data.closes[i];
      const hedgeSize = Math.abs(exposure.netExposure) * this.hedgeRatio;

      if (exposure.netType === 'LONG') {
        // Portafolio net LONG → Abrir SHORT hedge
        return {
          type: 'SHORT',
          entry: currentPrice,
          stop: currentPrice * (1 + this.stopLoss),
          target: currentPrice * (1 - this.takeProfit),
          confidence: 0.90, // Alta confianza (es hedge defensivo)
          reason: `Hedge ACTIVO - Drawdown: ${(cumulativePnL * 100).toFixed(2)}%, Exposición: ${exposure.netType} $${Math.abs(exposure.netExposure).toFixed(2)}`,
          system: 'PORTFOLIO_HEDGE'
        };
      } else {
        // Portafolio net SHORT → Abrir LONG hedge
        return {
          type: 'LONG',
          entry: currentPrice,
          stop: currentPrice * (1 - this.stopLoss),
          target: currentPrice * (1 + this.takeProfit),
          confidence: 0.90,
          reason: `Hedge ACTIVO - Drawdown: ${(cumulativePnL * 100).toFixed(2)}%, Exposición: ${exposure.netType} $${Math.abs(exposure.netExposure).toFixed(2)}`,
          system: 'PORTFOLIO_HEDGE'
        };
      }
    }

    return null;
  }

  execute(signal, data, i) {
    if (signal.type === 'CLOSE_HEDGE') {
      // Cerrar todas las posiciones de hedge
      const closedPositions = [];
      for (const pos of this.positions) {
        const lastPrice = data.closes[i];
        const pnl = pos.type === 'LONG'
          ? (lastPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - lastPrice) / pos.entryPrice;

        closedPositions.push({
          ...pos,
          exitTime: data.timestamps[i],
          exitPrice: lastPrice,
          pnl,
          success: pnl > 0,
          exitReason: 'HEDGE_CLOSE'
        });
      }

      this.positions = [];
      this.isHedging = false;

      this.trades.push(...closedPositions);
      return closedPositions.length > 0 ? 'CLOSED_HEDGE' : null;
    }

    // Abrir nueva posición de hedge
    if (this.positions.length === 0) {
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
      this.isHedging = true;
      return trade;
    }

    return null;
  }

  managePositions(data, i, cumulativePnL) {
    for (let j = this.positions.length - 1; j >= 0; j--) {
      const pos = this.positions[j];
      const currentPrice = data.closes[i];

      let exitPrice = null;
      let exitReason = null;

      // Gestión normal de posiciones
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

      // Cierre por recuperación del portafolio
      if (cumulativePnL > -this.recoveryThreshold && !exitPrice) {
        exitPrice = currentPrice;
        exitReason = 'RECOVERY_CLOSE';
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
          duration: i - data.timestamps.findIndex(t => t === pos.entryTime)
        });

        this.positions.splice(j, 1);

        // Si no hay más posiciones, dejar de hacer hedge
        if (this.positions.length === 0) {
          this.isHedging = false;
        }
      }
    }
  }

  /**
   * Obtiene el estado actual de hedge
   */
  getHedgeStatus() {
    return {
      isHedging: this.isHedging,
      openPositions: this.positions.length,
      hedgePnL: this.positions.reduce((sum, pos) => {
        // PnL no realizado (marcar a mercado)
        const currentPrice = 0; // Se necesita pasar currentPrice
        return sum; // TODO: Implementar
      }, 0)
    };
  }
}
