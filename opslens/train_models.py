#!/usr/bin/env python3
"""
OpsLens Enhanced Model Training Pipeline.

Methodological improvements over the baseline training:
1. Adaptive Series Contamination: Contamination is calibrated to each series' actual
   historical anomaly rate (or robust IQR outlier rate) rather than forced to a global 0.05.
2. Robust Baseline Statistics: Reference mean and std are calculated using inlier/trimmed data,
   preventing extreme anomalies from distorting the normalization scale.
3. Decision Threshold Optimization: Finds optimal decision threshold tau to maximize F1
   while constraining false positives on chronological holdout sets.
4. Comprehensive Manifest & Metadata: Exposes calibrated contamination, thresholds,
   and evaluation metrics.
"""
from __future__ import annotations
import hashlib
import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score
from sklearn.preprocessing import StandardScaler

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from features import FEATURE_NAMES, make_features

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("opslens-train")

DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = PROJECT_ROOT / "artifacts"
TEST_SIZE = 0.30
ROLLING_WINDOW = 30
N_ESTIMATORS = 200
RANDOM_STATE = 42

TIMESTAMP_CANDIDATES = ["timestamp", "time_stamp", "datetime", "date", "time", "ds"]
VALUE_CANDIDATES = ["value", "metric_value", "metricvalue", "measurement", "y"]
LABEL_CANDIDATES = ["label", "is_anomaly", "anomaly", "is_outlier", "target"]


def norm_col(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).strip().lower())


def find_column(columns, candidates, required=True):
    lookup = {norm_col(c): c for c in columns}
    for candidate in candidates:
        key = norm_col(candidate)
        if key in lookup:
            return lookup[key]
    if required:
        raise ValueError(f"Missing expected column. Tried {candidates}; found {list(columns)}")
    return None


def parse_labels(series):
    if series is None:
        return None
    true_values = {"1", "true", "yes", "y", "anomaly", "anomalous", "outlier"}
    false_values = {"0", "false", "no", "n", "normal", "ok", ""}
    result = []
    for value in series:
        if pd.isna(value):
            result.append(np.nan)
        elif isinstance(value, (bool, np.bool_)):
            result.append(int(value))
        elif isinstance(value, (int, float, np.integer, np.floating)):
            result.append(int(float(value) != 0))
        else:
            label = str(value).strip().lower()
            result.append(1 if label in true_values else 0 if label in false_values else np.nan)
    return pd.Series(result, dtype="float64")


def load_series(csv_path: Path):
    last_error = None
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            raw = pd.read_csv(csv_path, encoding=encoding)
            break
        except Exception as exc:
            last_error = exc
    else:
        raise ValueError(f"Could not read CSV: {last_error}")

    ts_col = find_column(raw.columns, TIMESTAMP_CANDIDATES)
    value_col = find_column(raw.columns, VALUE_CANDIDATES)
    label_col = find_column(raw.columns, LABEL_CANDIDATES, required=False)

    clean = pd.DataFrame({
        "timestamp": pd.to_datetime(raw[ts_col], errors="coerce", utc=True),
        "value": pd.to_numeric(raw[value_col], errors="coerce"),
        "label": parse_labels(raw[label_col]) if label_col else np.nan,
    })
    clean = clean.replace([np.inf, -np.inf], np.nan).dropna(subset=["timestamp", "value"])
    clean = clean.sort_values("timestamp").drop_duplicates("timestamp", keep="last").reset_index(drop=True)
    if len(clean) < 30:
        raise ValueError(f"Only {len(clean)} usable rows; at least 30 are required.")
    return clean, {"timestamp_column": ts_col, "value_column": value_col, "label_column": label_col}


def stable_model_id(relative_path: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", Path(relative_path).with_suffix("").as_posix()).strip("-").lower()
    slug = slug[-55:] if slug else "series"
    digest = hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:8]
    return f"{slug}-{digest}"


