"""
optimizar_rsi2_spy.py — OPTIMIZACION PARAMETRICA RSI(2) SPY
==============================================================
Barre 54 combinaciones de parametros para encontrar la configuracion
con mejor score compuesto retorno/max_dd (tipo Calmar), descontando costos.

Ranking (correccion #3):
  ANTES: (-wr, -sharpe, -retorno) → favorecia WR alto con retorno bajo
  AHORA: score = retorno / max_dd (desempates: retorno, sharpe, wr)

Parametros a optimizar:
  - RSI oversold threshold: 5, 8, 12
  - Trend SMA period: 100, 200
  - RSI exit threshold: 40, 50, 60
  - Max hold days: 5, 8, 10

Uso:
    python backtesting/optimizar_rsi2_spy.py
    python backtesting/optimizar_rsi2_spy.py --top 5
    python backtesting/optimizar_rsi2_spy.py --save
"""

import argparse
import json
import os
import sys
import time
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.rsi2_spy_system import (
    cargar_datos_spy, precomputar_indicadores, detectar_senal,
    verificar_salida_rsi, COST_ROUNDTRIP, CAPITAL_INICIAL, TAMANO_POSICION,
    CONFIG_RSI2,
)

# =============================================================================
# PARAMETROS A BARRER
# =============================================================================

GRID = {
    "oversold_threshold": [5, 8, 12],
    "trend_sma_period": [100, 200],
    "rsi_exit_threshold": [40, 50, 60],
    "max_hold_days": [5, 8, 10],
}

# Total: 3 * 2 * 3 * 3 = 54 combinaciones

# =============================================================================
# BACKTEST PARAMETRICO
# =============================================================================

