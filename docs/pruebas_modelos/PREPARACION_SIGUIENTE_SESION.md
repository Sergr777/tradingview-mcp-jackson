# 🚀 PREPARACIÓN SIGUIENTE SESIÓN — Briefing de arranque

> **⚠️ LEER ESTE ARCHIVO ANTES DE COMENZAR CUALQUIER SESIÓN NUEVA sobre OB Crypto V2.**
> Contiene el estado exacto, los aprendizajes que no hay que repetir y los siguientes pasos.
>
> **SESIÓN EN CURSO (2026-08-04):** 10 cambios OpenSpec completados (los 9 del 08-02 +
> **bybit-oi-ls-historical**) · **1 change activo por aplicar** (este mismo, pendiente de
> archivar) · checklist P0 de los 3 brazos en verde · suite completa en verde (68 tests) ·
> **Fase 0 de infraestructura (2026-08-03→04):** paper trading RSI(2)+TSMOM **DESPLEGADO Y
> OPERATIVO** en GitHub Actions (fork `Sergr777/tradingview-mcp-jackson` como origin,
> workflow `paper-rsi2-tsmom` activo, primer ciclo verde 12/12 con commit automático del
> paper-bot y log de auditoría; 3 fixes de CI aplicados: yfinance 0.2.59, imports
> opcionales en `models/__init__.py`, crash-bug del updater) ·
> **6 fuentes de alfa medidas y descartadas con evidencia** (A1 Markov, A2 sentimiento,
> A2-onchain, A2-régimen, + re-medición A1/A2 por señal primaria — la hipótesis del
> ensemble diluido DESCARTADA: primary es igual o peor que features en los 6 casos) ·
> **A2-onchain cerrada con muestra propia (v12):** OI/LS re-descargados COMPLETOS desde
> Bybit V5 (`scripts/descargar_onchain_bybit.py`, 52.929 filas/componente desde
> 2020-07-20) → descarte confirmado (ΔPF −0.15, 0/12; ic_target +0.0196 / ic_pnl
> +0.0071 — el ic_pnl negativo de v9 era artefacto del funding puro).
> Única pista viva: régimen GMM como gate de celda RANGE / down-tilt (ic_target
> +0.14/+0.11). Detalle abajo.

---

## 1. En 30 segundos: qué está pasando

El sistema **OB Crypto V2** (`models/ob_crypto_wfa_v2.py`) pasó por 9 iteraciones de
mejora (L1→L9). Tras arreglar la medición (L1+L2) y restringir la celda (L5), se encontró
la **primera celda con edge sobre breakeven de todo el proceso**: **SOL L7 + piso
0.625–0.65** (TREND+alto+micro+MTF 4h, R:R 2:1). Sin embargo, **ninguna config aprueba
los criterios de producción** (WR≥55, PF≥1.1, ret≥0, trades≥20, WF≥0.90) — el edge es
fino y la mejor celda (0.650) solo tiene 2 ventanas ≥20 trades. **L9 (selector de régimen)
se probó y se descartó como vía**: concentra el edge en el agregado SOL pero colapsa la
muestra (BTC/ETH sin ventanas evaluables).

## 2. Estado actual (baseline de la próxima sesión)

