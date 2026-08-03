"""
actualizar_datos_paper.py — UPDATE INCREMENTAL DE DATOS PARA PAPER TRADING
==========================================================================
Actualiza los CSVs que consumen las senales del portafolio RSI(2)+TSMOM:

  - data/SPY_daily_10y.csv        (senal RSI(2): models/rsi2_spy_system.py)
  - data/etf/{TICKER}.csv x 10    (senal TSMOM: models/tsmom_etf.py)

Disenado para correr diario (cron local, GitHub Actions, o futuro VPS).
A diferencia de download_etf_pairs.py (descarga completa), este script hace
una descarga INCREMENTAL: solo trae los dias desde el ultimo cierre que ya
tenemos en el CSV (+ overlap de 6 dias para cubrir ajustes por dividendos/
splits), y fusiona sin duplicar ni perder historico.

Formato de salida: identico a download_etf_pairs.py
  Date,Open,High,Low,Close,Volume,Dividends,Stock Splits,Capital Gains
(auto_adjust=True -> precios ajustados, imprescindible para TSMOM/pairs)

Integridad: si un ticker falla tras reintentos, el script FALLA con exit != 0
y NO toca el CSV de ese ticker (el dato viejo queda intacto). El orquestador
(workflow) decide si abortar.

Uso:
    python scripts/actualizar_datos_paper.py            # SPY + 10 ETFs
    python scripts/actualizar_datos_paper.py --spy-only
    python scripts/actualizar_datos_paper.py --etf-only
    python scripts/actualizar_datos_paper.py --full     # re-descarga completa
"""

import argparse
import sys
import time
from pathlib import Path

import pandas as pd
import yfinance as yf

# ─── CONFIGURACION ────────────────────────────────────────────────────────────

TICKERS = ['SPY', 'QQQ', 'GLD', 'SLV', 'TLT', 'IEI', 'EEM', 'IWM', 'XLE', 'XLV']
ETF_DIR = Path('data/etf')
SPY_PATH = Path('data/SPY_daily_10y.csv')

OVERLAP_DAYS = 6          # dias de solape para cubrir ajustes retroactivos
RETRIES = 3               # intentos por ticker
SLEEP_BETWEEN = 1.5       # segundos entre tickers (evitar rate limit)
MIN_ROWS = 1500           # warning si un dataset diario de 10 anos trae menos

COLS_EXTRA = ['Dividends', 'Stock Splits', 'Capital Gains']


# ─── DESCARGAS ───────────────────────────────────────────────────────────────

def _download_incremental(ticker: str, start: str, retries: int = RETRIES) -> pd.DataFrame:
    """Descarga incremental con reintentos y backoff. DataFrame o vacio."""
    for attempt in range(1, retries + 1):
        try:
            df = yf.download(
                ticker, start=start, end=None,
                interval='1d', auto_adjust=True, progress=False,
            )
            if df is not None and not df.empty:
                return df
            print(f'  ! {ticker}: respuesta vacia (intento {attempt}/{retries})')
        except Exception as e:  # noqa: BLE001 - aislamos el error por ticker
            print(f'  ! {ticker}: intento {attempt}/{retries} fallo: {e}')
        time.sleep(2 * attempt)
    return pd.DataFrame()


def _a_index_naive(idx) -> pd.DatetimeIndex:
    """Convierte cualquier indice (tz-aware o no) a DatetimeIndex naive UTC a media noche."""
    idx = pd.to_datetime(idx, utc=True)   # unifica tz-aware/naive a UTC
    return idx.tz_localize(None).normalize()


def _normalizar(df: pd.DataFrame) -> pd.DataFrame:
    """Estandariza el df descargado: DatetimeIndex plano + columnas OHLCV + extras."""
    if hasattr(df.columns, 'nlevels') and df.columns.nlevels > 1:
        level0 = df.columns.get_level_values(0)
        df.columns = level0 if 'Close' in level0 else df.columns.get_level_values(-1)
    df = df.dropna(subset=['Close']).copy()
    df.index = _a_index_naive(df.index)  # fechas a media noche (formato Date)
    for col in COLS_EXTRA:
        if col not in df.columns:
            df[col] = 0.0
    return df


