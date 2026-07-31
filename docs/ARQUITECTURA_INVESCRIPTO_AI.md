# ARQUITECTURA DETALLADA: Invescripto_AI + Ecosistema Unificado

**Fecha:** 2026-07-28
**Versión:** Fase 1 (KRONOS + ORÁCULO) implementada
**Fases 2 y 3 (PROPHET + MNEMO + SENTIMENT):** ✅ implementadas en `models/` — ver `models/README.md`

> **Nota (2026-07-31):** El flujo unificado de confianzas y su trazabilidad
> en `confianza_unificada` se documentan en **`models/README.md`**. Este documento
> describe la arquitectura de nivel portfolio (KRONOS + ORÁCULO) original.

---

## 1. DIAGRAMA DE ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAPA DE DATOS                                     │
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────────┐  │
│  │  Yahoo Finance     │  │  TradingView MCP   │  │  Social / News API   │  │
│  │  (yfinance)        │  │  (CDP + 78 tools)  │  │  (Fase 3)           │  │
│  └────────┬───────────┘  └────────┬───────────┘  └──────────┬───────────┘  │
│           │                        │                         │              │
└───────────┼────────────────────────┼─────────────────────────┼──────────────┘
            │                        │                         │
            ▼                        ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CAPA DE EJECUCIÓN (SISTEMAS BASE)                     │
│                                                                             │
│  ┌─────────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │  🪙 OB SYSTEM (crypto 15m)     │  │  📈 MARKOV ACCIONES (stocks 1h) │  │
│  │                                 │  │                                  │  │
│  │  backtesting/lgbm_ob_trading    │  │  portfolios/cartera_acciones.py │  │
│  │  _system.py                     │  │  portfolios/run_paper_trading   │  │
│  │                                 │  │  _system.py                     │  │
│  │  Motor: LightGBM ML             │  │  Motor: Cadenas Markov 2o orden │  │
│  │  Activo: BTCUSDT                │  │  Pool: 15 stocks/ETFs USA       │  │
│  │  TF: 15m                        │  │  TF: 1h                         │  │
│  │  WR: 72.34% · PF: 2.96         │  │  WR: 64.41% · Ret: +33.93%     │  │
│  │  Sharpe: 8.25                   │  │  Sharpe: ~1.8 (est.)           │  │
│  │                                 │  │                                  │  │
│  │  Salida: {wr, pf, sharpe,       │  │  Salida: {rentabilidad, wr,     │  │
│  │          cagr, maxdd,           │  │          trades, capital_final, │  │
│  │          w1_wr...w4_wr,         │  │          activos}               │  │
│  │          w1_pf...w4_pf}         │  │                                  │  │
│  └────────────────┬────────────────┘  └──────────────┬───────────────────┘  │
│                   │                                   │                      │
└───────────────────┼───────────────────────────────────┼──────────────────────┘
                    │                                   │
                    │      ┌─────────────────────────┐   │
                    │      │ orquestador_unificado.py│   │
                    │      │ (subprocess runner)     │   │
                    │      └──────────┬──────────────┘   │
                    │                 │                   │
                    ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CAPA INVESCRIPTO_AI (INTELIGENCIA CONTEXTUAL)          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              KRONOS CIRCUIT BREAKER                                  │   │
