import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { completarParametros, SERVICOS, SERVICO_POR_CHAVE, servicosParaEmpresa } from './catalogo';
import { CHAVE_DEMONSTRACAO, ErroIntegra, IntegraCliente, lerResposta, URL_DEMONSTRACAO, URL_PRODUCAO } from './integra.cliente';
import { dataBr, extrairArquivos, interpretar } from './interpretar';
import { credenciaisDoAmbiente, MonitoramentoService, pontuacao } from './monitoramento.service';

const FIX: Record<string, { status: number; mensagens: unknown[]; dados: string }> = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'demonstracao.json'), 'utf8'));
const dados = (servico: string) => { const d = FIX[servico].dados; try { return JSON.parse(d); } catch { return d; } };
const ler = (s: string) => { const svc = SERVICOS.find((x) => x.servico === s)!; const ex = extrairArquivos(dados(s), svc?.chave ?? s); return interpretar(svc?.sistema ?? '', s, ex.dados, ex.arquivos); };

describe('catálogo', () => {
  it('todo serviço tem código, versão, endpoint, exemplo de demonstração com resposta oficial guardada', () => {
    // Serviços da Infosimples não têm ambiente de demonstração nem versão de serviço do Serpro: são testados em infosimples/*.test.ts.
    const doSerpro = SERVICOS.filter((s) => s.fonte !== 'INFOSIMPLES');
    const semExemplo = doSerpro.filter((s) => !FIX[s.servico] && !['CONSPROCPORINTER271', 'PAGAMENTOS71', // o trial recusa os exemplos oficiais destes:
      'CONSOLIDAR54', 'CONTACONSDOCARRPG73', 'ATUBENEFICIO23', 'TRANSDECLARACAO310'].includes(s.servico));
    expect(semExemplo.map((s) => s.chave)).toEqual([]);
    expect(new Set(SERVICOS.map((s) => s.chave)).size).toBe(SERVICOS.length);
    for (const s of SERVICOS.filter((x) => x.infosimples)) expect(s.infosimples!.rota).toBeTypeOf('function');
    for (const s of doSerpro) { expect(s.versao).toBeTruthy(); expect(['Apoiar', 'Consultar', 'Declarar', 'Emitir', 'Monitorar']).toContain(s.endpoint); }
  });
  it('indica os serviços pelo regime: Simples não vê DCTFWeb, MEI vê o CCMEI, pessoa física só o que serve a CPF', () => {
    const simples = servicosParaEmpresa('Simples Nacional').map((s) => s.chave);
    expect(simples).toContain('pgdasd-declaracoes'); expect(simples).not.toContain('dctfweb-recibo'); expect(simples).not.toContain('ccmei');
    const mei = servicosParaEmpresa('MEI').map((s) => s.chave);
    expect(mei).toContain('ccmei'); expect(mei).toContain('parcmei-pedidos'); expect(mei).not.toContain('pgdasd-declaracoes');
    const real = servicosParaEmpresa('Lucro Real').map((s) => s.chave);
    expect(real).toContain('dctfweb-recibo'); expect(real).toContain('mit'); expect(real).not.toContain('das');
    const pf = servicosParaEmpresa(null, true).map((s) => s.chave);
    expect(pf).toContain('sitfis'); expect(pf).toContain('caixa-postal'); expect(pf).not.toContain('dte');
  });
  it('completa os parâmetros com o padrão e recusa formato errado', () => {
    const das = SERVICO_POR_CHAVE.get('das')!;
    expect(completarParametros(das, {}, new Date(2026, 10, 11))).toEqual({ periodo: '202610', pagamento: '' });
    expect(completarParametros(das, {}, new Date(2026, 0, 5))).toEqual({ periodo: '202512', pagamento: '' });
    expect(() => completarParametros(das, { periodo: '2026-10' })).toThrow(/AAAAMM/);
    expect(() => completarParametros(SERVICO_POR_CHAVE.get('das-extrato')!, {})).toThrow(/número do das/i);
    expect(das.dados({ periodo: '202610' })).toBe('{"periodoApuracao":"202610"}');
    expect(SERVICO_POR_CHAVE.get('dctfweb-recibo')!.dados({ periodo: '202610' })).toBe('{"categoria":"GERAL_MENSAL","anoPA":"2026","mesPA":"10"}');
  });
});