def _fusionar(existente: pd.DataFrame, nuevo: pd.DataFrame) -> pd.DataFrame:
    """Fusiona historico + incremental sin duplicados, preservando columnas."""
    if existente.empty:
        return nuevo
    cols = list(existente.columns)
    # Nuevas columnas que no esten en el historico (ev. formatos viejos)
    for c in nuevo.columns:
        if c not in cols:
            existente[c] = 0.0
            cols.append(c)
    for c in cols:
        if c not in nuevo.columns:
            nuevo[c] = 0.0
    merged = pd.concat([existente[cols], nuevo[cols]])
    merged = merged[~merged.index.duplicated(keep='last')].sort_index()
    return merged.dropna(subset=['Close'])


def _guardar(df: pd.DataFrame, path: Path) -> int:
    """Guarda en formato identico a download_etf_pairs.py. Devuelve filas escritas."""
    out = df.copy()
    out.index.name = 'Date'
    out.to_csv(path)
    return len(out)


def _ultima_fecha(path: Path) -> pd.Timestamp:
    """Ultima fecha del CSV existente, o hace 1 ano si no existe (bootstrap)."""
    if not path.exists():
        return pd.Timestamp.now().normalize() - pd.DateOffset(years=1)
    try:
        idx = pd.to_datetime(pd.read_csv(path, usecols=['Date'])['Date'], utc=True)
        return idx.max().tz_localize(None).normalize()
    except Exception:  # noqa: BLE001 - CSV corrupto -> bootstrap con warning
        print(f'  ! {path.name}: CSV ilegible, bootstrap desde hace 1 ano')
        return pd.Timestamp.now().normalize() - pd.DateOffset(years=1)


def actualizar_ticker(ticker: str, path: Path, full: bool = False) -> int:
    """Actualiza un CSV. Devuelve nuevas filas agregadas (-1 = fallo)."""
    existente = pd.DataFrame()
    if path.exists():
        existente = pd.read_csv(path, index_col=0, parse_dates=True)
        existente.index = _a_index_naive(existente.index)

    if full or existente.empty:
        start = '2014-01-01'
    else:
        start = (_ultima_fecha(path) - pd.Timedelta(days=OVERLAP_DAYS)).strftime('%Y-%m-%d')

    nuevo = _normalizar(_download_incremental(ticker, start))
    if nuevo.empty:
        print(f'  X {ticker}: sin datos tras {RETRIES} reintentos — CSV intacto')
        return -1

    merged = _fusionar(existente, nuevo)
    n_antes = len(existente)
    n_filas = _guardar(merged, path)
    n_nuevas = n_filas - n_antes

    first = merged.index[0].date()
    last = merged.index[-1].date()
    warn = '  [WARN pocas filas]' if n_filas < MIN_ROWS else ''
    print(f'  OK {ticker}: {n_filas} filas ({n_antes} previas, +{n_nuevas} nuevas) '
          f'| {first} -> {last}{warn}')
    return n_nuevas


# ─── MAIN ────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description='Update incremental de datos para paper trading')
    parser.add_argument('--spy-only', action='store_true', help='Solo SPY (senal RSI2)')
    parser.add_argument('--etf-only', action='store_true', help='Solo los 10 ETFs (senal TSMOM)')
    parser.add_argument('--full', action='store_true', help='Re-descarga completa (2014->hoy)')
    args = parser.parse_args()

    fallos: list[str] = []
    total_nuevas = 0

    # SPY (formato equivalente: mismo esquema Date,OHLCV,+extras)
    if not args.etf_only:
        ETF_DIR.mkdir(parents=True, exist_ok=True)
        print(f'== SPY -> {SPY_PATH}')
        n = actualizar_ticker('SPY', SPY_PATH, args.full)
        if n < 0:
            fallos.append('SPY')
        else:
            total_nuevas += n
        time.sleep(SLEEP_BETWEEN)

    # Universo TSMOM
    if not args.spy_only:
        ETF_DIR.mkdir(parents=True, exist_ok=True)
        print(f'== {len(TICKERS)} ETFs -> {ETF_DIR}/')
        for ticker in TICKERS:
            path = ETF_DIR / f'{ticker}.csv'
            n = actualizar_ticker(ticker, path, args.full)
            if n < 0:
                fallos.append(ticker)
            else:
                total_nuevas += n
            time.sleep(SLEEP_BETWEEN)

    print(f'\nCompletado: +{total_nuevas} filas nuevas | fallos: {fallos or "ninguno"}')
    if fallos:
        print(f'FALLO en: {", ".join(fallos)} — revisar antes de generar senales')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
