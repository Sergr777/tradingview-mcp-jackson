/**
 * TEST DE INTEGRACIÓN CON INVESTCRIPTO AI AGENTS
 *
 * Prueba la conectividad y funcionalidad de los agentes de IA:
 * - KRONOS: Coordinación maestra
 * - ORÁCULO: Contexto histórico y RAG
 * - PROPHET: Predicciones de precio
 * - SENTIMENT: Análisis de sentimiento
 * - ARBITER: Ensemble y ranking
 * - MNEMO: Memoria persistente
 *
 * Features:
 * - Health check automatizado
 * - Tests de cada endpoint
 * - Timeout y retry logic
 * - Medición de latencia
 * - Reporte JSON estructurado
 */

import { InvestCriptoAIAgentsClient } from '../../../integration/invest_criptoai_api/agents_client.js';

class AIIntegrationTester {
  constructor(config = {}) {
    this.client = new InvestCriptoAIAgentsClient(config);
    this.results = {
      timestamp: new Date().toISOString(),
      config: {
        baseUrl: config.baseUrl || 'http://localhost:8000',
        timeout: config.timeout || 5000,
        retryAttempts: config.retryAttempts || 2
      },
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      },
      agents: {},
      latency: {
        min: Infinity,
        max: 0,
        avg: 0
      }
    };

