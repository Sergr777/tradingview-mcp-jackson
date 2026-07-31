"""
test_run_ciclo_btc.py — Tests unitarios de _generar_senal_prueba
=================================================================
Verifica el contrato de la senal de prueba dry-run de run_ciclo_btc.py:

  1. risk_parameters con las 6 claves del contrato:
     sl_price, tp_price, sl_atr_mult, tp_atr_mult, kelly_fraction,
     position_size_pct
  2. kelly_fraction = 0.05 y position_size_pct = 0.05 (contrato alineado
     al ecosistema RSI2/OB)
  3. Consistencia interna de precios:
     sl_price = price - ATR*sl_atr_mult, tp_price = price + ATR*tp_atr_mult
     (fixture: price=65000, ATR=812.50, sl_atr_mult=1.0, tp_atr_mult=2.0)
  4. Campos esenciales de la senal (direction=LONG, source, generated_at ISO)
  5. Persistencia en SIGNALS_DIR/latest_signals.json y retorno 0

No-destructivo: redirige SIGNALS_DIR a un directorio temporal (patch del
modulo), nunca toca data/signals/latest_signals.json real.

Uso:
    python test_run_ciclo_btc.py
    python -m unittest test_run_ciclo_btc
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import run_ciclo_btc


class TestGenerarSenalPrueba(unittest.TestCase):
    def setUp(self):
        # Redirige SIGNALS_DIR a un directorio temporal (no-destructivo)
        self._tmp_signals = tempfile.mkdtemp(prefix="test_ciclo_signals_")
        self._orig_signals_dir = run_ciclo_btc.SIGNALS_DIR
        run_ciclo_btc.SIGNALS_DIR = self._tmp_signals
        self.orc = run_ciclo_btc.OrquestadorCicloBTC(dry_run=True)

    def tearDown(self):
        run_ciclo_btc.SIGNALS_DIR = self._orig_signals_dir
        shutil.rmtree(self._tmp_signals, ignore_errors=True)

    def _leer_senal(self):
        ruta = os.path.join(self._tmp_signals, "latest_signals.json")
        self.assertTrue(os.path.exists(ruta),
                        "latest_signals.json no fue creado en SIGNALS_DIR temporal")
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)

    # ── 1. Contrato de 6 claves ──

    def test_contrato_6_claves_risk_parameters(self):
        self.orc._generar_senal_prueba()
        rp = self._leer_senal()["risk_parameters"]
        self.assertEqual(sorted(rp.keys()), [
            "kelly_fraction", "position_size_pct", "sl_atr_mult",
            "sl_price", "tp_atr_mult", "tp_price",
        ])

    def test_kelly_y_position_size_son_05(self):
        self.orc._generar_senal_prueba()
        rp = self._leer_senal()["risk_parameters"]
        self.assertEqual(rp["kelly_fraction"], 0.05)
        self.assertEqual(rp["position_size_pct"], 0.05)

    # ── 2. Consistencia interna de precios ──

    def test_consistencia_interna_precios_atr(self):
        self.orc._generar_senal_prueba()
        s = self._leer_senal()
        price = s["market_state"]["price"]      # 65000.00
        atr = s["market_state"]["atr_actual"]   # 812.50
        rp = s["risk_parameters"]
        # sl = price - ATR*sl_atr_mult, tp = price + ATR*tp_atr_mult
        self.assertAlmostEqual(rp["sl_price"], price - atr * rp["sl_atr_mult"], places=2)
        self.assertAlmostEqual(rp["tp_price"], price + atr * rp["tp_atr_mult"], places=2)
        # Valores exactos del fixture
        self.assertEqual(rp["sl_price"], 64187.50)
        self.assertEqual(rp["tp_price"], 66625.00)
        self.assertEqual(rp["sl_atr_mult"], 1.0)
        self.assertEqual(rp["tp_atr_mult"], 2.0)
        # atr_pct coherente con atr/price
        self.assertAlmostEqual(atr / price, s["market_state"]["atr_pct"], places=4)

    # ── 3. Campos esenciales de la senal ──

    def test_campos_esenciales(self):
        self.orc._generar_senal_prueba()
        s = self._leer_senal()
        self.assertEqual(s["signal"]["direction"], "LONG")
        self.assertEqual(s["signal"]["confidence"], 0.50)
        self.assertEqual(s["signal"]["type"], "META_ENTRY")
        self.assertEqual(s["signal"]["regime"], "NORMAL")
        self.assertEqual(s["source"], "ob_system_btc_15m_dry_run")
        self.assertEqual(s["market_state"]["symbol"], "BTCUSDT")
        self.assertEqual(s["config"], "13_features_optimized")
        self.assertIn("model", s)
        self.assertIn("analysis", s)

    def test_generated_at_iso_utc(self):
        self.orc._generar_senal_prueba()
        s = self._leer_senal()
        dt = datetime.fromisoformat(s["generated_at"])
        self.assertIsNotNone(dt.tzinfo, "generated_at debe tener zona horaria (UTC)")

    # ── 4. Persistencia y retorno ──

    def test_retorno_0_y_archivo_creado(self):
        self.assertEqual(self.orc._generar_senal_prueba(), 0)
        self.assertTrue(os.path.exists(
            os.path.join(self._tmp_signals, "latest_signals.json")))

    def test_no_toca_el_signals_dir_real(self):
        real_path = os.path.join(self._orig_signals_dir, "latest_signals.json")
        backup = None
        if os.path.exists(real_path):
            with open(real_path, encoding="utf-8") as f:
                backup = f.read()
        self.orc._generar_senal_prueba()
        # El archivo real no se modifica durante el test
        if backup is None:
            self.assertFalse(os.path.exists(real_path))
        else:
            with open(real_path, encoding="utf-8") as f:
                self.assertEqual(f.read(), backup)


if __name__ == "__main__":
    unittest.main(verbosity=2)
