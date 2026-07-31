"""
comparar_etf_pairs_parametros.py
Comparacion de parametros del sistema ETF Pairs (Opcion A del diagnostico).

El WFA con config baseline (entry=2.0, z_window=60) dio 4/10 ventanas,
PF 0.766, Sharpe -0.232, retorno OOS -8.04% (NO APTO). La Opcion A propone
reducir el umbral de entrada a |z|>1.5 y la ventana del z-score a 30-40d
para aumentar la frecuencia (7.8 trades/año vs 50-80 proyectados).

Este script ejecuta el grid entry x z_window y compara:
  - Trades (total y por año)
  - Win Rate
  - Profit Factor
  - Sharpe
  - Max DD
  - Retorno total OOS
  - Ventanas aprobadas

Uso:
    python backtesting/comparar_etf_pairs_parametros.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.etf_pairs_arbitraje import CONFIG_ETF, ejecutar_walk_forward  # noqa: E402

# ─── GRID ────────────────────────────────────────────────────────────────────

GRID = [
    {"entry": 2.0, "z_window": 60, "label": "baseline_2.0_60"},
    {"entry": 2.0, "z_window": 40, "label": "e2.0_z40"},
    {"entry": 2.0, "z_window": 30, "label": "e2.0_z30"},
    {"entry": 1.5, "z_window": 60, "label": "e1.5_z60"},
    {"entry": 1.5, "z_window": 40, "label": "e1.5_z40"},   # Opcion A principal
    {"entry": 1.5, "z_window": 30, "label": "e1.5_z30"},   # Opcion A agresiva
]

OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backtesting", "results"))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    resumen = []

    print("=" * 100)
    print("  GRID DE PARAMETROS — ETF PAIRS (Opcion A: |z|>1.5, z-window 30-40d)")
    print("=" * 100)

    for cfg in GRID:
        config = dict(CONFIG_ETF)
        config["entry_threshold"] = cfg["entry"]
        config["z_window"] = cfg["z_window"]

        print(f"\n{'-' * 100}")
        print(f"  >>> {cfg['label']}: entry={cfg['entry']} z_window={cfg['z_window']}")
        print(f"{'-' * 100}")

        r = ejecutar_walk_forward(config)
        m = r["metricas_globales"]

        resumen.append({
            "label": cfg["label"],
            "entry": cfg["entry"],
            "z_window": cfg["z_window"],
            "trades": m["trades"],
            "trades_anio": m["trades_anio"],
            "wr": m["wr"],
            "pf": m["pf"],
            "sharpe": m["sharpe"],
            "max_dd": m["max_dd"],
            "retorno_pct": m["retorno_total_pct"],
            "ventanas_aprobadas": r["ventanas_aprobadas"],
            "es_aprobado": r["es_aprobado"],
        })

    # Tabla comparativa
    print("\n" + "=" * 100)
    print("  TABLA COMPARATIVA")
    print("=" * 100)
    header = (f'{"Config":<20} {"Trades":>7} {"/año":>5} {"WR%":>7} '
              f'{"PF":>6} {"Sharpe":>8} {"MaxDD%":>7} {"Ret%":>8} {"Aprob":>6}')
    print(header)
    print("-" * 100)
    for s in resumen:
        aprob = "OK" if s["es_aprobado"] else "--"
        print(f'{s["label"]:<20} {s["trades"]:>7} {s["trades_anio"]:>5} '
              f'{s["wr"]:>7.2f} {s["pf"]:>6.2f} {s["sharpe"]:>8.2f} '
              f'{s["max_dd"]:>7.2f} {s["retorno_pct"]:>8.2f} '
              f'{s["ventanas_aprobadas"]:>6} {aprob}')
    print("=" * 100)

    # Mejor config por retorno/PF
    aptos = [s for s in resumen if s["es_aprobado"]]
    if aptos:
        mejor = max(aptos, key=lambda s: s["pf"])
        print(f"\n  MEJOR CONFIG APTA: {mejor['label']} "
              f"(PF {mejor['pf']:.2f}, retorno {mejor['retorno_pct']:+.2f}%)")
    else:
        # Mejor por score retorno/max_dd como proxy
        for s in resumen:
            s["score"] = (s["retorno_pct"] / max(abs(s["max_dd"]), 0.1)) if s["max_dd"] != 0 else 0
        mejor = max(resumen, key=lambda s: s["score"])
        print(f"\n  Sin config apta (ninguna cumple 10/10 y PF>=1.2).")
        print(f"  Mejor por score retorno/|MaxDD|: {mejor['label']} "
              f"(score {mejor['score']:.2f}, retorno {mejor['retorno_pct']:+.2f}%, "
              f"MaxDD {mejor['max_dd']:.2f}%)")

    # Guardar resumen
    archivo = os.path.join(OUT_DIR, "comparativa_etf_pairs_parametros.json")
    with open(archivo, "w", encoding="utf-8") as f:
        json.dump({"grid": GRID, "resumen": resumen}, f, indent=2,
                  ensure_ascii=False, default=str)
    print(f"\n  Guardado: {archivo}")
    return resumen


if __name__ == "__main__":
    main()
