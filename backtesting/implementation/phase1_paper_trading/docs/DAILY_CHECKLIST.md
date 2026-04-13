# ✅ Daily Operations Checklist

**Date:** _______________
**Operator:** _______________

---

## 🌅 Pre-Market Checklist (Before Trading Starts)

### System Preparation
- [ ] Computer/system powered on and connected to internet
- [ ] Time synchronized (check system clock)
- [ ] Sufficient disk space available (> 1GB)
- [ ] No critical system updates pending

### Configuration Verification
- [ ] `.env` file exists with correct credentials
- [ ] API credentials valid (not expired)
- [ ] Trading parameters reviewed and confirmed
- [ ] Risk management settings verified

### Account Status
- [ ] BitGet account accessible
- [ ] API permissions confirmed (Spot Trading only)
- [ ] Account balances sufficient for trading
- [ ] No open positions from previous day (or documented)

### Connectivity Test
- [ ] Internet connection stable
- [ ] API connectivity verified (`curl` test successful)
- [ ] Latency acceptable (< 200ms)
- [ ] No firewall or network issues

### Previous Day Review
- [ ] Previous day's logs reviewed
- [ ] Performance metrics checked
- [ ] Any errors or issues documented
- [ ] Action items from yesterday addressed

---

## 🚀 Startup Checklist (Starting the System)

### Launch Sequence
- [ ] Navigate to project directory
- [ ] Create dated log directory
- [ ] Start trading system (`node scalper-run.js`)
- [ ] Verify system started without errors

### Initial Monitoring (First 5 Minutes)
- [ ] System connecting to API successfully
- [ ] Market data streaming correctly
- [ ] Indicators calculating properly
- [ ] Signals being generated
- [ ] No error messages in console

### First Trade Verification
- [ ] First signal received correctly
- [ ] Order placed successfully (if signal triggered)
- [ ] Balance updated correctly
- [ ] Trade logged in `safety-check-log.json`

---

## 📊 Intraday Monitoring (Every 30 Minutes)

### Routine Checks
- [ ] System still running (no crashes)
- [ ] No error messages in logs
- [ ] API connection stable
- [ ] Trades executing as expected

### Performance Monitoring
- [ ] Win rate within acceptable range (> 40%)
- [ ] Daily PnL tracked
- [ ] Drawdown monitored (< 10%)
- [ ] Signal quality adequate

### Anomaly Detection
- [ ] Unusual market conditions noted
- [ ] Any news events that might affect trading
- [ ] System behavior within normal parameters
- [ ] No unexpected position sizes

---

## 🌆 End of Day Checklist (After Trading Stops)

### System Shutdown
- [ ] Trading system stopped gracefully
- [ ] All orders filled or cancelled
- [ ] No pending trades left open
- [ ] Process fully terminated

### Data Collection
- [ ] Daily report generated
- [ ] Log files backed up
- [ ] Trade data exported
- [ ] Performance metrics calculated

### Performance Review
- [ ] Total trades executed
- [ ] Win rate calculated
- [ ] Profit/Loss determined
- [ ] Drawdown assessed
- [ ] Slippage measured

### Documentation
- [ ] Daily journal updated
- [ ] Any issues documented
- [ ] Lessons learned noted
- [ ] Action items for tomorrow identified

### System Cleanup
- [ ] Temporary files removed
- [ ] Old logs archived (if needed)
- [ ] Disk space cleaned up
- [ ] System ready for tomorrow

---

## 🚨 Emergency Procedures (If Needed)

### If System Crashes
- [ ] Note time of crash
- [ ] Save error logs
- [ ] Document what you were doing
- [ ] Attempt restart following procedures
- [ ] Monitor closely after restart

### If API Issues Occur
- [ ] Verify internet connection
- [ ] Check BitGet status page
- [ ] Note error messages
- [ ] Wait for resolution or pause trading
- [ ] Document incident

### If Unusual Losses Occur
- [ ] Stop trading immediately
- [ ] Review recent trades
- [ ] Check for system errors
- [ ] Verify market conditions
- [ ] Document findings
- [ ] Do not resume without review

---

## 📝 Notes Section

### Issues Encountered Today:
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________

### Observations:
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________

### Action Items for Tomorrow:
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________

### Performance Summary:
- Total Trades: _______
- Winning Trades: _______
- Losing Trades: _______
- Win Rate: _______%
- Total PnL: _______%
- Max Drawdown: _______%

---

## ✍️ Sign-off

**Morning Checklist Completed:** _______ (Initials)
**System Started Successfully:** YES / NO
**System Stopped Successfully:** _______ (Initials)
**End of Day Checklist Completed:** _______ (Initials)

**Overall Day Rating:**
- [ ] 🟢 Excellent - No issues
- [ ] 🟡 Good - Minor issues only
- [ ] 🟠 Fair - Some issues encountered
- [ ] 🔴 Poor - Major problems occurred

**Comments:**
___________________________________________________________________________
___________________________________________________________________________

---

*This checklist should be completed for each trading day. Keep completed checklists for reference and continuous improvement.*
