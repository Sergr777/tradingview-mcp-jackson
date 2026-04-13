# 🐔 Monitor de Patrones Turtle Soup

## 📋 Descripción

Sistema automático de monitoreo que detecta patrones **Turtle Soup** en tiempo real usando TradingView MCP.

## 🎯 Qué Detecta

**Turtle Soup LONG** (señal de compra):
- Precio cerca de Low 20 (±0.2%)
- RSI < 30 (sobrevendido)
- Volumen confirmatorio

**Turtle Soup SHORT** (señal de venta):
- Precio cerca de High 20 (±0.2%)
- RSI > 70 (sobrecomprado)
- Volumen confirmatorio

## 🚀 Uso Rápido

### Opción 1: Monitor Simulado (Demo)

```bash
# Correr monitor con datos simulados
node monitor_turtle_soup.cjs
```

### Opción 2: Monitor con Datos Reales

```bash
# Correr monitor con TradingView MCP
node monitor_turtle_soup_real.cjs
```

### Opción 3: Análisis Único

```bash
# Calcular indicadores de fondo una vez
node calc_indicadores_fondo.cjs
```

## ⚙️ Configuración

Parámetros en `CONFIG`:

```javascript
{
  checkInterval: 60000,        // 60 segundos entre checks
  highLowThreshold: 0.002,     // 0.2% cercanía a High/Low 20
  rsiLongThreshold: 30,        // RSI < 30 para LONG
  rsiShortThreshold: 70,       // RSI > 70 para SHORT
  minVolume: 20                // Volumen mínimo confirmatorio
}
```

## 📊 Archivos Generados

### Log de Monitoreo
```
logs/week1/turtle_soup_real.log
```
Contiene:
- Timestamp de cada ciclo
- Datos del mercado (precio, RSI, indicadores)
- Patrones detectados
- Confianza de cada señal

### Registro de Señales
```
logs/week1/signals.json
```
Formato:
```json
{
  "id": 1,
  "date": "2026-04-09",
  "time": "15:30",
  "symbol": "BTCUSDT",
  "signal": "buy",
  "price": 71350,
  "rsi": 28.5,
  "turtleSoupSetup": true,
  "breakoutLevel": 70522.77,
  "outcome": "waiting",
  "notes": "Precio cerca de Low 20; RSI sobrevendido"
}
```

## 🔄 Flujo de Trabajo

1. **Iniciar monitor**:
   ```bash
   node monitor_turtle_soup_real.cjs
   ```

2. **Monitor corre en background**:
   - Verifica mercado cada 60 segundos
   - Calcula indicadores de fondo (VWAP, EMA 8, High 20, Low 20)
   - Detecta patrones Turtle Soup
   - Guarda señales automáticamente

3. **Revisar logs**:
   ```bash
   # Ver últimos 20 ciclos
   tail -20 logs/week1/turtle_soup_real.log

   # Contar señales detectadas
   cat logs/week1/signals.json | grep '"turtleSoupSetup": true' | wc -l
   ```

4. **Detener monitor**:
   - Presiona `Ctrl+C` para detener gracefulmente

## 📈 Criterios de Detección

### Patrón LONG (Compra)
```
✅ Precio ≤ Low 20 × 1.002
✅ RSI < 30
✅ Volumen > 20

Confianza base: 70%
+10% si volumen confirma
```

### Patrón SHORT (Venta)
```
✅ Precio ≥ High 20 × 0.998
✅ RSI > 70
✅ Volumen > 20

Confianza base: 70%
+10% si volumen confirma
```

### Patrón POTENCIAL (Monitorear)
```
⚠️ Precio cerca de extremo
⚠️ RSI NO confirma
⚠️ Confianza: 40%

→ Monitorear pero no operar aún
```

## 🔧 Troubleshooting

### "Monitor no detecta nada"
**Normal**: Los patrones Turtle Soup son relativamente raros. Puede que no aparezcan por horas.

### "RSI siempre null"
**Causa**: TradingView MCP no disponible o gráfico incorrecto.
**Solución**:
1. Verificar TradingView Desktop abierto
2. Verificar gráfico BTCUSDT 5m
3. Verificar RSI visible

### "High 20 / Low 20 no cambian"
**Causa**: Son las últimas 20 velas, cambian gradualmente.
**Normal**: Se actualizan cada 5 minutos con nueva vela.

## 📊 Integración con Data Collector

El monitor es **complementario** al `data_collector.js`:

| Script | Propósito | Frecuencia |
|--------|-----------|------------|
| **data_collector.js** | Captura datos baseline | Cada 10 min |
| **monitor_turtle_soup** | Detecta patrones específicos | Cada 60 min |

**Ambos pueden correr simultáneamente** sin conflicto.

## 🎯 Output Esperado

```
[2026-04-09T15:30:00.000Z] [INFO] ============================================================
[2026-04-09T15:30:00.000Z] [INFO] 🔍 CICLO DE MONITOREO - 9/4/2026, 3:30:00 PM
[2026-04-09T15:30:00.000Z] [INFO] ============================================================

[2026-04-09T15:30:01.000Z] [INFO] 📊 Obteniendo datos de TradingView...
[2026-04-09T15:30:02.000Z] [INFO] ✅ Datos obtenidos:
[2026-04-09T15:30:02.000Z] [INFO]    Precio: $71,884.98
[2026-04-09T15:30:02.000Z] [INFO]    RSI: 44.2
[2026-04-09T15:30:02.000Z] [INFO]    VWAP: $71,733.85
[2026-04-09T15:30:02.000Z] [INFO]    EMA 8: $71,958.80
[2026-04-09T15:30:02.000Z] [INFO]    High 20: $72,550.00
[2026-04-09T15:30:02.000Z] [INFO]    Low 20: $70,522.77
[2026-04-09T15:30:02.000Z] [INFO]    Volumen: 45.3

[2026-04-09T15:30:02.000Z] [INFO] 🐢 Buscando patrones Turtle Soup...
[2026-04-09T15:30:03.000Z] [INFO] ✅ Sin patrones detectados
[2026-04-09T15:30:03.000Z] [INFO] 📍 Precio en posición 45.2% del rango
```

## 🚀 Próximos Pasos

1. **Iniciar monitor**: `node monitor_turtle_soup_real.cjs`
2. **Dejar corriendo 24/7** durante las 2 semanas de captura
3. **Revisar logs diariamente** para verificar detecciones
4. **Fin de Semana 2**: Analizar señales detectadas con `analyze_two_weeks.js`

---

**Estado**: ✅ Ready para monitoreo continuo
**Duración**: 2 semanas (Semanas 1-2)
**Meta**: 20-40 patrones Turtle Soup documentados
