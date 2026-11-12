import { Injectable } from '@nestjs/common';
import { DOMParser } from '@xmldom/xmldom';
import { request } from 'https';
import { rootCertificates } from 'tls';
import { CADEIAS_ICP_BRASIL } from '../captura-xml/cadeias-confianca';

/**
 * Consulta ao Cadastro de Contribuintes do ICMS pelo web service oficial da NF-e (NfeConsultaCadastro / CadConsultaCadastro4),
 * MOC 7.0 item 5.6: SOAP 1.2 sem cabeçalho, mensagem ConsCad 2.00, TLS mútuo com e-CNPJ de emitente de NF-e (senão a SEFAZ
 * rejeita com 257). A UF da consulta precisa ser a do web service (265). URLs da relação oficial de serviços web de produção
 * (www.nfe.fazenda.gov.br/portal/webServices.aspx, conferida em 12/11/2026).
 */
const SVRS = 'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx';
export const URL_CCC: Record<string, string> = {
  AM: 'https://nfe.sefaz.am.gov.br/services2/services/CadConsultaCadastro4',
  BA: 'https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx',
  GO: 'https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4',
  MG: 'https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4',
  MS: 'https://nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4',
  MT: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4',
  PE: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4',
  PR: 'https://nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4',
  RS: SVRS,
  SP: 'https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx',
  AC: SVRS, ES: SVRS, RN: SVRS, PB: SVRS, SC: SVRS,
};
/** UFs que publicam o WSDL com o elemento de operação envolvendo o nfeDadosMsg (WSDL de MT conferido). */
const COM_OPERACAO = new Set(['MT']);
const WSDL_NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4';

export type InscricaoCcc = {
  ie: string; uf: string; habilitada: boolean; nome: string; regime: string; cnae: string; inicioAtividade: string; dataSituacao: string; dataBaixa: string;
  credenciamentoNFe: string; endereco: string;
};
export type ResultadoCcc = { consultado: boolean; uf: string; cStat: string; mensagem: string; dataConsulta: string; inscricoes: InscricaoCcc[]; certificadoDe?: string };

const CRED: Record<string, string> = { 0: 'não credenciado', 1: 'credenciado', 2: 'credenciado com obrigatoriedade total', 3: 'credenciado com obrigatoriedade parcial', 4: 'a SEFAZ não informa' };
const dataIso = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : s);
const MOTIVO: Record<string, string> = {
  257: 'a SEFAZ só responde a quem emite NF-e, e o certificado usado não é de emitente de NF-e. Guarde o A1 do cliente no cofre (Captura de XML) ou use um certificado de empresa emissora',
  259: 'CNPJ não cadastrado como contribuinte do ICMS na UF',
};

