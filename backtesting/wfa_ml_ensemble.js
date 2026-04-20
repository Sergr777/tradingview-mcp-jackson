/**
 * wfa_ml_ensemble.js
 * Walk-Forward Analysis — ML Ensemble (7 Voting Classifiers)
 *
 * Adapta backtest_ml_ensemble.js al framework WFA estándar.
 * El backtestFn recibe barras 15m y deriva 1h internamente.
 *
 * Grid: 4×3×3×3 = 108 combos × 4 ventanas
 * Datos: BTCUSDT 15m 4 años (igual que turtle/ob)
 */

import fs from 'fs';
import path from 'path';
import { WalkForwardAnalyzer, loadCSV } from './walk_forward_framework.js';
import {
    calculateSMA, calculateEMA, calculateATR,
    calculateMACD, calculateRSI,
} from './backtest_utils.js';

// ─── PARAM GRID ───────────────────────────────────────────────────────────────

const PARAM_GRID = {
    min_votes:   [4, 5, 6, 7],
    volume_mult: [1.0, 1.5, 2.0],
    atr_mult_sl: [0.5, 0.8, 1.0],
    atr_mult_tp: [1.5, 2.0, 2.5],
};

// ─── BOLLINGER BANDS ─────────────────────────────────────────────────────────

function calculateBB(closes, period, stdMult) {
    const sma = calculateSMA(closes, period);
    const upper = [], lower = [], width = [];
    for (let i = 0; i < closes.length; i++) {
        if (sma[i] === null) { upper.push(null); lower.push(null); width.push(null); continue; }
        let variance = 0;
        for (let j = i - period + 1; j <= i; j++) variance += Math.pow(closes[j] - sma[i], 2);
        const std = Math.sqrt(variance / period);
        upper.push(sma[i] + stdMult * std);
        lower.push(sma[i] - stdMult * std);
        width.push((std * 2 * stdMult) / sma[i] * 100);
    }
    return { mid: sma, upper, lower, width };
}

// ─── DERIVAR 1H DESDE 15M ────────────────────────────────────────────────────

function build1hBars(bars15m) {
    const bars1h = [];
    for (let i = 0; i + 4 <= bars15m.length; i += 4) {
        const sl = bars15m.slice(i, i + 4);
        bars1h.push({
            time:   sl[0].time,
            open:   sl[0].open,
            high:   Math.max(...sl.map(b => b.high)),
            low:    Math.min(...sl.map(b => b.low)),
            close:  sl[sl.length - 1].close,
            volume: sl.reduce((s, b) => s + b.volume, 0),
        });
    }
    return bars1h;
}

// ─── PRE-CALCULAR INDICADORES ────────────────────────────────────────────────

function precompute(bars15m, bars1h) {
    const c15 = bars15m.map(b => b.close);
    const h15 = bars15m.map(b => b.high);
    const l15 = bars15m.map(b => b.low);
    const v15 = bars15m.map(b => b.volume);
    const c1h = bars1h.map(b => b.close);

    const bb = calculateBB(c15, 20, 2);
    const macd15 = calculateMACD(c15, 12, 26, 9);
    const macd1h = calculateMACD(c1h, 12, 26, 9);

    return {
        rsi14_15m:    calculateRSI(c15, 14),
        rsi3_15m:     calculateRSI(c15, 3),
        ema8:         calculateEMA(c15, 8),
        ema21:        calculateEMA(c15, 21),
        ema55:        calculateEMA(c15, 55),
        macd_hist_15m: macd15.histogram,
        bb_mid:       bb.mid,
        bb_upper:     bb.upper,
        bb_lower:     bb.lower,
        bb_width:     bb.width,
        volMA:        calculateSMA(v15, 20),
        atr:          calculateATR(h15, l15, c15, 14),
        rsi14_1h:     calculateRSI(c1h, 14),
        ema20_1h:     calculateEMA(c1h, 20),
        ema50_1h:     calculateEMA(c1h, 50),
        macd_hist_1h: macd1h.histogram,
    };
}

