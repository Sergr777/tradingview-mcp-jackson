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

### Próximo paso (cuando se retome)
Opción B: añadir régimen de tendencia (ADX/Hurst) como filtro de "no operar en
trending" — las ventanas perdedoras son las trending. Opción C: re-test de
cointegración por ventana antes de operar (solo entrar si ADF p<0.10 en la
ventana actual). La Opción A (reducir umbral/frecuencia) quedó descartada.

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

### Próximo paso (cuando se retome)
Opción B: subir el peso de los activos de baja correlación con SPY (bonos TLT/IEI)
o añadir filtro de régimen (no operar en rangos) para reducir el ruido trimestral.
Opción C: combinar con el ETF pairs descartado para comparar perfiles. La Opción A
(adoptar lookback 24m) quedó **descartada con evidencia** (ver tabla arriba).

---

## 5. 📌 Resumen de decisiones

- La v1 validada (`models/ob_crypto_wfa.py`, `models/ob_forex_wfa.py`) y el modelo
  RSI(2) SPY validado (`models/rsi2_spy_system.py`) **no se tocan** — siguen siendo
  la referencia operativa del pipeline invest_criptoai.
- Los V2 (OB crypto/forex), el ETF Pairs Arbitraje y el TSMOM multi-ETF quedan
  **pendientes de corrección y validación** hasta que se resuelvan sus bloqueadores
  y se validen con datos reales y métricas completas.
- **ETF Pairs Arbitraje** ya tiene implementación y backtest honesto (edge no
  sostenible out-of-sample; Opción A de frecuencia descartada con evidencia).
- **TSMOM multi-ETF** ya tiene implementación y backtest honesto: metodología
  correcta (OOS por construcción, sin look-ahead), retorno positivo en todas las
  configs, pero Sharpe < 1.0 en las 6 del grid. La re-validación de la Opción A
  (lookback 24m v0.2.0) reprodujo los números del grid (Sharpe 0.724, +57.97%)
  pero la estabilidad trimestral quedó en 29/51 (56.9%) < 60% → **NO APTO**.
  El modelo sigue **pendiente**; quedan las Opciones B (filtro de régimen / bonos)
  y C (combinación con ETF pairs).

---

*Registro creado en `docs/pendiente_analisis.md` — 2026-07-31.*
