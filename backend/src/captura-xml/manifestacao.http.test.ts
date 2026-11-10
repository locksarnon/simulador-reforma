import { DOMParser } from '@xmldom/xmldom';
import { generateKeyPairSync } from 'crypto';
import { createServer, Server } from 'https';
import { AddressInfo } from 'net';
import * as forge from 'node-forge';
import { TLSSocket } from 'tls';
import { SignedXml } from 'xml-crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErroDeComunicacao } from './distribuicao-dfe.cliente';
import { ErroCienciaParcial, PedidoCiencia, ResultadoCiencia } from './manifestacao.cliente';
import { ManifestacaoHttp, OpcoesManifestacao, URLS_RECEPCAO_EVENTO } from './manifestacao.http';

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const CAMINHO = '/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';

function gerarCert(cn: string, ip?: string) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
  const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.rsa.setPublicKey(key.n, key.e);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([{ name: 'commonName', value: cn }]);
  if (ip) cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 7, ip }] }]);
  cert.sign(key, forge.md.sha256.create());
  return { keyPem, certPem: forge.pki.certificateToPem(cert) };
}

const chaveDe = (n: number) => `3526104589901700016055001${String(n).padStart(9, '0')}112345678${n % 10}`;

/** Verifica com o xml-crypto cada Signature do documento. */
function verificarAssinaturas(xml: string, certPem: string): boolean[] {
  const assinaturas = new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagNameNS(NS_DSIG, 'Signature');
  const resultados: boolean[] = [];
  for (let i = 0; i < assinaturas.length; i += 1) {
    try {
      const sig = new SignedXml({ publicCert: certPem });
      sig.loadSignature(assinaturas[i] as unknown as Node);
      resultados.push(sig.checkSignature(xml));
    } catch {
      resultados.push(false);
    }
  }
  return resultados;
}

type Resposta = [cStat: string, xMotivo: string, nProt?: string];

const retEvento = (chave: string | null, [cStat, xMotivo, nProt]: Resposta) =>
  '<retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><verAplic>AN_1.0.0</verAplic><cOrgao>91</cOrgao>' +
  `<cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo>${chave ? `<chNFe>${chave}</chNFe>` : ''}<tpEvento>210210</tpEvento>` +
  '<xEvento>Ciencia da Operacao registrada</xEvento><nSeqEvento>1</nSeqEvento><CNPJDest>12345678000195</CNPJDest>' +
  `<dhRegEvento>2026-11-10T10:15:31-03:00</dhRegEvento>${nProt ? `<nProt>${nProt}</nProt>` : ''}</infEvento></retEvento>`;

const retEnv = (cStat: string, xMotivo: string, eventos = '') =>
  '<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb><verAplic>AN_1.0.0</verAplic>' +
  `<cOrgao>91</cOrgao><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo>${eventos}</retEnvEvento>`;

const soap = (ret: string) =>
  '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>' +
  `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${ret}</nfeResultMsg></soap:Body></soap:Envelope>`;

