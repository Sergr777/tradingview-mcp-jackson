"""
lgbm_ob_trading_system_fase1_fase2.py
Sistema de Trading Completo basado en LightGBM OB Scorer

REVERTIDO A BASELINE (2026-04-23):
  Las optimizaciones de Fase 1-2 (20 features, dynamic threshold)
  fueron REVERTIDAS tras backtesting OOS porque DEGRADARON
  el sistema: WR 73.07%→68.97%, PF 3.15→2.742, Sharpe 9.16→8.035.

  Este archivo ahora usa la configuración BASELINE probada:
  - 15 features originales
  - Threshold fijo 0.55 (sin ajuste dinámico por régimen)
  - Sin features que requieren datos L2
  - Sin ensemble

  Lección: "Simplicity wins". El modelo base ya era óptimo.

Pipeline:
  1. Detectar Order Blocks (BULL y BEAR)
  2. Esperar retoque del precio a la zona
  3. Scorear el OB con LightGBM en el momento del retoque
  4. Entrar solo si score >= threshold (0.55)
  5. SL = 1×ATR bajo la zona (LONG) / sobre la zona (SHORT)
  6. TP = 2×ATR desde entry (R:R 2:1)
  7. WFA con las mismas 4 ventanas para validación OOS honesta

Por qué este sistema tiene ventaja real:
  - Base rate (sin filtro): 50.7% TP → breakeven con RR 2:1 = 33%
  - Con score >= 0.55: 73.3% TP → EV = +1.20 unidades/trade ANTES de costos
  - 4/4 ventanas WFA aprobadas en el scorer

Activos: BTC 15m (principal) + ETH 15m + SOL 15m
WFA: 4 ventanas rolling (2022→2026)
"""

import sys
import json
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import roc_auc_score

# ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

DATA_DIR    = Path('data')
RESULTS_DIR = Path('results')
RESULTS_DIR.mkdir(exist_ok=True)

ASSETS = [
    ('BTC', 'BTCUSDT_15m_4y.csv'),
    ('ETH', 'ETHUSDT_15m_4y.csv'),
    ('SOL', 'SOLUSDT_15m_4y.csv'),
]

WFA_WINDOWS = [
    {'id': 'W1', 'train_start': '2022-01-01', 'train_end': '2023-01-01', 'test_end': '2024-01-01'},
    {'id': 'W2', 'train_start': '2023-01-01', 'train_end': '2024-01-01', 'test_end': '2025-01-01'},
    {'id': 'W3', 'train_start': '2024-01-01', 'train_end': '2025-01-01', 'test_end': '2026-01-01'},
    {'id': 'W4', 'train_start': '2025-01-01', 'train_end': '2026-01-01', 'test_end': '2026-04-20'},
]

LGB_PARAMS = {
    'objective':         'binary',
    'metric':            'binary_logloss',
    'learning_rate':     0.05,
    'num_leaves':        31,
    'min_child_samples': 25,
    'subsample':         0.8,
    'colsample_bytree':  0.8,
    'reg_alpha':         0.1,
    'reg_lambda':        0.1,
    'class_weight':      'balanced',
    'verbose':          -1,
    'random_state':      42,
}
N_ESTIMATORS = 400
EARLY_STOP   = 40

# OB parameters
OB_AGE_MAX   = 40
IMPULSE_MIN  = 0.5
ATR_PERIOD   = 14
SL_ATR_MULT  = 1.0   # SL a 1×ATR
TP_ATR_MULT  = 2.0   # TP a 2×ATR (RR 2:1)
MAX_HOLD     = 96
COST         = 0.001  # comisión
SCORE_THRESH = 0.55   # umbral del scorer (FIJO — sin dynamic threshold)

FEAT_COLS = [
    'impulse_pct', 'ob_vol_ratio', 'zone_size_pct',
    'ob_age', 'dist_zone', 'vol_ratio',
    'rsi_14', 'rsi_1h', 'ema_align_15m', 'ema_align_1h',
    'bbw', 'chop', 'atr_norm', 'is_ny', 'is_london',
]

# ─── CARGA DE DATOS ───────────────────────────────────────────────────────────

def load_data(filepath: Path) -> pd.DataFrame:
    df = pd.read_csv(filepath, header=0,
                     names=['time','open','high','low','close','volume'],
                     skiprows=1)
    # Fix: algunos CSV tienen timestamps con 3 ceros extra (microsegundos)
    if df['time'].max() > 1e15:
        df['time'] = df['time'] // 1000
    df['time'] = pd.to_datetime(df['time'], unit='ms')
    df = df.set_index('time').sort_index()
    return df