| Item | Valor |
|---|---|
| Celda de trabajo | SOL L7: `TREND` + `min-threshold 0.625` + MTF 4h + micro taker |
| Breakeven (R:R 2:1) | 33.3% |
| WR mediana SOL L7 | **35.0%** (+1.7pp sobre BE) · agregado +3.32% / PF 1.08 / DD 4.1% |
| Mejor piso sweep | 0.650 → WR med 36.5% (+3.2pp), PF 1.65 (pero n=2 ventanas) |
| L9 selector (descartado) | Agregado SOL PF 1.17 / DD 2.18% / Sharpe 0.324 pero 1 sola ventana ≥20t; BTC/ETH 0/0 |
| Aprobadas | **0 en todas las configs** |
| JSON de referencia | `wfa_ob_crypto_v2_l7_sol_tuned.json` (sweep), `wfa_ob_crypto_v2_l7_sol.json`, `wfa_ob_crypto_v2_l9_sel*.json` |
| Documentación | `docs/pruebas_modelos/` (índice: `README.md`, resumen: `REPORTE_MAESTRO.md`) |
| L9-screener | `backtesting/screener_activos.py` — checklist pre-WFA. SOL ✅ PASA, BTC/ETH ❌, DOGE/XRP 1h-aprox |
| FX-V1 (nuevo) | `models/ob_forex_v2_fixed.py` — forex real (yfinance) + selector. Baseline WR 13.9% / 0-4 / −21% — pipeline OK, sin celda aún |
| MKV-XGB (evaluado) | Sistema externo `models/cartera_acciones_futuros_markov_xgb.py` — ⛔ NO es backtest válido (3 bugs estructurales de alineamiento + sin métricas OOS). Ideas: Markov-por-sesión + triple barrera → blueprint EQ-1 (doc 10). **Higiene P0 (2026-08-02):** 2 LEAKs de descarga (`period='59d'`) corregidos con corte point-in-time → auditoría del agente AQ **PASS** (checklist en `data/alpha_audit/checklist.json`) |
| Módulo de alfa | `models/ob_alpha_engine.py` (A0) + `markov_session_source.py` (A1) + `sentiment_source.py` (A2) + `onchain_source.py` (A2-onchain) + `regime_source.py` (A2-régimen) | ✅ A0/A1/A2/A2-onchain/A2-régimen implementados. **A1 (v5):** Markov → descarte (IC ≈ 0). **A2 (v7):** Sentimiento (F&G lag 1d, VADER NaN) → descarte (IC ≈ 0, ΔPF ≤ 0 ×3). **A2-onchain (v9 → v12):** funding/OI/LS (lag 1h, CoinGecko excluido) → descarte (ΔPF −0.12) y **re-medido con OI/LS COMPLETO desde Bybit V5 (v12, `descargar_onchain_bybit.py`, 52.929 filas/componente desde 2020-07-20)** → descarte confirmado (ΔPF −0.15, 0/12; ic_target +0.0196 / ic_pnl +0.0071 — el ic_pnl negativo de v9 era artefacto del funding puro). **A2-régimen (v10):** GMM P(TREND) propio activo, fit causal por bloques, sin datos externos → descarte (ΔPF ≤ 0 ×3) pero **ic_target +0.144 BTC / +0.106 ETH** (única fuente con señal direccional real; ic_pnl negativo → el setup R:R 2:1 rinde mejor en RANGE). **Re-medición (v11):** A1/A2 por señal primaria (`run_ab --mode primary`) → primary igual o peor que features ×6 (ΔPF ≤ −0.12), hipótesis del ensemble diluido DESCARTADA. JSON: `ab_alpha_{markov,sentiment,onchain,regime}_*.json` + `ab_alpha_primary_{markov,sentiment}_*.json` · suite completa verde |

## 3. Aprendizajes que NO hay que repetir (reglas del proceso)

1. **kelly 0.20 = ruina** → siempre kelly_cap 0.02. Nunca comparar configs con sizing distinto.
2. **Umbral fijo sin calibrar distorsiona IS vs OOS** → siempre `calibrar_threshold()` (L1) o sweep (L8).
3. **El problema no es overfit, es falta de edge** → WF Ratio 0.954 ya demostró que OOS≈IS.
4. **El target simétrico (L3) sube el WR pero también el breakeven** → no rentabiliza.
5. **El edge MTF 4h es específico de SOL** → no asumir transferencia a BTC/ETH sin probarlo.
6. **Criterios de aprobación inamovibles** — no relajarlos cuando aparezca una celda bonita.
7. **WFA completo SOL ≈ 5-25 min** (con `--sweep-thresholds` el barrido completo es UNA pasada ~5 min).
8. **Filtrar una celda ya filtrada = doble filtrado (L9)**: el selector mejoró el agregado SOL
   pero dejó la muestra sin ventanas evaluables. Los umbrales del checklist no transfieren
   entre activos (gate ex-ante por activo = SOL 22%, BTC 6%).
9. **El selector solo tiene sentido a nivel de cartera** (varios activos que pasen el
   checklist individualmente → ventanas evaluables se SUMAN, no se dividen).
10. **Usa el screener ANTES del WFA** (`backtesting/screener_activos.py`): si el candidato
    no pasa el checklist (ATR≥0.4%, baseTP≥29%, ADX 4h≥25/50%, |flow|≥0.12), no gaste 5-25
    min de WFA. Es la regla del profiler, codificada.
