# Simulador Reforma — API

Backend próprio (NestJS + Prisma + PostgreSQL) que substitui o backend hospedado do Base44. Porta padrão: `3003`, prefixo `api/v1`.

## Módulos

- `auth/` — registro/login/refresh/logout/me, JWT + argon2. Sem OAuth do Google e sem verificação por e-mail (sem infraestrutura de e-mail neste ambiente self-hosted — o link de redefinição de senha é logado no console do backend).
- `entities/` — CRUD genérico (`GET/POST /entities/:model`, `GET/PUT/DELETE /entities/:model/:id`, `POST /entities/:model/query`, `/bulk-create`, `/bulk-update`) para as 14 entidades de dados do simulador (Grupo, Empresa, Operacao, Cenario, TransicaoAno, ClassTrib, CstIbsCbs, CredPres, Configuracao, Diagnostico, ImportacaoXMLLote, ImportacaoXMLArquivo, ImportacaoXMLItem, HistoricoXML). Lista de modelos permitidos em `src/entities/entities.service.ts`.
- `storage/` — upload de arquivo para MinIO (`POST /uploads`), retorna uma URL pré-assinada.
- `importacao-xml/` — porte de `base44/functions/processarLoteXML` e `.../confirmarImportacaoXML` (raiz do projeto) para o backend próprio: parsing/validação de XML de NF-e, dedup, geração de Operações a partir dos itens confirmados.

## Comandos

```bash
npm install
npx prisma generate
npx prisma migrate deploy   # aplica migrações num Postgres já rodando
npm run start:dev           # nest start --watch
```

`prisma migrate dev` (cria uma nova migração a partir de mudanças no `schema.prisma`) precisa de um Postgres acessível — suba um com `docker compose up -d postgres` a partir da raiz do projeto.
