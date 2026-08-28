FROM node:22-bookworm-slim

WORKDIR /app

# openssl é exigido pelo engine do Prisma; build-essential/python3 cobrem
# qualquer dependência nativa que precise compilar no install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

EXPOSE 3003

# O código-fonte real vem do bind mount (docker-compose.yml) — editar no
# host e reiniciar o container aplica a mudança, sem rebuild de imagem
# (exceto quando package.json muda).
#
# A cada start: regenera o client do Prisma (garante que bate com o schema
# atual do bind mount), aplica migrações pendentes, compila (nest build,
# sem --watch) e sobe a build compilada.
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npx nest build && node dist/main.js"]
