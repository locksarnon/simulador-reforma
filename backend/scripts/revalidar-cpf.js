/**
 * Corrige itens da importação XML que ficaram BLOQUEADOS porque o CPF do produtor rural pessoa física
 * foi validado como CNPJ (14 dígitos com zeros à esquerda). Refaz só essa verificação e o resultado
 * final dos itens ainda não confirmados; depois recalcula os contadores dos lotes afetados.
 *
 * Uso: node scripts/revalidar-cpf.js          (aplica)
 *      node scripts/revalidar-cpf.js --simular (só mostra o que mudaria)
 */
const { PrismaClient } = require('@prisma/client');
const { validateCpf } = require('../dist/importacao-xml/shared/xml-utils');

const simular = process.argv.includes('--simular');

const lista = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

(async () => {
  const prisma = new PrismaClient();
  try {
    const itens = await prisma.importacaoXMLItem.findMany({
      where: { resultado_final: 'BLOQUEADO' },
      select: {
        id: true, lote_id: true, status_mapeamento: true,
        validacao_documental_json: true, validacao_cadastral_json: true, validacao_tributaria_json: true, validacao_operacional_json: true,
      },
    });

    let corrigidos = 0;
    let desbloqueados = 0;
    const lotes = new Set();

    for (const it of itens) {
      const doc = lista(it.validacao_documental_json);
      let mudou = false;
      const novoDoc = doc.map((c) => {
        if (c.codigo !== 'DOC_CNPJ_DV_INVALIDO') return c;
        const m = /CNPJ (\d{14})/.exec(c.mensagem || '');
        // CPF completado com zeros: 3 zeros à esquerda + 11 dígitos
        if (!m || !m[1].startsWith('000')) return c;
        const papel = /^Destinat/.test(c.mensagem) ? 'DESTINATARIO' : 'EMITENTE';
        const r = validateCpf(m[1].slice(-11));
        mudou = true;
        if (r.valido) {
          return {
            ...c, codigo: `DOC_CNPJ_${papel}_VALIDO`, status: 'CONFORME', bloqueante: false,
            mensagem: `CPF do ${papel === 'EMITENTE' ? 'emitente' : 'destinatário'} válido (dígito verificador confere).`,
          };
        }
        return { ...c, codigo: r.codigo, mensagem: `${papel === 'EMITENTE' ? 'Emitente' : 'Destinatário'}: ${r.mensagem}` };
      });
      if (!mudou) continue;

      const todos = [...novoDoc, ...lista(it.validacao_cadastral_json), ...lista(it.validacao_tributaria_json), ...lista(it.validacao_operacional_json)];
      const bloqueia = todos.some((c) => c.bloqueante && c.status === 'NAO_CONFORME');
      const alerta = todos.some((c) => c.status === 'ALERTA' || c.status === 'PENDENTE');
      let resultado = bloqueia ? 'BLOQUEADO' : alerta ? 'IMPORTAVEL_COM_ALERTA' : 'IMPORTAVEL';
      if (it.status_mapeamento === 'CNPJ_NAO_LOCALIZADO' || it.status_mapeamento === 'REVISAO_MESMO_CNPJ') resultado = 'BLOQUEADO';

      corrigidos += 1;
      if (resultado !== 'BLOQUEADO') desbloqueados += 1;
      lotes.add(it.lote_id);
      if (!simular) {
        await prisma.importacaoXMLItem.update({ where: { id: it.id }, data: { validacao_documental_json: JSON.stringify(novoDoc), resultado_final: resultado } });
      }
    }

    if (!simular) {
      for (const loteId of lotes) {
        const g = await prisma.importacaoXMLItem.groupBy({ by: ['resultado_final'], where: { lote_id: loteId }, _count: true });
        const n = (k) => g.find((x) => x.resultado_final === k)?._count ?? 0;
        await prisma.importacaoXMLLote.update({
          where: { id: loteId },
          data: {
            itens_importaveis: n('IMPORTAVEL'), itens_importaveis_com_alerta: n('IMPORTAVEL_COM_ALERTA'), itens_bloqueados: n('BLOQUEADO'),
            itens_duplicados: n('DUPLICADO'), itens_cancelados: n('CANCELADO'), itens_confirmados: n('CONFIRMADO'),
          },
        });
      }
    }
    console.log(JSON.stringify({ simulacao: simular, bloqueadosAnalisados: itens.length, corrigidos, desbloqueados, lotes: lotes.size }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
