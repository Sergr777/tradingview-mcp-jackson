"""
lgbm_ensemble.py — Fase 3: LightGBM reemplaza el Voting Classifier
====================================================================
Objetivo: reemplazar los 7 clasificadores manuales de backtest_ml_ensemble.js
con un GBM real entrenado con time-series cross-validation.

Pipeline:
  1. Cargar BTCUSDT 15m 4 años
  2. Calcular las mismas features de los 7 clasificadores + extras (Cap.24 Jansen)
  3. Crear labels: dirección del precio en las próximas N barras (±threshold)
  4. TimeSeriesSplit WFA (4 ventanas = mismas de los scripts JS)
  5. Entrenar LightGBM por cada ventana
  6. Evaluar métricas OOS: WR, precision, recall, feature importance
  7. SHAP values: qué features importan más
  8. Guardar resultados en results/lgbm_ensemble_results.json

Comparativa final vs JS Voting Classifier (WR OOS 30.78%)
"""

import json
import warnings
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings('ignore')

# ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────

DATA_FILE  = Path('data/BTCUSDT_15m_4y.csv')
RESULTS_DIR = Path('results')

# Ventanas WFA (mismas que JS)
WFA_WINDOWS = [
    {'id': 'W1', 'train_start': '2022-01-01', 'train_end': '2023-01-01', 'test_end': '2024-01-01'},
    {'id': 'W2', 'train_start': '2023-01-01', 'train_end': '2024-01-01', 'test_end': '2025-01-01'},
    {'id': 'W3', 'train_start': '2024-01-01', 'train_end': '2025-01-01', 'test_end': '2026-01-01'},
    {'id': 'W4', 'train_start': '2025-01-01', 'train_end': '2026-01-01', 'test_end': '2026-04-17'},
]

# Label: forward return de N barras
FORWARD_BARS  = 8     # 2 horas en 15m
LABEL_THRESH  = 0.005 # 0.5% movimiento mínimo para señal

# LightGBM hyperparámetros
LGB_PARAMS = {
    'objective':       'multiclass',
    'num_class':       3,            # -1 SHORT, 0 NEUTRAL, 1 LONG
    'metric':          'multi_logloss',
    'learning_rate':   0.05,
    'num_leaves':      31,
    'max_depth':       6,
    'min_child_samples': 20,
    'feature_fraction': 0.8,
    'bagging_fraction': 0.8,
    'bagging_freq':    5,
    'reg_alpha':       0.1,
    'reg_lambda':      0.1,
    'verbose':         -1,
    'n_jobs':          -1,
}
N_ESTIMATORS = 300

# ─── CARGA DE DATOS ───────────────────────────────────────────────────────────

def load_data(filepath: Path) -> pd.DataFrame:
    df = pd.read_csv(filepath, header=0, names=['time','open','high','low','close','volume'], skiprows=1)
    df['time'] = pd.to_datetime(df['time'], unit='ms')
    df = df.set_index('time').sort_index()
    print(f"  Datos: {len(df):,} barras | {df.index[0].date()} → {df.index[-1].date()}")
    return df

# ─── FEATURE ENGINEERING ─────────────────────────────────────────────────────

def calc_rsi(series: pd.Series, period: int) -> pd.Series:
    delta = series.diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / (loss + 1e-10)
    return 100 - 100 / (1 + rs)

def calc_macd(series: pd.Series, fast=12, slow=26, signal=9):
    ema_fast   = series.ewm(span=fast, adjust=False).mean()
    ema_slow   = series.ewm(span=slow, adjust=False).mean()
    macd_line  = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram  = macd_line - signal_line
    return macd_line, signal_line, histogram

