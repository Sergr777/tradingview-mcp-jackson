# 🚀 IMPLEMENTACIÓN ROADMAP - GUÍA DE INICIO RÁPIDO

**Fecha:** 2026-04-12
**Ubicación Principal:** `C:\Users\gesti\invest_criptoai\tradingview-mcp-jackson\backtesting\`

---

## 📁 DIRECTORIOS CREADOS

### En tradingview-mcp-jackson (Aquí)

```
backtesting/
├── implementation/                    ✅ CREADO
│   ├── phase1_paper_trading/         # Fase 1: Paper Trading
│   │   ├── config/
│   │   ├── scripts/
│   │   ├── logs/
│   │   └── results/
│   ├── phase2_production_pilot/       # Fase 2: $1,000 real
│   ├── phase3_scaling/                # Fase 3: $1,500
│   └── phase4_full_capital/           # Fase 4: $15,000
│
├── integration/                       ✅ CREADO
│   ├── invest_criptoai_api/          # Cliente API agents IA
│   │   └── agents_client.js          ✅ CREADO
│   └── shared/                        # Schemas y tipos compartidos
│       └── types.js                  ✅ CREADO
│
├── systems/                           # Sistemas de trading (ya existentes)
│   ├── specialist_asian_session.js
│   ├── mean_reversion_tp_partial.js
│   ├── specialist_us_session_open.js
│   ├── statistical_arbitrage_pairs_expanded.js
│   └── news_filter_system.js
│
└── [documentos creados anteriormente]
    ├── ROADMAP_COMPLETO_RUFLO_V3.md
    ├── PLAN_ACCION_TASKLIST_INTEGRADO.md
    └── ARQUITECTURA_IMPLEMENTACION_RECOMENDADA.md
```

### En invest_criptoai (Sistema Principal IA)

```
invest_criptoai/
├── trading_integration/               ✅ CREADO
│   ├── models/                        # Modelos Pydantic
│   │   └── trading_signals.py        ✅ CREADO
│   ├── services/                      # Servicios de negocio
│   └── api/                           # FastAPI routers
│       └── v1/
│           └── trading_router.py      ✅ CREADO
│
├── agents/                            # Agents IA (ya existentes)
│   ├── master/                        # KRONOS
│   ├── context/                       # ORÁCULO
│   ├── long_term/                     # PROPHET
│   ├── sentiment/                     # SENTIMENT
│   └── [otros agents]
│
└── [componentes ya existentes]
    ├── backend/                       # FastAPI
    ├── frontend/                      # Next.js
    └── api/                           # Endpoints existentes
```

---

## 🎯 UBICACIÓN DE TRABAJO RECOMENDADA

### Directorio Base Principal

```bash
cd ~/invest_criptoai/tradingview-mcp-jackson/backtesting
```

**Este es tu directorio de trabajo principal.** Desde aquí:

- Accedes a los sistemas de trading (`systems/`)
- Configuras las fases de implementación (`implementation/`)
- Integras con agents IA (`integration/`)

### Para Trabajar con Agents IA

```bash
cd ~/invest_criptoai
```

**Desde aquí:**
- Modificas agents (`agents/`)
- Creas nuevos endpoints de API (`trading_integration/api/`)
- Accedes a backend y frontend

---

## 📋 FLUJO DE TRABAJO RECOMENDADO

### 1. Setup Inicial (Esta Semana)

**Paso 1: Configurar entorno de trading systems**
```bash
cd ~/invest_criptoai/tradingview-mcp-jackson/backtesting

# Crear configuración base
cat > implementation/phase1_paper_trading/config/systems_config.json << EOF
{
  "systems": {
    "asian_session": {
      "enabled": true,
      "capital": 3500,
      "use_ai_ensemble": true,
      "news_filter_enabled": true
    },
    "mean_reversion": {
      "enabled": true,
      "capital": 3500,
      "use_ai_ensemble": true,
      "news_filter_enabled": true
    },
    "us_session_open": {
      "enabled": true,
      "capital": 1000,
      "use_ai_ensemble": true,
      "news_filter_enabled": true
    },
    "arbitraje": {
      "enabled": true,
      "capital": 5000,
      "use_ai_ensemble": true,
      "news_filter_enabled": false
    }
  },
  "ai_api": {
    "baseUrl": "http://localhost:8000",
    "enabled": true,
    "timeout": 5000
  }
}
EOF
```

**Paso 2: Configurar FastAPI en invest_criptoai**
```bash
cd ~/invest_criptoai

# Añadir router a backend/main.py
echo "
# Trading integration
from trading_integration.api.v1.trading_router import router as trading_router
app.include_router(trading_router)
" >> backend/main.py

# O editar backend/main.py manualmente
```

**Paso 3: Iniciar backend de invest_criptoai**
```bash
cd ~/invest_criptoai/backend
python -m uvicorn backend.main:app --reload --port 8000
```

**Paso 4: Probar integración**
```bash
cd ~/invest_criptoai/tradingview-mcp-jackson/backtesting