11. **No portar modelos externos tal cual**: el `ob_forex_wfa_V2.py` original repetía 8
    bugs ya corregidos (datos sintéticos, coste en barreras, kelly 0.15, umbral fijo…).
    Reusar el framework V2 y añadir solo lo nuevo (aquí: el selector cross-sectional).
12. **Los sistemas externos "listos para paper trading" imprimen números sin medición honesta**:
    el Markov+XGBoost v8.0 tenía ~70% de velas falsas (alineado al índice del ancla), sin purga,
    sin ledger de posiciones y sin benchmark. Evaluar SIEMPRE con el playbook (L1-L9) antes de
    creer un solo número (ver doc 10).

## 4. Pendientes priorizados (propuesta de orden)

### P1 — Robustecer la celda SOL L7 (lo más accionable)
- [ ] Ampliar muestra: descargar más años de SOL 15m taker (`scripts/download_15m_taker.py --symbol SOLUSDT`)
      o evaluar con WFA más fino (menos `step_bars`).
- [ ] Validar la celda 0.65 con walk-forward cruzado / bootstrap de ventanas antes de
      considerarla producción (n=2 es insuficiente).
- [ ] Añadir `l7_sol_tuned` al comparador `backtesting/analizar_cross_asset.py` para la
      tabla final consolidada.

### P1b — Selector de régimen a nivel de CARTERA (retomar solo así)
- [ ] **NO** re-aplicar el gate L9 sobre una celda ya filtrada (ya probado, doble filtrado).
- [ ] Si se retoma: 3-5 activos que pasen el checklist individualmente (ATR≥0.4%,
      base TP TREND≥29%, ADX 4h≥25, |flow|≥0.12), gate por activo, y medir si las
      **ventanas evaluables se suman** entre activos (el punto débil de n=2 en L8).
- [ ] Fijar umbrales por activo (no transferir los de SOL a BTC/ETH).

### P2 — Información que el spot 15m no tiene (salto cualitativo)
- [ ] **Funding rate / basis de perpetuos** (el estudio sugiere que correlaciona con
      reversión/continuación — el spot 15m no la tiene).
- [ ] **Order flow tick-level** real (no solo `taker_buy_volume` de klines): OFI, spread
      relativo, VPIN real. Los proxies de klines ya se probaron en L6 sin transferencia.

### P3 — Transferencia y marco
- [ ] Replicar la celda SOL L7 en otros activos/mercados donde el R:R 2:1 sea viable.
- [ ] Documentar el desglose por régimen×umbral de los JSON L1+L2 como evidencia de la
      elección de celda (parcialmente en `docs/OB_CRYPTO_V2_L1L2_MEJORA_ITERATIVA.md`).

### P0 — Blindaje estadístico (Capa 1 del docx) — en curso
- [x] **Descargas del módulo base point-in-time (hecho 2026-08-02):** los 2 LEAKs de
      `descargar_y_preparar_red` en `cartera_acciones_futuros_markov_xgb.py` corregidos
      (ancla + pool con `start/end` derivados de `fecha_referencia`; 0 llamadas con
      `period=`; live usa `now`). Auditoría AQ → **PASS**. Change OpenSpec
      `p0-descargas-end-fecha-referencia` (archivado).
- [x] **Auditoría de los 3 brazos en verde (hecho 2026-08-02):** `ob_forex_v2_fixed.py`
      → PASS · `backtesting/download_etf_pairs.py` → PASS (`END=None` documentado como
      dataset estático, no look-ahead; REVISA informativo en L46). Checklist persistido
      en `data/alpha_audit/checklist.json`.
- [x] **Unificación de features (hecho 2026-08-02, change `p0-unificacion-features`):**
      helper `_columnas_features()` (lista canónica) + test de paridad que blinda que
      train e inferencia usan el mismo diccionario; fix de preprocesamiento en la
      inferencia — barra con NaN no evaluable → fallback 0.5 (nunca `fillna(0)`). 7 tests
      herméticos en `models/test_unificacion_features.py`.
- [ ] **Restante P0:** meta-labeling global — la parte de descargas ya está auditada en
      los 3 brazos y la unificación de features quedó cerrada.

