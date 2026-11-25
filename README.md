# botyard

Botyard is a small Platform-as-a-Service (PaaS) for deploying and running Telegram and Discord bots. Upload a ZIP or point Botyard at a GitHub repository; it builds a Docker container, starts it, and gives you lifecycle controls, deployment status, and live logs.

## Features

- Deploy from a ZIP upload or a public GitHub repository
- Automatic Node.js and Python runtime detection
- Isolated Docker containers with CPU, memory, and process limits
- Start, stop, and restart deployed bots
- Queued deployments backed by BullMQ and Redis
- Build logs persisted to disk and live runtime logs over Server-Sent Events
- React dashboard for bots, deployments, logs, and settings

## Tech stack

- **Backend:** Node.js, Express, PostgreSQL, BullMQ, Redis, Dockerode
- **Frontend:** React 19, Vite
- **Runtime:** Docker containers for deployed bots

## Prerequisites

- Node.js 18 or newer
- PostgreSQL
- Redis 7 or newer
- Docker daemon (required for building and running bots)
- Git (required for GitHub-based deployments)

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

   On macOS/Linux:

   ```bash
   cp .env.example .env
   ```

3. Set the required values in `.env`:

   ```env
   DATABASE_URL=postgres://user:password@host:5432/dbname
   JWT_SECRET=replace-with-a-long-random-secret
   PORT=3000
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   ```

   `BASE_DIR` is optional and defaults to the project root.

4. Start Redis:

   ```bash
   docker run -d --name botyard-redis -p 6379:6379 redis:7-alpine
   ```

5. Make sure PostgreSQL is running. Botyard applies `db/schema.sql` automatically when the server starts.

6. Start the API:

   ```bash
   npm start
   ```

   The API listens on `http://localhost:3000` by default.

7. In another terminal, start the frontend development server:

   ```bash
   npm run dev
   ```

   The Vite app runs on `http://localhost:5173` and calls the API at `http://localhost:3000` unless `VITE_API_URL` is set.

## Production build

```bash
npm run build
npm start
```

When `dist/` exists, the Express server serves the built frontend.

## Deployment requirements

A bot's source must contain:

- `Worker` with an `entrypoint:` line
- `runtime.txt`
- Exactly one of `package.json` or `requirements.txt`

ZIP uploads are limited to 20 MB.

## Project structure

```text
db/          PostgreSQL schema
server/      Express API, controllers, Docker buildpack, queue, logging
src/         React frontend
server.js    API entrypoint
```

## Notes

- The Botyard app runs on the host. Docker is used for Redis locally and for deployed bot containers.
- Do not commit `.env`, `bots/`, `users/`, `uploads/`, `logs/`, or `dist/`.
