# 🔄 INTEGRACIÓN: TradingView MCP + Multi-Agent System

**Fecha:** 2026-04-09
**Opción Seleccionada:** Opción A - TradingView MCP como fuente de datos
**Estado:** ✅ Arquitectura Diseñada
**Próximo Paso:** Implementación durante Semana 1-2 del pilotaje

---

## 🎯 Visión General

### Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────┐
│                    TRADINGVIEW DESKTOP                      │
│                   (CDP en puerto 9222)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP (78 herramientas)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              TRADINGVIEW MCP SERVER                         │
│  - Lectura de gráficos en tiempo real                      │
│  - Indicadores visibles (RSI, Volume)                      │
│  - Cálculos background (VWAP, EMA, High/Low)                │
│  - Captura de screenshots                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ API REST / WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    KRONOS v3                                │
│              (Orquestador Central)                          │
│                                                               │
│  Responsabilidades:                                          │
│  - Recibir datos de TradingView MCP                         │
│  - Distribuir tareas a agentes especializados               │
│  - Coordinar flujo de trabajo                               │
│  - Gestionar contexto persistente                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌──────────┐
    │ PROPHET │  │SENTIMENT│  │  MNEMO   │
    │         │  │         │  │ (Memo)   │
    └────┬────┘  └────┬────┘  └─────┬────┘
         │            │             │
         └────────┬───┴─────────────┘
                  ▼
         ┌────────────────┐
         │    ORÁCULO     │
         │  (RAG Engine)  │
         │                │
         │ - Consenso     │
         │ - Recuperación │
         │   de contexto  │
         └────────┬───────┘
                  │ Señal final
                  ▼
         ┌────────────────┐
         │ scalper-run.js│
         │  (Ejecución)   │
         └────────────────┘
```

---

## 📊 Flujo de Datos Detallado

### Fase 1: Captura de Datos (TradingView MCP)

```python
# tradingview_data_collector.py

class TradingViewDataCollector:
    """Colecta datos en tiempo real desde TradingView MCP"""
    
    async def collect_market_data(self, symbol: str = "BTCUSDT") -> Dict[str, Any]:
        """
        Captura datos completos del gráfico actual
        """
        # 1. Estado del gráfico
        chart_state = await mcp_tradingview__chart_get_state()
        
        # 2. Indicadores visibles (RSI, Volume)
        study_values = await mcp_tradingview__data_get_study_values()
        
        # 3. Precio actual
        quote = await mcp_tradingview__quote_get(symbol=symbol)
        
        # 4. Velas para cálculos background
        ohlcv = await mcp_tradingview__data_get_ohlcv(count=100, summary=True)
        
        # 5. Niveles personalizados de Pine
        pine_lines = await mcp_tradingview__data_get_pine_lines()
        pine_labels = await mcp_tradingview__data_get_pine_labels()
        
        return {
            "timestamp": datetime.utcnow(),
            "symbol": chart_state["symbol"],
            "timeframe": chart_state["timeframe"],
            "price": quote["last"],
            "ohlc": {
                "open": quote["open"],
                "high": quote["high"],
                "low": quote["low"],
                "close": quote["close"]
            },
            "volume": quote["volume"],
            "indicators_visible": {
                "rsi": study_values.get("RSI"),
                "volume": study_values.get("Volume")
            },
            "indicators_background": self._calc_background_indicators(ohlcv),
            "pine_levels": pine_lines,
            "pine_labels": pine_labels
        }
    
    def _calc_background_indicators(self, ohlcv: List[Dict]) -> Dict[str, float]:
        """Calcula VWAP, EMA, High/Low desde velas"""
        candles = ohlcv.get("bars", [])
        
        # VWAP
        vwap = self._calc_vwap(candles)
        
        # EMA 8
        ema8 = self._calc_ema([c["close"] for c in candles], 8)
        
        # High/Low 20
        high20, low20 = self._calc_highlow(candles, 20)
        
        return {
            "vwap": vwap,
            "ema8": ema8,
            "high20": high20,
            "low20": low20
        }
```

---

### Fase 2: Análisis por Agentes Especializados

```python
# Agente PROPHET - Predicción de Precios