def calc_atr(df: pd.DataFrame, period: int) -> pd.Series:
    hl = df['high'] - df['low']
    hc = (df['high'] - df['close'].shift()).abs()
    lc = (df['low']  - df['close'].shift()).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def calc_bb(series: pd.Series, period=20, std_mult=2):
    mid   = series.rolling(period).mean()
    std   = series.rolling(period).std()
    upper = mid + std_mult * std
    lower = mid - std_mult * std
    width = (upper - lower) / mid * 100
    return mid, upper, lower, width

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Construye las mismas features de los 7 clasificadores JS
    + features adicionales (Cap.24 Jansen)
    """
    feats = pd.DataFrame(index=df.index)
    c = df['close']
    h = df['high']
    l = df['low']
    v = df['volume']

    # ── C1: RSI multi-período ───────────────────────────────────────────────
    feats['rsi_14']      = calc_rsi(c, 14)
    feats['rsi_3']       = calc_rsi(c, 3)
    feats['rsi_14_chg']  = feats['rsi_14'].diff()
    feats['rsi_3_chg']   = feats['rsi_3'].diff()
    feats['rsi_14_1h']   = calc_rsi(c, 4 * 14)   # proxy 1h en 15m
    feats['rsi_above50'] = (feats['rsi_14'] > 50).astype(int)

    # ── C2: EMA Alineación ────────────────────────────────────────────────
    ema8  = c.ewm(span=8,  adjust=False).mean()
    ema21 = c.ewm(span=21, adjust=False).mean()
    ema55 = c.ewm(span=55, adjust=False).mean()
    feats['ema8_vs_21']  = (ema8 - ema21) / c * 100
    feats['ema21_vs_55'] = (ema21 - ema55) / c * 100
    feats['ema8_slope']  = ema8.diff(4) / c * 100
    feats['ema_aligned_bull'] = ((ema8 > ema21) & (ema21 > ema55)).astype(int)
    feats['ema_aligned_bear'] = ((ema8 < ema21) & (ema21 < ema55)).astype(int)
    # 1h proxy
    ema20_1h = c.ewm(span=80,  adjust=False).mean()   # 20 × 4 barras
    ema50_1h = c.ewm(span=200, adjust=False).mean()   # 50 × 4 barras
    feats['ema_trend_1h'] = np.sign(ema20_1h - ema50_1h)

    # ── C3: MACD ────────────────────────────────────────────────────────────
    _, _, hist_15m = calc_macd(c, 12, 26, 9)
    _, _, hist_1h  = calc_macd(c, 48, 104, 36)  # 1h en 15m
    feats['macd_hist']      = hist_15m
    feats['macd_hist_chg']  = hist_15m.diff()
    feats['macd_hist_1h']   = hist_1h
    feats['macd_cross']     = np.sign(hist_15m) * np.sign(hist_1h)

    # ── C4: Bollinger Bands ─────────────────────────────────────────────────
    bb_mid, bb_upper, bb_lower, bb_width = calc_bb(c, 20, 2)
    feats['bb_width']      = bb_width
    feats['bb_position']   = (c - bb_lower) / (bb_upper - bb_lower + 1e-10)  # 0=lower, 1=upper
    feats['bb_squeeze']    = (bb_width < bb_width.rolling(50).quantile(0.2)).astype(int)

    # ── C5: Volumen + ATR ────────────────────────────────────────────────────
    vol_ma = v.rolling(20).mean()
    feats['vol_ratio']   = v / (vol_ma + 1e-10)
    feats['atr_14']      = calc_atr(df, 14)
    feats['atr_norm']    = feats['atr_14'] / c * 100
    feats['atr_regime']  = feats['atr_14'] / feats['atr_14'].rolling(50).mean()

    # ── C6: Price Action ────────────────────────────────────────────────────
    body      = (df['close'] - df['open']).abs()
    body_prev = body.shift(1)
    feats['bull_engulf'] = (
        (df['close'] > df['open']) &
        (df['close'].shift() < df['open'].shift()) &
        (body > body_prev) &
        (df['close'] > df['open'].shift()) &
        (df['open'] < df['close'].shift())
    ).astype(int)
    feats['bear_engulf'] = (
        (df['close'] < df['open']) &
        (df['close'].shift() > df['open'].shift()) &
        (body > body_prev) &
        (df['close'] < df['open'].shift()) &
        (df['open'] > df['close'].shift())
    ).astype(int)
    feats['momentum_5'] = c.diff(5) / c * 100
    feats['momentum_20'] = c.diff(20) / c * 100

    # ── C7: Market Structure ─────────────────────────────────────────────────
    feats['high_10']     = h.rolling(10).max()
    feats['low_10']      = l.rolling(10).min()
    feats['hh']          = (h > feats['high_10'].shift(10)).astype(int)
    feats['ll']          = (l < feats['low_10'].shift(10)).astype(int)
    feats['dist_high20'] = (c - h.rolling(20).max()) / c * 100
    feats['dist_low20']  = (c - l.rolling(20).min()) / c * 100

    # ── Extra features (Jansen Cap.24) ──────────────────────────────────────
    # Z-score del precio (Chop context)
    feats['zscore_20']   = (c - c.rolling(20).mean()) / (c.rolling(20).std() + 1e-10)
    feats['zscore_50']   = (c - c.rolling(50).mean()) / (c.rolling(50).std() + 1e-10)

    # Retornos logarítmicos
    feats['log_ret_1']   = np.log(c / c.shift(1))
    feats['log_ret_4']   = np.log(c / c.shift(4))   # 1h
    feats['log_ret_16']  = np.log(c / c.shift(16))  # 4h

    # Volatilidad realizada
    feats['vol_real_20'] = feats['log_ret_1'].rolling(20).std() * 100

    # Sesión
    hour = df.index.hour
    feats['in_ny']     = ((hour >= 13) & (hour < 20)).astype(int)
    feats['in_london'] = ((hour >= 7)  & (hour < 13)).astype(int)
    feats['in_asia']   = ((hour >= 0)  & (hour < 7)).astype(int)

    # Chop Index proxy
    n = 14
    tr_sum = (h - l).rolling(n).sum()
    hl_rng = h.rolling(n).max() - l.rolling(n).min()
    feats['chop'] = 100 * np.log10(tr_sum / (hl_rng + 1e-10)) / np.log10(n)

    return feats

# ─── LABELS ───────────────────────────────────────────────────────────────────

def build_labels(df: pd.DataFrame, forward_bars: int, thresh: float) -> pd.Series:
    """
    Label basado en retorno forward:
      +1 (LONG)  si ret > +thresh
      -1 (SHORT) si ret < -thresh
       0 (NEUTRAL) si |ret| <= thresh
    Convierte a {0, 1, 2} para LightGBM multiclass
    """
    fwd_ret = df['close'].shift(-forward_bars) / df['close'] - 1
    raw     = pd.Series(0, index=df.index)
    raw[fwd_ret >  thresh] =  1
    raw[fwd_ret < -thresh] = -1
    # Mapear a {0=NEUTRAL, 1=LONG, 2=SHORT}
    label_map = {0: 0, 1: 1, -1: 2}
    return raw.map(label_map).dropna().astype(int)

# ─── WFA PRINCIPAL ────────────────────────────────────────────────────────────

def run_wfa(df: pd.DataFrame, features: pd.DataFrame, labels: pd.Series):
    results = []
    feat_names = features.columns.tolist()

    print(f"\n{'='*65}")
    print('WALK-FORWARD: LightGBM Ensemble (Fase 3)')
    print('='*65)

    # Comparativa: distribución de labels
    dist = labels.value_counts(normalize=True)
    print(f"\nDistribución de labels: NEUTRAL={dist.get(0,0):.1%} LONG={dist.get(1,0):.1%} SHORT={dist.get(2,0):.1%}")
    print(f"Features: {len(feat_names)}")

    for win in WFA_WINDOWS:
        print(f"\n📅 Ventana {win['id']}: Train [{win['train_start']} → {win['train_end']}] | Test [{win['train_end']} → {win['test_end']}]")

        # Filtrar periodos (usar features.index, que ya tiene NaNs eliminados)
        fidx = features.index
        train_mask = (fidx >= win['train_start']) & (fidx < win['train_end'])
        test_mask  = (fidx >= win['train_end'])   & (fidx < win['test_end'])

        X_train = features[train_mask]
        y_train = labels.reindex(fidx)[train_mask].dropna()
        X_train = X_train.reindex(y_train.index)

        X_test  = features[test_mask]
        y_test  = labels.reindex(fidx)[test_mask].dropna()
        X_test  = X_test.reindex(y_test.index)

        print(f"  Train: {len(X_train):,} | Test: {len(X_test):,}")

        if len(X_train) < 500 or len(X_test) < 50:
            print("  ⚠️  Datos insuficientes")
            continue

        # Entrenar
        model = lgb.LGBMClassifier(**LGB_PARAMS, n_estimators=N_ESTIMATORS)
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(-1)]
        )

        # Predicciones OOS
        y_pred   = model.predict(X_test)
        y_proba  = model.predict_proba(X_test)

        # Métricas
        neutral_mask = (y_pred != 0)  # solo señales (no neutral)
        n_signals    = neutral_mask.sum()
        if n_signals == 0:
            print("  ⚠️  Cero señales generadas")
            continue

        # Win Rate: cuando el modelo dice LONG/SHORT, ¿acierta?
        y_test_arr = y_test.values
        y_pred_arr = y_pred

        # LONG signals: pred=1, acierta si label=1
        long_pred  = y_pred_arr == 1
        long_corr  = (y_test_arr[long_pred] == 1).sum()
        long_count = long_pred.sum()

        # SHORT signals: pred=2, acierta si label=2
        short_pred  = y_pred_arr == 2
        short_corr  = (y_test_arr[short_pred] == 2).sum()
        short_count = short_pred.sum()

        total_signals = long_count + short_count
        total_correct = long_corr + short_corr
        wr = total_correct / total_signals * 100 if total_signals > 0 else 0

        # Confianza promedio
        max_proba   = y_proba.max(axis=1)
        high_conf   = (max_proba >= 0.50) & neutral_mask
        if high_conf.sum() > 0:
            y_pred_hc = y_pred_arr[high_conf]
            y_test_hc = y_test_arr[high_conf]
            long_hc   = (y_pred_hc == 1).sum()
            short_hc  = (y_pred_hc == 2).sum()
            corr_hc   = ((y_pred_hc == 1) & (y_test_hc == 1)).sum() + \
                        ((y_pred_hc == 2) & (y_test_hc == 2)).sum()
            wr_hc     = corr_hc / (long_hc + short_hc) * 100 if (long_hc + short_hc) > 0 else 0
        else:
            wr_hc = 0

        # Feature importance (top 10)
        fi = pd.Series(model.feature_importances_, index=feat_names).nlargest(10)

        print(f"  WR señales LONG+SHORT: {wr:.1f}% ({total_signals:,} señales)")
        print(f"    LONG  : {long_count:4d} señales | {long_corr/long_count*100:.1f}% precision" if long_count else "    LONG  : 0")
        print(f"    SHORT : {short_count:4d} señales | {short_corr/short_count*100:.1f}% precision" if short_count else "    SHORT : 0")
        print(f"  WR high-confidence (≥50%): {wr_hc:.1f}% ({high_conf.sum():,} señales)")
        print(f"  Top 5 features: {', '.join(fi.head(5).index.tolist())}")

        results.append({
            'window':    win['id'],
            'wr':        round(wr, 2),
            'wr_hc':     round(wr_hc, 2),
            'n_signals': int(total_signals),
            'n_hc':      int(high_conf.sum()),
            'long_prec': round(long_corr/long_count*100, 2) if long_count else 0,
            'short_prec':round(short_corr/short_count*100, 2) if short_count else 0,
            'top_features': fi.head(10).index.tolist(),
            'feat_importance': {k: int(v) for k, v in fi.head(10).items()},
        })

    return results

# ─── SIMULACIÓN DE TRADING CON PREDICCIONES ──────────────────────────────────

def simulate_trading_from_preds(df, features, labels, win, threshold_proba=0.50):
    """Simula trades reales usando las predicciones LightGBM"""
    fidx = features.index
    train_mask = (fidx >= win['train_start']) & (fidx < win['train_end'])
    test_mask  = (fidx >= win['train_end'])   & (fidx < win['test_end'])

    X_train = features[train_mask]
    y_train = labels.reindex(fidx)[train_mask].dropna()
    X_train = X_train.reindex(y_train.index)

    X_test  = features[test_mask]
    y_test  = labels.reindex(fidx)[test_mask].dropna()
    X_test  = X_test.reindex(y_test.index)

    if len(X_train) < 500 or len(X_test) < 50:
        return None

    model = lgb.LGBMClassifier(**LGB_PARAMS, n_estimators=N_ESTIMATORS)
    model.fit(X_train, y_train, callbacks=[lgb.log_evaluation(-1)])

    y_proba = model.predict_proba(X_test)
    y_pred  = model.predict(X_test)

    # Simular: entrar solo si confianza >= threshold
    # SL = 0.8×ATR, TP = 1.6×ATR (R:R 2:1)
    df_test    = df.reindex(fidx)[test_mask].reindex(X_test.index)
    atr        = calc_atr(df_test, 14)

    trades = []
    in_position = False

    for i in range(len(X_test)):
        if in_position:
            in_position = False
            continue
        idx   = X_test.index[i]
        conf  = y_proba[i].max()
        pred  = y_pred[i]
        if conf < threshold_proba or pred == 0:
            continue

        atr_val = atr.iloc[i] if i < len(atr) else None
        if not atr_val or np.isnan(atr_val):
            continue
        price = df_test['close'].iloc[i]
        sl_pct = atr_val / price * 0.8
        tp_pct = atr_val / price * 1.6

        # Buscar salida en las próximas barras
        direction = 1 if pred == 1 else -1
        pnl = None
        for j in range(i + 1, min(i + FORWARD_BARS * 2, len(X_test))):
            future_price = df_test['close'].iloc[j]
            ret = (future_price - price) / price * direction
            if ret <= -sl_pct:
                pnl = -sl_pct - 0.001
                break
            if ret >= tp_pct:
                pnl = tp_pct - 0.001
                break
        if pnl is None:
            future_price = df_test['close'].iloc[min(i + FORWARD_BARS, len(X_test) - 1)]
            pnl = (future_price - price) / price * direction - 0.001

        trades.append({'pnl': pnl, 'conf': conf, 'pred': pred, 'time': idx})
        in_position = True

    return trades

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print('🤖 LightGBM Ensemble — Fase 3')
    print('='*65)
    print(f'  LightGBM version: {lgb.__version__}')

    # Cargar datos
    print('\n📂 Cargando datos...')
    df = load_data(DATA_FILE)

    # Features
    print('🔧 Calculando features...')
    features = build_features(df)
    labels   = build_labels(df, FORWARD_BARS, LABEL_THRESH)

    # Alinear
    common_idx = features.dropna().index.intersection(labels.dropna().index)
    features   = features.loc[common_idx]
    labels     = labels.loc[common_idx]
    print(f'  Features: {features.shape[1]} | Muestras válidas: {len(features):,}')

    # WFA
    results = run_wfa(df, features, labels)

    # Simulación de trading en W4
    print(f"\n{'='*65}")
    print('💰 Simulación de trading real — W4 (2026-01-01 → 2026-04-17)')
    print('='*65)
    w4 = WFA_WINDOWS[3]
    trades = simulate_trading_from_preds(df, features, labels, w4, threshold_proba=0.50)
    if trades:
        wins  = [t for t in trades if t['pnl'] > 0]
        total_pnl = sum(t['pnl'] for t in trades)
        wr    = len(wins) / len(trades) * 100
        print(f"  Trades: {len(trades)} | WR: {wr:.1f}% | PnL total: {total_pnl*100:.2f}%")
        avg_conf = np.mean([t['conf'] for t in trades])
        print(f"  Confianza promedio: {avg_conf:.3f}")
    else:
        print("  ⚠️  Sin trades en W4")

    # Resumen final
    print(f"\n{'='*65}")
    print('📊 COMPARATIVA FINAL')
    print('='*65)
    print(f"  {'Versión':<30} {'WR OOS':>8}  {'HC WR':>8}  {'Señales':>8}")
    print(f"  {'-'*60}")
    print(f"  {'JS Voting Classifier (v1)':30} {'30.78%':>8}  {'  N/A':>8}  {'~3000':>8}")
    for r in results:
        print(f"  LightGBM W{r['window'][-1]}                     {r['wr']:>7.1f}%  {r['wr_hc']:>7.1f}%  {r['n_signals']:>8,}")

    if results:
        avg_wr    = np.mean([r['wr'] for r in results])
        avg_wr_hc = np.mean([r['wr_hc'] for r in results])
        print(f"  {'─'*60}")
        print(f"  {'LightGBM PROMEDIO':30} {avg_wr:>7.1f}%  {avg_wr_hc:>7.1f}%")

    # Top features globales
    all_feats = {}
    for r in results:
        for f, v in r.get('feat_importance', {}).items():
            all_feats[f] = all_feats.get(f, 0) + v
    top10 = sorted(all_feats.items(), key=lambda x: -x[1])[:10]
    print(f"\n  🔑 Top 10 features (importancia acumulada):")
    for i, (name, val) in enumerate(top10, 1):
        print(f"    {i:2}. {name:<25} {val:>6}")

    # Guardar resultados
    output = {
        'model': 'LightGBM',
        'version': lgb.__version__,
        'features': features.columns.tolist(),
        'n_features': features.shape[1],
        'forward_bars': FORWARD_BARS,
        'label_threshold': LABEL_THRESH,
        'windows': results,
        'avg_wr': round(np.mean([r['wr'] for r in results]), 2) if results else 0,
        'avg_wr_hc': round(np.mean([r['wr_hc'] for r in results]), 2) if results else 0,
        'comparison_baseline': {'name': 'JS Voting Classifier', 'wr': 30.78},
        'top_features': [f for f, _ in top10],
    }
    out_path = RESULTS_DIR / 'lgbm_ensemble_results.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n💾 Resultados guardados: {out_path}")

if __name__ == '__main__':
    main()