const chavesDo = (envelope: string) => [...envelope.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map((m) => m[1]);
const contar = (envelope: string) => (envelope.match(/<evento /g) ?? []).length;

describe('ManifestacaoHttp (servidor de teste com TLS mútuo)', () => {
  const servidor = gerarCert('servidor.teste', '127.0.0.1');
  const cliente = gerarCert('EMPRESA TESTE LTDA:12345678000195');
  const estranho = gerarCert('ESTRANHO LTDA:11111111000191');
  const material = { certificadoId: 'k1', documento: '12345678000195', keyPem: cliente.keyPem, certPem: cliente.certPem, cadeiaPem: [] };
  const pedido: PedidoCiencia = { ambiente: 'HOMOLOGACAO', documentoDestinatario: '12345678000195', chaves: [chaveDe(1)], agora: new Date('2026-11-10T13:15:30Z') };

  type Modo = 'ok' | 'invertido' | 'sem-chnfe' | 'lote-rejeitado' | 'sem-retevento' | 'http500' | 'http500-com-retorno' | 'html' | 'falha-no-segundo' | 'mudo';
  let srv: Server;
  let porta = 0;
  let modo: Modo = 'ok';
  let respostas: Record<string, Resposta> = {};
  const vistos: { cn?: string | string[]; envelope: string; contentType: string; caminho?: string; quando: number }[] = [];

  beforeAll(async () => {
    // o servidor só atende quem apresenta o certificado do cliente de teste (TLS mútuo de verdade)
    srv = createServer({ key: servidor.keyPem, cert: servidor.certPem, ca: [cliente.certPem], requestCert: true, rejectUnauthorized: true }, (req, res) => {
      const partes: Buffer[] = [];
      req.on('data', (p) => partes.push(p));
      req.on('end', () => {
        const envelope = Buffer.concat(partes).toString('utf8');
        vistos.push({
          cn: (req.socket as TLSSocket).getPeerCertificate()?.subject?.CN,
          envelope,
          contentType: String(req.headers['content-type']),
          caminho: req.url,
          quando: Date.now(),
        });
        res.setHeader('Content-Type', 'application/soap+xml; charset=utf-8');
        if (modo === 'mudo') return;
        if (modo === 'http500' || (modo === 'falha-no-segundo' && vistos.length === 2)) { res.statusCode = 500; res.end('<soap:Fault/>'); return; }
        if (modo === 'html') { res.end('<html><body>Servico indisponivel</body></html>'); return; }
        if (modo === 'lote-rejeitado') { res.end(soap(retEnv('215', 'Rejeicao: Falha no schema XML do lote'))); return; }
        if (modo === 'sem-retevento') { res.end(soap(retEnv('128', 'Lote de Evento Processado'))); return; }
        const eventos = chavesDo(envelope).map((chave, i) =>
          retEvento(modo === 'sem-chnfe' ? null : chave, respostas[chave] ?? ['135', 'Evento registrado e vinculado a NF-e', `8912600000000${10 + i}`]),
        );
        if (modo === 'invertido') eventos.reverse();
        if (modo === 'http500-com-retorno') res.statusCode = 500;
        res.end(soap(retEnv('128', 'Lote de Evento Processado', eventos.join(''))));
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    porta = (srv.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => srv.close(() => r())));

  const novo = (extra: OpcoesManifestacao = {}) => {
    const url = `https://127.0.0.1:${porta}${CAMINHO}`;
    const c = new ManifestacaoHttp();
    c.opcoes = { ca: servidor.certPem, urls: { HOMOLOGACAO: url, PRODUCAO: url }, pausaMs: 0, eventosPorLote: 5, ...extra };
    return c;
  };
  const reinicia = (m: Modo = 'ok') => { modo = m; respostas = {}; vistos.length = 0; };

  it('aponta para os endereços oficiais do NFeRecepcaoEvento4 do Ambiente Nacional', () => {
    expect(URLS_RECEPCAO_EVENTO).toEqual({
      PRODUCAO: 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
      HOMOLOGACAO: 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    });
  });

  it('apresenta o certificado do cliente, envia o SOAP 1.2 esperado e traduz o retorno de cada evento', async () => {
    reinicia();
    const tabela: [Resposta, ResultadoCiencia['status'], string | null][] = [
      [['135', 'Evento registrado e vinculado a NF-e', '891260000000001'], 'REGISTRADA', '891260000000001'],
      [['136', 'Evento registrado, mas nao vinculado a NF-e', '891260000000002'], 'REGISTRADA', '891260000000002'],
      [['573', 'Rejeicao: Duplicidade de evento'], 'JA_REGISTRADA', null],
      [['596', 'Rejeicao: Evento fora do prazo'], 'NAO_APLICAVEL', null],
      [['650', 'Rejeicao: Ciencia da Operacao para NF-e cancelada ou denegada'], 'NAO_APLICAVEL', null],
      [['655', 'Rejeicao: Ciencia da Operacao apos manifestacao final'], 'NAO_APLICAVEL', null],
      [['651', 'Rejeicao: Desconhecimento da Operacao para NF-e cancelada ou denegada'], 'NAO_APLICAVEL', null],
      [['575', 'Rejeicao: CNPJ do autor diferente do destinatario da NF-e'], 'REJEITADA', null],
    ];
    const chaves = tabela.map((_, i) => chaveDe(i + 1));
    tabela.forEach(([resposta], i) => { respostas[chaves[i]] = resposta; });

    const r = await novo().registrarCiencia({ ...pedido, chaves }, material);

    expect(r).toEqual(tabela.map(([[cStat, xMotivo], status, protocolo], i) => ({ chave: chaves[i], status, cStat, xMotivo, protocolo })));
    // 8 chaves em lotes de no máximo 5 eventos: 5 + 3
    expect(vistos.map((v) => contar(v.envelope))).toEqual([5, 3]);
    const v = vistos[0];
    expect(v.cn).toBe('EMPRESA TESTE LTDA:12345678000195');
    expect(v.caminho).toBe(CAMINHO);
    expect(v.contentType).toBe('application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"');
    expect(v.envelope.startsWith(
      '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>' +
        '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"><envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>',
    )).toBe(true);
    expect(v.envelope.endsWith('</envEvento></nfeDadosMsg></soap12:Body></soap12:Envelope>')).toBe(true);
    expect(v.envelope).not.toContain('PRIVATE KEY');
    expect(chavesDo(v.envelope)).toEqual(chaves.slice(0, 5));
    expect(chavesDo(vistos[1].envelope)).toEqual(chaves.slice(5));
    expect(v.envelope).toContain('<tpAmb>2</tpAmb><CNPJ>12345678000195</CNPJ>');
    expect(v.envelope).toContain('<dhEvento>2026-11-10T10:15:30-03:00</dhEvento>');
  });

  it('o servidor consegue verificar as assinaturas do lote que recebeu (conteúdo do nfeDadosMsg)', async () => {
    reinicia();
    await novo().registrarCiencia({ ...pedido, chaves: [1, 2, 3, 4, 5].map(chaveDe) }, material);
    const lote = /<envEvento[\s\S]*<\/envEvento>/.exec(vistos[0].envelope)![0];
    expect(verificarAssinaturas(lote, cliente.certPem)).toEqual([true, true, true, true, true]);
  });

  it('divide 12 chaves em 3 requisições de 5, 5 e 2 eventos, com idLote numérico e distinto', async () => {
    reinicia();
    const chaves = Array.from({ length: 12 }, (_, i) => chaveDe(i + 1));
    const r = await novo().registrarCiencia({ ...pedido, chaves }, material);
    expect(vistos.map((v) => contar(v.envelope))).toEqual([5, 5, 2]);
    expect(vistos.flatMap((v) => chavesDo(v.envelope))).toEqual(chaves);
    expect(r.map((x) => x.chave)).toEqual(chaves);
    expect(r.every((x) => x.status === 'REGISTRADA' && x.cStat === '135' && x.protocolo !== null)).toBe(true);
    const ids = vistos.map((v) => /<idLote>(\d+)<\/idLote>/.exec(v.envelope)![1]);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^\d{1,15}$/);
  });

  it('por padrão manda um evento por requisição, para ficar abaixo de qualquer limite de tamanho da mensagem', async () => {
    reinicia();
    const chaves = [1, 2, 3].map(chaveDe);
    const padrao = novo({ eventosPorLote: undefined });
    const r = await padrao.registrarCiencia({ ...pedido, chaves }, material);
    expect(vistos.map((v) => contar(v.envelope))).toEqual([1, 1, 1]);
    expect(vistos.flatMap((v) => chavesDo(v.envelope))).toEqual(chaves);
    expect(vistos.every((v) => Buffer.byteLength(v.envelope) < 10_000)).toBe(true);
    expect(r.map((x) => x.chave)).toEqual(chaves);
  });

  it('chaves repetidas vão uma vez só e lista vazia não chama o serviço', async () => {
    reinicia();
    const r = await novo().registrarCiencia({ ...pedido, chaves: [chaveDe(1), chaveDe(2), chaveDe(1)] }, material);
    expect(r.map((x) => x.chave)).toEqual([chaveDe(1), chaveDe(2)]);
    expect(chavesDo(vistos[0].envelope)).toEqual([chaveDe(1), chaveDe(2)]);
    reinicia();
    expect(await novo().registrarCiencia({ ...pedido, chaves: [] }, material)).toEqual([]);
    expect(vistos).toHaveLength(0);
  });

  it('produção usa tpAmb 1 e CPF vai na tag CPF', async () => {
    reinicia();
    await novo().registrarCiencia({ ...pedido, ambiente: 'PRODUCAO', documentoDestinatario: '12345678909' }, material);
    expect(vistos[0].envelope).toContain('<tpAmb>1</tpAmb><CPF>12345678909</CPF>');
  });

  it('casa o retorno com a chave mesmo fora de ordem, e pela posição quando o retorno vem sem chNFe', async () => {
    reinicia('invertido');
    respostas[chaveDe(1)] = ['573', 'Rejeicao: Duplicidade de evento'];
    const invertido = await novo().registrarCiencia({ ...pedido, chaves: [chaveDe(1), chaveDe(2), chaveDe(3)] }, material);
    expect(invertido.map((x) => [x.chave, x.status])).toEqual([[chaveDe(1), 'JA_REGISTRADA'], [chaveDe(2), 'REGISTRADA'], [chaveDe(3), 'REGISTRADA']]);

    reinicia('sem-chnfe');
    respostas[chaveDe(2)] = ['596', 'Rejeicao: Evento fora do prazo'];
    const semChave = await novo().registrarCiencia({ ...pedido, chaves: [chaveDe(1), chaveDe(2)] }, material);
    expect(semChave.map((x) => [x.chave, x.status])).toEqual([[chaveDe(1), 'REGISTRADA'], [chaveDe(2), 'NAO_APLICAVEL']]);
  });

  it('espera 200 ms entre requisições por padrão', async () => {
    reinicia();
    await novo({ pausaMs: undefined }).registrarCiencia({ ...pedido, chaves: [1, 2, 3, 4, 5, 6].map(chaveDe) }, material);
    expect(vistos).toHaveLength(2);
    expect(vistos[1].quando - vistos[0].quando).toBeGreaterThanOrEqual(190);
  });

  it('lote rejeitado (cStat diferente de 128) vira REJEITADA com o cStat do lote para todas as chaves', async () => {
    reinicia('lote-rejeitado');
    const r = await novo().registrarCiencia({ ...pedido, chaves: [chaveDe(1), chaveDe(2)] }, material);
    expect(r).toEqual([chaveDe(1), chaveDe(2)].map((chave) => ({ chave, status: 'REJEITADA', cStat: '215', xMotivo: 'Rejeicao: Falha no schema XML do lote', protocolo: null })));
  });

  it('HTTP 4xx/5xx sem retEnvEvento, resposta fora do padrão e evento sem resultado viram falha de comunicação', async () => {
    reinicia('http500');
    await expect(novo().registrarCiencia(pedido, material)).rejects.toThrow(ErroDeComunicacao);
    await expect(novo().registrarCiencia(pedido, material)).rejects.toThrow(/HTTP 500/);
    reinicia('html');
    await expect(novo().registrarCiencia(pedido, material)).rejects.toThrow(/fora do padrão/);
    reinicia('sem-retevento');
    await expect(novo().registrarCiencia(pedido, material)).rejects.toThrow(/fora do padrão/);
  });

  it('HTTP 500 que traz o retEnvEvento é interpretado normalmente', async () => {
    reinicia('http500-com-retorno');
    const r = await novo().registrarCiencia(pedido, material);
    expect(r[0]).toMatchObject({ status: 'REGISTRADA', cStat: '135' });
  });

  it('tempo esgotado vira falha de comunicação', async () => {
    reinicia('mudo');
    const inicio = Date.now();
    await expect(novo({ timeoutMs: 300 }).registrarCiencia(pedido, material)).rejects.toThrow(/Tempo esgotado/);
    expect(Date.now() - inicio).toBeLessThan(3000);
  });

  it('a verificação do certificado do servidor está sempre ligada', async () => {
    reinicia();
    const semConfianca = new ManifestacaoHttp();
    semConfianca.opcoes = { urls: { HOMOLOGACAO: `https://127.0.0.1:${porta}${CAMINHO}` }, pausaMs: 0 };
    const erro = await semConfianca.registrarCiencia(pedido, material).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeComunicacao);
    expect((erro as Error).message).toMatch(/Falha de comunicação com a SEFAZ \(\w+\)/);
    expect((erro as Error).message).not.toMatch(/PRIVATE|BEGIN/);
    expect(vistos).toHaveLength(0);
  });

  it('o servidor recusa certificado de cliente desconhecido e isso vira falha de comunicação', async () => {
    reinicia();
    await expect(novo().registrarCiencia(pedido, { ...material, keyPem: estranho.keyPem, certPem: estranho.certPem })).rejects.toThrow(ErroDeComunicacao);
    expect(vistos).toHaveLength(0);
  });

  it('falha no meio da sequência traz os resultados dos lotes anteriores; falha no primeiro lote não traz nada', async () => {
    reinicia('falha-no-segundo');
    const chaves = [1, 2, 3, 4, 5, 6, 7].map(chaveDe);
    const erro = await novo().registrarCiencia({ ...pedido, chaves }, material).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroCienciaParcial);
    expect(erro).toBeInstanceOf(ErroDeComunicacao);
    expect((erro as ErroCienciaParcial).message).toMatch(/HTTP 500/);
    expect((erro as ErroCienciaParcial).resultados.map((x) => [x.chave, x.status])).toEqual(chaves.slice(0, 5).map((c) => [c, 'REGISTRADA']));

    reinicia('http500');
    const primeiro = await novo().registrarCiencia({ ...pedido, chaves }, material).catch((e: unknown) => e);
    expect(primeiro).toBeInstanceOf(ErroDeComunicacao);
    expect(primeiro).not.toBeInstanceOf(ErroCienciaParcial);
    expect(vistos).toHaveLength(1);
  });

  it('recusa pedido fora do padrão antes de qualquer envio', async () => {
    reinicia();
    const c = novo();
    await expect(c.registrarCiencia({ ...pedido, chaves: [chaveDe(1), 'curta'] }, material)).rejects.toThrow(/Chave de acesso inválida/);
    await expect(c.registrarCiencia({ ...pedido, chaves: [`${chaveDe(1).slice(0, 40)}<x/>`] }, material)).rejects.toThrow(/Chave de acesso inválida/);
    await expect(c.registrarCiencia({ ...pedido, documentoDestinatario: '123<x>' }, material)).rejects.toThrow(/Documento do destinatário inválido/);
    await expect(c.registrarCiencia({ ...pedido, ambiente: 'TESTE' as never }, material)).rejects.toThrow(/Ambiente inválido/);
    await expect(c.registrarCiencia({ ...pedido, agora: new Date('x') }, material)).rejects.toThrow(/Data do evento inválida/);
    await expect(c.registrarCiencia(pedido, { ...material, keyPem: estranho.keyPem })).rejects.toThrow(/não corresponde ao certificado/);
    expect(vistos).toHaveLength(0);
  });

  it('endereço fora de https vira falha de comunicação sem vazar o certificado', async () => {
    const c = novo({ urls: { HOMOLOGACAO: 'http://127.0.0.1:1/x' } });
    const erro = await c.registrarCiencia(pedido, material).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeComunicacao);
    expect((erro as Error).message).not.toMatch(/PRIVATE|BEGIN/);
  });
});

describe('ManifestacaoHttp.lerResposta', () => {
  const c = new ManifestacaoHttp();
  const chaves = [chaveDe(1), chaveDe(2)];

  it('acha o retEnvEvento pelo nome local, com prefixos de namespace e Signature dentro do retEvento', () => {
    const corpo =
      '<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Body><w:nfeResultMsg xmlns:w="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">' +
      '<n:retEnvEvento xmlns:n="http://www.portalfiscal.inf.br/nfe" versao="1.00"><n:idLote>1</n:idLote><n:cStat>128</n:cStat><n:xMotivo>Lote de Evento Processado</n:xMotivo>' +
      `<n:retEvento versao="1.00"><n:infEvento Id="ID1"><n:cStat>135</n:cStat><n:xMotivo>Evento registrado e vinculado a NF-e</n:xMotivo><n:chNFe>${chaves[0]}</n:chNFe><n:nProt>891260000000001</n:nProt></n:infEvento>` +
      `<Signature xmlns="${NS_DSIG}"><SignedInfo/><SignatureValue>x</SignatureValue></Signature></n:retEvento>` +
      `<n:retEvento versao="1.00"><n:infEvento><n:cStat>573</n:cStat><n:xMotivo>Rejeicao: Duplicidade de evento</n:xMotivo><n:chNFe>${chaves[1]}</n:chNFe></n:infEvento></n:retEvento>` +
      '</n:retEnvEvento></w:nfeResultMsg></env:Body></env:Envelope>';
    expect(c.lerResposta(corpo, chaves)).toEqual([
      { chave: chaves[0], status: 'REGISTRADA', cStat: '135', xMotivo: 'Evento registrado e vinculado a NF-e', protocolo: '891260000000001' },
      { chave: chaves[1], status: 'JA_REGISTRADA', cStat: '573', xMotivo: 'Rejeicao: Duplicidade de evento', protocolo: null },
    ]);
  });

  it('o cStat do lote vale só quando está no retEnvEvento (não o do primeiro evento)', () => {
    const corpo = soap(retEnv('999', 'Rejeicao: Erro nao catalogado', retEvento(chaves[0], ['135', 'x'])));
    expect(c.lerResposta(corpo, chaves).map((x) => [x.status, x.cStat])).toEqual([['REJEITADA', '999'], ['REJEITADA', '999']]);
  });

  it('sem retEnvEvento, sem cStat do lote ou sem resultado para uma chave: fora do padrão', () => {
    expect(() => c.lerResposta('<soap:Fault/>', chaves)).toThrow(ErroDeComunicacao);
    expect(() => c.lerResposta('texto solto', chaves)).toThrow(ErroDeComunicacao);
    expect(() => c.lerResposta(soap('<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe"><xMotivo>x</xMotivo></retEnvEvento>'), chaves)).toThrow(/cStat do lote/);
    // o cStat de um evento não faz as vezes do cStat do lote
    expect(() => c.lerResposta(soap(`<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe">${retEvento(chaves[0], ['135', 'x'])}</retEnvEvento>`), chaves)).toThrow(/cStat do lote/);
    expect(() => c.lerResposta(soap(retEnv('128', 'ok', retEvento(chaves[0], ['135', 'x']))), chaves)).toThrow(/evento sem resultado/);
    expect(() => c.lerResposta(soap(retEnv('128', 'ok', retEvento(chaves[0], ['', 'x']) + retEvento(chaves[1], ['135', 'x']))), chaves)).toThrow(/evento sem resultado/);
  });
});
