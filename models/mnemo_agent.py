"""
mnemo_agent.py — MNEMO: Memoria Persistente Multi-Nivel
=========================================================
Agente de memoria que aprende de patrones repetitivos de trades.

Funciones:
  1. Registrar cada trade con sus condiciones de mercado (features + outcome)
  2. Agrupar trades por similitud de contexto (pattern clustering)
  3. Calcular win rate por patrón
  4. Ajustar confianza de nuevas señales según memoria histórica
  5. Persistencia en SQLite para sobrevivir reinicios

Integración:
  - Se ejecuta DESPUÉS del generador de señales, ANTES del ejecutor
  - Lee signals.json, consulta memoria, escribe signals.json con ajuste MNEMO
  - También se actualiza cuando un trade se cierra (aprende del resultado)

Uso:
    python -m models.mnemo_agent record     # Registrar trade cerrado
    python -m models.mnemo_agent adjust     # Ajustar señal actual con memoria
    python -m models.mnemo_agent status     # Mostrar estado de la memoria

Arquitectura:
    Generador → signals.json → MNEMO (adjust) → signals.json ajustado → Ejecutor
                                                                              ↓
    Ejecutor → trade cerrado → MNEMO (record) → SQLite ← aprendizaje
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEMORY_DIR = os.path.join(PROJECT_ROOT, "data", "memory")
DB_PATH = os.path.join(MEMORY_DIR, "mnemo_memory.db")
SIGNALS_DIR = os.path.join(PROJECT_ROOT, "data", "signals")
TRADES_DIR = os.path.join(PROJECT_ROOT, "data", "trades")

# Umbrales de similitud para clustering de patrones
SIMILARIDAD_MINIMA = 0.70      # 70% de similitud mínima (ajustado para evitar clusters genéricos)
MIN_TRADES_POR_CLUSTER = 5     # Mínimo de trades para que un cluster sea estadístico
MAX_CLUSTERS = 30              # Máximo número de clusters activos


# =============================================================================
# ESQUEMA DE BASE DE DATOS
# =============================================================================

SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    asset TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    exit_reason TEXT,
    confidence REAL NOT NULL,
    confidence_original REAL,
    pnl_pct REAL,
    pnl_usd REAL,
    capital_empleado REAL,
    hold_bars INTEGER,
    regime TEXT,
    atr_pct REAL,
    atr_actual REAL,
    sl_price REAL,
    tp_price REAL,
    features_json TEXT,
    cluster_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    asset TEXT NOT NULL,
    direction TEXT NOT NULL,
    min_confidence REAL,
    max_confidence REAL,
    avg_atr_pct REAL,
    regime_preference TEXT,
    total_trades INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    total_pnl REAL DEFAULT 0.0,
    win_rate REAL DEFAULT 0.0,
    avg_pnl REAL DEFAULT 0.0,
    sharpe REAL DEFAULT 0.0,
    last_updated TEXT,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS memory_stats (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_trades_asset ON trades(asset);
CREATE INDEX IF NOT EXISTS idx_trades_direction ON trades(direction);
CREATE INDEX IF NOT EXISTS idx_trades_cluster ON trades(cluster_id);
CREATE INDEX IF NOT EXISTS idx_clusters_asset ON clusters(asset);
"""


# =============================================================================
# MNEMO AGENT
# =============================================================================

