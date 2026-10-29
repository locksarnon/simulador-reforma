# AGENTS.md

## Project Context

InTAX — Reforma Tributária (repo `simulador-reforma`). React/Vite frontend + NestJS/Prisma/PostgreSQL backend (`backend/`). Dockerized end-to-end (`docker-compose.yml`).

Start with `README.md` for the Docker workflow.

## Key Files

- `src/` — frontend application source.
- `src/api/client.js` — axios client for the backend's REST API. One `api` object: direct calls (`api.get/post/put/delete/upload/baixar`), `api.entities.<Name>` (CRUD), `api.auth`, `api.functions.invoke` and `api.integrations.Core`.
- `src/motor/` — the calculation engine (`taxEngine.js`, `simplesHibrido.js`) and its tests. Pure JS, runs in the browser. Bump `VERSAO_MOTOR` in `taxEngine.js` whenever a formula changes.
- `backend/` — NestJS API (auth, generic entity CRUD, MinIO storage, XML import). See `backend/README.md`. `backend/prisma/schema.prisma` is the data model; `backend/src/importacao-xml/` is the NF-e XML import.
- `vite.config.js` — fixed dev port 5175, `host: true` for Docker.
- `.env.local` / `backend/.env` — local env vars; never commit secrets.

## Working Notes

- Default local workflow: `docker compose up -d --build` from the project root.
- Frontend-only dev against an already-running backend: `npm run dev` (needs `VITE_API_URL` pointing at the backend, see `.env.local`).
- Backend dev: `cd backend && npm run start:dev` (needs Postgres/MinIO reachable — `docker compose up -d postgres minio` covers that).
- Prisma schema changes: edit `backend/prisma/schema.prisma`, then `npx prisma migrate dev --name <description>` against a running Postgres to generate a migration, commit the generated `backend/prisma/migrations/*` folder.
- Run `npm run lint` (frontend) / `npm run build` (backend, via `nest build`) before finishing code changes.
- Deploy VPS: `docs/deploy/UPDATE.md`. Erros comuns: `docs/deploy/TROUBLESHOOTING.md`. Nunca `cp .env.example .env` em produção já existente. Comando: `docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env up -d --build` depois de `git pull` em `/var/www/html/simulador-reforma`.
