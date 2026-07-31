"""
run_ciclo_btc.py — ORQUESTADOR DEL CICLO BTC 15m
=================================================
Integra las tres capas del ecosistema:

  [ANALISIS]   -> [AGENTES]   -> [OPERACIONES]
  OB System      PROPHET         Risk Parity
                 MNEMO           Kelly
                 SENTIMENT       Paper/Real Trades

  Signals JSON (IPC entre capas)

Arquitectura:
    +---------------------------------------------------------+
    |  run_ciclo_btc.py (ORQUESTADOR)                        |
    +---------------------------------------------------------+
    |  1. Obtener datos (CSV o TV MCP)                       |
    |  2. Ejecutar analisis (OB System)                      |
    |  3. Pipeline de Agentes (PROPHET -> MNEMO -> SENTIMENT) |
    |  4. Validar y ejecutar trade (Risk Parity + Kelly)     |
    |  5. Reportar estado                                    |
    +---------------------------------------------------------+

Uso:
    python run_ciclo_btc.py                          # Ciclo unico con CSV
    python run_ciclo_btc.py --no-agentes             # Sin pipeline de agentes
    python run_ciclo_btc.py --no-prophet             # Saltar solo PROPHET
    python run_ciclo_btc.py --no-mnemo               # Saltar solo MNEMO
    python run_ciclo_btc.py --no-sentiment           # Saltar solo SENTIMENT
    python run_ciclo_btc.py --source tv              # Datos desde TradingView
    python run_ciclo_btc.py --capital 50000          # Capital personalizado
    python run_ciclo_btc.py --daemon                 # Modo continuo (15min)
    python run_ciclo_btc.py --dry-run                # Simular sin trades
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from typing import Optional

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
SIGNALS_DIR = os.path.join(PROJECT_ROOT, "data", "signals")
TRADES_DIR = os.path.join(PROJECT_ROOT, "data", "trades")

REPORTE_LOG = os.path.join(PROJECT_ROOT, "data", "ciclo_log.json")


# =============================================================================
# ORQUESTADOR
# =============================================================================

class OrquestadorCicloBTC:
    """
    Orquestador del ciclo completo analisis -> agentes -> operaciones para BTC 15m.

    Orquesta la ejecucion secuencial de:
      1. models/generador_senales.py (analisis -> sen~ales)
      2. models/pipeline_agentes.py (PROPHET -> MNEMO -> SENTIMENT)
      3. portfolios/ejecutor_senales.py (sen~ales -> trades)

    Incluye timing breakdown por fase y limpieza de sen~ales obsoletas.
    """

    def __init__(
        self,
        capital: float = 25000.0,
        source: str = "csv",
        csv_path: str = "data/BTCUSDT_15m_4y.csv",
        mode: str = "paper",
        dry_run: bool = False,
        skip_train: bool = False,
        agentes: bool = True,          # Activar/desactivar pipeline de agentes
        no_prophet: bool = False,      # Saltar PROPHET
        no_mnemo: bool = False,        # Saltar MNEMO
        no_sentiment: bool = False,    # Saltar SENTIMENT
    ):
        self.capital = capital
        self.source = source
        self.csv_path = csv_path
        self.mode = mode
        self.dry_run = dry_run
        self.skip_train = skip_train
        self.agentes = agentes
        self.no_prophet = no_prophet or not agentes   # Si agentes=False, saltar todos
        self.no_mnemo = no_mnemo or not agentes
        self.no_sentiment = no_sentiment or not agentes
        self.ciclo_actual = 0

        os.makedirs(SIGNALS_DIR, exist_ok=True)
        os.makedirs(TRADES_DIR, exist_ok=True)
        os.makedirs(os.path.dirname(REPORTE_LOG or "."), exist_ok=True)

        # Limpiar señales obsoletas de ciclos anteriores
        stale_signal = os.path.join(SIGNALS_DIR, "latest_signals.json")
        if os.path.exists(stale_signal):
            try:
                os.remove(stale_signal)
                print(f"  [CLEANUP] Señal obsoleta eliminada: {stale_signal}")
            except OSError as e:
                print(f"  [CLEANUP] No se pudo limpiar señal anterior: {e}")

    # ------------------------------------------------------------------
    # EJECUCIÓN DEL CICLO
    # ------------------------------------------------------------------

    def _ejecutar_analisis(self) -> int:
        """
        Ejecuta el generador de señales como script directo.
        Returns: 0 = señal generada, 1 = sin señal, 2 = error
        """
        print("\n" + "█" * 70)
        print("  █ FASE 1: ANÁLISIS — Generador de Señales OB System")
        print("█" * 70)

        script_path = os.path.join(PROJECT_ROOT, "models", "generador_senales.py")
        cmd = [
            sys.executable, script_path,
            "--source", self.source,
        ]
        if self.source == "csv":
            cmd += ["--path", self.csv_path]
        if self.skip_train:
            cmd.append("--skip-train")

        if self.dry_run:
            print(f"\n  [DRY-RUN] Comando: {' '.join(cmd)}\n")
            self._generar_senal_prueba()
            return 0

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=600,  # 10 min timeout (entrenamiento puede tomar)
                cwd=PROJECT_ROOT,
            )
            # Mostrar stdout
            stdout = result.stdout or ""
            for line in stdout.split("\n"):
                if line.strip():
                    print(f"  {line}")

            stderr = result.stderr or ""
            if stderr.strip():
                for line in stderr.split("\n"):
                    if line.strip():
                        print(f"  [STDERR] {line}")

            return result.returncode

        except subprocess.TimeoutExpired:
            print("  [ERROR] Tiempo de espera agotado en análisis")
            return 2
        except Exception as e:
            print(f"  [ERROR] Excepción en análisis: {e}")
            return 2

    def _generar_senal_prueba(self):
        """Genera una señal de prueba válida para dry-run full pipeline."""
        print("  [DRY-RUN] Generando señal de prueba...")
        from datetime import timezone
        now = datetime.now(timezone.utc)
        senal_prueba = {
            "generated_at": now.isoformat(),
            "source": "ob_system_btc_15m_dry_run",
            "config": "13_features_optimized",
            "model": {
                "trained_at": "dry_run",
                "n_train_bars": 0,
            },
            "market_state": {
                "symbol": "BTCUSDT",
                "price": 65000.00,
                "atr_pct": 0.0125,
                "atr_actual": 812.50,
                "timestamp": now.isoformat(),
                "bar": {"open": 64900, "high": 65200, "low": 64800, "close": 65000, "volume": 1500}
            },
            "analysis": {
                "ob_probability": 0.50,
                "meta_confidence": 0.50,
                "primary_probability": 0.65,
            },
            "signal": {
                "direction": "LONG",
                "confidence": 0.50,
                "type": "META_ENTRY",
                "regime": "NORMAL",
            },
            "risk_parameters": {
                "sl_atr_mult": 1.0,
                "tp_atr_mult": 2.0,
                "sl_price": 64187.50,
                "tp_price": 66625.00,
                "kelly_fraction": 0.05,
                "position_size_pct": 0.05,
            }
        }
        archivo = os.path.join(SIGNALS_DIR, "latest_signals.json")
        with open(archivo, "w", encoding="utf-8") as f:
            json.dump(senal_prueba, f, indent=2, ensure_ascii=False, default=str)
        print(f"  [DRY-RUN] Señal de prueba generada: LONG @ $65,000 | Conf: 0.50")
        print(f"  [DRY-RUN] Guardada: {archivo}")
        return 0

    def _ejecutar_pipeline_agentes(self) -> int:
        """
        Ejecuta el pipeline de agentes (PROPHET -> MNEMO -> SENTIMENT)
        sobre la sen~al generada por el analisis.
        Returns: 0 = OK, 1 = todos skip, 2 = error
        """
        if not self.agentes:
            print("  [AGENTES] Pipeline desactivado (--no-agentes)")
            return 0

        print("\n" + "*" * 70)
        print("  * FASE 1b: PIPELINE DE AGENTES invest_criptoai")
        print("  * PROPHET -> MNEMO -> SENTIMENT")
        print("*" * 70)

        skip_flags = []
        if self.no_prophet:
            skip_flags.append("--skip-prophet")
        if self.no_mnemo:
            skip_flags.append("--skip-mnemo")
        if self.no_sentiment:
            skip_flags.append("--skip-sentiment")

        script_path = os.path.join(PROJECT_ROOT, "models", "pipeline_agentes.py")
        cmd = [sys.executable, script_path] + skip_flags

        if self.dry_run:
            cmd.append("--dry-run")
            print(f"  [DRY-RUN] Comando: {' '.join(cmd)}")
            from models.pipeline_agentes import PipelineAgentes
            pipeline = PipelineAgentes(
                skip_prophet=self.no_prophet,
                skip_mnemo=self.no_mnemo,
                skip_sentiment=self.no_sentiment,
                dry_run=True,
            )
            pipeline.ejecutar()
            return 0

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=120,  # 2 min timeout (APIs externas)
                cwd=PROJECT_ROOT,
            )
            stdout = result.stdout or ""
            for line in stdout.split("\n"):
                if line.strip():
                    print(f"  {line}")

            stderr = result.stderr or ""
            if stderr.strip():
                for line in stderr.split("\n"):
                    if line.strip():
                        print(f"  [STDERR] {line}")

            return result.returncode

        except subprocess.TimeoutExpired:
            print("  [ERROR] Tiempo de espera agotado en pipeline de agentes")
            return 2
        except Exception as e:
            print(f"  [ERROR] Excepcion en pipeline de agentes: {e}")
            return 2

    def _ejecutar_operaciones(self) -> int:
        """Ejecuta el ejecutor de señales como script directo."""
        print("\n" + "█" * 70)
        print("  █ FASE 2: OPERACIONES — Ejecutor de Señales")
        print("█" * 70)

        script_path = os.path.join(PROJECT_ROOT, "portfolios", "ejecutor_senales.py")
        cmd = [
            sys.executable, script_path,
            "--capital", str(self.capital),
            "--mode", self.mode,
        ]

        if self.dry_run:
            cmd.append("--dry-run")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=120,  # 2 min timeout
                cwd=PROJECT_ROOT,
            )
            stdout = result.stdout or ""
            for line in stdout.split("\n"):
                if line.strip():
                    print(f"  {line}")

            stderr = result.stderr or ""
            if stderr.strip():
                for line in stderr.split("\n"):
                    if line.strip():
                        print(f"  [STDERR] {line}")

            return result.returncode

        except subprocess.TimeoutExpired:
            print("  [ERROR] Tiempo de espera agotado en operaciones")
            return 1
        except Exception as e:
            print(f"  [ERROR] Excepción en operaciones: {e}")
            return 1

    def _reportar_ciclo(self, codigo_analisis: int, codigo_pipeline: int, codigo_operaciones: int, duracion: float):
        """Genera y guarda reporte del ciclo."""
        reporte = {
            "timestamp": datetime.now().isoformat(),
            "duracion_seg": round(duracion, 1),
            "fases": {
                "analisis": {
                    "exit_code": codigo_analisis,
                    "estado": "OK" if codigo_analisis == 0 else "SIN_SEÑAL" if codigo_analisis == 1 else "ERROR",
                },
                "pipeline_agentes": {
                    "exit_code": codigo_pipeline,
                    "estado": "OK" if codigo_pipeline in [0, -1] else "ERROR",
                    "agentes": "PROPHET+MNEMO+SENTIMENT" if self.agentes else "DESACTIVADOS",
                },
                "operaciones": {
                    "exit_code": codigo_operaciones,
                    "estado": "OK" if codigo_operaciones == 0 else "ERROR",
                },
            },
            "config": {
                "capital": self.capital,
                "source": self.source,
                "mode": self.mode,
                "dry_run": self.dry_run,
                "agentes": self.agentes,
            },
        }

        # Leer señal generada si existe
        archivo_senal = os.path.join(SIGNALS_DIR, "latest_signals.json")
        if os.path.exists(archivo_senal):
            try:
                with open(archivo_senal) as f:
                    senal = json.load(f)
                    reporte["senal"] = {
                        "direction": senal.get("signal", {}).get("direction"),
                        "confidence": senal.get("signal", {}).get("confidence"),
                        "price": senal.get("market_state", {}).get("price"),
                    }
            except (json.JSONDecodeError, FileNotFoundError):
                pass

        # Leer reporte de operaciones si existe
        archivo_reporte = os.path.join(TRADES_DIR, "ultimo_reporte.json")
        if os.path.exists(archivo_reporte):
            try:
                with open(archivo_reporte) as f:
                    reporte["operaciones"] = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                pass

        # Añadir timing breakdown al reporte (con fallback)
        if not hasattr(self, '_timing_fases'):
            self._timing_fases = {}
        reporte['timing_breakdown'] = self._timing_fases

        # Guardar
        with open(REPORTE_LOG, "w", encoding="utf-8") as f:
            json.dump(reporte, f, indent=2, ensure_ascii=False, default=str)

        # Resumen con timing
        print("\n" + "█" * 70)
        print("  █ RESUMEN DEL CICLO BTC 15m")
        print("█" * 70)
        fase_a = reporte["fases"]["analisis"]
        fase_o = reporte["fases"]["operaciones"]
        print(f"  Análisis:     {fase_a['estado']} (exit: {fase_a['exit_code']})")
        print(f"  Operaciones:  {fase_o['estado']} (exit: {fase_o['exit_code']})")
        if "senal" in reporte and reporte["senal"].get("direction"):
            s = reporte["senal"]
            print(f"  Señal:        {s['direction']} @ ${s['price']:,.2f} | Conf: {s['confidence']:.2%}")
        else:
            print(f"  Señal:        SIN SEÑAL")
        print(f"  Duración:     {reporte['duracion_seg']:.1f}s")
        timing = self._timing_fases
        if timing:
            print(f"  Timing:       Analisis {timing.get('analisis',0):.1f}s | "
                  f"Agentes {timing.get('pipeline_agentes',0):.1f}s | "
                  f"Operaciones {timing.get('operaciones',0):.1f}s")
        print(f"  Modo:         {self.mode}")
        print(f"  Reporte:      {REPORTE_LOG}")
        print("█" * 70 + "\n")

        return reporte

    def ejecutar_ciclo(self) -> int:
        """Ejecuta el ciclo completo análisis → operaciones."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print("=" * 70)
        print(f"  🌐 CICLO BTC 15m — {timestamp}")
        print(f"  Capital: ${self.capital:,.2f} | Fuente: {self.source}")
        print(f"  Modo: {self.mode.upper()}{' (DRY-RUN)' if self.dry_run else ''}")
        print("=" * 70)

        inicio = time.time()
        t_fases = {}

        # Fase 1: Análisis
        t0 = time.perf_counter()
        codigo_analisis = self._ejecutar_analisis()
        t_fases['analisis'] = time.perf_counter() - t0

        # Fase 1b: Pipeline de Agentes (entre análisis y operaciones)
        codigo_pipeline = -1
        if codigo_analisis != 2:  # Solo si análisis no falló
            t0 = time.perf_counter()
            codigo_pipeline = self._ejecutar_pipeline_agentes()
            t_fases['pipeline_agentes'] = time.perf_counter() - t0
        else:
            print("  [PIPELINE] Análisis falló. Saltando pipeline de agentes.")

        # Fase 2: Operaciones (solo si análisis fue exitoso)
        codigo_operaciones = -1
        if codigo_analisis != 2:  # 2 = error
            t0 = time.perf_counter()
            codigo_operaciones = self._ejecutar_operaciones()
            t_fases['operaciones'] = time.perf_counter() - t0
        else:
            print("  ⚠ Análisis falló. Saltando fase operativa.")

        duracion = time.time() - inicio
        t_fases['total'] = duracion
        self._timing_fases = t_fases  # Guardar para el reporte

        self._reportar_ciclo(codigo_analisis, codigo_pipeline, codigo_operaciones, duracion)

        return 0 if (codigo_analisis != 2 and codigo_operaciones != 1) else 1


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Orquestador del Ciclo BTC 15m — Análisis → Operaciones"
    )
    parser.add_argument(
        "--capital", type=float, default=25000.0,
        help="Capital para la estrategia BTC (default: $25,000)"
    )
    parser.add_argument(
        "--source", choices=["csv", "tv"], default="csv",
        help="Fuente de datos: csv (local) o tv (TradingView MCP)"
    )
    parser.add_argument(
        "--mode", choices=["paper", "real"], default="paper",
        help="Modo de ejecución de trades"
    )
    parser.add_argument(
        "--skip-train", action="store_true",
        help="Saltar entrenamiento del modelo OB (usar modelo existente)"
    )
    parser.add_argument(
        "--no-agentes", action="store_true",
        help="Desactivar pipeline de agentes (PROPHET, MNEMO, SENTIMENT)"
    )
    parser.add_argument(
        "--no-prophet", action="store_true",
        help="Saltar solo el agente PROPHET"
    )
    parser.add_argument(
        "--no-mnemo", action="store_true",
        help="Saltar solo el agente MNEMO"
    )
    parser.add_argument(
        "--no-sentiment", action="store_true",
        help="Saltar solo el agente SENTIMENT"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Simular sin ejecutar trades"
    )
    parser.add_argument(
        "--daemon", action="store_true",
        help="Modo continuo (loop infinito)"
    )
    parser.add_argument(
        "--interval", type=int, default=15,
        help="Intervalo en minutos para modo daemon (default: 15)"
    )

    args = parser.parse_args()

    orquestador = OrquestadorCicloBTC(
        capital=args.capital,
        source=args.source,
        mode=args.mode,
        dry_run=args.dry_run,
        skip_train=args.skip_train,
        agentes=not args.no_agentes,
        no_prophet=args.no_prophet,
        no_mnemo=args.no_mnemo,
        no_sentiment=args.no_sentiment,
    )

    if args.daemon:
        # Modo continuo
        iteracion = 0
        while True:
            iteracion += 1
            print(f"\n{'#' * 70}")
            print(f"  # ITERACIÓN #{iteracion} — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"{'#' * 70}")

            try:
                orquestador.ejecutar_ciclo()
            except KeyboardInterrupt:
                print(f"\n  ⏹ Daemon detenido por usuario después de {iteracion} ciclos.")
                break
            except Exception as e:
                print(f"\n  ❌ Error en ciclo #{iteracion}: {e}")

            print(f"\n  ⏳ Próximo ciclo en {args.interval} minutos...")
            try:
                time.sleep(args.interval * 60)
            except KeyboardInterrupt:
                print(f"\n  ⏹ Daemon detenido por usuario.")
                break
    else:
        # Ciclo único
        return orquestador.ejecutar_ciclo()


if __name__ == "__main__":
    sys.exit(main())
