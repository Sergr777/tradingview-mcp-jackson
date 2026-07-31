# ⏳ Sistemas Pendientes de Análisis — OB WFA V2

Registro de los sistemas **OB WFA V2** evaluados estructuralmente y dejados
**pendientes de corrección y validación en profundidad**.

> **Estado general:** ⏳ Pendiente de análisis profundo (evaluación estructural
> hecha, correcciones no aplicadas, backtest no ejecutado con datos reales).
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

## 3. 📌 Resumen de decisiones

- La v1 validada (`models/ob_crypto_wfa.py` y `models/ob_forex_wfa.py`) **no se toca**
  — sigue siendo la referencia operativa del pipeline invest_criptoai.
- Los V2 quedan **pendientes de corrección y validación** hasta que se apliquen los
  bloqueadores y se corran con datos reales.
- El plan de corrección es común para ambos: bug de costos, datos reales, máquina de
  estados, Hurst real, métricas completas y dedupe del código de régimen.

---

*Registro creado en `docs/pendiente_analisis.md` — 2026-07-31.*
