# AGENTS.md

## Project Context

Simulador FAL — Reforma Tributária. React/Vite frontend + a self-hosted NestJS/Prisma/PostgreSQL backend (`backend/`), replacing what used to be a Base44-hosted app. Dockerized end-to-end (`docker-compose.yml`).

Start with `README.md` for the Docker workflow.

## Key Files

- `src/` — frontend application source.
- `src/api/base44Client.js` — thin axios client talking to the backend's REST API (kept the historical name/shape so page/hook imports didn't need to change).
- `backend/` — NestJS API (auth, generic entity CRUD, MinIO storage, XML import). See `backend/README.md`.
- `base44/entities/*.jsonc` and `base44/functions/*/entry.ts` — the ORIGINAL Base44 schema/function definitions this project was ported from. Kept for reference (the backend's `prisma/schema.prisma` and `src/importacao-xml/` are the ported, authoritative versions now) — do not wire the frontend back to these.
- `vite.config.js` — fixed dev port 5175, `host: true` for Docker.
- `.env.local` / `backend/.env` — local env vars; never commit secrets.

## Working Notes

- Default local workflow: `docker compose up -d --build` from the project root.
- Frontend-only dev against an already-running backend: `npm run dev` (needs `VITE_API_URL` pointing at the backend, see `.env.local`).
- Backend dev: `cd backend && npm run start:dev` (needs Postgres/MinIO reachable — `docker compose up -d postgres minio` covers that).
- Prisma schema changes: edit `backend/prisma/schema.prisma`, then `npx prisma migrate dev --name <description>` against a running Postgres to generate a migration, commit the generated `backend/prisma/migrations/*` folder.
- Run `npm run lint` (frontend) / `npm run build` (backend, via `nest build`) before finishing code changes.
