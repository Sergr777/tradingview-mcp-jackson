"""
Módulo de Carteras Markov-Grafos v5.1+
Sistema cuantitativo de 4 carteras con coordinador macro.

Componentes:
- BaseMarkovEngine: Clase base con métodos comunes
- CarteraAcciones: 15 stocks/ETFs con selección VIX + estacional
- CarteraFuturos: 6 futuros con grafo de volumen (16 estados)
- CarteraTechCrypto: 10 tech/crypto con flujos AI_FLOW + CRYPTO_FLOW
- MacroCoordinador: Risk parity + circuit breaker entre carteras
- MotorUnificado: PipelineMarkovUltraRendimiento completo

Autor: InvestCripto AI Development
Fecha: 2026-07-28
"""

# Imports perezosos (lazy) para evitar errores de dependencia
# Las importaciones se hacen bajo demanda, no al cargar el módulo
# Esto permite usar portfolios sin cargar todas las carteras

__all__ = [
    "BaseMarkovEngine",
    "PipelineMarkovAcciones",
    "PipelineMarkovFuturos",
    "PipelineMarkovTech",
    "PipelineMarkovDivisas",
    "MacroPortfolioCoordinator",
    "PipelineMarkovUltraRendimiento",
    "ejecutar_bot_unificado",
    "ejecutar_bot_unificado_xgb",
]


def __getattr__(name):
    """Importación perezosa: solo importa cuando se accede al símbolo."""
    import importlib
    module_map = {
        "BaseMarkovEngine": ".base_engine",
        "PipelineMarkovAcciones": ".cartera_acciones",
        "PipelineMarkovFuturos": ".cartera_futuros",
        "PipelineMarkovTech": ".cartera_tech_crypto",
        "PipelineMarkovDivisas": ".cartera_divisas",
        "MacroPortfolioCoordinator": ".macro_coordinador",
        "PipelineMarkovUltraRendimiento": ".motor_unificado",
        "ejecutar_bot_unificado": ".motor_unificado",
        "ejecutar_bot_unificado_xgb": ".motor_unificado",
    }
    if name in module_map:
        submodule = importlib.import_module(module_map[name], __package__)
        return getattr(submodule, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
