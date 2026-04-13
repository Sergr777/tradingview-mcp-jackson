/**
 * CLIENTE PARA INTEGRACIÓN CON INVESTCRIPTO AI AGENTS
 *
 * Proporciona interfaz para comunicarse con los agentes de IA
 * ubicados en el sistema invest_criptoai (Python/FastAPI)
 */

export class InvestCriptoAIAgentsClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:8000';
    this.timeout = config.timeout || 5000; // 5 segundos
    this.enabled = config.enabled !== false; // Activado por defecto
    this.retryAttempts = config.retryAttempts || 2;
  }

  /**
   * Envía señal de trading a los agents para validación
   */
  async sendSignal(signal) {
    if (!this.enabled) {
      return this._getDisabledResponse();
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/v1/trading/signals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signal),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[InvestCriptoAI] Error sending signal: ${error.message}`);
      return this._getErrorFallback(signal, error);
    }
  }

  /**
   * Obtiene decisión de los agents para una señal específica
   */
  async getDecision(signalId) {
    if (!this.enabled) {
      return { approve: true, confidence: 1.0, reasoning: 'AI disabled - auto-approved' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/trading/signals/${signalId}/decision`);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[InvestCriptoAI] Error getting decision: ${error.message}`);
      return { approve: true, confidence: 0.5, reasoning: 'Error - auto-approved with low confidence' };
    }
  }

  /**
   * Envía confirmación de trade ejecutado
   */
  async sendTradeExecution(execution) {
    if (!this.enabled) return;

    try {
      await fetch(`${this.baseUrl}/api/v1/trading/execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(execution)
      });
    } catch (error) {
      console.error(`[InvestCriptoAI] Error sending execution: ${error.message}`);
    }
  }

  /**
   * Solicita predicción de precio (PROPHET agent)
   */
  async getPricePrediction(symbol, horizon = '1h') {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/prophet/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, horizon })
      });

      return await response.json();
    } catch (error) {
      console.error(`[InvestCriptoAI] Error getting prediction: ${error.message}`);
      return null;
    }
  }

  /**
   * Obtiene análisis de sentimiento (SENTIMENT agent)
   */
  async getSentimentAnalysis(symbol) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/sentiment/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });

      return await response.json();
    } catch (error) {
      console.error(`[InvestCriptoAI] Error getting sentiment: ${error.message}`);
      return null;
    }
  }

  /**
   * Consulta contexto histórico (ORÁCULO agent)
   */
  async queryHistoricalContext(query) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/oraculo/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      return await response.json();
    } catch (error) {
      console.error(`[InvestCriptoAI] Error querying context: ${error.message}`);
      return null;
    }
  }

  /**
   * Almacena evento en memoria (MNEMO agent)
   */
  async storeMemory(event) {
    if (!this.enabled) return;

    try {
      await fetch(`${this.baseUrl}/api/v1/mnemo/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
    } catch (error) {
      console.error(`[InvestCriptoAI] Error storing memory: ${error.message}`);
    }
  }

  /**
   * Solicita ranking de oportunidades (ARBITER agent)
   */
  async getRanking(opportunities) {
    if (!this.enabled) return opportunities;

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/arbiter/rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunities })
      });

      return await response.json();
    } catch (error) {
      console.error(`[InvestCriptoAI] Error getting ranking: ${error.message}`);
      return opportunities;
    }
  }

  /**
   * Verifica salud de la API
   */
  async healthCheck() {
    if (!this.enabled) return { status: 'disabled' };

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/health`, {
        method: 'GET'
      });

      return await response.json();
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Respuesta cuando AI está deshabilitado
   */
  _getDisabledResponse() {
    return {
      approve: true,
      final_confidence: 1.0,
      position_size: 1.0,
      reasoning: 'AI ensemble disabled - auto-approved',
      agent_votes: {
        kronos: true,
        oraculo: true,
        prophet: true,
        sentiment: true,
        arbiter: true
      }
    };
  }

  /**
   * Respuesta fallback cuando hay error
   */
  _getErrorFallback(signal, error) {
    return {
      approve: true,
      final_confidence: 0.5,
      position_size: signal.position_size || 1.0,
      reasoning: `AI error (${error.message}) - auto-approved with medium confidence`,
      agent_votes: {
        kronos: true,
        oraculo: null,
        prophet: null,
        sentiment: null,
        arbiter: null
      },
      error: true
    };
  }
}

export default InvestCriptoAIAgentsClient;
