import { Injectable } from '@nestjs/common';
import { ClientRequest } from 'http';
import { request } from 'https';
import { rootCertificates } from 'tls';
import { gunzipSync } from 'zlib';
import { MaterialCertificado } from '../certificados/certificados.service';
import { CADEIAS_ICP_BRASIL } from './cadeias-confianca';
import { Ambiente, ConsultaDistribuicao, DistribuicaoDfeCliente, DocumentoDistribuido, ErroDeComunicacao, RespostaDistribuicao } from './distribuicao-dfe.cliente';

/**
 * API de distribuição do ADN para contribuintes (Manual dos Contribuintes v1.1, de 03/11/2026). Os manuais só trazem o endereço da
 * documentação (".../contribuintes/docs/index.html"); o de chamada é esse mesmo sem o final. A homologação é a "produção restrita".
 */
export const URLS_ADN: Record<Ambiente, string> = {
  PRODUCAO: 'https://adn.nfse.gov.br/contribuintes',
  HOMOLOGACAO: 'https://adn.producaorestrita.nfse.gov.br/contribuintes',
};

/** Até 50 DF-e por consulta (Manual Integrado do SNNFSe v1.00.02, item 17.2.2). */
const LOTE_COMPLETO = 50;
const LIMITE_RESPOSTA = 32 * 1024 * 1024;
const LIMITE_XML = 16 * 1024 * 1024;
const PRAZO_PADRAO_MS = 60_000;

/** Nada a partir do NSU pedido: E2220 no Manual v1.1, E2215 no Anexo IV v1.00 e E2230 (sem documento no NSU). */
const FIM_DA_FILA = new Set(['E2215', 'E2220', 'E2230']);

/** Erros de negócio do ADN (Manual v1.1, item 1.1.2) traduzidos para os cStat que as regras do motor já conhecem; os demais viram 215. */
const CSTAT_POR_ERRO: Record<string, string> = {
  E2210: '280', // certificado de transmissão inválido
  E2211: '284', // revogado
  E2212: '283', // erro na cadeia de certificação
  E2213: '281', // expirado
  E2214: '286', // erro de acesso à LCR
  E2243: '593', // CNPJ da consulta de outra raiz
  E2245: '593', // sem procuração
  E2244: '489', // cnpjConsulta e cpfConsulta juntos
  E2246: '489', // CNPJ da consulta inválido
  E2247: '489', // CPF da consulta inválido
  E999: '999', // falha não tratada
};

export type OpcoesNfseAdn = {
  /** Autoridades certificadoras extras (testes com servidor próprio); somam-se às raízes do Node e à cadeia ICP-Brasil. */
  ca?: string | Buffer;
  /** Troca o endereço do ADN (testes). */
  urls?: Partial<Record<Ambiente, string>>;
  /** Prazo total da chamada: conexão, envio e resposta (padrão 60 s). */
  timeoutMs?: number;
  /** Tamanho máximo da resposta (padrão 32 MiB). */
  limiteRespostaBytes?: number;
};

type Objeto = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Os campos do ADN vêm em PascalCase (StatusProcessamento, LoteDFe); a busca ignora maiúsculas e minúsculas, para aceitar também camelCase. */
const campo = (o: Objeto, nome: string): unknown => {
  if (nome in o) return o[nome];
  const chave = Object.keys(o).find((k) => k.toLowerCase() === nome.toLowerCase());
  return chave === undefined ? undefined : o[chave];
};
const lista = (v: unknown): Objeto[] => (Array.isArray(v) ? v.filter(ehObjeto) : []);
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'bigint' ? String(v) : '');

const lerJson = (corpo: string): Objeto | null => {
  try {
    const semMarca = corpo.charCodeAt(0) === 0xfeff ? corpo.slice(1) : corpo;
    // O NSU do ADN pode passar de 15 dígitos: vira texto antes do parse, senão o número perde precisão.
    const json: unknown = JSON.parse(semMarca.replace(/("nsu"\s*:\s*)(\d+)/gi, '$1"$2"'));
    return ehObjeto(json) ? json : null;
  } catch {
    return null;
  }
};

