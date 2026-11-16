"""
Stub for future external monitoring API integration.

To integrate an external API (e.g. Prometheus, Datadog, CloudWatch, custom webhook):
1. Subclass BaseIngestor
2. Add authentication config (API key, bearer token) via environment variables
3. Implement ingest() to call the external API and normalize the response to list[LogEntry]
4. Register the ingestor at a new endpoint, e.g. POST /api/logs/pull

This stub is intentionally unimplemented. Do not add logic here until a
real monitoring API endpoint is available.
"""
from __future__ import annotations
from .base import BaseIngestor, LogEntry


class APIIngestor(BaseIngestor):
    """Placeholder for external monitoring API ingestion (not yet implemented)."""

    def __init__(self, api_url: str, api_key: str | None = None):
        self.api_url = api_url
        self.api_key = api_key

    def ingest(self) -> list[LogEntry]:
        raise NotImplementedError(
            "APIIngestor is not yet implemented. "
            "See api_ingestor.py for integration guidance. "
            "Use FileIngestor for JSON file uploads."
        )
