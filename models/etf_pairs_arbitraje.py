"""
etf_pairs_arbitraje.py — ETF PAIRS TRADING (ARBITRAJE ESTADISTICO)
==================================================================
Sistema market-neutral de arbitraje estadistico sobre pares de ETFs
cointegrados. Complemento natural del RSI(2) SPY validado: aporta
frecuencia (~50-80 trades/ano) donde el RSI(2) carece (~6/ano) y
neutralidad de mercado (correlacion con SPY cercana a 0).

Metodologia (Jansen Cap 9 + documento de evaluacion):
  1. Engle-Granger: OLS hedge ratio (beta) ajustado en ventana TRAIN
  2. Spread = precio_A - (alpha + beta*precio_B)
  3. Z-score sobre media/desv movil de 60 sesiones del spread
  4. Maquina de estados:
       z >  +entry -> SHORT SPREAD (corto A, largo B)
       z <  -entry -> LONG SPREAD  (largo A, corto B)
       z cruza 0   -> salida (reversion a la media)
       |z| >= stop -> salida por ruptura (anti-LTCM)
  5. Dollar-neutral: pesos fijos +/-50% por par, costos 10 bps por
     cambio (5 bps/pata x 2 patas), 20 bps round-trip

Pares validados por screening de cointegración (backtesting/screening_etf_pairs.py):
  - SPY/QQQ : ADF p=0.003, half-life 82d
  - GLD/SLV : ADF p=0.007, half-life 62d
  (TLT/IEI, EEM/IWM, XLE/XLV: SIN cointegración estadistica -> excluidos)

Uso:
    python -m models.etf_pairs_arbitraje --backtest
    python -m models.etf_pairs_arbitraje --backtest --save
"""

import argparse
import json
import os
import sys
import time
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data", "etf")

# Configuracion estrategica
CONFIG_ETF = {
    "name": "ETF_PAIRS_ARBITRAJE",
    "version": "0.1.0",
    "timeframe": "1d",

    # Pares cointegrados validados por screening
    "pairs": [("SPY", "QQQ"), ("GLD", "SLV")],

    # Umbrales de la maquina de estados
    "entry_threshold": 2.0,    # entrada cuando |z| > 2
    "exit_threshold": 0.0,     # salida cuando z cruza 0 (media)
    "stop_threshold": 3.5,     # ruptura de cointegracion (anti-LTCM)

    # Z-score: media/desv movil del spread
    "z_window": 60,

    # WFA: ventanas de entrenamiento (2y) y prueba (1y), paso 1y
    "train_years": 2,
    "test_years": 1,
    "step_years": 1,

    # Costos: 10 bps por cambio (5 bps/pata x 2 patas) segun doc de
    # referencia. En la formula costos = (|dwA| + |dwB|) * cost_per_leg,
    # un cambio (entrada o salida) cuesta 10 bps; round-trip = 20 bps.
    "cost_per_leg": 0.0010,

    # Opcion C: re-test de cointegracion por ventana (solo operar un par
    # si su Engle-Granger ADF p < umbral en la ventana actual, calculado
    # con datos anteriores al test -> sin look-ahead)
    "retest_coint": False,          # activar re-test por ventana
    "coint_p_threshold": 0.10,      # umbral ADF para operar el par
    "coint_lookback": 250,          # sesiones recientes para el test (~1 ano)
}

# Nota: la simulacion trabaja con fracciones (pesos +/-50% por par,
# dollar-neutral), no con montos de capital. Cada par aporta 0.5 de
# exposicion por pata y el portafolio es la media de los pares.
POSICION_POR_PAR = 0.5


# =============================================================================
# CARGA DE DATOS
# =============================================================================

def cargar_pares(config: dict = None) -> Dict[str, pd.Series]:
    """Carga precios ajustados (Close) de los pares desde data/etf/*.csv."""
    if config is None:
        config = CONFIG_ETF

    precios: Dict[str, pd.Series] = {}
    for a, b in config["pairs"]:
        for t in (a, b):
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


