# ⏳ Sistemas Pendientes de Análisis

Registro de sistemas evaluados y dejados **pendientes de corrección y validación
en profundidad**. Según la política del proyecto, **solo se commitean modelos
validados o modelos registrados aquí**.

> **Estado general:** ⏳ Pendiente de análisis profundo (evaluación estructural
> o backtest honesto hecho, sin aprobación para operar).
> **Archivos de referencia (externos, OneDrive):**
> `Bot_Markov-grafos/Modelos ob_wfa/ob_crypto_wfa_v2.py` y `ob_forex_wfa_V2.py`

---

## 1. ⏳ ob_crypto_wfa_V2 — Order Block Crypto (15m)

**Fecha de evaluación:** 2026-07-31
**Estado:** ⏳ **Pendiente de corrección y validación**

### Veredicto estructural
El **rumbo estructural es pertinente** — triple barrera path-dependent (high/low),
purge gap y modelos por régimen son mejoras reales sobre la v1 (`models/ob_crypto_wfa.py`,
WR 72.34% / PF 2.96 / 4 años WFA, que sigue siendo la referencia validada).

### Bloqueadores para probar en profundidad

| # | Bloqueador | Severidad |
|---|-----------|:---------:|
| 1 | **Bug de signo en costos del etiquetado** (`triple_barrier_label`): resta `total_cost` de ambas barreras → TP más cerca (fácil) y SL más lejos (difícil) → **infla WR/PF** | 🔴 Crítico |
| 2 | **Main con datos sintéticos (GBM)**, no BTC real (`data/BTCUSDT_15m_4y.csv` disponible) | 🔴 Crítico |
| 3 | **Sin máquina de estados**: dispara por barra con `prob>0.60` usando `row['target']` pre-computado → trades solapados (doble conteo de PnL) | 🔴 Crítico |
| 4 | **`hurst` = autocorrelación+0.5 (no es Hurst)** y lento (`rolling.apply` O(n×100)); usar `HurstCalculator` de `ob_utils` o eliminar | 🟠 Medio |
| 5 | **Métricas incompletas**: solo retorno + MaxDD; faltan WR/PF/Sharpe/trades/AUC por ventana | 🟠 Medio |
| 6 | **Código duplicado de régimen**: `detect_regimes()` definido pero `run_wfa` reimplementa el GMM inline | 🟡 Bajo |

### Próximo paso (cuando se retome)
Corregir los 6 bloqueadores y correr WFA contra `data/BTCUSDT_15m_4y.csv` real con
métricas completas (WR, PF, Sharpe, AUC por ventana).

---

## 2. ⏳ ob_forex_wfa_V2 — Order Block Forex (1h)

**Fecha de evaluación:** 2026-07-31
**Estado:** ⏳ **Pendiente de corrección y validación**

### Veredicto estructural
El **rumbo estructural es pertinente** — triple barrera path-dependent, purge gap,
selector multi-activo y regímenes GMM son mejoras reales sobre la v1
(`models/ob_forex_wfa.py`). La v2 elimina el meta-labeling de la v1 (simplificación
razonable, pero pierde la capa de filtrado de magnitud).

### Bloqueadores para probar en profundidad

| # | Bloqueador | Severidad |
|---|-----------|:---------:|
| 1 | **Bug de signo en costos del etiquetado** (idéntico al crypto V2): resta `total_cost` de ambas barreras → **infla WR/PF** | 🔴 Crítico |
| 2 | **Main con datos sintéticos** (GBM incl. DXY/TNX/IRX simulados); usar datos reales vía `portfolios/data_source.py` (`TVC:DXY`, `FX:EURUSD`, etc.) | 🔴 Crítico |
| 3 | **Longitudes inconsistentes de `equity_curve`** (bug nuevo de la v2 forex): rama "sin activos" hace `extend([capital]*test_bars)` = 720 puntos, pero el loop principal añade `len(df_test)` = top_n×720 = 2,160 → **MaxDD/plot distorsionados** | 🔴 Crítico |
| 4 | **Sin máquina de estados**: trades solapados (doble conteo de PnL) | 🔴 Crítico |
| 5 | **Long-only**: el etiquetado asume dirección LONG para todos los pares; debería operar ambas direcciones o modelar la dirección | 🟠 Medio |
| 6 | **`hurst` = autocorrelación+0.5** (no es Hurst) y lento | 🟠 Medio |
| 7 | **Métricas incompletas**: solo retorno + MaxDD; faltan WR/PF/Sharpe/trades/AUC por ventana | 🟠 Medio |
| 8 | **Código duplicado de régimen**: `detect_regimes()` definido pero `run_wfa` reimplementa el GMM inline | 🟡 Bajo |

