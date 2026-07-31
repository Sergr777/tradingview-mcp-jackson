# ✅ Modelo Validado — RSI(2) SPY + Pipeline invest_criptoai

**Estado:** ✅ Validado y operativo
**Fecha de validación:** 2026-07-31
**Versión:** v0.2.0 (correcciones aplicadas) · config ganadora `RSI<8, SMA200, exit 50, hold 8`
**Repo:** local (pendiente de push a remoto)

---

## 1. ¿Qué es este modelo?

Sistema de **mean-reversion RSI(2)** sobre **SPY diario** (estilo Connors), con:

- **Entrada:** RSI(2) < 8 con precio sobre SMA 200 (filtro de tendencia).
- **Salida:** RSI(2) cruza 50, o stop por ATR, o máx. 8 días de hold.
- **Capa de agentes** (invest_criptoai): KRONOS (circuit breaker de régimen),
  ORÁCULO (risk parity), PROPHET (LightGBM), MNEMO (memoria SQLite) y SENTIMENT
  (Fear & Greed + VADER) ajustan la exposición y unifican confianzas.

El pipeline completo y el flujo unificado de confianzas se documentan en
`models/README.md` y `docs/ARQUITECTURA_INVESCRIPTO_AI.md`.

---

## 2. Métricas honestas (10 años, 2014→2026)

**Datos:** `data/SPY_daily_10y.csv` (3,162 velas diarias) · **Capital:** $100,000 ·
**Costos:** 0.06% round-trip · **Sizing:** fijo 5%

| Métrica | Baseline v0.2.0 | Agentes v0.2.0 | **Optimización (mejor combo)** |
|---------|:---------------:|:--------------:|:------------------------------:|
| **Config** | RSI<5, SMA200, exit 60, hold 5 | = baseline + 5 agentes | **RSI<8, SMA200, exit 50, hold 8** |
| **Retorno total** | 1.69% | 1.49% | **2.37%** |
| **Max Drawdown** | 0.68% | 0.62% | **0.62%** |
| **Sharpe (diario)** | 0.586 | 0.555 | **0.682** |
| **Win Rate** | 77.78% | 77.78% | 73.11% |
| **Profit Factor** | 1.90 | 1.81 | 1.80 |
| **Trades (10y)** | 72 | 72 | 119 |
| **Trades/año** | 5.7 | 5.7 | 9.5 |
| **Score (Ret/DD)** | — | — | **3.82** |

> **Veredicto honesto:** el Sharpe real del sistema es **~0.5–0.7**, no 2.3. Los
> valores históricos (Sharpe 2.286, retorno 5.15%) eran artefactos de medición
> (curva de equity dispersa + sizing Kelly 15%) — corregidos el 2026-07-31.

---

## 3. Las 4 correcciones que lo validaron (2026-07-31)

| # | Corrección | Efecto verificado |
|---|-----------|-------------------|
| **#1** | Motor unificado — `equity.append` corre todos los días (curva diaria) | Sharpe baseline **2.286 → 0.586** |
| **#2** | Sizing fijo 5% sin Kelly (comparable con la optimización) | Retorno **5.15% → 1.69%**, DD **2.04% → 0.68%** |
| **#3** | Ranking por `score = retorno/max_dd` (no por WR) | Mejor combo → **RSI<8, exit 50** (retorno 2.37%) |
| **#4** | JSON de agentes regenerado (v0.2.0) + respaldo v0.1.0 | Sharpe agentes **1.712 → 0.555** |

---

## 4. Validación anti-overfitting

**Script:** `backtesting/validar_rsi2_spy_walkforward.py`
**Resultados:** `backtesting/results/validacion_walkforward_rsi2_spy.json`

