#!/bin/bash
# Script para monitorear progreso de backtest de arbitraje

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        🔄 MONITOREO DE BACKTEST ARBITRAJE                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

while true; do
    clear
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║        🔄 MONITOREO DE BACKTEST ARBITRAJE                     ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    # Fecha y hora actual
    echo "📅 $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Procesos corriendo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 PROCESOS ACTIVOS:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    ps aux | grep -E "node.*backtest.*arbitraje|node.*backtest_arbitrage" | grep -v grep | wc -l | xargs -I {} echo "  Procesos Node.js: {}"
    echo ""

    # Progreso del log
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📈 PROGRESO DEL BACKTEST:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    LINES=$(wc -l < backtest_arbitrage_output.log)
    TRADES=$(grep -c "TP1 HIT" backtest_arbitrage_output.log)
    SIZE=$(du -h backtest_arbitrage_output.log | cut -f1)

    echo "  Líneas de log: $(printf '%5s' $LINES)"
    echo "  Trades TP1:   $(printf '%5s' $TRADES)"
    echo "  Tamaño log:   $SIZE"
    echo ""

    # Última actividad
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🕐 ÚLTIMA ACTIVIDAD:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    tail -3 backtest_arbitrage_output.log
    echo ""

    # Verificar si completó
    if grep -q "RESULTADOS\|RESUMEN\|Backtest completado\|Resultados guardados" backtest_arbitrage_output.log; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "✅ ¡BACKTEST COMPLETADO!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        grep -A 50 "RESULTADOS\|RESUMEN" backtest_arbitrage_output.log | head -60
        break
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⏳  BACKTEST EN PROGRESO... Próxima verificación en 60 segundos"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    sleep 60
done
