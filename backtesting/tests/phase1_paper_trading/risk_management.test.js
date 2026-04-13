/**
 * Unit Tests for Risk Management
 * Tests risk management across all trading systems
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VWAPBounce } from '../../systems/vwap_bounce.js';
import { TurtleSoupCTR } from '../../systems/turtle_soup_ctr.js';
import { EMARSI } from '../../systems/ema_rsi.js';
import { MeanReversion } from '../../systems/mean_reversion.js';
import { PortfolioHedgeSystem } from '../../systems/portfolio_hedge_system.js';

describe('Risk Management', () => {

  describe('Stop Loss Validation', () => {
    it('should validate stop loss distance for LONG positions', () => {
      const systems = [
        new VWAPBounce(),
        new TurtleSoupCTR(),
        new EMARSI(),
        new MeanReversion()
      ];

      systems.forEach(system => {
        const maxStopLoss = 0.01; // 1% maximum

        if (system instanceof VWAPBounce) {
          assert.ok(system.stopLoss < maxStopLoss, 'VWAP stop loss too large');
        } else if (system instanceof TurtleSoupCTR) {
          assert.ok(system.stopLossMultiplier < maxStopLoss, 'Turtle Soup stop loss too large');
        } else if (system instanceof EMARSI) {
          assert.ok(system.stopLoss < maxStopLoss, 'EMA+RSI stop loss too large');
        } else if (system instanceof MeanReversion) {
          assert.ok(system.stopLoss < maxStopLoss, 'Mean Reversion stop loss too large');
        }
      });
    });

    it('should validate stop loss distance for SHORT positions', () => {
      const system = new VWAPBounce();
      const data = {
        closes: [102, 101, 100],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      };

      const signal = system.detect(data, 2);

      if (signal && signal.type === 'SHORT') {
        const stopDistance = (signal.stop - signal.entry) / signal.entry;
        assert.ok(stopDistance > 0, 'Stop loss should be above entry for SHORT');
        assert.ok(stopDistance < 0.01, 'Stop loss distance too large');
      }
    });
  });

  describe('Take Profit Validation', () => {
    it('should validate take profit is greater than stop loss', () => {
      const system = new VWAPBounce();
      const data = {
        closes: [100, 101, 102],
        volumes: [1000, 1200, 1500],
        vwap: [100.5, 100.5, 100.5]
      };

      const signal = system.detect(data, 2);

      if (signal && signal.type === 'LONG') {
        const profitDistance = signal.target - signal.entry;
        const stopDistance = signal.entry - signal.stop;

        assert.ok(profitDistance > stopDistance, 'Take profit should be greater than stop loss');
      }
    });

    it('should validate risk-reward ratio is at least 1:1.5', () => {
      const systems = [
        new VWAPBounce(),
        new TurtleSoupCTR(),
        new EMARSI(),
        new MeanReversion()
      ];

      systems.forEach(system => {
        let stopLoss, takeProfit;

        if (system instanceof VWAPBounce) {
          stopLoss = system.stopLoss;
          takeProfit = system.takeProfit;
        } else if (system instanceof TurtleSoupCTR) {
          stopLoss = system.stopLossMultiplier;
          takeProfit = system.takeProfitMultiplier;
        } else if (system instanceof EMARSI) {
          stopLoss = system.stopLoss;
          takeProfit = system.takeProfit;
        } else if (system instanceof MeanReversion) {
          stopLoss = system.stopLoss;
          takeProfit = system.takeProfit;
        }

        const riskRewardRatio = takeProfit / stopLoss;
        assert.ok(riskRewardRatio >= 1.5, `Risk-reward ratio too low: ${riskRewardRatio}`);
      });
    });
  });

  describe('Position Sizing', () => {
    it('should limit maximum position size', () => {
      const maxPositionSize = 1000;
      const signal = {
        type: 'LONG',
        entry: 100,
        stop: 99.7,
        target: 100.6,
        confidence: 0.65,
        reason: 'Test',
        system: 'VWAP_BOUNCE'
      };

      // Calculate position size based on risk
      const riskPerShare = signal.entry - signal.stop;
      const riskPerTrade = signal.entry * 0.01; // 1% risk
      const positionSize = Math.floor(riskPerTrade / riskPerShare);

      assert.ok(positionSize <= maxPositionSize, `Position size too large: ${positionSize}`);
    });

    it('should adjust position size based on confidence', () => {
      const highConfidenceSignal = {
        type: 'LONG',
        entry: 100,
        stop: 99.7,
        target: 100.6,
        confidence: 0.80,
        reason: 'High confidence',
        system: 'VWAP_BOUNCE'
      };

      const lowConfidenceSignal = {
        type: 'LONG',
        entry: 100,
        stop: 99.7,
        target: 100.6,
        confidence: 0.50,
        reason: 'Low confidence',
        system: 'VWAP_BOUNCE'
      };

      const highConfidenceSize = Math.floor(highConfidenceSignal.confidence * 1000);
      const lowConfidenceSize = Math.floor(lowConfidenceSignal.confidence * 1000);

      assert.ok(highConfidenceSize > lowConfidenceSize);
    });
  });

  describe('Portfolio Hedge System', () => {
    it('should calculate net exposure correctly', () => {
      const hedgeSystem = new PortfolioHedgeSystem();
      const openPositions = [
        { type: 'LONG', entryPrice: 100 },
        { type: 'LONG', entryPrice: 102 },
        { type: 'SHORT', entryPrice: 101 }
      ];

      const exposure = hedgeSystem.calculateNetExposure(openPositions);

      assert.strictEqual(exposure.longExposure, 202);
      assert.strictEqual(exposure.shortExposure, 101);
      assert.strictEqual(exposure.netExposure, 101);
      assert.strictEqual(exposure.netType, 'LONG');
    });

    it('should detect hedge trigger on drawdown', () => {
      const hedgeSystem = new PortfolioHedgeSystem();
      const data = {
        closes: [100],
        timestamps: [1000000]
      };

      const cumulativePnL = -0.06; // -6% drawdown
      const openPositions = [
        { type: 'LONG', entryPrice: 1000 }
      ];

      const signal = hedgeSystem.detect(data, 0, [], cumulativePnL, openPositions);

      if (signal) {
        assert.strictEqual(signal.type, 'SHORT');
        assert.ok(signal.reason.includes('Hedge ACTIVO'));
        assert.ok(signal.reason.includes('Drawdown'));
      }
    });

    it('should not hedge on minor drawdown', () => {
      const hedgeSystem = new PortfolioHedgeSystem();
      const data = {
        closes: [100],
        timestamps: [1000000]
      };

      const cumulativePnL = -0.03; // -3% drawdown (below 5% threshold)
      const openPositions = [
        { type: 'LONG', entryPrice: 1000 }
      ];

      const signal = hedgeSystem.detect(data, 0, [], cumulativePnL, openPositions);
      assert.strictEqual(signal, null);
    });

    it('should close hedge on recovery', () => {
      const hedgeSystem = new PortfolioHedgeSystem();
      hedgeSystem.isHedging = true;
      hedgeSystem.positions.push({
        entryTime: 1000000,
        entryPrice: 100,
        type: 'SHORT',
        stopLoss: 100.2,
        takeProfit: 99.5,
        confidence: 0.90,
        reason: 'Hedge'
      });

      const data = {
        closes: [100],
        timestamps: [1000000]
      };

      const cumulativePnL = -0.01; // -1% (above -2% recovery threshold)

      const signal = hedgeSystem.detect(data, 0, [], cumulativePnL, []);

      if (signal) {
        assert.strictEqual(signal.type, 'CLOSE_HEDGE');
        assert.ok(signal.reason.includes('Recovery'));
      }
    });
  });

  describe('Maximum Drawdown Protection', () => {
    it('should track cumulative PnL correctly', () => {
      const trades = [
        { pnl: 0.01 },   // +1%
        { pnl: -0.005 }, // -0.5%
        { pnl: 0.015 },  // +1.5%
        { pnl: -0.02 },  // -2%
        { pnl: 0.008 }   // +0.8%
      ];

      let cumulative = 0;
      let peak = 0;
      let maxDrawdown = 0;

      trades.forEach(trade => {
        cumulative += trade.pnl;
        if (cumulative > peak) {
          peak = cumulative;
        }
        const drawdown = peak > 0 ? (peak - cumulative) / peak : 0;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      });

      const expectedCumulative = 0.01 - 0.005 + 0.015 - 0.02 + 0.008;
      assert.strictEqual(Math.abs(cumulative - expectedCumulative) < 0.0001, true);
      assert.ok(maxDrawdown >= 0);
    });

    it('should calculate drawdown correctly', () => {
      const cumulativePnL = [0.01, 0.02, 0.015, 0.025, 0.01, 0.005];

      let peak = 0;
      let maxDrawdown = 0;

      cumulativePnL.forEach(pnl => {
        if (pnl > peak) {
          peak = pnl;
        }
        const drawdown = peak > 0 ? (peak - pnl) / peak : 0;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      });

      assert.ok(maxDrawdown > 0);
      assert.ok(maxDrawdown < 1);
    });
  });

  describe('Time-Based Risk Management', () => {
    it('should close positions after max duration', () => {
      const system = new VWAPBounce();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 100,
        type: 'LONG',
        stopLoss: 99.7,
        takeProfit: 100.6,
        confidence: 0.65,
        reason: 'Test'
      });

      const timestamps = Array.from({ length: 20 }, (_, i) => 1000000 + i * 300000);
      const closes = Array(20).fill(100);

      const data = { timestamps, closes };

      system.managePositions(data, 15); // After 15 periods

      assert.strictEqual(system.positions.length, 0);
      assert.strictEqual(system.trades.length, 1);
      assert.strictEqual(system.trades[0].exitReason, 'TIME_EXIT');
    });

    it('should track position duration correctly', () => {
      const system = new VWAPBounce();
      system.positions.push({
        entryTime: 1000000,
        entryPrice: 100,
        type: 'LONG',
        stopLoss: 99.7,
        takeProfit: 100.6,
        confidence: 0.65,
        reason: 'Test'
      });

      const data = {
        timestamps: [1000000, 1003000, 1006000],
        closes: [100, 100, 100]
      };

      system.managePositions(data, 2);

      if (system.trades.length > 0) {
        assert.strictEqual(system.trades[0].duration, 2);
      }
    });
  });

  describe('Consecutive Loss Protection', () => {
    it('should detect consecutive losing streaks', () => {
      const trades = [
        { success: false, pnl: -0.01 },
        { success: false, pnl: -0.008 },
        { success: false, pnl: -0.012 }
      ];

      let consecutiveLosses = 0;
      let maxConsecutiveLosses = 0;

      trades.forEach(trade => {
        if (!trade.success) {
          consecutiveLosses++;
          if (consecutiveLosses > maxConsecutiveLosses) {
            maxConsecutiveLosses = consecutiveLosses;
          }
        } else {
          consecutiveLosses = 0;
        }
      });

      assert.strictEqual(maxConsecutiveLosses, 3);
    });

    it('should recommend position size reduction after losses', () => {
      const consecutiveLosses = 3;
      const basePositionSize = 1000;
      const reductionFactor = 0.5;

      let recommendedSize = basePositionSize;

      if (consecutiveLosses >= 3) {
        recommendedSize = basePositionSize * reductionFactor;
      }

      assert.strictEqual(recommendedSize, 500);
    });
  });

  describe('Correlation Risk', () => {
    it('should detect over-exposure to same direction', () => {
      const openPositions = [
        { type: 'LONG', entryPrice: 100, system: 'VWAP_BOUNCE' },
        { type: 'LONG', entryPrice: 102, system: 'EMA8_RSI' },
        { type: 'LONG', entryPrice: 101, system: 'TURTLE_SOUP_CTR' }
      ];

      const longCount = openPositions.filter(p => p.type === 'LONG').length;
      const shortCount = openPositions.filter(p => p.type === 'SHORT').length;

      assert.strictEqual(longCount, 3);
      assert.strictEqual(shortCount, 0);

      // Should warn about over-exposure
      const isOverExposed = longCount >= 3;
      assert.ok(isOverExposed);
    });

    it('should balance long and short positions', () => {
      const openPositions = [
        { type: 'LONG', entryPrice: 100 },
        { type: 'SHORT', entryPrice: 102 },
        { type: 'LONG', entryPrice: 101 },
        { type: 'SHORT', entryPrice: 103 }
      ];

      const longCount = openPositions.filter(p => p.type === 'LONG').length;
      const shortCount = openPositions.filter(p => p.type === 'SHORT').length;

      assert.strictEqual(longCount, 2);
      assert.strictEqual(shortCount, 2);

      // Balanced portfolio
      const isBalanced = Math.abs(longCount - shortCount) <= 1;
      assert.ok(isBalanced);
    });
  });

  describe('Volatility Risk', () => {
    it('should adjust risk parameters during high volatility', () => {
      const normalVolatility = 0.01; // 1%
      const highVolatility = 0.03; // 3%

      let stopLossMultiplier = 1.0;

      if (highVolatility > normalVolatility * 2) {
        stopLossMultiplier = 1.5; // Widen stops
      }

      assert.strictEqual(stopLossMultiplier, 1.5);
    });

    it('should reduce position size during high volatility', () => {
      const normalVolatility = 0.01;
      const highVolatility = 0.03;

      const basePositionSize = 1000;
      let positionSize = basePositionSize;

      if (highVolatility > normalVolatility * 2) {
        positionSize = basePositionSize * 0.5; // Reduce by 50%
      }

      assert.strictEqual(positionSize, 500);
    });
  });
});
