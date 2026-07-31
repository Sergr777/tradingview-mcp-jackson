"""
test_ejecutor_portafolio_rsi2_tsmom.py — Tests unitarios del portafolio RSI(2)+TSMOM
=====================================================================================
Verifica el contrato de `calcular_portafolio` del ejecutor combinado
(portfolios/ejecutor_portafolio_rsi2_tsmom.py):

  1. Reparto de capital por sleeves: w_tsmom=0.2 -> 20% TSMOM, 80% RSI2
  2. Sizing del sleeve RSI2: position_size_pct (5%) aplicado al capital del sleeve
  3. Sizing del sleeve TSMOM: pesos objetivo aplicados al capital del sleeve
  4. Direcciones correctas (LONG/SHORT segun signo del peso)
  5. Resumen del portafolio (exposiciones bruta/long/short/net)
  6. Casos limite: sin senal, pesos negativos, sleeve ausente

Uso:
    python -m portfolios.test_ejecutor_portafolio_rsi2_tsmom
    python -m unittest portfolios.test_ejecutor_portafolio_rsi2_tsmom -v
"""

import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from portfolios.ejecutor_portafolio_rsi2_tsmom import (  # noqa: E402
    EjecutorPortafolioRSI2TSMOM,
    DEFAULT_W_TSMOM,
    MAX_GROSS_EXPOSURE,
)


# =============================================================================
# FIXTURES
# =============================================================================

def _senal_rsi2(direccion="LONG", confianza=0.60, position_size_pct=0.05,
                precio=500.0):
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "RSI2_SPY",
        "market_state": {
            "symbol": "SPY",
            "price": precio,
            "atr_pct": 0.01,
        },
        "signal": {
            "direction": direccion,
            "confidence": confianza,
            "type": "RSI2_MEAN_REVERSION",
            "regime": "NORMAL",
        },
        "risk_parameters": {
            "sl_price": 490.0,
            "tp_price": 1000.0,
            "sl_atr_mult": 2.0,
            "tp_atr_mult": 0,
            "kelly_fraction": 0.05,
            "position_size_pct": position_size_pct,
        },
    }


def _senal_tsmom(pesos=None, rebalance="2026-07-10"):
    if pesos is None:
        pesos = {"SPY": 0.10, "GLD": -0.08, "TLT": 0.05}
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "TSMOM_MULTI_ETF",
        "portfolio": {
            "weights": pesos,
            "rebalance_date": rebalance,
            "n_active": len(pesos),
            "gross_exposure": round(sum(abs(v) for v in pesos.values()), 4),
            "direction_neto": "LONG",
        },
        "market_state": {
            "symbol": "MULTI_ETF",
            "prices": {"SPY": 500.0, "GLD": 200.0, "TLT": 95.0},
            "atr_pct": 0.008,
        },
        "signal": {
            "direction": "LONG",
            "confidence": 0.60,
            "type": "TSMOM_MONTHLY_REBALANCE",
            "regime": "NORMAL",
        },
        "risk_parameters": {
            "kelly_fraction": 0.05,
            "position_size_pct": 0.20,
        },
    }


