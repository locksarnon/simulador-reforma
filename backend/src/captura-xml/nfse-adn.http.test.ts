import { generateKeyPairSync } from 'crypto';
import { createServer, Server } from 'https';
import { AddressInfo } from 'net';
import * as forge from 'node-forge';
import { TLSSocket } from 'tls';
import { gzipSync } from 'zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConsultaDistribuicao, ErroDeComunicacao } from './distribuicao-dfe.cliente';
import { NfseAdnHttp, OpcoesNfseAdn, URLS_ADN } from './nfse-adn.http';

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

const NFSE = '<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS1"><xTribNac>ação</xTribNac></infNFSe></NFSe>';
const EVENTO = '<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento Id="EVT1"/></evento>';

const gz = (xml: string) => gzipSync(Buffer.from(xml)).toString('base64');
const item = (nsu: number | string, xml = NFSE, tipo = 'NFSE') => ({
  NSU: nsu, ChaveAcesso: `chave${nsu}`, TipoDocumento: tipo, TipoEvento: null, ArquivoXml: gz(xml), DataHoraGeracao: '2026-11-05T10:20:00',
});
const lote = (itens: object[]) => JSON.stringify({ StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: itens, Alertas: [], Erros: [], TipoConsulta: 'CnpjBase' });
const erro = (codigo: string, descricao: string) =>
  JSON.stringify({ StatusProcessamento: 'REJEICAO', LoteDFe: [], Alertas: [], Erros: [{ Codigo: codigo, Descricao: descricao }], TipoConsulta: 'InscricaoCertificado' });

const consulta: ConsultaDistribuicao = { tipo: 'NFSE', ambiente: 'HOMOLOGACAO', documento: '12345678000195', ufAutor: '', ultNSU: '000000000000000' };

type Resposta = { status: number; corpo: string; tipo?: string } | 'mudo';

