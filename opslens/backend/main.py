
from database import get_connection, initialize_database
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="OpsLens API",
    description="Backend API for the OpsLens anomaly detection platform",
    version="1.0.0",
)
@app.on_event("startup")
def startup_event():
    initialize_database()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Locate the project root
BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MANIFEST_PATH = ARTIFACTS_DIR / "manifest.json"

# Make the existing ML modules importable
sys.path.insert(0, str(BASE_DIR))

from predict import run_prediction


# Request schemas
class Observation(BaseModel):
    timestamp: str
    value: float


class PredictionRequest(BaseModel):
    model_id: str
    history: list[Observation] | None = None
    observations: list[Observation] = Field(min_length=1)


# Home endpoint
@app.get("/")
def home():
    return {
        "message": "Welcome to OpsLens API",
        "status": "running",
    }


# Health endpoint
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "OpsLens Backend",
    }


# Models endpoint

@app.get("/api/models")
def get_models():
    import json

    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as file:
            manifest = json.load(file)

        models = manifest.get("models", [])

        return {
            "total_models": len(models),
            "discovered_csv_files": manifest.get("discovered_csv_files", 0),
            "skipped_files": manifest.get("skipped_files", 0),
            "models": models,
        }

    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Model manifest not found",
        )

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Invalid model manifest JSON",
        )


# Prediction endpoint

@app.post("/api/detections/run")
def run_detection(payload: PredictionRequest):
    request_data = {
        "model_id": payload.model_id,
        "observations": [
            observation.model_dump()
            for observation in payload.observations
        ],
    }

    if payload.history is not None:
        request_data["history"] = [
            observation.model_dump()
            for observation in payload.history
        ]

    try:
        # Step 1: Run the existing ML prediction engine.
        result = run_prediction(
            request=request_data,
            artifacts_dir=ARTIFACTS_DIR,
        )

        # Step 2: Save the detection run and predictions.
        connection = get_connection()

        try:
            cursor = connection.execute(
                """
                INSERT INTO detection_runs (
                    model_id,
                    source_file,
                    observation_count,
                    anomaly_count,
                    score_semantics
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    result["model_id"],
                    result.get("source_file"),
                    result["count"],
                    result["anomaly_count"],
                    result.get("score_semantics"),
                ),
            )

            run_id = cursor.lastrowid

            for prediction in result["predictions"]:
                connection.execute(
                    """
                    INSERT INTO detection_predictions (
                        run_id,
                        timestamp,
                        value,
                        anomaly,
                        anomaly_score,
                        decision_function
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        prediction["timestamp"],
                        prediction["value"],
                        int(prediction["anomaly"]),
                        prediction.get("anomaly_score"),
                        prediction.get("decision_function"),
                    ),
                )

            connection.commit()

        finally:
            connection.close()

        # Step 3: Return the original result, with its saved run ID.
        result["run_id"] = run_id
        return result

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Required model artifact or manifest is missing",
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred during prediction",
        )


