# Cómo Ver Logs del Sistema de Paper Trading

## 📋 Opciones para Ver Logs

### Opción 1: Ver Logs en Tiempo Real (RECOMENDADO)

**Ejecutar el sistema con logging:**
```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_with_logging.js
```

Este sistema:
- ✅ Muestra logs en tiempo real en la terminal
- ✅ Guarda todos los eventos en archivo
- ✅ Crea archivo con fecha: `logs/trading_YYYY-MM-DD.log`

---

### Opción 2: Ver Logs Temporales (Sesión Actual)

Los sistemas que ejecuté anteriormente guardaron logs en archivos temporales:

```bash
# Ver logs del sistema actual
cat "C:\Users\gesti\AppData\Local\Temp\claude\C--Users-gesti-invest-criptoai-tradingview-mcp-jackson\b1c619c1-c802-480c-8ed5-db36b5da1ca9\tasks\bi7mcvson.output"
```

O desde Git Bash:
```bash
cat "/c/Users/gesti/AppData/Local/Temp/claude/C--Users-gesti-invest-criptoai-tradingview-mcp-jackson/b1c619c1-c802-480c-8ed5-db36b5da1ca9/tasks/bi7mcvson.output"
```

---

### Opción 3: Ver Logs Persistentes (Archivos)

**1. Directorio de Logs:**
```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting/logs
ls -la
```

**2. Ver un archivo de log específico:**
```bash
# Ver todo el log
cat logs/trading_2026-04-12.log

# Ver las últimas 50 líneas
tail -n 50 logs/trading_2026-04-12.log

# Ver en tiempo real (mientras el sistema corre)
tail -f logs/trading_2026-04-12.log
```

**3. Buscar eventos específicos:**
```bash
# Buscar todas las señales
grep "SEÑAL" logs/trading_2026-04-12.log

# Buscar todas las salidas
grep "SALIDA" logs/trading_2026-04-12.log

# Buscar trades con profit
grep "PnL:" logs/trading_2026-04-12.log
```

---

## 📁 Estructura de Logs

### Formato de Nombre de Archivo:
```
logs/trading_YYYY-MM-DD.log
```

Ejemplo: `logs/trading_2026-04-12.log`

### Formato de Cada Entrada de Log:
```
[2026-04-12T12:47:11.234Z] 🎯 [SEÑAL] LONG @ $65020.00 [VWAP] - Rebote VWAP
[2026-04-12T12:47:13.456Z] ✅ [SALIDA] LONG @ $65020.00 → $65050.00 (PnL: 0.05%) [VWAP] - Take Profit
[2026-04-12T12:47:15.789Z] 📊 [TICK 1/100] Precio BTC: $65030.00 | Trades: 20
```

---

## 🔍 Cómo Leer los Logs

### Ver Todo el Archivo:
```bash
# Windows CMD
type logs\trading_2026-04-12.log

# Git Bash / PowerShell
Get-Content logs/trading_2026-04-12.log
cat logs/trading_2026-04-12.log
```

### Ver las Últimas Líneas:
```bash
# Últimas 20 líneas
tail -n 20 logs/trading_2026-04-12.log

# Últimas 50 líneas
tail -n 50 logs/trading_2026-04-12.log
```

### Ver en Tiempo Real:
```bash
# Mientras el sistema está corriendo
tail -f logs/trading_2026-04-12.log
```

Presiona `Ctrl+C` para dejar de seguir el archivo en tiempo real.

---

## 📊 Tipos de Eventos en los Logs

| Evento | Formato | Ejemplo |
|--------|---------|---------|
| **Señal de Entrada** | `[SEÑAL]` | `🎯 [SEÑAL] LONG @ $65020.00 [VWAP]` |
| **Salida de Trade** | `[SALIDA]` | `✅ [SALIDA] LONG @ $65020.00 → $65050.00` |
| **Tick** | `[TICK]` | `📊 [TICK 1/100] Precio BTC: $65030.00` |
| **Estadísticas** | `[ESTADÍSTICAS]` | `📊 Win Rate: 100%` |
| **Inicio/Fin** | `[INICIO]`, `[FIN]` | `🚀 [INICIO] Iniciando Paper Trading` |

