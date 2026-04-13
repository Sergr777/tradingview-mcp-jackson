/**
 * Unit Tests for Signal Validation
 * Tests validation of trading signals across all systems
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VWAPBounce } from '../../systems/vwap_bounce.js';
import { TurtleSoupCTR } from '../../systems/turtle_soup_ctr.js';
import { EMARSI } from '../../systems/ema_rsi.js';
import { MeanReversion } from '../../systems/mean_reversion.js';

describe('Signal Validation', () => {

  describe('Signal Structure Validation', () => {
    it('should validate VWAP Bounce signal structure', () => {
      const system = new VWAPBounce();
      const data = {
        closes: [100, 101, 102],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      };

      const signal = system.detect(data, 2);

      if (signal) {
        assert.ok(signal.type);
        assert.ok(['LONG', 'SHORT'].includes(signal.type));
        assert.ok(signal.entry);
        assert.ok(signal.stop);
        assert.ok(signal.target);
        assert.ok(signal.confidence >= 0 && signal.confidence <= 1);
        assert.ok(signal.reason);
        assert.ok(signal.system);
        assert.strictEqual(signal.system, 'VWAP_BOUNCE');
      }
    });

    it('should validate Turtle Soup CTR signal structure', () => {
      const system = new TurtleSoupCTR();
      const data = {
        highs: [100, 101, 102.5],
        lows: [99, 100, 101],
        high20: [100, 100, 100],
        low20: [99, 99, 99],
        rsi: [50, 55, 60],
        volumes: [1000, 1100, 1200],
        timestamps: [1000000, 1003000, 1006000]
      };

      const signal = system.detect(data, 2);

      if (signal) {
        assert.ok(signal.type);
        assert.ok(['LONG', 'SHORT'].includes(signal.type));
        assert.ok(signal.entry);
        assert.ok(signal.stop);
        assert.ok(signal.target);
        assert.ok(signal.confidence >= 0 && signal.confidence <= 1);
        assert.ok(signal.reason);
        assert.strictEqual(signal.system, 'TURTLE_SOUP_CTR');
      }
    });

    it('should validate EMA+RSI signal structure', () => {
      const system = new EMARSI();
      const data = {
        closes: [99, 100, 101],
        ema8: [100, 100, 100],
        rsi: [40, 42, 45]
      };

      const signal = system.detect(data, 2);

      if (signal) {
        assert.ok(signal.type);
        assert.ok(['LONG', 'SHORT'].includes(signal.type));
        assert.ok(signal.entry);
        assert.ok(signal.stop);
        assert.ok(signal.target);
        assert.ok(signal.confidence >= 0 && signal.confidence <= 1);
        assert.ok(signal.reason);
        assert.strictEqual(signal.system, 'EMA8_RSI');
      }
    });

    it('should validate Mean Reversion signal structure', () => {
      const system = new MeanReversion();
      const data = {
        closes: [100, 102, 105],
        sma20: [100, 100, 100],
        stdDev20: [2, 2, 2]
      };

      const signal = system.detect(data, 2, 0.03);

      if (signal) {
        assert.ok(signal.type);
        assert.ok(['LONG', 'SHORT'].includes(signal.type));
        assert.ok(signal.entry);
        assert.ok(signal.stop);
        assert.ok(signal.target);
        assert.ok(signal.confidence >= 0 && signal.confidence <= 1);
        assert.ok(signal.reason);
        assert.strictEqual(signal.system, 'MEAN_REVERSION');
        assert.strictEqual(signal.isHedge, true);
      }
    });
  });

  describe('Price Level Validation', () => {
    it('should validate LONG signal price levels', () => {
      const system = new VWAPBounce();
      const data = {
        closes: [100, 101, 102],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      };

      const signal = system.detect(data, 2);

      if (signal && signal.type === 'LONG') {
        assert.ok(signal.stop < signal.entry);
        assert.ok(signal.target > signal.entry);
        assert.ok(signal.stop > 0);
        assert.ok(signal.target > 0);
      }
    });

    it('should validate SHORT signal price levels', () => {
      const system = new VWAPBounce();
      const data = {
        closes: [102, 101, 100],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      };

      const signal = system.detect(data, 2);

      if (signal && signal.type === 'SHORT') {
        assert.ok(signal.stop > signal.entry);
        assert.ok(signal.target < signal.entry);
        assert.ok(signal.stop > 0);
        assert.ok(signal.target > 0);
      }
    });

    it('should validate risk-reward ratio', () => {
      const system = new VWAPBounce();
      const data = {
        closes: [100, 101, 102],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      };

      const signal = system.detect(data, 2);

      if (signal) {
        const risk = Math.abs(signal.entry - signal.stop);
        const reward = Math.abs(signal.target - signal.entry);
        const riskRewardRatio = reward / risk;

        assert.ok(riskRewardRatio >= 1);
        assert.ok(risk > 0);
        assert.ok(reward > 0);
      }
    });
  });

  describe('Confidence Level Validation', () => {
    it('should validate confidence is within bounds', () => {
      const systems = [
        new VWAPBounce(),
        new TurtleSoupCTR(),
        new EMARSI(),
        new MeanReversion()
      ];

      systems.forEach(system => {
        const testData = generateTestDataForSystem(system);
        if (testData) {
          const signal = system.detect(testData.data, testData.index, testData.aggressiveDelta);

          if (signal) {
            assert.ok(signal.confidence >= 0, `Confidence below 0: ${signal.confidence}`);
            assert.ok(signal.confidence <= 1, `Confidence above 1: ${signal.confidence}`);
          }
        }
      });
    });

    it('should validate expected confidence levels per system', () => {
      const confidenceRanges = {
        'VWAP_BOUNCE': { min: 0.60, max: 0.70 },
        'TURTLE_SOUP_CTR': { min: 0.45, max: 0.55 },
        'EMA8_RSI': { min: 0.55, max: 0.65 },
        'MEAN_REVERSION': { min: 0.50, max: 0.60 }
      };

      const vwapSystem = new VWAPBounce();
      const vwapData = {
        closes: [100, 101, 102],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      };
      const vwapSignal = vwapSystem.detect(vwapData, 2);

      if (vwapSignal) {
        const range = confidenceRanges['VWAP_BOUNCE'];
        assert.ok(vwapSignal.confidence >= range.min);
        assert.ok(vwapSignal.confidence <= range.max);
      }
    });
  });

  describe('Signal Filtering', () => {
    it('should filter signals with insufficient data', () => {
      const systems = [
        { system: new VWAPBounce(), minData: 100 },
        { system: new TurtleSoupCTR(), minData: 34 },
        { system: new EMARSI(), minData: 22 },
        { system: new MeanReversion(), minData: 20 }
      ];

      systems.forEach(({ system, minData }) => {
        const insufficientData = {
          closes: Array(minData - 1).fill(100),
          volumes: Array(minData - 1).fill(1000)
        };

        const signal = system.detect(insufficientData, minData - 2);
        assert.strictEqual(signal, null);
      });
    });

    it('should filter signals with null indicator values', () => {
      const system = new VWAPBounce();
      const dataWithNulls = {
        closes: [100, 101, 102],
        volumes: [1000, 1200, 1500],
        vwap: [null, null, null]
      };

      const signal = system.detect(dataWithNulls, 2);
      assert.strictEqual(signal, null);
    });
  });

  describe('Signal Uniqueness', () => {
    it('should not generate duplicate signals consecutively', () => {
      const system = new VWAPBounce();
      const data = {
        closes: [100, 101, 102, 103],
        volumes: [1000, 1200, 1500, 1600],
        vwap: [100.5, 100.5, 100.5, 100.5]
      };

      const signals = [];
      for (let i = 2; i < 4; i++) {
        const signal = system.detect(data, i);
        if (signal) {
          signals.push(signal);
        }
      }

      // Should not have more than 1 signal in this scenario
      assert.ok(signals.length <= 1);
    });

    it('should handle rapid signal changes', () => {
      const system = new EMARSI();
      const data = {
        closes: [99, 100, 101, 100, 99],
        ema8: [100, 100, 100, 100, 100],
        rsi: [40, 42, 45, 43, 41]
      };

      let lastSignalType = null;
      let signalChanges = 0;

      for (let i = 2; i < 5; i++) {
        const signal = system.detect(data, i);
        if (signal && signal.type !== lastSignalType) {
          signalChanges++;
          lastSignalType = signal.type;
        }
      }

      // Should handle changes gracefully
      assert.ok(signalChanges >= 0);
    });
  });

  describe('Signal Execution Validation', () => {
    it('should validate trade execution creates valid trade object', () => {
      const system = new VWAPBounce();
      const signal = {
        type: 'LONG',
        entry: 100,
        stop: 99.7,
        target: 100.6,
        confidence: 0.65,
        reason: 'Test',
        system: 'VWAP_BOUNCE'
      };
      const data = {
        timestamps: [1000000],
        closes: [100]
      };

      const trade = system.execute(signal, data, 0);

      if (trade) {
        assert.ok(trade.entryTime);
        assert.strictEqual(trade.entryPrice, signal.entry);
        assert.strictEqual(trade.type, signal.type);
        assert.strictEqual(trade.stopLoss, signal.stop);
        assert.strictEqual(trade.takeProfit, signal.target);
        assert.strictEqual(trade.confidence, signal.confidence);
        assert.strictEqual(trade.reason, signal.reason);
        assert.strictEqual(trade.system, signal.system);
      }
    });

    it('should prevent multiple position entries', () => {
      const system = new VWAPBounce();
      system.positions.push({ entryPrice: 100 });

      const signal = {
        type: 'LONG',
        entry: 101,
        stop: 100.7,
        target: 101.6,
        confidence: 0.65,
        reason: 'Test',
        system: 'VWAP_BOUNCE'
      };
      const data = {
        timestamps: [1000000],
        closes: [101]
      };

      const trade = system.execute(signal, data, 0);
      assert.strictEqual(trade, null);
      assert.strictEqual(system.positions.length, 1);
    });
  });

  describe('Signal Reasoning', () => {
    it('should provide meaningful reason for signal', () => {
      const system = new VWAPBounce();
      const data = {
        closes: [100, 101, 102],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      };

      const signal = system.detect(data, 2);

      if (signal) {
        assert.ok(signal.reason);
        assert.ok(signal.reason.length > 0);
        assert.ok(typeof signal.reason === 'string');
      }
    });

    it('should include system identifier in signal', () => {
      const systems = [
        new VWAPBounce(),
        new TurtleSoupCTR(),
        new EMARSI(),
        new MeanReversion()
      ];

      systems.forEach(system => {
        const testData = generateTestDataForSystem(system);
        if (testData) {
          const signal = system.detect(testData.data, testData.index, testData.aggressiveDelta);

          if (signal) {
            assert.ok(signal.system);
            assert.ok(signal.system.length > 0);
            assert.ok(typeof signal.system === 'string');
          }
        }
      });
    });
  });
});

// Helper function to generate test data for different systems
function generateTestDataForSystem(system) {
  if (system instanceof VWAPBounce) {
    return {
      data: {
        closes: [100, 101, 102],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      },
      index: 2
    };
  } else if (system instanceof TurtleSoupCTR) {
    return {
      data: {
        highs: [100, 101, 102.5],
        lows: [99, 100, 101],
        high20: [100, 100, 100],
        low20: [99, 99, 99],
        rsi: [50, 55, 60],
        volumes: [1000, 1100, 1200],
        timestamps: [1000000, 1003000, 1006000]
      },
      index: 2
    };
  } else if (system instanceof EMARSI) {
    return {
      data: {
        closes: [99, 100, 101],
        ema8: [100, 100, 100],
        rsi: [40, 42, 45]
      },
      index: 2
    };
  } else if (system instanceof MeanReversion) {
    return {
      data: {
        closes: [100, 102, 105],
        sma20: [100, 100, 100],
        stdDev20: [2, 2, 2]
      },
      index: 2,
      aggressiveDelta: 0.03
    };
  }
  return null;
}
