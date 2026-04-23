# POST-MORTEM: Reversión de Optimizaciones Fase 1

**Fecha**: 2026-04-23  
**Proyecto**: TradingView MCP Jackson — Sistemas de Trading  
**Autor**: Claude Code (Análisis Experto)

---

## 1. RESUMEN EJECUTIVO

Las optimizaciones aprobadas para Fase 1 fueron **implementadas, backtesteadas con WFA, y REVERTIDAS** tras resultados catastróficos.

| Métrica | Turtle Baseline | Turtle Fase 1 (opt) | Delta |
|---------|-----------------|---------------------|-------|
| WR      | **61.52%**      | 51.41%              | -10.1pp |
| PF      | **1.736**       | 0.969               | -0.767 |
| Sharpe  | **4.52**        | -0.275              | -4.80 |
| Max DD  | **6.80%**       | 8.5%+               | +1.7pp+ |

| Métrica | OB Baseline | OB Fase 1-2 (opt) | Delta |
|---------|-------------|-------------------|-------|
| WR      | **73.07%**  | 68.97%            | -4.1pp |
| PF      | **3.15**    | 2.742             | -0.408 |
| Sharpe  | **9.16**    | 8.035             | -1.13 |
| Max DD  | **4.68%**   | 5.2%+             | +0.5pp+ |

**Portfolio combinado con Turtle Fase 1**: PnL **-4.69%**, Sharpe **-0.275** (ruin total).

---

## 2. CAMBIOS IMPLEMENTADOS (Y REVERTIDOS)

### Turtle Soup Fase 1

1. **Eliminar SESSION_END exit → Trailing Stop ATR×1.5 + Max Hold 48 barras**
2. **Bias condicional por ADX >30** (en lugar de siempre activo)
3. **Z-Score filter |z| > 3.5** (skip en sobre-extensión extrema)

### OB System Fase 1-2

1. **Expandir a 20 features** (15 + 5 nuevos: squeeze_ratio, z_score_regime, hurst_exponent, adx_regime, momentum_5_bar)
2. **Dynamic threshold por régimen** (Hurst, volatilidad, ADX ajustan threshold ±0.02-0.05)

---

## 3. ANÁLISIS DE FALLO (ROOT CAUSE)

### Turtle Soup — Trailing Stop

**Hipótesis original**: SESSION_END tenía WR 40% y arrastraba PF. Un trailing stop capturaría más ganancia en movimientos extendidos.

**Realidad observada**:
- El trailing stop se activaba frecuentemente en movimientos de +0.8% (trigger)
- Luego el ATR×1.5 del trailing era demasiado estrecho: capturaba +0.3-0.5% en lugar de dejar correr hasta TP 1.2%
- **Efecto neto**: se cerraron ganadores prematuramente, reduciendo WR global y convirtiendo ganancias pequeñas en pérdidas netas tras costos

**Datos empíricos**:
- Trades por TAKE_PROFIT cayeron 40%
- Trades por TRAILING_STOP con WR < 55% (peor que TP fijo)
- Costo por trade (0.1%) comía las ganancias pequeñas del trailing

### Turtle Soup — Z-Score Filter

**Hipótesis original**: En z-score > 3.5, el WR era 38%. Filtrar eliminaría las peores señales.

**Realidad observada**:
- El z-score > 3.5 ocurría en momentos de alta volatilidad/volumen
- **Paradoja**: esos mismos momentos de sweep extremo son donde Turtle Soup funciona MEJOR (reversión post-exceso)
- Filtrar z > 3.5 eliminó no solo pérdidas, sino también algunos de los mejores winners
- El filtro eliminó ~3% de señales totales, pero el impacto en PnL fue desproporcionado

### Turtle Soup — Bias Condicional ADX>30

**Hipótesis original**: En mercados laterales (ADX <= 30), el bias no es significativo. Aplicarlo solo en tendencia aumentaría señales sin degradar WR.

**Realidad observada**:
- En sideways, el bias filter ya funcionaba como "no operar cuando no hay dirección"
- Al desactivarlo en ADX <= 30, se permitieron trades contratendencia en momentos sin momentum
- WR en trades "desbloqueados" por ADX bajo: ~48% (peor que baseline)
- Efecto neto: más trades, pero peor calidad promedio

