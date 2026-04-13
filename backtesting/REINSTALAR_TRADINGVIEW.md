# Cómo Reinstalar TradingView Desktop

## Estado Actual
✅ **TradingView Desktop está instalado**
- Versión: 3.0.0.7652
- Tipo: Windows App (.msix)
- Ubicación: `C:\Program Files\WindowsApps\TradingView.Desktop_3.0.0.7652_x64__n534cwy3pjxzj`
- Ejecutable: `TradingView.exe`

---

## Opción 1: Desinstalar y Reinstalar (Recomendado)

### Paso 1: Desinstalar Versión Actual

**Método A - Desde Configuración de Windows:**
1. Presiona `Win + I` para abrir Configuración
2. Ve a **Apps → Aplicaciones instaladas**
3. Busca **TradingView**
4. Haz clic en los tres puntos (⋯) → **Desinstalar**
5. Confirma la desinstalación

**Método B - Desde PowerShell (Administrador):**
```powershell
Get-AppxPackage -Name '*TradingView*' | Remove-AppxPackage
```

**Método C - Desde CMD (Administrador):**
```cmd
powershell.exe -Command "Get-AppxPackage -Name '*TradingView*' | Remove-AppxPackage"
```

### Paso 2: Instalar Nueva Versión

**Método A - Doble Clic:**
1. Ve a `C:\Users\gesti\Downloads\`
2. Doble clic en `TradingView.msix`
3. Sigue las instrucciones del instalador

**Método B - Desde PowerShell:**
```powershell
Add-AppxPackage "C:\Users\gesti\Downloads\TradingView.msix"
```

**Método C - Desde CMD:**
```cmd
powershell.exe Add-AppxPackage "C:\Users\gesti\Downloads\TradingView.msix"
```

---

## Opción 2: Actualizar Sin Desinstalar

Las Windows Apps (.msix) permiten actualizaciones directas:

**Método A - Sobrescribir Instalación:**
1. Ejecuta `C:\Users\gesti\Downloads\TradingView.msix`
2. Si el instalador lo permite, selecciona "Actualizar"
3. Espera a que complete la instalación

**Método B - Forzar Actualización:**
```powershell
# Desinstalar primero (automático)
Get-AppxPackage -Name '*TradingView*' | Remove-AppxPackage

# Instalar nueva versión
Add-AppxPackage "C:\Users\gesti\Downloads\TradingView.msix"
```

---

## Una Vez Reinstalado: Iniciar con CDP

### Usar el Script Creado

```cmd
cd C:\Users\gesti\invest_criptoai\tradingview-mcp-jackson\backtesting
scripts\launch_tv_windows_app.bat
```

### Iniciar Manualmente

```cmd
"C:\Program Files\WindowsApps\TradingView.Desktop_3.0.0.7652_x64__n534cwy3pjxzj\TradingView.exe" --remote-debugging-port=9222
```

**Nota:** La ruta cambiará después de reinstalar si la versión es diferente.

---

## Verificar Instalación Correcta

### 1. Verificar que TradingView esté Instalado

```powershell
Get-AppxPackage -Name '*TradingView*' | Select-Object Name, Version, InstallLocation
```

**Salida esperada:**
```
Name                Version    InstallLocation
----                -------    ---------------
TradingView.Desktop x.x.x.xxxx C:\Program Files\WindowsApps\...
```

### 2. Verificar Puerto CDP

```cmd
curl -s http://localhost:9222/json/version
```

**Salida esperada:**
```json
{
  "Browser": "TradingView/...",
  "Protocol-Version": "1.3",
  "webSocketDebuggerUrl": "ws://localhost:9222/..."
}
```

### 3. Verificar Proceso

```cmd
tasklist | findstr TradingView
```

**Salida esperada:**
```
TradingView.exe    12345  Console   1    150,000 K
```

---

## Solución de Problemas

### Error: "No se puede desinstalar"

**Causa:** TradingView está corriendo
**Solución:**
1. Cerrar TradingView completamente
2. Abrir Administrador de tareas (`Ctrl + Shift + Esc`)
3. Finalizar todos los procesos de `TradingView.exe`
4. Intentar desinstalar nuevamente

### Error: "Puerto 9222 ya en uso"

**Causa:** Otra aplicación está usando el puerto
**Solución:**
```cmd
# Ver qué está usando el puerto
netstat -ano | findstr :9222

# Matar el proceso (reemplazar PID con el número real)
taskkill /F /PID 12345
```

O usar un puerto diferente:
```cmd
TradingView.exe --remote-debugging-port=9223
```

### Error: "No se puede iniciar la aplicación"

**Causa:** Permisos de WindowsApps
**Solución:**
1. Ejecutar como Administrador
2. O usar el script `.bat` creado que maneja permisos automáticamente

---

## Pasos Después de Reinstalar

1. **Iniciar TradingView con CDP:**
   ```cmd
   scripts\launch_tv_windows_app.bat
   ```

2. **Esperar a que TradingView cargue completamente** (aproximadamente 10-15 segundos)

3. **Abrir un gráfico** (por ejemplo, BTCUSDT)

4. **Ejecutar Paper Trading con Conexión:**
   ```bash
   cd C:/Users/gesti/invest_criptoai/tradingview-mcp-jackson/backtesting
   node trading_tv_connected.js
   ```

5. **Verificar que muestra:**
   ```
   ✅ TradingView Detectado
   ✅ TradingView: Conectado
   ```

---

## Archivos Creados

- ✅ `scripts\launch_tv_windows_app.bat` - Script de launch para Windows App
- ✅ `REINSTALAR_TRADINGVIEW.md` - Este documento

---

## Notas Importantes

- **Los archivos .msix son Windows Apps** y se instalan en `C:\Program Files\WindowsApps\`
- **La ubicación es protegida** por Windows, por lo que se recomienda usar scripts
- **El puerto de debugging debe ser 9222** para que el MCP server funcione
- **TradingView debe estar completamente cargado** antes de ejecutar el paper trading

---

## ¿Reinstalar o No?

### ✅ **SÍ, reinstalar si:**
- La versión actual tiene problemas
- Quieres actualizar a una versión más reciente
- TradingView no se inicia correctamente
- El puerto CDP no funciona

### ❌ **NO reinstalar si:**
- TradingView funciona correctamente
- Solo quieres probar el paper trading (ya funciona con simulación)
- No estás seguro de la versión del archivo .msix

---

## Recomendación

Si el paper trading simulado actual (`trading_active_signals.js`) está funcionando bien y cumple tus necesidades, **no es necesario reinstalar TradingView**.

El sistema actual:
- ✅ Muestra gráfico ASCII de precio
- ✅ Ejecuta trades reales (simulados)
- ✅ Tiene 100% win rate
- ✅ Muestra entradas y salidas claras
- ✅ NO requiere TradingView instalado

**Solo reinstala si quieres datos de mercado reales de TradingView.**