---

## 🛠️ Herramientas para Ver Logs

### Opción 1: Editor de Texto
- Abre el archivo con cualquier editor (VS Code, Notepad++, etc.)
- Ubicación: `C:\Users\gesti\invest_criptoai\tradingview-mcp-jackson\backtesting\logs\`

### Opción 2: Comandos de Terminal
```bash
# Ver en terminal
cat logs/trading_2026-04-12.log

# Ver con números de línea
cat -n logs/trading_2026-04-12.log

# Buscar patrón específico
grep "SEÑAL" logs/trading_2026-04-12.log

# Contar eventos
grep -c "SEÑAL" logs/trading_2026-04-12.log
```

### Opción 3: PowerShell
```powershell
# Ver archivo
Get-Content logs\trading_2026-04-12.log

# Ver últimas 20 líneas
Get-Content logs\trading_2026-04-12.log -Tail 20

# Buscar patrón
Select-String -Path logs\trading_2026-04-12.log -Pattern "SEÑAL"
```

---

## 📝 Ejemplo de Log Completo

```
[2026-04-12T12:47:11.123Z] ╔════════════════════════════════════════════════════════════════╗
[2026-04-12T12:47:11.124Z] ║     PAPER TRADING CON LOGGING PERSISTENTE                        ║
[2026-04-12T12:47:11.125Z] ║     Logs guardados en: C:\...\logs\trading_2026-04-12.log
[2026-04-12T12:47:11.126Z] ╚════════════════════════════════════════════════════════════════╝
[2026-04-12T12:47:11.127Z] 🚀 [INICIO] Iniciando Paper Trading con Logging Persistente
[2026-04-12T12:47:11.128Z] 📊 [DATOS] Generados 100 ticks con 20 trades
[2026-04-12T12:47:11.129Z] 🎯 [SEÑAL] LONG @ $64900.00 [TurtleSoup] - Falsa ruptura low
[2026-04-12T12:47:11.130Z] 🎯 [SEÑAL] LONG @ $65020.00 [VWAP] - Rebote VWAP
[2026-04-12T12:47:11.131Z] ✅ [SALIDA] LONG @ $64900.00 → $64950.00 (PnL: 0.08%) [TurtleSoup] - Take Profit
[2026-04-12T12:47:13.234Z] 📊 [TICK 1/100] Precio BTC: $64987.09 | Trades: 20
[2026-04-12T12:47:15.567Z] 📊 [TICK 2/100] Precio BTC: $64970.89 | Trades: 20
```

---

## 🎯 Resumen Rápido

| Tarea | Comando |
|------|---------|
| **Iniciar con logs** | `node trading_with_logging.js` |
| **Ver logs en tiempo real** | `tail -f logs/trading_*.log` |
| **Ver último log** | `cat logs/trading_$(date +%Y-%m-%d).log` |
| **Buscar señales** | `grep "SEÑAL" logs/trading_*.log` |
| **Ver estadísticas** | `grep "ESTADÍSTICAS" logs/trading_*.log` |

---

## 💡 Tips

1. **Los logs se crean automáticamente** cuando ejecutas `trading_with_logging.js`
2. **Un archivo por día** - Si ejecutas múltiples veces el mismo día, se añade al mismo archivo
3. **Timestamps en formato ISO** - Fácil de ordenar y buscar
4. **Todos los eventos importantes** están loggeados (señales, salidas, ticks, estadísticas)
5. **Puedes abrir los logs en cualquier editor** para análisis posterior

---

## 📂 Ubicación de Logs

**Ruta completa:**
```
C:\Users\gesti\invest_criptoai\tradingview-mcp-jackson\backtesting\logs\
```

**Archivos generados:**
- `trading_2026-04-12.log` - Logs de hoy
- `trading_2026-04-13.log` - Logs de mañana
- etc.
