/**
 * 📊 ANALYSIS WEEK 1 - Script de Análisis
 *
 * Analiza datos capturados durante la semana
 * Genera recomendaciones sobre qué agente implementar primero
 *
 * Uso: node analyze_week1.js
 */

const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURACIÓN
// ==========================================

const CONFIG = {
  dataFile: path.join(__dirname, 'logs', 'week1', 'data_raw.json'),
  reportFile: path.join(__dirname, 'logs', 'week1', 'analysis.md')
};

// ==========================================
// FUNCIONES DE ANÁLISIS
// ==========================================

function loadData() {
  try {
    if (!fs.existsSync(CONFIG.dataFile)) {
      console.log(`❌Archivo de datos no encontrado: ${CONFIG.dataFile}`);
      console.log(`💡 Ejecuta data_collector.js primero para capturar datos`);
      return null;
    }

    const content = fs.readFileSync(CONFIG.dataFile, 'utf8');
    const data = JSON.parse(content);

    console.log(`✅ Cargados ${data.length} data points`);
    return data;

  } catch (error) {
    console.error(`❌ Error cargando datos:`, error.message);
    return null;
  }
}

function analyzeBasicStats(data) {
  console.log('\n📊 ANÁLISIS DE ESTADÍSTICAS BÁSICAS\n');

  const stats = {
    totalDataPoints: data.length,
    withPrice: data.filter(d => d.price !== null).length,
    withRSI: data.filter(d => d.indicators_visible?.rsi !== null).length,
    withVolume: data.filter(d => d.volume !== null).length,
    turtleSoupDetected: data.filter(d => d.turtle_soup_detected).length,
    manualSignals: data.filter(d => d.manual_signal !== null).length,
    actionsTaken: data.filter(d => d.action_taken !== null).length
  };

  console.log(`Total data points: ${stats.totalDataPoints}`);
  console.log(`Con precio: ${stats.withPrice} (${(stats.withPrice/stats.totalDataPoints*100).toFixed(1)}%)`);
  console.log(`Con RSI: ${stats.withRSI} (${(stats.withRSI/stats.totalDataPoints*100).toFixed(1)}%)`);
  console.log(`Con volumen: ${stats.withVolume} (${(stats.withVolume/stats.totalDataPoints*100).toFixed(1)}%)`);
  console.log(`Turtle Soup detectados: ${stats.turtleSoupDetected}`);
  console.log(`Señales manuales: ${stats.manualSignals}`);
  console.log(`Acciones ejecutadas: ${stats.actionsTaken}`);

  return stats;
}

function analyzeTurtleSoupPatterns(data) {
  console.log('\n🐢 ANÁLISIS DE PATRONES TURTLE SOUP\n');

  const turtlePatterns = data.filter(d => d.turtle_soup_detected);

  if (turtlePatterns.length === 0) {
    console.log('❌ No se detectaron patrones Turtle Soup');
    console.log('💡 Recomendación: Continuar monitoreo, patrones pueden aparecer');
    return null;
  }

  const byType = {
    long: turtlePatterns.filter(d => d.turtle_soup_type === 'long').length,
    short: turtlePatterns.filter(d => d.turtle_soup_type === 'short').length
  };

  const avgConfidence = turtlePatterns
    .filter(d => d.confidence !== null)
    .reduce((sum, d) => sum + d.confidence, 0) / turtlePatterns.filter(d => d.confidence !== null).length || 0;

  console.log(`Total patrones: ${turtlePatterns.length}`);
  console.log(`  Long: ${byType.long} (${(byType.long/turtlePatterns.length*100).toFixed(1)}%)`);
  console.log(`  Short: ${byType.short} (${(byType.short/turtlePatterns.length*100).toFixed(1)}%)`);
  console.log(`Confianza promedio: ${(avgConfidence * 100).toFixed(1)}%`);

  return {
    total: turtlePatterns.length,
    long: byType.long,
    short: byType.short,
    avgConfidence: avgConfidence
  };
}

function analyzeIndicators(data) {
  console.log('\n📈 ANÁLISIS DE INDICADORES\n');

  const validRSI = data.filter(d => d.indicators_visible?.rsi !== null);
  const validVol = data.filter(d => d.volume !== null);

  if (validRSI.length > 0) {
    const rsiValues = validRSI.map(d => d.indicators_visible.rsi);
    const rsiAvg = rsiValues.reduce((a, b) => a + b, 0) / rsiValues.length;
    const rsiMin = Math.min(...rsiValues);
    const rsiMax = Math.max(...rsiValues);

    console.log(`RSI (${validRSI.length} data points):`);
    console.log(`  Promedio: ${rsiAvg.toFixed(2)}`);
    console.log(`  Mínimo: ${rsiMin.toFixed(2)}`);
    console.log(`  Máximo: ${rsiMax.toFixed(2)}`);

    // Análisis de zonas
    const oversold = rsiValues.filter(r => r < 30).length;
    const overbought = rsiValues.filter(r => r > 70).length;
    console.log(`  Sobrevendido (<30): ${oversold} (${(oversold/validRSI.length*100).toFixed(1)}%)`);
    console.log(`  Sobrecomprado (>70): ${overbought} (${(overbought/validRSI.length*100).toFixed(1)}%)`);
  }

  if (validVol.length > 0) {
    const volValues = validVol.map(d => d.volume);
    const volAvg = volValues.reduce((a, b) => a + b, 0) / volValues.length;
    const volMin = Math.min(...volValues);
    const volMax = Math.max(...volValues);

    console.log(`\nVolume (${validVol.length} data points):`);
    console.log(`  Promedio: ${volAvg.toFixed(0)}`);
    console.log(`  Mínimo: ${volMin.toFixed(0)}`);
    console.log(`  Máximo: ${volMax.toFixed(0)}`);
  }
}

