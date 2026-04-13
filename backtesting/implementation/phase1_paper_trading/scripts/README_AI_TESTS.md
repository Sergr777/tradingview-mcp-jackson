# AI Integration Tests - Quick Reference

## Overview

Test suite for validating integration with InvestCripto AI agents (KRONOS, ORÁCULO, PROPHET, SENTIMENT, ARBITER, MNEMO).

## Files

- **Test Script:** `implementation/phase1_paper_trading/scripts/test_ai_integration.js`
- **Client Code:** `integration/invest_criptoai_api/agents_client.js`
- **Results:** `implementation/phase1_paper_trading/results/ai_integration_test.json`
- **Report:** `implementation/phase1_paper_trading/results/ai_integration_validation_report.md`

## Usage

### Basic Usage

```bash
# Run tests with default configuration (localhost:8000)
node implementation/phase1_paper_trading/scripts/test_ai_integration.js

# Run with custom URL
node implementation/phase1_paper_trading/scripts/test_ai_integration.js --url http://localhost:9000

# Run with custom timeout
node implementation/phase1_paper_trading/scripts/test_ai_integration.js --timeout 10000

# Run with custom output path
node implementation/phase1_paper_trading/scripts/test_ai_integration.js --output /path/to/results.json

# Combined options
node implementation/phase1_paper_trading/scripts/test_ai_integration.js --url http://192.168.1.100:8000 --timeout 3000 --retries 3 --output test_results.json
```

### Environment Variables

```bash
# Set AI backend URL
export INVESTCRIPTO_AI_URL=http://localhost:8000

# Set timeout in milliseconds
export AI_TIMEOUT=5000

# Set retry attempts
export AI_RETRY_ATTEMPTS=2

# Then run tests
node implementation/phase1_paper_trading/scripts/test_ai_integration.js
```

## Test Coverage

### Connectivity Tests
- ✅ Health Check
- ✅ Connection Timeout
- ✅ Retry Logic

### Agent Tests
- ✅ KRONOS - Coordination & Signal Validation
- ✅ ORÁCULO - Historical Context & RAG
- ✅ PROPHET - Price Prediction
- ✅ SENTIMENT - News & Social Analysis
- ✅ ARBITER - Ensemble Ranking
- ✅ MNEMO - Persistent Memory

### Integration Tests
- ✅ Full Signal Flow (End-to-End)
- ✅ Concurrent Requests
- ✅ Error Handling

## Interpreting Results

### Exit Codes
- `0` - All tests passed
- `1` - One or more tests failed

### Console Output

```
========================================
🧪 INVESTCRIPTO AI INTEGRATION TEST SUITE
========================================

Target: http://localhost:8000
Timeout: 5000ms
Retry Attempts: 2

📡 Test: Health Check
   ✅ PASS: Server is healthy (45ms)

...
========================================
📊 TEST SUMMARY
========================================

Total Tests: 12
✅ Passed: 8
❌ Failed: 4
⏭️  Skipped: 0
📈 Success Rate: 66.7%

📊 Latency Statistics:
   Min: 2ms
   Max: 144ms
   Avg: 23ms

🤖 Agents Status:
   ✅ KRONOS: operational
   ✅ ARBITER: operational
   ✅ MNEMO: operational
```

### JSON Output Format

```json
{
  "timestamp": "2026-04-12T15:27:48.645Z",
  "config": {
    "baseUrl": "http://localhost:8000",
    "timeout": 5000,
    "retryAttempts": 2
  },
  "tests": [
    {
      "name": "Health Check",
      "passed": true,
      "message": "Server is healthy (45ms)",
      "data": { ... },
      "timestamp": "2026-04-12T15:27:48.795Z"
    }
  ],
  "summary": {
    "total": 12,
    "passed": 8,
    "failed": 4,
    "skipped": 0,
    "success_rate": "66.7"
  },
  "agents": {
    "kronos": {
      "status": "operational",
      "latency": 3,
      "features": ["signal_validation", "coordination", "agent_orchestration"]
    }
  },
  "latency": {
    "min": 2,
    "max": 144,
    "avg": 23
  }
}
```

## Troubleshooting

### "fetch failed" Errors

**Cause:** FastAPI backend is not running

**Solution:**
```bash
# Start the InvestCripto AI backend
cd /path/to/invest_criptoai/backend
python -m uvicorn backend.main:app --reload --port 8000
```

### High Latency

**Cause:** Network issues or overloaded backend

**Solution:**
- Increase timeout: `--timeout 10000`
- Check backend logs
- Verify network connectivity

### All Tests Fail

**Cause:** Incorrect URL or port

**Solution:**
- Verify backend is running: `curl http://localhost:8000/api/v1/health`
- Check URL: `--url http://correct-url:port`
- Check firewall settings

## Programmatic Usage

```javascript
import { AIIntegrationTester } from './implementation/phase1_paper_trading/scripts/test_ai_integration.js';

const tester = new AIIntegrationTester({
  baseUrl: 'http://localhost:8000',
  timeout: 5000,
  retryAttempts: 2,
  enabled: true
});

const results = await tester.runAllTests();

console.log(`Success Rate: ${results.summary.success_rate}%`);
console.log(`Average Latency: ${results.latency.avg}ms`);

// Access specific agent results
console.log('KRONOS:', results.agents.kronos);
console.log('ARBITER:', results.agents.arbiter);

// Save custom report
await tester.saveResults('./my_custom_results.json');
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: AI Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      investcripto-ai:
        image: investcripto/ai-backend:latest
        ports:
          - 8000:8000
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Run AI Integration Tests
        run: |
          node implementation/phase1_paper_trading/scripts/test_ai_integration.js \
            --url http://localhost:8000 \
            --output test-results.json
      
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: ai-test-results
          path: test-results.json
```

## Support

For issues or questions:
1. Check the validation report: `results/ai_integration_validation_report.md`
2. Review the test results JSON: `results/ai_integration_test.json`
3. Consult the main CLAUDE.md for project context
