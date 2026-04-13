# 📅 PLAN DE 4 SEMANAS - Pilotaje y Optimización

**Objetivo:** Validar estrategias con TradingView MCP antes de migrar a BitGet
**Duración:** 28 días (4 semanas)
**Inicio:** 2026-04-09
**Fin:** 2026-05-07
**Meta:** Preparar sistema para producción con BitGet

---

## 🎯 Visión General

### Fase 1: Pilotaje (Semanas 1-2)
- Validar estrategias con datos reales
- Simular ejecución con TradingView MCP
- Documentar resultados

### Fase 2: Optimización (Semanas 3-4)
- Ajustar parámetros basado en datos
- Implementar mejoras
- Preparar migración a BitGet

### Fase 3: Migración (Semana 5+)
- Abrir cuenta BitGet
- Configurar API
- Ejecutar en producción

---

## 📋 SEMANA 1 (2026-04-09 to 2026-04-15)

### 🎯 Objetivo: Validar Turtle Soup CTR

#### Día 1-2: Configuración y Setup
- [x] Revisar estado actual del sistema
- [x] Analizar safety-check-log.json
- [x] Implementar correcciones LOT_SIZE
- [ ] Configurar gráfico TradingView para BTCUSDT 5m
- [ ] Configurar indicadores: RSI, VWAP, EMA

#### Día 3-4: Recolección de Datos
- [ ] Monitorear BTCUSDT 5m durante 2 días
- [ ] Documentar cada señal Turtle Soup potencial
- [ ] Capturar screenshots de patrones
- [ ] Registrar volumen en cada punto de entrada

**Datos a capturar:**
```javascript
{
  timestamp: "2026-04-09T14:30:00Z",
  symbol: "BTCUSDT",
  timeframe: "5m",
  price: 72000,
  signal: "buy/sell/flat",
  rsi: 45,
  vwap: 71850,
  ema8: 71900,
  volume: 150,
  turtleSoupSetup: true/false,
  breakoutLevel: 72358,
  outcome: "success/fail/neutral"
}
```

#### Día 5-7: Análisis Inicial
- [ ] Analizar patrones identificados
- [ ] Calcular tasa de éxito preliminar
- [ ] Identificar mejores horas de operación
- [ ] Documentar lecciones aprendidas

**Entregables Semana 1:**
- 📊 Log de señales capturadas (JSON)
- 📸 Screenshots de patrones
- 📈 Análisis preliminar (Markdown)
- 🎯 Tasa de éxito inicial

---

## 📋 SEMANA 2 (2026-04-16 to 2026-04-22)

### 🎯 Objetivo: Backtesting y Comparación

#### Día 8-10: Backtesting Manual
- [ ] Revisar datos históricos BTCUSDT 5m
- [ ] Identificar patrones Turtle Soup en las últimas 2 semanas
- [ ] Simular entrada/salida en cada punto
- [ ] Calcular P&L simulado

**Parámetros a backtestear:**
```javascript
// Estrategia Original
Stop Loss: -1%
TP1: +1% (50% posición)
TP2: +2% (50% posición)

// Variación 1 (Conservadora)
Stop Loss: -0.8%
TP1: +0.8% (100% posición)

// Variación 2 (Agresiva)
Stop Loss: -1.2%
TP1: +1.5% (30% posición)
TP2: +2.5% (70% posición)
```

#### Día 11-12: Comparación de Estrategias
- [ ] Comparar resultados de las 3 variaciones
- [ ] Identificar cuál tiene mejor Sharpe Ratio
- [ ] Calcular Win Rate de cada una
- [ ] Seleccionar mejor variante

#### Día 13-14: Validación con TradingView MCP
- [ ] Usar TradingView MCP para validar setup
- [ ] Simular ejecución con datos en vivo
- [ ] Verificar latencia y slippage
- [ ] Ajustar parámetros si es necesario

**Entregables Semana 2:**
- 📊 Backtesting results (JSON/CSV)
- 📈 Comparación de variaciones (Gráfico)
- 🎯 Mejor variante seleccionada
- 📝 Reporte de validación

---

## 📋 SEMANA 3 (2026-04-23 to 2026-04-29)

### 🎯 Objetivo: Optimización de Parámetros

#### Día 15-17: Análisis de Volatilidad
- [ ] Calcular ATR (Average True Range) para BTCUSDT
- [ ] Identificar horas de mayor volatilidad
- [ ] Analizar impacto de ICT Killzones
- [ ] Ajustar Stop Loss dinámico

**Fórmula ATR-based Stop Loss:**
```javascript
// Stop Loss dinámico basado en ATR
const atr = calculateATR(candles, 14); // 14 períodos
const stopLoss = atr * 1.5; // 1.5x ATR

// Ejemplo:
// Si ATR = 200 puntos
// Stop Loss = 300 puntos = 0.4% (en BTC $72k)
```