### Próximo paso (cuando se retome)
Corregir los 8 bloqueadores (los 6 del crypto V2 + longitud de equity + long-only)
y validar contra datos forex reales con métricas completas.

---

## 3. ⏳ etf_pairs_arbitraje — ETF Pairs Trading (diario)

**Fecha de evaluación:** 2026-07-31
**Estado:** ⏳ **Pendiente de corrección y validación** (backtest WFA ejecutado,
**NO apto** out-of-sample)

### Qué es
Sistema market-neutral de arbitraje estadístico sobre pares de ETFs cointegrados,
diseñado como complemento del RSI(2) SPY validado (aporta frecuencia y neutralidad).
Implementación completa en `models/etf_pairs_arbitraje.py` + datos en `data/etf/`.

### Screening de cointegración (de 5 pares candidatos, solo 2 aprobados)

| Par | Corr | ADF p | Coint full | Half-life | Beta estable | Ventanas (4) |
|-----|------|-------|-----------|-----------|-------------|:------------:|
| **SPY/QQQ** | 0.93 | 0.003 | ✅ | 82d | ✅ | 1/4 |
| **GLD/SLV** | 0.78 | 0.007 | ✅ | 62d | ❌ | 1/4 |
| TLT/IEI | 0.80 | 0.865 | ❌ | 801d | ✅ | 1/4 |
| EEM/IWM | 0.68 | 0.065 | ❌ | 120d | ✅ | 1/4 |
| XLE/XLV | 0.44 | 0.496 | ❌ | 428d | ❌ | 0/4 |

> TLT/IEI, EEM/IWM y XLE/XLV **no superan la cointegración estadística** (ADF p>0.05
> full-sample) → excluidos del sistema. La cointegración de los 2 aprobados es
> **inestable entre ventanas** (1/4 ventanas), señal de alerta que el WFA confirmó.

### Resultado del WFA (10 ventanas, train 2y/test 1y, costos 10bps/cambio)

| Métrica global OOS | Valor | Umbral apto | ✅/❌ |
|--------------------|-------|-------------|:-----:|
| Ventanas aprobadas | **4/10** | 10/10 | ❌ |
| Win Rate | **53.85%** | ≥55% | ❌ |
| Profit Factor | **0.766** | ≥1.2 | ❌ |
| Sharpe | **-0.232** | >1.0 | ❌ |
| Max DD | **-15.86%** | <10% | ❌ |
| Retorno total OOS | **-8.04%** | >0% | ❌ |
| Trades/año | **7.8** | 50-80 (proy.) | ❌ |
| Correlación con SPY | **0.027** | ≈0 (neutral) | ✅ |

### Diagnóstico (por qué NO es apto)
1. **Frecuencia muy baja (7.8 trades/año vs 50-80 proyectados)**: el filtro
   `|z|>2` con z-score de 60d sobre datos diarios dispara pocas señales. Menos
   trades → muestra estadística insuficiente y PnL dominado por pocos eventos.
2. **Cointegración inestable**: los p-valores por ventana (1/4) y los betas que
   oscilan (GLD/SLV 1.7→7.7) indican que la relación no es estacionaria fuera de
   muestra. El WFA re-ajusta beta por ventana, pero el spread se comporta como
   no-reversible en los períodos trending (2018-2020, 2020-2022, 2023-2025 →
   ventanas perdedoras).
3. **Asimetría de cola**: las ventanas ganadoras (WR 72-86%, PF 2.8-11.8) son
   compensadas por ventanas con WR 14-38% y PF <0.4 — el edge no es consistente.
4. Lo único que se cumplió: **neutralidad de mercado** (corr SPY 0.027).

### Archivos
- `models/etf_pairs_arbitraje.py` — sistema WFA completo (cointegración + z-score +
  máquina de estados + costos 10bps/cambio)
- `backtesting/download_etf_pairs.py` — descarga de datos ETF (auto_adjust=True)
- `backtesting/screening_etf_pairs.py` — screening de cointegración
- `data/etf/*.csv` — 10 ETFs diarios 2014-2026 (ajustados)
- `backtesting/results/wfa_etf_pairs.json` — resultados WFA guardados

### Resultado de la Opción A (grid de parámetros, 2026-07-31)

Se probó reducir el umbral de entrada y la ventana del z-score (grid de 6 configs):