export function montarEnvelope(cnpj: string, uf: string) {
  if (!/^\d{14}$/.test(cnpj)) throw new Error('CNPJ inválido para a consulta.');
  if (!URL_CCC[uf]) throw new Error('UF sem o serviço.');
  const msg = `<ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>${uf}</UF><CNPJ>${cnpj}</CNPJ></infCons></ConsCad>`;
  const dados = `<nfeDadosMsg xmlns="${WSDL_NS}">${msg}</nfeDadosMsg>`;
  const corpo = COM_OPERACAO.has(uf) ? `<consultaCadastro xmlns="${WSDL_NS}">${dados}</consultaCadastro>` : dados;
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${corpo}</soap12:Body></soap12:Envelope>`;
}

const texto = (el: Element | null | undefined, nome: string): string => {
  if (!el) return '';
  const l = el.getElementsByTagNameNS('*', nome);
  return l.length ? (l[0].textContent || '').trim() : '';
};

/** Lê o retConsCad (MOC 7.0, Tabela 5-22). */
export function lerRetorno(xml: string, uf: string): ResultadoCcc {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const ret = doc.getElementsByTagNameNS('*', 'retConsCad')[0] as unknown as Element | undefined;
  if (!ret) {
    const falha = texto(doc.documentElement as unknown as Element, 'Text') || texto(doc.documentElement as unknown as Element, 'faultstring');
    return { consultado: false, uf, cStat: '', mensagem: `A SEFAZ ${uf} não devolveu o retorno da consulta${falha ? `: ${falha}` : ''}.`, dataConsulta: new Date().toISOString(), inscricoes: [] };
  }
  const infCons = ret.getElementsByTagNameNS('*', 'infCons')[0] as unknown as Element;
  const cStat = texto(infCons, 'cStat');
  const xMotivo = texto(infCons, 'xMotivo');
  const dhCons = texto(infCons, 'dhCons') || new Date().toISOString();
  const cads = Array.from(ret.getElementsByTagNameNS('*', 'infCad') as unknown as ArrayLike<Element>);
  const inscricoes = cads.map((c) => {
    const ender = c.getElementsByTagNameNS('*', 'ender')[0] as unknown as Element | undefined;
    const endereco = ender ? [texto(ender, 'xLgr'), texto(ender, 'nro'), texto(ender, 'xCpl'), texto(ender, 'xBairro'), `${texto(ender, 'xMun')}${texto(ender, 'CEP') ? ` CEP ${texto(ender, 'CEP')}` : ''}`].filter(Boolean).join(', ') : '';
    const cred = texto(c, 'indCredNFe');
    return {
      ie: texto(c, 'IE'), uf: texto(c, 'UF') || uf, habilitada: texto(c, 'cSit') === '1', nome: texto(c, 'xNome'), regime: texto(c, 'xRegApur'), cnae: texto(c, 'CNAE'),
      inicioAtividade: dataIso(texto(c, 'dIniAtiv')), dataSituacao: dataIso(texto(c, 'dUltSit')), dataBaixa: dataIso(texto(c, 'dBaixa')),
      credenciamentoNFe: cred ? (CRED[cred] ?? cred) : '', endereco,
    };
  });
  const sucesso = cStat === '111' || cStat === '112';
  if (!sucesso && cStat !== '259') return { consultado: false, uf, cStat, mensagem: `SEFAZ ${uf} recusou a consulta (${cStat}): ${MOTIVO[cStat] ?? xMotivo}.`, dataConsulta: dhCons, inscricoes: [] };
  return { consultado: true, uf, cStat, mensagem: MOTIVO[cStat] ?? xMotivo, dataConsulta: dhCons, inscricoes };
}

/** Cliente HTTP: verificação do certificado do servidor sempre ligada; a chave só passa pela memória desta chamada. */
@Injectable()
export class ConsultaCccHttp {
  opcoes: { ca?: string | Buffer; urls?: Record<string, string>; timeoutMs?: number } = {};

  async consultar(c: { cnpj: string; uf: string; keyPem: string; certPem: string; cadeiaPem?: string[]; certificadoDe?: string }): Promise<ResultadoCcc> {
    const uf = c.uf.toUpperCase();
    const url = this.opcoes.urls?.[uf] ?? URL_CCC[uf];
    if (!url) return { consultado: false, uf, cStat: '', mensagem: `A SEFAZ ${uf} não oferece a consulta ao cadastro pelo web service da NF-e (relação oficial de serviços web). Consulte no portal da SEFAZ ${uf}.`, dataConsulta: new Date().toISOString(), inscricoes: [] };
    const corpo = montarEnvelope(c.cnpj, uf);
    const xml = await new Promise<string>((ok, falha) => {
      const req = request(url, {
        method: 'POST', key: c.keyPem, cert: [c.certPem, ...(c.cadeiaPem ?? [])].join(String.fromCharCode(10)), ca: [...rootCertificates, ...CADEIAS_ICP_BRASIL, ...(this.opcoes.ca ? [this.opcoes.ca] : [])], rejectUnauthorized: true,
        headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="${WSDL_NS}/consultaCadastro"`, 'Content-Length': Buffer.byteLength(corpo) },
        timeout: this.opcoes.timeoutMs ?? 30_000,
      }, (res) => {
        const partes: Buffer[] = [];
        let total = 0;
        res.on('data', (b: Buffer) => { total += b.length; if (total > 5 * 1024 * 1024) { req.destroy(new Error('Resposta grande demais.')); return; } partes.push(b); });
        res.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
        res.on('error', falha);
      });
      req.on('timeout', () => req.destroy(new Error(`a SEFAZ ${uf} não respondeu a tempo`)));
      req.on('error', falha);
      req.end(corpo);
    });
    return { ...lerRetorno(xml, uf), certificadoDe: c.certificadoDe };
  }
}
