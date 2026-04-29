# Graduation Project Docker Release

This directory is an isolated release copy for Docker deployment.

## Run with Docker

1) Copy env template:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

2) Start containers:

```bash
docker compose up -d --build
```

After startup:

- Frontend: `http://localhost:8080`
- Backend API (through frontend reverse proxy): `http://localhost:8080/api`

## Stop

```bash
docker compose down
```

## Notes

- Backend reads config from environment variables:
  - `SQLALCHEMY_DATABASE_URI`
  - `JWT_SECRET_KEY`
  - `OLLAMA_MODEL`
- `docker-compose.yml` reads values from `.env` (optional, defaults are provided).
- MySQL data is persisted in Docker volume: `mysql_data`.

## Publish This Copy to a New GitHub Repo

Run these commands in `C:\tmp\graduation-docker-release`:

```bash
git init
git add .
git commit -m "feat: add dockerized deployable release"
git branch -M main
git remote add origin https://github.com/<your-username>/<new-repo>.git
git push -u origin main
```

If you use GitHub CLI:

```bash
gh repo create <new-repo> --public --source . --remote origin --push
```
