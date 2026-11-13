# OpsLens Architecture

## Overview

OpsLens is a web application that detects unusual patterns in cloud infrastructure monitoring observations using pre-trained Isolation Forest models.

## Components

### Frontend

The React application lets users select a model, submit observations, view prediction results, and browse detection history.

### Reverse proxy

Nginx serves the built React application. Requests beginning with `/api/` are proxied to the backend service over the Docker Compose network.

### Backend

The FastAPI service exposes the application API. It loads saved model artifacts, applies feature engineering, performs anomaly predictions, and returns results to the frontend.

### Machine-learning layer

The project uses pre-trained Isolation Forest models. Feature engineering transforms submitted observations into the model's expected inputs. The web interface does not dynamically train models.

Anomaly scores are model outputs, not probabilities.

### Persistence

SQLite stores detection-run metadata and individual predictions. In Docker, the database path is `/data/opslens.db`, mounted to a named volume.

## Request flow

1. A user opens the React application.
2. The frontend sends requests using the `/api` base path.
3. Nginx proxies API requests to FastAPI.
4. The backend processes submitted observations and selects the requested saved model.
5. Feature engineering transforms observations.
6. Isolation Forest produces predictions and scores.
7. The backend stores run and prediction details in SQLite.
8. The frontend displays results and historical data.

## Container topology

```text
Host machine
|
+-- frontend container
|   +-- Nginx serves React build
|   +-- /api/* proxies to backend:8000
|   +-- host port 5173 -> container port 80
|
+-- backend container
|   +-- FastAPI / Uvicorn
|   +-- host port 8000 -> container port 8000
|   +-- /data mounted to opslens_data volume
|
+-- Docker network
|
+-- named volume: opslens_data
    +-- SQLite database
```

## Model and evaluation caveats

The project includes 60 trained Isolation Forest models built from cloud-monitoring datasets. Some evaluation holdouts contain only one class, which limits the interpretation of certain classification metrics. Do not present anomaly scores as probabilities or claim guaranteed prediction of future incidents.

## System boundaries

OpsLens currently analyzes observations submitted to its API, uses saved models, records detection runs, and provides dashboard and historical views.

It does not currently continuously scrape live infrastructure metrics, automatically remediate infrastructure, diagnose root causes, train models from the web UI, or accept arbitrary CSV uploads through the detection flow.
