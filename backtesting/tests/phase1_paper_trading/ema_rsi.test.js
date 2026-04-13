/**
 * Unit Tests for EMA+RSI System
 * Sistema 3: EMA 8 + RSI - Estrategia de momentum con cruce de medias
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EMARSI } from '../../systems/ema_rsi.js';

describe('EMA+RSI System', () => {

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const system = new EMARSI();
      assert.strictEqual(system.emaPeriod, 8);
      assert.strictEqual(system.rsiPeriod, 14);
      assert.strictEqual(system.rsiThreshold, 50);
      assert.strictEqual(system.stopLoss, 0.004);
      assert.strictEqual(system.takeProfit, 0.008);
      assert.deepStrictEqual(system.positions, []);
      assert.deepStrictEqual(system.trades, []);
    });

    it('should initialize with custom config', () => {
      const system = new EMARSI({
        emaPeriod: 12,
        rsiPeriod: 21,
        rsiThreshold: 45,
        stopLoss: 0.005,
        takeProfit: 0.010
      });
      assert.strictEqual(system.emaPeriod, 12);
      assert.strictEqual(system.rsiPeriod, 21);
      assert.strictEqual(system.rsiThreshold, 45);
      assert.strictEqual(system.stopLoss, 0.005);
      assert.strictEqual(system.takeProfit, 0.010);
    });
  });

  describe('LONG Signal Detection - Bullish Crossover', () => {
    it('should detect LONG signal on bullish crossover', () => {
      const system = new EMARSI();
      const data = {
        closes: [99, 99.5, 100.5], // Price crosses from below to above EMA
        ema8: [100, 100, 100],     // EMA stays at 100
        rsi: [40, 42, 45]          // RSI below threshold (50) and rising
      };

      const signal = system.detect(data, 2);
      assert.notEqual(signal, null);
      assert.strictEqual(signal.type, 'LONG');
      assert.strictEqual(signal.system, 'EMA8_RSI');
      assert.strictEqual(signal.confidence, 0.60);
      assert.ok(signal.reason.includes('Bullish crossover'));
    });

    it('should not detect LONG without RSI confirmation', () => {
      const system = new EMARSI();
      const data = {
        closes: [99, 100, 101],
        ema8: [100, 100, 100],
        rsi: [55, 58, 60] // Above threshold
      };

      const signal = system.detect(data, 2);
      assert.strictEqual(signal, null);
    });

    it('should not detect LONG when RSI falling', () => {
      const system = new EMARSI();
      const data = {
        closes: [99, 100, 101],
        ema8: [100, 100, 100],
        rsi: [45, 42, 40] // Falling
      };

      const signal = system.detect(data, 2);
      assert.strictEqual(signal, null);
    });
  });

  describe('SHORT Signal Detection - Bearish Crossover', () => {
    it('should detect SHORT signal on bearish crossover', () => {
      const system = new EMARSI();
      const data = {
        closes: [101, 100.5, 99.5], // Price crosses from above to below EMA
        ema8: [100, 100, 100],      // EMA stays at 100
        rsi: [60, 58, 55]           // RSI above threshold (50) and falling
      };

      const signal = system.detect(data, 2);
      assert.notEqual(signal, null);
      assert.strictEqual(signal.type, 'SHORT');
      assert.strictEqual(signal.system, 'EMA8_RSI');
      assert.strictEqual(signal.confidence, 0.60);
      assert.ok(signal.reason.includes('Bearish crossover'));
    });

    it('should not detect SHORT without RSI confirmation', () => {
      const system = new EMARSI();
      const data = {
        closes: [101, 100, 99],
        ema8: [100, 100, 100],
        rsi: [45, 42, 40] // Below threshold
      };

      const signal = system.detect(data, 2);
      assert.strictEqual(signal, null);
    });
  });

  describe('Signal Execution', () => {
    it('should execute LONG trade successfully', () => {
      const system = new EMARSI();
      const signal = {
        type: 'LONG',
        entry: 101,
        stop: 100.6,
        target: 101.8,
        confidence: 0.60,
        reason: 'Test signal',
        system: 'EMA8_RSI'
      };
      const data = {
        timestamps: [1000000],
        closes: [101]
      };

      const trade = system.execute(signal, data, 0);
      assert.notEqual(trade, null);
      assert.strictEqual(trade.entryPrice, 101);
      assert.strictEqual(trade.type, 'LONG');
      assert.strictEqual(system.positions.length, 1);
    });

    it('should not execute if position already open', () => {
      const system = new EMARSI();
      system.positions.push({ entryPrice: 100 });

      const signal = {
        type: 'LONG',
        entry: 101,
        stop: 100.6,
        target: 101.8,
        confidence: 0.60,
        reason: 'Test signal',
        system: 'EMA8_RSI'
      };
      const data = {
        timestamps: [1000000],
        closes: [101]
      };

      const trade = system.execute(signal, data, 0);
      assert.strictEqual(trade, null);
    });
  });

  describe('Position Management - Take Profit', () => {
    it('should close LONG position at take profit', () => {
      const system = new EMARSI();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 101,
        type: 'LONG',
        stopLoss: 100.6,
        takeProfit: 101.8,
        confidence: 0.60,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [101, 101.8]
      };

      system.managePositions(data, 1);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'TAKE_PROFIT');
    });

    it('should close SHORT position at take profit', () => {
      const system = new EMARSI();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 99,
        type: 'SHORT',
        stopLoss: 99.4,
        takeProfit: 98.2,
        confidence: 0.60,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [99, 98.2]
      };

      system.managePositions(data, 1);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'TAKE_PROFIT');
    });
  });

  describe('Position Management - Stop Loss', () => {
    it('should close LONG position at stop loss', () => {
      const system = new EMARSI();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 101,
        type: 'LONG',
        stopLoss: 100.6,
        takeProfit: 101.8,
        confidence: 0.60,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [101, 100.6]
      };

      system.managePositions(data, 1);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'STOP_LOSS');
    });

    it('should close SHORT position at stop loss', () => {
      const system = new EMARSI();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 99,
        type: 'SHORT',
        stopLoss: 99.4,
        takeProfit: 98.2,
        confidence: 0.60,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [99, 99.4]
      };

      system.managePositions(data, 1);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'STOP_LOSS');
    });
  });

  describe('Position Management - Time Exit', () => {
    it('should close position after 10 periods', () => {
      const system = new EMARSI();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 100,
        type: 'LONG',
        stopLoss: 99.6,
        takeProfit: 100.8,
        confidence: 0.60,
        reason: 'Test'
      });

      const timestamps = Array.from({ length: 15 }, (_, i) => 1000000 + i * 300000);
      const closes = Array(15).fill(100);

      const data = { timestamps, closes };

      system.managePositions(data, 10);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'TIME_EXIT');
    });
  });

  describe('PnL Calculation', () => {
    it('should calculate correct PnL for profitable LONG trade', () => {
      const system = new EMARSI();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 101,
        type: 'LONG',
        stopLoss: 100.6,
        takeProfit: 101.8,
        confidence: 0.60,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [101, 101.8]
      };

      system.managePositions(data, 1);
      const expectedPnL = (101.8 - 101) / 101;
      assert.strictEqual(system.trades[0].pnl, expectedPnL);
    });

    it('should calculate correct PnL for profitable SHORT trade', () => {
      const system = new EMARSI();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 99,
        type: 'SHORT',
        stopLoss: 99.4,
        takeProfit: 98.2,
        confidence: 0.60,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [99, 98.2]
      };

      system.managePositions(data, 1);
      const expectedPnL = (99 - 98.2) / 99;
      assert.strictEqual(system.trades[0].pnl, expectedPnL);
    });
  });

  describe('Edge Cases', () => {
    it('should return null for insufficient data', () => {
      const system = new EMARSI();
      const data = {
        closes: [99, 100],
        ema8: [100, 100],
        rsi: [40, 42]
      };

      const signal = system.detect(data, 1);
      assert.strictEqual(signal, null);
    });

    it('should handle null EMA values', () => {
      const system = new EMARSI();
      const data = {
        closes: [99, 100, 101],
        ema8: [null, null, null],
        rsi: [40, 42, 45]
      };

      const signal = system.detect(data, 2);
      assert.strictEqual(signal, null);
    });

    it('should handle null RSI values', () => {
      const system = new EMARSI();
      const data = {
        closes: [99, 100, 101],
        ema8: [100, 100, 100],
        rsi: [null, null, null]
      };

      const signal = system.detect(data, 2);
      assert.strictEqual(signal, null);
    });

    it('should not trigger on no crossover', () => {
      const system = new EMARSI();
      const data = {
        closes: [101, 102, 103], // Both above EMA
        ema8: [100, 100, 100],
        rsi: [40, 42, 45]
      };

      const signal = system.detect(data, 2);
      assert.strictEqual(signal, null);
    });
  });

  describe('Crossover Detection Logic', () => {
    it('should detect exact crossover at boundary', () => {
      const system = new EMARSI();
      const data = {
        closes: [99.5, 100.5], // Crosses from below to above
        ema8: [100, 100],
        rsi: [40, 45]
      };

      const signal = system.detect(data, 1);
      assert.notEqual(signal, null);
      assert.strictEqual(signal.type, 'LONG');
    });
  });
});