#### Día 18-19: Optimización de TP (Take Profit)
- [ ] Analizar distribución de ganancias máximas
- [ ] Identificar TP óptimo (no muy agresivo, no muy conservador)
- [ ] Testear TP1: +0.8%, +1.0%, +1.2%
- [ ] Testear TP2: +1.5%, +2.0%, +2.5%

#### Día 20-21: Filtros de Entrada
- [ ] Implementar filtro de volumen mínimo
- [ ] Implementar filtro de spread máximo
- [ ] Implementar filtro de volatilidad mínima
- [ ] Validar mejora en tasa de éxito

**Filtros Propuestos:**
```javascript
// Filtro 1: Volumen mínimo
if (volume < 100) return "skip"; // BTC muy bajo

// Filtro 2: Spread máximo
const spread = ask - bid;
if (spread > price * 0.001) return "skip"; // >0.1%

// Filtro 3: Volatilidad mínima
const range = high - low;
if (range < price * 0.002) return "skip"; // <0.2%
```

**Entregables Semana 3:**
- 📊 Análisis ATR y volatilidad (JSON)
- 📈 TP óptimo identificado
- 🎯 Filtros de entrada implementados
- 📝 Reporte de optimización

---

## 📋 SEMANA 4 (2026-04-30 to 2026-05-07)

### 🎯 Objetivo: Preparación para Producción

#### Día 22-24: Documentación Completa
- [ ] Documentar estrategia final optimizada
- [ ] Crear manual de operación
- [ ] Crear guía de troubleshooting
- [ ] Documentar riesgos y mitigaciones

**Documentos a crear:**
- `ESTRATEGIA_FINAL.md` - Estrategia optimizada
- `MANUAL_OPERACION.md` - Guía paso a paso
- `RIESGOS_Y_MITIGACION.md` - Análisis de riesgos
- `CHECKLIST_PRODUCCION.md` - Checklist antes de operar

#### Día 25-26: Simulación Final
- [ ] Simular 1 semana completa de trading
- [ ] Usar datos en vivo con TradingView MCP
- [ ] Ejecutar "paper trading" (sin dinero real)
- [ ] Calcular P&L final simulado

#### Día 27-28: Preparación BitGet
- [ ] Crear cuenta BitGet (testnet si disponible)
- [ ] Completar KYC (verificación de identidad)
- [ ] Configurar 2FA
- [ ] Depositar fondos de prueba ($10-20 USDT)

#### Día 29-30: Setup API BitGet
- [ ] Crear API Keys
- [ ] Configurar permisos (Spot Read + Write)
- [ ] Configurar IP whitelist
- [ ] Testear API con `scalper-run.js`
- [ ] Ejecutar primera operación de prueba

**Entregables Semana 4:**
- ✅ Documentación completa
- 📊 Simulación final validada
- 🔑 Cuenta BitGet configurada
- 🎯 API test funciona
- 🚀 Listo para producción

---

## 📊 Métricas a Seguir

### Durante las 4 Semanas

| Métrica | Semana 1 | Semana 2 | Semana 3 | Semana 4 | Meta Final |
|---------|----------|----------|----------|----------|-----------|
| **Señales Turtle Soup** | 10+ | 20+ | 30+ | 40+ | 50+ |
| **Tasa Éxito** | 40% | 55% | 65% | 70% | 75%+ |
| **Sharpe Ratio** | 0.5 | 1.0 | 1.5 | 2.0 | 2.5+ |
| **Max Drawdown** | -5% | -4% | -3% | -2% | < -2% |
| **Profit Factor** | 1.2 | 1.5 | 1.8 | 2.0 | 2.0+ |

---

## 🎯 Tareas Diarias con TradingView MCP

### Rutina Diaria (30 minutos)

#### 1. Análisis de Mañana (10 min)
```javascript
// Usar TradingView MCP
1. chart_get_state()      // Verificar estado
2. data_get_study_values() // Obtener indicadores
3. data_get_ohlcv()       // Obtener velas recientes
4. Buscar patrones Turtle Soup
```

#### 2. Registro de Señales (5 min)
```javascript
// Si hay señal potencial:
{
  fecha: "2026-04-09",
  hora: "14:30",
  symbol: "BTCUSDT",
  precio: 72000,
  signal: "Turtle Soup buy",
  rsi: 45,
  volumen: 150,
  accion: "ESPERAR CONFIRMACIÓN"
}
```

#### 3. Validación (10 min)
```javascript
// 2-3 horas después:
chart_set_symbol()        // Verificar evolución
data_get_ohlcv()         // Verificar si se confirmó
capture_screenshot()     // Capturar resultado
```