│  │              portfolios/invescripto_engine.py: KronosCircuitBreaker  │   │
│  │                                                                      │   │
│  │  Entrada:                                                            │   │
│  │    ├─ ob_metrics: {btc_wr, btc_sharpe, btc_pf, w1_pf..w4_pf}        │   │
│  │    ├─ markov_metrics: {wr, rentabilidad, trades}                     │   │
│  │    ├─ vix_estimado: float (opcional, ej: 15.0, 35.0)                │   │
│  │    └─ dias: int                                                      │   │
│  │                                                                      │   │
│  │  Logica:                                                             │   │
│  │    ├─ 1. Evaluar VIX (si disponible)                                 │   │
│  │    │     VIX < 25  → puntuacion += 0.1  (estable)                   │   │
│  │    │     VIX > 25  → puntuacion -= 0.2  (alerta)                    │   │
│  │    │     VIX > 30  → puntuacion -= 0.4  (crisis)                    │   │
│  │    ├─ 2. Evaluar OB System                                           │   │
│  │    │     WR ≥ 65%  → +0.25  |  WR ≥ 55%  → +0.10  |  else -0.10    │   │
│  │    │     Sharpe ≥ 5 → +0.20  |  Sharpe ≥ 2 → +0.05  |  else -0.10   │   │
│  │    │     WFA 4/4   → +0.15  |  < 2/4      → -0.15                   │   │
│  │    ├─ 3. Evaluar Markov Acciones                                     │   │
│  │    │     WR ≥ 65%  → +0.20  |  WR ≥ 55%  → +0.10  |  else -0.10    │   │
│  │    │     Ret > 0%  → +0.10  |  Trades OK  → +0.05                   │   │
│  │    └─ 4. Determinar regimen                                          │   │
│  │          puntuacion ≤ -0.3 → CRISIS      (exposure 0.50x)            │   │
│  │          puntuacion ≥ +0.6 → ALTA        (exposure 1.20x)            │   │
│  │          else              → NORMAL      (exposure 1.00x)            │   │
│  │                                                                      │   │
│  │  Salida:                                                             │   │
│  │    ├─ regimen: str ("CRISIS" | "NORMAL" | "ALTA")                    │   │
│  │    ├─ exposure_multiplier: float (0.50 | 1.00 | 1.20)                │   │
│  │    ├─ confianza: float (0.0 a 1.0)                                   │   │
│  │    ├─ puntuacion_bruta: float (-1.0 a 1.5)                           │   │
│  │    ├─ factores_positivos: List[str]                                   │   │
│  │    └─ advertencias: List[str]                                         │   │
│  └────────────────────────┬────────────────────────────────────────────┘   │
│                           │                                                 │
│                           ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              ORACULO CONSENSUS ENGINE                                │   │
│  │              portfolios/invescripto_engine.py: OraculoConsensus     │   │
│  │                                                                      │   │
│  │  Entrada:                                                            │   │
│  │    ├─ weights_rp: {OB_SYSTEM, MARKOV_ACCIONES} (Risk Parity base)    │   │
│  │    ├─ ob_metrics: dict (metricas de OB System)                       │   │
│  │    ├─ markov_metrics: dict (metricas de Markov Acciones)             │   │
│  │    └─ kronos_diagnostico: dict (salida de KRONOS)                    │   │
│  │                                                                      │   │
│  │  Logica:                                                             │   │
│  │    ├─ 1. Score OB = WR/100*0.4 + min(Sharpe/10,1)*0.3 + min(PF/4,1)*0.3│ │
│  │    ├─ 2. Score MK = WR/100*0.6 + min(max(ret,0)/0.5,1)*0.4          │   │
│  │    ├─ 3. Peso_rel = score / (score_ob + score_mk)                   │   │
│  │    ├─ 4. Mix: peso = 0.50*RP + 0.50*rendimiento                     │   │
│  │    ├─ 5. Normalizar pesos a suma 100%                                │   │
│  │    └─ 6. Aplicar exposure de KRONOS                                  │   │
│  │                                                                      │   │
│  │  Salida:                                                             │   │
│  │    ├─ adjusted_weights: {OB_SYSTEM, MARKOV_ACCIONES,                 │   │
│  │    │                      exposure_multiplier}                       │   │
│  │    ├─ senal_consenso: {confianza_oraculo, score_ob, score_mk,        │   │
│  │    │                   score_combinado, regimen, exposure_activa}    │   │
│  │    ├─ kronos: dict (diagnostico completo)                            │   │
│  │    └─ scores_individuales: {ob_system, markov_acciones}              │   │
│  └────────────────────────┬────────────────────────────────────────────┘   │
│                           │                                                 │
└───────────────────────────┼─────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CAPA DE RIESGO Y SIMULACIÓN                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              ORQUESTADOR UNIFICADO (main loop)                        │   │
│  │                                                                      │   │
│  │  Flujo completo:                                                     │   │
│  │                                                                      │   │
│  │  1. OB System (subprocess)  ────►  ob_metrics                        │   │
│  │  2. Markov Acciones (subproc) ──►  markov_metrics                    │   │
│  │  3. Risk Parity (vol_inversa) ──►  weights_base                      │   │
│  │  4. KRONOS (regimen) ──────────►  diagnostico                        │   │
│  │  5. ORACULO (consenso) ────────►  adjusted_weights  ◄── NUEVO        │   │
│  │  6. Monte Carlo (10k sims) ────►  portfolio_metrics                  │   │
│  │  7. Reporte + JSON ──────────────────────────────────►  output       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              MONTE CARLO SIMULATOR                                    │   │
│  │                                                                      │   │
│  │  Entrada: adjusted_weights, exposure_multiplier                      │   │
│  │                                                                      │   │
│  │  capital_ajustado = capital × exposure_multiplier                    │   │
│  │  portfolio_return = w_ob × N(μ_ob, σ_ob) + w_mk × N(μ_mk, σ_mk)    │   │
│  │                                                                      │   │
│  │  Salida: median, P25, P75, P95 de Sharpe, DD y retorno              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. FLUJO DE DATOS COMPLETO (Paso a Paso)

