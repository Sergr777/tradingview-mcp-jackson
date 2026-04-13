#!/usr/bin/env node
/**
 * Health Check Script
 * Quick system health verification
 */

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const checks = {
  api: false,
  config: false,
  logs: false,
  disk: false,
  memory: false
};

console.log('🏥 System Health Check\n');
console.log('='.repeat(50));

// 1. Check API connectivity
try {
  const result = execSync(
    'curl -s -o /dev/null -w "%{http_code}" https://api.bitget.com/api/v2/spot/market/tickers?symbol=XRPUSDT',
    { encoding: 'utf8', timeout: 5000 }
  );
  checks.api = result.includes('200');
  console.log(`\n✅ API Connectivity: ${checks.api ? 'OK' : 'FAILED'}`);
} catch (error) {
  console.log(`\n❌ API Connectivity: FAILED - ${error.message}`);
}

// 2. Check configuration
const envPath = new URL('../../.env', import.meta.url).pathname;
checks.config = existsSync(envPath);
console.log(`✅ Configuration: ${checks.config ? 'OK' : 'MISSING .env file'}`);

// 3. Check logs directory
const logsDir = new URL('../../logs', import.meta.url).pathname;
checks.logs = existsSync(logsDir);
console.log(`✅ Logs Directory: ${checks.logs ? 'OK' : 'NOT FOUND'}`);

// 4. Check disk space
try {
  const df = execSync('df -h .', { encoding: 'utf8' });
  const lines = df.split('\n');
  const diskLine = lines[1]?.split(/\s+/);
  if (diskLine && diskLine[4]) {
    const usedPercent = parseInt(diskLine[4]);
    checks.disk = usedPercent < 90;
    console.log(`✅ Disk Space: ${usedPercent}% used ${checks.disk ? '✓' : '⚠ LOW SPACE'}`);
  }
} catch (error) {
  console.log(`⚠️  Disk Space: Unable to check`);
}

// 5. Check memory
try {
  const free = execSync('free -m', { encoding: 'utf8' });
  const lines = free.split('\n');
  const memLine = lines[1]?.split(/\s+/);
  if (memLine && memLine[2]) {
    const used = parseInt(memLine[2]);
    const total = parseInt(memLine[1]);
    const usedPercent = (used / total) * 100;
    checks.memory = usedPercent < 90;
    console.log(`✅ Memory: ${usedPercent.toFixed(1)}% used ${checks.memory ? '✓' : '⚠ HIGH USAGE'}`);
  }
} catch (error) {
  console.log(`⚠️  Memory: Unable to check (Windows?)`);
}

// Summary
console.log('\n' + '='.repeat(50));
const allPassed = Object.values(checks).every(v => v);
if (allPassed) {
  console.log('\n✅ ALL CHECKS PASSED - System is healthy\n');
  process.exit(0);
} else {
  console.log('\n⚠️  SOME CHECKS FAILED - Review above\n');
  process.exit(1);
}
