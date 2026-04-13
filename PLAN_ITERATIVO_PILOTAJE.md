# 📊 PLAN ITERATIVO - Pilotaje con Implementación Gradual

**Fecha:** 2026-04-09
**Ciclo:** Datos → Optimización → Implementación → Verificación → Mejora
**Duración:** 4 semanas
**Enfoque:** Data-driven, implementar solo lo que los datos justifiquen

---

## 🎯 Filosofía: Implementación Basada en Datos

### Principio Clave

**"No implementar funcionalidades de agentes hasta que los datos demuestren su valor"**

Cada agente se implementa SOLO si:
1. ✅ Los datos del pilotaje muestran una necesidad clara
2. ✅ El análisis indica que mejoraría la tasa de éxito
3. ✅ La verificación post-implementación confirma mejora

---

## 📅 Ciclo Iterativo Semanal

### Semana 1: Datos + Setup Básico

**Objetivo:** Recopilar datos baseline SIN agentes

**Día 1-2: Configuración**
- [x] TradingView configurado (RSI + Volume visibles)
- [x] Documentación arquitectura creada
- [ ] Iniciar monitoreo BTCUSDT 5m
- [ ] Capturar datos básicos cada 10 minutos

**Día 3-5: Recolección de Datos**
```
Datos a capturar (sin agentes):
- Precio, volumen, RSI cada 10 min
- VWAP, EMA, High/Low calculados en background
- Patrones Turtle Soup identificados manualmente
- Resultados de operaciones (si las hubiera)
```

**Día 6-7: Análisis Semanal 1**
```javascript
// Preguntas clave:
1. ¿Cuántos setups Turtle Soup aparecieron?
2. ¿Cuál fue la tasa de éxito manual?
3. ¿Qué indicadores fueron más predictivos?
4. ¿Dónde fallaron las entradas manuales?
5. ¿Qué patrón NO estamos capturando?
```

**Entregables:**
- 📊 50-100 data points capturados
- 📈 Análisis: qué funciona, qué no
- 🎯 Recomendación: qué agente implementar primero

---

### Semana 2: Primera Implementación (Mínimo Viable)

**Objetivo:** Implementar 1 agente basado en datos Semana 1

**Día 8-10: Análisis + Decisión**
```
Basado en datos Semana 1, elegir UNO:

Opción A: MNEMO (Memo) - Si patrones Turtle Soup son frecuentes
Opción B: PROPHET - Si predicciones de precio añaden valor
Opción C: SENTIMENT - Si sentimiento explica fallos
```

**Día 11-12: Implementación Mínima**
```javascript
// Ejemplo: Si datos muestran MNEMO es prioritario

Implementar SOLO:
✅ Detección automática Turtle Soup
✅ Búsqueda de patrones similares históricos
✅ Tasa de éxito histórica del patrón

NO implementar aún:
❌ ORÁCULO consenso (esperar más agentes)
❌ PROPHET predicciones (no priorizado)
❌ SENTIMENT análisis (no priorizado)
```

**Día 13-14: Verificación**
```javascript
// Métricas antes vs después
Antes MNEMO:
- Detección Turtle Soup: Manual
- Tasa éxito: X%

Después MNEMO:
- Detección Turtle Soup: Automática
- Tasa éxito: Y%

¿Mejora? (Y - X) > 5%
✅ Mantener MNEMO
❌ Descartar y probar otro agente
```

**Entregables:**
- ✅ 1 agente implementado
- 📊 Comparación antes/después
- 🎯 Decisión: mantener o descartar

---

### Semana 3: Segunda Implementación (Si Hay Valor)

**Objetivo:** Implementar segundo agente SI datos lo justifican

**Día 15-17: Análisis Semana 2**
```
Preguntas:
1. ¿El agente 1 mejoró la tasa de éxito? (Sí/No)
2. ¿Qué gaps quedan? (Qué seguimos fallando)
3. ¿Qué agente podría ayudar?
4. ¿El costo de implementación vale el beneficio?
```

**Día 18-19: Implementación Agente 2**
```javascript
// Ejemplo: Si MNEMO funcionó, añadir PROPHET

Implementar:
✅ PROPHET predicciones básicas
✅ Ensemble simple (MNEMO + PROPHET)
✅ Umbrales de decisión

NO implementar aún:
❌ ORÁCULO consenso completo (esperar)
❌ SENTIMENT (no priorizado por datos)
```

