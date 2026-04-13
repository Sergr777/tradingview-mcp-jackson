# 📊 PLAN MODIFICADO - 2 Semanas de Datos Baseline

**Fecha:** 2026-04-09
**Decisión:** 2 semanas de datos antes de implementar cualquier agente
**Justificación:** Mayor confianza estadística, patrones más claros

---

## 🎯 Nuevo Enfoque: Más Datos Primero

### Por qué 2 semanas en lugar de 1:

**Ventajas:**
- ✅ **200-300 data points** en lugar de 100-150 (más robusto estadísticamente)
- ✅ **20-40 patrones Turtle Soup** esperados (vs 10-20 en 1 semana)
- ✅ **Mayor variabilidad de mercado** capturada (diferentes regímenes)
- ✅ **Más confianza en decisiones** (menos riesgo de falso positivo)
- ✅ **Mejor identificación de gaps** (qué realmente nos falta)

**Desventajas:**
- ⏱️ Implementación de agentes se retrasa 1 semana
- ⏱️ Time to producción potencialmente más largo

**Veredicto:** Las ventajas superan las desventajas. Mejor esperar y tener datos sólidos.

---

## 📅 Plan Actualizado (4 Semanas Totales)

### Semana 1-2: Captura de Datos (SIN agentes)

**Objetivo:** Acumular 200-300 data points de calidad

**Día 1-3:**
- [x] Setup TradingView (RSI + Volume visibles)
- [x] Scripts creados (data_collector.js, analyze_week1.js)
- [ ] Iniciar data_collector.js 24/7
- [ ] Monitorear BTCUSDT 5m continuamente

**Día 4-10:**
- [ ] Captura automática cada 10 minutos
- [ ] Registro manual de Turtle Soup patrones
- [ ] Verificación diaria de datos capturados
- [ ] Documentar observaciones cualitativas

**Día 11-14:**
- [ ] Continuar captura
- [ ] Revisión intermedia (Día 10-11)
- [ ] Ajustes si es necesario
- [ ] Preparar análisis final

**Entregables Semana 1-2:**
- 📊 200-300 data points capturados
- 🐢 20-40 patrones Turtle Soup documentados
- 📈 Cobertura >80% en RSI/Volume
- 📄 Log completo en `logs/week1/data_raw.json` y `logs/week2/data_raw.json`

---

### Semana 2: Análisis y Decisión

**Objetivo:** Analizar 2 semanas de datos y decidir qué implementar

**Día 15 (Análisis Completo):**
```bash
# Ejecutar análisis de 2 semanas
node analyze_two_weeks.js
```

**Preguntas Clave:**
1. **Frecuencia de patrones:**
   - ¿Cuántos Turtle Soup aparecieron?
   - ¿Es suficientemente frecuente (>20 en 2 semanas)?
   - ¿O es muy raro?

2. **Tasa éxito manual:**
   - ¿Cuál fue la tasa éxito de señales manuales?
   - ¿Es >60% (bueno) o <40% (necesita ayuda)?

3. **Indicadores más predictivos:**
   - ¿RSI <30 correlaciona con Turtle Soup long?
   - ¿Volumen altos confirman rupturas?
   - ¿Qué combinación funciona mejor?

4. **Gaps de detección:**
   - ¿Qué patrones NO detectamos manualmente?
   - ¿Dónde fallamos más frecuentemente?
   - ¿Qué agente ayudaría más?

5. **Criterios de implementación:**

| Criterio | Umbral | Decisión |
|----------|---------|----------|
| **Turtle Soup frecuencia** | ≥20 en 2 semanas | ✅ Implementar MNEMO |
| **Turtle Soup frecuencia** | 10-19 en 2 semanas | ⚠️ Considerar MNEMO |
| **Turtle Soup frecuencia** | <10 en 2 semanas | ❌ Esperar más datos/cambiar estrategia |
| **Tasa éxito manual** | <50% | ✅ Agentes pueden ayudar |
| **Tasa éxito manual** | 50-65% | ⚠️ Agentes solo si mejora clara |
| **Tasa éxito manual** | >65% | ❌ Quizás no necesitemos agentes aún |

**Día 16-17:**
- [ ] Documentar hallazgos del análisis
- [ ] Crear matriz de decisión
- [ ] Identificar agente prioritario
- [ ] Estimar costo/beneficio de implementación

**Día 17 (Decisión Final):**
- [ ] Reunión de decisión (o auto-revisión)
- [ ] Elegir agente a implementar (MNEMO/PROPHET/SENTIMENT)
- [ ] O decidir NO implementar aún
- [ ] Planificar Semana 3-4

---

### Semana 3: Implementación (SI se justifica)

**Solo SI datos de 2 semanas justifican implementación**

**Caso A: Implementar MNEMO (Prioridad Alta)**
```javascript
// Si 20+ Turtle Soup en 2 semanas
- Implementar detección automática
- Buscar patrones similares históricos
- Calcular tasa éxito histórica
- Verificar mejora ≥15%
```

