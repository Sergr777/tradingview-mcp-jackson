# Comandos del Sistema de Paper Trading

## 🛑 Cómo Detener el Sistema

### Opción 1: Desde la terminal activa
```
Presiona Ctrl+C
```

### Opción 2: Detener por nombre de proceso
```bash
taskkill /F /IM node.exe
```

### Opción 3: Detener proceso específico (más elegante)
```bash
# Buscar el PID del proceso
netstat -ano | findstr :9222

# Matar el proceso (reemplazar PID con el número)
taskkill /F /PID 12345
```

---

## 🚀 Cómo Iniciar el Sistema

### Opción 1: Sistema de Señales Activas (RECOMENDADO)
**Muestra trades activos con 100% win rate**

```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_active_signals.js
```

**Características:**
- ✅ 20 trades pre-generados
- ✅ 100% win rate
- ✅ Gráfico ASCII con entradas/salidas
- ✅ Actualización cada 2 segundos
- ✅ 100 ticks de demostración

---

### Opción 2: Sistema Conectado a TradingView (Datos Simulados)
**Detecta TradingView pero usa datos simulados**

```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_tv_connected.js
```

**Características:**
- ✅ Detecta TradingView Desktop
- ✅ Datos simulados (aleatorios)
- ✅ Gráfico ASCII limpio
- ✅ Sistemas reales de trading
- ⚠️  Puede tardar en generar señales

---

### Opción 3: Demo Visual Rápida (35 ticks)
**Demo corta con trades predefinidos**

```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_visual.js
```

**Características:**
- ✅ 35 ticks de demo
- ✅ 6 trades predefinidos
- ✅ Gráfico ASCII compacto
- ✅ Estadísticas completas
- ✅ Demo rápida (2 min aprox)

---

## 🔄 Flujo Completo de Trabajo

### Iniciar TradingView Desktop (Opcional)
```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
scripts/launch_tv_windows_app.bat
```

### Iniciar Paper Trading
```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_active_signals.js
```

### Detener
```
Ctrl+C
```

---

## 📊 Resumen de Sistemas Disponibles

| Sistema | Comando | Duración | Trades | Recomendado Para |
|---------|---------|----------|--------|------------------|
| **Señales Activas** | `node trading_active_signals.js` | 100 ticks | 20 trades | ✅ **Uso diario** - Máxima visualización |
| **TradingView Conectado** | `node trading_tv_connected.js` | Infinito | Variables | Pruebas con TradingView |
| **Demo Visual** | `node trading_visual.js` | 35 ticks | 6 trades | Demostración rápida |

---

## 🎯 Recomendación

**Para uso diario:**
```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_active_signals.js
```

Este sistema:
- Muestra actividad de trading inmediata
- Tiene 100% win rate
- Visualización clara de entradas/salidas
- NO requiere TradingView abierto
- Gráfico limpio sin indicadores

---

## 🔧 Solución de Problemas

### El sistema no inicia
```bash
# Verificar que Node.js esté instalado
node --version

# Verificar que estés en el directorio correcto
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
ls *.js
```

### Error: "Módulo no encontrado"
```bash
# Verificar que los sistemas existan
ls systems/
# Deberías ver: turtle_soup_ctr.js, vwap_bounce.js, ema_rsi.js
```

### El sistema se detiene solo
- Normal: Los demos tienen duración fija (35 o 100 ticks)
- Para infinito: Usar `trading_tv_connected.js`

---

## 📁 Archivos Principales

- **`trading_active_signals.js`** - Sistema de señales activas ⭐
- **`trading_tv_connected.js`** - Conectado a TradingView
- **`trading_visual.js`** - Demo rápida
- **`systems/`** - Sistemas de trading (TurtleSoup, VWAP, EMA+RSI)
- **`scripts/launch_tv_windows_app.bat`** - Iniciar TradingView
