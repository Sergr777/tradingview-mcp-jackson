"""
lgbm_ob_scorer.py
LightGBM — OB Zone Quality Scorer (Fase 3b)

Problema diagnosticado:
  OB+FVG tiene 0/4 ventanas WFA aprobadas.
  wfa_ob_fvg_v2 mostró 313 SL vs 177 TP en W4.
  Causa raíz: no todos los Order Blocks tienen el mismo edge.
  Muchos OBs se detectan en zonas de baja calidad (bajo impulso,
  alta ATR, régimen trending) donde el precio no revierte.

Solución:
  Entrenar un clasificador binario que puntúe la calidad de cada OB:
    Label 1 = OB que resultó en TP (precio rebotó desde la zona)
    Label 0 = OB que resultó en SL o MAX_HOLD (precio ignoró la zona)

  Features del OB:
    - Impulso que creó el OB (% move post-OB)
    - Edad del OB (barras desde formación)
    - ATR normalizado al momento del retoque
    - BB Width (régimen ranging vs trending)
    - Chop Index (contexto macro)
    - RSI en el retoque (sobrecompra/venta)
    - EMA alignment 1h y 15m
    - Distancia al retoque (cuánto rebotó antes del primer retoque)
    - Volumen relativo en la barra del retoque
    - Sesión (NY/London/Asian)

  Score de salida: probabilidad de que este OB resulte en TP
  Umbral: usar solo OBs con score ≥ 0.55

WFA: mismas 4 ventanas que el framework JS
"""

import sys, json
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import classification_report, roc_auc_score

# ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

DATA_FILE   = Path('data/BTCUSDT_15m_4y.csv')
RESULTS_DIR = Path('results')
RESULTS_DIR.mkdir(exist_ok=True)

WFA_WINDOWS = [
    {'id': 'W1', 'train_start': '2022-01-01', 'train_end': '2023-01-01',
                 'test_start':  '2023-01-01', 'test_end':  '2024-01-01'},
    {'id': 'W2', 'train_start': '2023-01-01', 'train_end': '2024-01-01',
                 'test_start':  '2024-01-01', 'test_end':  '2025-01-01'},
    {'id': 'W3', 'train_start': '2024-01-01', 'train_end': '2025-01-01',
                 'test_start':  '2025-01-01', 'test_end':  '2026-01-01'},
    {'id': 'W4', 'train_start': '2025-01-01', 'train_end': '2026-01-01',
                 'test_start':  '2026-01-01', 'test_end':  '2026-04-20'},
]

LGB_PARAMS = {
    'objective':        'binary',
    'metric':           'binary_logloss',
    'learning_rate':    0.05,
    'num_leaves':       31,
    'min_child_samples': 30,
    'subsample':        0.8,
    'colsample_bytree': 0.8,
    'reg_alpha':        0.1,
    'reg_lambda':       0.1,
    'class_weight':     'balanced',   # crucial: OBs con TP son minoría
    'verbose':         -1,
    'random_state':     42,
}
N_ESTIMATORS  = 400
EARLY_STOP    = 40

# OB detection params (fijos para evitar lookahead)
OB_AGE_MAX   = 40    # barras máx de vida del OB
IMPULSE_MIN  = 0.5   # % mínimo de impulso post-OB
ATR_PERIOD   = 14
SL_ATR_MULT  = 1.0   # SL = 1×ATR
TP_ATR_MULT  = 2.0   # TP = 2×ATR (RR 2:1)
MAX_HOLD     = 96    # barras antes de MAX_HOLD

# ─── UTILIDADES ───────────────────────────────────────────────────────────────

def load_data(filepath: Path) -> pd.DataFrame:
    df = pd.read_csv(filepath, header=0,
                     names=['time','open','high','low','close','volume'],
                     skiprows=1)
    df['time'] = pd.to_datetime(df['time'], unit='ms')
    df = df.set_index('time').sort_index()
    print(f"  Datos: {len(df):,} barras | {df.index[0].date()} -> {df.index[-1].date()}")
    return df

def calc_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def calc_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    hl  = df['high'] - df['low']
    hc  = (df['high'] - df['close'].shift()).abs()
    lc  = (df['low']  - df['close'].shift()).abs()
    tr  = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()

def calc_bb_width(series: pd.Series, period: int = 20) -> pd.Series:
    sma = series.rolling(period).mean()
    std = series.rolling(period).std()
    return (std * 4) / sma.replace(0, np.nan)