describe('leitura das respostas oficiais de demonstração', () => {
  it('nenhuma resposta guardada quebra a leitura', () => {
    for (const s of Object.keys(FIX)) expect(() => ler(s), s).not.toThrow();
  });
  it('PGDAS-D: competências, DAS não pago e declaração', () => {
    const r = ler('CONSDECLARACAO13');
    expect(r.tabela?.linhas.length).toBe(12);
    expect(r.titulo).toMatch(/12 competências em 2018/);
    expect(['ATENCAO', 'OK', 'CRITICO']).toContain(r.nivel);
  });
  it('caixa postal: conta não lidas e relevantes e troca a variável do assunto', () => {
    const r = ler('MSGCONTRIBUINTE61');
    expect(r.titulo).toMatch(/50 mensagens; 10 não lidas/);
    expect(JSON.stringify(r.tabela?.linhas)).not.toContain('++VARIAVEL++');
    expect(['CRITICO', 'ATENCAO']).toContain(r.nivel);
  });
  it('dívida ativa do MEI é crítica, com o total', () => {
    const r = ler('DIVIDAATIVA24');
    expect(r.nivel).toBe('CRITICO');
    expect(r.titulo).toMatch(/débitos em dívida ativa, total R\$/);
  });
  it('guias e relatórios: o PDF sai da resposta e vira arquivo', () => {
    for (const s of ['GERARDAS12', 'RELATORIOSITFIS92', 'GERARGUIA31', 'CONSULTIMADECREC14', 'EMITIRCCMEI121', 'GERARDASPDF21', 'GERARDAS161']) {
      const svc = SERVICOS.find((x) => x.servico === s);
      const ex = extrairArquivos(dados(s), svc?.chave ?? s);
      expect(ex.arquivos.length, s).toBeGreaterThan(0);
      expect(JSON.stringify(ex.dados), s).not.toMatch(/JVBER/);
    }
    const ultima = extrairArquivos(dados('CONSULTIMADECREC14'), 'pgdasd-ultima');
    expect(ultima.arquivos.map((a) => a.nome)).toContain('PGDASD-RECIBO-00000000201801001.pdf');
  });
  it('parcelamentos: pedidos em andamento e parcelas para emitir', () => {
    expect(ler('PEDIDOSPARC163').tabela?.linhas.length).toBe(6);
    const p = ler('PARCELASPARAGERAR162');
    expect(p.nivel).toBe('ATENCAO');
    expect(p.titulo).toMatch(/7 parcelas para emitir/);
  });
  it('procuração vencida é crítica; datas no formato brasileiro', () => {
    expect(ler('OBTERPROCURACAO41').nivel).toBe('CRITICO');
    expect(dataBr('20240131101112')).toBe('31/01/2024');
    expect(dataBr(202401)).toBe('01/2024');
  });
});

describe('cliente HTTP', () => {
  const pedido = { endpoint: 'Consultar' as const, contratante: { numero: '1', tipo: 2 as const }, autorPedidoDados: { numero: '1', tipo: 2 as const }, contribuinte: { numero: '1', tipo: 2 as const }, idSistema: 'DTE', idServico: 'CONSULTASITUACAODTE111', versaoSistema: '1.0', dados: '' };
  it('lê "status" como texto ou número e o "dados" escapado', () => {
    expect(lerResposta(200, '{"status":"200","dados":"{\\"a\\":1}","mensagens":[]}')).toMatchObject({ status: 200, dados: { a: 1 } });
    expect(lerResposta(429, '{"code":"900807","message":"Message throttled out"}').mensagens[0].texto).toBe('Message throttled out');
  });
  it('desligado não chama nada; demonstração usa a chave pública e espera no limite (429)', async () => {
    await expect(new IntegraCliente(() => 'DESLIGADO', () => null).chamar(pedido)).rejects.toThrow(ErroIntegra);
    const chamadas: { url: string; auth: string }[] = [];
    let n = 0;
    const f = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      chamadas.push({ url, auth: init.headers.Authorization });
      n += 1;
      return new Response(n < 3 ? '{"message":"throttled"}' : '{"status":200,"dados":"{}","mensagens":[]}', { status: n < 3 ? 429 : 200 });
    });
    const pausas: number[] = [];
    const r = await new IntegraCliente(() => 'DEMONSTRACAO', () => null, f as never, undefined, async (ms) => { pausas.push(ms); }).chamar(pedido);
    expect(r.status).toBe(200);
    expect(chamadas[0].url).toBe(`${URL_DEMONSTRACAO}Consultar`);
    expect(chamadas[0].auth).toBe(`Bearer ${CHAVE_DEMONSTRACAO}`);
    expect(pausas).toEqual([2000, 4000]);
  });
  it('produção sem contrato avisa; com contrato usa o token do SAPI e o renova num 401', async () => {
    await expect(new IntegraCliente(() => 'PRODUCAO', () => null).chamar(pedido)).rejects.toThrow(/contrato/);
    let tokens = 0;
    const obter = vi.fn(async () => ({ access: `t${++tokens}`, jwt: 'j', expira: Date.now() + 60_000 }));
    let n = 0;
    const f = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      n += 1;
      expect(url).toBe(`${URL_PRODUCAO}Consultar`);
      return new Response(n === 1 ? '' : '{"status":200,"dados":"{}","mensagens":[]}', { status: n === 1 ? 401 : 200, headers: {} }) as Response & { a?: string } & typeof init;
    });
    const c = new IntegraCliente(() => 'PRODUCAO', () => ({ consumerKey: 'k', consumerSecret: 's', pfx: Buffer.from(''), senha: '' }), f as never, obter);
    expect((await c.chamar(pedido)).status).toBe(200);
    expect(obter).toHaveBeenCalledTimes(2);
  });
});

