# Framework de Evaluación — Paper Trading 4 Semanas

> **Estado**: Baseline confirmado. Sistemas listos para paper trading.
>
> **Objetivo**: Evaluar degradación real vs backtest antes de decidir live trading.

---

## 1. DATOS A REGISTRAR CADA SEMANA

### Por Trade (Obligatorio)

| Campo | Formato | Fuente |
|-------|---------|--------|
| `timestamp_entrada` | ISO 8601 | TradingView alerta / bot |
| `timestamp_salida` | ISO 8601 | TradingView alerta / bot |
| `sistema` | `TURTLE` o `OB` | Identificación manual |
| `direccion` | `LONG` / `SHORT` | Alerta |
| `precio_entrada` | Float | Alerta / ejecución |
| `precio_salida` | Float | Alerta / ejecución |
| `sl` | Float | Configurado |
| `tp` | Float | Configurado |
| `razon_salida` | `TP` / `SL` / `SESSION_END` / `MANUAL` | Log |
| `size_usd` | Float | Sizing calculado |
| `comision_est` | Float | 0.10% por lado |
| `slippage_est` | Float | Diferencia alerta vs ejecución |

### Por Día (Resumen)

| Campo | Cálculo |
|-------|---------|
| `pnl_dia` | Suma PnL neto del día |
| `trades_dia` | Cantidad de trades |
| `equity` | Equity acumulado |
| `drawdown` | Máxima caída desde peak |
| `exposicion` | Capital en riesgo simultáneo |

---

## 2. MÉTRICAS SEMANALES A CALCULAR

### Semana 1-4: Tracking básico

```javascript
function calcWeeklyMetrics(tradesSemana, equityInicial) {
  const trades = tradesSemana.length;
  const wins = tradesSemana.filter(t => t.pnl > 0);
  const wr = wins.length / trades;
  const gw = wins.reduce((s, t) => s + t.pnl, 0);
  const gl = Math.abs(tradesSemana.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
  const pf = gl > 0 ? gw / gl : Infinity;
  const avgTrade = tradesSemana.reduce((s, t) => s + t.pnl, 0) / trades;
  const totalPnL = tradesSemana.reduce((s, t) => s + t.pnl, 0);

  // Sharpe semanal (anualizado)
  const dailyRets = aggregateByDay(tradesSemana);
  const meanD = dailyRets.reduce((s, v) => s + v, 0) / dailyRets.length;
  const stdD = Math.sqrt(dailyRets.reduce((s, v) => s + (v - meanD) ** 2, 0) / dailyRets.length);
  const sharpe = stdD > 0 ? (meanD / stdD) * Math.sqrt(252) : 0;

  return { trades, wr, pf, avgTrade, totalPnL, sharpe };
}
```

### Comparativa Backtest vs Paper

| Métrica | Backtest Esperado | Umbral Aceptable | Acción si falla |
|---------|------------------|------------------|-----------------|
| WR Turtle | 53.3% | > 45% | Revisar sesiones / slippage |
| WR OB | 73.1% | > 65% | Revisar threshold / features |
| PF Turtle | 1.14 | > 1.05 | Verificar SL/TP ejecución |
| PF OB | 3.15 | > 2.20 | Revisar scoring / condiciones entrada |
| Sharpe Portfolio | 6.48 | > 4.50 | Reducir sizing o pausar |
| Max DD | 5.42% (est) | < 8% | Pausar si > 6% en 1 semana |
| Avg Trade | 0.13% | > 0.08% | Revisar comisiones + slippage |
| Slippage promedio | — | < 0.10% | Ajustar órdenes limit vs market |

---

## 3. DECISIONES POST-4 SEMANAS

### Flujo de Decisión

```
Semana 4
  │
  ├──> Métricas dentro de umbrales?
  │      ├── SÍ ──> Aprobar escalamiento a Half-Kelly (mes 3-4)
  │      └── NO ──> Diagnóstico:
  │                   ├── WR caído > 10pp? ──> Revisar señales, posible overfit
  │                   ├── PF < 1.3? ──> Revisar RR, comisiones, slippage
  │                   ├── Sharpe < 4? ──> Reducir sizing 50%, continuar paper 2 semanas
  │                   └── DD > 8%? ──> PAUSAR. Analizar correlación, posible crisis.
  │
  └──> Acciones según escenario:
```