# ─── INDICADORES ─────────────────────────────────────────────────────────────

def calc_ema(s: pd.Series, p: int) -> pd.Series:
    return s.ewm(span=p, adjust=False).mean()

def calc_rsi(s: pd.Series, p: int = 14) -> pd.Series:
    d = s.diff()
    g = d.clip(lower=0).rolling(p).mean()
    l = (-d.clip(upper=0)).rolling(p).mean()
    return 100 - 100 / (1 + g / l.replace(0, np.nan))

def calc_atr(df: pd.DataFrame, p: int = 14) -> pd.Series:
    hl = df['high'] - df['low']
    hc = (df['high'] - df['close'].shift()).abs()
    lc = (df['low']  - df['close'].shift()).abs()
    return pd.concat([hl, hc, lc], axis=1).max(axis=1).ewm(span=p, adjust=False).mean()

def calc_bbw(s: pd.Series, p: int = 20) -> pd.Series:
    sma = s.rolling(p).mean()
    std = s.rolling(p).std()
    return (std * 4) / sma.replace(0, np.nan)

def calc_chop(df: pd.DataFrame, p: int = 14) -> pd.Series:
    atr1 = calc_atr(df, 1)
    tr_s = atr1.rolling(p).sum()
    hi   = df['high'].rolling(p).max()
    lo   = df['low'].rolling(p).min()
    rng  = (hi - lo).replace(0, np.nan)
    return 100 * np.log10(tr_s / rng) / np.log10(p)

# ─── DETECCIÓN DE ORDER BLOCKS ────────────────────────────────────────────────

def detect_obs(df: pd.DataFrame) -> list:
    obs = []
    closes  = df['close'].values
    highs   = df['high'].values
    lows    = df['low'].values
    opens   = df['open'].values
    volumes = df['volume'].values
    times   = df.index

    for j in range(1, len(df) - OB_AGE_MAX - 5):
        is_bearish = closes[j] < opens[j]
        is_bullish = closes[j] > opens[j]

        if is_bearish:
            for k in range(j + 1, min(j + 4, len(df))):
                imp = ((closes[k] - highs[j]) / highs[j]) * 100
                if imp >= IMPULSE_MIN:
                    avg_vol = float(np.mean(volumes[max(0, j-10):j])) if j > 0 else volumes[j]
                    obs.append({'type': 'BULL', 'form_idx': j, 'form_time': times[j],
                                'zone_high': highs[j], 'zone_low': lows[j],
                                'impulse_pct': imp, 'form_vol': volumes[j], 'avg_vol': avg_vol})
                    break

        if is_bullish:
            for k in range(j + 1, min(j + 4, len(df))):
                imp = ((lows[j] - closes[k]) / lows[j]) * 100
                if imp >= IMPULSE_MIN:
                    avg_vol = float(np.mean(volumes[max(0, j-10):j])) if j > 0 else volumes[j]
                    obs.append({'type': 'BEAR', 'form_idx': j, 'form_time': times[j],
                                'zone_high': highs[j], 'zone_low': lows[j],
                                'impulse_pct': imp, 'form_vol': volumes[j], 'avg_vol': avg_vol})
                    break

    return obs

# ─── FEATURE EXTRACTION + LABELING ───────────────────────────────────────────