# =============================================================================
# AJUSTE DEL PAR (ENGLE-GRANGER / OLS BETA)
# =============================================================================

def ajustar_par(pa: pd.Series, pb: pd.Series) -> dict:
    """
    Regresion OLS: pa = alpha + beta*pb + residuos.
    Devuelve beta, alpha y el spread (serie).
    """
    X = np.column_stack([np.ones(len(pb)), pb.values])
    coef, *_ = np.linalg.lstsq(X, pa.values, rcond=None)
    alpha, beta = float(coef[0]), float(coef[1])
    spread = pa - (alpha + beta * pb)
    return {"beta": beta, "alpha": alpha, "spread": spread}


# =============================================================================
# MAQUINA DE ESTADOS (SIMULACION POR PAR)
# =============================================================================

# =============================================================================
# RE-TEST DE COINTEGRACION POR VENTANA (OPCION C)
# =============================================================================

def test_cointegracion(
    pa: pd.Series,
    pb: pd.Series,
    lookback: int = 250,
    p_threshold: float = 0.10,
) -> bool:
    """
    Engle-Granger: ADF sobre el spread de OLS en la ventana reciente.
    Solo usa datos hasta el corte (las ultimas `lookback` sesiones) ->
    sin look-ahead. Devuelve True si p < p_threshold (par cointegrado
    en la ventana actual).
    """
    from statsmodels.tsa.stattools import adfuller

    pa_r = pa.iloc[-lookback:]
    pb_r = pb.iloc[-lookback:]
    if len(pa_r) < 60:
        return False
    ajuste = ajustar_par(pa_r, pb_r)
    spread = ajuste["spread"].values
    try:
        adf = adfuller(spread, autolag="AIC", maxlag=20)
        pval = float(adf[1])
    except Exception:
        return False
    return pval < p_threshold


# =============================================================================
# MAQUINA DE ESTADOS (SIMULACION POR PAR)
# =============================================================================

