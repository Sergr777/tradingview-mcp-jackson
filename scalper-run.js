import { createHmac } from "crypto";
import https from "https";
import { existsSync, readFileSync, writeFileSync } from "fs";

// Load .env
readFileSync(new URL(".env", import.meta.url), "utf8")
  .split("\n")
  .forEach((line) => {
    const [k, ...v] = line.split("=");
    if (k && !k.startsWith("#") && v.length)
      process.env[k.trim()] = v.join("=").trim();
  });

const API_KEY = process.env.BITGET_API_KEY;
const SECRET_KEY = process.env.BITGET_SECRET_KEY;
const PASSPHRASE = process.env.BITGET_PASSPHRASE;

const SYMBOL = "XRPUSDT"; // XRP/USDT spot — low price, above min order size
const INTERVAL_MS = 10000; // 10 seconds
const TOTAL_TRADES = 6;

// 🔧 LOT_SIZE configuration for BitGet XRPUSDT
const LOT_SIZE = 0.001; // BitGet minimum increment for XRP
const MIN_NOTIONAL = 5; // Minimum order value in USDT

// ── BitGet helpers ──────────────────────────────────────────────
function sign(ts, method, path, body = "") {
  return createHmac("sha256", SECRET_KEY)
    .update(ts + method + path + body)
    .digest("base64");
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const ts = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : "";
    const sig = sign(ts, method, path, bodyStr);
    const req = https.request(
      {
        hostname: "api.bitget.com",
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "ACCESS-KEY": API_KEY,
          "ACCESS-SIGN": sig,
          "ACCESS-TIMESTAMP": ts,
          "ACCESS-PASSPHRASE": PASSPHRASE,
          locale: "en-US",
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(JSON.parse(d)));
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Market data ─────────────────────────────────────────────────
async function getCandles(symbol, limit = 30) {
  // 1-minute candles from BitGet
  const res = await request(
    "GET",
    `/api/v2/spot/market/candles?symbol=${symbol}&granularity=1min&limit=${limit}`,
  );
  // returns [[ts, open, high, low, close, vol], ...]
  return (res.data || []).map((c) => ({
    ts: parseInt(c[0]),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    vol: parseFloat(c[5]),
  }));
}

async function getPrice(symbol) {
  const res = await request(
    "GET",
    `/api/v2/spot/market/tickers?symbol=${symbol}`,
  );
  return parseFloat(res.data?.[0]?.lastPr || 0);
}

async function getBalances() {
  const res = await request("GET", "/api/v2/spot/account/assets");
  const usdt = res.data?.find((a) => a.coin === "USDT");
  const xrp = res.data?.find((a) => a.coin === "XRP");
  return {
    usdt: parseFloat(usdt?.available || 0),
    xrp: parseFloat(xrp?.available || 0),
  };
}

// ── Indicators ──────────────────────────────────────────────────
function calcEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes, period = 3) {
  if (closes.length < period + 1) return 50;
  let gains = 0,
    losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcVWAP(candles) {
  // Session VWAP approximation (all candles provided)
  let cumTPV = 0,
    cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.vol;
    cumVol += c.vol;
  }
  return cumVol === 0 ? candles[candles.length - 1].close : cumTPV / cumVol;
}

// ── Signal logic (mirrors Pine Script) ─────────────────────────
function getSignal(candles) {
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1];

  const ema8 = calcEMA(closes, 8);
  const rsi3 = calcRSI(closes, 3);
  const vwap = calcVWAP(candles);

  const bullBias = last > vwap && last > ema8;
  const bearBias = last < vwap && last < ema8;

  let signal = "flat";
  if (bullBias && rsi3 < 30) signal = "buy";
  else if (bearBias && rsi3 > 70) signal = "sell";

  return { signal, last, ema8, rsi3, vwap };
}

// ── Order helpers ───────────────────────────────────────────────
/**
 * Adjust quantity to match BitGet LOT_SIZE requirements
 * Prevents "12001" precision errors
 */
function adjustToLotSize(qty, lotSize = LOT_SIZE) {
  const adjusted = Math.floor(qty / lotSize) * lotSize;
  // Ensure we don't go below minimum
  return adjusted >= lotSize ? adjusted : 0;
}

/**
 * Validate if order meets minimum notional value
 */
function validateMinNotional(qty, price, minNotional = MIN_NOTIONAL) {
  const value = qty * price;
  return value >= minNotional;
}

/**
 * Smart quantity adjustment with fallback strategies
 * Tries 3 precision levels if LOT_SIZE adjustment fails
 */
function adjustQuantityWithFallback(originalQty, price) {
  const strategies = [
    // Strategy 1: Exact LOT_SIZE
    adjustToLotSize(originalQty),
    // Strategy 2: 3 decimals (conservative)
    adjustToLotSize(Math.floor(originalQty * 1000) / 1000),
    // Strategy 3: 2 decimals (emergency fallback)
    adjustToLotSize(Math.floor(originalQty * 100) / 100),
  ];

  for (const qty of strategies) {
    if (qty > 0 && validateMinNotional(qty, price)) {
      return qty;
    }
  }

  return 0; // All strategies failed
}

