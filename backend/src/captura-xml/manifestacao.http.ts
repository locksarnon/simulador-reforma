import { Injectable } from '@nestjs/common';
import { DOMParser } from '@xmldom/xmldom';
import { ClientRequest } from 'http';
import { request } from 'https';
import { rootCertificates } from 'tls';
import { MaterialCertificado } from '../certificados/certificados.service';
import { CADEIAS_ICP_BRASIL } from './cadeias-confianca';
import { Ambiente, ErroDeComunicacao } from './distribuicao-dfe.cliente';
import { MAX_EVENTOS_POR_LOTE, montarEnvEvento, validarPedido } from './manifestacao-evento';
import { ErroCienciaParcial, ManifestacaoCliente, PedidoCiencia, ResultadoCiencia, StatusCiencia } from './manifestacao.cliente';

/** NFeRecepcaoEvento 4.00 do Ambiente Nacional (Relação de Serviços Web do Portal da NF-e; o host de produção é "www", não "www1"). */
export const URLS_RECEPCAO_EVENTO: Record<Ambiente, string> = {
  PRODUCAO: 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  HOMOLOGACAO: 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
};

const NS_WSDL = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4';
const LIMITE_RESPOSTA = 1024 * 1024;
const PAUSA_PADRAO_MS = 200;

const REGISTRADO = new Set(['135', '136']);
const DUPLICIDADE = '573';
// 596 fora do prazo, 650 NF-e cancelada/denegada, 651 idem (desconhecimento), 655 já houve manifestação final
const NAO_APLICAVEL = new Set(['596', '650', '651', '655']);

export type OpcoesManifestacao = {
  /** Autoridades certificadoras extras (testes com servidor próprio); somam-se às raízes do Node e à cadeia ICP-Brasil. */
  ca?: string | Buffer;
  /** Troca o endereço do serviço (testes). */
  urls?: Partial<Record<Ambiente, string>>;
  timeoutMs?: number;
  /** Pausa entre duas requisições seguidas ao serviço (padrão 200 ms). */
  pausaMs?: number;
  /**
   * Eventos por requisição (de 1 a 5; padrão 1). Com o certificado A1 cada evento assinado tem uns 4 KB e o limite de tamanho da mensagem
   * do serviço não foi confirmado em fonte oficial (o texto da NT fala em 10 KB, rejeição 214): um por vez fica abaixo de qualquer limite.
   */
  eventosPorLote?: number;
};

type Retorno = { chave: string; cStat: string; xMotivo: string; protocolo: string | null };

const filhos = (el: Element, nome: string): Element[] => {
  const achados: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (n as Element).localName === nome) achados.push(n as Element);
  return achados;
};

const texto = (el: Element | undefined, nome: string): string => (el ? (filhos(el, nome)[0]?.textContent ?? '') : '').trim();

const lerXml = (corpo: string) => {
  try {
    return new DOMParser({ onError: () => undefined }).parseFromString(corpo, 'text/xml');
  } catch {
    // erro fatal de XML (por exemplo, prefixo sem namespace numa página de erro do servidor)
    throw new ErroDeComunicacao('Resposta da SEFAZ fora do padrão (XML ilegível).');
  }
};

const classificar = (cStat: string): StatusCiencia => {
  if (REGISTRADO.has(cStat)) return 'REGISTRADA';
  if (cStat === DUPLICIDADE) return 'JA_REGISTRADA';
  return NAO_APLICAVEL.has(cStat) ? 'NAO_APLICAVEL' : 'REJEITADA';
};

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** O Ambiente Nacional não usa o idLote; ele só precisa ser numérico (até 15 dígitos) e, de preferência, diferente a cada requisição. */
const idLoteDe = (agora: Date, indice: number): string => `${agora.getTime()}${String(indice % 100).padStart(2, '0')}`;

/**
 * Cliente HTTP do registro da Ciência da Operação: SOAP 1.2 para o NFeRecepcaoEvento4 do Ambiente Nacional, com TLS mútuo (certificado A1
 * do cliente) e os eventos assinados com o mesmo certificado. A verificação do certificado do servidor fica sempre ligada. Chave privada e
 * certificado só passam pela memória desta chamada; nada é gravado nem registrado em log nem vai para mensagens de erro.
 */
@Injectable()
export class ManifestacaoHttp extends ManifestacaoCliente {
  opcoes: OpcoesManifestacao = {};

  montarEnvelope(envEvento: string): string {
    return (
      '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
      `<soap12:Body><nfeDadosMsg xmlns="${NS_WSDL}">${envEvento}</nfeDadosMsg></soap12:Body></soap12:Envelope>`
    );
  }

