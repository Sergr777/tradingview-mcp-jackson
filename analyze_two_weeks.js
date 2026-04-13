/**
 * 📊 ANALYSIS TWO WEEKS - Script de Análisis de 2 Semanas
 *
 * Analiza datos capturados durante 2 semanas
 * Genera recomendaciones sobre qué agente implementar primero
 *
 * Uso: node analyze_two_weeks.js
 */

const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURACIÓN
// ==========================================

const CONFIG = {
  week1File: path.join(__dirname, 'logs', 'week1', 'data_raw.json'),
  week2File: path.join(__dirname, 'logs', 'week2', 'data_raw.json'),
  reportFile: path.join(__dirname, 'logs', 'week2', 'analysis_two_weeks.md')
};

// ==========================================
// FUNCIONES DE CARGA
// ==========================================

function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Archivo no encontrado: ${filePath}`);
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error cargando ${filePath}:`, error.message);
    return [];
  }
}

function loadTwoWeeksData() {
  console.log('\n📂 Cargando datos de 2 semanas...\n');

  const week1 = loadJSON(CONFIG.week1File);
  const week2 = loadJSON(CONFIG.week2File);

  if (week1.length === 0 && week2.length === 0) {
    console.log('❌ No hay datos disponibles para analizar');
    return null;
  }

  const allData = [...week1, ...week2];
  console.log(`✅ Semana 1: ${week1.length} data points`);
  console.log(`✅ Semana 2: ${week2.length} data points`);
  console.log(`✅ Total: ${allData.length} data points\n`);

  return allData;
}

// ==========================================
// FUNCIONES DE ANÁLISIS
// ==========================================

function analyzeBasicStats(data) {
  console.log('📊 ESTADÍSTICAS BÁSICAS\n');
  console.log('='.repeat(70));

  const stats = {
    total: data.length,
    withPrice: data.filter(d => d.price !== null).length,
    withRSI: data.filter(d => d.indicators_visible?.rsi !== null).length,
    withVolume: data.filter(d => d.volume !== null).length,
    turtleSoup: data.filter(d => d.turtle_soup_detected).length,
    manualSignals: data.filter(d => d.manual_signal !== null).length,
    actions: data.filter(d => d.action_taken !== null).length,
    dateRange: {
      start: data[0]?.timestamp,
      end: data[data.length - 1]?.timestamp
    }
  };

  console.log(`Total data points: ${stats.total}`);
  console.log(`Rango temporal: ${stats.dateRange.start} a ${stats.dateRange.end}`);
  console.log(`Duración: ${calculateDuration(stats.dateRange.start, stats.dateRange.end)}`);
  console.log('');
  console.log('Cobertura de datos:');
  console.log(`  Precio: ${stats.withPrice}/${stats.total} (${(stats.withPrice/stats.total*100).toFixed(1)}%)`);
  console.log(`  RSI: ${stats.withRSI}/${stats.total} (${(stats.withRSI/stats.total*100).toFixed(1)}%)`);
  console.log(`  Volume: ${stats.withVolume}/${stats.total} (${(stats.withVolume/stats.total*100).toFixed(1)}%)`);
  console.log('');
  console.log('Señales y patrones:');
  console.log(`  Turtle Soup detectados: ${stats.turtleSoup}`);
  console.log(`  Señales manuales: ${stats.manualSignals}`);
  console.log(`  Acciones ejecutadas: ${stats.actions}`);

  return stats;
}

function calculateDuration(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
  return `${days} días`;
}