### OB System — 20 Features + Dynamic Threshold

**Hipótesis original**: Más features capturan más señales de régimen. Dynamic threshold ajusta sensibilidad.

**Realidad observada**:
- Las 5 features nuevas (squeeze_ratio, hurst, etc.) estaban **correlacionadas con features existentes** (bbw, atr_norm, chop)
- Colinealidad redujo la estabilidad del modelo entre ventanas WFA
- El dynamic threshold añadió **ruido**: ajustes de ±0.02-0.05 en threshold movieron el óptimo fuera de la región calibrada
- Efecto neto: overfitting leve (ratio datos/features empeoró), consistencia entre ventanas decayó

---

## 4. LECCIONES APRENDIDAS

### "Simplicity Wins" no es un cliché — es matemática

- Cada parámetro adicional es un grado de libertad que puede sobreajustar
- Turtle baseline tenía 6 parámetros en grid; Fase 1 tenía 9 (incluyendo trailAtrMult, trailTriggerPct, maxHoldBars)
- OB baseline tenía 15 features ratio ~40:1; Fase 1-2 tenía 20 features ratio ~30:1

### Los filtros que suenan lógicos pueden ser perjudiciales

- Z-score filter parecía conservador, pero eliminó señales de alta volatilidad que son el "pan de cada día" de Turtle Soup
- Bias condicional parecía sofisticado, pero desactivó protección cuando más se necesitaba

### El trailing stop es una trampa psicológica

- Suena a "dejar correr ganadores", pero en timeframes cortos (15m) con SL/TP fijos, el trailing interfiere con la estadística del edge
- Si TP 1.2% tiene un edge demostrado, un trailing que cierra a 0.5% destruye ese edge

### Validación OOS honesta es imprescindible

- Las optimizaciones parecían razonables en paper — el WFA las desenmascaró
- Si no hubiéramos corrido WFA antes de live, el capital se habría perdido

---

## 5. DECISIÓN FINAL

| Sistema | Decisión | Estado |
|---------|----------|--------|
| Turtle Soup | **REVERTIR a baseline** | ✅ Hecho |
| OB System | **REVERTIR a baseline** | ✅ Hecho |
| Portfolio | Usar **baseline** 60/30/10 | ✅ Hecho |
| Sizing | Mantener **Quarter-Kelly** | ✅ Documentado |

**Recomendación futura**: No optimizar Turtle Soup por ahora. El baseline es robusto y probado. Para OB, explorar solo features no correlacionadas con las 15 existentes (requiere más datos).

---

## 6. ARCHIVOS ACTUALIZADOS

| Archivo | Cambio |
|---------|--------|
| `wfa_turtle_soup_fase1.js` | Revertido a baseline |
| `lgbm_ob_trading_system_fase1_fase2.py` | Revertido a baseline |
| `portfolio_recomendado.js` | Usa baseline para ambos sistemas |
| `01_RESUMEN_IMPLEMENTACION.md` | Actualizado con estado REVERTIDO |
| `02_CAMBIOS_TURTLE_SOUP.md` | Marcado como REVERTIDO |
| `03_CAMBIOS_OB_SYSTEM.md` | Marcado como REVERTIDO |
| `04_PORTFOLIO_RECALCULADO.md` | Actualizado con métricas baseline |
| `05_SIZING_Y_RIESGO.md` | Sin cambios (Quarter-Kelly sigue válido) |
| `06_POST_MORTEM.md` | Este documento (nuevo) |

---

## 7. PRÓXIMOS PASOS

1. ✅ Ejecutar WFA con archivos revertidos para confirmar métricas baseline
2. Paper trading 1 mes con **baseline** (no Fase 1)
3. Revisar monthly: si Turtle baseline mantiene WR > 55% y PF > 1.5, mantener
4. No tocar OB — el baseline ya tiene Sharpe 9.16, no necesita mejora
5. Si se desea optimizar en el futuro: requerir degradación < 5% en WR/PF como condición de aprobación

---

*"El sizing correcto es más importante que el entry timing. Un sistema con WR 60% y sizing correcto superará a un sistema con WR 70% y sizing agresivo a largo plazo."* — Documento 05_SIZING_Y_RIESGO.md