def simular_par(
    pa: pd.Series,
    pb: pd.Series,
    beta: float,
    alpha: float,
    config: dict,
) -> Tuple[pd.Series, List[dict]]:
    """
    Simula el trading del par en la ventana de prueba.

    - Pesos: LONG SPREAD = +0.5 A / -0.5 B ; SHORT SPREAD = -0.5 A / +0.5 B
    - Retorno diario = w_A*ret_A + w_B*ret_B con pesos del dia anterior
    - Costos: 10 bps por cambio (5 bps/pata x 2 patas, 20 bps round-trip)
    - Devuelve (serie de retornos diarios, lista de trades)
    """
    entry = config["entry_threshold"]
    exit_z = config["exit_threshold"]
    stop = config["stop_threshold"]
    z_window = config["z_window"]
    cost = config["cost_per_leg"]

    spread = pa - (alpha + beta * pb)
    sm = spread.rolling(z_window).mean()
    ss = spread.rolling(z_window).std()
    z = (spread - sm) / ss.replace(0, np.nan)
    z = z.dropna()

    # Retornos de cada activo
    ret_a = pa.pct_change()
    ret_b = pb.pct_change()

    # Maquina de estados
    pesos_a = np.zeros(len(z))
    pesos_b = np.zeros(len(z))
    posicion = 0  # 0=flat, +1=LONG SPREAD, -1=SHORT SPREAD
    trades: List[dict] = []
    trade_actual = None
    z_vals = z.values
    idx = z.index

    for i in range(len(z)):
        z_cur = z_vals[i]
        ts_i = idx[i]  # Timestamp real del indice (evita problemas de tz)

        if posicion == 0:
            if z_cur > entry:
                posicion = -1  # SHORT SPREAD: corto A, largo B
                trade_actual = {"direccion": "SHORT_SPREAD", "entry_z": z_cur,
                                "entry_ts": ts_i, "entry_price_a": float(pa.loc[ts_i])}
            elif z_cur < -entry:
                posicion = 1   # LONG SPREAD: largo A, corto B
                trade_actual = {"direccion": "LONG_SPREAD", "entry_z": z_cur,
                                "entry_ts": ts_i, "entry_price_a": float(pa.loc[ts_i])}
        else:
            # Salida por reversion (cruza 0) o ruptura (|z| >= stop)
            salir = False
            if posicion == 1 and (z_cur >= exit_z or z_cur <= -stop):
                salir = True
            elif posicion == -1 and (z_cur <= -exit_z or z_cur >= stop):
                salir = True

            if salir:
                if trade_actual:
                    trade_actual["exit_z"] = z_cur
                    trade_actual["exit_ts"] = ts_i
                    trade_actual["exit_price_a"] = float(pa.loc[ts_i])
                    trade_actual["duracion_dias"] = int((ts_i - trade_actual["entry_ts"]).days)
                trades.append(trade_actual)
                trade_actual = None
                posicion = 0

        # Registrar pesos del dia i (para retorno del dia i+1)
        pesos_a[i] = posicion * POSICION_POR_PAR
        pesos_b[i] = -posicion * POSICION_POR_PAR

    # Cerrar posicion abierta al final
    if trade_actual:
        trade_actual["exit_z"] = z_vals[-1]
        trade_actual["exit_ts"] = idx[-1]
        trade_actual["exit_price_a"] = float(pa.loc[idx[-1]])
        trade_actual["duracion_dias"] = int((idx[-1] - trade_actual["entry_ts"]).days)
        trade_actual["forzado"] = True
        trades.append(trade_actual)

    # Retornos diarios con pesos del dia anterior (sin look-ahead)
    w_a_prev = pd.Series(pesos_a, index=idx).shift(1).fillna(0.0)
    w_b_prev = pd.Series(pesos_b, index=idx).shift(1).fillna(0.0)

    ret_pares = pd.Series(0.0, index=idx)
    ret_pares = (w_a_prev * ret_a.reindex(idx) + w_b_prev * ret_b.reindex(idx))

    # Costos de transaccion (cambio de pesos por pata)
    cambio_a = np.abs(pd.Series(pesos_a, index=idx).diff()).fillna(0.0)
    cambio_b = np.abs(pd.Series(pesos_b, index=idx).diff()).fillna(0.0)
    costos = (cambio_a + cambio_b) * cost
    ret_pares = ret_pares - costos

    # Etiquetar pnl de cada trade a partir de los retornos
    if trades:
        for t in trades:
            lo = z.index.searchsorted(t["entry_ts"], side="left")
            hi = z.index.searchsorted(t["exit_ts"], side="left")
            if lo < hi:
                t["pnl"] = float(ret_pares.iloc[lo:hi + 1].sum())
            else:
                t["pnl"] = 0.0
            t["pnl_pct"] = round(t["pnl"] * 100, 3)

    return ret_pares, trades


# =============================================================================
# WALK-FORWARD ANALYSIS
# =============================================================================