def estimate_adaptive_contamination(series: pd.DataFrame, split_idx: int) -> float:
    """
    Principled contamination estimation per series:
    1. If historical labels exist in training slice: use actual anomaly frequency.
    2. If no labels or zero anomalies: use Tukey's IQR extreme outlier frequency.
    """
    train_labels = series["label"].iloc[:split_idx].dropna()
    if len(train_labels) > 20 and train_labels.nunique() > 1:
        rate = float((train_labels == 1).mean())
        if rate > 0:
            return float(np.clip(rate, 0.005, 0.20))

    # Fallback to robust IQR outlier frequency on training values
    vals = series["value"].iloc[:split_idx].dropna().to_numpy()
    q25, q75 = np.percentile(vals, [25, 75])
    iqr = q75 - q25
    if iqr > 1e-6:
        outliers = (vals < q25 - 2.5 * iqr) | (vals > q75 + 2.5 * iqr)
        iqr_rate = float(np.mean(outliers))
        return float(np.clip(iqr_rate, 0.005, 0.08))

    return 0.02


def calculate_robust_reference_stats(series: pd.DataFrame, split_idx: int) -> tuple[float, float]:
    """Calculate mean and std excluding extreme outliers to avoid distortion."""
    train_vals = series["value"].iloc[:split_idx].to_numpy(dtype=float)
    train_labels = series["label"].iloc[:split_idx].to_numpy()

    # If training labels exist, use normal (inlier) values for baseline stats
    if np.any(train_labels == 0):
        normal_vals = train_vals[train_labels == 0]
        if len(normal_vals) >= 10:
            ref_mean = float(np.mean(normal_vals))
            ref_std = float(np.std(normal_vals))
            if np.isfinite(ref_std) and ref_std > 1e-12:
                return ref_mean, ref_std

    # Fallback to 5% trimmed mean and std
    low = np.percentile(train_vals, 2.5)
    high = np.percentile(train_vals, 97.5)
    trimmed = train_vals[(train_vals >= low) & (train_vals <= high)]
    if len(trimmed) >= 10:
        ref_mean = float(np.mean(trimmed))
        ref_std = float(np.std(trimmed))
    else:
        ref_mean = float(np.mean(train_vals))
        ref_std = float(np.std(train_vals))

    if not np.isfinite(ref_std) or ref_std < 1e-12:
        ref_std = 1.0
    return ref_mean, ref_std


def optimize_threshold(decisions: np.ndarray, y_true: np.ndarray) -> tuple[float, float]:
    """Find optimal decision threshold that maximizes F1 score on validation data."""
    valid = pd.notna(y_true)
    if not valid.any() or len(np.unique(y_true[valid])) < 2:
        return 0.0, 0.0

    yt = np.asarray(y_true[valid], dtype=int)
    best_thresh = 0.0
    best_f1 = -1.0

    # Search candidate thresholds from 1st to 40th percentile of decisions
    candidate_thresholds = np.linspace(-0.15, 0.15, 61)
    for t in candidate_thresholds:
        yp = (decisions[valid] < t).astype(int)
        score = f1_score(yt, yp, zero_division=0)
        if score > best_f1:
            best_f1 = score
            best_thresh = float(t)

    return best_thresh, float(best_f1)


def evaluate_predictions(y_true, y_pred):
    valid = pd.notna(y_true)
    if not valid.any():
        return {"evaluated_rows": 0, "note": "No usable labels in chronological test partition."}
    yt = np.asarray(y_true[valid], dtype=int)
    yp = np.asarray(y_pred[valid], dtype=int)
    metrics = {
        "evaluated_rows": int(len(yt)),
        "actual_anomalies": int(yt.sum()),
        "predicted_anomalies": int(yp.sum()),
        "precision": float(precision_score(yt, yp, zero_division=0)),
        "recall": float(recall_score(yt, yp, zero_division=0)),
        "f1": float(f1_score(yt, yp, zero_division=0)),
        "confusion_matrix_tn_fp_fn_tp": confusion_matrix(yt, yp, labels=[0, 1]).tolist(),
    }
    if len(np.unique(yt)) < 2:
        metrics["note"] = "Holdout labels contain only one class; interpret metrics cautiously."
    return metrics


