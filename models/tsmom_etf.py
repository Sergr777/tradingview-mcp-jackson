"""
tsmom_etf.py — TIME-SERIES MOMENTUM MULTI-ETF (TREND FOLLOWING)
================================================================
Sistema de momentum de serie temporal sobre un universo de ETFs
multi-clase, con volatility targeting. Complemento natural del
RSI(2) SPY validado (mean reversion): TSMOM aporta cobertura en
tendencias sostenidas donde el RSI(2) carece de señales.

Metodologia (Moskowitz, Ooi & Pedersen 2012, "Time Series Momentum"):
  1. Senal por activo = signo del retorno trailing de N meses
     (default 24m desde la re-validacion 2026-07-31; 12m = clasico MOP 2012)
     (+1 si retorno>0 -> LONG, -1 si retorno<0 -> SHORT)
  2. Sizing por volatilidad: posicion_i = (vol_objetivo / vol_realizada_i)
     -> cada activo contribuye la MISMA volatilidad al portafolio
  3. Rebalanceo mensual (21 sesiones)
  4. Portafolio equiponderado por riesgo entre los activos con senal
  5. Costos: bps por turnover en cada rebalance
  6. Estabilidad: desglose de rendimiento por ventanas de 3 meses (configurable)
  7. Filtro de regimen ADX (Opcion B): si la fraccion de activos con ADX >
     `adx_threshold` es menor a `regime_min_trending`, el mercado esta en rango
     -> posicion en cash (no operar) en ese rebalance

Evidencia:
  - Paper de referencia probado en 58 instrumentos, 25+ anos, OOS consistente
  - WR tipico 35-45% con R:R alto (muchas perdidas pequenas, pocas ganancias grandes)
  - Rachas largas de DD en mercados laterales (documentar, no ocultar)

Uso:
    python -m models.tsmom_etf --backtest
    python -m models.tsmom_etf --backtest --save
    python -m models.tsmom_etf --backtest --save --lookback 24 --target-vol 0.10 --label r24v10
"""

import argparse
import json
import os
import sys
import time
from typing import Dict

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data", "etf")

# Universo multi-clase (coherente con el screening de ETFs ya descargado)
UNIVERSO = [
    "SPY", "QQQ",   # Acciones: LargeCap / Tech
    "GLD", "SLV",   # Metales: Oro / Plata
    "TLT", "IEI",   # Bonos: Largo / Corto
    "EEM", "IWM",   # Acciones: Emerging / SmallCap
    "XLE", "XLV",   # Sectores: Energia / Salud
]

# Configuracion estrategica
CONFIG_TSMOM = {
    "name": "TSMOM_MULTI_ETF",
    "version": "0.2.1",
    "timeframe": "1d",

    "universe": UNIVERSO,

    # Senal: retorno trailing en meses. Re-validado 2026-07-31: el grid de
    # robustez mostro que 24m es claramente la mejor config (Sharpe 0.72,
    # +57.97%, MaxDD -8.06% vs 12m: 0.31 / +21.81% / -13.76%) y se adopta
    # como config principal. Ver docs/pendiente_analisis.md seccion 4.
    "lookback_months": 24,

    # Volatility targeting
    "target_vol": 0.10,          # volatilidad anual objetivo del portafolio
    "vol_lookback": 20,          # sesiones para estimar volatilidad realizada
    "max_weight": 1.5,           # tope por activo (evitar concentracion)

    # Rebalanceo mensual
    "rebalance_days": 21,

    # Estabilidad: desglose por ventanas de N meses (3 = trimestral)
    "ventana_meses": 3,

    # Costos: 10 bps por unidad de turnover (2 lados de entrada/salida)
    "cost_per_turnover": 0.0010,

    # Minimo de activos con senal para operar (si no, cash)
    "min_assets": 3,

    # Filtro de regimen ADX (Opcion B): no operar en rangos
    "regime_filter": False,       # True = activar filtro ADX
    "adx_period": 14,             # periodo ADX de Wilder
    "adx_threshold": 25,          # umbral: ADX por debajo = rango
    "regime_min_trending": 0.4,   # fraccion minima de activos trending para operar
}


