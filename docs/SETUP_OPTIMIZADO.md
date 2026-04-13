# 📊 SETUP OPTIMIZADO - 2 Indicadores Visibles

**Fecha:** 2026-04-09
**Cuenta TradingView:** Limitada a 2 indicadores visibles
**Estrategia:** Turtle Soup CTR + Scalping VWAP

---

## 🎯 Configuración Actual

### Indicadores Visibles (En Gráfico)

```
✅ 1. RSI (Relative Strength Index)
   - Entity ID: p33wpn
   - Propósito: Identificar sobrecompra/sobreventa
   - Uso Turtle Soup: RSI < 30 (compra), RSI > 70 (venta)

✅ 2. Volume
   - Entity ID: DRYMMg
   - Propósito: Confirmar rupturas y fuerza de movimientos
   - Uso Turtle Soup: Volumen altos en rupturas falsas
```

### Indicadores en Background (Calculados desde OHLCV)

```javascript
// ✅ VWAP (Volume Weighted Average Price)
function calcVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.vol;
    cumVol += c.vol;
  }
  return cumVol === 0 ? candles[candles.length - 1].close : cumTPV / cumVol;
}

// ✅ EMA 8 (Exponential Moving Average 8 períodos)
function calcEMA(closes, period = 8) {
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// ✅ High/Low 20 velas (para Turtle Soup)
function getHighLow(candles, period = 20) {
  const recent = candles.slice(-period);
  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));
  return { high, low };
}
```

---

## 📖 Cómo Usar Este Setup

### Opción 1: TradingView MCP (Automático)

```bash
# Usar MCP tools para obtener datos
mcp__tradingview__data_get_ohlcv()        # Velas para calcular indicadores
mcp__tradingview__data_get_study_values()  # RSI y Volume visibles
mcp__tradingview__quote_get()              # Precio actual
```

### Opción 2: Cálculo Manual en TradingView

**VWAP Manual:**
```
1. Dibujar rectángulo vertical sobre últimas 30 velas
2. Ver estadísticas en panel lateral
3. VWAP aparece automáticamente
```

**EMA 8 Manual:**
```
1. Herramientas → Dibujar → Línea horizontal
2. Dibujar niveles en el gráfico
3. Usar escala para estimar
```

**High/Low 20 velas Manual:**
```
1. Herramientas → Dibujar → Rectángulo
2. Seleccionar últimas 20 velas
3. Ver high/low en estadísticas
```

---

## 🎯 Estrategia Turtle Soup CTR con Setup Limitado

### Señales de Compra (Turtle Soup Long)

```
✅ Condiciones:
1. RSI < 30 (visible en gráfico)
2. Precio rompe mínimo de 20 velas (calcular en background)
3. Rechazo rápido en 1-3 velas (visible en volumen)
4. Volumen alto en ruptura (visible en gráfico)

✅ Confirmación:
- Precio cierra por encima del mínimo roto
- Volumen disminuye después del rechazo
```

### Señales de Venta (Turtle Soup Short)

```
✅ Condiciones:
1. RSI > 70 (visible en gráfico)
2. Precio rompe máximo de 20 velas (calcular en background)
3. Rechazo rápido en 1-3 velas (visible en volumen)
4. Volumen alto en ruptura (visible en gráfico)

✅ Confirmación:
- Precio cierra por debajo del máximo roto
- Volumen disminuye después del rechazo
```

---

## 🔍 Monitoreo Diario - Rutina Optimizada

### Cada 10 minutos (2 min)

```javascript
// 1. Verificar RSI (visible)
data_get_study_values()
// Output: { RSI: 66.59 }

// 2. Verificar Volume (visible)
// Output: { Volume: 199 }

// 3. Obtener precio actual
quote_get()
// Output: { last: 72096.71 }

// 4. Obtener últimas 20 velas (background)
data_get_ohlcv({ count: 20 })
// Calcular high/low en background

// 5. Analizar setup
if (RSI < 30 && price < low20) {
  signal = "POTENTIAL TURTLE SOUP LONG";
}
```