// ─── 7 CLASIFICADORES ────────────────────────────────────────────────────────

function c1_rsi(i, ind) {
    const ih = Math.floor(i / 4);
    if (!ind.rsi14_15m[i] || !ind.rsi14_15m[i-1] || !ind.rsi3_15m[i] || !ind.rsi14_1h[ih]) return 0;
    const rising  = ind.rsi14_15m[i] > ind.rsi14_15m[i-1];
    const falling = ind.rsi14_15m[i] < ind.rsi14_15m[i-1];
    if (ind.rsi14_15m[i] > 50 && rising  && ind.rsi3_15m[i] > 55 && ind.rsi14_1h[ih] > 50) return +1;
    if (ind.rsi14_15m[i] < 50 && falling && ind.rsi3_15m[i] < 45 && ind.rsi14_1h[ih] < 50) return -1;
    return 0;
}

function c2_ema(i, ind) {
    const ih = Math.floor(i / 4);
    if (!ind.ema8[i] || !ind.ema21[i] || !ind.ema55[i]) return 0;
    if (!ind.ema20_1h[ih] || !ind.ema50_1h[ih]) return 0;
    if (ind.ema8[i] > ind.ema21[i] && ind.ema21[i] > ind.ema55[i] && ind.ema20_1h[ih] > ind.ema50_1h[ih]) return +1;
    if (ind.ema8[i] < ind.ema21[i] && ind.ema21[i] < ind.ema55[i] && ind.ema20_1h[ih] < ind.ema50_1h[ih]) return -1;
    return 0;
}

function c3_macd(i, ind) {
    const ih = Math.floor(i / 4);
    if (!ind.macd_hist_15m[i] || !ind.macd_hist_15m[i-1] || !ind.macd_hist_1h[ih]) return 0;
    const growing  = ind.macd_hist_15m[i] > ind.macd_hist_15m[i-1];
    const falling  = ind.macd_hist_15m[i] < ind.macd_hist_15m[i-1];
    if (ind.macd_hist_15m[i] > 0 && growing  && ind.macd_hist_1h[ih] > 0) return +1;
    if (ind.macd_hist_15m[i] < 0 && falling  && ind.macd_hist_1h[ih] < 0) return -1;
    return 0;
}

function c4_bb(i, ind, bars) {
    if (!ind.bb_mid[i] || !ind.bb_width[i]) return 0;
    if (ind.bb_width[i] < 0.3) return 0;
    const price = bars[i].close;
    if (price > ind.bb_mid[i] && price < ind.bb_upper[i] && ind.bb_width[i] < 6) return +1;
    if (price < ind.bb_mid[i] && price > ind.bb_lower[i] && ind.bb_width[i] < 6) return -1;
    return 0;
}

function c5_volume_vol(i, ind, bars, volumeMult) {
    if (!ind.volMA[i] || !ind.atr[i]) return 0;
    if (bars[i].volume < ind.volMA[i] * volumeMult) return 0;
    return bars[i].close > bars[i].open ? +1 : bars[i].close < bars[i].open ? -1 : 0;
}

function c6_price_action(i, bars) {
    if (i < 5) return 0;
    const curr = bars[i], prev = bars[i-1];
    const currBody = Math.abs(curr.close - curr.open);
    const prevBody = Math.abs(prev.close - prev.open);
    const bullEngulf = curr.close > curr.open && prev.close < prev.open &&
                       currBody > prevBody && curr.close > prev.open && curr.open < prev.close;
    const bearEngulf = curr.close < curr.open && prev.close > prev.open &&
                       currBody > prevBody && curr.close < prev.open && curr.open > prev.close;
    let bull = 0, bear = 0;
    for (let k = i - 4; k <= i; k++) {
        if (bars[k].close > bars[k-1].close) bull++;
        else bear++;
    }
    if (bullEngulf && bull >= 3) return +1;
    if (bearEngulf && bear >= 3) return -1;
    if (bull >= 4) return +1;
    if (bear >= 4) return -1;
    return 0;
}

