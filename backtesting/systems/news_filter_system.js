/**
 * SISTEMA DE FILTRO DE NOTICIAS - PROTECCIÓN COMPLETA
 *
 * Protege los 4 sistemas contra volatilidad extrema por noticias
 * Se integra automáticamente con todos los sistemas
 */

export class NewsFilterSystem {
  constructor(config = {}) {
    // Ventanas de tiempo
    this.preEventWindow = config.preEventWindow || 2; // 2 horas antes
    this.postEventWindow = config.postEventWindow || 4; // 4 horas después

    // Niveles de impacto
    this.impactLevels = config.impactLevels || ['ALTO', 'EXTREMO'];

    // Acción a tomar
    this.defaultAction = config.defaultAction || 'NO_NEW_POSITIONS';

    // Calendario de eventos
    this.events = [];
    this.manualEvents = [];

    // Cargar eventos
    this.loadStandardEvents();
  }

  /**
   * Carga eventos estándar del calendario económico
   */
  loadStandardEvents() {
    const currentYear = new Date().getFullYear();

    // FOMC Meetings 2026
    const fomcDates = [
      new Date(currentYear, 0, 28),   // Ene 28
      new Date(currentYear, 2, 18),   // Mar 18
      new Date(currentYear, 4, 14),   // May 14
      new Date(currentYear, 6, 29),   // Jul 29
      new Date(currentYear, 8, 16),   // Sep 16
      new Date(currentYear, 10, 5),   // Nov 5
      new Date(currentYear, 11, 16)   // Dic 16
    ];

    // CPI Reports 2026
    const cpiDates = [
      new Date(currentYear, 0, 14),   // Ene 14
      new Date(currentYear, 1, 13),   // Feb 13
      new Date(currentYear, 2, 14),   // Mar 14
      new Date(currentYear, 3, 14),   // Abr 14
      new Date(currentYear, 4, 14),   // May 14
      new Date(currentYear, 5, 13),   // Jun 13
      new Date(currentYear, 6, 14),   // Jul 14
      new Date(currentYear, 7, 14),   // Ago 14
      new Date(currentYear, 8, 14),   // Sep 14
      new Date(currentYear, 9, 14),   // Oct 14
      new Date(currentYear, 10, 14),  // Nov 14
      new Date(currentYear, 11, 14)   // Dic 14
    ];

    // NFP (Non-Farm Payrolls) 2026
    const nfpDates = [
      new Date(currentYear, 0, 10),   // Ene 10
      new Date(currentYear, 1, 7),    // Feb 7
      new Date(currentYear, 2, 14),   // Mar 14
      new Date(currentYear, 3, 7),    // Abr 7
      new Date(currentYear, 4, 7),    // May 7
      new Date(currentYear, 5, 7),    // Jun 7
      new Date(currentYear, 6, 7),    // Jul 7
      new Date(currentYear, 7, 7),    // Ago 7
      new Date(currentYear, 8, 7),    // Sep 7
      new Date(currentYear, 9, 7),    // Oct 7
      new Date(currentYear, 10, 7),   // Nov 7
      new Date(currentYear, 11, 7)    // Dic 7
    ];

    // Añadir eventos al calendario
    for (const date of fomcDates) {
      this.events.push({
        name: 'FOMC Meeting',
        date: date,
        impact: 'EXTREMO',
        category: 'MONETARY_POLICY',
        timezone: 'America/New_York',
        window: { before: 4, after: 6 } // 4h antes, 6h después
      });
    }

    for (const date of cpiDates) {
      this.events.push({
        name: 'CPI Report',
        date: date,
        impact: 'ALTO',
        category: 'INFLATION',
        timezone: 'America/New_York',
        window: { before: 2, after: 3 }
      });
    }

    for (const date of nfpDates) {
      this.events.push({
        name: 'Non-Farm Payrolls',
        date: date,
        impact: 'ALTO',
        category: 'EMPLOYMENT',
        timezone: 'America/New_York',
        window: { before: 2, after: 4 }
      });
    }

    // Ordenar eventos por fecha
    this.events.sort((a, b) => a.date - b.date);
  }

  /**
   * Añade evento manual (noticias imprevistas)
   */
  addManualEvent(event) {
    this.manualEvents.push({
      ...event,
      date: new Date(event.date),
      addedAt: new Date()
    });
  }

