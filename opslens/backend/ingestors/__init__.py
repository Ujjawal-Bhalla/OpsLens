"""Log ingestion abstractions for OpsLens."""
from .base import BaseIngestor, LogEntry
from .file_ingestor import FileIngestor
from .api_ingestor import APIIngestor

__all__ = ["BaseIngestor", "LogEntry", "FileIngestor", "APIIngestor"]
