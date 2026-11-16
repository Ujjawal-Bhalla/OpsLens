"""
Unit tests for OpsLens FileIngestor and BaseIngestor.
"""
import sys
import json
from pathlib import Path
import pytest

# Ensure project root and backend are in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from ingestors.base import BaseIngestor, LogEntry
from ingestors.file_ingestor import FileIngestor
from ingestors.api_ingestor import APIIngestor


def test_ingest_multivariate_format():
    """Verify ingestion of {timestamp, metrics: {k: v}} format."""
    payload = [
        {
            "timestamp": "2024-01-01T10:00:00Z",
            "metrics": {
                "cpu_usage": 45.2,
                "memory_usage": 60.1,
                "latency_ms": 115.0,
            },
        },
        {
            "timestamp": "2024-01-01T10:01:00Z",
            "metrics": {
                "cpu_usage": 46.0,
                "memory_usage": 60.5,
                "latency_ms": 118.0,
            },
        },
    ]
    ingestor = FileIngestor(json.dumps(payload))
    entries = ingestor.ingest()

    assert len(entries) == 2
    assert entries[0].metrics["cpu_usage"] == 45.2
    assert entries[0].metrics["memory_usage"] == 60.1
    assert entries[0].metrics["latency_ms"] == 115.0


def test_ingest_legacy_format():
    """Verify ingestion of legacy univariate {timestamp, value} format."""
    payload = [
        {"timestamp": "2024-01-01T12:00:00Z", "value": 105.4},
        {"timestamp": "2024-01-01T12:05:00Z", "value": 110.2},
    ]
    ingestor = FileIngestor(json.dumps(payload))
    entries = ingestor.ingest()

    assert len(entries) == 2
    assert entries[0].metrics == {"value": 105.4}
    assert entries[1].metrics == {"value": 110.2}


def test_ingest_flat_format():
    """Verify ingestion of flat format where arbitrary numeric keys become metrics."""
    payload = [
        {
            "timestamp": "2024-01-01T14:00:00Z",
            "response_time_ms": 142.5,
            "error_rate": 0.015,
            "request_count": 500,
        }
    ]
    ingestor = FileIngestor(json.dumps(payload))
    entries = ingestor.ingest()

    assert len(entries) == 1
    assert entries[0].metrics["response_time_ms"] == 142.5
    assert entries[0].metrics["error_rate"] == 0.015
    assert entries[0].metrics["request_count"] == 500.0


def test_ingest_wrapped_in_object():
    """Verify ingestion when JSON is an object with an 'observations' list."""
    payload = {
        "observations": [
            {"timestamp": "2024-01-01T10:00:00Z", "value": 50.0},
            {"timestamp": "2024-01-01T11:00:00Z", "value": 55.0},
        ]
    }
    ingestor = FileIngestor(json.dumps(payload))
    entries = ingestor.ingest()

    assert len(entries) == 2
    assert entries[0].metrics["value"] == 50.0


def test_ingest_sorts_chronologically():
    """Verify that entries out of chronological order are sorted ascending."""
    payload = [
        {"timestamp": "2024-01-01T12:00:00Z", "value": 30.0},
        {"timestamp": "2024-01-01T10:00:00Z", "value": 10.0},
        {"timestamp": "2024-01-01T11:00:00Z", "value": 20.0},
    ]
    ingestor = FileIngestor(json.dumps(payload))
    entries = ingestor.ingest()

    timestamps = [e.timestamp for e in entries]
    assert timestamps == sorted(timestamps)
    assert entries[0].metrics["value"] == 10.0
    assert entries[-1].metrics["value"] == 30.0


def test_ingest_rejects_missing_timestamp():
    """Verify error when timestamp is omitted."""
    payload = [{"value": 50.0}]
    ingestor = FileIngestor(json.dumps(payload))
    with pytest.raises(ValueError, match="missing required 'timestamp'"):
        ingestor.ingest()


def test_ingest_rejects_bad_timestamp():
    """Verify error on invalid timestamp format."""
    payload = [{"timestamp": "not-a-timestamp", "value": 50.0}]
    ingestor = FileIngestor(json.dumps(payload))
    with pytest.raises(ValueError, match="unparseable timestamp"):
        ingestor.ingest()


def test_ingest_rejects_no_numeric_metrics():
    """Verify error when an entry has no numeric fields."""
    payload = [{"timestamp": "2024-01-01T10:00:00Z", "status": "ok"}]
    ingestor = FileIngestor(json.dumps(payload))
    with pytest.raises(ValueError, match="contains no valid numeric metrics"):
        ingestor.ingest()


def test_ingest_rejects_empty_data():
    """Verify error on empty list."""
    ingestor = FileIngestor("[]")
    with pytest.raises(ValueError, match="zero records"):
        ingestor.ingest()


def test_api_ingestor_raises_not_implemented():
    """Verify that APIIngestor raises NotImplementedError with clear guidance."""
    ingestor = APIIngestor(api_url="https://monitoring.internal/metrics")
    with pytest.raises(NotImplementedError, match="APIIngestor is not yet implemented"):
        ingestor.ingest()
