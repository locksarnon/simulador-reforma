/**
 * Grava (ou atualiza) as datas oficiais da Agenda da Reforma (idempotente), conferindo cada trecho ligado à Base legal
 * contra o texto carregado. Uso (dentro do container do backend, depois do build): node scripts/carregar-agenda.js
 */
const { PrismaClient } = require('@prisma/client');
const { AgendaReformaService } = require('../dist/agenda-reforma/agenda-reforma.service');
const { RevisaoLegalService } = require('../dist/base-legal/revisao-legal.service');
const { MailService } = require('../dist/mail/mail.service');

(async () => {
  const prisma = new PrismaClient();
  const config = { get: (k) => process.env[k] };
  const mail = new MailService(config);
  try {
    console.log(JSON.stringify(await new AgendaReformaService(prisma, mail, new RevisaoLegalService(prisma, mail)).semear(), null, 2));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
