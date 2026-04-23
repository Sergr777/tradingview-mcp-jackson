# Cambios Implementados: OB System Fase 1 + Fase 2

> ⚠️ **ESTADO: REVERTIDO A BASELINE (2026-04-23)**
>
> Las optimizaciones descritas en este documento fueron implementadas,
> backtesteadas con WFA, y **REVERTIDAS** tras resultados degradados:
> - WR: 73.07% → 68.97% (-4.1pp)
> - PF: 3.15 → 2.742 (-0.408)
> - Sharpe: 9.16 → 8.035 (-1.13)
>
> Ver `06_POST_MORTEM.md` para análisis detallado del fallo.
> El archivo `lgbm_ob_trading_system_fase1_fase2.py` ha sido revertido a baseline
> (15 features, threshold fijo 0.55).

## Archivo: `backtesting/lgbm_ob_trading_system_fase1_fase2.py`

---

## 1. EXPANSIÓN DE FEATURES: 15 → 20

### Features Originales (15)
```python
'impulse_pct', 'ob_vol_ratio', 'zone_size_pct',
'ob_age', 'dist_zone', 'vol_ratio',
'rsi_14', 'rsi_1h', 'ema_align_15m', 'ema_align_1h',
'bbw', 'chop', 'atr_norm', 'is_ny', 'is_london',
```

### Features Nuevos Fase 1 (5)
```python
'squeeze_ratio',     # BBW / ATR — compresión/expansión
'z_score_regime',    # Z-score ventana 100 — sobre-extensión
'hurst_exponent',    # R/S analysis — régimen de mercado
'adx_regime',        # ADX categorizado — fuerza de tendencia
'momentum_5_bar',    # (close - close[5]) / close[5] — momentum corto
```

### Features DESCARTADOS (requieren datos L2)
| Feature | Razón |
|---------|-------|
| `order_flow_imbalance` | Requiere order book L2 (bid/ask volume) |
| `vpoc_ratio` | Requiere volumen por nivel de precio (footprint) |
| `spread_pct` | Spread en crypto spot < 0.01%, sin valor predictivo |
| `trade_rate` | No disponible en APIs estándar de exchange |

---

## 2. DYNAMIC THRESHOLD — Fase 2

### Lógica de Ajuste
```python
def calculate_dynamic_threshold(row, base_threshold=0.55):
    threshold = base_threshold

    # Hurst exponent
    H = row.get('hurst_exponent', 0.5)
    if H > 0.60:      threshold -= 0.03   # Trending → más lenient
    elif H < 0.40:    threshold += 0.05   # Mean-reverting → más estricto

    # Volatilidad (atr_norm)
    atr_norm = row.get('atr_norm', 0.01)
    if atr_norm > 0.02:    threshold += 0.02   # Alta vol
    elif atr_norm < 0.005: threshold -= 0.02   # Baja vol

    # ADX régimen
    adx_r = row.get('adx_regime', 1)
    if adx_r == 2:         threshold += 0.01   # Tendencia fuerte
    elif adx_r == 0:       threshold -= 0.01   # Tendencia débil

    return max(0.50, min(0.65, threshold))
```

### Rangos de Threshold
| Condición | Ajuste | Threshold Resultante |
|-----------|--------|----------------------|
| Base | — | 0.55 |
| Trending + alta vol | -0.03 + 0.02 | 0.54 |
| Mean-reverting + baja vol | +0.05 - 0.02 | 0.58 |
| Trending + baja vol | -0.03 - 0.02 | 0.50 (mínimo) |
| Mean-reverting + alta vol | +0.05 + 0.02 | 0.60 |

---

## 3. CALIBRACIÓN DE THRESHOLD

```python
def calibrate_threshold(ob_df, thresholds=[0.50, 0.55, 0.60, 0.65]):
    # Entrena modelo con todos los datos
    # Simula trades para cada threshold
    # Retorna métricas: trades, WR, PF, Sharpe, CAGR
```

Salida esperada:
```
Threshold  Trades  WR%    PF     PnL    Sharpe  CAGR%
0.50       420     68.2%  2.80   +95%   8.50    42%
0.55       340     72.1%  3.20   +110%  9.10    46%
0.60       260     75.8%  3.80   +98%   8.80    44%
0.65       180     79.4%  4.50   +72%   7.20    38%
```

**Recomendación**: Mantener base 0.55 o ajustar a 0.52-0.58 según régimen.

---

## 4. DESCARTADO (NO IMPLEMENTADO)

| Fase | Cambio | Razón de Descarte |
|------|--------|-------------------|
| Fase 1 | 28 features | Overfitting: ratio 53:1 con datos disponibles |
| Fase 3 | Multi-asset 7 activos | Correlación crypto ~0.85 en crisis; diversificación ilusoria |
| Fase 4 | Ensemble LGB+Cat+XGB | Contradice principio "Simplicity wins"; LightGBM ya tiene Sharpe 9.16 |
| Fase 4 | Stacking meta-learner | Complejidad innecesaria para ratio de datos actual |

---

## 5. CONFIGURACIÓN LIGHTGBM (MANTENIDA)

```python
LGB_PARAMS = {
    'objective':         'binary',
    'metric':            'binary_logloss',
    'learning_rate':     0.05,
    'num_leaves':        31,
    'min_child_samples': 25,
    'subsample':         0.8,
    'colsample_bytree':  0.8,
    'reg_alpha':         0.1,
    'reg_lambda':        0.1,
    'class_weight':      'balanced',
}
```

**Sin cambios** — el modelo ya es robusto. La mejora viene de features y threshold.

---

## 6. EJECUCIÓN

```bash
cd backtesting
python lgbm_ob_trading_system_fase1_fase2.py
```

Dependencias:
```bash
pip install lightgbm pandas numpy scikit-learn
```

Salida esperada:
- WFA con 4 ventanas (AUC, trades, WR, PF por ventana)
- Feature importance top 5 por ventana
- Métricas OOS acumuladas
- Calibración de threshold
- Archivo JSON en `results/lgbm_ob_trading_system_fase1_fase2.json`