def build_ob_dataset(df: pd.DataFrame, obs: list) -> pd.DataFrame:
    atr     = calc_atr(df, ATR_PERIOD)
    rsi14   = calc_rsi(df['close'], 14)
    ema20   = calc_ema(df['close'], 20)
    ema50   = calc_ema(df['close'], 50)
    bbw     = calc_bbw(df['close'], 20)
    chop    = calc_chop(df, 14)

    close_1h  = df['close'].iloc[::4].reindex(df.index, method='ffill')
    ema20_1h  = calc_ema(close_1h, 20)
    ema50_1h  = calc_ema(close_1h, 50)
    rsi14_1h  = calc_rsi(close_1h, 14).reindex(df.index, method='ffill')
    vol_ratio = df['volume'] / df['volume'].rolling(20).mean().replace(0, np.nan)

    closes = df['close'].values
    highs  = df['high'].values
    lows   = df['low'].values
    idx    = df.index
    rows   = []

    for ob in obs:
        j = ob['form_idx']
        if j + 5 >= len(df): continue

        touch_idx = None
        for i in range(j + 2, min(j + OB_AGE_MAX + 1, len(df))):
            if lows[i] <= ob['zone_high'] and highs[i] >= ob['zone_low']:
                touch_idx = i
                break

        if touch_idx is None: continue

        touch_time  = idx[touch_idx]
        touch_close = closes[touch_idx]
        atr_val     = atr.iloc[touch_idx]
        if not atr_val or np.isnan(atr_val) or atr_val == 0: continue

        sl_pct = (atr_val * SL_ATR_MULT) / touch_close
        tp_pct = (atr_val * TP_ATR_MULT) / touch_close

        label = None
        for i in range(touch_idx + 1, min(touch_idx + MAX_HOLD + 1, len(df))):
            ret = (closes[i] - touch_close) / touch_close
            if ob['type'] == 'BEAR': ret = -ret
            if ret <= -sl_pct: label = 0; break
            if ret >= tp_pct:  label = 1; break
        if label is None: label = 0

        age       = touch_idx - j
        mid       = (ob['zone_high'] + ob['zone_low']) / 2
        sz        = ob['zone_high'] - ob['zone_low']
        dist_zone = abs(touch_close - mid) / (sz + 1e-9)
        vol_r     = vol_ratio.iloc[touch_idx]
        h         = touch_time.hour
        rows.append({
            'label':          label,
            'trade_time':     touch_time,
            'ob_type':        ob['type'],
            'touch_close':    touch_close,
            'atr_val':        atr_val,
            'sl_pct':         sl_pct,
            'tp_pct':         tp_pct,
            'impulse_pct':    ob['impulse_pct'],
            'ob_vol_ratio':   ob['form_vol'] / (ob['avg_vol'] + 1e-9),
            'zone_size_pct':  sz / ob['zone_low'],
            'ob_age':         age,
            'dist_zone':      dist_zone,
            'vol_ratio':      float(vol_r) if not np.isnan(vol_r) else 1.0,
            'rsi_14':         float(rsi14.iloc[touch_idx]),
            'rsi_1h':         float(rsi14_1h.iloc[touch_idx]),
            'ema_align_15m':  1 if ema20.iloc[touch_idx] > ema50.iloc[touch_idx] else -1,
            'ema_align_1h':   1 if ema20_1h.iloc[touch_idx] > ema50_1h.iloc[touch_idx] else -1,
            'bbw':            float(bbw.iloc[touch_idx]),
            'chop':           float(chop.iloc[touch_idx]),
            'atr_norm':       atr_val / touch_close,
            'is_ny':          1 if (h >= 13 and h < 20) else 0,
            'is_london':      1 if (h >= 7  and h < 13) else 0,
        })

    return pd.DataFrame(rows).dropna(subset=FEAT_COLS + ['label'])

# ─── SIMULACIÓN DE TRADES ────────────────────────────────────────────────────

def simulate_trades(ob_df_test: pd.DataFrame, proba: np.ndarray,
                    threshold: float = SCORE_THRESH) -> list:
    """
    Simula trades: entra en todos los OBs donde score >= threshold.
    Cada OB es un trade independiente (el dataset ya tiene el resultado).
    Modelo: capital dividido en sub-posiciones, cada OB corre en paralelo.
    """
    trades = []

    for i, (_, row) in enumerate(ob_df_test.iterrows()):
        if proba[i] < threshold:
            continue

        pnl_raw = row['tp_pct'] if row['label'] == 1 else -row['sl_pct']
        pnl     = pnl_raw - COST

        trades.append({
            'time':    row['trade_time'],
            'ob_type': row['ob_type'],
            'score':   round(float(proba[i]), 3),
            'label':   int(row['label']),
            'pnl':     round(pnl, 6),
            'exit':    'TP' if row['label'] == 1 else 'SL',
        })

    return trades

# ─── MÉTRICAS PORTFOLIO ───────────────────────────────────────────────────────