async function placeOrder(side, size) {
  const body = {
    symbol: SYMBOL,
    side,
    orderType: "market",
    force: "gtc",
    size,
  };
  return request("POST", "/api/v2/spot/trade/place-order", body);
}

async function getOrderFill(orderId) {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await request(
      "GET",
      `/api/v2/spot/trade/orderInfo?orderId=${orderId}&symbol=${SYMBOL}`,
    );
    const fill = parseFloat(res.data?.baseVolume || 0);
    if (fill > 0) return fill;
  }
  return 0;
}

// BitGet locks newly purchased assets against immediate resale (anti-wash-trading).
// Enhanced retry system with LOT_SIZE correction and multiple fallback strategies.
/**
 * Pre-sale validation to prevent precision errors
 * Returns validated quantity or 0 if validation fails
 */
async function validateAndPrepareSell(intendedQty) {
  const bals = await getBalances();
  const currentPrice = await getPrice(SYMBOL);

  console.log(`\n  🔍 Pre-sale validation:`);
  console.log(`     Balance XRP: ${bals.xrp.toFixed(6)}`);
  console.log(`     Intended sell: ${intendedQty.toFixed(6)}`);
  console.log(`     Current price: $${currentPrice.toFixed(4)}`);

  // Check if we have enough balance
  if (bals.xrp < LOT_SIZE) {
    console.log(`  ❌ Balance too low: ${bals.xrp} < ${LOT_SIZE} (LOT_SIZE)`);
    return 0;
  }

  // Check if intended qty exceeds balance
  const actualQty = Math.min(intendedQty, bals.xrp);
  if (actualQty < intendedQty) {
    console.log(`  ⚠️  Reducing to available balance: ${actualQty.toFixed(6)}`);
  }

  // Adjust to LOT_SIZE
  const adjustedQty = adjustQuantityWithFallback(actualQty, currentPrice);

  if (adjustedQty === 0) {
    console.log(`  ❌ Cannot adjust ${actualQty.toFixed(6)} to valid LOT_SIZE`);
    console.log(`  💡 Converting dust to USDT...`);
    // TODO: Implement dust conversion
    return 0;
  }

  // Validate minimum notional
  if (!validateMinNotional(adjustedQty, currentPrice)) {
    console.log(`  ❌ Below minimum notional: $${(adjustedQty * currentPrice).toFixed(2)} < $${MIN_NOTIONAL}`);
    return 0;
  }

  console.log(`  ✅ Validated: Selling ${adjustedQty.toFixed(6)} XRP (≈$${(adjustedQty * currentPrice).toFixed(2)})`);
  return adjustedQty;
}

async function placeSellWithRetry(qty, maxRetries = 12, retryDelayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 🔧 FIX: Use smart quantity adjustment with fallback strategies
    const currentPrice = await getPrice(SYMBOL);
    const adjustedQty = adjustQuantityWithFallback(qty, currentPrice);

    if (adjustedQty === 0) {
      console.log(`  ❌ Cannot adjust ${qty} XRP to valid LOT_SIZE`);
      return { ok: false, res: { msg: "Invalid quantity after LOT_SIZE adjustment" }, soldQty: 0 };
    }

    const size = adjustedQty.toFixed(4);
    console.log(`  📏 Attempt ${attempt}/${maxRetries}: Selling ${size} XRP (original: ${qty.toFixed(4)})`);

    const res = await placeOrder("sell", size);

    if (res.code === "00000")
      return { ok: true, res, soldQty: parseFloat(size) };

    // Parse available qty from lock error: "0.001234XRP can be used at most"
    const lockMatch = res.msg?.match(/([\d.]+)XRP can be used at most/i);
    if (lockMatch) {
      const available = parseFloat(lockMatch[1]);
      console.log(
        `  🔒 Lock active — only ${available} XRP tradeable. Retry ${attempt}/${maxRetries} in ${retryDelayMs / 1000}s...`,
      );

      // 🔧 FIX: Update qty to available amount for next retry
      qty = available;
      await new Promise((r) => setTimeout(r, retryDelayMs));
      continue;
    }

    // Any other error — don't retry
    console.log(`  ❌ Non-recoverable error: ${res.msg}`);
    return { ok: false, res, soldQty: 0 };
  }

  return {
    ok: false,
    res: { msg: "Sell lock never lifted after retries" },
    soldQty: 0,
  };
}