| Config | Trades/año | WR% | PF | Sharpe | MaxDD% | Ret OOS% | Aprob |
|--------|:----------:|:---:|:---:|:------:|:------:|:--------:|:-----:|
| **baseline 2.0/60** | **7.8** | **53.85** | **0.77** | **-0.23** | **-15.86** | **-8.04** | 4/10 |
| 2.0/40 | 11.2 | 49.11 | 0.67 | -0.43 | -22.44 | -15.74 | 2/10 |
| 2.0/30 | 13.6 | 49.26 | 0.56 | -0.70 | -28.13 | -24.05 | 2/10 |
| 1.5/60 | 9.8 | 53.06 | 0.77 | -0.27 | -17.83 | -9.80 | 4/10 |
| 1.5/40 | 14.3 | 54.55 | 0.73 | -0.40 | -23.83 | -15.73 | 3/10 |
| 1.5/30 | 17.8 | 51.69 | 0.64 | -0.62 | -27.63 | -22.97 | 2/10 |

**Conclusión (honesta):** reducir el umbral **sí aumenta la frecuencia**
(7.8 → 17.8 trades/año, como predecía el diagnóstico) pero **empeora todas
las métricas** (PF cae, Sharpe más negativo, MaxDD y pérdida OOS crecen).
El baseline 2.0/60 sigue siendo la mejor config por score retorno/|MaxDD|.
Esto confirma que el problema **no es de frecuencia sino de ausencia de edge
estable**: operar más seguido solo amplifica las pérdidas. La Opción A queda
**descartada con evidencia**. Quedan como camino las Opciones B y C.

Resultados guardados en `backtesting/results/comparativa_etf_pairs_parametros.json`
y `backtesting/results/wfa_etf_pairs_e1.5_z40.json` (config Opción A principal).

### Opción C ejecutada: re-test de cointegración por ventana — 2026-07-31

Se implementó el re-test de cointegración por ventana en `models/etf_pairs_arbitraje.py`
(config: `retest_coint`, `coint_p_threshold`, `coint_lookback`): antes de operar
un par en cada ventana de test, se re-testa el Engle-Granger ADF sobre los datos
recientes del train (últimas `coint_lookback` sesiones, sin look-ahead). Si
ADF p >= umbral, el par queda en **cash** esa ventana. Grid de 4 configs:

| Config | Trades/año | WR% | PF | Sharpe | MaxDD% | Ret OOS% | Aprob |
|--------|:----------:|:---:|:---:|:------:|:------:|:--------:|:-----:|
| baseline (sin re-test) | 7.8 | 53.85 | 0.766 | -0.232 | -15.86 | -8.04 | 4/10 |
| **ADF p<0.10 lb=250** | **1.4** | **71.43** | **4.069** | **0.565** | **-4.06** | **+10.60** | 3/10 |
| ADF p<0.05 lb=250 | 1.1 | 72.73 | 3.926 | 0.490 | -4.36 | +8.93 | 2/10 |
| ADF p<0.10 lb=125 | 3.0 | 53.33 | 0.599 | -0.070 | -10.96 | -2.52 | 3/10 |

**Detalle por ventana (ADF p<0.10 lb=250):** el re-test filtró exactamente las
ventanas que el diagnóstico señaló como el problema:

| Ventana | Trades | WR% | PF | Ret% | Pares activos |
|---------|:------:|:---:|:---:|:----:|:--------------|
| 2014-2016 | 4 | 75 | 4.92 | +4.97 | GLD/SLV |
| 2015-2017 | 0 | — | — | 0.00 | (cash) |
| 2016-2018 | 0 | — | — | 0.00 | (cash) |
| 2017-2019 | 3 | 67 | 5.26 | +1.54 | SPY/QQQ |
| 2018-2020 | 2 | 50 | 1.06 | +0.03 | SPY/QQQ |
| 2019-2021 | 5 | 80 | 11.86 | +3.74 | SPY/QQQ |
| 2020-2022 a 2023-2025 | 0 | — | — | 0.00 | (cash, 4 ventanas) |

