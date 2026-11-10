import { Injectable } from '@nestjs/common';
import { DOMParser } from '@xmldom/xmldom';
import { request } from 'https';
import { rootCertificates } from 'tls';
import { gunzipSync } from 'zlib';
import { MaterialCertificado } from '../certificados/certificados.service';
import { CADEIAS_ICP_BRASIL } from './cadeias-confianca';
import {
  Ambiente, ConsultaDistribuicao, DistribuicaoDfeCliente, DocumentoDistribuido, ErroDeComunicacao, RespostaDistribuicao, TipoCaptura,
} from './distribuicao-dfe.cliente';

type Servico = {
  urls: Record<Ambiente, string>; wsdlNs: string; operacao: string; dados: string; ns: string; versao: string;
  /** NF-e aceita CNPJ alfanumérico e CPF; CT-e e MDF-e, só CNPJ numérico (XSD publicado). */
  documento: RegExp;
};

/** Serviços de Distribuição de DF-e: NT 2014.002 v1.40 (NF-e) e NT 2015.002 v1.05 (CT-e). */
const SERVICOS: Partial<Record<TipoCaptura, Servico>> = {
  NFE: {
    urls: {
      PRODUCAO: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
      HOMOLOGACAO: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    },
    wsdlNs: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe',
    operacao: 'nfeDistDFeInteresse',
    dados: 'nfeDadosMsg',
    ns: 'http://www.portalfiscal.inf.br/nfe',
    versao: '1.01',
    documento: /^(?:\d{11}|[0-9A-Z]{12}\d{2})$/,
  },
  CTE: {
    urls: {
      PRODUCAO: 'https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
      HOMOLOGACAO: 'https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
    },
    wsdlNs: 'http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe',
    operacao: 'cteDistDFeInteresse',
    dados: 'cteDadosMsg',
    ns: 'http://www.portalfiscal.inf.br/cte',
    versao: '1.00',
    documento: /^\d{14}$/,
  },
};

const LIMITE_RESPOSTA = 64 * 1024 * 1024;

export type OpcoesCliente = {
  /** Autoridades certificadoras extras (testes com servidor próprio). Em produção vale só a lista padrão do Node. */
  ca?: string | Buffer;
  /** Troca o endereço de um serviço (testes). */
  urls?: Partial<Record<TipoCaptura, Partial<Record<Ambiente, string>>>>;
  timeoutMs?: number;
};

const texto = (el: Element | null | undefined, nome: string): string => {
  if (!el) return '';
  const lista = el.getElementsByTagNameNS('*', nome);
  return lista.length ? (lista[0].textContent || '').trim() : '';
};

/**
 * Cliente HTTP da Distribuição de DF-e: SOAP 1.2 com TLS mútuo (certificado A1 do cliente). A verificação do certificado do servidor
 * fica sempre ligada. Chave privada e certificado só passam pela memória desta chamada; nada é gravado nem registrado em log.
 */
@Injectable()
export class DistribuicaoDfeHttp extends DistribuicaoDfeCliente {
  opcoes: OpcoesCliente = {};

  montarEnvelope(c: ConsultaDistribuicao, s: Servico): string {
    if (!s.documento.test(c.documento)) throw new ErroDeComunicacao('Documento do titular inválido para esta consulta.');
    if (!/^\d{2}$/.test(c.ufAutor)) throw new ErroDeComunicacao('UF do interessado inválida para a consulta.');
    if (!/^\d{15}$/.test(c.ultNSU)) throw new ErroDeComunicacao('NSU inválido para a consulta.');
    const tpAmb = c.ambiente === 'PRODUCAO' ? '1' : '2';
    const doc = c.documento.length === 14 ? `<CNPJ>${c.documento}</CNPJ>` : `<CPF>${c.documento}</CPF>`;
    return (
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
      `<soap12:Body><${s.operacao} xmlns="${s.wsdlNs}"><${s.dados}>` +
      `<distDFeInt xmlns="${s.ns}" versao="${s.versao}"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${c.ufAutor}</cUFAutor>${doc}` +
      `<distNSU><ultNSU>${c.ultNSU}</ultNSU></distNSU></distDFeInt>` +
      `</${s.dados}></${s.operacao}></soap12:Body></soap12:Envelope>`
    );
  }

