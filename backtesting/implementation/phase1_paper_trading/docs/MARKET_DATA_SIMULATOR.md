# Market Data Simulator

Simulador de datos de mercado para paper trading con datos realistas de criptomonedas.

## Características

- **4 Pares Principales**: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT
- **OHLCV Realista**: Velas con Open, High, Low, Close, Volume
- **Indicadores Técnicos**: RSI(14), EMA(8,21,55), Bollinger Bands(20,2), VWAP
- **Volatilidad por Sesión**: Diferente volatilidad según sesión (Asia, Londres, NY, Overlap)
- **Eventos de News**: Simulación de noticias macro (FOMC, CPI, NFP, etc.)
- **Spread Realista**: Bid/Ask spread para cada par
- **Gaps y Saltos**: Simulación de gaps ocasionales

## Uso Rápido

```bash
# Simular 24 horas (default)
node market_data_simulator.js

# Simular 6 horas
node market_data_simulator.js --duration 6

# Simular solo BTC y ETH
node market_data_simulator.js --symbols BTCUSDT,ETHUSDT --duration 12

# Velas de 1 minuto (60000ms)
node market_data_simulator.js --interval 60000 --duration 48
```

## Opciones

| Opción | Descripción | Default |
|--------|-------------|---------|
| `--interval` | Intervalo de velas en ms | 10000 (10s) |
| `--duration` | Duración en horas | 24 |
| `--output` | Archivo JSON de salida | market_data_TIMESTAMP.json |
| `--symbols` | Símbolos separados por coma | BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT |
| `--help` | Mostrar ayuda | - |

## Sesiones de Trading

| Sesión | Horario (EST) | Volatilidad | Volumen |
|--------|---------------|-------------|---------|
| Asian | 8pm - 4am | Baja | Medio |
| London | 4am - 8am | Media | Alto |
| London/NY Overlap | 8am - 12pm | Alta | Muy Alto |
| NY | 12pm - 4pm | Media-Alta | Alto |
| Evening | 4pm - 8pm | Baja | Bajo |
| Weekend | Sábado/Domingo | Muy Baja | Muy Bajo |

## Eventos de News

| Evento | Impacto | Efecto en Volatilidad |
|--------|---------|----------------------|
| FOMC | EXTREMO | 6.0x |
| CPI | ALTO | 4.0x |
| NFP | ALTO | 4.0x |
| BTC ETF | ALTO | 4.0x |
| ETH Upgrade | MEDIO | 2.5x |
| Regulatory | MEDIO | 2.5x |
| Tech Earnings | MEDIO | 2.5x |

## Estructura de Datos

```json
{
  "metadata": {
    "startTime": 1776007006960,
    "endTime": 1776007366960,
    "interval": 10000,
    "duration": 360000,
    "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"],
    "totalBars": 36,
    "newsEvents": 0.18
  },
  "summary": {
    "BTCUSDT": {
      "startPrice": 95000,
      "endPrice": 94999,
      "high": 95001,
      "low": 94998,
      "change": -1,
      "changePercent": -0.001,
      "avgVolume": 6.62,
      "totalVolume": 238.42,
      "candles": 36,
      "volatility": 0.0094
    }
  },
  "data": {
    "BTCUSDT": [
      {
        "timestamp": 1776007006960,
        "datetime": "2026-04-12T15:16:46.960Z",
        "symbol": "BTCUSDT",
        "open": 95000,
        "high": 95000,
        "low": 95000,
        "close": 95000,
        "volume": 5.36,
        "bid": 94992,
        "ask": 95007,
        "spread": 15,
        "indicators": {
          "rsi": 50,
          "ema8": null,
          "ema21": null,
          "ema55": null,
          "bollinger": null
        }
      }
    ]
  }
}
```

## Integración con Sistemas de Trading

```javascript
import { MarketDataSimulator } from './market_data_simulator.js';

// Crear simulador
const simulator = new MarketDataSimulator({
  symbols: ['BTCUSDT', 'ETHUSDT'],
  interval: 10000,
  duration: 6 * 3600000 // 6 horas
});

// Ejecutar simulación
const result = simulator.simulate();

// Acceder a datos
const btcCandles = result.data.BTCUSDT;
const latestCandle = btcCandles[btcCandles.length - 1];

// Usar indicadores
console.log('RSI:', latestCandle.indicators.rsi);
console.log('EMA8:', latestCandle.indicators.ema8);
console.log('BB Upper:', latestCandle.indicators.bollinger.upper);
```

## Configuración de Sistemas

El simulador respeta los horarios configurados en `systems_config.json`:

- **Asian Session**: 8pm - 12am EST (ETHUSDT specialist)
- **US Session Open**: 9:30am - 11am EST (SOLUSDT specialist)
- **London/NY Overlap**: 8am - 12pm EST (BTCUSDT specialist)
- **24/7**: Todos los pares para arbitraje y mean reversion

## Características Avanzadas

### Volatilidad Realista

Cada símbolo tiene su propia volatilidad base:
- BTCUSDT: 0.2% (más estable)
- ETHUSDT: 0.3%
- BNBUSDT: 0.25%
- SOLUSDT: 0.4% (más volátil)

### Spread por Símbolo

- BTCUSDT: $15
- ETHUSDT: $2
- SOLUSDT: $0.10
- BNBUSDT: $0.50

### Indicadores Calculados

- **RSI(14)**: Relative Strength Index
- **EMA(8,21,55)**: Exponential Moving Averages
- **Bollinger Bands(20,2)**: Upper, Middle, Lower bands
- **VWAP**: Volume Weighted Average Price (acumulado desde el inicio)

## Archivo

`implementation/phase1_paper_trading/scripts/market_data_simulator.js`
