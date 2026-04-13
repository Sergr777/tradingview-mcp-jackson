/**
 * Unit Tests for News Filter System Integration
 * Tests integration of NewsFilterSystem with trading systems
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NewsFilterSystem } from '../../systems/news_filter_system.js';

describe('News Filter System Integration', () => {

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const newsFilter = new NewsFilterSystem();
      assert.strictEqual(newsFilter.preEventWindow, 2);
      assert.strictEqual(newsFilter.postEventWindow, 4);
      assert.deepStrictEqual(newsFilter.impactLevels, ['ALTO', 'EXTREMO']);
      assert.strictEqual(newsFilter.defaultAction, 'NO_NEW_POSITIONS');
    });

    it('should initialize with custom config', () => {
      const newsFilter = new NewsFilterSystem({
        preEventWindow: 3,
        postEventWindow: 6,
        impactLevels: ['EXTREMO'],
        defaultAction: 'REDUCE_POSITIONS'
      });
      assert.strictEqual(newsFilter.preEventWindow, 3);
      assert.strictEqual(newsFilter.postEventWindow, 6);
      assert.deepStrictEqual(newsFilter.impactLevels, ['EXTREMO']);
      assert.strictEqual(newsFilter.defaultAction, 'REDUCE_POSITIONS');
    });
  });

  describe('Standard Events Loading', () => {
    it('should load FOMC events for current year', () => {
      const newsFilter = new NewsFilterSystem();
      const fomcEvents = newsFilter.events.filter(e => e.name === 'FOMC Meeting');

      assert.ok(fomcEvents.length > 0);
      fomcEvents.forEach(event => {
        assert.strictEqual(event.impact, 'EXTREMO');
        assert.strictEqual(event.category, 'MONETARY_POLICY');
      });
    });

    it('should load CPI events for current year', () => {
      const newsFilter = new NewsFilterSystem();
      const cpiEvents = newsFilter.events.filter(e => e.name === 'CPI Report');

      assert.ok(cpiEvents.length > 0);
      cpiEvents.forEach(event => {
        assert.strictEqual(event.impact, 'ALTO');
        assert.strictEqual(event.category, 'INFLATION');
      });
    });

    it('should load NFP events for current year', () => {
      const newsFilter = new NewsFilterSystem();
      const nfpEvents = newsFilter.events.filter(e => e.name === 'Non-Farm Payrolls');

      assert.ok(nfpEvents.length > 0);
      nfpEvents.forEach(event => {
        assert.strictEqual(event.impact, 'ALTO');
        assert.strictEqual(event.category, 'EMPLOYMENT');
      });
    });

    it('should sort events by date', () => {
      const newsFilter = new NewsFilterSystem();
      for (let i = 1; i < newsFilter.events.length; i++) {
        assert.ok(newsFilter.events[i].date >= newsFilter.events[i - 1].date);
      }
    });
  });

  describe('High Impact Time Detection', () => {
    it('should detect pre-event window for FOMC', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const fomcDate = new Date(currentYear, 0, 28); // Jan 28

      // 2 hours before event
      const testTime = new Date(fomcDate.getTime() - 2 * 60 * 60 * 1000);

      const result = newsFilter.isHighImpactTime(testTime);
      assert.strictEqual(result.isHighImpact, true);
      assert.ok(result.reason.includes('FOMC'));
      assert.strictEqual(result.action, 'NO_NEW_POSITIONS');
      assert.ok(result.timeUntilEvent <= 2);
    });

    it('should detect post-event window for FOMC', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const fomcDate = new Date(currentYear, 0, 28);

      // 2 hours after event
      const testTime = new Date(fomcDate.getTime() + 2 * 60 * 60 * 1000);

      const result = newsFilter.isHighImpactTime(testTime);
      assert.strictEqual(result.isHighImpact, true);
      assert.ok(result.reason.includes('FOMC'));
      assert.strictEqual(result.action, 'NO_NEW_POSITIONS');
      assert.ok(result.timeSinceEvent <= 6);
    });

    it('should return false outside event windows', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const fomcDate = new Date(currentYear, 0, 28);

      // 1 day before event (outside window)
      const testTime = new Date(fomcDate.getTime() - 24 * 60 * 60 * 1000);

      const result = newsFilter.isHighImpactTime(testTime);
      assert.strictEqual(result.isHighImpact, false);
      assert.strictEqual(result.action, 'TRADING_NORMAL');
    });
  });

  describe('Manual Event Management', () => {
    it('should add manual event', () => {
      const newsFilter = new NewsFilterSystem();
      const manualEvent = {
        name: 'Unexpected Breaking News',
        date: new Date(),
        impact: 'EXTREMO',
        category: 'BREAKING',
        description: 'Major geopolitical event',
        window: { before: 1, after: 3 }
      };

      newsFilter.addManualEvent(manualEvent);

      assert.strictEqual(newsFilter.manualEvents.length, 1);
      assert.strictEqual(newsFilter.manualEvents[0].name, 'Unexpected Breaking News');
    });

    it('should detect manual event window', () => {
      const newsFilter = new NewsFilterSystem();
      const eventDate = new Date();

      newsFilter.addManualEvent({
        name: 'Breaking News',
        date: eventDate,
        impact: 'EXTREMO',
        category: 'BREAKING',
        window: { before: 1, after: 2 }
      });

      const result = newsFilter.isHighImpactTime(eventDate);
      assert.strictEqual(result.isHighImpact, true);
      assert.ok(result.reason.includes('Breaking News'));
      assert.strictEqual(result.isManual, true);
    });

    it('should clean old manual events', () => {
      const newsFilter = new NewsFilterSystem();
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      newsFilter.addManualEvent({
        name: 'Old Event',
        date: oldDate,
        impact: 'ALTO',
        category: 'TEST'
      });

      newsFilter.cleanOldManualEvents();

      assert.strictEqual(newsFilter.manualEvents.length, 0);
    });
  });

  describe('Position Closing Logic', () => {
    it('should close all positions on EXTREME impact', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const fomcDate = new Date(currentYear, 0, 28);
      const eventTime = new Date(fomcDate.getTime() + 1 * 60 * 60 * 1000);

      const openPositions = [
        { entryPrice: 100, type: 'LONG' },
        { entryPrice: 102, type: 'SHORT' }
      ];

      const result = newsFilter.shouldClosePositions(eventTime, openPositions);
      assert.strictEqual(result.shouldClose, true);
      assert.strictEqual(result.action, 'CLOSE_ALL_POSITIONS');
      assert.strictEqual(result.urgency, 'HIGH');
    });

    it('should reduce positions by 50% on HIGH impact', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const cpiDate = new Date(currentYear, 0, 14);
      const eventTime = new Date(cpiDate.getTime() + 1 * 60 * 60 * 1000);

      const openPositions = [
        { entryPrice: 100, type: 'LONG' }
      ];

      const result = newsFilter.shouldClosePositions(eventTime, openPositions);
      assert.strictEqual(result.shouldClose, true);
      assert.strictEqual(result.action, 'REDUCE_POSITIONS_50%');
      assert.strictEqual(result.urgency, 'MEDIUM');
    });

    it('should maintain positions outside high impact', () => {
      const newsFilter = new NewsFilterSystem();
      const normalTime = new Date();

      const openPositions = [
        { entryPrice: 100, type: 'LONG' }
      ];

      const result = newsFilter.shouldClosePositions(normalTime, openPositions);
      assert.strictEqual(result.shouldClose, false);
      assert.strictEqual(result.action, 'MAINTAIN_POSITIONS');
      assert.strictEqual(result.urgency, 'LOW');
    });
  });

  describe('System Conflict Detection', () => {
    it('should detect conflict for AsianSessionSpecialist during FOMC', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const fomcDate = new Date(currentYear, 0, 28);
      const eventTime = new Date(fomcDate.getTime() + 1 * 60 * 60 * 1000);

      const result = newsFilter.checkSystemConflict('AsianSessionSpecialist', eventTime);
      assert.strictEqual(result.hasConflict, true);
      assert.ok(result.reason.includes('FOMC'));
    });

    it('should detect conflict for USSessionOpenSpecialist during CPI', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const cpiDate = new Date(currentYear, 0, 14);
      const eventTime = new Date(cpiDate.getTime() + 1 * 60 * 60 * 1000);

      const result = newsFilter.checkSystemConflict('USSessionOpenSpecialist', eventTime);
      assert.strictEqual(result.hasConflict, true);
      assert.ok(result.reason.includes('CPI'));
    });

    // TODO: Implement NewsFilterSystem.checkSystemConflict() for 'arbitraje' system
    it.skip('should detect conflict for arbitraje during NFP', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const nfpDate = new Date(currentYear, 0, 10);
      const eventTime = new Date(nfpDate.getTime() + 1 * 60 * 60 * 1000);

      const result = newsFilter.checkSystemConflict('arbitraje', eventTime);
      assert.strictEqual(result.hasConflict, true);
      assert.ok(result.reason.includes('NFP') || result.reason.includes('Non-Farm Payrolls'));
    });

    it('should return no conflict for normal time', () => {
      const newsFilter = new NewsFilterSystem();
      const normalTime = new Date();

      const result = newsFilter.checkSystemConflict('AsianSessionSpecialist', normalTime);
      assert.strictEqual(result.hasConflict, false);
    });
  });

  describe('Upcoming Events', () => {
    it('should return upcoming events for next 7 days', () => {
      const newsFilter = new NewsFilterSystem();
      const now = new Date();
      const upcoming = newsFilter.getUpcomingEvents(7);

      upcoming.forEach(event => {
        assert.ok(event.date >= now);
        const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        assert.ok(event.date <= future);
      });
    });

    it('should return empty array when no events in range', () => {
      const newsFilter = new NewsFilterSystem();
      const upcoming = newsFilter.getUpcomingEvents(0); // Today only

      // May be empty depending on when test runs
      assert.ok(Array.isArray(upcoming));
    });
  });

  describe('Status Report', () => {
    it('should return correct status during high impact', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const fomcDate = new Date(currentYear, 0, 28);
      const eventTime = new Date(fomcDate.getTime() + 1 * 60 * 60 * 1000);

      const status = newsFilter.getStatus(eventTime);

      assert.strictEqual(status.isActive, true);
      assert.ok(status.currentEvent);
      assert.strictEqual(status.currentAction, 'NO_NEW_POSITIONS');
      assert.ok(status.totalEvents > 0);
    });

    it('should return correct status during normal time', () => {
      const newsFilter = new NewsFilterSystem();
      const normalTime = new Date();

      const status = newsFilter.getStatus(normalTime);

      assert.strictEqual(status.isActive, false);
      assert.strictEqual(status.currentEvent, null);
      assert.strictEqual(status.currentAction, 'TRADING_NORMAL');
    });
  });

  describe('Edge Cases', () => {
    it('should handle events at exact boundary', () => {
      const newsFilter = new NewsFilterSystem();
      const currentYear = new Date().getFullYear();
      const fomcDate = new Date(currentYear, 0, 28);

      // Exactly at event time
      const result = newsFilter.isHighImpactTime(fomcDate);
      assert.strictEqual(result.isHighImpact, true);
    });

    it('should handle unknown system names', () => {
      const newsFilter = new NewsFilterSystem();
      const normalTime = new Date();

      const result = newsFilter.checkSystemConflict('UnknownSystem', normalTime);
      assert.strictEqual(result.hasConflict, false);
    });
  });
});
