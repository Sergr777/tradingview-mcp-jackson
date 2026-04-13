/**
 * Wrapper para mantener monitor_turtle_soup_real.cjs corriendo 24/7
 * Se reinicia automáticamente si el proceso muere
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs', 'week1', 'monitor_wrapper.log');
const MONITOR_SCRIPT = path.join(__dirname, 'monitor_turtle_soup_real.cjs');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());

  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.appendFileSync(LOG_FILE, logMessage);
}

function startMonitor() {
  log('🚀 Iniciando monitor_turtle_soup_real.cjs...');

  const child = spawn('node', [MONITOR_SCRIPT], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env }
  });

  child.on('error', (error) => {
    log(`❌ Error al iniciar monitor: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      log(`⚠️  Monitor terminó con código ${code}, reiniciando en 5 segundos...`);
      setTimeout(startMonitor, 5000);
    } else if (signal) {
      log(`⚠️  Monitor terminado por señal ${signal}, reiniciando en 5 segundos...`);
      setTimeout(startMonitor, 5000);
    } else {
      log('✅ Monitor terminado normalmente, no reiniciando');
    }
  });

  return child;
}

// Manejo de señales
process.on('SIGINT', () => {
  log('\n🛑 Wrapper detenido por usuario');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('\n🛑 Wrapper detenido');
  process.exit(0);
});

// Iniciar
log('='.repeat(60));
log('🔄 WRAPPER DE MONITOREO 24/7');
log('='.repeat(60));
log('Mantiene monitor_turtle_soup_real.cjs corriendo continuamente');
log('Si el monitor muere, se reinicia automáticamente');
log('Log: ' + LOG_FILE);
log('Presiona Ctrl+C para detener');
log('='.repeat(60));
log('');

const monitor = startMonitor();

log('✅ Wrapper iniciado, monitor corriendo (PID: ' + monitor.pid + ')');
