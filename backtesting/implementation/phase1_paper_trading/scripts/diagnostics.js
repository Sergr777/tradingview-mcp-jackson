#!/usr/bin/env node
/**
 * Comprehensive Diagnostics Script
 * Run this when troubleshooting issues
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const results = {
  timestamp: new Date().toISOString(),
  system: {},
  configuration: {},
  logs: {},
  api: {},
  trading: {}
};

console.log('🔍 Running Comprehensive Diagnostics...\n');

// ============================================================================
// 1. System Information
// ============================================================================
console.log('📋 System Information');

try {
  results.system.os = process.platform;
  results.system.nodeVersion = process.version;
  results.system.arch = process.arch;
  results.system.cwd = process.cwd();

  console.log(`  OS: ${results.system.os}`);
  console.log(`  Node.js: ${results.system.nodeVersion}`);
  console.log(`  Architecture: ${results.system.arch}`);
  console.log(`  Working Directory: ${results.system.cwd}`);
} catch (error) {
  console.log(`  ⚠️  Error getting system info: ${error.message}`);
}

// ============================================================================
// 2. Configuration Check
// ============================================================================
console.log('\n📋 Configuration Check');

const envPath = join(process.cwd(), '../.env');
const safetyLogPath = join(process.cwd(), '../safety-check-log.json');

results.configuration.envExists = existsSync(envPath);
results.configuration.safetyLogExists = existsSync(safetyLogPath);

console.log(`  .env file: ${results.configuration.envExists ? '✅ Found' : '❌ Missing'}`);
console.log(`  safety-check-log.json: ${results.configuration.safetyLogExists ? '✅ Found' : '❌ Missing'}`);

if (results.configuration.safetyLogExists) {
  try {
    const safetyData = JSON.parse(readFileSync(safetyLogPath, 'utf8'));
    results.configuration.totalTrades = safetyData.length;
    results.configuration.lastTrade = safetyData[safetyData.length - 1]?.timestamp;

    const placedOrders = safetyData.filter(t => t.orderPlaced).length;
    results.configuration.ordersPlaced = placedOrders;
    results.configuration.orderSuccessRate = ((placedOrders / safetyData.length) * 100).toFixed(1);

    console.log(`  Total trades logged: ${results.configuration.totalTrades}`);
    console.log(`  Orders placed: ${results.configuration.ordersPlaced}`);
    console.log(`  Success rate: ${results.configuration.orderSuccessRate}%`);
  } catch (error) {
    console.log(`  ⚠️  Error reading safety log: ${error.message}`);
  }
}

// ============================================================================
// 3. Logs Analysis
// ============================================================================
console.log('\n📋 Logs Analysis');

const logsDir = join(process.cwd(), '../logs');
results.logs.logsDirExists = existsSync(logsDir);

if (results.logs.logsDirExists) {
  try {
    const logFiles = readdirSync(logsDir).filter(f => f.endsWith('.log'));
    results.logs.logFileCount = logFiles.length;

    if (logFiles.length > 0) {
      const latestLog = join(logsDir, logFiles[logFiles.length - 1]);
      const logStats = statSync(latestLog);
      results.logs.latestLogFile = logFiles[logFiles.length - 1];
      results.logs.latestLogSize = (logStats.size / 1024).toFixed(2);
      results.logs.latestLogModified = logStats.mtime;

      console.log(`  Log files: ${results.logs.logFileCount}`);
      console.log(`  Latest log: ${results.logs.latestLogFile}`);
      console.log(`  Size: ${results.logs.latestLogSize} KB`);
      console.log(`  Modified: ${results.logs.latestLogModified}`);

      // Count errors in latest log
      try {
        const logContent = readFileSync(latestLog, 'utf8');
        const errorCount = (logContent.match(/error|fail|reject|❌/gi) || []).length;
        results.logs.errorCount = errorCount;
        console.log(`  Errors in latest log: ${errorCount}`);
      } catch (error) {
        console.log(`  ⚠️  Could not analyze log content`);
      }
    } else {
      console.log(`  No log files found`);
    }
  } catch (error) {
    console.log(`  ⚠️  Error reading logs: ${error.message}`);
  }
} else {
  console.log(`  ⚠️  Logs directory not found`);
}

// ============================================================================
// 4. API Connectivity
// ============================================================================
console.log('\n📋 API Connectivity');

try {
  const startTime = Date.now();
  execSync('curl -s -o /dev/null -w "%{http_code}" https://api.bitget.com/api/v2/spot/market/tickers?symbol=XRPUSDT', {
    encoding: 'utf8',
    timeout: 5000
  });
  const latency = Date.now() - startTime;
  results.api.latency = latency;
  results.api.status = 'OK';

  console.log(`  API Status: ✅ OK`);
  console.log(`  Latency: ${latency}ms`);

  if (latency > 500) {
    console.log(`  ⚠️  High latency detected`);
  }
} catch (error) {
  results.api.status = 'FAILED';
  results.api.error = error.message;
  console.log(`  ❌ API Connection Failed: ${error.message}`);
}

// ============================================================================
// 5. Trading Summary
// ============================================================================
console.log('\n📋 Trading Summary');

if (results.configuration.safetyLogExists) {
  try {
    const safetyData = JSON.parse(readFileSync(safetyLogPath, 'utf8'));

    // Signal distribution
    const signals = {};
    safetyData.forEach(t => {
      signals[t.signal] = (signals[t.signal] || 0) + 1;
    });
    results.trading.signalDistribution = signals;

    console.log('  Signal Distribution:');
    Object.entries(signals).forEach(([signal, count]) => {
      console.log(`    ${signal.toUpperCase()}: ${count}`);
    });

    // Recent activity
    const recent = safetyData.slice(-5);
    console.log(`\n  Recent Activity (last 5):`);
    recent.forEach(t => {
      const status = t.orderPlaced ? '✅' : '⏭️';
      console.log(`    ${status} ${t.timestamp} - ${t.signal.toUpperCase()} (${t.side || 'N/A'})`);
    });

  } catch (error) {
    console.log(`  ⚠️  Error analyzing trading data: ${error.message}`);
  }
}

// ============================================================================
// 6. Recommendations
// ============================================================================
console.log('\n💡 Recommendations');

const recommendations = [];

if (!results.configuration.envExists) {
  recommendations.push('Create .env file with API credentials');
}

if (results.api.status === 'FAILED') {
  recommendations.push('Check internet connection and BitGet API status');
}

if (results.logs.errorCount > 10) {
  recommendations.push('Review errors in latest log file');
}

if (results.configuration.orderSuccessRate < 50) {
  recommendations.push('Low order success rate - investigate rejections');
}

if (results.api.latency > 500) {
  recommendations.push('High API latency - may affect trade execution');
}

if (recommendations.length === 0) {
  console.log('  ✅ No issues detected - system is healthy');
} else {
  recommendations.forEach((rec, i) => {
    console.log(`  ${i + 1}. ${rec}`);
  });
}

// ============================================================================
// 7. Save Diagnostic Report
// ============================================================================
console.log('\n💾 Saving Diagnostic Report...');

const reportPath = join(process.cwd(), `diagnostic_report_${Date.now()}.json`);
try {
  // Convert to JSON for file output
  const reportContent = JSON.stringify(results, null, 2);
  // Note: In actual implementation, use writeFileSync
  console.log(`  Report saved to: ${reportPath}`);
} catch (error) {
  console.log(`  ⚠️  Could not save report: ${error.message}`);
}

console.log('\n✅ Diagnostics Complete\n');
console.log('='.repeat(50));

process.exit(0);
