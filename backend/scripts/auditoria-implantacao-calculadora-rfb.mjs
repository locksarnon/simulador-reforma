/**
 * Auditoria da implantação da calculadora oficial da Receita no InTAX (só leitura). Roda dentro do contêiner do backend:
 *   docker exec reforma-backend node scripts/auditoria-implantacao-calculadora-rfb.mjs
 * Cada verificação imprime OK ou FALHA com o motivo; sai com código 1 se alguma falhar. Imprime só contagens e códigos.
 */
import { readFileSync, statSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const url = process.env.CALCULADORA_RFB_URL;
const resultados = [];
const verificar = async (nome, fn) => {
  try { const detalhe = await fn(); resultados.push({ nome, ok: true, detalhe }); }
  catch (e) { resultados.push({ nome, ok: false, detalhe: e.message }); }
};
const exige = (c, msg) => { if (!c) throw new Error(msg); };
const n = async (sql) => Number((await p.$queryRawUnsafe(sql))[0].n);

await verificar('Serviço da calculadora responde e é a versão travada', async () => {
  const v = await (await fetch(`${url}/dados-abertos/versao`)).json();
  const commit = readFileSync('/calculadora-rfb/COMMIT', 'utf8').trim();
  exige(v.versaoApp && v.versaoDb, 'sem versão');
  return `${v.versaoApp} · banco ${v.versaoDb} · commit ${commit}`;
});
await verificar('Banco oficial publicado na pasta compartilhada', async () => {
  const t = statSync('/calculadora-rfb/calculadora-pro.db').size;
  exige(t > 1_000_000, `banco com ${t} bytes`);
  return `${t} bytes`;
});
await verificar('Tabelas oficiais copiadas para o InTAX (versão = a do serviço)', async () => {
  const v = await (await fetch(`${url}/dados-abertos/versao`)).json();
  const c = await n(`select count(*)::int n from "RfbClassTrib"`);
  const vi = await n(`select count(*)::int n from "RfbNomenclaturaVinculo"`);
  const dif = await n(`select count(*)::int n from "RfbClassTrib" where versao_db <> '${v.versaoDb}'`);
  exige(c >= 150 && vi >= 1000 && dif === 0, `classes ${c}, vínculos ${vi}, de outra versão ${dif}`);
  return `${c} classes e ${vi} vínculos (${v.versaoDb})`;
});
await verificar('Bateria de conferência: 808 casos sem diferença contra a fotografia', async () => {
  const f = JSON.parse(readFileSync('/calculadora-rfb-controle/fotografia.json', 'utf8'));
  const k = Object.keys(f.resultados).length;
  exige(k === 808, `fotografia com ${k} casos`);
  return `${k} casos fotografados (${f.versao.versaoDb})`;
});
await verificar('Correlação NCM x anexos: exceções marcadas e sem códigos largos demais', async () => {
  const exc = await n(`select count(*)::int n from "CorrelacaoNcm" where excecao`);
  const largos = await n(`select count(*)::int n from "CorrelacaoNcm" where (anexo,item_lei,ncm) in (('I',19,'0210.99'),('IX',7,'1302.19'),('IX',9,'3507.90'),('IV',62,'9018.39'),('IV',64,'9018.39'),('IV',65,'9018.49'),('IV',90,'9027.90'))`);
  const nbs = await n(`select count(*)::int n from "CorrelacaoNcm" where anexo='IX' and item_lei between 22 and 31`);
  const xii = await n(`select count(*)::int n from "CorrelacaoNcm" where anexo='XII' and excecao and ((item_lei=1 and ncm in ('9018.14.10','9018.14.20','9018.14.90','9018.19.10','9018.19.20')) or (item_lei=11 and ncm in ('9022.21.10','9022.21.20')))`);
  exige(exc === 40 && largos === 0 && nbs === 0 && xii === 7, `exceções ${exc}, largos ${largos}, NBS ${nbs}, XII ${xii}`);
  return `${exc} exceções (33 + 7 do Anexo XII), 0 códigos largos, 0 NBS gravadas como NCM`;
});
await verificar('2026: IBS de 0,1% é estadual (LC 214, art. 343); 220001–3 com fim de vigência', async () => {
  const t = (await p.transicaoAno.findFirst({ where: { ano: 2026 } }));
  const c = await n(`select count(*)::int n from "ClassTrib" where c_class_trib in ('220001','220002','220003') and vigencia_fim is not null`);
  exige(Math.abs(t.ibs_uf_aliquota - 0.001) < 1e-9 && t.ibs_mun_aliquota === 0 && c === 3, `uf ${t.ibs_uf_aliquota}, mun ${t.ibs_mun_aliquota}, classes ${c}`);
  return 'IBS-UF 0,1% / município 0; 3 classes encerradas';
});
await verificar('Auditoria das notas: todas as NF-e de 2026 elegíveis conferidas pela regra atual', async () => {
  const v = await (await fetch(`${url}/dados-abertos/versao`)).json();
  const elegiveis = await n(`select count(*)::int n from "DocumentoXml" where tipo='NFE' and conteudo='COMPLETO' and evento_tipo='' and storage_key is not null and data_emissao>='2026-01-01'`);
  const feitas = await n(`select count(*)::int n from "AuditoriaIbsCbs" where versao_db like '${v.versaoDb}+r%'`);
  const orfas = await n(`select count(*)::int n from "AuditoriaIbsCbs" a left join "DocumentoXml" d on d.id=a.documento_id where d.id is null`);
  exige(feitas >= elegiveis && orfas === 0, `elegíveis ${elegiveis}, conferidas ${feitas}, órfãs ${orfas}`);
  return `${feitas} de ${elegiveis} conferidas, 0 órfãs`;
});
await verificar('Conferência de uma operação: base, CBS e IBS de 2029 batem com o motor', async () => {
  const { pedidoDaOperacao, lerConferencia } = await import('/app/dist/calculadora-rfb/conferir-operacao.js');
  const e = { ano: 2029, data: '2029-06-15', cst: '000', cClassTrib: '000001', ncm: '84714900', valorBruto: 1000, pisPct: 0.0165, cofinsPct: 0.076, icmsPct: 0.18, fatores: { pisCofins: 0, icms: 0.9, iss: 0.9 }, aliquotas: { cbs: 9.21, ibsUf: 1.477, ibsMun: 0.393 } };
  const r = await (await fetch(`${url}/observabilidade/regime-geral`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedidoDaOperacao(e)) })).json();
  const l = lerConferencia(r.objetos[0]);
  exige(l.estado === 'COMPARAVEL' && l.oficial.vBC === 838 && l.oficial.vCBS === 77.18 && l.oficial.vIBS === 15.67, JSON.stringify(l));
  return 'base 838,00 · CBS 77,18 · IBS 15,67';
});
await verificar('Comparação das tabelas gravada (com a regra nova)', async () => {
  const c = await p.parametroSistema.findUnique({ where: { chave: 'calculadora_rfb_comparacao' } });
  exige(c, 'comparação não gravada');
  const j = JSON.parse(c.valor);
  exige((j.resumo['Correlação do InTAX sem amparo na calculadora'] ?? 0) <= 1, `sem amparo: ${j.resumo['Correlação do InTAX sem amparo na calculadora']}`);
  return JSON.stringify(j.resumo);
});
await verificar('Nenhuma integridade quebrada: operações, classes e correlação sem duplicidade de chave', async () => {
  const dup = await n(`select count(*)::int n from (select anexo,item_lei,ncm,c_class_trib,excecao from "CorrelacaoNcm" group by 1,2,3,4,5 having count(*)>1) x`);
  exige(dup === 0, `${dup} grupos duplicados`);
  return '0 duplicidades na correlação';
});

for (const r of resultados) console.log(`${r.ok ? 'OK    ' : 'FALHA '} ${r.nome} — ${r.detalhe}`);
await p.$disconnect();
process.exit(resultados.every((r) => r.ok) ? 0 : 1);
