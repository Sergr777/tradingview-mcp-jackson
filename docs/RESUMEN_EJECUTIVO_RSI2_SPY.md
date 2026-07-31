# 📋 Resumen Ejecutivo Final — Sistema RSI(2) SPY

**Fecha:** 2026-07-31
**Datos:** `data/SPY_daily_10y.csv` (3,162 velas diarias, 2014-01-02 → 2026-07-30)
**Capital:** $100,000 · **Costos:** 0.06% round-trip · **Sizing:** fijo 5%

---

## 🎯 Veredicto en una frase

> **El Sharpe real del RSI(2) SPY es ~0.5–0.6, no 2.3.** Los números espectaculares
> originales (Sharpe 2.286, retorno 5.15%) eran **artefactos de medición** (curva de
> equity con muestreo disperso + sizing Kelly 15%). Tras 4 correcciones, los tres
> motores convergen y el mejor combo optimizado — **RSI<8, SMA200, exit 50, hold 8**
> (score **3.82**) — supera al baseline con la misma señal y sin overfitting.

---

## 🔧 Las 4 correcciones aplicadas (2026-07-31)

| # | Corrección | Qué se arregló | Efecto verificado |
|---|-----------|----------------|-------------------|
| **#1** | **Motor unificado — Sharpe honesto** | `equity.append` ahora corre TODOS los días en `models/rsi2_spy_system.py` (antes solo en días con posición/señal) | Baseline Sharpe **2.286 → 0.586** |
| **#2** | **Sizing fijado al 5% (sin Kelly)** | Se eliminó el Kelly (cap 15%) → `size = sim_capital * TAMANO_POSICION`. En modo agentes solo se aplica la reducción de riesgo KRONOS/ORÁCULO | Retorno **5.15% → 1.69%**, DD **2.04% → 0.68%** — ahora idéntico al motor de optimización |
| **#3** | **Ranking de optimización corregido** | `optimizar_rsi2_spy.py` ordena por **score = retorno/max_dd** (tipo Calmar), no por WR | Mejor combo cambió de "RSI<5, exit 40" (WR 78.87%, retorno 1.44%) a **RSI<8, exit 50** (retorno 2.37%) |
| **#4** | **JSON de agentes regenerado (v0.2.0)** | Curva diaria + config actual + respaldo del histórico v0.1.0 | Agentes Sharpe **1.712 → 0.555**; histórico preservado en `backtest_rsi2_spy_agentes_v010.json` |

