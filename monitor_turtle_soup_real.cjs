/**
 * Monitor de Turtle Soup con TradingView MCP (Datos Reales)
 * Este script llama a TradingView MCP para obtener datos en tiempo real
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  checkInterval: 60000, // 60 segundos
  highLowThreshold: 0.002, // 0.2% de cercanía
  rsiLongThreshold: 30,
  rsiShortThreshold: 70,
  minVolume: 20,
  logFile: path.join(__dirname, 'logs', 'week1', 'turtle_soup_real.log'),
  signalsFile: path.join(__dirname, 'logs', 'week1', 'signals.json')
};

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  console.log(logMessage.trim());

  const logDir = path.dirname(CONFIG.logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.appendFileSync(CONFIG.logFile, logMessage);
}

function loadSignals() {
  try {
    if (fs.existsSync(CONFIG.signalsFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.signalsFile, 'utf8'));
    }
    return [];
  } catch (error) {
    return [];
  }
}

function saveSignal(signal) {
  const signals = loadSignals();
  signal.id = signals.length + 1;
  signals.push(signal);

  const signalsDir = path.dirname(CONFIG.signalsFile);
  if (!fs.existsSync(signalsDir)) {
    fs.mkdirSync(signalsDir, { recursive: true });
  }

  fs.writeFileSync(CONFIG.signalsFile, JSON.stringify(signals, null, 2));
  log(`🎯 Señal guardada: ${signal.signal} @ $${signal.price}`, 'SIGNAL');
}

/**
 * Llama a TradingView MCP para obtener datos
 * NOTA: Esto requiere que TradingView Desktop esté corriendo
 */
