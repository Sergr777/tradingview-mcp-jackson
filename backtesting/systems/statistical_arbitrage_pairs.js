/**
 * SISTEMA DE ARBITRAJE ESTADÍSTICO (PAIRS TRADING)
 *
 * Estrategia:
 * - Identificar pares de criptomonedas altamente correlacionadas (ej: BTC/USDT y ETH/USDT)
 * - Calcular el ratio de precios z-score
 * - Cuando el ratio se desvía > 2 desviaciones estándar:
 *   - Si ratio alto → Vender el primero, comprar el segundo
 *   - Si ratio bajo → Comprar el primero, vender el segundo
 * - Cerrar cuando el ratio vuelve a la media
 *
 * Ventajas:
 * - Neutral al mercado (gana independientemente de la dirección)
 * - Bajo riesgo (posiciones hedgeadas)
 * - No correlacionado con estrategias direccionales
 *
 * Riesgos:
 * - Correlación puede romperse
 * - Requiere ejecución simultánea de 2 órdenes
 * - Slippage en ambos lados
 */

export class StatisticalArbitragePairs {
  constructor(config = {}) {
    // Pares de trading (activo1, activo2)
    this.pairs = config.pairs || [
      { symbol1: 'BTCUSDT', symbol2: 'ETHUSDT', name: 'BTC-ETH' },
      { symbol1: 'SOLUSDT', symbol2: 'ETHUSDT', name: 'SOL-ETH' },
      { symbol1: 'BNBUSDT', symbol2: 'ETHUSDT', name: 'BNB-ETH' }
    ];

    // Parámetros de z-score
    this.zScoreThreshold = config.zScoreThreshold || 2.0; // Desviación estándar para entrar
    this.zScoreExitThreshold = config.zScoreExitThreshold || 0.5; // Para salir
    this.lookbackPeriod = config.lookbackPeriod || 100; // Períodos para calcular media/SD

    // Gestión de riesgo
    this.stopLoss = config.stopLoss || 0.01; // 1% (por lado)
    this.maxPositionDuration = config.maxPositionDuration || 20; // Máx 20 velas (100 min en 5m)

    // Filtros de calidad
    this.minCorrelation = config.minCorrelation || 0.7; // Correlación mínima 70%
    this.minVolume = config.minVolume || 1000000; // Volumen mínimo $1M

    this.positions = [];
    this.trades = [];
  }