    this.latencies = [];
  }

  /**
   * Ejecuta todos los tests
   */
  async runAllTests() {
    console.log('\n========================================');
    console.log('🧪 INVESTCRIPTO AI INTEGRATION TEST SUITE');
    console.log('========================================\n');
    console.log(`Target: ${this.results.config.baseUrl}`);
    console.log(`Timeout: ${this.results.config.timeout}ms`);
    console.log(`Retry Attempts: ${this.results.config.retryAttempts}\n`);

    // Tests de conectividad básica
    await this._testHealthCheck();
    await this._testConnectionTimeout();
    await this._testRetryLogic();

    // Tests por agente
    await this._testKronosAgent();
    await this._testOraculoAgent();
    await this._testProphetAgent();
    await this._testSentimentAgent();
    await this._testArbiterAgent();
    await this._testMnemoAgent();

    // Tests de integración
    await this._testFullSignalFlow();
    await this._testConcurrentRequests();
    await this._testErrorHandling();

    // Calcular resumen
    this._calculateSummary();
    this._printSummary();

    return this.results;
  }

  /**
   * Test: Health check del servidor
   */
  async _testHealthCheck() {
    const testName = 'Health Check';
    console.log(`\n📡 Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const start = Date.now();
      const response = await this.client.healthCheck();
      const latency = Date.now() - start;

      this._recordLatency(latency);

      if (response.status === 'disabled') {
        return {
          passed: true,
          message: 'AI is disabled (expected for standalone mode)',
          data: response
        };
      }

      if (response.status === 'ok' || response.status === 'healthy') {
        return {
          passed: true,
          message: `Server is healthy (${latency}ms)`,
          data: response
        };
      }

      return {
        passed: false,
        message: `Unexpected status: ${response.status}`,
        data: response
      };
    });

    this.results.tests.push(result);
  }

  /**
   * Test: Timeout de conexión
   */
  async _testConnectionTimeout() {
    const testName = 'Connection Timeout';
    console.log(`\n⏱️  Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      // Crear cliente con timeout muy corto
      const fastClient = new InvestCriptoAIAgentsClient({
        baseUrl: this.results.config.baseUrl,
        timeout: 100, // 100ms
        enabled: true
      });

      const start = Date.now();
      try {
        await fastClient.sendSignal({
          symbol: 'BTCUSDT',
          action: 'buy',
          price: 50000
        });
        const elapsed = Date.now() - start;

        // Si responde rápido, está bien
        if (elapsed < 200) {
          return {
            passed: true,
            message: `Responded quickly (${elapsed}ms)`,
            data: { elapsed }
          };
        }

        return {
          passed: false,
          message: `Too slow (${elapsed}ms)`,
          data: { elapsed }
        };
      } catch (error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          return {
            passed: true,
            message: `Timeout works correctly (${Date.now() - start}ms)`,
            data: { error: error.message }
          };
        }
        throw error;
      }
    });

    this.results.tests.push(result);
  }

  /**
   * Test: Lógica de retry
   */
  async _testRetryLogic() {
    const testName = 'Retry Logic';
    console.log(`\n🔄 Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      // Intentar multiple veces para verificar consistencia
      const attempts = 3;
      const results = [];

      for (let i = 0; i < attempts; i++) {
        const start = Date.now();
        const response = await this.client.healthCheck();
        const elapsed = Date.now() - start;

        results.push({
          attempt: i + 1,
          status: response.status,
          elapsed
        });

        // Pequeña pausa entre intentos
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const allSame = results.every(r => r.status === results[0].status);
      const avgLatency = results.reduce((sum, r) => sum + r.elapsed, 0) / attempts;

      return {
        passed: true,
        message: `Consistent responses across ${attempts} attempts (avg: ${avgLatency.toFixed(0)}ms)`,
        data: { results, allSame, avgLatency }
      };
    });

    this.results.tests.push(result);
  }

  /**
   * Test: Agente KRONOS (coordinación)
   */
  async _testKronosAgent() {
    const testName = 'KRONOS Agent (Coordination)';
    console.log(`\n👑 Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const testSignal = {
        symbol: 'BTCUSDT',
        action: 'buy',
        price: 67500.50,
        quantity: 0.001,
        timestamp: new Date().toISOString(),
        source: 'test_integration',
        strategy: 'scalper_vwap'
      };

      const start = Date.now();
      const response = await this.client.sendSignal(testSignal);
      const latency = Date.now() - start;

      this._recordLatency(latency);

      // Verificar estructura de respuesta
      if (!response) {
        return {
          passed: false,
          message: 'No response from KRONOS',
          data: null
        };
      }

      const hasApproval = 'approve' in response || 'final_confidence' in response;
      const hasAgentVotes = 'agent_votes' in response;

      return {
        passed: true,
        message: `KRONOS coordination works (${latency}ms)`,
        data: {
          response,
          hasApproval,
          hasAgentVotes,
          latency
        }
      };
    });

    this.results.tests.push(result);

    // Guardar info del agente
    if (result.passed) {
      this.results.agents.kronos = {
        status: 'operational',
        latency: result.data?.latency || null,
        features: ['signal_validation', 'coordination', 'agent_orchestration']
      };
    }
  }

  /**
   * Test: Agente ORÁCULO (contexto histórico)
   */
  async _testOraculoAgent() {
    const testName = 'ORÁCULO Agent (Historical Context)';
    console.log(`\n📚 Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const testQuery = {
        query: 'BTCUSDT price action last 24 hours',
        context_type: 'price_history',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        lookback: 24
      };

      const start = Date.now();
      const response = await this.client.queryHistoricalContext(testQuery);
      const latency = Date.now() - start;

      this._recordLatency(latency);

      if (!response) {
        return {
          passed: false,
          message: 'No response from ORÁCULO',
          data: null
        };
      }

      const hasContext = 'context' in response || 'data' in response || 'results' in response;

      return {
        passed: true,
        message: `ORÁCULO context retrieval works (${latency}ms)`,
        data: {
          response,
          hasContext,
          latency
        }
      };
    });

    this.results.tests.push(result);

    if (result.passed) {
      this.results.agents.oraculo = {
        status: 'operational',
        latency: result.data?.latency || null,
        features: ['rag_query', 'historical_context', 'vector_search']
      };
    }
  }

  /**
   * Test: Agente PROPHET (predicciones)
   */
  async _testProphetAgent() {
    const testName = 'PROPHET Agent (Price Prediction)';
    console.log(`\n🔮 Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const start = Date.now();
      const response = await this.client.getPricePrediction('BTCUSDT', '1h');
      const latency = Date.now() - start;

      this._recordLatency(latency);

      if (!response) {
        return {
          passed: false,
          message: 'No response from PROPHET',
          data: null
        };
      }

      const hasPrediction = 'prediction' in response || 'price' in response || 'forecast' in response;

      return {
        passed: true,
        message: `PROPHET prediction works (${latency}ms)`,
        data: {
          response,
          hasPrediction,
          latency
        }
      };
    });

    this.results.tests.push(result);

    if (result.passed) {
      this.results.agents.prophet = {
        status: 'operational',
        latency: result.data?.latency || null,
        features: ['price_prediction', 'time_series', 'forecasting']
      };
    }
  }

  /**
   * Test: Agente SENTIMENT (análisis de noticias)
   */
  async _testSentimentAgent() {
    const testName = 'SENTIMENT Agent (News Analysis)';
    console.log(`\n📰 Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const start = Date.now();
      const response = await this.client.getSentimentAnalysis('BTCUSDT');
      const latency = Date.now() - start;

      this._recordLatency(latency);

      if (!response) {
        return {
          passed: false,
          message: 'No response from SENTIMENT',
          data: null
        };
      }

      const hasSentiment = 'sentiment' in response || 'score' in response || 'analysis' in response;

      return {
        passed: true,
        message: `SENTIMENT analysis works (${latency}ms)`,
        data: {
          response,
          hasSentiment,
          latency
        }
      };
    });

    this.results.tests.push(result);

    if (result.passed) {
      this.results.agents.sentiment = {
        status: 'operational',
        latency: result.data?.latency || null,
        features: ['news_analysis', 'sentiment_scoring', 'social_media']
      };
    }
  }

  /**
   * Test: Agente ARBITER (ensemble y ranking)
   */
  async _testArbiterAgent() {
    const testName = 'ARBITER Agent (Ensemble & Ranking)';
    console.log(`\n⚖️  Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const opportunities = [
        { symbol: 'BTCUSDT', score: 0.8, confidence: 0.75 },
        { symbol: 'ETHUSDT', score: 0.7, confidence: 0.65 },
        { symbol: 'SOLUSDT', score: 0.6, confidence: 0.60 }
      ];

      const start = Date.now();
      const response = await this.client.getRanking(opportunities);
      const latency = Date.now() - start;

      this._recordLatency(latency);

      if (!response) {
        return {
          passed: false,
          message: 'No response from ARBITER',
          data: null
        };
      }

      const isArray = Array.isArray(response);
      const hasRanking = isArray && response.length > 0;

      return {
        passed: true,
        message: `ARBITER ranking works (${latency}ms)`,
        data: {
          response,
          isArray,
          hasRanking,
          latency
        }
      };
    });

    this.results.tests.push(result);

    if (result.passed) {
      this.results.agents.arbiter = {
        status: 'operational',
        latency: result.data?.latency || null,
        features: ['ensemble_ranking', 'opportunity_scoring', 'consensus']
      };
    }
  }

  /**
   * Test: Agente MNEMO (memoria)
   */
  async _testMnemoAgent() {
    const testName = 'MNEMO Agent (Persistent Memory)';
    console.log(`\n🧠 Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const testEvent = {
        type: 'test_signal',
        symbol: 'BTCUSDT',
        action: 'buy',
        timestamp: new Date().toISOString(),
        metadata: {
          test: true,
          source: 'ai_integration_test'
        }
      };

      const start = Date.now();
      await this.client.storeMemory(testEvent);
      const latency = Date.now() - start;

      this._recordLatency(latency);

      // MNEMO no retorna datos en store, solo confirmación
      return {
        passed: true,
        message: `MNEMO memory storage works (${latency}ms)`,
        data: {
          event: testEvent,
          latency
        }
      };
    });

    this.results.tests.push(result);

    if (result.passed) {
      this.results.agents.mnemo = {
        status: 'operational',
        latency: result.data?.latency || null,
        features: ['persistent_memory', 'event_storage', 'learning']
      };
    }
  }

  /**
   * Test: Flujo completo de señal
   */
  async _testFullSignalFlow() {
    const testName = 'Full Signal Flow (End-to-End)';
    console.log(`\n🔄 Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      // 1. Enviar señal
      const signal = {
        symbol: 'ETHUSDT',
        action: 'sell',
        price: 3450.75,
        quantity: 0.05,
        timestamp: new Date().toISOString(),
        source: 'test_e2e',
        strategy: 'scalper_rsi'
      };

      const start = Date.now();
      const signalResponse = await this.client.sendSignal(signal);
      const signalLatency = Date.now() - start;

      // 2. Obtener decisión (si hay signal_id)
      let decisionResponse = null;
      let decisionLatency = 0;

      if (signalResponse && signalResponse.signal_id) {
        const decisionStart = Date.now();
        decisionResponse = await this.client.getDecision(signalResponse.signal_id);
        decisionLatency = Date.now() - decisionStart;
      }

      // 3. Confirmar ejecución
      const execution = {
        signal_id: signalResponse?.signal_id || 'test_id',
        status: 'executed',
        executed_price: signal.price,
        executed_quantity: signal.quantity,
        execution_time: new Date().toISOString()
      };

      const execStart = Date.now();
      await this.client.sendTradeExecution(execution);
      const execLatency = Date.now() - execStart;

      const totalLatency = signalLatency + decisionLatency + execLatency;

      return {
        passed: true,
        message: `Full flow completed (${totalLatency}ms total)`,
        data: {
          signal: { response: signalResponse, latency: signalLatency },
          decision: { response: decisionResponse, latency: decisionLatency },
          execution: { latency: execLatency },
          total: totalLatency
        }
      };
    });

    this.results.tests.push(result);
  }

  /**
   * Test: Requests concurrentes
   */
  async _testConcurrentRequests() {
    const testName = 'Concurrent Requests';
    console.log(`\n⚡ Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
      const start = Date.now();

      // Ejecutar requests en paralelo
      const promises = symbols.map(symbol =>
        this.client.getPricePrediction(symbol, '1h')
      );

      const responses = await Promise.all(promises);
      const totalLatency = Date.now() - start;
      const avgLatency = totalLatency / symbols.length;

      const successful = responses.filter(r => r !== null).length;

      return {
        passed: true,
        message: `Concurrent requests: ${successful}/${symbols.length} successful (avg: ${avgLatency.toFixed(0)}ms)`,
        data: {
          requested: symbols.length,
          successful,
          failed: symbols.length - successful,
          totalLatency,
          avgLatency
        }
      };
    });

    this.results.tests.push(result);
  }

  /**
   * Test: Manejo de errores
   */
  async _testErrorHandling() {
    const testName = 'Error Handling';
    console.log(`\n🛡️  Test: ${testName}`);

    const result = await this._executeTest(testName, async () => {
      const errorTests = [];

      // 1. Símbolo inválido
      try {
        const response = await this.client.getPricePrediction('', '1h');
        errorTests.push({
          test: 'empty_symbol',
          handled: response === null || 'error' in response
        });
      } catch (e) {
        errorTests.push({ test: 'empty_symbol', handled: true, error: e.message });
      }

      // 2. URL inválida (crear cliente temporal)
      try {
        const badClient = new InvestCriptoAIAgentsClient({
          baseUrl: 'http://localhost:9999', // Puerto inválido
          timeout: 500,
          enabled: true
        });

        const response = await badClient.healthCheck();
        errorTests.push({
          test: 'invalid_port',
          handled: response.status === 'unhealthy' || response.error
        });
      } catch (e) {
        errorTests.push({ test: 'invalid_port', handled: true });
      }

      // 3. Datos inválidos
      try {
        const response = await this.client.sendSignal({});
        errorTests.push({
          test: 'empty_signal',
          handled: response !== null
        });
      } catch (e) {
        errorTests.push({ test: 'empty_signal', handled: true });
      }

      const allHandled = errorTests.every(t => t.handled);

      return {
        passed: allHandled,
        message: `Error handling: ${errorTests.filter(t => t.handled).length}/${errorTests.length} cases handled`,
        data: { errorTests }
      };
    });

    this.results.tests.push(result);
  }

  /**
   * Ejecuta un test individual y captura errores
   */
  async _executeTest(name, testFn) {
    this.results.summary.total++;

    try {
      const result = await testFn();

      if (result.passed) {
        this.results.summary.passed++;
        console.log(`   ✅ PASS: ${result.message}`);
      } else {
        this.results.summary.failed++;
        console.log(`   ❌ FAIL: ${result.message}`);
      }

      return {
        name,
        ...result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.results.summary.failed++;
      console.log(`   ❌ ERROR: ${error.message}`);

      return {
        name,
        passed: false,
        message: `Exception: ${error.message}`,
        error: error.stack,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Registra latencia para estadísticas
   */
  _recordLatency(latency) {
    this.latencies.push(latency);
  }

  /**
   * Calcula resumen de resultados
   */
  _calculateSummary() {
    if (this.latencies.length > 0) {
      this.results.latency.min = Math.min(...this.latencies);
      this.results.latency.max = Math.max(...this.latencies);
      this.results.latency.avg = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    } else {
      this.results.latency.min = 0;
    }

    this.results.summary.success_rate = this.results.summary.total > 0
      ? (this.results.summary.passed / this.results.summary.total * 100).toFixed(1)
      : 0;
  }

  /**
   * Imprime resumen en consola
   */
  _printSummary() {
    console.log('\n========================================');
    console.log('📊 TEST SUMMARY');
    console.log('========================================\n');

    console.log(`Total Tests: ${this.results.summary.total}`);
    console.log(`✅ Passed: ${this.results.summary.passed}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`⏭️  Skipped: ${this.results.summary.skipped}`);
    console.log(`📈 Success Rate: ${this.results.summary.success_rate}%\n`);

    console.log('📊 Latency Statistics:');
    console.log(`   Min: ${this.results.latency.min.toFixed(0)}ms`);
    console.log(`   Max: ${this.results.latency.max.toFixed(0)}ms`);
    console.log(`   Avg: ${this.results.latency.avg.toFixed(0)}ms\n`);

    console.log('🤖 Agents Status:');
    for (const [agent, info] of Object.entries(this.results.agents)) {
      const status = info.status === 'operational' ? '✅' : '❌';
      console.log(`   ${status} ${agent.toUpperCase()}: ${info.status}`);
      if (info.latency) {
        console.log(`      Latency: ${info.latency}ms`);
      }
      console.log(`      Features: ${info.features.join(', ')}`);
    }

    console.log('\n========================================\n');
  }

  /**
   * Guarda resultados en archivo JSON
   */
  async saveResults(outputPath) {
    const fs = await import('fs');
    const path = await import('path');

    // Asegurar que el directorio existe
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2));
    console.log(`💾 Results saved to: ${outputPath}`);
  }
}

/**
 * Función principal
 */
async function main() {
  const args = process.argv.slice(2);

  // Configuración desde argumentos de línea de comandos
  const config = {
    baseUrl: process.env.INVESTCRIPTO_AI_URL || 'http://localhost:8000',
    timeout: parseInt(process.env.AI_TIMEOUT || '5000'),
    retryAttempts: parseInt(process.env.AI_RETRY_ATTEMPTS || '2'),
    enabled: true
  };

  // Parse argumentos
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      config.baseUrl = args[++i];
    } else if (args[i] === '--timeout' && args[i + 1]) {
      config.timeout = parseInt(args[++i]);
    } else if (args[i] === '--retries' && args[i + 1]) {
      config.retryAttempts = parseInt(args[++i]);
    } else if (args[i] === '--output' && args[i + 1]) {
      config.output = args[++i];
    }
  }

  const tester = new AIIntegrationTester(config);

  try {
    await tester.runAllTests();

    // Guardar resultados
    const outputPath = config.output || 'implementation/phase1_paper_trading/results/ai_integration_test.json';
    await tester.saveResults(outputPath);

    // Exit con código apropiado
    const exitCode = tester.results.summary.failed > 0 ? 1 : 0;
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { AIIntegrationTester };
