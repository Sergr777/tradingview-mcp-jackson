/**
 * TIPOS Y SCHEMAS COMPARTIDOS
 *
 * Definiciones de tipos para comunicación entre
 * sistemas de trading (Node.js) y agents IA (Python)
 */

/**
 * Señal de trading generada por sistema
 */
export const TradingSignalSchema = {
  system: 'string',           // Nombre del sistema (asian_session, mean_reversion, etc.)
  action: 'string',           // LONG, SHORT, CLOSE
  symbol: 'string',           // BTCUSDT, ETHUSDT, etc.
  confidence: 'number',       // 0.0 a 1.0
  timestamp: 'string',        // ISO 8601
  entry_price: 'number',      // Precio de entrada
  stop_loss: 'number',        // Stop loss
  take_profit: 'number',      // Take profit
  position_size: 'number',    // Tamaño de posición (opcional)
  ai_reasoning: 'string'      // Razón de los agents (opcional)
};

/**
 * Decisión de los agents IA
 */
export const AIDecisionSchema = {
  approve: 'boolean',         // Si aprueba la señal
  final_confidence: 'number', // Confianza final (0.0 a 1.0)
  position_size: 'number',    // Tamaño sugerido (0.0 a 1.0)
  reasoning: 'string',        // Explicación de la decisión
  agent_votes: 'object',      // Voto de cada agent
  signal_id: 'string'         // ID de la señal (opcional)
};

/**
 * Ejecución de trade completada
 */
export const TradeExecutionSchema = {
  signal_id: 'string',        // ID de la señal original
  exchange: 'string',         // bitget, binance, etc.
  order_id: 'string',         // ID de orden en exchange
  status: 'string',           // FILLED, PARTIALLY_FILLED, REJECTED
  executed_price: 'number',   // Precio ejecutado
  executed_size: 'number',    // Tamaño ejecutado
  timestamp: 'string',        // ISO 8601
  fee: 'number'              // Fee pagado (opcional)
};

/**
 * Evento para almacenar en memoria
 */
export const MemoryEventSchema = {
  type: 'string',             // trade, signal, error, etc.
  system: 'string',           // Sistema que generó el evento
  data: 'object',             // Datos del evento
  timestamp: 'string',        // ISO 8601
  importance: 'number'        // 0.0 a 1.0 (opcional)
};

/**
 * Predicción de precio
 */
export const PricePredictionSchema = {
  symbol: 'string',           // Símbolo
  horizon: 'string',          // 1h, 4h, 24h
  current_price: 'number',    // Precio actual
  predicted_price: 'number',  // Precio predicho
  confidence: 'number',       // Confianza (0.0 a 1.0)
  direction: 'string',        // UP, DOWN, SIDEWAYS
  timestamp: 'string'         // ISO 8601
};

/**
 * Análisis de sentimiento
 */
export const SentimentAnalysisSchema = {
  symbol: 'string',           // Símbolo
  score: 'number',            // -1.0 (bearish) a +1.0 (bullish)
  sources: 'array',           // Fuentes analizadas
  highlights: 'array',        // Noticias/resúmenes destacados
  timestamp: 'string'         // ISO 8601
};

/**
 * Estado de sistema
 */
export const SystemStatusSchema = {
  system: 'string',           // Nombre del sistema
  status: 'string',           // active, paused, error
  capital: 'number',          // Capital asignado
  pnl: 'number',              // PnL actual
  win_rate: 'number',         // Win rate
  trades_today: 'number',     // Trades hoy
  last_trade: 'string',       // Timestamp último trade
  uptime: 'number'            // Uptime en segundos
};

/**
 * Configuración de sistema
 */
export const SystemConfigSchema = {
  system: 'string',           // Nombre del sistema
  enabled: 'boolean',         // Si está habilitado
  capital: 'number',          // Capital asignado
  max_position_size: 'number', // Tamaño máximo de posición
  risk_per_trade: 'number',   // Riesgo por trade (%)
  use_ai_ensemble: 'boolean', // Si usa ensemble de IA
  news_filter_enabled: 'boolean', // Si usa filtro de noticias
  parameters: 'object'        // Parámetros específicos del sistema
};

/**
 * Resultado de backtest
 */
export const BacktestResultSchema = {
  system: 'string',           // Sistema probado
  start_date: 'string',       // Fecha inicio
  end_date: 'string',         // Fecha fin
  trades: 'number',           // Número de trades
  win_rate: 'number',         // Win rate
  pnl: 'number',              // PnL total
  sharpe_ratio: 'number',     // Sharpe ratio
  max_drawdown: 'number',     // Máximo drawdown
  parameters: 'object',       // Parámetros usados
  timestamp: 'string'         // ISO 8601
};

/**
 * Alerta de monitoreo
 */
export const MonitoringAlertSchema = {
  level: 'string',            // critical, warning, info
  system: 'string',           // Sistema que generó
  metric: 'string',           // Métrica que disparó
  value: 'number',            // Valor actual
  threshold: 'number',        // Umbral
  message: 'string',          // Mensaje descriptivo
  timestamp: 'string'         // ISO 8601
};

/**
 * Helper para validar schema
 */
export function validateSchema(data, schema) {
  const errors = [];

  for (const [key, expectedType] of Object.entries(schema)) {
    if (!(key in data)) {
      errors.push(`Missing required field: ${key}`);
      continue;
    }

    const actualType = typeof data[key];
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'array': 'object'
    };

    if (typeMap[expectedType] && typeMap[expectedType] !== actualType) {
      errors.push(`Field ${key}: expected ${expectedType}, got ${actualType}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Helper para crear señal de trading
 */
export function createTradingSignal(data) {
  return {
    system: data.system,
    action: data.action,
    symbol: data.symbol,
    confidence: data.confidence || 0.5,
    timestamp: data.timestamp || new Date().toISOString(),
    entry_price: data.entry_price,
    stop_loss: data.stop_loss,
    take_profit: data.take_profit,
    position_size: data.position_size || 1.0,
    ai_reasoning: data.ai_reasoning || null
  };
}

/**
 * Helper para crear decisión de IA
 */
export function createAIDecision(data) {
  return {
    approve: data.approve !== false,
    final_confidence: data.final_confidence || 0.5,
    position_size: data.position_size || 1.0,
    reasoning: data.reasoning || 'No reasoning provided',
    agent_votes: data.agent_votes || {},
    signal_id: data.signal_id || null
  };
}

/**
 * Helper para crear evento de memoria
 */
export function createMemoryEvent(data) {
  return {
    type: data.type || 'generic',
    system: data.system || 'unknown',
    data: data.data || {},
    timestamp: data.timestamp || new Date().toISOString(),
    importance: data.importance || 0.5
  };
}

export default {
  TradingSignalSchema,
  AIDecisionSchema,
  TradeExecutionSchema,
  MemoryEventSchema,
  PricePredictionSchema,
  SentimentAnalysisSchema,
  SystemStatusSchema,
  SystemConfigSchema,
  BacktestResultSchema,
  MonitoringAlertSchema,
  validateSchema,
  createTradingSignal,
  createAIDecision,
  createMemoryEvent
};
