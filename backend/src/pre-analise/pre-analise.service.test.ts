import { describe, expect, it, vi } from 'vitest';
import { lerRetorno, montarEnvelope, URL_CCC } from './ccc.http';
import { PreAnaliseService } from './pre-analise.service';
import { situacaoGeral } from './processos';
import { BEARER_TRIAL, SerproCertidoes } from './serpro-certidoes';

const RET = (cStat: string, cads = '') => `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4"><retConsCad versao="2.00" xmlns="http://www.portalfiscal.inf.br/nfe"><infCons><verAplic>1</verAplic><cStat>${cStat}</cStat><xMotivo>Consulta cadastro com uma ocorrencia</xMotivo><UF>MT</UF><CNPJ>12345678000195</CNPJ><dhCons>2026-11-12T10:00:00-03:00</dhCons><cUF>51</cUF></infCons>${cads}</retConsCad></nfeResultMsg></soap:Body></soap:Envelope>`;
const CAD = (ie: string, sit: string) => `<infCad><IE>${ie}</IE><CNPJ>12345678000195</CNPJ><UF>MT</UF><cSit>${sit}</cSit><indCredNFe>1</indCredNFe><indCredCTe>4</indCredCTe><xNome>EMPRESA TESTE LTDA</xNome><xRegApur>NORMAL</xRegApur><CNAE>4623108</CNAE><dIniAtiv>2010-03-01</dIniAtiv><dUltSit>2010-03-01</dUltSit><ender><xLgr>RUA A</xLgr><nro>10</nro><xBairro>CENTRO</xBairro><cMun>5103403</cMun><xMun>CUIABA</xMun><CEP>78000000</CEP></ender></infCad>`;

describe('Consulta CCC (web service da SEFAZ)', () => {
  it('monta a ConsCad 2.00 sem cabeçalho e, em MT, com o elemento da operação', () => {
    const sp = montarEnvelope('12345678000195', 'SP');
    expect(sp).toContain('<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4"><ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>SP</UF><CNPJ>12345678000195</CNPJ>');
    expect(sp).not.toContain('Header');
    expect(montarEnvelope('12345678000195', 'MT')).toContain('<consultaCadastro xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4"><nfeDadosMsg');
    expect(() => montarEnvelope('123', 'SP')).toThrow();
    expect(URL_CCC.MA).toBeUndefined();
    expect(URL_CCC.SC).toBe(URL_CCC.RS);
  });
  it('lê inscrições, situação, credenciamento e endereço', () => {
    const r = lerRetorno(RET('112', CAD('131234567', '1') + CAD('139999999', '0')), 'MT');
    expect(r.consultado).toBe(true);
    expect(r.inscricoes).toHaveLength(2);
    expect(r.inscricoes[0]).toMatchObject({ ie: '131234567', habilitada: true, regime: 'NORMAL', credenciamentoNFe: 'credenciado', inicioAtividade: '01/03/2010' });
    expect(r.inscricoes[0].endereco).toContain('CUIABA CEP 78000000');
    expect(r.inscricoes[1].habilitada).toBe(false);
  });
  it('259 = sem inscrição na UF (consultado); 257 explica a exigência de emitente de NF-e', () => {
    const sem = lerRetorno(RET('259'), 'MT');
    expect(sem).toMatchObject({ consultado: true, inscricoes: [] });
    const recusa = lerRetorno(RET('257'), 'MT');
    expect(recusa.consultado).toBe(false);
    expect(recusa.mensagem).toMatch(/emitente de NF-e/);
  });
});

