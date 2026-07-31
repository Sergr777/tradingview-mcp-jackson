# 📁 Modelos Validados — invest_criptoai

Registro de los modelos del ecosistema que han pasado el **proceso de validación**
(métricas honestas + anti-overfitting) y están **operativos** en el repo local.

> **Estado:** Validado y operativo · **Fecha de validación:** 2026-07-31
> **Repo:** local (sin push a remoto aún)

---

## ✅ Modelos en esta carpeta

| Modelo | Sistema | Validación | Estado | Documento |
|--------|---------|-----------|:------:|-----------|
| **RSI(2) SPY + invest_criptoai** | Mean-reversion RSI(2) sobre SPY diario + pipeline de 5 agentes | WFA + split 80/20 (WF Ratio 1.181) | ✅ Operativo | [RSI2_SPY_INVESCRIPTO_AI.md](RSI2_SPY_INVESCRIPTO_AI.md) |

---

## 🔎 Cómo se valida un modelo en este proyecto

1. **Métricas honestas** — Sharpe sobre la curva de equity diaria completa (no
   muestreo disperso) y sizing fijo comparable entre motores.
2. **Ranking por retorno/drawdown** — score tipo Calmar, no por win rate.
3. **Anti-overfitting** — walk-forward anclado (4 ventanas) + split 80/20,
   WF Ratio ≥ 0.90 para declarar robustez.
4. **Tests unitarios del contrato** — pipeline, consolidación de confianzas,
   ciclo completo end-to-end.

---

## 📄 Documentos relacionados (fuera de esta carpeta)

- `docs/RESUMEN_EJECUTIVO_RSI2_SPY.md` — resumen ejecutivo final del RSI(2) SPY
- `docs/comparativa_rsi2_spy_baseline_vs_agentes_vs_optimizacion.md` — detalle de
  las 4 correcciones y comparativa de motores
- `docs/ARQUITECTURA_INVESCRIPTO_AI.md` — arquitectura de la capa invest_criptoai
- `models/README.md` — README del pipeline de agentes (flujo unificado de confianzas)