  /**
   * Verifica si estamos en ventana de alto impacto
   */
  isHighImpactTime(currentTimestamp) {
    const currentDate = new Date(currentTimestamp);

    // Verificar eventos programados
    for (const event of this.events) {
      const eventDate = new Date(event.date);
      const timeDiff = (currentDate - eventDate) / (1000 * 60 * 60); // horas

      const windowBefore = event.window?.before || this.preEventWindow;
      const windowAfter = event.window?.after || this.postEventWindow;

      // Ventana antes del evento
      if (timeDiff >= -windowBefore && timeDiff < 0) {
        return {
          isHighImpact: true,
          reason: `${event.name} (en ${Math.abs(timeDiff).toFixed(1)}h)`,
          event: event,
          action: this.getActionForImpact(event.impact),
          timeUntilEvent: Math.abs(timeDiff)
        };
      }

      // Ventana después del evento
      if (timeDiff >= 0 && timeDiff < windowAfter) {
        return {
          isHighImpact: true,
          reason: `${event.name} (hace ${timeDiff.toFixed(1)}h)`,
          event: event,
          action: this.getActionForImpact(event.impact),
          timeSinceEvent: timeDiff
        };
      }
    }

    // Verificar eventos manuales
    for (const event of this.manualEvents) {
      const eventDate = new Date(event.date);
      const timeDiff = (currentDate - eventDate) / (1000 * 60 * 60);

      const windowBefore = event.window?.before || 2;
      const windowAfter = event.window?.after || 6;

      if (timeDiff >= -windowBefore && timeDiff < windowAfter) {
        return {
          isHighImpact: true,
          reason: `${event.name} (${event.description})`,
          event: event,
          action: this.getActionForImpact(event.impact),
          isManual: true
        };
      }
    }

    return {
      isHighImpact: false,
      reason: null,
      event: null,
      action: 'TRADING_NORMAL'
    };
  }

  /**
   * Determina acción según nivel de impacto
   */
  getActionForImpact(impact) {
    if (impact === 'EXTREMO') {
      return 'NO_NEW_POSITIONS';
    } else if (impact === 'ALTO') {
      return 'REDUCE_POSITIONS';
    } else {
      return 'TRADING_NORMAL';
    }
  }

  /**
   * Verifica si debemos cerrar posiciones existentes
   */
  shouldClosePositions(currentTimestamp, openPositions) {
    const highImpact = this.isHighImpactTime(currentTimestamp);

    if (highImpact.isHighImpact && openPositions.length > 0) {
      // Cerrar posiciones si el impacto es EXTREMO
      if (highImpact.event.impact === 'EXTREMO') {
        return {
          shouldClose: true,
          reason: highImpact.reason,
          action: 'CLOSE_ALL_POSITIONS',
          urgency: 'HIGH'
        };
      }

      // Reducir posiciones si el impacto es ALTO
      if (highImpact.event.impact === 'ALTO' && highImpact.action === 'REDUCE_POSITIONS') {
        return {
          shouldClose: true,
          reason: highImpact.reason,
          action: 'REDUCE_POSITIONS_50%',
          urgency: 'MEDIUM'
        };
      }
    }

    return {
      shouldClose: false,
      reason: null,
      action: 'MAINTAIN_POSITIONS',
      urgency: 'LOW'
    };
  }

  /**
   * Obtiene próximos eventos (próximos 7 días)
   */
  getUpcomingEvents(days = 7) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.events.filter(e => e.date >= now && e.date <= future);
  }

  /**
   * Verifica si hay conflicto con horario de sistema
   */
  checkSystemConflict(systemName, currentTimestamp) {
    const highImpact = this.isHighImpactTime(currentTimestamp);

    if (!highImpact.isHighImpact) {
      return { hasConflict: false };
    }

    // Asian Session: 8pm-12am EST (00:00-04:00 UTC)
    // MeanReversion: 24/7
    // US Open: 9:30am-11am EST (14:30-16:00 UTC)
    // Arbitraje: 24/7

    const conflicts = {
      'AsianSessionSpecialist': ['FOMC', 'CPI', 'NFP'], // Todos afectan
      'MeanReversionTPPartial': ['FOMC', 'CPI', 'NFP'],
      'USSessionOpenSpecialist': ['FOMC', 'CPI', 'NFP'],
      'StatisticalArbitragePairs': ['FOMC', 'CPI', 'NFP'] // Noticias rompen correlación
    };

    const systemConflicts = conflicts[systemName] || [];

    for (const conflict of systemConflicts) {
      if (highImpact.event.name.includes(conflict)) {
        return {
          hasConflict: true,
          reason: highImpact.reason,
          action: highImpact.action
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Limpia eventos manuales antiguos (más de 1 día)
   */
  cleanOldManualEvents() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    this.manualEvents = this.manualEvents.filter(e => e.date >= oneDayAgo);
  }

  /**
   * Obtiene estado actual del filtro
   */
  getStatus(currentTimestamp) {
    const highImpact = this.isHighImpactTime(currentTimestamp);
    const upcoming = this.getUpcomingEvents(7);

    return {
      isActive: highImpact.isHighImpact,
      currentEvent: highImpact.event,
      currentAction: highImpact.action,
      upcomingEvents: upcoming,
      totalEvents: this.events.length,
      manualEvents: this.manualEvents.length
    };
  }
}

/**
 * WRAPPER PARA INTEGRAR CON SISTEMAS EXISTENTES
 *
 * Uso:
 * const newsFilter = new NewsFilterSystem();
 * const check = newsFilter.checkSystemConflict('AsianSessionSpecialist', timestamp);
 * if (check.hasConflict) return null; // No generar señal
 */

export default NewsFilterSystem;
