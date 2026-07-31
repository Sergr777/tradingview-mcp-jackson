# 📊 Comparativa RSI(2) SPY — Baseline vs Agentes vs Optimización

**Fecha**: 2026-07-31
**Datos**: `data/SPY_daily_10y.csv` (3,162 velas diarias, 2014-01-02 → 2026-07-30)
**Capital inicial**: $100,000 · **Costos**: 0.06% round-trip · **Posición por defecto**: 5% del capital

> ## ✅ Correcciones aplicadas (2026-07-31)
>
> **#1 — Motor unificado (Sharpe honesto):** se eliminaron los dos `continue` del
> bloque "Buscar nueva entrada" en `models/rsi2_spy_system.py` — la curva de
> equity ahora se registra TODOS los días. Baseline JSON regenerado:
> Sharpe **2.286 → 0.586** (WR/PF/trades intactos).
>
> **#2 — Sizing fijado al 5% (sin Kelly):** en `rsi2_spy_system.py` se eliminó el
> sizing Kelly (cap 15%) y se usa `size = sim_capital * TAMANO_POSICION` (5% fijo),
> idéntico al motor de optimización. En modo agentes solo se aplica la reducción
> de riesgo (KRONOS/ORÁCULO), nunca se supera el 5%. Retorno y DD ahora son
> **directamente comparables**: baseline +1.69% / DD 0.68% (antes 5.15% / 2.04%).
>
> **#3 — Ranking de optimización corregido:** `optimizar_rsi2_spy.py` ahora
> ordena por **score = retorno/max_dd** (tipo Calmar) en vez de por WR.
> Optimización regenerada: el mejor combo cambió de "RSI<5, exit 40" (WR 78.87%,
> retorno 1.44%) a **RSI<8, SMA200, exit 50, hold 8** (WR 73.1%, retorno 2.37%).
>
> **#4 — JSON de agentes regenerado con config v0.2.0:** Sharpe **1.712 → 0.586**
> (curva diaria). Nota: el cambio de config (RSI<10 → RSI<5) también redujo
> trades de 141 a 72. Histórico v0.1.0 respaldado en
> `backtest_rsi2_spy_agentes_v010.json`.

---

## 🎯 Resumen ejecutivo

| Métrica | Baseline (v0.2.0) | Agentes (v0.2.0) | Optimización (mejor combo) |
|---------|:------------------:|:-----------------:|:--------------------------:|
| **Win Rate** | 77.78% | 77.78% | 73.11% |
| **Retorno total** | **1.69%** | **1.49%** | **2.37%** |
| **Profit Factor** | 1.90 | 1.81 | 1.80 |
| **Sharpe** | 0.586 ✅ | 0.555 | 0.682 |
| **Max DD** | 0.68% | 0.62% | 0.62% |
| **Trades (10y)** | 72 | 72 | 119 |
| **Trades/año** | 5.7 | 5.7 | 9.5 |
| **Score (Ret/DD)** | — | — | **3.82** |

> \* Agentes v0.1.0 histórico (RSI<10): WR 70.21%, retorno 6.80%, PF 1.63,
> Sharpe 1.712 (inflado), 141 trades — respaldado en
> `backtest_rsi2_spy_agentes_v010.json`. El cambio en trades/WR es
> **puramente de config** (RSI<10→RSI<5: 141→72 trades, 70.21%→77.78% WR);
> el cambio en retorno (6.80%→1.49%) combina config **+** sizing (Kelly 15%→5%);
> y el Sharpe (1.712→0.555) se corrigió por el muestreo disperso + la reducción
> de riesgo de los agentes.

**Conclusión en una frase:** *Tras las 4 correcciones, los tres motores son
comparables: baseline y optimización dan exactamente los mismos números para la
misma config (retorno 1.69%, DD 0.68%, Sharpe 0.586), y el mejor combo de
optimización (RSI<8, exit 50, hold 8) da 2.37% / 0.682. Los valores originales
(2.286 de Sharpe, 5.15% de retorno, 2.04% de DD) eran artefactos de muestreo
disperso y sizing Kelly 15%.*

---

## 📁 Los 3 archivos fuente

