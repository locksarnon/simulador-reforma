import { createHash, createPrivateKey, createSign, KeyObject, X509Certificate } from 'crypto';
import { MaterialCertificado } from '../certificados/certificados.service';
import { ErroDeComunicacao } from './distribuicao-dfe.cliente';
import { PedidoCiencia } from './manifestacao.cliente';

const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ALG_ENVELOPED = `${NS_DSIG}enveloped-signature`;
const ALG_RSA_SHA1 = `${NS_DSIG}rsa-sha1`;
const ALG_SHA1 = `${NS_DSIG}sha1`;

const TP_EVENTO_CIENCIA = '210210';
const COD_ORGAO_AN = '91';

/** Eventos por lote (envEvento) em cada requisição ao serviço. */
export const MAX_EVENTOS_POR_LOTE = 5;

const RE_CHAVE = /^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/;
const RE_CNPJ = /^[0-9A-Z]{12}[0-9]{2}$/;
const RE_CPF = /^[0-9]{11}$/;
const RE_ID_LOTE = /^[0-9]{1,15}$/;

export type DadosLote = Pick<PedidoCiencia, 'ambiente' | 'documentoDestinatario' | 'chaves'> & {
  /** Controle de quem envia: só dígitos, até 15. O Ambiente Nacional não o usa. */
  idLote: string;
  agora: Date;
};

type MaterialAssinatura = Pick<MaterialCertificado, 'keyPem' | 'certPem'>;
type Assinador = { chavePrivada: KeyObject; certificadoBase64: string };

/** Id do infEvento: "ID" + tipo do evento + chave + sequência do evento (2 dígitos; a Ciência é sempre a 1). */
export const idEvento = (chave: string): string => `ID${TP_EVENTO_CIENCIA}${chave}01`;

/** dhEvento no horário de Brasília (UTC-3 o ano todo, sem horário de verão desde 2019), sem frações de segundo. */
export function dhEvento(agora: Date): string {
  const ms = typeof agora?.getTime === 'function' ? agora.getTime() : NaN;
  if (!Number.isFinite(ms)) throw new ErroDeComunicacao('Data do evento inválida.');
  return `${new Date(ms - 3 * 3_600_000).toISOString().slice(0, 19)}-03:00`;
}

/**
 * Recusa o que não for ambiente, CNPJ/CPF e chave de acesso no formato do leiaute. É também a defesa contra injeção de XML: todo valor
 * variável do evento passa por aqui (só [0-9A-Z]) e por isso entra na mensagem sem escape.
 */
export function validarPedido(p: Pick<PedidoCiencia, 'ambiente' | 'documentoDestinatario' | 'chaves'>): void {
  if (p.ambiente !== 'PRODUCAO' && p.ambiente !== 'HOMOLOGACAO') throw new ErroDeComunicacao('Ambiente inválido para a manifestação.');
  if (!Array.isArray(p.chaves)) throw new ErroDeComunicacao('Chaves de acesso inválidas para a manifestação.');
  const doc = p.documentoDestinatario;
  if (typeof doc !== 'string' || !(RE_CNPJ.test(doc) || RE_CPF.test(doc))) {
    throw new ErroDeComunicacao('Documento do destinatário inválido para a manifestação.');
  }
  for (const chave of p.chaves) {
    if (typeof chave !== 'string' || !RE_CHAVE.test(chave)) throw new ErroDeComunicacao('Chave de acesso inválida para a manifestação.');
  }
}

function prepararAssinador(m: MaterialAssinatura): Assinador {
  let chavePrivada: KeyObject;
  let certificado: X509Certificate;
  try {
    chavePrivada = createPrivateKey(m.keyPem);
    certificado = new X509Certificate(m.certPem);
  } catch {
    throw new ErroDeComunicacao('Não foi possível ler o certificado digital para assinar o evento.');
  }
  if (chavePrivada.asymmetricKeyType !== 'rsa') throw new ErroDeComunicacao('A chave do certificado digital não é RSA.');
  if (!certificado.checkPrivateKey(chavePrivada)) throw new ErroDeComunicacao('A chave privada não corresponde ao certificado digital.');
  return { chavePrivada, certificadoBase64: certificado.raw.toString('base64') };
}

/**
 * SignedInfo como vai no documento (elementos vazios fechados em si mesmos) ou na forma canônica que se assina. A C14N 1.0 inclusiva
 * escreve os elementos vazios com tag de abertura e de fechamento e põe no elemento raiz do trecho o xmlns em escopo (o da Signature).
 */
