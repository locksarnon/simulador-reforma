export const base = (empresaId) => `/repositorio-xml/empresas/${empresaId}`;

export const TIPOS = { NFE: "NF-e", CTE: "CT-e", MDFE: "MDF-e", NFSE: "NFS-e", EVENTO: "Evento" };

/**
 * Onde baixar nos portais das SEFAZ as notas que o próprio cliente emitiu (a Distribuição de DF-e não as entrega). Levantamento em
 * páginas das próprias SEFAZ em 10/11/2026; os portais mudam, por isso a tela manda conferir. Só há link onde a fonte é oficial.
 */
export const PORTAIS_NOTAS_EMITIDAS = [
  { uf: "MT", texto: "Sefaz Digital, Consulta de NF-e Emitida/Recebida: login de contribuinte ou de contabilista; exporta planilha. O XML em lote sai por formulário (e-Process).", link: "https://www5.sefaz.mt.gov.br/en/-/consulta-de-nf-e" },
  { uf: "MS", texto: "e-Fazenda, Download de NF-e/CT-e/MDF-e, e Autorização de acesso de contador: cadastro com e-CNPJ.", link: "https://efazenda.servicos.ms.gov.br/e-fazenda/inicio.html" },
  { uf: "GO", texto: "Download de arquivos XML (NF-e, NFC-e e CT-e): no site da Economia saem só as notas emitidas, com o certificado da empresa; entradas e saídas, pelo Portal de Acesso Restrito com o login do contabilista.", link: "https://goias.gov.br/economia/economia-implanta-novo-sistema-de-download-de-arquivos-de-nf-e-nfc-e-e-ct-e/" },
  { uf: "MA", texto: "Plataforma SEFAZ-MA: lote mensal de NF-e, NFC-e, CT-e e MDF-e, entradas e saídas; o arquivo fica disponível por poucos dias.", link: null },
  { uf: "PA", texto: "Portal de Serviços da Sefa, Download de Arquivos: NF-e, CT-e e MDF-e, com certificado ou usuário e senha.", link: null },
];

const FUSO = "America/Sao_Paulo";
export const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: FUSO }) : "—");
export const fmtDataHora = (v) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }) : "—");
export const fmtMoeda = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

/** CNPJ (14 posições, já com letras quando alfanumérico) ou CPF (11 dígitos) com a pontuação de costume. */
export function fmtDoc(d) {
  const s = String(d ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (s.length === 14) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  return d || "—";
}

export const ORIGENS = { UPLOAD: "Importação", CAPTURA: "Captura" };

/** Cada pedido de envio leva até 100 arquivos e 100 MB (o servidor recusa pedidos acima de 120 MB): a tela divide o resto em vários pedidos. */
export const ARQUIVOS_POR_ENVIO = 100;
export const BYTES_POR_ENVIO = 100 * 1024 * 1024;
export function dividirEmLotes(arquivos, maxArquivos = ARQUIVOS_POR_ENVIO, maxBytes = BYTES_POR_ENVIO) {
  const lotes = [];
  let atual = [];
  let bytes = 0;
  for (const arquivo of arquivos) {
    if (atual.length && (atual.length >= maxArquivos || bytes + arquivo.size > maxBytes)) { lotes.push(atual); atual = []; bytes = 0; }
    atual.push(arquivo);
    bytes += arquivo.size;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

/**
 * O importador de XML lê NF-e, NFC-e e CT-e (e os eventos deles). NFS-e e MDF-e ele reconhece e ignora, então esses documentos ficam só
 * guardados no repositório e não contam como "falta enviar". Nos eventos, o modelo (55, 65, 57, 67) vem da chave de acesso.
 */
export const importavelNoImportador = (d) => ["NFE", "CTE"].includes(d?.tipo) || (d?.tipo === "EVENTO" && ["55", "65", "57", "67"].includes(d?.modelo));

/** Estados em que estão os clientes da FAL: aparecem primeiro na escolha da UF (MT, MS, GO, MA e PA). */
export const UFS_FOCO = ["51", "50", "52", "21", "15"];

/** Código IBGE da UF, usado como "UF do interessado" na consulta à SEFAZ. */
export const UFS = {
  "12": "AC", "27": "AL", "13": "AM", "16": "AP", "29": "BA", "23": "CE", "53": "DF", "32": "ES", "52": "GO", "21": "MA", "31": "MG",
  "50": "MS", "51": "MT", "15": "PA", "25": "PB", "26": "PE", "22": "PI", "41": "PR", "33": "RJ", "24": "RN", "11": "RO", "14": "RR",
  "43": "RS", "42": "SC", "28": "SE", "35": "SP", "17": "TO",
};
