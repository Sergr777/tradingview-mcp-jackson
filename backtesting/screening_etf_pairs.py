"""
screening_etf_pairs.py
Screening de cointegración para los 5 pares ETF candidatos del sistema
ETF Pairs Trading (complemento del RSI(2) SPY validado).

Para cada par calcula:
  1. Correlación de retornos (referencia del análisis inicial)
  2. Engle-Granger cointegration (ADF sobre el spread de OLS con constante)
  3. Half-life del proceso OU (velocidad de reversión)
  4. Beta (hedge ratio) y estabilidad del beta entre mitades
  5. Estabilidad de la cointegración en 4 ventanas temporales
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import adfuller
from scipy import stats as scipy_stats

DATA_DIR = Path('data/etf')

PAIRS = [
    ('SPY', 'QQQ', 'LargeCap vs Tech'),
    ('GLD', 'SLV', 'Oro vs Plata'),
    ('TLT', 'IEI', 'Bonos Largo vs Corto'),
    ('EEM', 'IWM', 'Emerging vs SmallCap'),
    ('XLE', 'XLV', 'Energia vs Salud'),
]


def load_price(ticker: str) -> pd.Series:
    df = pd.read_csv(DATA_DIR / f'{ticker}.csv', parse_dates=['Date'], index_col='Date')
    s = df['Close'].dropna()
    s.index = pd.to_datetime(s.index)
    s = s[~s.index.duplicated(keep='last')]
    return s


def engle_granger(y: pd.Series, x: pd.Series) -> tuple:
    """Regresión OLS y = beta*x + alpha, devuelve (beta, spread, adf_pvalue)."""
    X = np.column_stack([np.ones(len(x)), x.values])
    beta, resid, *_ = np.linalg.lstsq(X, y.values, rcond=None)
    spread = y.values - (beta[0] + beta[1] * x.values)
    adf = adfuller(spread, autolag='AIC', maxlag=20)
    return float(beta[1]), pd.Series(spread, index=y.index), float(adf[1])


def half_life(spread: pd.Series) -> float:
    """Half-life del proceso OU: regresión de delta_spread ~ spread(t-1)."""
    s = spread.dropna()
    if len(s) < 30:
        return np.inf
    y = s.diff().dropna()
    x = s.shift(1).reindex(y.index)
    mask = np.isfinite(x.values) & np.isfinite(y.values)
    xv, yv = x.values[mask], y.values[mask]
    if len(xv) < 30 or np.std(xv) == 0:
        return np.inf
    beta = np.polyfit(xv, yv, 1)[0]
    if beta >= 0:
        return np.inf
    return -np.log(2) / beta


def main() -> int:
    print(f'Cargando ETFs desde {DATA_DIR}...')
    prices = {t: load_price(t) for t in ['SPY', 'QQQ', 'GLD', 'SLV', 'TLT',
                                         'IEI', 'EEM', 'IWM', 'XLE', 'XLV']}

    print('\n' + '=' * 95)
    print('SCREENING DE COINTEGRACION - ETF PAIRS')
    print('=' * 95)

    rows = []
    for a, b, desc in PAIRS:
        pa, pb = prices[a], prices[b]
        common = pa.index.intersection(pb.index)
        sa, sb = pa[common], pb[common]

        # Correlación de retornos
        corr = sa.pct_change().corr(sb.pct_change())

        # Engle-Granger full
        beta, spread, adf_p = engle_granger(sa, sb)
        hl = half_life(spread)

        # Estabilidad del beta entre mitades
        half = len(common) // 2
        beta1, _, _ = engle_granger(sa.iloc[:half], sb.iloc[:half])
        beta2, _, _ = engle_granger(sa.iloc[half:], sb.iloc[half:])

        # Estabilidad de cointegración en 4 ventanas
        n = len(common)
        wins = []
        for w in range(4):
            lo, hi = int(n * w / 4), int(n * (w + 1) / 4)
            seg_a, seg_b = sa.iloc[lo:hi], sb.iloc[lo:hi]
            _, _, p = engle_granger(seg_a, seg_b)
            wins.append(p)

        coint_full = adf_p < 0.05
        n_coint_wins = sum(1 for p in wins if p < 0.10)
        stable_beta = abs(beta2 - beta1) / abs(beta1) < 0.5 if beta1 != 0 else False

        rows.append({
            'par': f'{a}/{b}', 'desc': desc, 'corr': corr,
            'beta': beta, 'adf_p': adf_p, 'coint': coint_full,
            'half_life_dias': hl, 'beta_stab': stable_beta,
            'wins_coint': n_coint_wins, 'w_pvalues': wins,
        })

    # Tabla
    print(f'\n{"Par":<10} {"Descripcion":<22} {"Corr":>6} {"Beta":>7} '
          f'{"ADF p":>7} {"Coint":>6} {"Half-life":>10} {"BetaStab":>8} {"CointW(4)":>9}')
    print('-' * 95)
    for r in rows:
        hl_s = f'{r["half_life_dias"]:.0f}d' if np.isfinite(r['half_life_dias']) else 'inf'
        print(f'{r["par"]:<10} {r["desc"]:<22} {r["corr"]:>6.2f} {r["beta"]:>7.2f} '
              f'{r["adf_p"]:>7.3f} {str(r["coint"]):>6} {hl_s:>10} '
              f'{str(r["beta_stab"]):>8} {str(r["wins_coint"]):>9}')

    # Ranking sugerido
    print('\n' + '-' * 95)
    print('RANKING SUGERIDO (cointegración full + wins + half-life finita + beta estable):')
    scored = []
    for r in rows:
        score = 0
        score += 2 if r['coint'] else 0
        score += r['wins_coint'] * 1.0
        score += 1 if np.isfinite(r['half_life_dias']) and r['half_life_dias'] < 90 else 0
        score += 1 if r['beta_stab'] else 0
        scored.append((r['par'], score, r))
    scored.sort(key=lambda t: -t[1])
    for par, score, r in scored:
        print(f'  {par:<10} score={score:.0f}  (pvalues por ventana: '
              f'{[f"{p:.2f}" for p in r["w_pvalues"]]})')

    print('\nNota: half-life en dias naturales sobre 252 sesiones/ano.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
