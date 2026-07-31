"""
prophet_agent.py — PROPHET: Motor de Predicción de Precios
============================================================
Agente de predicción que complementa al OB System con señales
de dirección de precio a corto plazo usando LightGBM.

Arquitectura:
  PROPHET features (series de tiempo)
    ↓ LightGBM
  Predicción forward 8 barras (2h en 15m)
    ↓
  Combinación con OB System (0.6 OB + 0.4 PROPHET)
    ↓
  Señal combinada → MNEMO (memoria) → Ejecutor

Diferencias con OB System:
  - OB: Features de Order Block + Meta-Labeling (20 barras forward)
  - PROPHET: Features de series de tiempo (lags, momentum, volatilidad)
  - PROPHET: Horizonte más corto (8 barras = 2h vs 20 = 5h)
  - PROPHET: Solo LightGBM (más rápido que ensemble OB)

Uso:
    python -m models.prophet_agent train     # Entrenar modelo
    python -m models.prophet_agent predict   # Predecir con modelo existente
    python -m models.prophet_agent status    # Mostrar estado
"""

import argparse
import json
import os
import pickle
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import lightgbm as lgb

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# =============================================================================
# CONSTANTES
# =============================================================================

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(PROJECT_ROOT, "data", "models")
SIGNALS_DIR = os.path.join(PROJECT_ROOT, "data", "signals")

# Horizonte de predicción
FWD_BARS = 8                # 8 barras = 2 horas en 15m
MIN_TRAIN_BARS = 2000       # Mínimo de datos para entrenar
N_ESTIMATORS = 300          # Árboles LightGBM

# Features de series de tiempo (20 features)
PROPHET_FEATURES = [
    # Lags de precio
    'ret_lag_1', 'ret_lag_2', 'ret_lag_3', 'ret_lag_5', 'ret_lag_8',
    # Momentum
    'mom_3', 'mom_5', 'mom_8',
    # Volatilidad
    'vol_5', 'vol_8', 'vol_20',
    # Osciladores
    'rsi_7', 'rsi_14',
    # Bandas
    'bb_dist',                   # Distancia a banda media (%)
    'bb_width',                  # Ancho de banda
    # MACD
    'macd', 'macd_signal', 'macd_hist',
    # Volumen
    'vol_ratio',
    # Estacionalidad intradía
    'hour_sin', 'hour_cos',
]

# Peso de PROPHET en la combinación con OB
PESO_PROPHET = 0.35          # 0.35 PROPHET + 0.65 OB
PESO_OB = 0.65


# =============================================================================
# PROPHET AGENT
# =============================================================================