**Caso B: Implementar PROPHET (Prioridad Media)**
```javascript
// Si predicciones de precio correlacionan >0.6
- Implementar predicciones LSTM/GRU
- Ensemble con datos técnicos
- Mejorar timing de entradas
- Verificar mejora ≥10%
```

**Caso C: NO Implementar (Optimizar lo básico)**
```javascript
// Si patrones son muy raros (<10 en 2 semanas)
- Optimizar umbrales RSI/Volume
- Añadir filtros de volatilidad
- Implementar Stop Loss dinámico
- NO usar agentes complejos aún
```

**Día 18-21:**
- [ ] Implementar agente elegido (o optimización básica)
- [ ] Integrar con scalper-run.js
- [ ] Testing 3-4 días
- [ ] Verificación antes/después

---

### Semana 4: Consolidación u Optimización

**Si implementación Semana 3 fue exitosa:**
- [ ] Añadir segundo agente si hay valor
- [ ] Implementar ORÁCULO consenso
- [ ] Optimizar sistema completo
- [ ] Preparar migración a BitGet

**Si NO hubo implementación:**
- [ ] Análisis de por qué no se justificó
- [ ] ¿Cambio de estrategia necesario?
- [ ] ¿Diferente timeframe/symbol?
- [ ] Documentar lecciones

---

## 📊 Análisis de Dos Semanas

### Script: analyze_two_weeks.js

```javascript
/**
 * Analiza datos de 2 semanas completas
 * Genera recomendaciones detalladas
 */

function analyzeTwoWeeks() {
  // Cargar datos de ambas semanas
  const week1 = loadJSON('logs/week1/data_raw.json');
  const week2 = loadJSON('logs/week2/data_raw.json');
  const allData = [...week1, ...week2];

  console.log(`\n📊 ANÁLISIS DE 2 SEMANAS`);
  console.log(`Total data points: ${allData.length}`);
  console.log(`Rango: ${allData[0].timestamp} a ${allData[allData.length-1].timestamp}\n`);

  // 1. Frecuencia de Turtle Soup
  const turtlePatterns = allData.filter(d => d.turtle_soup_detected);
  console.log(`🐢 Turtle Soup: ${turtlePatterns.length} patrones`);

  if (turtlePatterns.length >= 20) {
    console.log(`  ✅ FRECUENCIA ALTA - Implementar MNEMO recomendado`);
  } else if (turtlePatterns.length >= 10) {
    console.log(`  ⚠️  FRECUENCIA MEDIA - Considerar MNEMO con cautela`);
  } else {
    console.log(`  ❌ FRECUENCIA BAJA - NO implementar MNEMO aún`);
  }

  // 2. Tasa éxito manual
  const actions = allData.filter(d => d.action_taken !== null);
  if (actions.length > 0) {
    const successRate = actions.filter(d => d.action_result === 'success').length / actions.length;
    console.log(`\n💰 Tasa éxito manual: ${(successRate * 100).toFixed(1)}%`);

    if (successRate < 0.5) {
      console.log(`  ✅ NECESIDAD CLARA - Agentes pueden ayudar significativamente`);
    } else if (successRate < 0.65) {
      console.log(`  ⚠️  NECESIDAD MODERADA - Agentes si mejora clara`);
    } else {
      console.log(`  ❌ SIN NECESIDAD - Sistema manual funciona bien`);
    }
  }

  // 3. Distribución temporal
  const byDay = groupByDay(allData);
  console.log(`\n📅 Distribución por día:`);
  for (const [day, count] of Object.entries(byDay)) {
    console.log(`  ${day}: ${count} data points`);
  }

  // 4. Calidad de datos
  const coverage = {
    price: allData.filter(d => d.price !== null).length / allData.length,
    rsi: allData.filter(d => d.indicators_visible?.rsi !== null).length / allData.length,
    volume: allData.filter(d => d.volume !== null).length / allData.length
  };

  console.log(`\n📈 Cobertura de datos:`);
  console.log(`  Precio: ${(coverage.price * 100).toFixed(1)}%`);
  console.log(`  RSI: ${(coverage.rsi * 100).toFixed(1)}%`);
  console.log(`  Volume: ${(coverage.volume * 100).toFixed(1)}%`);

  if (coverage.rsi < 0.8) {
    console.log(`  ⚠️  Cobertura RSI baja - Mejorar calidad de datos`);
  }

  // 5. Recomendación final
  console.log(`\n🎯 RECOMENDACIÓN FINAL:\n`);

  if (turtlePatterns.length >= 20 && actions.length >= 5) {
    console.log(`  → Implementar MNEMO (Memo) en Semana 3`);
    console.log(`  → Razón: ${turtlePatterns.length} patrones + necesidad clara`);
  } else if (turtlePatterns.length < 10) {
    console.log(`  → NO implementar agentes aún`);
    console.log(`  → Razón: Patrones insuficientes (${turtlePatterns.length} < 10)`);
    console.log(`  → Alternativa: Optimizar umbrales manuales o cambiar estrategia`);
  } else {
    console.log(`  → Evaluar caso por caso - Revisar análisis detallado`);
  }

  return {
    totalDataPoints: allData.length,
    turtleSoupCount: turtlePatterns.length,
    recommendation: determineRecommendation(turtlePatterns.length, actions.length)
  };
}

function determineRecommendation(turtleCount, actionCount) {
  if (turtleCount >= 20) return 'IMPLEMENT_MNEMO';
  if (turtleCount >= 10 && actionCount >= 5) return 'CONSIDER_MNEMO';
  if (turtleCount < 10) return 'WAIT_OR_CHANGE_STRATEGY';
  return 'EVALUATE_CASE_BY_CASE';
}
```