class MnemoAgent:
    """
    MNEMO: Agente de memoria persistente para el ecosistema invest_criptoai.

    Aprende de trades pasados para ajustar señales futuras mediante:
    - Registro detallado de cada trade con contexto de mercado
    - Clustering de patrones por similitud de condiciones
    - Ajuste de confianza basado en win rate histórico del cluster
    - Decaimiento temporal para dar más peso a trades recientes
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(MEMORY_DIR, exist_ok=True)
        self._init_db()
        self._cargar_estado()

    # ------------------------------------------------------------------
    # INICIALIZACIÓN
    # ------------------------------------------------------------------

    def _init_db(self):
        """Inicializa la base de datos SQLite."""
        conn = sqlite3.connect(self.db_path)
        conn.executescript(SCHEMA)
        conn.commit()
        conn.close()

    def _cargar_estado(self):
        """Carga estadísticas de memoria desde SQLite."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT value FROM memory_stats WHERE key='total_trades'")
        row = cursor.fetchone()
        self.total_trades = int(row[0]) if row else 0

        cursor.execute("SELECT value FROM memory_stats WHERE key='last_train'")
        row = cursor.fetchone()
        self.last_train = row[0] if row else "never"

        conn.close()

    def _guardar_estado(self, key: str, value: str, conn: sqlite3.Connection = None):
        """Guarda una estadística en la base de datos.
        Args:
            key: Clave de la estadística
            value: Valor
            conn: Conexión opcional (reutiliza para evitar locks)
        """
        if conn:
            conn.execute(
                "INSERT OR REPLACE INTO memory_stats (key, value, updated_at) VALUES (?, ?, datetime('now'))",
                (key, value)
            )
        else:
            conn2 = sqlite3.connect(self.db_path)
            conn2.execute(
                "INSERT OR REPLACE INTO memory_stats (key, value, updated_at) VALUES (?, ?, datetime('now'))",
                (key, value)
            )
            conn2.commit()
            conn2.close()

    # ------------------------------------------------------------------
    # REGISTRO DE TRADES
    # ------------------------------------------------------------------

    def registrar_trade(self, trade: Dict) -> int:
        """
        Registra un trade cerrado en la memoria persistente.

        Args:
            trade: Dict con datos completos del trade (del trade_log.json)

        Returns:
            int: ID del trade registrado
        """
        features = trade.get("sizing_factors", {})
        if "features_json" not in trade:
            trade["features_json"] = json.dumps(features)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO trades (
                timestamp, asset, direction, entry_price, exit_price,
                exit_reason, confidence, confidence_original, pnl_pct, pnl_usd,
                capital_empleado, hold_bars, regime, atr_pct, atr_actual,
                sl_price, tp_price, features_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            trade.get("timestamp", datetime.now(timezone.utc).isoformat()),
            trade.get("asset", "UNKNOWN"),
            trade.get("direction", ""),
            trade.get("entry_price", 0.0),
            trade.get("exit_price", 0.0),
            trade.get("exit_reason", ""),
            trade.get("confidence", 0.0),
            trade.get("confidence_original", trade.get("confidence", 0.0)),
            trade.get("pnl_pct", 0.0),
            trade.get("pnl_usd", 0.0),
            trade.get("capital_empleado", 0.0),
            trade.get("hold_bars", 0),
            trade.get("regime", "NORMAL"),
            trade.get("atr_pct", 0.01),
            trade.get("atr_actual", 0.0),
            trade.get("sl_price", 0.0),
            trade.get("tp_price", 0.0),
            trade.get("features_json", "{}"),
        ))
        trade_id = cursor.lastrowid

        # Actualizar contador (usando misma conexión para evitar lock)
        self.total_trades += 1
        self._guardar_estado("total_trades", str(self.total_trades), conn)

        conn.commit()
        conn.close()

        print(f"  [MNEMO] Trade #{trade_id} registrado: {trade.get('direction')} "
              f"{trade.get('asset')} | PnL: {trade.get('pnl_pct', 0):+.2f}%")

        # Re-clustering cada 10 trades
        if self.total_trades % 10 == 0:
            self.reclusterizar()

        return trade_id

    def registrar_desde_trade_log(self, trade_log_path: str = None) -> int:
        """
        Lee el trade_log.json y registra trades cerrados en memoria.

        Args:
            trade_log_path: Ruta al trade_log.json (default: data/trades/trade_log.json)

        Returns:
            int: Número de trades registrados
        """
        if trade_log_path is None:
            trade_log_path = os.path.join(TRADES_DIR, "trade_log.json")

        if not os.path.exists(trade_log_path):
            print(f"  [MNEMO] No se encuentra trade log: {trade_log_path}")
            return 0

        with open(trade_log_path, "r", encoding="utf-8") as f:
            trades = json.load(f)

        registrados = 0
        for trade in trades:
            if trade.get("status") == "CLOSED" and "exit" in trade:
                exit_data = trade["exit"]
                trade_record = {
                    **trade,
                    "exit_price": exit_data.get("exit_price", 0),
                    "exit_reason": exit_data.get("exit_reason", ""),
                    "pnl_pct": exit_data.get("pnl_pct", 0),
                    "pnl_usd": exit_data.get("pnl_usd", 0),
                }
                self.registrar_trade(trade_record)
                registrados += 1

        print(f"  [MNEMO] {registrados} trades registrados desde trade_log.json")
        return registrados

    # ------------------------------------------------------------------
    # CLUSTERING DE PATRONES
    # ------------------------------------------------------------------

    def _calcular_similitud(self, trade_a: Dict, trade_b: Dict) -> float:
        """
        Calcula la similitud entre dos trades basado en condiciones de mercado.
        Retorna un score de 0.0 (diferentes) a 1.0 (idénticos).

        Factores:
        - Mismo asset (40%)
        - Misma dirección (25%)
        - Confianza similar (15%)
        - ATR similar (10%)
        - Régimen similar (10%)
        """
        score = 0.0

        # Mismo asset (40%)
        if trade_a.get("asset") == trade_b.get("asset"):
            score += 0.40

        # Misma dirección (25%)
        if trade_a.get("direction") == trade_b.get("direction"):
            score += 0.25

        # Confianza similar (15%) - dentro de ±0.15
        conf_a = trade_a.get("confidence", 0)
        conf_b = trade_b.get("confidence", 0)
        if abs(conf_a - conf_b) < 0.15:
            score += 0.15 * (1 - abs(conf_a - conf_b) / 0.15)

        # ATR similar (10%) - dentro de ±30%
        atr_a = trade_a.get("atr_pct", 0.01)
        atr_b = trade_b.get("atr_pct", 0.01)
        atr_ratio = min(atr_a, atr_b) / max(atr_a, atr_b) if max(atr_a, atr_b) > 0 else 1
        score += 0.10 * atr_ratio

        # Régimen similar (10%)
        if trade_a.get("regime") == trade_b.get("regime"):
            score += 0.10

        return min(score, 1.0)

    def reclusterizar(self):
        """Re-agrupa todos los trades en clusters por similitud de patrones."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, asset, direction, confidence, atr_pct, regime, pnl_usd, pnl_pct
            FROM trades WHERE pnl_pct IS NOT NULL
            ORDER BY id DESC
        """)
        all_trades = [
            {"id": row[0], "asset": row[1], "direction": row[2],
             "confidence": row[3], "atr_pct": row[4], "regime": row[5],
             "pnl_usd": row[6] or 0, "pnl_pct": row[7] or 0}
            for row in cursor.fetchall()
        ]

        if len(all_trades) < MIN_TRADES_POR_CLUSTER:
            print(f"  [MNEMO] Muy pocos trades para clustering: {len(all_trades)} < {MIN_TRADES_POR_CLUSTER}")
            conn.close()
            return

        # Clustering simple: agrupar por asset + direction + confianza similar
        clusters = {}
        cluster_id = 0

        for trade in all_trades:
            asignado = False
            for cid, miembros in clusters.items():
                # Comparar con el primer trade del cluster (representante)
                rep = miembros[0]
                sim = self._calcular_similitud(trade, rep)
                if sim >= SIMILARIDAD_MINIMA:
                    miembros.append(trade)
                    asignado = True
                    break

            if not asignado and cluster_id < MAX_CLUSTERS:
                clusters[cluster_id] = [trade]
                cluster_id += 1

        # Limpiar clusters antiguos
        cursor.execute("UPDATE clusters SET active = 0")

        # Insertar/actualizar clusters
        for cid, miembros in clusters.items():
            wins = sum(1 for t in miembros if t["pnl_usd"] > 0)
            losses = len(miembros) - wins
            total_pnl = sum(t["pnl_usd"] for t in miembros)
            avg_pnl = total_pnl / len(miembros) if miembros else 0
            win_rate = wins / len(miembros) if miembros else 0

            # Sharpe del cluster
            pnls = np.array([t["pnl_pct"] for t in miembros])
            sharpe = np.mean(pnls) / max(np.std(pnls), 0.001) * np.sqrt(252)

            # Determinar nombre del cluster
            rep = miembros[0]
            name = f"{rep['asset']}_{rep['direction']}_C{cid}"

            cursor.execute("""
                INSERT OR REPLACE INTO clusters (
                    id, name, asset, direction,
                    min_confidence, max_confidence, avg_atr_pct, regime_preference,
                    total_trades, wins, losses, total_pnl, win_rate, avg_pnl, sharpe,
                    last_updated, active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1)
            """, (
                cid + 1, name, rep["asset"], rep["direction"],
                min(t["confidence"] for t in miembros),
                max(t["confidence"] for t in miembros),
                np.mean([t["atr_pct"] for t in miembros]),
                rep.get("regime", "NORMAL"),
                len(miembros), wins, losses, total_pnl, win_rate, avg_pnl, sharpe,
            ))

            # Asignar cluster_id a cada trade
            for t in miembros:
                cursor.execute("UPDATE trades SET cluster_id = ? WHERE id = ?", (cid + 1, t["id"]))

        # Guardar stats (usando misma conexión)
        self._guardar_estado("last_train", datetime.now(timezone.utc).isoformat(), conn)
        self._guardar_estado("num_clusters", str(len(clusters)), conn)

        conn.commit()
        conn.close()

        print(f"  [MNEMO] Reclustering completado: {len(clusters)} clusters | {len(all_trades)} trades")

    # ------------------------------------------------------------------
    # AJUSTE DE SEÑALES CON MEMORIA
    # ------------------------------------------------------------------

    def ajustar_senal(self, senal: Dict) -> Dict:
        """
        Ajusta la confianza de una señal basándose en la memoria histórica.
        Busca trades similares en el pasado y calcula un factor de ajuste.

        Args:
            senal: Dict con la señal estructurada (del signals.json)

        Returns:
            Dict: Señal ajustada con campo mnemo_adjustment agregado
        """
        signal = senal.get("signal", {})
        market = senal.get("market_state", {})
        analysis = senal.get("analysis", {})

        if not signal.get("direction"):
            return senal  # Sin señal, no ajustar

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Buscar trades similares en la base de datos
        cursor.execute("""
            SELECT c.id, c.name, c.total_trades, c.wins, c.losses,
                   c.win_rate, c.avg_pnl, c.sharpe, c.avg_atr_pct
            FROM clusters c
            WHERE c.asset = ? AND c.direction = ? AND c.active = 1
              AND c.total_trades >= ?
            ORDER BY c.total_trades DESC
        """, (market.get("symbol", "BTCUSDT"), signal["direction"], MIN_TRADES_POR_CLUSTER - 1))

        clusters = cursor.fetchall()

        if not clusters:
            # Sin memoria para este patrón → señal sin ajuste
            senal["mnemo"] = {
                "adjustment": 1.0,
                "adjusted_confidence": signal["confidence"],
                "memory_trades": 0,
                "clusters_found": 0,
                "reason": "Sin memoria para este patrón",
            }
            conn.close()
            return senal

        # Usar el cluster más relevante (más trades)
        best = clusters[0]
        c_id, c_name, c_trades, c_wins, c_losses, c_wr, c_avg_pnl, c_sharpe, c_atr = best

        # Calcular factor de ajuste MNEMO
        # Base: win_rate histórico del cluster
        # Si WR > 0.5 → boost, si WR < 0.5 → penalty
        confianza_original = signal["confidence"]
        wr_memoria = c_wr if c_wr > 0 else 0.5

        # Factor MNEMO: cuánto ajustar la confianza basado en memoria
        # WR 0.5 = sin ajuste, WR 0.7 = +20%, WR 0.3 = -20%
        factor_memoria = 1.0 + (wr_memoria - 0.5)

        # Ajustar por Sharpe del cluster (mejor Sharpe → más confianza)
        sharpe_boost = min(max(c_sharpe / 10.0, -0.1), 0.1)
        factor_memoria += sharpe_boost

        # Ajustar por tamaño de muestra (más trades → más confianza en el ajuste)
        sample_confidence = min(c_trades / 50.0, 1.0)
        ajuste_final = 1.0 + (factor_memoria - 1.0) * sample_confidence

        confianza_ajustada = confianza_original * ajuste_final
        confianza_ajustada = max(0.0, min(1.0, confianza_ajustada))

        # Actualizar señal
        signal["confidence"] = round(confianza_ajustada, 4)
        signal["confidence_original"] = round(confianza_original, 4)

        # Si la confianza ajustada cae por debajo del umbral, quitar dirección
        if confianza_ajustada < 0.35 and signal.get("direction"):
            signal["direction"] = None
            signal["type"] = "MNEMO_REJECTED"
            signal["regime"] = "FILTRADO_POR_MEMORIA"

        # Agregar metadata de MNEMO
        senal["mnemo"] = {
            "adjustment": round(ajuste_final, 4),
            "adjusted_confidence": round(confianza_ajustada, 4),
            "original_confidence": round(confianza_original, 4),
            "memory_trades": c_trades,
            "cluster_name": c_name,
            "cluster_win_rate": round(wr_memoria, 4),
            "cluster_sharpe": round(c_sharpe, 4),
            "clusters_found": len(clusters),
            "reason": f"Memoria: {c_wins}W/{c_losses}L ({c_trades} trades, WR {wr_memoria:.0%})",
        }

        conn.close()
        return senal

    # ------------------------------------------------------------------
    # ESTADO Y REPORTE
    # ------------------------------------------------------------------

    def status(self) -> Dict:
        """Genera reporte de estado de la memoria MNEMO."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Estadísticas generales
        cursor.execute("SELECT COUNT(*), SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END), "
                       "COALESCE(SUM(pnl_usd), 0), COALESCE(AVG(pnl_usd), 0) "
                       "FROM trades WHERE pnl_usd IS NOT NULL")
        total, wins, total_pnl, avg_pnl = cursor.fetchone()
        total = total or 0
        wins = wins or 0
        total_pnl = total_pnl or 0.0
        avg_pnl = avg_pnl or 0.0

        # Clusters activos
        cursor.execute("SELECT COUNT(*) FROM clusters WHERE active = 1")
        active_clusters = cursor.fetchone()[0] or 0

        # Mejores clusters
        cursor.execute("""
            SELECT name, total_trades, win_rate, avg_pnl, sharpe
            FROM clusters WHERE active = 1 AND total_trades >= ?
            ORDER BY win_rate DESC LIMIT 5
        """, (MIN_TRADES_POR_CLUSTER,))
        top_clusters = [
            {"name": r[0], "trades": r[1], "wr": round(r[2] * 100, 1),
             "avg_pnl": round(r[3], 2), "sharpe": round(r[4], 2)}
            for r in cursor.fetchall()
        ]

        conn.close()

        return {
            "total_trades": total,
            "trades_ganados": wins,
            "win_rate": round(wins / total * 100, 2) if total > 0 else 0,
            "total_pnl_usd": round(total_pnl, 2),
            "avg_pnl_usd": round(avg_pnl, 2),
            "clusters_activos": active_clusters,
            "total_clusters": active_clusters,
            "ultimo_entrenamiento": self.last_train,
            "top_clusters": top_clusters,
            "db_path": self.db_path,
        }

    def print_status(self):
        """Imprime estado de la memoria MNEMO en consola."""
        s = self.status()
        print("\n" + "=" * 65)
        print("  [MNEMO] Estado de la Memoria Persistente")
        print("=" * 65)
        print(f"  Trades registrados:  {s['total_trades']}")
        print(f"  Win Rate historico:  {s['win_rate']:.1f}% ({s['trades_ganados']}W/{s['total_trades'] - s['trades_ganados']}L)")
        print(f"  PnL total:           ${s['total_pnl_usd']:+.2f}")
        print(f"  PnL promedio:        ${s['avg_pnl_usd']:+.2f}")
        print(f"  Clusters activos:    {s['clusters_activos']}")
        print(f"  Ultimo train:        {s['ultimo_entrenamiento']}")
        print(f"  DB path:             {s['db_path']}")
        if s['top_clusters']:
            print(f"\n  Top clusters por WR:")
            for c in s['top_clusters']:
                print(f"    {c['name']:30s} | {c['trades']:3d} trades | "
                      f"WR {c['wr']:5.1f}% | PnL ${c['avg_pnl']:+.2f} | Sharpe {c['sharpe']:.2f}")
        print("=" * 65)


# =============================================================================
# FUNCIONES DE INTEGRACIÓN CON EL BRIDGE
# =============================================================================

def ajustar_senal_actual() -> Optional[Dict]:
    """
    Lee la señal actual de signals.json, la ajusta con MNEMO,
    y guarda la versión ajustada.

    Uso: python -m models.mnemo_agent adjust
    """
    signal_path = os.path.join(SIGNALS_DIR, "latest_signals.json")
    if not os.path.exists(signal_path):
        print("  [MNEMO] No hay señal para ajustar")
        return None

    with open(signal_path, "r", encoding="utf-8") as f:
        senal = json.load(f)

    mnemo = MnemoAgent()
    senal_ajustada = mnemo.ajustar_senal(senal)

    # Guardar versión ajustada
    with open(signal_path, "w", encoding="utf-8") as f:
        json.dump(senal_ajustada, f, indent=2, ensure_ascii=False, default=str)

    m = senal_ajustada.get("mnemo", {})
    sig = senal_ajustada.get("signal", {})

    print(f"\n  [MNEMO] Señal ajustada:")
    print(f"  Dirección original:  {sig.get('direction') or 'SIN SEÑAL'}")
    print(f"  Confianza original:  {m.get('original_confidence', 0):.2%}")
    print(f"  Factor MNEMO:        {m.get('adjustment', 1.0):.4f}x")
    print(f"  Confianza ajustada:  {m.get('adjusted_confidence', 0):.2%}")
    print(f"  Memoria:             {m.get('memory_trades', 0)} trades en cluster "
          f"'{m.get('cluster_name', 'N/A')}'")
    print(f"  WR del cluster:      {m.get('cluster_win_rate', 0):.0%}")
    print(f"  Razón:               {m.get('reason', 'N/A')}")

    return senal_ajustada


def registrar_ultimo_trade() -> int:
    """
    Lee el último trade cerrado del trade_log.json y lo registra en memoria.

    Uso: python -m models.mnemo_agent record
    """
    trade_log_path = os.path.join(TRADES_DIR, "trade_log.json")
    if not os.path.exists(trade_log_path):
        print("  [MNEMO] No hay trade log para registrar")
        return 0

    with open(trade_log_path, "r", encoding="utf-8") as f:
        trades = json.load(f)

    mnemo = MnemoAgent()
    registrados = 0
    for trade in trades:
        if trade.get("status") == "CLOSED" and "exit" in trade:
            # Verificar si ya está registrado
            conn = sqlite3.connect(mnemo.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM trades WHERE timestamp = ? AND asset = ? AND entry_price = ?",
                (trade.get("timestamp", ""), trade.get("asset", ""), trade.get("entry_price", 0))
            )
            exists = cursor.fetchone()[0] > 0
            conn.close()

            if not exists:
                exit_data = trade["exit"]
                trade_record = {
                    **trade,
                    "exit_price": exit_data.get("exit_price", 0),
                    "exit_reason": exit_data.get("exit_reason", ""),
                    "pnl_pct": exit_data.get("pnl_pct", 0),
                    "pnl_usd": exit_data.get("pnl_usd", 0),
                }
                mnemo.registrar_trade(trade_record)
                registrados += 1

    if registrados > 0:
        mnemo.reclusterizar()

    print(f"  [MNEMO] {registrados} nuevos trades registrados")
    return registrados


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="MNEMO - Agente de Memoria Persistente"
    )
    parser.add_argument(
        "action",
        choices=["adjust", "record", "status", "recluster", "reset"],
        nargs="?",
        default="status",
        help="Acción a ejecutar"
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Forzar acción (ej: reset sin confirmación)"
    )
    args = parser.parse_args()

    if args.action == "adjust":
        ajustar_senal_actual()

    elif args.action == "record":
        registrar_ultimo_trade()

    elif args.action == "status":
        mnemo = MnemoAgent()
        mnemo.print_status()

    elif args.action == "recluster":
        mnemo = MnemoAgent()
        mnemo.reclusterizar()
        mnemo.print_status()

    elif args.action == "reset":
        if not args.force:
            print("  ⚠ Para resetear la memoria, usa --force")
            return
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
            print(f"  [MNEMO] Memoria reseteada: {DB_PATH}")
        mnemo = MnemoAgent()
        print("  [MNEMO] Nueva base de datos creada")


if __name__ == "__main__":
    main()
