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

### Próximo paso (cuando se retome)
Opción A (recomendada): reducir umbral de entrada (`|z|>1.5`), z-window 30-40d y
re-evaluar frecuencia y estabilidad. Opción B: añadir régimen de tendencia (ADX/
Hurst) como filtro de "no operar en trending" — las ventanas perdedoras son las
trending. Opción C: re-test de cointegración por ventana antes de operar (solo
entrar si ADF p<0.10 en la ventana actual).

---

## 4. 📌 Resumen de decisiones

- La v1 validada (`models/ob_crypto_wfa.py`, `models/ob_forex_wfa.py`) y el modelo
  RSI(2) SPY validado (`models/rsi2_spy_system.py`) **no se tocan** — siguen siendo
  la referencia operativa del pipeline invest_criptoai.
- Los V2 (OB crypto/forex) y el ETF Pairs Arbitraje quedan **pendientes de
  corrección y validación** hasta que se resuelvan sus bloqueadores y se corran
  con datos reales y métricas completas.
- **ETF Pairs Arbitraje ya tiene implementación y backtest honesto**: el diseño es
  correcto (sin look-ahead, costos reales, neutralidad de mercado confirmada),
  pero el edge no se sostiene out-of-sample con los parámetros actuales.

---

*Registro creado en `docs/pendiente_analisis.md` — 2026-07-31.*