function montarSignedInfo(id: string, digest: string, canonico: boolean): string {
  const vazio = (nome: string, algoritmo: string) =>
    canonico ? `<${nome} Algorithm="${algoritmo}"></${nome}>` : `<${nome} Algorithm="${algoritmo}"/>`;
  return (
    `<SignedInfo${canonico ? ` xmlns="${NS_DSIG}"` : ''}>` +
    `${vazio('CanonicalizationMethod', ALG_C14N)}${vazio('SignatureMethod', ALG_RSA_SHA1)}` +
    `<Reference URI="#${id}"><Transforms>${vazio('Transform', ALG_ENVELOPED)}${vazio('Transform', ALG_C14N)}</Transforms>` +
    `${vazio('DigestMethod', ALG_SHA1)}<DigestValue>${digest}</DigestValue></Reference></SignedInfo>`
  );
}

function assinar(canonico: string, chavePrivada: KeyObject): string {
  try {
    return createSign('RSA-SHA1').update(canonico, 'utf8').sign(chavePrivada, 'base64');
  } catch (e) {
    // RSA-SHA1 é imposto pelo leiaute da assinatura; políticas do sistema que desabilitam SHA-1 chegam aqui
    throw new ErroDeComunicacao(`Falha ao assinar o evento (${(e as NodeJS.ErrnoException).code || 'erro de criptografia'}).`);
  }
}

function eventoAssinado(chave: string, tpAmb: string, autor: string, dh: string, assinador: Assinador): string {
  const id = idEvento(chave);
  const dados =
    `<cOrgao>${COD_ORGAO_AN}</cOrgao><tpAmb>${tpAmb}</tpAmb>${autor}<chNFe>${chave}</chNFe><dhEvento>${dh}</dhEvento>` +
    `<tpEvento>${TP_EVENTO_CIENCIA}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>` +
    '<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento>';
  // Assina-se a forma canônica do infEvento: o xmlns que ele herda de evento entra na tag de abertura, antes de Id
  const digest = createHash('sha1').update(`<infEvento xmlns="${NS_NFE}" Id="${id}">${dados}</infEvento>`, 'utf8').digest('base64');
  const valor = assinar(montarSignedInfo(id, digest, true), assinador.chavePrivada);
  return (
    `<evento xmlns="${NS_NFE}" versao="1.00"><infEvento Id="${id}">${dados}</infEvento>` +
    `<Signature xmlns="${NS_DSIG}">${montarSignedInfo(id, digest, false)}<SignatureValue>${valor}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${assinador.certificadoBase64}</X509Certificate></X509Data></KeyInfo></Signature></evento>`
  );
}

/**
 * Lote (envEvento) de eventos de Ciência da Operação, cada um assinado (XML-DSig enveloped, C14N 20010315, RSA-SHA1, digest SHA-1) com o
 * certificado do cliente. A saída vai como está para dentro do nfeDadosMsg: UTF-8, sem declaração XML, sem prefixo de namespace e sem
 * espaços ou quebras entre as tags (a assinatura é calculada sobre esses mesmos bytes).
 */
export function montarEnvEvento(dados: DadosLote, certificado: MaterialAssinatura): string {
  validarPedido(dados);
  const dh = dhEvento(dados.agora);
  if (!RE_ID_LOTE.test(dados.idLote)) throw new ErroDeComunicacao('Identificador de lote inválido para a manifestação.');
  const total = dados.chaves.length;
  if (total < 1 || total > MAX_EVENTOS_POR_LOTE) {
    throw new ErroDeComunicacao(`Um lote de manifestação leva de 1 a ${MAX_EVENTOS_POR_LOTE} eventos.`);
  }
  if (new Set(dados.chaves).size !== total) throw new ErroDeComunicacao('Chave repetida no mesmo lote de manifestação.');
  const assinador = prepararAssinador(certificado);
  const tpAmb = dados.ambiente === 'PRODUCAO' ? '1' : '2';
  const doc = dados.documentoDestinatario;
  const autor = doc.length === 11 ? `<CPF>${doc}</CPF>` : `<CNPJ>${doc}</CNPJ>`;
  const eventos = dados.chaves.map((chave) => eventoAssinado(chave, tpAmb, autor, dh, assinador)).join('');
  return `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${dados.idLote}</idLote>${eventos}</envEvento>`;
}
