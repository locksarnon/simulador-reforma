# Simulador Reforma — API

Backend do InTAX (NestJS + Prisma + PostgreSQL + MinIO). Porta padrão: `3003`, prefixo `api/v1`.

## Módulos

- `auth/` — registro/login/refresh/logout/me, JWT + argon2. Sem OAuth do Google e sem verificação por e-mail (sem infraestrutura de e-mail neste ambiente self-hosted — o link de redefinição de senha é logado no console do backend).
- `entities/` — CRUD genérico (`GET/POST /entities/:model`, `GET/PUT/DELETE /entities/:model/:id`, `POST /entities/:model/query`, `/bulk-create`, `/bulk-update`) para as entidades de dados do simulador. Os modelos estão em `prisma/schema.prisma`; a lista dos que o CRUD expõe fica em `src/entities/entities.service.ts`.
- `storage/` — upload de arquivo para MinIO (`POST /uploads`), retorna uma URL pré-assinada.
- `importacao-xml/` — importação de XML de NF-e (`POST /xml/processar-lote`, `/xml/confirmar-importacao`, `/xml/reprocessar-lote`): parsing e validação em camadas, dedup, geração de Operações a partir dos itens confirmados.

## Comandos

```bash
npm install
npx prisma generate
npx prisma migrate deploy   # aplica migrações num Postgres já rodando
npm run start:dev           # nest start --watch
```

`prisma migrate dev` (cria uma nova migração a partir de mudanças no `schema.prisma`) precisa de um Postgres acessível — suba um com `docker compose up -d postgres` a partir da raiz do projeto.
