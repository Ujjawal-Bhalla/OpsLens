"""Shared, leakage-conscious feature engineering for OpsLens."""
from __future__ import annotations
import numpy as np
import pandas as pd

FEATURE_NAMES = [
    "value_normalized", "rolling_mean", "rolling_std",
    "deviation_from_rolling_mean", "relative_deviation", "delta",
    "hour_sin", "hour_cos",
]

def make_features(values, timestamps, reference_mean, reference_std, rolling_window=30):
    """Build causal features using training-only normalization parameters."""
    vals = pd.Series(pd.to_numeric(pd.Series(values), errors="coerce"), dtype="float64")
    vals = vals.replace([np.inf, -np.inf], np.nan).ffill().bfill().fillna(reference_mean)
    std = float(reference_std) if np.isfinite(reference_std) and reference_std > 1e-12 else 1.0
    normalized = (vals - float(reference_mean)) / std
    window = max(2, int(rolling_window))
    min_periods = min(5, window)
    roll_mean = normalized.rolling(window=window, min_periods=min_periods).mean()
    roll_std = normalized.rolling(window=window, min_periods=min_periods).std(ddof=0)
    roll_mean = roll_mean.fillna(normalized.expanding(min_periods=1).mean())
    roll_std = roll_std.fillna(0.0)
    deviation = normalized - roll_mean
    relative = deviation / (roll_std.abs() + 1e-6)
    delta = normalized.diff().fillna(0.0)
    ts = pd.to_datetime(pd.Series(timestamps), errors="coerce", utc=True)
    hour = ts.dt.hour.fillna(0).astype(float) + ts.dt.minute.fillna(0).astype(float) / 60.0
    angle = 2.0 * np.pi * hour / 24.0
    return pd.DataFrame({
        "value_normalized": normalized,
        "rolling_mean": roll_mean,
        "rolling_std": roll_std,
        "deviation_from_rolling_mean": deviation,
        "relative_deviation": relative,
        "delta": delta,
        "hour_sin": np.sin(angle),
        "hour_cos": np.cos(angle),
    })[FEATURE_NAMES].replace([np.inf, -np.inf], 0.0).fillna(0.0)
