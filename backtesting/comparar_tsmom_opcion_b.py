"""
comparar_tsmom_opcion_b.py — GRID OPCION B: FILTRO DE REGIMEN ADX
=================================================================
Objetivo (documentado en docs/pendiente_analisis.md seccion 4): subir la
estabilidad trimestral del TSMOM 24m por encima del 60% para alcanzar la
aptitud, sobre la base del edge real OOS (Sharpe 0.897 en split train/test).

Filtro: en cada rebalance, si la fraccion de activos con ADX > umbral es menor
a min_trending, el mercado esta en rango -> posicion en cash (no operar).

Grid: 1 baseline (sin filtro) + 3 umbrales (20/25/30) x 3 min_trending
(0.3/0.4/0.5) = 10 configs, todas con lookback 24m / target_vol 10%.

Uso:
    python backtesting/comparar_tsmom_opcion_b.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.tsmom_etf import CONFIG_TSMOM, ejecutar_backtest_tsmom  # noqa: E402

OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backtesting", "results"))


def _parse_ventanas(vent_str: str):
    """'29/51' -> (29, 51)."""
    try:
        p, t = vent_str.split("/")
        return int(p), int(t)
    except Exception:
        return 0, 0


def main():
    configs = [
        {"label": "baseline (sin filtro)", "regime_filter": False},
    ]
    for th in (20, 25, 30):
        for mt in (0.3, 0.4, 0.5):
            configs.append({
                "label": f"ADX>{th} minT={mt}",
                "regime_filter": True,
                "adx_threshold": th,
                "regime_min_trending": mt,
            })

    print("  GRID OPCION B - FILTRO DE REGIMEN ADX (TSMOM 24m)")
    print("  Objetivo: estabilidad trimestral >= 60% + Sharpe > 1.0\n")
    print(f"  {'Config':<20} {'Ret%':>8} {'Sharpe':>7} {'MaxDD%':>7} "
          f"{'Vent+':>8} {'Vent%':>6} {'WR%':>6} {'Apto':>5}")

    resumen = []
    for cfg in configs:
        config = dict(CONFIG_TSMOM)
        config["regime_filter"] = cfg["regime_filter"]
        if cfg.get("adx_threshold") is not None:
            config["adx_threshold"] = cfg["adx_threshold"]
        if cfg.get("regime_min_trending") is not None:
            config["regime_min_trending"] = cfg["regime_min_trending"]

        r = ejecutar_backtest_tsmom(config, quiet=True)
        m = r["metricas_globales"]
        p, t = _parse_ventanas(m["ventanas_positivas"])
        frac = (p / t) if t else 0.0

        s = {
            "label": cfg["label"],
            "retorno": m["retorno_total_pct"],
            "sharpe": m["sharpe"],
            "max_dd": m["max_dd"],
            "ventanas_positivas": m["ventanas_positivas"],
            "ventanas_frac": round(frac, 3),
            "wr": m["wr_rebalances_pct"],
            "es_aprobado": r["es_aprobado"],
        }
        resumen.append(s)
        print(f"  {s['label']:<20} {s['retorno']:+7.2f} {s['sharpe']:>7.3f} "
              f"{s['max_dd']:>7.2f} {s['ventanas_positivas']:>8} "
              f"{frac*100:>5.1f}% {s['wr']:>6.1f} "
              f"{'SI' if s['es_aprobado'] else 'no'}")

    aptos = [s for s in resumen if s["es_aprobado"]]
    print()
    if aptos:
        mejor = max(aptos, key=lambda s: s["sharpe"])
        print(f"  MEJOR CONFIG APTA: {mejor['label']} (Sharpe {mejor['sharpe']:.3f}, "
              f"retorno {mejor['retorno']:+.2f}%, vent {mejor['ventanas_positivas']})")
    else:
        mejor = max(resumen, key=lambda s: s["sharpe"])
        print(f"  Sin config apta. Mejor por Sharpe: {mejor['label']} "
              f"(Sharpe {mejor['sharpe']:.3f}, retorno {mejor['retorno']:+.2f}%, "
              f"vent {mejor['ventanas_positivas']})")

    archivo = os.path.join(OUT_DIR, "comparativa_tsmom_opcion_b.json")
    with open(archivo, "w", encoding="utf-8") as f:
        json.dump({"grid": resumen}, f, indent=2, ensure_ascii=False, default=str)
    print(f"\n  Guardado: {archivo}")


if __name__ == "__main__":
    main()