describe('APIs do Serpro (Consulta CND e Dívida Ativa)', () => {
  const resposta = (corpo: unknown, status = 200) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
  const contrato = (chaves: Record<string, unknown> = {}) => ({ chavesDoProduto: async (p: string) => (chaves[p] ?? null) }) as never;

  it('no modo demonstração usa o trial oficial com o documento de teste e marca como demonstração', async () => {
    const s = new SerproCertidoes(contrato());
    const f = vi.fn(async () => resposta({ Status: 1, Mensagem: 'Processamento OK - Certidão Encontrada.', Certidao: { TipoCertidao: 1, CodigoControle: 'ABC', DataEmissao: '2026-05-05T10:56:41', DataValidade: '2026-11-01', DocumentoPdf: 'JVBERi0xLjQK' + 'A'.repeat(60) } }));
    s.fetchImpl = f as never;
    const r = await s.certidaoFederal('12345678000195', 'DEMONSTRACAO');
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://gateway.apiserpro.serpro.gov.br/consulta-cnd-trial/v1/certidao');
    expect(init.headers.Authorization).toBe(`Bearer ${BEARER_TRIAL}`);
    expect(JSON.parse(init.body)).toMatchObject({ ContribuinteConsulta: '00000000000001', CodigoIdentificacao: '9001', GerarCertidaoPdf: true });
    expect(r).toMatchObject({ status: 'CONCLUIDO', demonstracao: true });
    expect(r!.resumo).toMatch(/negativa.*01\/11\/2026/);
    expect(r!.pdf!.subarray(0, 4).toString()).toBe('%PDF');
  });
  it('em produção pede token com as chaves do produto, reenvia com a Chave no status 7 e traduz o status 3', async () => {
    const s = new SerproCertidoes(contrato({ cnd: { key: 'K', secret: 'S' } }));
    s.pausaMs = 0;
    const f = vi.fn()
      .mockResolvedValueOnce(resposta({ access_token: 'T', expires_in: 3295 }))
      .mockResolvedValueOnce(resposta({ Status: 7, Mensagem: 'Em processamento', Chave: 'CH1' }, 201))
      .mockResolvedValueOnce(resposta({ Status: 3, Mensagem: 'Processamento OK - Certidão Não Emitida.' }));
    s.fetchImpl = f as never;
    const r = await s.certidaoFederal('12345678000195', 'PRODUCAO');
    expect(f.mock.calls[0][0]).toBe('https://gateway.apiserpro.serpro.gov.br/token');
    expect((f.mock.calls[0][1] as { headers: Record<string, string> }).headers.Authorization).toBe(`Basic ${Buffer.from('K:S').toString('base64')}`);
    expect(JSON.parse((f.mock.calls[2][1] as { body: string }).body)).toMatchObject({ ContribuinteConsulta: '12345678000195', Chave: 'CH1' });
    expect(r).toMatchObject({ status: 'DEBITOS', demonstracao: false });
  });
  it('sem chaves do produto em produção, ou com o monitoramento desligado, devolve null (fica Aguardando certidão)', async () => {
    const s = new SerproCertidoes(contrato());
    expect(await s.certidaoFederal('12345678000195', 'PRODUCAO')).toBeNull();
    expect(await s.dividaAtiva('12345678000195', 'DESLIGADO')).toBeNull();
  });
  it('dívida ativa: 404 = nenhuma inscrição; inscrição ativa = Débitos com o total; só extintas = Concluído', async () => {
    const s = new SerproCertidoes(contrato({ dividaAtiva: { key: 'K', secret: 'S' } }));
    s.fetchImpl = vi.fn().mockResolvedValueOnce(resposta({ access_token: 'T' })).mockResolvedValueOnce(resposta('Nenhum registro encontrado.', 404)) as never;
    expect(await s.dividaAtiva('12345678000195', 'PRODUCAO')).toMatchObject({ status: 'CONCLUIDO', resumo: 'Nenhuma inscrição em Dívida Ativa da União.' });
    s.fetchImpl = vi.fn().mockResolvedValueOnce(resposta([
      { numeroInscricao: '90 6 16 555964-12', situacaoDescricao: 'ATIVA NAO PRIORIZADA PARA AJUIZAMENTO', valorTotalConsolidadoMoeda: '13.676,34', tipoDevedor: 'PRINCIPAL' },
      { numeroInscricao: '90 6 16 000001-00', situacaoDescricao: 'EXTINTA POR PAGAMENTO', valorTotalConsolidadoMoeda: '' },
    ])) as never;
    const r = await s.dividaAtiva('12345678000195', 'PRODUCAO');
    expect(r!.status).toBe('DEBITOS');
    expect(r!.resumo).toMatch(/1 inscrição\(ões\) ativa\(s\).*13\.676,34/);
    s.fetchImpl = vi.fn().mockResolvedValueOnce(resposta([{ numeroInscricao: 'X', situacaoDescricao: 'EXTINTA POR CANCELAMENTO DEVOLVIDA OU ARQUIVADA', valorTotalConsolidadoMoeda: '' }])) as never;
    expect((await s.dividaAtiva('12345678000195', 'PRODUCAO'))!.status).toBe('CONCLUIDO');
  });
});