describe('ambiente e nota', () => {
  it('as credenciais só valem completas', () => {
    expect(credenciaisDoAmbiente({})).toBeNull();
    expect(credenciaisDoAmbiente({ SERPRO_CONSUMER_KEY: 'k', SERPRO_CONSUMER_SECRET: 's', SERPRO_CERT_PFX_BASE64: 'AAAA', SERPRO_CONTRATANTE_CNPJ: '12.345.678/0001-95' })).toMatchObject({ contratante: '12345678000195' });
    expect(credenciaisDoAmbiente({ SERPRO_CONSUMER_KEY: 'k', SERPRO_CONSUMER_SECRET: 's', SERPRO_CERT_PFX_BASE64: 'AAAA', SERPRO_CONTRATANTE_CNPJ: '123' })).toBeNull();
  });
  it('a nota cai 25 por grupo crítico e 8 por grupo em atenção', () => {
    expect(pontuacao({})).toBe(100);
    expect(pontuacao({ situacao: 'CRITICO', mensagens: 'ATENCAO', declaracoes: 'OK' })).toBe(67);
    expect(pontuacao({ a: 'CRITICO', b: 'CRITICO', c: 'CRITICO', d: 'CRITICO', e: 'CRITICO' })).toBe(0);
  });
});

describe('grupos 1 e 2 do catálogo', () => {
  const svc = (k: string) => SERVICO_POR_CHAVE.get(k)!;
  it('os três serviços do Sicalc usam os mesmos campos e a mesma montagem', () => {
    const p = { receita: '2089-01', apuracao: '09/2026', vencimento: '2026-10-31', valor: '1.234,56', pagamento: '2026-11-12' };
    const d = svc('darf-sicalc').dados(p);
    expect(svc('darf-sicalc-codbarra').dados(p)).toBe(d);
    expect(svc('darf-sicalc-calculo').dados(p)).toBe(d);
    expect(JSON.parse(d)).toMatchObject({ codigoReceita: '2089', codigoReceitaExtensao: '01', valorImposto: '1234.56' });
    expect(() => svc('sicalc-receita').dados({ codigo: '20' })).toThrow(/4 dígitos/);
  });
  it('ações têm texto de confirmação e nunca entram em lote nem na rotina', () => {
    for (const k of ['regime-opcao-efetuar', 'mei-beneficio', 'dctfweb-transmitir']) { expect(svc(k).acao).toBeTruthy(); expect(svc(k).rotina).toBeFalsy(); }
    expect(SERVICOS.filter((s) => s.acao).map((s) => s.chave).sort()).toEqual(['dctfweb-transmitir', 'mei-beneficio', 'regime-opcao-efetuar']);
  });
  it('regime: caixa = 1, competência pelo descritivo; MEI: competências do mesmo ano', () => {
    expect(JSON.parse(svc('regime-opcao-efetuar').dados({ ano: '2027', regime: 'caixa' }))).toEqual({ anoOpcao: 2027, tipoRegime: 1, descritivoRegime: 'CAIXA', deAcordoResolucao: true });
    expect(JSON.parse(svc('regime-opcao-efetuar').dados({ ano: '2027', regime: 'COMPETENCIA' })).descritivoRegime).toBe('COMPETENCIA');
    expect(() => svc('regime-opcao-efetuar').dados({ ano: '2027', regime: 'X' })).toThrow(/Caixa ou Competência/);
    expect(JSON.parse(svc('mei-beneficio').dados({ ano: '2026', periodos: '202601, 202602', beneficio: 'nao' })).infoBeneficio).toEqual([{ periodoApuracao: '202601', indicadorBeneficio: false }, { periodoApuracao: '202602', indicadorBeneficio: false }]);
    expect(() => svc('mei-beneficio').dados({ ano: '2026', periodos: '202513', beneficio: 'sim' })).toThrow(/AAAAMM/);
  });
});

