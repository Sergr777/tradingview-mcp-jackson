# 🧠 Sistema de Agentes invest_criptoai

Pipeline de **5 agentes** que orquesta `pipeline_agentes.py` sobre la señal generada
por el sistema base (OB System / RSI2). Cada agente añade una capa de inteligencia
y, al final, las confianzas paralelas se **unifican** en una sola `signal.confidence`
que valida el ejecutor.

---

## 📋 Los 5 agentes

| # | Agente | Rol | Origen | Campo que aporta |
|---|--------|-----|--------|------------------|
| 0 | **KRONOS** | Circuit breaker — régimen de mercado | `portfolios/invescripto_engine.py` (`KronosCircuitBreaker`) | `kronos.regimen`, `signal.regime`, `signal.kronos_warning` |
| 0b | **ORÁCULO** | Consensus engine — risk parity | `portfolios/invescripto_engine.py` (`OraculoConsensus`) | `oraculo.pesos_recomendados`, `signal.oraculo_weight` |
| 1 | **PROPHET** | Predicción de precio (LightGBM) + combinación OB | `models/prophet_agent.py` | `signal.combined_confidence` |
| 2 | **MNEMO** | Memoria de patrones históricos (SQLite) | `models/mnemo_agent.py` | `signal.confidence` (ajustada), `mnemo.adjusted_confidence` |
| 3 | **SENTIMENT** | Sentimiento de mercado (VADER + Fear & Greed) | `models/sentiment_agent.py` | `signal.sentiment_confidence`, `sentiment.*` |

---

## 🔄 Flujo del pipeline

```
generador_senales.py (OB System / RSI2)
    ↓ latest_signals.json
[0]  KRONOS    →  régimen de mercado (CRISIS/NORMAL/ALTA) + exposure_multiplier
[0b] ORÁCULO   →  pesos recomendados por sistema (risk parity)
[1]  PROPHET   →  signal.combined_confidence   (NO toca signal.confidence)
[2]  MNEMO     →  signal.confidence = ajustada  + mnemo.adjusted_confidence
[3]  SENTIMENT →  signal.sentiment_confidence
[4]  CONSOLIDAR_CONFIANZA → media geométrica → signal.confidence (unificada)
    ↓ signal.confidence = confianza_unificada.unificada
ejecutor_senales.py → valida signal.confidence ≥ MIN_CONFIDENCE_TO_TRADE (0.35)
```

Cada agente lee, modifica y escribe el mismo `data/signals/latest_signals.json`.
El pipeline es **composable**: cualquier agente puede saltarse con flags
(`--skip-kronos`, `--skip-oraculo`, `--skip-prophet`, `--skip-mnemo`, `--skip-sentiment`).

---

## 🎯 Flujo unificado de confianzas (el campo que decide)

### El problema que resuelve

Antes, cada agente escribía su confianza en campos paralelos que el ejecutor
**ignoraba**:

| Agente | Campo que escribía | ¿Lo leía el ejecutor? |
|--------|--------------------|:---------------------:|
| PROPHET | `signal.combined_confidence` | ❌ |
| MNEMO | `signal.confidence` (sobrescrita) | ✅ (único) |
| SENTIMENT | `signal.sentiment_confidence` | ❌ |

El ejecutor (`portfolios/ejecutor_senales.py`) solo validaba `signal["confidence"]`
contra `MIN_CONFIDENCE_TO_TRADE`. Como MNEMO era el único que sobrescribía ese campo,
solo él afectaba la decisión.

### La solución: `consolidar_confianza()`

Al final del pipeline, `ejecutar()` captura la **base pre-agentes** y unifica las
confianzas con **media geométrica** (ponderación equilibrada):

```
unificada = (base × combined_confidence × adjusted_confidence × sentiment_confidence)^(1/n)
```

- `base` = confianza del generador **antes** de que corran los agentes (se captura
  al inicio para no doble-contar el overwrite de MNEMO).
- Solo se incluyen las estimaciones **presentes** en la señal; si no hay agentes,
  la base queda intacta.
- El resultado se escribe en `signal.confidence` (el campo que valida el ejecutor)
  y se preserva `signal.confidence_original`.

> **Nota deliberada:** `mnemo.adjusted_confidence` y `sentiment_confidence` pueden
> solaparse, porque SENTIMENT parte de la confianza ya ajustada por MNEMO. Su doble
> presencia es intencional y refleja la cadena real de agentes.

### Ejemplo real (de la validación end-to-end)

Base `0.60` + PROPHET `0.5724` + MNEMO `0.60` + SENTIMENT `0.68` →

```
geomean = (0.60 × 0.5724 × 0.60 × 0.68)^(1/4) ≈ 0.6118  (61.18%)
```

La señal pasa el umbral de trading (0.35). PROPHET con probabilidad baja ahora
**penaliza** la decisión — antes se ignoraba por completo.

### Trazabilidad: `confianza_unificada`

Cada consolidación queda registrada en `senal["confianza_unificada"]`:

```json
{
  "metodo": "media_geometrica",
  "base": 0.6,
  "prophet_combined": 0.5724,
  "mnemo_adjusted": 0.6,
  "sentiment_confidence": 0.68,
  "unificada": 0.6118
}
```

También se refleja en el resumen del pipeline:
`resumen["confianza_final"]` y `resumen["pipeline_confidence"]` son ambos la
confianza unificada tras la consolidación.

### Comportamiento en `--dry-run`

Los agentes se **simulan** y NO tocan el archivo: el guard en `ejecutar()` es
`if not self.dry_run`. Por tanto en dry-run `signal.confidence` conserva el valor
del generador (sin unificar) — semántica intencional para simulación.

---

## ⚙️ Uso

```bash
# Pipeline completo (5 agentes + consolidación)
python -m models.pipeline_agentes

# Simular sin cambios
python -m models.pipeline_agentes --dry-run

# Saltar agentes individuales
python -m models.pipeline_agentes --skip-prophet
python -m models.pipeline_agentes --skip-mnemo
python -m models.pipeline_agentes --skip-sentiment

# Estado de todos los agentes
python -m models.pipeline_agentes --status

# Ciclo completo end-to-end (análisis → agentes → operaciones)
python run_ciclo_btc.py --dry-run
```

---

## 🧪 Tests

```bash
python models/test_consolidar_confianza.py      # Unificación (10 tests)
python models/test_pipeline_kronos_oraculo.py   # API KRONOS/ORÁCULO + métricas (12 tests)
python test_run_ciclo_btc.py                    # Ciclo completo (7 tests)
python backtesting/verificar_consumidores_senal.py  # Contrato kelly/position_size
```

---

## 📁 Estructura

```
models/
├── pipeline_agentes.py          # Orquestador + consolidar_confianza()
├── prophet_agent.py             # PROPHET (LightGBM)
├── mnemo_agent.py               # MNEMO (memoria SQLite)
├── sentiment_agent.py           # SENTIMENT (VADER + Fear & Greed)
├── test_consolidar_confianza.py
└── test_pipeline_kronos_oraculo.py

portfolios/
├── invescripto_engine.py        # KRONOS + ORÁCULO (API real)
└── ejecutor_senales.py          # Consume signal.confidence (la unificada)
```