function analyzeTurtleSoupPatterns(data) {
  console.log('\n🐢 ANÁLISIS DE PATRONES TURTLE SOUP');
  console.log('='.repeat(70));

  const patterns = data.filter(d => d.turtle_soup_detected);

  if (patterns.length === 0) {
    console.log('❌ No se detectaron patrones Turtle Soup en 2 semanas');
    console.log('');
    console.log('⚠️  IMPLICACIONES:');
    console.log('  - Estrategia Turtle Soup puede no ser viable en BTCUSDT 5m');
    console.log('  - Considerar: cambio de timeframe, symbol, o estrategia');
    console.log('  - Recomendación: NO implementar MNEMO aún');
    return null;
  }

  // Análisis por tipo
  const long = patterns.filter(d => d.turtle_soup_type === 'long');
  const short = patterns.filter(d => d.turtle_soup_type === 'short');

  console.log(`Total patrones: ${patterns.length}`);
  console.log(`  Long: ${long.length} (${(long.length/patterns.length*100).toFixed(1)}%)`);
  console.log(`  Short: ${short.length} (${(short.length/patterns.length*100).toFixed(1)}%)`);

  // Frecuencia (patrones por día)
  const days = calculateDuration(stats.dateRange.start, stats.dateRange.end).match(/\d+/)[0];
  const freqPerDay = patterns.length / parseInt(days);
  console.log(`  Frecuencia: ${freqPerDay.toFixed(1)} patrones/día`);

  // Confianza promedio
  const withConfidence = patterns.filter(d => d.confidence !== null);
  if (withConfidence.length > 0) {
    const avgConfidence = withConfidence.reduce((sum, d) => sum + d.confidence, 0) / withConfidence.length;
    console.log(`  Confianza promedio: ${(avgConfidence * 100).toFixed(1)}%`);
  }

  // Distribución temporal
  const byDay = groupByDay(patterns);
  console.log('\n  Distribución por día:');
  for (const [day, count] of Object.entries(byDay)) {
    console.log(`    ${day}: ${count} patrones`);
  }

  // Interpretación
  console.log('\n  📊 INTERPRETACIÓN:');
  if (patterns.length >= 20) {
    console.log('    ✅ FRECUENCIA ALTA (≥20 patrones)');
    console.log('    → Implementar MNEMO fuertemente recomendado');
    console.log('    → Patrones suficientemente frecuentes para automatización');
  } else if (patterns.length >= 10) {
    console.log('    ⚠️  FRECUENCIA MEDIA (10-19 patrones)');
    console.log('    → Considerar MNEMO con cautela');
    console.log('    → Valor depende de tasa éxito actual');
  } else {
    console.log('    ❌ FRECUENCIA BAJA (<10 patrones)');
    console.log('    → NO implementar MNEMO aún');
    console.log('    → Considerar cambio de estrategia/symbol/timeframe');
  }

  return {
    total: patterns.length,
    long: long.length,
    short: short.length,
    freqPerDay: freqPerDay,
    byDay: byDay
  };
}

function groupByDay(data) {
  const grouped = {};

  for (const item of data) {
    if (!item.timestamp) continue;
    const date = item.timestamp.split('T')[0];
    grouped[date] = (grouped[date] || 0) + 1;
  }

  return grouped;
}

function analyzeActionResults(data) {
  console.log('\n💰 ANÁLISIS DE RESULTADOS DE ACCIONES');
  console.log('='.repeat(70));

  const actions = data.filter(d => d.action_taken !== null);

  if (actions.length === 0) {
    console.log('ℹ️  No se ejecutaron acciones en 2 semanas');
    console.log('');
    console.log('Esto es NORMAL en fase de captura de datos.');
    console.log('El objetivo es recopilar datos baseline, no tradear activamente.');
    return null;
  }

  const successes = actions.filter(d => d.action_result === 'success');
  const failures = actions.filter(d => d.action_result === 'fail');
  const successRate = successes.length / actions.length;

  console.log(`Total acciones: ${actions.length}`);
  console.log(`Exitosas: ${successes.length} (${(successRate*100).toFixed(1)}%)`);
  console.log(`Fallidas: ${failures.length} (${((1-successRate)*100).toFixed(1)}%)`);

  // P&L si está disponible
  const withPnL = actions.filter(d => d.pnl !== null);
  if (withPnL.length > 0) {
    const totalPnL = withPnL.reduce((sum, d) => sum + d.pnl, 0);
    const avgPnL = totalPnL / withPnL.length;
    const winRate = successes.length / withPnL.length;

    console.log(`\nResultados financieros (${withPnL.length} operaciones con P&L):`);
    console.log(`  P&L Total: $${totalPnL.toFixed(2)}`);
    console.log(`  P&L Promedio: $${avgPnL.toFixed(2)} por operación`);
    console.log(`  Win Rate: ${(winRate*100).toFixed(1)}%`);
  }

  // Interpretación
  console.log('\n  📊 INTERPRETACIÓN:');
  if (successRate < 0.5) {
    console.log('    ✅ NECESIDAD CLARA (<50% éxito)');
    console.log('    → Los agentes PODRÍAN ayudar significativamente');
    console.log('    → Justificación para implementación fuerte');
  } else if (successRate < 0.65) {
    console.log('    ⚠️  NECESIDAD MODERADA (50-65% éxito)');
    console.log('    → Los agentes PODRÍAN ayudar si mejora clara');
    console.log('    → Justificación media para implementación');
  } else {
    console.log('    ❌ SIN NECESIDAD (>65% éxito)');
    console.log('    → Sistema manual YA funciona bien');
    console.log('    → Agentes deben demostrar mejora CLARA (>10%)');
    console.log('    → Considerar NO implementar');
  }

  return {
    total: actions.length,
    successes: successes.length,
    failures: failures.length,
    successRate: successRate
  };
}

