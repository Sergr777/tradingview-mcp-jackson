"""
ejecutor_portafolio_rsi2_tsmom.py — PAPER TRADING PORTAFOLIO RSI(2)+TSMOM (w=0.2)
================================================================================
Implementa el paper trading del portafolio combinado que demostro valor real en
`backtesting/medir_valor_portafolio_rsi2_tsmom.py` (commit 8ed6372):

    RSI(2) SPY solo:  Sharpe 0.548 | Ret +1.44%  | MaxDD -0.68%  | 28/43 ventanas
    Portafolio w=0.2: Sharpe 0.839 | Ret +11.13% | MaxDD -1.87%  | 30/43 ventanas
    (delta Sharpe +0.29, corr mensual 0.27 -> diversificacion real)

Arquitectura de dos sleeves sobre el capital total:

    Capital total C
      ├─ RSI2 sleeve  (1 - w_tsmom) * C = 80%  -> SPY, sizing FIJO 5% del sleeve
      └─ TSMOM sleeve  w_tsmom * C = 20%       -> MULTI_ETF, pesos vol-targeting

  - El sleeve RSI2 usa la senal de models/rsi2_spy_system.py --senal
    (latest_signals.json): direccion LONG/SHORT sobre SPY con position_size_pct
    del 5% (TAMANO_POSICION), alineado con su backtest v0.2.0.
  - El sleeve TSMOM usa la senal de models/tsmom_etf.py --senal
    (latest_signals_tsmom.json): pesos objetivo por activo del ultimo rebalance
    mensual (vol targeting, lookback 24m), aplicados al capital del sleeve.

Flujo end-to-end (dry-run):

    python -m models.rsi2_spy_system --senal          # opcional (senal SPY)
    python -m models.tsmom_etf --senal                # senal de portafolio TSMOM
    python -m portfolios.ejecutor_portafolio_rsi2_tsmom --dry-run

Uso:
    python -m portfolios.ejecutor_portafolio_rsi2_tsmom --dry-run
    python -m portfolios.ejecutor_portafolio_rsi2_tsmom --capital 100000
    python -m portfolios.ejecutor_portafolio_rsi2_tsmom --w-tsmom 0.2
    python -m portfolios.ejecutor_portafolio_rsi2_tsmom --mode paper
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGNALS_DIR = os.path.join(PROJECT_ROOT, "data", "signals")
TRADES_DIR = os.path.join(PROJECT_ROOT, "data", "trades")

RSI2_SIGNAL_PATH = os.path.join(SIGNALS_DIR, "latest_signals.json")
TSMOM_SIGNAL_PATH = os.path.join(SIGNALS_DIR, "latest_signals_tsmom.json")

POSITION_FILE = os.path.join(TRADES_DIR, "posicion_portafolio.json")
REPORT_FILE = os.path.join(TRADES_DIR, "ultimo_reporte_portafolio.json")

# Peso del sleeve TSMOM (unico uso con valor demostrado del modelo)
DEFAULT_W_TSMOM = 0.20

# Riesgo del portafolio combinado
MAX_GROSS_EXPOSURE = 0.50      # exposicion bruta maxima del portafolio total
MAX_SIGNAL_AGE_MINUTES = 60    # senales mas viejas se ignoran en papel
MIN_NOTIONAL = 100.0           # nocional minimo por posicion ($)


# =============================================================================
# PORTFOLIO PAPER EXECUTOR
# =============================================================================

class EjecutorPortafolioRSI2TSMOM:
    """
    Ejecuta el paper trading del portafolio RSI(2) SPY + TSMOM (w=0.2).

    Combina el sizing de ambos sistemas sobre su sleeve de capital:
      - RSI2:  position_size_pct (5%) aplicado al capital del sleeve
      - TSMOM: pesos objetivo del ultimo rebalance aplicados al sleeve
    """

    def __init__(self, capital: float = 100000.0, w_tsmom: float = DEFAULT_W_TSMOM,
                 mode: str = "paper", dry_run: bool = False):
        self.capital_total = capital
        self.w_tsmom = w_tsmom
        self.mode = mode          # "paper"
        self.dry_run = dry_run

        os.makedirs(SIGNALS_DIR, exist_ok=True)
        os.makedirs(TRADES_DIR, exist_ok=True)

    # ------------------------------------------------------------------
    # LECTURA DE SENALES
    # ------------------------------------------------------------------

    def leer_senal_rsi2(self) -> Optional[Dict]:
        if not os.path.exists(RSI2_SIGNAL_PATH):
            return None
        try:
            with open(RSI2_SIGNAL_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return None

    def leer_senal_tsmom(self) -> Optional[Dict]:
        if not os.path.exists(TSMOM_SIGNAL_PATH):
            return None
        try:
            with open(TSMOM_SIGNAL_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return None

    # ------------------------------------------------------------------
    # VALIDACION
    # ------------------------------------------------------------------

    @staticmethod
    def _senal_fresca(senal: Dict, max_minutes: int = MAX_SIGNAL_AGE_MINUTES) -> Tuple[bool, str]:
        generated_at = senal.get("generated_at", "")
        if not generated_at:
            return True, "sin timestamp (se acepta)"
        try:
            t_gen = datetime.fromisoformat(generated_at)
            if t_gen.tzinfo is None:
                t_gen = t_gen.replace(tzinfo=timezone.utc)
            edad_min = (datetime.now(timezone.utc) - t_gen).total_seconds() / 60
            if edad_min > max_minutes:
                return False, f"senal expirada ({edad_min:.0f} min > {max_minutes})"
            return True, f"fresca ({edad_min:.0f} min)"
        except (ValueError, TypeError):
            return True, "timestamp no parseable (se acepta)"

    def _validar_senal_rsi2(self, senal: Dict) -> Tuple[bool, str]:
        if not senal:
            return False, "no hay senal RSI2"
        sig = senal.get("signal", {})
        mkt = senal.get("market_state", {})
        if not sig.get("direction") or "price" not in mkt:
            return False, "senal RSI2 incompleta"
        if self.mode == "paper":
            ok, razon = self._senal_fresca(senal)
            if not ok:
                return False, razon
        return True, "senal RSI2 valida"

    def _validar_senal_tsmom(self, senal: Dict) -> Tuple[bool, str]:
        if not senal:
            return False, "no hay senal TSMOM"
        if "portfolio" not in senal or "weights" not in senal["portfolio"]:
            return False, "senal TSMOM incompleta"
        if self.mode == "paper":
            ok, razon = self._senal_fresca(senal)
            if not ok:
                return False, razon
        return True, "senal TSMOM valida"

    # ------------------------------------------------------------------
    # SIZING COMBINADO (nucleo del portafolio)
    # ------------------------------------------------------------------

    def calcular_portafolio(self, senal_rsi2: Optional[Dict],
                            senal_tsmom: Optional[Dict]) -> Dict:
        """
        Calcula el portafolio combinado: reparte capital en sleeves y aplica
        el sizing de cada sistema. Devuelve el plan completo (sin ejecutar).

        - Sleeve RSI2:  (1 - w) * C ; posicion SPY = position_size_pct * sleeve
        - Sleeve TSMOM: w * C       ; posiciones = peso_i * sleeve por activo

        El peso del sleeve TSMOM se toma de la propia senal
        (risk_parameters.position_size_pct, unica fuente de verdad) cuando
        existe; el constructor/--w-tsmom actua como fallback.
        """
        w_tsmom = self.w_tsmom
        if senal_tsmom:
            rp_tsm = senal_tsmom.get("risk_parameters", {})
            w_senal = rp_tsm.get("position_size_pct")
            if isinstance(w_senal, (int, float)) and 0 < w_senal < 1:
                w_tsmom = float(w_senal)
        capital_rsi2 = self.capital_total * (1 - w_tsmom)
        capital_tsmom = self.capital_total * w_tsmom

        positions: List[Dict] = []
        detalles: Dict[str, Dict] = {}

        # ---- Sleeve RSI2 ----
        valida_rsi2, razon_rsi2 = self._validar_senal_rsi2(senal_rsi2)
        detalles["rsi2"] = {"capital_sleeve": round(capital_rsi2, 2),
                            "valida": valida_rsi2, "razon": razon_rsi2}
        if valida_rsi2 and senal_rsi2:
            sig = senal_rsi2["signal"]
            mkt = senal_rsi2["market_state"]
            rp = senal_rsi2.get("risk_parameters", {})
            pct = float(rp.get("position_size_pct", 0.05))
            notional = capital_rsi2 * pct
            precio = float(mkt["price"])
            if notional >= MIN_NOTIONAL:
                positions.append({
                    "sleeve": "RSI2",
                    "asset": mkt.get("symbol", "SPY"),
                    "direction": sig["direction"],
                    "weight": round(pct, 4),
                    "notional_usd": round(notional, 2),
                    "unidades": round(notional / precio, 4) if precio > 0 else 0.0,
                    "precio": round(precio, 2),
                    "confidence": sig.get("confidence", 0.0),
                    "sl_price": rp.get("sl_price"),
                    "tp_price": rp.get("tp_price"),
                    "source": "RSI2_SPY",
                })
            detalles["rsi2"]["position_size_pct"] = pct
            detalles["rsi2"]["notional"] = round(notional, 2)

        # ---- Sleeve TSMOM ----
        valida_tsmom, razon_tsmom = self._validar_senal_tsmom(senal_tsmom)
        detalles["tsmom"] = {"capital_sleeve": round(capital_tsmom, 2),
                             "valida": valida_tsmom, "razon": razon_tsmom}
        if valida_tsmom and senal_tsmom:
            pesos = senal_tsmom["portfolio"].get("weights", {})
            precios = senal_tsmom.get("market_state", {}).get("prices", {})
            for ticker, w in pesos.items():
                notional = capital_tsmom * abs(w)
                precio = float(precios.get(ticker, 0))
                if notional >= MIN_NOTIONAL:
                    positions.append({
                        "sleeve": "TSMOM",
                        "asset": ticker,
                        "direction": "LONG" if w > 0 else "SHORT",
                        "weight": round(float(w), 4),
                        "notional_usd": round(notional, 2),
                        "unidades": round(notional / precio, 4) if precio > 0 else 0.0,
                        "precio": round(precio, 2),
                        "confidence": senal_tsmom["signal"].get("confidence", 0.0),
                        "sl_price": None,
                        "tp_price": None,
                        "source": "TSMOM_MULTI_ETF",
                    })
            detalles["tsmom"]["rebalance_date"] = senal_tsmom["portfolio"].get(
                "rebalance_date")
            detalles["tsmom"]["n_activos"] = len(pesos)
            detalles["tsmom"]["gross_exposure"] = senal_tsmom["portfolio"].get(
                "gross_exposure")

        # ---- Resumen del portafolio ----
        gross = sum(p["notional_usd"] for p in positions)
        net = sum(p["notional_usd"] if p["direction"] == "LONG"
                  else -p["notional_usd"] for p in positions)
        gross_pct = gross / self.capital_total if self.capital_total else 0
        long_pct = sum(p["notional_usd"] for p in positions
                       if p["direction"] == "LONG") / self.capital_total
        short_pct = sum(p["notional_usd"] for p in positions
                        if p["direction"] == "SHORT") / self.capital_total

        warnings = []
        if gross_pct > MAX_GROSS_EXPOSURE:
            warnings.append(
                f"exposicion bruta {gross_pct:.1%} > limite "
                f"{MAX_GROSS_EXPOSURE:.0%}: reducir pesos del sleeve TSMOM "
                f"(w={self.w_tsmom:.0%})")
        if not detalles["rsi2"]["valida"]:
            warnings.append(f"sleeve RSI2 inactivo: {detalles['rsi2']['razon']}")
        if not detalles["tsmom"]["valida"]:
            warnings.append(f"sleeve TSMOM inactivo: {detalles['tsmom']['razon']}")

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "RSI2+TSMOM_PORTFOLIO",
            "config": {
                "capital_total": self.capital_total,
                "w_tsmom": self.w_tsmom,
                "mode": self.mode,
                "dry_run": self.dry_run,
                "version": "0.1.0",
            },
            "sleeves": detalles,
            "positions": positions,
            "portfolio": {
                "n_posiciones": len(positions),
                "gross_exposure_usd": round(gross, 2),
                "gross_exposure_pct": round(gross_pct, 4),
                "long_pct": round(long_pct, 4),
                "short_pct": round(short_pct, 4),
                "net_pct": round(net / self.capital_total, 4) if self.capital_total else 0,
            },
            "warnings": warnings,
        }

    # ------------------------------------------------------------------
    # REPORTE Y PERSISTENCIA
    # ------------------------------------------------------------------

    def _imprimir_plan(self, plan: Dict):
        print("\n" + "=" * 78)
        print("  PORTAFOLIO RSI(2) SPY + TSMOM 24m — PAPER TRADING")
        print("=" * 78)
        print(f"  Capital total:    ${self.capital_total:,.2f}")
        print(f"  w TSMOM (sleeve): {self.w_tsmom:.0%} -> "
              f"${plan['sleeves']['tsmom']['capital_sleeve']:,.2f}")
        print(f"  w RSI2  (sleeve): {1 - self.w_tsmom:.0%} -> "
              f"${plan['sleeves']['rsi2']['capital_sleeve']:,.2f}")
        print("-" * 78)
        for k in ("rsi2", "tsmom"):
            d = plan["sleeves"][k]
            estado = "OK" if d["valida"] else "SKIP"
            print(f"  [{estado}] sleeve {k.upper()}: {d['razon']}")
        print("-" * 78)
        print("  POSICIONES:")
        if not plan["positions"]:
            print("    (ninguna — sleeves sin senal activa)")
        for p in plan["positions"]:
            print(f"    [{p['sleeve']:<5}] {p['direction']:<5} {p['asset']:<8} "
                  f"${p['notional_usd']:>10,.2f} "
                  f"(w={p['weight']:+.3f} @ ${p['precio']:,.2f})")
        pf = plan["portfolio"]
        print("-" * 78)
        print(f"  Exposicion bruta: {pf['gross_exposure_pct']:.1%} de capital "
              f"(${pf['gross_exposure_usd']:,.2f})")
        print(f"  Long/Short/Net:   {pf['long_pct']:.1%} / {pf['short_pct']:.1%} / "
              f"{pf['net_pct']:+.1%}")
        if pf["gross_exposure_pct"] > MAX_GROSS_EXPOSURE:
            print(f"  [X] ALERTA: exposicion > {MAX_GROSS_EXPOSURE:.0%} (limite)")
        else:
            print(f"  [OK] Exposicion dentro del limite "
                  f"({MAX_GROSS_EXPOSURE:.0%})")
        print("=" * 78)

    def ejecutar_ciclo(self) -> Dict:
        """Ciclo completo: leer senales -> calcular portafolio -> reportar."""
        print("\n" + "=" * 78)
        print("  [PORTAFOLIO] EJECUTOR RSI(2)+TSMOM (w=0.2)")
        print(f"  Modo: {self.mode.upper()}{' (DRY-RUN)' if self.dry_run else ''}")
        print("=" * 78)

        senal_rsi2 = self.leer_senal_rsi2()
        senal_tsmom = self.leer_senal_tsmom()
        print(f"\n  Senal RSI2:  {'presente' if senal_rsi2 else 'AUSENTE'} "
              f"({RSI2_SIGNAL_PATH})")
        print(f"  Senal TSMOM: {'presente' if senal_tsmom else 'AUSENTE'} "
              f"({TSMOM_SIGNAL_PATH})")

        plan = self.calcular_portafolio(senal_rsi2, senal_tsmom)
        self._imprimir_plan(plan)

        # Persistir solo en modo paper (no dry-run)
        if not self.dry_run:
            with open(POSITION_FILE, "w", encoding="utf-8") as f:
                json.dump(plan, f, indent=2, ensure_ascii=False, default=str)
            print(f"\n  [PAPER] Portafolio guardado: {POSITION_FILE}")
        else:
            print("\n  [DRY-RUN] Sin ejecutar trades; solo se persiste el plan de "
                  "reporte (sin estado de posiciones).")

        with open(REPORT_FILE, "w", encoding="utf-8") as f:
            json.dump(plan, f, indent=2, ensure_ascii=False, default=str)

        return plan


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Paper trading del portafolio RSI(2) SPY + TSMOM (w=0.2)")
    parser.add_argument("--capital", type=float, default=100000.0,
                        help="Capital total del portafolio (default: $100,000)")
    parser.add_argument("--w-tsmom", type=float, default=DEFAULT_W_TSMOM,
                        help="Peso del sleeve TSMOM (default: 0.2)")
    parser.add_argument("--mode", choices=["paper"], default="paper",
                        help="Modo de ejecucion (default: paper)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simular sin persistir nada")
    args = parser.parse_args()

    ejecutor = EjecutorPortafolioRSI2TSMOM(
        capital=args.capital, w_tsmom=args.w_tsmom,
        mode=args.mode, dry_run=args.dry_run)
    ejecutor.ejecutar_ciclo()


if __name__ == "__main__":
    main()