### 2.1 Sin Invescripto_AI (Risk Parity Puro)

```
OB System ──► Parse ──► {wr: 72.34%, pf: 2.96, sharpe: 8.25, cagr: 57.49%}
                              │
Markov ────► Parse ──► {wr: 64.41%, ret: +33.93%, trades: 118}
                              │
         Risk Parity ──► weights = {OB: 34.8%, MK: 65.2%}
                              │
         Monte Carlo ──► Portfolio: {ret: +39.2%, sharpe: 5.5, dd: 2.6%}
```

### 2.2 Con Invescripto_AI (Fase 1: KRONOS + ORÁCULO)

```
OB System ──► Parse ──► {wr: 72.34%, pf: 2.96, sharpe: 8.25, cagr: 57.49%,
│                         w1_pf: 2.87, w2_pf: 3.50, w3_pf: 2.80, w4_pf: 3.71}
│
Markov ────► Parse ──► {wr: 64.41%, ret: +33.93%, trades: 118}
│
├── Risk Parity ──► weights_base = {OB: 34.8%, MK: 65.2%}
│
├── KRONOS ───────────────────────────────────────────────────────────────┐
│   │  VIX = 15.0 → estable (+0.1)                                       │
│   │  OB WR = 72.3% → ALTA (+0.25)                                      │
│   │  OB Sharpe = 8.25 → ALTO (+0.20)                                   │
│   │  OB WFA = 4/4 → OK (+0.15)                                         │
│   │  MK WR = 64.4% → NORMAL (+0.10)                                    │
│   │  MK Ret = +33.9% → positivo (+0.10)                                │
│   │  MK Trades = 118 ≥ 30 → OK (+0.05)                                 │
│   │  ──────────────────────────────────────────                         │
│   │  puntuacion = 0.95 → REGIMEN ALTA                                  │
│   │  exposure = 1.20x │ confianza = 78.0%                              │
│   └─────────────────────────────────────────────────────────────────────┘
│
├── ORACULO ──────────────────────────────────────────────────────────────┐
│   │  Score OB = 0.724*0.4 + min(8.25/10,1)*0.3 + min(2.96/4,1)*0.3    │
│   │           = 0.290 + 0.248 + 0.222 = 0.759                          │
│   │  Score MK = 0.644*0.6 + min(0.339/0.5,1)*0.4                      │
│   │           = 0.386 + 0.271 = 0.658                                  │
│   │                                                                     │
│   │  Peso OB relativo = 0.759 / (0.759 + 0.658) = 0.536                │
│   │  Peso MK relativo = 0.658 / (0.759 + 0.658) = 0.464                │
│   │                                                                     │
│   │  Mix (alpha=0.50):                                                  │
│   │  w_OB = 0.50*0.348 + 0.50*0.536 = 0.442                           │
│   │  w_MK = 0.50*0.652 + 0.50*0.464 = 0.558                           │
│   │                                                                     │
│   │  adjusted_weights = {OB: 44.2%, MK: 55.8%, exposure: 1.20x}       │
│   └─────────────────────────────────────────────────────────────────────┘
│
└── Monte Carlo ──► capital_ajustado = $50,000 × 1.20 = $60,000
                    weights = {OB: 44.2%, MK: 55.8%}
                    Portfolio: {ret: +39.2%, sharpe: 6.24, dd: 2.1%}
```

---

## 3. MAPA DE MÓDULOS Y ARCHIVOS

