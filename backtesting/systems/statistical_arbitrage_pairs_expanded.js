/**
 * SISTEMA DE ARBITRAJE ESTADÍSTICO EXPANDIDO
 *
 * Capital: $5,000 (5 pares simultáneos × $1,000 c/u)
 * Objetivo: Máxima diversificación intra-arbitraje
 *
 * Mejoras vs sistema original:
 * - 5 pares simultáneos (vs 1-2)
 * - Capital por par: $1,000 (vs $2,000)
 * - Z-score threshold más sensible (1.8 vs 2.0)
 * - Monitor de correlación entre pares
 * - Gestión dinámica de capital
 */

export class StatisticalArbitragePairsExpanded {
  constructor(config = {}) {
    // 5 pares de trading simultáneos
    this.pairs = config.pairs || [
      { symbol1: 'BTCUSDT', symbol2: 'ETHUSDT', name: 'BTC-ETH', capital: 1000 },
      { symbol1: 'SOLUSDT', symbol2: 'ETHUSDT', name: 'SOL-ETH', capital: 1000 },
      { symbol1: 'BNBUSDT', symbol2: 'ETHUSDT', name: 'BNB-ETH', capital: 1000 },
      { symbol1: 'MATICUSDT', symbol2: 'ETHUSDT', name: 'MATIC-ETH', capital: 1000 },
      { symbol1: 'AVAXUSDT', symbol2: 'ETHUSDT', name: 'AVAX-ETH', capital: 1000 }
    ];

    // Parámetros ajustados para múltiples pares
    this.zScoreThreshold = config.zScoreThreshold || 1.8; // Más sensible (era 2.0)
    this.zScoreExitThreshold = config.zScoreExitThreshold || 0.4; // Más estricto (era 0.5)
    this.lookbackPeriod = config.lookbackPeriod || 100;

    // Gestión de riesgo por par
    this.stopLossPerPair = config.stopLossPerPair || 0.008; // 0.8% (era 1%)
    this.maxPositionDuration = config.maxPositionDuration || 18; // 18 velas (era 20)

    // Filtros de calidad
    this.minCorrelation = config.minCorrelation || 0.72; // Más estricto (era 0.70)
    this.minVolume = config.minVolume || 2000000; // $2M (era $1M)

    // Correlación máxima entre pares (evitar sobre-exposición)
    this.maxCorrelationBetweenPairs = config.maxCorrelationBetweenPairs || 0.80;

    // Gestión de posiciones (por par)
    this.positions = {}; // { pairName: [positions] }
    this.trades = [];

    // Inicializar contenedores para cada par
    for (const pair of this.pairs) {
      this.positions[pair.name] = [];
    }
  }

  /**
   * Calcula matriz de correlación entre todos los pares
   */
  calculateCorrelationMatrix(pricesData) {
    const matrix = {};
    const pairs = Object.keys(pricesData);

    for (const pair1 of pairs) {
      matrix[pair1] = {};
      for (const pair2 of pairs) {
        if (pair1 === pair2) {
          matrix[pair1][pair2] = 1.0;
        } else {
          const prices1 = pricesData[pair1];
          const prices2 = pricesData[pair2];
          matrix[pair1][pair2] = this.calculateCorrelation(prices1, prices2, this.lookbackPeriod);
        }
      }
    }

    return matrix;
  }

  /**
   * Verifica si hay correlación excesiva entre pares
   */
  checkPairCorrelation(correlationMatrix) {
    const warnings = [];

    for (const pair1 of this.pairs) {
      for (const pair2 of this.pairs) {
        if (pair1.name !== pair2.name) {
          const corr = correlationMatrix[pair1.name]?.[pair2.name];

          if (corr && Math.abs(corr) > this.maxCorrelationBetweenPairs) {
            warnings.push({
              pair1: pair1.name,
              pair2: pair2.name,
              correlation: corr,
              action: 'reduce_exposure'
            });
          }
        }
      }
    }

    return warnings;
  }