**Conclusión (honesta):** la Opción C **invierte el perfil del edge** — el
re-test elimina las ventanas sin cointegración (2015-2017, 2016-2018 y
2020-2025), que son precisamente las que hundían al baseline, y entre las 4
ventanas que sí operaron, **3/4 fueron aprobadas (75%)** vs 4/10 del baseline.
El resultado: PF 4.07, retorno OOS +10.60%, MaxDD -4.06% y WR 71.4% — un edge
**mucho más limpio**. PERO: (1) la frecuencia colapsa a **1.4 trades/año** (14
en 10 años), eliminando el beneficio de frecuencia que justificaba el sistema
(proyección 50-80/año); (2) el Sharpe global sigue **0.565 < 1.0** → **NO APTO**.
Nota metodológica: las ventanas en cash (0 trades) se auto-marcan como "no
aprobadas" (WR 0 < 55), lo que subestima la calidad del filtro en la métrica
`ventanas_aprobadas` — entre las ventanas que realmente operaron, la aprobación
es 3/4.

Resultados guardados en `backtesting/results/comparativa_etf_pairs_opcion_c.json`.

### Próximo paso (cuando se retome)
Opción B: añadir régimen de tendencia (ADX/Hurst) como filtro de "no operar en
trending" — las ventanas perdedoras son las trending. La Opción A (reducir
umbral/frecuencia) y la Opción C (re-test ADF) quedaron **descartadas con
evidencia** (la C confirmó el diagnóstico de la raíz: la cointegración es
inestable por ventana y las no-cointegradas son las que pierden — pero filtrarlas
también elimina la frecuencia que el sistema necesita). El ETF pairs queda
**pendiente** sin camino de corrección simple identificado.

---

## 4. ⏳ tsmom_etf — Time-Series Momentum Multi-ETF (diario)

**Fecha de evaluación:** 2026-07-31
**Estado:** ⏳ **Pendiente de corrección y validación** (backtest OOS ejecutado,
**NO apto**: Sharpe < 1.0 en todas las configs del grid)

### Qué es
Sistema de momentum de serie temporal (Moskowitz, Ooi & Pedersen 2012) sobre el
universo de 10 ETFs multi-clase (SPY/QQQ/GLD/SLV/TLT/IEI/EEM/IWM/XLE/XLV) con
volatility targeting y rebalanceo mensual. Diseñado como complemento del RSI(2)
SPY (mean reversion): cubre tendencias sostenidas donde el RSI(2) no opera.
Implementación en `models/tsmom_etf.py`.

### Resultado del backtest baseline (lookback 12m, target_vol 10%)

| Métrica | Valor | Umbral apto | ✅/❌ |
|---------|-------|-------------|:-----:|
| Retorno total OOS | **+21.81%** | >0% | ✅ |
| Sharpe | **0.31** | >1.0 | ❌ |
| Max DD | **-13.76%** | <20% | ✅ |
| Trades/año | **11.0** | ~50-80 | ❌ |
| WR rebalances | **58.7%** | — | — |
| Correlación con SPY | **0.353** | baja | ✅ |
| Ventanas anuales positivas | **9/12** | ≥60% | ✅ |

### Grid de robustez (lookback × vol objetivo) — ninguna config apta

| Config | Ret% | Sharpe | MaxDD% | WR% | Vent+ | Apto |
|--------|-----:|:------:|:------:|:---:|:-----:|:----:|
| lb6_v10 | +30.00 | 0.40 | -14.86 | 57.6 | 7/12 | ❌ |
| lb12_v10 (baseline) | +21.81 | 0.31 | -13.76 | 58.7 | 9/12 | ❌ |
| **lb24_v10** | **+57.97** | **0.72** | **-8.06** | **65.9** | 8/12 | ❌ |
| lb12_v08 | +17.62 | 0.31 | -11.05 | 58.0 | 9/12 | ❌ |
| lb12_v15 | +29.98 | 0.29 | -21.21 | 57.2 | 9/12 | ❌ |
| lb6_v08 | +24.00 | 0.40 | -11.78 | 57.6 | 7/12 | ❌ |

### Diagnóstico (por qué NO es apto)
1. **Sharpe bajo (0.31-0.72)**: el retorno positivo existe pero la volatilidad del
   portafolio lo diluye. TSMOM clásico depende de rachas de tendencia largas que
   en 10 ETFs diarios 2014-2026 son irregulares (2016 y 2023 fueron años
   fuertemente negativos, -9.27% y -6.95%).
2. **Mejor config: lookback 24m (lb24_v10)** con Sharpe 0.72, retorno +57.97% y
   MaxDD -8.06% (WR 65.9%) — notablemente mejor que el baseline de 12m. Sugiere
   que el momentum en este universo es más fuerte en horizontes largos, pero aún
   no supera el umbral de aptitud (Sharpe>1.0).
