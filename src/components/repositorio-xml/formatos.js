export const base = (empresaId) => `/repositorio-xml/empresas/${empresaId}`;

export const TIPOS = { NFE: "NF-e", CTE: "CT-e", MDFE: "MDF-e", NFSE: "NFS-e", EVENTO: "Evento" };

/**
 * As abas de documentos da empresa, uma por tipo de documento (como no menu do Notalize): só os documentos dele, com o XML completo;
 * os eventos e os resumos ficam na aba Resumos e eventos SEFAZ. `tipo` é o tipo do documento no repositório; `vazio` é o texto da tabela
 * quando não há nenhum.
 */
export const ABAS_DE_DOCUMENTOS = [
  { valor: "nfe", grupo: "NFE", tipo: "NFE", rotulo: "NF-e | NFC-e", vazio: "Nenhuma NF-e ou NFC-e neste repositório ainda. Envie os XML do cliente acima." },
  { valor: "cte", grupo: "CTE", tipo: "CTE", rotulo: "CT-e", vazio: "Nenhum CT-e neste repositório ainda. Envie os XML do cliente acima." },
  { valor: "nfse", grupo: "NFSE", tipo: "NFSE", rotulo: "NFS-e", vazio: "Nenhuma NFS-e neste repositório ainda. Envie os XML do cliente acima." },
  { valor: "mdfe", grupo: "MDFE", tipo: "MDFE", rotulo: "MDF-e", vazio: "Nenhum MDF-e neste repositório ainda. Envie os XML do cliente acima." },
];

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

/**
 * O PDF existe para NF-e (DANFE, modelo 55), NFC-e (DANFE NFC-e, 65), CT-e (DACTE, 57), MDF-e (DAMDFE, 58) e NFS-e Nacional
 * (DANFSe), desde que o XML completo esteja guardado. Evento, CT-e OS (67) e documento que é só resumo ficam apenas em XML.
 */
export const temPdf = (d) => {
  if (d?.conteudo !== "COMPLETO") return false;
  if (d.tipo === "NFE") return d.modelo === "55" || d.modelo === "65";
  if (d.tipo === "CTE") return d.modelo === "57";
  if (d.tipo === "MDFE") return d.modelo === "58";
  return d.tipo === "NFSE";
};

/** Nome do arquivo do PDF baixado: o do documento auxiliar do tipo + a chave de acesso (o servidor usa o mesmo nome). */
export function nomeDoPdf(d) {
  const prefixo = d?.tipo === "NFE" && d.modelo === "65" ? "DANFE-NFCE" : { NFE: "DANFE", CTE: "DACTE", MDFE: "DAMDFE", NFSE: "DANFSE" }[d?.tipo] || "DOCUMENTO";
  return `${prefixo}-${d?.chave}.pdf`;
}

/** O ZIP com PDF aceita até este número de documentos (gerar o PDF é trabalho de processamento); o servidor confere o mesmo limite. */
export const MAX_PDF_NO_ZIP = 300;

/** Nome do tipo na tabela: NFC-e e CT-e OS são tipo NF-e e CT-e no repositório, mas o modelo (que vem da chave de acesso) os distingue. */
export function rotuloTipo(d) {
  if (d?.tipo === "NFE" && d.modelo === "65") return "NFC-e";
  if (d?.tipo === "CTE" && d.modelo === "67") return "CT-e OS";
  return TIPOS[d?.tipo] || d?.tipo || "—";
}

/**
 * O documento a que o evento se refere, pelo modelo que o evento carrega (vem da chave de acesso): 55 NF-e, 65 NFC-e, 57 CT-e,
 * 67 CT-e OS, 58 MDF-e; o evento da NFS-e não tem modelo. Modelo desconhecido: texto vazio.
 */
export function documentoDoEvento(d) {
  if (d?.modelo == null || d.modelo === "") return "NFS-e";
  return { 55: "NF-e", 65: "NFC-e", 57: "CT-e", 67: "CT-e OS", 58: "MDF-e" }[d.modelo] || "";
}

/**
 * Situação da Ciência da Operação de um resumo (a SEFAZ só libera o XML completo da NF-e destinada ao cliente depois dela).
 * Só o resumo de NF-e que veio da captura é candidato à Ciência automática; os demais mostram um traço.
 */
export function situacaoCiencia(d) {
  switch (d?.ciencia_status) {
    case "REGISTRADA": return { rotulo: "Registrada", tom: "ok", dica: "Ciência registrada: depois dela a SEFAZ libera o XML completo nas consultas seguintes da captura." };
    case "JA_REGISTRADA": return { rotulo: "Já registrada", tom: "ok", dica: "A SEFAZ informou que a Ciência desta nota já estava registrada." };
    case "REJEITADA": return { rotulo: "Rejeitada", tom: "erro", dica: "A SEFAZ recusou o pedido de Ciência desta nota; a captura tenta de novo depois de um tempo, enquanto a nota estiver no prazo." };
    case "NAO_APLICAVEL": return { rotulo: "Não se aplica", tom: "neutro", dica: "A Ciência não se aplica a este resumo." };
    default:
      return d?.tipo === "NFE" && d?.origem === "CAPTURA"
        ? { rotulo: "Ainda não", tom: "aviso", dica: "A Ciência ainda não foi registrada para esta nota: a Ciência automática está desligada ou ainda não rodou." }
        : { rotulo: "—", tom: "neutro", dica: "" };
  }
}

/** Estados em que estão os clientes da FAL: aparecem primeiro na escolha da UF (MT, MS, GO, MA e PA). */
export const UFS_FOCO = ["51", "50", "52", "21", "15"];

/** Código IBGE da UF, usado como "UF do interessado" na consulta à SEFAZ. */
export const UFS = {
  "12": "AC", "27": "AL", "13": "AM", "16": "AP", "29": "BA", "23": "CE", "53": "DF", "32": "ES", "52": "GO", "21": "MA", "31": "MG",
  "50": "MS", "51": "MT", "15": "PA", "25": "PB", "26": "PE", "22": "PI", "41": "PR", "33": "RJ", "24": "RN", "11": "RO", "14": "RR",
  "43": "RS", "42": "SC", "28": "SE", "35": "SP", "17": "TO",
};
