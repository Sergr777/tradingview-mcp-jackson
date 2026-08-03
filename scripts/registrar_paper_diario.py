"""
registrar_paper_diario.py — LOG DIARIO DEL PAPER TRADING RSI(2)+TSMOM
=====================================================================
Append de una fila por dia al CSV de auditoria del forward test:

  data/trades/historial_paper_rsi2_tsmom.csv

Lee el reporte del ejecutor (data/trades/ultimo_reporte_portafolio.json) y
las senales (data/signals/latest_signals*.json) y registra una fila resumida
con fecha UTC. Cada corrida del orquestador (cron local / GitHub Actions /
futuro VPS) genera un heartbeat: sirve para verificar que el sistema corrio
todos los dias (los feriados USA quedan como filas identicas al dia anterior)
y para medir el forward test sin depender de los JSON que se sobrescriben.

Si el reporte no existe (primer arranque), crea el CSV con headers.

Uso:
    python scripts/registrar_paper_diario.py
"""

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORT = PROJECT_ROOT / 'data' / 'trades' / 'ultimo_reporte_portafolio.json'
SIGNAL_RSI2 = PROJECT_ROOT / 'data' / 'signals' / 'latest_signals.json'
SIGNAL_TSMOM = PROJECT_ROOT / 'data' / 'signals' / 'latest_signals_tsmom.json'
LOG = PROJECT_ROOT / 'data' / 'trades' / 'historial_paper_rsi2_tsmom.csv'

FIELDS = [
    'fecha_utc', 'w_tsmom', 'n_posiciones', 'gross_pct', 'long_pct',
    'short_pct', 'net_pct', 'rsi2_direction', 'rsi2_estado',
    'tsmom_direction', 'tsmom_n_activos', 'warnings', 'fuente',
]


def _carganum(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def main() -> int:
    if not REPORT.exists():
        print(f'No existe {REPORT} — creando CSV con headers')
        with open(LOG, 'w', newline='', encoding='utf-8') as f:
            csv.DictWriter(f, fieldnames=FIELDS).writeheader()
        return 0

    with open(REPORT, encoding='utf-8') as f:
        plan = json.load(f)

    cfg = plan.get('config', {})
    pf = plan.get('portfolio', {})
    sleeves = plan.get('sleeves', {})
    warnings = plan.get('warnings', [])
    positions = plan.get('positions', [])

    rsi2 = sleeves.get('rsi2', {})
    tsmom = sleeves.get('tsmom', {})

    # Direcciones desde las senales (pueden no coincidir con posiciones)
    rsi2_dir = ''
    try:
        sig = json.load(open(SIGNAL_RSI2, encoding='utf-8'))
        rsi2_dir = sig.get('signal', {}).get('direction', '')
    except Exception:  # noqa: BLE001
        pass
    tsmom_dir = ''
    tsmom_n = 0
    try:
        sig = json.load(open(SIGNAL_TSMOM, encoding='utf-8'))
        tsmom_dir = sig.get('signal', {}).get('direction', '')
        tsmom_n = sig.get('portfolio', {}).get('n_active', 0)
    except Exception:  # noqa: BLE001
        pass

    row = {
        'fecha_utc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'w_tsmom': round(_carganum(cfg.get('w_tsmom_efectivo')), 4),
        'n_posiciones': int(pf.get('n_posiciones', len(positions))),
        'gross_pct': round(_carganum(pf.get('gross_exposure_pct')), 4),
        'long_pct': round(_carganum(pf.get('long_pct')), 4),
        'short_pct': round(_carganum(pf.get('short_pct')), 4),
        'net_pct': round(_carganum(pf.get('net_pct')), 4),
        'rsi2_direction': rsi2_dir,
        'rsi2_estado': 'OK' if rsi2.get('valida') else f"SKIP:{rsi2.get('razon', '')}"[:40],
        'tsmom_direction': tsmom_dir,
        'tsmom_n_activos': int(tsmom_n),
        'warnings': '|'.join(warnings)[:200],
        'fuente': 'gh-actions' if len(sys.argv) > 1 and sys.argv[1] == '--gh' else 'local',
    }

    LOG.parent.mkdir(parents=True, exist_ok=True)
    nuevo = not LOG.exists()
    with open(LOG, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        if nuevo:
            writer.writeheader()
        writer.writerow(row)

    print(f'Log diario registrado en {LOG}')
    print(f'  {row["fecha_utc"]} | w={row["w_tsmom"]} | pos={row["n_posiciones"]} '
          f'| gross={row["gross_pct"]} | rsi2={row["rsi2_estado"]} '
          f'| tsmom={row["tsmom_direction"]}({row["tsmom_n_activos"]})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
