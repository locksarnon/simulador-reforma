# Simulador FAL — Reforma Tributária

Simulador de impactos da Reforma Tributária (IBS/CBS) para grupos econômicos: cadastro de empresas, operações, cenários, transição 2026–2033, catálogos IBS/CBS e importação de XML de NF-e.

Este projeto começou como um app Base44 (frontend React/Vite + backend hospedado). Agora roda com um **backend próprio** (NestJS + PostgreSQL + MinIO), totalmente Dockerizado — a integração com a plataforma Base44 (`@base44/sdk`, `@base44/vite-plugin`, publish-back para o Builder) foi removida.

## Rodar com Docker (recomendado)

Pré-requisito: Docker Desktop.

```bash
docker compose up -d --build
```

Serviços:

| Serviço  | URL                              |
|----------|-----------------------------------|
| Frontend | http://localhost:5175             |
| Backend  | http://localhost:3003/api/v1      |
| Postgres | localhost:5435                    |
| MinIO    | http://localhost:9200 (API), http://localhost:9201 (console) |

Logs: `docker compose logs -f backend` (o link de redefinição de senha, por exemplo, é logado aqui — não há envio de e-mail neste ambiente).

Ao acessar o frontend pela primeira vez você será redirecionado para `/login` — crie uma conta em `/register`.

## Rodar localmente sem Docker

Backend:

```bash
cd backend
npm install
npx prisma migrate deploy
npm run start:dev
```

Requer Postgres e MinIO acessíveis — ajuste `backend/.env` (por padrão aponta para `127.0.0.1:5435`/`127.0.0.1:9200`, os mesmos apontados pelo `docker-compose.yml`; suba só esses dois serviços com `docker compose up -d postgres minio` e rode o backend fora do Docker).

Frontend:

```bash
npm install
npm run dev
```

`.env.local` já aponta `VITE_API_URL` para `http://localhost:3003/api/v1`.

## Docs & Support

Ver [backend/README.md](backend/README.md) para detalhes do backend.
