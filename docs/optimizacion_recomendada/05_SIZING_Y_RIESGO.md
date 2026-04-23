# Sizing y Gestión de Riesgo — Quarter-Kelly

---

## 1. KELLY CRITERION: FUNDAMENTOS

La fórmula de Kelly determina la fracción óptima del capital a arriesgar por trade:

```
f* = (b × p - q) / b

Donde:
  p = probabilidad de ganar (Win Rate)
  q = 1 - p = probabilidad de perder
  b = ratio ganancia/pérdida promedio (avgWin / avgLoss)
```

### Half-Kelly vs Quarter-Kelly

| Tipo | Fórmula | Uso Recomendado |
|------|---------|-----------------|
| Full Kelly | f* | **NUNCA** en trading real (sobreestima edge) |
| Half-Kelly | f* / 2 | Estándar tras 12+ meses de live probado |
| Quarter-Kelly | f* / 4 | **Conservador para primeros 6 meses** |
| 1/6 Kelly | f* / 6 | Muy conservador, sistemas nuevos sin track record |

**Documento original decía**: "Half-Kelly es estándar institucional" — esto es correcto, pero para sistemas *ya validados en live*. Para sistemas nuevos (0 meses live), Quarter-Kelly es más prudente.

---

## 2. CÁLCULO DE SIZING

### Turtle Soup Fase 1

```python
# Parámetros del sistema
wr = 0.63          # Win Rate esperado post-optimización
avg_win = 0.012    # TP 1.2%
avg_loss = 0.010   # SL 1.0%
b = avg_win / avg_loss  # 1.2

# Full Kelly
f_star = (b * wr - (1 - wr)) / b
f_star = (1.2 * 0.63 - 0.37) / 1.2
f_star = (0.756 - 0.37) / 1.2
f_star = 0.322  # 32.2%

# Quarter-Kelly
quarter_kelly = f_star / 4 = 0.0805  # 8.05%

# Ajuste conservador adicional (margin of safety)
quarter_kelly_adjusted = 0.065  # 6.5% ($650 en $10,000)
```

### OB System

```python
# Parámetros del sistema
wr = 0.74          # Win Rate esperado
avg_win = 0.020    # TP 2×ATR (aprox 2%)
avg_loss = 0.010   # SL 1×ATR (aprox 1%)
b = 2.0

# Full Kelly
f_star = (2.0 * 0.74 - 0.26) / 2.0
f_star = (1.48 - 0.26) / 2.0
f_star = 0.61  # 61%

# Quarter-Kelly
quarter_kelly = 0.61 / 4 = 0.1525  # 15.25%

# Ajuste conservador (OB es más volátil)
quarter_kelly_adjusted = 0.060  # 6.0% ($600 en $10,000)
```

---

## 3. TABLA DE SIZING POR CAPITAL

### Quarter-Kelly (6 meses iniciales)

| Capital | Turtle (6.5%) | OB (6.0%) | Riesgo Simultáneo | Reserva |
|---------|---------------|-----------|-------------------|---------|
| $5,000  | $325          | $300      | ~$1,200 (24%)     | $3,800  |
| $10,000 | $650          | $600      | ~$2,450 (24.5%)   | $7,550  |
| $25,000 | $1,625        | $1,500    | ~$6,125 (24.5%)   | $18,875 |
| $50,000 | $3,250        | $3,000    | ~$12,250 (24.5%)  | $37,750 |

### Half-Kelly (mes 7+, tras validación live)

| Capital | Turtle (13%) | OB (12%) | Riesgo Simultáneo | Reserva |
|---------|--------------|----------|-------------------|---------|
| $5,000  | $650         | $600     | ~$2,450 (49%)     | $2,550  |
| $10,000 | $1,300       | $1,200   | ~$4,900 (49%)      | $5,100  |
| $25,000 | $3,250       | $3,000   | ~$12,250 (49%)     | $12,750 |

---

## 4. DRAWDOWN Y RECUPERACIÓN

### Matemática del Drawdown

| Pérdida Acumulada | Ganancia Necesaria para Recuperar |
|-------------------|-----------------------------------|
| 10%               | 11.1%                             |
| 20%               | 25.0%                             |
| 30%               | 42.9%                             |
| 50%               | 100.0%                            |

**Implicación**: Proteger el capital es más importante que maximizar ganancias. Un DD del 30% requiere casi +43% para recuperar — esto puede tomar meses.

### Circuit Breakers

```python
DRAWDOWN_CIRCUIT_BREAKERS = {
    'LEVEL_1_REDUCE': {
        'threshold': 0.05,        # DD > 5%
        'action': 'REDUCE_SIZE',   # Reducir sizing a 50%
        'notify': True,
    },
    'LEVEL_2_PAUSE': {
        'threshold': 0.10,        # DD > 10%
        'action': 'PAUSE_TRADING', # Detener nuevas entradas
        'notify': True,
        'review_required': True,
    },
    'LEVEL_3_STOP': {
        'threshold': 0.15,        # DD > 15%
        'action': 'STOP_TRADING',   # Cerrar todo, revisar sistema
        'notify': True,
        'human_approval_required': True,
    },
}
```

---

## 5. MONITOREO MENSUAL

### Métricas a Trackear

| Métrica | Frecuencia | Umbral de Alerta | Acción |
|---------|-----------|-----------------|--------|
| AUC OB  | Mensual   | < 0.65          | Retrain modelo |
| Sharpe  | Semanal   | < 70% del backtest | Revisar sizing |
| WR      | Semanal   | < 55% (Turtle) o < 65% (OB) | Revisar filtros |
| DD      | Diario    | > 5%             | Circuit breaker |
| Slippage| Por trade | > 0.3%          | Ajustar threshold |

### Feature Drift Detection

```python
# Si SHAP importance cambia > 20% en top 5 features → alerta
# Si AUC cae > 10% respecto al mes anterior → retrain
# Si correlación entre Turtle y OB sube > 0.50 → revisar diversificación
```

---

## 6. CHECKLIST PRE-LIVE

- [ ] WFA Turtle Fase 1: 4/4 ventanas aprobadas (WR > 50%, PF > 1.0)
- [ ] WFA OB Fase 1-2: 4/4 ventanas aprobadas (AUC > 0.65, PF > 2.0)
- [ ] Paper trading 2 semanas sin errores de ejecución
- [ ] Slippage medido: < 0.2% promedio por trade
- [ ] Latencia medida: < 500ms desde señal a orden
- [ ] Broker testeado: órdenes de mercado funcionan correctamente
- [ ] Drawdown monitoring configurado con alertas automáticas
- [ ] Quarter-Kelly sizing aplicado y documentado
- [ ] Circuit breakers configurados (5%, 10%, 15% DD)
- [ ] Plan de escalamiento de sizing definido (Q-K → H-K)

---

## 7. CONCLUSIÓN

**Quarter-Kelly es la decisión correcta** para los primeros 6 meses:
- Reduce el riesgo de ruin en un 50% vs Half-Kelly
- Permite validar el sistema en live sin exponer demasiado capital
- Facilita la transición gradual a Half-Kelly tras validación

**Recuerda**: El sizing correcto es más importante que el entry timing. Un sistema con WR 60% y sizing correcto superará a un sistema con WR 70% y sizing agresivo a largo plazo.