**Día 20-21: Verificación**
```javascript
// Comparar 3 escenarios
1. Solo TradingView MCP (baseline)
2. TradingView + Agente 1
3. TradingView + Agente 1 + Agente 2

¿Mejora incremental?
✅ Continuar implementación
❌ Detener y analizar
```

**Entregables:**
- ✅ 2 agentes implementados (si hay valor)
- 📊 Análisis de mejora incremental
- 🎯 Decisión: continuar o no

---

### Semana 4: Consolidación u Optimización

**Caso A: 2 agentes mostraron valor**
```
Implementar:
✅ ORÁCULO consenso (por fin tiene sentido)
✅ Ensemble completo de 3 agentes
✅ Aprendizaje automático

Meta: Sistema multi-agent completo
```

**Caso B: Solo 1 agente mostró valor**
```
Optimizar:
✅ Ajustar parámetros del agente exitoso
✅ Añadir más patrones/features
✅ Documentar por qué otros agentes no ayudaron

Meta: Maximizar valor de lo que funciona
```

**Caso C: Ningún agente mostró valor**
```
Análisis:
✅ ¿Por qué fallaron?
✅ ¿Fue implementación o concepto?
✅ ¿Qué aprendimos?

Meta: Aprendizaje para próximos intentos
```

**Entregables:**
- ✅ Sistema optimizado (o conclusiones)
- 📚 Documentación de lecciones
- 🎯 Recomendación para producción

---

## 🔄 Ciclo Detallado: Datos → Implementación

### Fase 1: DATOS (2-3 días)

**Qué capturar:**
```javascript
// data_collector.js

const dataPoint = {
  timestamp: new Date().toISOString(),
  symbol: "BTCUSDT",
  timeframe: "5m",
  
  // TradingView MCP
  price: quote.last,
  rsi: studyValues.RSI,
  volume: quote.volume,
  vwap: calcVWAP(candles),
  ema8: calcEMA(closes, 8),
  high20: max(candles.slice(-20).high),
  low20: min(candles.slice(-20).low),
  
  // Análisis manual
  turtle_soup_detected: true/false,
  turtle_soup_type: "long"/"short",
  manual_signal: "buy"/"sell"/"hold",
  
  // Si se ejecutó operación
  action_taken: "buy"/"sell"/null,
  action_result: "success"/"fail"/null,
  pnl: null,
  
  // Contexto
  notes: "Ruptura falsa en 71337, volumen alto"
};
```

**Frecuencia:** Cada 10 minutos (600 segundos)

**Formato:** JSON array en `logs/week1/data_raw.json`

---

### Fase 2: ANÁLISIS (1 día)

**Qué analizar:**
```python
# analyze_week1.py

import pandas as pd
import json

# Cargar datos
with open('logs/week1/data_raw.json') as f:
    data = json.load(f)

df = pd.DataFrame(data)

# Preguntas clave
print("1. Setups Turtle Soup identificados:")
print(df['turtle_soup_detected'].sum())

print("\n2. Distribución por tipo:")
print(df['turtle_soup_type'].value_counts())

print("\n3. Tasa éxito manual:")
success_rate = df[df['action_taken'].notna()]['action_result'] == 'success'
print(success_rate.mean())

print("\n4. Indicadores más predictivos:")
correlations = df[['rsi', 'volume', 'vwap', 'turtle_soup_detected']].corr()
print(correlations['turtle_soup_detected'].sort_values(ascending=False))

print("\n5. Patrones de fallo:")
failures = df[df['action_result'] == 'fail']
print(f"Fallos cuando RSI: {failures['rsi'].mean():.2f}")
print(f"Fallos cuando Volume: {failures['volume'].mean():.2f}")
```

**Output:** `logs/week1/analysis.md`

---

### Fase 3: DECISIÓN (1 día)

**Matriz de Decisión:**
```javascript
// decision_matrix.js

const decision = {
  // Si MNEMO tiene sentido
  implement_mnemo: turtle_soup_count >= 10 && success_rate < 0.5,
  
  // Si PROPHET tiene sentido
  implement_prophet: price_predictions_would_help == true,
  
  // Si SENTIMENT tiene sentido
  implement_sentiment: failures_correlate_with_news == true,
  
  // Esperar más datos
  wait_for_more_data: turtle_soup_count < 10
};

console.log("Decisión basada en datos:", decision);
```

---

### Fase 4: IMPLEMENTACIÓN (2-3 días)