function analyzeActionResults(data) {
  console.log('\n💰 ANÁLISIS DE RESULTADOS DE ACCIONES\n');

  const actions = data.filter(d => d.action_taken !== null);

  if (actions.length === 0) {
    console.log('❌ No se ejecutaron acciones');
    console.log('💡 Recomendación: Monitoreo continuo, sin trading activo aún');
    return null;
  }

  const successes = actions.filter(d => d.action_result === 'success').length;
  const failures = actions.filter(d => d.action_result === 'fail').length;
  const successRate = successes / actions.length;

  console.log(`Total acciones: ${actions.length}`);
  console.log(`Exitosas: ${successes} (${(successRate*100).toFixed(1)}%)`);
  console.log(`Fallidas: ${failures} (${((1-successRate)*100).toFixed(1)}%)`);

  // P&L si está disponible
  const withPnL = actions.filter(d => d.pnl !== null);
  if (withPnL.length > 0) {
    const totalPnL = withPnL.reduce((sum, d) => sum + d.pnl, 0);
    const avgPnL = totalPnL / withPnL.length;

    console.log(`\nP&L Total: $${totalPnL.toFixed(2)}`);
    console.log(`P&L Promedio: $${avgPnL.toFixed(2)} por operación`);
  }

  return {
    total: actions.length,
    successes,
    failures,
    successRate
  };
}

function generateRecommendations(stats, turtlePatterns, actionResults) {
  console.log('\n🎯 RECOMENDACIONES\n');

  const recommendations = {
    implement_mnemo: false,
    implement_prophet: false,
    implement_sentiment: false,
    wait_for_more_data: false,
    reasoning: []
  };

  // Criterio 1: ¿Hay suficientes datos de Turtle Soup?
  if (turtlePatterns && turtlePatterns.total >= 10) {
    recommendations.implement_mnemo = true;
    recommendations.reasoning.push(`✅ ${turtlePatterns.total} patrones Turtle Soup detectados → Implementar MNEMO primero`);
  } else if (turtlePatterns && turtlePatterns.total >= 5) {
    recommendations.reasoning.push(`⚠️  Solo ${turtlePatterns.total} patrones Turtle Soup → Considerar MNEMO pero con prioridad media`);
    recommendations.implement_mnemo = true; // Aún implementar, pero con cautela
  } else {
    recommendations.wait_for_more_data = true;
    recommendations.reasoning.push(`❌ Menos de 5 patrones Turtle Soup → Esperar más datos antes de implementar agentes`);
  }

  // Criterio 2: ¿Tasa éxito actual es baja?
  if (actionResults && actionResults.successRate < 0.5) {
    recommendations.reasoning.push(`⚠️  Tasa éxito actual ${(actionResults.successRate*100).toFixed(1)}% < 50% → Los agentes podrían ayudar`);
  } else if (actionResults) {
    recommendations.reasoning.push(`✅ Tasa éxito actual ${(actionResults.successRate*100).toFixed(1)}% es decente → Los agentes deben mejorarla significativamente`);
  }

  // Criterio 3: Cobertura de datos
  if (stats.withRSI < stats.totalDataPoints * 0.5) {
    recommendations.reasoning.push(`⚠️  Solo ${(stats.withRSI/stats.totalDataPoints*100).toFixed(1)}% de data points tienen RSI → Mejorar calidad de datos`);
  }

  if (stats.withPrice < stats.totalDataPoints * 0.5) {
    recommendations.reasoning.push(`⚠️  Solo ${(stats.withPrice/stats.totalDataPoints*100).toFixed(1)}% de data points tienen precio → Verificar conexión TradingView MCP`);
  }

  // Imprimir recomendaciones
  console.log('Basado en análisis de datos:\n');

  if (recommendations.implement_mnemo) {
    console.log('🚀 PRÓXIMO PASO (Semana 2):');
    console.log('   → Implementar MNEMO (Memo) - Detección de patrones');
    console.log('   → Prioridad: ALTA');
    console.log('   → Justificación: Patrones Turtle Soup frecuentes');
  }

  if (recommendations.wait_for_more_data) {
    console.log('⏸️  ACCIÓN RECOMENDADA:');
    console.log('   → Continuar captura de datos por otra semana');
    console.log('   → No implementar agentes aún');
    console.log('   → Justificación: Datos insuficientes para decisión informada');
  }

  if (recommendations.implement_prophet) {
    console.log('📊 FUTURO (Semana 3+):');
    console.log('   → Implementar PROPHET si MNEMO muestra valor');
    console.log('   → Prioridad: MEDIA');
    console.log('   → Condición: Mejora ≥10% con MNEMO');
  }

  return recommendations;
}