3. **Correlación con SPY moderada (0.33-0.49)**: menor que un buy-and-hold puro
   pero más alta que el ETF pairs (0.027) — el vol targeting escala todo con SPY.
4. Metodología validada: OOS por construcción (sin parámetros ajustados
   in-sample), sin look-ahead, costos por turnover, rebalanceo mensual.

### Archivos
- `models/tsmom_etf.py` — sistema TSMOM completo con vol targeting
- `backtesting/comparar_tsmom_parametros.py` — grid de robustez
- `backtesting/results/wfa_tsmom_etf.json` — resultados baseline
- `backtesting/results/comparativa_tsmom_parametros.json` — grid

### Re-validación Opción A (lookback 24m como config principal) — 2026-07-31

Se adoptó `lookback_months: 24` como config principal (v0.2.0) y se re-validó
con desglose de estabilidad por **ventanas trimestrales (3m)**.

**Métricas globales (config 24m, target_vol 10%):**

| Métrica | Valor | Umbral apto | ✅/❌ |
|---------|-------|-------------|:-----:|
| Retorno total OOS | **+57.97%** | >0% | ✅ |
| Sharpe | **0.724** | >1.0 | ❌ |
| Max DD | **-8.06%** | <20% | ✅ |
| Trades/año | **10.0** | ~50-80 | ❌ |
| WR rebalances | **65.9%** | — | — |
| Correlación con SPY | **0.486** | baja | ❌ |
| Ventanas trimestrales positivas | **29/51 (56.9%)** | ≥60% | ❌ |

**Conclusiones de la re-validación:**
1. Los números globales **reproducen exactamente** la config lb24_v10 del grid
   (Sharpe 0.724, +57.97%, MaxDD -8.06%) — el resultado es reproducible, no un
   artefacto del grid.
2. La estabilidad trimestral es **el verdadero problema**: 29/51 trimestres
   positivos (56.9%) < 60%. El retorno positivo se concentra en pocos trimestres
   fuertes (2024Q1 +3.10%, 2025Q3 +6.07%) compensando muchos trimestres planos o
   negativos (2016 completo negativo, 2018Q4 -5.87%, 2022Q2 -2.72%).
3. La correlación con SPY sube a 0.486 (vs 0.353 del 12m) — el lookback más largo
   concentra el portafolio en activos con momentum persistente, que son
   precisamente los más correlacionados con el mercado.
4. **El criterio trimestral (≥60%) es más estricto que el anual (≥60%)** — una
   estrategia trend-following como TSMOM es ruidosa a escala de 3 meses por
   construcción. Con 51 trimestres el umbral es una barra alta y honesta.

**Veredicto: NO APTO incluso con la mejor config.** La Opción A del diagnóstico
se ejecutó y no rescató el modelo: el lookback 24m mejora el retorno y el Sharpe
(0.31→0.72) pero la estabilidad trimestral (56.9%) y el Sharpe<1.0 siguen sin
superar los umbrales. Queda registrado como **pendiente** (no validado).

Resultados guardados en `backtesting/results/wfa_tsmom_etf_r24m.json` (v0.2.0).

### Validación train/test del edge 24m — 2026-07-31 (hallazgo clave)

Para distinguir **edge real vs. sobreajuste de selección** (24m fue elegido *porque*
backtesteó mejor en los mismos datos — circular), se ejecutó un split estricto:

- **Train:** 2014-2020 (solo con esto se elige el lookback)
- **Test:** 2021-2026 (datos **nunca vistos** por la selección)

| Lookback | TRAIN 2014-2020 (ret/Sharpe) | TEST 2021-2026 (ret/Sharpe/MaxDD) | Vent+ TEST |
|----------|:----------------------------:|:-----------------------------------:|:----------:|
| 6m | +10.67% / 0.281 | +2.61% / 0.115 / -9.77% | 10/23 |
| 12m (baseline) | +4.17% / 0.136 | +12.79% / 0.445 / -10.85% | 13/23 |
| **24m** | **+24.20% / 0.672** | **+24.27% / 0.897 / -6.65%** | 12/23 |

**Selección WFA honesta:** el lookback 24m fue el mejor en train (Sharpe 0.672)
y **el edge sobrevivió en test con Sharpe 0.897, +24.27%, MaxDD -6.65%** en datos
que nunca vio. La consistencia train→test (0.672→0.897) confirma que **no es
sobreajuste de selección**: el momentum de 24 meses es un punto de operación real
de un edge latente, no ruido del grid.