  /**
   * Calcula correlación entre dos series
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
   * Calcula estadísticas del ratio
   */
  calculateRatioStats(prices1, prices2, period) {
    if (prices1.length < period || prices2.length < period) return null;

    const p1 = prices1.slice(-period);
    const p2 = prices2.slice(-period);

    const ratios = p1.map((price1, i) => price1 / p2[i]);

    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const variance = ratios.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratios.length;
    const stdDev = Math.sqrt(variance);

    const currentRatio = prices1[prices1.length - 1] / prices2[prices2.length - 1];
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
   * Detecta oportunidades para todos los pares
   */
  detect(data, i) {
    if (i < this.lookbackPeriod) return null;

    const timestamp = data.timestamps[i];
    const signals = [];

    // Precios base (BTCUSDT del dataset)
    const btcPrices = data.closes.slice(0, i + 1);

    // SIMULACIÓN: Generar precios para otros activos
    // En producción, esto sería fetchOHLCV real para cada símbolo
    const pricesData = this.generatePricesForPairs(btcPrices, i);

    // Calcular matriz de correlación
    const correlationMatrix = this.calculateCorrelationMatrix(pricesData);

    // Verificar correlación excesiva entre pares
    const correlationWarnings = this.checkPairCorrelation(correlationMatrix);

    // Para cada par
    for (const pair of this.pairs) {
      // Verificar si ya tenemos posición en este par
      const existingPositions = this.positions[pair.name];
      if (existingPositions && existingPositions.length > 0) {
        continue; // Ya tenemos posición, no entrar de nuevo
      }

      const prices1 = pricesData[pair.symbol1];
      const prices2 = pricesData[pair.symbol2];

      // Calcular correlación del par
      const correlation = this.calculateCorrelation(prices1, prices2, this.lookbackPeriod);

      // Filtro de correlación mínima
      if (Math.abs(correlation) < this.minCorrelation) continue;

      // Calcular estadísticas del ratio
      const stats = this.calculateRatioStats(prices1, prices2, this.lookbackPeriod);
      if (!stats) continue;

      // Verificar advertencias de correlación con otros pares
      const pairWarning = correlationWarnings.find(w =>
        w.pair1 === pair.name || w.pair2 === pair.name
      );

      if (pairWarning && pairWarning.action === 'reduce_exposure') {
        // Omitir este par si hay alta correlación con otro
        continue;
      }

      // Detectar oportunidades
      if (stats.zScore > this.zScoreThreshold) {
        signals.push({
          type: 'PAIR_SHORT',
          pairName: pair.name,
          symbol1: pair.symbol1,
          symbol2: pair.symbol2,
          capital: pair.capital,
          entry1: stats.currentPrice1,
          entry2: stats.currentPrice2,
          ratio: stats.currentRatio,
          meanRatio: stats.mean,
          zScore: stats.zScore,
          correlation,
          stopLoss1: stats.currentPrice1 * (1 + this.stopLossPerPair),
          stopLoss2: stats.currentPrice2 * (1 - this.stopLossPerPair),
          targetRatio: stats.mean,
          confidence: Math.min(0.95, Math.abs(stats.zScore) / 2.5),
          reason: `Arbitraje ${pair.name} - Z: ${stats.zScore.toFixed(2)}, Corr: ${correlation.toFixed(2)}`,
          system: 'STATISTICAL_ARBITRAGE_EXPANDED',
          entryTime: timestamp
        });
      }

      if (stats.zScore < -this.zScoreThreshold) {
        signals.push({
          type: 'PAIR_LONG',
          pairName: pair.name,
          symbol1: pair.symbol1,
          symbol2: pair.symbol2,
          capital: pair.capital,
          entry1: stats.currentPrice1,
          entry2: stats.currentPrice2,
          ratio: stats.currentRatio,
          meanRatio: stats.mean,
          zScore: stats.zScore,
          correlation,
          stopLoss1: stats.currentPrice1 * (1 - this.stopLossPerPair),
          stopLoss2: stats.currentPrice2 * (1 + this.stopLossPerPair),
          targetRatio: stats.mean,
          confidence: Math.min(0.95, Math.abs(stats.zScore) / 2.5),
          reason: `Arbitraje ${pair.name} - Z: ${stats.zScore.toFixed(2)}, Corr: ${correlation.toFixed(2)}`,
          system: 'STATISTICAL_ARBITRAGE_EXPANDED',
          entryTime: timestamp
        });
      }
    }

    // Retornar la señal con mayor confianza
    if (signals.length > 0) {
      signals.sort((a, b) => b.confidence - a.confidence);
      return signals[0];
    }

    return null;
  }

  /**
   * Genera precios simulados para otros activos
   * NOTA: En producción, reemplazar con fetchOHLCV real
   */
  generatePricesForPairs(btcPrices, i) {
    const pricesData = {};

    // BTCUSDT (del dataset)
    pricesData['BTCUSDT'] = btcPrices;

    // ETHUSDT (≈5% de BTC, con ruido)
    const ethMultiplier = 0.05;
    pricesData['ETHUSDT'] = btcPrices.map((p, idx) => {
      const noise = Math.sin(idx / 25) * 0.03 + (Math.random() - 0.5) * 0.015;
      return p * ethMultiplier * (1 + noise);
    });

    // SOLUSDT (≈0.3% de BTC, más volátil)
    const solMultiplier = 0.003;
    pricesData['SOLUSDT'] = btcPrices.map((p, idx) => {
      const noise = Math.sin(idx / 15) * 0.05 + (Math.random() - 0.5) * 0.025;
      return p * solMultiplier * (1 + noise);
    });

    // BNBUSDT (≈1% de BTC, menos volátil)
    const bnbMultiplier = 0.01;
    pricesData['BNBUSDT'] = btcPrices.map((p, idx) => {
      const noise = Math.sin(idx / 30) * 0.025 + (Math.random() - 0.5) * 0.012;
      return p * bnbMultiplier * (1 + noise);
    });

    // MATICUSDT (≈0.2% de BTC, muy volátil)
    const maticMultiplier = 0.002;
    pricesData['MATICUSDT'] = btcPrices.map((p, idx) => {
      const noise = Math.sin(idx / 10) * 0.06 + (Math.random() - 0.5) * 0.03;
      return p * maticMultiplier * (1 + noise);
    });

    // AVAXUSDT (≈0.25% de BTC, volátil)
    const avaxMultiplier = 0.0025;
    pricesData['AVAXUSDT'] = btcPrices.map((p, idx) => {
      const noise = Math.sin(idx / 20) * 0.045 + (Math.random() - 0.5) * 0.022;
      return p * avaxMultiplier * (1 + noise);
    });

    return pricesData;
  }

  /**
   * Ejecuta la señal
   */
  execute(signal, data, i) {
    const position = {
      ...signal,
      id: `${signal.pairName}_${signal.entryTime}`,
      duration: 0,
      exitReason: null
    };

    this.positions[signal.pairName].push(position);
    return position;
  }

  /**
   * Gestiona posiciones abiertas
   */
  managePositions(data, i) {
    const btcPrices = data.closes.slice(0, i + 1);
    const pricesData = this.generatePricesForPairs(btcPrices, i);

    // Para cada par
    for (const pair of this.pairs) {
      const pairPositions = this.positions[pair.name];

      for (let j = pairPositions.length - 1; j >= 0; j--) {
        const pos = pairPositions[j];
        pos.duration++;

        const currentPrice1 = pricesData[pos.symbol1];
        const currentPrice2 = pricesData[pos.symbol2];

        if (!currentPrice1 || !currentPrice2) continue;

        const currentRatio = currentPrice1 / currentPrice2;
        const zScoreCurrent = pos.stdDev === 0 ? 0 :
          (currentRatio - pos.meanRatio) / pos.stdDev;

        let exitPrice1 = null;
        let exitPrice2 = null;
        let exitReason = null;

        // Salida 1: Z-score vuelve a la media
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
          const pnl1 = pos.type === 'PAIR_SHORT'
            ? (pos.entry1 - exitPrice1) / pos.entry1
            : (exitPrice1 - pos.entry1) / pos.entry1;

          const pnl2 = pos.type === 'PAIR_SHORT'
            ? (exitPrice2 - pos.entry2) / pos.entry2
            : (pos.entry2 - exitPrice2) / pos.entry2;

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
            confidence: pos.confidence,
            capital: pos.capital
          });

          pairPositions.splice(j, 1);
        }
      }
    }
  }

  /**
   * Obtiene estadísticas del portafolio de arbitraje
   */
  getPortfolioStats() {
    let totalPositions = 0;
    const positionsByPair = {};

    for (const pair of this.pairs) {
      const count = this.positions[pair.name].length;
      totalPositions += count;
      positionsByPair[pair.name] = count;
    }

    return {
      totalPositions,
      positionsByPair,
      totalTrades: this.trades.length,
      activePairs: Object.keys(positionsByPair).filter(k => positionsByPair[k] > 0).length
    };
  }
}