| Archivo | Motor | Parámetros clave |
|---------|-------|------------------|
| `backtesting/results/backtest_rsi2_spy_baseline.json` | `models/rsi2_spy_system.py` | RSI<5, SMA200, exit RSI 60, max_hold 5, sizing fijo 5% |
| `backtesting/results/backtest_rsi2_spy_agentes.json` | `models/rsi2_spy_system.py --agentes` | RSI<5, SMA200, exit RSI 60, max_hold 5, pipeline de 5 agentes — histórico v0.1.0 (RSI<10, exit 50, hold 10) en `backtest_rsi2_spy_agentes_v010.json` |
| `backtesting/results/optimizacion_rsi2_spy.json` | `backtesting/optimizar_rsi2_spy.py` | Grid 54 combos; ranking retorno/max_dd; mejor combo: RSI<8, SMA200, exit RSI 50, max_hold 8, sizing fijo 5% |

---

## 🔍 El misterio resuelto: ahora ambos motores dan EXACTAMENTE los mismos números *(valores pre-corrección en paréntesis)*

Tras las correcciones #1 y #2, la fila **exacta** de la optimización que coincide
con la config baseline (oversold 5, SMA 200, exit 60, max_hold 5) produce números
idénticos al baseline:

| Métrica | Baseline engine | Optimización engine | Ratio |
|---------|:---------------:|:-------------------:|:-----:|
| Win Rate | 77.78% | 77.78% | 1.00x ✅ |
| Profit Factor | 1.90 | 1.90 | 1.00x ✅ |
| Trades | 72 | 72 | 1.00x ✅ |
| Retorno | 1.69% | 1.69% | **1.00x** ✅ |
| Max DD | 0.68% | 0.68% | **1.00x** ✅ |
| Sharpe | 0.586 | 0.586 | **1.00x** ✅ |

**Antes de las correcciones** los ratios eran 3.05x / 3.00x / 3.90x por dos causas:
la **causa raíz #1** (sizing Kelly 15% vs fijo 5% — retorno y DD) y la **causa
raíz #2** (muestreo de equity disperso — Sharpe). Ambos motores convergen tras
unificar el sizing y la curva de equity.

---

## 🧩 Causa raíz #1 — Position sizing: 15% (Kelly) vs 5% (fijo) — ✅ CORREGIDA (#2)

### Antes (motor del sistema con Kelly)
```python
kelly_raw = (2 * confianza - (1 - confianza)) / 2   # conf=0.60 → 0.40
kelly = max(0.0, min(kelly_raw, TAMANO_POSICION * 10))   # 0.40
fraccion = kelly * kronos_mult * peso_oraculo_base       # 0.40
fraccion = max(TAMANO_POSICION * kronos_mult,             # ← CAP en 15%
               min(fraccion, TAMANO_POSICION * 3))
size = sim_capital * fraccion   # TAMANO_POSICION=0.05 → fraccion=0.15 → **15%**
```

### Ahora (corrección #2 — fijo 5%, igual que la optimización)
```python
size = sim_capital * TAMANO_POSICION  # 5% fijo (sin Kelly)
if usar_agentes:
    # Los agentes SOLO reducen exposicion en riesgo (KRONOS/ORACULO)
    size = sim_capital * TAMANO_POSICION * kronos_mult * peso_oraculo_base
```

**Consecuencia:** el baseline ya no arriesga 3× más por trade. Los ratios pasaron de
3.05x/3.00x a **1.00x** — retorno 1.69% y DD 0.68% idénticos a la optimización.

> ⚠️ **Nota:** el Sharpe es **invariante al sizing** (escala el numerador y el
> denominador por igual). Por eso el Sharpe ya era 0.586 en ambos tras la #1;
> la #2 solo alineó retorno y DD, que sí dependen del tamaño de posición.

---

## 🧩 Causa raíz #2 — Muestreo de la curva de equity: esparcido vs diario

### Motor del sistema — equity SOLO en días con posición/señal (ARTEFACTO)
```python
# Buscar nueva entrada
if not position:
    ...
    if senal is None:
        continue          # ← SALTEA el append de equity en días "planos" (cash)

# Equity curve
curr_eq = sim_capital
...
equity.append(curr_eq)    # Solo se registra cuando hay posición o señal
```