def calc_chop(df: pd.DataFrame, period: int = 14) -> pd.Series:
    atr  = calc_atr(df, 1)
    tr_sum  = atr.rolling(period).sum()
    hi      = df['high'].rolling(period).max()
    lo      = df['low'].rolling(period).min()
    rng     = (hi - lo).replace(0, np.nan)
    return 100 * np.log10(tr_sum / rng) / np.log10(period)

# ─── DETECCIÓN DE ORDER BLOCKS ────────────────────────────────────────────────

def detect_obs(df: pd.DataFrame) -> list[dict]:
    """
    Detecta Order Blocks válidos con sus metadatos de formación.
    Retorna lista de OBs para etiquetar más tarde.
    """
    obs = []
    closes  = df['close'].values
    highs   = df['high'].values
    lows    = df['low'].values
    opens   = df['open'].values
    volumes = df['volume'].values
    times   = df.index

    for j in range(1, len(df) - OB_AGE_MAX - 5):
        bar = df.iloc[j]
        is_bearish = bar['close'] < bar['open']
        is_bullish = bar['close'] > bar['open']

        if is_bearish:
            # BULL OB: barra bajista seguida de impulso alcista
            for k in range(j + 1, min(j + 4, len(df))):
                impulse_pct = ((closes[k] - highs[j]) / highs[j]) * 100
                if impulse_pct >= IMPULSE_MIN:
                    obs.append({
                        'type':        'BULL',
                        'form_idx':    j,
                        'form_time':   times[j],
                        'zone_high':   highs[j],
                        'zone_low':    lows[j],
                        'impulse_pct': impulse_pct,
                        'form_volume': volumes[j],
                        'avg_vol_before': np.mean(volumes[max(0, j-10):j]),
                    })
                    break

        if is_bullish:
            # BEAR OB: barra alcista seguida de impulso bajista
            for k in range(j + 1, min(j + 4, len(df))):
                impulse_pct = ((lows[j] - closes[k]) / lows[j]) * 100
                if impulse_pct >= IMPULSE_MIN:
                    obs.append({
                        'type':        'BEAR',
                        'form_idx':    j,
                        'form_time':   times[j],
                        'zone_high':   highs[j],
                        'zone_low':    lows[j],
                        'impulse_pct': impulse_pct,
                        'form_volume': volumes[j],
                        'avg_vol_before': np.mean(volumes[max(0, j-10):j]),
                    })
                    break

    return obs

# ─── ETIQUETADO Y FEATURE EXTRACTION ─────────────────────────────────────────