**Actualización del diagnóstico:**
1. TSMOM pasa de "sin edge demostrado" a **edge real pero débil** — el split
   demuestra que el lookback 24m fue encontrar el punto de operación correcto
   de un edge latente, no amplificar ruido (a diferencia del ETF pairs, donde
   el grid probó que no había edge en la base).
2. **Sigue siendo NO APTO:** Sharpe 0.897 en test sigue < 1.0, y la estabilidad
   trimestral OOS queda en ~52% (12/23) — el único bloqueador restante junto con
   la correlación SPY 0.486.
3. **Fundamento de la Opción B:** ahora hay una base real sobre la que trabajar;
   el objetivo concreto es subir la estabilidad trimestral por encima del 60%
   (filtro de régimen para quitar los trimestres planos/negativos).
4. **Valor de portafolio:** aunque no alcance Sharpe>1.0 standalone, la baja
   correlación de *estrategia* con el RSI(2) SPY validado (mean reversion) es
   donde TSMOM aporta valor real — no como señal del pipeline, sino como sleeve.

### Opción B ejecutada: filtro de régimen ADX — 2026-07-31 (descartada)

Se implementó el filtro de régimen ADX (no operar en rangos) en
`models/tsmom_etf.py` (config: `regime_filter`, `adx_period`, `adx_threshold`,
`regime_min_trending`). En cada rebalance, si la fracción de activos con
ADX > umbral es menor a `min_trending`, el modelo va a cash. Grid de 10 configs:

| Config | Ret% | Sharpe | MaxDD% | Vent+ | Vent% | Apto |
|--------|-----:|:------:|:------:|:-----:|:-----:|:----:|
| **baseline (sin filtro)** | **+57.97** | **0.724** | **-8.06** | **29/51** | **56.9%** | ❌ |
| ADX>20 minT=0.3 | +55.08 | 0.715 | -8.06 | 28/51 | 54.9% | ❌ |
| ADX>20 minT=0.4 | +50.23 | 0.683 | -8.06 | 29/51 | 56.9% | ❌ |
| ADX>20 minT=0.5 | +18.23 | 0.338 | -9.32 | 25/51 | 49.0% | ❌ |
| ADX>25 minT=0.3 | +22.02 | 0.456 | -7.77 | 25/51 | 49.0% | ❌ |
| ADX>25 minT=0.4 | +4.90 | 0.139 | -6.73 | 20/51 | 39.2% | ❌ |
| ADX>25 minT=0.5 | +6.46 | 0.216 | -7.44 | 14/51 | 27.5% | ❌ |
| ADX>30 minT=0.3 | +5.24 | 0.154 | -7.30 | 18/51 | 35.3% | ❌ |
| ADX>30 minT=0.4 | +9.60 | 0.384 | -6.00 | 15/51 | 29.4% | ❌ |
| ADX>30 minT=0.5 | +4.49 | 0.230 | -6.28 | 7/51 | 13.7% | ❌ |

**Split train/test de la mejor config del filtro (ADX>20 minT=0.3):**

| Config | TRAIN 2014-2020 | TEST 2021-2026 |
|--------|-----------------|----------------|
| baseline | +24.20% / 0.672 / 14-28 | +24.27% / 0.897 / 12-23 |
| ADX>20 minT=0.3 | +22.03% / 0.624 / 13-28 | +22.32% / 0.837 / 12-23 |

**Conclusión (honesta): la Opción B queda descartada con evidencia.** El filtro
ADX **empeora** el modelo: reduce retorno y Sharpe en todas las configs, y —
crítico — **no sube la estabilidad trimestral** (la mejor config del filtro la
deja igual o peor: 54.9% vs 56.9% del baseline). El split OOS confirma que el
filtro es ligeramente peor también fuera de muestra (0.837 vs 0.897 de Sharpe).
La razón: el edge del TSMOM 24m viene de **permanecer en tendencias largas**;
cuando el filtro saca al modelo en rangos, también lo saca en los arranques de
tendencia que son la fuente del retorno. El ruido trimestral del TSMOM es
**inherente a la estrategia** (trend-following en trimestres planos), no un
artefacto corregible con un gate de régimen simple.

Resultados guardados en `backtesting/results/comparativa_tsmom_opcion_b.json`.

### Valor de portafolio medido: TSMOM 24m como sleeve — 2026-07-31 (hallazgo clave)

Se midió el valor real de combinar el TSMOM 24m (pendiente, NO apto standalone)
con el RSI(2) SPY **validado**, sobre fechas comunes (2016-02 → 2026-07, 2638
sesiones; curvas diarias netas con costos, warmup del TSMOM recortado):

