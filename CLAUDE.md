# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TradingView MCP Jackson** is a multi-component cryptocurrency trading system that combines TradingView Desktop integration via MCP (Model Context Protocol), automated trading execution, and multi-agent AI orchestration.

### Core Components

1. **TradingView MCP Server** (`src/`) - 68 MCP tools for reading and controlling TradingView Desktop via CDP
2. **Trading Execution Scripts** (`scalper-run.js`, monitor scripts) - Live trading via BitGet API
3. **Multi-Agent System** - AI agents (KRONOS, PROPHET, SENTIMENT, MNEMO, ORÁCULO) for intelligent trading decisions
4. **Strategy Development** - Specialist/general trading systems, backtesting, optimization

### Technology Stack

- **Node.js**: ES modules (type: "module")
- **MCP SDK**: @modelcontextprotocol/sdk for tool definitions
- **CDP**: chrome-remote-interface for TradingView connection
- **Exchange**: BitGet API for trading execution
- **Testing**: Node.js built-in test runner

## Build & Test Commands

### Development

```bash
# Install dependencies
npm install

# Start MCP server (for Claude Code)
npm start
# or
node src/server.js

# Install CLI globally
npm link
tv --help  # CLI commands
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:e2e          # End-to-end tests (requires TradingView running)
npm run test:unit         # Unit tests (Pine analysis, CLI)
npm run test:cli          # CLI tests only
npm run test:all          # All tests
npm run test:verbose      # Verbose output
npm run test:count        # Count tests
```

### TradingView Desktop Launch

**Mac:**
```bash
./scripts/launch_tv_debug_mac.sh
```

**Windows:**
```bash
scripts\launch_tv_debug.bat
```

**Linux:**
```bash
./scripts/launch_tv_debug_linux.sh
```

Or use the MCP tool: `tv_launch`

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TRADINGVIEW DESKTOP                      │
│                   (CDP on port 9222)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ 68 MCP tools
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              TRADINGVIEW MCP SERVER                         │
│  - Chart reading (indicators, price, OHLCV)                │
│  - Pine Script development (compile, debug)                │
│  - Chart control (symbol, timeframe, indicators)           │
│  - Replay mode, drawings, alerts, screenshots              │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌──────────┐
    │ scalper │  │ monitor │  │  Data    │
    │  -run   │  │ scripts │  │Collector │
    └────┬────┘  └────┬────┘  └─────┬────┘
         │            │             │
         └────────┬───┴─────────────┘
                  ▼
         ┌────────────────┐
         │ Multi-Agent    │
         │ System (KRONOS │
         │ PROPHET, etc.) │
         └────────────────┘
```

### MCP Server Structure (`src/`)

```
src/
├── server.js           # MCP server entry point
├── connection.js       # CDP connection management
├── wait.js            # Async utilities
├── cli/               # CLI commands (tv command)
├── core/              # Public API exports
└── tools/             # MCP tool implementations
    ├── alerts.js      # Alert management
    ├── batch.js       # Multi-symbol operations
    ├── capture.js     # Screenshots
    ├── chart.js       # Chart control
    ├── data.js        # Data access (OHLCV, indicators, Pine graphics)
    ├── drawing.js     # Drawing tools
    ├── health.js      # Connection health check
    ├── indicators.js  # Indicator management
    ├── morning.js     # Morning brief workflow
    ├── pane.js        # Multi-pane layouts
    ├── pine.js        # Pine Script development
    ├── replay.js      # Replay mode
    ├── tab.js         # Tab management
    ├── ui.js          # UI automation
    └── watchlist.js   # Watchlist management
