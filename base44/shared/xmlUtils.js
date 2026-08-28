/**
 * Utilidades compartilhadas de importação XML — Simulador FAL v0.18.
 * Usado por processarLoteXML e confirmarImportacaoXML.
 */

/** Normaliza CNPJ para 14 dígitos com zeros à esquerda. */
export function normalizeCnpj(v) {
  if (!v) return "";
  return String(v).replace(/\D/g, "").padStart(14, "0").slice(-14);
}

/**
 * Converte percentual do XML NF-e para decimal.
 * Contrato: valores de alíquota no XML SEMPRE representam percentual nominal
 * (ex: "19.0000" = 19%, "0.1900" = 0,19%, "7.6000" = 7,6%).
 * A divisão por 100 é sempre aplicada — não há adivinhação.
 * Retorna null se inválido ou fora do intervalo [0, 1].
 */
export function parsePercentage(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(",", ".").trim();
  const n = Number(s);
  if (!isFinite(n)) return null;
  const p = n / 100;
  if (p < 0 || p > 1) return null;
  return p;
}

/**
 * Converte valor decimal já normalizado (0.19 = 19%) para número.
 * Usado para complementos manuais e overrides — NÃO divide por 100.
 * Retorna null se inválido ou fora do intervalo [0, 1].
 */
export function parseDecimal(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(",", ".").trim();
  const n = Number(s);
  if (!isFinite(n)) return null;
  if (n < 0 || n > 1) return null;
  return n;
}

/** Mantém o valor original (string) do XML. */
export function originalValue(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * Valida chave de acesso NF-e (44 dígitos, módulo 11, coerência interna).
 * Retorna { valido, codigo, mensagem, partes }.
 */
export function validateAccessKey(chave, camposXml = {}) {
  const result = { valido: false, codigo: null, mensagem: "", partes: null };
  if (!chave || typeof chave !== "string") {
    result.codigo = "DOC_CHAVE_FORMATO_INVALIDO";
    result.mensagem = "Chave de acesso ausente.";
    return result;
  }
  if (chave.length !== 44 || !/^\d{44}$/.test(chave)) {
    result.codigo = "DOC_CHAVE_FORMATO_INVALIDO";
    result.mensagem = "Chave de acesso deve ter 44 dígitos numéricos.";
    return result;
  }

  // Módulo 11 — algoritmo oficial Sefaz.
  const dvChave = parseInt(chave[43], 10);
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += parseInt(chave[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dvCalc = resto < 2 ? 0 : 11 - resto;
  if (dvCalc !== dvChave) {
    result.codigo = "DOC_CHAVE_DV_INVALIDO";
    result.mensagem = `Dígito verificador inválido (esperado ${dvCalc}, encontrado ${dvChave}).`;
    return result;
  }

  const partes = {
    uf: chave.substring(0, 2),
    aamm: chave.substring(2, 6),
    cnpj: chave.substring(6, 20),
    modelo: chave.substring(20, 22),
    serie: chave.substring(22, 25),
    numero: chave.substring(25, 34),
    formaEmissao: chave.substring(34, 35),
    codigoNumerico: chave.substring(35, 43),
    dv: chave.substring(43, 44),
  };

  // Coerência com campos do XML (se fornecidos).
  if (camposXml.cnpjEmitente) {
    const cnpjXml = normalizeCnpj(camposXml.cnpjEmitente);
    if (cnpjXml && cnpjXml !== partes.cnpj) {
      result.codigo = "DOC_CHAVE_DIVERGENTE_XML";
      result.mensagem = `CNPJ do emitente diverge da chave (chave: ${partes.cnpj}, XML: ${cnpjXml}).`;
      result.partes = partes;
      return result;
    }
  }
  if (camposXml.modelo) {
    if (camposXml.modelo !== partes.modelo) {
      result.codigo = "DOC_CHAVE_DIVERGENTE_XML";
      result.mensagem = `Modelo diverge da chave (chave: ${partes.modelo}, XML: ${camposXml.modelo}).`;
      result.partes = partes;
      return result;
    }
  }
  if (camposXml.serie) {
    if (String(camposXml.serie).padStart(3, "0") !== partes.serie) {
      result.codigo = "DOC_CHAVE_DIVERGENTE_XML";
      result.mensagem = `Série diverge da chave (chave: ${partes.serie}, XML: ${camposXml.serie}).`;
      result.partes = partes;
      return result;
    }
  }
  if (camposXml.numero) {
    if (String(camposXml.numero).padStart(9, "0") !== partes.numero) {
      result.codigo = "DOC_CHAVE_DIVERGENTE_XML";
      result.mensagem = `Número diverge da chave (chave: ${partes.numero}, XML: ${camposXml.numero}).`;
      result.partes = partes;
      return result;
    }
  }

  result.valido = true;
  result.partes = partes;
  return result;
}

/** Códigos UF Sefaz. */
export const UF_CODIGOS = {
  "12": "AC", "27": "AL", "13": "AM", "16": "AP", "29": "BA", "23": "CE",
  "53": "DF", "32": "ES", "52": "GO", "21": "MA", "31": "MG", "50": "MS",
  "51": "MT", "15": "PA", "25": "PB", "26": "PE", "22": "PI", "41": "PR",
  "33": "RJ", "24": "RN", "11": "RO", "14": "RR", "43": "RS", "42": "SC",
  "28": "SE", "35": "SP", "17": "TO",
};

/** Calcula hash SHA-256 de um ArrayBuffer/Uint8Array usando Web Crypto. */
export async function sha256(data) {
  const buf = data instanceof ArrayBuffer ? data : (data.buffer ?? await data.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Versão atual das regras de validação. */
export const VERSAO_REGRAS = "v0.18";

/** Monta um check de validação padronizado. */
export function check(codigo, status, mensagem, bloqueante = false, campoRelacionado = null, evidencias = null) {
  return { codigo, status, mensagem, bloqueante, campo_relacionado: campoRelacionado, evidencias: evidencias || [] };
}

/** Status de check. */
export const STATUS = {
  CONFORME: "CONFORME",
  NAO_CONFORME: "NAO_CONFORME",
  ALERTA: "ALERTA",
  PENDENTE: "PENDENTE",
  NAO_APLICAVEL: "NAO_APLICAVEL",
};