describe('NfseAdnHttp (servidor de teste com TLS mútuo)', () => {
  const servidor = gerarCert('servidor.teste', '127.0.0.1');
  const cliente = gerarCert('EMPRESA TESTE LTDA:12345678000195');
  const estranho = gerarCert('ESTRANHO LTDA:11111111000191');
  const material = { certificadoId: 'k1', documento: '12345678000195', keyPem: cliente.keyPem, certPem: cliente.certPem, cadeiaPem: [] };
  let srv: Server;
  let porta = 0;
  let resposta: Resposta = { status: 200, corpo: lote([]) };
  const vistos: { cn?: string | string[]; metodo?: string; caminho?: string; accept?: string }[] = [];

  beforeAll(async () => {
    // o servidor só atende quem apresenta o certificado do cliente de teste (TLS mútuo de verdade)
    srv = createServer({ key: servidor.keyPem, cert: servidor.certPem, ca: [cliente.certPem], requestCert: true, rejectUnauthorized: true }, (req, res) => {
      vistos.push({ cn: (req.socket as TLSSocket).getPeerCertificate()?.subject?.CN, metodo: req.method, caminho: req.url, accept: String(req.headers.accept) });
      req.resume();
      if (resposta === 'mudo') return;
      res.statusCode = resposta.status;
      res.setHeader('Content-Type', resposta.tipo ?? 'application/json; charset=utf-8');
      res.end(resposta.corpo);
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    porta = (srv.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => srv.close(() => r())));

  const novo = (extra: OpcoesNfseAdn = {}) => {
    const c = new NfseAdnHttp();
    const url = `https://127.0.0.1:${porta}/contribuintes`;
    c.opcoes = { ca: servidor.certPem, urls: { HOMOLOGACAO: url, PRODUCAO: url }, ...extra };
    return c;
  };
  const responde = (r: Resposta) => { resposta = r; vistos.length = 0; };

  it('aponta para os endereços do ADN: produção e produção restrita', () => {
    expect(URLS_ADN).toEqual({ PRODUCAO: 'https://adn.nfse.gov.br/contribuintes', HOMOLOGACAO: 'https://adn.producaorestrita.nfse.gov.br/contribuintes' });
  });

  it('apresenta o certificado do cliente e consulta GET /DFe/{NSU} com lote e o CNPJ da empresa, sem zeros à esquerda no NSU', async () => {
    responde({ status: 200, corpo: lote([item(71)]) });
    await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material);
    expect(vistos).toHaveLength(1);
    expect(vistos[0]).toMatchObject({ cn: 'EMPRESA TESTE LTDA:12345678000195', metodo: 'GET', caminho: '/contribuintes/DFe/70?lote=true&cnpjConsulta=12345678000195', accept: 'application/json' });

    responde({ status: 200, corpo: lote([]) });
    await novo().consultar(consulta, material);
    expect(vistos[0].caminho).toBe('/contribuintes/DFe/0?lote=true&cnpjConsulta=12345678000195');
  });

  it('o CNPJ consultado é o da empresa (filial), não o do titular do certificado; CPF vai em cpfConsulta', async () => {
    responde({ status: 200, corpo: lote([]) });
    await novo().consultar({ ...consulta, documento: '12345678000276' }, material);
    expect(vistos[0].caminho).toBe('/contribuintes/DFe/0?lote=true&cnpjConsulta=12345678000276');
    await novo().consultar({ ...consulta, documento: '12345678909' }, material);
    expect(vistos[1].caminho).toBe('/contribuintes/DFe/0?lote=true&cpfConsulta=12345678909');
  });

  it('decodifica gzip e base64 para texto UTF-8, rotula pelo elemento raiz e usa o maior NSU do lote (lote incompleto: não há mais)', async () => {
    responde({ status: 200, corpo: lote([item(71), item(72, EVENTO, 'EVENTO')]) });
    const r = await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material);
    expect(r).toEqual({
      cStat: '138', xMotivo: 'Documento(s) localizado(s)', ultNSU: '000000000000072', maxNSU: '000000000000072', maisDocumentos: false,
      documentos: [
        { nsu: '000000000000071', schema: 'NFSe', xml: NFSE },
        { nsu: '000000000000072', schema: 'evento', xml: EVENTO },
      ],
    });
    expect(r.documentos[0].xml).toContain('ação');
  });

  it('o NSU pedido pode voltar repetido no lote: o resultado não anda para trás', async () => {
    responde({ status: 200, corpo: lote([item(70), item(71)]) });
    const r = await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material);
    expect(r.documentos.map((d) => d.nsu)).toEqual(['000000000000070', '000000000000071']);
    expect(r.ultNSU).toBe('000000000000071');
  });

  it('lote cheio (50 documentos) indica que pode haver mais; 49 não', async () => {
    responde({ status: 200, corpo: lote(Array.from({ length: 50 }, (_, i) => item(71 + i))) });
    const cheio = await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material);
    expect(cheio).toMatchObject({ cStat: '138', ultNSU: '000000000000120', maxNSU: '000000000000120', maisDocumentos: true });
    expect(cheio.documentos).toHaveLength(50);

    responde({ status: 200, corpo: lote(Array.from({ length: 49 }, (_, i) => item(71 + i))) });
    expect((await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material)).maisDocumentos).toBe(false);
  });

  it('lote cheio que não avança o NSU não manda buscar de novo (evita repetir o mesmo lote); com o NSU pedido repetido no início, avança', async () => {
    responde({ status: 200, corpo: lote(Array.from({ length: 50 }, (_, i) => item(21 + i))) });
    const parado = await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material);
    expect(parado).toMatchObject({ cStat: '138', ultNSU: '000000000000070', maisDocumentos: false });

    responde({ status: 200, corpo: lote(Array.from({ length: 50 }, (_, i) => item(70 + i))) });
    expect(await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material)).toMatchObject({ ultNSU: '000000000000119', maisDocumentos: true });
  });

  it('NSU de mais de 15 dígitos (e maior que o inteiro seguro do JavaScript) chega inteiro, como número ou como texto', async () => {
    const b64 = gz(NFSE);
    const corpo = `{"StatusProcessamento":"DOCUMENTOS_LOCALIZADOS","LoteDFe":[{"NSU":12345678901234567890,"ArquivoXml":"${b64}"},{"NSU":"12345678901234567891","ArquivoXml":"${b64}"}]}`;
    responde({ status: 200, corpo });
    const r = await novo().consultar({ ...consulta, ultNSU: '12345678901234567800' }, material);
    expect(r.documentos.map((d) => d.nsu)).toEqual(['12345678901234567890', '12345678901234567891']);
    expect(r).toMatchObject({ ultNSU: '12345678901234567891', maxNSU: '12345678901234567891' });
    expect(vistos[0].caminho).toBe('/contribuintes/DFe/12345678901234567800?lote=true&cnpjConsulta=12345678000195');
  });

  it('lote vazio (200) é fim da fila e mantém o NSU pedido', async () => {
    responde({ status: 200, corpo: lote([]) });
    expect(await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material)).toEqual({
      cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: '000000000000070', maxNSU: '000000000000070', documentos: [],
    });
  });

  it('404 com StatusProcessamento NENHUM_DOCUMENTO_LOCALIZADO, mesmo sem a lista de erros, é fim da fila', async () => {
    responde({ status: 404, corpo: JSON.stringify({ StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO', LoteDFe: null }) });
    expect(await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material)).toMatchObject({ cStat: '137', ultNSU: '000000000000070', documentos: [] });
  });

  it('traduz cada erro de negócio do ADN para o cStat que as regras do motor conhecem', async () => {
    const tabela: [status: number, codigo: string, cStat: string][] = [
      [404, 'E2220', '137'], [404, 'E2230', '137'], [404, 'E2215', '137'],
      [400, 'E2210', '280'], [400, 'E2211', '284'], [400, 'E2212', '283'], [400, 'E2213', '281'], [400, 'E2214', '286'],
      [400, 'E2243', '593'], [400, 'E2245', '593'],
      [400, 'E2244', '489'], [400, 'E2246', '489'], [400, 'E2247', '489'],
      [400, 'E999', '999'],
      [404, 'E2241', '215'], [400, 'E1234', '215'],
    ];
    for (const [status, codigo, cStat] of tabela) {
      responde({ status, corpo: erro(codigo, `Descrição de ${codigo}.`) });
      const r = await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material);
      expect(r, codigo).toMatchObject({ cStat, ultNSU: '000000000000070', maxNSU: '000000000000070', documentos: [] });
      if (cStat !== '137') expect(r.xMotivo, codigo).toBe(`${codigo}: Descrição de ${codigo}.`);
    }
  });

  it('o erro vale mesmo que o HTTP seja 200, e só o primeiro erro decide', async () => {
    responde({ status: 200, corpo: JSON.stringify({ Erros: [{ Codigo: 'E2211', Descricao: 'Certificado de transmissão revogado.' }, { Codigo: 'E2244', Descricao: 'x' }] }) });
    expect(await novo().consultar(consulta, material)).toMatchObject({ cStat: '284', xMotivo: 'E2211: Certificado de transmissão revogado.' });
  });

  it('aceita os campos em camelCase e o código de erro em minúsculas', async () => {
    responde({ status: 200, corpo: JSON.stringify({ statusProcessamento: 'DOCUMENTOS_LOCALIZADOS', loteDFe: [{ nsu: 5, arquivoXml: gz(NFSE) }] }) });
    expect(await novo().consultar(consulta, material)).toMatchObject({ cStat: '138', ultNSU: '000000000000005' });
    responde({ status: 400, corpo: JSON.stringify({ erros: [{ codigo: 'e2213', descricao: 'Certificado de transmissão expirado.' }] }) });
    expect(await novo().consultar(consulta, material)).toMatchObject({ cStat: '281' });
  });

  it('XML sem gzip só vale se for XML; o rótulo cai para o TipoDocumento quando o conteúdo não tem raiz', async () => {
    responde({ status: 200, corpo: lote([{ NSU: 1, TipoDocumento: 'NFSE', ArquivoXml: Buffer.from(NFSE).toString('base64') }]) });
    expect((await novo().consultar(consulta, material)).documentos[0]).toMatchObject({ schema: 'NFSe', xml: NFSE });
    responde({ status: 200, corpo: lote([{ NSU: 1, TipoDocumento: 'NFSE', ArquivoXml: gz('texto sem tag') }]) });
    expect((await novo().consultar(consulta, material)).documentos[0]).toMatchObject({ schema: 'NFSE', xml: 'texto sem tag' });
    responde({ status: 200, corpo: lote([{ NSU: 1, ArquivoXml: Buffer.from('isto não é XML').toString('base64') }]) });
    await expect(novo().consultar(consulta, material)).rejects.toThrow(/compactado inválido/);
  });

  it('gzip corrompido, NSU ou ArquivoXml ausentes viram falha de comunicação', async () => {
    responde({ status: 200, corpo: lote([{ NSU: 1, ArquivoXml: Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.from('lixo')]).toString('base64') }]) });
    await expect(novo().consultar(consulta, material)).rejects.toThrow(/compactado inválido/);
    responde({ status: 200, corpo: lote([{ ArquivoXml: gz(NFSE) }]) });
    await expect(novo().consultar(consulta, material)).rejects.toThrow(/sem NSU ou sem ArquivoXml/);
    responde({ status: 200, corpo: lote([item(1), { NSU: 2 }]) });
    await expect(novo().consultar(consulta, material)).rejects.toThrow(ErroDeComunicacao);
  });

  it('resposta que não é JSON, fora do padrão ou 404 sem código reconhecido não é fim da fila: é falha de comunicação', async () => {
    const casos: [Resposta, RegExp][] = [
      [{ status: 200, corpo: '<html>Servico indisponivel</html>', tipo: 'text/html' }, /sem JSON/],
      [{ status: 404, corpo: '<html>Not Found</html>', tipo: 'text/html' }, /sem JSON/],
      [{ status: 200, corpo: '' }, /sem JSON/],
      [{ status: 200, corpo: '[]' }, /sem JSON/],
      [{ status: 200, corpo: '{}' }, /fora do padrão/],
      [{ status: 200, corpo: JSON.stringify({ StatusProcessamento: 'REJEICAO', LoteDFe: null }) }, /fora do padrão/],
      [{ status: 200, corpo: JSON.stringify({ StatusProcessamento: 'REJEICAO', LoteDFe: [], Erros: [] }) }, /fora do padrão/],
      [{ status: 404, corpo: JSON.stringify({ title: 'Not Found', status: 404 }) }, /HTTP 404/],
      [{ status: 403, corpo: JSON.stringify({ message: 'Forbidden' }) }, /HTTP 403/],
    ];
    for (const [r, padrao] of casos) {
      responde(r);
      const e = await novo().consultar(consulta, material).catch((x: unknown) => x);
      expect(e, JSON.stringify(r)).toBeInstanceOf(ErroDeComunicacao);
      expect((e as Error).message).toMatch(padrao);
    }
  });

  it('HTTP 429 e 5xx viram falha de comunicação, mesmo com corpo JSON', async () => {
    for (const status of [429, 500, 502, 503]) {
      responde({ status, corpo: erro('E999', 'Falha não tratada.') });
      const e = await novo().consultar(consulta, material).catch((x: unknown) => x);
      expect(e, String(status)).toBeInstanceOf(ErroDeComunicacao);
      expect((e as Error).message).toBe(`O ADN respondeu HTTP ${status}.`);
    }
  });

  it('tempo esgotado vira falha de comunicação, sem esperar além do prazo', async () => {
    responde('mudo');
    const inicio = Date.now();
    await expect(novo({ timeoutMs: 300 }).consultar(consulta, material)).rejects.toThrow(/Tempo esgotado/);
    expect(Date.now() - inicio).toBeLessThan(3000);
  });

  it('resposta maior que o limite é cortada e vira falha de comunicação', async () => {
    responde({ status: 200, corpo: lote([item(1)]) + ' '.repeat(5000) });
    await expect(novo({ limiteRespostaBytes: 2000 }).consultar(consulta, material)).rejects.toThrow(/grande demais/);
  });

  it('a verificação do certificado do servidor está sempre ligada', async () => {
    responde({ status: 200, corpo: lote([]) });
    const semConfianca = new NfseAdnHttp();
    semConfianca.opcoes = { urls: { HOMOLOGACAO: `https://127.0.0.1:${porta}/contribuintes` } };
    const e = await semConfianca.consultar(consulta, material).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroDeComunicacao);
    expect((e as Error).message).toMatch(/^Falha de comunicação com o ADN \(\w+\)\.$/);
    expect((e as Error).message).not.toMatch(/PRIVATE|BEGIN/);
    expect(vistos).toHaveLength(0);
  });

  it('o servidor recusa certificado de cliente desconhecido e isso vira falha de comunicação sem vazar a chave', async () => {
    responde({ status: 200, corpo: lote([]) });
    const e = await novo().consultar(consulta, { ...material, keyPem: estranho.keyPem, certPem: estranho.certPem }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroDeComunicacao);
    expect((e as Error).message).not.toMatch(/PRIVATE|BEGIN/);
    expect(vistos).toHaveLength(0);
  });

  it('endereço fora de https ou chave que não corresponde ao certificado vira falha de comunicação sem vazar o certificado', async () => {
    const http = await novo({ urls: { HOMOLOGACAO: 'http://127.0.0.1:1/x' } }).consultar(consulta, material).catch((x: unknown) => x);
    expect(http).toBeInstanceOf(ErroDeComunicacao);
    expect((http as Error).message).not.toMatch(/PRIVATE|BEGIN/);
    const par = await novo().consultar(consulta, { ...material, keyPem: estranho.keyPem }).catch((x: unknown) => x);
    expect(par).toBeInstanceOf(ErroDeComunicacao);
    expect((par as Error).message).not.toMatch(/PRIVATE|BEGIN/);
  });

  it('recusa dados de consulta fora do padrão antes de qualquer envio', async () => {
    responde({ status: 200, corpo: lote([]) });
    const c = novo();
    await expect(c.consultar({ ...consulta, documento: '12ABC34501DE35' }, material)).rejects.toThrow(/Documento do titular inválido/);
    await expect(c.consultar({ ...consulta, documento: '123<script>' }, material)).rejects.toThrow(/Documento do titular inválido/);
    await expect(c.consultar({ ...consulta, documento: '1234567800019' }, material)).rejects.toThrow(/Documento do titular inválido/);
    await expect(c.consultar({ ...consulta, ultNSU: '12a' }, material)).rejects.toThrow(/NSU inválido/);
    await expect(c.consultar({ ...consulta, ultNSU: '1'.repeat(21) }, material)).rejects.toThrow(/NSU inválido/);
    await expect(c.consultar({ ...consulta, ultNSU: '' }, material)).rejects.toThrow(/NSU inválido/);
    await expect(c.consultar({ ...consulta, tipo: 'NFE' }, material)).rejects.toThrow(/atende só a NFS-e/);
    expect(vistos).toHaveLength(0);
  });
});
