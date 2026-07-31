"""
validar_rsi2_spy_walkforward.py — VALIDACIÓN WALK-FORWARD RSI(2) SPY
====================================================================
Objetivo: descartar OVERFITTING del grid de 54 combos que eligió la config
ganadora RSI<8, SMA200, exit 50, hold 8 (score = retorno/max_dd).

Metodología (anclada/expanding — datos diarios 2014→2026):
  W1: Train 2014→2018 | Test 2018→2020
  W2: Train 2014→2020 | Test 2020→2022
  W3: Train 2014→2022 | Test 2022→2024
  W4: Train 2014→2024 | Test 2024→2026

Por ventana:
  1. Grid search de 54 combos SOLO sobre trades del período train
  2. Mejor combo por score retorno/max_dd (mismo criterio que la optimización)
  3. Evaluar ese combo sobre trades del período test (out-of-sample)
  4. WF Ratio = OOS_WR / IS_WR  (objetivo > 0.90; < 0.90 = overfit severo)

Además:
  - Performance OOS de la config ganadora original (RSI<8, exit 50, hold 8)
  - Estabilidad de parámetros entre ventanas (robusto si aparece ≥3/4)
  - Split simple 80/20 como sanity check adicional
  - Comparación OOS vs mediana del grid (¿el ganador supera a la mediana?)

Uso:
    python backtesting/validar_rsi2_spy_walkforward.py
    python backtesting/validar_rsi2_spy_walkforward.py --save
"""

import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.rsi2_spy_system import (
    cargar_datos_spy, precomputar_indicadores, detectar_senal,
    COST_ROUNDTRIP, CAPITAL_INICIAL, TAMANO_POSICION,
)
from optimizar_rsi2_spy import GRID, verificar_salida_rsi_r2

# =============================================================================
# CONFIGURACIÓN WFA
# =============================================================================

# Ventanas [trainStart, trainEnd = testStart, testEnd]
WINDOWS = [
    {"id": "W1", "trainStart": "2014-01-01", "trainEnd": "2018-01-01", "testEnd": "2020-01-01"},
    {"id": "W2", "trainStart": "2014-01-01", "trainEnd": "2020-01-01", "testEnd": "2022-01-01"},
    {"id": "W3", "trainStart": "2014-01-01", "trainEnd": "2022-01-01", "testEnd": "2024-01-01"},
    {"id": "W4", "trainStart": "2014-01-01", "trainEnd": "2024-01-01", "testEnd": "2026-07-31"},
]

# Umbrales de aprobación OOS (conservadores, diarios)
MIN_WR_OOS = 55.0     # WR mínimo out-of-sample (%)
MIN_TRADES_OOS = 10   # mínimo de trades en el test
MIN_PF_OOS = 1.10
MIN_RETORNO_OOS = 0.0 # retorno OOS positivo

# Config ganadora del grid (a validar específicamente)
# Claves alineadas con el GRID de optimizar_rsi2_spy.py
CONFIG_GANADORA = {"oversold_threshold": 8, "trend_sma_period": 200,
                   "rsi_exit_threshold": 50, "max_hold_days": 8}


# =============================================================================
# BACKTEST DETALLADO (retorna trades con fecha de entrada)
# =============================================================================

