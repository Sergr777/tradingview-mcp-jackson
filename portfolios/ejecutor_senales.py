"""
ejecutor_senales.py — BRIDGE DE OPERACIONES: signals.json → Paper Trades
=======================================================================
Capa operativa del ecosistema invest_criptoai.

Lee las señales estructuradas generadas por models/generador_senales.py
y ejecuta paper trades (o reales) con gestión de riesgo profesional:

  - Risk Parity: posición inversa a volatilidad reciente
  - Kelly Criterion: tamaño óptimo basado en confianza de la señal
  - Circuit Breaker: drawdown máximo, señal expirada
  - Trailing Stop: trailing por ATR para salidas dinámicas
  - Logging: historial completo de trades en data/trades/

Flujo:
  1. Leer signals/latest_signals.json
  2. Validar señal (fresca, no expirada)
  3. Consultar estado de posición actual
  4. Calcular tamaño de posición (Kelly + risk parity)
  5. Ejecutar paper trade
  6. Actualizar trade_log.json

Uso:
    python -m portfolios.ejecutor_senales                          # Ejecutar última señal
    python -m portfolios.ejecutor_senales --capital 50000          # Capital personalizado
    python -m portfolios.ejecutor_senales --mode real              # Modo real (BitGet)
    python -m portfolios.ejecutor_senales --dry-run                # Simular sin ejecutar
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# =============================================================================
# CONSTANTES
# =============================================================================

# Rutas base
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGNALS_DIR = os.path.join(PROJECT_ROOT, "data", "signals")
TRADES_DIR = os.path.join(PROJECT_ROOT, "data", "trades")

# Límites de riesgo
MAX_DRAWDOWN_PCT = 0.05          # 5% drawdown máximo
MAX_POSITION_PCT = 0.02          # 2% máximo por posición
MAX_LEVERAGE = 1.0               # Sin apalancamiento
MIN_CAPITAL_TRADE = 10.0         # Capital mínimo para operar ($)

# Validación de señal
MAX_SIGNAL_AGE_MINUTES = 20      # Señal expira después de 20 minutos
MIN_CONFIDENCE_TO_TRADE = 0.35   # Confianza mínima para abrir posición (alineado con generador)

# Archivos de estado
POSITION_FILE = os.path.join(TRADES_DIR, "posicion_actual.json")
TRADE_LOG_FILE = os.path.join(TRADES_DIR, "trade_log.json")


# =============================================================================
# GESTOR DE RIESGO
# =============================================================================

class GestorRiesgo:
    """
    Gestor de riesgo profesional para ejecución de señales.
    Implementa Kelly Criterion, Risk Parity y Circuit Breaker.
    """

    def __init__(self, capital_total: float = 25000.0):
        self.capital_total = capital_total
        self.capital_disponible = capital_total
        self.drawdown_actual = 0.0
        self.max_drawdown = 0.0
        self.pico_capital = capital_total

    def kelly_fraction(self, confianza: float, r_r: float = 2.0) -> float:
        """
        Calcula fracción de Kelly: f = (b*p - q) / b
        Donde p = confianza, q = 1-p, b = reward/risk
        """
        p = max(0.01, min(0.99, confianza))
        q = 1 - p
        b = r_r
        f = (b * p - q) / b if b > 0 else 0
        return max(0.0, min(f, MAX_POSITION_PCT * 10))  # Cap alto, el risk parity ajusta

    def risk_parity_adjustment(self, atr_pct: float) -> float:
        """
        Ajuste por Risk Parity: posición inversa a volatilidad.
        Volatilidad base: 1% (atr_pct = 0.01)
        """
        if atr_pct <= 0:
            return 1.0
        vol_base = 0.01  # 1% volatilidad objetivo por trade
        return vol_base / max(atr_pct, 0.001)

    def calcular_tamano_posicion(
        self,
        confianza: float,
        precio: float,
        atr_pct: float,
        regime: str = "NORMAL",
    ) -> Dict:
        """
        Calcula el tamaño de posición óptimo usando Kelly + Risk Parity + Circuit Breaker.

        Returns:
            Dict con tamaño en USD, unidades, y desglose de factores
        """
        # 1. Kelly base
        kelly = self.kelly_fraction(confianza)

        # 2. Ajuste por Risk Parity (volatilidad)
        rp_adj = self.risk_parity_adjustment(atr_pct)

        # 3. Ajuste por régimen
        regime_mult = {
            "ALTA_CONFIANZA": 1.2,
            "NORMAL": 1.0,
            "SIN_SEÑAL": 0.0,
            "CRISIS": 0.3,
        }.get(regime, 0.5)

        # 4. Circuit Breaker: drawdown reduce exposición
        dd_penalty = max(0.0, 1.0 - self.drawdown_actual / MAX_DRAWDOWN_PCT)

        # 5. Fracción final (no puede exceder MAX_POSITION_PCT)
        fraccion = min(
            kelly * rp_adj * regime_mult * dd_penalty,
            MAX_POSITION_PCT
        )

        # Capital a asignar
        capital_asignado = self.capital_disponible * fraccion
        capital_asignado = max(0, min(capital_asignado, self.capital_disponible * MAX_POSITION_PCT))

        # Unidades
        if precio > 0:
            unidades = capital_asignado / precio
        else:
            unidades = 0

        return {
            "capital_asignado": round(capital_asignado, 2),
            "unidades": round(unidades, 6),
            "fraccion_capital": round(fraccion, 4),
            "factores": {
                "kelly": round(kelly, 4),
                "risk_parity": round(rp_adj, 4),
                "regime": regime_mult,
                "drawdown_penalty": round(dd_penalty, 4),
            }
        }

    def actualizar_por_trade(self, pnl_usd: float):
        """Actualiza el estado del capital tras un trade."""
        self.capital_disponible += pnl_usd
        if self.capital_disponible > self.pico_capital:
            self.pico_capital = self.capital_disponible

        self.drawdown_actual = max(0, (self.pico_capital - self.capital_disponible) / self.pico_capital)
        self.max_drawdown = max(self.max_drawdown, self.drawdown_actual)

    def circuit_breaker_activo(self) -> Tuple[bool, str]:
        """Verifica si el circuit breaker debe activarse."""
        if self.drawdown_actual >= MAX_DRAWDOWN_PCT:
            return True, f"Drawdown {self.drawdown_actual:.2%} >= {MAX_DRAWDOWN_PCT:.2%}"
        if self.capital_disponible < MIN_CAPITAL_TRADE:
            return True, f"Capital insuficiente: ${self.capital_disponible:.2f}"
        return False, "OK"


# =============================================================================
# EJECUTOR DE SEÑALES
# =============================================================================

class EjecutorSenales:
    """
    Ejecuta señales de trading generadas por el análisis layer.
    Gestiona posiciones abiertas, historial de trades, y risk management.
    """

    def __init__(self, capital: float = 25000.0, mode: str = "paper"):
        self.mode = mode  # "paper" o "real"
        self.risk = GestorRiesgo(capital_total=capital)
        self.historial_trades: List[Dict] = []
        self.posicion_actual: Optional[Dict] = None

        os.makedirs(TRADES_DIR, exist_ok=True)
        os.makedirs(SIGNALS_DIR, exist_ok=True)

        # Cargar estado previo
        self._cargar_estado()

    # ------------------------------------------------------------------
    # PERSISTENCIA DE ESTADO
    # ------------------------------------------------------------------

    def _cargar_estado(self):
        """Carga estado previo desde archivos JSON."""
        # Posición actual
        if os.path.exists(POSITION_FILE):
            try:
                with open(POSITION_FILE, "r", encoding="utf-8") as f:
                    self.posicion_actual = json.load(f)
                    if self.posicion_actual.get("status") == "OPEN":
                        print(f"  [STATE] Posicion OPEN recuperada: {self.posicion_actual['direction']} "
                              f"{self.posicion_actual['asset']} @ ${self.posicion_actual['entry_price']}")
            except (json.JSONDecodeError, KeyError):
                self.posicion_actual = None

        # Trade log
        if os.path.exists(TRADE_LOG_FILE):
            try:
                with open(TRADE_LOG_FILE, "r", encoding="utf-8") as f:
                    self.historial_trades = json.load(f)
                print(f"  [STATE] {len(self.historial_trades)} trades históricos cargados")
            except (json.JSONDecodeError, KeyError):
                self.historial_trades = []

        # Reconstruir drawdown desde historial
        if self.historial_trades:
            pnl_total = sum(t.get("pnl_usd", 0) for t in self.historial_trades)
            self.risk.actualizar_por_trade(pnl_total)

    def _guardar_posicion(self):
        """Guarda la posición actual a JSON."""
        with open(POSITION_FILE, "w", encoding="utf-8") as f:
            json.dump(self.posicion_actual or {}, f, indent=2, ensure_ascii=False, default=str)

    def _guardar_historial(self):
        """Guarda el historial completo de trades."""
        with open(TRADE_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(self.historial_trades, f, indent=2, ensure_ascii=False, default=str)

    # ------------------------------------------------------------------
    # LECTURA DE SEÑAL
    # ------------------------------------------------------------------

    def leer_ultima_senal(self) -> Optional[Dict]:
        """Lee la última señal desde signals/latest_signals.json."""
        archivo = os.path.join(SIGNALS_DIR, "latest_signals.json")

        if not os.path.exists(archivo):
            print(f"  [SIGNAL] No hay archivo de señal: {archivo}")
            return None

        try:
            with open(archivo, "r", encoding="utf-8") as f:
                senal = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError) as e:
            print(f"  [ERROR] Leyendo señal: {e}")
            return None

        return senal

    def validar_senal(self, senal: Dict) -> Tuple[bool, str]:
        """
        Valida que la señal sea fresca y ejecutable.

        Returns:
            (bool, str): (válida, motivo de rechazo)
        """
        if not senal:
            return False, "Señal vacía"

        # Verificar que tenga estructura mínima
        if "signal" not in senal or "market_state" not in senal:
            return False, "Señal incompleta"

        # Frescura (no más de 20 minutos)
        generated_at = senal.get("generated_at", "")
        try:
            t_generated = datetime.fromisoformat(generated_at)
            t_now = datetime.now(timezone.utc)
            edad = (t_now - t_generated).total_seconds() / 60
            if edad > MAX_SIGNAL_AGE_MINUTES:
                return False, f"Señal expirada: {edad:.0f} min > {MAX_SIGNAL_AGE_MINUTES} min"
        except (ValueError, TypeError):
            pass  # Si no podemos validar tiempo, continuamos

        # Confianza mínima
        signal = senal.get("signal", {})
        confianza = signal.get("confidence", 0)
        direccion = signal.get("direction")

        if not direccion:
            return False, "Sin dirección de señal"
        if confianza < MIN_CONFIDENCE_TO_TRADE:
            return False, f"Confianza baja: {confianza:.2%} < {MIN_CONFIDENCE_TO_TRADE:.2%}"

        # Circuit breaker global
        cb_activo, cb_razon = self.risk.circuit_breaker_activo()
        if cb_activo:
            return False, f"Circuit Breaker activo: {cb_razon}"

        return True, "Señal válida"

    # ------------------------------------------------------------------
    # GESTIÓN DE POSICIONES
    # ------------------------------------------------------------------

    def verificar_salida(self) -> Optional[Dict]:
        """
        Verifica si la posición actual debe cerrarse.
        Aplica trailing stop por ATR y condiciones de salida.

        Returns:
            Dict con cierre de posición si aplica, None si mantener
        """
        if not self.posicion_actual or self.posicion_actual.get("status") != "OPEN":
            return None

        # Leer precio actual desde la última señal
        senal = self.leer_ultima_senal()
        if not senal:
            print("  [EXIT] No hay señal para verificar precio. Manteniendo posición.")
            return None

        # Verificar que la señal no esté demasiado vieja (más de 30 min = precio obsoleto)
        gen_at = senal.get("generated_at", "")
        try:
            t_gen = datetime.fromisoformat(gen_at)
            edad_min = (datetime.now(timezone.utc) - t_gen).total_seconds() / 60
            if edad_min > 30:
                print(f"  [EXIT] Señal obsoleta ({edad_min:.0f} min). No se puede verificar SL/TP.")
                # Cerrar posición por seguridad si la señal tiene más de 60 min
                if edad_min > 60:
                    precio_actual = self.posicion_actual["entry_price"]
                    cierre_forzado = self._cerrar_posicion("STALE_SIGNAL", precio_actual)
                    if cierre_forzado:
                        return cierre_forzado
                return None
        except (ValueError, TypeError):
            pass

        precio_actual = senal["market_state"]["price"]
        direccion = self.posicion_actual["direction"]
        entry = self.posicion_actual["entry_price"]
        sl_price = self.posicion_actual.get("sl_price") or 0
        tp_price = self.posicion_actual.get("tp_price") or 0

        # Verificar SL/TP
        pnl_pct = ((precio_actual - entry) / entry) if direccion == "LONG" else ((entry - precio_actual) / entry)

        salida = None
        if direccion == "LONG":
            if precio_actual <= sl_price:
                salida = "STOP_LOSS"
            elif precio_actual >= tp_price:
                salida = "TAKE_PROFIT"
        elif direccion == "SHORT":
            if precio_actual >= sl_price:
                salida = "STOP_LOSS"
            elif precio_actual <= tp_price:
                salida = "TAKE_PROFIT"

        # Trailing stop dinámico (si el precio va a favor)
        # Usamos el ATR para mover el stop
        atr_pct = senal["market_state"]["atr_pct"]
        if not salida and pnl_pct > 0:
            # Mover SL a breakeven si > 1 ATR de ganancia
            if pnl_pct > atr_pct * 1.5:
                nuevo_sl = entry * (1 + atr_pct * 0.5) if direccion == "LONG" else entry * (1 - atr_pct * 0.5)
                if (direccion == "LONG" and nuevo_sl > sl_price) or (direccion == "SHORT" and nuevo_sl < sl_price):
                    self.posicion_actual["sl_original"] = sl_price
                    sl_price = round(nuevo_sl, 2)
                    self.posicion_actual["sl_price"] = sl_price
                    self.posicion_actual["trailing_activated"] = True
                    self._guardar_posicion()
                    print(f"  [TRAIL] SL movido a breakeven: ${sl_price:,.2f}")

        if salida:
            return self._cerrar_posicion(salida, precio_actual)

        # Incrementar contador de velas mantenidas
        self.posicion_actual["hold_bars"] = self.posicion_actual.get("hold_bars", 0) + 1
        return None

    def abrir_posicion(self, senal: Dict, capital_senal: float = 25000.0) -> Optional[Dict]:
        """
        Abre una nueva posición basada en la señal.

        Args:
            senal: Dict con la señal estructurada
            capital_senal: Capital asignado a esta estrategia

        Returns:
            Dict con la trade ejecutada, o None si no se ejecuta
        """
        # No abrir si ya tenemos posición
        if self.posicion_actual and self.posicion_actual.get("status") == "OPEN":
            print("  [TRADE] Ya hay una posición OPEN. Saltando nueva entrada.")
            return None

        signal = senal["signal"]
        market = senal["market_state"]
        risk_params = senal["risk_parameters"]

        # Validar señal otra vez
        valida, razon = self.validar_senal(senal)
        if not valida:
            print(f"  [REJECT] Señal rechazada: {razon}")
            return None

        # Calcular tamaño de posición
        sizing = self.risk.calcular_tamano_posicion(
            confianza=signal["confidence"],
            precio=market["price"],
            atr_pct=market["atr_pct"],
            regime=signal["regime"],
        )

        # Verificar tamaño mínimo
        if sizing["capital_asignado"] < MIN_CAPITAL_TRADE:
            print(f"  [REJECT] Tamaño muy pequeño: ${sizing['capital_asignado']:.2f}")
            return None

        # Crear posición
        posicion = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "signal_timestamp": senal.get("generated_at", ""),
            "asset": market["symbol"],
            "direction": signal["direction"],
            "entry_price": market["price"],
            "sl_price": risk_params["sl_price"],
            "tp_price": risk_params["tp_price"],
            "sl_atr_mult": risk_params["sl_atr_mult"],
            "tp_atr_mult": risk_params["tp_atr_mult"],
            "confidence": signal["confidence"],
            "regime": signal["regime"],
            "capital_empleado": sizing["capital_asignado"],
            "unidades": sizing["unidades"],
            "fraccion_capital": sizing["fraccion_capital"],
            "sizing_factors": sizing["factores"],
            "status": "OPEN",
            "hold_bars": 0,
            "trailing_activated": False,
            "atr_entry": market["atr_pct"],
        }

        # Ejecutar según modo
        if self.mode == "paper":
            self.posicion_actual = posicion
            self._guardar_posicion()

        elif self.mode == "real":
            # Aquí iría la lógica de conexión a BitGet/TradingView
            print("  [REAL] Modo real no implementado aún")
            self.posicion_actual = posicion
            self._guardar_posicion()
        else:
            print(f"  [ERROR] Modo desconocido: {self.mode}")
            return None

        print(f"\n  {'-' * 40}")
        print(f"  [OK] POSICION ABIERTA ({self.mode.upper()})")
        print(f"  {'-' * 40}")
        print(f"  Activo:     {posicion['asset']}")
        print(f"  Direccion:  {posicion['direction']}")
        print(f"  Entrada:    ${posicion['entry_price']:,.2f}")
        print(f"  Capital:    ${posicion['capital_empleado']:,.2f}")
        print(f"  Unidades:   {posicion['unidades']:.6f}")
        print(f"  SL:         ${posicion['sl_price']:,.2f}")
        print(f"  TP:         ${posicion['tp_price']:,.2f}")
        print(f"  Confianza:  {posicion['confidence']:.2%}")
        print(f"  Factores:   {posicion['sizing_factors']}")
        print(f"  {'-' * 40}")

        return posicion

    # ------------------------------------------------------------------
    # REPORTE DE ESTADO
    # ------------------------------------------------------------------

    def generar_reporte(self) -> Dict:
        """Genera reporte completo del estado actual."""
        # Estadísticas del historial
        n_trades = len(self.historial_trades)
        trades_cerrados = [t for t in self.historial_trades if t.get("status") == "CLOSED" and "exit" in t]
        n_cerrados = len(trades_cerrados)
        ganados = sum(1 for t in trades_cerrados if t["exit"].get("pnl_usd", 0) > 0)
        pnl_total = sum(t["exit"].get("pnl_usd", 0) for t in trades_cerrados)

        # Por razón de salida
        take_profits = sum(1 for t in trades_cerrados if t["exit"].get("exit_reason") == "TAKE_PROFIT")
        stop_losses = sum(1 for t in trades_cerrados if t["exit"].get("exit_reason") == "STOP_LOSS")

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "mode": self.mode,
            "capital_total": round(self.risk.capital_total, 2),
            "capital_disponible": round(self.risk.capital_disponible, 2),
            "drawdown_actual": round(self.risk.drawdown_actual * 100, 2),
            "max_drawdown": round(self.risk.max_drawdown * 100, 2),
            "posicion_actual": "OPEN" if (self.posicion_actual and self.posicion_actual.get("status") == "OPEN") else "NONE",
            "estadisticas": {
                "total_trades": n_trades,
                "trades_cerrados": n_cerrados,
                "trades_ganados": ganados,
                "win_rate": round(ganados / n_cerrados * 100, 2) if n_cerrados > 0 else 0,
                "pnl_total_usd": round(pnl_total, 2),
                "tp_count": take_profits,
                "sl_count": stop_losses,
            } if n_cerrados > 0 else {},
        }

    def _cerrar_posicion(self, razon: str, precio_salida: float) -> Dict:
        """
        Cierra la posición actual con una razón específica.
        Args:
            razon: Motivo del cierre (STOP_LOSS, TAKE_PROFIT, STALE_SIGNAL, etc.)
            precio_salida: Precio de salida
        Returns:
            Dict con datos del cierre
        """
        if not self.posicion_actual:
            return {}

        entry = self.posicion_actual["entry_price"]
        direccion = self.posicion_actual["direction"]
        pnl_pct = ((precio_salida - entry) / entry) if direccion == "LONG" else ((entry - precio_salida) / entry)
        pnl_usd = self.posicion_actual["capital_empleado"] * pnl_pct

        cierre = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "asset": self.posicion_actual["asset"],
            "direction": direccion,
            "entry_price": entry,
            "exit_price": precio_salida,
            "pnl_pct": round(pnl_pct * 100, 2),
            "pnl_usd": round(pnl_usd, 2),
            "exit_reason": razon,
            "hold_bars": self.posicion_actual.get("hold_bars", 0) + 1,
            "capital_empleado": self.posicion_actual["capital_empleado"],
        }

        # Actualizar capital usando el método dedicado
        self.risk.actualizar_por_trade(pnl_usd)

        # Marcar posición como cerrada y guardar
        self.posicion_actual["status"] = "CLOSED"
        self.posicion_actual["exit"] = cierre
        self.historial_trades.append({**self.posicion_actual})
        self.posicion_actual = None

        self._guardar_historial()
        self._guardar_posicion()

        return cierre

    # ------------------------------------------------------------------
    # CICLO COMPLETO
    # ------------------------------------------------------------------

    def ejecutar_ciclo(self, capital_estrategia: float = 25000.0) -> Dict:
        """Ejecuta el ciclo completo: leer señal → gestionar posición → reportar."""
        print("\n" + "=" * 70)
        print(f"  [OPERACIONES] EJECUTOR DE SEÑALES ({self.mode.upper()})")
        print("=" * 70)

        # Paso 1: Verificar salidas
        print("\n[1/3] Verificando posición actual...")
        cierre = self.verificar_salida()
        if cierre:
            print(f"  [OK] POSICION CERRADA: {cierre['exit_reason']}")
            print(f"     PnL: {cierre['pnl_pct']:+.2f}% (${cierre['pnl_usd']:+.2f})")
        else:
            print(f"  Posicion actual: {self.posicion_actual['direction'] if self.posicion_actual else 'NINGUNA'}")

        # Paso 2: Leer y validar señal
        print("\n[2/3] Leyendo última señal...")
        senal = self.leer_ultima_senal()
        if senal is None:
            print("  [!] No hay senal disponible")
            reporte = self.generar_reporte()
            return reporte

        valida, razon = self.validar_senal(senal)
        if valida:
            print(f"  [OK] Senal valida: {senal['signal']['direction']} @ "
                  f"${senal['market_state']['price']:,.2f} | "
                  f"Conf: {senal['signal']['confidence']:.2%}")
        else:
            print(f"  [!] Senal rechazada: {razon}")

        # Paso 3: Abrir/actualizar posición
        print("\n[3/3] Ejecutando...")
        if valida and (not self.posicion_actual or self.posicion_actual.get("status") != "OPEN"):
            trade = self.abrir_posicion(senal, capital_estrategia)
            if trade:
                print(f"  [OK] TRADE EJECUTADO ({self.mode.upper()})")
        elif not valida:
            print("  [-] No se ejecuta trade (senal no valida)")
        else:
            print("  [-] Posicion existente mantenida. Esperando salida...")

        # Reporte final
        print("\n" + "=" * 70)
        reporte = self.generar_reporte()
        print(f"  [REPORTE] ESTADO")
        print(f"  {'-' * 40}")
        print(f"  Capital:      ${reporte['capital_disponible']:,.2f} / ${reporte['capital_total']:,.2f}")
        print(f"  Drawdown:     {reporte['drawdown_actual']:.2f}% (max: {reporte['max_drawdown']:.2f}%)")
        print(f"  Posición:     {reporte['posicion_actual']}")
        stats = reporte.get('estadisticas', {})
        if stats:
            print(f"  Trades:       {stats.get('total_trades', 0)} total / {stats.get('trades_cerrados', 0)} cerrados")
            print(f"  Win Rate:     {stats.get('win_rate', 0):.2f}%")
            print(f"  PnL Total:    ${stats.get('pnl_total_usd', 0):+.2f}")
            print(f"  TP/SL:        {stats.get('tp_count', 0)}/{stats.get('sl_count', 0)}")
        print("=" * 70)

        return reporte


# =============================================================================
# MAIN
# =============================================================================

def main():
    # Fix robusto: stdout/stderr en UTF-8 evita crashes de encoding (cp1252) en Windows
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(
        description="Ejecutor de Señales - Capa Operativa"
    )
    parser.add_argument(
        "--capital", type=float, default=25000.0,
        help="Capital disponible para esta estrategia (default: $25,000)"
    )
    parser.add_argument(
        "--mode", choices=["paper", "real"], default="paper",
        help="Modo de ejecución: paper (simulado) o real (BitGet)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Modo dry-run: solo muestra qué haría sin ejecutar"
    )
    args = parser.parse_args()

    if args.dry_run:
        print("=" * 70)
        print("  [DRY-RUN] Simulacion sin ejecucion")
        print("=" * 70)
        senal = EjecutorSenales(capital=args.capital, mode="paper").leer_ultima_senal()
        if senal:
            sig = senal.get("signal", {})
            mkt = senal.get("market_state", {})
            print(f"  Señal leída: {sig.get('direction')}")
            print(f"  Precio: ${mkt.get('price', 0):,.2f}")
            print(f"  Confianza: {sig.get('confidence', 0):.2%}")
            valida, razon = EjecutorSenales(capital=args.capital, mode="paper").validar_senal(senal)
            print(f"  Válida: {valida} ({razon})")
        else:
            print("  No hay señal disponible")
        return

    ejecutor = EjecutorSenales(capital=args.capital, mode=args.mode)
    reporte = ejecutor.ejecutar_ciclo(capital_estrategia=args.capital)

    # Guardar reporte
    reporte_path = os.path.join(TRADES_DIR, "ultimo_reporte.json")
    with open(reporte_path, "w", encoding="utf-8") as f:
        json.dump(reporte, f, indent=2, ensure_ascii=False, default=str)
    print(f"\n  Reporte guardado: {reporte_path}")


if __name__ == "__main__":
    main()
