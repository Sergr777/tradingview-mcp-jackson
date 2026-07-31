"""
Modelos de Cartera Optimizados - Markov-Grafos + XGBoost + LightGBM + CatBoost
================================================================================

Componentes incorporados desde los modelos externos optimizados:

1. cartera_acciones_futuros_xgb.py
   - PipelineMarkovAccionesXGB: 15 stocks/ETFs con filtro XGBoost y ancla VIX
   - PipelineMarkovFuturosXGB: 6 futuros con filtro XGBoost y ancla Bono 10Y

2. cartera_forex_xgb.py
   - PipelineMarkovForexXGB: 7 pares forex mayores con corrección direccional

3. coordinador_macro_v2.py
   - MacroPortfolioCoordinatorV2: Risk Parity + Overlap Guard + Circuit Breaker
   - InvescriptoAI: KRONOS (régimen) + ORACULO (scores)

4. ob_crypto_wfa.py
   - OBTradingSystemCrypto: OB + LightGBM/CatBoost para BTC/ETH (15m)

5. ob_forex_wfa.py
   - OBTradingSystemForex: OB + LightGBM/CatBoost para pares forex (1h)
   - IntelligentForexSelector: Selección inteligente de activos forex

Uso:
    from models import PipelineMarkovAccionesXGB
    from models import PipelineMarkovFuturosXGB
    from models import PipelineMarkovForexXGB
    from models import MacroPortfolioCoordinatorV2
    from models import OBTradingSystemCrypto, OBTradingSystemForex
    from models import run_ecosistema_completo
"""

from .cartera_acciones_futuros_xgb import (
    PipelineMarkovAccionesXGB,
    PipelineMarkovFuturosXGB,
)
from .cartera_forex_xgb import PipelineMarkovForexXGB
from .coordinador_macro_v2 import (
    MacroPortfolioCoordinatorV2,
    InvescriptoAI,
)
# OB imports son LAZY (importados solo cuando se usan) para evitar
# que la falta de lightgbm/catboost bloquee el resto del ecosistema.
def get_ob_crypto():
    """Importa OBTradingSystemCrypto bajo demanda."""
    from .ob_crypto_wfa import OBTradingSystemCrypto
    return OBTradingSystemCrypto

def get_ob_forex():
    """Importa OBTradingSystemForex e IntelligentForexSelector bajo demanda."""
    from .ob_forex_wfa import OBTradingSystemForex, IntelligentForexSelector
    return OBTradingSystemForex, IntelligentForexSelector

# run_ecosistema_completo es LAZY (importado bajo demanda para evitar
# circular imports cuando se ejecuta: python -m models.run_ecosistema_modelos)
def get_run_ecosistema():
    """Importa run_ecosistema_completo bajo demanda."""
    from .run_ecosistema_modelos import run_ecosistema_completo
    return run_ecosistema_completo

__all__ = [
    "PipelineMarkovAccionesXGB",
    "PipelineMarkovFuturosXGB",
    "PipelineMarkovForexXGB",
    "MacroPortfolioCoordinatorV2",
    "InvescriptoAI",
    "get_ob_crypto",
    "get_ob_forex",
    "get_run_ecosistema",
]