```

### Trading Scripts

- **`scalper-run.js`** - 10-second momentum scalper executing XRP/USDT spot trades on BitGet
- **`monitor_turtle_soup.cjs`** - Turtle Soup pattern monitoring
- **`monitor_turtle_soup_real.cjs`** - Real-time Turtle Soup monitoring with TradingView integration
- **`data_collector.js`** - Data collection for analysis
- **`analyze_two_weeks.js`** / **`analyze_week1.js`** - Analysis scripts

### Multi-Agent System

**Orchestration Layer:**
- **KRONOS**: Master orchestrator - Central system authority
- **ORÁCULO**: RAG engine + Unified context - Vectorized collective memory
- **MNEMO**: Multi-level persistent memory - Continuity and learning

**Analysis Layer:**
- **PROPHET**: Prediction engine - Time series with deep learning
- **SENTIMENT**: Social sentiment analyst - NLP on social media and news

See `INTEGRATION_TRADINGVIEW_MCP_AGENTS.md` for full architecture details.

## Configuration

### Environment Variables

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required for trading scripts:
```bash
BITGET_API_KEY=your_api_key
BITGET_SECRET_KEY=your_secret_key
BITGET_PASSPHRASE=your_passphrase
```

### Trading Rules

Copy and customize:
```bash
cp rules.example.json rules.json
```

`rules.json` contains:
- **watchlist**: Symbols to scan
- **strategy**: Trading strategy definition
- **indicators**: Indicator descriptions
- **bias_criteria**: Bullish/bearish/neutral conditions
- **entry_rules**: Entry conditions
- **exit_rules**: Exit conditions
- **risk_rules**: Position sizing and limits

## TradingView MCP — Tool Decision Tree

### "What's on my chart right now?"
1. `chart_get_state` → symbol, timeframe, chart type, list of all indicators with entity IDs
2. `data_get_study_values` → current numeric values from all visible indicators (RSI, MACD, BBands, EMAs, etc.)
3. `quote_get` → real-time price, OHLC, volume for current symbol

### "What levels/lines/labels are showing?"
Custom Pine indicators draw with `line.new()`, `label.new()`, `table.new()`, `box.new()`. Use:

1. `data_get_pine_lines` → horizontal price levels drawn by indicators (deduplicated, sorted high→low)
2. `data_get_pine_labels` → text annotations with prices (e.g., "PDH 24550", "Bias Long ✓")
3. `data_get_pine_tables` → table data formatted as rows (e.g., session stats, analytics dashboards)
4. `data_get_pine_boxes` → price zones / ranges as {high, low} pairs

Use `study_filter` parameter to target a specific indicator by name substring (e.g., `study_filter: "Profiler"`).

### "Give me price data"
- `data_get_ohlcv` with `summary: true` → compact stats (high, low, range, change%, avg volume, last 5 bars)
- `data_get_ohlcv` without summary → all bars (use `count` to limit, default 100)
- `quote_get` → single latest price snapshot

### "Analyze my chart" (full report workflow)
1. `quote_get` → current price
2. `data_get_study_values` → all indicator readings
3. `data_get_pine_lines` → key price levels from custom indicators
4. `data_get_pine_labels` → labeled levels with context
5. `data_get_pine_tables` → session stats, analytics tables
6. `data_get_ohlcv` with `summary: true` → price action summary
7. `capture_screenshot` → visual confirmation

### "Change the chart"
- `chart_set_symbol` → switch ticker (e.g., "AAPL", "ES1!", "NYMEX:CL1!")
- `chart_set_timeframe` → switch resolution (e.g., "1", "5", "15", "60", "D", "W")
- `chart_set_type` → switch chart style (Candles, HeikinAshi, Line, Area, Renko, etc.)
- `chart_manage_indicator` → add or remove studies (use full name: "Relative Strength Index", not "RSI")
- `chart_scroll_to_date` → jump to a date (ISO format: "2025-01-15")
- `chart_set_visible_range` → zoom to exact date range (unix timestamps)

### "Work on Pine Script"
1. `pine_set_source` → inject code into editor
2. `pine_smart_compile` → compile with auto-detection + error check
3. `pine_get_errors` → read compilation errors
4. `pine_get_console` → read log.info() output
5. `pine_get_source` → read current code back (WARNING: can be very large for complex scripts)
6. `pine_save` → save to TradingView cloud
7. `pine_new` → create blank indicator/strategy/library
8. `pine_open` → load a saved script by name

### "Practice trading with replay"
1. `replay_start` with `date: "2025-03-01"` → enter replay mode
2. `replay_step` → advance one bar
3. `replay_autoplay` → auto-advance (set speed with `speed` param in ms)
4. `replay_trade` with `action: "buy"/"sell"/"close"` → execute trades
5. `replay_status` → check position, P&L, current date
6. `replay_stop` → return to realtime

### "Morning Brief Workflow"
1. `morning_brief` → scan watchlist, read indicators, apply rules.json, return structured bias
2. `session_save` → save brief to `~/.tradingview-mcp/sessions/YYYY-MM-DD.json`
3. `session_get` → retrieve today's or yesterday's brief

### "Screen multiple symbols"
- `batch_run` with `symbols: ["ES1!", "NQ1!", "YM1!"]` and `action: "screenshot"` or `"get_ohlcv"`

### "Draw on the chart"
- `draw_shape` → horizontal_line, trend_line, rectangle, text (pass point + optional point2)
- `draw_list` → see what's drawn
- `draw_remove_one` → remove by ID
- `draw_clear` → remove all

### "Manage alerts"
- `alert_create` → set price alert (condition: "crossing", "greater_than", "less_than")
- `alert_list` → view active alerts
- `alert_delete` → remove alerts

### "Navigate the UI"
- `ui_open_panel` → open/close pine-editor, strategy-tester, watchlist, alerts, trading
- `ui_click` → click buttons by aria-label, text, or data-name
- `layout_switch` → load a saved layout by name
- `ui_fullscreen` → toggle fullscreen
- `capture_screenshot` → take a screenshot (regions: "full", "chart", "strategy_tester")

### "TradingView isn't running"
- `tv_launch` → auto-detect and launch TradingView with CDP on Mac/Win/Linux
- `tv_health_check` → verify connection is working

## Context Management Rules

These tools can return large payloads. Follow these rules to avoid context bloat:

1. **Always use `summary: true` on `data_get_ohlcv`** unless you specifically need individual bars
2. **Always use `study_filter`** on pine tools when you know which indicator you want — don't scan all studies unnecessarily
3. **Never use `verbose: true`** on pine tools unless the user specifically asks for raw drawing data with IDs/colors
4. **Avoid calling `pine_get_source`** on complex scripts — it can return 200KB+. Only read if you need to edit the code.
5. **Avoid calling `data_get_indicator`** on protected/encrypted indicators — their inputs are encoded blobs. Use `data_get_study_values` instead for current values.
6. **Use `capture_screenshot`** for visual context instead of pulling large datasets — a screenshot is ~300KB but gives you the full visual picture
7. **Call `chart_get_state` once** at the start to get entity IDs, then reference them — don't re-call repeatedly
8. **Cap your OHLCV requests** — `count: 20` for quick analysis, `count: 100` for deeper work, `count: 500` only when specifically needed

### Output Size Estimates (compact mode)
| Tool | Typical Output |
|------|---------------|
| `quote_get` | ~200 bytes |
| `data_get_study_values` | ~500 bytes (all indicators) |
| `data_get_pine_lines` | ~1-3 KB per study (deduplicated levels) |
| `data_get_pine_labels` | ~2-5 KB per study (capped at 50) |
| `data_get_pine_tables` | ~1-4 KB per study (formatted rows) |
| `data_get_pine_boxes` | ~1-2 KB per study (deduplicated zones) |
| `data_get_ohlcv` (summary) | ~500 bytes |
| `data_get_ohlcv` (100 bars) | ~8 KB |
| `capture_screenshot` | ~300 bytes (returns file path, not image data) |

## Tool Conventions

- All tools return `{ success: true/false, ... }`
- Entity IDs (from `chart_get_state`) are session-specific — don't cache across sessions
- Pine indicators must be **visible** on chart for pine graphics tools to read their data
- `chart_manage_indicator` requires **full indicator names**: "Relative Strength Index" not "RSI", "Moving Average Exponential" not "EMA", "Bollinger Bands" not "BB"
- Screenshots save to `screenshots/` directory with timestamps
- OHLCV capped at 500 bars, trades at 20 per request
- Pine labels capped at 50 per study by default (pass `max_labels` to override)

## Important Behavioral Rules

**Core principles:**
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation unless explicitly requested
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER hardcode API keys or sensitive data

## Trading Scripts Architecture

### Trading Execution Flow

```
TradingView MCP → Data Collector → Multi-Agent Analysis → Trading Script → Exchange API
     ↓                    ↓                  ↓                  ↓              ↓
  Chart Data        OHLCV, RSI,        KRONOS/           scalper-run    BitGet
  (real-time)       Indicators         PROPHET          (execution)     (API)
                                         ↓
                                    ORÁCULO
                                    (consensus)