/** O ArquivoXml é o XML em gzip e base64; se vier sem gzip, só vale quando for XML mesmo. */
const descompactar = (arquivoXml: string): string => {
  const bytes = Buffer.from(arquivoXml, 'base64');
  try {
    const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
    const xml = gzip ? gunzipSync(bytes, { maxOutputLength: LIMITE_XML }).toString('utf8') : bytes.toString('utf8');
    if (gzip || xml.trimStart().startsWith('<')) return xml;
  } catch {
    // vira a mensagem abaixo, sem o texto do erro
  }
  throw new ErroDeComunicacao('Documento compactado inválido na resposta do ADN.');
};

/** Nome do elemento raiz do XML (NFSe ou evento), que rotula o documento. */
const raizDe = (xml: string): string => /^\s*(?:<\?[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[\w.-]+:)?([\w.-]+)/.exec(xml)?.[1] ?? '';

const nsuPadrao = (n: bigint) => n.toString().padStart(15, '0');

/**
 * Cliente HTTP da distribuição de DF-e do ADN (NFS-e Nacional): REST/JSON com TLS mútuo (certificado A1 do cliente). A verificação do
 * certificado do servidor fica sempre ligada. Chave privada e certificado só passam pela memória desta chamada; nada é gravado nem
 * registrado em log nem vai para mensagens de erro.
 *
 * O parâmetro "lote" e o esquema JSON da resposta (StatusProcessamento, LoteDFe, Erros) não constam dos manuais oficiais, só da Swagger
 * do ADN; seguem o que os clientes abertos usam. A resposta é traduzida para os cStat do Ambiente Nacional da NF-e, para o motor da
 * captura reaproveitar as mesmas regras de espera e de desativação.
 */
@Injectable()
export class NfseAdnHttp extends DistribuicaoDfeCliente {
  opcoes: OpcoesNfseAdn = {};

  /** GET {base}/DFe/{NSU}?lote=true&cnpjConsulta={CNPJ} (CPF: cpfConsulta). O NSU enviado é o último que o solicitante já tem. */
  montarUrl(c: ConsultaDistribuicao): URL {
    if (!/^(?:\d{11}|\d{14})$/.test(c.documento)) throw new ErroDeComunicacao('Documento do titular inválido para esta consulta.');
    if (!/^\d{1,20}$/.test(c.ultNSU)) throw new ErroDeComunicacao('NSU inválido para a consulta.');
    const url = new URL(this.opcoes.urls?.[c.ambiente] ?? URLS_ADN[c.ambiente]);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/DFe/${BigInt(c.ultNSU)}`;
    url.search = `?lote=true&${c.documento.length === 14 ? 'cnpjConsulta' : 'cpfConsulta'}=${c.documento}`;
    return url;
  }

  lerResposta(status: number, corpo: string, c: ConsultaDistribuicao): RespostaDistribuicao {
    if (status === 429 || status >= 500) throw new ErroDeComunicacao(`O ADN respondeu HTTP ${status}.`);
    const json = lerJson(corpo);
    if (!json) throw new ErroDeComunicacao(`Resposta do ADN fora do padrão (HTTP ${status}, sem JSON).`);
    const semDocumentos: RespostaDistribuicao = { cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: c.ultNSU, maxNSU: c.ultNSU, documentos: [] };

    const erro = lista(campo(json, 'Erros'))[0];
    if (erro) {
      const codigo = texto(campo(erro, 'Codigo')).toUpperCase();
      if (FIM_DA_FILA.has(codigo)) return semDocumentos;
      const xMotivo = [codigo, texto(campo(erro, 'Descricao'))].filter(Boolean).join(': ').slice(0, 255);
      return { cStat: CSTAT_POR_ERRO[codigo] ?? '215', xMotivo, ultNSU: c.ultNSU, maxNSU: c.ultNSU, documentos: [] };
    }
    const situacao = texto(campo(json, 'StatusProcessamento')).toUpperCase();
    if (situacao === 'NENHUM_DOCUMENTO_LOCALIZADO') return semDocumentos;
    const lote = campo(json, 'LoteDFe');
    // rejeição sem o código do erro não pode passar por lote vazio (fim da fila)
    if (situacao === 'REJEICAO' || status >= 400 || !Array.isArray(lote)) {
      throw new ErroDeComunicacao(`Resposta do ADN fora do padrão (HTTP ${status}, sem lote nem código de erro reconhecido).`);
    }
    const itens = lista(lote);
    if (itens.length === 0) return semDocumentos;

    const documentos: DocumentoDistribuido[] = [];
    let maior = 0n;
    for (const item of itens) {
      const nsu = texto(campo(item, 'NSU'));
      const arquivo = texto(campo(item, 'ArquivoXml'));
      if (!/^\d{1,20}$/.test(nsu) || !arquivo) throw new ErroDeComunicacao('Documento do lote do ADN sem NSU ou sem ArquivoXml.');
      const xml = descompactar(arquivo);
      documentos.push({ nsu: nsuPadrao(BigInt(nsu)), schema: raizDe(xml) || texto(campo(item, 'TipoDocumento')), xml });
      if (BigInt(nsu) > maior) maior = BigInt(nsu);
    }
    // O NSU enviado pode voltar repetido no lote; a gravação no repositório é idempotente. Lote cheio que avançou o NSU: pode haver mais
    // (se não avançou, repetir a consulta só repetiria o lote).
    const maisDocumentos = itens.length >= LOTE_COMPLETO && maior > BigInt(c.ultNSU);
    return { cStat: '138', xMotivo: 'Documento(s) localizado(s)', ultNSU: nsuPadrao(maior), maxNSU: nsuPadrao(maior), documentos, maisDocumentos };
  }

  async consultar(c: ConsultaDistribuicao, m: MaterialCertificado): Promise<RespostaDistribuicao> {
    if (c.tipo !== 'NFSE') throw new ErroDeComunicacao('Este cliente atende só a NFS-e Nacional.');
    const url = this.montarUrl(c);
    const { status, corpo } = await this.obter(url, m);
    return this.lerResposta(status, corpo, c);
  }

  private async obter(url: URL, m: MaterialCertificado): Promise<{ status: number; corpo: string }> {
    const limite = this.opcoes.limiteRespostaBytes ?? LIMITE_RESPOSTA;
    let prazo: NodeJS.Timeout | undefined;
    try {
      return await new Promise<{ status: number; corpo: string }>((resolve, reject) => {
        const falhar = (mensagem: string) => reject(new ErroDeComunicacao(mensagem));
        let req: ClientRequest;
        try {
          req = request(
            {
              method: 'GET',
              protocol: url.protocol,
              hostname: url.hostname,
              port: url.port || 443,
              path: `${url.pathname}${url.search}`,
              key: m.keyPem,
              cert: [m.certPem, ...m.cadeiaPem].join('\n'),
              // "ca" substitui a lista padrão do Node: soma as raízes padrão, a cadeia ICP-Brasil e, nos testes, o servidor próprio.
              ca: [...rootCertificates, ...CADEIAS_ICP_BRASIL, ...(this.opcoes.ca ? [this.opcoes.ca] : [])],
              minVersion: 'TLSv1.2',
              rejectUnauthorized: true,
              agent: false,
              headers: { Accept: 'application/json' },
            },
            (res) => {
              const partes: Buffer[] = [];
              let total = 0;
              let excedeu = false;
              res.on('data', (p: Buffer) => {
                if (excedeu) return;
                total += p.length;
                if (total > limite) { excedeu = true; req.destroy(new ErroDeComunicacao('Resposta do ADN grande demais.')); return; }
                partes.push(p);
              });
              // o corpo todo pode chegar de uma vez e terminar antes de a conexão cair: o excesso nunca vira resposta
              res.on('end', () => (excedeu ? falhar('Resposta do ADN grande demais.') : resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString('utf8') })));
              res.on('error', () => falhar('Conexão com o ADN interrompida.'));
              res.on('close', () => { if (!res.complete) falhar('Conexão com o ADN interrompida.'); });
            },
          );
        } catch {
          falhar('Não foi possível abrir a conexão segura com o ADN (endereço ou certificado do cliente inválido).');
          return;
        }
        // prazo total da chamada (conexão, envio e resposta); o timeout do socket só vale para inatividade
        prazo = setTimeout(() => req.destroy(new ErroDeComunicacao('Tempo esgotado ao aguardar a resposta do ADN.')), this.opcoes.timeoutMs ?? PRAZO_PADRAO_MS);
        req.on('error', (e) => {
          const codigo = (e as NodeJS.ErrnoException).code;
          reject(e instanceof ErroDeComunicacao ? e : new ErroDeComunicacao(`Falha de comunicação com o ADN (${codigo || 'erro de conexão'}).`));
        });
        req.end();
      });
    } finally {
      clearTimeout(prazo);
    }
  }
}
