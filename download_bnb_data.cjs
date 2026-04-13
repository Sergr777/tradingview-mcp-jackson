/**
 * 📥 DESCARGAR DATOS HISTÓRICOS BNB/USDT DESDE BINANCE DATA VISION
 *
 * Este script descarga velas de 5min de BNB/USDT desde la fuente oficial de Binance
 * y las guarda en el formato esperado por los backtests.
 *
 * Uso:
 *   node download_bnb_data.js
 *
 * Resultado:
 *   - backtesting/data/bnbusdt_5m_2years.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  symbol: 'BNBUSDT',
  interval: '5m',
  years: 2, // Descargar últimos 2 años
  baseUrl: 'https://data.binance.vision/data/spot/daily/klines',
  outputDir: path.join(__dirname, 'backtesting', 'data'),
  outputFile: path.join(__dirname, 'backtesting', 'data', 'bnbusdt_5m_2years.json')
};

/**
 * Descarga un archivo de URL
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Seguir redirect
        downloadFile(response.headers.location)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const data = [];
      response.on('data', (chunk) => data.push(chunk));
      response.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', reject);
  });
}

/**
 * Descarga velas de un mes específico
 */
async function downloadMonth(year, month) {
  const monthStr = String(month).padStart(2, '0');
  const url = `${CONFIG.baseUrl}/${CONFIG.symbol}/${CONFIG.interval}/${CONFIG.symbol}-${CONFIG.interval}-${year}-${monthStr}.zip`;

  console.log(`📥 Descargando ${year}-${monthStr}...`);

  try {
    const data = await downloadFile(url);

    // Guardar archivo ZIP temporal
    const tempZipPath = path.join(CONFIG.outputDir, `temp_${year}_${monthStr}.zip`);
    fs.writeFileSync(tempZipPath, data);

    console.log(`✅ ${year}-${monthStr} descargado (${(data.length / 1024).toFixed(2)} KB)`);
    return tempZipPath;
  } catch (error) {
    console.error(`❌ Error descargando ${year}-${monthStr}: ${error.message}`);
    return null;
  }
}

/**
 * Descarga todos los meses necesarios
 */
async function downloadAllMonths() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - CONFIG.years);

  const monthsToDownload = [];
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    monthsToDownload.push({
      year: currentDate.getFullYear(),
      month: currentDate.getMonth() + 1
    });
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  console.log(`\n📅 Descargando ${monthsToDownload.length} meses de datos...\n`);

  const results = [];
  for (const { year, month } of monthsToDownload) {
    const zipPath = await downloadMonth(year, month);
    if (zipPath) {
      results.push(zipPath);
    }
    // Pequeña pausa para no sobrecargar el servidor
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Procesa archivos ZIP descargados
 * NOTA: Esta función requiere la librería 'adm-zip' o 'yauzl'
 * Por simplicidad, vamos a usar un enfoque alternativo sin descomprimir ZIP
 */
async function processDownloadedFiles(zipFiles) {
  console.log('\n⚠️  NOTA: Los archivos descargados están en formato ZIP.');
  console.log('⚠️  Para procesarlos, necesitamos descomprimir y combinar.');
  console.log('⚠️  Vamos a usar un método alternativo más simple.\n');

  // Limpiar archivos temporales ZIP
  for (const zipFile of zipFiles) {
    if (fs.existsSync(zipFile)) {
      fs.unlinkSync(zipFile);
    }
  }

  console.log('🗑️  Archivos temporales eliminados.\n');
}

/**
 * MÉTODO ALTERNATIVO: Usar API pública de Binance para descargar datos
 */
async function downloadBinanceKlines() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     📥 DESCARGANDO DATOS BNB/USDT DESDE BINANCE API              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const allCandles = [];
  const endDate = Date.now();
  const startDate = endDate - (CONFIG.years * 365 * 24 * 60 * 60 * 1000);

  let currentTimestamp = startDate;
  let batchCount = 0;

  console.log(`📊 Período: ${new Date(startDate).toISOString().split('T')[0]} a ${new Date(endDate).toISOString().split('T')[0]}`);
  console.log(`📈 Símbolo: ${CONFIG.symbol}`);
  console.log(`⏱️  Intervalo: ${CONFIG.interval}\n`);

  // Binance API retorna máximo 1000 velas por petición
  // Necesitamos hacer múltiples peticiones
  while (currentTimestamp < endDate) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${CONFIG.symbol}&interval=${CONFIG.interval}&startTime=${currentTimestamp}&limit=1000`;

    try {
      const data = await downloadFile(url);
      const candles = JSON.parse(data.toString());

      if (candles.length === 0) {
        console.log('✅ No hay más datos disponibles');
        break;
      }

      // Formatear velas al formato esperado
      const formattedCandles = candles.map(candle => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));

      allCandles.push(...formattedCandles);
      batchCount++;

      // Actualizar timestamp al último candle + 1ms
      currentTimestamp = candles[candles.length - 1][0] + 1;

      // Progreso
      if (batchCount % 10 === 0) {
        console.log(`📊 Progreso: ${allCandles.length.toLocaleString()} velas descargadas...`);
      }

      // Pequeña pausa para no exceder rate limits
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`❌ Error descargando lote ${batchCount}: ${error.message}`);
      break;
    }
  }

  console.log(`\n✅ Descarga completada: ${allCandles.length.toLocaleString()} velas`);

  return allCandles;
}

/**
 * Guarda datos en formato JSON
 */
function saveData(candles) {
  console.log('\n💾 Guardando datos...');

  // Crear directorio si no existe
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // Ordenar por timestamp
  candles.sort((a, b) => a.timestamp - b.timestamp);

  // Guardar
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(candles, null, 2));

  const fileSize = (fs.statSync(CONFIG.outputFile).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Datos guardados en: ${CONFIG.outputFile}`);
  console.log(`📊 Tamaño: ${fileSize} MB`);
  console.log(`📈 Velas: ${candles.length.toLocaleString()}`);

  // Estadísticas rápidas
  const firstCandle = candles[0];
  const lastCandle = candles[candles.length - 1];
  const priceRange = {
    min: Math.min(...candles.map(c => c.low)),
    max: Math.max(...candles.map(c => c.high))
  };

  console.log(`\n📊 Estadísticas:`);
  console.log(`   Fecha inicial: ${new Date(firstCandle.timestamp).toISOString()}`);
  console.log(`   Fecha final: ${new Date(lastCandle.timestamp).toISOString()}`);
  console.log(`   Rango precios: $${priceRange.min.toFixed(2)} - $${priceRange.max.toFixed(2)}`);
  console.log(`   Precio inicial: $${firstCandle.close.toFixed(2)}`);
  console.log(`   Precio final: $${lastCandle.close.toFixed(2)}`);
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     📥 DESCARGA DE DATOS HISTÓRICOS BNB/USDT                   ║');
    console.log('║     Desde Binance API (Datos reales)                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Descargar velas usando API pública
    const candles = await downloadBinanceKlines();

    if (candles.length === 0) {
      console.error('❌ No se descargaron datos. Verifica tu conexión a internet.');
      process.exit(1);
    }

    // Guardar datos
    saveData(candles);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ DESCARGA COMPLETADA CON ÉXITO                           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Próximo paso:');
    console.log(`   Ejecutar backtest BNB ML v3 con datos reales:`);
    console.log(`   node backtest_bnb_ml_1year_v3_real_data.cjs\n`);

  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { downloadBinanceKlines, saveData };