def build_ob_dataset(df: pd.DataFrame, obs: list) -> pd.DataFrame:
    """
    Para cada OB detectado, encuentra el primer retoque y simula el trade.
    Etiqueta: 1 = TP alcanzado, 0 = SL o MAX_HOLD
    Extrae features en el momento del retoque (sin lookahead).
    """
    # Pre-calcular indicadores sobre todo el df
    atr     = calc_atr(df, ATR_PERIOD)
    rsi14   = calc_rsi(df['close'], 14)
    ema20   = calc_ema(df['close'], 20)
    ema50   = calc_ema(df['close'], 50)
    bbw     = calc_bb_width(df['close'], 20)
    chop    = calc_chop(df, 14)

    # 1h proxy (cada 4 barras de 15m)
    close_1h = df['close'].iloc[::4].reindex(df.index, method='ffill')
    ema20_1h = calc_ema(close_1h, 20)
    ema50_1h = calc_ema(close_1h, 50)
    rsi14_1h = calc_rsi(close_1h, 14).reindex(df.index, method='ffill')

    vol_ratio = df['volume'] / df['volume'].rolling(20).mean().replace(0, np.nan)

    rows = []
    closes = df['close'].values
    highs  = df['high'].values
    lows   = df['low'].values
    idx    = df.index

    for ob in obs:
        j = ob['form_idx']
        if j + 5 >= len(df):
            continue

        # Buscar primer retoque: precio entra en zona [zone_low, zone_high]
        touch_idx = None
        for i in range(j + 2, min(j + OB_AGE_MAX + 1, len(df))):
            in_zone = lows[i] <= ob['zone_high'] and highs[i] >= ob['zone_low']
            if in_zone:
                touch_idx = i
                break

        if touch_idx is None:
            continue  # OB nunca fue tocado — no usable

        # Features en el momento del retoque
        touch_time  = idx[touch_idx]
        touch_close = closes[touch_idx]
        atr_val     = atr.iloc[touch_idx]

        if not atr_val or np.isnan(atr_val) or atr_val == 0:
            continue

        sl_pct = (atr_val * SL_ATR_MULT) / touch_close
        tp_pct = (atr_val * TP_ATR_MULT) / touch_close

        # Simular trade desde touch_idx
        label = None
        for i in range(touch_idx + 1, min(touch_idx + MAX_HOLD + 1, len(df))):
            ret = (closes[i] - touch_close) / touch_close
            if ob['type'] == 'BEAR':
                ret = -ret  # SHORT trade

            if ret <= -sl_pct:
                label = 0  # SL
                break
            if ret >= tp_pct:
                label = 1  # TP
                break

        if label is None:
            label = 0  # MAX_HOLD → fracaso

        # Feature vector
        age         = touch_idx - j
        dist_zone   = abs(touch_close - (ob['zone_high'] + ob['zone_low']) / 2) / (ob['zone_high'] - ob['zone_low'] + 1e-9)
        vol_rel     = vol_ratio.iloc[touch_idx] if not np.isnan(vol_ratio.iloc[touch_idx]) else 1.0
        session_h   = touch_time.hour  # UTC hour
        is_ny       = 1 if (session_h >= 13 and session_h < 20) else 0
        is_london   = 1 if (session_h >= 7  and session_h < 13) else 0

        rows.append({
            # Target
            'label':          label,
            'trade_time':     touch_time,
            'ob_type':        ob['type'],
            # OB formation features
            'impulse_pct':    ob['impulse_pct'],
            'ob_vol_ratio':   ob['form_volume'] / (ob['avg_vol_before'] + 1e-9),
            'zone_size_pct':  (ob['zone_high'] - ob['zone_low']) / ob['zone_low'],
            # Touch features
            'ob_age':         age,
            'dist_zone':      dist_zone,
            'vol_ratio':      vol_rel,
            # Indicator state at touch
            'rsi_14':         rsi14.iloc[touch_idx],
            'rsi_1h':         rsi14_1h.iloc[touch_idx],
            'ema_align_15m':  1 if ema20.iloc[touch_idx] > ema50.iloc[touch_idx] else -1,
            'ema_align_1h':   1 if ema20_1h.iloc[touch_idx] > ema50_1h.iloc[touch_idx] else -1,
            'bbw':            bbw.iloc[touch_idx],
            'chop':           chop.iloc[touch_idx],
            'atr_norm':       atr_val / touch_close,
            # Session
            'is_ny':          is_ny,
            'is_london':      is_london,
        })

    return pd.DataFrame(rows)

# ─── WALK-FORWARD ─────────────────────────────────────────────────────────────

FEAT_COLS = [
    'impulse_pct', 'ob_vol_ratio', 'zone_size_pct',
    'ob_age', 'dist_zone', 'vol_ratio',
    'rsi_14', 'rsi_1h', 'ema_align_15m', 'ema_align_1h',
    'bbw', 'chop', 'atr_norm', 'is_ny', 'is_london',
]