class ProphetAgent(BaseAgent):
    """Genera predicciones multi-horizonte"""
    
    async def analyze(self, tv_data: Dict[str, Any]) -> Prediction:
        """
        Analiza datos de TradingView y genera predicción
        
        Input: Datos de TradingView MCP
        Output: Predicción con intervalos de confianza
        """
        # Extraer características
        features = self._extract_features(tv_data)
        
        # Generar predicciones con múltiples modelos
        lstm_pred = self.lstm_model.predict(features)
        gru_pred = self.gru_model.predict(features)
        tft_pred = self.tft_model.predict(features)
        
        # Ensemble de predicciones
        ensemble = self._ensemble_predictions([lstm_pred, gru_pred, tft_pred])
        
        # Detectar régimen de mercado
        regime = self._detect_regime(tv_data["indicators_background"])
        
        return Prediction(
            symbol=tv_data["symbol"],
            predicted_price=ensemble["mean"],
            confidence_interval_lower=ensemble["lower"],
            confidence_interval_upper=ensemble["upper"],
            regime_prediction=regime,
            prediction_horizon=PredictionHorizon.ONE_HOUR,
            confidence_score=ensemble["confidence"]
        )
    
    def _detect_regime(self, indicators: Dict) -> MarketRegime:
        """Detecta régimen basado en indicadores"""
        price = indicators["vwap"]
        ema8 = indicators["ema8"]
        
        if price > ema8:
            return MarketRegime.BULL
        elif price < ema8:
            return MarketRegime.BEAR
        else:
            return MarketRegime.SIDEWAYS
```

```python
# Agente SENTIMENT - Análisis de Sentimiento

class SentimentAgent(BaseAgent):
    """Analiza sentimiento de mercado"""
    
    async def analyze(self, tv_data: Dict[str, Any]) -> SentimentAnalysis:
        """
        Analiza sentimiento social y noticias
        
        Input: Datos de TradingView MCP
        Output: Análisis de sentimiento
        """
        # Obtener sentimiento social
        social_sentiment = await self._fetch_social_sentiment(tv_data["symbol"])
        
        # Obtener noticias recientes
        news_sentiment = await self._fetch_news_sentiment(tv_data["symbol"])
        
        # Combinar señales
        overall_sentiment = self._combine_sentiments(social_sentiment, news_sentiment)
        
        return SentimentAnalysis(
            symbol=tv_data["symbol"],
            overall_sentiment=overall_sentiment["score"],  # -1 a +1
            social_sentiment=social_sentiment["score"],
            news_sentiment=news_sentiment["score"],
            emotion=self._detect_emotion(social_sentiment),
            narrative=self._identify_narrative(news_sentiment),
            confidence=overall_sentiment["confidence"]
        )
```

```python
# Agente MNEMO (Memo) - Reconocimiento de Patrones

class MnemoAgent(BaseAgent):
    """Reconoce patrones y gestiona memoria"""
    
    async def analyze(self, tv_data: Dict[str, Any]) -> PatternRecognition:
        """
        Reconoce patrones Turtle Soup y otros
        
        Input: Datos de TradingView MCP
        Output: Patrones reconocidos
        """
        # Buscar patrones Turtle Soup
        turtle_soup = self._detect_turtle_soup(tv_data)
        
        # Buscar patrones históricos similares
        similar_patterns = await self._search_similar_patterns(
            tv_data["indicators_background"],
            tv_data["price"]
        )
        
        # Recuperar resultados históricos
        historical_outcomes = await self._get_historical_outcomes(similar_patterns)
        
        return PatternRecognition(
            symbol=tv_data["symbol"],
            turtle_soup_detected=turtle_soup["detected"],
            turtle_soup_type=turtle_soup.get("type"),  # "long" o "short"
            similar_patterns_count=len(similar_patterns),
            historical_success_rate=self._calc_success_rate(historical_outcomes),
            confidence=turtle_soup.get("confidence", 0.0)
        )
    
    def _detect_turtle_soup(self, tv_data: Dict) -> Dict[str, Any]:
        """Detecta setup Turtle Soup"""
        price = tv_data["price"]
        indicators = tv_data["indicators_background"]
        rsi = tv_data["indicators_visible"]["rsi"]
        
        # Condiciones Turtle Soup Long
        if rsi < 30 and price < indicators["low20"]:
            return {
                "detected": True,
                "type": "long",
                "confidence": 0.75
            }
        
        # Condiciones Turtle Soup Short
        if rsi > 70 and price > indicators["high20"]:
            return {
                "detected": True,
                "type": "short",
                "confidence": 0.75
            }
        
        return {"detected": False}
```

---

### Fase 3: Consenso Multi-Agente (ORÁCULO)

```python
# Oraculo - Motor RAG para Consenso

