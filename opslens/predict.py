#!/usr/bin/env python3
"""
OpsLens prediction runner supporting both univariate and multivariate models.

Reads a JSON request from disk or dict, runs inference, and returns a JSON response.
Supports:
  - Univariate trained models loaded from artifacts/models/*.joblib
  - Multivariate Isolation Forest ("isolation_forest_multivariate") for arbitrary metric sets
"""
from __future__ import annotations
import argparse
import json
import logging
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from features import make_features, make_multivariate_features
from explain import calibrate_severity, compute_metric_contributions

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("opslens-predict")

MULTIVARIATE_MODEL_IDS = {
    "isolation_forest_multivariate",
    "multivariate_isolation_forest",
    "multivariate-isolation-forest",
}


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Could not read valid JSON from {path}: {exc}") from exc


def select_model(request, manifest):
    models = manifest.get("models", [])
    model_id = request.get("model_id")
    if model_id:
        matches = [m for m in models if m.get("model_id") == model_id]
    else:
        selector = request.get("source_file") or request.get("series") or request.get("model_name")
        if not selector:
            raise ValueError("Request must include model_id, source_file, series, or model_name.")
        selector = str(selector).lower()
        matches = [
            m for m in models
            if selector in str(m.get("model_id", "")).lower()
            or selector in str(m.get("source_file", "")).lower()
        ]
    if not matches:
        raise ValueError("No matching model found. Check model_id/source_file against manifest.json.")
    if len(matches) > 1:
        choices = [{"model_id": m["model_id"], "source_file": m.get("source_file")} for m in matches]
        raise ValueError(f"Model selector is ambiguous. Use exact model_id. Matches: {choices}")
    return matches[0]


def normalize_observations(rows, field_name):
    """
    Normalize observations accepting univariate ({timestamp, value}),
    nested multivariate ({timestamp, metrics: {...}}), or flat ({timestamp, cpu: 10, ...}).
    """
    if not isinstance(rows, list):
        raise ValueError(f"'{field_name}' must be a JSON array.")
    normalized = []
    for i, item in enumerate(rows):
        if not isinstance(item, dict):
            raise ValueError(f"{field_name}[{i}] must be a JSON object.")
        if "timestamp" not in item:
            raise ValueError(f"{field_name}[{i}] must contain timestamp and value.")

        timestamp = pd.to_datetime(item["timestamp"], errors="coerce", utc=True)
        if pd.isna(timestamp):
            raise ValueError(f"{field_name}[{i}].timestamp is not parseable.")

        metrics: dict[str, float] = {}
        primary_val: float | None = None

        if "metrics" in item and isinstance(item["metrics"], dict):
            for k, v in item["metrics"].items():
                try:
                    val = float(v)
                except (TypeError, ValueError):
                    raise ValueError(f"{field_name}[{i}].metrics.{k} must be numeric.")
                if not np.isfinite(val):
                    raise ValueError(f"{field_name}[{i}].metrics.{k} must be finite.")
                metrics[str(k)] = val
            if "value" in item and item["value"] is not None:
                try:
                    primary_val = float(item["value"])
                except (TypeError, ValueError):
                    raise ValueError(f"{field_name}[{i}].value must be numeric.")
                if not np.isfinite(primary_val):
                    raise ValueError(f"{field_name}[{i}].value must be finite.")
            elif metrics:
                primary_val = next(iter(metrics.values()))
        elif "value" in item:
            try:
                primary_val = float(item["value"])
            except (TypeError, ValueError):
                raise ValueError(f"{field_name}[{i}].value must be numeric.")
            if not np.isfinite(primary_val):
                raise ValueError(f"{field_name}[{i}].value must be finite.")
            metrics["value"] = primary_val
        else:
            # Flat format: extract numeric keys
            for k, v in item.items():
                if k.lower() in ("timestamp", "time", "date", "ds", "datetime"):
                    continue
                try:
                    val = float(v)
                    if np.isfinite(val):
                        metrics[str(k)] = val
                except (TypeError, ValueError):
                    continue
            if metrics:
                primary_val = next(iter(metrics.values()))

        if primary_val is None and not metrics:
            raise ValueError(f"{field_name}[{i}] must contain timestamp and value.")

        normalized.append({
            "timestamp": timestamp.isoformat(),
            "value": float(primary_val) if primary_val is not None else 0.0,
            "metrics": metrics if metrics else {"value": float(primary_val or 0.0)},
        })
    return normalized