def calc_metrics(trades: list, label: str = '') -> dict:
    if not trades:
        return {'label': label, 'trades': 0}

    pnls = [t['pnl'] for t in trades]
    wins = [p for p in pnls if p > 0]
    loss = [p for p in pnls if p <= 0]
    wr   = len(wins) / len(pnls)
    pf   = sum(wins) / abs(sum(loss)) if loss else float('inf')
    avg  = np.mean(pnls)
    total = sum(pnls)

    # Equity & Drawdown
    equity = 0
    peak   = 0
    maxDD  = 0
    for p in pnls:
        equity += p
        if equity > peak: peak = equity
        dd = peak - equity
        if dd > maxDD: maxDD = dd

    # Sharpe (daily)
    by_day = {}
    for t in trades:
        day = str(t['time'])[:10]
        by_day[day] = by_day.get(day, 0) + t['pnl']
    dr = list(by_day.values())
    mean_d = np.mean(dr)
    std_d  = np.std(dr)
    sharpe = (mean_d / std_d * np.sqrt(252)) if std_d > 0 else 0

    # Sortino
    down   = [r for r in dr if r < 0]
    std_dn = np.sqrt(np.mean([r**2 for r in down])) if down else std_d
    sortino = (mean_d / std_dn * np.sqrt(252)) if std_dn > 0 else 0

    # CAGR
    years = 4
    cagr  = (1 + total) ** (1 / years) - 1

    # Calmar
    calmar = cagr / maxDD if maxDD > 0 else 0

    # Kelly
    avg_w = np.mean(wins) if wins else 0
    avg_l = abs(np.mean(loss)) if loss else 0.001
    kelly = wr - (1 - wr) / (avg_w / avg_l) if avg_w > 0 else 0

    return {
        'label': label, 'trades': len(pnls),
        'wr': round(wr * 100, 2), 'pf': round(pf, 3),
        'avg_trade': round(avg * 100, 4),
        'total_pnl': round(total * 100, 2),
        'cagr': round(cagr * 100, 2),
        'maxDD': round(maxDD * 100, 2),
        'sharpe': round(sharpe, 3),
        'sortino': round(sortino, 3),
        'calmar': round(calmar, 3),
        'kelly_half': round(max(0, kelly / 2) * 100, 1),
        'by_day': by_day,
    }


# ─── CALIBRACIÓN DE THRESHOLD ────────────────────────────────────────────────

def calibrate_threshold(ob_df: pd.DataFrame, thresholds: list = [0.55, 0.60, 0.65],
                        asset: str = 'BTC') -> list:
    """
    Explora diferentes thresholds de score para encontrar el óptimo trade-off
    entre precisión (WR) y número de señales (trades).
    """
    print(f'\n  Calibración de threshold ({asset}):')
    print(f'  Threshold  Trades  WR%    PF     PnL    Sharpe  CAGR%')
    print(f'  {"-"*55}')

    results = []

    # Entrenar modelo con todos los datos (para calibración rápida)
    train = ob_df.dropna(subset=FEAT_COLS + ['label'])
    if len(train) < 200:
        print('  Datos insuficientes para calibración')
        return results

    X_train, y_train = train[FEAT_COLS], train['label']

    model = lgb.LGBMClassifier(**LGB_PARAMS, n_estimators=N_ESTIMATORS)
    model.fit(X_train, y_train)

    proba = model.predict_proba(X_train[FEAT_COLS])[:, 1]

    for thresh in thresholds:
        mask = proba >= thresh
        n_signals = mask.sum()

        if n_signals < 20:
            print(f'  {thresh:.2f}      {n_signals:>4}   -      -      -       -       -')
            continue

        # Simular trades con este threshold
        trades = []
        for i, (_, row) in enumerate(train.iterrows()):
            if not mask[i]:
                continue
            pnl_raw = row['tp_pct'] if row['label'] == 1 else -row['sl_pct']
            pnl = pnl_raw - COST
            trades.append({
                'time': row['trade_time'],
                'ob_type': row['ob_type'],
                'score': round(float(proba[i]), 3),
                'label': int(row['label']),
                'pnl': round(pnl, 6),
                'exit': 'TP' if row['label'] == 1 else 'SL',
            })

        m = calc_metrics(trades, f'thresh_{thresh}')
        results.append({
            'threshold': thresh,
            'trades': m['trades'],
            'wr': m['wr'],
            'pf': m['pf'],
            'total_pnl': m['total_pnl'],
            'sharpe': m['sharpe'],
            'cagr': m['cagr'],
            'maxDD': m['maxDD'],
        })

        print(f'  {thresh:.2f}      {m["trades"]:>4}  {m["wr"]:>5.1f}%  {m["pf"]:>5.2f}  '
              f'{m["total_pnl"]:>6.1f}%  {m["sharpe"]:>6.2f}  {m["cagr"]:>6.1f}%')

    # Recomendar threshold óptimo (max Sharpe * trades)
    if results:
        optimal = max(results, key=lambda r: r['sharpe'] * np.log(r['trades'] + 1))
        print(f'\n  Threshold óptimo recomendado: {optimal["threshold"]:.2f}')
        print(f'    -> Sharpe {optimal["sharpe"]:.2f}, {optimal["trades"]} trades, WR {optimal["wr"]:.1f}%')

    return results

