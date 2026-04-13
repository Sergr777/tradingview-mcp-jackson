@echo off
REM Script de ejecución rápida de backtesting
REM Windows

echo ╔════════════════════════════════════════════════════════════╗
echo ║     BACKTESTING - BTCUSDT 2 AÑOS                           ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Crear directorios
if not exist backtesting\data mkdir backtesting\data
if not exist backtesting\systems mkdir backtesting\systems
if not exist backtesting\results mkdir backtesting\results

echo 📁 Directorios creados
echo.

REM Paso 1: Descargar datos
echo ════════════════════════════════════════════════════════════
echo  PASO 1: DESCARGANDO DATOS HISTÓRICOS...
echo ════════════════════════════════════════════════════════════
echo.

node backtesting/download_data.js

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error descargando datos
    pause
    exit /b 1
)

echo.
echo ✅ Datos descargados correctamente
echo.
pause

REM Paso 2: Calcular indicadores
echo ════════════════════════════════════════════════════════════
echo  PASO 2: CALCULANDO INDICADORES...
echo ════════════════════════════════════════════════════════════
echo.

node backtesting/calculate_indicators.js

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error calculando indicadores
    pause
    exit /b 1
)

echo.
echo ✅ Indicadores calculados correctamente
echo.
pause

REM Paso 3: Ejecutar backtest
echo ════════════════════════════════════════════════════════════
echo  PASO 3: EJECUTANDO BACKTEST...
echo ════════════════════════════════════════════════════════════
echo.

REM Nota: backtest_engine.js necesita ser implementado primero
echo ⚠️  NOTA: El motor de backtesting está pendiente de implementación
echo    Por ahora, los datos están listos para usar
echo.

echo ╔════════════════════════════════════════════════════════════╗
echo ║              PROCESO COMPLETADO                           ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo ✅ Datos listos para backtesting
echo 📂 Ubicación: backtesting/data/
echo.
echo 📊 Archivos creados:
echo    - btcusdt_5m_2years.json
echo    - btcusdt_5m_2years_indicators.json
echo    - btcusdt_15m_2years.json
echo    - btcusdt_1h_2years.json
echo.
echo 🚀 Próximo paso: Implementar sistemas de trading
echo    Ver: backtesting/systems/
echo.

pause