function analyzeIndicators(data) {
  console.log('\n📈 ANÁLISIS DE INDICADORES');
  console.log('='.repeat(70));

  // RSI Analysis
  const rsiData = data.filter(d => d.indicators_visible?.rsi !== null);
  if (rsiData.length > 0) {
    const rsiValues = rsiData.map(d => d.indicators_visible.rsi);
    const rsiStats = calculateStats(rsiValues);

    console.log('RSI:');
    console.log(`  Data points: ${rsiData.length}`);
    console.log(`  Promedio: ${rsiStats.mean.toFixed(2)}`);
    console.log(`  Mínimo: ${rsiStats.min.toFixed(2)}`);
    console.log(`  Máximo: ${rsiStats.max.toFixed(2)}`);
    console.log(`  Desviación estándar: ${rsiStats.std.toFixed(2)}`);

    // Zonas
    const oversold = rsiValues.filter(r => r < 30).length;
    const overbought = rsiValues.filter(r => r > 70).length;
    const neutral = rsiValues.filter(r => r >= 30 && r <= 70).length;

    console.log(`\n  Zonas:`);
    console.log(`    Sobrevendido (<30): ${oversold} (${(oversold/rsiData.length*100).toFixed(1)}%)`);
    console.log(`    Neutral (30-70): ${neutral} (${(neutral/rsiData.length*100).toFixed(1)}%)`);
    console.log(`    Sobrecomprado (>70): ${overbought} (${(overbought/rsiData.length*100).toFixed(1)}%)`);

    // Correlación con Turtle Soup
    const turtleRSI = data.filter(d => d.turtle_soup_detected && d.indicators_visible?.rsi !== null)
      .map(d => d.indicators_visible.rsi);
    if (turtleRSI.length > 0) {
      const turtleRSIStats = calculateStats(turtleRSI);
      console.log(`\n  RSI en Turtle Soup (${turtleRSI.length} casos):`);
      console.log(`    Promedio: ${turtleRSIStats.mean.toFixed(2)}`);
      console.log(`    Rango: ${turtleRSIStats.min.toFixed(2)} - ${turtleRSIStats.max.toFixed(2)}`);

      if (turtleRSIStats.mean < 40) {
        console.log('    ✅ Turtle Soup correlaciona con RSI bajo (esperado)');
      } else {
        console.log('    ⚠️  Turtle Soup NO correlaciona fuertemente con RSI bajo');
      }
    }
  }

  // Volume Analysis
  const volData = data.filter(d => d.volume !== null);
  if (volData.length > 0) {
    const volValues = volData.map(d => d.volume);
    const volStats = calculateStats(volValues);

    console.log('\nVolume:');
    console.log(`  Data points: ${volData.length}`);
    console.log(`  Promedio: ${volStats.mean.toFixed(0)}`);
    console.log(`  Mínimo: ${volStats.min.toFixed(0)}`);
    console.log(`  Máximo: ${volStats.max.toFixed(0)}`);
    console.log(`  Desviación estándar: ${volStats.std.toFixed(0)}`);
  }
}

function calculateStats(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);

  return { mean, min, max, std };
}

