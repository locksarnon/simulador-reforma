import { createHash, createPrivateKey, createSign, KeyObject, X509Certificate } from 'crypto';

/**
 * Termo de Autorização do Integra Contador (serviço AUTENTICAPROCURADOR / ENVIOXMLASSINADO81): XML assinado pelo autor do pedido de dados
 * autorizando o contratante (o escritório) a chamar a API em nome dele. Leiaute e textos da documentação oficial do Serpro, seção
 * "Padrões Técnicos de Assinatura do XML" (XMLDSig enveloped, C14N 20010315, RSA-SHA256, digest SHA-256, URI="").
 * Fonte: https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-contador-gerenciador/autenticaprocurador/padroes_tecnicos_assinatura_xml/
 */
export const TEXTO_TERMO =
  'Autorizo a empresa CONTRATANTE, identificada neste termo de autorização como DESTINATÁRIO, a executar as requisições dos serviços web disponibilizados pela API INTEGRA CONTADOR, onde terei o papel de AUTOR PEDIDO DE DADOS no corpo da mensagem enviada na requisição do serviço web. Esse termo de autorização está assinado digitalmente com o certificado digital do PROCURADOR ou OUTORGADO DO CONTRIBUINTE responsável, identificado como AUTOR DO PEDIDO DE DADOS.';
export const TEXTO_AVISO_LEGAL =
  'O acesso a estas informações foi autorizado pelo próprio PROCURADOR ou OUTORGADO DO CONTRIBUINTE, responsável pela informação, via assinatura digital. É dever do destinatário da autorização e consumidor deste acesso observar a adoção de base legal para o tratamento dos dados recebidos conforme artigos 7º ou 11º da LGPD (Lei n.º 13.709, de 14 de agosto de 2018), aos direitos do titular dos dados (art. 9º, 17 e 18, da LGPD) e aos princípios que norteiam todos os tratamentos de dados no Brasil (art. 6º, da LGPD).';
export const TEXTO_FINALIDADE =
  'A finalidade única e exclusiva desse TERMO DE AUTORIZAÇÃO, é garantir que o CONTRATANTE apresente a API INTEGRA CONTADOR esse consentimento do PROCURADOR ou OUTORGADO DO CONTRIBUINTE assinado digitalmente, para que possa realizar as requisições dos serviços web da API INTEGRA CONTADOR em nome do AUTOR PEDIDO DE DADOS (PROCURADOR ou OUTORGADO DO CONTRIBUINTE).';

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ALG_ENVELOPED = `${NS_DSIG}enveloped-signature`;
const ALG_RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const ALG_SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';

export type Parte = { numero: string; nome: string };
export type DadosTermo = { destinatario: Parte; assinadoPor: Parte; dataAssinatura: Date; vigencia: Date };
export type MaterialAssinatura = { keyPem: string; certPem: string };

const so = (d: string) => String(d ?? '').replace(/\D/g, '');

/** Controles e caracteres invisíveis (zero-width, separadores de linha, BOM) que derrubam a validação do termo no Serpro. */
const INVISIVEIS = new RegExp('[\x00-\x08\x0B\x0C\x0E-\x1F\u200B-\u200F\u2028-\u202F\uFEFF]', 'g');