# Crear script de prueba
cat > integration/test_api_connection.js << EOF
import { InvestCriptoAIAgentsClient } from './integration/invest_criptoai_api/agents_client.js';

const client = new InvestCriptoAIAgentsClient({
  baseUrl: 'http://localhost:8000',
  enabled: true
});

async function test() {
  const health = await client.healthCheck();
  console.log('Health check:', health);

  const signal = {
    system: 'test',
    action: 'LONG',
    symbol: 'BTCUSDT',
    confidence: 0.8,
    timestamp: new Date().toISOString(),
    entry_price: 65000,
    stop_loss: 64200,
    take_profit: 66000
  };

  const decision = await client.sendSignal(signal);
  console.log('Decision:', decision);
}

test().catch(console.error);
EOF

node integration/test_api_connection.js
```

### 2. Modificar Sistemas de Trading (Ejemplo)

**Ejemplo: Integrar Asian Session con agents IA**

```bash
cd ~/invest_criptoai/tradingview-mcp-jackson/backtesting

# Editar sistema
nano systems/specialist_asian_session.js
```

```javascript
// Añadir al inicio del archivo
import { InvestCriptoAIAgentsClient } from '../integration/invest_criptoai_api/agents_client.js';

export class AsianSessionSpecialist {
  constructor(config = {}) {
    // ... configuración existente ...

    // Añadir cliente IA
    this.aiClient = new InvestCriptoAIAgentsClient({
      baseUrl: config.aiApiUrl || 'http://localhost:8000',
      enabled: config.useAIEnsemble !== false
    });
  }

  async detect(candle, indicators) {
    // ... lógica existente para generar señal ...

    if (signal) {
      // Añadir validación con agents IA
      const aiDecision = await this.aiClient.sendSignal({
        system: 'asian_session',
        ...signal,
        timestamp: candle.timestamp
      });

      if (aiDecision.approve && aiDecision.final_confidence > 0.7) {
        signal.confidence = aiDecision.final_confidence;
        signal.position_size = aiDecision.position_size;
        signal.ai_reasoning = aiDecision.reasoning;
      } else {
        return null; // Rechazado por ensemble
      }
    }

    return signal;
  }
}
```

### 3. Crear Script de Ejecución (Fase 1)

```bash
cd ~/invest_criptoai/tradingview-mcp-jackson/backtesting

cat > implementation/phase1_paper_trading/scripts/run_paper_trading.js << EOF
import { AsianSessionSpecialist } from '../../systems/specialist_asian_session.js';
import { MeanReversionTPPartial } from '../../systems/mean_reversion_tp_partial.js';
import { USSessionOpenSpecialist } from '../../systems/specialist_us_session_open.js';
import { StatisticalArbitragePairsExpanded } from '../../systems/statistical_arbitrage_pairs_expanded.js';
import { NewsFilterSystem } from '../../systems/news_filter_system.js';

async function main() {
  console.log('🚀 Iniciando Paper Trading - Fase 1');

  // Cargar configuración
  const config = JSON.parse(
    await Deno.readTextFile('implementation/phase1_paper_trading/config/systems_config.json')
  );

  // Inicializar NewsFilter
  const newsFilter = new NewsFilterSystem();

  // Inicializar sistemas
  const systems = [
    new AsianSessionSpecialist({
      ...config.systems.asian_session,
      aiApiUrl: config.ai_api.baseUrl
    }),
    new MeanReversionTPPartial({
      ...config.systems.mean_reversion,
      aiApiUrl: config.ai_api.baseUrl
    }),
    new USSessionOpenSpecialist({
      ...config.systems.us_session_open,
      aiApiUrl: config.ai_api.baseUrl
    }),
    new StatisticalArbitragePairsExpanded({
      ...config.systems.arbitraje,
      aiApiUrl: config.ai_api.baseUrl
    })
  ];

  // Loop principal (simulado)
  console.log('✅ Sistemas inicializados');
  console.log('✅ Paper Trading activo (modo simulación)');
  console.log('💰 Capital: $13,000 (paper)');
  console.log('');

  // TODO: Implementar loop real con datos de TradingView o exchange
  setInterval(() => {
    console.log('📊 Tick:', new Date().toISOString());
  }, 10000); // Cada 10 segundos
}

main().catch(console.error);
EOF

