"""Shared, leakage-conscious feature engineering for OpsLens (univariate & multivariate)."""
from __future__ import annotations
import numpy as np
import pandas as pd

FEATURE_NAMES = [
    "value_normalized", "rolling_mean", "rolling_std",
    "deviation_from_rolling_mean", "relative_deviation", "delta",
    "hour_sin", "hour_cos",
]


def make_features(values, timestamps, reference_mean, reference_std, rolling_window=30):
    """Build causal features using training-only normalization parameters (univariate)."""
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


def make_multivariate_features(
    metrics_df: pd.DataFrame,
    timestamps: pd.Series | list,
    reference_stats: dict[str, dict[str, float]] | None = None,
    rolling_window: int = 30,
    expected_metrics: list[str] | None = None,
) -> tuple[pd.DataFrame, list[str], list[str]]:
    """
    Build causal features for multiple metrics with variable feature support.

    Parameters:
    -----------
    metrics_df: DataFrame where each column is a metric.
    timestamps: Datetime series or list of ISO timestamps.
    reference_stats: Optional dict of {metric_name: {'mean': float, 'std': float}}.
    rolling_window: Rolling window size.
    expected_metrics: Expected metric column names. Missing expected metrics will be imputed.

    Returns:
    --------
    tuple of:
      - features_df: DataFrame of engineered causal features
      - feature_names: list of all feature column names
      - imputed_metrics: list of metric names that were missing and imputed
    """
    df = metrics_df.copy()
    reference_stats = reference_stats or {}
    imputed_metrics = []

    # Handle expected metrics if provided
    if expected_metrics:
        for metric in expected_metrics:
            if metric not in df.columns:
                # Impute missing metric with reference mean or 0.0
                ref_mean = reference_stats.get(metric, {}).get("mean", 0.0)
                df[metric] = ref_mean
                imputed_metrics.append(metric)

    metric_cols = sorted(list(df.columns))
    if not metric_cols:
        raise ValueError("Cannot engineer multivariate features from an empty metric set.")

    window = max(2, int(rolling_window))
    min_periods = min(5, window)
    feature_dict: dict[str, pd.Series] = {}

    for col in metric_cols:
        raw_series = pd.to_numeric(df[col], errors="coerce").astype(float)
        ref_mean = reference_stats.get(col, {}).get("mean")
        if ref_mean is None:
            # Fallback to series mean (avoiding in-sample contamination where possible)
            valid = raw_series.replace([np.inf, -np.inf], np.nan).dropna()
            ref_mean = float(valid.mean()) if len(valid) > 0 else 0.0

        ref_std = reference_stats.get(col, {}).get("std")
        if ref_std is None or not np.isfinite(ref_std) or ref_std < 1e-12:
            valid = raw_series.replace([np.inf, -np.inf], np.nan).dropna()
            ref_std = float(valid.std(ddof=0)) if len(valid) > 0 else 1.0
            if not np.isfinite(ref_std) or ref_std < 1e-12:
                ref_std = 1.0

        clean_vals = raw_series.replace([np.inf, -np.inf], np.nan).ffill().bfill().fillna(ref_mean)
        normalized = (clean_vals - float(ref_mean)) / float(ref_std)

        roll_mean = normalized.rolling(window=window, min_periods=min_periods).mean()
        roll_std = normalized.rolling(window=window, min_periods=min_periods).std(ddof=0)
        roll_mean = roll_mean.fillna(normalized.expanding(min_periods=1).mean())
        roll_std = roll_std.fillna(0.0)

        deviation = normalized - roll_mean
        relative_dev = deviation / (roll_std.abs() + 1e-6)
        delta = normalized.diff().fillna(0.0)

        feature_dict[f"{col}_norm"] = normalized
        feature_dict[f"{col}_roll_mean"] = roll_mean
        feature_dict[f"{col}_roll_std"] = roll_std
        feature_dict[f"{col}_dev"] = deviation
        feature_dict[f"{col}_rel_dev"] = relative_dev
        feature_dict[f"{col}_delta"] = delta

    # Cyclical hour-of-day features
    ts = pd.to_datetime(pd.Series(timestamps), errors="coerce", utc=True)
    hour = ts.dt.hour.fillna(0).astype(float) + ts.dt.minute.fillna(0).astype(float) / 60.0
    angle = 2.0 * np.pi * hour / 24.0
    feature_dict["hour_sin"] = np.sin(angle)
    feature_dict["hour_cos"] = np.cos(angle)

    features_df = pd.DataFrame(feature_dict).replace([np.inf, -np.inf], 0.0).fillna(0.0)
    feature_names = list(features_df.columns)

    return features_df, feature_names, imputed_metrics