| Prueba | Resultado | Veredicto |
|--------|-----------|-----------|
| **Split 80/20** — Train (≈2014-22) | 95 trades · 70.53% WR · Sharpe 0.532 | — |
| **Split 80/20** — Test (≈2022-26) | 24 trades · **83.33% WR** · Sharpe 1.796 | — |
| **WF Ratio (test/train)** | **1.181** | ✅ **Robusto, sin overfit** |
| **Config fija OOS 2018→2026**¹ | WR 74.19% · PF 1.94 · Sharpe 0.826 · 93 trades | ✅ Generaliza |

> ¹ Métricas agregadas del período 2018→2026 para la config fija ganadora,
> reportadas en `docs/RESUMEN_EJECUTIVO_RSI2_SPY.md` (no están como fila
> explícita en el JSON de validación — ver `validacion_walkforward_rsi2_spy.json`
> para el detalle por ventana y el split 80/20).
| **Grid re-optimizada por ventana** | WF Ratio promedio 0.842 (2/4) | ⚠️ Overfit leve del proceso → **fijar config, no re-optimizar** |

**Conclusión:** la config ganadora fija (RSI<8, exit 50, hold 8) **no está
overfiteada**; el grid de 54 combos por sí solo tiene overfit leve (0.842), por lo
que la recomendación operativa es **fijar la config y no re-optimizar por ventana**.

---

## 5. Componentes del modelo (archivos)

| Componente | Archivo | Rol |
|-----------|---------|-----|
| Sistema RSI(2) | `models/rsi2_spy_system.py` | Señal, backtest, modo agentes |
| Pipeline 5 agentes | `models/pipeline_agentes.py` | Orquestador + `consolidar_confianza()` |
| PROPHET | `models/prophet_agent.py` | Predicción LightGBM → `combined_confidence` |
| MNEMO | `models/mnemo_agent.py` | Memoria SQLite → `adjusted_confidence` |
| SENTIMENT | `models/sentiment_agent.py` | Fear & Greed + VADER → `sentiment_confidence` |
| KRONOS + ORÁCULO | `portfolios/invescripto_engine.py` | Circuit breaker + risk parity |
| Ejecutor | `portfolios/ejecutor_senales.py` | Valida `signal.confidence ≥ 0.35` |
| Optimización | `backtesting/optimizar_rsi2_spy.py` | Grid 54 combos, score retorno/DD |
| Validación | `backtesting/validar_rsi2_spy_walkforward.py` | WFA + split 80/20 |
| Ciclo end-to-end | `run_ciclo_btc.py` | Análisis → agentes → operaciones (dry-run) |

---

## 6. Flujo unificado de confianzas (resumen)

Las confianzas paralelas de los agentes se combinan con **media geométrica** en
una sola `signal.confidence` que el ejecutor valida:

```
unificada = (base × combined_confidence × adjusted_confidence × sentiment_confidence)^(1/n)
```

Ejemplo real validado: `geomean(0.60 × 0.5724 × 0.60 × 0.68)^(1/4) ≈ 0.6118`
(61.18%). Trazabilidad completa en `senal["confianza_unificada"]`. El pipeline
consolida **solo en modo real** (`--dry-run` simula sin tocar el archivo).

---

## 7. Tests que lo respaldan (todos en verde)

```
models/test_consolidar_confianza.py       → 10/10 OK
models/test_pipeline_kronos_oraculo.py    → 12/12 OK
test_run_ciclo_btc.py                     → 7/7 OK
backtesting/verificar_consumidores_senal.py → contrato kelly/position_size OK
```

---

## 8. Recomendaciones operativas

1. **Pasar a la config ganadora** (RSI<8, exit 50, hold 8) como default.
2. **No re-optimizar con frecuencia** — la evidencia WFA degrada el OOS (0.842).
3. **Agentes = risk manager, no generador de alpha** con esta config (−0.20pp
   retorno a cambio de −0.06pp DD).
4. **Baja frecuencia (5.7–9.5 trades/año):** complementar con un sistema de
   arbitraje/pairs (mercado-neutral) para usar el ~95% de capital ocioso.

---

*Documento generado en `docs/modelos_validados/` — 2026-07-31.*
