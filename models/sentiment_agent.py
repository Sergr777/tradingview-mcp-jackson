"""
sentiment_agent.py — SENTIMENT: Analisis de Sentimiento de Mercado
===================================================================
Agente de analisis de sentimiento que evalua el estado emocional
del mercado crypto usando NLP (VADER) y datos宏观.

Fuentes de datos:
  1. Fear & Greed Index (indice de sentimiento del mercado crypto)
  2. VADER NLP sobre titulares de noticias crypto
  3. Datos on-chain simples (volumen social, dominancia BTC)

Arquitectura:
  Fear & Greed API ─┐
                     ├── SENTIMENT (VADER + ponderacion) → score [-1, +1]
  Noticias crypto ──┘
                      ↓
  Combinacion con OB + PROPHET → sen~al ajustada

Uso:
    python -m models.sentiment_agent status    # Ver sentimiento actual
    python -m models.sentiment_agent news      # Analizar noticias recientes
    python -m models.sentiment_agent fng       # Obtener Fear & Greed Index
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from urllib.request import Request, urlopen
from urllib.error import URLError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# VADER para NLP
try:
    from nltk.sentiment.vader import SentimentIntensityAnalyzer
    VADER_DISPONIBLE = True
except ImportError:
    VADER_DISPONIBLE = False

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGNALS_DIR = os.path.join(PROJECT_ROOT, "data", "signals")
CACHE_DIR = os.path.join(PROJECT_ROOT, "data", "sentiment")

# Pesos de cada componente en el score final
PESO_FNG = 0.50           # 50% Fear & Greed Index
PESO_NEWS = 0.35          # 35% Noticias (VADER)
PESO_MACRO = 0.15         # 15% Macro/BTC dominance

# Cache
CACHE_MINUTOS = 30        # Recargar sentimiento cada 30 min

# Noticias de respaldo cuando fallan las fuentes RSS
NEWS_FALLBACK = [
    "Bitcoin price shows strong momentum as institutional adoption grows",
    "Crypto market cap reaches new milestone amid positive regulation news",
    "Ethereum upgrade boosts network activity and developer interest",
    "Bitcoin hash rate hits all-time high signaling network strength",
    "Market uncertainty grows as regulatory concerns weigh on sentiment",
]

# URLs de APIs gratuitas
FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1"
COINGECKO_URL = "https://api.coingecko.com/api/v3/global"

# RSS Feeds de noticias crypto (sin API key, gratuitos)
CRYPTO_RSS_FEEDS = [
    "https://cointelegraph.com/rss",
    "https://bitcoinmagazine.com/feed",
    "https://news.google.com/rss/search?q=bitcoin+crypto+when:24h&hl=en-US&gl=US&ceid=US:en",
]
MAX_RSS_ITEMS = 20  # Max headlines a analizar por ciclo


# =============================================================================
# SENTIMENT AGENT
# =============================================================================

class SentimentAgent:
    """
    SENTIMENT: Analisis de sentimiento del mercado crypto.

    Combina multiples fuentes para generar un score de sentimiento
    que se integra con las sen~ales de OB System y PROPHET.

    Score: [-1.0 (miedo extremo) a +1.0 (euforia extrema)]
      - < -0.5: MIEDO EXTREMO (sobreventa, posible rebote)
      - -0.5 a -0.1: MIEDO (cautela)
      - -0.1 a +0.1: NEUTRAL
      - +0.1 a +0.5: CODICIA (confianza)
      - > +0.5: CODICIA EXTREMA (sobrecompra, posible correccion)
    """

    def __init__(self):
        self.vader = SentimentIntensityAnalyzer() if VADER_DISPONIBLE else None
        self.cache: Dict = {}
        self.ultima_actualizacion: Optional[datetime] = None

        os.makedirs(CACHE_DIR, exist_ok=True)

    # ------------------------------------------------------------------
    # FEAR & GREED INDEX
    # ------------------------------------------------------------------

    def obtener_fng(self) -> Dict:
        """
        Obtiene el Fear & Greed Index desde alternative.me.

        Returns:
            Dict con value (0-100), classification, timestamp
        """
        try:
            req = Request(FEAR_GREED_URL, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                if data and data.get('data'):
                    entry = data['data'][0]
                    value = int(entry.get('value', 50))
                    classification = entry.get('value_classification', 'Neutral')
                    return {
                        "value": value,
                        "classification": classification,
                        "source": "alternative.me",
                        "timestamp": entry.get('timestamp', ''),
                    }
        except (URLError, json.JSONDecodeError, KeyError) as e:
            print(f"  [SENTIMENT] Fear & Greed no disponible: {e}")

        return {"value": 50, "classification": "Neutral", "source": "fallback"}

    def fng_a_score(self, fng_value: int) -> float:
        """
        Convierte Fear & Greed (0-100) a score [-1, +1].
        0-25: -1.0 a -0.5  (miedo extremo)
        25-50: -0.5 a 0.0  (miedo)
        50-75: 0.0 a +0.5   (codicia)
        75-100: +0.5 a +1.0 (codicia extrema)
        """
        if fng_value <= 25:
            return -1.0 + (fng_value / 25) * 0.5
        elif fng_value <= 50:
            return -0.5 + ((fng_value - 25) / 25) * 0.5
        elif fng_value <= 75:
            return 0.0 + ((fng_value - 50) / 25) * 0.5
        else:
            return 0.5 + ((fng_value - 75) / 25) * 0.5

    # ------------------------------------------------------------------
    # RSS NEWS FETCHER
    # ------------------------------------------------------------------

    def _fetch_rss_headlines(self, max_items: int = MAX_RSS_ITEMS) -> List[str]:
        """
        Obtiene titulares de noticias crypto desde RSS feeds.

        Sin API key. Usa Cointelegraph RSS, Bitcoin Magazine RSS,
        y Google News RSS search. Si falla todo, usa fallback.

        Returns:
            Lista de titulares (strings)
        """
        import xml.etree.ElementTree as ET

        titulares = []
        for feed_url in CRYPTO_RSS_FEEDS:
            if len(titulares) >= max_items:
                break
            try:
                req = Request(feed_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urlopen(req, timeout=8) as resp:
                    raw = resp.read()
                    # Intentar parsear XML
                    root = ET.fromstring(raw)

                    # RSS 2.0: channel > item > title
                    items = root.findall('.//item') or root.findall('.//entry')
                    for item in items:
                        title_el = item.find('title')
                        if title_el is not None and title_el.text:
                            t = title_el.text.strip()
                            if t and t not in titulares:
                                titulares.append(t)
                                if len(titulares) >= max_items:
                                    break

                if titulares:
                    fuente = feed_url.split('/')[2]
                    print(f"  [SENTIMENT] RSS {fuente}: {len(titulares)} titulares obtenidos")
            except Exception as e:
                print(f"  [SENTIMENT] RSS {feed_url.split('/')[2] if '/' in feed_url else feed_url}: {e}")
                continue

        if not titulares:
            print(f"  [SENTIMENT] RSS feeds no disponibles, usando fallback")
            return NEWS_FALLBACK

        return titulares[:max_items]

    # ------------------------------------------------------------------
    # VADER NEWS ANALYSIS
    # ------------------------------------------------------------------

    def analizar_noticias(self, headlines: List[str] = None) -> Dict:
        """
        Analiza sentimiento de titulares con VADER.
        Si no se proporcionan titulares, los obtiene desde RSS feeds.

        Args:
            headlines: Lista de titulares. Si es None, obtiene de RSS.

        Returns:
            Dict con score promedio, compound, positivos, negativos, neutrales
        """
        if not VADER_DISPONIBLE or self.vader is None:
            return {"score": 0.0, "error": "VADER no disponible"}

        if headlines is None:
            headlines = self._fetch_rss_headlines()

        scores = []
        positivos = 0
        negativos = 0
        neutrales = 0

        for headline in headlines:
            vs = self.vader.polarity_scores(headline)
            compound = vs['compound']
            scores.append(compound)

            if compound >= 0.05:
                positivos += 1
            elif compound <= -0.05:
                negativos += 1
            else:
                neutrales += 1

        if not scores:
            return {"score": 0.0, "compound_avg": 0.0, "n_headlines": 0}

        score_promedio = sum(scores) / len(scores)

        return {
            "score": round(score_promedio, 4),
            "compound_avg": round(score_promedio, 4),
            "n_headlines": len(headlines),
            "positivos": positivos,
            "negativos": negativos,
            "neutrales": neutrales,
            "ultimos_titulares": headlines[:5],
        }

    # ------------------------------------------------------------------
    # MACRO CONTEXT
    # ------------------------------------------------------------------

    def obtener_macro(self) -> Dict:
        """
        Obtiene datos macro relevantes para sentimiento.
        BTC dominance como proxy de risk-on/risk-off.

        Returns:
            Dict con btc_dominance, market_cap
        """
        try:
            req = Request(COINGECKO_URL, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                datos = data.get('data', {})

                btc_d = datos.get('market_cap_percentage', {}).get('btc', 55)
                total_mc = datos.get('total_market_cap', {}).get('usd', 2e12)

                # BTC dominance alto = risk-off (inversionistas van a BTC)
                # BTC dominance bajo = risk-on (altcoins)
                dom_score = (btc_d - 40) / 30  # 40% = neutral, >70% = risk-off
                dom_score = max(-1.0, min(1.0, dom_score))

                return {
                    "btc_dominance": round(btc_d, 1),
                    "total_market_cap_usd": round(total_mc, 0),
                    "dominance_score": round(dom_score, 4),
                    "source": "coingecko",
                }
        except Exception as e:
            print(f"  [SENTIMENT] Macro no disponible: {e}")

        return {"btc_dominance": 55.0, "dominance_score": 0.0, "source": "fallback"}

    # ------------------------------------------------------------------
    # SCORE COMPUESTO
    # ------------------------------------------------------------------

    def calcular_sentimiento(self, force_refresh: bool = False) -> Dict:
        """
        Calcula el score compuesto de sentimiento.

        Args:
            force_refresh: Si True, ignora cache

        Returns:
            Dict con score compuesto, desglose, interpretacion
        """
        # Cache
        if not force_refresh and self.ultima_actualizacion:
            edad = (datetime.now(timezone.utc) - self.ultima_actualizacion).total_seconds() / 60
            if edad < CACHE_MINUTOS and self.cache:
                return self.cache

        # 1. Fear & Greed Index
        fng = self.obtener_fng()
        score_fng = self.fng_a_score(fng['value'])
        print(f"  [SENTIMENT] Fear & Greed: {fng['value']}/100 ({fng['classification']}) -> score {score_fng:+.3f}")

        # 2. Noticias con VADER
        news_result = self.analizar_noticias()
        score_news = news_result.get('score', 0.0)
        print(f"  [SENTIMENT] Noticias VADER: {news_result.get('n_headlines', 0)} titulares -> score {score_news:+.3f}")

        # 3. Macro
        macro = self.obtener_macro()
        score_macro = macro.get('dominance_score', 0.0)
        print(f"  [SENTIMENT] Macro (BTC dom): {macro.get('btc_dominance', 0)}% -> score {score_macro:+.3f}")

        # Score compuesto ponderado
        score_total = (
            PESO_FNG * score_fng +
            PESO_NEWS * score_news +
            PESO_MACRO * score_macro
        )

        # Interpretacion
        if score_total <= -0.7:
            interpretacion = "MIEDO_EXTREMO"
            sesgo = "BULLISH"  # Miedo extremo = posible rebote
        elif score_total <= -0.3:
            interpretacion = "MIEDO"
            sesgo = "BULLISH"  # Miedo = oportunidad de compra
        elif score_total <= -0.1:
            interpretacion = "LIGERO_MIEDO"
            sesgo = "NEUTRAL_BULLISH"
        elif score_total <= 0.1:
            interpretacion = "NEUTRAL"
            sesgo = "NEUTRAL"
        elif score_total <= 0.3:
            interpretacion = "LIGERA_CODICIA"
            sesgo = "NEUTRAL_BEARISH"
        elif score_total <= 0.7:
            interpretacion = "CODICIA"
            sesgo = "BEARISH"  # Codicia = posible correccion
        else:
            interpretacion = "CODICIA_EXTREMA"
            sesgo = "BEARISH"  # Codicia extrema = correccion inminente

        resultado = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "score_compuesto": round(score_total, 4),
            "interpretacion": interpretacion,
            "sesgo": sesgo,
            "componentes": {
                "fear_greed": {
                    "value": fng['value'],
                    "classification": fng['classification'],
                    "score": round(score_fng, 4),
                    "peso": PESO_FNG,
                },
                "noticias_vader": {
                    **news_result,
                    "score": round(score_news, 4),
                    "peso": PESO_NEWS,
                },
                "macro": {
                    **macro,
                    "score": round(score_macro, 4),
                    "peso": PESO_MACRO,
                },
            },
            "fuentes_activas": sum([
                fng['source'] != 'fallback',
                VADER_DISPONIBLE,
                macro['source'] != 'fallback',
            ]),
        }

        # Cachear
        self.cache = resultado
        self.ultima_actualizacion = datetime.now(timezone.utc)

        return resultado

    # ------------------------------------------------------------------
    # INTEGRACION CON EL BRIDGE
    # ------------------------------------------------------------------

    def ajustar_senal_con_sentimiento(self, senal: Dict) -> Dict:
        """
        Ajusta la sen~al del bridge basado en el sentimiento actual.

        Logica:
        - Miedo extremo → sesgo BULLISH (sobreventa)
        - Codicia extrema → sesgo BEARISH (sobrecompra)
        - Sentimiento confirma direccion → boost confianza
        - Sentimiento contradice direccion → penalty

        Args:
            senal: Dict con la sen~al del bridge (signals.json)

        Returns:
            Dict: Sen~al ajustada por sentimiento
        """
        sentimiento = self.calcular_sentimiento()
        signal = senal.get("signal", {})
        direccion = signal.get("direction")

        score = sentimiento["score_compuesto"]
        sesgo = sentimiento["sesgo"]

        # Factor de ajuste base
        # Miedo (-1.0) da factor 1.2 (BULLISH), Codicia (+1.0) da factor 0.8 (BEARISH)
        factor_sentimiento = 1.0 - (score * 0.2)

        # Si hay direccion, verificar consistencia
        ajuste_extra = 1.0
        if direccion == "LONG" and "BULLISH" in sesgo:
            ajuste_extra = 1.10  # Sentimiento confirma LONG
        elif direccion == "LONG" and "BEARISH" in sesgo:
            ajuste_extra = 0.85  # Sentimiento contradice LONG
        elif direccion == "SHORT" and "BEARISH" in sesgo:
            ajuste_extra = 1.10  # Sentimiento confirma SHORT
        elif direccion == "SHORT" and "BULLISH" in sesgo:
            ajuste_extra = 0.85  # Sentimiento contradice SHORT

        # Ajustar confianza
        confianza_original = signal.get("confidence", 0)
        confianza_ajustada = confianza_original * factor_sentimiento * ajuste_extra
        confianza_ajustada = max(0.0, min(1.0, confianza_ajustada))

        # Actualizar sen~al
        signal["sentiment_confidence"] = round(confianza_ajustada, 4)
        signal["sentiment_factor"] = round(factor_sentimiento * ajuste_extra, 4)

        # Agregar metadata de SENTIMENT
        senal["sentiment"] = {
            "active": True,
            "score_compuesto": score,
            "interpretacion": sentimiento["interpretacion"],
            "sesgo": sesgo,
            "factor_ajuste": round(factor_sentimiento * ajuste_extra, 4),
            "fear_greed": sentimiento["componentes"]["fear_greed"]["value"],
            "news_vader": sentimiento["componentes"]["noticias_vader"]["score"],
            "confianza_original": round(confianza_original, 4),
            "confianza_ajustada": round(confianza_ajustada, 4),
        }

        return senal

    # ------------------------------------------------------------------
    # ESTADO
    # ------------------------------------------------------------------

    def status(self) -> Dict:
        """Retorna estado completo del agente SENTIMENT."""
        sent = self.calcular_sentimiento()
        return {
            "vader_disponible": VADER_DISPONIBLE,
            "ultima_actualizacion": self.ultima_actualizacion.isoformat() if self.ultima_actualizacion else None,
            "sentimiento_actual": sent,
            "pesos": {
                "fear_greed": PESO_FNG,
                "noticias_vader": PESO_NEWS,
                "macro": PESO_MACRO,
            },
        }

    def print_status(self):
        """Imprime estado en consola."""
        s = self.status()
        sent = s['sentimiento_actual']

        print("\n" + "=" * 65)
        print("  [SENTIMENT] Estado del Analisis de Sentimiento")
        print("=" * 65)
        print(f"  VADER NLP:     {'DISPONIBLE' if s['vader_disponible'] else 'NO DISPONIBLE'}")
        print(f"  Score comp:    {sent['score_compuesto']:+.4f}")
        print(f"  Interpretacion: {sent['interpretacion']}")
        print(f"  Sesgo:         {sent['sesgo']}")
        print(f"\n  Componentes:")
        print(f"    Fear & Greed:    {sent['componentes']['fear_greed']['value']}/100 "
              f"({sent['componentes']['fear_greed']['classification']}) "
              f"[peso {sent['componentes']['fear_greed']['peso']:.0%}]")
        print(f"    Noticias VADER:  {sent['componentes']['noticias_vader']['score']:+.4f} "
              f"({sent['componentes']['noticias_vader']['n_headlines']} titulares) "
              f"[peso {sent['componentes']['noticias_vader']['peso']:.0%}]")
        print(f"    Macro (BTC dom): {sent['componentes']['macro']['btc_dominance']}% "
              f"[peso {sent['componentes']['macro']['peso']:.0%}]")
        print(f"\n  Fuentes activas: {sent['fuentes_activas']}/3")
        print("=" * 65)


# =============================================================================
# FUNCIONES DE INTEGRACION
# =============================================================================

def ajustar_senal_actual(agent: Optional[SentimentAgent] = None) -> Optional[Dict]:
    """
    Lee la sen~al actual, la ajusta con sentimiento, y guarda.

    Args:
        agent: Instancia de SentimentAgent (opcional, reusa datos cacheados)

    Uso: python -m models.sentiment_agent adjust
    """
    signal_path = os.path.join(SIGNALS_DIR, "latest_signals.json")
    if not os.path.exists(signal_path):
        print("  [SENTIMENT] No hay sen~al para ajustar")
        return None

    with open(signal_path, "r", encoding="utf-8") as f:
        senal = json.load(f)

    if agent is None:
        agent = SentimentAgent()
    senal_ajustada = agent.ajustar_senal_con_sentimiento(senal)

    with open(signal_path, "w", encoding="utf-8") as f:
        json.dump(senal_ajustada, f, indent=2, ensure_ascii=False, default=str)

    s = senal_ajustada.get("sentiment", {})
    sig = senal_ajustada.get("signal", {})

    print(f"\n  [SENTIMENT] Sen~al ajustada:")
    print(f"  Fear & Greed:  {s.get('fear_greed', 'N/A')}/100")
    print(f"  VADER news:    {s.get('news_vader', 0):+.4f}")
    print(f"  Score comp:    {s.get('score_compuesto', 0):+.4f} ({s.get('interpretacion', 'N/A')})")
    print(f"  Factor ajuste: {s.get('factor_ajuste', 1.0):.4f}x")
    print(f"  Confianza:     {s.get('confianza_original', 0):.2%} -> {s.get('confianza_ajustada', 0):.2%}")
    print(f"  Direccion:     {sig.get('direction', 'SIN SEN~AL')}")

    return senal_ajustada


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="SENTIMENT - Analisis de Sentimiento de Mercado"
    )
    parser.add_argument(
        "action",
        choices=["status", "fng", "news", "adjust", "all"],
        nargs="?",
        default="status",
        help="Accion a ejecutar"
    )
    args = parser.parse_args()

    agent = SentimentAgent()

    if args.action == "status":
        agent.print_status()

    elif args.action == "fng":
        fng = agent.obtener_fng()
        score = agent.fng_a_score(fng['value'])
        print(f"Fear & Greed: {fng['value']}/100 ({fng['classification']}) -> score {score:+.3f}")

    elif args.action == "news":
        news = agent.analizar_noticias()
        print(f"Analisis VADER de {news.get('n_headlines', 0)} titulares:")
        print(f"  Score: {news.get('score', 0):+.4f}")
        print(f"  Positivos: {news.get('positivos', 0)} | Negativos: {news.get('negativos', 0)} | Neutrales: {news.get('neutrales', 0)}")
        for h in news.get('ultimos_titulares', []):
            vs = agent.vader.polarity_scores(h) if agent.vader else {}
            print(f"  [{vs.get('compound', 0):+.2f}] {h}")

    elif args.action == "adjust":
        ajustar_senal_actual()

    elif args.action == "all":
        agent.print_status()
        print()
        ajustar_senal_actual(agent)  # Reusa la misma instancia (cache activo)


if __name__ == "__main__":
    main()
