/** Fonte oficial conferida em 16/10/2026. Sem --aplicar, apenas audita; nunca preenche lacunas por inferência. */
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const URL = 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/anexoviii-correlacaoitemnbsindopcclasstrib_ibscbs_v1-01-00.xlsx';
const FONTE = 'Anexo VIII RTC v1.01.00 — gov.br/nfse';
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const COLS = { item_lc116: ['itemlc116','itemlistaservico','itemsubitem','itemlc1162003'], descricao_item: ['descricaolc116','descricaoitem','descricaodoservico','descricaoservico'], nbs: ['nbs','codigonbs'], descricao_nbs: ['descricaonbs'], ps_onerosa: ['psonerosa','prestacaoonerosa'], adq_exterior: ['adqexterior','adquirenteexterior'], ind_op: ['cindop','indop','indicadordaoperacao'], local_incidencia_ibs: ['localincidenciaibs','localdeincidenciaibs'], c_class_trib: ['cclasstrib','classtrib'], nome_class_trib: ['nomeclasstrib','descricaocclasstrib','descricaoclasstrib'] };
function valor(cell) { const v = cell.isMerged ? cell.master.value : cell.value; if (v == null) return ''; if (typeof v === 'object') { if (v.richText) return v.richText.map(t=>t.text).join('').trim(); return String(v.result ?? v.text ?? '').trim(); } return String(v).trim(); }
async function main() {
 const res = await fetch(URL); if (!res.ok) throw new Error('Fonte oficial indisponível: ' + res.status);
 const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
 let rows = []; let cobertura;
 for (const ws of wb.worksheets) {
   for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
     const cols = {};
     ws.getRow(r).eachCell((cell, c) => { const s = norm(valor(cell)); for (const [k, aliases] of Object.entries(COLS)) if (aliases.includes(s)) cols[k] = c; });
     if (!cols.nbs || !cols.item_lc116 || !cols.c_class_trib) continue;
     cobertura = cols;
     for (let i = r + 1; i <= ws.rowCount; i++) {
       const row = {}; for (const [k,c] of Object.entries(cols)) row[k] = valor(ws.getCell(i,c)) || null;
       if (!row.item_lc116 || !row.nbs || !/\d/.test(row.nbs)) continue;
       row.fonte = FONTE; rows.push(row);
     }
     break;
   }
 }
 if (rows.length < 100 || !cobertura?.descricao_nbs || !cobertura?.ind_op) throw new Error('Layout oficial não reconhecido com segurança. Nenhum dado foi alterado. Confira os cabeçalhos da nova versão.');
 const unicos = [...new Map(rows.map(r => [JSON.stringify(r), r])).values()];
 console.log(JSON.stringify({ fonte: URL, linhas: unicos.length, campos: Object.keys(cobertura), sem_cClassTrib: unicos.filter(r=>!r.c_class_trib).length, sem_cIndOp: unicos.filter(r=>!r.ind_op).length }));
 if (process.argv.includes('--salvar-json')) { require('fs').writeFileSync(require('path').join(__dirname, '../correlacao-servicos-auditoria.json'), JSON.stringify(unicos, null, 2)); }
 if (!process.argv.includes('--aplicar')) return;
 const p = new PrismaClient();
 try { await p.$transaction(async tx => { await tx.correlacaoServico.deleteMany(); await tx.correlacaoServico.createMany({ data: unicos }); }); console.log('Tabela oficial atualizada em transação.'); } finally { await p.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
