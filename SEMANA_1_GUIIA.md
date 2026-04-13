# 🚀 SEMANA 1 - Guía Rápida de Pilotaje

**Fecha:** 2026-04-09
**Objetivo:** Capturar datos baseline sin agentes
**Duración:** 7 días
**Meta:** Decidir qué agente implementar primero basado en datos

---

## 📋 Flujo de Trabajo Diario

### Paso 1: Iniciar TradingView (Por la mañana)

```
1. Abrir TradingView Desktop
2. Navegar a BTCUSDT 5m
3. Configurar indicadores:
   ✅ RSI (Visible)
   ✅ Volume (Visible)
4. Dejar gráfico abierto todo el día
```

### Paso 2: Iniciar Data Collector (Una vez al día)

```bash
# En terminal
cd C:\Users\gesti\invest_criptoai\tradingview-mcp-jackson
node data_collector.js
```

**El script:**
- Captura datos cada 10 minutos automáticamente
- Guarda en `logs/week1/data_raw.json`
- Crea log en `logs/week1/collection.log`

**NO detener el script** - déjalo correr todo el día

### Paso 3: Registro Manual de Turtle Soup (Cuando aparezca)

**Si detectas un patrón Turtle Soup visualmente:**

```javascript
// En la terminal donde corre data_collector.js

// Para Turtle Soup LONG (compra)
recordTurtleSoup("long", 0.75, "Ruptura falsa en 71337, volumen alto")

// Para Turtle Soup SHORT (venta)
recordTurtleSoup("short", 0.80, "Ruptura falsa en 72850, RSI sobrecomprado")
```

**Parámetros:**
- `"long"` o `"short"` - Tipo de patrón
- `0.75` - Tu confianza (0.0 a 1.0)
- `"notas"` - Descripción del contexto

### Paso 4: Revisión Diaria (5 minutos)

```bash
# Verificar que el script está capturando datos
cat logs/week1/collection.log | tail -20

# Contar data points capturados
node -e "const data=require('./logs/week1/data_raw.json'); console.log('Total:', data.length)"
```

---

## 📊 Fin de Semana 1: Análisis

### Ejecutar Análisis

```bash
node analyze_week1.js
```

**El script generará:**
1. Análisis completo de estadísticas
2. Identificación de patrones Turtle Soup
3. Análisis de indicadores (RSI, Volume)
4. Recomendaciones sobre qué agente implementar

**Output:**
- Reporte en pantalla
- Archivo: `logs/week1/analysis.md`

---

## 🎯 Criterios de Decisión (Fin de Semana 1)

### Implementar MNEMO (Memo) SI:

- ✅ **≥10 patrones Turtle Soup** detectados
- ✅ Tasa éxito manual <60%
- ✅ Patrones son claramente identificables

**Valor esperado:** Detección automática +15-20% tasa éxito

---

### Esperar Más Datos SI:

- ❌ **<5 patrones Turtle Soup** detectados
- ❌ Cobertura de datos <50%
- ❌ Calidad de datos pobre

**Acción:** Continuar Semana 2 con más captura

---

## 📁 Archivos Generados

```
tradingview-mcp-jackson/
├── data_collector.js          # Script de captura (ejecutar)
├── analyze_week1.js           # Script de análisis (ejecutar al final)
├── logs/
│   └── week1/
│       ├── data_raw.json      # Datos capturados (auto-generado)
│       ├── collection.log     # Log de captura (auto-generado)
│       ├── signals.json       # Registro de eventos
│       └── analysis.md        # Reporte análisis (auto-generado)
```

---

## 🔧 Troubleshooting

### "data_collector.js no captura datos"

**Problema:** TradingView MCP no está conectado

**Solución:**
1. Verificar que TradingView Desktop esté abierto
2. Verificar que estás en el gráfico BTCUSDT 5m
3. Reiniciar data_collector.js

### "Muchos data points con precio null"

**Problema:** Herramientas MCP no disponibles

**Solución:**
1. Esto es normal en la fase de template
2. Los datos manuales (recordTurtleSoup) sí se guardan
3. En implementación real se usarán MCP tools

### "No veo patrones Turtle Soup"

**Problema:** Puede ser normal, dependen de volatilidad

**Solución:**
1. Paciencia - pueden aparecer en cualquier momento
2. Monitorear también rupturas de high20/low20
3. Revisar gráficos históricos para familiarizarte

---

## 📈 Métricas a Seguir

### Diariamente:

- Data points capturados: Meta = 100-150/semana
- Patrones Turtle Soup: Meta = 10-20/semana
- Cobertura RSI/Volume: Meta = >80%

### Fin de Semana 1:

- Tasa éxito manual: Meta = 40-50%
- Frecuencia Turtle Soup: Meta = 10+ patrones
- Calidad de datos: Meta = >70% completitud

---

## 🎓 Formato de Datos

### Data Point Automático:

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
  "turtle_soup_detected": false
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
  "notes": "Ruptura falsa en 71337, rechazo rápido, volumen alto"
}
```

---

## 🚀 Comandos Rápidos

```bash
# Iniciar captura
node data_collector.js

# Registrar Turtle Soup manual (durante captura)
recordTurtleSoup("long", 0.75, "notas")

# Ver data points capturados
node -e "const d=require('./logs/week1/data_raw.json'); console.log(d.length)"

# Ejecutar análisis fin de semana
node analyze_week1.js

# Ver reporte generado
cat logs/week1/analysis.md
```

---

## ✅ Checklist Diario

- [ ] TradingView abierto en BTCUSDT 5m
- [ ] RSI + Volume visibles
- [ ] data_collector.js corriendo
- [ ] Revisar log de captura (mañana/tarde/noche)
- [ ] Registrar manualmente si aparece Turtle Soup

---

## 📞 Soporte

**Documentación relacionada:**
- `PLAN_ITERATIVO_PILOTAJE.md` - Plan detallado 4 semanas
- `INTEGRATION_TRADINGVIEW_MCP_AGENTS.md` - Arquitectura completa
- `SETUP_OPTIMIZADO.md` - Configuración TradingView 2 indicadores

---

**Estado:** ✅ Ready para iniciar Semana 1
**Próximo paso:** Ejecutar `node data_collector.js`