**Ejemplo: Implementar MNEMO primero**

```python
# agents/mnemo_simple.py

class MnemoAgentSimple:
    """Versión mínima viable"""
    
    def __init__(self):
        self.patterns = []
    
    def detect_turtle_soup(self, tv_data):
        """Detecta setup básico"""
        rsi = tv_data['indicators_visible']['rsi']
        price = tv_data['price']
        low20 = tv_data['indicators_background']['low20']
        
        if rsi < 30 and price < low20:
            return {
                'detected': True,
                'type': 'long',
                'confidence': 0.75
            }
        
        return {'detected': False}
    
    def search_similar_patterns(self, current_data):
        """Busca en historial"""
        # Versión simple: solo datos de esta semana
        similar = [p for p in self.patterns 
                  if abs(p['rsi'] - current_data['rsi']) < 10]
        
        return {
            'count': len(similar),
            'success_rate': sum(s['success'] for s in similar) / len(similar) if similar else 0
        }
```

**Integración simple:**
```javascript
// scalper-run.js - VERSIÓN MINIMA

async function main() {
  while (true) {
    // 1. Capturar datos TradingView
    const tvData = await getTradingViewData(SYMBOL);
    
    // 2. MNEMO: Detectar patrón
    const mnemoResult = await fetchAgentPattern('mnemo', tvData);
    
    if (mnemoResult.detected && mnemoResult.confidence > 0.7) {
      console.log(`✅ MNEMO: Turtle Soup ${mnemoResult.type}`);
      
      // 3. Ejecutar si confianza alta
      if (mnemoResult.type === 'long' && !positionOpen) {
        await executeBuy();
      }
    }
    
    await new Promise(r => setTimeout(r, 10000));
  }
}
```

---

### Fase 5: VERIFICACIÓN (2-3 días)

**Métricas:**
```javascript
// verification.js

const metrics = {
  // Antes de implementar
  before: {
    detection_rate: 0.5,  // 50% de patrones detectados manualmente
    success_rate: 0.4,     // 40% tasa de éxito
    false_positives: 0.3    // 30% falsas señales
  },
  
  // Después de implementar
  after: {
    detection_rate: 0.9,  // 90% detectados automáticamente
    success_rate: 0.6,     // 60% tasa de éxito
    false_positives: 0.2    // 20% falsas señales
  },
  
  // Mejora
  improvement: {
    detection: 0.9 - 0.5,  // +40%
    success: 0.6 - 0.4,    // +20%
    false_positives: 0.3 - 0.2  // -10%
  }
};

// Decisión
const should_keep = metrics.improvement.success > 0.15;
console.log("¿Mantener agente?", should_keep ? "✅ SÍ" : "❌ NO");
```

---

## 📊 Matriz de Priorización de Agentes

### Agente 1: MNEMO (Memo) - Prioridad ALTA

**Implementar SI:**
- ✅ Turtle Soup aparece ≥10 veces/semana
- ✅ Tasa éxito manual <60%
- ✅ Fallos por no detectar patrones a tiempo

**Valor esperado:**
- Detección automática: +40%
- Tasa éxito: +15-20%
- Latencia: <100ms

**Costo de implementación:** BAJO (solo comparación de patrones)

---

### Agente 2: PROPHET - Prioridad MEDIA

**Implementar SI:**
- ✅ MNEMO ya funciona
- ✅ Predicciones de precio correlacionan con éxito >0.6
- ✅ Fallos por entrada en momento equivocado

**Valor esperado:**
- Timing de entradas: +10-15%
- Tasa éxito: +5-10%
- Latencia: +200ms (modelos LSTM)

**Costo de implementación:** MEDIO (requiere modelos entrenados)

---

### Agente 3: SENTIMENT - Prioridad BAJA (al inicio)

**Implementar SI:**
- ✅ MNEMO + PROPHET ya funcionan
- ✅ Noticias sociales correlacionan con movimientos >0.7
- ✅ Fallos por eventos de mercado no técnicos

**Valor esperado:**
- Evitar eventos de riesgo: +5-10%
- Tasa éxito: +3-5%
- Latencia: +150ms (APIs externas)

**Costo de implementación:** MEDIO (APIs Twitter, News)

---

### Agente 4: ORÁCULO (RAG Consenso) - Prioridad VARIABLE

**Implementar SOLO cuando:**
- ✅ Mínimo 2 agentes activos
- ✅ Consenso mejora vs agente individual >10%
- ✅ Knowledge base suficiente (>100 outcomes)

