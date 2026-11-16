"""
Explainability and calibrated severity scoring for OpsLens.

Provides:
- Calibrated severity assignment (Normal, Low, Medium, High, Critical)
- Heuristic feature contribution ranking for multivariate alerts
"""
from __future__ import annotations
import numpy as np
import pandas as pd


SEVERITY_LEVELS = ["Normal", "Low", "Medium", "High", "Critical"]


def calibrate_severity(
    scores: np.ndarray | list[float],
    anomalies: np.ndarray | list[bool],
) -> list[str]:
    """
    Assign a calibrated severity category to each prediction.

    Normal observations are always assigned 'Normal'.
    Anomalous observations (score > 0) are assigned Low, Medium, High, or Critical
    based on their distance past the decision boundary, calibrated against either
    the empirical quantile distribution of anomalies in the run or absolute score distance.
    """
    scores_arr = np.asarray(scores, dtype=float)
    anom_arr = np.asarray(anomalies, dtype=bool)
    n = len(scores_arr)
    severities: list[str] = ["Normal"] * n

    pos_mask = anom_arr & (scores_arr > 0)
    pos_scores = scores_arr[pos_mask]

    if len(pos_scores) == 0:
        return severities

    if len(pos_scores) >= 3:
        # Quantile-based relative calibration when enough anomalies exist
        q33 = float(np.percentile(pos_scores, 33))
        q66 = float(np.percentile(pos_scores, 66))
        q90 = float(np.percentile(pos_scores, 90))

        for idx in np.where(pos_mask)[0]:
            s = scores_arr[idx]
            if s <= q33:
                severities[idx] = "Low"
            elif s <= q66:
                severities[idx] = "Medium"
            elif s <= q90:
                severities[idx] = "High"
            else:
                severities[idx] = "Critical"
    else:
        # Distance-from-boundary calibration for small sample of anomalies
        for idx in np.where(pos_mask)[0]:
            s = scores_arr[idx]
            if s <= 0.05:
                severities[idx] = "Low"
            elif s <= 0.12:
                severities[idx] = "Medium"
            elif s <= 0.22:
                severities[idx] = "High"
            else:
                severities[idx] = "Critical"

    return severities


def compute_metric_contributions(
    observations: list[dict],
    anomalies: list[bool],
    baseline_stats: dict[str, dict[str, float]] | None = None,
) -> list[list[dict]]:
    """
    Compute heuristic metric contributions for each observation.

    Note: Isolation Forest does not natively produce causal attribution.
    This provides a heuristic deviation ranking based on standardized distance from
    the baseline distribution to guide human investigation.
    """
    if not observations:
        return []

    # Check if observations contain named metrics
    has_metrics = any(
        isinstance(obs.get("metrics"), dict) and len(obs["metrics"]) > 1
        for obs in observations
    )
    if not has_metrics:
        # Univariate: single feature is 100% of the signal
        return [[] for _ in observations]

    # Gather metrics across observations
    metric_names = sorted(list(set(
        k
        for obs in observations
        if isinstance(obs.get("metrics"), dict)
        for k in obs["metrics"].keys()
    )))

    # Compute baseline mean and std across inliers/normal observations to avoid outlier contamination
    normal_obs = [obs for obs, is_anom in zip(observations, anomalies) if not is_anom]
    target_pool = normal_obs if len(normal_obs) >= 2 else observations

    stats: dict[str, tuple[float, float]] = {}
    for m in metric_names:
        if baseline_stats and m in baseline_stats:
            mu = baseline_stats[m].get("mean", 0.0)
            sig = baseline_stats[m].get("std", 1.0)
        else:
            vals = [
                float(obs["metrics"][m])
                for obs in target_pool
                if isinstance(obs.get("metrics"), dict) and m in obs["metrics"]
            ]
            mu = float(np.mean(vals)) if vals else 0.0
            sig = float(np.std(vals)) if len(vals) > 1 else 1.0
            if sig < 1e-9:
                sig = 1.0
        stats[m] = (mu, sig)

    all_contributions: list[list[dict]] = []

    for obs, is_anomaly in zip(observations, anomalies):
        if not is_anomaly or not isinstance(obs.get("metrics"), dict):
            all_contributions.append([])
            continue

        raw_metrics = obs["metrics"]
        deviations = []
        total_z = 0.0

        for m, val in raw_metrics.items():
            mu, sig = stats.get(m, (0.0, 1.0))
            z = abs(float(val) - mu) / sig
            deviations.append((m, float(val), mu, z))
            total_z += z

        if total_z < 1e-9:
            total_z = 1.0

        # Sort metrics by deviation descending
        deviations.sort(key=lambda item: item[3], reverse=True)

        contrib_list = []
        for m, val, mu, z in deviations:
            pct = (z / total_z) * 100.0
            contrib_list.append({
                "metric": m,
                "value": round(val, 4),
                "baseline_mean": round(mu, 4),
                "deviation_zscore": round(z, 2),
                "contribution_pct": round(pct, 1),
            })

        all_contributions.append(contrib_list)

    return all_contributions
