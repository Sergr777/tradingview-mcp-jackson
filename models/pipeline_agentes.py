"""
pipeline_agentes.py — PIPELINE DE AGENTES: KRONOS → ORACULO → PROPHET → MNEMO → SENTIMENT
=========================================================================================
Orquesta la ejecucion secuencial de los 5 agentes del ecosistema
invest_criptoai sobre la señal generada por el OB System.

Pipeline completo:
  generador_senales.py (OB System)
    ↓ latest_signals.json
  [0] KRONOS    →  Circuit breaker: regimen de mercado (CRISIS/NORMAL/ALTA)
    ↓ kronos.regimen + exposure_multiplier
  [0b] ORACULO  →  Risk parity: pesos recomendados por sistema
    ↓ oraculo.pesos_recomendados + signal.oraculo_weight
  [1] PROPHET   →  Combina OB + prediccion de precio (LightGBM)
    ↓ signal.combined_confidence (NO toca signal.confidence)
  [2] MNEMO     →  Ajusta por memoria de patrones historicos (SQLite)
    ↓ signal.confidence = ajustada + mnemo.adjusted_confidence
  [3] SENTIMENT →  Ajusta por sentimiento de mercado (VADER + Fear&Greed)
    ↓ signal.sentiment_confidence
  [4] CONSOLIDAR_CONFIANZA → media geometrica → signal.confidence (unificada)
    ↓ signal.confidence = confianza_unificada.unificada
  ejecutor_senales.py (valida signal.confidence >= MIN_CONFIDENCE_TO_TRADE)

Unificacion de confianzas (consolidar_confianza):
  Las confianzas paralelas de los agentes se combinan con media geometrica
  en una sola signal.confidence (el unico campo que valida el ejecutor):

    base (generador, pre-agentes) × signal.combined_confidence (PROPHET)
    × mnemo.adjusted_confidence (MNEMO) × signal.sentiment_confidence

  El resultado queda trazado en senal['confianza_unificada'] con cada
  estimacion individual (base, prophet_combined, mnemo_adjusted,
  sentiment_confidence) y el valor unificado final, ademas de preservar
  signal.confidence_original. Nota: en --dry-run NO se consolida — los
  agentes se simulan y no modifican el archivo.

KRONOS + ORACULO operan a nivel portfolio (invescripto_engine.py)
y ya estan integrados en el macro-coordinador.

Documentacion completa del flujo unificado de confianzas y su
trazabilidad en confianza_unificada: ver models/README.md (README de agentes).

Uso directo:
    python -m models.pipeline_agentes                         # Pipeline completo
    python -m models.pipeline_agentes --dry-run               # Simular solo
    python -m models.pipeline_agentes --skip-prophet          # Saltar PROPHET
    python -m models.pipeline_agentes --skip-mnemo            # Saltar MNEMO
    python -m models.pipeline_agentes --skip-sentiment        # Saltar SENTIMENT
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGNALS_DIR = os.path.join(PROJECT_ROOT, "data", "signals")
SIGNAL_PATH = os.path.join(SIGNALS_DIR, "latest_signals.json")

# Nombres de agentes para reportes
AGENTES = {
    "kronos": "KRONOS (Circuit Breaker - Regimen de Mercado)",
    "oraculo": "ORACULO (Consensus Engine - Risk Parity)",
    "prophet": "PROPHET (Prediccion de Precio)",
    "mnemo": "MNEMO (Memoria Persistente)",
    "sentiment": "SENTIMENT (Analisis de Sentimiento)",
}


def _metricas_desde_senal(senal: Dict) -> Tuple[Dict, Dict]:
    """
    Construye ob_metrics/markov_metrics para la API real de KRONOS/ORACULO.

    La sen~al es de un solo sistema (OB o RSI2), no trae historial WFA real;
    se usa la confianza de la sen~al como proxy de WR. Nota de comportamiento:
    como btc_sharpe=0 (penaliza -0.10) y w1..w4_pf=0 (penaliza -0.15) son fijos,
    KRONOS queda en NORMAL (exposure 1.0) solo si la confianza >= ~0.55; con
    confianza menor, puntuacion <= -0.3 → CRISIS (circuit breaker de señales
    débiles, luego el ejecutor aplica regime_mult 0.3x). Con las penalizaciones
    fijas (sharpe=0, WFA=0) el puntaje máximo es ~0.0, por lo que ALTA (1.2x)
    no es alcanzable por este camino. ORACULO reparte 50/50.
    """
    sig = senal.get("signal", {}) or {}
    # Sin quirk `or 0.5`: confidence=0.0 es una confianza válida y debe
    # mapear a wr 0, no a 0.5 (0.0 es falsy). Solo None/ausencia → default 0.5.
    conf_raw = sig.get("confidence")
    conf = float(conf_raw) if conf_raw is not None else 0.5
    ob_metrics = {
        "btc_wr": round(conf * 100, 2),
        "btc_sharpe": 0.0,
        "btc_pf": 0.0,
        "total_trades": 0,
    }
    markov_metrics = {"wr": 0, "rentabilidad": 0, "trades": 0}
    return ob_metrics, markov_metrics


def consolidar_confianza(senal: Dict, base: float = None) -> Dict:
    """
    Unifica las confianzas paralelas de PROPHET/MNEMO/SENTIMENT en una sola
    signal.confidence mediante media geométrica (equilibrada).

    Estimaciones consideradas (solo las presentes en la señal):
      - base: confianza original del generador (pre-agentes)
      - signal.combined_confidence: PROPHET (OB + predicción de precio)
      - mnemo.adjusted_confidence: MNEMO (memoria histórica)
      - signal.sentiment_confidence: SENTIMENT (sentimiento de mercado)

    La media geométrica da peso equitativo a cada estimación independiente
    sin doble contar la base. Nota deliberada: mnemo.adjusted_confidence y
    sentiment_confidence pueden solaparse, porque SENTIMENT parte de la
    confianza ya ajustada por MNEMO — su doble presencia es intencional y
    refleja la cadena real de agentes (no es un accidente). El resultado se
    escribe en signal.confidence (el campo que el ejecutor valida contra
    MIN_CONFIDENCE_TO_TRADE) y queda registrado en
    senal['confianza_unificada'] para trazabilidad.
    """
    sig = senal.get("signal", {})
    if base is None:
        # Sin quirk `or 0.5`: confidence=0.0 → base 0 (no 0.5)
        base_raw = sig.get("confidence")
        base = float(base_raw) if base_raw is not None else 0.5
    base = max(0.0, min(1.0, base))

    estimaciones = [base]

    combined = sig.get("combined_confidence")
    if combined is not None:
        estimaciones.append(max(0.0, min(1.0, float(combined))))

    mnemo_adj = senal.get("mnemo", {}).get("adjusted_confidence")
    if mnemo_adj is not None:
        estimaciones.append(max(0.0, min(1.0, float(mnemo_adj))))

    sentiment_conf = sig.get("sentiment_confidence")
    if sentiment_conf is not None:
        estimaciones.append(max(0.0, min(1.0, float(sentiment_conf))))

    # Media geométrica: (prod)^(1/n), con piso para evitar ceros.
    prod = 1.0
    for e in estimaciones:
        prod *= max(float(e), 1e-6)
    unificada = prod ** (1.0 / len(estimaciones))

    # Sin agentes: la base se mantiene intacta
    if len(estimaciones) == 1:
        unificada = base

    unificada = round(max(0.0, min(1.0, unificada)), 4)

    # Preservar la original para trazabilidad
    if "confidence_original" not in sig:
        sig["confidence_original"] = round(base, 4)
    sig["confidence"] = unificada

    senal["confianza_unificada"] = {
        "metodo": "media_geometrica",
        "base": round(base, 4),
        "prophet_combined": (round(float(combined), 4)
                              if combined is not None else None),
        "mnemo_adjusted": (round(float(mnemo_adj), 4)
                            if mnemo_adj is not None else None),
        "sentiment_confidence": (round(float(sentiment_conf), 4)
                                  if sentiment_conf is not None else None),
        "unificada": unificada,
    }
    return senal


# =============================================================================
# PIPELINE DE AGENTES
# =============================================================================

class PipelineAgentes:
    """
    Orquesta la ejecucion secuencial de los agentes sobre la señal del OB System.

    Cada agente lee, modifica y escribe el mismo archivo signals.json,
    aplicando su capa de inteligencia en orden:

      1. PROPHET  → Prediccion de precio (LightGBM) + combinacion con OB
      2. MNEMO    → Memoria de patrones historicos (clusters SQLite)
      3. SENTIMENT → Sentimiento de mercado (VADER + Fear & Greed)

    El pipeline es composable: cualquier agente puede saltarse con flags.
    """

    def __init__(
        self,
        signal_path: str = SIGNAL_PATH,
        skip_kronos: bool = False,
        skip_oraculo: bool = False,
        skip_prophet: bool = False,
        skip_mnemo: bool = False,
        skip_sentiment: bool = False,
        dry_run: bool = False,
    ):
        self.signal_path = signal_path
        self.skip_kronos = skip_kronos
        self.skip_oraculo = skip_oraculo
        self.skip_prophet = skip_prophet
        self.skip_mnemo = skip_mnemo
        self.skip_sentiment = skip_sentiment
        self.dry_run = dry_run

        self.timing: Dict[str, float] = {}
        self.resultados: Dict[str, Dict] = {}

        os.makedirs(SIGNALS_DIR, exist_ok=True)

    # ------------------------------------------------------------------
    # AGENTE 0: KRONOS (Circuit Breaker)
    # ------------------------------------------------------------------

    def _ejecutar_kronos(self) -> Optional[Dict]:
        """
        Ejecuta KRONOS: evalua el regimen de mercado y ajusta la exposicion.
        Actua como Circuit Breaker: si detecta CRISIS, reduce exposicion.
        An~ade metadata de regimen a la sen~al.
        """
        print(f"\n  >>> [0/5] {AGENTES['kronos']}")

        try:
            from portfolios.invescripto_engine import KronosCircuitBreaker

            if self.dry_run:
                print("  [PIPELINE] DRY-RUN: Simulando KRONOS...")
                return {"active": True, "dry_run": True}

            senal = self._cargar_senal()
            if senal is None:
                return None

            kronos = KronosCircuitBreaker()

            # API real: evaluar(ob_metrics, markov_metrics, dias, vix_estimado)
            sig = senal.get("signal", {})
            ob_metrics, markov_metrics = _metricas_desde_senal(senal)

            diagnostico = kronos.evaluar(
                ob_metrics=ob_metrics,
                markov_metrics=markov_metrics,
                vix_estimado=None,  # la sen~al no trae VIX
            )

            # An~adir diagnostico KRONOS a la sen~al
            senal["kronos"] = {
                "active": True,
                "regimen": diagnostico.get("regimen", "NORMAL"),
                "exposure_mult": diagnostico.get("exposure_multiplier", 1.0),
                "confidence": diagnostico.get("confianza", 0.5),
                "diagnostico": diagnostico,
            }

            # Si KRONOS detecta CRISIS, marcar la sen~al
            if diagnostico.get("regimen") == "CRISIS":
                sig["regime"] = "CRISIS"
                sig["kronos_warning"] = True
                print(f"  [PIPELINE] KRONOS: REGIMEN CRISIS detectado! Exposicion reducida a {diagnostico.get('exposure_multiplier', 0.3):.1%}")

            self._guardar_senal(senal)

            print(f"  [PIPELINE] KRONOS: Regimen={diagnostico.get('regimen', 'NORMAL')} | "
                  f"Exposure={diagnostico.get('exposure_multiplier', 1.0):.1%}")

            return senal

        except Exception as e:
            print(f"  [PIPELINE] ERROR en KRONOS: {e}")
            return None

    # ------------------------------------------------------------------
    # AGENTE 0b: ORACULO (Consensus Engine)
    # ------------------------------------------------------------------

    def _ejecutar_oraculo(self) -> Optional[Dict]:
        """
        Ejecuta ORACULO: ajusta pesos de Risk Parity basado en rendimiento.
        An~ade recomendacion de pesos a la sen~al para el ejecutor.
        """
        print(f"\n  >>> [0b/5] {AGENTES['oraculo']}")

        try:
            from portfolios.invescripto_engine import OraculoConsensus

            if self.dry_run:
                print("  [PIPELINE] DRY-RUN: Simulando ORACULO...")
                return {"active": True, "dry_run": True}

            senal = self._cargar_senal()
            if senal is None:
                return None

            oraculo = OraculoConsensus()

            # Diagnostico de KRONOS (si se ejecuto antes) o default NORMAL
            kronos_diag = senal.get("kronos", {}).get("diagnostico") or {
                "regimen": "NORMAL",
                "exposure_multiplier": 1.0,
                "confianza": 0.5,
            }
            ob_metrics, markov_metrics = _metricas_desde_senal(senal)

            # API real: calcular_consenso(weights_rp, ob_metrics, markov_metrics, kronos_diagnostico)
            resultado = oraculo.calcular_consenso(
                weights_rp={"OB_SYSTEM": 0.5, "MARKOV_ACCIONES": 0.5},
                ob_metrics=ob_metrics,
                markov_metrics=markov_metrics,
                kronos_diagnostico=kronos_diag,
            )
            adjusted = resultado.get("adjusted_weights", {})
            consenso = resultado.get("senal_consenso", {})

            # An~adir recomendacion ORACULO a la sen~al
            senal["oraculo"] = {
                "active": True,
                "pesos_recomendados": adjusted,
                "confianza_consenso": consenso.get("confianza_oraculo", 0.5),
            }

            # An~adir peso recomendado OB a la sen~al
            sig = senal.get("signal", {})
            if adjusted:
                sig["oraculo_weight"] = adjusted.get("OB_SYSTEM", 0.25)

            self._guardar_senal(senal)

            pesos_ob = adjusted.get("OB_SYSTEM", 0.25) if adjusted else 0.25
            print(f"  [PIPELINE] ORACULO: Peso recomendado OB: {pesos_ob:.1%} | "
                  f"Confianza: {consenso.get('confianza_oraculo', 0.5):.0%}")

            return senal

        except Exception as e:
            print(f"  [PIPELINE] ERROR en ORACULO: {e}")
            return None

    # ------------------------------------------------------------------
    # CARGA / GUARDADO DE SEÑAL
    # ------------------------------------------------------------------

    def _cargar_senal(self) -> Optional[Dict]:
        """Carga la señal actual desde signals.json."""
        if not os.path.exists(self.signal_path):
            print("  [PIPELINE] No hay sen~al para procesar")
            return None

        with open(self.signal_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _guardar_senal(self, senal: Dict):
        """Guarda la señal procesada a signals.json."""
        with open(self.signal_path, "w", encoding="utf-8") as f:
            json.dump(senal, f, indent=2, ensure_ascii=False, default=str)

    # ------------------------------------------------------------------
    # AGENTE 1: PROPHET
    # ------------------------------------------------------------------

    def _ejecutar_prophet(self) -> Optional[Dict]:
        """
        Ejecuta PROPHET: prediccion de precio con LightGBM.
        Combina la probabilidad OB con la prediccion de PROPHET.
        """
        print(f"\n  >>> [1/3] {AGENTES['prophet']}")

        try:
            from models.prophet_agent import ProphetAgent, predecir_y_combinar

            if self.dry_run:
                print("  [PIPELINE] DRY-RUN: Simulando PROPHET...")
                return {"active": True, "dry_run": True}

            resultado = predecir_y_combinar(self.signal_path)

            if resultado:
                pr = resultado.get("prophet", {})
                sig = resultado.get("signal", {})
                print(f"  [PIPELINE] PROPHET: {pr.get('consenso', 'N/A')} | "
                      f"Conf combinada: {sig.get('combined_confidence', 0):.2%}")
                return resultado

            print("  [PIPELINE] PROPHET: Sin resultado (datos insuficientes?)")
            return None

        except Exception as e:
            print(f"  [PIPELINE] ERROR en PROPHET: {e}")
            return None

    # ------------------------------------------------------------------
    # AGENTE 2: MNEMO
    # ------------------------------------------------------------------

    def _ejecutar_mnemo(self) -> Optional[Dict]:
        """
        Ejecuta MNEMO: ajuste de sen~al por memoria de patrones historicos.
        Busca clusters similares en SQLite y ajusta la confianza.
        """
        print(f"\n  >>> [2/3] {AGENTES['mnemo']}")

        try:
            from models.mnemo_agent import MnemoAgent

            if self.dry_run:
                print("  [PIPELINE] DRY-RUN: Simulando MNEMO...")
                return {"active": True, "dry_run": True}

            mnemo = MnemoAgent()
            senal = self._cargar_senal()
            if senal is None:
                return None

            senal_ajustada = mnemo.ajustar_senal(senal)
            self._guardar_senal(senal_ajustada)

            m = senal_ajustada.get("mnemo", {})
            sig = senal_ajustada.get("signal", {})

            print(f"  [PIPELINE] MNEMO: Cluster '{m.get('cluster_name', 'N/A')}' | "
                  f"WR {m.get('cluster_win_rate', 0):.0%} | "
                  f"Factor {m.get('adjustment', 1.0):.4f}x | "
                  f"Conf {m.get('original_confidence', 0):.2%} -> {m.get('adjusted_confidence', 0):.2%}")

            return senal_ajustada

        except Exception as e:
            print(f"  [PIPELINE] ERROR en MNEMO: {e}")
            return None

    # ------------------------------------------------------------------
    # AGENTE 3: SENTIMENT
    # ------------------------------------------------------------------

    def _ejecutar_sentiment(self) -> Optional[Dict]:
        """
        Ejecuta SENTIMENT: ajuste por sentimiento de mercado.
        Obtiene Fear & Greed, analiza noticias con VADER, y ajusta la sen~al.
        """
        print(f"\n  >>> [3/3] {AGENTES['sentiment']}")

        try:
            from models.sentiment_agent import SentimentAgent

            if self.dry_run:
                print("  [PIPELINE] DRY-RUN: Simulando SENTIMENT...")
                return {"active": True, "dry_run": True}

            senal = self._cargar_senal()
            if senal is None:
                return None

            sentiment = SentimentAgent()
            senal_ajustada = sentiment.ajustar_senal_con_sentimiento(senal)
            self._guardar_senal(senal_ajustada)

            s = senal_ajustada.get("sentiment", {})
            sig = senal_ajustada.get("signal", {})

            print(f"  [PIPELINE] SENTIMENT: Fear&Greed {s.get('fear_greed', 'N/A')}/100 | "
                  f"Interpretacion: {s.get('interpretacion', 'N/A')} | "
                  f"Factor {s.get('factor_ajuste', 1.0):.4f}x | "
                  f"Conf {s.get('confianza_original', 0):.2%} -> {s.get('confianza_ajustada', 0):.2%}")

            return senal_ajustada

        except Exception as e:
            print(f"  [PIPELINE] ERROR en SENTIMENT: {e}")
            return None

    # ------------------------------------------------------------------
    # PIPELINE COMPLETO
    # ------------------------------------------------------------------

    def ejecutar(self) -> Dict:
        """
        Ejecuta el pipeline completo de agentes en orden secuencial.
        Cada agente recibe la sen~al actualizada por el anterior.

        Returns:
            Dict con resultados de cada agente y sen~al final
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print("\n" + "=" * 70)
        print(f"  PIPELINE DE AGENTES invest_criptoai — {timestamp}")
        print("=" * 70)

        agentes_activos = []
        ORDEN_AGENTES = ["kronos", "oraculo", "prophet", "mnemo", "sentiment"]
        for agente in ORDEN_AGENTES:
            if not getattr(self, f"skip_{agente}", False):
                agentes_activos.append(agente)

        if not agentes_activos:
            print("  [PIPELINE] Todos los agentes desactivados. Sin cambios en la sen~al.")
            return {"ejecutado": False, "agentes_activos": []}

        print(f"  Agentes activos: {len(agentes_activos)}/5 "
              f"({', '.join(AGENTES[a] for a in agentes_activos)})")
        print(f"  Dry-run: {'SI' if self.dry_run else 'NO'}")
        print("-" * 70)

        senal = self._cargar_senal()
        if senal is None:
            print("  [PIPELINE] No hay sen~al para procesar. Abortando.")
            return {"error": "Sin sen~al"}

        # Registrar estado inicial de la sen~al
        sig = senal.get("signal", {})
        # Sin quirk `or 0.5`: confidence=0.0 → base 0 (no 0.5). pre-agentes.
        confianza_base_raw = sig.get("confidence")
        confianza_base = float(confianza_base_raw) if confianza_base_raw is not None else 0.5
        print(f"  Sen~al inicial: {sig.get('direction') or 'SIN SEN~AL'} | "
              f"Confianza: {sig.get('confidence', 0):.2%}")

        # Pipeline secuencial (5 agentes en orden)
        resumen = {"senal_inicial": sig.get("direction"), "agentes": {}}

        METODOS = {
            "kronos": self._ejecutar_kronos,
            "oraculo": self._ejecutar_oraculo,
            "prophet": self._ejecutar_prophet,
            "mnemo": self._ejecutar_mnemo,
            "sentiment": self._ejecutar_sentiment,
        }

        for agente in agentes_activos:
            t0 = time.perf_counter()
            resultado = METODOS[agente]()
            self.timing[agente] = time.perf_counter() - t0
            resumen["agentes"][agente] = {
                "ejecutado": resultado is not None,
                "tiempo_s": round(self.timing.get(agente, 0), 2),
            }

        # Sen~al final — unificar confianzas paralelas de los agentes
        senal_final = self._cargar_senal()
        if senal_final:
            if not self.dry_run:
                senal_final = consolidar_confianza(senal_final, base=confianza_base)
                self._guardar_senal(senal_final)
            sig_final = senal_final.get("signal", {})
            resumen["senal_final"] = sig_final.get("direction")
            resumen["confianza_final"] = sig_final.get("confidence", 0)
            resumen["confianza_unificada"] = senal_final.get("confianza_unificada", {})
            # Tras la consolidación, signal.confidence ES la unificada
            resumen["pipeline_confidence"] = sig_final.get("confidence", 0)

        # Imprimir resumen
        print("\n" + "=" * 70)
        print("  RESUMEN DEL PIPELINE DE AGENTES (5/5)")
        print("=" * 70)
        for agente in ORDEN_AGENTES:
            if agente in resumen["agentes"]:
                ejec = resumen["agentes"][agente]
                estado = 'OK' if ejec.get('ejecutado') else 'SKIP/ERR'
                print(f"    {AGENTES[agente]:45s} {ejec.get('tiempo_s', 0):.1f}s {estado}")
            else:
                print(f"    {AGENTES[agente]:45s}  - SKIP")

        if "senal_final" in resumen:
            print(f"\n  Sen~al final:   {resumen.get('senal_final') or 'SIN SEN~AL'}")
            print(f"  Confianza final: {resumen.get('confianza_final', 0):.2%}")

        tiempo_total = sum(self.timing.values())
        print(f"  Tiempo total:  {tiempo_total:.1f}s")
        print("=" * 70 + "\n")

        resumen["timing"] = {k: round(v, 2) for k, v in self.timing.items()}
        resumen["tiempo_total_s"] = round(tiempo_total, 1)
        resumen["ejecutado"] = True

        return resumen


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Pipeline de Agentes invest_criptoai — KRONOS -> ORACULO -> PROPHET -> MNEMO -> SENTIMENT"
    )
    parser.add_argument(
        "--signal-path", type=str, default=SIGNAL_PATH,
        help="Ruta al archivo de sen~al (default: data/signals/latest_signals.json)"
    )
    parser.add_argument(
        "--skip-kronos", action="store_true",
        help="Saltar agente KRONOS (circuit breaker)"
    )
    parser.add_argument(
        "--skip-oraculo", action="store_true",
        help="Saltar agente ORACULO (consensus engine)"
    )
    parser.add_argument(
        "--skip-prophet", action="store_true",
        help="Saltar agente PROPHET (prediccion de precio)"
    )
    parser.add_argument(
        "--skip-mnemo", action="store_true",
        help="Saltar agente MNEMO (memoria persistente)"
    )
    parser.add_argument(
        "--skip-sentiment", action="store_true",
        help="Saltar agente SENTIMENT (analisis de sentimiento)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Simular ejecucion sin cambios reales"
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Mostrar estado de todos los agentes"
    )

    args = parser.parse_args()

    if args.status:
        # Mostrar estado de todos los agentes
        print("=" * 70)
        print("  ESTADO DE LOS AGENTES invest_criptoai")
        print("=" * 70)

        from models.mnemo_agent import MnemoAgent
        from models.prophet_agent import ProphetAgent
        from models.sentiment_agent import SentimentAgent

        print("\n--- MNEMO ---")
        try:
            MnemoAgent().print_status()
        except Exception as e:
            print(f"  ERROR: {e}")

        print("\n--- PROPHET ---")
        try:
            ProphetAgent().print_status()
        except Exception as e:
            print(f"  ERROR: {e}")

        print("\n--- SENTIMENT ---")
        try:
            SentimentAgent().print_status()
        except Exception as e:
            print(f"  ERROR: {e}")

        print("\n--- KRONOS + ORACULO (invescripto_engine) ---")
        try:
            from portfolios.invescripto_engine import KronosCircuitBreaker, OraculoConsensus
            print("  KronosCircuitBreaker: DISPONIBLE")
            print("  OraculoConsensus:     DISPONIBLE")
        except Exception as e:
            print(f"  ERROR: {e}")

        return

    pipeline = PipelineAgentes(
        signal_path=args.signal_path,
        skip_kronos=args.skip_kronos,
        skip_oraculo=args.skip_oraculo,
        skip_prophet=args.skip_prophet,
        skip_mnemo=args.skip_mnemo,
        skip_sentiment=args.skip_sentiment,
        dry_run=args.dry_run,
    )
    pipeline.ejecutar()


if __name__ == "__main__":
    main()
