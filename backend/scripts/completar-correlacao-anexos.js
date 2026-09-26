/**
 * Completa a tabela NCM x anexos (CorrelacaoNcm) com itens da LC 214/2025 que a conferência contra o texto
 * carregado na Base legal (27/09/2026) mostrou faltar. Só entra o que a lei diz de forma inequívoca:
 *   - Anexo I, item 26: Fórmulas dietoterápicas para erros inatos do metabolismo, NCM 2106.9090 (alíquota zero);
 *   - Anexo XV, item 4: Plantas e produtos de floricultura, Capítulo 6 da NCM/SH (alíquota zero).
 * NÃO entram (ambíguos, dependem de destinação ou de decisão do especialista): Anexo IX itens 3 e 19 (capítulos inteiros),
 * Anexo XI (bens de soberania) e Anexo XVII (Imposto Seletivo). Idempotente.
 * Uso: node scripts/completar-correlacao-anexos.js
 */
const { PrismaClient } = require('@prisma/client');

const FONTE = 'LC 214/2025 — completado em 27/09/2026 pela conferência com o texto da Base legal';

const NOVAS = [
  { anexo: 'I', item_lei: 26, ncm: '2106.9090', c_class_trib: '200003', descricao_produto: 'Fórmulas Dietoterápicas para Erros Inatos do Metabolismo da NCM 2106.9090' },
  { anexo: 'XV', item_lei: 4, ncm: '06', c_class_trib: '200014', descricao_produto: 'Plantas e produtos de floricultura relativos à horticultura e cultivados para fins alimentares, ornamentais ou medicinais (Capítulo 6 da NCM/SH)' },
];

(async () => {
  const p = new PrismaClient();
  let criadas = 0;
  for (const n of NOVAS) {
    const ja = await p.correlacaoNcm.findFirst({ where: { anexo: n.anexo, item_lei: n.item_lei, ncm: n.ncm } });
    if (ja) continue;
    await p.correlacaoNcm.create({ data: { ...n, fonte: FONTE } });
    criadas += 1;
  }
  console.log(JSON.stringify({ criadas, jaExistiam: NOVAS.length - criadas }));
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
