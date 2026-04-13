# 🚀 SEMANAS 1-2 - Guía Completa de Pilotaje

**Fecha:** 2026-04-09
**Duración:** 2 semanas (14 días)
**Objetivo:** Capturar 200-300 data points baseline SIN agentes
**Meta:** Decidir qué agente implementar basado en datos sólidos

---

## 📋 Por Qué 2 Semanas en Vez de 1

### Ventajas Clave:

✅ **Mayor robustez estadística**
- 200-300 data points vs 100-150
- Más confiable para decisiones de implementación
- Menor riesgo de outliers o falsos positivos

✅ **Mejor detección de patrones**
- 2 semanas capturan diferentes regímenes de mercado
- Volatilidad alta y baja
- Tendencias alcistas y bajistas
- 20-40 patrones Turtle Soup esperados

✅ **Análisis más completo**
- Distribución temporal de patrones
- Correlaciones más sólidas
- Identificación de mejores horarios para operar

✅ **Mayor confianza en decisiones**
- Si aparece 20+ veces, es un patrón real
- Si aparece 5 veces, puede ser ruido aleatorio
- Decisiones de implementación más confiables

---

## 🔄 Flujo de Trabajo Diario (Semanas 1-2)

### Mañana (Inicio del día)

```
1. Abrir TradingView Desktop
2. Navegar a BTCUSDT 5m
3. Verificar que RSI + Volume estén visibles
4. Minimizar TradingView (no cerrar)
```

### Iniciar Data Collector (UNA VEZ por día)

```bash
# Terminal
cd C:\Users\gesti\invest_criptoai\tradingview-mcp-jackson
node data_collector.js
```

**El script automáticamente:**
- Captura datos cada 10 minutos
- Guarda en `logs/week1/data_raw.json` o `logs/week2/data_raw.json`
- Crea log en `logs/week1/collection.log` o `logs/week2/collection.log`
- Corre 24/7 sin intervención

**NO detener el script** - déjalo corriendo todo el día

### Durante el Día (Monitoreo)

**Cuando detectes un patrón Turtle Soup visualmente:**

```javascript
// En la terminal donde corre data_collector.js

// Turtle Soup LONG (compra)
recordTurtleSoup("long", 0.75, "Ruptura falsa en 71337, rechazo rápido, volumen alto")

// Turtle Soup SHORT (venta)
recordTurtleSoup("short", 0.80, "Ruptura falsa en 72850, RSI sobrecomprado, volumen decreciendo")
```

**Parámetros:**
- `"long"` o `"short"` - Tipo de patrón
- `0.75` - Tu confianza (0.0 a 1.0)
- `"notas"` - Descripción del contexto

### Noche (Revisión)

```bash
# Verificar captura del día
cat logs/week1/collection.log | tail -20

# Contar data points
node -e "const d=require('./logs/week1/data_raw.json'); console.log('Total:', d.length)"
```

---

## 📊 Fin de Semana 2: Análisis Completo

### Ejecutar Análisis de 2 Semanas

```bash
node analyze_two_weeks.js
```

**El script generará:**
1. ✅ Estadísticas básicas de 2 semanas
2. ✅ Análisis de patrones Turtle Soup (frecuencia, distribución)
3. ✅ Análisis de indicadores (RSI, Volume)
4. ✅ Análisis de resultados de acciones (si las hubo)
5. ✅ **Recomendación: ¿Implementar o no?**
6. ✅ Reporte completo en `logs/week2/analysis_two_weeks.md`

---

## 🎯 Criterios de Decisión (Fin de Semana 2)

### ESCENARIO 1: Implementar MNEMO ✅

**Condiciones:**
- ✅ ≥20 patrones Turtle Soup en 2 semanas
- ✅ Tasa éxito manual <65% (si hay operaciones)
- ✅ Cobertura datos >70%

**Decisión:**
```
→ Implementar MNEMO (Memo) en Semana 3
→ Detección automática de patrones
→ Búsqueda de patrones similares históricos
→ Meta: Mejora ≥15% en tasa éxito
```

---

### ESCENARIO 2: Considerar MNEMO con Cautela ⚠️

**Condiciones:**
- ⚠️ 10-19 patrones Turtle Soup en 2 semanas
- ⚠️ Tasa éxito manual 50-65%
- ⚠️ Cobertura datos >70%

**Decisión:**
```
→ Considerar MNEMO pero con cautela
→ Solo si tasa éxito <60%
→ Verificar mejora clara post-implementación
→ Prepararse para descartar si no hay valor
```

---

### ESCENARIO 3: Esperar o Cambiar Estrategia ❌

**Condiciones:**
- ❌ <10 patrones Turtle Soup en 2 semanas
- ❌ Tasa éxito manual >65% (ya es buena)
- ❌ O cobertura datos <70%

**Decisión:**
```
→ OPCIÓN A: Esperar 2 semanas más de datos
→ OPCIÓN B: Cambiar timeframe (5m → 15m)
→ OPCIÓN C: Cambiar symbol (BTC → ETH/SOL)
→ OPCIÓN D: Cambiar estrategia (no Turtle Soup)
```

---

## 📁 Estructura de Archivos

```
tradingview-mcp-jackson/
├── data_collector.js           # Script de captura (ejecutar 24/7)
├── analyze_two_weeks.js        # Script de análisis (ejecutar fin Semana 2)
├── analyze_week1.js            # Script análisis Semana 1 (opcional)
├── logs/
│   ├── week1/
│   │   ├── data_raw.json      # Datos Semana 1
│   │   ├── collection.log     # Log Semana 1
│   │   ├── signals.json       # Registro eventos Semana 1
│   │   └── analysis.md        # Análisis Semana 1 (opcional)
│   └── week2/
│       ├── data_raw.json      # Datos Semana 2
│       ├── collection.log     # Log Semana 2
│       ├── signals.json       # Registro eventos Semana 2
│       └── analysis_two_weeks.md  # Análisis completo 2 semanas
```