// ── Main loop ───────────────────────────────────────────────────
async function main() {
  console.log(`\n🤖 BTC Scalper — VWAP + RSI(3) + EMA(8)`);
  console.log(
    `Symbol: ${SYMBOL} | ${TOTAL_TRADES} trades × ${INTERVAL_MS / 1000}s\n`,
  );

  const log = [];
  let holding = "usdt";
  let lastBuyXrpQty = 0;

  for (let i = 1; i <= TOTAL_TRADES; i++) {
    const ts = new Date().toISOString();
    const candles = await getCandles(SYMBOL, 30);
    const { signal, last, ema8, rsi3, vwap } = getSignal(candles);
    const bals = await getBalances();

    console.log(`[${i}/${TOTAL_TRADES}] ${ts}`);
    console.log(
      `  Price: $${last.toFixed(4)} | EMA8: ${ema8.toFixed(4)} | RSI3: ${rsi3.toFixed(1)} | VWAP: ${vwap.toFixed(4)}`,
    );
    console.log(
      `  USDT: $${bals.usdt.toFixed(4)} | XRP: ${bals.xrp.toFixed(4)} | Signal: ${signal.toUpperCase()}`,
    );

    let side, size, label;
    const entry = {
      tick: i,
      timestamp: ts,
      price: last,
      ema8,
      rsi3,
      vwap,
      signal,
      orderPlaced: false,
    };

    if (signal === "buy" && holding === "usdt" && bals.usdt >= 1) {
      side = "buy";
      size = (bals.usdt * 0.9).toFixed(4);
      label = `BUY XRP with $${size} USDT`;
      holding = "xrp";
    } else if (signal === "sell" && holding === "xrp" && lastBuyXrpQty >= 1) {
      side = "sell";
      size = (Math.floor(lastBuyXrpQty * 10000) / 10000).toFixed(4);
      label = `SELL ${size} XRP → USDT`;
      holding = "usdt";
    } else {
      const reason =
        signal === "flat"
          ? "no signal — conditions not met"
          : `signal=${signal} but holding=${holding} (waiting for right side)`;
      console.log(`  ⏭  Skip — ${reason}\n`);
      entry.skipped = true;
      entry.skipReason = reason;
      log.push(entry);
      if (i < TOTAL_TRADES)
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    console.log(`  → ${label}`);
    entry.side = side;
    entry.size = size;

    if (side === "buy") {
      const res = await placeOrder("buy", size);
      const ok = res.code === "00000";
      const orderId = res.data?.orderId;
      entry.orderId = orderId || res.msg;
      entry.orderPlaced = ok;

      if (ok) {
        console.log(`  ✅ BUY PLACED — ${orderId}`);
        lastBuyXrpQty = await getOrderFill(orderId);
        console.log(
          `  📦 Filled: ${lastBuyXrpQty.toFixed(4)} XRP — waiting for lock to clear...`,
        );
        entry.filledQty = lastBuyXrpQty;
      } else {
        console.log(`  ❌ Rejected: ${res.msg}`);
        holding = "usdt";
      }
    } else {
      // 🔧 FIX: Pre-sale validation before attempting sell
      const validatedQty = await validateAndPrepareSell(lastBuyXrpQty);

      if (validatedQty === 0) {
        console.log(`  ❌ Cannot sell — validation failed`);
        entry.orderPlaced = false;
        entry.skipReason = "Pre-sale validation failed";
        log.push(entry);
        if (i < TOTAL_TRADES)
          await new Promise((r) => setTimeout(r, INTERVAL_MS));
        continue;
      }

      // Use retry loop — handles BitGet's anti-wash-trading lock automatically
      const { ok, res, soldQty } = await placeSellWithRetry(validatedQty);
      entry.orderId = res.data?.orderId || res.msg;
      entry.orderPlaced = ok;

      if (ok) {
        console.log(
          `  ✅ SELL PLACED — ${entry.orderId} (${soldQty.toFixed(4)} XRP)`,
        );
        lastBuyXrpQty = 0;
      } else {
        console.log(`  ❌ Sell failed: ${res.msg}`);
        holding = "xrp"; // still holding
      }
    }

    log.push(entry);

    if (i < TOTAL_TRADES) {
      const waitMs =
        side === "buy" ? Math.max(INTERVAL_MS - 5000, 4000) : INTERVAL_MS;
      console.log(`  ⏱  Next in ${waitMs / 1000}s...\n`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  const final = await getBalances();
  const price = await getPrice(SYMBOL);
  const totalValue = final.usdt + final.xrp * price;
  console.log(`\n📊 Final:`);
  console.log(`  USDT: $${final.usdt.toFixed(4)}`);
  console.log(
    `  XRP: ${final.xrp.toFixed(4)} (≈$${(final.xrp * price).toFixed(4)})`,
  );
  console.log(`  Total est. value: $${totalValue.toFixed(4)}`);

  const placed = log.filter((e) => e.orderPlaced).length;
  console.log(`\n✅ Done — ${placed}/${TOTAL_TRADES} orders placed.\n`);

  const existing = existsSync("safety-check-log.json")
    ? JSON.parse(readFileSync("safety-check-log.json", "utf8"))
    : [];
  writeFileSync(
    "safety-check-log.json",
    JSON.stringify([...existing, ...log], null, 2),
  );
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