class OraculoRAGEngine:
    """Genera consenso desde múltiples agentes"""
    
    async def generate_consensus(
        self,
        prophet_pred: Prediction,
        sentiment_analysis: SentimentAnalysis,
        pattern_recognition: PatternRecognition,
        tv_data: Dict[str, Any]
    ) -> ConsensusSignal:
        """
        Genera señal de consenso ponderada
        
        Input: Señales individuales de agentes
        Output: Señal de consenso con confianza
        """
        # 1. Recuperar knowledge histórica
        historical_context = await self.knowledge_retriever.retrieve({
            "query": f"Turtle Soup {tv_data['symbol']} RSI {tv_data['indicators_visible']['rsi']}",
            "collection": "trading_outcomes",
            "top_k": 10
        })
        
        # 2. Calcular pesos de agentes basado en contexto
        weights = self._calculate_agent_weights(historical_context)
        
        # 3. Combinar señales con pesos
        signal_scores = {
            "prophet": self._normalize_prediction(prophet_pred),
            "sentiment": sentiment_analysis.overall_sentiment,
            "pattern": pattern_recognition.historical_success_rate
        }
        
        weighted_signal = sum(
            signal_scores[agent] * weights[agent]
            for agent in signal_scores
        )
        
        # 4. Determinar acción
        if weighted_signal > 0.7:
            action = "buy"
        elif weighted_signal < -0.7:
            action = "sell"
        else:
            action = "hold"
        
        # 5. Calcular confianza agregada
        confidence = self._aggregate_confidence([
            prophet_pred.confidence_score,
            sentiment_analysis.confidence,
            pattern_recognition.confidence
        ])
        
        return ConsensusSignal(
            symbol=tv_data["symbol"],
            action=action,
            confidence=confidence,
            weighted_score=weighted_signal,
            agent_weights=weights,
            individual_signals=signal_scores,
            timestamp=datetime.utcnow()
        )
```

---

### Fase 4: Ejecución (scalper-run.js modificado)

```javascript
// scalper-run.js - VERSIÓN CON INTEGRACIÓN DE AGENTES

// ==========================================
// NUEVO: Módulo de integración con agentes
// ==========================================

async function getAgentConsensus(symbol) {
  console.log(`\n🤖 Obteniendo consenso de agentes multi-agent...`);
  
  try {
    // 1. Capturar datos de TradingView MCP
    const tvData = await getTradingViewData(symbol);
    
    // 2. Enviar a agentes Python (vía API REST)
    const agentResponses = await Promise.all([
      fetchAgentPrediction('prophet', tvData),      // Predicción PROPHET
      fetchAgentSentiment('sentiment', tvData),     // Sentimiento
      fetchAgentPattern('mnemo', tvData)            // Reconocimiento MNEMO
    ]);
    
    // 3. Enviar a ORÁCULO para consenso
    const consensus = await fetchOraculoConsensus({
      prophet: agentResponses[0],
      sentiment: agentResponses[1],
      pattern: agentResponses[2],
      tv_data: tvData
    });
    
    console.log(`  📊 Consenso: ${consensus.action} (confianza: ${(consensus.confidence * 100).toFixed(1)}%)`);
    console.log(`  📈 Peso agentes:`, consensus.agent_weights);
    console.log(`  🎯 Señales individuales:`, consensus.individual_signals);
    
    return consensus;
    
  } catch (error) {
    console.error(`  ❌ Error obteniendo consenso:`, error.message);
    return null;
  }
}

// ==========================================
// NUEVO: Función para capturar datos de TradingView MCP
// ==========================================

async function getTradingViewData(symbol) {
  // Usar herramientas MCP de TradingView
  const chartState = await mcp_tradingview__chart_get_state();
  const studyValues = await mcp_tradingview__data_get_study_values();
  const quote = await mcp_tradingview__quote_get({ symbol });
  const ohlcv = await mcp_tradingview__data_get_ohlcv({ count: 100, summary: true });
  
  // Calcular indicadores background
  const indicatorsBackground = calcBackgroundIndicators(ohlcv.bars);
  
  return {
    timestamp: new Date().toISOString(),
    symbol: chartState.symbol,
    timeframe: chartState.timeframe,
    price: quote.last,
    ohlc: { open: quote.open, high: quote.high, low: quote.low, close: quote.close },
    volume: quote.volume,
    indicators_visible: {
      rsi: studyValues.RSI,
      volume: studyValues.Volume
    },
    indicators_background: indicatorsBackground
  };
}

// ==========================================
// NUEVO: Cálculo de indicadores en background
// ==========================================