#### 4. Registro de Resultado (5 min)
```javascript
// Registrar resultado:
{
  outcome: "CONFIRMADO",
  precio_entrada: 72000,
  precio_salida: 72800,
  profit: "+1.11%",
  razon: "TP1 alcanzado"
}
```

---

## 📁 Estructura de Archivos

### Crear Durante las 4 Semanas

```
tradingview-mcp-jackson/
├── logs/
│   ├── week1/           # Semana 1 logs
│   │   ├── signals.json
│   │   ├── screenshots/
│   │   └── analysis.md
│   ├── week2/           # Semana 2 logs
│   ├── week3/           # Semana 3 logs
│   └── week4/           # Semana 4 logs
├── backtesting/
│   ├── results.json     # Backtesting data
│   └── comparison.md    # Comparación de estrategias
├── optimization/
│   ├── atr-analysis.json
│   ├── tp-optimization.json
│   └── filters.md
├── docs/
│   ├── ESTRATEGIA_FINAL.md
│   ├── MANUAL_OPERACION.md
│   └── CHECKLIST_PRODUCCION.md
└── bitget-setup/
    ├── .env             # Credenciales (Semana 4)
    └── test-results.json # Test API
```

---

## 🚀 Hito: Fin de las 4 Semanas

### Checklist Antes de Migrar a BitGet

#### Estrategia
- [ ] Estrategia optimizada documentada
- [ ] Tasa de éxito ≥ 70%
- [ ] Sharpe Ratio ≥ 2.0
- [ ] Max Drawdown < -2%
- [ ] Profit Factor ≥ 2.0

#### Código
- [ ] `scalper-run.js` corregido y validado
- [ ] LOT_SIZE corrections implementadas
- [ ] Pre-sale validation funcionando
- [ ] Recovery automático probado
- [ ] Tests unitarios pasando (100%)

#### BitGet
- [ ] Cuenta creada y verificada
- [ ] KYC completado
- [ ] 2FA configurado
- [ ] API Keys creadas
- [ ] Permisos configurados (Spot Read + Write)
- [ ] IP whitelist activo
- [ ] Fondos depositados ($10-20 mínimo)
- [ ] API test exitoso

#### Documentación
- [ ] Manual de operación completo
- [ ] Guía de troubleshooting
- [ ] Análisis de riesgos
- [ ] Plan de contingencia
- [ ] Checklists de producción

---

## 📈 Progreso Esperado

### Semana 1: Fundación
```
Turtle Soup identificados: 10-15
Tasa éxito inicial: 40-50%
Lecciones aprendidas: 5-10 insights
```

### Semana 2: Backtesting
```
Patrones backtesteados: 20-30
Mejor variante identificada: ✅
Tasa éxito mejorada: 55-60%
```

### Semana 3: Optimización
```
Parámetros optimizados: ✅
Filtros implementados: ✅
Tasa éxito optimizada: 65-70%
```

### Semana 4: Preparación
```
Documentación completa: ✅
Cuenta BitGet lista: ✅
API test exitoso: ✅
Primera operación real: ✅
```

---

## 🎯 Meta Final (Día 28)

### Objetivo: Sistema Ready para Producción

```
✅ Estrategia validada con datos reales
✅ Parámetros optimizados
✅ Código corregido y probado
✅ BitGet configurado y testeado
✅ Documentación completa
✅ Primera operación real ejecutada
```

---

## 📞 Soporte Durante las 4 Semanas

### Recursos Disponibles

1. **TradingView MCP** - 78 herramientas disponibles
2. **Claude Code** - Análisis y optimización
3. **Documentación** - Guías y tutoriales
4. **Tests** - Validación continua

### Monitoreo Continuo

```javascript
// Semanalmente revisar:
- Tasa de éxito
- Sharpe Ratio
- Max Drawdown
- Ajustes necesarios
```

---

## 🎓 Lecciones Esperadas

### Qué Aprenderemos

1. **Patrones de Mercado**
   - Cuándo aparece Turtle Soup
   - Qué horas son mejores
   - Volatilidad necesaria

2. **Gestión de Riesgo**
   - Stop Loss óptimo
   - Tamaño de posición
   - Diversificación

3. **Psicología de Trading**
   - Disciplina para seguir señales
   - Manejo de pérdidas
   - Gestión de emociones

4. **Optimización Continua**
   - Ajuste de parámetros
   - Mejora de filtros
   - Innovación de estrategia

---

## 🚀 Listo para Comenzar

**Próxima Acción:**

Hoy es **Día 1 de la Semana 1**. Vamos a:

1. ✅ Configurar TradingView para BTCUSDT 5m
2. ✅ Añadir indicadores: RSI, VWAP, EMA
3. ✅ Iniciar monitoreo de señales Turtle Soup
4. ✅ Documentar primera señal identificada

**¿Listo para comenzar el pilotaje?** 🎯