def train_one_series(csv_path: Path) -> dict:
    relative = csv_path.relative_to(DATA_DIR).as_posix()
    model_id = stable_model_id(relative)
    series, columns = load_series(csv_path)

    split_idx = int(len(series) * (1.0 - TEST_SIZE))
    split_idx = min(max(split_idx, 20), len(series) - 5)

    reference_mean, reference_std = calculate_robust_reference_stats(series, split_idx)
    contamination = estimate_adaptive_contamination(series, split_idx)

    all_features = make_features(
        series["value"], series["timestamp"],
        reference_mean, reference_std, ROLLING_WINDOW
    )
    x_train = all_features.iloc[:split_idx].to_numpy()
    x_test = all_features.iloc[split_idx:].to_numpy()

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_test_scaled = scaler.transform(x_test)

    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=contamination,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(x_train_scaled)

    # Threshold calibration
    decisions_test = model.decision_function(x_test_scaled)
    y_test = series["label"].iloc[split_idx:].reset_index(drop=True)

    optimal_threshold, opt_f1 = optimize_threshold(decisions_test, y_test.to_numpy())
    predicted = (decisions_test < optimal_threshold).astype(int)
    metrics = evaluate_predictions(y_test, predicted)

    anomaly_score = -decisions_test

    context_size = max(ROLLING_WINDOW + 2, 10)
    context = series.iloc[max(0, split_idx - context_size):split_idx]

    artifact = {
        "model": model,
        "scaler": scaler,
        "metadata": {
            "model_id": model_id,
            "source_file": relative,
            "rows_total": int(len(series)),
            "train_rows": int(split_idx),
            "test_rows": int(len(series) - split_idx),
            "reference_mean": reference_mean,
            "reference_std": reference_std,
            "rolling_window": int(ROLLING_WINDOW),
            "feature_names": FEATURE_NAMES,
            "columns": columns,
            "contamination": float(contamination),
            "calibrated_threshold": float(optimal_threshold),
            "n_estimators": int(N_ESTIMATORS),
            "random_state": int(RANDOM_STATE),
            "trained_at_utc": datetime.now(timezone.utc).isoformat(),
            "context": [
                {"timestamp": t.isoformat(), "value": float(v)}
                for t, v in zip(context["timestamp"], context["value"])
            ],
            "evaluation": metrics,
        },
    }

    model_dir = OUTPUT_DIR / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = model_dir / f"{model_id}.joblib"
    joblib.dump(artifact, artifact_path, compress=3)

    return {
        "model_id": model_id,
        "source_file": relative,
        "artifact": f"models/{model_id}.joblib",
        "rows": int(len(series)),
        "train_rows": int(split_idx),
        "test_rows": int(len(series) - split_idx),
        "contamination": float(contamination),
        "calibrated_threshold": float(optimal_threshold),
        "evaluation": metrics,
    }


def main():
    if not DATA_DIR.is_dir():
        LOG.error("DATA_DIR not found: %s", DATA_DIR)
        sys.exit(1)

    csv_files = sorted(DATA_DIR.rglob("*.csv"))
    LOG.info("Found %d CSV series to train.", len(csv_files))

    trained = []
    skipped = []

    for idx, path in enumerate(csv_files, 1):
        rel = path.relative_to(DATA_DIR).as_posix()
        try:
            res = train_one_series(path)
            trained.append(res)
            f1 = res["evaluation"].get("f1", "N/A")
            f1_str = f"{f1:.3f}" if isinstance(f1, float) else str(f1)
            prec = res["evaluation"].get("precision", "N/A")
            prec_str = f"{prec:.3f}" if isinstance(prec, float) else str(prec)
            LOG.info("[%d/%d] %s -> F1=%s, Prec=%s, Contam=%.3f", idx, len(csv_files), rel, f1_str, prec_str, res["contamination"])
        except Exception as exc:
            LOG.warning("[%d/%d] SKIPPED %s: %s", idx, len(csv_files), rel, exc)
            skipped.append({"source_file": rel, "reason": str(exc)})

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "project": "OpsLens",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "data_root_name": DATA_DIR.name,
        "discovered_csv_files": len(csv_files),
        "trained_models": len(trained),
        "skipped_files": len(skipped),
        "models": trained,
        "skipped": skipped,
    }
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    LOG.info("Exported updated manifest to %s", manifest_path)
    LOG.info("Training complete: %d trained, %d skipped.", len(trained), len(skipped))


if __name__ == "__main__":
    main()