function calcBackgroundIndicators(candles) {
  // VWAP
  const vwap = calcVWAP(candles);
  
  // EMA 8
  const ema8 = calcEMA(candles.map(c => c.close), 8);
  
  // High/Low 20
  const high20 = Math.max(...candles.slice(-20).map(c => c.high));
  const low20 = Math.min(...candles.slice(-20).map(c => c.low));
  
  return { vwap, ema8, high20, low20 };
}

function calcVWAP(candles) {
  let cumTPV = 0, cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol === 0 ? candles[candles.length - 1].close : cumTPV / cumVol;
}

function calcEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// ==========================================
// MODIFICADO: Main loop con consenso de agentes
// ==========================================

async function main() {
  console.log(`\n🚀 Iniciando trading con consenso multi-agent...\n`);
  
  while (true) {
    try {
      // ANTES: Decisión autónoma
      // const signal = getSignal(candles);
      
      // AHORA: Consenso de agentes
      const consensus = await getAgentConsensus(SYMBOL);
      
      if (!consensus) {
        console.log(`  ⚠️  No se pudo obtener consenso, esperando...`);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }
      
      // Validar confianza mínima
      if (consensus.confidence < 0.7) {
        console.log(`  ⚠️  Confianza baja (${(consensus.confidence * 100).toFixed(1)}%), esperar...`);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }
      
      // Ejecutar según acción del consenso
      if (consensus.action === "buy" && !positionOpen) {
        console.log(`  ✅ CONSENSO: COMPRAR ${SYMBOL}`);
        await executeBuy(consensus);
        
      } else if (consensus.action === "sell" && positionOpen) {
        console.log(`  ✅ CONSENSO: VENDER ${SYMBOL}`);
        await executeSell(consensus);
        
      } else {
        console.log(`  ⏸️  CONSENSO: MANTENER (action: ${consensus.action})`);
      }
      
      // Esperar 10 segundos antes de siguiente análisis
      await new Promise(r => setTimeout(r, 10000));
      
    } catch (error) {
      console.error(`\n❌ Error en main loop:`, error);
      await new Promise(r => setTimeout(r, 30000));
    }
  }
}

// ==========================================
// NUEVO: Ejecución con metadata de consenso
// ==========================================

async function executeBuy(consensus) {
  const buyResult = await placeOrder("buy", LOT_SIZE);
  
  if (buyResult.ok) {
    console.log(`  ✅ Compra ejecutada: ${LOT_SIZE} XRP @ $${consensus.price}`);
    
    // Guardar metadata de consenso para análisis posterior
    positionMeta = {
      ...positionMeta,
      buy_consensus: consensus,
      buy_timestamp: new Date().toISOString()
    };
  }
}

async function executeSell(consensus) {
  const intendedQty = positionMeta.quantity;
  const validatedQty = await validateAndPrepareSell(intendedQty);
  
  if (validatedQty > 0) {
    const sellResult = await placeSellWithRetry(validatedQty);
    
    if (sellResult.ok) {
      console.log(`  ✅ Venta ejecutada: ${sellResult.soldQty} XRP`);
      
      // Calcular P&L y actualizar knowledge base de ORÁCULO
      await updateOraculoKnowledge(positionMeta, sellResult, consensus);
    }
  }
}

// ==========================================
// NUEVO: Actualizar knowledge base de ORÁCULO
// ==========================================

async function updateOraculoKnowledge(positionMeta, sellResult, consensus) {
  const outcome = {
    symbol: SYMBOL,
    entry_price: positionMeta.buy_price,
    exit_price: sellResult.soldQty * consensus.price,
    buy_consensus: positionMeta.buy_consensus,
    sell_consensus: consensus,
    pnl: sellResult.soldQty * consensus.price - positionMeta.quantity * positionMeta.buy_price,
    timestamp: new Date().toISOString()
  };
  
  // Enviar a ORÁCULO para aprendizaje
  await fetch('http://localhost:8000/oraculo/learn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outcome)
  });
  
  console.log(`  📚 Outcome enviado a ORÁCULO para aprendizaje`);
}
```

---

## 🔌 API Endpoints Requeridos

### Python Flask/FastAPI Server

```python
# api_server.py

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

@app.post("/agents/prophet/predict")
async def prophet_predict(tv_data: TradingViewData):
    """Endpoint para predicción PROPHET"""
    prophet = ProphetAgent()
    prediction = await prophet.analyze(tv_data)
    return prediction

@app.post("/agents/sentiment/analyze")
async def sentiment_analyze(tv_data: TradingViewData):
    """Endpoint para análisis de sentimiento"""
    sentiment = SentimentAgent()
    analysis = await sentiment.analyze(tv_data)
    return analysis

