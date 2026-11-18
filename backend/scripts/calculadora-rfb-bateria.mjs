/**
 * Bateria de conferência da calculadora oficial da Receita (CBS/IBS): roda os casos fixos (calculadora-rfb-casos.json:
 * base do art. 12 de 2026 a 2033 e 792 itens = 99 cClassTrib × 8 anos) contra uma instância da calculadora e compara com a
 * fotografia da versão em uso. Serve para mostrar ao administrador o que muda antes de trocar de versão.
 *
 * Uso (dentro do contêiner do backend):
 *   node scripts/calculadora-rfb-bateria.mjs <url da API> <pasta de controle> fotografar   → grava fotografia.json
 *   node scripts/calculadora-rfb-bateria.mjs <url da API> <pasta de controle> comparar <id> → grava bateria-<id>.json
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [url, pasta, modo, id] = process.argv.slice(2);
if (!url || !pasta || !['fotografar', 'comparar'].includes(modo)) {
  console.error('uso: calculadora-rfb-bateria.mjs <url> <pasta> fotografar|comparar [id]');
  process.exit(2);
}
const casos = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'calculadora-rfb-casos.json'), 'utf8'));

async function post(caminho, corpo) {
  const r = await fetch(url + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(120_000) });
  return { http: r.status, json: await r.json().catch(() => null) };
}

/** Resultado de cada caso reduzido ao que importa: estado, códigos de erro e valores. */
async function rodar() {
  const saida = {};
  for (const c of casos.base) {
    const r = await post('/base-calculo/base-calculo-unificada', c);
    saida[`base ${c.anoFatoGerador} ${c.natureza}`] = r.json ? { baseRG: r.json.baseRG, baseIS: r.json.baseIS, baseSN: r.json.baseSN } : { http: r.http };
  }
  for (const lote of casos.calculo) {
    const r = await post('/observabilidade/regime-geral', lote);
    const objs = r.json?.objetos ?? [];
    for (const item of lote.itens) {
      const o = objs.find((x) => x.nObj === item.numero);
      const g = o?.tribCalc?.IBSCBS?.gIBSCBS;
      saida[`${lote.dhFatoGerador.slice(0, 4)} ${item.cClassTrib}`] = o
        ? { estado: o.estadoItem, erros: (o.erros ?? []).map((e) => e.codigo ?? e.code ?? '').sort(), vBC: g?.vBC ?? null, vIBSUF: g?.gIBSUF?.vIBSUF ?? null, vIBSMun: g?.gIBSMun?.vIBSMun ?? null, vCBS: g?.gCBS?.vCBS ?? null, dif: !!(g?.gCBS?.gDif || g?.gIBSUF?.gDif) }
        : { http: r.http };
    }
  }
  const v = await fetch(url + '/dados-abertos/versao', { signal: AbortSignal.timeout(30_000) }).then((r) => r.json()).catch(() => null);
  return { versao: v, gerado_em: new Date().toISOString(), resultados: saida };
}

const atual = await rodar();
if (modo === 'fotografar') {
  writeFileSync(join(pasta, 'fotografia.json'), JSON.stringify(atual));
  console.log(JSON.stringify({ fotografia: Object.keys(atual.resultados).length, versao: atual.versao }));
} else {
  const arq = join(pasta, 'fotografia.json');
  const antes = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : null;
  const diferencas = [];
  for (const [k, v] of Object.entries(atual.resultados)) {
    const a = antes?.resultados?.[k];
    if (JSON.stringify(a) !== JSON.stringify(v)) diferencas.push({ caso: k, antes: a ?? null, depois: v });
  }
  const relatorio = { id, versao_antes: antes?.versao ?? null, versao_depois: atual.versao, casos: Object.keys(atual.resultados).length, diferencas: diferencas.length, lista: diferencas.slice(0, 500), gerado_em: atual.gerado_em, sem_fotografia: !antes };
  writeFileSync(join(pasta, `bateria-${id}.json`), JSON.stringify(relatorio));
  console.log(JSON.stringify({ casos: relatorio.casos, diferencas: relatorio.diferencas }));
}