function generateReport(stats, turtlePatterns, actionResults, recommendations) {
  const report = `# 📊 ANÁLISIS SEMANA 1 - Pilotaje TradingView MCP

**Fecha:** ${new Date().toISOString().split('T')[0]}
**Symbol:** BTCUSDT
**Timeframe:** 5m
**Data Points:** ${stats.totalDataPoints}

---

## 📈 Resumen de Datos Capturados

### Estadísticas Básicas

| Métrica | Valor | Porcentaje |
|---------|-------|------------|
| **Total data points** | ${stats.totalDataPoints} | 100% |
| **Con precio** | ${stats.withPrice} | ${(stats.withPrice/stats.totalDataPoints*100).toFixed(1)}% |
| **Con RSI** | ${stats.withRSI} | ${(stats.withRSI/stats.totalDataPoints*100).toFixed(1)}% |
| **Con volumen** | ${stats.withVolume} | ${(stats.withVolume/stats.totalDataPoints*100).toFixed(1)}% |
| **Turtle Soup detectados** | ${stats.turtleSoupDetected} | - |
| **Señales manuales** | ${stats.manualSignals} | - |
| **Acciones ejecutadas** | ${stats.actionsTaken} | - |

${turtlePatterns ? `
## 🐢 Patrones Turtle Soup

| Tipo | Cantidad | Porcentaje |
|------|----------|------------|
| **Long** | ${turtlePatterns.long} | ${(turtlePatterns.long/turtlePatterns.total*100).toFixed(1)}% |
| **Short** | ${turtlePatterns.short} | ${(turtlePatterns.short/turtlePatterns.total*100).toFixed(1)}% |
| **Total** | ${turtlePatterns.total} | 100% |

**Confianza promedio:** ${(turtlePatterns.avgConfidence * 100).toFixed(1)}%
` : '## 🐢 Patrones Turtle Soup\n\nNo se detectaron patrones suficientes para análisis.'}

${actionResults ? `
## 💰 Resultados de Acciones

| Métrica | Valor |
|---------|-------|
| **Total acciones** | ${actionResults.total} |
| **Exitosas** | ${actionResults.successes} |
| **Fallidas** | ${actionResults.failures} |
| **Tasa éxito** | ${(actionResults.successRate * 100).toFixed(1)}% |
` : '## 💰 Resultados de Acciones\n\nNo se ejecutaron acciones durante esta semana.'}

---

## 🎯 Recomendaciones

${recommendations.reasoning.map(r => `- ${r}`).join('\n')}

---

## 📋 Próximos Pasos

### Si implementar MNEMO (Semana 2):

1. ✅ Crear \`agents/mnemo_simple.py\`
2. ✅ Implementar detección Turtle Soup automática
3. ✅ Integrar con \`scalper-run.js\`
4. ✅ Verificar mejora vs baseline

### Si esperar más datos:

1. ✅ Continuar \`data_collector.js\` otra semana
2. ✅ Añadir más data points manuales
3. ✅ Revisar calidad de datos (RSI, Volume)
4. ✅ Re-analizar al final de Semana 2

---

## 📊 Conclusiones

${recommendations.wait_for_more_data
  ? 'Los datos capturados son insuficientes para tomar decisiones de implementación. Recomendado continuar monitoreo una semana más.'
  : 'Los datos justifican implementar MNEMO como primer agente. Los patrones Turtle Soup son frecuentes y la detección automática añadiría valor.'}

---

**Generado:** ${new Date().toISOString()}
**Script:** \`analyze_week1.js\`
`;

  return report;
}

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 ANÁLISIS SEMANA 1 - Pilotaje TradingView MCP');
  console.log('='.repeat(70) + '\n');

  // Cargar datos
  const data = loadData();
  if (!data) return;

  // Análisis
  const stats = analyzeBasicStats(data);
  const turtlePatterns = analyzeTurtleSoupPatterns(data);
  analyzeIndicators(data);
  const actionResults = analyzeActionResults(data);

  // Generar recomendaciones
  const recommendations = generateRecommendations(stats, turtlePatterns, actionResults);

  // Generar reporte
  const report = generateReport(stats, turtlePatterns, actionResults, recommendations);

  // Guardar reporte
  fs.writeFileSync(CONFIG.reportFile, report);

  console.log('\n✅ Reporte guardado en:');
  console.log(`   📄 ${CONFIG.reportFile}`);

  console.log('\n' + '='.repeat(70));
  console.log('📊 Análisis completado');
  console.log('='.repeat(70) + '\n');
}

// ==========================================
// EJECUCIÓN
// ==========================================

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  loadData,
  analyzeBasicStats,
  analyzeTurtleSoupPatterns,
  analyzeIndicators,
  analyzeActionResults,
  generateRecommendations,
  generateReport
};
