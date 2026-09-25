# Atualizar produção — Simulador FAL (simulador-reforma)

Guia curto para o time (Claude Code / Cursor). Deploy: **manual** no VPS Clarity (Traefik).

| Item | Valor |
|---|---|
| Domínio | https://simulador.clarityib.com.br |
| Código no servidor | `/var/www/html/simulador-reforma` (confirme com `ls /var/www/html`) |
| Compose | **dois** arquivos: `docker-compose.yml` + `docker-compose.traefik.yml` |
| Env | `.env` **só no servidor**, nunca no Git |
| Containers | `reforma-frontend`, `reforma-backend`, `reforma-postgres`, `reforma-minio` |
| Rede Traefik | `traefik-net` (externa, já existe no VPS) |
| Docker Compose | ≥ 2.24 (precisa de `ports: !override`) |

Os containers montam o código do disco (`./` e `./backend`). Rebuild de imagem **sem** `git pull` no VPS não atualiza o app.

---

## Fluxo obrigatório (cada entrega)

```
1. Ajuste local → teste
2. Commit no Git
3. Push para origin
4. Sync do código no VPS (`git pull`)
5. docker compose (os DOIS yml) up -d --build
6. Smoke test (health + tela afetada)
```

Nunca faça deploy de código que **não** esteja commitado.
Nunca faça push de `.env`, senhas ou chaves.
Nunca rode `cp .env.example .env` num servidor que já tem `.env` — isso quebra Postgres/JWT.

---

## 1. No notebook (dev)

```bash
cd /caminho/para/simulador-reforma
git pull
# ... alterações + teste local: docker compose up -d --build ...
git status
git add <arquivos relevantes>
git commit -m "mensagem clara do porquê"
git push origin HEAD
```

Local **não** usa o overlay Traefik. Só `docker compose up -d --build`.

---

## 2. No VPS (produção)

```bash
cd /var/www/html/simulador-reforma

git pull
git rev-parse --short HEAD   # anote o hash

# NÃO copie .env.example por cima do .env existente
docker compose \
  -f docker-compose.yml \
  -f docker-compose.traefik.yml \
  --env-file .env \
  up -d --build
```

### Rebuild parcial (opcional)

| Mudança | Comando sugerido |
|---|---|
| Só frontend (`src/…`) | mesmo `up -d --build frontend` **depois** do `git pull` |
| API / Prisma / backend | `up -d --build backend` (ou stack completa) |
| `package.json` / Dockerfile / compose | stack completa |

**Não** edite nem sobrescreva o `.env` no servidor sem alinhamento do time.

---

## 3. Smoke test pós-deploy

```bash
docker ps --filter name=reforma-
# Esperar reforma-backend e reforma-frontend = healthy

curl -sk https://simulador.clarityib.com.br/api/v1/health
curl -sk -o /dev/null -w '%{http_code}\n' https://simulador.clarityib.com.br/
```

1. Health API → 200
2. Front carrega (hard refresh se cache)
3. Login + validar a tela/fluxo alterado

Traefik pode responder `404` enquanto o container está `starting`/`unhealthy` — aguarde **healthy**.

Se algo falhar: [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

---

## Checklist rápido

- [ ] `git status` limpo (ou só arquivos intencionais)
- [ ] Commit feito
- [ ] Push feito (`origin` atualizado)
- [ ] `git pull` no VPS no diretório certo
- [ ] Os **dois** compose files no comando
- [ ] `.env` do servidor intacto
- [ ] Containers healthy
- [ ] Health + smoke da feature ok

## Operação do InTAX (extras)

| Assunto | Como |
|---|---|
| Tabela de NCM (Siscomex) | `docker exec reforma-backend node scripts/carregar-ncm.mjs` — reexecutável quando a nomenclatura mudar |
| Backup do banco | `scripts/backup-db.sh` (cron diário às 03h, guarda 14 dias em `/var/backups/simulador-reforma`) |
| Cadastro por convite | `INVITE_CODE` no `.env` do servidor. Vazio = cadastro aberto |
| E-mail (leads, newsletter) | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `NOTIFY_EMAIL` no `.env`. Sem `SMTP_HOST` o envio fica desligado |
| Dependência nova no `package.json` do backend | subir com `up -d --build --force-recreate -V backend` — sem `-V` o volume antigo de `node_modules` esconde o pacote novo |
| Frontend em produção | serve o build (`vite preview`); se o build falhar, cai no modo dev e o erro aparece em `docker logs reforma-frontend` |

Primeiro deploy / secrets: [`FIRST-DEPLOY.md`](./FIRST-DEPLOY.md).
Prompt para o agente: [`PROMPT-AGENTE-DEPLOY.md`](./PROMPT-AGENTE-DEPLOY.md).

## Base legal (texto das normas)

Depois de um deploy que traga novas normas ou mudanças no parser, carregar/atualizar o texto na VPS (dentro do container do backend; não sobrescreve o que não mudou):

```
docker exec reforma-backend node scripts/carregar-base-legal.js            # todas as normas
docker exec reforma-backend node scripts/carregar-base-legal.js lcp-214-2025 --forcar   # reprocessa uma norma
```

As normas ficam em `backend/src/base-legal/fontes.ts` (só URLs oficiais conferidas). O assistente ("Perguntas ao assistente") usa `GEMINI_API_KEY` do `.env`; sem a chave, a tela mostra só os dispositivos relacionados.

Perguntas frequentes revisadas (Base legal): o primeiro lote entra como RASCUNHO, com cada trecho conferido contra o texto da lei (`docker exec reforma-backend node scripts/carregar-cartoes.js`, idempotente). Só depois de "Revisar e publicar" (administrador) os consultores passam a ver cada cartão. Também dá para criar/editar cartões pela própria tela (o trecho é conferido no salvamento).

## ATENÇÃO: o frontend só recompila se o container for recriado

O código do frontend é montado por volume e o build (`npm run build`) roda apenas quando o container **inicia**. `docker compose up -d --build` NÃO recria o container do frontend quando a imagem não mudou — o site continua com a versão antiga (aconteceu em 24–25/09/2026: o backend atualizou, a tela não). Depois de qualquer deploy que mude `src/`, rode:

```
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env up -d --build --force-recreate frontend
```

e confira que o bundle novo está no ar (ex.: `curl -s https://simulador.clarityib.com.br/ | grep -o 'assets/index-[^"]*\.js'` muda de nome e contém o texto novo). Aguarde ~1 min (build + healthcheck).
