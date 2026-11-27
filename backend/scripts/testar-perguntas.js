/**
 * Faz perguntas ao assistente da Base legal sem gravar nada (nem a pergunta): mostra o contexto achado (UF, NCM), os dispositivos
 * recuperados e a resposta validada. Serve para conferir a base e o assistente depois de carregar ou mudar as normas.
 * Uso (dentro do container do backend, depois do build):
 *   node scripts/testar-perguntas.js "o NCM 1201.90.00 tem incidência de ICMS no Pará?" "trator novo tem desconto de icms?"
 * Sem argumentos, usa uma lista de perguntas de exemplo, de propósito mal formuladas.
 */
const { PrismaClient } = require('@prisma/client');
const { BaseLegalService } = require('../dist/base-legal/base-legal.service');
const { RevisaoLegalService } = require('../dist/base-legal/revisao-legal.service');
const { MailService } = require('../dist/mail/mail.service');
const { lerJson, promptResposta, validarResposta } = require('../dist/base-legal/base-legal.assistente');

const EXEMPLOS = [
  'o NCM 1201.90.00 tem incidência de ICMS no Pará?',
  'soja paga icms no mato grosso?',
  'venda de milho pra fora de goias tem icms',
  'qual a aliquota do icms do adubo no ms',
  'trator novo tem desconto de icms?',
  'o ipi da soja no para',
  'posso tirar nota sem cnpj?',
  // Perguntas práticas: passo a passo e cálculo modelo conferido.
  'como calculo o icms de uma venda de adubo de 100 mil reais dentro do ms? me da um exemplo',
  'o que eu faço para emitir a nota da venda de soja com diferimento no mato grosso?',
];
const { PRAZO_RESPOSTA_PONTE_MS, PRAZO_RESPOSTA_RESERVA_MS } = require('../dist/base-legal/base-legal.service');

(async () => {
  const prisma = new PrismaClient();
  const config = { get: (k) => process.env[k] };
  const mail = new MailService(config);
  const base = new BaseLegalService(prisma, config, new RevisaoLegalService(prisma, mail));
  const perguntas = process.argv.slice(2).length ? process.argv.slice(2) : EXEMPLOS;
  try {
    for (const pergunta of perguntas) {
      const t0 = Date.now();
      const contexto = await base.contextoDaPergunta(pergunta);
      let termos = [];
      try { termos = await base.termosDaPergunta(pergunta); } catch (e) { termos = []; }
      const cands = await base.candidatos(pergunta, termos, contexto);
      let saida = null;
      let modelo = null;
      try {
        // Mesmo caminho e mesmos prazos da pergunta na tela (Claude Fable 5.2 pela ponte; reserva se falhar).
        const r = await base.iaComModelo(promptResposta(pergunta, cands, contexto.texto), PRAZO_RESPOSTA_RESERVA_MS, PRAZO_RESPOSTA_PONTE_MS);
        modelo = r.modelo;
        saida = validarResposta(lerJson(r.texto), cands);
      } catch (e) { saida = { erro: e.message }; }
      const calc = saida.pratica && saida.pratica.calculo;
      console.log(JSON.stringify({
        pergunta, segundos: Math.round((Date.now() - t0) / 1000), modelo, ufs: contexto.ufs, ncms: contexto.ncms, termos,
        dispositivos: cands.map((c) => `${c.numero} ${c.rotulo}${c.nota ? ' (trecho)' : ''}`),
        resposta: saida.resposta ?? saida.erro, suficiente: saida.suficiente, ressalvas: saida.ressalvas,
        fundamentos: (saida.fundamentos || []).map((f) => `${f.numero} ${f.rotulo}`),
        passos: saida.pratica ? saida.pratica.passos : null,
        calculo: calc ? [
          ...calc.premissas.map((p) => `${p.descricao}: ${p.valor_texto} (exemplo)`),
          ...calc.parametros.map((p) => `${p.descricao}: ${p.valor_texto} (${p.fundamento.numero}, ${p.fundamento.rotulo})`),
          ...calc.linhas.map((l) => `${l.descricao}: ${l.conta} = ${l.valor_texto}`),
          ...calc.ajustes.map((a) => `AJUSTE: ${a}`),
        ] : null,
        sem_calculo: saida.pratica ? saida.pratica.sem_calculo : null,
      }, null, 1));
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