```
PROYECTO ROOT
│
├── orquestador_unificado.py              ← ENTRY POINT
│   ├── Importa: portfolios.invescripto_engine
│   ├── Ejecuta: OB System (subprocess)
│   ├── Ejecuta: Markov Acciones (subprocess)
│   ├── Ejecuta: Risk Parity (función local)
│   ├── Ejecuta: KRONOS + ORÁCULO (invescripto_engine)
│   ├── Ejecuta: Monte Carlo (función local)
│   └── Genera: reporte + JSON
│
├── portfolios/
│   ├── invescripto_engine.py             ← NUEVO - CAPA INVESCRIPTO
│   │   ├── KronosCircuitBreaker.evaluar()
│   │   ├── OraculoConsensus.calcular_consenso()
│   │   └── evaluar_ecosistema() (helper)
│   │
│   ├── base_engine.py                    ← Clase base Markov
│   ├── cartera_acciones.py               ← Pool de 15 stocks
│   ├── run_paper_trading.py              ← CLI paper trading
│   ├── data_source.py                    ← Adaptador datos
│   ├── macro_coordinador.py              ← Risk Parity legacy
│   ├── __init__.py                       ← Package exports
│   └── ... (otros módulos legacy)
│
├── backtesting/
│   ├── lgbm_ob_trading_system.py         ← OB System (LightGBM)
│   ├── data/
│   │   └── BTCUSDT_15m_4y.csv            ← Datos historicos BTC
│   └── results/
│       └── lgbm_ob_trading_system.json   ← Resultados OB
│
├── resultados_unificados/
│   └── ecosistema_unificado_*.json       ← Output JSON
│
└── portfolios/reportes/graficos/
    ├── histograma_mc_*.png               ← Histograma MC
    └── curva_equity_*.png                ← Curva de equity
```

---

## 4. FASES DE IMPLEMENTACIÓN

