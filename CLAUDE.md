# Simulador FAL (simulador-reforma) — instruções para Claude Code / Cursor

Simulador de Reforma Tributária (React/Vite + NestJS/Prisma + Postgres + MinIO).
Responda sempre em **português**. O contexto técnico está em `AGENTS.md`.

## Entrega (Git + Deploy)

Ao terminar um ajuste, **pergunte** se deve salvar no Git / push / deploy — a menos que o usuário já tenha pedido.

Siga `docs/deploy/UPDATE.md`. Erros: `docs/deploy/TROUBLESHOOTING.md`. Prompt: `docs/deploy/PROMPT-AGENTE-DEPLOY.md`.

### Ordem
1. Código testado localmente (`docker compose up -d --build` **sem** o overlay Traefik)
2. **Commit** (só se pedido)
3. **Push** (só se pedido)
4. **Deploy VPS** (só se pedido): `/var/www/html/simulador-reforma` + `git pull` +
   `docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env up -d --build`
5. Smoke: containers `healthy`, `/api/v1/health` 200, validar a feature

### Proibido
- Commitar `.env`, `.env.local`, `backend/.env`, senhas, tokens, dumps
- `git push --force` em `main`
- Deploy de working tree não commitada
- Sobrescrever `.env` no VPS (`cp .env.example .env` em update)
- Apagar volumes Docker de produção sem pedido explícito
- Subir no VPS só o `docker-compose.yml` (a API vira `localhost:3003`)

### Produção
- Host: https://simulador.clarityib.com.br
- Containers: `reforma-frontend`, `reforma-backend`, `reforma-postgres`, `reforma-minio`
- Aguardar healthy antes de declarar sucesso
- Relatar hash do commit deployado