class TestSizingCombinado(unittest.TestCase):

    def setUp(self):
        self.capital = 100000.0
        self.ejecutor = EjecutorPortafolioRSI2TSMOM(
            capital=self.capital, w_tsmom=0.20, mode="paper", dry_run=True)

    # ── 1. Reparto de capital por sleeves ──
    def test_reparto_capital_por_sleeves(self):
        plan = self.ejecutor.calcular_portafolio(
            _senal_rsi2(), _senal_tsmom())
        self.assertAlmostEqual(plan["sleeves"]["tsmom"]["capital_sleeve"],
                               20000.0, places=2)
        self.assertAlmostEqual(plan["sleeves"]["rsi2"]["capital_sleeve"],
                               80000.0, places=2)
        self.assertEqual(plan["config"]["w_tsmom"], DEFAULT_W_TSMOM)

    def test_peso_sleeve_desde_la_senal(self):
        # La senal TSMOM es la fuente de verdad del peso del sleeve:
        # position_size_pct=0.30 debe primar sobre el constructor (0.20)
        senal = _senal_tsmom()
        senal["risk_parameters"]["position_size_pct"] = 0.30
        plan = self.ejecutor.calcular_portafolio(_senal_rsi2(), senal)
        self.assertAlmostEqual(plan["sleeves"]["tsmom"]["capital_sleeve"],
                               30000.0, places=2)
        self.assertAlmostEqual(plan["sleeves"]["rsi2"]["capital_sleeve"],
                               70000.0, places=2)

    # ── 2. Sizing sleeve RSI2 (5% fijo del sleeve) ──
    def test_sizing_rsi2_5pct_del_sleeve(self):
        plan = self.ejecutor.calcular_portafolio(
            _senal_rsi2(), _senal_tsmom())
        pos_rsi2 = [p for p in plan["positions"] if p["sleeve"] == "RSI2"]
        self.assertEqual(len(pos_rsi2), 1)
        # 5% * 80% * 100k = $4,000
        self.assertAlmostEqual(pos_rsi2[0]["notional_usd"], 4000.0, places=2)
        self.assertEqual(pos_rsi2[0]["asset"], "SPY")
        self.assertEqual(pos_rsi2[0]["direction"], "LONG")

    def test_sizing_rsi2_short(self):
        plan = self.ejecutor.calcular_portafolio(
            _senal_rsi2(direccion="SHORT"), _senal_tsmom())
        pos = [p for p in plan["positions"] if p["sleeve"] == "RSI2"][0]
        self.assertEqual(pos["direction"], "SHORT")

    # ── 3. Sizing sleeve TSMOM (pesos vol-targeting del sleeve) ──
    def test_sizing_tsmom_pesos_sobre_sleeve(self):
        plan = self.ejecutor.calcular_portafolio(
            _senal_rsi2(), _senal_tsmom())
        pos_tsm = {p["asset"]: p for p in plan["positions"]
                   if p["sleeve"] == "TSMOM"}
        self.assertEqual(set(pos_tsm.keys()), {"SPY", "GLD", "TLT"})
        # SPY: 0.10 * 20% * 100k = $2,000 LONG
        self.assertAlmostEqual(pos_tsm["SPY"]["notional_usd"], 2000.0, places=2)
        self.assertEqual(pos_tsm["SPY"]["direction"], "LONG")
        # GLD: 0.08 * 20% * 100k = $1,600 SHORT
        self.assertAlmostEqual(pos_tsm["GLD"]["notional_usd"], 1600.0, places=2)
        self.assertEqual(pos_tsm["GLD"]["direction"], "SHORT")
        # TLT: 0.05 * 20% * 100k = $1,000 LONG
        self.assertAlmostEqual(pos_tsm["TLT"]["notional_usd"], 1000.0, places=2)

    # ── 4. Resumen del portafolio ──
    def test_resumen_portafolio(self):
        plan = self.ejecutor.calcular_portafolio(
            _senal_rsi2(), _senal_tsmom())
        pf = plan["portfolio"]
        # Bruta = 4000 + 2000 + 1600 + 1000 = $8,600
        self.assertAlmostEqual(pf["gross_exposure_usd"], 8600.0, places=2)
        self.assertAlmostEqual(pf["gross_exposure_pct"], 0.086, places=4)
        # Long = 4000 + 2000 + 1000 = 7000 ; Short = 1600
        self.assertAlmostEqual(pf["long_pct"], 0.07, places=4)
        self.assertAlmostEqual(pf["short_pct"], 0.016, places=4)
        self.assertAlmostEqual(pf["net_pct"], 0.054, places=4)
        self.assertEqual(pf["n_posiciones"], 4)

    # ── 5. Casos limite ──
    def test_sin_senales(self):
        plan = self.ejecutor.calcular_portafolio(None, None)
        self.assertEqual(plan["positions"], [])
        self.assertEqual(plan["portfolio"]["n_posiciones"], 0)
        self.assertEqual(plan["portfolio"]["gross_exposure_usd"], 0.0)
        self.assertFalse(plan["sleeves"]["rsi2"]["valida"])
        self.assertFalse(plan["sleeves"]["tsmom"]["valida"])

    def test_solo_tsmom(self):
        plan = self.ejecutor.calcular_portafolio(None, _senal_tsmom())
        sleeves = {p["sleeve"] for p in plan["positions"]}
        self.assertEqual(sleeves, {"TSMOM"})

    def test_solo_rsi2(self):
        plan = self.ejecutor.calcular_portafolio(_senal_rsi2(), None)
        sleeves = {p["sleeve"] for p in plan["positions"]}
        self.assertEqual(sleeves, {"RSI2"})

    def test_tsmom_todo_cash(self):
        # Pesos vacios -> sleeve TSMOM en cash
        plan = self.ejecutor.calcular_portafolio(
            _senal_rsi2(), _senal_tsmom(pesos={}))
        pos_tsm = [p for p in plan["positions"] if p["sleeve"] == "TSMOM"]
        self.assertEqual(pos_tsm, [])

    def test_exposicion_alerta(self):
        # Pesos grandes en el sleeve TSMOM -> exposicion bruta > limite
        # TSMOM: (1.5 + 1.2 + 1.0) * 0.20 = 0.74 ; RSI2: 0.04 -> 0.78 > 0.50
        pesos_grandes = {"SPY": 1.5, "GLD": -1.2, "TLT": 1.0}
        plan = self.ejecutor.calcular_portafolio(
            _senal_rsi2(), _senal_tsmom(pesos=pesos_grandes))
        self.assertGreater(plan["portfolio"]["gross_exposure_pct"],
                           MAX_GROSS_EXPOSURE)
        self.assertTrue(any("exposicion" in w.lower() for w in plan["warnings"]))

    def test_peso_posicion_minimo(self):
        # Nocionales menores a MIN_NOTIONAL ($100) se filtran
        ejecutor = EjecutorPortafolioRSI2TSMOM(
            capital=500.0, w_tsmom=0.20, mode="paper", dry_run=True)
        plan = ejecutor.calcular_portafolio(
            _senal_rsi2(), _senal_tsmom())
        for p in plan["positions"]:
            self.assertGreaterEqual(p["notional_usd"], 100.0)


if __name__ == "__main__":
    unittest.main()
