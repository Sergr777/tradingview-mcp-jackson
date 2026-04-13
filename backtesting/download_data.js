import { writeFileSync } from 'fs';
import fetch from 'node-fetch';

/**
 * Descarga datos históricos de BTCUSDT desde Binance API
 * Timeframes: 5m, 15m, 1h
 * Período: 2 años
 */

async function fetchBinanceData(symbol = 'BTCUSDT', interval = '5m', years = 2) {
  const endPoint = 'https://api.binance.com/api/v3/klines';

  // Calcular fechas
  const endTime = Date.now();
  const startTime = endTime - (years * 365 * 24 * 60 * 60 * 1000);

  // Binance retorna máximo 1000 velas por request
  const limit = 1000;
  const allData = [];

  let currentStartTime = startTime;
  let requestCount = 0;

  console.log(`📥 Descargando ${symbol} ${interval}...`);

  while (currentStartTime < endTime) {
    try {
      const url = `${endPoint}?symbol=${symbol}&interval=${interval}&startTime=${currentStartTime}&endTime=${endTime}&limit=${limit}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.length === 0) break;

      allData.push(...data);

      // Avanzar al siguiente lote
      const lastTimestamp = data[data.length - 1][0];
      currentStartTime = lastTimestamp + 1;

      requestCount++;

      // Rate limiting - Binance permite 1200 requests/minuto
      await new Promise(resolve => setTimeout(resolve, 50));

      // Progress cada 10 requests
      if (requestCount % 10 === 0) {
        console.log(`   Descargados: ${allData.length.toLocaleString()} velas...`);
      }

    } catch (error) {
      console.error(`❌ Error en request ${requestCount}:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Formatear datos
  return allData.map(kline => ({
    timestamp: kline[0],
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5])
  }));
}

async function downloadHistoricalData() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     DESCARGA DE DATOS HISTÓRICOS - BTCUSDT 2 AÑOS          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Crear directorio data si no existe
    const fs = await import('fs');
    if (!fs.existsSync('backtesting/data')) {
      fs.mkdirSync('backtesting/data', { recursive: true });
      console.log('📁 Directorio backtesting/data creado');
    }

    // Descargar datos de 5min
    console.log('\n📊 Descargando datos de 5 minutos...');
    const data5m = await fetchBinanceData('BTCUSDT', '5m', 2);
    writeFileSync(
      'backtesting/data/btcusdt_5m_2years.json',
      JSON.stringify(data5m, null, 2)
    );
    console.log(`✅ Datos 5m guardados: ${data5m.length.toLocaleString()} velas`);

    // Descargar datos de 15min
    console.log('\n📊 Descargando datos de 15 minutos...');
    const data15m = await fetchBinanceData('BTCUSDT', '15m', 2);
    writeFileSync(
      'backtesting/data/btcusdt_15m_2years.json',
      JSON.stringify(data15m, null, 2)
    );
    console.log(`✅ Datos 15m guardados: ${data15m.length.toLocaleString()} velas`);

    // Descargar datos de 1h (para análisis macro)
    console.log('\n📊 Descargando datos de 1 hora...');
    const data1h = await fetchBinanceData('BTCUSDT', '1h', 2);
    writeFileSync(
      'backtesting/data/btcusdt_1h_2years.json',
      JSON.stringify(data1h, null, 2)
    );
    console.log(`✅ Datos 1h guardados: ${data1h.length.toLocaleString()} velas`);

    // Estadísticas
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ESTADÍSTICAS                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`📅 Período:`);
    console.log(`   Desde: ${new Date(data5m[0].timestamp).toLocaleDateString()}`);
    console.log(`   Hasta: ${new Date(data5m[data5m.length-1].timestamp).toLocaleDateString()}`);
    console.log(`   Días: ${((data5m[data5m.length-1].timestamp - data5m[0].timestamp) / (1000 * 60 * 60 * 24)).toFixed(0)} días`);

    console.log(`\n📈 Velas descargadas:`);
    console.log(`   5 minutos:  ${data5m.length.toLocaleString()} velas`);
    console.log(`   15 minutos: ${data15m.length.toLocaleString()} velas`);
    console.log(`   1 hora:     ${data1h.length.toLocaleString()} velas`);

    console.log(`\n💾 Tamaño de archivos:`);
    const fs2 = await import('fs');
    const size5m = (fs2.statSync('backtesting/data/btcusdt_5m_2years.json').size / 1024 / 1024).toFixed(2);
    const size15m = (fs2.statSync('backtesting/data/btcusdt_15m_2years.json').size / 1024 / 1024).toFixed(2);
    const size1h = (fs2.statSync('backtesting/data/btcusdt_1h_2years.json').size / 1024 / 1024).toFixed(2);
    console.log(`   5m:  ${size5m} MB`);
    console.log(`   15m: ${size15m} MB`);
    console.log(`   1h:  ${size1h} MB`);

    console.log('\n✅ DESCARGA COMPLETADA!');
    console.log('📂 Ubicación: backtesting/data/');

  } catch (error) {
    console.error('\n❌ Error descargando datos:', error.message);
    console.error('   Verifica tu conexión a internet');
    process.exit(1);
  }
}

// Ejecutar
downloadHistoricalData();