def run_multivariate_prediction(request: dict, contamination: float = 0.05) -> dict:
    """Run genuine multivariate anomaly detection across named metric vectors."""
    history = normalize_observations(request.get("history", []), "history")
    observations = normalize_observations(request.get("observations", []), "observations")
    if not observations:
        raise ValueError("'observations' must contain at least one new observation.")

    combined = history + observations
    timestamps = pd.to_datetime([x["timestamp"] for x in combined], utc=True)
    if not timestamps.is_monotonic_increasing:
        raise ValueError("history and observations must be ordered oldest to newest.")

    # Collect all unique metric names across all records
    all_metric_keys = set()
    for row in combined:
        all_metric_keys.update(row["metrics"].keys())

    metric_names = sorted(list(all_metric_keys))
    if not metric_names:
        raise ValueError("Multivariate detection requires at least one numeric metric.")

    # Build metric DataFrame with consistent column ordering
    metrics_records = []
    for row in combined:
        rec = {}
        for m in metric_names:
            rec[m] = row["metrics"].get(m, np.nan)
        metrics_records.append(rec)
    metrics_df = pd.DataFrame(metrics_records)

    # Impute missing values per column with forward-fill/backward-fill/mean
    imputed_metrics = []
    for m in metric_names:
        if metrics_df[m].isna().any():
            col_mean = metrics_df[m].dropna().mean()
            col_mean = float(col_mean) if np.isfinite(col_mean) else 0.0
            metrics_df[m] = metrics_df[m].ffill().bfill().fillna(col_mean)
            imputed_metrics.append(m)

    features_df, feature_names, _ = make_multivariate_features(
        metrics_df=metrics_df,
        timestamps=timestamps,
        rolling_window=min(30, max(5, len(combined) // 4)),
    )

    x_all = features_df.to_numpy()
    scaler = StandardScaler()

    # If sufficient history exists, fit baseline on history; otherwise fit on combined stream
    history_len = len(history)
    if history_len >= 20:
        x_train = x_all[:history_len]
        scaler.fit(x_train)
        x_train_scaled = scaler.transform(x_train)
        model = IsolationForest(
            n_estimators=100,
            contamination=contamination,
            random_state=42,
            n_jobs=-1,
        )
        model.fit(x_train_scaled)
        x_new = x_all[history_len:]
    else:
        scaler.fit(x_all)
        x_all_scaled = scaler.transform(x_all)
        model = IsolationForest(
            n_estimators=100,
            contamination=contamination,
            random_state=42,
            n_jobs=-1,
        )
        model.fit(x_all_scaled)
        x_new = x_all[history_len:]

    x_new_scaled = scaler.transform(x_new)
    labels = model.predict(x_new_scaled)
    decision = model.decision_function(x_new_scaled)
    scores = -decision

    anomaly_flags = [bool(l == -1) for l in labels]
    severities = calibrate_severity(scores, anomaly_flags)
    contributions = compute_metric_contributions(observations, anomaly_flags)

    predictions = []
    for obs, label, dec, score, sev, contrib in zip(
        observations, labels, decision, scores, severities, contributions
    ):
        pred_item = {
            "timestamp": obs["timestamp"],
            "value": obs["value"],
            "metrics": obs["metrics"],
            "anomaly": bool(label == -1),
            "anomaly_score": float(score),
            "decision_function": float(dec),
            "severity": sev,
        }
        if contrib:
            pred_item["contributing_metrics"] = contrib
        predictions.append(pred_item)

    model_id = request.get("model_id", "isolation_forest_multivariate")
    severity_breakdown = {
        lvl: sum(1 for p in predictions if p["severity"] == lvl)
        for lvl in ["Normal", "Low", "Medium", "High", "Critical"]
    }

    return {
        "success": True,
        "model_id": model_id,
        "detection_mode": "multivariate",
        "metric_names": metric_names,
        "imputed_metrics": sorted(list(set(imputed_metrics))),
        "count": len(predictions),
        "anomaly_count": sum(p["anomaly"] for p in predictions),
        "severity_breakdown": severity_breakdown,
        "score_semantics": "Higher anomaly_score means more anomalous; it is not a probability.",
        "explanation_method": "Z-score deviation ranking (heuristic; not a causal proof)",
        "predictions": predictions,
    }


def run_prediction(request, artifacts_dir: Path):
    model_id = request.get("model_id", "")

    # Route to multivariate engine when requested
    if model_id in MULTIVARIATE_MODEL_IDS:
        return run_multivariate_prediction(request)

    manifest_path = artifacts_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}. Run the training notebook first.")
    manifest = load_json(manifest_path)
    model_info = select_model(request, manifest)

    artifact_path = (artifacts_dir / model_info["artifact"]).resolve()
    if artifacts_dir.resolve() not in artifact_path.parents:
        raise ValueError("Unsafe artifact path in manifest.")
    if not artifact_path.is_file():
        raise FileNotFoundError(f"Model artifact not found: {artifact_path}")
    artifact = joblib.load(artifact_path)
    metadata = artifact["metadata"]

    history = normalize_observations(request.get("history", metadata.get("context", [])), "history")
    observations = normalize_observations(request.get("observations", []), "observations")
    if not observations:
        raise ValueError("'observations' must contain at least one new observation.")

    combined = history + observations
    timestamps = pd.to_datetime([x["timestamp"] for x in combined], utc=True)
    if not timestamps.is_monotonic_increasing:
        raise ValueError("history and observations must be ordered oldest to newest.")

    values = [x["value"] for x in combined]
    features = make_features(
        values=values,
        timestamps=timestamps,
        reference_mean=metadata["reference_mean"],
        reference_std=metadata["reference_std"],
        rolling_window=metadata["rolling_window"],
    )
    x_new = features.iloc[len(history):].to_numpy()
    x_scaled = artifact["scaler"].transform(x_new)
    model = artifact["model"]
    labels = model.predict(x_scaled)
    decision = model.decision_function(x_scaled)
    scores = -decision

    calibrated_thresh = float(metadata.get("calibrated_threshold", 0.0))
    anomaly_flags = [
        bool(d < calibrated_thresh) if calibrated_thresh != 0.0 else bool(l == -1)
        for l, d in zip(labels, decision)
    ]
    severities = calibrate_severity(scores, anomaly_flags)

    predictions = []
    for obs, label, dec, score, sev in zip(observations, labels, decision, scores, severities):
        is_anom = bool(dec < calibrated_thresh) if calibrated_thresh != 0.0 else bool(label == -1)
        predictions.append({
            "timestamp": obs["timestamp"],
            "value": obs["value"],
            "metrics": obs["metrics"],
            "anomaly": is_anom,
            "anomaly_score": float(score),
            "decision_function": float(dec),
            "severity": sev,
        })

    severity_breakdown = {
        lvl: sum(1 for p in predictions if p["severity"] == lvl)
        for lvl in ["Normal", "Low", "Medium", "High", "Critical"]
    }

    return {
        "success": True,
        "model_id": metadata["model_id"],
        "detection_mode": "univariate",
        "source_file": metadata.get("source_file"),
        "count": len(predictions),
        "anomaly_count": sum(p["anomaly"] for p in predictions),
        "severity_breakdown": severity_breakdown,
        "score_semantics": "Higher anomaly_score means more anomalous; it is not a probability.",
        "predictions": predictions,
    }


def main():
    parser = argparse.ArgumentParser(description="Run OpsLens inference from a JSON file.")
    parser.add_argument("--input", default="sample_request.json", help="Input JSON request.")
    parser.add_argument("--output", default="", help="Output JSON path. Defaults to stdout.")
    parser.add_argument("--artifacts-dir", default="./artifacts", help="Training output directory.")
    args = parser.parse_args()
    try:
        result = run_prediction(load_json(Path(args.input)), Path(args.artifacts_dir))
        rendered = json.dumps(result, indent=2)
        if args.output:
            Path(args.output).write_text(rendered + "\n", encoding="utf-8")
            LOG.info("Prediction result saved to %s", args.output)
        else:
            print(rendered)
    except Exception as exc:
        LOG.error("%s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
