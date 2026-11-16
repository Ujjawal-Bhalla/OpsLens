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
    """Create the detection history tables if they don't exist and run incremental migrations."""
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
                score_semantics TEXT,
                detection_mode TEXT DEFAULT 'univariate',
                metric_names TEXT
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
                metrics_json TEXT,
                FOREIGN KEY (run_id)
                    REFERENCES detection_runs(id)
                    ON DELETE CASCADE
            )
        """)

        # Migration: ensure detection_mode and metric_names exist in detection_runs
        run_cols = [row["name"] for row in connection.execute("PRAGMA table_info(detection_runs)").fetchall()]
        if "detection_mode" not in run_cols:
            connection.execute("ALTER TABLE detection_runs ADD COLUMN detection_mode TEXT DEFAULT 'univariate'")
        if "metric_names" not in run_cols:
            connection.execute("ALTER TABLE detection_runs ADD COLUMN metric_names TEXT")

        # Migration: ensure metrics_json, severity, and explanation_json exist in detection_predictions
        pred_cols = [row["name"] for row in connection.execute("PRAGMA table_info(detection_predictions)").fetchall()]
        if "metrics_json" not in pred_cols:
            connection.execute("ALTER TABLE detection_predictions ADD COLUMN metrics_json TEXT")
        if "severity" not in pred_cols:
            connection.execute("ALTER TABLE detection_predictions ADD COLUMN severity TEXT DEFAULT 'Normal'")
        if "explanation_json" not in pred_cols:
            connection.execute("ALTER TABLE detection_predictions ADD COLUMN explanation_json TEXT")

        connection.commit()

    finally:
        connection.close()