  /**
   * Calcula correlación entre dos series de precios
   */
  calculateCorrelation(prices1, prices2, period) {
    if (prices1.length < period || prices2.length < period) return 0;

    const p1 = prices1.slice(-period);
    const p2 = prices2.slice(-period);

    const mean1 = p1.reduce((a, b) => a + b, 0) / p1.length;
    const mean2 = p2.reduce((a, b) => a + b, 0) / p2.length;

    let numerator = 0;
    let variance1 = 0;
    let variance2 = 0;

    for (let i = 0; i < p1.length; i++) {
      const diff1 = p1[i] - mean1;
      const diff2 = p2[i] - mean2;
      numerator += diff1 * diff2;
      variance1 += diff1 * diff1;
      variance2 += diff2 * diff2;
    }

    const denominator = Math.sqrt(variance1 * variance2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calcula ratio de precios y z-score
   */
  calculateRatioStats(prices1, prices2, period) {
    if (prices1.length < period || prices2.length < period) return null;

    const p1 = prices1.slice(-period);
    const p2 = prices2.slice(-period);

    // Calcular ratios
    const ratios = p1.map((price1, i) => price1 / p2[i]);

    // Media y desviación estándar del ratio
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const variance = ratios.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratios.length;
    const stdDev = Math.sqrt(variance);

    // Ratio actual
    const currentRatio = prices1[prices1.length - 1] / prices2[prices2.length - 1];

    // Z-score
    const zScore = stdDev === 0 ? 0 : (currentRatio - mean) / stdDev;

    return {
      currentRatio,
      mean,
      stdDev,
      zScore,
      currentPrice1: prices1[prices1.length - 1],
      currentPrice2: prices2[prices2.length - 1]
    };
  }

  /**
   * Detecta oportunidades de arbitraje
   */
  detect(data, i) {
    // Necesitamos al menos lookbackPeriod velas
    if (i < this.lookbackPeriod) return null;

    const timestamp = data.timestamps[i];

    // Verificar cada par
    for (const pair of this.pairs) {
      // Verificar si ya tenemos posición en este par
      const existingPosition = this.positions.find(p => p.pairName === pair.name);
      if (existingPosition) continue;

      // En un backtest real, necesitaríamos datos OHLCV para ambos símbolos
      // Para simplificar, simulamos usando el mismo dataset con diferentes multiplicadores
      // En producción, necesitarías fetch data para ambos símbolos

      // SIMULACIÓN: En producción, harías:
      // const data1 = await fetchOHLCV(pair.symbol1);
      // const data2 = await fetchOHLCV(pair.symbol2);

      // Para este backtest, simulamos el segundo activo
      const prices1 = data.closes.slice(0, i + 1);

      // Simular segundo activo (ETH tiende a moverse 1.5x BTC)
      // En producción, esto serían datos reales
      const multiplier = pair.symbol2 === 'ETHUSDT' ? 0.05 :
                        pair.symbol2 === 'SOLUSDT' ? 0.003 :
                        pair.symbol2 === 'BNBUSDT' ? 0.01 : 0.05;

      // Añadir algo de ruido para hacer el ratio fluctuar
      const noise = Array.from({ length: prices1.length }, (_, idx) =>
        Math.sin(idx / 20) * 0.02 + (Math.random() - 0.5) * 0.01
      );

      const prices2 = prices1.map((p, idx) =>
        p * multiplier * (1 + noise[idx])
      );

      // Calcular correlación
      const correlation = this.calculateCorrelation(
        prices1,
        prices2,
        this.lookbackPeriod
      );

      // Filtro de correlación mínima
      if (Math.abs(correlation) < this.minCorrelation) continue;

      // Calcular estadísticas del ratio
      const stats = this.calculateRatioStats(prices1, prices2, this.lookbackPeriod);
      if (!stats) continue;

      // Detectar oportunidades
      // Z-score > threshold = ratio alto → vender activo1, comprar activo2
      if (stats.zScore > this.zScoreThreshold) {
        return {
          type: 'PAIR_SHORT',
          pairName: pair.name,
          symbol1: pair.symbol1,
          symbol2: pair.symbol2,
          entry1: stats.currentPrice1,
          entry2: stats.currentPrice2,
          ratio: stats.currentRatio,
          meanRatio: stats.mean,
          zScore: stats.zScore,
          correlation,
          stopLoss1: stats.currentPrice1 * (1 + this.stopLoss),
          stopLoss2: stats.currentPrice2 * (1 - this.stopLoss),
          targetRatio: stats.mean, // Volver a la media
          confidence: Math.min(0.9, Math.abs(stats.zScore) / 3),
          reason: `Arbitraje ${pair.name} - Z: ${stats.zScore.toFixed(2)}, Corr: ${correlation.toFixed(2)}`,
          system: 'STATISTICAL_ARBITRAGE',
          entryTime: timestamp
        };
      }

      // Z-score < -threshold = ratio bajo → comprar activo1, vender activo2
      if (stats.zScore < -this.zScoreThreshold) {
        return {
          type: 'PAIR_LONG',
          pairName: pair.name,
          symbol1: pair.symbol1,
          symbol2: pair.symbol2,
          entry1: stats.currentPrice1,
          entry2: stats.currentPrice2,
          ratio: stats.currentRatio,
          meanRatio: stats.mean,
          zScore: stats.zScore,
          correlation,
          stopLoss1: stats.currentPrice1 * (1 - this.stopLoss),
          stopLoss2: stats.currentPrice2 * (1 + this.stopLoss),
          targetRatio: stats.mean,
          confidence: Math.min(0.9, Math.abs(stats.zScore) / 3),
          reason: `Arbitraje ${pair.name} - Z: ${stats.zScore.toFixed(2)}, Corr: ${correlation.toFixed(2)}`,
          system: 'STATISTICAL_ARBITRAGE',
          entryTime: timestamp
        };
      }
    }

    return null;
  }

  /**
   * Ejecuta la señal de arbitraje
   */
  execute(signal, data, i) {
    // Crear posición del par
    const position = {
      ...signal,
      id: `${signal.pairName}_${signal.entryTime}`,
      duration: 0,
      exitReason: null
    };

    this.positions.push(position);
    return position;
  }

  /**
   * Gestiona posiciones abiertas
   */
  managePositions(data, i) {
    for (let j = this.positions.length - 1; j >= 0; j--) {
      const pos = this.positions[j];
      pos.duration++;

      const currentPrice1 = data.closes[i];

      // Simular precio del segundo activo (misma lógica que en detect)
      const multiplier = pos.symbol2 === 'ETHUSDT' ? 0.05 :
                        pos.symbol2 === 'SOLUSDT' ? 0.003 :
                        pos.symbol2 === 'BNBUSDT' ? 0.01 : 0.05;

      const noise = Math.sin(i / 20) * 0.02 + (Math.random() - 0.5) * 0.01;
      const currentPrice2 = currentPrice1 * multiplier * (1 + noise);

      const currentRatio = currentPrice1 / currentPrice2;
      const zScoreCurrent = pos.stdDev === 0 ? 0 :
        (currentRatio - pos.meanRatio) / pos.stdDev;

      let exitPrice1 = null;
      let exitPrice2 = null;
      let exitReason = null;

      // Salida 1: Z-score vuelve a la media (exitThreshold)
      if (Math.abs(zScoreCurrent) < this.zScoreExitThreshold) {
        exitPrice1 = currentPrice1;
        exitPrice2 = currentPrice2;
        exitReason = 'Z_SCORE_MEAN_REVERSION';
      }

      // Salida 2: Stop Loss
      else if (pos.type === 'PAIR_SHORT') {
        if (currentPrice1 >= pos.stopLoss1 || currentPrice2 <= pos.stopLoss2) {
          exitPrice1 = currentPrice1;
          exitPrice2 = currentPrice2;
          exitReason = 'STOP_LOSS';
        }
      }
      else if (pos.type === 'PAIR_LONG') {
        if (currentPrice1 <= pos.stopLoss1 || currentPrice2 >= pos.stopLoss2) {
          exitPrice1 = currentPrice1;
          exitPrice2 = currentPrice2;
          exitReason = 'STOP_LOSS';
        }
      }

      // Salida 3: Tiempo máximo
      else if (pos.duration >= this.maxPositionDuration) {
        exitPrice1 = currentPrice1;
        exitPrice2 = currentPrice2;
        exitReason = 'TIME_EXIT';
      }

      // Ejecutar salida
      if (exitPrice1 && exitPrice2) {
        // Calcular PnL de ambas piernas
        const pnl1 = pos.type === 'PAIR_SHORT'
          ? (pos.entry1 - exitPrice1) / pos.entry1  // Cortamos activo1
          : (exitPrice1 - pos.entry1) / pos.entry1; // Compramos activo1

        const pnl2 = pos.type === 'PAIR_SHORT'
          ? (exitPrice2 - pos.entry2) / pos.entry2  // Compramos activo2
          : (pos.entry2 - exitPrice2) / pos.entry2; // Cortamos activo2

        // PnL total (promedio de ambas piernas)
        const totalPnl = (pnl1 + pnl2) / 2;

        this.trades.push({
          system: pos.system,
          pairName: pos.pairName,
          type: pos.type,
          entryTime: pos.entryTime,
          exitTime: data.timestamps[i],
          entry1: pos.entry1,
          entry2: pos.entry2,
          exit1: exitPrice1,
          exit2: exitPrice2,
          pnl1,
          pnl2,
          pnl: totalPnl,
          success: totalPnl > 0,
          exitReason,
          duration: pos.duration,
          correlation: pos.correlation,
          zScoreEntry: pos.zScore,
          confidence: pos.confidence
        });

        this.positions.splice(j, 1);
      }
    }
  }
}