def run_backtest_detallado(df, oversold, sma_period, exit_rsi, max_hold,
                           capital=CAPITAL_INICIAL, costos=COST_ROUNDTRIP,
                           con_equity_diaria=False):
    """
    Mismo motor que backtest_con_parametros, pero devuelve la lista de trades
    con fecha de entrada/salida y pnl neto % para poder filtrarlos por ventana.
    Sin look-ahead: los indicadores en i solo usan datos hasta i.

    Si con_equity_diaria=True, además inserta en la lista un diccionario
    reservado "__equity" con la curva de equity SIMULADA día a día (un valor
    por barra, usando solo información hasta esa barra), para poder computar el
    Sharpe diario honesto (sin el artefacto de muestreo disperso).
    """
    cfg = {
        "rsi_period": 2,
        "oversold_threshold": oversold,
        "overbought_threshold": 100 - oversold,
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
    equity_curve = []   # curva diaria simulada (solo si con_equity_diaria)
    position = None
    start_idx = max(sma_period + 10, cfg["atr_period"] + 10)

    for i in range(start_idx, len(df)):
        bar = df.iloc[i]
        price = float(bar["close"])
        atr_val = indicators["atr"][i]

        # Equity día a día ANTES del chequeo de ATR: se registra en TODAS las
        # barras para que la curva alinee con df.index[start_idx:] (si va tras
        # el continue, el conteo se desalinea cuando hay ATR inválido)
        if con_equity_diaria:
            equity_curve.append(sim_capital)

        if pd.isna(atr_val) or atr_val <= 0:
            continue

        # Gestionar posicion abierta
        if position:
            pnl_pct = (price - position["entry_price"]) / position["entry_price"] * 100
            if position["direction"] == "SHORT":
                pnl_pct = -pnl_pct

            days_held = i - position["entry_idx"]
            exit_reason = None

            if verificar_salida_rsi_r2(i, position, indicators, exit_rsi):
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
                    "pnl_pct": round(pnl_neto, 4),   # neto de costos
                    "exit_reason": exit_reason,
                    "direction": position["direction"],
                    "fecha_entrada": df.index[position["entry_idx"]],
                    "fecha_salida": df.index[i],
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

    # Cerrar ultima
    if position:
        fp = float(df["close"].iloc[-1])
        pnl_pct = (fp - position["entry_price"]) / position["entry_price"] * 100
        if position["direction"] == "SHORT":
            pnl_pct = -pnl_pct
        pnl_neto = pnl_pct - costos * 100
        trades.append({
            "pnl_amt": round(position["size"] * pnl_neto / 100, 2),
            "pnl_pct": round(pnl_neto, 4),
            "exit_reason": "END",
            "direction": position["direction"],
            "fecha_entrada": df.index[position["entry_idx"]],
            "fecha_salida": df.index[-1],
        })

    if con_equity_diaria:
        # La curva ya quedó completa: el append dentro del bucle registró una
        # entrada por barra en TODAS las barras (antes del chequeo de ATR),
        # incluyendo el equity final tras el cierre. Sin append extra aquí.
        # Diccionario reservado: no es un trade (se filtra en metricas_trades)
        trades.append({"__equity": pd.Series(equity_curve, index=df.index[start_idx:len(df)])})

    return trades


# =============================================================================
# MÉTRICAS SOBRE TRADES FILTRADOS
# =============================================================================

def sharpe_diario(equity_curve):
    """
    Sharpe sobre la curva de equity diaria real (un valor por barra).
    Mismo enfoque que la corrección #1 del sistema: sin muestreo disperso.
    Retorna (sharpe, n_dias) o (None, 0) si la curva es insuficiente.
    """
    if equity_curve is None or len(equity_curve) < 30:
        return None, 0
    eq = pd.Series(equity_curve, dtype=float)
    rets = eq.pct_change().dropna()
    rets = rets.replace([np.inf, -np.inf], 0.0)
    if len(rets) < 20 or rets.std() <= 0:
        return None, len(eq)
    sharpe = float(np.sqrt(252) * rets.mean() / rets.std())
    return sharpe, len(eq)


def metricas_trades(trades, capital=CAPITAL_INICIAL, equity_curve=None):
    """
    Calcula WR, PF, retorno compuesto 5%, max_dd y score retorno/max_dd.

    - El Sharpe se calcula sobre la curva de equity DIARIA si se pasa
      equity_curve (honesto, comparable con el optimizador). Si no se pasa,
      se reporta un "sharpe_trade" informativo sobre la serie comprimida de
      trades y se marca como tal — NO es comparable con el Sharpe diario.
    - El WFA decide con score = retorno/max_dd (mismo criterio que la
      optimización), nunca con el Sharpe.
    """
    if not trades:
        return None

    # Ordenar cronologicamente
    trades = sorted(trades, key=lambda t: t["fecha_entrada"])

    sim = capital
    peak = capital
    max_dd = 0.0
    for t in trades:
        sim += t["pnl_amt"]
        if sim > peak:
            peak = sim
        dd = ((peak - sim) / peak) * 100
        if dd > max_dd:
            max_dd = dd

    total = len(trades)
    winners = [t for t in trades if t["pnl_amt"] > 0]
    losers = [t for t in trades if t["pnl_amt"] <= 0]
    wr = (len(winners) / total * 100) if total > 0 else 0
    ret = ((sim - capital) / capital) * 100
    gp = sum(t["pnl_amt"] for t in winners)
    gl = abs(sum(t["pnl_amt"] for t in losers))
    pf = gp / gl if gl > 0 else (gp if gp > 0 else 0)

    # Sharpe diario honesto (si hay curva) o informativo por trade
    if equity_curve is not None:
        sharpe, _ = sharpe_diario(equity_curve)
        sharpe_tipo = "diario"
    else:
        eq_series = pd.Series([capital] + [t["pnl_amt"] for t in trades]).cumsum()
        rets = eq_series.pct_change().dropna()
        sharpe = float(np.sqrt(252) * rets.mean() / max(rets.std(), 0.0001))
        sharpe_tipo = "trade_informativo"

    # Score tipo Calmar (mismo criterio que optimizacion #3)
    dd = max(max_dd, 0.01)
    score = ret / dd

    return {
        "trades": total,
        "wr": round(wr, 2),
        "pf": round(pf, 2),
        "retorno": round(ret, 2),
        "max_dd": round(max_dd, 2),
        "sharpe": round(sharpe, 3) if sharpe is not None else None,
        "sharpe_tipo": sharpe_tipo,
        "score": round(score, 2),
    }


# =============================================================================
# WALK-FORWARD
# =============================================================================

def expandir_grid(grid):
    keys = list(grid.keys())
    combos = [{}]
    for key in keys:
        nuevos = []
        for val in grid[key]:
            for c in combos:
                nuevos.append({**c, key: val})
        combos = nuevos
    return combos


def ejecutar_walkforward(df, windows, config_ganadora, grid_cache):
    """
    grid_cache: dict {(oversold_threshold, trend_sma_period, rsi_exit_threshold, max_hold_days): trades} ya calculado
    UNA sola vez fuera del bucle de ventanas (los trades se filtran por
    fecha_entrada después).
    """
    combos = expandir_grid(GRID)
    resultados = []

    for win in windows:
        t0 = time.time()
        print(f"\n{'='*60}")
        print(f"📅 Ventana {win['id']}: Train [{win['trainStart']} → {win['trainEnd']}] | "
              f"Test [{win['trainEnd']} → {win['testEnd']}]")
        print(f"{'='*60}")

        train_end = pd.Timestamp(win["trainEnd"])
        test_end = pd.Timestamp(win["testEnd"])

        # 1) OPTIMIZAR EN TRAIN
        mejor_score = -1e9
        mejor_combo = None
        is_metrics = None
        for combo in combos:
            trades = grid_cache[(combo["oversold_threshold"], combo["trend_sma_period"], combo["rsi_exit_threshold"], combo["max_hold_days"])]
            train_trades = [t for t in trades if t["fecha_entrada"] < train_end]
            m = metricas_trades(train_trades)
            if not m or m["trades"] < 15:  # minimo de trades en train
                continue
            if m["score"] > mejor_score:
                mejor_score = m["score"]
                mejor_combo = combo
                is_metrics = m

        if mejor_combo is None:
            print("  ❌ Ningún combo válido en train")
            resultados.append({"window": win, "status": "NO_CONFIG"})
            continue

        print(f"  ✅ Mejor combo in-sample: RSI<{mejor_combo['oversold_threshold']} | SMA{mejor_combo['trend_sma_period']} | "
              f"exit {mejor_combo['rsi_exit_threshold']} | hold {mejor_combo['max_hold_days']} | "
              f"WR {is_metrics['wr']}% | PF {is_metrics['pf']} | {is_metrics['trades']} trades | score {is_metrics['score']}")

        # 2) TEST OUT-OF-SAMPLE con el mejor combo
        trades = grid_cache[(mejor_combo["oversold_threshold"], mejor_combo["trend_sma_period"], mejor_combo["rsi_exit_threshold"], mejor_combo["max_hold_days"])]
        oos_trades = [t for t in trades if train_end <= t["fecha_entrada"] < test_end]
        oos_metrics = metricas_trades(oos_trades)

        # 3) Config ganadora fija en OOS
        g = config_ganadora
        trades_g = grid_cache[(g["oversold_threshold"], g["trend_sma_period"], g["rsi_exit_threshold"], g["max_hold_days"])]
        oos_trades_g = [t for t in trades_g if train_end <= t["fecha_entrada"] < test_end]
        oos_metrics_g = metricas_trades(oos_trades_g)

        if oos_metrics and oos_metrics["trades"] >= MIN_TRADES_OOS:
            wf_ratio = round(oos_metrics["wr"] / max(is_metrics["wr"], 0.01), 3)
            approved = (oos_metrics["wr"] >= MIN_WR_OOS and
                        oos_metrics["trades"] >= MIN_TRADES_OOS and
                        oos_metrics["pf"] >= MIN_PF_OOS and
                        oos_metrics["retorno"] >= MIN_RETORNO_OOS)
            status = "APPROVED" if approved else "REJECTED"
            overfit = " ⚠️ overfit" if wf_ratio < 0.90 else ""
            print(f"  📈 OOS mejor combo: WR {oos_metrics['wr']}% | PF {oos_metrics['pf']} | "
                  f"retorno {oos_metrics['retorno']:+.2f}% | {oos_metrics['trades']} trades | "
                  f"WF Ratio {wf_ratio}{overfit} | {status}")
        else:
            status = "NO_OOS_TRADES" if not oos_metrics else f"FEW_TRADES({oos_metrics['trades']})"
            oos_metrics = oos_metrics or {"trades": 0, "wr": 0, "pf": 0, "retorno": 0, "max_dd": 0, "sharpe": 0, "sharpe_tipo": "trade_informativo", "score": 0}
            wf_ratio = None
            print(f"  ⚠️  OOS insuficiente: {status}")

        # Config ganadora fija (nota: Sharpe aquí es informativo por trade;
        # el Sharpe diario honesto se calcula agregado en resumen_wf)
        if oos_metrics_g and oos_metrics_g["trades"] >= MIN_TRADES_OOS:
            print(f"  🏆 Config ganadora (RSI<8, exit 50) OOS: WR {oos_metrics_g['wr']}% | "
                  f"PF {oos_metrics_g['pf']} | retorno {oos_metrics_g['retorno']:+.2f}% | "
                  f"{oos_metrics_g['trades']} trades")
        else:
            oos_metrics_g = oos_metrics_g or {"trades": 0, "wr": 0, "pf": 0, "retorno": 0, "max_dd": 0, "sharpe": 0, "sharpe_tipo": "trade_informativo", "score": 0}
            print(f"  🏆 Config ganadora OOS: insuficiente ({oos_metrics_g['trades']} trades)")

        # 4) Mediana del grid en OOS (¿el ganador supera a la mediana?)
        oos_scores = []
        for combo in combos:
            trades_c = grid_cache[(combo["oversold_threshold"], combo["trend_sma_period"], combo["rsi_exit_threshold"], combo["max_hold_days"])]
            oos_t = [t for t in trades_c if train_end <= t["fecha_entrada"] < test_end]
            m = metricas_trades(oos_t)
            if m and m["trades"] >= MIN_TRADES_OOS:
                oos_scores.append(m["score"])
        mediana_grid = round(float(np.median(oos_scores)), 2) if oos_scores else None
        if mediana_grid is not None:
            ventaja = (oos_metrics.get("score", 0) - mediana_grid)
            print(f"  📊 Mediana del grid OOS: {mediana_grid} | Ventaja del ganador: {ventaja:+.2f}")

        resultados.append({
            "window": win,
            "status": status,
            "bestParams": mejor_combo,
            "inSample": is_metrics,
            "outSample": oos_metrics,
            "wfRatio": wf_ratio,
            "configGanadoraOOS": oos_metrics_g,
            "medianaGridOOS": mediana_grid,
            "approved": status == "APPROVED",
        })
        print(f"  ⏱  {time.time()-t0:.1f}s")

    return resultados


def resumen_wf(resultados, df):
    # Config ganadora fija OOS agregada (con Sharpe DIARIO honesto)
    g = CONFIG_GANADORA
    trades_g = run_backtest_detallado(df, g["oversold_threshold"], g["trend_sma_period"],
                                      g["rsi_exit_threshold"], g["max_hold_days"],
                                      con_equity_diaria=True)
    equity_g = trades_g[-1].get("__equity") if trades_g and "__equity" in trades_g[-1] else None
    trades_real = [t for t in trades_g if "__equity" not in t]

    print(f"\n{'─'*70}")
    print("📋 RESUMEN WALK-FORWARD — RSI(2) SPY (4 ventanas)")
    print(f"{'─'*70}")
    print(f"  {'Ventana':<8} {'IS WR':<8} {'OOS WR':<8} {'WF Ratio':<9} {'OOS retorno':<12} {'Estado'}")
    print(f"  {'─'*60}")
    for r in resultados:
        if r.get("outSample") is None or r.get("wfRatio") is None:
            print(f"  {r['window']['id']:<8} {'N/A':<8} {'N/A':<8} {'N/A':<9} {'N/A':<12} {r['status']}")
            continue
        o = r["outSample"]
        is_ = r["inSample"]
        print(f"  {r['window']['id']:<8} {is_['wr']:<7}% {o['wr']:<7}% {r['wfRatio']:<9} "
              f"{o['retorno']:+.2f}%      {r['status']}")

    valid = [r for r in resultados if r.get("outSample") and r.get("wfRatio") is not None]
    if valid:
        avg_is = np.mean([r["inSample"]["wr"] for r in valid])
        avg_oos = np.mean([r["outSample"]["wr"] for r in valid])
        avg_ratio = np.mean([r["wfRatio"] for r in valid])
        approved = sum(1 for r in valid if r["approved"])
        print(f"  {'─'*60}")
        print(f"  PROMEDIO | {avg_is:.1f}% | {avg_oos:.1f}% | {avg_ratio:.3f} | aprobadas {approved}/{len(valid)}")
        print(f"\n  WF Ratio > 0.95 = parámetros robustos | 0.90-0.95 = aceptable | < 0.90 = overfit severo")

    # Estabilidad de parámetros
    print(f"\n  🔬 Estabilidad del mejor combo por ventana:")
    for r in resultados:
        if r.get("bestParams"):
            p = r["bestParams"]
            print(f"    {r['window']['id']}: RSI<{p['oversold_threshold']} | SMA{p['trend_sma_period']} | "
                  f"exit {p['rsi_exit_threshold']} | hold {p['max_hold_days']}")

    # OOS = ventanas de test concatenadas (2018→2026)
    test_start = pd.Timestamp("2018-01-01")
    oos_all = [t for t in trades_real if t["fecha_entrada"] >= test_start]
    m_all = metricas_trades(oos_all)
    # Sharpe diario honesto para el tramo OOS y el tramo IS
    eq_oos = equity_g[equity_g.index >= test_start] if equity_g is not None else None
    eq_train = equity_g[equity_g.index < test_start] if equity_g is not None else None
    sharpe_oos, n_oos = sharpe_diario(eq_oos)
    sharpe_train, n_train = sharpe_diario(eq_train)
    if m_all:
        s_str = f"{sharpe_oos:.3f} (diario, {n_oos} días)" if sharpe_oos is not None else "N/A"
        print(f"    WR {m_all['wr']}% | PF {m_all['pf']} | retorno {m_all['retorno']:+.2f}% | "
              f"DD {m_all['max_dd']}% | Sharpe {s_str} | {m_all['trades']} trades (2018→2026)")
        train_all = [t for t in trades_real if t["fecha_entrada"] < test_start]
        m_train = metricas_trades(train_all)
        if m_train and m_train["trades"] > 0:
            wf_ratio = m_all["wr"] / max(m_train["wr"], 0.01)
            s_train_str = f"{sharpe_train:.3f} (diario, {n_train} días)" if sharpe_train is not None else "N/A"
            print(f"    IS (2014→2018): WR {m_train['wr']}% | Sharpe {s_train_str} | {m_train['trades']} trades → WF Ratio global: {wf_ratio:.3f}")
    print(f"{'─'*70}")


def split_simple_80_20(df, config_ganadora):
    """Sanity check adicional: split temporal 80/20 (con Sharpe diario)."""
    print(f"\n{'─'*70}")
    print("📐 SPLIT SIMPLE 80/20 (sanity check)")
    print(f"{'─'*70}")
    g = config_ganadora
    trades = run_backtest_detallado(df, g["oversold_threshold"], g["trend_sma_period"],
                                    g["rsi_exit_threshold"], g["max_hold_days"],
                                    con_equity_diaria=True)
    equity = trades[-1].get("__equity") if trades and "__equity" in trades[-1] else None
    trades_real = [t for t in trades if "__equity" not in t]
    n = len(trades_real)
    if n == 0:
        print("  Sin trades")
        return None
    cutoff = sorted(t["fecha_entrada"] for t in trades_real)[int(n * 0.8)]
    train = [t for t in trades_real if t["fecha_entrada"] < cutoff]
    test = [t for t in trades_real if t["fecha_entrada"] >= cutoff]
    m_train = metricas_trades(train)
    m_test = metricas_trades(test)
    # Sharpe diario honesto por tramo
    eq_train = equity[equity.index < cutoff] if equity is not None else None
    eq_test = equity[equity.index >= cutoff] if equity is not None else None
    s_train, _ = sharpe_diario(eq_train)
    s_test, _ = sharpe_diario(eq_test)
    print(f"  Train: {len(train)} trades | {m_train['wr']}% WR | {m_train['retorno']:+.2f}% retorno | "
          f"Sharpe {f'{s_train:.3f}' if s_train is not None else 'N/A'} (diario)")
    print(f"  Test : {len(test)} trades | {m_test['wr']}% WR | {m_test['retorno']:+.2f}% retorno | "
          f"Sharpe {f'{s_test:.3f}' if s_test is not None else 'N/A'} (diario)")
    if m_train and m_test and m_train["trades"] > 0:
        ratio = m_test["wr"] / max(m_train["wr"], 0.01)
        print(f"  WF Ratio (test/train): {ratio:.3f} {'✅ robusto' if ratio >= 0.90 else '⚠️ posible overfit'}")
    return {"cutoff": str(cutoff.date()), "train": m_train, "test": m_test,
            "wfRatio": round(ratio, 3) if m_train and m_test and m_train['trades'] > 0 else None,
            "sharpe_diario": {"train": round(s_train, 3) if s_train is not None else None,
                               "test": round(s_test, 3) if s_test is not None else None}}


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Validar RSI(2) SPY con walk-forward")
    parser.add_argument("--save", action="store_true", help="Guardar resultados JSON")
    args = parser.parse_args()

    print("=" * 70)
    print("  VALIDACIÓN WALK-FORWARD: RSI(2) SPY (anti-overfitting del grid)")
    print("=" * 70)

    df = cargar_datos_spy()
    # Normalizar a tz-naive: cargar_datos_spy devuelve Timestamps con offset
    # fijo (UTC-05:00/UTC-04:00 según DST) que rompe la comparación con las
    # ventanas tz-naive de WINDOWS. tz_localize(None) conserva la hora local.
    df.index = pd.DatetimeIndex([ts.tz_localize(None) for ts in df.index])
    print(f"  {len(df)} velas diarias | {df.index[0].date()} → {df.index[-1].date()}")

    print("\n[1/3] Pre-calculando backtests de los 54 combos (una sola vez)...")
    combos = expandir_grid(GRID)
    grid_cache = {}
    t_grid = time.time()
    for combo in combos:
        key = (combo["oversold_threshold"], combo["trend_sma_period"],
               combo["rsi_exit_threshold"], combo["max_hold_days"])
        grid_cache[key] = run_backtest_detallado(df, combo["oversold_threshold"],
                                                 combo["trend_sma_period"],
                                                 combo["rsi_exit_threshold"],
                                                 combo["max_hold_days"])
    print(f"  {len(combos)} combos pre-calculados en {time.time()-t_grid:.1f}s")

    print("\n[2/3] Ejecutando walk-forward (4 ventanas)...")
    resultados = ejecutar_walkforward(df, WINDOWS, CONFIG_GANADORA, grid_cache)

    print("\n[3/3] Split simple 80/20...")
    split = split_simple_80_20(df, CONFIG_GANADORA)

    print("\n[4/4] Resumen final...")
    resumen_wf(resultados, df)

    if args.save:
        output = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "sistema": "RSI2_SPY",
            "metodologia": "Walk-forward anclado (expanding) + split 80/20",
            "nota_sharpe": "En resultados_wf el sharpe es informativo por trade (curva dispersa); el Sharpe DIARIO honesto se reporta en split_80_20 y en el resumen agregado.",
            "nota_metodologica": "Los trades se generan sobre el dataset completo (indicadores causales, sin look-ahead) y se filtran por fecha_entrada. El PnL en USD del período OOS compone desde el capital de 2014 (mismo sizing 5% del sistema real), NO parte de un capital dedicado al test window. WR/PF/score por trade son robustos a esto; el retorno OOS debe interpretarse como el retorno de la config ganadora dentro del sistema completo, no como retorno de un capital aislado. La curva __equity registra el capital realizado sim_capital al INICIO de cada barra (sin mark-to-market y sin reflejar el trade final 'END' del cierre del dataset); el Sharpe diario es por tanto aproximado y puede diferir ligeramente del retorno reportado por trades. La decisión WFA usa score retorno/max_dd por trade, nunca el Sharpe de curva.",
            "windows": [w for w in WINDOWS],
            "config_ganadora": CONFIG_GANADORA,
            "umbrales": {
                "min_wr_oos": MIN_WR_OOS,
                "min_trades_oos": MIN_TRADES_OOS,
                "min_pf_oos": MIN_PF_OOS,
                "wf_ratio_overfit": 0.90,
            },
            "resultados_wf": resultados,
            "split_80_20": split,
            "summary": {
                "ventanas_aprobadas": sum(1 for r in resultados if r["approved"]),
                "total_ventanas": len(resultados),
            },
        }
        ruta = os.path.join(os.path.dirname(__file__), "results",
                            "validacion_walkforward_rsi2_spy.json")
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False, default=str)
        print(f"\n💾 Resultados guardados: {ruta}")


if __name__ == "__main__":
    main()
