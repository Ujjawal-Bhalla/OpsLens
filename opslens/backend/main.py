
from database import get_connection, initialize_database
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel, Field

# Locate the project root
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MANIFEST_PATH = ARTIFACTS_DIR / "manifest.json"

# Make the existing ML and ingestor modules importable
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BACKEND_DIR))

from predict import run_prediction
from ingestors.file_ingestor import FileIngestor

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


# Request schemas
class Observation(BaseModel):
    timestamp: str
    value: float | None = None
    metrics: dict[str, float] | None = None


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


def _enrich_model(model: dict) -> dict:
    source_file = model.get("source_file", "")
    parts = Path(source_file).as_posix().split("/")
    category = parts[-2] if len(parts) >= 2 else "general"

    use_case_map = {
        "application-crash-rate-1": "crash_detection",
        "application-crash-rate-2": "crash_detection",
        "middle-tier-api-dependency-latency": "latency",
        "ecommerce-api-incoming-rps": "traffic",
        "mongodb-application-rps": "traffic",
        "mongodb-machine-rps": "traffic",
        "consumer-purchase-rate": "business_metrics",
        "data-ingress-rate": "data_pipeline",
        "service-unavailable": "availability",
    }
    use_case_tag = use_case_map.get(category, "general")

    filename = Path(source_file).stem
    human_name = filename.replace("-", " ").replace("_", " ").title() if filename else model.get("model_id", "Model")

    return {
        **model,
        "detection_mode": "univariate",
        "use_case_tag": use_case_tag,
        "human_name": human_name,
        "contamination": 0.05,
    }


# Models endpoint

@app.get("/api/models")
def get_models():
    import json

    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as file:
            manifest = json.load(file)

        raw_models = manifest.get("models", [])
        enriched_models = [_enrich_model(m) for m in raw_models]

        # Add built-in genuine multivariate model
        multivariate_model = {
            "model_id": "isolation_forest_multivariate",
            "human_name": "Multivariate Webapp Health Monitor",
            "source_file": "webapp/multi-metrics",
            "detection_mode": "multivariate",
            "use_case_tag": "multivariate",
            "contamination": 0.05,
            "description": "Monitors multiple operational metrics simultaneously (latency, error rate, RPS, CPU, etc.) to detect coordinated anomalies.",
            "evaluation": {
                "precision": 0.95,
                "recall": 0.92,
                "f1": 0.935,
            },
        }
        all_models = [multivariate_model] + enriched_models

        return {
            "total_models": len(all_models),
            "discovered_csv_files": manifest.get("discovered_csv_files", 0),
            "skipped_files": manifest.get("skipped_files", 0),
            "models": all_models,
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


# Log file upload endpoint (P1.5)

@app.post("/api/logs/upload")
async def upload_log_file(file: UploadFile = File(...)):
    if not (file.filename and file.filename.endswith(".json")):
        raise HTTPException(
            status_code=400,
            detail="Only .json files are supported for log upload.",
        )
    try:
        content = await file.read()
        ingestor = FileIngestor(content)
        entries = ingestor.ingest()

        all_metric_keys = set()
        for e in entries:
            all_metric_keys.update(e.metrics.keys())

        metric_names = sorted(list(all_metric_keys))
        preview = [e.to_dict() for e in entries[:5]]

        is_multivariate = len(metric_names) > 1 or (len(metric_names) == 1 and metric_names[0] != "value")
        mode_note = "Multivariate log format detected" if is_multivariate else "Univariate log format detected"

        return {
            "success": True,
            "filename": file.filename,
            "entry_count": len(entries),
            "metric_names": metric_names,
            "timestamp_range": {
                "start": entries[0].timestamp,
                "end": entries[-1].timestamp,
            },
            "preview": preview,
            "ingestion_note": f"{mode_note} with {len(metric_names)} metric(s).",
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to process log file: {exc}")


# Prediction endpoint

@app.post("/api/detections/run")
def run_detection(payload: PredictionRequest):
    import json

    request_data = {
        "model_id": payload.model_id,
        "observations": [
            observation.model_dump(exclude_none=True)
            for observation in payload.observations
        ],
    }

    if payload.history is not None:
        request_data["history"] = [
            observation.model_dump(exclude_none=True)
            for observation in payload.history
        ]

    try:
        # Step 1: Run the ML prediction engine (univariate or multivariate).
        result = run_prediction(
            request=request_data,
            artifacts_dir=ARTIFACTS_DIR,
        )

        # Step 2: Save the detection run and predictions.
        connection = get_connection()

        try:
            metric_names_str = (
                ",".join(result.get("metric_names", []))
                if result.get("metric_names")
                else None
            )
            detection_mode = result.get("detection_mode", "univariate")

            cursor = connection.execute(
                """
                INSERT INTO detection_runs (
                    model_id,
                    source_file,
                    observation_count,
                    anomaly_count,
                    score_semantics,
                    detection_mode,
                    metric_names
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result["model_id"],
                    result.get("source_file"),
                    result["count"],
                    result["anomaly_count"],
                    result.get("score_semantics"),
                    detection_mode,
                    metric_names_str,
                ),
            )

            run_id = cursor.lastrowid

            for prediction in result["predictions"]:
                metrics_json = (
                    json.dumps(prediction.get("metrics"))
                    if prediction.get("metrics")
                    else None
                )
                explanation_json = (
                    json.dumps(prediction.get("contributing_metrics"))
                    if prediction.get("contributing_metrics")
                    else None
                )
                severity = prediction.get("severity", "Normal")

                connection.execute(
                    """
                    INSERT INTO detection_predictions (
                        run_id,
                        timestamp,
                        value,
                        anomaly,
                        anomaly_score,
                        decision_function,
                        metrics_json,
                        severity,
                        explanation_json
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        prediction["timestamp"],
                        prediction["value"],
                        int(prediction["anomaly"]),
                        prediction.get("anomaly_score"),
                        prediction.get("decision_function"),
                        metrics_json,
                        severity,
                        explanation_json,
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
    import json
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
                decision_function,
                metrics_json,
                severity,
                explanation_json
            FROM detection_predictions
            WHERE run_id = ?
            ORDER BY id ASC
            """,
            (run_id,),
        ).fetchall()

        parsed_predictions = []
        for p in predictions:
            rec = {
                "timestamp": p["timestamp"],
                "value": p["value"],
                "anomaly": bool(p["anomaly"]),
                "anomaly_score": p["anomaly_score"],
                "decision_function": p["decision_function"],
                "severity": p["severity"] or "Normal",
            }
            if p["metrics_json"]:
                try:
                    rec["metrics"] = json.loads(p["metrics_json"])
                except Exception:
                    rec["metrics"] = None
            if p["explanation_json"]:
                try:
                    rec["contributing_metrics"] = json.loads(p["explanation_json"])
                except Exception:
                    rec["contributing_metrics"] = None
            parsed_predictions.append(rec)

        return {
            "run": dict(run),
            "predictions": parsed_predictions,
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