> **Archivos modificados:** `models/rsi2_spy_system.py` (#1 y #2) ·
> `backtesting/optimizar_rsi2_spy.py` (#3) · JSON de baseline/agentes/optimización
> regenerados (#4). Documento de detalle:
> `docs/comparativa_rsi2_spy_baseline_vs_agentes_vs_optimizacion.md`

---

## 📊 Métricas honestas finales (10 años, 2014→2026)

| Métrica | Baseline | Agentes v0.2.0 | **Optimización (mejor combo)** |
|---------|:--------:|:--------------:|:-------------------------------:|
| **Config** | RSI<5, SMA200, exit 60, hold 5 | = baseline + pipeline 5 agentes | **RSI<8, SMA200, exit 50, hold 8** |
| **Retorno total** | 1.69% | 1.49% | **2.37%** |
| **Max Drawdown** | 0.68% | 0.62% | **0.62%** |
| **Sharpe** | 0.586 | 0.555 | **0.682** |
| **Win Rate** | 77.78% | 77.78% | 73.11% |
| **Profit Factor** | 1.90 | 1.81 | 1.80 |
| **Trades (10y)** | 72 | 72 | 119 |
| **Trades/año** | 5.7 | 5.7 | 9.5 |
| **Score (Ret/DD)** | — | — | **3.82** |

**Lectura clave:**
- **Baseline y optimización dan EXACTAMENTE los mismos números** para la misma
  config (ratio 1.00x en todas las métricas) → la señal RSI(2) es consistente entre
  motores.
- El mejor combo mejora el retorno **+0.68pp** vs baseline (2.37% vs 1.69%) con
  **menor DD** (0.62% vs 0.68%) y Sharpe superior (0.682 vs 0.586) — la entrada más
  permisiva (RSI<8) y la salida más temprana (exit 50) capturan mejores trades.
- Los agentes **no aportan frecuencia** con la config v0.2.0 (mismos 72 trades);
  solo reducen exposición en volatilidad alta (-0.20pp retorno a cambio de -0.06pp DD).

---

## 🏆 El mejor combo del grid de 54 (RSI<8, SMA200, exit 50, hold 8)

```text
Score (Ret/DD):   3.82        Win Rate:       73.11%
Retorno total:    +2.37%      Profit Factor:  1.80
Max Drawdown:     0.62%       Sharpe:         0.682
Trades (10y):     119         Trades/año:     9.5
```

**¿Por qué este y no el de mayor WR?** El ranking anterior premiaba el WR (78.87%
con "RSI<5, exit 40") que en realidad daba el retorno MÁS BAJO de la tabla (1.44%)
porque salir en RSI 40 recorta las ganancias. El score compuesto
`retorno/max_dd` corrige eso.

---

## 🧪 Validación anti-overfitting (walk-forward + split 80/20)

**Script:** `backtesting/validar_rsi2_spy_walkforward.py` · **Resultados:**
`backtesting/results/validacion_walkforward_rsi2_spy.json`

| Prueba | Resultado | Veredicto |
|--------|-----------|-----------|
| **Split 80/20** — Train (≈2014-22) | 95 trades · 70.53% WR · Sharpe 0.532 | — |
| **Split 80/20** — Test (≈2022-26) | 24 trades · **83.33% WR** · Sharpe 1.796 | — |
| **WF Ratio (test/train)** | **1.181** | ✅ **Robusto, sin overfit** |
| **Config fija OOS 2018→2026** | WR 74.19% · PF 1.94 · Sharpe 0.826 · 93 trades | ✅ Generaliza |
| **Grid re-optimizada por ventana** | WF Ratio promedio **0.842** (2/4) | ⚠️ Overfit leve del *proceso* de grid |

**Conclusión de la validación:** el riesgo de overfitting del grid de 54 combos se
mitiga eligiendo **UNA config fija** (la ganadora) y **no re-optimizando por
ventana** — el mejor combo por ventana es inestable (RSI<5→RSI<12→RSI<12→RSI<8),
pero la config fija rinde bien incluso en las ventanas donde la grid no la eligió
(80.95% / 76.19% WR en W2/W3).

---

## 🚀 Recomendaciones operativas

1. **Pasar el sistema a la config ganadora** (RSI<8, exit 50, hold 8) como default
   en producción — mejor retorno, menor DD y validado sin overfitting.
2. **No re-optimizar con frecuencia** — la evidencia WFA muestra que la
   re-optimización por ventana degrada el OOS (0.842); fijar y monitorear.
3. **Los agentes son un "riesgo manager", no un generador de alpha** con esta
   config — decidir si el -0.20pp de retorno vale el -0.06pp de DD que aportan.
4. **Trades/año limitado (5.7–9.5):** el sistema es de baja frecuencia; el siguiente
   paso natural es **complementar con un sistema de arbitraje/pairs** (mercado-
   neutral) para usar el ~95% del capital ocioso y subir la frecuencia total.

---

*Verificado por re-ejecución (2026-07-31):*
- Baseline: Sharpe **0.586**, retorno **+1.69%**, DD **0.68%**, 72 trades, WR 77.78%
- Agentes: Sharpe **0.555**, retorno **+1.49%**, DD **0.62%**, 72 trades, WR 77.78%
- Optimización: mejor combo RSI<8/SMA200/exit 50/hold 8, score **3.82**, retorno **+2.37%**
- WFA: split 80/20 WF Ratio **1.181** · config fija OOS 2018→2026 WR **74.19%**
