/**
 * Calcula VWAP, EMA 8, High 20, Low 20 de datos OHLCV
 * Para uso con TradingView MCP durante captura de datos baseline
 */

const fs = require('fs');

// Datos OHLCV obtenidos de TradingView MCP
const bars = [
  {"time": 1775730000, "open": 71406.77, "high": 71484.65, "low": 71404.97, "close": 71457.97, "volume": 24.39415},
  {"time": 1775730300, "open": 71457.97, "high": 71469.28, "low": 71392.08, "close": 71393.18, "volume": 25.52411},
  {"time": 1775730600, "open": 71393.17, "high": 71393.9, "low": 71355.22, "close": 71386.76, "volume": 16.13674},
  {"time": 1775730900, "open": 71386.76, "high": 71401.12, "low": 71357.61, "close": 71384.97, "volume": 17.97642},
  {"time": 1775731200, "open": 71384.98, "high": 71429.22, "low": 71369.31, "close": 71414, "volume": 23.76002},
  {"time": 1775731500, "open": 71414, "high": 71460, "low": 71405.25, "close": 71409.73, "volume": 22.74411},
  {"time": 1775731800, "open": 71409.73, "high": 71409.74, "low": 71315.73, "close": 71337.21, "volume": 16.30246},
  {"time": 1775732100, "open": 71337.2, "high": 71363.87, "low": 71276.44, "close": 71276.45, "volume": 22.04711},
  {"time": 1775732400, "open": 71276.45, "high": 71350, "low": 71257.93, "close": 71315.28, "volume": 27.19795},
  {"time": 1775732700, "open": 71315.28, "high": 71316.09, "low": 71259.03, "close": 71261.53, "volume": 38.70276},
  {"time": 1775733000, "open": 71261.54, "high": 71261.54, "low": 71184.42, "close": 71193.88, "volume": 29.97096},
  {"time": 1775733300, "open": 71193.87, "high": 71209.76, "low": 71136.97, "close": 71209.75, "volume": 23.76785},
  {"time": 1775733600, "open": 71209.76, "high": 71231.12, "low": 71160, "close": 71175.42, "volume": 28.37568},
  {"time": 1775733900, "open": 71175.42, "high": 71175.43, "low": 71038.5, "close": 71078.85, "volume": 152.29381},
  {"time": 1775734200, "open": 71078.86, "high": 71165.43, "low": 71074.17, "close": 71129.16, "volume": 31.16733},
  {"time": 1775734500, "open": 71129.15, "high": 71176.13, "low": 71088.54, "close": 71176.13, "volume": 9.34358},
  {"time": 1775734800, "open": 71176.13, "high": 71206, "low": 71146, "close": 71164.46, "volume": 45.99831},
  {"time": 1775735100, "open": 71164.46, "high": 71221.36, "low": 71164.45, "close": 71216.93, "volume": 12.95229},
  {"time": 1775735400, "open": 71216.93, "high": 71224.47, "low": 71186.35, "close": 71189.61, "volume": 15.95186},
  {"time": 1775735700, "open": 71189.61, "high": 71189.61, "low": 71137.75, "close": 71150.17, "volume": 31.13139},
  {"time": 1775736000, "open": 71150.17, "high": 71213.81, "low": 71150.16, "close": 71201.87, "volume": 16.81968},
  {"time": 1775736300, "open": 71201.86, "high": 71243.55, "low": 71172.51, "close": 71231.34, "volume": 21.44573},
  {"time": 1775736600, "open": 71231.34, "high": 71249.03, "low": 71200.51, "close": 71200.96, "volume": 9.82951},
  {"time": 1775736900, "open": 71200.95, "high": 71243.22, "low": 71164.11, "close": 71166.62, "volume": 28.51033},
  {"time": 1775737200, "open": 71166.62, "high": 71166.62, "low": 71040, "close": 71107.36, "volume": 67.90292},
  {"time": 1775737500, "open": 71107.35, "high": 71328.79, "low": 71107.35, "close": 71275.99, "volume": 55.65063},
  {"time": 1775737800, "open": 71275.99, "high": 71294.5, "low": 71172.58, "close": 71230.01, "volume": 25.80474},
  {"time": 1775738100, "open": 71230.01, "high": 71269.32, "low": 71121.14, "close": 71149.3, "volume": 41.30357},
  {"time": 1775738400, "open": 71149.3, "high": 71298.31, "low": 71128.77, "close": 71212.96, "volume": 40.65499},
  {"time": 1775738700, "open": 71212.97, "high": 71230.86, "low": 71100, "close": 71161.07, "volume": 27.12046},
  {"time": 1775739000, "open": 71161.07, "high": 71224, "low": 71156.23, "close": 71210.59, "volume": 7.23903},
  {"time": 1775739300, "open": 71210.58, "high": 71305.04, "low": 71210.58, "close": 71279.63, "volume": 39.76434},
  {"time": 1775739600, "open": 71279.63, "high": 71355.24, "low": 71172.51, "close": 71178.63, "volume": 31.21958},
  {"time": 1775739900, "open": 71178.64, "high": 71194.88, "low": 71108.83, "close": 71140.55, "volume": 19.80202},
  {"time": 1775740200, "open": 71140.54, "high": 71140.54, "low": 71108.82, "close": 71114.55, "volume": 19.92925},
  {"time": 1775740500, "open": 71114.56, "high": 71142.5, "low": 71108.83, "close": 71132.01, "volume": 12.77119},
  {"time": 1775740800, "open": 71132, "high": 71132.01, "low": 71066.5, "close": 71114.16, "volume": 26.06094},
  {"time": 1775741100, "open": 71114.17, "high": 71154.49, "low": 71101.88, "close": 71109.22, "volume": 14.84347},
  {"time": 1775741400, "open": 71109.22, "high": 71171.89, "low": 70908.07, "close": 70986.61, "volume": 133.12797},
  {"time": 1775741700, "open": 70986.62, "high": 71108.46, "low": 70805.67, "close": 70952.31, "volume": 120.31572},
  {"time": 1775742000, "open": 70951.71, "high": 70965.78, "low": 70814.73, "close": 70892, "volume": 86.69372},
  {"time": 1775742300, "open": 70892, "high": 70913.36, "low": 70747.73, "close": 70881.58, "volume": 75.7397},
  {"time": 1775742600, "open": 70881.57, "high": 70881.57, "low": 70735.78, "close": 70741.48, "volume": 46.94738},
  {"time": 1775742900, "open": 70741.49, "high": 70830.58, "low": 70629.3, "close": 70801.98, "volume": 109.14451},
  {"time": 1775743200, "open": 70801.97, "high": 70830.42, "low": 70714.41, "close": 70790, "volume": 67.87155},
  {"time": 1775743500, "open": 70789.68, "high": 70789.68, "low": 70680.01, "close": 70693.85, "volume": 36.90016},
  {"time": 1775743800, "open": 70693.84, "high": 70850, "low": 70650, "close": 70788.01, "volume": 53.2063},
  {"time": 1775744100, "open": 70788.01, "high": 70824, "low": 70587.99, "close": 70615.97, "volume": 77.90075},
  {"time": 1775744400, "open": 70615.96, "high": 70710, "low": 70605.49, "close": 70696.72, "volume": 23.01412},
  {"time": 1775744700, "open": 70696.72, "high": 70710, "low": 70522.77, "close": 70633.1, "volume": 34.71783},
  {"time": 1775745000, "open": 70633.1, "high": 70683.03, "low": 70601.12, "close": 70657.89, "volume": 41.70109},
  {"time": 1775745300, "open": 70657.9, "high": 70820.65, "low": 70609.87, "close": 70806.52, "volume": 87.39572},
  {"time": 1775745600, "open": 70806.51, "high": 70907.39, "low": 70800.16, "close": 70887.61, "volume": 55.59184},
  {"time": 1775745900, "open": 70887.62, "high": 71029.76, "low": 70887.61, "close": 71028.93, "volume": 117.19383},
  {"time": 1775746200, "open": 71028.93, "high": 71250.39, "low": 71028.92, "close": 71162, "volume": 170.78583},
  {"time": 1775746500, "open": 71162.01, "high": 71239.84, "low": 71080.59, "close": 71123.71, "volume": 107.44421},
  {"time": 1775746800, "open": 71123.71, "high": 71150, "low": 71018.59, "close": 71058.44, "volume": 40.4421},
  {"time": 1775747100, "open": 71058.44, "high": 71079.53, "low": 70929.44, "close": 70929.44, "volume": 56.90212},
  {"time": 1775747400, "open": 70929.44, "high": 71366.43, "low": 70929.44, "close": 71338.59, "volume": 113.34456},
  {"time": 1775747700, "open": 71338.25, "high": 71549.37, "low": 71328.13, "close": 71390, "volume": 119.50827},
  {"time": 1775748000, "open": 71390.01, "high": 71630.74, "low": 71390.01, "close": 71474.46, "volume": 151.52533},
  {"time": 1775748300, "open": 71474.46, "high": 71474.47, "low": 71337.29, "close": 71341.15, "volume": 52.54906},
  {"time": 1775748600, "open": 71341.15, "high": 72241.41, "low": 71292.8, "close": 72201.28, "volume": 423.2605},
  {"time": 1775748900, "open": 72201.29, "high": 72217.7, "low": 71835.67, "close": 71881.64, "volume": 276.93696},
  {"time": 1775749200, "open": 71881.63, "high": 72096, "low": 71874.52, "close": 72075.75, "volume": 240.12769},
  {"time": 1775749500, "open": 72075.74, "high": 72350, "low": 72047.68, "close": 72111.39, "volume": 210.22639},
  {"time": 1775749800, "open": 72111.39, "high": 72242.82, "low": 72078.77, "close": 72231.96, "volume": 145.11628},
  {"time": 1775750100, "open": 72231.95, "high": 72358, "low": 72082.02, "close": 72141.99, "volume": 218.81353},
  {"time": 1775750400, "open": 72142, "high": 72399, "low": 72142, "close": 72304.94, "volume": 287.54352},
  {"time": 1775750700, "open": 72304.93, "high": 72305.55, "low": 72081.51, "close": 72122.01, "volume": 138.99255},
  {"time": 1775751000, "open": 72122, "high": 72311.66, "low": 72116.93, "close": 72176.63, "volume": 107.40255},
  {"time": 1775751300, "open": 72176.62, "high": 72390, "low": 72142.77, "close": 72327.65, "volume": 101.38732},
  {"time": 1775751600, "open": 72327.66, "high": 72347.47, "low": 72115.05, "close": 72172.34, "volume": 115.88729},
  {"time": 1775751900, "open": 72172.34, "high": 72226.33, "low": 72061.55, "close": 72062.61, "volume": 125.89756},
  {"time": 1775752200, "open": 72062.61, "high": 72068.57, "low": 71937.05, "close": 71937.72, "volume": 102.3549},
  {"time": 1775752500, "open": 71937.72, "high": 72013.76, "low": 71778.01, "close": 71857.73, "volume": 138.3342},
  {"time": 1775752800, "open": 71857.73, "high": 71977.54, "low": 71807.37, "close": 71972.11, "volume": 89.68278},
  {"time": 1775753100, "open": 71972.1, "high": 71985.99, "low": 71729.66, "close": 71827.76, "volume": 118.16263},
  {"time": 1775753400, "open": 71827.76, "high": 71930.24, "low": 71804.18, "close": 71889.77, "volume": 35.8368},
  {"time": 1775753700, "open": 71889.78, "high": 72084.25, "low": 71889.77, "close": 72080.87, "volume": 68.201},
  {"time": 1775754000, "open": 72080.86, "high": 72503.95, "low": 72062.38, "close": 72470.57, "volume": 249.96952},
  {"time": 1775754300, "open": 72470.57, "high": 72524.42, "low": 72387.15, "close": 72455.26, "volume": 164.3567},
  {"time": 1775754600, "open": 72455.25, "high": 72514, "low": 72409.57, "close": 72481.24, "volume": 95.85023},
  {"time": 1775754900, "open": 72481.25, "high": 72550, "low": 72407.97, "close": 72425.25, "volume": 181.98396},
  {"time": 1775755200, "open": 72425.25, "high": 72481.27, "low": 72310, "close": 72374.43, "volume": 245.02185},
  {"time": 1775755500, "open": 72374.43, "high": 72388, "low": 72228.24, "close": 72341.74, "volume": 87.08201},
  {"time": 1775755800, "open": 72341.73, "high": 72341.74, "low": 72100, "close": 72183.26, "volume": 73.05206},
  {"time": 1775756100, "open": 72183.25, "high": 72511.25, "low": 72183.25, "close": 72451.63, "volume": 95.15915},
  {"time": 1775756400, "open": 72451.62, "high": 72503.95, "low": 72362.75, "close": 72424.42, "volume": 86.37224},
  {"time": 1775756700, "open": 72424.41, "high": 72481.38, "low": 72337.85, "close": 72370.88, "volume": 71.92149},
  {"time": 1775757000, "open": 72370.88, "high": 72400, "low": 72278.8, "close": 72362.95, "volume": 40.71095},
  {"time": 1775757300, "open": 72362.95, "high": 72362.96, "low": 72263.26, "close": 72347.49, "volume": 24.42907},
  {"time": 1775757600, "open": 72348, "high": 72380.7, "low": 71860, "close": 71921.04, "volume": 120.54087},
  {"time": 1775757900, "open": 71921.04, "high": 72043.89, "low": 71910.28, "close": 72011.42, "volume": 54.92253},
  {"time": 1775758200, "open": 72011.44, "high": 72060.96, "low": 71888.92, "close": 71894.13, "volume": 48.84957},
  {"time": 1775758500, "open": 71894.13, "high": 72009.21, "low": 71862.42, "close": 71924.3, "volume": 51.30421},
  {"time": 1775758800, "open": 71924.3, "high": 71924.3, "low": 71772, "close": 71860.36, "volume": 47.95233},
  {"time": 1775759100, "open": 71860.36, "high": 71945.44, "low": 71800, "close": 71908.44, "volume": 69.05966},
  {"time": 1775759400, "open": 71908.43, "high": 71931.59, "low": 71747.68, "close": 71860.53, "volume": 32.01682},
  {"time": 1775759700, "open": 71860.53, "high": 71912.36, "low": 71852.37, "close": 71901.27, "volume": 10.94396}
];