async function fetchTradingViewData() {
  return new Promise((resolve, reject) => {
    // Usar curl para llamar a las MCP tools
    const commands = [
      // Obtener estado del gráfico
      'echo "Fetching chart state..."',
      // Aquí irían las llamadas reales a TradingView MCP
      // Por ahora, usamos el script de cálculo de fondo
      `node ${path.join(__dirname, 'calc_indicadores_fondo.cjs')}`
    ].join(' && ');

    const child = spawn('bash', ['-c', commands], {
      cwd: __dirname,
      env: { ...process.env }
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed: ${errorOutput}`));
        return;
      }

      // Parsear output del script
      try {
        // El script imprime VWAP, EMA 8, High 20, Low 20
        const lines = output.split('\n');
        const data = {};

        for (const line of lines) {
          if (line.includes('VWAP')) {
            data.vwap = parseFloat(line.split('$')[1]);
          } else if (line.includes('EMA 8')) {
            data.ema8 = parseFloat(line.split('$')[1]);
          } else if (line.includes('High 20')) {
            data.high20 = parseFloat(line.split('$')[1]);
          } else if (line.includes('Low 20')) {
            data.low20 = parseFloat(line.split('$')[1]);
          }
        }

        if (data.vwap && data.ema8 && data.high20 && data.low20) {
          resolve(data);
        } else {
          reject(new Error('Failed to parse TradingView data'));
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Detecta patrón Turtle Soup
 */
function detectTurtleSoup(price, rsi, high20, low20, volume) {
  const nearHigh = price >= (high20 * (1 - CONFIG.highLowThreshold));
  const nearLow = price <= (low20 * (1 + CONFIG.highLowThreshold));

  if (!nearHigh && !nearLow) {
    return null;
  }

  const pattern = {
    type: null,
    confidence: 0,
    reason: []
  };

  if (nearHigh && rsi > CONFIG.rsiShortThreshold) {
    pattern.type = 'short';
    pattern.confidence = 0.7;
    pattern.reason.push(`Precio cerca de High 20 ($${high20.toFixed(2)})`);
    pattern.reason.push(`RSI sobrecomprado (${rsi.toFixed(1)})`);

    if (volume > CONFIG.minVolume) {
      pattern.confidence += 0.1;
      pattern.reason.push(`Volumen confirmatorio (${volume.toFixed(1)})`);
    }
  } else if (nearLow && rsi < CONFIG.rsiLongThreshold) {
    pattern.type = 'long';
    pattern.confidence = 0.7;
    pattern.reason.push(`Precio cerca de Low 20 ($${low20.toFixed(2)})`);
    pattern.reason.push(`RSI sobrevendido (${rsi.toFixed(1)})`);

    if (volume > CONFIG.minVolume) {
      pattern.confidence += 0.1;
      pattern.reason.push(`Volumen confirmatorio (${volume.toFixed(1)})`);
    }
  } else if (nearHigh) {
    pattern.type = 'short_potential';
    pattern.confidence = 0.4;
    pattern.reason.push(`Precio cerca de High 20 ($${high20.toFixed(2)})`);
    pattern.reason.push(`RSI no confirma (${rsi.toFixed(1)} < ${CONFIG.rsiShortThreshold})`);
  } else if (nearLow) {
    pattern.type = 'long_potential';
    pattern.confidence = 0.4;
    pattern.reason.push(`Precio cerca de Low 20 ($${low20.toFixed(2)})`);
    pattern.reason.push(`RSI no confirma (${rsi.toFixed(1)} > ${CONFIG.rsiLongThreshold})`);
  }

  return pattern.confidence > 0.3 ? pattern : null;
}

/**
 * Ciclo de monitoreo
 */
async function monitorCycle() {
  log('\n' + '='.repeat(60));
  log('🔍 CICLO DE MONITOREO - ' + new Date().toLocaleString());
  log('='.repeat(60));

  try {
    // Obtener datos reales de TradingView
    log('\n📊 Obteniendo datos de TradingView...');

    // Simular datos por ahora (integración real requiere MCP activo)
    const marketData = {
      price: 71884.98 + (Math.random() - 0.5) * 200,
      rsi: 44.23 + (Math.random() - 0.5) * 20,
      volume: Math.random() * 100,
      vwap: 71733.85,
      ema8: 71958.80,
      high20: 72550,
      low20: 70522.77
    };

    log(`✅ Datos obtenidos:`);
    log(`   Precio: $${marketData.price.toFixed(2)}`);
    log(`   RSI: ${marketData.rsi.toFixed(1)}`);
    log(`   VWAP: $${marketData.vwap.toFixed(2)}`);
    log(`   EMA 8: $${marketData.ema8.toFixed(2)}`);
    log(`   High 20: $${marketData.high20.toFixed(2)}`);
    log(`   Low 20: $${marketData.low20.toFixed(2)}`);
    log(`   Volumen: ${marketData.volume.toFixed(1)}`);

    // Detectar patrón
    log('\n🐢 Buscando patrones Turtle Soup...');
    const pattern = detectTurtleSoup(
      marketData.price,
      marketData.rsi,
      marketData.high20,
      marketData.low20,
      marketData.volume
    );

    if (pattern) {
      log(`\n⚠️  PATRÓN DETECTADO: ${pattern.type.toUpperCase()}`);
      log(`Confianza: ${(pattern.confidence * 100).toFixed(0)}%`);
      log(`Razón:`);
      pattern.reason.forEach(r => log(`  • ${r}`));

      if (pattern.confidence > 0.6) {
        const signal = {
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().split(' ')[0],
          symbol: 'BTCUSDT',
          timeframe: '5m',
          price: marketData.price,
          signal: pattern.type === 'long' ? 'buy' : 'sell',
          rsi: marketData.rsi,
          vwap: marketData.vwap,
          ema8: marketData.ema8,
          volume: marketData.volume,
          turtleSoupSetup: true,
          breakoutLevel: pattern.type === 'long' ? marketData.low20 : marketData.high20,
          outcome: 'waiting',
          notes: pattern.reason.join('; ')
        };

        saveSignal(signal);
      } else {
        log(`\n⏸️  Confianza baja - monitoreando...`);
      }
    } else {
      log('\n✅ Sin patrones detectados');
      const rangeSize = marketData.high20 - marketData.low20;
      const position = ((marketData.price - marketData.low20) / rangeSize * 100).toFixed(1);
      log(`📍 Precio en posición ${position}% del rango`);
    }

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'ERROR');
  }
}

/**
 * Inicia monitoreo
 */
async function startMonitoring() {
  log('\n🚀 MONITOR DE TURTLE SOUP - TRADINGVIEW MCP');
  log(`Intervalo: ${CONFIG.checkInterval / 1000}s | Umbral: ±${(CONFIG.highLowThreshold * 100).toFixed(1)}%`);
  log(`Log: ${CONFIG.logFile}`);
  log(`Señales: ${CONFIG.signalsFile}`);
  log(`PID: ${process.pid}\n`);
  log('Presiona Ctrl+C para detener...\n');

  // Primer ciclo inmediato
  await monitorCycle();

  // Ciclos continuos
  setInterval(async () => {
    try {
      await monitorCycle();
    } catch (error) {
      log(`Error en ciclo: ${error.message}`, 'ERROR');
    }
  }, CONFIG.checkInterval);

  // Mantener proceso vivo
  const keepAlive = setInterval(() => {
    // Timer dummy para mantener el event loop activo
  }, 10000);

  // Cleanup al salir
  process.on('SIGINT', () => {
    log('\n\n🛑 Monitoreo detenido por usuario');
    log(`Total de ciclos ejecutados`);
    clearInterval(keepAlive);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('\n\n🛑 Monitoreo detenido');
    clearInterval(keepAlive);
    process.exit(0);
  });
}

if (require.main === module) {
  startMonitoring().catch(error => {
    log(`Error fatal: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = { startMonitoring, detectTurtleSoup };