### Escenarios y Acciones

| Escenario | Criterio | Acción Recomendada |
|-----------|----------|-------------------|
| **Verde** | WR OB > 65%, PF > 2.0, Sharpe > 5, DD < 6% | Aprobar live. Escalar a Third-Kelly (mes 3-4). |
| **Amarillo** | WR OB 55-65%, PF 1.5-2.0, Sharpe 3.5-5, DD 6-8% | Continuar paper 2-4 semanas más. Mantener Quarter-Kelly. Revisar logs. |
| **Rojo** | WR OB < 55%, PF < 1.5, Sharpe < 3.5, DD > 8% | **NO aprobar live**. Pausar. Analizar post-mortem. Posible revertir a baseline más estricto. |

### Checklist de Aprobación Live

- [ ] 4 semanas completas de datos (mínimo 20 días operables)
- [ ] Todos los trades logueados con timestamps y precios
- [ ] WR OB dentro de ±8pp del backtest
- [ ] PF combinado > 1.5
- [ ] Sharpe semanal promedio > 4.0
- [ ] Max DD acumulado < 8%
- [ ] Slippage promedio documentado < 0.10%
- [ ] Sin correlación anómala entre sistemas (> 0.3 o < -0.5)
- [ ] Sin sesgo de sesión detectable (ej: solo ganancias en NY)

---

## 4. CONTROLES DE RIESGO DURANTE PAPER

```javascript
const PAPER_CONTROLS = {
  MAX_DAILY_TRADES: 5,
  MAX_CONSECUTIVE_LOSSES: 3,     // Alerta, no pausa obligatoria en paper
  MAX_DRAWDOWN_ALERT: 0.06,      // 6% — alerta amarilla
  MAX_DRAWDOWN_PAUSE: 0.08,      // 8% — pausar y revisar
  EVENT_BLACKOUT: true,          // No operar CPI, FOMC, NFP
  NIGHT_SESSION_FILTER: true,     // Solo NY + London
  MAX_POSITIONS_OB: 3,
  LOG_ALL_SLIPPAGE: true,        // Crítico para validar ejecución
};
```

---

## 5. PLANTILLA DE REGISTRO SEMANAL

### Semana N

```
Fecha inicio: ____
Fecha fin:    ____
Trades Turtle: ____ | WR: ____% | PF: ____ | PnL: ____%
Trades OB:     ____ | WR: ____% | PF: ____ | PnL: ____%
Portfolio:     ____ | Sharpe: ____ | DD: ____% | Equity: ____

Observaciones:
- Slippage promedio: ____
- Problemas de ejecución: ____
- Eventos macro: ____
- Desviaciones vs backtest: ____

Decisión: [ ] Continuar  [ ] Escalar  [ ] Pausar  [ ] Abortar
```

---

## 6. HERRAMIENTAS

- **Log trades**: Usar `results/paper_trading_YYYY-MM-DD.json` (mismo formato que backtest)
- **Dashboard**: Importar JSON a spreadsheet para cálculo semanal
- **Comparativa**: Script `backtesting/compare_paper_vs_backtest.js` (a desarrollar si se aprueba)

---

## 7. EXPECTATIVAS REALISTAS

| Factor | Backtest | Paper Esperado | Live Esperado |
|--------|----------|---------------|---------------|
| WR | 64.0% | 58-62% | 55-60% |
| PF | 1.74 | 1.50-1.70 | 1.40-1.60 |
| Sharpe | 6.48 | 5.0-6.0 | 4.0-5.5 |
| Max DD | 5.4% | 6-8% | 8-12% |
| CAGR | 35.5% | 28-33% | 22-28% |

**Degradación aceptable paper vs backtest**: 15-25%
**Degradación aceptable live vs paper**: 10-20%

Si la degradación paper vs backtest supera 30%, hay un problema de ejecución o el backtest está overfit.

---

*Documento generado: 2026-04-23*
*Sistemas: Turtle Soup Baseline + LGB OB Baseline (Fase 1 REVERTIDA)*