---

## 📋 Matriz de Decisión (2 Semanas)

### Escenario 1: Implementar MNEMO ✅

**Condiciones:**
- Turtle Soup: ≥20 patrones en 2 semanas
- Tasa éxito manual: <65%
- Cobertura datos: >70%

**Plan Semana 3-4:**
1. Implementar MNEMO simple
2. Verificar mejora ≥15%
3. Si éxito, considerar PROPHET
4. Si no, optimizar MNEMO

---

### Escenario 2: Esperar más datos ⏸️

**Condiciones:**
- Turtle Soup: <10 patrones en 2 semanas
- Tasa éxito manual: N/A (muy pocas señales)

**Plan Semana 3-4:**
1. Continuar captura 2 semanas más
2. O cambiar timeframe (5m → 15m)
3. O cambiar symbol (BTC → ETH/SOL)
4. O cambiar estrategia (no Turtle Soup)

---

### Escenario 3: Optimización básica 🔧

**Condiciones:**
- Turtle Soup: 10-19 patrones (frecuencia media)
- Tasa éxito manual: >65% (ya es buena)
- Agentes podrían no añadir mucho valor

**Plan Semana 3-4:**
1. NO implementar agentes complejos
2. Optimizar umbrales RSI/Volume
3. Implementar Stop Loss dinámico
4. Añadir filtros de volatilidad
5. Mantener sistema simple

---

## 🎯 Ventajas del Enfoque de 2 Semanas

### 1. **Mayor Robustez Estadística**
- 200-300 data points vs 100-150
- Más confiable para decisiones
- Menor riesgo de outlier

### 2. **Mejor Detección de Patrones**
- 2 semanas = diferentes regímenes de mercado
- Volatilidad alta y baja
- Tendencias alcistas y bajistas

### 3. **Menor Riesgo de Falso Positivo**
- Si aparece 20+ veces, es real
- Si aparece 5 veces, puede ser ruido
- Decisiones más confiables

### 4. **Análisis Más Completo**
- Distribución temporal de patrones
- Correlaciones más sólidas
- Identificación de mejores horarios

---

## 📊 Métricas Esperadas (2 Semanas)

| Métrica | Esperado | Umbral Implementación |
|---------|----------|------------------------|
| **Data points** | 200-300 | - |
| **Turtle Soup** | 20-40 | ≥20: MNEMO, 10-19: Considerar, <10: Esperar |
| **Tasa éxito** | 40-60% | <50: Ayuda clara, >65: Quizás no necesario |
| **Cobertura RSI** | >80% | >70% aceptable |
| **Cobertura Volume** | >80% | >70% aceptable |

---

## 📁 Archivos Modificados

### Nuevos Scripts:

1. **data_collector.js** - Sin cambios (ya funciona para 2 semanas)
2. **analyze_two_weeks.js** - Nuevo script para análisis de 2 semanas

### Plan Modificado:

1. **PLAN_ITERATIVO_PILOTAJE.md** - Actualizado a 2 semanas de datos
2. **SEMANA_1_GUIIA.md** - Ahora aplica a Semana 1-2

---

## ✅ Checklist Semana 1-2

### Diario:
- [ ] TradingView abierto en BTCUSDT 5m
- [ ] data_collector.js corriendo 24/7
- [ ] Verificar log de captura (mañana/tarde/noche)
- [ ] Registrar Turtle Soup manualmente cuando aparezca

### Semanal:
- [ ] Revisión de data points capturados
- [ ] Calcular覆盖率 (cobertura) de datos
- [ ] Documentar observaciones cualitativas
- [ ] Ajustar configuración si es necesario

### Fin de Semana 2:
- [ ] Ejecutar `node analyze_two_weeks.js`
- [ ] Revisión completa de 2 semanas
- [ ] Decisión: ¿Implementar o no?
- [ ] Planificar Semana 3-4

---

## 🚀 Estado Actual

**Semana:** 1 (Día 1)
**Fase:** Inicio de captura de datos
**Duración captura:** 2 semanas (14 días)
**Próximo hito:** Análisis Semana 2 (Día 14)
**Decisión implementación:** Día 17 (fin de Semana 2)

---

**¿Listo para comenzar 2 semanas de captura de datos?**
**Primer paso: Ejecutar `node data_collector.js`**