function generateRecommendations(stats, turtlePatterns, actionResults) {
  console.log('\n🎯 RECOMENDACIONES');
  console.log('='.repeat(70));

  const recommendations = {
    implementMnemo: false,
    considerMnemo: false,
    waitMoreData: false,
    changeStrategy: false,
    reasoning: [],
    nextSteps: []
  };

  // Criterio 1: Frecuencia de Turtle Soup
  console.log('\n1. FRECUENCIA DE TURTLE SOUP:');
  if (turtlePatterns && turtlePatterns.total >= 20) {
    console.log('   ✅ 20+ patrones en 2 semanas → ALTA frecuencia');
    recommendations.implementMnemo = true;
    recommendations.reasoning.push('✅ Frecuencia Turtle Soup alta (≥20)');
    recommendations.nextSteps.push('Implementar MNEMO en Semana 3');
  } else if (turtlePatterns && turtlePatterns.total >= 10) {
    console.log('   ⚠️  10-19 patrones en 2 semanas → MEDIA frecuencia');
    recommendations.considerMnemo = true;
    recommendations.reasoning.push('⚠️  Frecuencia Turtle Soup media (10-19)');
    recommendations.nextSteps.push('Considerar MNEMO si tasa éxito <60%');
  } else {
    console.log('   ❌  <10 patrones en 2 semanas → BAJA frecuencia');
    recommendations.waitMoreData = true;
    recommendations.reasoning.push('❌ Frecuencia Turtle Soup baja (<10)');
    recommendations.nextSteps.push('Esperar 2 semanas más O cambiar estrategia');
  }

  // Criterio 2: Tasa éxito actual
  console.log('\n2. TASA ÉXITO ACTUAL:');
  if (actionResults && actionResults.total > 0) {
    if (actionResults.successRate < 0.5) {
      console.log(`   ✅  ${(actionResults.successRate*100).toFixed(1)}% < 50% → NECESIDAD clara`);
      recommendations.reasoning.push(`✅ Tasa éxito baja (${(actionResults.successRate*100).toFixed(1)}%) - Agentes pueden ayudar`);
    } else if (actionResults.successRate < 0.65) {
      console.log(`   ⚠️  ${(actionResults.successRate*100).toFixed(1)}% en rango 50-65% → NECESIDAD moderada`);
      recommendations.reasoning.push(`⚠️  Tasa éxito media (${(actionResults.successRate*100).toFixed(1)}%) - Agentes si mejora clara`);
    } else {
      console.log(`   ❌  ${(actionResults.successRate*100).toFixed(1)}% > 65% → SIN necesidad urgente`);
      recommendations.reasoning.push(`❌ Tasa éxito alta (${(actionResults.successRate*100).toFixed(1)}%) - Sistema manual funciona bien`);
    }
  } else {
    console.log('   ℹ️  Sin acciones ejecutadas - No hay tasa éxito baseline');
  }

  // Criterio 3: Calidad de datos
  console.log('\n3. CALIDAD DE DATOS:');
  const rsiCoverage = stats.withRSI / stats.total;
  if (rsiCoverage < 0.7) {
    console.log(`   ⚠️  Cobertura RSI: ${(rsiCoverage*100).toFixed(1)}% < 70% → Mejorar calidad`);
    recommendations.reasoning.push(`⚠️  Cobertura RSI baja (${(rsiCoverage*100).toFixed(1)}%) - Mejorar captura de datos`);
  } else {
    console.log(`   ✅ Cobertura RSI: ${(rsiCoverage*100).toFixed(1)}% ≥ 70% → Buena calidad`);
  }

  // Decisión final
  console.log('\n' + '='.repeat(70));
  console.log('🎯 DECISIÓN FINAL:');
  console.log('='.repeat(70));

  if (recommendations.implementMnemo) {
    console.log('\n✅ RECOMENDACIÓN: IMPLEMENTAR MNEMO (Memo)');
    console.log('\nRazones:');
    recommendations.reasoning.forEach(r => console.log(`  ${r}`));
    console.log('\nPróximos pasos (Semana 3-4):');
    recommendations.nextSteps.forEach((step, i) => console.log(`  ${i+1}. ${step}`));
    console.log('\nValor esperado:');
    console.log('  - Detección automática: +40%');
    console.log('  - Tasa éxito: +15-20%');
    console.log('  - Latencia: <100ms');

  } else if (recommendations.waitMoreData) {
    console.log('\n⏸️  RECOMENDACIÓN: ESPERAR MÁS DATOS O CAMBIAR ESTRATEGIA');
    console.log('\nRazones:');
    recommendations.reasoning.forEach(r => console.log(`  ${r}`));
    console.log('\nOpciones:');
    console.log('  1. Continuar 2 semanas más de captura');
    console.log('  2. Cambiar timeframe (5m → 15m)');
    console.log('  3. Cambiar symbol (BTC → ETH/SOL)');
    console.log('  4. Cambiar estrategia (no Turtle Soup)');

  } else if (recommendations.considerMnemo) {
    console.log('\n⚠️  RECOMENDACIÓN: CONSIDERAR MNEMO CON CAUTELA');
    console.log('\nRazones:');
    recommendations.reasoning.forEach(r => console.log(`  ${r}`));
    console.log('\nCondiciones:');
    console.log('  - Implementar SOLO si tasa éxito <60%');
    console.log('  - Verificar mejora clara post-implementación');
    console.log('  - Prepararse para descartar si no hay valor');

  } else {
    console.log('\n📊 RECOMENDACIÓN: EVALUAR CASO POR CASO');
    console.log('\nRevisar análisis completo y decidir basado en contexto específico.');
  }

  return recommendations;
}

// ==========================================
// GENERAR REPORTE
// ==========================================