def backtest_con_parametros(
    df: pd.DataFrame,
    oversold: int,
    sma_period: int,
    exit_rsi: int,
    max_hold: int,
    capital: float = CAPITAL_INICIAL,
    costos: float = COST_ROUNDTRIP,
) -> Dict:
    """Ejecuta backtest con parametros especificos y retorna metricas."""
    cfg = {
        "rsi_period": 2,
        "oversold_threshold": oversold,
        "overbought_threshold": 100 - oversold,  # Simetrico
        "trend_sma_period": sma_period,
        "use_trend_filter": True,
        "rsi_exit_threshold": exit_rsi,
        "exit_on_rsi_cross": True,
        "max_hold_days": max_hold,
        "atr_period": 14,
        "atr_mult_sl": 2.0,
    }

    indicators = precomputar_indicadores(df, cfg)
    sim_capital = capital
    trades = []
    equity = [capital]
    peak = capital
    max_dd = 0.0
    position = None
    start_idx = max(sma_period + 10, cfg["atr_period"] + 10)
    exit_on_rsi_cross = cfg.get("exit_on_rsi_cross", True)

    for i in range(start_idx, len(df)):
        bar = df.iloc[i]
        price = float(bar["close"])
        atr_val = indicators["atr"][i]
        if pd.isna(atr_val) or atr_val <= 0:
            continue

        # Gestionar posicion abierta
        if position:
            pnl_pct = (price - position["entry_price"]) / position["entry_price"] * 100
            if position["direction"] == "SHORT":
                pnl_pct = -pnl_pct

            days_held = i - position["entry_idx"]
            exit_reason = None

            if exit_on_rsi_cross and verificar_salida_rsi_r2(i, position, indicators, exit_rsi):
                exit_reason = "RSI_CROSS"
            elif pnl_pct <= -position["sl_pct"]:
                exit_reason = "STOP_LOSS"
            elif days_held >= max_hold:
                exit_reason = "MAX_HOLD"

            if exit_reason:
                pnl_neto = pnl_pct - costos * 100
                pnl_amt = position["size"] * pnl_neto / 100
                sim_capital += pnl_amt
                trades.append({
                    "pnl_amt": round(pnl_amt, 2),
                    "exit_reason": exit_reason,
                    "direction": position["direction"],
                })
                position = None

        # Buscar nueva entrada
        if not position:
            senal = detectar_senal(i, df, indicators, cfg)
            if senal:
                sl_pct = (atr_val * cfg["atr_mult_sl"] / price) * 100
                size = sim_capital * TAMANO_POSICION
                position = {
                    "direction": senal["direction"],
                    "entry_price": price,
                    "size": size,
                    "sl_pct": sl_pct,
                    "entry_idx": i,
                }

        # Equity REAL dia a dia
        curr_eq = sim_capital
        if position:
            un_pnl = (price - position["entry_price"]) / position["entry_price"]
            if position["direction"] == "SHORT":
                un_pnl = -un_pnl
            curr_eq += position["size"] * un_pnl
        equity.append(curr_eq)
        if curr_eq > peak:
            peak = curr_eq
        dd = ((peak - curr_eq) / peak) * 100
        if dd > max_dd:
            max_dd = dd

    # Cerrar ultima
    if position:
        fp = float(df["close"].iloc[-1])
        pnl_pct = (fp - position["entry_price"]) / position["entry_price"] * 100
        if position["direction"] == "SHORT":
            pnl_pct = -pnl_pct
        pnl_neto = pnl_pct - costos * 100
        pnl_amt = position["size"] * pnl_neto / 100
        trades.append({"pnl_amt": round(pnl_amt, 2), "exit_reason": "END"})
        sim_capital += pnl_amt

    total = len(trades)
    winners = [t for t in trades if t.get("pnl_amt", 0) > 0]
    losers = [t for t in trades if t.get("pnl_amt", 0) <= 0]
    wr = (len(winners) / total * 100) if total > 0 else 0
    ret = ((sim_capital - capital) / capital) * 100
    gp = sum(t.get("pnl_amt", 0) for t in winners)
    gl = abs(sum(t.get("pnl_amt", 0) for t in losers))
    pf = gp / gl if gl > 0 else 0

    # Sharpe REAL con equity dia a dia
    eq_series = pd.Series(equity)
    rets = eq_series.pct_change().dropna()
    sharpe = np.sqrt(252) * rets.mean() / max(rets.std(), 0.0001)

    return {
        "wr": round(wr, 2),
        "retorno": round(ret, 2),
        "pf": round(pf, 2),
        "sharpe": round(sharpe, 3),
        "max_dd": round(max_dd, 2),
        "trades": total,
        "params": {
            "oversold": oversold,
            "sma": sma_period,
            "exit_rsi": exit_rsi,
            "max_hold": max_hold,
        }
    }


