"""
comparar_etf_pairs_opcion_c.py — GRID OPCION C: RE-TEST DE COINTEGRACION
=======================================================================
Objetivo (documentado en docs/pendiente_analisis.md seccion 3): rescatar el
ETF pairs descartado (baseline PF 0.77, retorno OOS -8.04%) añadiendo un
re-test de cointegración por ventana antes de operar: si el Engle-Granger ADF
p >= umbral en la ventana actual, el par queda en cash esa ventana.

Grid: 4 configs = baseline (sin filtro) + re-test ADF p<0.10 (lookback 250) +
p<0.05 (lookback 250) + p<0.10 (lookback 125, sensibilidad a la ventana).

Uso:
    python backtesting/comparar_etf_pairs_opcion_c.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.etf_pairs_arbitraje import CONFIG_ETF, ejecutar_walk_forward  # noqa: E402

OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backtesting", "results"))


def main():
    configs = [
        {"label": "baseline (sin re-test)", "retest_coint": False},
        {"label": "ADF p<0.10 lb=250", "retest_coint": True,
         "coint_p_threshold": 0.10, "coint_lookback": 250},
        {"label": "ADF p<0.05 lb=250", "retest_coint": True,
         "coint_p_threshold": 0.05, "coint_lookback": 250},
        {"label": "ADF p<0.10 lb=125", "retest_coint": True,
         "coint_p_threshold": 0.10, "coint_lookback": 125},
    ]

    print("  GRID OPCION C - RE-TEST DE COINTEGRACION POR VENTANA (ETF pairs)")
    print("  Objetivo: rescatar el edge filtrando ventanas sin cointegracion\n")
    print(f"  {'Config':<26} {'Trades':>7} {'/año':>5} {'WR%':>7} {'PF':>6} "
          f"{'Sharpe':>7} {'MaxDD%':>7} {'Ret%':>7} {'Aprob':>6}")

    resumen = []
    for cfg in configs:
        config = dict(CONFIG_ETF)
        config["retest_coint"] = cfg["retest_coint"]
        if cfg.get("coint_p_threshold") is not None:
            config["coint_p_threshold"] = cfg["coint_p_threshold"]
        if cfg.get("coint_lookback") is not None:
            config["coint_lookback"] = cfg["coint_lookback"]

        r = ejecutar_walk_forward(config, quiet=True)
        m = r["metricas_globales"]
        s = {
            "label": cfg["label"],
            "trades": m["trades"],
            "trades_anio": m["trades_anio"],
            "wr": m["wr"],
            "pf": m["pf"],
            "sharpe": m["sharpe"],
            "max_dd": m["max_dd"],
            "retorno": m["retorno_total_pct"],
            "ventanas_aprobadas": r["ventanas_aprobadas"],
            "es_aprobado": r["es_aprobado"],
        }
        resumen.append(s)
        print(f"  {s['label']:<26} {s['trades']:>7} {s['trades_anio']:>5.1f} "
              f"{s['wr']:>7.2f} {s['pf']:>6.3f} {s['sharpe']:>7.3f} "
              f"{s['max_dd']:>7.2f} {s['retorno']:>+7.2f} {s['ventanas_aprobadas']:>6}")

    aptos = [s for s in resumen if s["es_aprobado"]]
    print()
    if aptos:
        mejor = max(aptos, key=lambda s: s["sharpe"])
        print(f"  MEJOR CONFIG APTA: {mejor['label']} (Sharpe {mejor['sharpe']:.3f}, "
              f"PF {mejor['pf']:.2f}, retorno {mejor['retorno']:+.2f}%)")
    else:
        mejor = max(resumen, key=lambda s: s["sharpe"])
        print(f"  Sin config apta. Mejor por Sharpe: {mejor['label']} "
              f"(Sharpe {mejor['sharpe']:.3f}, retorno {mejor['retorno']:+.2f}%)")

    archivo = os.path.join(OUT_DIR, "comparativa_etf_pairs_opcion_c.json")
    with open(archivo, "w", encoding="utf-8") as f:
        json.dump({"grid": resumen}, f, indent=2, ensure_ascii=False, default=str)
    print(f"\n  Guardado: {archivo}")


if __name__ == "__main__":
    main()
