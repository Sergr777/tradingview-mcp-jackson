# Portfolio Recomendado — Recálculo sin Arbitrage v4

> ⚠️ **ESTADO: ACTUALIZADO A BASELINE (2026-04-23)**
>
> El portfolio original calculado con Turtle Fase 1 (optimizado) resultó
> en **PnL -4.69% y Sharpe -0.275** (ruin total).
>
> Este documento y el archivo `portfolio_recomendado.js` han sido actualizados
> para usar **baseline** en ambos sistemas. Las métricas a continuación
> reflejan el baseline probado.
>
> Ver `06_POST_MORTEM.md` para análisis completo.

## Archivo: `backtesting/portfolio_recomendado.js`

---

## 1. PROBLEMA DEL PORTFOLIO ORIGINAL

El portfolio original (`portfolio_combined.js`) incluía Arbitrage v4 con PF~1.04, lo que:
- Arrastraba el Sharpe del portfolio a 3.03 (muy por debajo de los sistemas individuales)
- Inflaba el Max DD a 17.5% (más del triple que los sistemas individuales)
- Consumía capital sin generar retorno real

**Decisión**: Eliminar Arbitrage v4 completamente del portfolio.

---

## 2. NUEVA ASIGNACIÓN

```
60% LGB OB System     — Mayor Sharpe (9.16), más trades (~242/año)
30% Turtle Soup F1    — Diversificador ortogonal (r=-0.022), reglas puras
10% Reserva           — Para drawdowns y oportunidades
```

### Por qué 60/30/10 y no 50/50?

| Factor | 50/50 | 60/30/10 |
|--------|-------|----------|
| Sharpe esperado | ~6.0 | ~7.0-8.0 |
| Diversificación | Sí | Sí (más peso al mejor sistema) |
| Robustez | Media | Alta (reserva protege) |
| Live replication | Media | Alta (OB más complejo, menor alloc) |

**OB tiene Sharpe 9.16 vs Turtle 4.52** — asignar más peso al sistema con mayor ratio de Sharpe es óptimo según teoría de Kelly.

---

## 3. SIZING: QUARTER-KELLY (CONSERVADOR)

### Razonamiento
- Half-Kelly es agresivo para los primeros 6 meses de live
- Quarter-Kelly = (Full Kelly / 4) = (Half-Kelly / 2)
- Es el estándar institucional para sistemas nuevos no probados en live

### Sizing para $10,000

| Sistema | Half-Kelly | Quarter-Kelly | $ por trade | Max Posiciones |
|---------|-----------|---------------|-------------|----------------|
| Turtle  | 13.0%     | **6.5%**      | $650        | 1              |
| OB      | 12.0%     | **6.0%**      | $600        | 2-3            |

### Capital en riesgo simultáneo
```
Turtle:  1 posición × $650   = $650
OB:      3 posiciones × $600 = $1,800
────────────────────────────────────
Total riesgo:                 = $2,450 (~24.5%)
Reserva:                      = $7,550 (~75.5%)
```

---

## 4. MÉTRICAS ESPERADAS

### Sistemas Individuales

| Métrica | Turtle Fase 1 | OB Fase 1-2 |
|---------|---------------|-------------|
| WR      | 63-65%        | 74-75%      |
| PF      | 2.0-2.1       | 3.3-3.5     |
| Sharpe  | 5.0-5.2       | 9.5-10.0    |
| Max DD  | 6.0%          | 4.5%        |
| CAGR    | 30-33%        | 50-55%      |

### Portfolio 60/30/10

| Métrica | Estimado |
|---------|----------|
| Sharpe  | 7.0-8.0  |
| Max DD  | 8-10%    |
| CAGR    | 35-40%   |
| Correlación | r ≈ -0.02 |

---

## 5. EXPECTATIVAS LIVE (DEGRADACIÓN)

| Escenario | Impacto | Resultado Estimado |
|-----------|---------|---------------------|
| Base (típico) | Slippage +0.05% | Sharpe ~6.5-7.5 |
| Volátil (alta vol) | GARCH subestima | Sharpe ~5.5-6.5, DD +2% |
| Sideways (baja vol) | Más señales mixtas | Sharpe ~5.0-6.0 |
| Crisis (correlación 1) | Todo cae junto | DD puede alcanzar 15% |

**Degradación esperada del backtest al live**: 25-35% (más conservador que el 30-50% original)

---

## 6. CONTROLES DE RIESGO LIVE

```javascript
const RISK_CONTROLS = {
    MAX_DAILY_TRADES: 5,           // Prevenir overtrading
    MAX_CONSECUTIVE_LOSSES: 3,     // Pausar si 3 pérdidas seguidas
    MAX_DRAWDOWN_PAUSE: 0.03,      // Pausar si DD > 3%
    EVENT_BLACKOUT: true,          // No operar en eventos macro (CPI, FOMC)
    NIGHT_SESSION_FILTER: true,     // Reducir exposición fuera NY/London
    MAX_POSITIONS_OB: 3,           // Máximo 3 posiciones OB simultáneas
    CORRELATION_CHECK: true,       // Verificar correlación antes de entrar
    DRAWDOWN_PAUSE: 0.025,         // Pausar OB si DD > 2.5%
};
```

---

## 7. PLAN DE ESCALAMIENTO DE SIZING

| Período | Sizing | Condición para subir |
|---------|--------|----------------------|
| Mes 1-2 | Quarter-Kelly (6.0-6.5%) | — |
| Mes 3-4 | Third-Kelly (8.0-8.7%) | 2 meses sin DD > 5% |
| Mes 5-6 | Half-Kelly (12-13%) | 4 meses consistentes |
| Mes 7+  | Half-Kelly o más | Validación live completa |

**Nunca usar Full-Kelly** en trading algorítmico. El Half-Kelly es el máximo prudente.

---

## 8. EJECUCIÓN

```bash
cd backtesting
# Requiere que OB haya sido ejecutado primero
node portfolio_recomendado.js
```

Nota: El portfolio carga los resultados OB desde `results/lgbm_ob_trading_system.json`. Si no existe, usa métricas documentadas del informe.

Salida esperada:
- Métricas Turtle Fase 1
- Métricas OB System
- Métricas Portfolio combinado (60/30)
- Correlación Turtle vs OB
- Sizing Quarter-Kelly recomendado
- Archivo JSON en `results/portfolio_recomendado.json`