def ejecutar_walk_forward(config: dict = None, quiet: bool = False) -> dict:
    """WFA: ventanas de entrenamiento (2y) y prueba (1y) con paso anual.

    Opcion C (retest_coint=True): por cada ventana se re-testa la
    cointegracion de cada par con los datos anteriores al test; si
    ADF p >= coint_p_threshold el par queda en cash esa ventana.
    """
    if config is None:
        config = CONFIG_ETF

    inicio = time.time()
    precios = cargar_pares(config)

    # Fechas comunes a todos los tickers
    fechas = None
    for t, s in precios.items():
        fechas = s.index if fechas is None else fechas.intersection(s.index)
    fechas = fechas.sort_values()
    if not quiet:
        print(f"  Rango comun: {fechas[0].date()} a {fechas[-1].date()} "
              f"({len(fechas)} sesiones)")

    train_years = config["train_years"]
    test_years = config["test_years"]
    step_years = config["step_years"]

    ventanas = []
    # Primera ventana: usa el inicio para entrenar, luego desliza
    inicio_train = fechas[0]
    fin_train = inicio_train + pd.DateOffset(years=train_years)
    inicio_test = fin_train
    fin_test = inicio_test + pd.DateOffset(years=test_years)

    while fin_test <= fechas[-1]:
        ventanas.append({
            "train_start": inicio_train, "train_end": fin_train,
            "test_start": inicio_test, "test_end": fin_test,
        })
        # Deslizar
        inicio_train = inicio_train + pd.DateOffset(years=step_years)
        fin_train = inicio_train + pd.DateOffset(years=train_years)
        inicio_test = fin_train
        fin_test = inicio_test + pd.DateOffset(years=test_years)

    if not ventanas:
        raise RuntimeError("Sin ventanas WFA con el rango de datos disponible")

    resultados_ventanas = []
    todos_trades = []
    retornos_por_ventana: List[pd.Series] = []

    for v in ventanas:
        w_id = f"{v['train_start'].year}-{v['test_start'].year}"
        if not quiet:
            print(f"\n  Ventana {w_id}: train {v['train_start'].date()}.."
                  f"{v['train_end'].date()} | test {v['test_start'].date()}.."
                  f"{v['test_end'].date()}")

        # Entrenar beta por par en la ventana de entrenamiento
        betas = {}
        pares_activos = []
        for a, b in config["pairs"]:
            pa_tr = precios[a].loc[v["train_start"]:v["train_end"]]
            pb_tr = precios[b].loc[v["train_start"]:v["train_end"]]

            # Opcion C: re-test de cointegracion por ventana antes de operar
            if config.get("retest_coint", False):
                coint_ok = test_cointegracion(
                    pa_tr, pb_tr,
                    lookback=config.get("coint_lookback", 250),
                    p_threshold=config.get("coint_p_threshold", 0.10))
                if not quiet:
                    estado = "TRADE" if coint_ok else "CASH"
                    print(f"    {a}/{b}: ADF re-test {'PASA' if coint_ok else 'NO'} -> {estado}")
                if not coint_ok:
                    continue  # par en cash esta ventana

            ajuste = ajustar_par(pa_tr, pb_tr)
            betas[(a, b)] = ajuste
            pares_activos.append((a, b))
            if not quiet:
                print(f"    {a}/{b}: beta={ajuste['beta']:.4f} alpha={ajuste['alpha']:.2f}")

        # Simular cada par activo en la ventana de prueba
        ret_pares_list = []
        trades_ventana = []
        for a, b in pares_activos:
            pa_te = precios[a].loc[v["test_start"]:v["test_end"]]
            pb_te = precios[b].loc[v["test_start"]:v["test_end"]]
            ajuste = betas[(a, b)]
            ret_par, trades_par = simular_par(
                pa_te, pb_te, ajuste["beta"], ajuste["alpha"], config)
            ret_pares_list.append(ret_par)
            trades_ventana.extend(trades_par)
            todos_trades.extend(trades_par)
            if not quiet:
                print(f"    {a}/{b}: {len(trades_par)} trades | "
                      f"WR {sum(1 for t in trades_par if t['pnl'] > 0) / max(len(trades_par), 1) * 100:.1f}%")

        # Portafolio: media de retornos de los pares activos (equiponderado).
        # Si ningun par paso el re-test, la ventana queda en cash (retorno 0).
        if ret_pares_list:
            ret_portafolio = pd.concat(ret_pares_list, axis=1).mean(axis=1).dropna()
        else:
            fechas_test = precios[config["pairs"][0][0]].loc[
                v["test_start"]:v["test_end"]].index
            ret_portafolio = pd.Series(0.0, index=fechas_test)
        retornos_por_ventana.append(ret_portafolio)

        # Metricas de la ventana (SOLO trades de esta ventana)
        wins = [t for t in trades_ventana if t["pnl"] > 0]
        losses = [t for t in trades_ventana if t["pnl"] <= 0]
        gp = sum(t["pnl"] for t in wins)
        gl = abs(sum(t["pnl"] for t in losses))
        n_trades = len(trades_ventana)
        wr = (len(wins) / n_trades * 100) if n_trades else 0
        pf = gp / gl if gl > 0 else (0 if gp <= 0 else float("inf"))

        eq = (1 + ret_portafolio).cumprod()
        dd = (eq / eq.cummax() - 1).min() * 100
        sharpe = np.sqrt(252) * ret_portafolio.mean() / max(ret_portafolio.std(), 1e-6)

        resultados_ventanas.append({
            "id": w_id,
            "train_start": str(v["train_start"].date()),
            "test_start": str(v["test_start"].date()),
            "test_end": str(v["test_end"].date()),
            "trades": n_trades,
            "wr": round(wr, 2),
            "pf": round(pf, 3),
            "sharpe": round(sharpe, 3),
            "max_dd": round(dd, 2),
            "retorno": round(float(eq.iloc[-1] - 1) * 100, 2),
            "pares_activos": [f"{a}/{b}" for a, b in pares_activos],
            "aprobada": wr >= 55 and pf >= 1.2,
        })

    # Metricas globales OOS (todas las ventanas juntas)
    wins = [t for t in todos_trades if t["pnl"] > 0]
    losses = [t for t in todos_trades if t["pnl"] <= 0]
    gp = sum(t["pnl"] for t in wins)
    gl = abs(sum(t["pnl"] for t in losses))
    n_trades = len(todos_trades)
    wr = (len(wins) / n_trades * 100) if n_trades else 0
    pf = gp / gl if gl > 0 else (0 if gp <= 0 else float("inf"))

    ret_total = pd.concat(retornos_por_ventana) if retornos_por_ventana \
        else pd.Series(dtype=float)
    eq = (1 + ret_total).cumprod()
    dd = (eq / eq.cummax() - 1).min() * 100
    sharpe = np.sqrt(252) * ret_total.mean() / max(ret_total.std(), 1e-6)
    retorno_total = float(eq.iloc[-1] - 1) * 100
    # Anos efectivos de prueba = dias de test cubiertos por las ventanas
    dias_test = sum((pd.Timestamp(v["test_end"]) - pd.Timestamp(v["test_start"])).days
                    for v in ventanas)
    anos_test = dias_test / 365.25
    trades_anio = n_trades / max(anos_test, 0.1)

    # Correlacion con SPY (proxy de neutralidad de mercado)
    corr_spy = None
    try:
        spy_ret = precios["SPY"].pct_change().reindex(ret_total.index)
        corr_spy = float(ret_total.corr(spy_ret))
    except Exception:
        corr_spy = None

    aprobadas = sum(1 for v in resultados_ventanas if v["aprobada"])

    resultado = {
        "modelo": config["name"],
        "version": config["version"],
        "pares": config["pairs"],
        "config": config,
        "ventanas": resultados_ventanas,
        "metricas_globales": {
            "trades": n_trades,
            "trades_anio": round(trades_anio, 1),
            "wr": round(wr, 2),
            "pf": round(pf, 3),
            "sharpe": round(sharpe, 3),
            "max_dd": round(dd, 2),
            "retorno_total_pct": round(retorno_total, 2),
            "corr_spy": round(corr_spy, 4) if corr_spy is not None else None,
        },
        "ventanas_aprobadas": f"{aprobadas}/{len(resultados_ventanas)}",
        "es_aprobado": aprobadas == len(resultados_ventanas) and pf >= 1.2,
        "tiempo_seg": round(time.time() - inicio, 1),
    }

    if not quiet:
        _imprimir_resultado(resultado)
    return resultado


