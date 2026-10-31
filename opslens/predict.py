#!/usr/bin/env python3
"""
OpsLens offline prediction runner.

Reads a JSON request from disk, loads the matching trained model artifact,
runs inference, and writes a JSON response. No backend or HTTP server required.

Usage:
  python predict.py --input sample_request.json --artifacts-dir ./artifacts
  python predict.py --input sample_request.json --output prediction_result.json

The request can identify a model using:
  - model_id: exact ID from artifacts/manifest.json (recommended), OR
  - source_file: relative CSV path used during training, OR
  - series: a string matched against model_id/source_file (must be unambiguous)

Request format:
{
  "model_id": "exact-model-id-from-manifest",
  "history": [{"timestamp": "...Z", "value": 100.0}],
  "observations": [{"timestamp": "...Z", "value": 125.0}]
}

For compatibility with an earlier sample shape, "series" and "model_name"
are accepted as selectors, but the selected model must still be unambiguous.
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

from features import make_features

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOG = logging.getLogger("opslens-predict")

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
    if not isinstance(rows, list):
        raise ValueError(f"'{field_name}' must be a JSON array.")
    normalized = []
    for i, item in enumerate(rows):
        if not isinstance(item, dict) or "timestamp" not in item or "value" not in item:
            raise ValueError(f"{field_name}[{i}] must contain timestamp and value.")
        try:
            value = float(item["value"])
        except (TypeError, ValueError):
            raise ValueError(f"{field_name}[{i}].value must be numeric.")
        if not np.isfinite(value):
            raise ValueError(f"{field_name}[{i}].value must be finite.")
        timestamp = pd.to_datetime(item["timestamp"], errors="coerce", utc=True)
        if pd.isna(timestamp):
            raise ValueError(f"{field_name}[{i}].timestamp is not parseable.")
        normalized.append({"timestamp": timestamp.isoformat(), "value": value})
    return normalized

def run_prediction(request, artifacts_dir: Path):
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

    predictions = []
    for obs, label, dec, score in zip(observations, labels, decision, scores):
        predictions.append({
            "timestamp": obs["timestamp"],
            "value": obs["value"],
            "anomaly": bool(label == -1),
            "anomaly_score": float(score),
            "decision_function": float(dec),
        })

    return {
        "success": True,
        "model_id": metadata["model_id"],
        "source_file": metadata.get("source_file"),
        "count": len(predictions),
        "anomaly_count": sum(p["anomaly"] for p in predictions),
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