def verificar_salida_rsi_r2(i: int, position: dict, indicators: dict, exit_rsi: int) -> bool:
    """Version standalone de verificar salida RSI."""
    rsi = indicators["rsi"][i]
    rsi_prev = indicators["rsi"][i - 1]
    if pd.isna(rsi) or pd.isna(rsi_prev):
        return False
    if position["direction"] == "LONG":
        return rsi_prev <= exit_rsi and rsi > exit_rsi
    else:
        return rsi_prev >= exit_rsi and rsi < exit_rsi


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Optimizar RSI(2) SPY")
    parser.add_argument("--top", type=int, default=10, help="Mostrar top N configs")
    parser.add_argument("--save", action="store_true", help="Guardar resultados")
    args = parser.parse_args()

    print("=" * 75)
    print("  OPTIMIZACION PARAMETRICA: RSI(2) SPY")
    print(f"  Grid: {len(GRID['oversold_threshold'])} thresholds x "
          f"{len(GRID['trend_sma_period'])} SMAs x "
          f"{len(GRID['rsi_exit_threshold'])} exits x "
          f"{len(GRID['max_hold_days'])} holds = "
          f"{len(GRID['oversold_threshold']) * len(GRID['trend_sma_period']) * len(GRID['rsi_exit_threshold']) * len(GRID['max_hold_days'])} combos")
    print("=" * 75)

    print("\n[1/3] Cargando datos SPY...")
    df = cargar_datos_spy()
    print(f"  {len(df)} velas diarias")

    print("\n[2/3] Ejecutando sweep...")
    resultados = []
    inicio = time.time()
    total = 0

    for oversold in GRID["oversold_threshold"]:
        for sma in GRID["trend_sma_period"]:
            for exit_rsi in GRID["rsi_exit_threshold"]:
                for hold in GRID["max_hold_days"]:
                    total += 1
                    r = backtest_con_parametros(df, oversold, sma, exit_rsi, hold)
                    resultados.append(r)

                    if total % 10 == 0:
                        elapsed = time.time() - inicio
                        rate = total / max(elapsed, 0.1)
                        remaining = (54 - total) / max(rate, 0.1)
                        print(f"  [{total}/54] {rate:.0f} combos/s | "
                              f"ETA: {remaining:.0f}s | "
                              f"Best WR: {max(r['wr'] for r in resultados):.1f}%")

    elapsed = time.time() - inicio
    print(f"  {total}/54 combinaciones en {elapsed:.1f}s ({total/max(elapsed,0.1):.0f}/s)")

    # Ranking por objetivo compuesto: retorno por unidad de drawdown (tipo Calmar)
    def score_calmar(r):
        dd = max(r["max_dd"], 0.01)  # evitar division por cero
        return r["retorno"] / dd

    for r in resultados:
        r["score"] = round(score_calmar(r), 2)

    resultados.sort(key=lambda r: (-r["score"], -r["retorno"], -r["sharpe"], -r["wr"]))

    print(f"\n[3/3] Top {args.top} configuraciones (score = retorno/max_dd):")
    print(f"\n{'#':<3} {'Score':>6} {'WR':>6} {'Ret':>7} {'PF':>5} {'Sharpe':>7} {'DD':>5} {'Trades':>6}  "
          f"Oversold  SMA   ExitRSI  MaxHold")
    print("-" * 90)

    for i, r in enumerate(resultados[:args.top]):
        p = r["params"]
        print(f"{i+1:<3} {r['score']:>6.2f} {r['wr']:>5.1f}% {r['retorno']:>+6.2f}% "
              f"{r['pf']:>4.2f} {r['sharpe']:>6.3f} {r['max_dd']:>4.2f}% "
              f"{r['trades']:>5}   "
              f"RSI<{p['oversold']:>2}  SMA{p['sma']:>3}  "
              f"{p['exit_rsi']:>3}    {p['max_hold']:>3}d")

    # Mejor config
    best = resultados[0]
    print(f"\n  {'='*55}")
    print(f"  MEJOR CONFIGURACION ENCONTRADA")
    print(f"  {'='*55}")
    print(f"  RSI oversold:     < {best['params']['oversold']}")
    print(f"  Trend SMA:        {best['params']['sma']}")
    print(f"  RSI exit:         {best['params']['exit_rsi']}")
    print(f"  Max hold:         {best['params']['max_hold']} dias")
    print(f"  {'─'*30}")
    print(f"  Win Rate:         {best['wr']:.1f}%")
    print(f"  Retorno:          {best['retorno']:+.2f}%")
    print(f"  Profit Factor:    {best['pf']:.2f}")
    print(f"  Sharpe:           {best['sharpe']:.3f}")
    print(f"  Max DD:           {best['max_dd']:.2f}%")
    print(f"  Score (Ret/DD):   {best['score']:.2f}")
    print(f"  Trades:           {best['trades']}")
    print(f"  Trades/año:       {best['trades'] / max(len(df)/252, 1):.1f}")
    print(f"  {'='*55}")

    if args.save:
        output = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "grid": GRID,
            "total_combinaciones": total,
            "tiempo_seg": round(elapsed, 1),
            "objetivo_ranking": "score = retorno/max_dd (tipo Calmar)",
            "top_10": resultados[:10],
            "mejor_config": best,
        }
        ruta = os.path.join(os.path.dirname(__file__), "results",
                            f"optimizacion_rsi2_spy.json")
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\n  Resultados guardados: {ruta}")


if __name__ == "__main__":
    main()
