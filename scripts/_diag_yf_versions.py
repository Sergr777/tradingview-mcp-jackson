"""Temporal: probar versiones de yfinance en el entorno de CI."""
import subprocess
import sys

VERSIONS = ['0.2.55', '0.2.56', '0.2.57', '0.2.58', '0.2.59']

TEST = '''
import yfinance as yf
from curl_cffi import requests as creq
for label, kwargs in [
    ("con session", dict(session=creq.Session(impersonate="chrome"))),
    ("sin session", dict()),
]:
    try:
        df = yf.download("SPY", start="2026-07-20", end=None, interval="1d",
                         auto_adjust=True, progress=False, **kwargs)
        print("  %s: filas %d" % (label, len(df)), flush=True)
    except Exception as e:
        print("  %s: EXC %s: %s" % (label, type(e).__name__, str(e)[:90]), flush=True)
'''

for v in VERSIONS:
    print('== yfinance %s ==' % v, flush=True)
    r = subprocess.run([sys.executable, '-m', 'pip', 'install', '-q',
                        '--force-reinstall', 'yfinance==%s' % v,
                        'curl_cffi==0.16.0'],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print('  pip install FALLO:', r.stderr[-200:].strip(), flush=True)
        continue
    r2 = subprocess.run([sys.executable, '-c', TEST], capture_output=True, text=True)
    out = r2.stdout.strip()
    if out:
        print(out, flush=True)
    else:
        print('  (sin stdout) stderr:', r2.stderr.strip()[-300:], flush=True)