  lerResposta(corpo: string, c: ConsultaDistribuicao): RespostaDistribuicao {
    const doc = new DOMParser({ onError: () => undefined }).parseFromString(corpo, 'text/xml');
    const ret = doc.getElementsByTagNameNS('*', 'retDistDFeInt')[0] as unknown as Element | undefined;
    if (!ret) throw new ErroDeComunicacao('Resposta da SEFAZ fora do padrão (sem retDistDFeInt).');
    const documentos: DocumentoDistribuido[] = [];
    const zips = ret.getElementsByTagNameNS('*', 'docZip');
    for (let i = 0; i < zips.length; i += 1) {
      const z = zips[i];
      try {
        const xml = gunzipSync(Buffer.from((z.textContent || '').trim(), 'base64'), { maxOutputLength: 16 * 1024 * 1024 }).toString('utf8');
        documentos.push({ nsu: z.getAttribute('NSU') || '', schema: z.getAttribute('schema') || '', xml });
      } catch {
        throw new ErroDeComunicacao('Documento compactado inválido na resposta da SEFAZ.');
      }
    }
    return { cStat: texto(ret, 'cStat'), xMotivo: texto(ret, 'xMotivo'), ultNSU: texto(ret, 'ultNSU') || c.ultNSU, maxNSU: texto(ret, 'maxNSU'), documentos };
  }

  async consultar(c: ConsultaDistribuicao, m: MaterialCertificado): Promise<RespostaDistribuicao> {
    const servico = SERVICOS[c.tipo];
    if (!servico) throw new ErroDeComunicacao('Este tipo de documento ainda não é suportado pelo coletor.');
    const url = new URL(this.opcoes.urls?.[c.tipo]?.[c.ambiente] ?? servico.urls[c.ambiente]);
    const envelope = Buffer.from(this.montarEnvelope(c, servico), 'utf8');
    let prazo: NodeJS.Timeout | undefined;
    const corpo = await new Promise<string>((resolve, reject) => {
      const req = request(
        {
          method: 'POST',
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          key: m.keyPem,
          cert: [m.certPem, ...m.cadeiaPem].join('\n'),
          // "ca" substitui a lista padrão do Node: soma as raízes padrão, a cadeia ICP-Brasil e, nos testes, o servidor próprio.
          ca: [...rootCertificates, ...CADEIAS_ICP_BRASIL, ...(this.opcoes.ca ? [this.opcoes.ca] : [])],
          minVersion: 'TLSv1.2',
          agent: false,
          timeout: this.opcoes.timeoutMs ?? 60_000,
          headers: {
            'Content-Type': `application/soap+xml; charset=utf-8; action="${servico.wsdlNs}/${servico.operacao}"`,
            'Content-Length': envelope.length,
          },
        },
        (res) => {
          const partes: Buffer[] = [];
          let total = 0;
          res.on('data', (p: Buffer) => {
            total += p.length;
            if (total > LIMITE_RESPOSTA) { req.destroy(new Error('resposta grande demais')); return; }
            partes.push(p);
          });
          res.on('end', () => {
            const txt = Buffer.concat(partes).toString('utf8');
            if ((res.statusCode ?? 0) >= 400 && !txt.includes('retDistDFeInt')) reject(new ErroDeComunicacao(`A SEFAZ respondeu HTTP ${res.statusCode}.`));
            else resolve(txt);
          });
          res.on('error', (e) => reject(new ErroDeComunicacao(`Conexão interrompida (${e.message}).`)));
        },
      );
      req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
      // Prazo total da chamada (conexão, envio e resposta): o timeout do socket só vale para inatividade, e um servidor que goteja
      // bytes seguraria a captura (e a trava da empresa) indefinidamente.
      prazo = setTimeout(() => req.destroy(new Error('tempo esgotado')), this.opcoes.timeoutMs ?? 60_000);
      req.on('error', (e) => reject(new ErroDeComunicacao(e instanceof ErroDeComunicacao ? e.message : `${(e as NodeJS.ErrnoException).code || e.message}`)));
      req.write(envelope);
      req.end();
    }).finally(() => clearTimeout(prazo));
    return this.lerResposta(corpo, c);
  }
}
