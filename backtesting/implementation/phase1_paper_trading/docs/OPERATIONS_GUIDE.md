# 📘 OPERATIONS GUIDE - Paper Trading System

**Version:** 1.0
**Last Updated:** 2026-04-12
**Phase:** 1 - Paper Trading
**Capital:** $13,000 USD (Simulated)

---

## 📑 Table of Contents

1. [Quick Start](#quick-start)
2. [System Overview](#system-overview)
3. [Daily Operations](#daily-operations)
4. [Monitoring Metrics](#monitoring-metrics)
5. [Troubleshooting](#troubleshooting)
6. [Emergency Procedures](#emergency-procedures)
7. [Maintenance Tasks](#maintenance-tasks)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- BitGet account with API credentials
- Git repository cloned locally
- `.env` file configured

### Initial Setup (One-Time)

```bash
# 1. Navigate to project directory
cd ~/invest_criptoai/tradingview-mcp-jackson/backtesting

# 2. Install dependencies
npm install

# 3. Configure environment
cp ../.env.example ../.env
# Edit .env with your BitGet credentials

# 4. Verify installation
node --version
npm --version

# 5. Create required directories
mkdir -p implementation/phase1_paper_trading/{logs,results,config}
```

### Starting Paper Trading

```bash
# Option 1: Run scalper script (recommended for testing)
cd ~/invest_criptoai/tradingview-mcp-jackson
node scalper-run.js

# Option 2: Run with custom parameters
TOTAL_TRADES=20 INTERVAL_MS=30000 node scalper-run.js

# Option 3: Background execution with logging
nohup node scalper-run.js > logs/scalper_$(date +%Y%m%d_%H%M%S).log 2>&1 &
```

### Stopping the System

```bash
# Find running processes
ps aux | grep scalper-run

# Graceful shutdown
kill <PID>

# Force shutdown (if needed)
kill -9 <PID>

# Clean up background jobs
jobs
kill %<job_number>
```

---

## 🏗️ System Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PAPER TRADING SYSTEM                     │
│                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌────────────┐ │
│  │   Market     │      │   Signal     │      │  Execution │ │
│  │    Data      │ ───► │  Generation  │ ───► │   Engine   │ │
│  │  (BitGet)    │      │  (VWAP/RSI)  │      │  (Simulated)│ │
│  └──────────────┘      └──────────────┘      └────────────┘ │
│          │                      │                     │       │
│          └──────────────────────┴─────────────────────┘       │
│                              │                                │
│                              ▼                                │
│                     ┌──────────────────┐                      │
│                     │   Logging &      │                      │
│                     │  Analytics       │                      │
│                     │  (JSON/CSV)      │                      │
│                     └──────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### Trading Systems

| System | Symbol | Capital | Strategy | Status |
|--------|--------|---------|----------|--------|
| **Asian Session** | ETHUSDT | $3,500 | VWAP+RSI Mean Reversion | 🟢 Active |
| **US Session Open** | BTCUSDT | $1,000 | Momentum Breakout | 🟡 Testing |
| **Mean Reversion** | SOLUSDT | $3,500 | RSI(3)+EMA(8) | 🟢 Active |
| **Arbitrage** | 5 Pairs | $5,000 | Statistical Arb | 🟡 Testing |

### Key Components

**Data Sources:**
- BitGet Spot API (real-time pricing)
- 1-minute candlestick data
- Account balances and positions

**Indicators:**
- VWAP (Volume Weighted Average Price)
- RSI(3) (3-period Relative Strength Index)
- EMA(8) (8-period Exponential Moving Average)

**Risk Management:**
- LOT_SIZE validation (prevents precision errors)
- Minimum notional checks ($5 USDT)
- Position locking (anti-wash-trading protection)
- Max position sizing

---

## 📅 Daily Operations

### Morning Checklist (Before Market Open)

```bash
# 1. System Health Check
cd ~/invest_criptoai/tradingview-mcp-jackson

# Verify API connectivity
curl -s https://api.bitget.com/api/v2/spot/market/tickers?symbol=XRPUSDT | jq .

# Check disk space
df -h .

# Review yesterday's logs
tail -100 logs/scalper_$(date -d yesterday +%Y%m%d)*.log

# 2. Verify Configuration
cat .env | grep BITGET

# 3. Check Account Balances
node -e "
import('./scalper-run.js').then(m => {
  // Balance check logic
})
"
```

### ✅ Morning Checklist Items

- [ ] System started without errors
- [ ] API connection successful
- [ ] Account balances accessible
- [ ] No error messages in logs
- [ ] Sufficient USDT balance for trading
- [ ] Network latency < 200ms
- [ ] Disk space > 1GB available

### Starting the Trading Day

```bash
# 1. Create dated log directory
LOG_DIR=logs/$(date +%Y%m%d)
mkdir -p $LOG_DIR

# 2. Start trading system
node scalper-run.js 2>&1 | tee $LOG_DIR/trading_$(date +%H%M%S).log

# 3. Monitor first 5 minutes
# Watch for:
# - Successful signal generation
# - Order placement confirmations
# - No API errors
# - Balance updates
```

### During Trading Hours

**Monitoring Frequency:** Every 30 minutes

```bash
# Quick status check
echo "=== System Status ==="
date
echo "Recent trades:"
tail -20 safety-check-log.json | jq '.[] | {timestamp, signal, side, orderPlaced}'

# Check for errors
echo "Recent errors:"
grep -i "error\|fail\|reject" logs/*.log | tail -10

# Balance check
echo "Current balances:"
# Add balance check command
```

### End of Day Procedures

```bash
# 1. Stop trading system
# Ctrl+C or kill <PID>

# 2. Generate daily report
node scripts/generate_daily_report.js > reports/daily_$(date +%Y%m%d).json

# 3. Backup logs
cp logs/*.log backups/logs_$(date +%Y%m%d)/

# 4. Review performance
cat safety-check-log.json | jq '
  group_by(.signal) | 
  map({signal: .[0].signal, count: length}) |
  sort_by(.count) | reverse
'

# 5. Check for open positions
# (If any positions remain, note them for tomorrow)
```

### ✅ End of Day Checklist

- [ ] Trading system stopped
- [ ] All orders filled or cancelled
- [ ] Daily report generated
- [ ] Logs backed up
- [ ] Performance metrics recorded
- [ ] Open positions documented
- [ ] Issues logged for tomorrow
- [ ] System ready for shutdown

---

## 📊 Monitoring Metrics

### Key Performance Indicators (KPIs)

#### Primary Metrics

| Metric | Formula | Target | Alert Threshold |
|--------|---------|--------|-----------------|
| **Win Rate** | Wins / Total Trades | > 45% | < 35% |
| **Daily PnL** | (Final - Initial) / Initial | > +2% | < -3% |
| **Sharpe Ratio** | Return / Volatility | > 1.5 | < 1.0 |
| **Max Drawdown** | Peak to Trough Decline | < 10% | > 15% |
| **Slippage** | (Expected - Actual) / Expected | < 0.05% | > 0.1% |

#### Secondary Metrics

| Metric | Description | Good |
|--------|-------------|------|
| **Trade Frequency** | Trades per hour | 2-6 |
| **Avg Hold Time** | Duration of positions | 5-30 min |
| **Signal Quality** | Signals that result in trades | > 30% |
| **API Error Rate** | Failed API calls / Total | < 1% |
| **System Uptime** | Time active / Scheduled | > 99% |

### Real-Time Monitoring Commands

```bash
# Watch live trading output
tail -f logs/scalper_*.log

# Monitor signal generation
watch -n 10 'tail -20 safety-check-log.json | jq -r ".[] | [.timestamp, .signal, .side] | @tsv"'

# Track PnL in real-time
watch -n 30 'node scripts/calculate_pnl.js'

# System resource usage
watch -n 5 'ps aux | grep scalper'

# API latency check
watch -n 60 'curl -o /dev/null -s -w "%{time_total}\n" https://api.bitget.com/api/v2/spot/market/tickers?symbol=XRPUSDT'
```

### Interpreting Metrics

#### Win Rate Analysis

```
Win Rate > 50%:  🟢 Excellent - System performing well
Win Rate 45-50%: 🟡 Good - Within acceptable range
Win Rate 40-45%: 🟠 Monitor - Watch for degradation
Win Rate < 40%:  🔴 Alert - Investigate immediately
Win Rate < 35%:  🔴 Critical - Consider pausing system
```

#### Drawdown Levels

```
DD < 3%:   🟢 Normal trading
DD 3-5%:   🟡 Increased caution
DD 5-10%:  🟠 Reduce position sizes
DD 10-15%: 🟠 Stop new entries
DD > 15%:  🔴 PAUSE SYSTEM - Review required
```

#### Signal Quality

```
Quality > 50%: 🟢 Excellent signal generation
Quality 30-50%: 🟡 Normal operation
Quality 20-30%: 🟠 Monitor market conditions
Quality < 20%:  🔴 Low volatility - Consider pausing
```

---

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Issue 1: API Connection Failed

**Symptoms:**
```
Error: connect ETIMEDOUT
Error: socket hang up
code: 'ECONNREFUSED'
```

**Diagnosis:**
```bash
# Test internet connection
ping -c 3 api.bitget.com

# Test DNS resolution
nslookup api.bitget.com

# Check API status
curl https://www.bitget.com/api/v2/spot/market/tickers
```

**Solutions:**
1. Check internet connection
2. Verify BitGet API status (https://status.bitget.com)
3. Check firewall rules
4. Restart network interface
5. Contact ISP if persistent

#### Issue 2: Authentication Errors

**Symptoms:**
```
code: '12001'
msg: 'API signature verification failed'
msg: 'Invalid API Key'
```

**Diagnosis:**
```bash
# Verify credentials in .env
cat .env | grep BITGET

# Check for extra spaces
cat -A .env | grep BITGET

# Verify system time
date
# Should be within 1 second of NTP
```

**Solutions:**
1. Verify API key in .env file
2. Check for whitespace in credentials
3. Regenerate API keys in BitGet dashboard
4. Sync system time with NTP
5. Verify IP whitelist settings

#### Issue 3: Order Rejection - Precision Error

**Symptoms:**
```
code: '12001'
msg: 'Failed precision check'
msg: '0.001234XRP can be used at most'
```

**Diagnosis:**
```bash
# Check symbol specifications
curl -s "https://api.bitget.com/api/v2/spot/market/tickers?symbol=XRPUSDT" | jq .

# Review safety-check-log.json for precision issues
grep "precision\|LOT_SIZE" safety-check-log.json
```

**Solutions:**
1. System automatically adjusts LOT_SIZE
2. Verify LOT_SIZE constant in code
3. Check MIN_NOTIONAL requirements
4. Review adjustQuantityWithFallback() logic

#### Issue 4: Position Lock (Anti-Wash-Trading)

**Symptoms:**
```
msg: '0.001234XRP can be used at most'
Order rejected multiple times
```

**Diagnosis:**
```bash
# Check lock duration in logs
grep "lock\|retry" safety-check-log.json | tail -20

# Monitor lock expiration
watch -n 5 'tail -20 safety-check-log.json | grep -i lock'
```

**Solutions:**
1. System automatically retries (12 attempts, 3s intervals)
2. Wait for lock to clear (~30-60 seconds)
3. Reduce position size to avoid locks
4. Consider longer intervals between trades

#### Issue 5: Insufficient Balance

**Symptoms:**
```
msg: 'Insufficient balance'
Balance too low for trade
```

**Diagnosis:**
```bash
# Check current balances
node -e "
import('./scalper-run.js').then(async (m) => {
  // Get balances
})
"

# Calculate required capital
node scripts/calculate_required_capital.js
```

**Solutions:**
1. Add funds to account
2. Reduce position sizing
3. Update capital allocation in config
4. Close losing positions to free margin

### Diagnostic Commands

```bash
# Full system diagnostic
node scripts/diagnostics.js

# Check recent errors
grep -i "error\|fail\|reject" logs/*.log | tail -50

# Analyze trade performance
node scripts/analyze_trades.js --last 24h

# Validate configuration
node scripts/validate_config.js

# Test API connectivity
node scripts/test_api.js

# Generate diagnostic report
node scripts/diagnostic_report.js > diagnostics_$(date +%Y%m%d).txt
```

### Log Analysis

```bash
# Find all errors in last 24h
grep -i "error" logs/*.log | grep "$(date +%Y-%m-%d)"

# Count order failures
grep -c "orderPlaced.*false" safety-check-log.json

# Analyze signal distribution
jq '[.[] | .signal] | group_by(.) | map({signal: .[0], count: length})' safety-check-log.json

# Find retry patterns
grep -c "retry\|attempt" logs/*.log

# Check for timeout issues
grep -i "timeout\|timed out" logs/*.log
```

---

## 🚨 Emergency Procedures

### Critical Failure Modes

#### Level 1: Single System Failure

**Trigger:** One trading system fails, others operational

**Actions:**
```bash
# 1. Identify failed system
grep "system.*failed\|error" logs/*.log | tail -20

# 2. Pause affected system
# Update config: system.enabled = false

# 3. Continue with other systems
# No action needed for operational systems

# 4. Document incident
echo "$(date): System X paused due to Y" >> incidents.log
```

#### Level 2: Multiple System Failures

**Trigger:** 2+ systems fail simultaneously

**Actions:**
```bash
# 1. Immediate pause of all systems
killall node

# 2. Preserve state
cp safety-check-log.json backups/emergency_$(date +%Y%m%d_%H%M%S).json

# 3. Assess situation
node scripts/emergency_assessment.js

# 4. Decision matrix
# - If API issue: Wait for resolution
# - If market condition: Pause all trading
# - If system bug: Switch to backup system

# 5. Notify stakeholders
# Send alert with incident details
```

#### Level 3: Critical System Failure

**Trigger:** Complete system failure, data corruption, or security breach

**Actions:**
```bash
# 1. EMERGENCY STOP
killall -9 node

# 2. Preserve all evidence
mkdir -p evidence/emergency_$(date +%Y%m%d_%H%M%S)
cp -r logs/ evidence/emergency_*/
cp safety-check-log.json evidence/emergency_*/
cp .env evidence/emergency_*/env_backup

# 3. Secure accounts
# - Revoke API keys via BitGet dashboard
# - Change passwords
# - Enable additional security

# 4. Initiate investigation
# - Collect system diagnostics
# - Review logs for anomalies
# - Check for unauthorized access

# 5. Do NOT restart until:
# - Root cause identified
# - Fix implemented and tested
# - Security verified
# - Stakeholder approval obtained
```

### Circuit Breaker Triggers

**Automatic Circuit Breakers:**

| Condition | Action | Auto-Resume |
|-----------|--------|-------------|
| Daily Loss > -3% | Stop new entries | Next day |
| Weekly Loss > -10% | Pause all systems | Manual review |
| DD > -15% | Emergency close all | Manual review |
| API Error Rate > 5% | Pause 5 minutes | Auto |
| System Crash | Auto-restart once | Manual if repeat |

**Manual Circuit Breakers:**

```bash
# Pause trading immediately
echo "PAUSED" > .trading_pause_flag

# Resume trading
rm .trading_pause_flag

# Emergency close all positions
node scripts/emergency_close_all.js

# Check pause status
cat .trading_pause_flag 2>/dev/null || echo "Active"
```

### Recovery Procedures

#### After Circuit Breaker Trip

```bash
# 1. Do NOT restart immediately
# Wait for cooldown period

# 2. Analyze cause
node scripts/analyze_circuit_breaker.js

# 3. Fix root cause
# - Update code if bug
# - Adjust parameters if market condition
# - Improve risk management if needed

# 4. Test in paper trading
# Run for 24h before real money

# 5. Gradual restart
# Start with 50% position sizes
# Monitor for 4 hours
# Scale up if stable
```

#### After System Crash

```bash
# 1. Assess damage
cat logs/crash_*.log | tail -100

# 2. Check data integrity
node scripts/validate_data.js

# 3. Repair if needed
node scripts/repair_data.js

# 4. Restart with monitoring
node scalper-run.js 2>&1 | tee logs/restart_$(date +%Y%m%d_%H%M%S).log

# 5. Monitor closely for 1 hour
watch -n 10 'tail -50 logs/restart_*.log'
```

---

## 🔧 Maintenance Tasks

### Daily Maintenance

**Time:** 5 minutes

```bash
# Quick health check
node scripts/health_check.js

# Review today's performance
node scripts/daily_summary.js

# Check for warnings
grep -i "warning" logs/*.log | tail -10

# Verify backups
ls -lh backups/ | tail -5
```

### Weekly Maintenance

**Time:** 30 minutes

```bash
# 1. Performance analysis
node scripts/weekly_performance.js > reports/weekly_$(date +%Y%U).json

# 2. System optimization
node scripts/optimize_parameters.js

# 3. Log cleanup
find logs/ -name "*.log" -mtime +7 -delete

# 4. Backup verification
node scripts/verify_backups.js

# 5. Security audit
node scripts/security_audit.js

# 6. Update documentation
# Update operations guide with any changes
```

### Monthly Maintenance

**Time:** 2 hours

```bash
# 1. Comprehensive backtest
node scripts/backtest_month.js --period 1M

# 2. Parameter optimization
node scripts/optimize_all_parameters.js

# 3. System review
# - Review all failed trades
# - Analyze edge cases
# - Update rules as needed

# 4. Performance report
node scripts/monthly_report.js > reports/monthly_$(date +%Y%m).html

# 5. Dependency updates
npm update
npm audit fix

# 6. Documentation update
# - Update runbooks
# - Document new procedures
# - Archive old reports
```

### Quarterly Maintenance

**Time:** 1 day

```bash
# 1. Full system audit
node scripts/full_audit.js

# 2. Strategy review
# - Compare vs benchmarks
# - Analyze market changes
# - Consider new strategies

# 3. Risk management review
# - Update circuit breakers
# - Review position sizing
# - Stress test portfolio

# 4. Technology refresh
# - Update Node.js version
# - Review dependencies
# - Security patches

# 5. Documentation overhaul
# - Update all guides
# - Archive old versions
# - Create training materials
```

---

## 📞 Support and Escalation

### Issue Severity Levels

| Severity | Description | Response Time | Escalation |
|----------|-------------|---------------|------------|
| **P1 - Critical** | System down, money at risk | Immediate | Phone |
| **P2 - High** | Major functionality broken | 1 hour | Slack + Email |
| **P3 - Medium** | Partial degradation | 4 hours | Email |
| **P4 - Low** | Minor issues | 24 hours | Ticket |

### Escalation Contacts

```
Primary:      [Your Name] - [Phone/Email]
Secondary:    [Backup Name] - [Phone/Email]
Emergency:    [Emergency Contact] - [Phone]
```

### Getting Help

**Before Escalating:**
1. Run diagnostic script: `node scripts/diagnostics.js`
2. Collect logs: `tar -czf logs.tar.gz logs/`
3. Document steps taken
4. Note error messages

**When Escalating:**
1. Include severity level
2. Describe impact
3. Attach diagnostics
4. Specify urgency

---

## 📚 Additional Resources

### Configuration Files

- `.env` - API credentials and environment variables
- `safety-check-log.json` - Trade execution log
- `rules.json` - Trading strategy rules (if using rule-based system)

### Log Files

- `logs/scalper_*.log` - Trading system logs
- `logs/error_*.log` - Error logs
- `backups/` - Archived logs and data

### Scripts

- `scalper-run.js` - Main trading script
- `scripts/diagnostics.js` - System diagnostics
- `scripts/analyze_trades.js` - Trade analysis
- `scripts/generate_report.js` - Report generation

### Documentation

- `CLAUDE.md` - Project overview and setup
- `README.md` - General project information
- `IMPLEMENTACION README.md` - Implementation guide
- `PLAN_ACCION_TASKLIST_INTEGRADO.md` - Task list and roadmap

---

## 📝 Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-12 | Initial operations guide |

---

## ✅ Quick Reference Card

### Essential Commands

```bash
# Start system
node scalper-run.js

# Stop system
kill <PID>

# Check status
tail -f logs/scalper_*.log

# View trades
cat safety-check-log.json | jq .

# Diagnostics
node scripts/diagnostics.js

# Emergency stop
killall -9 node
```

### Critical Thresholds

- Win Rate < 35%: Pause system
- Daily Loss > -3%: Stop entries
- Drawdown > -15%: Emergency close
- API Errors > 5%: Pause 5 min

### Contact Information

- System Owner: [Your Name]
- Emergency: [Emergency Contact]
- Documentation: [Link to docs]

---

**End of Operations Guide**

For questions or issues, refer to the troubleshooting section or contact the system owner.