node implementation/phase1_paper_trading/scripts/run_paper_trading.js
```

---

## 🔄 INTEGRACIÓN CON AGENTS IA

### Arquitectura de Comunicación

```
┌─────────────────────────────────────────────────────────────┐
│  TRADING SYSTEM (Node.js)                                  │
│  tradingview-mcp-jackson/backtesting/systems/              │
│                                                              │
│  1. Sistema genera señal                                    │
│  2. Envía a agents IA vía API                               │
│  3. Recibe decisión                                         │
│  4. Ejecuta trade si es aprobada                            │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP POST
                     │ /api/v1/trading/signals
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  INVESTCRIPTO AI (Python/FastAPI)                          │
│  invest_criptoai/                                           │
│                                                              │
│  1. Recibe señal en FastAPI router                          │
│  2. Envía a KRONOS (orchestrator)                          │
│  3. KRONOS coordina otros agents:                          │
│     - ORÁCULO: Contexto histórico                          │
│     - PROPHET: Predicción de precio                        │
│     - SENTIMENT: Análisis de noticias                      │
│     - ARBITER: Ensemble final                              │
│  4. Retorna decisión al sistema de trading                  │
└─────────────────────────────────────────────────────────────┘
```

### API Endpoints Disponibles

**Desde Node.js (trading systems):**

```javascript
// Cliente IA
import { InvestCriptoAIAgentsClient } from './integration/invest_criptoai_api/agents_client.js';

const ai = new InvestCriptoAIAgentsClient({
  baseUrl: 'http://localhost:8000',
  enabled: true
});

// Enviar señal para validación
const decision = await ai.sendSignal({
  system: 'asian_session',
  action: 'LONG',
  symbol: 'BTCUSDT',
  confidence: 0.8,
  timestamp: '2026-04-12T10:00:00Z',
  entry_price: 65000,
  stop_loss: 64200,
  take_profit: 66000
});

// Respuesta esperada:
// {
//   approve: true,
//   final_confidence: 0.85,
//   position_size: 0.75,
//   reasoning: "Ensemble aprueba señal - condiciones favorables",
//   agent_votes: {
//     kronos: true,
//     oraculo: true,
//     prophet: true,
//     sentiment: true,
//     arbiter: true
//   },
//   signal_id: "xxx-xxx-xxx"
// }
```

**Endpoints disponibles en FastAPI:**

- `POST /api/v1/trading/signals` - Enviar señal para validación
- `GET /api/v1/trading/signals/{id}/decision` - Obtener decisión
- `POST /api/v1/trading/execution` - Confirmar trade ejecutado
- `POST /api/v1/trading/backtest/start` - Iniciar backtest
- `POST /api/v1/trading/backtest/results` - Enviar resultados
- `GET /api/v1/trading/systems/{name}/status` - Estado de sistema
- `PUT /api/v1/trading/systems/{name}/config` - Actualizar config
- `POST /api/v1/trading/systems/{name}/pause` - Pausar sistema
- `POST /api/v1/trading/systems/{name}/resume` - Reanudar sistema
- `GET /api/v1/trading/portfolio/summary` - Resumen portafolio
- `POST /api/v1/trading/alerts` - Recibir alerta
- `GET /api/v1/trading/health` - Health check

---

## 📊 PRÓXIMOS PASOS

### Inmediatos (Esta Semana)

1. ✅ **Directorios creados**
2. ⏳ **Configurar entorno de desarrollo**
   - Configurar variables de entorno
   - Instalar dependencias faltantes
   - Setup de base de datos local
3. ⏳ **Probar integración básica**
   - Iniciar FastAPI backend
   - Probar health check
   - Enviar señal de prueba
4. ⏳ **Modificar 1 sistema para usar agents IA**
   - Empezar con Asian Session (mejor rendimiento)
   - Añadir integración completa
   - Testing

### Week 1-2: Paper Trading

1. Iniciar Task #1 del TaskList
2. Configurar todos los sistemas con integración IA
3. Ejecutar paper trading 2 semanas
4. Validar que todo funciona

### Week 3-4: Producción Piloto

1. Iniciar Task #2 del TaskList
2. Configurar cuenta real $1,000
3. Monitoreo intensivo
4. Validar psicología

---

## 🎯 RESUMEN

### ¿Dónde Trabajar?

**Directorio Principal:**
```bash
cd ~/invest_criptoai/tradingview-mcp-jackson/backtesting
```

**Para Modificar Agents IA:**
```bash
cd ~/invest_criptoai
```

### ¿Qué Se Ha Creado?

✅ **Directorios de implementación** (4 fases)
✅ **Cliente API para agents IA** (agents_client.js)
✅ **Tipos compartidos** (types.js)
✅ **Modelos Pydantic** (trading_signals.py)
✅ **FastAPI router** (trading_router.py)

### ¿Qué Falta?

⏳ Configurar FastAPI en invest_criptoai
⏳ Modificar sistemas para usar agents IA
⏳ Crear scripts de ejecución
⏳ Testing completo
⏳ Documentación de operaciones

---

## 📞 AYUDA

**¿Necesitas ayuda con:**

1. **Setup inicial?** → Revisa "Setup Inicial (Esta Semana)"
2. **Integración con agents?** → Revisa "Integración con Agents IA"
3. **Modificación de sistemas?** → Revisa "Modificar Sistemas de Trading"
4. **API endpoints?** → Revisa "API Endpoints Disponibles"

**¿Listo para comenzar?** 🚀

**Siguiente paso:** Probar la integración básica enviando una señal de prueba.
