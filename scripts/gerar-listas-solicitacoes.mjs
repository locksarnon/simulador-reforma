// Gera em Excel as listas de solicitações ao cliente (uma por serviço do InTAX) a partir do catálogo do sistema,
// para a equipe usar fora do sistema. O catálogo e o layout ficam em src/lib/listaSolicitacoes (fonte única).
//
//   node scripts/gerar-listas-solicitacoes.mjs --saida ./listas                       modelos em branco de todos os serviços
//   node scripts/gerar-listas-solicitacoes.mjs --servico validador-cadastro --cliente "Cliente S.A." --cnpj 00.000.000/0001-00 \
//        --regime "Lucro Real" --erp "Protheus 12" --database 2026-12-31 --envio 2026-11-03 --responsavel "Nome" --contato-fal "nome@fal.com.br"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { LISTAS } from "../src/lib/listaSolicitacoes/catalogo.js";
import { montarPlanilha, nomeArquivo } from "../src/lib/listaSolicitacoes/planilha.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function lerArgs(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const prox = argv[i + 1];
    o[argv[i].slice(2)] = prox !== undefined && !prox.startsWith("--") ? (i++, prox) : true;
  }
  return o;
}
function data(txt, nome) {
  if (!txt || txt === true) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(txt));
  if (!m) throw new Error(`--${nome} deve estar no formato AAAA-MM-DD (recebido: ${txt})`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
const texto = (v) => (v && v !== true ? String(v) : "");

const a = lerArgs(process.argv);
const escolha = !a.servico || a.servico === "todos" ? LISTAS : LISTAS.filter((l) => l.servico === a.servico);
if (!escolha.length) { console.error(`Serviço não encontrado: ${a.servico}. Rotas: ${LISTAS.map((l) => l.servico).join(", ")}`); process.exit(1); }
const dados = {
  cliente: texto(a.cliente), cnpj: texto(a.cnpj), regime: texto(a.regime), erp: texto(a.erp),
  database: data(a.database, "database"), envio: data(a.envio, "envio"),
  responsavel: texto(a.responsavel), contatoCliente: texto(a.contato), contatoFal: texto(a["contato-fal"]),
};
const saida = path.resolve(texto(a.saida) || path.join(raiz, "listas-de-solicitacoes"));
fs.mkdirSync(saida, { recursive: true });
const logo = "data:image/png;base64," + fs.readFileSync(path.join(raiz, "public", "fal-agro-logo.png")).toString("base64");

for (const lista of escolha) {
  const { wb, itens } = montarPlanilha({ ExcelJS, lista, dados, logo });
  const nome = nomeArquivo(lista, dados, LISTAS.indexOf(lista) + 1);
  await wb.xlsx.writeFile(path.join(saida, nome));
  console.log(`ok  ${nome}  (${itens} documentos)`);
}
