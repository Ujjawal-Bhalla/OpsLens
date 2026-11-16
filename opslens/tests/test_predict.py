"""
Unit and regression tests for OpsLens prediction and feature engineering.
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from features import make_features, FEATURE_NAMES
from predict import normalize_observations


def test_feature_names_consistent():
    """Verify FEATURE_NAMES matches expected 8 temporal/contextual features."""
    expected = [
        "value_normalized", "rolling_mean", "rolling_std",
        "deviation_from_rolling_mean", "relative_deviation", "delta",
        "hour_sin", "hour_cos",
    ]
    assert FEATURE_NAMES == expected
    assert len(FEATURE_NAMES) == 8


def test_make_features_shape():
    """Verify feature matrix dimensions and lack of NaNs/Infs."""
    n = 50
    timestamps = pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC")
    values = np.sin(np.linspace(0, 10, n)) * 20.0 + 50.0

    features = make_features(
        values=values,
        timestamps=timestamps,
        reference_mean=50.0,
        reference_std=14.0,
        rolling_window=10,
    )

    assert features.shape == (n, 8)
    assert list(features.columns) == FEATURE_NAMES
    assert not features.isna().any().any(), "Features contain NaNs"
    assert np.isfinite(features.to_numpy()).all(), "Features contain infinite values"


def test_make_features_no_leakage():
    """Verify that features at index i do not depend on values at index > i (causal)."""
    n = 40
    timestamps = pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC")
    base_values = np.random.RandomState(42).normal(50, 5, n)

    f1 = make_features(base_values, timestamps, 50.0, 5.0, rolling_window=10)

    # Modify future values (indices 25 to 39)
    modified_values = base_values.copy()
    modified_values[25:] += 100.0

    f2 = make_features(modified_values, timestamps, 50.0, 5.0, rolling_window=10)

    # Past rows (0 to 24) must remain strictly identical
    np.testing.assert_allclose(
        f1.iloc[:25].to_numpy(),
        f2.iloc[:25].to_numpy(),
        rtol=1e-7,
        atol=1e-7,
        err_msg="Data leakage detected: past feature values changed when future values were altered.",
    )


def test_score_direction():
    """Verify score direction convention: decision_function < 0 => anomaly (anomaly_score > 0)."""
    # In scikit-learn IsolationForest:
    # decision_function > 0 is inlier (normal)
    # decision_function < 0 is outlier (anomaly)
    # predict() returns 1 for inlier, -1 for outlier

    # Synthetic predictions mapping matching predict.py
    labels = np.array([1, -1, 1, -1])
    decisions = np.array([0.15, -0.08, 0.02, -0.25])
    scores = -decisions

    for label, dec, score in zip(labels, decisions, scores):
        is_anomaly = bool(label == -1)
        if is_anomaly:
            assert dec < 0, "Anomaly must have negative decision_function"
            assert score > 0, "Anomaly must have positive anomaly_score"
        else:
            assert dec > 0, "Normal observation must have positive decision_function"
            assert score < 0, "Normal observation must have negative anomaly_score"


def test_normal_data_low_anomaly_rate():
    """Verify that normal data drawn from the training distribution produces a low anomaly rate (< 25%)."""
    rng = np.random.RandomState(42)
    n_train = 200
    n_test = 100

    train_ts = pd.date_range("2024-01-01", periods=n_train, freq="1h", tz="UTC")
    test_ts = pd.date_range("2024-01-09 08:00:00", periods=n_test, freq="1h", tz="UTC")

    train_vals = rng.normal(50, 5, n_train)
    test_vals = rng.normal(50, 5, n_test)

    ref_mean = float(np.mean(train_vals))
    ref_std = float(np.std(train_vals))

    train_feat = make_features(train_vals, train_ts, ref_mean, ref_std, rolling_window=20)
    test_feat = make_features(test_vals, test_ts, ref_mean, ref_std, rolling_window=20)

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(train_feat.to_numpy())
    x_test_scaled = scaler.transform(test_feat.to_numpy())

    model = IsolationForest(contamination=0.05, n_estimators=100, random_state=42)
    model.fit(x_train_scaled)

    preds = model.predict(x_test_scaled)
    anomalies = (preds == -1).sum()
    anomaly_rate = anomalies / n_test

    assert anomaly_rate < 0.25, f"Anomaly rate too high for normal data: {anomaly_rate * 100:.1f}%"


def test_spike_is_detected():
    """Verify that a prominent 15-sigma spike is detected as an anomaly."""
    rng = np.random.RandomState(42)
    n_train = 200
    train_ts = pd.date_range("2024-01-01", periods=n_train, freq="1h", tz="UTC")
    train_vals = rng.normal(50, 5, n_train)

    ref_mean = float(np.mean(train_vals))
    ref_std = float(np.std(train_vals))

    train_feat = make_features(train_vals, train_ts, ref_mean, ref_std, rolling_window=20)
    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(train_feat.to_numpy())

    model = IsolationForest(contamination=0.05, n_estimators=100, random_state=42)
    model.fit(x_train_scaled)

    # Test set: 20 points, where index 10 is an extreme spike (15 sigma)
    test_ts = pd.date_range("2024-01-09 08:00:00", periods=20, freq="1h", tz="UTC")
    test_vals = rng.normal(50, 5, 20)
    spike_idx = 10
    test_vals[spike_idx] = 50.0 + 15 * 5.0  # 125.0

    test_feat = make_features(test_vals, test_ts, ref_mean, ref_std, rolling_window=20)
    x_test_scaled = scaler.transform(test_feat.to_numpy())

    preds = model.predict(x_test_scaled)
    decisions = model.decision_function(x_test_scaled)

    assert preds[spike_idx] == -1, "The extreme spike was not detected as an anomaly!"
    assert decisions[spike_idx] < 0, "Spike must have negative decision_function"
    assert -decisions[spike_idx] > 0, "Spike must have positive anomaly_score"


def test_normalize_observations_rejects_bad_input():
    """Verify that malformed observations raise clear ValueErrors."""
    # Non-list
    with pytest.raises(ValueError, match="must be a JSON array"):
        normalize_observations("not-a-list", "observations")

    # Missing timestamp
    with pytest.raises(ValueError, match="must contain timestamp and value"):
        normalize_observations([{"value": 10.0}], "observations")

    # Missing value
    with pytest.raises(ValueError, match="must contain timestamp and value"):
        normalize_observations([{"timestamp": "2024-01-01T00:00:00Z"}], "observations")

    # Non-numeric value
    with pytest.raises(ValueError, match="must be numeric"):
        normalize_observations([{"timestamp": "2024-01-01T00:00:00Z", "value": "abc"}], "observations")

    # Infinite value
    with pytest.raises(ValueError, match="must be finite"):
        normalize_observations([{"timestamp": "2024-01-01T00:00:00Z", "value": float("inf")}], "observations")

    # Unparseable timestamp
    with pytest.raises(ValueError, match="not parseable"):
        normalize_observations([{"timestamp": "invalid-timestamp", "value": 10.0}], "observations")


def test_anomaly_percentage_regression():
    """
    Regression guard for the '100% of observations classified as anomalies' symptom.
    Asserts that normal test observations do NOT result in 100% anomaly count.
    """
    rng = np.random.RandomState(42)
    n_train = 300
    n_test = 50

    train_ts = pd.date_range("2024-01-01", periods=n_train, freq="1h", tz="UTC")
    test_ts = pd.date_range("2024-01-13 12:00:00", periods=n_test, freq="1h", tz="UTC")

    train_vals = rng.normal(100, 10, n_train)
    test_vals = rng.normal(100, 10, n_test)

    ref_mean = float(np.mean(train_vals))
    ref_std = float(np.std(train_vals))

    train_feat = make_features(train_vals, train_ts, ref_mean, ref_std, rolling_window=30)
    test_feat = make_features(test_vals, test_ts, ref_mean, ref_std, rolling_window=30)

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(train_feat.to_numpy())
    x_test_scaled = scaler.transform(test_feat.to_numpy())

    model = IsolationForest(contamination=0.05, n_estimators=100, random_state=42)
    model.fit(x_train_scaled)

    preds = model.predict(x_test_scaled)
    anomalies = (preds == -1).sum()

    assert anomalies < n_test, f"REGRESSION: 100% of normal observations were classified as anomalies ({anomalies}/{n_test})"
    assert anomalies <= int(n_test * 0.25), f"Too many false positives on normal data: {anomalies}/{n_test}"