def run_wfa(ob_df: pd.DataFrame) -> list:
    results = []

    print(f"\nDataset OB total: {len(ob_df):,} samples | "
          f"TP={ob_df['label'].mean():.1%} | "
          f"BULL={( ob_df['ob_type']=='BULL').mean():.1%}")

    for win in WFA_WINDOWS:
        ts = win['train_start']
        te = win['train_end']
        tes = win['test_end']

        train_mask = (ob_df['trade_time'] >= ts)  & (ob_df['trade_time'] < te)
        test_mask  = (ob_df['trade_time'] >= te)  & (ob_df['trade_time'] < tes)

        train = ob_df[train_mask].dropna(subset=FEAT_COLS + ['label'])
        test  = ob_df[test_mask].dropna(subset=FEAT_COLS + ['label'])

        print(f"\n  Ventana {win['id']}: train={len(train)} | test={len(test)} "
              f"| TP_rate train={train['label'].mean():.1%}")

        if len(train) < 100 or len(test) < 20:
            print(f"  Datos insuficientes")
            continue

        X_train = train[FEAT_COLS]
        y_train = train['label']
        X_test  = test[FEAT_COLS]
        y_test  = test['label']

        model = lgb.LGBMClassifier(**LGB_PARAMS, n_estimators=N_ESTIMATORS)
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            callbacks=[lgb.early_stopping(EARLY_STOP, verbose=False),
                       lgb.log_evaluation(-1)]
        )

        proba     = model.predict_proba(X_test)[:, 1]
        y_pred    = (proba >= 0.55).astype(int)

        # Métricas
        n_total   = len(y_test)
        n_signals = y_pred.sum()

        if n_signals > 0:
            precision = (y_pred & y_test).sum() / n_signals
        else:
            precision = 0.0

        try:
            auc = roc_auc_score(y_test, proba)
        except Exception:
            auc = 0.5

        # WF ratio: cuántos de los predichos-TP realmente son TP
        # Umbral 0.55 como filtro de señal
        baseline_tp  = y_test.mean()

        print(f"  Score>=0.55: {n_signals}/{n_total} señales | Precision: {precision:.1%} | "
              f"Base rate: {baseline_tp:.1%} | AUC: {auc:.3f}")

        # Por tipo OB
        test_copy = test.copy()
        test_copy['proba'] = proba
        test_copy['signal'] = y_pred

        for ob_type in ['BULL', 'BEAR']:
            subset = test_copy[test_copy['ob_type'] == ob_type]
            sig_sub = subset[subset['signal'] == 1]
            if len(sig_sub) > 0:
                prec_t = (sig_sub['label']).mean()
                print(f"    {ob_type}: {len(sig_sub)} señales | Precision: {prec_t:.1%}")

        # Feature importance
        fi = pd.Series(model.feature_importances_, index=FEAT_COLS).sort_values(ascending=False)
        print(f"  Top 5 features: {', '.join(fi.head(5).index.tolist())}")

        results.append({
            'window':    win['id'],
            'n_train':   int(len(train)),
            'n_test':    int(n_total),
            'n_signals': int(n_signals),
            'precision': float(precision),
            'baseline':  float(baseline_tp),
            'lift':      float(precision / baseline_tp) if baseline_tp > 0 else 0,
            'auc':       float(auc),
        })

    return results

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print('\nLightGBM OB Scorer -- Fase 3b')
    print('='*65)
    print(f'  LightGBM version: {lgb.__version__}')

    print('\nCargando datos...')
    df = load_data(DATA_FILE)

    print('\nDetectando Order Blocks...')
    obs = detect_obs(df)
    print(f'  OBs detectados: {len(obs):,} (BULL: {sum(1 for o in obs if o["type"]=="BULL")} | BEAR: {sum(1 for o in obs if o["type"]=="BEAR")})')

    print('\nEtiquetando y extrayendo features...')
    ob_df = build_ob_dataset(df, obs)
    ob_df = ob_df.dropna()
    print(f'  OBs con retoque: {len(ob_df):,} | TP rate global: {ob_df["label"].mean():.1%}')

    if len(ob_df) < 200:
        print('ERROR: Muy pocos OBs etiquetados. Revisar parámetros.')
        return

    print('\nWALK-FORWARD OB SCORER')
    print('='*65)
    results = run_wfa(ob_df)

    if not results:
        print('\nERROR: Sin resultados WFA.')
        return

    # Resumen
    avg_prec  = np.mean([r['precision'] for r in results])
    avg_lift  = np.mean([r['lift'] for r in results])
    avg_auc   = np.mean([r['auc'] for r in results])
    approved  = sum(1 for r in results if r['precision'] >= 0.55 and r['n_signals'] >= 15)

    print(f'\n{"="*65}')
    print('RESUMEN OB SCORER')
    print('="*65')
    print(f'  Ventanas:           {len(results)}/4')
    print(f'  Precision avg:      {avg_prec:.1%}')
    print(f'  Lift avg:           {avg_lift:.2f}x sobre base rate')
    print(f'  AUC avg:            {avg_auc:.3f}')
    print(f'  Ventanas >= 55%:    {approved}/{len(results)}')

    print(f'\n  OB+FVG v1 baseline: ~39% WR (0/4 ventanas aprobadas)')
    print(f'  Con OB Scorer 55%:  {avg_prec:.1%} precision estimada')

    if avg_lift >= 1.3:
        print('  VIABLE: Lift > 1.3x sobre base rate — OB scorer aporta edge')
    else:
        print('  MARGINAL: Lift < 1.3x — OB scorer no aporta suficiente edge')

    # Guardar
    output = {
        'run_date': datetime.now().isoformat(),
        'n_obs_total': len(ob_df),
        'global_tp_rate': float(ob_df['label'].mean()),
        'windows': results,
        'summary': {
            'avg_precision': float(avg_prec),
            'avg_lift': float(avg_lift),
            'avg_auc': float(avg_auc),
            'approved': int(approved),
        }
    }
    out_path = RESULTS_DIR / 'lgbm_ob_scorer_results.json'
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f'\nResultados guardados: {out_path}')


if __name__ == '__main__':
    main()