# ─── WALK-FORWARD ─────────────────────────────────────────────────────────────

def run_wfa(ob_df: pd.DataFrame, asset: str) -> tuple[list, list]:
    print(f'\n  Dataset: {len(ob_df):,} OBs | TP rate: {ob_df["label"].mean():.1%} | '
          f'BULL: {(ob_df["ob_type"]=="BULL").mean():.1%}')

    all_test_trades = []
    window_results  = []

    for win in WFA_WINDOWS:
        ts  = win['train_start']
        te  = win['train_end']
        tes = win['test_end']

        train = ob_df[(ob_df['trade_time'] >= ts) & (ob_df['trade_time'] < te)].dropna(subset=FEAT_COLS)
        test  = ob_df[(ob_df['trade_time'] >= te) & (ob_df['trade_time'] < tes)].dropna(subset=FEAT_COLS)

        if len(train) < 80 or len(test) < 15:
            print(f'  {win["id"]}: datos insuficientes (train={len(train)}, test={len(test)})')
            continue

        # Entrenar
        model = lgb.LGBMClassifier(**LGB_PARAMS, n_estimators=N_ESTIMATORS)
        model.fit(
            train[FEAT_COLS], train['label'],
            eval_set=[(test[FEAT_COLS], test['label'])],
            callbacks=[lgb.early_stopping(EARLY_STOP, verbose=False),
                       lgb.log_evaluation(-1)]
        )

        proba = model.predict_proba(test[FEAT_COLS])[:, 1]

        # AUC
        try:
            auc = roc_auc_score(test['label'], proba)
        except Exception:
            auc = 0.5

        # Simular trades OOS (threshold FIJO 0.55 — baseline)
        trades = simulate_trades(test, proba, SCORE_THRESH)
        for t in trades:
            t['asset']  = asset
            t['window'] = win['id']
        all_test_trades.extend(trades)

        m = calc_metrics(trades, win['id'])
        n_scored = sum(1 for p in proba if p >= SCORE_THRESH)

        print(f'  {win["id"]} | train={len(train)} | test={len(test)} | '
              f'scored={n_scored} | AUC={auc:.3f} | '
              f'trades={m["trades"]} | WR={m["wr"]}% | PF={m["pf"]} | '
              f'PnL={m["total_pnl"]}%')

        # Feature importance top 5
        fi = pd.Series(model.feature_importances_, index=FEAT_COLS).sort_values(ascending=False)
        print(f'    Top features: {", ".join(fi.head(5).index.tolist())}')

        window_results.append({
            'window': win['id'],
            'train':  len(train),
            'test':   len(test),
            'n_scored': n_scored,
            'auc':    round(auc, 3),
            **{k: v for k, v in m.items() if k != 'by_day' and k != 'label'},
        })

    return all_test_trades, window_results

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def print_metrics(m: dict):
    if not m or m.get('trades', 0) == 0:
        print('    Sin trades')
        return
    print(f'    Trades       : {m["trades"]}')
    print(f'    Win Rate     : {m["wr"]}%')
    print(f'    Profit Factor: {m["pf"]}')
    print(f'    Avg Trade    : {m["avg_trade"]}%')
    print(f'    Total PnL    : {m["total_pnl"]}%')
    print(f'    CAGR (4y)    : {m["cagr"]}%')
    print(f'    Max DD       : {m["maxDD"]}%')
    print(f'    Sharpe       : {m["sharpe"]}')
    print(f'    Sortino      : {m["sortino"]}')
    print(f'    Calmar       : {m["calmar"]}')
    print(f'    Half-Kelly   : {m["kelly_half"]}% del capital')

