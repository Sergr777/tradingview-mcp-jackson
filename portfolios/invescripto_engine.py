#!/usr/bin/env python3
"""
invescripto_engine.py — KRONOS Circuit Breaker + ORACULO Consensus Engine

Capa de inteligencia contextual sobre el ecosistema unificado.
Analiza las métricas de OB System y Markov Acciones para:
  - Detectar regimenes de mercado (KRONOS)
  - Ajustar pesos Risk Parity dinamicamente (ORACULO)

Arquitectura:
    OB System (crypto) ─┐
                        ├── KRONOS (regimen) → ORACULO (pesos) → Risk Parity
    Markov Acciones   ──┘

Uso (integrado en orquestador_unificado.py):
    from invescripto_engine import KronosCircuitBreaker, OraculoConsensus
"""

import numpy as np
from typing import Dict, Tuple, Optional


# ─── Regimenes de Mercado ─────────────────────────────────────────────

REGIMEN_CRISIS = "CRISIS"          # Exposicion reducida
REGIMEN_NORMAL = "NORMAL"          # Exposicion estandar
REGIMEN_ALTA_CONFIANZA = "ALTA"    # Exposicion aumentada


class KronosCircuitBreaker:
    """
    KRONOS: Detector de regimen de mercado y circuito de proteccion.

    Evalua:
    - Estabilidad de senales (WR, Sharpe, consistencia entre ventanas WFA)
    - Nivel de riesgo agregado (drawdown, volatilidad)
    - Confianza combinada del ecosistema

    Salida: regimen + multiplicador de exposicion (0.0 a 1.5)
    """

    # Umbrales de regimen
    VIX_CRISIS = 30          # VIX > 30 = crisis
    VIX_ALERTA = 25          # VIX > 25 = precaucion
    WR_MIN_OK = 55.0         # WR minimo para confianza normal
    WR_ALTA = 65.0           # WR para alta confianza
    SHARPE_MIN_OK = 2.0      # Sharpe minimo para confianza normal
    SHARPE_ALTA = 5.0        # Sharpe para alta confianza
    CONSISTENCIA_MIN = 0.50  # Fraccion minima de ventanas WFA con PF > 1.0

    def __init__(self):
        self.regimen: str = REGIMEN_NORMAL
        self.exposure_multiplier: float = 1.0
        self.confianza: float = 0.5  # 0.0 a 1.0
        self.diagnostico: Dict = {}

    def evaluar(
        self,
        ob_metrics: Dict,
        markov_metrics: Dict,
        dias: int = 180,
        vix_estimado: Optional[float] = None,
    ) -> Dict:
        """
        Evalua el regimen actual basado en las metricas de ambos sistemas.

        Args:
            ob_metrics: Metricas del OB System (WR, Sharpe, WFA windows, etc.)
            markov_metrics: Metricas de Markov Acciones (rentabilidad, WR, trades)
            dias: Periodo de simulacion
            vix_estimado: Nivel de VIX (opcional, si esta disponible)

        Returns:
            Dict con regimen, exposure_multiplier, confianza, diagnostico
        """
        puntuacion = 0.0
        factores = []
        advertencias = []

        # ── 1. VIX (contexto macro) ──
        if vix_estimado is not None:
            if vix_estimado >= self.VIX_CRISIS:
                puntuacion -= 0.4
                advertencias.append(f"VIX={vix_estimado:.1f} > {self.VIX_CRISIS} (CRISIS)")
            elif vix_estimado >= self.VIX_ALERTA:
                puntuacion -= 0.2
                advertencias.append(f"VIX={vix_estimado:.1f} > {self.VIX_ALERTA} (PRECAUCION)")
            else:
                puntuacion += 0.1
                factores.append(f"VIX={vix_estimado:.1f} estable")

        # ── 2. OB System ──
        ob_wr = ob_metrics.get("btc_wr", 0)
        ob_sharpe = ob_metrics.get("btc_sharpe", 0)
        ob_pf = ob_metrics.get("btc_pf", 0)
        ob_trades = ob_metrics.get("total_trades", 0)

        if ob_wr > 0:
            if ob_wr >= self.WR_ALTA:
                puntuacion += 0.25
                factores.append(f"OB WR={ob_wr:.1f}% (ALTA)")
            elif ob_wr >= self.WR_MIN_OK:
                puntuacion += 0.10
                factores.append(f"OB WR={ob_wr:.1f}% (NORMAL)")
            else:
                puntuacion -= 0.10
                advertencias.append(f"OB WR={ob_wr:.1f}% < {self.WR_MIN_OK}")

            if ob_sharpe >= self.SHARPE_ALTA:
                puntuacion += 0.20
                factores.append(f"OB Sharpe={ob_sharpe:.2f} (ALTO)")
            elif ob_sharpe >= self.SHARPE_MIN_OK:
                puntuacion += 0.05
            else:
                puntuacion -= 0.10
                advertencias.append(f"OB Sharpe={ob_sharpe:.2f} < {self.SHARPE_MIN_OK}")

            # Consistencia WFA (fraccion de ventanas con PF > 1.0)
            wins = ["w1", "w2", "w3", "w4"]
            ok = sum(1 for w in wins if ob_metrics.get(f"{w}_pf", 0) > 1.0)
            consistencia = ok / len(wins)
            if consistencia >= 0.75:
                puntuacion += 0.15
                factores.append(f"OB WFA: {ok}/4 ventanas OK")
            elif consistencia >= self.CONSISTENCIA_MIN:
                puntuacion += 0.05
            else:
                puntuacion -= 0.15
                advertencias.append(f"OB WFA: solo {ok}/4 ventanas OK")

        # ── 3. Markov Acciones ──
        mk_wr = markov_metrics.get("wr", 0)
        mk_ret = markov_metrics.get("rentabilidad", 0)
        mk_trades = markov_metrics.get("trades", 0)

        if mk_trades > 0:
            if mk_wr >= self.WR_ALTA:
                puntuacion += 0.20
                factores.append(f"MK WR={mk_wr:.1f}% (ALTA)")
            elif mk_wr >= self.WR_MIN_OK:
                puntuacion += 0.10
                factores.append(f"MK WR={mk_wr:.1f}% (NORMAL)")
            else:
                puntuacion -= 0.10
                advertencias.append(f"MK WR={mk_wr:.1f}% < {self.WR_MIN_OK}")

            if mk_ret > 0:
                puntuacion += 0.10
                factores.append(f"MK Ret={mk_ret:+.2f}% positivo")

            # Suficientes trades para significancia estadistica
            min_trades_ok = max(30, dias // 6)
            if mk_trades >= min_trades_ok:
                puntuacion += 0.05
            else:
                puntuacion -= 0.05
                advertencias.append(f"MK trades={mk_trades} < {min_trades_ok}")

        # ── 4. Determinar regimen ──
        puntuacion = max(-1.0, min(1.5, puntuacion))
        self.confianza = (puntuacion + 1.0) / 2.5  # normalizar a [0, 1]

        if puntuacion <= -0.3:
            self.regimen = REGIMEN_CRISIS
            self.exposure_multiplier = 0.50  # 50% de exposicion
        elif puntuacion >= 0.6:
            self.regimen = REGIMEN_ALTA_CONFIANZA
            self.exposure_multiplier = 1.20  # 120% de exposicion
        else:
            self.regimen = REGIMEN_NORMAL
            self.exposure_multiplier = 1.0   # 100% de exposicion

        self.diagnostico = {
            "regimen": self.regimen,
            "exposure_multiplier": self.exposure_multiplier,
            "confianza": round(self.confianza, 3),
            "puntuacion_bruta": round(puntuacion, 3),
            "factores_positivos": factores,
            "advertencias": advertencias,
        }

        return self.diagnostico


# ─── ORACULO: Motor de Consenso y Ajuste de Pesos ─────────────────────


class OraculoConsensus:
    """
    ORACULO: Motor de consenso que ajusta los pesos del Risk Parity
    segun el rendimiento relativo de cada sistema y el regimen de KRONOS.

    Logica de ponderacion:
    - Peso base: inverso a volatilidad (Risk Parity clasico)
    - Ajuste por rendimiento: WR relativo entre sistemas
    - Ajuste por consistencia: Q de ventanas WFA aprobadas
    - Escalado global: multiplicador de exposicion de KRONOS
    """

    def __init__(self):
        self.adjusted_weights: Dict = {}
        self.senal_consenso: Dict = {}

    def calcular_consenso(
        self,
        weights_rp: Dict,
        ob_metrics: Dict,
        markov_metrics: Dict,
        kronos_diagnostico: Dict,
    ) -> Dict:
        """
        Calcula los pesos ajustados y la senal de consenso.

        Args:
            weights_rp: Pesos base de Risk Parity (OB_SYSTEM, MARKOV_ACCIONES)
            ob_metrics: Metricas del OB System
            markov_metrics: Metricas de Markov Acciones
            kronos_diagnostico: Diagnostico de KRONOS

        Returns:
            Dict con adjusted_weights, senal_consenso, factores
        """
        w_ob = weights_rp.get("OB_SYSTEM", 0.5)
        w_mk = weights_rp.get("MARKOV_ACCIONES", 0.5)

        # ── 1. Score de rendimiento relativo ──
        ob_wr = ob_metrics.get("btc_wr", 0)
        mk_wr = markov_metrics.get("wr", 0)
        ob_sharpe = ob_metrics.get("btc_sharpe", 0)
        ob_pf = ob_metrics.get("btc_pf", 0)

        # Score OB: combinacion de WR, Sharpe y PF
        score_ob = 0.0
        if ob_wr > 0:
            score_ob += ob_wr / 100.0 * 0.4  # WR ponderado 40%
            score_ob += min(ob_sharpe / 10.0, 1.0) * 0.3  # Sharpe 30%
            score_ob += min(ob_pf / 4.0, 1.0) * 0.3  # PF 30%

        # Score Markov: WR y retorno
        score_mk = 0.0
        if mk_wr > 0:
            score_mk += mk_wr / 100.0 * 0.6  # WR 60%
            mk_ret = markov_metrics.get("rentabilidad", 0) / 100.0
            score_mk += min(max(mk_ret, 0) / 0.5, 1.0) * 0.4  # Retorno 40%

        # ── 2. Ajustar pesos por rendimiento relativo ──
        score_total = max(score_ob + score_mk, 0.01)
        peso_ob_relativo = score_ob / score_total
        peso_mk_relativo = score_mk / score_total

        # Mezclar con pesos RP originales (50% RP base, 50% rendimiento)
        alpha = 0.50  # factor de mezcla
        w_ob_adj = (1 - alpha) * w_ob + alpha * peso_ob_relativo
        w_mk_adj = (1 - alpha) * w_mk + alpha * peso_mk_relativo

        # ── 3. Aplicar multiplicador de KRONOS ──
        exposure = kronos_diagnostico.get("exposure_multiplier", 1.0)

        # Normalizar pesos
        total = w_ob_adj + w_mk_adj
        if total > 0:
            w_ob_adj /= total
            w_mk_adj /= total

        # Aplicar exposure global
        self.adjusted_weights = {
            "OB_SYSTEM": round(w_ob_adj, 4),
            "MARKOV_ACCIONES": round(w_mk_adj, 4),
            "exposure_multiplier": round(exposure, 2),
        }

        # ── 4. Senal de consenso ──
        confianza = kronos_diagnostico.get("confianza", 0.5)
        score_combinado = (score_ob * w_ob_adj + score_mk * w_mk_adj) * exposure

        self.senal_consenso = {
            "confianza_oraculo": round(confianza, 3),
            "score_ob": round(score_ob, 3),
            "score_mk": round(score_mk, 3),
            "score_combinado": round(score_combinado, 3),
            "peso_ob_relativo": round(peso_ob_relativo, 3),
            "peso_mk_relativo": round(peso_mk_relativo, 3),
            "regimen": kronos_diagnostico.get("regimen", REGIMEN_NORMAL),
            "exposure_activa": exposure != 1.0,
        }

        return {
            "adjusted_weights": self.adjusted_weights,
            "senal_consenso": self.senal_consenso,
            "kronos": kronos_diagnostico,
            "scores_individuales": {
                "ob_system": round(score_ob, 4),
                "markov_acciones": round(score_mk, 4),
            },
        }


# ─── Funcion de integracion rapida ────────────────────────────────────


def evaluar_ecosistema(
    ob_metrics: Dict,
    markov_metrics: Dict,
    weights_rp: Dict,
    dias: int = 180,
    vix_estimado: Optional[float] = None,
) -> Dict:
    """
    Funcion de integracion rapida: ejecuta KRONOS + ORACULO en un solo paso.

    Args:
        ob_metrics: Metricas del OB System
        markov_metrics: Metricas de Markov Acciones
        weights_rp: Pesos base de Risk Parity
        dias: Periodo de simulacion
        vix_estimado: Nivel de VIX (opcional)

    Returns:
        Dict con regimen, pesos ajustados, senal de consenso
    """
    kronos = KronosCircuitBreaker()
    oraculo = OraculoConsensus()

    diagnostico = kronos.evaluar(ob_metrics, markov_metrics, dias, vix_estimado)
    resultado = oraculo.calcular_consenso(weights_rp, ob_metrics, markov_metrics, diagnostico)

    return resultado


if __name__ == "__main__":
    # Prueba rapida con datos simulados
    print("=" * 60)
    print("  INVESCRIPTO ENGINE - Prueba de Diagnostico")
    print("=" * 60)

    ob_test = {
        "btc_wr": 72.34, "btc_sharpe": 8.25, "btc_pf": 2.96,
        "btc_cagr": 57.49, "btc_maxdd": 12.28, "total_trades": 1019,
        "w1_pf": 2.87, "w2_pf": 3.50, "w3_pf": 2.80, "w4_pf": 3.71,
    }
    mk_test = {"wr": 64.41, "rentabilidad": 33.93, "trades": 118}
    weights_test = {"OB_SYSTEM": 0.3478, "MARKOV_ACCIONES": 0.6522}

    # Caso 1: Normal (VIX bajo)
    print("\n--- Caso 1: Mercado Normal (VIX=15) ---")
    r1 = evaluar_ecosistema(ob_test, mk_test, weights_test, vix_estimado=15.0)
    print(f"  Regimen: {r1['kronos']['regimen']}")
    print(f"  Exposure: {r1['kronos']['exposure_multiplier']:.2f}")
    print(f"  Confianza: {r1['kronos']['confianza']:.3f}")
    print(f"  Pesos: OB={r1['adjusted_weights']['OB_SYSTEM']*100:.1f}% | MK={r1['adjusted_weights']['MARKOV_ACCIONES']*100:.1f}%")

    # Caso 2: Crisis (VIX alto)
    print("\n--- Caso 2: Crisis (VIX=35) ---")
    r2 = evaluar_ecosistema(ob_test, mk_test, weights_test, vix_estimado=35.0)
    print(f"  Regimen: {r2['kronos']['regimen']}")
    print(f"  Exposure: {r2['kronos']['exposure_multiplier']:.2f}")
    print(f"  Confianza: {r2['kronos']['confianza']:.3f}")
    print(f"  Pesos: OB={r2['adjusted_weights']['OB_SYSTEM']*100:.1f}% | MK={r2['adjusted_weights']['MARKOV_ACCIONES']*100:.1f}%")
    print(f"  Advertencias: {r2['kronos']['advertencias']}")

    # Caso 3: WR bajo en ambos sistemas
    print("\n--- Caso 3: Rendimiento bajo (WR<50%) ---")
    ob_bajo = dict(ob_test)
    ob_bajo["btc_wr"] = 48.0
    ob_bajo["btc_sharpe"] = 1.2
    mk_bajo = dict(mk_test)
    mk_bajo["wr"] = 45.0
    r3 = evaluar_ecosistema(ob_bajo, mk_bajo, weights_test, vix_estimado=28.0)
    print(f"  Regimen: {r3['kronos']['regimen']}")
    print(f"  Exposure: {r3['kronos']['exposure_multiplier']:.2f}")
    print(f"  Confianza: {r3['kronos']['confianza']:.3f}")
    print(f"  Score combinado: {r3['senal_consenso']['score_combinado']:.3f}")