describe('pré-análise: as sete consultas', () => {
  function montar(o: { modo?: string; ccc?: unknown; cnd?: unknown; divida?: unknown; certCliente?: boolean; cndt?: unknown; crf?: unknown; sitfis?: unknown } = {}) {
    const registros = new Map<string, Record<string, unknown>>();
    const prisma = {
      empresa: { findFirst: async () => (o.certCliente ? { id: 'E1', razao_social: 'CLIENTE LTDA' } : null) },
      preAnalise: {
        create: async ({ data }: { data: Record<string, unknown> }) => { const r = { id: 'P1', uf: null, concluida_em: null, createdAt: new Date(), updatedAt: new Date(), ...data }; registros.set('P1', r); return r; },
        findUnique: async ({ where }: { where: { id: string } }) => registros.get(where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(registros.get(where.id)!, data),
        findMany: async () => [...registros.values()],
      },
    };
    const guardados: string[] = [];
    const storage = { guardar: async (k: string) => { guardados.push(k); }, getObjectBuffer: async () => Buffer.from('%PDF-'), removeObject: async () => undefined };
    const cnpj = { consultar: async () => ({ razao_social: 'EMPRESA TESTE LTDA', nome_fantasia: '', uf: 'MT', municipio: 'CUIABA', situacao: 'ATIVA', cnpj: '12345678000195', cnae_codigo: '4623108', cnae_descricao: 'Comércio atacadista de grãos', cnaes_secundarios: [], porte: 'DEMAIS', natureza_juridica: 'LTDA', opcao_pelo_simples: false, opcao_pelo_mei: false, data_inicio_atividade: '2010-03-01', capital_social: 100000, matriz_filial: 'MATRIZ', socios: [{ nome: 'FULANO', qualificacao: 'Sócio-Administrador' }] }) };
    const pdf = { gerar: vi.fn(async () => Buffer.from('%PDF-1.4 relatorio')) };
    const contrato = { credenciais: async () => null };
    const monitoramento = { modo: async () => o.modo ?? 'DESLIGADO', leituraSitfis: vi.fn(async () => o.sitfis ?? null), consultar: vi.fn(async () => ({})) };
    const ccc = { consultar: vi.fn(async () => o.ccc) };
    const serpro = { certidaoFederal: async () => o.cnd ?? null, dividaAtiva: async () => o.divida ?? null };
    const certificados = { material: vi.fn(async () => ({ keyPem: 'K', certPem: 'C', cadeiaPem: [] })) };
    const s = new PreAnaliseService(prisma as never, storage as never, cnpj as never, pdf as never, contrato as never, monitoramento as never, ccc as never, serpro as never, certificados as never, { cndt: async () => o.cndt ?? null, crf: async () => o.crf ?? null } as never);
    return { s, registros, guardados, pdf, ccc, certificados, monitoramento };
  }

  it('sem certificado nem APIs: empresa concluída, CCC indisponível, certidões aguardando com o portal oficial', async () => {
    const { s } = montar();
    const p = await s.criar('12.345.678/0001-95', { email: 'qa@fal' }, true);
    const st = Object.fromEntries(p.processos.map((x) => [x.chave, x.status]));
    expect(st).toEqual({ EMPRESA: 'CONCLUIDO', CCC: 'INDISPONIVEL', CERTIFICADO_CCC: 'INDISPONIVEL', PGFN: 'MANUAL', TRABALHISTA: 'MANUAL', FGTS: 'MANUAL', DIVIDA_ATIVA: 'MANUAL' });
    expect(p.processos.find((x) => x.chave === 'TRABALHISTA')!.detalhes[0].valor).toBe('https://cndt-certidao.tst.jus.br/inicio.faces');
    expect(p.razao_social).toBe('EMPRESA TESTE LTDA');
    expect(p.geral.status).toBe('MANUAL');
  });

  it('com o A1 do cliente: CCC consultada, comprovante gerado, CND e dívida ativa pelo Serpro; situação geral aponta os débitos', async () => {
    const ccc = { consultado: true, uf: 'MT', cStat: '111', mensagem: 'ok', dataConsulta: '2026-11-12T10:00:00-03:00', inscricoes: [{ ie: '131234567', uf: 'MT', habilitada: true, nome: 'X', regime: 'NORMAL', cnae: '', inicioAtividade: '', dataSituacao: '', dataBaixa: '', credenciamentoNFe: 'credenciado', endereco: '' }], certificadoDe: 'certificado do cliente' };
    const { s, guardados, certificados } = montar({ certCliente: true, ccc, modo: 'PRODUCAO', cnd: { status: 'CONCLUIDO', resumo: 'Certidão negativa', detalhes: [], demonstracao: false, pdf: Buffer.from('%PDF-') }, divida: { status: 'DEBITOS', resumo: '1 inscrição ativa', detalhes: [], demonstracao: false } });
    const p = await s.criar('12345678000195', { email: 'qa@fal' }, true);
    expect(certificados.material).toHaveBeenCalledWith('E1', 'USO_CONSULTA_CADASTRO', 'qa@fal', expect.any(String));
    const st = Object.fromEntries(p.processos.map((x) => [x.chave, x.status]));
    expect(st).toMatchObject({ CCC: 'CONCLUIDO', CERTIFICADO_CCC: 'CONCLUIDO', PGFN: 'CONCLUIDO', DIVIDA_ATIVA: 'DEBITOS' });
    expect(guardados).toEqual(['pre-analise/P1/certificado-ccc.pdf', 'pre-analise/P1/pgfn.pdf']);
    expect(p.geral).toMatchObject({ status: 'DEBITOS' });
  });

  it('CNDT e CRF pela Infosimples guardam o comprovante; dívida ativa do cliente pela parte da PGFN do relatório de situação fiscal', async () => {
    const cndt = { status: 'CONCLUIDO', situacao: 'Certidão Negativa de Débitos Trabalhistas', resumo: 'Negativa', emissao: '12/11/2026', validade: '11/05/2027', numero: '123', detalhes: [], comprovante: { buffer: Buffer.from('%PDF-'), tipo: 'application/pdf', extensao: 'pdf' } };
    const crf = { status: 'IRREGULAR', situacao: 'IRREGULAR', resumo: 'Situação no FGTS: IRREGULAR.', emissao: null, validade: null, numero: null, detalhes: [], comprovante: { buffer: Buffer.from('<html>'), tipo: 'text/html', extensao: 'html' } };
    const sitfis = { consultado_em: new Date(), simulado: false, leitura: { secoes: [{ titulo: 'Inscrição com exigibilidade não suspensa (PGFN)', orgao: 'PGFN', tipo: 'PENDENCIA', assunto: 'INSCRICAO', linhas: ['cabeçalho', '11.1.11.111111-11 IRPJ ATIVA AJUIZADA'] }, { titulo: 'Débito (RFB)', orgao: 'RFB', tipo: 'PENDENCIA', assunto: 'DEBITO', linhas: ['x', 'y'] }] } };
    const { s, guardados, monitoramento } = montar({ cndt, crf, sitfis, certCliente: true });
    const p = await s.criar('12345678000195', { email: 'qa@fal' }, true);
    const st = Object.fromEntries(p.processos.map((x) => [x.chave, x.status]));
    expect(st).toMatchObject({ TRABALHISTA: 'CONCLUIDO', FGTS: 'IRREGULAR', DIVIDA_ATIVA: 'DEBITOS' });
    expect(guardados).toEqual(['pre-analise/P1/trabalhista.pdf', 'pre-analise/P1/fgts.html']);
    expect(monitoramento.consultar).not.toHaveBeenCalled();
    const da = p.processos.find((x) => x.chave === 'DIVIDA_ATIVA')!;
    expect(da.resumo).toContain('Inscrição com exigibilidade não suspensa (PGFN)');
    expect(da.detalhes.map((d) => d.valor)).toContain('11.1.11.111111-11 IRPJ ATIVA AJUIZADA');
    expect(da.detalhes.some((d) => d.rotulo === 'Débito (RFB)')).toBe(false);
    expect((await s.arquivo('P1', 'FGTS')).tipo).toContain('text/html');
  });

  it('dívida ativa: relatório velho ou ausente pede um novo; sem pendência na PGFN = concluído; prospect fica aguardando', async () => {
    const t = montar({ certCliente: true });
    t.monitoramento.leituraSitfis.mockResolvedValueOnce(null).mockResolvedValueOnce({ consultado_em: new Date(), simulado: false, leitura: { secoes: [] } } as never);
    const p = await t.s.criar('12345678000195', { email: 'qa@fal' }, true);
    expect(t.monitoramento.consultar).toHaveBeenCalledWith({ empresaId: 'E1' }, 'sitfis', {}, { email: 'qa@fal' });
    expect(p.processos.find((x) => x.chave === 'DIVIDA_ATIVA')!.status).toBe('CONCLUIDO');
    const prospect = await montar().s.criar('12345678000195', { email: 'qa@fal' }, true);
    expect(prospect.processos.find((x) => x.chave === 'DIVIDA_ATIVA')!.resumo).toMatch(/Ainda não é cliente/);
  });

  it('a certidão anexada fica de pé ao consultar de novo, e o relatório sai em PDF com cada consulta', async () => {
    const { s, pdf } = montar();
    await s.criar('12345678000195', { email: 'qa@fal' }, true);
    await expect(s.anexarCertidao('P1', 'CCC', Buffer.from('%PDF-'), { email: 'qa@fal' })).rejects.toThrow(/não recebe certidão/);
    await expect(s.anexarCertidao('P1', 'FGTS', Buffer.from('não é pdf'), { email: 'qa@fal' })).rejects.toThrow(/Não consegui ler o PDF/);
    const r = await s.relatorio('P1');
    expect(r.nome).toBe('Pré-análise 12.345.678-0001-95.pdf');
    const doc = pdf.gerar.mock.calls.at(-1)![0] as { secoes: { titulo: string }[] };
    expect(doc.secoes.map((x) => x.titulo)).toEqual(['Resumo', 'Consulta Empresa: Concluído', 'Consulta CCC: Indisponível', 'Certificado CCC: Indisponível', 'PGFN: Aguardando certidão', 'Trabalhista: Aguardando certidão', 'FGTS: Aguardando certidão', 'Dívida Ativa: Aguardando certidão']);
  });

  it('recusa CNPJ incompleto e só administrador exclui', async () => {
    const { s } = montar();
    await expect(s.criar('123', { email: 'qa@fal' })).rejects.toThrow(/14 dígitos/);
    await s.criar('12345678000195', { email: 'qa@fal' }, true);
    await expect(s.excluir('P1', { role: 'user' })).rejects.toThrow(/administradores/);
  });

  it('situação geral: processando, débitos, pendências e tudo concluído', () => {
    const p = (status: string) => ({ chave: 'EMPRESA', status, resumo: '', detalhes: [], fonte: '', consultado_em: null }) as never;
    expect(situacaoGeral([p('PROCESSANDO'), p('CONCLUIDO')]).status).toBe('PROCESSANDO');
    expect(situacaoGeral([p('DEBITOS'), p('MANUAL')]).texto).toMatch(/1 ponto\(s\) de atenção e 1 consulta/);
    expect(situacaoGeral([p('CONCLUIDO'), p('MANUAL')]).status).toBe('MANUAL');
    expect(situacaoGeral([p('CONCLUIDO')]).status).toBe('CONCLUIDO');
  });
});