| Sistema (periodo común) | Ret% | CAGR% | Vol% | Sharpe | MaxDD% | Vent+ |
|-------------------------|-----:|------:|-----:|:------:|:------:|:-----:|
| RSI(2) SPY solo | +1.44 | 0.14 | 0.25 | 0.548 | -0.68 | 28/43 |
| TSMOM 24m solo | +57.92 | 4.46 | 5.72 | 0.792 | -8.06 | 29/43 |
| **Portafolio w=0.2 TSMOM** | **+11.13** | **1.01** | **1.21** | **0.839** | **-1.87** | **30/43** |

**Correlación de retornos:** diaria 0.26 / **mensual 0.27** (la diaria es
trivialmente baja porque el RSI2 está en cash ~95% de los días, 5.7 trades/año;
la mensual es la interpretación honesta).

**Conclusiones:**
1. **TSMOM SÍ aporta valor real como sleeve**: el portafolio w=0.2 TSMOM eleva
   el Sharpe del RSI2 solo de 0.548 a 0.839 (delta **+0.29**) y sube la
   estabilidad trimestral a 30/43 (vs 28/43), con un MaxDD modesto (-1.87%).
   La diversificación es real (corr mensual 0.27, no trivial).
2. **El RSI2 solo es muy conservador** (vol 0.25% anual, capital casi siempre en
   cash) — su Sharpe 0.548 mejora sustancialmente al añadir un 20% de TSMOM.
   Pesos mayores (w≥0.5) elevan retorno pero bajan el Sharpe (0.80) y suben el
   MaxDD — el óptimo por riesgo/retorno está en w≈0.2-0.3.
3. Las métricas standalone del RSI2 en esta tabla son sobre la **ventana común**
   (2016-2026), no el periodo completo validado (2014-2026, Sharpe 0.586) — la
   comparación justa requiere la misma ventana.
4. **Este es el uso recomendado de TSMOM**: como sleeve de baja correlación junto
   al RSI(2) SPY (w≈20%), no como señal standalone del pipeline. El modelo sigue
   **pendiente** (NO apto solo), pero su valor de portafolio queda **demostrado
   con evidencia**.

Resultados guardados en `backtesting/results/portafolio_rsi2_tsmom.json`.
Medidor: `backtesting/medir_valor_portafolio_rsi2_tsmom.py`.

### Paper trading del portafolio RSI(2)+TSMOM implementado — 2026-07-31

Se implementó el paper trading del **único uso con valor demostrado** del TSMOM:
el portafolio combinado RSI(2) SPY + TSMOM 24m con w_tsmom=0.2.

**Arquitectura de dos sleeves sobre el capital total C:**

| Sleeve | Capital | Sizing | Señal |
|--------|---------|--------|-------|
| RSI(2) SPY | 80% de C | `position_size_pct` 5% **del sleeve** (SPY, LONG/SHORT) | `models/rsi2_spy_system.py --senal` → `latest_signals.json` |
| TSMOM 24m | 20% de C | pesos objetivo del último rebalance (vol targeting, LONG/SHORT por activo) | `models/tsmom_etf.py --senal` → `latest_signals_tsmom.json` |

**Cambios:
- `models/tsmom_etf.py`**: refactor de la lógica de pesos del rebalance a
  `_calcular_pesos_rebalance()` (behavior-preserving: el backtest 24m reproduce
  exactamente Sharpe 0.724 / +57.97% / MaxDD -8.06%) + nuevo `generar_senal_tsmom()`
  con modo CLI `--senal` (expone los pesos del último rebalance, sin look-ahead).
- `portfolios/ejecutor_portafolio_rsi2_tsmom.py` **(NUEVO)**: ejecutor combinado
  con modos `--dry-run` y `--mode paper`. El peso del sleeve TSMOM se toma de la
  propia señal (`risk_parameters.position_size_pct`, única fuente de verdad) con
  el constructor/`--w-tsmom` como fallback. Valida frescura (60 min) en modo paper.
- `portfolios/test_ejecutor_portafolio_rsi2_tsmom.py` **(NUEVO)**: 12 tests del
  contrato de sizing combinado (reparto de capital, 5% del sleeve RSI2, pesos del
  sleeve TSMOM, resumen de exposiciones, casos límite, alerta de exposición >50%).

**Validación end-to-end en dry-run (2026-07-31):**

