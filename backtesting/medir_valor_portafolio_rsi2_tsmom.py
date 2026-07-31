"""
medir_valor_portafolio_rsi2_tsmom.py — VALOR DE PORTAFOLIO RSI(2) + TSMOM
=========================================================================
Objetivo: medir si el TSMOM 24m (edge real OOS pero NO apto standalone)
aporta valor como sleeve de baja correlacion junto al RSI(2) SPY validado.

Metricas:
  - Correlacion de retornos diarios y mensuales entre ambos sistemas
  - Portafolio combinado para pesos w_tsmom en 0..1 (Sharpe, retorno, MaxDD)
  - Mejor combinacion por Sharpe y comparacion vs RSI(2) solo

Metodologia honesta:
  - Ambas curvas de retornos diarios netos (costos incluidos) extraidas con
    include_daily=True (parametro aditivo, no cambia el backtest default)
  - RSI2: config v0.2.0 (RSI<5 LONG / >95 SHORT, SMA200, exit 60, sizing 5%)
  - TSMOM: v0.2.1 lookback 24m / target_vol 10% / rebalanceo mensual
  - Alineacion en fechas comunes (interseccion de ambos indices)

Uso:
    python backtesting/medir_valor_portafolio_rsi2_tsmom.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pandas as pd

from models.rsi2_spy_system import CONFIG_RSI2, ejecutar_backtest_rsi2  # noqa: E402
from models.tsmom_etf import CONFIG_TSMOM, ejecutar_backtest_tsmom  # noqa: E402

OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backtesting", "results"))


def _serie_desde_json(blob: dict) -> pd.Series:
    """Reconstruye una Serie diaria de retornos desde {fechas, retornos}."""
    idx = pd.to_datetime(blob["fechas"])
    return pd.Series(blob["retornos"], index=idx).sort_index()


def _metricas(rets: pd.Series) -> dict:
    rets = rets.dropna()
    if len(rets) < 50:
        return {}
    eq = (1 + rets).cumprod()
    ret_total = float(eq.iloc[-1] - 1) * 100
    anos = len(rets) / 252
    cagr = ((1 + ret_total / 100) ** (1 / anos) - 1) * 100 if anos > 0 else 0.0
    vol_anual = float(rets.std() * np.sqrt(252)) * 100
    sharpe = np.sqrt(252) * rets.mean() / max(rets.std(), 1e-6)
    dd = float((eq / eq.cummax() - 1).min()) * 100

    ventanas = []
    for periodo, r_win in rets.groupby(rets.index.to_period("Q")):
        if len(r_win) < 20:
            continue
        eq_w = (1 + r_win).cumprod()
        ventanas.append(float(eq_w.iloc[-1] - 1) * 100)
    pos = sum(1 for v in ventanas if v > 0)

    return {
        "retorno_total_pct": round(ret_total, 2),
        "cagr_pct": round(cagr, 2),
        "vol_anual_pct": round(vol_anual, 2),
        "sharpe": round(float(sharpe), 3),
        "max_dd_pct": round(dd, 2),
        "ventanas_positivas": f"{pos}/{len(ventanas)}",
        "frac_positivas": round(pos / len(ventanas), 3) if ventanas else 0,
    }


def main():
    print("  VALOR DE PORTAFOLIO: RSI(2) SPY (validado) + TSMOM 24m (sleeve)")
    print("=" * 78)

    print("\n[1/3] Extrayendo curva de retornos RSI(2) SPY...")
    r_rsi = ejecutar_backtest_rsi2(config=CONFIG_RSI2, include_daily=True)
    ret_rsi = _serie_desde_json(r_rsi["ret_diario"])
    print(f"      RSI2: {len(ret_rsi)} retornos diarios")

    print("[2/3] Extrayendo curva de retornos TSMOM 24m...")
    config_tsm = dict(CONFIG_TSMOM)
    config_tsm["lookback_months"] = 24
    r_tsm = ejecutar_backtest_tsmom(config_tsm, quiet=True, include_daily=True)
    ret_tsm = _serie_desde_json(r_tsm["ret_diario"])
    # Recortar el warmup del TSMOM (retornos 0 antes del primer rebalance,
    # capital idle): la medicion debe cubrir la ventana efectivamente operada.
    if (ret_tsm != 0).any():
        ret_tsm = ret_tsm.loc[(ret_tsm != 0).idxmax():]
    print(f"      TSMOM: {len(ret_tsm)} retornos diarios (warmup recortado)")

    # Alinear en fechas comunes
    comun = ret_rsi.index.intersection(ret_tsm.index)
    rr = ret_rsi.loc[comun]
    rt = ret_tsm.loc[comun]
    print(f"\n[3/3] Fechas comunes: {comun[0].date()} a {comun[-1].date()} "
          f"({len(comun)} sesiones)")

    m_rsi = _metricas(rr)
    m_tsm = _metricas(rt)

    # Correlaciones
    corr_diaria = float(rr.corr(rt))
    rr_m = rr.resample("M").sum()
    rt_m = rt.resample("M").sum()
    corr_mensual = float(rr_m.corr(rt_m))

    print("\n" + "=" * 78)
    print("  SISTEMAS STANDALONE (periodo comun)")
    print("=" * 78)
    print(f"  {'Sistema':<16} {'Ret%':>8} {'CAGR%':>7} {'Vol%':>7} "
          f"{'Sharpe':>7} {'MaxDD%':>7} {'Vent+':>8}")
    for nombre, m in (("RSI(2) SPY", m_rsi), ("TSMOM 24m", m_tsm)):
        print(f"  {nombre:<16} {m['retorno_total_pct']:+7.2f} {m['cagr_pct']:>7.2f} "
              f"{m['vol_anual_pct']:>7.2f} {m['sharpe']:>7.3f} "
              f"{m['max_dd_pct']:>7.2f} {m['ventanas_positivas']:>8}")

    print(f"\n  Correlacion de retornos DIARIOS:  {corr_diaria:.4f}")
    print(f"  Correlacion de retornos MENSUALES: {corr_mensual:.4f}")
    print("  (La correlacion diaria es trivialmente baja: RSI2 esta en cash ~95% de")
    print("   los dias, 5.7 trades/año. Usar la MENSUAL para interpretar diversificacion.)")

    print("\n" + "=" * 78)
    print("  PORTAFOLIO COMBINADO (w = peso en TSMOM, resto RSI2)")
    print("=" * 78)
    print(f"  {'w_TSMOM':>7} {'Ret%':>8} {'CAGR%':>7} {'Vol%':>7} {'Sharpe':>7} "
          f"{'MaxDD%':>7} {'Vent+':>8}")
    filas = []
    for w in (0.0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0):
        ret_comb = (1 - w) * rr + w * rt
        m = _metricas(ret_comb)
        filas.append((w, m))
        print(f"  {w:>7.1f} {m['retorno_total_pct']:+7.2f} {m['cagr_pct']:>7.2f} "
              f"{m['vol_anual_pct']:>7.2f} {m['sharpe']:>7.3f} "
              f"{m['max_dd_pct']:>7.2f} {m['ventanas_positivas']:>8}")

    mejor_w, mejor_m = max(filas, key=lambda x: x[1]["sharpe"])
    delta_sharpe = mejor_m["sharpe"] - m_rsi["sharpe"]

    print("\n" + "=" * 78)
    print("  CONCLUSION")
    print("=" * 78)
    print(f"  RSI(2) solo:           Sharpe {m_rsi['sharpe']:.3f} | "
          f"Ret {m_rsi['retorno_total_pct']:+.2f}% | MaxDD {m_rsi['max_dd_pct']:.2f}%")
    print(f"  Mejor combinado (w={mejor_w:.1f}): Sharpe {mejor_m['sharpe']:.3f} | "
          f"Ret {mejor_m['retorno_total_pct']:+.2f}% | MaxDD {mejor_m['max_dd_pct']:.2f}%")
    print(f"  Delta Sharpe: {delta_sharpe:+.3f} | "
          f"Corr mensual: {corr_mensual:.4f}")

    if delta_sharpe > 0.05 and mejor_m["frac_positivas"] >= m_rsi["frac_positivas"]:
        print("  VEREDICTO: TSMOM SI aporta valor real como sleeve de baja correlacion")
        print(f"  (base: corr mensual {corr_mensual:.2f} = diversificacion real)")
    else:
        print("  VEREDICTO: TSMOM NO mejora el perfil del RSI(2) solo en este periodo")

    archivo = os.path.join(OUT_DIR, "portafolio_rsi2_tsmom.json")
    salida = {
        "rsi2_standalone": m_rsi,
        "tsmom_standalone": m_tsm,
        "correlacion": {"diaria": round(corr_diaria, 4), "mensual": round(corr_mensual, 4)},
        "combinado": [{"w_tsmom": w, **m} for w, m in filas],
        "mejor": {"w_tsmom": mejor_w, **mejor_m},
        "delta_sharpe": round(delta_sharpe, 3),
        "fechas": {"inicio": str(comun[0].date()), "fin": str(comun[-1].date()),
                   "sesiones": int(len(comun))},
    }
    with open(archivo, "w", encoding="utf-8") as f:
        json.dump(salida, f, indent=2, ensure_ascii=False, default=str)
    print(f"\n  Guardado: {archivo}")


if __name__ == "__main__":
    main()