@app.get("/api/detections/history")
def get_detection_history(limit: int = 50, offset: int = 0):
    connection = get_connection()

    try:
        rows = connection.execute(
            """
            SELECT
                id,
                model_id,
                source_file,
                created_at,
                observation_count,
                anomaly_count,
                score_semantics
            FROM detection_runs
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()

        return {
            "total": connection.execute(
                "SELECT COUNT(*) FROM detection_runs"
            ).fetchone()[0],
            "history": [dict(row) for row in rows],
        }

    finally:
        connection.close()


@app.get("/api/detections/history/{run_id}")
def get_detection_history_detail(run_id: int):
    connection = get_connection()

    try:
        run = connection.execute(
            """
            SELECT *
            FROM detection_runs
            WHERE id = ?
            """,
            (run_id,),
        ).fetchone()

        if run is None:
            raise HTTPException(
                status_code=404,
                detail="Detection history record not found",
            )

        predictions = connection.execute(
            """
            SELECT
                timestamp,
                value,
                anomaly,
                anomaly_score,
                decision_function
            FROM detection_predictions
            WHERE run_id = ?
            ORDER BY id ASC
            """,
            (run_id,),
        ).fetchall()

        return {
            "run": dict(run),
            "predictions": [
                {
                    **dict(prediction),
                    "anomaly": bool(prediction["anomaly"]),
                }
                for prediction in predictions
            ],
        }

    finally:
        connection.close()


@app.get("/api/dashboard/summary")
def get_dashboard_summary():
    connection = get_connection()

    try:
        # Overall detection statistics
        stats = connection.execute(
            """
            SELECT
                COUNT(*) AS total_runs,
                COALESCE(SUM(anomaly_count), 0)
                    AS total_anomalous_observations,
                SUM(
                    CASE WHEN anomaly_count = 0 THEN 1 ELSE 0 END
                ) AS normal_runs,
                COUNT(DISTINCT model_id) AS models_used
            FROM detection_runs
            """
        ).fetchone()

        # Five most recent detection runs
        recent_runs = connection.execute(
            """
            SELECT
                id,
                model_id,
                created_at,
                observation_count,
                anomaly_count
            FROM detection_runs
            ORDER BY id DESC
            LIMIT 5
            """
        ).fetchall()

        # Daily activity for the last seven calendar days
        daily_activity = connection.execute(
            """
            SELECT
                DATE(created_at) AS date,
                COUNT(*) AS total_runs,
                COALESCE(SUM(anomaly_count), 0)
                    AS total_anomalies
            FROM detection_runs
            WHERE DATE(created_at) >= DATE('now', '-6 days')
            GROUP BY DATE(created_at)
            ORDER BY date ASC
            """
        ).fetchall()

        return {
            "total_runs": stats["total_runs"] or 0,
            "total_anomalous_observations":
                stats["total_anomalous_observations"] or 0,
            "normal_runs": stats["normal_runs"] or 0,
            "models_used": stats["models_used"] or 0,
            "recent_runs": [
                dict(row) for row in recent_runs
            ],
            "daily_activity": [
                dict(row) for row in daily_activity
            ],
        }

    finally:
        connection.close()


@app.get("/api/analytics/summary")
def get_analytics_summary():
    connection = get_connection()

    try:
        # 1. Overall observation statistics
        stats = connection.execute(
            """
            SELECT
                COALESCE(SUM(observation_count), 0)
                    AS total_observations,
                COALESCE(SUM(anomaly_count), 0)
                    AS total_anomalies,
                COUNT(*) AS total_runs
            FROM detection_runs
            """
        ).fetchone()

        total_observations = stats["total_observations"]
        total_anomalies = stats["total_anomalies"]

        normal_observations = (
            total_observations - total_anomalies
        )

        anomaly_rate = (
            (total_anomalies / total_observations) * 100
            if total_observations > 0
            else 0
        )

        # 2. Daily detection trends (last 30 days)
        daily_trends = connection.execute(
            """
            SELECT
                DATE(created_at) AS date,
                COUNT(*) AS total_runs,
                COALESCE(SUM(observation_count), 0)
                    AS total_observations,
                COALESCE(SUM(anomaly_count), 0)
                    AS total_anomalies
            FROM detection_runs
            WHERE DATE(created_at) >= DATE('now', '-29 days')
            GROUP BY DATE(created_at)
            ORDER BY date ASC
            """
        ).fetchall()

        # 3. Model usage statistics
        model_usage = connection.execute(
            """
            SELECT
                model_id,
                COUNT(*) AS total_runs,
                COALESCE(SUM(observation_count), 0)
                    AS total_observations,
                COALESCE(SUM(anomaly_count), 0)
                    AS total_anomalies
            FROM detection_runs
            GROUP BY model_id
            ORDER BY total_runs DESC
            """
        ).fetchall()

        # 4. Recent run anomaly rates
        recent_runs = connection.execute(
            """
            SELECT
                id,
                model_id,
                created_at,
                observation_count,
                anomaly_count
            FROM detection_runs
            ORDER BY id DESC
            LIMIT 10
            """
        ).fetchall()

        run_anomaly_rates = []

        for run in recent_runs:
            observations = run["observation_count"]
            anomalies = run["anomaly_count"]

            rate = (
                (anomalies / observations) * 100
                if observations > 0
                else 0
            )

            run_anomaly_rates.append({
                **dict(run),
                "anomaly_rate": round(rate, 2),
            })

        return {
            "summary": {
                "total_runs": stats["total_runs"],
                "total_observations": total_observations,
                "total_anomalies": total_anomalies,
                "normal_observations": normal_observations,
                "anomaly_rate": round(anomaly_rate, 2),
            },
            "distribution": {
                "normal": normal_observations,
                "anomalous": total_anomalies,
            },
            "daily_trends": [
                dict(row) for row in daily_trends
            ],
            "model_usage": [
                dict(row) for row in model_usage
            ],
            "run_anomaly_rates": run_anomaly_rates,
        }

    finally:
        connection.close()