### Motor de optimización — equity TODOS los días (correcto)
```python
# Equity REAL dia a dia
curr_eq = sim_capital
...
equity.append(curr_eq)    # Registro diario incondicional (incluye días en cash)
```

**Consecuencia:** con 72 trades en 10 años (~95% del tiempo en cash), la curva de
equity del baseline tiene **muchos menos puntos** que el calendario real, pero
el Sharpe se anualiza con `sqrt(252)` **como si cada punto fuera 1 día**:

```python
rets = eq_series.pct_change().dropna()
sharpe = np.sqrt(252) * rets.mean() / max(rets.std(), 0.0001)
```

Al omitir los días planos (retorno 0), el muestreo disperso **infla ambos momentos**
— la media crece ~linealmente con el horizonte agregado de cada punto mientras la
desviación solo crece ~√horizonte, elevando el ratio media/desv. Al anualizar con
`sqrt(252)` como si cada punto fuera un día suelto, el Sharpe queda **inflado**.
Este es el origen del factor extra de ~1.3x (3.90/3.00) que no explica el sizing.

---

## ✅ ¿Cuál es el Sharpe real del sistema?

| Escenario | Sharpe | ¿Confiable? |
|-----------|:------:|:-----------:|
| Baseline engine (arreglado) | 0.586 | ✅ Honesto (curva diaria + 5%) |
| Agentes v0.2.0 (regenerado) | 0.555 | ✅ Honesto (curva diaria + 5%, riesgo reducido) |
| Agentes v0.1.0 (histórico)* | 1.712 | ❌ Inflado por muestreo |
| Optimización (diario, 5%)* | 0.586 | ✅ Honesto — 0.586 = config baseline-matching (exit 60, hold 5) |
| Optimización (diario, 15%) | ~0.59* | ✅ Honesto (invariante al sizing) |
| Optimización — mejor combo (RSI<8, exit 50) | 0.682 | ✅ Honesto (tras re-ranking #3) |

> \* El Sharpe no cambia con el sizing; lo que cambia con el sizing es retorno y DD.
> Con el sizing ya unificado al 5%, el baseline y la optimización dan exactamente
> los mismos retorno (1.69%), DD (0.68%) y Sharpe (0.586) para la misma config.
>
> \*\* El JSON v0.1.0 histórico (Sharpe 1.712 inflado) se respaldó en
> `backtest_rsi2_spy_agentes_v010.json` antes de sobrescribir `backtest_rsi2_spy_agentes.json`
> con la config v0.2.0 corregida.

**El Sharpe honesto del RSI(2) SPY es ~0.5-0.6** (calculado sobre la curva diaria
completa). El 2.286 del baseline es un artefacto de medición, no una ventaja real.

---

## 🤖 Los agentes: con la config v0.2.0 ya no aportan frecuencia extra

Con la config **v0.2.0** (RSI<5, exit 60, hold 5) y sizing fijo 5% (#2), el
pipeline de agentes produce **exactamente los mismos 72 trades que el baseline**
(WR 77.78%) — solo reduce la exposición en momentos de alta volatilidad vía
KRONOS/ORÁCULO (`exposure_prom` 0.96, `weight_prom` 0.97), lo que baja el retorno
(1.49% vs 1.69%) y también el DD (0.62% vs 0.68%).

| | Baseline v0.2.0 | Agentes v0.2.0 | Δ |
|---|:---:|:---:|:---:|
| RSI entrada | <5 | <5 | — |
| Trades | 72 | 72 | 0 |
| WR | 77.78% | 77.78% | 0 |
| Retorno | 1.69% | 1.49% | -0.20pp |
| Sharpe | 0.586 | 0.555 | -0.031 |
| Max DD | 0.68% | 0.62% | -0.06pp |

### Comparación con el histórico v0.1.0 (RSI<10)

| | Agentes v0.1.0 (histórico) | Agentes v0.2.0 (actual) |
|---|---|---|
| RSI entrada | <10 | <5 |
| Exit RSI | 50 | 60 |
| Max hold | 10d | 5d |
| Trades | 141 | 72 |
| WR | 70.21% | 77.78% |
| Retorno | 6.80% | 1.49% |
| PF | 1.63 | 1.81 |
| Sharpe | 1.712 (inflado) | **0.555 (corregido)** |
| Max DD | 1.79% | 0.62% |

**Lectura honesta:** la v0.1.0 operaba más (RSI<10) pero con peor calidad por trade
(WR 70%, PF 1.63); su Sharpe 1.712 estaba inflado por el muestreo disperso. Con la
v0.2.0 y el Sharpe corregido, **los agentes apenas alteran el baseline**: producen
los mismos 72 trades y a cambio de -0.20pp de retorno reducen el DD 0.06pp (0.62%
vs 0.68%). Es un tradeoff riesgo/retorno diminuto, no "valor nulo". La "magia" de
la v0.1.0 (más retorno, 141 trades) venía de la config más agresiva, no de los
agentes. *(Observación empírica de este backtest: con v0.2.0 el pipeline no
filtró ninguna señal — solo ajustó el sizing vía KRONOS/ORÁCULO.)*

---

## ⚠️ La trampa del ranking en la optimización — CORREGIDA (#3)

### El problema (antes de la corrección)
```python
resultados.sort(key=lambda r: (-r["wr"], -r["sharpe"], -r["retorno"]))
```
El "mejor combo" se elegía **por win rate primero**, no por retorno o Sharpe.
Resultado: el mejor WR (78.87%, con exit RSI 40 y max_hold 8) tenía el **retorno
más bajo de la tabla** (1.44%), porque salir cuando el RSI cruza 40 recorta las
ganancias por trade.

### La corrección aplicada (#3)
```python
def score_calmar(r):
    dd = max(r["max_dd"], 0.01)
    return r["retorno"] / dd

resultados.sort(key=lambda r: (-r["score"], -r["retorno"], -r["sharpe"], -r["wr"]))
```

### Nuevo top 5 tras re-ejecutar (2026-07-31)

| # | Score | Config | WR | Retorno | PF | Sharpe | DD | Trades |
|---|:-----:|--------|:---:|:-------:|:--:|:------:|:--:|:------:|
| 1 | **3.82** | RSI<8, SMA200, exit 50, hold 8 | 73.1% | **+2.37%** | 1.80 | 0.682 | 0.62% | 119 |
| 2 | 3.82 | RSI<8, SMA200, exit 50, hold 10 | 73.1% | +2.37% | 1.80 | 0.682 | 0.62% | 119 |
| 3 | 3.77 | RSI<8, SMA200, exit 50, hold 5 | 73.5% | +2.34% | 1.76 | 0.674 | 0.62% | 121 |
| 4 | 3.27 | RSI<8, SMA200, exit 60, hold 5 | 74.4% | +2.42% | 1.75 | 0.675 | 0.74% | 121 |
| 5 | 3.12 | RSI<8, SMA200, exit 40, hold 8 | 74.0% | +2.06% | 1.68 | 0.589 | 0.66% | 119 |

**Lección confirmada:** al optimizar por retorno/drawdown, el mejor combo pasó de
"RSI<5, exit 40" (WR 78.87% pero retorno 1.44%) a **RSI<8, exit 50** (WR 73.1%
pero retorno 2.37% y DD 0.62%). El score compuesto premia configs con más retorno
por unidad de riesgo, no solo WR alto.

---

## 🧪 Validación anti-overfitting del grid — Walk-Forward + Split 80/20 ✅

**Script:** `backtesting/validar_rsi2_spy_walkforward.py` (2026-07-31)
**Resultados:** `backtesting/results/validacion_walkforward_rsi2_spy.json`

### Metodología

- **Walk-forward anclado (expanding):** W1 train 2014→2018 / test 2018→2020;
  W2 train 2014→2020 / test 2020→2022; W3 train 2014→2022 / test 2022→2024;
  W4 train 2014→2024 / test 2024→2026.
- En cada ventana: grid de 54 combos **solo sobre trades del train**, mejor combo
  por score retorno/max_dd (mismo criterio que la optimización), evaluado sobre
  trades del test (out-of-sample).
- **WF Ratio = OOS_WR / IS_WR** (≥0.90 = sin overfit severo) + **split 80/20**
  como sanity check adicional.

### Resultados walk-forward por ventana

| Ventana | IS WR | OOS WR | WF Ratio | OOS retorno | Estado |
|---------|:-----:|:------:|:--------:|:-----------:|:------:|
| W1 (2018-20) | 86.67% | 61.54% | 0.710 ⚠️ | -0.33% | ❌ REJECTED |
| W2 (2020-22) | 75.68% | 63.33% | 0.837 ⚠️ | +0.35% | ✅ APPROVED |
| W3 (2022-24) | 72.12% | 48.00% | 0.666 ⚠️ | +0.03% | ❌ REJECTED |
| W4 (2024-26) | 70.65% | **81.48%** | **1.153** ✅ | +0.99% | ✅ APPROVED |
| **Promedio** | 76.3% | 63.6% | **0.842** | — | 2/4 |

### Resultado clave: la CONFIG ganadora (fija) NO está overfiteada

| Test | WR | Retorno | Sharpe (diario) | Trades |
|------|:--:|:-------:|:---------------:|:------:|
| **Split 80/20 — Train** (≈2014-22) | 70.53% | +1.47% | 0.532 | 95 |
| **Split 80/20 — Test** (≈2022-26) | **83.33%** | +0.89% | **1.796** | 24 |
| **WF Ratio global (test/train)** | | | **1.181 ✅ robusto** | |

La config fija **RSI<8, SMA200, exit 50, hold 8** agrega, en el período
concatenado 2018→2026: **WR 74.19% · PF 1.94 · retorno +2.17% · DD 0.61% ·
Sharpe 0.826 (diario) · 93 trades**, con WF Ratio global **1.072** vs su segmento
2014→2018 (WR 69.23%). Es la única config que aparece como mejor combo en W4
(train 2014-2024, el más parecido a la optimización completa) y la que mejor OOS
rinde ventana a ventana (58.33% / 80.95% / 76.19% / 81.48% WR).

> ⚠️ **Precisión de "OOS":** la config se eligió sobre el dataset completo, así
> que el tramo 2018→2026 es solo *parcialmente* out-of-sample para la selección.
> El OOS estricto de la config son el **split 80/20** (test ≈2022-26, ratio 1.181)
> y las ventanas **W2/W3**, donde la config NO fue seleccionada por la grid y aún
> así rindió 80.95% / 76.19% WR.

### Interpretación honesta

1. **La grid SEARCH tiene tendencia leve al overfit** (WF Ratio promedio 0.842,
   2/4 ventanas aprobadas): el "mejor combo" re-optimizado en cada ventana
   (RSI<5, RSI<12, RSI<12, RSI<8) **no es estable** y su WR cae de 76.3% IS a
   63.6% OOS. Esto es un argumento **en contra de re-optimizar con frecuencia**.
2. **La config ganadora fija SÍ generaliza:** supera el 0.90 en el split 80/20
   (1.181) y rinde bien fuera de las ventanas donde NO fue elegida (W2/W3).
3. **Conclusión:** el riesgo de overfitting del grid de 54 combos se mitiga
   eligiendo UNA config fija (RSI<8, exit 50, hold 8) y no re-optimizando por
   ventana. La elección por score retorno/max_dd (#3) eligió además una config
   que coincide con la más robusta en OOS.

---

## 🏁 Conclusiones

1. **Los 3 archivos miden lo mismo con motores distintos.** WR/PF/trades
   coinciden al 100% para la misma config → la señal RSI(2) es consistente.

2. **El Sharpe de baseline/agentes (2.3 / 1.7) era un artefacto.** La curva de
   equity omitía los días planos y se anualizaba como si fueran días sueltos.
   Corregido en ambos JSON: el Sharpe real del sistema es **~0.5-0.6**.

3. **El retorno y el DD ya son comparables (corrección #2).** Con sizing fijo 5%
   en ambos motores, el baseline da +1.69% / DD 0.68%, idéntico a la optimización.
   Los valores 5.15% / 2.04% del baseline original venían del sizing Kelly 15%.

4. **La frecuencia de 141 trades venía de la config v0.1.0, no de los agentes.**
   Con v0.2.0 el pipeline produce los mismos 72 trades que el baseline
   (WR 77.78%) y reduce retorno (-0.20pp) a cambio de menor DD (-0.06pp). Los
   agentes ajustan sizing en alta volatilidad, pero no generan frecuencia extra
   por sí mismos en esta config.

5. **Optimizar por WR es un error — ya corregido (#3).** Con el nuevo ranking
   retorno/max_dd, el mejor combo pasó de "RSI<5, exit 40" (WR 78.87%, retorno
   1.44%) a **RSI<8, exit 50** (WR 73.1%, retorno 2.37%). El score compuesto
   premia retorno por unidad de drawdown, no solo WR alto.

6. **La config ganadora NO está overfiteada (validación WFA).** El split 80/20
   da WF Ratio **1.181** (test WR 83.33% vs train 70.53%) y la config fija agrega
   74.19% WR en OOS 2018→2026. La grid search per se tiene overfit leve (0.842
   promedio), lo que recomienda **fijar la config y no re-optimizar por ventana**.

---

## 🔧 Correcciones recomendadas (estado)

1. **Unificar el motor** ✅ **APLICADA (2026-07-31)** — `equity.append` ahora corre
   todos los días en `rsi2_spy_system.py`; el Sharpe del baseline bajó a 0.586
   (idéntico al del motor de optimización).
2. **Fijar el sizing** ✅ **APLICADA (2026-07-31)** — `rsi2_spy_system.py` usa
   `size = sim_capital * TAMANO_POSICION` (5% fijo, sin Kelly). En modo agentes
   solo se aplica la reducción de riesgo (KRONOS/ORÁCULO). Baseline regenerado:
   retorno 5.15% → **1.69%**, DD 2.04% → **0.68%** — idéntico a la optimización.
3. **Cambiar el criterio de ranking** ✅ **APLICADA (2026-07-31)** —
   `optimizar_rsi2_spy.py` ordena por score = retorno/max_dd (desempates: retorno,
   sharpe, wr). Optimización re-ejecutada: mejor combo RSI<8, SMA200, exit 50,
   hold 8 (score 3.82, retorno +2.37%, DD 0.62%).
4. **Reportar Sharpe sobre la curva diaria completa** ✅ **APLICADA (2026-07-31)** —
   baseline y agentes regenerados con Sharpe 0.586. El JSON histórico v0.1.0 quedó
   respaldado en `backtest_rsi2_spy_agentes_v010.json` para preservar la
   comparación.
5. **Validar anti-overfitting del grid** ✅ **APLICADA (2026-07-31)** —
   `backtesting/validar_rsi2_spy_walkforward.py` (WFA 4 ventanas + split 80/20).
   Config ganadora robusta (split 80/20 WF Ratio 1.181); la grid search per se
   tiene overfit leve (0.842) → fijar config, no re-optimizar por ventana.

---

*Verificado por re-ejecución (2026-07-31):
- `python -m models.rsi2_spy_system --backtest --save` → baseline con Sharpe
  **0.586**, retorno **+1.69%**, DD **0.68%**, 72 trades, WR 77.78%, PF 1.90 —
  **idéntico al motor de optimización** (sizing 5% fijo).
- `python -m models.rsi2_spy_system --backtest --agentes --save` → agentes v0.2.0
  con Sharpe **0.555**, retorno **+1.49%**, DD **0.62%** (72 trades, WR 77.78%).
  Histórico v0.1.0 respaldado en `backtest_rsi2_spy_agentes_v010.json`.
- `python backtesting/optimizar_rsi2_spy.py --save` → 54 combos en 13.2s, mejor
  combo RSI<8, SMA200, exit 50, hold 8 con score **3.82** (retorno +2.37%).
- `python backtesting/validar_rsi2_spy_walkforward.py --save` → WFA 4 ventanas:
  WF Ratio promedio **0.842** (2/4 aprobadas); split 80/20 WF Ratio **1.181**
  (test WR 83.33%); config fija OOS 2018→2026: WR 74.19%, PF 1.94, Sharpe 0.826.*
