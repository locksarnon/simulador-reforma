# Primeiro deploy — Simulador FAL

Checklist para o **primeiro** ambiente em https://simulador.clarityib.com.br

Se o site **já está no ar**, não use este guia — use [`UPDATE.md`](./UPDATE.md). Recriar o `.env` num banco existente derruba o backend.

## Pré-requisitos

- [ ] VPS Clarity com Docker + Traefik (`traefik-net` existente)
- [ ] Docker Compose ≥ 2.24 (`docker compose version`)
- [ ] DNS A: `simulador.clarityib.com.br` → IP do VPS
- [ ] Código deste repo no servidor (padrão: `/var/www/html/simulador-reforma`)
- [ ] Arquivo `.env` criado **no servidor** (nunca no Git)
- [ ] Acesso SSH ao VPS — sem isso não há como publicar

## 1. DNS

| Tipo | Nome | Valor |
|---|---|---|
| A | `simulador` | IP público do VPS |

```bash
dig +short simulador.clarityib.com.br A
```

## 2. Código e secrets no VPS

```bash
sudo mkdir -p /var/www/html
cd /var/www/html
git clone https://github.com/locksarnon/simulador-reforma.git
cd simulador-reforma

cp .env.example .env
nano .env
chmod 600 .env
```

| Variável | Regra |
|---|---|
| `POSTGRES_PASSWORD` | Forte; **não mude** depois que o volume do Postgres existir |
| `MINIO_ROOT_PASSWORD` | Forte; mesma regra do Postgres |
| `JWT_ACCESS_SECRET` | 64 chars hex (32 bytes). Mudar desloga todo mundo |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `15m` / `7d` |

```bash
openssl rand -hex 32
```

## 3. Subir stack

```bash
cd /var/www/html/simulador-reforma
docker network inspect traefik-net >/dev/null   # deve existir
docker compose \
  -f docker-compose.yml \
  -f docker-compose.traefik.yml \
  --env-file .env \
  up -d --build
docker compose \
  -f docker-compose.yml \
  -f docker-compose.traefik.yml \
  --env-file .env \
  ps
```

Aguarde `reforma-backend` e `reforma-frontend` ficarem **healthy**.

O frontend em produção hoje sobe com Vite (`npm run dev`) atrás do Traefik — é o desenho atual, não um nginx estático.

## 4. Smoke

```bash
curl -sk https://simulador.clarityib.com.br/api/v1/health
curl -sk -o /dev/null -w '%{http_code}\n' https://simulador.clarityib.com.br/
```

1. [ ] Health API 200
2. [ ] Front 200 (não a página “Blocked request. This host is not allowed”)
3. [ ] Criar conta em `/register` e logar
4. [ ] Confirmar que a API não aponta para `localhost:3003` (DevTools → Network)

## 5. Rollback rápido

```bash
cd /var/www/html/simulador-reforma
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env down
# Volumes reforma_pg_data / reforma_minio_data são preservados até docker volume rm
```

Não apague volumes sem pedido explícito.

## Referências

- Atualizar: [`UPDATE.md`](./UPDATE.md)
- Erros comuns: [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)
- Prompt do agente: [`PROMPT-AGENTE-DEPLOY.md`](./PROMPT-AGENTE-DEPLOY.md)