function calculateVWAP(bars) {
  let cumulativeTPV = 0; // Typical Price × Volume
  let cumulativeVolume = 0;

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
  }

  return cumulativeTPV / cumulativeVolume;
}

function calculateEMA(bars, period) {
  if (bars.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = bars.slice(0, period).reduce((sum, bar) => sum + bar.close, 0) / period; // SMA inicial

  for (let i = period; i < bars.length; i++) {
    ema = (bars[i].close - ema) * multiplier + ema;
  }

  return ema;
}

function calculateHighLow(bars, period) {
  if (bars.length < period) return null;

  const lastBars = bars.slice(-period);
  const high = Math.max(...lastBars.map(bar => bar.high));
  const low = Math.min(...lastBars.map(bar => bar.low));

  return { high, low };
}

function main() {
  console.log('\n📊 INDICADORES DE FONDO (Background Calculations)\n');
  console.log('Datos: 100 velas de BTCUSDT 5m');
  console.log('Rango: 2026-04-09 09:00 a 15:55\n');

  // VWAP
  const vwap = calculateVWAP(bars);
  console.log(`💹 VWAP (100 velas): $${vwap.toFixed(2)}`);

  // EMA 8
  const ema8 = calculateEMA(bars, 8);
  console.log(`📈 EMA 8: $${ema8.toFixed(2)}`);

  // High 20 / Low 20
  const highLow20 = calculateHighLow(bars, 20);
  console.log(`🔼 High 20: $${highLow20.high.toFixed(2)}`);
  console.log(`🔽 Low 20: $${highLow20.low.toFixed(2)}`);

  // Última vela
  const lastBar = bars[bars.length - 1];
  console.log(`\n📍 Último close: $${lastBar.close.toFixed(2)}`);

  // Análisis
  console.log('\n📊 ANÁLISIS:\n');

  // Relación precio vs indicadores
  const diffVWAP = ((lastBar.close - vwap) / vwap * 100).toFixed(2);
  const diffEMA8 = ((lastBar.close - ema8) / ema8 * 100).toFixed(2);

  console.log(`  Precio vs VWAP: ${diffVWAP}% (${diffVWAP > 0 ? 'encima' : 'debajo'})`);
  console.log(`  Precio vs EMA 8: ${diffEMA8}% (${diffEMA8 > 0 ? 'encima' : 'debajo'})`);

  // Posición en rango
  const rangePosition = ((lastBar.close - highLow20.low) / (highLow20.high - highLow20.low) * 100).toFixed(1);
  console.log(`  Posición en rango 20: ${rangePosition}% (entre Low 20 y High 20)`);

  // Turtle Soup check
  console.log('\n🐢 TURTLE SOUP CHECK:\n');

  const nearHigh20 = (lastBar.close >= highLow20.high * 0.998);
  const nearLow20 = (lastBar.close <= highLow20.low * 1.002);

  if (nearHigh20) {
    console.log(`  ⚠️  CERCA DE HIGH 20 ($${highLow20.high.toFixed(2)})`);
    console.log(`  📊 Posible Turtle Soup SHORT si hay ruptura falsa`);
  } else if (nearLow20) {
    console.log(`  ⚠️  CERCA DE LOW 20 ($${highLow20.low.toFixed(2)})`);
    console.log(`  📊 Posible Turtle Soup LONG si hay ruptura falsa`);
  } else {
    console.log(`  ✅ No cerca de extremos - sin patrón Turtle Soup evidente`);
  }

  return {
    vwap,
    ema8,
    high20: highLow20.high,
    low20: highLow20.low,
    lastClose: lastBar.close
  };
}

main();
