# OpsLens

**An MLOps-based cloud infrastructure anomaly detection platform.**

OpsLens uses pre-trained Isolation Forest models to identify unusual patterns in cloud infrastructure monitoring data. It provides a web interface for submitting observations, reviewing anomaly results, and exploring detection history.

## Features

- Select from pre-trained Isolation Forest models.
- Submit timestamped numeric observations for anomaly detection.
- View anomaly flags, anomaly scores, and visual summaries.
- Store detection runs and predictions in SQLite.
- Browse previous detection runs.
- Run frontend and backend services using Docker Compose.
- Build and publish images using GitHub Actions and GitHub Container Registry (GHCR).

> **Scope:** OpsLens is an anomaly-detection aid. It does not provide automatic remediation, root-cause diagnosis, or continuous live infrastructure monitoring. The current detection flow accepts JSON observations; it does not dynamically train models from the UI or accept arbitrary CSV uploads.

## Technology stack

| Area | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Python, FastAPI |
| Machine learning | Scikit-learn, Isolation Forest |
| Data processing | NumPy, Pandas |
| Model persistence | Joblib |
| Database | SQLite |
| Containers | Docker, Docker Compose |
| CI/CD | GitHub Actions, GHCR |

## Architecture

```text
Browser
  |
  v
React frontend (localhost:5173)
  |
  | /api requests
  v
Nginx reverse proxy
  |
  v
FastAPI backend (port 8000)
  |---- Pre-trained model artifacts
  |---- Feature engineering and prediction
  |
  v
SQLite database (persistent Docker volume)
```

Nginx serves the React build and proxies `/api/` requests to the backend over the Docker Compose network. SQLite data is stored in a named Docker volume.

## Requirements

- Git
- Docker Engine and Docker Compose v2, or Docker Desktop
- Internet access for the initial image pull

No local Python or Node.js installation is required when using published images.

## Run using published images

```bash
git clone https://github.com/Ujjawal-Bhalla/OpsLens.git
cd OpsLens/opslens
docker compose -f docker-compose.prod.yml up -d
```

Open:
- Frontend: http://localhost:5173
- Backend API documentation: http://localhost:8000/docs

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
```

View logs:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Stop the application:

```bash
docker compose -f docker-compose.prod.yml down
```

This preserves the named database volume. Do not add `-v` unless you intentionally want to delete persisted data.

## Run from source for development

```bash
git clone https://github.com/Ujjawal-Bhalla/OpsLens.git
cd OpsLens/opslens
docker compose up -d --build
```

The regular `docker-compose.yml` builds the images from local source.

## Update a published installation

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Useful commands

| Task | Command |
|---|---|
| Start published images | `docker compose -f docker-compose.prod.yml up -d` |
| Stop | `docker compose -f docker-compose.prod.yml down` |
| Status | `docker compose -f docker-compose.prod.yml ps` |
| Logs | `docker compose -f docker-compose.prod.yml logs -f` |
| Pull latest images | `docker compose -f docker-compose.prod.yml pull` |

## Repository structure

```text
OpsLens/
├── .github/workflows/ci.yml
├── opslens/
│   ├── artifacts/              # Pre-trained models and manifest
│   ├── backend/                # FastAPI backend
│   ├── frontend/               # React frontend
│   ├── docs/
│   │   ├── ARCHITECTURE.md
│   │   └── DEPLOYMENT.md
│   ├── docker-compose.yml      # Development configuration
│   ├── docker-compose.prod.yml # Published-image configuration
│   ├── predict.py
│   └── features.py
└── README.md
```

## CI/CD

The workflow at `.github/workflows/ci.yml` validates the frontend and backend. On pushes to `main`, it builds and publishes images to GHCR, then uses a self-hosted runner to deploy them to the maintainer's local Ubuntu machine.

The self-hosted runner is maintainer infrastructure. Ordinary users do not need it to run OpsLens.

## Limitations and interpretation

- Anomaly scores are model scores, not calibrated probabilities.
- Some evaluation holdouts contain only one class, limiting the usefulness of certain classification metrics.
- Results depend on the selected pre-trained model and supplied observations.
- OpsLens does not automatically connect to cloud-provider monitoring APIs.
- The backend image build expects the `artifacts/` directory and its model files.

## Troubleshooting

### GHCR image pull fails

For public installation, make both GHCR packages public. If packages are private, authenticate with an account/token that has package read access:

```bash
docker login ghcr.io
```

Never commit credentials to the repository.

### Port already in use

The default host ports are 5173 and 8000. Change the host-side port in the Compose `ports` mapping if another application uses either port.

### API requests fail

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs frontend
```

### Detection history is missing

Use the same Compose project and named volume. Avoid `docker compose down -v`, which removes named volumes.

## License

Add the project's chosen license before redistributing it. Until a license is added, do not assume others have permission to reuse or redistribute the source code.
