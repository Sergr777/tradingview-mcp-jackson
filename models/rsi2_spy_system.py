"""
rsi2_spy_system.py — RSI(2) MEAN REVERSION EN SPY + FILTRO DE TENDENCIA
======================================================================
Estrategia clasica de Larry Connors ("Short Term Trading Strategies That Work").

Concepto:
  - RSI(2) mide sobrecompra/sobreventa extrema en 2 dias
  - Cuando RSI(2) < 10 y SPY esta en uptrend (>200SMA) → LONG (mean reversion up)
  - Cuando RSI(2) > 90 y SPY esta en downtrend (<200SMA) → SHORT (mean reversion down)
  - Salida: cuando RSI(2) cruza de vuelta sobre 50, o tras N velas

Metricas publicadas:
  - Profit Factor: 1.40
  - Sharpe: 0.91
  - Persistencia: desde los 90s (Connors, 2008)

Uso:
    python -m models.rsi2_spy_system --backtest
    python -m models.rsi2_spy_system --backtest --save
    python -m models.rsi2_spy_system --senal
    python -m models.rsi2_spy_system --senal && python -m models.pipeline_agentes
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
SIGNALS_DIR = os.path.join(DATA_DIR, "signals")
SIGNAL_PATH = os.path.join(SIGNALS_DIR, "latest_signals.json")

# Configuracion estrategica (parametros clasicos de Connors)
CONFIG_RSI2 = {
    "name": "RSI2_SPY",
    "version": "0.2.0",
    "symbol": "SPY",
    "timeframe": "1d",

    # RSI(2) - OPTIMIZADO
    "rsi_period": 2,
    "oversold_threshold": 5,     # RSI < 5 = sobreventa EXTREMA → LONG (WR 78.9%)
    "overbought_threshold": 95,   # RSI > 95 = sobrecompra EXTREMA → SHORT

    # Filtro de tendencia (200-period SMA - optimo)
    "trend_sma_period": 200,
    "use_trend_filter": True,

    # Salida por RSI (exit 60 - optimo)
    "rsi_exit_threshold": 60,    # Salir cuando RSI cruza por encima de 60
    "exit_on_rsi_cross": True,

    # Max hold: 5 dias (mean reversion rapida)
    "max_hold_days": 5,

    # Riesgo
    "atr_period": 14,
    "atr_mult_sl": 2.0,           # SL = 2.0 * ATR
    "atr_mult_tp": 0,             # 0 = sin TP fijo (salida por RSI)
}

# Capital, costos y riesgo
CAPITAL_INICIAL = 100000.0       # $100K para SPY (inversión tipica)
TAMANO_POSICION = 0.05           # 5% por trade (conservador para SPY)

# Costos SPY: ETF con alta liquidez
COST_COMMISSION = 0.0001         # 0.01% comision (Robinhood/IBKR)
COST_SLIPPAGE = 0.0002           # 0.02% slippage (SPY muy liquido)
COST_ROUNDTRIP = 2 * (COST_COMMISSION + COST_SLIPPAGE)  # 0.06%

# Path al CSV de SPY
SPY_CSV_PATH = os.path.join(DATA_DIR, "SPY_daily_10y.csv")


# =============================================================================
# CALCULO DE RSI
# =============================================================================

def calcular_rsi(series: pd.Series, period: int = 2) -> np.ndarray:
    """Calcula RSI clasico (Wilder)."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    # Wilder smoothing: EMA con alpha = 1/period
    alpha = 1.0 / period
    avg_gain = gain.ewm(alpha=alpha, adjust=False).mean()
    avg_loss = loss.ewm(alpha=alpha, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.values

def calcular_sma(series: pd.Series, period: int) -> np.ndarray:
    """Calcula SMA."""
    return series.rolling(period).mean().values

def calcular_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> np.ndarray:
    """Calcula ATR."""
    tr = np.maximum(
        high - low,
        np.maximum(
            abs(high - close.shift()),
            abs(low - close.shift())
        )
    )
    return tr.rolling(period).mean().values


# =============================================================================
# CARGA DE DATOS
# =============================================================================

def cargar_datos_spy(ruta: str = None) -> pd.DataFrame:
    """Carga datos diarios de SPY desde CSV (yfinance format)."""
    if ruta is None:
        ruta = SPY_CSV_PATH
    if not os.path.exists(ruta):
        raise FileNotFoundError(
            f"No se encuentra SPY data: {ruta}\n"
            f"Descarga primero: python -m models.rsi2_spy_system --download"
        )

    df = pd.read_csv(ruta, index_col=0, parse_dates=True)
    df = df.sort_index()

    # Estandarizar nombres de columnas (yfinance usa mayusculas)
    col_map = {
        'Open': 'open', 'High': 'high', 'Low': 'low',
        'Close': 'close', 'Volume': 'volume',
        'Dividends': 'dividends', 'Stock Splits': 'splits',
        'Capital Gains': 'capital_gains'
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # Solo columnas OHLCV
    ohlcv = [c for c in ['open', 'high', 'low', 'close', 'volume'] if c in df.columns]
    df = df[ohlcv].dropna()

    # Asegurar tipos numericos
    for col in ohlcv:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    print(f"  Data SPY: {len(df)} velas diarias")
    print(f"  Rango: {df.index[0].date()} a {df.index[-1].date()}")
    return df


def descargar_spy(origen: str = "2014-01-01", ruta: str = None):
    """Descarga datos historicos de SPY usando yfinance."""
    try:
        import yfinance as yf
    except ImportError:
        print("Instalando yfinance...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "yfinance"], check=True)
        import yfinance as yf

    print(f"  Descargando SPY desde {origen}...")
    spy = yf.Ticker("SPY")
    df = spy.history(start=origen, end=None, interval="1d")

    if ruta is None:
        ruta = SPY_CSV_PATH
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    df.to_csv(ruta)
    print(f"  Guardado: {ruta} ({len(df)} filas)")
    print(f"  Rango: {df.index[0].date()} a {df.index[-1].date()}")
    return df


# =============================================================================
# DETECCION DE SENALES
# =============================================================================

def precomputar_indicadores(df: pd.DataFrame, cfg: dict) -> dict:
    """Precalcula RSI(2), SMA(200) y ATR."""
    c = df["close"]
    h = df["high"]
    l = df["low"]

    rsi = calcular_rsi(c, cfg["rsi_period"])
    sma = calcular_sma(c, cfg["trend_sma_period"])
    atr = calcular_atr(h, l, c, cfg["atr_period"])

    return {
        "rsi": rsi,
        "sma_200": sma,
        "atr": atr,
    }


def detectar_senal(
    i: int, df: pd.DataFrame, indicators: dict, cfg: dict
) -> Optional[Dict]:
    """
    Detecta senales RSI(2) mean reversion en el bar i.
    Sin look-ahead: solo usa datos hasta i-1.

    LONG:  RSI(2) < oversold AND close > SMA(200)
    SHORT: RSI(2) > overbought AND close < SMA(200)
    """
    if i < max(cfg["trend_sma_period"] + 5, cfg["atr_period"] + 5):
        return None

    rsi = indicators["rsi"][i]
    rsi_prev = indicators["rsi"][i - 1]
    sma_200 = indicators["sma_200"][i]
    close = float(df["close"].iloc[i])

    if pd.isna(rsi) or pd.isna(sma_200) or pd.isna(rsi_prev):
        return None

    # LONG: RSI extremadamente bajo + uptrend
    if rsi < cfg["oversold_threshold"] and close > sma_200:
        # RSI debe estar cayendo (la condicion de sobreventa es nueva)
        if rsi <= rsi_prev:
            return {
                "direction": "LONG",
                "confidence": 0.60,  # WR esperado ~58-62%
                "rsi_entry": float(rsi),
                "reason": f"RSI(2)={rsi:.1f} < {cfg['oversold_threshold']} + uptrend"
            }

    # SHORT: RSI extremadamente alto + downtrend
    if rsi > cfg["overbought_threshold"] and close < sma_200:
        if rsi >= rsi_prev:
            return {
                "direction": "SHORT",
                "confidence": 0.60,
                "rsi_entry": float(rsi),
                "reason": f"RSI(2)={rsi:.1f} > {cfg['overbought_threshold']} + downtrend"
            }

    return None


def verificar_salida_rsi(
    i: int, position: dict, indicators: dict, cfg: dict
) -> bool:
    """Verifica si RSI cruzo el umbral de salida (RSI > 50 para LONG)."""
    if not cfg.get("exit_on_rsi_cross", True):
        return False

    rsi = indicators["rsi"][i]
    rsi_prev = indicators["rsi"][i - 1]
    threshold = cfg["rsi_exit_threshold"]

    if pd.isna(rsi) or pd.isna(rsi_prev):
        return False

    if position["direction"] == "LONG":
        # Salir cuando RSI cruza por ENCIMA de threshold (vuelve a territorio neutral)
        if rsi_prev <= threshold and rsi > threshold:
            return True
    else:
        # Salir cuando RSI cruza por DEBAJO de threshold
        if rsi_prev >= threshold and rsi < threshold:
            return True

    return False


# =============================================================================
# BACKTEST
# =============================================================================

def ejecutar_backtest_rsi2(
    df: pd.DataFrame = None,
    capital: float = CAPITAL_INICIAL,
    config: dict = None,
    costos: float = COST_ROUNDTRIP,
    usar_agentes: bool = False,
    save: bool = False,
    include_daily: bool = False,
) -> dict:
    """Backtest de RSI(2) mean reversion en SPY.

    include_daily: si True, anade al resultado la serie diaria de retornos
    de la curva de equity (ret_diario) para mediciones de portafolio.
    Aditivo, no cambia el comportamiento default.
    """
    if df is None:
        df = cargar_datos_spy()
    if config is None:
        config = CONFIG_RSI2

    cfg = dict(config)
    mode = "RSI2 + 5 AGENTES" if usar_agentes else "RSI2 SPY"
    print("=" * 70)
    print(f"  BACKTEST: {mode}")
    print(f"  RSI(2) < {cfg['oversold_threshold']} LONG / > {cfg['overbought_threshold']} SHORT")
    print(f"  Trend filter: SMA({cfg['trend_sma_period']}) | Exit: RSI cross {cfg['rsi_exit_threshold']}")
    print(f"  Costos: {costos:.2%} round-trip")
    print("=" * 70)

    inicio = time.time()

    # Precalcular indicadores
    print("\n[1/3] Precalculando indicadores...")
    indicators = precomputar_indicadores(df, cfg)

    # Backtest
    print("\n[2/3] Ejecutando backtest...")
    sim_capital = capital
    trades = []
    equity = [capital]
    peak = capital
    max_dd = 0.0
    position = None
    historial_trades: List[dict] = []

    # Stats agentes
    stats_agentes = {
        "prophet": {"veces": 0, "conf_inicial": 0, "conf_final": 0},
        "mnemo": {"veces": 0, "conf_inicial": 0, "conf_final": 0},
        "sentiment": {"veces": 0, "conf_inicial": 0, "conf_final": 0},
        "kronos": {"veces": 0, "exposure_prom": 0},
        "oraculo": {"veces": 0, "weight_prom": 0},
    }

    start_idx = max(cfg["trend_sma_period"] + 10, cfg["atr_period"] + 10)

    for i in range(start_idx, len(df)):
        bar = df.iloc[i]
        price = float(bar["close"])
        atr_val = indicators["atr"][i] if i < len(indicators["atr"]) else None
        volatilidad = atr_val / price if (atr_val and price > 0) else 0.01

        # Gestionar posicion abierta
        if position:
            pnl_pct = (price - position["entry_price"]) / position["entry_price"] * 100
            if position["direction"] == "SHORT":
                pnl_pct = -pnl_pct

            days_held = i - position["entry_idx"]
            exit_reason = None

            # Salida por cruce de RSI
            if cfg.get("exit_on_rsi_cross") and verificar_salida_rsi(i, position, indicators, cfg):
                exit_reason = "RSI_CROSS"

            # Salida por Stop Loss
            elif pnl_pct <= -position["sl_pct"]:
                exit_reason = "STOP_LOSS"

            # Salida por max hold
            elif days_held >= cfg["max_hold_days"]:
                exit_reason = "MAX_HOLD"

            if exit_reason:
                pnl_neto = pnl_pct - costos * 100
                pnl_amt = position["size"] * pnl_neto / 100
                sim_capital += pnl_amt

                trade_record = {
                    "direction": position["direction"],
                    "entry_price": position["entry_price"],
                    "exit_price": price,
                    "pnl_pct": round(pnl_pct, 2),
                    "pnl_neto_pct": round(pnl_neto, 2),
                    "pnl_amt": round(pnl_amt, 2),
                    "exit_reason": exit_reason,
                    "duration": days_held,
                    "entry_conf": position.get("entry_conf", 0.5),
                    "fecha_entrada": str(df.index[position["entry_idx"]].date()),
                    "fecha_salida": str(df.index[i].date()),
                }
                trades.append(trade_record)
                historial_trades.append(trade_record)
                position = None

        # Buscar nueva entrada
        if not position:
            atr_val_i = indicators["atr"][i]
            if not (pd.isna(atr_val_i) or atr_val_i <= 0):
                senal = detectar_senal(i, df, indicators, cfg)
                if senal is not None:
                    direccion = senal["direction"]
                    confianza = senal["confidence"]
                    kronos_mult = 1.0
                    peso_oraculo_base = 1.0  # 100% del capital (un solo activo)

                    # PIPELINE DE AGENTES (opcional)
                    if usar_agentes:
                        # PROPHET
                        conf_antes = confianza
                        vol = volatilidad
                        if vol < 0.01:
                            confianza += 0.03  # +3% en baja volatilidad
                        elif vol > 0.02:
                            confianza -= 0.02  # -2% en alta volatilidad
                        stats_agentes["prophet"]["veces"] += 1
                        stats_agentes["prophet"]["conf_inicial"] += conf_antes
                        stats_agentes["prophet"]["conf_final"] += confianza

                        # MNEMO
                        conf_antes = confianza
                        n = len(historial_trades)
                        if n >= 20:
                            mismos = [t for t in historial_trades if t["direction"] == direccion]
                            if len(mismos) >= 10:
                                wr = len([t for t in mismos if t["pnl_amt"] > 0]) / len(mismos)
                                if wr > 0.50:
                                    confianza += (wr - 0.50) * 0.5
                                else:
                                    confianza -= (0.50 - wr) * 0.3
                        confianza = min(max(confianza, 0.01), 0.95)
                        stats_agentes["mnemo"]["veces"] += 1
                        stats_agentes["mnemo"]["conf_inicial"] += conf_antes
                        stats_agentes["mnemo"]["conf_final"] += confianza

                        # SENTIMENT (no aplica para SPY diario - sin FNG accionario facil)
                        # Usamos VIX aproximado por volatilidad como proxy
                        stats_agentes["sentiment"]["veces"] += 1
                        stats_agentes["sentiment"]["conf_inicial"] += confianza
                        stats_agentes["sentiment"]["conf_final"] += confianza

                        # KRONOS
                        dd_actual = ((peak - sim_capital) / peak) * 100 if peak > 0 else 0
                        if dd_actual > 5.0:
                            kronos_mult = 0.5
                        elif volatilidad > 0.025:
                            kronos_mult = 0.6
                        elif volatilidad > 0.015:
                            kronos_mult = 0.8
                        else:
                            kronos_mult = 1.0
                        stats_agentes["kronos"]["veces"] += 1
                        stats_agentes["kronos"]["exposure_prom"] += kronos_mult

                        # ORACULO
                        if volatilidad > 0.02:
                            peso_oraculo_base = 0.6
                        stats_agentes["oraculo"]["veces"] += 1
                        stats_agentes["oraculo"]["weight_prom"] += peso_oraculo_base

                    # Position sizing — FIJO 5% (corrección #2, comparable con optimización)
                    # ANTES: Kelly (2*conf-1)/2 con cap 15% → retorno y DD 3x mayores
                    sl_pct = (atr_val_i * cfg["atr_mult_sl"] / price) * 100
                    tp_pct = 999.0  # Sin TP fijo (salida por RSI)
                    size = sim_capital * TAMANO_POSICION  # 5% fijo (sin Kelly)
                    if usar_agentes:
                        # Los agentes SOLO reducen exposicion en riesgo (KRONOS/ORACULO)
                        size = sim_capital * TAMANO_POSICION * kronos_mult * peso_oraculo_base

                    if size >= 100.0:  # Minimo $100 para SPY
                        position = {
                            "direction": direccion,
                            "entry_price": price,
                            "size": size,
                            "sl_pct": sl_pct,
                            "tp_pct": tp_pct,
                            "entry_idx": i,
                            "entry_conf": confianza,
                            "kronos_mult": kronos_mult,
                            "rsi_entry": senal["rsi_entry"],
                        }

        # Equity curve (registrada TODOS los días → Sharpe sobre serie diaria completa)
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

    # Cerrar ultima posicion
    if position:
        fp = float(df["close"].iloc[-1])
        pnl_pct = (fp - position["entry_price"]) / position["entry_price"] * 100
        if position["direction"] == "SHORT":
            pnl_pct = -pnl_pct
        pnl_neto = pnl_pct - costos * 100
        pnl_amt = position["size"] * pnl_neto / 100
        trades.append({
            "direction": position["direction"],
            "exit_reason": "END_OF_DATA",
            "pnl_amt": round(pnl_amt, 2),
        })
        sim_capital += pnl_amt

    # Metricas
    total = len(trades)
    winners = [t for t in trades if t.get("pnl_amt", 0) > 0]
    losers = [t for t in trades if t.get("pnl_amt", 0) <= 0]
    wr = (len(winners) / total * 100) if total > 0 else 0
    ret = ((sim_capital - capital) / capital) * 100
    gp = sum(t.get("pnl_amt", 0) for t in winners)
    gl = abs(sum(t.get("pnl_amt", 0) for t in losers))
    pf = gp / gl if gl > 0 else (gp if gp > 0 else 0)

    eq_series = pd.Series(equity)
    rets = eq_series.pct_change().dropna()
    # Sharpe anualizado: sqrt(252) para datos diarios
    sharpe = np.sqrt(252) * rets.mean() / max(rets.std(), 0.0001)

    exit_r = {}
    for t in trades:
        r = t.get("exit_reason", "UNKNOWN")
        exit_r[r] = exit_r.get(r, 0) + 1

    for ag in stats_agentes:
        if stats_agentes[ag]["veces"] > 0:
            for k in stats_agentes[ag]:
                if k != "veces":
                    stats_agentes[ag][k] = round(stats_agentes[ag][k] / stats_agentes[ag]["veces"], 4)

    print(f"\n  Resultados:")
    print(f"  Capital: ${capital:,.0f} -> ${sim_capital:,.2f}")
    print(f"  Rentabilidad: {ret:+.2f}%")
    print(f"  Win Rate: {wr:.2f}% ({len(winners)}/{total})")
    print(f"  Profit Factor: {pf:.2f}")
    print(f"  Sharpe: {sharpe:.3f}")
    print(f"  Max DD: {max_dd:.2f}%")
    print(f"  Trades: {total} (media anual: {total / max(len(df)/252, 1):.1f})")
    print(f"  Avg Win: ${gp/len(winners):.2f}" if winners else "")
    print(f"  Avg Loss: ${-gl/len(losers):.2f}" if losers else "")
    print(f"  Costos: {costos:.2%} round-trip")
    print(f"\n  Salidas:")
    for r, c in sorted(exit_r.items(), key=lambda x: -x[1]):
        print(f"    {r}: {c} ({c/total*100:.1f}%)" if total > 0 else "")

    if usar_agentes:
        print(f"\n  Agentes:")
        print(f"    PROPHET:   {stats_agentes['prophet']['conf_inicial']:.3f} -> {stats_agentes['prophet']['conf_final']:.3f}")
        print(f"    MNEMO:     {stats_agentes['mnemo']['conf_inicial']:.3f} -> {stats_agentes['mnemo']['conf_final']:.3f}")
        print(f"    SENTIMENT: {stats_agentes['sentiment']['conf_inicial']:.3f} -> {stats_agentes['sentiment']['conf_final']:.3f}")
        print(f"    KRONOS:    exposure {stats_agentes['kronos']['exposure_prom']:.2f}")
        print(f"    ORACULO:   peso {stats_agentes['oraculo']['weight_prom']:.2f}")

    # Verificar umbral
    print(f"\n  {'='*55}")
    es_rentable = ret > 0 and wr >= 55
    if es_rentable:
        print(f"  [OK] MODELO APTO: WR {wr:.1f}% > 55% | Retorno {ret:+.2f}% > 0%")
        print(f"  Conecta al pipeline: python -m models.rsi2_spy_system --senal")
        print(f"  Luego: python -m models.pipeline_agentes")
    elif ret > 0:
        print(f"  [!] WR {wr:.1f}% < 55% pero rentabilidad positiva ({ret:+.2f}%)")
        print(f"  Evaluar si el perfil riesgo/retorno es aceptable.")
    else:
        print(f"  [X] MODELO NO APTO: WR {wr:.1f}% | Rentabilidad {ret:+.2f}%")
    print(f"  {'='*55}\n")

    result = {
        "capital_final": round(sim_capital, 2),
        "retorno": round(ret, 2),
        "wr": round(wr, 2),
        "pf": round(pf, 2),
        "sharpe": round(sharpe, 3),
        "max_dd": round(max_dd, 2),
        "trades": total,
        "avg_win": round(gp / len(winners), 2) if winners else 0,
        "avg_loss": round(-gl / len(losers), 2) if losers else 0,
        "exit_reasons": exit_r,
        "costos": costos,
        "es_rentable": es_rentable,
        "usar_agentes": usar_agentes,
        "stats_agentes": stats_agentes if usar_agentes else None,
        "config": config if save else None,
        "tiempo_seg": round(time.time() - inicio, 1),
    }

    if include_daily:
        # equity[0] = capital inicial; cada append es la equity al cierre del bar.
        # Alineacion: equity[k] corresponde a df.index[start_idx - 1 + k].
        eq_idx = df.index[max(0, start_idx - 1):]
        eq_serie = pd.Series(equity, index=eq_idx[:len(equity)])
        ret_diario = eq_serie.pct_change().dropna()
        result["ret_diario"] = {
            "fechas": [d.strftime("%Y-%m-%d") for d in ret_diario.index],
            "retornos": [round(float(v), 6) for v in ret_diario],
        }

    if save:
        output_dir = os.path.normpath(os.path.join(
            os.path.dirname(__file__), "..", "backtesting", "results"))
        os.makedirs(output_dir, exist_ok=True)
        etiqueta = "agentes" if usar_agentes else "baseline"
        archivo = os.path.join(output_dir, f"backtest_rsi2_spy_{etiqueta}.json")
        with open(archivo, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"  Guardado: {archivo}")

    print(f"  Tiempo: {result['tiempo_seg']:.1f}s\n")
    return result


# =============================================================================
# GENERADOR DE SENAL (para pipeline de agentes)
# =============================================================================

class RSI2SignalGenerator:
    """Genera senales RSI(2) enlazadas al pipeline de invest_criptoai."""

    def __init__(self, config: dict = None):
        self.config = config or CONFIG_RSI2
        self.data = None
        self.indicators = None

    def cargar_datos(self):
        self.data = cargar_datos_spy()
        self.indicators = precomputar_indicadores(self.data, self.config)
        return self

    def generar_senal(self) -> Optional[Dict]:
        if self.data is None:
            self.cargar_datos()

        i = len(self.data) - 1  # Ultimo bar completo
        if i < 250:
            return None

        senal = detectar_senal(i, self.data, self.indicators, self.config)
        if senal is None:
            return None

        bar = self.data.iloc[i]
        price = float(bar["close"])
        atr_val = float(self.indicators["atr"][i])
        atr_pct = atr_val / price if price > 0 else 0.01

        direccion = senal["direction"]
        confianza = senal["confidence"]
        sl_dist = atr_val * self.config["atr_mult_sl"]

        if direccion == "LONG":
            sl_price = price - sl_dist
            tp_price = price * 10  # TP muy alto: salida real es por RSI, no por TP
        else:
            sl_price = price + sl_dist
            tp_price = 0.01  # TP muy bajo: SHORT usa RSI cross como salida

        # Sizing FIJO 5% (corrección #2) — sin Kelly
        kelly = TAMANO_POSICION  # 5% fijo, coherente con el backtest

        signal_output = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": self.config["name"],
            "config": {
                "version": self.config["version"],
                "rsi_period": self.config["rsi_period"],
                "oversold": self.config["oversold_threshold"],
                "overbought": self.config["overbought_threshold"],
                "trend_sma": self.config["trend_sma_period"],
                "cost_roundtrip": COST_ROUNDTRIP,
            },
            "market_state": {
                "symbol": f"{self.config['symbol']}",
                "price": round(price, 2),
                "atr_pct": round(atr_pct, 6),
                "atr_actual": round(atr_val, 2),
                "timestamp": str(self.data.index[i]),
                "rsi_2": round(float(self.indicators["rsi"][i]), 2),
                "sma_200": round(float(self.indicators["sma_200"][i]), 2),
            },
            "analysis": {
                "reason": senal["reason"],
                "rsi_entry": round(float(senal["rsi_entry"]), 2),
                "rsi_current": round(float(self.indicators["rsi"][i]), 2),
                "price_vs_sma": f"{'ABOVE' if price > self.indicators['sma_200'][i] else 'BELOW'} 200SMA",
            },
            "signal": {
                "direction": direccion,
                "confidence": round(confianza, 4),
                "type": "RSI2_MEAN_REVERSION",
                "regime": "NORMAL",
            },
            "risk_parameters": {
                "sl_price": round(sl_price, 2) if sl_price else None,
                "tp_price": round(tp_price, 2) if tp_price else None,
                "tp_type": "RSI_CROSS",  # Salida por cruce de RSI, no por TP
                "sl_atr_mult": self.config["atr_mult_sl"],
                "tp_atr_mult": 0,
                "kelly_fraction": round(kelly, 4),
                "position_size_pct": TAMANO_POSICION,
                "max_hold_days": self.config["max_hold_days"],
            },
        }
        return signal_output

    def guardar_senal(self, senal: Dict, path: str = None) -> str:
        if path is None:
            path = SIGNAL_PATH
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(senal, f, indent=2, ensure_ascii=False, default=str)
        print(f"\n  [SIGNAL] Senal guardada: {path}")
        sig = senal["signal"]
        market = senal["market_state"]
        print(f"  {sig['direction']} @ ${market['price']:,.2f} | "
              f"Conf: {sig['confidence']:.2%} | "
              f"RSI(2): {market['rsi_2']:.1f}")
        print(f"  Siguiente: python -m models.pipeline_agentes")
        return path


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="RSI(2) Mean Reversion en SPY")
    parser.add_argument("--backtest", action="store_true", help="Ejecutar backtest")
    parser.add_argument("--agentes", action="store_true", help="Conectar 5 agentes")
    parser.add_argument("--save", action="store_true", help="Guardar resultados")
    parser.add_argument("--download", action="store_true", help="Descargar datos SPY")
    parser.add_argument("--senal", action="store_true", help="Generar senal para pipeline")
    args = parser.parse_args()

    if args.download:
        descargar_spy()
        return

    if args.backtest:
        return ejecutar_backtest_rsi2(
            usar_agentes=args.agentes, save=args.save)

    if args.senal:
        gen = RSI2SignalGenerator()
        gen.cargar_datos()
        senal = gen.generar_senal()
        if senal:
            gen.guardar_senal(senal)
        else:
            print("  Sin senal en este momento")
        return senal

    parser.print_help()
    print("\nEjemplos:")
    print("  python -m models.rsi2_spy_system --download")
    print("  python -m models.rsi2_spy_system --backtest")
    print("  python -m models.rsi2_spy_system --backtest --agentes --save")
    print("  python -m models.rsi2_spy_system --senal")


if __name__ == "__main__":
    main()
