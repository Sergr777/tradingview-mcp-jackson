"""
download_etf_pairs.py
Descarga datos diarios de los ETFs candidatos para el sistema ETF Pairs Trading
(complemento del RSI(2) SPY validado).

IMPORTANTE: usa auto_adjust=True (precios ajustados por splits y dividendos).
Es imprescindible para pairs trading/cointegración: QQQ tuvo un split 4:1 en
enero 2022 y los dividendos difieren entre pares (GLD/SLV, TLT/IEI); con
precios crudos el spread acumularía drift espurio.

Universe (5 pares del análisis de arbitraje):
  SPY/QQQ  - LargeCap vs Tech
  GLD/SLV  - Oro vs Plata
  TLT/IEI  - Bonos Largo vs Corto
  EEM/IWM  - Emerging vs SmallCap
  XLE/XLV  - Energía vs Salud
"""

import sys
import time
from pathlib import Path

import pandas as pd
import yfinance as yf

# ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

TICKERS = ['SPY', 'QQQ', 'GLD', 'SLV', 'TLT', 'IEI', 'EEM', 'IWM', 'XLE', 'XLV']

OUT_DIR = Path('data/etf')
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Rango: mismo que el SPY validado (2014-01-01 → hoy)
START = '2014-01-01'
END = None  # hasta la fecha más reciente disponible

MIN_ROWS = 1500  # warning si un ETF diario de 10 años trae menos filas

COLS = ['Open', 'High', 'Low', 'Close', 'Volume']


def download_ticker(ticker: str, retries: int = 3) -> pd.DataFrame:
    """Descarga un ticker con reintentos. Devuelve df con índice DatetimeIndex."""
    for attempt in range(1, retries + 1):
        try:
            df = yf.download(
                ticker, start=START, end=END,
                interval='1d', auto_adjust=True, progress=False,
            )
            if df is not None and not df.empty:
                return df
        except Exception as e:  # noqa: BLE001 - aislamos error por ticker
            print(f'  ! {ticker}: intento {attempt} fallo: {e}')
        time.sleep(2 * attempt)
    return pd.DataFrame()


def main() -> int:
    print(f'Descargando {len(TICKERS)} ETFs diarios desde {START} (auto_adjust=True)...')
    n_ok = 0

    for ticker in TICKERS:
        df = download_ticker(ticker)
        if df.empty:
            print(f'  X {ticker}: sin datos tras reintentos')
            continue

        # yfinance 1.0 devuelve columnas MultiIndex incluso para un solo ticker
        if hasattr(df.columns, 'nlevels') and df.columns.nlevels > 1:
            level0 = df.columns.get_level_values(0)
            df.columns = level0 if 'Close' in level0 else df.columns.get_level_values(-1)

        df = df.dropna(subset=['Close']).copy()
        df.index = pd.to_datetime(df.index)

        # yfinance con auto_adjust=True devuelve solo OHLCV; completar resto con 0.0
        for col in ['Dividends', 'Stock Splits', 'Capital Gains']:
            if col not in df.columns:
                df[col] = 0.0

        out = df[COLS + ['Dividends', 'Stock Splits', 'Capital Gains']].copy()
        out.index.name = 'Date'

        path = OUT_DIR / f'{ticker}.csv'
        out.to_csv(path)

        n = len(out)
        first = out.index[0].date()
        last = out.index[-1].date()
        warn = '  [WARN pocas filas]' if n < MIN_ROWS else ''
        print(f'  OK {ticker}: {n} filas | {first} -> {last} | {path}{warn}')
        n_ok += 1

    print(f'Completado: {n_ok}/{len(TICKERS)} ETFs guardados en {OUT_DIR}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
