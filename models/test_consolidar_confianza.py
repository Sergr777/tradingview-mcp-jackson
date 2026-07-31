"""
test_consolidar_confianza.py — Tests de la unificación de confianzas
=====================================================================
Verifica consolidar_confianza() en models/pipeline_agentes.py:

  1. Media geométrica de las estimaciones presentes (base + PROPHET +
     MNEMO + SENTIMENT)
  2. Caso sin agentes: la base se mantiene intacta
  3. Trazabilidad: confidence_original preservada y metadata
     confianza_unificada registrada
  4. Clamp a [0, 1]

Uso:
    python models/test_consolidar_confianza.py
    python -m unittest models.test_consolidar_confianza
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.pipeline_agentes import consolidar_confianza


def _senal(**extra):
    """Señal base mínima con confianza 0.60."""
    senal = {
        "signal": {"direction": "LONG", "confidence": 0.60},
        "market_state": {"price": 585.20},
        "risk_parameters": {"kelly_fraction": 0.05, "position_size_pct": 0.05},
    }
    senal.update(extra)
    return senal


def _media_geometrica(*valores):
    """Referencia independiente de la media geométrica."""
    prod = 1.0
    for v in valores:
        prod *= max(float(v), 1e-6)
    return prod ** (1.0 / len(valores))


class TestConsolidarConfianza(unittest.TestCase):
    def test_sin_agentes_base_intacta(self):
        senal = _senal()
        result = consolidar_confianza(senal, base=0.60)
        self.assertEqual(result["signal"]["confidence"], 0.60)
        self.assertEqual(result["signal"].get("confidence_original"), 0.60)

    def test_solo_prophet_media_geometrica(self):
        senal = _senal()
        senal["signal"]["combined_confidence"] = 0.18
        result = consolidar_confianza(senal, base=0.60)
        esperado = round(_media_geometrica(0.60, 0.18), 4)
        self.assertAlmostEqual(result["signal"]["confidence"], esperado, places=4)

    def test_todos_los_agentes_ejemplo_validacion(self):
        # Ejemplo real de la validación: base=0.60, PROPHET=0.18,
        # MNEMO=0.60, SENTIMENT=0.68 → geomean ≈ 0.46
        senal = _senal()
        senal["signal"]["combined_confidence"] = 0.18
        senal["signal"]["sentiment_confidence"] = 0.68
        senal["mnemo"] = {"adjusted_confidence": 0.60}
        result = consolidar_confianza(senal, base=0.60)
        esperado = round(_media_geometrica(0.60, 0.18, 0.60, 0.68), 4)
        self.assertAlmostEqual(result["signal"]["confidence"], esperado, places=4)
        self.assertAlmostEqual(result["signal"]["confidence"], 0.4582, places=3)

    def test_confidence_original_preservada(self):
        senal = _senal()
        senal["signal"]["combined_confidence"] = 0.18
        result = consolidar_confianza(senal, base=0.60)
        self.assertEqual(result["signal"]["confidence_original"], 0.60)
        # La confianza final es la unificada (≠ base cuando hay agentes)
        self.assertNotEqual(result["signal"]["confidence"], 0.60)

    def test_metadata_confianza_unificada(self):
        senal = _senal()
        senal["signal"]["combined_confidence"] = 0.18
        result = consolidar_confianza(senal, base=0.60)
        meta = result["confianza_unificada"]
        self.assertEqual(meta["metodo"], "media_geometrica")
        self.assertEqual(meta["base"], 0.60)
        self.assertEqual(meta["prophet_combined"], 0.18)
        self.assertIsNone(meta["mnemo_adjusted"])
        self.assertIsNone(meta["sentiment_confidence"])
        self.assertEqual(meta["unificada"], result["signal"]["confidence"])

    def test_clamp_a_rango_01(self):
        senal = _senal()
        senal["signal"]["combined_confidence"] = 0.99
        senal["signal"]["sentiment_confidence"] = 0.95
        result = consolidar_confianza(senal, base=0.99)
        self.assertGreaterEqual(result["signal"]["confidence"], 0.0)
        self.assertLessEqual(result["signal"]["confidence"], 1.0)

    def test_base_default_desde_signal(self):
        # Si no se pasa base, usa signal.confidence actual
        senal = _senal()
        senal["signal"]["combined_confidence"] = 0.18
        result = consolidar_confianza(senal)  # base None → 0.60 de signal
        esperado = round(_media_geometrica(0.60, 0.18), 4)
        self.assertAlmostEqual(result["signal"]["confidence"], esperado, places=4)

    def test_base_diferente_pasada_explicitamente(self):
        # La base pre-agentes se pasa explícitamente (0.72) y MNEMO aporta
        # su estimación ajustada (0.60) → estimaciones [0.72, 0.60]
        senal = _senal()
        senal["signal"]["confidence"] = 0.60  # post-MNEMO (NO se cuenta como estimación)
        senal["mnemo"] = {"adjusted_confidence": 0.60}
        result = consolidar_confianza(senal, base=0.72)
        esperado = round(_media_geometrica(0.72, 0.60), 4)
        self.assertAlmostEqual(result["signal"]["confidence"], esperado, places=4)
        # La base original queda en confidence_original
        self.assertEqual(result["signal"]["confidence_original"], 0.72)

    def test_mnemo_sin_memoria_factor_10(self):
        # MNEMO sin memoria ajusta con factor 1.0 → adjusted_confidence == base
        senal = _senal()
        senal["signal"]["combined_confidence"] = 0.18
        senal["mnemo"] = {"adjusted_confidence": 0.60, "adjustment": 1.0}
        result = consolidar_confianza(senal, base=0.60)
        esperado = round(_media_geometrica(0.60, 0.18, 0.60), 4)
        self.assertAlmostEqual(result["signal"]["confidence"], esperado, places=4)

    def test_base_cero_sin_agentes(self):
        # Fix del quirk `or 0.5`: confidence=0.0 → base 0 (no 0.5)
        senal = _senal()
        senal["signal"]["confidence"] = 0.0
        result = consolidar_confianza(senal)  # base None → 0.0
        self.assertEqual(result["signal"]["confidence"], 0.0)
        self.assertEqual(result["signal"].get("confidence_original"), 0.0)
        self.assertEqual(result["confianza_unificada"]["base"], 0.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