---

## 📈 Métricas a Seguir

### Diariamente:

- Data points capturados: Meta = 20-30/día
- Calidad de datos: Meta = >80% cobertura RSI/Volume
- Turtle Soup registrados: Meta = 1-3/día

### Semanalmente:

- **Fin Semana 1:** Revisión rápida de progreso
- **Fin Semana 2:** Análisis completo y decisión

### Objetivos 2 Semanas:

- Total data points: 200-300 ✅
- Turtle Soup patrones: 20-40 ✅
- Cobertura RSI/Volume: >80% ✅
- Tasa éxito baseline: 40-60% ✅

---

## 🚀 Comandos Rápidos

### Iniciar Captura:

```bash
cd C:\Users\gesti\invest_criptoai\tradingview-mcp-jackson
node data_collector.js
```

### Registrar Turtle Soup Manual:

```javascript
// Durante captura
recordTurtleSoup("long", 0.75, "notas del contexto")
recordTurtleSoup("short", 0.80, "notas del contexto")
```

### Verificar Progreso:

```bash
# Data points capturados
node -e "const d=require('./logs/week1/data_raw.json'); console.log('Semana 1:', d.length)"

# Últimos registros
cat logs/week1/collection.log | tail -10
```

### Análisis Fin de Semana 2:

```bash
node analyze_two_weeks.js
cat logs/week2/analysis_two_weeks.md
```

---

## ✅ Checklist Diario (Semanas 1-2)

- [ ] TradingView Desktop abierto
- [ ] Gráfico BTCUSDT 5m visible
- [ ] RSI + Volume configurados y visibles
- [ ] data_collector.js corriendo
- [ ] Revisión rápida de log (mañana/tarde/noche)

### Checklist Semanal

- [ ] Revisión de data points capturados
- [ ] Cálculo de cobertura de datos
- [ ] Documentar observaciones cualitativas
- [ ] Ajustar configuración si es necesario

---

## 🔧 Troubleshooting

### "data_collector.js no captura nada"

**Causa:** TradingView MCP no disponible o connection issues

**Solución:**
1. Verificar que TradingView Desktop esté abierto
2. Verificar que estás en gráfico correcto
3. Script seguirá corriendo pero capturará datos manuales (recordTurtleSoup)

### "Pocos patrones Turtle Soup detectados"

**Causa:** Puede ser normal, dependen de volatilidad

**Solución:**
1. Paciencia - 2 semanas dan oportunidad para diferentes regímenes
2. Monitorear rupturas de high20/low20 también
3. Revisar gráficos históricos para familiarizarse con patrón

### "Archivo data_raw.json vacío"

**Causa:** Script recién iniciado, necesita tiempo

**Solución:**
1. Esperar 10-20 minutos para primer data point
2. Verificar que script esté corriendo
3. Revisar log de errores

---

## 📊 Formato de Datos

### Data Point Automático (cada 10 min):

```json
{
  "timestamp": "2026-04-09T14:30:00Z",
  "symbol": "BTCUSDT",
  "timeframe": "5m",
  "price": 72096.71,
  "indicators_visible": {
    "rsi": 66.59,
    "volume": 199
  },
  "indicators_background": {
    "vwap": 71850.25,
    "ema8": 71900.12,
    "high20": 72358,
    "low20": 70522
  },
  "turtle_soup_detected": false,
  "notes": ""
}
```

### Data Point Manual (Turtle Soup):

```json
{
  "timestamp": "2026-04-09T15:45:00Z",
  "symbol": "BTCUSDT",
  "turtle_soup_detected": true,
  "turtle_soup_type": "long",
  "manual_signal": "buy",
  "confidence": 0.75,
  "notes": "Ruptura falsa en 71337, rechazo rápido en 1-3 velas, volumen alto, RSI 28.5"
}
```

---

## 🎓 Resultados Esperados

### Si TODO va BIEN:

**Semana 1-2:**
- ✅ 200-300 data points capturados
- ✅ 20-40 patrones Turtle Soup documentados
- ✅ Cobertura >80% en indicadores
- ✅ Log completo de 2 semanas

**Fin de Semana 2:**
- ✅ Análisis completo ejecutado
- ✅ Recomendación clara: implementar o no
- ✅ Plan definido para Semana 3-4
- ✅ Decisión basada en datos, no en suposiciones

---

## 🚀 Próximo Paso

**HOY (Día 1 de Semana 1):**

1. ✅ Documentación creada
2. ⏳ **Iniciar data_collector.js**
3. ⏳ **Abrir TradingView en BTCUSDT 5m**
4. ⏳ **Configurar RSI + Volume**
5. ⏳ **Dejar corriendo 24/7**

**Fin de Semana 2 (Día 14):**

1. ⏳ Ejecutar `node analyze_two_weeks.js`
2. ⏳ Revisar reporte generado
3. ⏳ Tomar decisión: ¿Implementar MNEMO o no?
4. ⏳ Planificar Semana 3-4

---

**Estado:** ✅ Ready para iniciar 2 semanas de captura de datos
**Enfoque:** Conservador, data-driven, sin implementación prematura
**Meta:** Decisiones informadas por datos sólidos

---

**¿Listo para comenzar las 2 semanas de captura?**