/** Escape de valor de atributo como a C14N escreve (&, <, " e as quebras); assim o documento e a forma canônica são os mesmos bytes. */
export function escaparAtributo(v: string): string {
  return String(v)
    .replace(INVISIVEIS, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
}

/** AAAAMMDD no horário de Brasília (UTC-3). */
export function dataTermo(d: Date): string {
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * O elemento <dados> na forma canônica (C14N inclusiva): elementos vazios com tag de fechamento e atributos em ordem alfabética
 * (nome, numero, papel, tipo). O documento enviado usa exatamente esta forma, para não haver diferença entre o que se assina e o que vai.
 */
export function montarDados(t: DadosTermo): string {
  const dest = so(t.destinatario.numero);
  const autor = so(t.assinadoPor.numero);
  if (dest.length !== 14) throw new Error('O CNPJ do contratante (destinatário) precisa ter 14 dígitos.');
  if (autor.length !== 11 && autor.length !== 14) throw new Error('O documento de quem assina precisa ser CPF (11) ou CNPJ (14).');
  const a = (nome: string, valor: string) => `${nome}="${escaparAtributo(valor)}"`;
  return (
    '<dados>' +
    `<sistema ${a('id', 'API Integra Contador')}></sistema>` +
    `<termo ${a('texto', TEXTO_TERMO)}></termo>` +
    `<avisoLegal ${a('texto', TEXTO_AVISO_LEGAL)}></avisoLegal>` +
    `<finalidade ${a('texto', TEXTO_FINALIDADE)}></finalidade>` +
    `<dataAssinatura ${a('data', dataTermo(t.dataAssinatura))}></dataAssinatura>` +
    `<vigencia ${a('data', dataTermo(t.vigencia))}></vigencia>` +
    `<destinatario ${a('nome', t.destinatario.nome)} ${a('numero', dest)} ${a('papel', 'contratante')} ${a('tipo', 'PJ')}></destinatario>` +
    `<assinadoPor ${a('nome', t.assinadoPor.nome)} ${a('numero', autor)} ${a('papel', 'autor pedido de dados')} ${a('tipo', autor.length === 11 ? 'PF' : 'PJ')}></assinadoPor>` +
    '</dados>'
  );
}

function signedInfo(digest: string, canonico: boolean): string {
  const el = (nome: string, alg: string) => `<${nome} Algorithm="${alg}"></${nome}>`;
  return (
    `<SignedInfo${canonico ? ` xmlns="${NS_DSIG}"` : ''}>${el('CanonicalizationMethod', ALG_C14N)}${el('SignatureMethod', ALG_RSA_SHA256)}` +
    `<Reference URI=""><Transforms>${el('Transform', ALG_ENVELOPED)}${el('Transform', ALG_C14N)}</Transforms>` +
    `${el('DigestMethod', ALG_SHA256)}<DigestValue>${digest}</DigestValue></Reference></SignedInfo>`
  );
}

function prepararChave(m: MaterialAssinatura): { chave: KeyObject; certificado: X509Certificate } {
  const chave = createPrivateKey(m.keyPem);
  const certificado = new X509Certificate(m.certPem);
  if (chave.asymmetricKeyType !== 'rsa') throw new Error('A chave do certificado não é RSA.');
  if (!certificado.checkPrivateKey(chave)) throw new Error('A chave privada não corresponde ao certificado.');
  return { chave, certificado };
}

/** Termo assinado, sem quebras nem indentação (como a documentação pede), com a declaração XML UTF-8. */
export function termoAssinado(t: DadosTermo, m: MaterialAssinatura): string {
  const { chave, certificado } = prepararChave(m);
  const dados = montarDados(t);
  // URI="" + enveloped: assina-se o documento sem a Signature, na forma canônica (sem a declaração XML).
  const digest = createHash('sha256').update(`<termoDeAutorizacao>${dados}</termoDeAutorizacao>`, 'utf8').digest('base64');
  const valor = createSign('RSA-SHA256').update(signedInfo(digest, true), 'utf8').sign(chave, 'base64');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<termoDeAutorizacao>${dados}<Signature xmlns="${NS_DSIG}">${signedInfo(digest, false)}<SignatureValue>${valor}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certificado.raw.toString('base64')}</X509Certificate></X509Data></KeyInfo></Signature></termoDeAutorizacao>`
  );
}

/** Vigência do termo: um ano a partir da assinatura (o token que ele gera vale até a meia-noite do dia seguinte). */
export function vigenciaPadrao(agora: Date): Date {
  return new Date(agora.getTime() + 365 * 86_400_000);
}
