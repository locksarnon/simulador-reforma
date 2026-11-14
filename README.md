# InTAX — Reforma Tributária

Simulador de impactos da Reforma Tributária (IBS/CBS) para grupos econômicos: cadastro de empresas, operações, cenários, transição 2026–2033, catálogos IBS/CBS e importação de XML de NF-e.

Frontend React/Vite e **backend próprio** (NestJS + PostgreSQL + MinIO), totalmente Dockerizados. O motor de cálculo fica em `src/motor/`.

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

## Deploy em produção (VPS + Traefik)

Produção: [https://simulador.clarityib.com.br](https://simulador.clarityib.com.br)

**Não** publique com `docker compose up` no notebook. O VPS precisa dos **dois** arquivos de compose, de um `.env` que já existe no servidor, e de `git pull` (o código é bind-mount).

```bash
cd /var/www/html/simulador-reforma
git pull
docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env up -d --build
```

- Atualizar: [docs/deploy/UPDATE.md](docs/deploy/UPDATE.md)
- Primeiro ambiente: [docs/deploy/FIRST-DEPLOY.md](docs/deploy/FIRST-DEPLOY.md)
- Deu erro: [docs/deploy/TROUBLESHOOTING.md](docs/deploy/TROUBLESHOOTING.md)

Nunca rode `cp .env.example .env` num servidor que já tem banco — isso troca a senha do Postgres/JWT e o backend cai.

## Docs & Support

Ver [backend/README.md](backend/README.md) para detalhes do backend.

### Recuperação histórica de NF-e

Em Repositório de XML, na aba NF-e, o administrador pode cruzar as EFDs ICMS/IPI guardadas pelo ReceitanetBX com os XMLs do estabelecimento. A prévia é gratuita e indica competências cuja cobertura é desconhecida. A fila consulta apenas chaves pendentes de NF-e modelo 55, com limite de 5.000 consultas por lote autorizado.

A execução exige as credenciais do contrato **Consulta NF-e** em `SERPRO_NFE_CONSUMER_KEY` e `SERPRO_NFE_CONSUMER_SECRET`, configuradas no ambiente do backend. Em **Administração → Custos**, informe o preço por consulta desse contrato. Depois da migração, valide em um lote pequeno de notas emitidas e recebidas antigas. Confirme a disponibilidade e a recuperação do XML com assinatura e protocolo antes de liberar lotes extensos.