function generateReport(stats, turtlePatterns, actionResults, recommendations) {
  const report = `# 📊 ANÁLISIS DE 2 SEMANAS - Pilotaje TradingView MCP

**Fecha:** ${new Date().toISOString().split('T')[0]}
**Symbol:** BTCUSDT
**Timeframe:** 5m
**Duración:** ${calculateDuration(stats.dateRange.start, stats.dateRange.end)}

---

## 📈 Resumen Ejecutivo

### Datos Capturados

| Métrica | Semana 1 | Semana 2 | Total | Porcentaje |
|---------|----------|----------|-------|------------|
| **Total data points** | - | - | ${stats.total} | 100% |
| **Con precio** | - | - | ${stats.withPrice} | ${(stats.withPrice/stats.total*100).toFixed(1)}% |
| **Con RSI** | - | - | ${stats.withRSI} | ${(stats.withRSI/stats.total*100).toFixed(1)}% |
| **Con Volume** | - | - | ${stats.withVolume} | ${(stats.withVolume/stats.total*100).toFixed(1)}% |
| **Turtle Soup** | - | - | ${stats.turtleSoup} | - |
| **Señales manuales** | - | - | ${stats.manualSignals} | - |
| **Acciones ejecutadas** | - | - | ${stats.actions} | - |

${turtlePatterns ? `
## 🐢 Patrones Turtle Soup

### Estadísticas Generales

| Métrica | Valor |
|---------|-------|
| **Total patrones** | ${turtlePatterns.total} |
| **Long** | ${turtlePatterns.long} (${(turtlePatterns.long/turtlePatterns.total*100).toFixed(1)}%) |
| **Short** | ${turtlePatterns.short} (${(turtlePatterns.short/turtlePatterns.total*100).toFixed(1)}%) |
| **Frecuencia** | ${turtlePatterns.freqPerDay.toFixed(1)} patrones/día |

### Distribución Temporal

${Object.entries(turtlePatterns.byDay).map(([day, count]) => `- **${day}**: ${count} patrones`).join('\n')}
` : '## 🐢 Patrones Turtle Soup\n\nNo se detectaron patrones suficientes para análisis.'}

${actionResults ? `
## 💰 Resultados de Acciones

| Métrica | Valor |
|---------|-------|
| **Total acciones** | ${actionResults.total} |
| **Exitosas** | ${actionResults.successes} |
| **Fallidas** | ${actionResults.failures} |
| **Tasa éxito** | ${(actionResults.successRate * 100).toFixed(1)}% |
` : '## 💰 Resultados de Acciones\n\nNo se ejecutaron acciones durante este periodo.'}

---

## 🎯 Recomendaciones

${recommendations.reasoning.map(r => `- ${r}`).join('\n')}

---

## 📋 Próximos Pasos

${recommendations.nextSteps.map((step, i) => `${i+1}. ${step}`).join('\n')}

---

## 📊 Conclusiones

**Datos suficiente para implementación:** ${recommendations.implementMnemo ? '✅ SÍ' : '❌ NO'}

**Agente recomendado:** ${recommendations.implementMnemo ? 'MNEMO (Memo)' : recommendations.waitMoreData ? 'N/A - Esperar más datos' : 'Evaluar caso por caso'}

**Confianza en recomendación:** ${turtlePatterns && turtlePatterns.total >= 20 ? 'ALTA' : turtlePatterns && turtlePatterns.total >= 10 ? 'MEDIA' : 'BAJA'}

---

**Generado:** ${new Date().toISOString()}
**Script:** \`analyze_two_weeks.js\`
`;

  return report;
}

// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 ANÁLISIS DE 2 SEMANAS - Pilotaje TradingView MCP');
  console.log('='.repeat(70) + '\n');

  // Cargar datos
  const data = loadTwoWeeksData();
  if (!data) {
    console.log('\n❌ No se puede continuar sin datos');
    return;
  }

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
  const reportDir = path.dirname(CONFIG.reportFile);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG.reportFile, report);

  console.log('\n✅ Reporte guardado en:');
  console.log(`   📄 ${CONFIG.reportFile}`);

  console.log('\n' + '='.repeat(70));
  console.log('📊 Análisis completado - Revisar reporte para detalles completos');
  console.log('='.repeat(70) + '\n');
}

// ==========================================
// EJECUCIÓN
// ==========================================

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  loadTwoWeeksData,
  analyzeBasicStats,
  analyzeTurtleSoupPatterns,
  analyzeActionResults,
  analyzeIndicators,
  generateRecommendations,
  generateReport
};
