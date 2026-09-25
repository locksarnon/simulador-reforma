/**
 * Grava o primeiro lote de perguntas frequentes como RASCUNHO (idempotente) depois de conferir cada
 * trecho contra o texto da Base legal. Uso: node scripts/carregar-cartoes.js
 */
const { PrismaClient } = require('@prisma/client');
const { CartoesService } = require('../dist/base-legal/cartoes.service');

(async () => {
  const prisma = new PrismaClient();
  try {
    console.log(JSON.stringify(await new CartoesService(prisma).semear(), null, 2));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