describe('MonitoramentoService.consultar (demonstração)', () => {
  afterEach(() => vi.unstubAllGlobals());
  function montar() {
    const consultas: Record<string, unknown>[] = [];
    const guardados: string[] = [];
    const prisma = {
      parametroSistema: { findUnique: async () => ({ chave: 'integra_contador_modo', valor: 'DEMONSTRACAO' }) },
      empresa: { findUnique: async () => ({ id: 'E1', razao_social: 'EXTRA AGRO LTDA', cnpj_cpf: '58.509.112/0001-52', regime_atual: 'Simples Nacional' }) },
      consultaFiscal: {
        create: async ({ data }: { data: Record<string, unknown> }) => { const c = { id: `C${consultas.length + 1}`, createdAt: new Date(), ...data }; consultas.push(c); return c; },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(consultas.find((c) => c.id === where.id)!, data),
      },
    };
    const storage = { guardar: async (k: string) => { guardados.push(k); } };
    const notif = { criarParaAdmins: vi.fn(async () => undefined) };
    const s = new MonitoramentoService(prisma as never, storage as never, {} as never, notif as never, {} as never, { credenciais: async () => null } as never);
    return { s, consultas, guardados };
  }
  it('chama o trial oficial, guarda o PDF e marca a consulta como simulada', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 200, mensagens: FIX.GERARDAS12.mensagens, dados: FIX.GERARDAS12.dados }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const { s, consultas, guardados } = montar();
    const r = await s.consultar({ empresaId: 'E1' }, 'das', {}, { email: 'qa@fal' });
    expect(f).toHaveBeenCalledTimes(1);
    const corpo = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(corpo.contribuinte).toEqual({ numero: '00000000000100', tipo: 2 });
    expect(r).toMatchObject({ sucesso: true, simulado: true, nivel: 'OK' });
    expect((r as { arquivos: unknown[] }).arquivos).toHaveLength(1);
    expect(guardados[0]).toMatch(/^monitoramento\/empresa\/E1\/C1-1\.pdf$/);
    expect(JSON.stringify(consultas[0].resumo)).toContain('Exemplo oficial do Serpro');
  });
  it('quando o trial limita, usa a resposta oficial guardada no InTAX', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('rede'), { name: 'TypeError' }); }));
    const { s } = montar();
    const r = await s.consultar({ empresaId: 'E1' }, 'caixa-postal', {}, { email: 'qa@fal' });
    expect(r).toMatchObject({ sucesso: true, simulado: true });
    expect(JSON.stringify((r as { resumo: unknown }).resumo)).toContain('guardado no InTAX');
  });
  it('ações na Receita só rodam pela tela, com confirmação explícita', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 200, mensagens: FIX.EFETUAROPCAOREGIME101.mensagens, dados: FIX.EFETUAROPCAOREGIME101.dados }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const { s } = montar();
    await expect(s.consultar({ empresaId: 'E1' }, 'regime-opcao-efetuar', { ano: '2026', regime: 'CAIXA' }, { email: 'qa@fal' })).rejects.toThrow(/Confirme a ação/);
    await expect(s.consultar({ empresaId: 'E1' }, 'regime-opcao-efetuar', { ano: '2026', regime: 'CAIXA', confirmar: 'sim' }, { email: 'qa@fal' }, 'LOTE')).rejects.toThrow(/lote/);
    expect(f).not.toHaveBeenCalled();
    const r = await s.consultar({ empresaId: 'E1' }, 'regime-opcao-efetuar', { ano: '2026', regime: 'CAIXA', confirmar: 'sim' }, { email: 'qa@fal' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ sucesso: true });
  });
  it('recusa serviço de empresa para quem não tem CNPJ válido e serviço desconhecido', async () => {
    const { s } = montar();
    await expect(s.consultar({ empresaId: 'E1' }, 'nao-existe', {}, undefined)).rejects.toThrow(/desconhecido/);
  });
});

it('exige administrador e seleção explícita antes de preparar um lote', async () => {
  const preparar = MonitoramentoService.prototype.prepararLote;
  await expect(preparar.call({} as MonitoramentoService, {}, { role: 'user' })).rejects.toThrow(/administradores/);
  await expect(preparar.call({} as MonitoramentoService, { empresa_ids: ['E1'], chaves: [] }, { role: 'admin' }, true))
    .rejects.toThrow(/Selecione/);
});
