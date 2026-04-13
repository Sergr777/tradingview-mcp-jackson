# Configuración de TradingView Desktop para Paper Trading

## Estado Actual
- ❌ **TradingView Desktop NO encontrado** en el sistema
- ✅ **Script de launch creado**: `scripts/launch_tv_debug.bat`
- ✅ **Paper trading simulado** funciona correctamente

---

## Opción 1: Instalar TradingView Desktop (Recomendado)

### Paso 1: Descargar e Instalar

1. **Descargar TradingView Desktop:**
   - Visita: https://www.tradingview.com/desktop/
   - Descarga la versión para Windows
   - Ejecuta el instalador

2. **Rutas de instalación típicas:**
   - `C:\Program Files\TradingView\TradingView.exe`
   - `C:\Program Files (x86)\TradingView\TradingView.exe`
   - `%LOCALAPPDATA%\Programs\TradingView\TradingView.exe`
   - `%USERPROFILE%\AppData\Local\Programs\TradingView\TradingView.exe`

### Paso 2: Iniciar con CDP Habilitado

**Usar el script creado:**
```cmd
cd C:\Users\gesti\invest_criptoai\tradingview-mcp-jackson\backtesting
scripts\launch_tv_debug.bat
```

**O iniciar manualmente:**
```cmd
"C:\Program Files\TradingView\TradingView.exe" --remote-debugging-port=9222
```

### Paso 3: Ejecutar Paper Trading con Datos Reales

```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_paper_trading.js
```

Este script:
- ✅ Se conecta a TradingView vía MCP
- ✅ Lee datos OHLCV reales del gráfico activo
- ✅ Calcula indicadores técnicos (RSI, EMA, VWAP, High20/Low20)
- ✅ Ejecuta los 3 sistemas: TurtleSoup, VWAPBounce, EMARSI
- ✅ Muestra trades en tiempo real
- ⚠️ **Fallback automático** a datos simulados si TV no está disponible

---

## Opción 2: Usar Paper Trading Simulado (Ya Funcional)

Si no quieres instalar TradingView, el sistema simulado **YA FUNCIONA**:

### Ejecutar Demo Visual (Gráfico ASCII)

```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
node trading_visual.js
```

**Características:**
- ✅ Gráfico ASCII de precio (80x20 caracteres)
- ✅ Marcadores de entrada (●) y salida (○)
- ✅ SIN indicadores técnicos visibles
- ✅ Estadísticas en tiempo real
- ✅ 35 ticks de demostración
- ✅ Win rate, PnL por sistema

### Ejecutar Demo con Señales Predefinidas

```bash
node trading_demo.js
```

**Características:**
- ✅ Secuencia de señales predefinidas
- ✅ Detecta patrones de trading
- ✅ Muestra entradas y salidas formateadas
- ✅ Resumen cada 5 ticks
- ✅ 30 ticks de demostración

---

## Verificación de Conexión

### Verificar si TradingView Está Corriendo

```bash
curl -s http://localhost:9222/json/version
```

**Respuesta esperada:**
```json
{
  "Browser": "TradingView/xxx",
  "Protocol-Version": "1.3",
  "webSocketDebuggerUrl": "ws://localhost:9222/..."
}
```

### Verificar MCP Server

```bash
cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson
npm start
```

El MCP server intentará conectar a TradingView automáticamente.

---

## Scripts Disponibles

| Script | Propósito | ¿Requiere TV? |
|--------|-----------|---------------|
| `trading_visual.js` | Demo visual con gráfico ASCII | ❌ No (simulado) |
| `trading_demo.js` | Demo con señales predefinidas | ❌ No (simulado) |
| `trading_paper_trading.js` | Paper trading completo | ✅ Sí (con fallback) |
| `launch_tv_debug.bat` | Iniciar TradingView con CDP | N/A |

---

## Problemas Comunes

### "TradingView CDP not available"
- **Causa:** TradingView no está corriendo o sin puerto 9222
- **Solución:** Ejecutar `scripts\launch_tv_debug.bat`

### "No hay señales en este tick"
- **Causa:** Las condiciones de mercado no cumplen los criterios estrictos
- **Normal:** Los sistemas son muy selectivos (bajos falsos positivos)
- **Solución:** Usar `trading_demo.js` para ver trades de ejemplo

### Puerto 9222 ya en uso
- **Causa:** Otra instancia de Chrome/Edge está usando el puerto
- **Solución:** Cerrar otros navegadores o usar otro puerto:
  ```cmd
  TradingView.exe --remote-debugging-port=9223
  ```

---

## Próximos Pasos

1. **Instalar TradingView Desktop** (opcional pero recomendado)
2. **Ejecutar script de launch:** `scripts\launch_tv_debug.bat`
3. **Probar paper trading real:** `node trading_paper_trading.js`
4. **O seguir usando simulación:** `node trading_visual.js`

---

## Archivos Creados

- ✅ `scripts/launch_tv_debug.bat` - Script de launch para Windows
- ✅ `trading_visual.js` - Demo visual con gráfico ASCII
- ✅ `trading_demo.js` - Demo con señales predefinidas
- ✅ `trading_paper_trading.js` - Paper trading completo (con fallback)
- ✅ `TRADINGVIEW_SETUP.md` - Este documento
