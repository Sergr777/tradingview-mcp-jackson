# Backtesting

Carpeta para backtesting de sistemas de trading con datos históricos de BTCUSDT (2 años).

## Estructura

```
backtesting/
├── data/                          # Datos históricos
│   ├── btcusdt_5m_2years.json
│   ├── btcusdt_5m_2years_indicators.json
│   ├── btcusdt_15m_2years.json
│   └── btcusdt_1h_2years.json
├── systems/                       # Sistemas de trading
│   ├── turtle_soup_ctr.js
│   ├── vwap_bounce.js
│   ├── ema_rsi.js
│   ├── mean_reversion.js
│   ├── liquidity_sweep.js
│   ├── order_flow.js
│   ├── support_resistance.js
│   ├── fibonacci_retracement.js
│   ├── session_breakout.js
│   └── breakout_rango.js
├── results/                       # Resultados de backtests
│   ├── backtest_results.json
│   ├── individual_systems/
│   └── optimization/
├── download_data.js               # Descargar datos históricos
├── calculate_indicators.js        # Calcular indicadores técnicos
├── backtest_engine.js             # Motor de backtesting
├── analyze_results.js             # Análisis de resultados
└── run_complete_backtest.js       # Ejecutar backtest completo
```

## Uso

### Paso 1: Descargar datos históricos

```bash
node backtesting/download_data.js
```

Esto descargará 2 años de datos de BTCUSDT en timeframes de 5m, 15m y 1h desde Binance API.

### Paso 2: Calcular indicadores

```bash
node backtesting/calculate_indicators.js
```

Calcula SMA, EMA, RSI, ATR, VWAP, ADX, High/Low 20 y otros indicadores necesarios.

### Paso 3: Ejecutar backtest

```bash
node backtesting/backtest_engine.js
```

Ejecuta el backtest de todos los sistemas implementados.

### Paso 4: Analizar resultados

```bash
node backtesting/analyze_results.js
```

Genera reportes con win rate, Sharpe ratio, drawdown y otras métricas.

## Ejecución Completa

```bash
node backtesting/run_complete_backtest.js
```

Ejecuta todos los pasos en secuencia.

## Sistemas Implementados

1. **Turtle Soup CTR** - Falsas rupturas de High/Low 20
2. **VWAP Bounce** - Rebotes en VWAP
3. **EMA 8 + RSI** - Momentum con cruce de medias
4. **Mean Reversion** - Reversión a la media con z-score

## Próximos Sistemas (Pendientes)

5. Liquidity Sweep Detector
6. Order Flow
7. Support/Resistance Bounce
8. Fibonacci Retracement
9. Session Breakout
10. Breakout Rango

## Métricas Calculadas

- Win Rate
- Total PnL
- Sharpe Ratio
- Maximum Drawdown
- Profit Factor
- Gross Profit / Gross Loss
- Avg PnL por Trade

## Datos

- **Período:** Enero 2024 - Abril 2026 (2 años)
- **Timeframes:** 5 minutos (principal), 15 minutos, 1 hora
- **Fuente:** Binance API (gratuita)
- **Símbolo:** BTCUSDT

## Requisitos

- Node.js 18+
- Conexión a internet (para descarga inicial)
- ~500 MB de espacio en disco

## Notas

- Los datos de 5 minutos ocupan aproximadamente 100-150 MB
- El backtest completo puede tomar 10-30 minutos dependiendo del sistema
- Los resultados se guardan en formato JSON para análisis posterior