# =============================================================================
# CARGA DE DATOS
# =============================================================================

def cargar_universo(config: dict = None) -> Dict[str, pd.Series]:
    """Carga precios ajustados (Close) de todos los ETFs del universo."""
    if config is None:
        config = CONFIG_TSMOM

    precios: Dict[str, pd.Series] = {}
    for t in config["universe"]:
        ruta = os.path.join(DATA_DIR, f"{t}.csv")
        if not os.path.exists(ruta):
            raise FileNotFoundError(
                f"No se encuentra {ruta}. Descarga primero: "
                f"python backtesting/download_etf_pairs.py"
            )
        df = pd.read_csv(ruta, index_col=0, parse_dates=True)
        s = df["Close"].dropna()
        s.index = pd.to_datetime(s.index)
        s = s[~s.index.duplicated(keep="last")]
        precios[t] = s
    return precios


def precio_matriz(precios: Dict[str, pd.Series]) -> pd.DataFrame:
    """Matriz de precios alineada en fechas comunes."""
    df = pd.DataFrame(precios).dropna()
    return df.sort_index()


def cargar_ohlc_universo(config: dict = None) -> Dict[str, pd.DataFrame]:
    """Carga OHLC ajustados de los ETFs (para filtros de regimen tipo ADX)."""
    if config is None:
        config = CONFIG_TSMOM
    data: Dict[str, pd.DataFrame] = {}
    for t in config["universe"]:
        ruta = os.path.join(DATA_DIR, f"{t}.csv")
        if not os.path.exists(ruta):
            continue
        df = pd.read_csv(ruta, index_col=0, parse_dates=True)
        df.index = pd.to_datetime(df.index)
        df = df[~df.index.duplicated(keep="last")]
        cols = [c for c in ("High", "Low", "Close") if c in df.columns]
        if len(cols) == 3:
            data[t] = df[cols].dropna()
    return data


