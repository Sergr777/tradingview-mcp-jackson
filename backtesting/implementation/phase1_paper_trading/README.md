# Paper Trading System - Fase 1

Sistema completo de paper trading para validar 4 sistemas + arbitraje antes de producción con dinero real.

## 🚀 Quick Start

```bash
# 1. Navegar al directorio de paper trading
cd implementation/phase1_paper_trading/scripts

# 2. Ejecutar paper trading
node run_paper_trading.js

# 3. En otra terminal, ejecutar el monitor (opcional)
node real_time_monitor.js monitor
```

## 📊 Features Implementadas

### ✅ Detección Real de Señales
- **Asian Session Specialist**: Detecta reversiones a la media en sesión asiática (8pm-12am EST)
- **Mean Reversion TP Partial**: Detecta sobreextensiones con take parciales
- **US Session Open Specialist**: Detecta false breakouts en apertura de Wall Street (9:30am-11am EST)
- **Statistical Arbitraje Expandido**: Detecta oportunidades de arbitraje estadístico en 5 pares simultáneos

### ✅ Conexión con Market Data Simulator
- Genera datos realistas para BTC, ETH, SOL, BNB
- Indicadores técnicos pre-calculados (RSI, SMA, StdDev, Bollinger)
- Volatilidad dinámica por sesiones de trading
- Eventos de news ocasionales

### ✅ Cálculo Real de PnL
- PnL por trade individual
- PnL acumulado del portafolio
- PnL por sistema
- PnL sin realizar (unrealized) para posiciones abiertas

### ✅ Tracking de Win Rate
- Win rate global del portafolio
- Win rate por sistema
- Win rate rolling (últimos 50 trades)
- Conteo de trades ganadores/perdedores

### ✅ Cálculo de Max Drawdown Correcto
- Drawdown actual
- Max drawdown histórico
- Peak de equity
- Gráfico de equity curve

### ✅ Integración con AI Agents
- Cliente para InvestCripto AI Agents
- Envío de señales para validación
- Ensemble decision (KRONOS, ORÁCULO, PROPHET, SENTIMENT, ARBITER)
- Fallback automático si AI no está disponible

### ✅ Integración con Real-Time Monitor
- Dashboard en tiempo real
- Alertas de riesgo (daily loss, weekly loss, max drawdown)
- Métricas actualizadas cada 10 segundos
- Exportación de reportes

### ✅ Persistencia de Estado
- Guardado periódico de estado
- Recuperación de estado anterior
- Logs de trades y señales
- Reportes finales en JSON

## 📁 Estructura de Archivos

```
implementation/phase1_paper_trading/
├── config/
│   └── systems_config.json          # Configuración de sistemas y parámetros
├── scripts/
│   ├── run_paper_trading.js         # Script principal de paper trading ✅ COMPLETO
│   ├── market_data_simulator.js     # Simulador de datos de mercado
│   └── real_time_monitor.js         # Monitor en tiempo real
├── logs/
│   ├── state_*.json                 # Estados guardados
│   ├── metrics_*.json               # Métricas del monitor
│   └── report_final_*.json          # Reportes finales
└── systems/
    ├── specialist_asian_session.js
    ├── mean_reversion_tp_partial.js
    ├── specialist_us_session_open.js
    ├── statistical_arbitrage_pairs_expanded.js
    └── news_filter_system.js
```

## 🎯 Criterios de Éxito

El sistema evalúa automáticamente si cumple con los criterios de éxito:

| Criterio | Requerido | Evaluación |
|----------|-----------|------------|
| Win Rate Mínimo | 45% | ✓ Automático |
| PnL Mínimo | 5% | ✓ Automático |
| Max Drawdown Máximo | 15% | ✓ Automático |
| Trades Mínimos | 50 | ✓ Automático |
| Duración | 2 semanas | Manual |

## 📊 Reportes

### Reporte Final
Al finalizar la ejecución, el sistema genera:

1. **Reporte en consola** con:
   - Capital inicial/final
   - PnL total y porcentual
   - Win rate
   - Max drawdown
   - Trades por sistema
   - Evaluación de criterios de éxito

2. **Archivo JSON** con:
   - Métricas completas
   - Todos los trades ejecutados
   - Equity curve
   - Estadísticas por sistema

### Exportar a CSV
```bash
node real_time_monitor.js export trades.csv
```

## 🔧 Configuración

Editar `config/systems_config.json`:

```json
{
  "capital_total": 13000,
  "capital_operativo": 13000,
  "capital_reserva": 2000,
  "systems": {
    "asian_session": {
      "enabled": true,
      "capital": 3500,
      "parameters": {
        "z_score_threshold": 1.5,
        "stop_loss_pct": 0.01,
        "take_profit_pct": 0.02
      }
    },
    ...
  },
  "ai_integration": {
    "enabled": true,
    "api_url": "http://localhost:8000"
  }
}
```

## 🚨 Alertas de Riesgo

El sistema monitorea y alerta sobre:

- **Pérdida diaria máxima**: -3%
- **Pérdida semanal máxima**: -10%
- **Drawdown máximo**: 15%
- **Win rate mínimo**: 45%

## 📈 Próximos Pasos

Si el sistema cumple con los criterios de éxito:

1. ✅ Fase 1 completada (Paper Trading - 2 semanas)
2. 🔄 Fase 2: Trading con datos en tiempo real (paper)
3. 🔄 Fase 3: Trading en testnet
4. 🔄 Fase 4: Trading en mainnet (capital reducido)

## 🐛 Troubleshooting

### El sistema no genera señales
- Verificar que el simulador de mercado esté generando datos
- Revisar parámetros de detección (thresholds)
- Verificar horarios de trading (sesiones)

### El monitor no muestra datos
- Asegurarse que el paper trading esté corriendo
- Verificar que existan archivos en `logs/`
- Revisar configuración de `logsDir`

### Error conectando con AI Agents
- Verificar que la API esté corriendo en `http://localhost:8000`
- Si no está disponible, el sistema usa modo fallback automático
- Revisar `ai_integration.enabled` en config

## 📝 Notas

- El sistema usa datos simulados realistas pero NO es trading real
- Todos los trades son "paper" (sin dinero real)
- El objetivo es validar la lógica antes de producción
- La duración recomendada es de 2 semanas (mínimo 50 trades)

## 🎉 Estado Actual

✅ **SISTEMA COMPLETO Y FUNCIONAL**

- ✅ Detección real de señales
- ✅ Conexión con market_data_simulator.js
- ✅ Lógica de detección real de cada sistema
- ✅ Cálculo real de PnL
- ✅ Tracking de Win Rate
- ✅ Cálculo de Max Drawdown correcto
- ✅ Integración con real_time_monitor.js
- ✅ Integración con AI agents
- ✅ Persistencia de estado
- ✅ Reportes automáticos

**Listo para usar** 🚀