---

## 📊 Cálculo de Indicadores Background

### Ejemplo Práctico

```javascript
// Obtener velas recientes
const candles = await data_get_ohlcv({ count: 30 });

// Calcular VWAP (background)
const vwap = calcVWAP(candles);
// Resultado: 71850.25

// Calcular EMA 8 (background)
const closes = candles.map(c => c.close);
const ema8 = calcEMA(closes, 8);
// Resultado: 71900.12

// Calcular High/Low 20 (background)
const { high, low } = getHighLow(candles, 20);
// Resultado: { high: 72358, low: 70522 }

// Analizar señal
const last = candles[candles.length - 1];
const signal = last > vwap && last > ema8 ? "ALCISTA" : "BAJISTA";
```

---

## 🎨 Ventajas de Setup Limitado

### ✅ Menos Clutter Visual
- Gráfico más limpio
- Menos distracciones
- Enfoque en precio y volumen

### ✅ Más Rápido
- Solo 2 indicadores visibles que cargar
- TradingView más fluido
- Menos latencia

### ✅ Mismo Poder de Análisis
- Todos los indicadores disponibles
- Calculados en background
- Sin pérdida de información

### ✅ Flexibilidad
- Cambiar indicadores visibles según estrategia
- Mantener otros en background
- Adaptarse a mercado

---

## 🔄 Alternar Indicadores Visibles

### Para Estrategia Diferente

**Scalping VWAP:**
```
1. Mantener: Volume
2. Cambiar: RSI → EMA 8
```

**Swing Trading:**
```
1. Mantener: Volume
2. Cambiar: RSI → MACD
```

**Trend Following:**
```
1. Mantener: RSI
2. Cambiar: Volume → EMA 200
```

---

## 📝 Logs y Registro

### Formato Optimizado

```json
{
  "timestamp": "2026-04-09T14:30:00Z",
  "price": 72096.71,
  "rsi_visible": 66.59,
  "volume_visible": 199,
  "vwap_background": 71850.25,
  "ema8_background": 71900.12,
  "high20_background": 72358,
  "low20_background": 70522,
  "signal": "flat",
  "turtleSoupSetup": false,
  "action": "wait"
}
```

---

## 🎯 Próximos Pasos

1. ✅ **SETUP COMPLETADO** - RSI + Volume visibles
2. ⏳ **MONITOREAR** - Observar señales durante 2 días
3. ⏳ **DOCUMENTAR** - Registrar setups Turtle Soup
4. ⏳ **ANALIZAR** - Calcular tasa de éxito
5. ⏳ **OPTIMIZAR** - Ajustar parámetros si es necesario

---

## 💡 Tips para Máximo Provecho

### Uso Eficiente de TradingView MCP

```bash
# Obtener múltiples datos en una llamada
data_get_ohlcv({ summary: true })  # Stats rápidas

# Ver solo valores de estudio (liviano)
data_get_study_values()             # Solo RSI + Volume

# Capturar screenshot para análisis posterior
capture_screenshot()                # Guardar referencia
```

### Cálculo Rápido Manual

```
High 20 velas: 
1. Rectángulo sobre últimas 20 velas
2. Ver "High" en estadísticas

Low 20 velas:
1. Ver "Low" en mismas estadísticas

VWAP 30 velas:
1. Rectángulo sobre últimas 30 velas
2. Ver "VWAP" en estadísticas
```

---

## 📈 Métricas a Seguir

### Con Setup Optimizado

| Métrica | Cómo Obtener | Frecuencia |
|---------|--------------|-----------|
| **RSI** | `data_get_study_values()` | Cada 5 min |
| **Volume** | `data_get_study_values()` | Cada 5 min |
| **VWAP** | `calcVWAP(candles)` | Cada 10 min |
| **EMA 8** | `calcEMA(closes)` | Cada 10 min |
| **High/Low 20** | `getHighLow(candles)` | Cada hora |

---

**Setup optimizado listo para pilotaje de 4 semanas** 🚀

¿Necesitas que calcule los indicadores background ahora con datos actuales?