### Módulo de alfa (A0-A3 del doc 11) — A1 y A2 medidos y descartados
- [x] **A1 — Markov-por-sesión (hecho v5):** `markov_session_source.py` — IC ≈ 0 en los
      3 activos → descarte con evidencia. JSON en `backtesting/results/ab_alpha_markov_*.json`.
- [x] **A2 — Sentimiento (hecho v7):** `sentiment_source.py` (F&G diario lag 1 día + VADER
      NaN honesto) — IC ≈ 0, ΔPF ≤ 0 en BTC/ETH/SOL → descarte con evidencia. JSON en
      `backtesting/results/ab_alpha_sentiment_*.json`. Cache F&G: `data/sentiment/fng_daily.csv`.
- [x] **A2 — On-chain (v9 → v12):** `onchain_source.py` (funding de Binance + OI/LS,
      lag 1h, normalización ventana móvil, CoinGecko excluido por datos fabricados) —
      v9: ΔPF −0.12 (funding-only, OI/LS sin muestra) → descarte; **v12 (2026-08-03):
      OI/LS re-descargados COMPLETOS desde Bybit V5 (`scripts/descargar_onchain_bybit.py`,
      52.929 filas/componente desde 2020-07-20) → A/B re-medido, descarte CONFIRMADO
      (ΔPF −0.15, 0/12; ic_target +0.0196 / ic_pnl +0.0071)**. JSON:
      `ab_alpha_onchain_btc_20260802_183819.json` (v9) ·
      `ab_alpha_onchain_btc_20260803_131025.json` (v12). Cache: `data/onchain/*_btc.csv`
      (funding de `descargar_onchain_binance.py`; OI/LS de `descargar_onchain_bybit.py`;
      backups de los CSVs previos en `*_binance_backup.csv`).
- [x] **A2 — Régimen GMM (hecho v10):** `regime_source.py` (GMM 2 componentes P(TREND)
      del propio activo, fit causal por bloques desplazantes, sin datos externos) — ΔPF
      ≤ 0 ×3 → descarte con evidencia, PERO ic_target +0.144 BTC / +0.106 ETH (única
      fuente con señal direccional real). JSON en
      `backtesting/results/ab_alpha_regime_{btc,eth,sol}_*.json`. Experimento pendiente:
      celda **solo-RANGE** del harness o down-tilt de tamaño con P(TREND).
- [x] **Re-medición A1/A2 por señal primaria (hecho v11):** `modes_supported` de
      `markov_session_source.py` y `sentiment_source.py` ampliado a `("features",
      "primary")`; flag `--mode` en `run_ab_markov.py` / `run_ab_sentiment.py`.
      **Hipótesis del ensemble diluido DESCARTADA:** primary es igual o peor que features
      en los 6 casos (ΔPF ≤ −0.12; Markov −0.34 BTC, Sentiment −0.33 BTC). El problema
      no era la dilución — la señal de estas fuentes no contiene P&L direccional
      (ic_pnl ≈ 0 o negativo). JSON:
      `backtesting/results/ab_alpha_primary_{markov,sentiment}_{btc,eth,sol}_*.json`.
- [ ] **A3 — Señal validada → ejecución:** solo fuentes con lift OOS alimentan la
      confianza; `pipeline_agentes.py` pasa a orquestar fuentes medidas (no
      multiplicadores heurísticos).
- **Lección transversal (6 fuentes medidas, 6 descartes):** ni una matriz de transición
  de 1er orden sobre retornos 15m, ni features diarias (F&G), ni horarias
  (funding/OI/LS), ni el régimen GMM como feature/primaria aportan lift frente al
  triple barrera del arnés — la siguiente fuente debe tener frecuencia/horizonte del
  mismo orden que la celda, o medirse por la vía **señal primaria** (hook `--alpha` ya
  implementado, v8: `run_ab(mode="primary")` COMPLETADO). La única pista viva sigue
  siendo el régimen GMM como **gate de celda RANGE / down-tilt de tamaño** (v10,
  ic_target +0.14/+0.11).

### P4 — Forex y multi-mercado (ver `CAMINO_PROXIMAS_SESIONES.md`)
- [ ] FX-1: celda TREND+piso en `ob_forex_v2_fixed.py` (`--regime-only TREND --min-threshold 0.6`).
- [ ] FX-2: base rate por par forex + screener adaptado (sin taker).
- [ ] FX-3: A/B del selector cross-sectional (top-3 vs pool completo).
- [ ] EQ-1: artefacto equities/ETF/índices con yfinance (`SPY_daily_10y.csv` ya existe).
      Blueprint: capa Markov-por-sesión del v8.0 evaluado (doc 10) + framework V2 con 5 fixes
      (índice por activo, gate de sesión, purga, ancla día previo, ledger de posiciones).