function c7_market_structure(i, bars) {
    const lb = 10;
    if (i < lb * 2) return 0;
    let h1 = -Infinity, l1 = Infinity, h2 = -Infinity, l2 = Infinity;
    for (let k = i - lb*2; k < i - lb; k++) {
        if (bars[k].high > h1) h1 = bars[k].high;
        if (bars[k].low  < l1) l1 = bars[k].low;
    }
    for (let k = i - lb; k < i; k++) {
        if (bars[k].high > h2) h2 = bars[k].high;
        if (bars[k].low  < l2) l2 = bars[k].low;
    }
    if (h2 > h1 && l2 > l1) return +1;
    if (h2 < h1 && l2 < l1) return -1;
    return 0;
}

// ─── BACKTEST ADAPTADO PARA WFA ───────────────────────────────────────────────
// Retorna array de trades con {pnl} para compatibilidad con WalkForwardAnalyzer

function backtestEnsemble(bars, params) {
    const { min_votes, volume_mult, atr_mult_sl, atr_mult_tp } = params;
    const COST      = 0.001;
    const MAX_HOLD  = 96;   // barras 15m (24h)
    const POS_SIZE  = 0.30;

    const bars1h = build1hBars(bars);
    const ind    = precompute(bars, bars1h);

    const trades   = [];
    let position   = null;
    const startIdx = Math.max(60, 30);

    for (let i = startIdx; i < bars.length; i++) {
        const bar = bars[i];

        if (position) {
            const ret = position.type === 'LONG'
                ? (bar.close - position.entry) / position.entry
                : (position.entry - bar.close) / position.entry;
            const held = i - position.entryBar;

            if (ret <= -position.slPct) {
                trades.push({ pnl: -position.slPct - COST, exitReason: 'STOP_LOSS', type: position.type, entryTime: position.entryTime });
                position = null; continue;
            }
            if (ret >= position.tpPct) {
                trades.push({ pnl: position.tpPct - COST, exitReason: 'TAKE_PROFIT', type: position.type, entryTime: position.entryTime });
                position = null; continue;
            }
            if (held >= MAX_HOLD) {
                trades.push({ pnl: ret - COST, exitReason: 'MAX_HOLD', type: position.type, entryTime: position.entryTime });
                position = null;
            }
            continue;
        }

        const atrVal = ind.atr[i];
        if (!atrVal) continue;

        // Obtener votos
        const votes = [
            c1_rsi(i, ind),
            c2_ema(i, ind),
            c3_macd(i, ind),
            c4_bb(i, ind, bars),
            c5_volume_vol(i, ind, bars, volume_mult),
            c6_price_action(i, bars),
            c7_market_structure(i, bars),
        ];

        const longVotes  = votes.filter(v => v === +1).length;
        const shortVotes = votes.filter(v => v === -1).length;

        let dir = null;
        if (longVotes  >= min_votes) dir = 'LONG';
        else if (shortVotes >= min_votes) dir = 'SHORT';
        if (!dir) continue;

        const slPct = (atrVal * atr_mult_sl) / bar.close;
        const tpPct = (atrVal * atr_mult_tp) / bar.close;

        position = { type: dir, entry: bar.close, entryBar: i, entryTime: bar.time, slPct, tpPct };
    }

    return trades;
}

// ─── ANÁLISIS DE CLASIFICADORES EN W4 ────────────────────────────────────────