@app.post("/agents/mnemo/pattern")
async def mnemo_pattern(tv_data: TradingViewData):
    """Endpoint para reconocimiento de patrones"""
    mnemo = MnemoAgent()
    pattern = await mnemo.analyze(tv_data)
    return pattern

@app.post("/oraculo/consensus")
async def oraculo_consensus(signals: AgentSignals):
    """Endpoint para consenso ORÁCULO"""
    oraculo = OraculoRAGEngine()
    consensus = await oraculo.generate_consensus(
        signals.prophet,
        signals.sentiment,
        signals.pattern,
        signals.tv_data
    )
    return consensus

@app.post("/oraculo/learn")
async def oraculo_learn(outcome: TradeOutcome):
    """Endpoint para aprendizaje de ORÁCULO"""
    oraculo = OraculoRAGEngine()
    await oraculo.learn_from_outcome(outcome)
    return {"status": "learned"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## 📅 Plan de Implementación (4 Semanas)

### Semana 1-2: Integración Básica

**Día 1-3:**
- [ ] Crear API server Flask/FastAPI (`api_server.py`)
- [ ] Implementar endpoints básicos para agentes
- [ ] Modificar `scalper-run.js` para usar consenso
- [ ] Testing de integración con TradingView MCP

**Día 4-7:**
- [ ] Implementar detección Turtle Soup en MNEMO
- [ ] Conectar PROPHET para predicciones básicas
- [ ] Conectar SENTIMENT para análisis de sentimiento
- [ ] Implementar ORÁCULO consenso simple (promedio ponderado)

**Entregables:**
- ✅ API server funcional
- ✅ `scalper-run.js` modificado
- ✅ Primer consenso multi-agent ejecutado

### Semana 3-4: Optimización

**Día 8-10:**
- [ ] Optimizar pesos de agentes basado en resultados
- [ ] Implementar aprendizaje en ORÁCULO
- [ ] Añadir más patrones a MNEMO
- [ ] Métricas de performance

**Día 11-14:**
- [ ] Backtesting con datos históricos
- [ ] Ajuste de hiperparámetros
- [ ] Documentación completa
- [ ] Preparación para producción

**Entregables:**
- ✅ Sistema optimizado
- ✅ Documentación completa
- ✅ Ready para migración a BitGet

---

## 📊 Métricas de Éxito

| Métrica | Target | Semana 1 | Semana 2 | Semana 3 | Semana 4 |
|---------|--------|----------|----------|----------|----------|
| **Latencia total** | <500ms | TBD | TBD | TBD | TBD |
| **Confianza promedio** | >70% | TBD | TBD | TBD | TBD |
| **Tasa éxito Turtle Soup** | >65% | TBD | TBD | TBD | TBD |
| **Aprendizaje ORÁCULO** | 100+ outcomes | 0 | 25 | 50 | 100 |
| **Agentes activos** | 3/3 | 1 | 2 | 3 | 3 |

---

## 🎯 Ventajas de la Integración

### 1. **Mejor Toma de Decisiones**
- Múltiples perspectivas (predicción + sentimiento + patrones)
- Consenso ponderado reduce sesgos individuales
- Aprendizaje continuo mejora con el tiempo

### 2. **Validación en Tiempo Real**
- TradingView MCP provee datos vivos
- Agentes analizan contexto actual
- ORÁCULO recupera knowledge histórica relevante

### 3. **Adaptabilidad**
- Sistema aprende de cada operación
- Pesos de agentes se ajustan automáticamente
- Nuevos patrones se detectan y aprenden

### 4. **Transparencia**
- Cada decisión tiene justificación multi-agent
- Métricas de confianza claras
- Trazabilidad completa de decisiones

---

## 🚀 Próximos Pasos Inmediatos

1. ✅ **Documentar arquitectura** (COMPLETADO)
2. ⏳ **Crear API server** Python (Día 1-3, Semana 1)
3. ⏳ **Modificar scalper-run.js** (Día 1-3, Semana 1)
4. ⏳ **Primer consenso ejecutado** (Día 4-7, Semana 1)
5. ⏳ **Optimización y aprendizaje** (Semana 2-4)

---

**Estado:** ✅ Arquitectura diseñada y lista para implementación
**Documentación relacionada:**
- `PLAN_4_SEMANAS.md` - Roadmap de pilotaje
- `SETUP_OPTIMIZADO.md` - Configuración TradingView 2 indicadores
- `REPORTE_FINAL.md` - Correcciones BitGet implementadas
