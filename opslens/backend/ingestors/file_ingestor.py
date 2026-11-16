"""File-based log ingestor supporting JSON logs."""
from __future__ import annotations
import json
from typing import Any
import numpy as np
import pandas as pd

from .base import BaseIngestor, LogEntry


class FileIngestor(BaseIngestor):
    """Ingests log observations from a JSON string or file content."""

    def __init__(self, content: str | bytes):
        if isinstance(content, bytes):
            self.raw_content = content.decode("utf-8-sig")
        else:
            self.raw_content = content

    def ingest(self) -> list[LogEntry]:
        try:
            data = json.loads(self.raw_content)
        except Exception as exc:
            raise ValueError(f"Invalid JSON content: {exc}") from exc

        if isinstance(data, dict):
            if "observations" in data and isinstance(data["observations"], list):
                rows = data["observations"]
            elif "logs" in data and isinstance(data["logs"], list):
                rows = data["logs"]
            else:
                raise ValueError("JSON object must contain an 'observations' or 'logs' list.")
        elif isinstance(data, list):
            rows = data
        else:
            raise ValueError("Log JSON must be an array of records or an object containing an 'observations' list.")

        if not rows:
            raise ValueError("Log input contains zero records.")

        entries: list[LogEntry] = []

        for i, item in enumerate(rows):
            if not isinstance(item, dict):
                raise ValueError(f"Record at index {i} must be a JSON object.")

            if "timestamp" not in item:
                raise ValueError(f"Record at index {i} is missing required 'timestamp' field.")

            ts = pd.to_datetime(item["timestamp"], errors="coerce", utc=True)
            if pd.isna(ts):
                raise ValueError(f"Record at index {i} has unparseable timestamp: {item['timestamp']!r}")

            timestamp_str = ts.isoformat()
            metrics: dict[str, float] = {}

            if "metrics" in item and isinstance(item["metrics"], dict):
                for k, v in item["metrics"].items():
                    try:
                        val = float(v)
                    except (TypeError, ValueError):
                        raise ValueError(f"Record at index {i} metric '{k}' must be numeric.")
                    if not np.isfinite(val):
                        raise ValueError(f"Record at index {i} metric '{k}' must be finite.")
                    metrics[str(k)] = val
            elif "value" in item:
                try:
                    val = float(item["value"])
                except (TypeError, ValueError):
                    raise ValueError(f"Record at index {i} 'value' must be numeric.")
                if not np.isfinite(val):
                    raise ValueError(f"Record at index {i} 'value' must be finite.")
                metrics["value"] = val
            else:
                # Flat format: extract all numeric keys except timestamp
                for k, v in item.items():
                    if k.lower() in ("timestamp", "time", "date", "ds", "datetime"):
                        continue
                    try:
                        val = float(v)
                        if np.isfinite(val):
                            metrics[str(k)] = val
                    except (TypeError, ValueError):
                        continue

            if not metrics:
                raise ValueError(f"Record at index {i} contains no valid numeric metrics.")

            entries.append(LogEntry(timestamp=timestamp_str, metrics=metrics))

        # Sort chronologically by timestamp
        entries.sort(key=lambda e: e.timestamp)

        return self.validate(entries)