- [ ] CAR-1: cartera multi-mercado (P1b) — ventanas evaluables se suman entre activos.

## 4b. Cierre de la sesión del 2026-08-02 (todo verificado y persistido)

### Changes OpenSpec completados hoy (7 ciclos cerrados)

```
openspec/changes/archive/
├── 2026-08-02-alpha-quant-analysis-module/        ← A0/AQ/contratos
├── 2026-08-02-markov-session-alpha-source/        ← A1: Markov-por-sesión (descarte con evidencia)
├── 2026-08-02-p0-descargas-end-fecha-referencia/  ← P0: 2 LEAKs corregidos (auditoría PASS)
├── 2026-08-02-sentiment-alpha-source/             ← A2: Sentimiento (descarte con evidencia)
├── 2026-08-02-p0-unificacion-features/            ← v8: features unificadas + fix fillna(0)
├── 2026-08-02-alpha-primary-hook/                 ← v8: hook --alpha (señal primaria)
├── 2026-08-02-onchain-alpha-source/               ← A2-onchain: funding/OI/LS (descarte con evidencia)
└── 2026-08-02-gmm-regime-alpha-source/            ← A2-régimen: GMM P(TREND) (descarte, ic_target +)

openspec/specs/  ← 10 capabilities oficiales
(alpha-engine, alpha-quant-agent, analysis-contracts, markov-session-source,
 p0-descarga-point-in-time, sentiment-alpha-source, p0-unificacion-features,
 alpha-primary-hook, onchain-alpha-source)
```

- `openspec list` → **No active changes found** (harness limpio) · `openspec doctor` → ok.
- Suite completa en verde: 11 contratos + motor + 14 sentimiento + 12 AQ + 8 hook + 8
  onchain + 8 régimen + 7 features (**68 tests**).
- Checklist AQ (`data/alpha_audit/checklist.json`): los 3 brazos **PASS** re-auditados al
  cierre (cartera 19:38 · forex 20:36 · etf_pairs 20:36).
- Evidencia A/B en `backtesting/results/`: `ab_alpha_markov_{btc,eth,sol}_*.json` (A1) +
  `ab_alpha_sentiment_{btc,eth,sol}_*.json` (A2).

### Resultados medidos (lección clave de la sesión)

| Fuente | Veredicto | Evidencia |
|---|---|---|
| A1 Markov-por-sesión | **DESCARTE** (IC ≈ 0 en 3 activos) | `ab_alpha_markov_*.json` |
| A2 Sentimiento (F&G lag 1d) | **DESCARTE** (IC ≈ 0, ΔPF ≤ 0) | `ab_alpha_sentiment_*.json` |
| A2-onchain (funding/OI/LS) | **DESCARTE** (ΔPF −0.12 v9 funding-only → **−0.15 v12 con OI/LS Bybit completo**, 0/12) | `ab_alpha_onchain_btc_20260802_183819.json` (v9) · `ab_alpha_onchain_btc_20260803_131025.json` (v12) |
| A2-régimen (GMM P(TREND)) | **DESCARTE** (ΔPF ≤ 0 ×3) con **ic_target +0.14/+0.11** | `ab_alpha_regime_*.json` |

**Lección transversal:** ni una matriz de 1er orden, ni features **diarias** (F&G) ni
**horarias** (funding/OI/LS) aportan lift frente al triple barrera del arnés (6 fuentes
medidas, 6 descartes — la on-chain quedó cerrada en v12 con OI/LS de Bybit con muestra
propia). La **única señal direccional real** del bloque es el régimen GMM (ic_target
+0.14/+0.11) — pero anti-P&L en el setup R:R 2:1: el arnés rinde mejor en **RANGE** que en
TREND. Próximo experimento lógico: celda solo-RANGE o down-tilt de tamaño con P(TREND).

### Cierre de la sesión del 2026-08-03 (verificado y persistido)

