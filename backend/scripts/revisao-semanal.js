/**
 * Roda a revisão semanal da Base de conhecimento legal agora (a mesma que roda toda segunda-feira, às 5h): relê o texto oficial
 * das normas, confere a legislação federal nova, cruza as alterações, lê os portais oficiais e faz a pesquisa na web.
 * Uso (dentro do container do backend, depois do build):
 *   node scripts/revisao-semanal.js
 * A primeira rodada carrega todas as normas do catálogo e leva vários minutos. O resultado fica na aba "Revisão semanal".
 */
const { PrismaClient } = require('@prisma/client');
const { BaseLegalService } = require('../dist/base-legal/base-legal.service');
const { RevisaoLegalService } = require('../dist/base-legal/revisao-legal.service');
const { RevisaoSemanalService } = require('../dist/base-legal/revisao-semanal.service');
const { MailService } = require('../dist/mail/mail.service');

(async () => {
  const prisma = new PrismaClient();
  const config = { get: (k) => process.env[k] };
  const mail = new MailService(config);
  const base = new BaseLegalService(prisma, config, new RevisaoLegalService(prisma, mail));
  const revisao = new RevisaoSemanalService(prisma, config, base, mail);
  try {
    const r = await revisao.executar('manual');
    if (!r) { console.log('Já existe uma revisão em andamento: nada foi iniciado.'); return; }
    const rodada = await revisao.obter(r.id);
    console.log(JSON.stringify({ id: r.id, status: r.status, resumo: rodada?.resumo, erros: rodada?.erros, novidades: rodada?.novidades?.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
