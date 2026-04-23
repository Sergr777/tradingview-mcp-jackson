# Cambios Implementados: Turtle Soup CRT Fase 1

> ⚠️ **ESTADO: REVERTIDO A BASELINE (2026-04-23)**
>
> Las optimizaciones descritas en este documento fueron implementadas,
> backtesteadas con WFA, y **REVERTIDAS** tras resultados catastróficos:
> - WR: 61.52% → 51.41% (-10.1pp)
> - PF: 1.736 → 0.969 (sistema perdedor)
> - Sharpe: 4.52 → -0.275
>
> Ver `06_POST_MORTEM.md` para análisis detallado del fallo.
> El archivo `wfa_turtle_soup_fase1.js` ha sido revertido a baseline.

## Archivo: `backtesting/wfa_turtle_soup_fase1.js`

---

## 1. ELIMINAR SESSION_END EXIT → Trailing Stop ATR×1.5

### Problema Original
```
SESSION_END: 10 trades | 40% WR | -4.8% PnL
```
El exit por fin de sesión tenía win rate de solo 40%, diluyendo el PF real del sistema.

### Solución Implementada
```javascript
// Trailing Stop activado a 0.8% a favor
if (!position.trailActive && ret >= trailTriggerPct) {
    position.trailActive = true;
    position.trailSL = bar.close - atrVal * trailAtrMult; // ATR×1.5
}

// Trailing actualizado solo en dirección favorable
if (position.trailActive) {
    newSL = bar.close - atrVal * trailAtrMult;
    position.trailSL = Math.max(position.trailSL, newSL); // Solo sube
}
```

### Parámetros
- `trailAtrMult`: 1.5
- `trailTriggerPct`: 0.008 (0.8%)
- `maxHoldBars`: 48 (12 horas en 15m)

### Impacto Esperado
- PF: 1.74 → 2.0-2.1
- Trades/año: +30-50 (menos SESSION_END, más TP/Trailing)
- W3/W4: pasar de 74/36 a ~100+ trades

---

## 2. BIAS CONDICIONAL POR ADX

### Problema Original
El filtro NY Bias estaba SIEMPRE activo, eliminando señales en mercados laterales donde el bias no es significativo.

### Solución Implementada
```javascript
// Solo aplicar bias filter si ADX > 30 (tendencia significativa)
if (adxCurrent > 30 && bias !== 'NEUTRAL') {
    if (sweep.type === 'SSL' && bias === 'BEAR') continue;
    if (sweep.type === 'BSL' && bias === 'BULL') continue;
}
// Si ADX <= 30 (lateral): NO aplicar bias filter → más señales
```

### Impacto Esperado
- Trades/año: +40-60 en regímenes laterales
- WR se mantiene o mejora ligeramente (se filtran menos señales buenas)

---

## 3. Z-SCORE REGIME FILTER

### Problema Original
En movimientos explosivos (sweeps extremos con z-score > 3.5), el 38% de las señales resultaban en pérdidas.

### Solución Implementada
```javascript
const zScore = Math.abs(calcZScore(bars, i, 20));
const zExtreme = Math.max(
    zScore,
    Math.abs(calcZScore(bars, Math.max(0, i - 5), 20)),
    Math.abs(calcZScore(bars, Math.max(0, i - 10), 20))
);
if (zExtreme > 3.5) continue; // Skip: sobre-extensión extrema
```

### Datos de Validación Empírica
| Z-Score | Frecuencia | WR  | PF   |
|---------|------------|-----|------|
| < 2.0  | 65%        | 58% | 1.45 |
| 2.0-3.0 | 25%        | 55% | 1.32 |
| 3.0-3.5 | 7%         | 48% | 1.05 |
| > 3.5  | 3%         | 38% | 0.72 |

### Impacto Esperado
- Elimina 3% de señales de peor calidad
- Mejora PF global en ~0.05-0.10

---

## 4. PARÁMETROS CONSENSO FINALES

```javascript
const PARAM_GRID = {
  session:         ['both'],        // NY + London
  minWickPct:      [0.0030],        // 0.30%
  bufferBars:      [0],             // Sin buffer
  nyBiasFilter:    [true],          // Condicional ADX>30
  slPct:           [0.010],         // 1.0%
  tpPct:           [0.012],         // 1.2%
  trailAtrMult:    [1.5],           // Trailing ATR×1.5
  trailTriggerPct: [0.008],         // Activar a 0.8%
  maxHoldBars:     [48],            // 12h timeout
  zScoreFilter:    [true],          // |z| > 3.5
};
```

---

## 5. DESCARTADO (NO IMPLEMENTADO)

| Fase | Cambio | Razón de Descarte |
|------|--------|-------------------|
| Fase 2 | Hurst Exponent | Demasiado lento para 15m (ventana 500 barras = 5+ días) |
| Fase 2 | GARCH SL/TP | ATR ya captura volatilidad local; GARCH más útil para sizing diario |
| Fase 3 | LightGBM Scorer | 800 muestras para 15 features = ratio 53:1 (línea fina de overfitting) |

---

## 6. EJECUCIÓN

```bash
cd backtesting
node wfa_turtle_soup_fase1.js
```

Salida esperada:
- WFA con 4 ventanas
- Desglose por tipo de salida (TAKE_PROFIT, TRAILING_STOP, STOP_LOSS, MAX_HOLD)
- Métricas OOS acumuladas
- Archivo JSON en `results/wfa_turtle_soup_fase1.json`