def _imprimir_resultado(r: dict):
    print("\n" + "=" * 72)
    print(f"  RESULTADOS WFA — {r['modelo']} v{r['version']}")
    print("=" * 72)
    print(f"  Pares: {', '.join(f'{a}/{b}' for a, b in r['pares'])}")
    print(f"  Ventanas: {r['ventanas_aprobadas']} aprobadas")
    print(f"  Trades: {r['metricas_globales']['trades']} "
          f"({r['metricas_globales']['trades_anio']}/año)")
    print(f"  Win Rate: {r['metricas_globales']['wr']:.2f}%")
    print(f"  Profit Factor: {r['metricas_globales']['pf']:.3f}")
    print(f"  Sharpe: {r['metricas_globales']['sharpe']:.3f}")
    print(f"  Max DD: {r['metricas_globales']['max_dd']:.2f}%")
    print(f"  Retorno total (OOS): {r['metricas_globales']['retorno_total_pct']:+.2f}%")
    if r["metricas_globales"]["corr_spy"] is not None:
        print(f"  Correlacion con SPY: {r['metricas_globales']['corr_spy']:.4f} "
              f"(cercana a 0 = neutral)")
    print("-" * 72)
    for v in r["ventanas"]:
        marca = "OK" if v["aprobada"] else "--"
        print(f"  [{marca}] {v['id']}: {v['trades']} trades | WR {v['wr']:.1f}% "
              f"| PF {v['pf']:.2f} | Sharpe {v['sharpe']:.2f} | "
              f"MaxDD {v['max_dd']:.1f}% | Ret {v['retorno']:+.2f}%")
    print("=" * 72)

    if r["es_aprobado"]:
        print("  MODELO APTO: todas las ventanas OOS aprobadas (WR>=55% y PF>=1.2)")
    else:
        print("  MODELO NO APTO: revisar ventanas (no todas cumplen WR>=55% y PF>=1.2)")
    print("=" * 72)


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="ETF Pairs Trading (arbitraje estadistico)")
    parser.add_argument("--backtest", action="store_true",
                        help="Ejecutar WFA")
    parser.add_argument("--save", action="store_true",
                        help="Guardar resultados en backtesting/results/")
    parser.add_argument("--entry", type=float, default=None,
                        help="Umbral de entrada |z| (default: config)")
    parser.add_argument("--z-window", type=int, default=None,
                        help="Ventana del z-score en sesiones (default: config)")
    parser.add_argument("--label", type=str, default="",
                        help="Sufijo para el archivo de resultados")
    parser.add_argument("--retest-coint", action="store_true",
                        help="Activar re-test de cointegracion por ventana (Opcion C)")
    parser.add_argument("--coint-p", type=float, default=None,
                        help="Umbral ADF p para operar el par (default: config)")
    parser.add_argument("--coint-lookback", type=int, default=None,
                        help="Sesiones recientes para el ADF (default: config)")
    args = parser.parse_args()

    if not args.backtest:
        parser.print_help()
        print("\nEjemplos:")
        print("  python -m models.etf_pairs_arbitraje --backtest")
        print("  python -m models.etf_pairs_arbitraje --backtest --save")
        print("  python -m models.etf_pairs_arbitraje --backtest --save "
              "--entry 1.5 --z-window 40 --label optA")
        return

    config = dict(CONFIG_ETF)
    if args.entry is not None:
        config["entry_threshold"] = args.entry
    if args.z_window is not None:
        config["z_window"] = args.z_window
    if args.retest_coint:
        config["retest_coint"] = True
    if args.coint_p is not None:
        config["coint_p_threshold"] = args.coint_p
    if args.coint_lookback is not None:
        config["coint_lookback"] = args.coint_lookback
    print(f"  [CONFIG] entry={config['entry_threshold']} "
          f"z_window={config['z_window']} "
          f"retest_coint={config['retest_coint']} "
          f"coint_p={config['coint_p_threshold']} "
          f"coint_lookback={config['coint_lookback']}")

    resultado = ejecutar_walk_forward(config)

    if args.save:
        output_dir = os.path.normpath(os.path.join(
            PROJECT_ROOT, "backtesting", "results"))
        os.makedirs(output_dir, exist_ok=True)
        nombre = f"wfa_etf_pairs{'_' + args.label if args.label else ''}.json"
        archivo = os.path.join(output_dir, nombre)
        with open(archivo, "w", encoding="utf-8") as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False, default=str)
        print(f"  Guardado: {archivo}")

    return resultado


if __name__ == "__main__":
    main()
