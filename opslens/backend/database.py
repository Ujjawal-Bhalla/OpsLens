import os
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Use Docker's persistent storage path when configured.
# Otherwise, use the existing local database location.
DATABASE_PATH = Path(
    os.getenv("DATABASE_PATH", str(BASE_DIR / "opslens.db"))
)


def get_connection():
    """Create and return a database connection."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    """Create the detection history tables if they don't exist."""

    connection = get_connection()

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS detection_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_id TEXT NOT NULL,
                source_file TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                observation_count INTEGER NOT NULL,
                anomaly_count INTEGER NOT NULL,
                score_semantics TEXT
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS detection_predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                value REAL NOT NULL,
                anomaly INTEGER NOT NULL,
                anomaly_score REAL,
                decision_function REAL,
                FOREIGN KEY (run_id)
                    REFERENCES detection_runs(id)
                    ON DELETE CASCADE
            )
        """)

        connection.commit()

    finally:
        connection.close()