- **Change OpenSpec `bybit-oi-ls-historical`** (activo, pendiente de archivar):
  `scripts/descargar_onchain_bybit.py` — histórico COMPLETO de OI y LS ratio desde Bybit
  V5 (paginación por cursor, categoría linear, 1h) → **52.929 filas horarias/componente
  desde 2020-07-20** (6 años), reemplazando las ~500 filas de Binance (backups en
  `data/onchain/*_binance_backup.csv`; `funding_rate_btc.csv` intacto).
- **A/B re-medido** (`ab_alpha_onchain_btc_20260803_131025.json`, 12 ventanas OOS):
  descarte CONFIRMADO con las 3 componentes (ΔPF −0.15, 0/12 aprobadas) — con el
  hallazgo de que al cerrar el hueco **ic_target (+0.0196) e ic_pnl (+0.0071) quedan
  ambos positivos** (el ic_pnl negativo de v9 era un artefacto del funding puro).
- Suite completa en verde (8 tests on-chain, regresión cero tras el cambio de datos).

### Fase 0 — Paper trading RSI(2)+TSMOM en GitHub Actions (despliegue 2026-08-03)

Infraestructura de forward test **gratis** ($0/mes) para el portafolio RSI(2)+TSMOM
(el activo con mejor perfil del repo). No requiere VPS: la cadencia es diaria/mensual
(no 24/7), así que GitHub Actions cron basta.

**Qué se creó:**

| Artefacto | Rol |
|---|---|
| `.github/workflows/paper-rsi2-tsmom.yml` | Cron diario 23:00 UTC lun-vie (post-cierre US): actualiza datos → señales TSMOM+RSI2 → ejecuta el paper → log de auditoría → commit+push de resultados → artifact |
| `scripts/actualizar_datos_paper.py` | Updater **incremental** SPY + 10 ETFs (mismo formato que `download_etf_pairs.py`, auto_adjust=True, overlap 6d, reintentos, fail-loud preservando CSVs) |
| `scripts/registrar_paper_diario.py` | Append diario a `data/trades/historial_paper_rsi2_tsmom.csv` (auditoría del forward test) |
| `requirements-paper.txt` | numpy/pandas/yfinance pinneados (CI) |
| `.gitignore` | **Un-ignore de `data/etf/*.csv`** (crítico: el checkout de CI necesita los CSVs para actualizar solo lo nuevo; antes el updater habría re-descargado 10 años × 11 tickers cada día) |

**Validado localmente (2026-08-03):** updater +12 filas (todos los activos al día,
fallos: ninguno) · señales TSMOM (rebalance 2026-07-14, LONG 10 activos) y RSI2 (sin
señal hoy — normal en mean-reversion) · ejecutor paper $100K (sleeve TSMOM 20%, 10
posiciones, exposición bruta 13%) · 12 tests del ejecutor OK · YAML del workflow validado.

**Nota de integración:** `rsi2_spy_system --senal` sobrescribe
`data/signals/latest_signals.json` (el contrato del pipeline cripto) cuando dispara — el
workflow hace backup previo a `latest_signals_backup_paper.json`.

**✅ DESPLEGADO Y OPERATIVO (2026-08-03→04):** el fork propio `Sergr777/tradingview-mcp-jackson`
es el `origin` (el repo de LewisWJackson quedó como `upstream`, solo lectura). Fork creado,
force-push del historial completo, workflow **activo** y primer ciclo **completo en verde**
(12/12 pasos, 55s) con commit automático del paper-bot (`ed162c9 paper: ciclo diario
RSI2+TSMOM 2026-08-04`) y fila de auditoría registrada. El cron `0 23 * * 1-5` ya disparó
(00:05 UTC) y quedó operativo.

**Fixes aplicados durante la puesta en marcha (bugs reales encontrados en CI):**

1. **yfinance 0.2.55→0.2.59** (`requirements-paper.txt`): 0.2.55-0.2.57 devuelven **0 filas
   en IPs de nube** con `AttributeError: 'str' object has no attribute 'name'` (bug de
   parseo del chart API, NO rate-limit — verificado empíricamente en CI probando 5
   versiones: 0.2.58+ parsea OK). `curl_cffi==0.16.0` se mantiene: impersona Chrome real
   (fingerprint TLS) para IPs domésticas que Yahoo bloquea por fingerprint.