```
FASE 1 ✅ (Implementada)
┌─────────────────────────────────────────────────────────────────────┐
│ KRONOS + ORACULO                                                    │
│                                                                     │
│ Archivo: portfolios/invescripto_engine.py (1,650 bytes, ~250 lines) │
│ Flags CLI: --invescripto --vix                                      │
│                                                                     │
│ Que hace:                                                           │
│ ├── Detecta regimen de mercado (VIX + rendimiento sistemas)         │
│ ├── Ajusta pesos Risk Partnership dinamicamente                     │
│ ├── Aplica exposure multiplier (0.5x, 1.0x, 1.2x)                  │
│ └── Reporta confianza y factores                                    │
└─────────────────────────────────────────────────────────────────────┘

FASE 2 ⏳ (Próxima)
┌─────────────────────────────────────────────────────────────────────┐
│ PROPHET - Validador de Señales                                      │
│                                                                     │
│ Archivo propuesto: portfolios/invescripto_agents/prophet.py         │
│                                                                     │
│ Que haria:                                                          │
│ ├── Prediccion basica de direccion (EMA cruzada + RSI)              │
│ ├── Valida senales de OB System (misma direccion = +confianza)      │
│ ├── Valida senales de Markov (misma direccion = +confianza)         │
│ └── Aporta score de 0.0 a 1.0 al ORACULO                           │
└─────────────────────────────────────────────────────────────────────┘

FASE 3 ⏳ (Futura)
┌─────────────────────────────────────────────────────────────────────┐
│ MNEMO + SENTIMENT                                                   │
│                                                                     │
│ Archivos propuestos: portfolios/invescripto_agents/mnemo.py         │
│                     portfolios/invescripto_agents/sentiment.py      │
│                                                                     │
│ MNEMO:                                                              │
│ ├── Reconoce patrones Turtle Soup en datos de precio               │
│ ├── Busca patrones historicos similares                             │
│ └── Aporta tasa de exito historica al consenso                      │
│                                                                     │
│ SENTIMENT:                                                          │
│ ├── Scrapea noticias financieras (RSS feeds)                        │
│ ├── Analiza sentimiento con NLP basico                              │
│ └── Aporta senal de -1 a +1 al ORACULO                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. FORMATO DE COMUNICACIÓN ENTRE CAPAS

### OB System → orquestador (vía stdout)

```
W4 | train=783 | test=327 | scored=117 | AUC=0.664 | trades=117 | WR=74.36% | PF=3.708 | PnL=55.42%
...
Win Rate     : 72.34%
Profit Factor: 2.96
Total PnL    : 370.99%
Sharpe       : 9.16
CAGR (4y)    : 47.32%
Max DD       : 4.68%
Trades       : 969
```

### Markov Acciones → orquestador (vía stdout)

```
Rentabilidad: +33.93%
Operaciones: 118
Win rate:    64.41%
Capital final: $66,966.89 USD
Cartera activa (4): ['AAPL', 'JNJ', 'GOOGL', 'JPM']
```

### orquestador → invescripto_engine (vía Python dicts)

```python
evaluar_ecosistema(
    ob_metrics={
        "btc_wr": 72.34, "btc_sharpe": 8.25, "btc_pf": 2.96,
        "btc_cagr": 57.49, "btc_maxdd": 12.28, "total_trades": 1019,
        "w1_pf": 2.87, "w2_pf": 3.50, "w3_pf": 2.80, "w4_pf": 3.71,
    },
    markov_metrics={
        "wr": 64.41, "rentabilidad": 33.93, "trades": 118,
    },
    weights_rp={"OB_SYSTEM": 0.3478, "MARKOV_ACCIONES": 0.6522},
    dias=180,
    vix_estimado=15.0,
)
```

### invescripto_engine → orquestador (vía Python dict)

```python
{
    "adjusted_weights": {
        "OB_SYSTEM": 0.442,
        "MARKOV_ACCIONES": 0.558,
        "exposure_multiplier": 1.2,
    },
    "senal_consenso": {
        "confianza_oraculo": 0.780,
        "score_ob": 0.759,
        "score_mk": 0.658,
        "score_combinado": 0.843,
        "regimen": "ALTA",
        "exposure_activa": True,
    },
    "kronos": {
        "regimen": "ALTA",
        "exposure_multiplier": 1.2,
        "confianza": 0.780,
        "puntuacion_bruta": 0.95,
        "factores_positivos": [
            "VIX=15.0 estable",
            "OB WR=72.3% (ALTA)",
            "OB Sharpe=8.25 (ALTO)",
        ],
        "advertencias": [],
    },
    "scores_individuales": {"ob_system": 0.759, "markov_acciones": 0.658},
}
```

### orquestador → JSON output

```json
{
  "config": {"dias": 180, "capital": 50000, "invescripto": true, "vix": 15.0},
  "ob_system": { ... },
  "markov_acciones": { ... },
  "invescripto_ai": { ... },
  "portfolio_unificado": {
    "weights": {"OB_SYSTEM": 0.442, "MARKOV_ACCIONES": 0.558},
    "exposure_multiplier": 1.2,
    "capital_final": 83490.51,
    "rentabilidad_pct": 39.15,
    "sharpe_ratio": 6.240,
    "max_drawdown_pct": 2.12,
    ...
  }
}
```

---

## 6. COMPARATIVA: CON vs SIN INVESCRIPTO_AI

| Aspecto | Sin Invescripto | Con Invescripto (Fase 1) |
|:--------|:---------------:|:------------------------:|
| **Pesos** | Estáticos (RP puro) | Dinámicos (RP + rendimiento) |
| **Exposición** | Siempre 1.00x | 0.50x a 1.20x según régimen |
| **Contexto macro** | No considera | VIX como factor de régimen |
| **WR bajo** | Opera igual | Reduce exposición |
| **Crisis (VIX > 30)** | Sin protección | 50% de exposición |
| **Alta confianza** | Sin beneficio | 120% de exposición |
| **Transparencia** | Solo métricas finales | Factores + advertencias |
| **Sharpe (est.)** | 5.5 | 6.2 (mejora por ajuste) |

---

## 7. ESTRATEGIA DE INTEGRACIÓN FUTURA (Fases 2-3)

```
Fase 2: PROPHET
┌────────────────────────────────────────────────────────────────────┐
│ orquestador                                                        │
│   │                                                                │
│   ├── OB System ──► señal (score, direccion)                      │
│   ├── Markov ─────► señal (prob_u, prob_d, direccion)             │
│   │                                                                │
│   └── PROPHET ────► prediccion_direccion = {BULL, BEAR, NEUTRO}  │
│         │                                                          │
│         └── ORACULO (ahora con 3 inputs):                         │
│             ├── Score OB + PROPHET valida → ajuste fino            │
│             ├── Score MK + PROPHET valida → ajuste fino            │
│             └── KRONOS regimen → exposure                          │
└────────────────────────────────────────────────────────────────────┘

Fase 3: MNEMO + SENTIMENT
┌────────────────────────────────────────────────────────────────────┐
│ orquestador                                                        │
│   │                                                                │
│   ├── OB System ──► señal                                          │
│   ├── Markov ─────► señal                                          │
│   ├── PROPHET ────► prediccion                                     │
│   ├── MNEMO ──────► patron_detectado + tasa_exito_historica       │
│   ├── SENTIMENT ──► sentimiento_score (-1 a +1)                   │
│   │                                                                │
│   └── ORACULO (5 inputs):                                         │
│       ├── Ponderacion multiple de agentes                          │
│       ├── Aprendizaje continuo (cada trade → knowledge base)       │
│       └── Pesos de agentes se ajustan con el tiempo               │
└────────────────────────────────────────────────────────────────────┘
```