```

### Specialist vs General Systems

The project implements a **specialist/general trading architecture**:

**Specialist Systems** (High precision, specific context):
- BTCUSDT London/NY Overlap (8am-12pm EST)
- ETHUSDT Asian Session (8pm-12am EST)
- SOLUSDT US Session Open (9:30am-11am EST)

**General Systems** (24/7 coverage, exclude specialist hours):
- BTCUSDT General (24/7 less overlap)
- Multi-PAR General (ETH+SOL+BNB 24/7)
- Trend Following (all sessions)

See `docs/proyecto_portafolio/ARQUITECTURA_PORTAFOLIO_ESPECIALISTAS.md` for details.

## Development Workflow

### Adding New MCP Tools

1. Create tool function in `src/tools/` (e.g., `my_tool.js`)
2. Export from `src/server.js`
3. Add to tool list in server configuration
4. Add tests in `tests/`
5. Update this CLAUDE.md if workflow-relevant

### Testing Trading Strategies

1. Paper trading first (use `TRADING_MODE=paper` env var if applicable)
2. Monitor with `monitor_turtle_soup_real.cjs`
3. Analyze results with `analyze_week1.js` or `analyze_two_weeks.js`
4. Optimize parameters in `backtesting/` or `optimization/` directories

### Multi-Agent Integration

To integrate TradingView MCP data with agents:

```javascript
// Collect data from TradingView
const chart_state = await mcp_tradingview__chart_get_state();
const study_values = await mcp_tradingview__data_get_study_values();
const quote = await mcp_tradingview__quote_get();

