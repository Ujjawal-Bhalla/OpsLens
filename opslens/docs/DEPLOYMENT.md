# OpsLens Deployment Guide

This guide describes running OpsLens locally using prebuilt images published to GitHub Container Registry (GHCR).

## Prerequisites

Install Git and Docker Engine with Docker Compose v2, or Docker Desktop.

Verify:

```bash
docker --version
docker compose version
```

## First-time installation

```bash
git clone https://github.com/Ujjawal-Bhalla/OpsLens.git
cd OpsLens/opslens
docker compose -f docker-compose.prod.yml up -d
```

Open:
- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs

The production Compose file creates a named volume for SQLite automatically.

## GHCR package access

For the simplest installation, make both GHCR packages public. If either package is private, authenticate using an account/token with package read permission:

```bash
docker login ghcr.io
```

Do not commit credentials to the repository.

## Status and logs

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

Service-specific logs:

```bash
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs frontend
```

## Stop and update

Stop without deleting database data:

```bash
docker compose -f docker-compose.prod.yml down
```

Pull and run newer published images:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Data persistence warning

The named SQLite volume survives `docker compose down` and container replacement.

This command deletes the Compose project's named volumes and can permanently remove detection history:

```bash
docker compose -f docker-compose.prod.yml down -v
```

Only run it when intentionally erasing persisted application data.

## Port conflicts

Default host ports are 5173 (frontend) and 8000 (backend). Change the host-side port, the value before the colon in `ports`, if either is occupied.

## Development mode

To build images from source:

```bash
docker compose up -d --build
```

This uses the regular development `docker-compose.yml`.

## Maintainer-only automatic deployment

The GitHub Actions workflow includes a self-hosted deployment job for the maintainer's Ubuntu machine. It requires an online repository runner, Docker access for the runner account, GHCR read access, and the repository checkout.

Ordinary users do not need to install or configure a GitHub Actions runner.