function analyzeClassifiers(bars, bestParams) {
    const bars1h = build1hBars(bars);
    const ind    = precompute(bars, bars1h);

    const classStats = [
        { name: 'C1 RSI Multi-tf',     long: 0, short: 0 },
        { name: 'C2 EMA Alignment',    long: 0, short: 0 },
        { name: 'C3 MACD Momentum',    long: 0, short: 0 },
        { name: 'C4 Bollinger Bands',  long: 0, short: 0 },
        { name: 'C5 Volume+ATR',       long: 0, short: 0 },
        { name: 'C6 Price Action',     long: 0, short: 0 },
        { name: 'C7 Market Structure', long: 0, short: 0 },
    ];

    for (let i = 60; i < bars.length; i++) {
        const vs = [
            c1_rsi(i, ind),
            c2_ema(i, ind),
            c3_macd(i, ind),
            c4_bb(i, ind, bars),
            c5_volume_vol(i, ind, bars, bestParams.volume_mult),
            c6_price_action(i, bars),
            c7_market_structure(i, bars),
        ];
        vs.forEach((v, idx) => {
            if (v === +1) classStats[idx].long++;
            if (v === -1) classStats[idx].short++;
        });
    }

    console.log('\n  📊 Actividad de clasificadores (OOS W4):');
    classStats.forEach(c => {
        const total = c.long + c.short;
        if (total === 0) { console.log(`    ${c.name.padEnd(22)}: inactivo`); return; }
        console.log(`    ${c.name.padEnd(22)}: ${String(c.long).padStart(5)} LONG | ${String(c.short).padStart(5)} SHORT`);
    });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
    const dataFile = path.join('data', 'BTCUSDT_15m_4y.csv');
    if (!fs.existsSync(dataFile)) {
        console.log('❌ Datos no encontrados: data/BTCUSDT_15m_4y.csv');
        process.exit(1);
    }

    console.log('📂 Cargando datos 4 años BTCUSDT 15m...');
    const allBars = loadCSV(dataFile);
    console.log(`   ${allBars.length.toLocaleString()} barras`);
    console.log('\n🤖 ML Ensemble WFA — 7 clasificadores × votación');
    console.log('   Grid: 108 combos × 4 ventanas\n');

    const wfa = new WalkForwardAnalyzer(
        'ML Ensemble (7-Classifier Vote)',
        PARAM_GRID,
        backtestEnsemble
    );

    const results = await wfa.run(allBars);

    // Desglose W4
    const w4 = results.find(r => r.window.id === 'W4' && r.outSample);
    if (w4) {
        const testBars = allBars.filter(b =>
            b.time >= new Date(w4.window.trainEnd).getTime() &&
            b.time <  new Date(w4.window.testEnd).getTime()
        );
        analyzeClassifiers(testBars, w4.bestParams);

        const trades = backtestEnsemble(testBars, w4.bestParams);
        const byExit = {};
        trades.forEach(t => {
            if (!byExit[t.exitReason]) byExit[t.exitReason] = { count: 0, wins: 0 };
            byExit[t.exitReason].count++;
            if (t.pnl > 0) byExit[t.exitReason].wins++;
        });
        console.log('\n  📊 Salidas (OOS W4):');
        Object.entries(byExit).forEach(([r, d]) => {
            const wr = ((d.wins / d.count) * 100).toFixed(1);
            console.log(`    ${r.padEnd(14)}: ${String(d.count).padStart(4)} trades | WR ${wr}%`);
        });

        const p = w4.bestParams;
        console.log(`\n  Params W4: min_votes=${p.min_votes} | vol_mult=${p.volume_mult} | SL=${p.atr_mult_sl}×ATR | TP=${p.atr_mult_tp}×ATR`);
    }

    // Resumen
    const valid = results.filter(r => r.outSample);
    const avgWR = valid.length ? (valid.reduce((s, r) => s + r.outSample.winRate, 0) / valid.length).toFixed(2) : 'N/A';
    const avgPF = valid.length ? (valid.reduce((s, r) => s + r.outSample.pf, 0) / valid.length).toFixed(3) : 'N/A';
    const ok    = results.filter(r => r.approved).length;

    console.log('\n══════════════════════════════════════════════════════');
    console.log('📊 ML ENSEMBLE — RESUMEN WFA');
    console.log('══════════════════════════════════════════════════════');
    console.log(`  OOS WR avg: ${avgWR}%  | PF avg: ${avgPF} | ${ok}/4 ventanas aprobadas`);

    wfa.save(path.join('results', 'wfa_ml_ensemble.json'));
}

main().catch(console.error);