class ProphetAgent:
    """
    PROPHET: Motor de predicción de dirección de precio a corto plazo.

    Usa LightGBM con features de series de tiempo para predecir
    la dirección del precio en las próximas 8 barras (2h).

    Features:
      - Lags de retornos (1, 2, 3, 5, 8 barras)
      - Momentum (3, 5, 8 barras)
      - Volatilidad rolling (5, 8, 20 barras)
      - RSI (7, 14)
      - Bollinger Bands (distancia y ancho)
      - MACD (línea, señal, histograma)
      - Volumen relativo
      - Estacionalidad intradía (hora seno/coseno)
    """

    def __init__(self, model_path: str = None):
        self.model = None
        self.features = PROPHET_FEATURES
        self.model_path = model_path or os.path.join(MODELS_DIR, "prophet_model.pkl")
        self.metrics = {"auc": 0.0, "acc": 0.0, "trained_at": "never", "n_bars": 0}

        os.makedirs(MODELS_DIR, exist_ok=True)
        self._cargar_modelo()

    # ------------------------------------------------------------------
    # PERSISTENCIA DEL MODELO
    # ------------------------------------------------------------------

    def _cargar_modelo(self):
        """Carga modelo guardado desde disco."""
        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, "rb") as f:
                    data = pickle.load(f)
                    self.model = data.get("model")
                    self.metrics = data.get("metrics", self.metrics)
                print(f"  [PROPHET] Modelo cargado: AUC={self.metrics.get('auc', 0):.4f}, "
                      f"{self.metrics.get('n_bars', 0)} barras de entrenamiento")
            except Exception as e:
                print(f"  [PROPHET] Error cargando modelo: {e}")

    def _guardar_modelo(self):
        """Guarda modelo entrenado a disco."""
        data = {
            "model": self.model,
            "metrics": self.metrics,
            "features": self.features,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(self.model_path, "wb") as f:
            pickle.dump(data, f)
        print(f"  [PROPHET] Modelo guardado: {self.model_path}")

    # ------------------------------------------------------------------
    # COMPUTACIÓN DE FEATURES
    # ------------------------------------------------------------------

    def preparar_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Computa features de series de tiempo para PROPHET.

        Args:
            df: DataFrame con columnas open, high, low, close, volume

        Returns:
            DataFrame con features + target (si hay suficientes datos)
        """
        df = df.copy()  # Copia para no mutar el original
        close = df['close']
        volume = df['volume']

        # Retornos
        ret = close.pct_change()

        # Lags
        for lag in [1, 2, 3, 5, 8]:
            df[f'ret_lag_{lag}'] = ret.shift(lag)

        # Momentum
        for p in [3, 5, 8]:
            df[f'mom_{p}'] = close.pct_change(p)

        # Volatilidad rolling
        for p in [5, 8, 20]:
            df[f'vol_{p}'] = ret.rolling(p).std()

        # RSI
        for p in [7, 14]:
            delta = ret
            gain = delta.clip(lower=0).rolling(p).mean()
            loss = (-delta.clip(upper=0)).rolling(p).mean()
            df[f'rsi_{p}'] = 100 - (100 / (1 + gain / (loss + 1e-6)))

        # Bollinger Bands
        sma20 = close.rolling(20).mean()
        std20 = close.rolling(20).std()
        df['bb_dist'] = (close - sma20) / (std20 + 1e-6)
        df['bb_width'] = (sma20 + 2*std20 - (sma20 - 2*std20)) / sma20

        # MACD
        ema12 = close.ewm(span=12).mean()
        ema26 = close.ewm(span=26).mean()
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9).mean()
        df['macd_hist'] = df['macd'] - df['macd_signal']

        # Volumen relativo
        df['vol_ratio'] = volume / (volume.rolling(20).mean() + 1e-6)

        # Estacionalidad intradía
        if hasattr(df.index, 'hour'):
            hours = df.index.hour
        else:
            hours = 12
        df['hour_sin'] = np.sin(2 * np.pi * hours / 24)
        df['hour_cos'] = np.cos(2 * np.pi * hours / 24)

        # Target: dirección del precio en próximas FWD_BARS barras
        fwd_ret = close.shift(-FWD_BARS) / close - 1
        df['target'] = (fwd_ret > 0).astype(int)

        # Rellenar NaN
        for feat in self.features:
            if feat not in df.columns:
                df[feat] = 0.0

        return df.dropna()

    # ------------------------------------------------------------------
    # ENTRENAMIENTO
    # ------------------------------------------------------------------

    def entrenar(self, df: pd.DataFrame) -> Dict:
        """
        Entrena el modelo LightGBM para predicción de dirección.

        Args:
            df: DataFrame con OHLCV (open, high, low, close, volume)

        Returns:
            Dict con métricas de entrenamiento
        """
        print("\n[PROPHET] Entrenando modelo de prediccion...")

        # Preparar features
        df_feat = self.preparar_features(df)
        if len(df_feat) < MIN_TRAIN_BARS:
            print(f"  [PROPHET] Datos insuficientes: {len(df_feat)} < {MIN_TRAIN_BARS}")
            return {"error": "Datos insuficientes"}

        # Split train/val (80/20)
        split = int(len(df_feat) * 0.8)
        X = df_feat[self.features]
        y = df_feat['target']

        X_train, X_val = X.iloc[:split], X.iloc[split:]
        y_train, y_val = y.iloc[:split], y.iloc[split:]

        print(f"  [PROPHET] Train: {len(X_train)} | Val: {len(X_val)} | Features: {len(self.features)}")

        # Balanceo de clases
        n_pos = y_train.sum()
        n_neg = len(y_train) - n_pos
        scale_pos_weight = n_neg / max(n_pos, 1)
        print(f"  [PROPHET] Clases: {n_pos} UP / {n_neg} DOWN (scale: {scale_pos_weight:.2f})")

        # Entrenar LightGBM (solo scale_pos_weight, sin class_weight para evitar doble balanceo)
        self.model = lgb.LGBMClassifier(
            n_estimators=N_ESTIMATORS,
            learning_rate=0.05,
            num_leaves=31,
            scale_pos_weight=scale_pos_weight,
            verbose=-1,
            random_state=42,
        )
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(50, verbose=False)],
        )

        # Evaluar
        y_pred = self.model.predict_proba(X_val)[:, 1]
        y_class = (y_pred > 0.5).astype(int)

        from sklearn.metrics import roc_auc_score, accuracy_score
        auc = roc_auc_score(y_val, y_pred)
        acc = accuracy_score(y_val, y_class)

        # Importancia de features
        importancia = pd.DataFrame({
            'feature': self.features,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False)

        self.metrics = {
            "auc": round(auc, 4),
            "acc": round(acc, 4),
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "n_bars": len(df_feat),
            "n_train": len(X_train),
            "n_val": len(X_val),
            "n_pos": int(n_pos),
            "n_neg": int(n_neg),
            "scale_pos_weight": round(scale_pos_weight, 2),
        }

        # Guardar modelo
        self._guardar_modelo()

        # Mostrar resultados
        print(f"\n  [PROPHET] Resultados:")
        print(f"  AUC: {auc:.4f} | Accuracy: {acc:.2%}")
        print(f"  Mejores features:")
        for _, row in importancia.head(5).iterrows():
            print(f"    {row['feature']:20s} -> {row['importance']:.0f}")

        return self.metrics

    # ------------------------------------------------------------------
    # PREDICCIÓN
    # ------------------------------------------------------------------

    def predecir(self, df: pd.DataFrame) -> Optional[Dict]:
        """
        Predice la dirección del precio para la próxima ventana.

        Args:
            df: DataFrame con OHLCV reciente (suficientes barras para features)

        Returns:
            Dict con predicción: prob_up, prob_down, dirección, confianza
        """
        if self.model is None:
            print("  [PROPHET] Modelo no entrenado")
            return None

        # Preparar features
        df_feat = self.preparar_features(df)
        if len(df_feat) < 50:
            print(f"  [PROPHET] Datos insuficientes: {len(df_feat)}")
            return None

        # Usar la última fila para predicción
        X_last = df_feat[self.features].iloc[-1:]

        if X_last.isna().any().any():
            print("  [PROPHET] NaN en features de predicción")
            return None

        # Predecir
        prob_up = float(self.model.predict_proba(X_last)[0, 1])
        prob_down = 1.0 - prob_up

        # Determinar dirección y confianza
        if prob_up > 0.55:
            direccion = "LONG"
            confianza = prob_up
        elif prob_down > 0.55:
            direccion = "SHORT"
            confianza = prob_down
        else:
            direccion = None
            confianza = max(prob_up, prob_down)

        resultado = {
            "prob_up": round(prob_up, 4),
            "prob_down": round(prob_down, 4),
            "direction": direccion,
            "confidence": round(confianza, 4),
            "model_auc": self.metrics.get("auc", 0),
            "predicted_at": datetime.now(timezone.utc).isoformat(),
        }

        return resultado

    # ------------------------------------------------------------------
    # ESTADO
    # ------------------------------------------------------------------

    def status(self) -> Dict:
        """Retorna estado del agente PROPHET."""
        return {
            "modelo_entrenado": self.model is not None,
            "model_path": self.model_path,
            "features": len(self.features),
            "metrics": self.metrics,
            "peso_combinacion": {"prophet": PESO_PROPHET, "ob": PESO_OB},
        }

    def print_status(self):
        """Imprime estado en consola."""
        s = self.status()
        m = s['metrics']
        print("\n" + "=" * 65)
        print("  [PROPHET] Estado del Motor de Prediccion")
        print("=" * 65)
        print(f"  Modelo:      {'ENTRENADO' if s['modelo_entrenado'] else 'SIN ENTRENAR'}")
        if s['modelo_entrenado']:
            print(f"  AUC:         {m.get('auc', 0):.4f}")
            print(f"  Accuracy:    {m.get('acc', 0):.2%}")
            print(f"  Train data:  {m.get('n_train', 0)} velas")
            print(f"  Clases:      {m.get('n_pos', 0)} UP / {m.get('n_neg', 0)} DOWN")
            print(f"  Entrenado:   {m.get('trained_at', 'never')}")
        print(f"  Features:    {s['features']}")
        print(f"  Peso combo:  PROPHET {PESO_PROPHET:.0%} + OB {PESO_OB:.0%}")
        print(f"  Model path:  {s['model_path']}")
        print("=" * 65)


# =============================================================================
# FUNCIÓN DE COMBINACIÓN: OB + PROPHET
# =============================================================================

def combinar_senales(senal_ob: Dict, prediccion_prophet: Dict) -> Dict:
    """
    Combina la señal del OB System con la predicción de PROPHET.

    La combinación es ponderada: 65% OB + 35% PROPHET.
    Si PROPHET no tiene predicción, se usa solo OB.

    Args:
        senal_ob: Señal del generador OB
        prediccion_prophet: Predicción de PROPHET

    Returns:
        Dict: Señal combinada con confianza ajustada
    """
    if prediccion_prophet is None:
        senal_ob["prophet"] = {"active": False, "reason": "Sin prediccion PROPHET"}
        return senal_ob

    signal_ob = senal_ob.get("signal", {})
    analysis_ob = senal_ob.get("analysis", {})

    prob_ob = analysis_ob.get("ob_probability", 0)
    prob_prophet = prediccion_prophet.get("confidence", 0)

    # Combinación ponderada
    prob_combinada = PESO_OB * prob_ob + PESO_PROPHET * prob_prophet

    # Dirección: si OB y PROPHET coinciden, mayor confianza
    dir_ob = signal_ob.get("direction")
    dir_prophet = prediccion_prophet.get("direction")

    if dir_ob and dir_prophet and dir_ob == dir_prophet:
        # Coincidencia: boost significativo
        prob_combinada = min(prob_combinada * 1.25, 0.95)
        consenso = "CONSENSO"
        ajuste = "BOOST"
    elif dir_ob and dir_prophet and dir_ob != dir_prophet:
        # Conflicto: reducir confianza
        prob_combinada = prob_combinada * 0.7
        consenso = "CONFLICTO"
        ajuste = "PENALTY"
    elif dir_ob and not dir_prophet:
        # Solo OB tiene señal
        consenso = "SOLO_OB"
        ajuste = "SIN_CAMBIO"
    else:
        consenso = "SIN_SEÑAL"
        ajuste = "NINGUNO"

    # Actualizar señal
    signal_ob["prophet_confidence"] = prediccion_prophet.get("confidence", 0)
    signal_ob["combined_confidence"] = round(prob_combinada, 4)
    signal_ob["consensus"] = consenso

    # Si la combinada supera el umbral, mantener/actualizar dirección
    UMBRAL_COMBINADO = 0.35  # Mismo threshold que generador_senales.py (evita import circular)
    if prob_combinada >= UMBRAL_COMBINADO and not signal_ob.get("direction"):
        # PROPHET puede dar dirección incluso si OB no
        signal_ob["direction"] = prediccion_prophet.get("direction")
        signal_ob["type"] = "PROPHET_ENTRY"

    # Agregar metadata de PROPHET
    senal_ob["prophet"] = {
        "active": True,
        "prob_up": prediccion_prophet.get("prob_up", 0),
        "prob_down": prediccion_prophet.get("prob_down", 0),
        "direction": prediccion_prophet.get("direction"),
        "confidence": prediccion_prophet.get("confidence", 0),
        "model_auc": prediccion_prophet.get("model_auc", 0),
        "consenso": consenso,
        "ajuste": ajuste,
    }

    return senal_ob


def predecir_y_combinar(senal_path: str = None) -> Dict:
    """
    Lee la señal actual, ejecuta PROPHET, combina, y guarda.

    Uso: python -m models.prophet_agent predict
    """
    if senal_path is None:
        senal_path = os.path.join(SIGNALS_DIR, "latest_signals.json")

    if not os.path.exists(senal_path):
        print("  [PROPHET] No hay señal para combinar")
        return {}

    # Cargar datos BTC
    data_path = os.path.join(PROJECT_ROOT, "data", "BTCUSDT_15m_4y.csv")
    if not os.path.exists(data_path):
        print("  [PROPHET] No hay datos para predecir")
        return {}

    df = pd.read_csv(data_path)
    if 'time' in df.columns:
        df['timestamp'] = pd.to_datetime(df['time'], unit='ms')
    df = df.set_index('timestamp').sort_index()
    df = df[['open', 'high', 'low', 'close', 'volume']].astype(float)

    # PROPHET prediction
    prophet = ProphetAgent()
    if prophet.model is None:
        # Entrenar primero
        print("  [PROPHET] Modelo no entrenado. Entrenando...")
        prophet.entrenar(df)
        if prophet.model is None:
            print("  [PROPHET] Error al entrenar modelo")
            return {}

    prediccion = prophet.predecir(df)

    # Cargar señal OB
    with open(senal_path, "r", encoding="utf-8") as f:
        senal_ob = json.load(f)

    # Combinar
    senal_combinada = combinar_senales(senal_ob, prediccion)

    # Guardar
    with open(senal_path, "w", encoding="utf-8") as f:
        json.dump(senal_combinada, f, indent=2, ensure_ascii=False, default=str)

    # Mostrar resultado
    sig = senal_combinada.get("signal", {})
    pr = senal_combinada.get("prophet", {})
    analysis = senal_combinada.get("analysis", {})

    print(f"\n  [PROPHET] Prediccion combinada:")
    print(f"  OB prob:      {analysis.get('ob_probability', 0):.2%}")
    print(f"  PROPHET prob: {pr.get('confidence', 0):.2%} ({pr.get('direction', 'N/A')})")
    print(f"  Combinada:    {sig.get('combined_confidence', 0):.2%}")
    print(f"  Direction:    {sig.get('direction', 'SIN SEÑAL')}")
    print(f"  Consenso:     {pr.get('consenso', 'N/A')}")
    print(f"  Ajuste:       {pr.get('ajuste', 'N/A')}")
    print(f"  Guardado:     {senal_path}")

    return senal_combinada


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="PROPHET - Motor de Prediccion de Precios"
    )
    parser.add_argument(
        "action",
        choices=["train", "predict", "status"],
        nargs="?",
        default="status",
        help="Accion a ejecutar"
    )
    args = parser.parse_args()

    if args.action == "train":
        # Cargar datos BTC
        data_path = os.path.join(PROJECT_ROOT, "data", "BTCUSDT_15m_4y.csv")
        if not os.path.exists(data_path):
            print(f"  [ERROR] No se encuentra: {data_path}")
            return

        print(f"Cargando {data_path}...")
        df = pd.read_csv(data_path)
        if 'time' in df.columns:
            df['timestamp'] = pd.to_datetime(df['time'], unit='ms')
        df = df.set_index('timestamp').sort_index()
        df = df[['open', 'high', 'low', 'close', 'volume']].astype(float)
        print(f"{len(df)} velas cargadas")

        prophet = ProphetAgent()
        prophet.entrenar(df)

    elif args.action == "predict":
        predecir_y_combinar()

    elif args.action == "status":
        prophet = ProphetAgent()
        prophet.print_status()


if __name__ == "__main__":
    main()
