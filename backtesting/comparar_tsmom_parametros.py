"""
comparar_tsmom_parametros.py
Grid de robustez para TSMOM multi-ETF.

El backtest baseline (lookback 12m, target_vol 10%) dio +21.81% total,
Sharpe 0.31, MaxDD -13.76%, 9/12 ventanas positivas -> NO APTO (Sharpe<1.0).
Este script ejecuta el grid lookback x target_vol para verificar si alguna
config es robusta o si el baseline es la mejor eleccion honesta.

Uso:
    python backtesting/comparar_tsmom_parametros.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.tsmom_etf import CONFIG_TSMOM, ejecutar_backtest_tsmom  # noqa: E402

# ─── GRID ────────────────────────────────────────────────────────────────────

GRID = [
    {"lookback": 6,  "target_vol": 0.10, "label": "lb6_v10"},
    {"lookback": 12, "target_vol": 0.10, "label": "lb12_v10_baseline"},
    {"lookback": 24, "target_vol": 0.10, "label": "lb24_v10"},
    {"lookback": 12, "target_vol": 0.08, "label": "lb12_v08"},
    {"lookback": 12, "target_vol": 0.15, "label": "lb12_v15"},
    {"lookback": 6,  "target_vol": 0.08, "label": "lb6_v08"},
]

OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backtesting", "results"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    resumen = []

    print("=" * 100)
    print("  GRID DE ROBUSTEZ — TSMOM MULTI-ETF (lookback x vol objetivo)")
    print("=" * 100)

    for cfg in GRID:
        config = dict(CONFIG_TSMOM)
        config["lookback_months"] = cfg["lookback"]
        config["target_vol"] = cfg["target_vol"]

        print(f"\n{'-' * 100}")
        print(f"  >>> {cfg['label']}: lookback={cfg['lookback']}m "
              f"target_vol={cfg['target_vol']:.0%}")
        print(f"{'-' * 100}")

        r = ejecutar_backtest_tsmom(config, quiet=True)
        m = r["metricas_globales"]

        resumen.append({
            "label": cfg["label"],
            "lookback": cfg["lookback"],
            "target_vol": cfg["target_vol"],
            "retorno_pct": m["retorno_total_pct"],
            "sharpe": m["sharpe"],
            "max_dd": m["max_dd"],
            "trades_anio": m["trades_anio"],
            "wr_rebalances_pct": m["wr_rebalances_pct"],
            "corr_spy": m["corr_spy"],
            "ventanas_positivas": m["ventanas_positivas"],
            "es_aprobado": r["es_aprobado"],
        })

    # Tabla comparativa
    print("\n" + "=" * 100)
    print("  TABLA COMPARATIVA")
    print("=" * 100)
    header = (f'{"Config":<22} {"Ret%":>8} {"Sharpe":>8} {"MaxDD%":>8} '
              f'{"Trades/a":>8} {"WR%":>6} {"CorrSPY":>8} {"Vent+":>7} {"Apto":>5}')
    print(header)
    print("-" * 100)
    for s in resumen:
        aprob = "OK" if s["es_aprobado"] else "--"
        print(f'{s["label"]:<22} {s["retorno_pct"]:>8.2f} {s["sharpe"]:>8.2f} '
              f'{s["max_dd"]:>8.2f} {s["trades_anio"]:>8.1f} '
              f'{s["wr_rebalances_pct"]:>6.1f} {s["corr_spy"]:>8.4f} '
              f'{s["ventanas_positivas"]:>7} {aprob}')
    print("=" * 100)

    aptos = [s for s in resumen if s["es_aprobado"]]
    if aptos:
        mejor = max(aptos, key=lambda s: s["sharpe"])
        print(f"\n  MEJOR CONFIG APTA: {mejor['label']} "
              f"(Sharpe {mejor['sharpe']:.2f}, retorno {mejor['retorno_pct']:+.2f}%)")
    else:
        # Mejor por score sharpe ajustado (prioriza Sharpe, penaliza DD)
        for s in resumen:
            s["score"] = s["sharpe"] - abs(s["max_dd"]) * 0.02
        mejor = max(resumen, key=lambda s: s["score"])
        print(f"\n  Sin config apta (ninguna cumple Sharpe>1.0, |DD|<20%, >=60% ventanas).")
        print(f"  Mejor por score sharpe-2%*|DD|: {mejor['label']} "
              f"(score {mejor['score']:.2f}, Sharpe {mejor['sharpe']:.2f}, "
              f"retorno {mejor['retorno_pct']:+.2f}%)")

    # Guardar resumen
    archivo = os.path.join(OUT_DIR, "comparativa_tsmom_parametros.json")
    with open(archivo, "w", encoding="utf-8") as f:
        json.dump({"grid": GRID, "resumen": resumen}, f, indent=2,
                  ensure_ascii=False, default=str)
    print(f"\n  Guardado: {archivo}")
    return resumen


if __name__ == "__main__":
    main()
