# Cómo Dejar el Paper Trading Activo Todo el Día

## 🚀 Sistema Iniciado y Corriendo

✅ **Estado:** Activo y funcionando
📁 **Log:** `logs/trading_infinite_2026-04-12.log`
⏰ **Duración:** Todo el día (sin límite)
🔄 **Actualización:** Cada 2 segundos

---

## 📊 Características del Sistema Infinito:

### **Ejecución Continua:**
- ✅ **Sin límite de ticks** - corre indefinidamente
- ✅ **Generación continua de datos** - precio BTC simulado
- ✅ **Señales periódicas** - cada 15-37 ticks
- ✅ **Trades automáticos** - entradas y salidas
- ✅ **Logging persistente** - todo se guarda en archivo

### **Sistemas Activos:**
- **TurtleSoup** - Falsas rupturas (cada ~15 ticks)
- **VWAP** - Rebotes en VWAP (cada ~31 ticks)
- **EMA+RSI** - Momentum con cruce (cada ~37 ticks)

### **Logging:**
- 📁 **Archivo:** `logs/trading_infinite_2026-04-12.log`
- 📊 **Eventos registrados:**
  - Señales de entrada
  - Salidas de trades
  - Cada tick (precio)
  - Estadísticas (cada 10 ticks)
  - Resúmenes (cada 100 ticks)

---

## 📈 Monitoreo del Sistema

### **Opción 1: Ver el Log en Tiempo Real**

```bash
# Seguir el log mientras se actualiza
tail -f "C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting/logs/trading_infinite_2026-04-12.log"
```

**Presiona `Ctrl+C` para dejar de seguir el log** (el sistema seguirá corriendo)

### **Opción 2: Ver Estadísticas Periódicamente**

El sistema muestra estadísticas en pantalla cada 10 ticks:
- Número de tick actual
- Precio BTC actual
- Cantidad de trades
- Win Rate
- PnL total
- Trades recientes
- Posiciones abiertas

### **Opción 3: Ver el Log Completo al Final del Día**

```bash
# Ver todo el log del día
cat "C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting/logs/trading_infinite_2026-04-12.log"
```

---

## 🛑 Cómo Detener el Sistema

### **Opción 1: Desde la Terminal**

Si la terminal donde se ejecutó el comando está abierta:
```
Presiona Ctrl+C
```

El sistema:
1. Detendrá la ejecución
2. Guardará un resumen final en el log
3. Mostrará estadísticas completas

### **Opción 2: Detener por Proceso**

```bash
# Encontrar el proceso
tasklist | findstr node

# Detener (reemplazar PID con el número real)
taskkill /F /PID 12345
```

---

## 📊 Archivos de Log

### **Formato de Nombre:**
```
logs/trading_infinite_YYYY-MM-DD.log
```

**Ejemplo actual:** `logs/trading_infinite_2026-04-12.log`

### **Mañana:**
Si dejas el sistema corriendo hasta mañana, se creará automáticamente un nuevo archivo:
```
logs/trading_infinite_2026-04-13.log
```

---

## 🔍 Análisis de Logs

### **Ver todas las señales del día:**
```bash
grep "SEÑAL" logs/trading_infinite_2026-04-12.log | wc -l
```

### **Ver todas las salidas:**
```bash
grep "SALIDA" logs/trading_infinite_2026-04-12.log
```

### **Ver trades ganadores:**
```bash
grep "💰" logs/trading_infinite_2026-04-12.log
```

### **Ver trades perdedores:**
```bash
grep "📉" logs/trading_infinite_2026-04-12.log
```

### **Ver resúmenes (cada 100 ticks):**
```bash
grep "RESUMEN" logs/trading_infinite_2026-04-12.log
```

---

## 💾 Uso de Disco

### **Tamaño estimado del log:**
- **Por tick:** ~200 bytes
- **Por hora:** ~360 KB (1800 ticks/hora)
- **Por día (24h):** ~8.6 MB

**El sistema mantendrá automáticamente solo los últimos 100 ticks en memoria**, pero el archivo de log crecerá continuamente.

### **Limpieza de logs antiguos:**
```bash
# Borrar logs de más de 7 días
find logs/ -name "trading_infinite_*.log" -mtime +7 -delete
```

---

## 🎯 Verificación de Funcionamiento

### **Señales de que el sistema está funcionando:**

1. **Terminal activa** - No muestra "Detenido"
2. **Archivo de log creciendo** - Tamaño aumenta
3. **Nuevos trades aparecen** - Cada 15-37 ticks
4. **Tick counter aumenta** - Se actualiza cada 2 segundos

### **Verificar proceso:**
```bash
# Verificar que node está corriendo
tasklist | findstr node.exe

# Ver tamaño del log
dir logs\trading_infinite_*.log
```

---

## 🔄 Reinicio Automático

Si el sistema se detiene por alguna razón, puedes reiniciarlo:

```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_infinite.js
```

**Nota:** Cada vez que reinicies, se creará un nuevo archivo de log con el timestamp actual.

---

## 📊 Ejemplo de Salida del Sistema

```
╔════════════════════════════════════════════════════════════════╗
║     📈 PAPER TRADING INFINITO - EJECUCIÓN CONTINUA               ║
╚════════════════════════════════════════════════════════════════╝

📊 Tick 10 | Precio BTC: $64986.00 | Trades: 0
⏰ Tiempo: 0h 11m 53s
📁 Log: logs\trading_infinite_2026-04-12.log

📊 ESTADÍSTICAS:
   Tick Actual:          10
   Tiempo Ejecución:    0h 11m 53s
   Trades Totales:      0
   Trades Cerrados:    0

📋 No trades ejecutados aún...

⏳  Ejecutando continuamente (todo el día)
    Presiona Ctrl+C para detener
```

---

## 🎯 Recomendaciones

### **Para Monitoreo Continuo:**
1. Abre una segunda terminal
2. Ejecuta: `tail -f logs/trading_infinite_2026-04-12.log`
3. Deja esa terminal abierta todo el día
4. Revisa periódicamente

### **Para Ahorrar Recursos:**
- El sistema usa muy poca CPU
- Memoria mínima (solo últimos 100 ticks en RAM)
- Puedes minimizar la terminal

### **Para Análisis Post-Día:**
1. Detener el sistema (Ctrl+C)
2. Abrir el log en tu editor favorito
3. Buscar patrones específicos
4. Exportar a Excel/CSV si lo deseas

---

## ⚠️ Notas Importantes

- **El sistema NO se detiene automáticamente** - corre hasta que lo detengas
- **Los logs crecen todo el día** - monitorea el espacio en disco
- **Los trades son simulados** - NO es dinero real
- **Conexión a TradingView** - NO necesaria (usa datos simulados)
- **Reinicio manual** - Si se detiene, debes reiniciarlo manualmente

---

## 🎉 ¡Listo!

El sistema de paper trading está corriendo **continuamente todo el día**:

✅ Generación continua de datos
✅ Señales de trading automáticas
✅ Logging persistente completo
✅ Actualización cada 2 segundos
✅ Sin límite de tiempo

**Puedes dejarlo corriendo y revisar los logs cuando quieras.**