// Pass to agent system
const analysis = await agent_system.analyze({
  chart: chart_state,
  indicators: study_values,
  price: quote
});
```

## Troubleshooting

### TradingView Connection Issues

| Problem | Solution |
|---------|----------|
| `cdp_connected: false` | TradingView isn't running with `--remote-debugging-port=9222`. Use the launch script. |
| `ECONNREFUSED` | TradingView isn't running or port 9222 is blocked |
| Tools return stale data | TradingView still loading — wait a few seconds |
| Pine Editor tools fail | Open Pine Editor panel first: `ui_open_panel pine-editor open` |

### Trading Script Issues

| Problem | Solution |
|---------|----------|
| API authentication errors | Check `.env` has correct BITGET_API_KEY, BITGET_SECRET_KEY, BITGET_PASSPHRASE |
| Order size errors | Check LOT_SIZE and MIN_NOTIONAL configuration for your symbol |
| Rate limiting | Reduce trade frequency or check BitGet rate limits |
| Position lock errors | Check `safety-check-log.json` for locked asset information |

### Testing Issues

| Problem | Solution |
|---------|----------|
| E2E tests fail | Ensure TradingView is running with debug port enabled |
| MCP server not found | Check `~/.claude/.mcp.json` configuration |
| Tests timeout | Increase timeout or check TradingView responsiveness |

## Architecture

```
Claude Code ←→ MCP Server (stdio) ←→ CDP (localhost:9222) ←→ TradingView Desktop (Electron)
```

Pine graphics path: `study._graphics._primitivesCollection.dwglines.get('lines').get(false)._primitivesDataById`

## Research Context

This project explores research questions about:
- Context window constraints in real-time data systems
- Temporal consistency of streaming market data
- Tool granularity for agent systems
- Pine Script as agent-generated code
- Human-in-the-loop trading design

See `RESEARCH.md` for detailed research notes and findings.

## Credits

Built on top of [tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) by [@tradesdontlie](https://github.com/tradesdontlie). This fork adds morning brief workflow, rules configuration, and TradingView Desktop v2.14+ launch bug fix.
