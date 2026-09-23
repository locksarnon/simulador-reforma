/**
 * Carrega/atualiza a tabela oficial de NCM (Siscomex — Nomenclatura Comum do
 * Mercosul, vigente) na tabela "Ncm". Reexecutável: substitui todo o catálogo.
 *
 * Uso (dentro do container do backend):
 *   docker exec reforma-backend node scripts/carregar-ncm.mjs
 *
 * Guarda só os códigos de 8 dígitos (formato usado nas notas), com a descrição
 * composta pela hierarquia (posição › subposição › item), porque muitos itens
 * vêm apenas como "Outros" na tabela original.
 */
import { PrismaClient } from '@prisma/client';

const URL_SISCOMEX = 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json';
const prisma = new PrismaClient();

const digits = (s) => String(s).replace(/\D/g, '');
const limpa = (s) => String(s || '').replace(/^[\s\-–]+/, '').replace(/\s+/g, ' ').trim();
const semDoisPontos = (s) => limpa(s).replace(/[:]+$/, '');
const profundidade = (s) => (String(s || '').match(/^[\s]*(-+)/)?.[1].length ?? 0);

const resp = await fetch(URL_SISCOMEX, { headers: { 'User-Agent': 'Mozilla/5.0 (InTAX)' }, signal: AbortSignal.timeout(90_000) });
if (!resp.ok) throw new Error(`Siscomex respondeu HTTP ${resp.status}`);
const raw = await resp.json();
const ato = raw.Ato;
const vigencia = raw.Data_Ultima_Atualizacao_NCM;

const posicoes = new Map();
for (const it of raw.Nomenclaturas) {
  const d = digits(it.Codigo);
  if (d.length === 4) posicoes.set(d, limpa(it.Descricao));
}

const registros = [];
const vistos = new Set();
let pilha = [];
let posAtual = '';
for (const it of raw.Nomenclaturas) {
  const d = digits(it.Codigo);
  if (d.length === 4) { posAtual = semDoisPontos(it.Descricao); pilha = []; continue; }
  if (d.length < 4) continue;
  const prof = profundidade(it.Descricao);
  if (d.length !== 8) { pilha[prof] = semDoisPontos(it.Descricao); pilha.length = prof + 1; continue; }
  if (vistos.has(d)) continue;
  vistos.add(d);
  const ancestrais = pilha.slice(1, Math.max(prof, 1)).filter(Boolean);
  const pos = posicoes.get(d.slice(0, 4));
  registros.push({
    codigo: d,
    descricao: [posAtual, ...ancestrais, semDoisPontos(it.Descricao)].filter(Boolean).join(' › '),
    status: String(it.Data_Fim || '').endsWith('9999') ? 'Ativo' : 'Inativo',
    observacao: `Posição ${d.slice(0, 4)}${pos ? `: ${pos}` : ''} | ${ato}, ${vigencia}`,
  });
}

if (registros.length < 5000) throw new Error(`Tabela suspeita: só ${registros.length} códigos de 8 dígitos. Abortando sem alterar o banco.`);

await prisma.$transaction(async (tx) => {
  await tx.ncm.deleteMany({});
  for (let i = 0; i < registros.length; i += 2000) {
    await tx.ncm.createMany({ data: registros.slice(i, i + 2000) });
  }
}, { timeout: 120_000 });

console.log(`NCM carregada: ${registros.length} códigos (${ato}, ${vigencia}).`);
await prisma.$disconnect();
