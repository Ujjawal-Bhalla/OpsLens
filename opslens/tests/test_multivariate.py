"""
Unit and integration tests for OpsLens multivariate anomaly detection and variable feature handling.
"""
from pathlib import Path
import sys
import numpy as np
import pandas as pd
import pytest

# Ensure project root and backend are in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from features import make_multivariate_features
from predict import (
    normalize_observations,
    run_multivariate_prediction,
    run_prediction,
)


def test_make_multivariate_features_shape_and_names():
    """Verify feature matrix dimensions and column naming for 3 metrics."""
    n = 40
    timestamps = pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC")
    metrics_df = pd.DataFrame({
        "cpu_percent": np.random.RandomState(42).normal(45, 5, n),
        "memory_percent": np.random.RandomState(43).normal(60, 3, n),
        "latency_ms": np.random.RandomState(44).normal(120, 15, n),
    })

    features, feature_names, imputed = make_multivariate_features(
        metrics_df=metrics_df,
        timestamps=timestamps,
        rolling_window=10,
    )

    # 3 metrics * 6 features per metric + 2 cyclical features (hour_sin, hour_cos) = 20
    assert features.shape == (n, 20)
    assert len(feature_names) == 20
    assert imputed == []
    assert not features.isna().any().any(), "Multivariate features contain NaNs"
    assert np.isfinite(features.to_numpy()).all(), "Multivariate features contain infinite values"


def test_make_multivariate_features_imputation():
    """Verify missing expected metrics are cleanly imputed with reference values."""
    n = 30
    timestamps = pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC")
    metrics_df = pd.DataFrame({
        "cpu": [30.0] * n,
        "memory": [50.0] * n,
    })

    expected = ["cpu", "memory", "latency_ms"]
    reference_stats = {
        "latency_ms": {"mean": 100.0, "std": 10.0},
    }

    features, feature_names, imputed = make_multivariate_features(
        metrics_df=metrics_df,
        timestamps=timestamps,
        reference_stats=reference_stats,
        expected_metrics=expected,
    )

    assert "latency_ms" in imputed
    assert "latency_ms_norm" in feature_names
    assert features.shape[0] == n
    assert not features.isna().any().any()


def test_normalize_observations_multivariate():
    """Verify normalize_observations parses nested metrics and flat metrics formats."""
    # Nested format
    nested = [
        {
            "timestamp": "2024-01-01T00:00:00Z",
            "metrics": {"cpu": 25.0, "latency": 80.0},
        }
    ]
    norm_nested = normalize_observations(nested, "observations")
    assert len(norm_nested) == 1
    assert norm_nested[0]["metrics"] == {"cpu": 25.0, "latency": 80.0}

    # Flat format
    flat = [
        {
            "timestamp": "2024-01-01T00:00:00Z",
            "cpu": 35.0,
            "latency": 95.0,
        }
    ]
    norm_flat = normalize_observations(flat, "observations")
    assert len(norm_flat) == 1
    assert norm_flat[0]["metrics"]["cpu"] == 35.0
    assert norm_flat[0]["metrics"]["latency"] == 95.0


def test_multivariate_prediction_coordinated_anomaly():
    """
    Verify detection of a coordinated multi-metric anomaly (server failure scenario).
    High latency + high error rate at the same time is detected as anomalous.
    """
    rng = np.random.RandomState(42)
    n = 80
    timestamps = pd.date_range("2024-01-01", periods=n, freq="10min", tz="UTC")

    observations = []
    for i in range(n):
        ts = timestamps[i].isoformat()
        if i == 50:
            # Coordinated spike: severe latency spike and error rate jump
            observations.append({
                "timestamp": ts,
                "metrics": {
                    "latency_ms": 1200.0,  # normal is ~100ms
                    "error_rate": 0.45,     # normal is ~0.01
                    "cpu_percent": 88.0,    # normal is ~40%
                },
            })
        else:
            observations.append({
                "timestamp": ts,
                "metrics": {
                    "latency_ms": float(rng.normal(100.0, 10.0)),
                    "error_rate": float(max(0.0, rng.normal(0.01, 0.003))),
                    "cpu_percent": float(rng.normal(40.0, 5.0)),
                },
            })

    request = {
        "model_id": "isolation_forest_multivariate",
        "observations": observations,
    }

    result = run_multivariate_prediction(request, contamination=0.05)

    assert result["success"] is True
    assert result["detection_mode"] == "multivariate"
    assert result["metric_names"] == ["cpu_percent", "error_rate", "latency_ms"]

    # Target spike observation (index 50) must be detected as an anomaly
    target_pred = result["predictions"][50]
    assert target_pred["anomaly"] is True
    assert target_pred["anomaly_score"] > 0
    assert target_pred["decision_function"] < 0

    # Overall anomaly percentage should be close to contamination (< 20%)
    anomaly_rate = result["anomaly_count"] / result["count"]
    assert anomaly_rate < 0.20, f"False positive rate too high: {anomaly_rate * 100:.1f}%"


def test_multivariate_end_to_end_via_run_prediction():
    """Verify routing through main run_prediction entrypoint."""
    timestamps = pd.date_range("2024-01-01", periods=30, freq="15min", tz="UTC")
    observations = [
        {
            "timestamp": ts.isoformat(),
            "metrics": {"response_time": 150.0 + i, "rps": 200.0 - i},
        }
        for i, ts in enumerate(timestamps)
    ]

    request = {
        "model_id": "isolation_forest_multivariate",
        "observations": observations,
    }

    result = run_prediction(request, artifacts_dir=PROJECT_ROOT / "artifacts")

    assert result["success"] is True
    assert result["detection_mode"] == "multivariate"
    assert "response_time" in result["metric_names"]
    assert "rps" in result["metric_names"]
    assert len(result["predictions"]) == 30
    assert "metrics" in result["predictions"][0]