2. **`models/__init__.py`**: los imports eager de `cartera_acciones_futuros_xgb`,
   `cartera_forex_xgb` y `coordinador_macro_v2` (módulos de desarrollo local **no
   trackeados en git**, requieren xgboost/lightgbm/catboost) rompían `python -m
   models.tsmom_etf` en CI → ahora son **opcionales** (try/except, nombres = None con
   warning), mismo patrón que los getters lazy de OB ya existentes.
3. **`scripts/actualizar_datos_paper.py`**: `_normalizar` devolvía `KeyError: ['Close']`
   con df vacío en fallo de descarga (ahora devuelve vacío temprano) + bug de
   `first_ticker` en modo `--etf-only` (apuntaba a `args.spy_only`, nunca abortaba
   rápido).

### Pendientes para la próxima sesión (orden recomendado)

0. **Fase 0 paper trading**: push + primer run del workflow `paper-rsi2-tsmom`; verificar
   que el artifact y el commit automático funcionan. Después, decidir si el siguiente
   salto de infra es el VPS (cripto 24/7) — Hetzner CX22 (~€5/mo) como candidato.
1. **Régimen GMM como gate de celda RANGE / down-tilt** — la única pista viva del bloque
   alfa (ic_target +0.14/+0.11 pero anti-P&L en TREND; probar la celda solo-RANGE del
   harness o reducir tamaño en TREND, no filtrar dirección).
2. **Restante P0**: meta-labeling global (la parte de descargas ya está auditada en los 3
   brazos y la unificación de features quedó cerrada — change `p0-unificacion-features`,
   7 tests herméticos en verde).
3. **Brazos (substrato)**: SOL L7 + piso 0.625–0.65 (ampliar muestra), FX TREND+piso
   (celda `--regime-only TREND --min-threshold 0.6`).
4. **Archivar el change `bybit-oi-ls-historical`** (apply + archive al cierre, tras la
   revisión final).

## 5. Comandos de arranque rápido (diagnóstico en < 1 min)

```bash
# Reproducir el sweep completo SOL L7 (UNA pasada, ~5 min) — verifica que el edge sigue ahí
python models/ob_crypto_wfa_v2.py --data data/SOLUSDT_15m_4y_taker.csv \
    --regime-only TREND --sweep-thresholds 0.55,0.575,0.60,0.625,0.65,0.70 \
    --label l7_sol_tuned --save

# Comparador cross-asset (L6 vs L7 vs L3)
python backtesting/analizar_cross_asset.py

# Screener de activos (preselección pre-WFA)
python backtesting/screener_activos.py

# Datos disponibles
ls data/SOLUSDT_15m_4y_taker.csv data/SOLUSDT_1h_4y.csv
```

## 6. Cómo arrancar correctamente

1. Leer `docs/pruebas_modelos/REPORTE_MAESTRO.md` (2 min) y este briefing.
1. Si la sesión planea *expandir* el sistema (forex/equities/cerebro/agente AQ): leer
   también `docs/pruebas_modelos/11_DIRECCION_DESARROLLO.md` — el plan integrado de la
   visión institucional (docx + PDFs + Modelo_OB_Cripto.docx) × estado real medido, con
   dirección **alfa-primero**: P0 blindaje estadístico (Capa 1 del docx) + módulo de
   alfa (A0-A3), brazos como substrato de A/B (B), DL condicionado (C), microestructura
   (D), agente AQ con sus 3 funciones, y sección 7 (evolución del stack SQLite/JSON →
   Redis/DSPy/Dapr con interfaces MemoryStore/SignalBus).
2. Si la sesión planea probar algo nuevo: leer `docs/pruebas_modelos/CAMINO_PROXIMAS_SESIONES.md`
   (el roadmap: qué probar, en qué orden, criterio de éxito).
2. Verificar que el estado de `git status` coincide (resultados guardados, sin cambios raros).
3. Si la sesión toca SOL L7: primero re-ejecutar el sweep para confirmar que los números
   siguen siendo los de la tabla (35.0% / +3.32% en 0.625).
4. Decidir P1 vs P2 — recomiendo **P1 primero** (robustecer antes de añadir más features:
   el estudio externo también advierte contra fabricar edge espurio en muestra chica).

---

*Actualizado: 2026-08-04 (Fase 0 paper trading DESPLEGADA y operativa en GitHub Actions + 3 fixes de CI) · Próxima actualización: al cierre de la siguiente sesión de trabajo.*
