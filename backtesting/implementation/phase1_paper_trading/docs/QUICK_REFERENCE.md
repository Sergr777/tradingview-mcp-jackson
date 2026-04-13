# ⚡ Quick Reference Card - Paper Trading System

**Print this and keep it handy!**

---

## 🚀 Start System

```bash
cd ~/invest_criptoai/tradingview-mcp-jackson
node scalper-run.js
```

## 🛑 Stop System

```bash
# Find process
ps aux | grep scalper

# Stop it
kill <PID>
```

## 📊 Check Status

```bash
# View recent activity
tail -20 safety-check-log.json | jq .

# Monitor logs
tail -f logs/scalper_*.log

# Quick health check
node implementation/phase1_paper_trading/scripts/health_check.js
```

---

## 🚨 Emergency Commands

```bash
# IMMEDIATE STOP
killall -9 node

# Close all positions (if applicable)
node scripts/emergency_close_all.js

# Run diagnostics
node scripts/diagnostics.js

# Analyze trades
node scripts/analyze_trades.js --last 24h
```

---

## 📈 Key Metrics

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Win Rate | > 45% | 40-45% | < 40% |
| Daily PnL | > +2% | -2% to +2% | < -3% |
| Drawdown | < 5% | 5-10% | > 10% |
| API Errors | < 1% | 1-3% | > 3% |

---

## 🎯 Action Thresholds

### 🟢 Normal Operation
- Continue trading
- Monitor every 30 minutes
- End of day review

### 🟡 Increased Caution
- Reduce position sizes 50%
- Monitor every 15 minutes
- Review trades more frequently

### 🟠 Stop New Entries
- Halt new trades
- Close positions at appropriate levels
- Investigate cause
- Do not add new risk

### 🔴 Emergency Close All
- Close all positions immediately
- Stop all trading
- Full review required
- Do not restart without approval

---

## 📞 Contact Information

| Role | Name | Contact |
|------|------|---------|
| System Owner | [Your Name] | [Phone/Email] |
| Backup | [Name] | [Phone/Email] |
| Emergency | [Name] | [Phone] |

---

## 🔧 Common Issues

| Issue | Quick Fix |
|-------|-----------|
| API Connection Failed | Check internet, wait 1 min |
| Authentication Error | Verify .env credentials |
| Precision Error | System auto-fixes, wait |
| Position Lock | Wait 30-60s, auto-retry |
| System Crash | Check logs, restart |

---

## 📋 Daily Checklist Summary

### Morning ☀️
- [ ] Check internet
- [ ] Verify .env file
- [ ] Test API connection
- [ ] Start system
- [ ] Monitor first 5 min

### During Day 🌤️
- [ ] Check every 30 min
- [ ] Watch for errors
- [ ] Track performance
- [ ] Note anomalies

### Evening 🌙
- [ ] Stop system
- [ ] Generate report
- [ ] Backup logs
- [ ] Review performance
- [ ] Document issues

---

## 🎯 Success Criteria

### Phase 1 Goals (Paper Trading)
- ✅ Win Rate > 45%
- ✅ No critical errors
- ✅ System stable 2 weeks
- ✅ All systems validated

### Before Real Money
- ✅ All above criteria met
- ✅ Drawdown < 10%
- ✅ Psychology tested
- ✅ Emergency procedures practiced

---

## 💡 Pro Tips

1. **Always review logs** - They tell the real story
2. **Document everything** - Even small issues
3. **Test emergency stops** - Before you need them
4. **Keep emotions in check** - Follow the rules
5. **Learn from losses** - They're expensive lessons

---

## 🔐 Security Reminders

- ✅ Never commit .env file
- ✅ Use API keys with limited permissions
- ✅ Enable IP whitelist if available
- ✅ Rotate credentials regularly
- ✅ Monitor for unauthorized access

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `.env` | API credentials |
| `safety-check-log.json` | Trade log |
| `logs/scalper_*.log` | System logs |
| `OPERATIONS_GUIDE.md` | Full documentation |

---

## 🎓 Learning Resources

- Full Guide: `docs/OPERATIONS_GUIDE.md`
- Daily Checklist: `docs/DAILY_CHECKLIST.md`
- Implementation: `IMPLEMENTACION README.md`
- Task List: `PLAN_ACCION_TASKLIST_INTEGRADO.md`

---

*Last Updated: 2026-04-12*
*Version: 1.0*