```
Capital total:    $100,000
w TSMOM (sleeve): 20% -> $20,000 | w RSI2 (sleeve): 80% -> $80,000
[SKIP] sleeve RSI2: senal expirada   <- perfil normal: RSI2 ~5.7 trades/año
[OK]   sleeve TSMOM: 10 activos LONG/SHORT (exposicion bruta 13.0%)
Exposicion dentro del limite (50%)
```

El sleeve RSI2 quedó en cash porque su señal expiró (>60 min) — comportamiento
correcto y consistente con el perfil conocido del RSI2 (capital ocioso ~95% del
tiempo). El sleeve TSMOM operó sus 10 activos con pesos vol-targeting.

**Estado:** el portafolio combinado (w=0.2) está **implementado y validado en
paper/dry-run**. El TSMOM 24m sigue **pendiente como señal standalone** (NO apto
solo), pero su **único uso operativo aprobado** — el sleeve del portafolio
RSI2+TSMOM — ya tiene ejecutor paper funcional.

### Próximo paso (cuando se retome)
Opción C: combinar con el ETF pairs descartado para comparar perfiles. El TSMOM
24m tiene su valor real **demostrado como sleeve** (w≈20% sobre RSI2 SPY: Sharpe
0.839, corr mensual 0.27) y el paper trading del portafolio combinado ya está
**implementado y validado en dry-run** (`ejecutor_portafolio_rsi2_tsmom.py`).
Las Opciones A y B quedaron **descartadas con evidencia**; el edge 24m está
confirmado como real pero insuficiente para aptitud standalone (Sharpe<1.0,
estabilidad trimestral <60%).

---

## 5. 📌 Resumen de decisiones

- La v1 validada (`models/ob_crypto_wfa.py`, `models/ob_forex_wfa.py`) y el modelo
  RSI(2) SPY validado (`models/rsi2_spy_system.py`) **no se tocan** — siguen siendo
  la referencia operativa del pipeline invest_criptoai.
- Los V2 (OB crypto/forex), el ETF Pairs Arbitraje y el TSMOM multi-ETF quedan
  **pendientes de corrección y validación** hasta que se resuelvan sus bloqueadores
  y se validen con datos reales y métricas completas.
- **ETF Pairs Arbitraje** ya tiene implementación y backtest honesto (edge no
  sostenible out-of-sample; Opciones A y C descartadas con evidencia). La
  Opción C (re-test ADF) confirmó la raíz del problema: la cointegración es
  inestable por ventana y las ventanas no-cointegradas son las perdedoras —
  pero filtrarlas deja 1.4 trades/año (frecuencia insuficiente) y Sharpe 0.565
  < 1.0. Sin camino de corrección simple identificado.
- **TSMOM multi-ETF** ya tiene implementación y backtest honesto: metodología
  correcta (OOS por construcción, sin look-ahead), retorno positivo en todas las
  configs, pero Sharpe < 1.0 en las 6 del grid. La re-validación de la Opción A
  (lookback 24m v0.2.0) reprodujo los números del grid (Sharpe 0.724, +57.97%)
  pero la estabilidad trimestral quedó en 29/51 (56.9%) < 60% → **NO APTO**.
  **Hallazgo clave (split train/test):** el edge 24m es **real OOS** — elegido
  solo con train 2014-2020, sobrevive en test 2021-2026 con Sharpe 0.897
  (+24.27%, MaxDD -6.65%). **Opción B (filtro ADX) ejecutada y descartada con
  evidencia:** empeora todas las configs y no sube la estabilidad trimestral
  (mejor filtro 54.9% vs 56.9% baseline; OOS 0.837 vs 0.897). **Valor de
  portafolio demostrado:** como sleeve al 20% sobre el RSI(2) SPY validado sube
  el Sharpe de 0.548 a 0.839 (corr mensual 0.27) — es su uso recomendado. El
  modelo sigue **pendiente** (NO apto solo), pero con valor de portafolio
  demostrado con evidencia. **Paper trading del portafolio RSI2+TSMOM
  implementado y validado en dry-run** (2026-07-31): `ejecutor_portafolio_rsi2_tsmom.py`
  combina el sizing de ambos sistemas en dos sleeves (80% RSI2 con sizing 5% del
  sleeve + 20% TSMOM con pesos vol-targeting), con `models/tsmom_etf.py --senal`
  (nuevo) como fuente de la señal TSMOM y 12 tests unitarios del contrato.

---

*Registro creado en `docs/pendiente_analisis.md` — 2026-07-31.*
