"""
Unit tests for OpsLens explainability and calibrated severity scoring.
"""
from pathlib import Path
import sys
import pytest

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from explain import calibrate_severity, compute_metric_contributions, SEVERITY_LEVELS
from predict import run_multivariate_prediction


def test_severity_levels_defined():
    """Verify standard severity levels."""
    assert SEVERITY_LEVELS == ["Normal", "Low", "Medium", "High", "Critical"]


def test_calibrate_severity_all_normal():
    """Verify all inliers are classified as Normal."""
    scores = [-0.15, -0.05, -0.22, 0.0]
    anomalies = [False, False, False, False]
    severities = calibrate_severity(scores, anomalies)
    assert severities == ["Normal", "Normal", "Normal", "Normal"]


def test_calibrate_severity_quantiles():
    """Verify that multiple anomalies are ranked across Low, Medium, High, and Critical."""
    # 6 anomalies with increasing scores
    scores = [-0.1, 0.02, 0.06, 0.12, 0.20, 0.35]
    anomalies = [False, True, True, True, True, True]

    severities = calibrate_severity(scores, anomalies)
    assert severities[0] == "Normal"
    # The lowest positive score should be Low, the highest should be Critical
    assert severities[1] == "Low"
    assert severities[-1] == "Critical"
    assert all(s in SEVERITY_LEVELS for s in severities)


def test_calibrate_severity_small_sample():
    """Verify distance thresholds for small numbers of anomalies."""
    scores = [-0.1, 0.03, 0.25]
    anomalies = [False, True, True]

    severities = calibrate_severity(scores, anomalies)
    assert severities[0] == "Normal"
    assert severities[1] == "Low"        # 0.03 <= 0.05
    assert severities[2] == "Critical"   # 0.25 > 0.22


def test_compute_metric_contributions_identifies_root_cause():
    """
    Verify that heuristic attribution identifies the heavily deviating metric
    when an alert is raised.
    """
    observations = [
        # Normal observations (baseline)
        {"metrics": {"cpu": 30.0, "latency": 100.0, "errors": 0.01}},
        {"metrics": {"cpu": 32.0, "latency": 105.0, "errors": 0.012}},
        {"metrics": {"cpu": 31.0, "latency": 98.0, "errors": 0.009}},
        {"metrics": {"cpu": 29.5, "latency": 102.0, "errors": 0.010}},
        {"metrics": {"cpu": 30.5, "latency": 101.0, "errors": 0.011}},
        # Anomalous observation: massive latency spike (15x baseline)
        {"metrics": {"cpu": 34.0, "latency": 1500.0, "errors": 0.011}},
    ]
    anomalies = [False, False, False, False, False, True]

    contributions = compute_metric_contributions(observations, anomalies)

    # First 5 (normal) observations have no contributing metrics
    for i in range(5):
        assert contributions[i] == []

    # 6th observation should have latency as top contributor
    anom_contrib = contributions[5]
    assert len(anom_contrib) == 3
    top_metric = anom_contrib[0]
    assert top_metric["metric"] == "latency"
    assert top_metric["deviation_zscore"] > 1.5
    assert top_metric["contribution_pct"] > 60.0


def test_multivariate_prediction_returns_severity_breakdown():
    """Verify that run_multivariate_prediction returns severity information."""
    import pandas as pd

    timestamps = pd.date_range("2024-01-01", periods=25, freq="1h", tz="UTC")
    observations = [
        {"timestamp": ts.isoformat(), "metrics": {"cpu": 40.0, "latency": 100.0}}
        for ts in timestamps
    ]
    # Inject one spike
    observations[15]["metrics"]["latency"] = 1000.0
    observations[15]["metrics"]["cpu"] = 95.0

    result = run_multivariate_prediction({
        "model_id": "isolation_forest_multivariate",
        "observations": observations,
    })

    assert "severity_breakdown" in result
    breakdown = result["severity_breakdown"]
    assert "Normal" in breakdown
    assert "Critical" in breakdown or "High" in breakdown
    assert breakdown["Normal"] > 0

    spike_pred = result["predictions"][15]
    if spike_pred["anomaly"]:
        assert spike_pred["severity"] in ["Medium", "High", "Critical"]
        assert "contributing_metrics" in spike_pred
        assert len(spike_pred["contributing_metrics"]) > 0
