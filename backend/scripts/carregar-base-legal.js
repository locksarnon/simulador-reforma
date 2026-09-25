/**
 * Carrega/atualiza a Base legal a partir das fontes oficiais.
 * Uso (dentro do container do backend, depois do build):
 *   node scripts/carregar-base-legal.js            # todas as normas
 *   node scripts/carregar-base-legal.js lcp-214-2025 [--forcar]
 */
const { PrismaClient } = require('@prisma/client');
const { BaseLegalService } = require('../dist/base-legal/base-legal.service');

(async () => {
  const prisma = new PrismaClient();
  const servico = new BaseLegalService(prisma, { get: (k) => process.env[k] });
  try {
    const args = process.argv.slice(2);
    const forcar = args.includes('--forcar');
    const chave = args.find((a) => !a.startsWith('--'));
    const r = chave ? await servico.importar(chave, { forcar }) : await servico.importarTodas();
    console.log(JSON.stringify(r, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