**Valor esperado:**
- Tasa éxito: +10-15% (ensemble effect)
- Latencia: +50ms
- Robustez: ALTA

**Costo de implementación:** ALTO (RAG, vector DB, embeddings)

---

## 🎯 Plan de Contingencia

### Si ningún agente muestra valor en Semana 2:

**Opción A: Optimizar lo básico**
- Mejorar umbrales RSI/Volume
- Añadir filtros de volatilidad
- Optimizar Stop Loss dinámico

**Opción B: Cambiar de enfoque**
- Probar estrategia diferente (no Turtle Soup)
- Cambiar timeframe (5m → 15m)
- Cambiar symbol (BTC → ETH/SOL)

**Opción C: Aceptar limitaciones**
- Trading manual + señales automatizadas
- No todos los problemas requieren AI compleja

---

## 📈 Métricas de Éxito del Enfoque Iterativo

| Semana | Agentes Activos | Tasa Éxito | Mejora vs Baseline | Decisión |
|--------|----------------|------------|---------------------|----------|
| **1** | 0 (datos) | 40% | - | - |
| **2** | 1 (MNEMO) | 55% | +15% | ¿Mantener? |
| **3** | 2 (MNEMO + PROPHET) | 68% | +28% | ¿Continuar? |
| **4** | 3 (Full) | 75%+ | +35% | ¿Producción? |

**Criterios de continuación:**
- Mejora ≥10% → Continuar
- Mejora 5-10% → Optimizar
- Mejora <5% → Descartar

---

## 🚀 Ventajas del Enfoque Iterativo

### 1. **Riesgo Minimizado**
- No invertir tiempo en funcionalidades innecesarias
- Podemos detener en cualquier momento
- Cada decisión está respaldada por datos

### 2. **Aprendizaje Rápido**
- Feedback en 1 semana, no 1 mes
- Ajustes inmediatos basados en realidad
- Menos tiempo perdido en hipótesis incorrectas

### 3. **Optimización de Recursos**
- Implementar solo lo que añade valor
- Tiempo invertido = retorno medible
- Fácil de justificar cada paso

### 4. **Transparencia Total**
- Sabemos exactamente qué funciona y qué no
- Cada agente tiene justificación clara
- No hay "cajas negras"

---

## 📋 Checklist Semanal

### Semana 1: Datos
- [ ] TradingView MCP monitoreando 24/7
- [ ] Datos capturados cada 10 min
- [ ] 100+ data points acumulados
- [ ] Análisis completo documentado
- [ ] Decisión: qué agente primero

### Semana 2: Agente 1
- [ ] Agente 1 implementado
- [ ] Integración con scalper-run.js
- [ ] 3-5 días de verificación
- [ ] Métricas antes/después
- [ ] Decisión: mantener o descartar

### Semana 3: Agente 2 (si aplica)
- [ ] Agente 2 implementado
- [ ] Ensemble con agente 1
- [ ] 3-5 días de verificación
- [ ] Análisis de mejora incremental
- [ ] Decisión: continuar o no

### Semana 4: Consolidación
- [ ] Sistema final optimizado
- [ ] Documentación completa
- [ ] Lecciones aprendidas
- [ ] Recomendación producción

---

## 💡 Lecciones Esperadas

### Qué Aprenderemos:

**Semana 1:**
- ¿Turtle Soup es viable en BTCUSDT 5m?
- ¿Qué indicadores son realmente predictivos?
- ¿Cuál es la tasa éxito baseline?

**Semana 2:**
- ¿La detección automática añade valor?
- ¿Los patrones históricos ayudan?
- ¿Qué tan buena es la detección MNEMO?

**Semana 3:**
- ¿Las predicciones mejoran el timing?
- ¿El ensemble de agentes supera a individuales?
- ¿Dónde están los límites del sistema?

**Semana 4:**
- ¿Vale la pena la complejidad adicional?
- ¿Qué tan lejos podemos llegar?
- ¿Estamos ready para producción con BitGet?

---

## 🎯 Estado Actual

**Semana:** 1 (Día 1)
**Fase:** Configuración + Inicio de captura de datos
**Agentes activos:** 0 (baseline)
**Próximo hito:** Análisis Semana 1 (Día 7)

---

**¿Listo para comenzar el ciclo iterativo?**
**Primer paso: Iniciar captura de datos con TradingView MCP**