  /** Resultado de cada chave do lote enviado, na ordem em que foram enviadas. */
  lerResposta(corpo: string, chaves: string[]): ResultadoCiencia[] {
    const ret = lerXml(corpo).getElementsByTagNameNS('*', 'retEnvEvento')[0] as unknown as Element | undefined;
    if (!ret) throw new ErroDeComunicacao('Resposta da SEFAZ fora do padrão (sem retEnvEvento).');
    const cStatLote = texto(ret, 'cStat');
    if (!/^\d{3}$/.test(cStatLote)) throw new ErroDeComunicacao('Resposta da SEFAZ fora do padrão (sem o cStat do lote).');
    if (cStatLote !== '128') {
      const xMotivo = texto(ret, 'xMotivo');
      return chaves.map((chave) => ({ chave, status: 'REJEITADA', cStat: cStatLote, xMotivo, protocolo: null }));
    }
    const retornos: Retorno[] = filhos(ret, 'retEvento').map((r) => {
      const inf = filhos(r, 'infEvento')[0];
      return { chave: texto(inf, 'chNFe'), cStat: texto(inf, 'cStat'), xMotivo: texto(inf, 'xMotivo'), protocolo: texto(inf, 'nProt') || null };
    });
    return chaves.map((chave, i) => {
      // um retEvento por evento, na ordem do envio; se o retorno vier sem chNFe, vale a posição
      const r = retornos.find((x) => x.chave === chave) ?? (retornos[i] && !retornos[i].chave ? retornos[i] : undefined);
      if (!r || !/^\d{3}$/.test(r.cStat)) throw new ErroDeComunicacao('Resposta da SEFAZ fora do padrão (evento sem resultado).');
      return { chave, status: classificar(r.cStat), cStat: r.cStat, xMotivo: r.xMotivo, protocolo: r.protocolo };
    });
  }

  /**
   * Registra a Ciência de cada chave em lotes (um evento por requisição, a menos que `opcoes.eventosPorLote` diga o contrário; pausa entre
   * as requisições). Chave repetida vai uma só vez e o resultado segue a ordem das chaves. Se uma requisição falhar depois de outras já
   * terem dado resultado, lança ErroCienciaParcial.
   */
  async registrarCiencia(pedido: PedidoCiencia, certificado: MaterialCertificado): Promise<ResultadoCiencia[]> {
    validarPedido(pedido);
    const chaves = [...new Set(pedido.chaves)];
    if (chaves.length === 0) return [];
    const agora = pedido.agora ?? new Date();
    const url = new URL(this.opcoes.urls?.[pedido.ambiente] ?? URLS_RECEPCAO_EVENTO[pedido.ambiente]);

    // Monta e assina todos os lotes antes do primeiro envio: problema no certificado ou nos dados não deixa a sequência pela metade.
    const lotes: { chaves: string[]; envelope: Buffer }[] = [];
    const porLote = Math.min(Math.max(Math.floor(this.opcoes.eventosPorLote ?? 1) || 1, 1), MAX_EVENTOS_POR_LOTE);
    for (let i = 0; i < chaves.length; i += porLote) {
      const parte = chaves.slice(i, i + porLote);
      const { ambiente, documentoDestinatario } = pedido;
      const envEvento = montarEnvEvento({ ambiente, documentoDestinatario, chaves: parte, idLote: idLoteDe(agora, lotes.length), agora }, certificado);
      lotes.push({ chaves: parte, envelope: Buffer.from(this.montarEnvelope(envEvento), 'utf8') });
    }

    const resultados: ResultadoCiencia[] = [];
    const pausa = this.opcoes.pausaMs ?? PAUSA_PADRAO_MS;
    for (let i = 0; i < lotes.length; i += 1) {
      if (i > 0 && pausa > 0) await dormir(pausa);
      try {
        resultados.push(...this.lerResposta(await this.postar(url, lotes[i].envelope, certificado), lotes[i].chaves));
      } catch (e) {
        if (resultados.length > 0 && e instanceof ErroDeComunicacao) throw new ErroCienciaParcial(e.message, resultados);
        throw e;
      }
    }
    return resultados;
  }

  private async postar(url: URL, envelope: Buffer, m: MaterialCertificado): Promise<string> {
    let prazo: NodeJS.Timeout | undefined;
    try {
      return await new Promise<string>((resolve, reject) => {
        const falhar = (mensagem: string) => reject(new ErroDeComunicacao(mensagem));
        let req: ClientRequest;
        try {
          req = request(
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
              headers: {
                'Content-Type': `application/soap+xml; charset=utf-8; action="${NS_WSDL}/nfeRecepcaoEvento"`,
                'Content-Length': envelope.length,
              },
            },
            (res) => {
              const partes: Buffer[] = [];
              let total = 0;
              res.on('data', (p: Buffer) => {
                total += p.length;
                if (total > LIMITE_RESPOSTA) { req.destroy(new ErroDeComunicacao('Resposta da SEFAZ grande demais.')); return; }
                partes.push(p);
              });
              res.on('end', () => {
                const txt = Buffer.concat(partes).toString('utf8');
                if ((res.statusCode ?? 0) >= 400 && !txt.includes('retEnvEvento')) falhar(`A SEFAZ respondeu HTTP ${res.statusCode}.`);
                else resolve(txt);
              });
              res.on('error', () => falhar('Conexão com a SEFAZ interrompida.'));
            },
          );
        } catch {
          falhar('Não foi possível abrir a conexão segura com a SEFAZ (endereço ou certificado do cliente inválido).');
          return;
        }
        // prazo total da chamada (conexão, envio e resposta); o timeout do socket só vale para inatividade
        prazo = setTimeout(
          () => req.destroy(new ErroDeComunicacao('Tempo esgotado ao aguardar a resposta da SEFAZ.')),
          this.opcoes.timeoutMs ?? 60_000,
        );
        req.on('error', (e) => {
          const codigo = (e as NodeJS.ErrnoException).code;
          reject(e instanceof ErroDeComunicacao ? e : new ErroDeComunicacao(`Falha de comunicação com a SEFAZ (${codigo || 'erro de conexão'}).`));
        });
        req.write(envelope);
        req.end();
      });
    } finally {
      clearTimeout(prazo);
    }
  }
}
