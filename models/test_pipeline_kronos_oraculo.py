"""
test_pipeline_kronos_oraculo.py — Tests unitarios del contrato KRONOS/ORACULO
==============================================================================
Verifica el contrato de entrada/salida entre models/pipeline_agentes.py y la
API real de portfolios/invescripto_engine.py:

  1. _metricas_desde_senal: construye ob_metrics/markov_metrics validos para
     la API real (btc_wr=conf*100, sharpe=0, pf=0, WFA=0).
  2. _ejecutar_kronos: llama kronos.evaluar(ob_metrics, markov_metrics,
     vix_estimado=None) y persiste el diagnostico real con las claves
     regimen / exposure_multiplier / confianza.
  3. _ejecutar_oraculo: llama oraculo.calcular_consenso(weights_rp, ...,
     kronos_diagnostico) y consume adjusted_weights.OB_SYSTEM y
     senal_consenso.confianza_oraculo.
  4. Flujo secuencial KRONOS -> ORACULO: ORACULO usa el diagnostico real de
     KRONOS (no el fallback NORMAL) cuando KRONOS ejecuto antes.
  5. Contrato directo de la API real: evaluar() y calcular_consenso() aceptan
     exactamente los argumentos que el pipeline les pasa y devuelven las
     claves que el pipeline lee.

No-destructivo: usa archivos temporales, nunca toca
data/signals/latest_signals.json.

Uso:
    python models/test_pipeline_kronos_oraculo.py
    python -m unittest models.test_pipeline_kronos_oraculo
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.pipeline_agentes import PipelineAgentes, _metricas_desde_senal
from portfolios.invescripto_engine import KronosCircuitBreaker, OraculoConsensus


def senal_rsi2(confidence=0.60):
    """Sen~al RSI2 con la estructura minima del contrato real."""
    return {
        "generated_at": "2026-07-31T12:00:00+00:00",
        "source": "RSI2_SPY",
        "signal": {
            "direction": "LONG",
            "confidence": confidence,
            "type": "RSI2_MEAN_REVERSION",
        },
        "market_state": {"symbol": "SPY", "price": 585.20},
        # Contrato real completo de risk_parameters (6 claves). Precios
        # consistentes con price=585.20 y atr=4.68: sl=585.20-4.68*2=575.84,
        # tp_long=price*10=5852.00.
        "risk_parameters": {
            "sl_price": round(585.20 - 4.68 * 2.0, 2),   # 575.84
            "tp_price": round(585.20 * 10, 2),            # 5852.00
            "sl_atr_mult": 2.0,
            "tp_atr_mult": 10.0,
            "kelly_fraction": 0.05,
            "position_size_pct": 0.05,
        },
    }


class _BasePipelineTest(unittest.TestCase):
    """Base con archivo de sen~al temporal (no-destructivo)."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        self.tmp_path = self.tmp.name
        self.tmp.close()

    def tearDown(self):
        if os.path.exists(self.tmp_path):
            os.unlink(self.tmp_path)

    def _escribir(self, senal):
        with open(self.tmp_path, "w", encoding="utf-8") as f:
            json.dump(senal, f, ensure_ascii=False)

    def _leer(self):
        with open(self.tmp_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _pipeline(self):
        return PipelineAgentes(signal_path=self.tmp_path)


# ─────────────────────────────────────────────────────────────────────────
# 1. _metricas_desde_senal
# ─────────────────────────────────────────────────────────────────────────


class TestMetricasDesdeSenal(unittest.TestCase):
    def test_confianza_060_mapea_a_wr_60(self):
        ob, mk = _metricas_desde_senal(senal_rsi2(0.60))
        self.assertEqual(ob["btc_wr"], 60.0)
        self.assertEqual(ob["btc_sharpe"], 0.0)
        self.assertEqual(ob["btc_pf"], 0.0)
        self.assertEqual(ob["total_trades"], 0)
        self.assertEqual(mk, {"wr": 0, "rentabilidad": 0, "trades": 0})

    def test_sin_clave_signal_default_confianza_05(self):
        ob, _ = _metricas_desde_senal({})
        self.assertEqual(ob["btc_wr"], 50.0)

    def test_confianza_none_default_confianza_05(self):
        ob, _ = _metricas_desde_senal({"signal": {"confidence": None}})
        self.assertEqual(ob["btc_wr"], 50.0)

    def test_confianza_0_mapea_a_wr_0(self):
        # Fix del quirk `or 0.5`: 0.0 es una confianza válida → wr 0, no 0.5.
        ob, _ = _metricas_desde_senal({"signal": {"confidence": 0.0}})
        self.assertEqual(ob["btc_wr"], 0.0)


# ─────────────────────────────────────────────────────────────────────────
# 2. _ejecutar_kronos
# ─────────────────────────────────────────────────────────────────────────


class TestEjecutarKronos(_BasePipelineTest):
    def test_confianza_060_regimen_normal_exposure_100(self):
        self._escribir(senal_rsi2(0.60))
        senal = self._pipeline()._ejecutar_kronos()
        self.assertIsNotNone(senal)
        k = senal["kronos"]
        # Contrato: las claves que lee el pipeline existen en el diagnostico real
        self.assertEqual(k["regimen"], "NORMAL")
        self.assertEqual(k["exposure_mult"], 1.0)
        self.assertEqual(k["confidence"], round(0.85 / 2.5, 3))  # 0.34
        diag = k["diagnostico"]
        for clave in ("regimen", "exposure_multiplier", "confianza",
                      "puntuacion_bruta", "factores_positivos", "advertencias"):
            self.assertIn(clave, diag)
        # El diagnostico persistido coincide con lo que el pipeline lee de el
        self.assertEqual(diag["regimen"], k["regimen"])
        self.assertEqual(diag["exposure_multiplier"], k["exposure_mult"])
        self.assertEqual(diag["confianza"], k["confidence"])
        # La sen~al NO queda marcada como CRISIS
        self.assertEqual(senal["signal"].get("regime"), None)
        self.assertNotIn("kronos_warning", senal["signal"])

    def test_confianza_050_dispara_crisis_y_marca_senal(self):
        self._escribir(senal_rsi2(0.50))
        senal = self._pipeline()._ejecutar_kronos()
        self.assertIsNotNone(senal)
        k = senal["kronos"]
        # btc_wr=50 < 55 (-0.10) + sharpe=0 (-0.10) + WFA 0/4 (-0.15) = -0.35
        self.assertEqual(k["regimen"], "CRISIS")
        self.assertEqual(k["exposure_mult"], 0.5)
        self.assertEqual(k["confidence"], round((max(-1.0, -0.35) + 1.0) / 2.5, 3))  # 0.26
        # Circuit breaker: la sen~al queda marcada
        self.assertEqual(senal["signal"]["regime"], "CRISIS")
        self.assertTrue(senal["signal"].get("kronos_warning"))
        # Y persiste en disco
        self.assertEqual(self._leer()["signal"]["regime"], "CRISIS")

    def test_confianza_090_no_alcanza_ALTA(self):
        # Documenta el diseno: con sharpe=0 y WFA=0 fijos el maximo puntaje es
        # ~0.0 (< 0.6), asi que ALTA (1.2x) no es alcanzable por este camino.
        self._escribir(senal_rsi2(0.90))
        senal = self._pipeline()._ejecutar_kronos()
        k = senal["kronos"]
        self.assertEqual(k["regimen"], "NORMAL")
        self.assertEqual(k["exposure_mult"], 1.0)


# ─────────────────────────────────────────────────────────────────────────
# 3. _ejecutar_oraculo
# ─────────────────────────────────────────────────────────────────────────


class TestEjecutarOraculo(_BasePipelineTest):
    def test_pesos_75_25_y_oraculo_weight(self):
        self._escribir(senal_rsi2(0.60))
        senal = self._pipeline()._ejecutar_oraculo()
        self.assertIsNotNone(senal)
        o = senal["oraculo"]
        pesos = o["pesos_recomendados"]
        # score_ob = 0.60*0.4 = 0.24, score_mk = 0
        # peso_ob_relativo = 1.0 → OB_SYSTEM = 0.5*0.5 + 0.5*1.0 = 0.75
        self.assertAlmostEqual(pesos["OB_SYSTEM"], 0.75, places=4)
        self.assertAlmostEqual(pesos["MARKOV_ACCIONES"], 0.25, places=4)
        self.assertEqual(pesos["exposure_multiplier"], 1.0)
        # El peso recomendado OB se propaga a signal.oraculo_weight
        self.assertAlmostEqual(senal["signal"]["oraculo_weight"], 0.75, places=4)
        # Sin diagnostico KRONOS previo → fallback NORMAL (confianza 0.5)
        self.assertEqual(o["confianza_consenso"], 0.5)

    def test_sin_diagnostico_kronos_usa_fallback_normal(self):
        self._escribir(senal_rsi2(0.60))
        senal = self._pipeline()._ejecutar_oraculo()
        o = senal["oraculo"]
        self.assertEqual(o["pesos_recomendados"]["exposure_multiplier"], 1.0)
        self.assertEqual(o["confianza_consenso"], 0.5)


# ─────────────────────────────────────────────────────────────────────────
# 4. Flujo secuencial KRONOS -> ORACULO
# ─────────────────────────────────────────────────────────────────────────


class TestFlujoSecuencial(_BasePipelineTest):
    def test_oraculo_usa_diagnostico_real_de_kronos(self):
        # KRONOS dispara CRISIS con confianza 0.50
        self._escribir(senal_rsi2(0.50))
        pipeline = self._pipeline()
        self.assertIsNotNone(pipeline._ejecutar_kronos())
        senal = pipeline._ejecutar_oraculo()
        o = senal["oraculo"]
        # ORACULO debe usar el diagnostico REAL de KRONOS (no el fallback)
        self.assertEqual(o["pesos_recomendados"]["exposure_multiplier"], 0.5)
        self.assertEqual(o["confianza_consenso"], 0.26)
        # La senal persistida conserva ambas secciones y el contrato
        final = self._leer()
        self.assertIn("kronos", final)
        self.assertIn("oraculo", final)
        self.assertEqual(final["risk_parameters"]["kelly_fraction"], 0.05)
        self.assertEqual(final["risk_parameters"]["position_size_pct"], 0.05)


# ─────────────────────────────────────────────────────────────────────────
# 5. Contrato directo de la API real
# ─────────────────────────────────────────────────────────────────────────


class TestContratoApiReal(unittest.TestCase):
    """Pinea la firma real de invescripto_engine con los argumentos exactos
    que pipeline_agentes les pasa. Si la API cambia, estos tests fallan."""

    def test_kronos_evaluar_acepta_metricas_del_pipeline(self):
        ob, mk = _metricas_desde_senal(senal_rsi2(0.60))
        diag = KronosCircuitBreaker().evaluar(
            ob_metrics=ob, markov_metrics=mk, vix_estimado=None
        )
        for clave in ("regimen", "exposure_multiplier", "confianza",
                      "puntuacion_bruta", "factores_positivos", "advertencias"):
            self.assertIn(clave, diag)
        self.assertEqual(diag["regimen"], "NORMAL")
        self.assertEqual(diag["exposure_multiplier"], 1.0)

    def test_oraculo_calcular_consenso_acepta_args_del_pipeline(self):
        ob, mk = _metricas_desde_senal(senal_rsi2(0.60))
        kronos_diag = {"regimen": "NORMAL", "exposure_multiplier": 1.0, "confianza": 0.5}
        resultado = OraculoConsensus().calcular_consenso(
            weights_rp={"OB_SYSTEM": 0.5, "MARKOV_ACCIONES": 0.5},
            ob_metrics=ob,
            markov_metrics=mk,
            kronos_diagnostico=kronos_diag,
        )
        # Claves que el pipeline consume
        adjusted = resultado["adjusted_weights"]
        self.assertIn("OB_SYSTEM", adjusted)
        self.assertIn("MARKOV_ACCIONES", adjusted)
        self.assertIn("exposure_multiplier", adjusted)
        consenso = resultado["senal_consenso"]
        self.assertIn("confianza_oraculo", consenso)
        self.assertAlmostEqual(adjusted["OB_SYSTEM"], 0.75, places=4)
        self.assertEqual(consenso["confianza_oraculo"], 0.5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