def main():
    print('\nLightGBM OB Trading System')
    print('='*65)
    print(f'  Score threshold : {SCORE_THRESH} (FIJO — baseline)')
    print(f'  R:R             : {SL_ATR_MULT}x SL | {TP_ATR_MULT}x TP')
    print(f'  Costo por trade : {COST*100}%')
    print('  Features        : 15 originales (baseline)')
    print('  NOTA            : Fase 1-2 REVERTIDA — ver documentación')

    # Cargar activos disponibles
    loaded_assets = []
    for symbol, fname in ASSETS:
        fpath = DATA_DIR / fname
        if fpath.exists():
            df = load_data(fpath)
            loaded_assets.append((symbol, df))
            print(f'  {symbol}: {len(df):,} barras')
        else:
            print(f'  {symbol}: no encontrado ({fname}) — omitido')

    if not loaded_assets:
        print('ERROR: Sin datos'); return

    all_results = {}
    all_portfolio_trades = []

    for symbol, df in loaded_assets:
        print(f'\n{"="*65}')
        print(f'ACTIVO: {symbol}')
        print('='*65)

        print('  Detectando OBs...')
        obs = detect_obs(df)
        print(f'  OBs: {len(obs):,} (BULL: {sum(1 for o in obs if o["type"]=="BULL"):,} | BEAR: {sum(1 for o in obs if o["type"]=="BEAR"):,})')

        print('  Etiquetando y extrayendo features...')
        ob_df = build_ob_dataset(df, obs)
        print(f'  OBs tocados y etiquetados: {len(ob_df):,}')

        if len(ob_df) < 100:
            print('  Muy pocos OBs — omitiendo activo')
            continue

        print('\n  Walk-Forward Analysis:')
        trades, win_results = run_wfa(ob_df, symbol)

        print(f'\n  Metricas OOS acumuladas ({symbol}):')
        m = calc_metrics(trades, symbol)
        print_metrics(m)

        all_results[symbol] = {'window_results': win_results, 'metrics': m}
        all_portfolio_trades.extend(trades)

    # ─── PORTFOLIO MULTI-ACTIVO ──────────────────────────────────────────────
    if len(loaded_assets) > 1 and all_portfolio_trades:
        print(f'\n{"="*65}')
        print('PORTFOLIO MULTI-ACTIVO (todos los activos combinados)')
        print('='*65)
        all_portfolio_trades.sort(key=lambda t: t['time'])
        mp = calc_metrics(all_portfolio_trades, 'Portfolio')
        print_metrics(mp)
        all_results['portfolio'] = mp

    # ─── CALIBRACIÓN DE THRESHOLD (Sesión B) ─────────────────────────────────
    print(f'\n{"="*65}')
    print('CALIBRACIÓN DE THRESHOLD — Sesión B')
    print('='*65)

    all_threshold_results = {}
    for symbol, df in loaded_assets:
        if symbol not in all_results:
            continue
        ob_df = build_ob_dataset(df, detect_obs(df)).dropna()
        if len(ob_df) < 200:
            continue
        thresh_results = calibrate_threshold(ob_df, [0.55, 0.60, 0.65], symbol)
        all_threshold_results[symbol] = thresh_results

    # ─── COMPARATIVA FINAL ───────────────────────────────────────────────────
    print(f'\n{"="*65}')
    print('COMPARATIVA vs BASELINE')
    print('='*65)
    print(f'  OB+FVG v1 (sin filtro) | WR 39.4% | PF 0.738 | 0/4 ventanas')
    print(f'  OB+FVG v3 (JS scorer)  | WR 37.8% | PF 0.738 | 0/4 ventanas')

    for symbol in all_results:
        if symbol == 'portfolio':
            m = all_results[symbol]
            print(f'  Portfolio multi-activo | WR {m["wr"]}% | PF {m["pf"]} | Sharpe {m["sharpe"]}')
        else:
            m = all_results[symbol].get('metrics', {})
            wr = all_results[symbol].get('window_results', [])
            ok = sum(1 for r in wr if r.get('pf', 0) > 1.0 and r.get('trades', 0) >= 10)
            print(f'  LGB OB System {symbol:<4} | WR {m.get("wr","?")}% | PF {m.get("pf","?")} | {ok}/{len(wr)} ventanas OK')

    # ─── GUARDAR ─────────────────────────────────────────────────────────────
    def serialize(obj):
        if isinstance(obj, dict):
            return {k: serialize(v) for k, v in obj.items() if k != 'by_day'}
        if isinstance(obj, (np.integer, np.int64)): return int(obj)
        if isinstance(obj, (np.floating, np.float64)): return float(obj)
        if isinstance(obj, pd.Timestamp): return str(obj)
        return obj

    output = {
        'run_date': datetime.now().isoformat(),
        'config': {'score_threshold': SCORE_THRESH, 'sl_atr': SL_ATR_MULT,
                   'tp_atr': TP_ATR_MULT, 'cost': COST},
        'results': serialize(all_results),
        'total_portfolio_trades': len(all_portfolio_trades),
    }
    out_path = RESULTS_DIR / 'lgbm_ob_trading_system.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2, default=str)
    print(f'\nResultados guardados: {out_path}')

if __name__ == '__main__':
    main()
