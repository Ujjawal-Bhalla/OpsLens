"""Base ingestor interface for OpsLens log ingestion."""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any


class LogEntry:
    """A normalized log entry with a timestamp and one or more metric values."""

    def __init__(self, timestamp: str, metrics: dict[str, float]):
        self.timestamp = timestamp
        self.metrics = metrics

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "metrics": self.metrics,
        }


class BaseIngestor(ABC):
    """Abstract base class for all log ingestors.

    To add a new log source (e.g. Prometheus, Datadog, custom API):
    1. Subclass BaseIngestor
    2. Implement ingest() to return list[LogEntry]
    3. Register the ingestor in the appropriate API endpoint
    """

    @abstractmethod
    def ingest(self) -> list[LogEntry]:
        """Parse the log source and return a list of normalized LogEntry objects."""
        ...

    def validate(self, entries: list[LogEntry]) -> list[LogEntry]:
        """Optional post-ingestion validation. Override to add source-specific checks."""
        if not entries:
            raise ValueError("Ingestor returned zero log entries.")
        return entries
