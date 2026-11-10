import { generateKeyPairSync } from 'crypto';
import { createServer, Server } from 'https';
import { AddressInfo } from 'net';
import * as forge from 'node-forge';
import { gzipSync } from 'zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConsultaDistribuicao, ErroDeComunicacao } from './distribuicao-dfe.cliente';
import { DistribuicaoDfeHttp } from './distribuicao-dfe.http';

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

const soap = (ret: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult>${ret}</nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;
const zip = (nsu: string, schema: string, xml: string) => `<docZip NSU="${nsu}" schema="${schema}">${gzipSync(Buffer.from(xml)).toString('base64')}</docZip>`;

const consulta: ConsultaDistribuicao = { tipo: 'NFE', ambiente: 'HOMOLOGACAO', documento: '12345678000195', ufAutor: '51', ultNSU: '000000000000000' };

describe('DistribuicaoDfeHttp (servidor de teste com TLS mútuo)', () => {
  const servidor = gerarCert('servidor.teste', '127.0.0.1');
  const cliente = gerarCert('EMPRESA TESTE LTDA:12345678000195');
  const material = { certificadoId: 'k1', documento: '12345678000195', keyPem: cliente.keyPem, certPem: cliente.certPem, cadeiaPem: [] };
  let srv: Server;
  let porta = 0;
  const visto: { cn?: string; envelope?: string; contentType?: string; caminho?: string }[] = [];
  let modo: 'ok' | 'sem-novidade' | 'http500' | 'gzip-ruim' | 'mudo' | 'gotejando' = 'ok';

  beforeAll(async () => {
    srv = createServer({ key: servidor.keyPem, cert: servidor.certPem, requestCert: true, rejectUnauthorized: false }, (req, res) => {
      const partes: Buffer[] = [];
      req.on('data', (p) => partes.push(p));
      req.on('end', () => {
        const par = req.socket as unknown as { getPeerCertificate(): { subject?: { CN?: string } } };
        visto.push({ cn: par.getPeerCertificate()?.subject?.CN, envelope: Buffer.concat(partes).toString('utf8'), contentType: String(req.headers['content-type']), caminho: req.url });
        if (modo === 'mudo') return;
        if (modo === 'gotejando') {
          // manda um byte a cada 50 ms: nunca fica ocioso, então o timeout de inatividade do socket jamais dispara
          res.setHeader('Content-Type', 'application/soap+xml');
          const goteira = setInterval(() => { if (!res.writableEnded) res.write(' '); }, 50);
          res.on('close', () => clearInterval(goteira));
          return;
        }
        if (modo === 'http500') { res.statusCode = 500; res.end('<erro/>'); return; }
        res.setHeader('Content-Type', 'application/soap+xml; charset=utf-8');
        if (modo === 'sem-novidade') {
          res.end(soap('<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo></retDistDFeInt>'));
        } else if (modo === 'gzip-ruim') {
          res.end(soap('<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe"><cStat>138</cStat><xMotivo>ok</xMotivo><ultNSU>000000000000001</ultNSU><maxNSU>000000000000001</maxNSU><loteDistDFeInt><docZip NSU="000000000000001" schema="resNFe_v1.01.xsd">bm8tZ3ppcA==</docZip></loteDistDFeInt></retDistDFeInt>'));
        } else {
          res.end(soap(`<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><cStat>138</cStat><xMotivo>Documento(s) localizado(s)</xMotivo><ultNSU>000000000000002</ultNSU><maxNSU>000000000000009</maxNSU><loteDistDFeInt>${zip('000000000000001', 'resNFe_v1.01.xsd', '<resNFe><chNFe>x</chNFe></resNFe>')}${zip('000000000000002', 'procNFe_v4.00.xsd', '<nfeProc>ação</nfeProc>')}</loteDistDFeInt></retDistDFeInt>`));
        }
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    porta = (srv.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => srv.close(() => r())));

  const novo = (extra: Record<string, unknown> = {}) => {
    const c = new DistribuicaoDfeHttp();
    c.opcoes = {
      ca: servidor.certPem,
      urls: {
        NFE: { HOMOLOGACAO: `https://127.0.0.1:${porta}/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx` },
        CTE: { HOMOLOGACAO: `https://127.0.0.1:${porta}/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx` },
      },
      ...extra,
    };
    return c;
  };

  it('apresenta o certificado do cliente, monta o envelope e decodifica os documentos', async () => {
    modo = 'ok'; visto.length = 0;
    const r = await novo().consultar(consulta, material);
    expect(r).toMatchObject({ cStat: '138', xMotivo: 'Documento(s) localizado(s)', ultNSU: '000000000000002', maxNSU: '000000000000009' });
    expect(r.documentos).toEqual([
      { nsu: '000000000000001', schema: 'resNFe_v1.01.xsd', xml: '<resNFe><chNFe>x</chNFe></resNFe>' },
      { nsu: '000000000000002', schema: 'procNFe_v4.00.xsd', xml: '<nfeProc>ação</nfeProc>' },
    ]);
    expect(visto[0].cn).toBe('EMPRESA TESTE LTDA:12345678000195');
    expect(visto[0].caminho).toBe('/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx');
    expect(visto[0].contentType).toContain('application/soap+xml');
    expect(visto[0].contentType).toContain('action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"');
    expect(visto[0].envelope).toContain('<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">');
    expect(visto[0].envelope).toContain('<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><cUFAutor>51</cUFAutor><CNPJ>12345678000195</CNPJ><distNSU><ultNSU>000000000000000</ultNSU></distNSU></distDFeInt>');
    expect(visto[0].envelope).not.toContain('PRIVATE KEY');
  });

  it('sem documentos (137) mantém o NSU pedido quando a resposta não traz ultNSU', async () => {
    modo = 'sem-novidade';
    const r = await novo().consultar({ ...consulta, ultNSU: '000000000000070' }, material);
    expect(r).toMatchObject({ cStat: '137', ultNSU: '000000000000070', documentos: [] });
  });

  it('CPF usa a tag CPF; produção aponta para o endereço oficial da SEFAZ', () => {
    const c = new DistribuicaoDfeHttp();
    const env = c.montarEnvelope({ ...consulta, documento: '12345678909', ambiente: 'PRODUCAO' }, { urls: { PRODUCAO: '', HOMOLOGACAO: '' }, wsdlNs: 'w', operacao: 'op', dados: 'd', ns: 'n', versao: '1.01', documento: /^\d{11}$/ });
    expect(env).toContain('<tpAmb>1</tpAmb>');
    expect(env).toContain('<CPF>12345678909</CPF>');
  });

  it('CT-e: endereço, namespaces e versão do leiaute próprios, com UF do interessado', async () => {
    modo = 'sem-novidade'; visto.length = 0;
    const r = await novo().consultar({ ...consulta, tipo: 'CTE' }, material);
    expect(r.cStat).toBe('137');
    expect(visto[0].caminho).toBe('/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx');
    expect(visto[0].contentType).toContain('action="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe/cteDistDFeInteresse"');
    expect(visto[0].envelope).toContain('<cteDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe"><cteDadosMsg><distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00"><tpAmb>2</tpAmb><cUFAutor>51</cUFAutor><CNPJ>12345678000195</CNPJ><distNSU><ultNSU>000000000000000</ultNSU></distNSU></distDFeInt></cteDadosMsg></cteDistDFeInteresse>');
  });

  it('CNPJ alfanumérico vale para a NF-e e não para o CT-e', async () => {
    modo = 'sem-novidade';
    const c = novo();
    await expect(c.consultar({ ...consulta, tipo: 'CTE', documento: '12ABC34501DE35' }, material)).rejects.toThrow(/Documento do titular inválido/);
    visto.length = 0;
    await c.consultar({ ...consulta, documento: '12ABC34501DE35' }, material);
    expect(visto[0].envelope).toContain('<CNPJ>12ABC34501DE35</CNPJ>');
  });

  it('erro HTTP sem resposta do serviço, gzip inválido e tempo esgotado viram falha de comunicação', async () => {
    modo = 'http500';
    await expect(novo().consultar(consulta, material)).rejects.toThrow(/HTTP 500/);
    modo = 'gzip-ruim';
    await expect(novo().consultar(consulta, material)).rejects.toThrow(/compactado inválido/);
    modo = 'mudo';
    await expect(novo({ timeoutMs: 300 }).consultar(consulta, material)).rejects.toThrow(/tempo esgotado/);
  });

  it('servidor que goteja bytes sem nunca ficar ocioso também é cortado pelo prazo total da chamada', async () => {
    modo = 'gotejando';
    const t0 = Date.now();
    await expect(novo({ timeoutMs: 400 }).consultar(consulta, material)).rejects.toThrow(/tempo esgotado/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('a verificação do certificado do servidor está sempre ligada', async () => {
    modo = 'ok';
    const semConfianca = new DistribuicaoDfeHttp();
    semConfianca.opcoes = { urls: { NFE: { HOMOLOGACAO: `https://127.0.0.1:${porta}/x` } } };
    await expect(semConfianca.consultar(consulta, material)).rejects.toThrow(ErroDeComunicacao);
  });

  it('recusa dados de consulta fora do padrão e tipos ainda não suportados', async () => {
    const c = novo();
    await expect(c.consultar({ ...consulta, documento: '123<script>' }, material)).rejects.toThrow(/Documento do titular inválido/);
    await expect(c.consultar({ ...consulta, ufAutor: '5' }, material)).rejects.toThrow(/UF do interessado inválida/);
    await expect(c.consultar({ ...consulta, ultNSU: '12' }, material)).rejects.toThrow(/NSU inválido/);
    await expect(c.consultar({ ...consulta, tipo: 'MDFE' }, material)).rejects.toThrow(/ainda não é suportado/);
  });
});
