# Deploy travou — o que costuma ser

O colaborador **não** publica o app rodando `docker compose up` no notebook. Produção é o VPS Clarity, domínio [https://simulador.clarityib.com.br](https://simulador.clarityib.com.br), comando com **dois** compose files.

## Antes de qualquer coisa

```bash
docker compose version          # precisa ≥ 2.24
docker network inspect traefik-net
ls -la .env                     # tem que existir no servidor; NÃO recriar
git rev-parse --show-toplevel
git log -1 --oneline
docker ps -a --filter name=reforma-
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env ps
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env logs --tail=80
```

---

## Erros na hora do `compose up`

| Sintoma | Causa | O que fazer |
|---|---|---|
| `network traefik-net declared as external, but could not be found` | Overlay Traefik num host sem a rede (notebook, VPS novo) | No VPS a rede já existe. No **local**, não use `docker-compose.traefik.yml`. Só `docker compose up -d --build`. |
| `unknown tag !override` / YAML inválido em `ports` | Docker Compose &lt; 2.24 | Atualizar Docker / Docker Compose. |
| `env file .env not found` | Esqueceu o `.env` no servidor | Primeiro deploy: `cp .env.example .env` e preencha. Update: o `.env` **já** tem que estar lá. |
| `pull access denied` / timeout em `minio/minio` | Docker Hub bloqueando MinIO | O compose já usa `quay.io/minio/minio`. Faça `git pull` — árvore velha ainda aponta para Docker Hub. |
| `failed to bind host port 5175/3003/5435/9200` | Subiu **só** `docker-compose.yml` no VPS | Falta o overlay, que zera as ports e deixa o Traefik expor. Use os dois `-f`. |
| `POSTGRES_PASSWORD` interpolado vazio | `--env-file` ausente ou `.env` incompleto | Passe `--env-file .env` e confira as chaves do `.env.example`. |
| Frontend sobe, API chama `http://localhost:3003` | Overlay Traefik não aplicado | Sem overlay, `VITE_API_URL` fica `localhost:3003` — funciona só na máquina do servidor. Recrie com os dois yml. |

## Containers sobem, site não

| Sintoma | Causa | O que fazer |
|---|---|---|
| Traefik 404 | Container `starting` / `unhealthy` | `docker ps` e espere healthy. Logs do `reforma-backend` (Prisma migrate costuma ser o gargalo). |
| `Blocked request. This host is not allowed` | Vite recusou o Host | `vite.config.js` precisa de `allowedHosts: ['simulador.clarityib.com.br', '.clarityib.com.br']`. `git pull` e recrie o frontend. |
| Front 200, API CORS / Network error | Overlay não setou `CORS_ORIGINS` / `VITE_API_URL` | Confirme que o comando incluiu `docker-compose.traefik.yml`. |
| Backend reinicia em loop | `.env` novo com senha de Postgres diferente da do volume | **Não** recrie o `.env`. Restaure as senhas originais do servidor. |
| `reforma-frontend` never healthy | Backend não ficou healthy (`depends_on`) | Trate o backend primeiro: `docker logs reforma-backend`. |
| Código “não atualizou” depois do `--build` | Esqueceu `git pull` | Imagem copia pouco; o código vivo é bind-mount. Sem pull no disco do VPS, o container continua no commit antigo. |

## Auth / banco

| Sintoma | Causa | O que fazer |
|---|---|---|
| Login falha para todo mundo após o deploy | `JWT_ACCESS_SECRET` foi trocado | Recoloque o secret antigo. Não rotacione no update. |
| Migração Prisma falha no boot | Migration nova incompatível, ou `DATABASE_URL` errada | `docker logs reforma-backend`. Não apague o volume. |
| Reset de senha “não chega e-mail” | Não há SMTP neste app | O link sai em `docker logs reforma-backend`. |

## Acesso

| Sintoma | Causa | O que fazer |
|---|---|---|
| “Não consigo fazer deploy” no notebook | Produção não é o Docker local | Precisa de SSH no VPS Clarity. Sem chave/usuário, peça acesso a quem já publica Método FAL / AllDebt. |
| `git pull` pede auth / 404 | Clone apontando para outro remote, ou pasta errada | `git remote -v` deve ser `https://github.com/locksarnon/simulador-reforma.git`. Repo é **público**. |
| Permissão negada em `/var/www/html` | Usuário SSH sem escrita | `sudo` ou entrar no grupo que dono do diretório. |

## Comando certo vs errado

```bash
# ERRADO — local, ou VPS sem Traefik (API fica localhost)
docker compose up -d --build

# ERRADO — apaga senhas de um ambiente que já roda
cp .env.example .env

# ERRADO — um arquivo só no VPS (portas publicadas, sem TLS)
docker compose -f docker-compose.traefik.yml up -d --build

# CERTO — produção
cd /var/www/html/simulador-reforma
git pull
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env up -d --build
```