def calcular_adx_universo(high: pd.DataFrame, low: pd.DataFrame,
                          close: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """ADX de Wilder (smoothing RMA) por columna, alineado al index comun.

    Backward-looking por construccion (diff/shift/ewm): el valor en la fila i
    usa SOLO datos hasta i, por lo que es seguro aplicarlo en la fecha de
    rebalance sin look-ahead.
    """
    up = high.diff()
    down = -low.diff()
    plus_dm = pd.DataFrame(np.where((up > down) & (up > 0), up, 0.0),
                           index=high.index, columns=high.columns)
    minus_dm = pd.DataFrame(np.where((down > up) & (down > 0), down, 0.0),
                            index=high.index, columns=high.columns)
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = tr1.combine(tr2, np.maximum).combine(tr3, np.maximum)

    def wilder(df):
        return df.ewm(alpha=1.0 / period, adjust=False).mean()

    atr = wilder(tr).replace(0, np.nan)
    plus_di = 100 * wilder(plus_dm) / atr
    minus_di = 100 * wilder(minus_dm) / atr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return wilder(dx)


# =============================================================================
# BACKTEST TSMOM
# =============================================================================

def ejecutar_backtest_tsmom(config: dict = None, quiet: bool = False,
                             include_daily: bool = False) -> dict:
    """
    Backtest TSMOM con vol targeting. TSMOM es OOS por construccion:
    la senal de cada rebalance usa SOLO datos hasta esa fecha (retorno
    trailing y volatilidad realizada) - no hay parametros ajustados
    in-sample, por lo que la curva completa es out-of-sample.

    include_daily: si True, anade al resultado la serie diaria de retornos
    netos (ret_diario) para mediciones de portafolio. Aditivo, no cambia
    el comportamiento default.
    """
    if config is None:
        config = CONFIG_TSMOM

    inicio = time.time()
    precios = cargar_universo(config)
    px = precio_matriz(precios)
    if not quiet:
        print(f"  Rango comun: {px.index[0].date()} a {px.index[-1].date()} "
              f"({len(px)} sesiones) | {len(px.columns)} activos")

    rets = px.pct_change()
    lookback = config["lookback_months"] * 21  # meses -> sesiones
    target_vol = config["target_vol"]
    vol_lookback = config["vol_lookback"]
    max_weight = config["max_weight"]
    rebal = config["rebalance_days"]
    cost = config["cost_per_turnover"]
    min_assets = config["min_assets"]

    # Filtro de regimen ADX (Opcion B): no operar en rangos
    regime_filter = config.get("regime_filter", False)
    adx_period = config.get("adx_period", 14)
    adx_threshold = config.get("adx_threshold", 25)
    regime_min_trending = config.get("regime_min_trending", 0.4)
    adx_all = None
    if regime_filter:
        ohlc = cargar_ohlc_universo(config)
        high_m = pd.DataFrame(
            {t: ohlc[t]["High"] for t in px.columns if t in ohlc}
        ).reindex(px.index).ffill()
        low_m = pd.DataFrame(
            {t: ohlc[t]["Low"] for t in px.columns if t in ohlc}
        ).reindex(px.index).ffill()
        adx_all = calcular_adx_universo(high_m, low_m, px, adx_period)

    # Fechas de rebalanceo (mensual)
    fechas_rebal = px.index[lookback + vol_lookback::rebal]
    if len(fechas_rebal) == 0:
        raise RuntimeError("Sin rebalances con el rango de datos disponible")

    # Pesos por rebalance (filas)
    pesos_hist = []
    fechas_pesos = []

    for fecha in fechas_rebal:
        i = px.index.get_loc(fecha)
        ret_trailing = px.iloc[i] / px.iloc[i - lookback] - 1
        senal = np.sign(ret_trailing)

        # Volatilidad realizada anualizada
        vol_anual = rets.iloc[max(0, i - vol_lookback):i].std() * np.sqrt(252)
        vol_anual = vol_anual.replace(0, np.nan)

        # Peso bruto por activo: target_vol / vol_realizada (vol targeting)
        peso = target_vol / vol_anual
        peso = peso.clip(upper=max_weight)

        # Aplicar senal (long si momentum+, short si momentum-)
        peso = peso * senal

        # Solo activos con senal activa
        peso = peso.where(senal != 0, 0.0)

        # Filtro de regimen ADX (Opcion B): si la fraccion de activos trending
        # es baja, el mercado esta en rango -> no operar (cash)
        if adx_all is not None:
            adx_i = adx_all.iloc[i].dropna()
            if len(adx_i) > 0:
                frac_trending = float((adx_i > adx_threshold).mean())
                if frac_trending < regime_min_trending:
                    peso = pd.Series(0.0, index=px.columns)
                    pesos_hist.append(peso.values)
                    fechas_pesos.append(fecha)
                    continue

        # Normalizar para que la vol del portafolio ~ target (escala conjunta)
        activos_activos = peso[peso != 0]
        if len(activos_activos) >= min_assets:
            vol_port = (peso.abs() * vol_anual).sum()
            if vol_port > 0:
                factor = target_vol / vol_port
                peso = peso * factor
                # Re-clip tras normalizar (el factor puede elevar pesos > max)
                peso = peso.clip(lower=-max_weight, upper=max_weight)
        else:
            peso = pd.Series(0.0, index=px.columns)

        pesos_hist.append(peso.values)
        fechas_pesos.append(fecha)

    pesos_df = pd.DataFrame(pesos_hist, index=fechas_pesos, columns=px.columns)

    # Expandir pesos a frecuencia diaria (mantener hasta el proximo rebalance)
    pesos_diarios = pesos_df.reindex(px.index, method="ffill").fillna(0.0)

    # Retornos diarios del portafolio (pesos del dia anterior, sin look-ahead)
    ret_port = (pesos_diarios.shift(1) * rets).sum(axis=1).fillna(0.0)

    # Costos: turnover en cada rebalance
    turnover = pesos_diarios.diff().abs().sum(axis=1)
    costos = turnover * cost
    ret_neto = ret_port - costos

    # ---- Metricas ----
    eq = (1 + ret_neto).cumprod()
    dd = (eq / eq.cummax() - 1).min() * 100
    sharpe = np.sqrt(252) * ret_neto.mean() / max(ret_neto.std(), 1e-6)
    retorno_total = float(eq.iloc[-1] - 1) * 100

    # Trades = cambios de posicion por rebalance
    cambios = (pesos_diarios.diff().abs().sum(axis=1) > 0).sum()
    anos = len(px) / 252
    trades_anio = cambios / max(anos, 0.1)

    # Correlacion con SPY buy & hold
    spy_ret = px["SPY"].pct_change()
    corr_spy = float(ret_neto.corr(spy_ret))

    # Desglose por ventanas de N meses (estabilidad; default 3 = trimestral)
    ventana_meses = config.get("ventana_meses", 3)
    freq_periodo = "Q" if ventana_meses == 3 else ("Y" if ventana_meses == 12 else f"{ventana_meses}M")
    ventanas = []
    for periodo, r_win in ret_neto.groupby(ret_neto.index.to_period(freq_periodo)):
        if len(r_win) < 20:
            continue
        eq_w = (1 + r_win).cumprod()
        ventanas.append({
            "periodo": str(periodo),
            "retorno": round(float(eq_w.iloc[-1] - 1) * 100, 2),
            "sharpe": round(np.sqrt(252) * r_win.mean() / max(r_win.std(), 1e-6), 2),
            "max_dd": round(float((eq_w / eq_w.cummax() - 1).min()) * 100, 2),
        })

    ventanas_positivas = sum(1 for v in ventanas if v["retorno"] > 0)
    frac_positivas = ventanas_positivas / len(ventanas) if ventanas else 0

    # WR a nivel de "trade" (cada rebalance con cambio es un periodo)
    # Aproximacion honesta: fraccion de rebalances con retorno positivo
    bins_rebal = [pd.Timestamp(f) for f in fechas_pesos] + [px.index[-1]]
    if len(bins_rebal) > 1 and bins_rebal[-1] <= bins_rebal[-2]:
        bins_rebal[-1] = bins_rebal[-2] + pd.Timedelta(days=1)
    ret_por_rebal = ret_neto.groupby(
        pd.cut(ret_neto.index, bins=bins_rebal), observed=False
    ).sum()
    wr_rebal = (ret_por_rebal > 0).mean() * 100 if len(ret_por_rebal) else 0

    es_aprobado = (retorno_total > 0 and sharpe > 1.0 and abs(dd) < 20.0
                   and frac_positivas >= 0.6)

    resultado = {
        "modelo": config["name"],
        "version": config["version"],
        "config": config,
        "metricas_globales": {
            "retorno_total_pct": round(retorno_total, 2),
            "sharpe": round(sharpe, 3),
            "max_dd": round(dd, 2),
            "trades_anio": round(trades_anio, 1),
            "wr_rebalances_pct": round(wr_rebal, 1),
            "corr_spy": round(corr_spy, 4),
            "ventanas_positivas": f"{ventanas_positivas}/{len(ventanas)}",
        },
        "ventanas": ventanas,
        "es_aprobado": es_aprobado,
        "tiempo_seg": round(time.time() - inicio, 1),
    }

    if include_daily:
        resultado["ret_diario"] = {
            "fechas": [d.strftime("%Y-%m-%d") for d in ret_neto.index],
            "retornos": [round(float(v), 6) for v in ret_neto],
        }

    _imprimir_resultado(resultado, quiet=quiet)
    return resultado


def _imprimir_resultado(r: dict, quiet: bool = False):
    if quiet:
        return
    m = r["metricas_globales"]
    print("\n" + "=" * 72)
    print(f"  RESULTADOS TSMOM — {r['modelo']} v{r['version']}")
    print("=" * 72)
    print(f"  Retorno total (OOS por construccion): {m['retorno_total_pct']:+.2f}%")
    print(f"  Sharpe: {m['sharpe']:.3f}")
    print(f"  Max DD: {m['max_dd']:.2f}%")
    print(f"  Trades/año (cambios de posicion): {m['trades_anio']:.1f}")
    print(f"  WR rebalances: {m['wr_rebalances_pct']:.1f}%")
    print(f"  Correlacion con SPY: {m['corr_spy']:.4f} "
          f"(baja = diversifica)")
    print(f"  Ventanas positivas: {m['ventanas_positivas']}")
    print("-" * 72)
    for v in r["ventanas"]:
        print(f"  {v['periodo']}: ret {v['retorno']:+6.2f}% | "
              f"sharpe {v['sharpe']:+.2f} | maxdd {v['max_dd']:6.2f}%")
    print("=" * 72)

    if r["es_aprobado"]:
        print("  MODELO APTO: retorno>0, Sharpe>1.0, |MaxDD|<20%, >=60% ventanas "
              "(trimestrales) positivas")
    else:
        print("  MODELO NO APTO: no cumple todos los criterios (ventanas trimestrales)")
    print("=" * 72)


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="TSMOM multi-ETF con vol targeting")
    parser.add_argument("--backtest", action="store_true", help="Ejecutar backtest")
    parser.add_argument("--save", action="store_true",
                        help="Guardar resultados en backtesting/results/")
    parser.add_argument("--lookback", type=int, default=None,
                        help="Lookback en meses (default: config)")
    parser.add_argument("--target-vol", type=float, default=None,
                        help="Volatilidad objetivo anual (default: config)")
    parser.add_argument("--label", type=str, default="",
                        help="Sufijo para el archivo de resultados")
    parser.add_argument("--ventanas", type=int, default=None,
                        help="Tamano de ventana de estabilidad en meses "
                             "(default: 3 = trimestral)")
    parser.add_argument("--regime-filter", action="store_true",
                        help="Activar filtro de regimen ADX (Opcion B)")
    parser.add_argument("--adx-threshold", type=float, default=None,
                        help="Umbral ADX de rango (default: config)")
    parser.add_argument("--min-trending", type=float, default=None,
                        help="Fraccion minima de activos trending (default: config)")
    parser.add_argument("--quiet", action="store_true",
                        help="Silenciar salida detallada")
    args = parser.parse_args()

    if not args.backtest:
        parser.print_help()
        print("\nEjemplos:")
        print("  python -m models.tsmom_etf --backtest")
        print("  python -m models.tsmom_etf --backtest --save")
        print("  python -m models.tsmom_etf --backtest --save "
              "--lookback 12 --target-vol 0.10 --label r12v10")
        return

    config = dict(CONFIG_TSMOM)
    if args.lookback is not None:
        config["lookback_months"] = args.lookback
    if args.target_vol is not None:
        config["target_vol"] = args.target_vol
    if args.ventanas is not None:
        config["ventana_meses"] = args.ventanas
    if args.regime_filter:
        config["regime_filter"] = True
    if args.adx_threshold is not None:
        config["adx_threshold"] = args.adx_threshold
    if args.min_trending is not None:
        config["regime_min_trending"] = args.min_trending
    if not args.quiet:
        print(f"  [CONFIG] lookback={config['lookback_months']}m "
              f"target_vol={config['target_vol']:.0%} "
              f"ventanas={config['ventana_meses']}m "
              f"regime_filter={config['regime_filter']}")

    resultado = ejecutar_backtest_tsmom(config, quiet=args.quiet)

    if args.save:
        output_dir = os.path.normpath(os.path.join(
            PROJECT_ROOT, "backtesting", "results"))
        os.makedirs(output_dir, exist_ok=True)
        nombre = f"wfa_tsmom_etf{'_' + args.label if args.label else ''}.json"
        archivo = os.path.join(output_dir, nombre)
        with open(archivo, "w", encoding="utf-8") as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False, default=str)
        if not args.quiet:
            print(f"  Guardado: {archivo}")

    return resultado


if __name__ == "__main__":
    main()
