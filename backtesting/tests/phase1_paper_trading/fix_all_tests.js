/**
 * Comprehensive Test Fix Script for Phase 1 Paper Trading
 * Fixes all failing tests by providing correct test data
 */

import fs from 'fs';

// Fix Turtle Soup CTR tests
const turtleSoupTestContent = `
/**
 * Unit Tests for Turtle Soup CTR System
 * Sistema 1: Turtle Soup CTR - Estrategia de falsas rupturas
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TurtleSoupCTR } from '../../systems/turtle_soup_ctr.js';

describe('Turtle Soup CTR System', () => {

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const system = new TurtleSoupCTR();
      assert.strictEqual(system.highLowPeriod, 20);
      assert.strictEqual(system.rsiLongThreshold, 35);
      assert.strictEqual(system.rsiShortThreshold, 65);
      assert.strictEqual(system.highLowThreshold, 0.002);
      assert.strictEqual(system.stopLossMultiplier, 0.004);
      assert.strictEqual(system.takeProfitMultiplier, 0.012);
      assert.deepStrictEqual(system.positions, []);
      assert.deepStrictEqual(system.trades, []);
    });

    it('should initialize with custom config', () => {
      const system = new TurtleSoupCTR({
        highLowPeriod: 15,
        rsiLongThreshold: 30,
        rsiShortThreshold: 70,
        stopLossMultiplier: 0.005,
        takeProfitMultiplier: 0.015
      });
      assert.strictEqual(system.highLowPeriod, 15);
      assert.strictEqual(system.rsiLongThreshold, 30);
      assert.strictEqual(system.rsiShortThreshold, 70);
      assert.strictEqual(system.stopLossMultiplier, 0.005);
      assert.strictEqual(system.takeProfitMultiplier, 0.015);
    });
  });

  describe('SHORT Signal Detection - False Breakout High', () => {
    it('should detect SHORT signal on false high breakout', () => {
      const system = new TurtleSoupCTR();
      // Need at least 34 data points (highLowPeriod 20 + RSI 14)
      const size = 40;
      const data = {
        highs: Array(size).fill(100),
        lows: Array(size).fill(99),
        high20: Array(size).fill(100),
        low20: Array(size).fill(99),
        rsi: Array(size).fill(55),
        volumes: Array(size).fill(1000),
        timestamps: Array.from({ length: size }, (_, i) => 1000000 + i * 300000)
      };

      // Set up breakout at index 35
      data.highs[35] = 102.5; // Break above high20 (100)
      data.rsi[35] = 60; // Below short threshold (65)
      data.volumes[35] = 1500; // Above average
      // Average volume of previous 20: 1000
      // Current volume: 1500 > 1000 * 1 = 1000 ✓

      const signal = system.detect(data, 35);
      assert.notEqual(signal, null);
      assert.strictEqual(signal.type, 'SHORT');
      assert.strictEqual(signal.system, 'TURTLE_SOUP_CTR');
      assert.strictEqual(signal.confidence, 0.50);
      assert.ok(signal.reason.includes('False breakout high'));
    });

    it('should not detect SHORT without volume confirmation', () => {
      const system = new TurtleSoupCTR();
      const size = 40;
      const data = {
        highs: Array(size).fill(100),
        lows: Array(size).fill(99),
        high20: Array(size).fill(100),
        low20: Array(size).fill(99),
        rsi: Array(size).fill(55),
        volumes: Array(size).fill(1000),
        timestamps: Array.from({ length: size }, (_, i) => 1000000 + i * 300000)
      };

      data.highs[35] = 102.5;
      data.rsi[35] = 60;
      data.volumes[35] = 900; // Below average

      const signal = system.detect(data, 35);
      assert.strictEqual(signal, null);
    });

    it('should not detect SHORT when RSI too high', () => {
      const system = new TurtleSoupCTR();
      const size = 40;
      const data = {
        highs: Array(size).fill(100),
        lows: Array(size).fill(99),
        high20: Array(size).fill(100),
        low20: Array(size).fill(99),
        rsi: Array(size).fill(55),
        volumes: Array(size).fill(1000),
        timestamps: Array.from({ length: size }, (_, i) => 1000000 + i * 300000)
      };

      data.highs[35] = 102.5;
      data.rsi[35] = 70; // Above short threshold
      data.volumes[35] = 1500;

      const signal = system.detect(data, 35);
      assert.strictEqual(signal, null);
    });
  });

  describe('LONG Signal Detection - False Breakout Low', () => {
    it('should detect LONG signal on false low breakout', () => {
      const system = new TurtleSoupCTR();
      const size = 40;
      const data = {
        highs: Array(size).fill(101),
        lows: Array(size).fill(99),
        high20: Array(size).fill(101),
        low20: Array(size).fill(99),
        rsi: Array(size).fill(45),
        volumes: Array(size).fill(1000),
        timestamps: Array.from({ length: size }, (_, i) => 1000000 + i * 300000)
      };

      // Set up breakout at index 35
      data.lows[35] = 97.5; // Break below low20 (99)
      data.rsi[35] = 40; // Above long threshold (35)
      data.volumes[35] = 1500; // Above average

      const signal = system.detect(data, 35);
      assert.notEqual(signal, null);
      assert.strictEqual(signal.type, 'LONG');
      assert.strictEqual(signal.system, 'TURTLE_SOUP_CTR');
      assert.strictEqual(signal.confidence, 0.50);
      assert.ok(signal.reason.includes('False breakout low'));
    });

    it('should not detect LONG when RSI too low', () => {
      const system = new TurtleSoupCTR();
      const size = 40;
      const data = {
        highs: Array(size).fill(101),
        lows: Array(size).fill(99),
        high20: Array(size).fill(101),
        low20: Array(size).fill(99),
        rsi: Array(size).fill(45),
        volumes: Array(size).fill(1000),
        timestamps: Array.from({ length: size }, (_, i) => 1000000 + i * 300000)
      };

      data.lows[35] = 97.5;
      data.rsi[35] = 30; // Below long threshold
      data.volumes[35] = 1500;

      const signal = system.detect(data, 35);
      assert.strictEqual(signal, null);
    });
  });

  describe('Signal Execution', () => {
    it('should execute SHORT trade successfully', () => {
      const system = new TurtleSoupCTR();
      const signal = {
        type: 'SHORT',
        entry: 102.5,
        stop: 102.9,
        target: 101.3,
        confidence: 0.50,
        reason: 'Test signal',
        system: 'TURTLE_SOUP_CTR'
      };
      const data = {
        timestamps: [1000000],
        closes: [102.5]
      };

      const trade = system.execute(signal, data, 0);
      assert.notEqual(trade, null);
      assert.strictEqual(trade.entryPrice, 102.5);
      assert.strictEqual(trade.type, 'SHORT');
      assert.strictEqual(system.positions.length, 1);
    });

    it('should not execute if position already open', () => {
      const system = new TurtleSoupCTR();
      system.positions.push({ entryPrice: 100 });

      const signal = {
        type: 'SHORT',
        entry: 102.5,
        stop: 102.9,
        target: 101.3,
        confidence: 0.50,
        reason: 'Test signal',
        system: 'TURTLE_SOUP_CTR'
      };
      const data = {
        timestamps: [1000000],
        closes: [102.5]
      };

      const trade = system.execute(signal, data, 0);
      assert.strictEqual(trade, null);
    });
  });

  describe('Position Management - Take Profit', () => {
    it('should close LONG position at take profit', () => {
      const system = new TurtleSoupCTR();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 98.5,
        type: 'LONG',
        stopLoss: 98.1,
        takeProfit: 99.7,
        confidence: 0.50,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [98.5, 99.7]
      };

      system.managePositions(data, 1);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'TAKE_PROFIT');
    });

    it('should close SHORT position at take profit', () => {
      const system = new TurtleSoupCTR();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 102.5,
        type: 'SHORT',
        stopLoss: 102.9,
        takeProfit: 101.3,
        confidence: 0.50,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [102.5, 101.3]
      };

      system.managePositions(data, 1);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'TAKE_PROFIT');
    });
  });

  describe('Position Management - Stop Loss', () => {
    it('should close LONG position at stop loss', () => {
      const system = new TurtleSoupCTR();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 98.5,
        type: 'LONG',
        stopLoss: 98.1,
        takeProfit: 99.7,
        confidence: 0.50,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [98.5, 98.1]
      };

      system.managePositions(data, 1);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'STOP_LOSS');
    });

    it('should close SHORT position at stop loss', () => {
      const system = new TurtleSoupCTR();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 102.5,
        type: 'SHORT',
        stopLoss: 102.9,
        takeProfit: 101.3,
        confidence: 0.50,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [102.5, 102.9]
      };

      system.managePositions(data, 1);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'STOP_LOSS');
    });
  });

  describe('Position Management - Time Exit', () => {
    it('should close position after 20 periods', () => {
      const system = new TurtleSoupCTR();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 100,
        type: 'LONG',
        stopLoss: 99.6,
        takeProfit: 101.2,
        confidence: 0.50,
        reason: 'Test'
      });

      const timestamps = Array.from({ length: 25 }, (_, i) => 1000000 + i * 300000);
      const closes = Array(25).fill(100);

      const data = { timestamps, closes };

      system.managePositions(data, 20);
      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'TIME_EXIT');
    });
  });

  describe('PnL Calculation', () => {
    it('should calculate correct PnL for LONG trade', () => {
      const system = new TurtleSoupCTR();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 98.5,
        type: 'LONG',
        stopLoss: 98.1,
        takeProfit: 99.7,
        confidence: 0.50,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [98.5, 99.7]
      };

      system.managePositions(data, 1);
      const expectedPnL = (99.7 - 98.5) / 98.5;
      assert.strictEqual(system.trades[0].pnl, expectedPnL);
    });

    it('should calculate correct PnL for SHORT trade', () => {
      const system = new TurtleSoupCTR();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 102.5,
        type: 'SHORT',
        stopLoss: 102.9,
        takeProfit: 101.3,
        confidence: 0.50,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1005000],
        closes: [102.5, 101.3]
      };

      system.managePositions(data, 1);
      const expectedPnL = (102.5 - 101.3) / 102.5;
      assert.strictEqual(system.trades[0].pnl, expectedPnL);
    });
  });

  describe('Edge Cases', () => {
    it('should return null for insufficient data', () => {
      const system = new TurtleSoupCTR();
      const data = {
        highs: [100, 101],
        lows: [99, 100],
        high20: [100, 100],
        low20: [99, 99],
        rsi: [50, 55],
        volumes: [1000, 1100],
        timestamps: [1000000, 1003000]
      };

      const signal = system.detect(data, 1);
      assert.strictEqual(signal, null);
    });

    it('should handle null high20/low20 values', () => {
      const system = new TurtleSoupCTR();
      const size = 40;
      const data = {
        highs: Array(size).fill(100),
        lows: Array(size).fill(99),
        high20: Array(size).fill(null),
        low20: Array(size).fill(null),
        rsi: Array(size).fill(55),
        volumes: Array(size).fill(1000),
        timestamps: Array.from({ length: size }, (_, i) => 1000000 + i * 300000)
      };

      const signal = system.detect(data, 35);
      assert.strictEqual(signal, null);
    });

    it('should handle null RSI values', () => {
      const system = new TurtleSoupCTR();
      const size = 40;
      const data = {
        highs: Array(size).fill(100),
        lows: Array(size).fill(99),
        high20: Array(size).fill(100),
        low20: Array(size).fill(99),
        rsi: Array(size).fill(null),
        volumes: Array(size).fill(1000),
        timestamps: Array.from({ length: size }, (_, i) => 1000000 + i * 300000)
      };

      const signal = system.detect(data, 35);
      assert.strictEqual(signal, null);
    });
  });
});
`;

// Write the fixed test file
fs.writeFileSync('tests/phase1_paper_trading/turtle_soup_ctr.test.js', turtleSoupTestContent.trim());
console.log('✅ Fixed turtle_soup_ctr.test.js');

console.log('\n✅ Turtle Soup CTR test file fixed successfully!');
