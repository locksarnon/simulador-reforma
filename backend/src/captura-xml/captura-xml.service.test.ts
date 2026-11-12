import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESPERA_SEFAZ, HORA, decidirPasso, liberadoEm, normalizarNsu, nsuMaior, nsuValido } from './captura-regras';
import { CapturaXmlService } from './captura-xml.service';
import { DistribuicaoDfeCliente, ErroDeComunicacao, RespostaDistribuicao } from './distribuicao-dfe.cliente';
import { ErroCienciaParcial, ManifestacaoCliente, PedidoCiencia, ResultadoCiencia } from './manifestacao.cliente';

const ZEROS = '000000000000000';
const nsu = (n: number) => String(n).padStart(15, '0');
const resp = (cStat: string, ult: number, max: number, docs = 0): RespostaDistribuicao => ({
  cStat, xMotivo: `motivo ${cStat}`, ultNSU: nsu(ult), maxNSU: nsu(max),
  documentos: Array.from({ length: docs }, (_, i) => ({ nsu: nsu(ult - docs + 1 + i), schema: 'resNFe_v1.01.xsd', xml: `<resNFe>${ult - docs + 1 + i}</resNFe>` })),
});

type Linha = Record<string, any>;
function casa(row: Linha, where: Linha): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Linha[]).some((w) => casa(row, w));
    if (k === 'AND') return (v as Linha[]).every((w) => casa(row, w));
    const val = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      let reconhecido = false;
      let ok = true;
      if ('lt' in v) { reconhecido = true; ok = ok && val != null && val < v.lt; }
      if ('lte' in v) { reconhecido = true; ok = ok && val != null && val <= v.lte; }
      if ('gte' in v) { reconhecido = true; ok = ok && val != null && val >= v.gte; }
      if ('in' in v) { reconhecido = true; ok = ok && v.in.includes(val); }
      if (reconhecido) return ok;
      if ('empresa_id' in v) return casa(row, v); // chave composta empresa_id_tipo
      return false;
    }
    return val === v;
  });
}

function montar(opts: { cfg?: Linha; certificadoAtivo?: boolean; documentoCert?: string; ciencia?: boolean; docs?: Linha[]; cnpjEmpresa?: string; semUf?: boolean; cfgsEmpresa?: Linha[]; periodo?: string } = {}) {
  const configs: Linha[] = [];
  const execucoes: Linha[] = [];
  const auditoria: Linha[] = [];
  const docs: Linha[] = (opts.docs ?? []).map((d, i) => ({ id: `d${i + 1}`, empresa_id: 'E1', tipo: 'NFE', conteudo: 'RESUMO', situacao: 'AUTORIZADA', origem: 'CAPTURA', ciencia_status: null, ciencia_em: null, ...d }));
  let cfgEmpresa: Linha | null = {
    empresa_id: 'E1', ambiente: 'PRODUCAO', uf_autor: opts.semUf ? null : '51', ...(opts.periodo ? { periodo_busca: opts.periodo } : {}),
    manifestar_ciencia: !!opts.ciencia, manifestacao_consentida_em: opts.ciencia ? new Date() : null, manifestacao_consentida_por: opts.ciencia ? 'adm' : null,
  };
  if (opts.cfg !== undefined) configs.push({ id: 'c1', empresa_id: 'E1', tipo: 'NFE', ativo: true, ultimo_nsu: ZEROS, max_nsu: null, proxima_consulta_em: null, bloqueado_ate: null, ultima_consulta_em: null, ultimo_cstat: null, ultimo_motivo: null, em_execucao_ate: null, ...opts.cfg });
  const prisma = {
    empresa: { findUnique: async ({ where }: Linha) => ({ id: where.id, uf: opts.semUf ? null : 'MT', cnpj_cpf: opts.cnpjEmpresa ?? '12.345.678/0001-95' }) },
    documentoXml: {
      count: async ({ where }: Linha) => docs.filter((d) => casa(d, where)).length,
      findMany: async ({ where, take }: Linha) => docs.filter((d) => casa(d, where)).slice(0, take ?? 999),
      update: async ({ where, data }: Linha) => Object.assign(docs.find((d) => d.id === where.id)!, data),
    },
    certificadoDigital: { findFirst: async () => (opts.certificadoAtivo === false ? null : { valido_ate: new Date(Date.now() + 86_400_000 * 100), documento: opts.documentoCert ?? '12345678000195' }) },
    xmlEmpresaConfig: {
      findUnique: async () => cfgEmpresa,
      findMany: async ({ where }: Linha) => [...(cfgEmpresa ? [cfgEmpresa] : []), ...(opts.cfgsEmpresa ?? [])].filter((c) => !where?.empresa_id?.in || where.empresa_id.in.includes(c.empresa_id)),
      upsert: async ({ create, update }: Linha) => { cfgEmpresa = cfgEmpresa ? Object.assign(cfgEmpresa, update) : { ...create }; return cfgEmpresa; },
    },
    capturaXmlConfig: {
      findUnique: async ({ where }: Linha) => configs.find((c) => casa(c, where.empresa_id_tipo ?? where)) ?? null,
      findMany: async ({ where, take }: Linha) => configs.filter((c) => casa(c, where ?? {})).slice(0, take ?? 999),
      updateMany: async ({ where, data }: Linha) => { const a = configs.filter((c) => casa(c, where)); a.forEach((c) => Object.assign(c, data)); return { count: a.length }; },
      update: async ({ where, data }: Linha) => Object.assign(configs.find((c) => c.id === where.id)!, data),
      upsert: async ({ where, create, update }: Linha) => {
        const e = configs.find((c) => casa(c, where.empresa_id_tipo));
        if (e) return Object.assign(e, update);
        const n = { id: `c${configs.length + 1}`, ativo: false, ultimo_nsu: ZEROS, max_nsu: null, proxima_consulta_em: null, bloqueado_ate: null, ultima_consulta_em: null, ultimo_cstat: null, ultimo_motivo: null, em_execucao_ate: null, ...create };
        configs.push(n); return n;
      },
    },
    capturaXmlExecucao: {
      create: async ({ data }: Linha) => { const r = { id: `x${execucoes.length + 1}`, iniciado_em: new Date(), ...data }; execucoes.push(r); return r; },
      update: async ({ where, data }: Linha) => Object.assign(execucoes.find((x) => x.id === where.id)!, data),
      findMany: async () => [...execucoes].reverse(),
    },
    auditoriaCertificado: { create: async ({ data }: Linha) => { auditoria.push(data); return data; } },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const certificados = { material: vi.fn(async () => ({ certificadoId: 'k1', documento: '12345678000195', keyPem: 'k', certPem: 'c', cadeiaPem: [] })) };
  const registrados: Linha[] = [];
  const repositorio = { registrar: vi.fn(async (_e: string, b: Buffer, ctx: Linha) => { registrados.push({ xml: b.toString(), ...ctx }); return { resultado: 'NOVO' as const }; }) };
  const respostas: (RespostaDistribuicao | Error)[] = [];
  const cliente: DistribuicaoDfeCliente = { consultar: vi.fn(async () => { const r = respostas.shift(); if (!r) throw new Error('sem resposta programada'); if (r instanceof Error) throw r; return r; }) };
  const pedidos: PedidoCiencia[] = [];
  const respostasCiencia: ((p: PedidoCiencia) => ResultadoCiencia[] | Error)[] = [];
  const manifestacao: ManifestacaoCliente = {
    registrarCiencia: vi.fn(async (p: PedidoCiencia) => {
      pedidos.push(p);
      const r = respostasCiencia.shift()?.(p) ?? p.chaves.map((chave) => ({ chave, status: 'REGISTRADA' as const, cStat: '135', xMotivo: 'ok', protocolo: '351260000000001' }));
      if (r instanceof Error) throw r;
      return r;
    }),
  };
  const service = new CapturaXmlService(prisma as never, certificados as never, repositorio as never, cliente, manifestacao);
  service.pausaEntreConsultasMs = 0;
  return { service, configs, execucoes, auditoria, certificados, repositorio, registrados, respostas, cliente, manifestacao, pedidos, respostasCiencia, docs };
}

describe('regras da Distribuição de DF-e', () => {
  const agora = new Date('2026-11-10T12:00:00Z');
  it('138 com mais documentos continua; no fim espera 1 hora e 1 minuto de folga', () => {
    expect(decidirPasso('NFE', resp('138', 50, 120, 50), agora)).toMatchObject({ continuarAgora: true, proximaConsultaEm: null });
    const fim = decidirPasso('NFE', resp('138', 120, 120, 20), agora);
    expect(fim.continuarAgora).toBe(false);
    expect(fim.proximaConsultaEm?.getTime()).toBe(agora.getTime() + ESPERA_SEFAZ);
    expect(ESPERA_SEFAZ).toBe(HORA + 60_000);
  });
  it('137 espera e 656 bloqueia pelo mesmo prazo (678 no MDF-e)', () => {
    expect(decidirPasso('NFE', resp('137', 0, 0), agora).proximaConsultaEm?.getTime()).toBe(agora.getTime() + ESPERA_SEFAZ);
    const bloq = decidirPasso('CTE', resp('656', 0, 0), agora);
    expect(bloq).toMatchObject({ situacao: 'CONSUMO_INDEVIDO' });
    expect(bloq.bloqueadoAte?.getTime()).toBe(agora.getTime() + ESPERA_SEFAZ);
    expect(decidirPasso('MDFE', resp('678', 0, 0), agora).situacao).toBe('CONSUMO_INDEVIDO');
    expect(decidirPasso('MDFE', resp('656', 0, 0), agora).situacao).toBe('REJEITADA');
  });
  it('problema do certificado ou do CNPJ desativa a captura até alguém corrigir', () => {
    for (const cStat of ['280', '281', '283', '284', '285', '472', '473', '593']) {
      const r = decidirPasso('NFE', resp(cStat, 0, 0), agora);
      expect(r, cStat).toMatchObject({ situacao: 'CONFIGURACAO_INVALIDA', desativar: true, proximaConsultaEm: null });
    }
  });
  it('NSU à frente do Ambiente Nacional (589) recomeça do zero depois da espera', () => {
    expect(decidirPasso('NFE', resp('589', 0, 0), agora)).toMatchObject({ situacao: 'NSU_A_FRENTE', reiniciarNsu: true });
    expect(decidirPasso('MDFE', resp('493', 0, 0), agora).reiniciarNsu).toBe(true);
  });
  it('serviço indisponível volta logo (108) ou daqui a mais de 1 hora (109, 999, 286); outras rejeições, em 6 horas', () => {
    expect(decidirPasso('NFE', resp('108', 0, 0), agora).proximaConsultaEm?.getTime()).toBe(agora.getTime() + 15 * 60_000);
    for (const cStat of ['109', '999', '286']) expect(decidirPasso('NFE', resp(cStat, 0, 0), agora).proximaConsultaEm?.getTime()).toBe(agora.getTime() + ESPERA_SEFAZ);
    const r = decidirPasso('NFE', resp('215', 0, 0), agora);
    expect(r.situacao).toBe('REJEITADA');
    expect(r.proximaConsultaEm?.getTime()).toBe(agora.getTime() + 6 * HORA);
  });
  it('liberadoEm devolve a maior janela ainda aberta', () => {
    const a = new Date(agora.getTime() + 1000), b = new Date(agora.getTime() + 5000);
    expect(liberadoEm({ proxima_consulta_em: a, bloqueado_ate: b }, agora)).toEqual(b);
    expect(liberadoEm({ proxima_consulta_em: null, bloqueado_ate: new Date(agora.getTime() - 1) }, agora)).toBeNull();
  });
  it('maisDocumentos (lote cheio do ADN) decide se continua já ou espera 1 hora e 1 minuto; sem o campo, vale a comparação dos NSU', () => {
    expect(decidirPasso('NFSE', { ...resp('138', 50, 50, 50), maisDocumentos: true }, agora)).toMatchObject({ continuarAgora: true, proximaConsultaEm: null, situacao: 'COM_DOCUMENTOS' });
    const parcial = decidirPasso('NFSE', { ...resp('138', 70, 70, 20), maisDocumentos: false }, agora);
    expect(parcial.continuarAgora).toBe(false);
    expect(parcial.proximaConsultaEm?.getTime()).toBe(agora.getTime() + ESPERA_SEFAZ);
    // o campo manda, mesmo com o NSU máximo à frente
    expect(decidirPasso('NFSE', { ...resp('138', 50, 120, 50), maisDocumentos: false }, agora).continuarAgora).toBe(false);
    // NF-e e CT-e não trazem o campo: continua a comparação de ultNSU com maxNSU
    expect(decidirPasso('NFE', resp('138', 50, 120, 50), agora).continuarAgora).toBe(true);
    expect(decidirPasso('CTE', resp('138', 120, 120, 20), agora).continuarAgora).toBe(false);
  });
  it('NFS-e: os códigos que o cliente do ADN traduz seguem as regras do motor, e não existe consumo indevido', () => {
    for (const cStat of ['280', '281', '283', '284', '593']) {
      expect(decidirPasso('NFSE', resp(cStat, 0, 0), agora), cStat).toMatchObject({ situacao: 'CONFIGURACAO_INVALIDA', desativar: true, proximaConsultaEm: null });
    }
    for (const cStat of ['286', '999']) {
      const p = decidirPasso('NFSE', resp(cStat, 0, 0), agora);
      expect(p, cStat).toMatchObject({ situacao: 'INDISPONIVEL', desativar: false });
      expect(p.proximaConsultaEm?.getTime()).toBe(agora.getTime() + ESPERA_SEFAZ);
    }
    for (const cStat of ['489', '215', '656']) {
      const p = decidirPasso('NFSE', resp(cStat, 0, 0), agora);
      expect(p, cStat).toMatchObject({ situacao: 'REJEITADA', desativar: false });
      expect(p.proximaConsultaEm?.getTime()).toBe(agora.getTime() + 6 * HORA);
    }
    const fim = decidirPasso('NFSE', resp('137', 0, 0), agora);
    expect(fim).toMatchObject({ situacao: 'SEM_NOVIDADE', continuarAgora: false });
    expect(fim.proximaConsultaEm?.getTime()).toBe(agora.getTime() + ESPERA_SEFAZ);
  });
  it('o NSU do ADN pode ter até 20 dígitos; o da SEFAZ continua com zeros à esquerda até 15', () => {
    expect(nsuValido('000000000000070')).toBe(true);
    expect(nsuValido('1'.repeat(20))).toBe(true);
    for (const invalido of ['', '1'.repeat(21), '12a', ' 12', 12, null, undefined]) expect(nsuValido(invalido), String(invalido)).toBe(false);
    expect(normalizarNsu('70')).toBe('000000000000070');
    expect(normalizarNsu('12345678901234567890')).toBe('12345678901234567890');
    expect(nsuMaior('12345678901234567891', '12345678901234567890')).toBe(true);
    expect(nsuMaior('000000000000070', '12345678901234567890')).toBe(false);
  });
});

describe('CapturaXmlService.executar', () => {
  it('busca em lotes, guarda os documentos, avança o NSU e espera 1 hora no fim', async () => {
    const t = montar({ cfg: {} });
    t.respostas.push(resp('138', 50, 70, 50), resp('138', 70, 70, 20));
    const r = await t.service.executar('E1', 'NFE', 'MANUAL', 'admin@fal');
    expect(r).toMatchObject({ consultas: 2, docs_recebidos: 70, docs_novos: 70, ultimo_cstat: '138' });
    expect(t.cliente.consultar).toHaveBeenNthCalledWith(1, expect.objectContaining({ tipo: 'NFE', ambiente: 'PRODUCAO', documento: '12345678000195', ufAutor: '51', ultNSU: ZEROS }), expect.anything());
    expect(t.cliente.consultar).toHaveBeenNthCalledWith(2, expect.objectContaining({ ultNSU: nsu(50) }), expect.anything());
    expect(t.registrados).toHaveLength(70);
    expect(t.registrados[0]).toMatchObject({ origem: 'CAPTURA', nsu: nsu(1), nomeOriginal: 'resNFe_v1.01.xsd' });
    expect(t.configs[0]).toMatchObject({ ultimo_nsu: nsu(70), max_nsu: nsu(70), ultimo_cstat: '138', em_execucao_ate: null });
    expect(t.configs[0].proxima_consulta_em.getTime()).toBeGreaterThan(Date.now() + HORA - 5000);
    expect(t.certificados.material).toHaveBeenCalledTimes(1);
    expect(t.execucoes[0]).toMatchObject({ consultas: 2, docs_novos: 70, origem: 'MANUAL', usuario: 'admin@fal' });
    expect(t.execucoes[0].finalizado_em).toBeInstanceOf(Date);
  });

  it('sem novidade (137): nada é gravado e a próxima consulta fica para daqui a 1 hora', async () => {
    const t = montar({ cfg: { ultimo_nsu: nsu(70) } });
    t.respostas.push(resp('137', 70, 70));
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r).toMatchObject({ consultas: 1, docs_recebidos: 0, ultimo_cstat: '137' });
    expect(t.registrados).toHaveLength(0);
    expect(t.configs[0].ultimo_nsu).toBe(nsu(70));
    expect(t.configs[0].proxima_consulta_em.getTime()).toBeGreaterThan(Date.now() + HORA - 5000);
  });

  it('consumo indevido (656): bloqueia por 1 hora e o clique manual seguinte é recusado sem chamar a SEFAZ', async () => {
    const t = montar({ cfg: {} });
    t.respostas.push(resp('656', 0, 0));
    await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(t.configs[0].bloqueado_ate.getTime()).toBeGreaterThan(Date.now() + HORA - 5000);
    await expect(t.service.executar('E1', 'NFE', 'MANUAL', 'admin@fal')).rejects.toThrow(/só permite nova consulta/);
    expect(t.cliente.consultar).toHaveBeenCalledTimes(1);
  });

  it('antes da janela de espera, nenhuma consulta é feita', async () => {
    const t = montar({ cfg: { proxima_consulta_em: new Date(Date.now() + 30 * 60_000) } });
    await expect(t.service.executar('E1', 'NFE', 'MANUAL')).rejects.toThrow(/só permite nova consulta/);
    expect(t.cliente.consultar).not.toHaveBeenCalled();
    expect(t.certificados.material).not.toHaveBeenCalled();
  });

  it('trava: duas capturas da mesma empresa não rodam juntas', async () => {
    const t = montar({ cfg: { em_execucao_ate: new Date(Date.now() + 60_000) } });
    await expect(t.service.executar('E1', 'NFE', 'MANUAL')).rejects.toThrow(/em andamento/);
    expect(t.cliente.consultar).not.toHaveBeenCalled();
  });

  it('falha de comunicação: tenta de novo em 15 minutos e libera a trava; o NSU não anda', async () => {
    const t = montar({ cfg: { ultimo_nsu: nsu(10) } });
    t.respostas.push(new ErroDeComunicacao('tempo esgotado'));
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r.mensagem).toMatch(/Falha de comunicação com a SEFAZ: tempo esgotado/);
    expect(t.configs[0]).toMatchObject({ ultimo_nsu: nsu(10), em_execucao_ate: null });
    const ate = t.configs[0].proxima_consulta_em.getTime() - Date.now();
    expect(ate).toBeGreaterThan(14 * 60_000);
    expect(ate).toBeLessThan(16 * 60_000);
  });

  it('erro ao guardar um documento: o NSU do lote não avança (o lote se repete sem duplicar)', async () => {
    const t = montar({ cfg: { ultimo_nsu: nsu(10) } });
    t.respostas.push(resp('138', 12, 12, 2));
    t.repositorio.registrar.mockRejectedValueOnce(new Error('armazenamento indisponível'));
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r.mensagem).toMatch(/Captura interrompida: armazenamento indisponível/);
    expect(t.configs[0]).toMatchObject({ ultimo_nsu: nsu(10), em_execucao_ate: null });
  });

  it('sem certificado utilizável: a captura não consulta e guarda o motivo', async () => {
    const t = montar({ cfg: {} });
    t.certificados.material.mockRejectedValueOnce(new Error('A empresa não tem certificado ativo no cofre.'));
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r.mensagem).toMatch(/certificado ativo/);
    expect(t.cliente.consultar).not.toHaveBeenCalled();
    expect(t.configs[0].em_execucao_ate).toBeNull();
  });

  it('certificado recusado pela SEFAZ (593): a captura é desativada e o motivo fica registrado', async () => {
    const t = montar({ cfg: {} });
    t.respostas.push(resp('593', 0, 0));
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r.ultimo_cstat).toBe('593');
    expect(t.configs[0]).toMatchObject({ ativo: false, proxima_consulta_em: null, em_execucao_ate: null });
    expect(t.configs[0].ultimo_motivo).toMatch(/corrija o certificado/);
    expect(t.auditoria.map((a) => a.acao)).toContain('CAPTURA_DESATIVADA');
  });

  it('NSU à frente do Ambiente Nacional (589): volta ao zero e espera antes de consultar de novo', async () => {
    const t = montar({ cfg: { ultimo_nsu: nsu(5000), max_nsu: nsu(5000) } });
    t.respostas.push(resp('589', 0, 0));
    await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(t.configs[0]).toMatchObject({ ultimo_nsu: ZEROS, max_nsu: null, ativo: true });
    expect(t.configs[0].proxima_consulta_em.getTime()).toBeGreaterThan(Date.now() + 60 * 60_000);
  });

  it('o XML completo que chega depois do resumo conta como completado, não como novo', async () => {
    const t = montar({ cfg: {} });
    t.respostas.push(resp('138', 2, 2, 2));
    t.repositorio.registrar.mockResolvedValueOnce({ resultado: 'NOVO' as const }).mockResolvedValueOnce({ resultado: 'ATUALIZADO' as never });
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r).toMatchObject({ docs_recebidos: 2, docs_novos: 1, docs_completados: 1 });
    expect(r.mensagem).toBe('1 novo, 1 completado com o XML.');
  });

  it('desativar e ativar de novo não apaga a janela de espera da SEFAZ: a captura segue recusada até o horário liberado', async () => {
    const t = montar({ cfg: {} });
    t.respostas.push(resp('137', 0, 0));
    await t.service.executar('E1', 'NFE', 'AGENDADOR');
    const janela = t.configs[0].proxima_consulta_em as Date;
    expect(janela.getTime()).toBeGreaterThan(Date.now() + HORA);
    await t.service.configurarTipo('E1', 'NFE', false, false, 'admin@fal');
    await t.service.configurarTipo('E1', 'NFE', true, true, 'admin@fal');
    expect(t.configs[0].proxima_consulta_em).toEqual(janela);
    await expect(t.service.executar('E1', 'NFE', 'MANUAL', 'admin@fal')).rejects.toThrow(/só permite nova consulta/);
    expect(t.cliente.consultar).toHaveBeenCalledTimes(1);
  });

  it('a janela de espera e a trava são gravadas já na resposta do serviço, antes da Ciência (se o servidor cair no meio, nada consulta de novo dentro da janela)', async () => {
    const t = montar({ cfg: {}, ciencia: true, docs: [{ chave: 'K1', autorizada_em: new Date(Date.now() - 86_400_000) }] });
    t.respostas.push(resp('137', 0, 0));
    let visto: Record<string, any> | null = null;
    (t.manifestacao.registrarCiencia as any).mockImplementationOnce(async (p: PedidoCiencia) => {
      visto = { ...t.configs[0] };
      return p.chaves.map((chave) => ({ chave, status: 'REGISTRADA' as const, cStat: '135', xMotivo: 'ok', protocolo: '351260000000001' }));
    });
    await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(visto).not.toBeNull();
    expect(visto!.proxima_consulta_em.getTime()).toBeGreaterThan(Date.now() + HORA - 5000);
    expect(visto!.em_execucao_ate.getTime()).toBeGreaterThan(Date.now() + 20 * 60_000);
  });

  it('resposta 138 que manda continuar sem avançar o NSU não repete a consulta: encerra e espera 1 hora', async () => {
    const t = montar({ cfg: { ultimo_nsu: nsu(10) } });
    t.respostas.push({ cStat: '138', xMotivo: 'ok', ultNSU: nsu(10), maxNSU: nsu(500), documentos: [] }, resp('138', 600, 600, 1));
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r.consultas).toBe(1);
    expect(t.cliente.consultar).toHaveBeenCalledTimes(1);
    expect(t.configs[0].ultimo_nsu).toBe(nsu(10));
    expect(t.configs[0].proxima_consulta_em.getTime()).toBeGreaterThan(Date.now() + HORA - 5000);
  });

  it('erro interno do banco não vai para a tela com os argumentos da consulta', async () => {
    const t = montar({ cfg: {} });
    t.respostas.push(resp('138', 1, 1, 1));
    const erroPrisma = Object.assign(new Error('Invalid `prisma.documentoXml.create()` invocation: Unique constraint failed on (empresa_id, chave) /app/dist/x.js'), { name: 'PrismaClientKnownRequestError' });
    t.repositorio.registrar.mockRejectedValueOnce(erroPrisma);
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r.mensagem).toBe('Captura interrompida: erro ao gravar os dados (detalhes no log do servidor)');
    expect(r.mensagem).not.toMatch(/prisma|\/app\//i);
  });

  it('captura desativada não executa', async () => {
    const t = montar({ cfg: { ativo: false } });
    await expect(t.service.executar('E1', 'NFE', 'MANUAL')).rejects.toThrow(/não está ativa/);
  });

  it('documento que o repositório não reconhece aparece como ignorado, com o motivo, e não passa por "já existia"', async () => {
    const t = montar({ cfg: {} });
    t.respostas.push(resp('138', 4, 4, 4));
    t.repositorio.registrar
      .mockResolvedValueOnce({ resultado: 'NOVO' as const })
      .mockResolvedValueOnce({ resultado: 'DUPLICADO' as never })
      .mockResolvedValueOnce({ resultado: 'IGNORADO' as never, motivo: 'não reconhecido como NF-e, CT-e, MDF-e, NFS-e ou evento' } as never)
      .mockResolvedValueOnce({ resultado: 'IGNORADO' as never, motivo: 'maior que 2 MB' } as never);
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r).toMatchObject({ docs_recebidos: 4, docs_novos: 1 });
    expect(r.mensagem).toBe('1 novo, 1 já existiam, 2 ignorados (não reconhecido como NF-e, CT-e, MDF-e, NFS-e ou evento).');
    expect(t.execucoes[0].mensagem).toBe(r.mensagem);
    // o NSU do lote avança (o documento segue na SEFAZ por 90 dias), mas a pessoa vê o que ficou de fora
    expect(t.configs[0].ultimo_nsu).toBe(nsu(4));
  });
});

describe('CapturaXmlService.configurarTipo e ambiente', () => {
  it('ativar exige certificado, UF e a confirmação de que não há outro consumidor', async () => {
    const semCert = montar({ certificadoAtivo: false });
    await expect(semCert.service.configurarTipo('E1', 'NFE', true, true, 'adm')).rejects.toThrow(/certificado válido/);
    const t = montar();
    // os requisitos do estado são só o certificado: não existe mais termo de autorização
    expect((await t.service.status('E1')).requisitos).toEqual({ certificado_ativo: true });
    await expect(t.service.configurarTipo('E1', 'NFE', true, false, 'adm')).rejects.toThrow(/nenhum outro sistema/i);
    await expect(t.service.configurarTipo('E1', 'MDFE' as never, true, true, 'adm')).rejects.toThrow(/ainda não está disponível/);
    const alfa = montar({ documentoCert: '12ABC34501DE35' });
    await expect(alfa.service.configurarTipo('E1', 'CTE', true, true, 'adm')).rejects.toThrow(/CNPJ alfanumérico/);
    expect((await alfa.service.configurarTipo('E1', 'NFE', true, true, 'adm')).tipos.find((x) => x.tipo === 'NFE')?.ativo).toBe(true);
    const st = await t.service.configurarTipo('E1', 'NFE', true, true, 'adm');
    expect(st.tipos.find((x) => x.tipo === 'NFE')?.ativo).toBe(true);
    expect(t.auditoria.map((a) => a.acao)).toEqual(['CAPTURA_ATIVADA']);
    await t.service.configurarTipo('E1', 'NFE', false, false, 'adm');
    expect(t.auditoria.map((a) => a.acao)).toEqual(['CAPTURA_ATIVADA', 'CAPTURA_DESATIVADA']);
  });

  it('o período da busca automática é gravado na empresa, vai para a auditoria e só aceita NOTURNO ou DIURNO', async () => {
    const t = montar({ cfg: {} });
    let st = await t.service.configurarPeriodo('E1', 'DIURNO', 'admin@fal');
    expect(st.periodo.atual).toBe('DIURNO');
    expect(t.auditoria.at(-1)).toMatchObject({ acao: 'CAPTURA_PERIODO', usuario: 'admin@fal', detalhe: 'Diurno, das 06:00 às 17:59 (horário de Brasília)' });
    for (const ruim of ['', 'noturno', 'MADRUGADA', 'DIA']) await expect(t.service.configurarPeriodo('E1', ruim, 'admin@fal'), ruim).rejects.toThrow(/Período inválido/);
    st = await t.service.configurarPeriodo('E1', 'NOTURNO', 'admin@fal');
    expect(st.periodo.atual).toBe('NOTURNO');
  });

  it('a UF do interessado só aceita o código IBGE de uma UF de verdade (nada de nomes herdados do objeto)', async () => {
    const t = montar({ cfg: {} });
    for (const ruim of ['constructor', '__proto__', 'toString', '99', 'AB']) {
      await expect(t.service.configurarAmbiente('E1', 'PRODUCAO', ruim, 'admin@fal'), ruim).rejects.toThrow(/UF do interessado inválida/);
    }
    await expect(t.service.configurarAmbiente('E1', 'PRODUCAO', '51', 'admin@fal')).resolves.toBeTruthy();
  });

  it('trocar o ambiente zera o NSU e desativa a captura (cada ambiente tem a sua numeração)', async () => {
    const t = montar({ cfg: { ultimo_nsu: nsu(900), max_nsu: nsu(900) } });
    const st = await t.service.configurarAmbiente('E1', 'HOMOLOGACAO', undefined, 'adm');
    expect(st.ambiente).toBe('HOMOLOGACAO');
    expect(t.configs[0]).toMatchObject({ ativo: false, ultimo_nsu: ZEROS, max_nsu: null });
    expect(t.auditoria[0].detalhe).toContain('NSU zerado');
    await expect(t.service.configurarAmbiente('E1', 'QUALQUER' as never, undefined, 'adm')).rejects.toThrow(/Ambiente inválido/);
    await expect(t.service.configurarAmbiente('E1', 'PRODUCAO', '99', 'adm')).rejects.toThrow(/UF do interessado inválida/);
  });
});

describe('Ciência da Operação e CNPJ consultado', () => {
  const DIA = 86_400_000;
  const ha = (dias: number) => new Date(Date.now() - dias * DIA);
  const docsDeTeste = [
    { chave: 'K1', autorizada_em: ha(2) },
    { chave: 'K2', autorizada_em: ha(11) },
    { chave: 'K3', autorizada_em: ha(2), ciencia_status: 'NAO_APLICAVEL', ciencia_em: ha(1) },
    { chave: 'K4', autorizada_em: ha(2), ciencia_status: 'REJEITADA', ciencia_em: new Date(Date.now() - 3_600_000) },
    { chave: 'K5', autorizada_em: ha(3), ciencia_status: 'REJEITADA', ciencia_em: new Date(Date.now() - 8 * 3_600_000) },
    { chave: 'K6', autorizada_em: ha(2), conteudo: 'COMPLETO' },
    { chave: 'K7', autorizada_em: ha(2), situacao: 'CANCELADA' },
  ];

  it('registra só a Ciência dos resumos autorizados há menos de 9 dias, sem Ciência (ou rejeitada há mais de 6 horas)', async () => {
    const t = montar({ cfg: {}, ciencia: true, docs: docsDeTeste });
    t.respostas.push(resp('137', 0, 0));
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(t.pedidos).toHaveLength(1);
    expect([...t.pedidos[0].chaves].sort()).toEqual(['K1', 'K5']);
    expect(t.pedidos[0]).toMatchObject({ ambiente: 'PRODUCAO', documentoDestinatario: '12345678000195' });
    expect(t.docs.find((d) => d.chave === 'K1')).toMatchObject({ ciencia_status: 'REGISTRADA', ciencia_protocolo: '351260000000001' });
    expect(t.docs.find((d) => d.chave === 'K5')?.ciencia_status).toBe('REGISTRADA');
    for (const k of ['K2', 'K6', 'K7']) expect(t.docs.find((d) => d.chave === k)?.ciencia_status ?? null).toBeNull();
    expect(r.mensagem).toContain('Ciência da Operação registrada em 2 notas.');
    expect(t.auditoria.map((a) => a.acao)).toContain('USO_MANIFESTACAO');
  });

  it('resumo enviado por arquivo ou com data de autorização no futuro nunca recebe Ciência (só vale o que veio da SEFAZ)', async () => {
    const docs = [
      { chave: 'OK', autorizada_em: ha(2) },
      { chave: 'ARQUIVO', autorizada_em: ha(2), origem: 'UPLOAD' },
      { chave: 'FUTURO', autorizada_em: new Date(Date.now() + 5 * DIA) },
    ];
    const t = montar({ cfg: {}, ciencia: true, docs });
    t.respostas.push(resp('137', 0, 0));
    await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(t.pedidos).toHaveLength(1);
    expect(t.pedidos[0].chaves).toEqual(['OK']);
  });

  it('sem a opção ativada, ou no CT-e e na NFS-e, nada é manifestado', async () => {
    const desligada = montar({ cfg: {}, ciencia: false, docs: docsDeTeste });
    desligada.respostas.push(resp('137', 0, 0));
    await desligada.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(desligada.manifestacao.registrarCiencia).not.toHaveBeenCalled();

    const cte = montar({ cfg: { tipo: 'CTE' }, ciencia: true, docs: docsDeTeste });
    cte.respostas.push(resp('137', 0, 0));
    await cte.service.executar('E1', 'CTE', 'AGENDADOR');
    expect(cte.manifestacao.registrarCiencia).not.toHaveBeenCalled();

    const nfse = montar({ cfg: { tipo: 'NFSE' }, ciencia: true, docs: docsDeTeste });
    nfse.respostas.push(resp('137', 0, 0));
    await nfse.service.executar('E1', 'NFSE', 'AGENDADOR');
    expect(nfse.manifestacao.registrarCiencia).not.toHaveBeenCalled();
  });

  it('falha ao registrar a Ciência não derruba a captura; o que já foi registrado fica guardado', async () => {
    const t = montar({ cfg: {}, ciencia: true, docs: [{ chave: 'K1', autorizada_em: ha(1) }, { chave: 'K2', autorizada_em: ha(1) }] });
    t.respostas.push(resp('137', 0, 0));
    t.respostasCiencia.push(() => new ErroCienciaParcial('tempo esgotado', [{ chave: 'K1', status: 'REGISTRADA', cStat: '135', xMotivo: 'ok', protocolo: 'P1' }]));
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(r.mensagem).toContain('Falha de comunicação ao registrar a Ciência: tempo esgotado');
    expect(t.docs.find((d) => d.chave === 'K1')).toMatchObject({ ciencia_status: 'REGISTRADA', ciencia_protocolo: 'P1' });
    expect(t.docs.find((d) => d.chave === 'K2')?.ciencia_status).toBeNull();
    // a captura em si deu certo: a próxima consulta segue a espera normal da SEFAZ, não a de falha de rede
    expect(t.configs[0].proxima_consulta_em.getTime()).toBeGreaterThan(Date.now() + 60 * 60_000);
  });

  it('a SEFAZ pode recusar uma nota (fora do prazo, cancelada): fica marcada e a tentativa só se repete se for rejeição comum', async () => {
    const t = montar({ cfg: {}, ciencia: true, docs: [{ chave: 'K1', autorizada_em: ha(1) }, { chave: 'K2', autorizada_em: ha(1) }] });
    t.respostas.push(resp('137', 0, 0));
    t.respostasCiencia.push((p) => [
      { chave: p.chaves[0], status: 'NAO_APLICAVEL', cStat: '596', xMotivo: 'fora do prazo', protocolo: null },
      { chave: p.chaves[1], status: 'REJEITADA', cStat: '999', xMotivo: 'erro', protocolo: null },
    ]);
    const r = await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(t.docs.map((d) => d.ciencia_status).sort()).toEqual(['NAO_APLICAVEL', 'REJEITADA']);
    expect(r.mensagem).not.toContain('Ciência da Operação registrada');
    expect(r.mensagem).toContain('1 nota recusada pela SEFAZ na Ciência (999: erro).');
  });

  it('consulta o CNPJ da empresa (filial), não o do titular do certificado (matriz)', async () => {
    const t = montar({ cfg: {}, ciencia: true, cnpjEmpresa: '12.345.678/0002-76', docs: [{ chave: 'K1', autorizada_em: ha(1) }] });
    t.respostas.push(resp('137', 0, 0));
    await t.service.executar('E1', 'NFE', 'AGENDADOR');
    expect(t.cliente.consultar).toHaveBeenCalledWith(expect.objectContaining({ documento: '12345678000276' }), expect.anything());
    expect(t.pedidos[0].documentoDestinatario).toBe('12345678000276');
  });

  it('ativar a Ciência exige a confirmação expressa; desativar é livre; o estado mostra os números', async () => {
    const t = montar({ docs: [{ chave: 'K1', autorizada_em: ha(1) }, { chave: 'K2', autorizada_em: ha(1), ciencia_status: 'REGISTRADA' }, { chave: 'K3', autorizada_em: ha(1), ciencia_status: 'NAO_APLICAVEL' }] });
    await expect(t.service.configurarCiencia('E1', true, false, 'adm')).rejects.toThrow(/Confirme que o cliente autorizou/);
    const st = await t.service.configurarCiencia('E1', true, true, 'adm');
    expect(st.ciencia).toMatchObject({ ativa: true, consentida_por: 'adm', resumos_sem_ciencia: 1, registradas: 1, nao_aplicaveis: 1 });
    expect((await t.service.configurarCiencia('E1', false, false, 'adm')).ciencia.ativa).toBe(false);
    expect(t.auditoria.map((a) => a.acao)).toEqual(['CIENCIA_ATIVADA', 'CIENCIA_DESATIVADA']);
  });
});

describe('CapturaXmlService.rodarPendentes', () => {
  // O período da empresa decide quando o agendador consulta: o relógio dos testes é fixo e fica dentro do noturno (o padrão).
  const DOIS_DA_MANHA = '2026-11-11T05:00:00Z'; // 02:00 em Brasília
  const MEIO_DIA = '2026-11-11T15:00:00Z'; // 12:00 em Brasília
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(DOIS_DA_MANHA)); });
  afterEach(() => { vi.useRealTimers(); });

  const comAgendador = async (valor: string | undefined, fn: () => Promise<void>) => {
    const antes = process.env.CAPTURA_XML_AGENDADOR;
    if (valor === undefined) delete process.env.CAPTURA_XML_AGENDADOR; else process.env.CAPTURA_XML_AGENDADOR = valor;
    try { await fn(); } finally { if (antes === undefined) delete process.env.CAPTURA_XML_AGENDADOR; else process.env.CAPTURA_XML_AGENDADOR = antes; }
  };

  it('executa só as capturas ativas, sem janela de espera aberta', async () => {
    const t = montar({ cfg: {} });
    t.configs.push({ id: 'c2', empresa_id: 'E2', tipo: 'NFE', ativo: true, ultimo_nsu: ZEROS, proxima_consulta_em: new Date(Date.now() + HORA), bloqueado_ate: null, em_execucao_ate: null, ultima_consulta_em: null });
    t.configs.push({ id: 'c3', empresa_id: 'E3', tipo: 'NFE', ativo: false, ultimo_nsu: ZEROS, proxima_consulta_em: null, bloqueado_ate: null, em_execucao_ate: null, ultima_consulta_em: null });
    t.respostas.push(resp('137', 0, 0));
    await comAgendador('on', () => t.service.rodarPendentes());
    expect(t.cliente.consultar).toHaveBeenCalledTimes(1);
    expect(t.execucoes).toHaveLength(1);
    expect(t.execucoes[0].empresa_id).toBe('E1');
  });

  it('só roda quando ligado de propósito (CAPTURA_XML_AGENDADOR=on); sem a variável fica desligado', async () => {
    const t = montar({ cfg: {} });
    for (const valor of [undefined, '', 'off', 'qualquer']) await comAgendador(valor, () => t.service.rodarPendentes());
    expect(t.cliente.consultar).not.toHaveBeenCalled();
    await comAgendador(undefined, async () => { expect((await t.service.status('E1')).agendador_ativo).toBe(false); });
    await comAgendador('ON', async () => { expect((await t.service.status('E1')).agendador_ativo).toBe(true); });
  });

  it('o período é da empresa: a noturna consulta de madrugada e fica quieta ao meio-dia; a diurna é o contrário', async () => {
    const noite = montar({ cfg: {}, periodo: 'NOTURNO' });
    noite.respostas.push(resp('137', 0, 0));
    vi.setSystemTime(new Date(MEIO_DIA));
    await comAgendador('on', () => noite.service.rodarPendentes());
    expect(noite.cliente.consultar).not.toHaveBeenCalled();
    vi.setSystemTime(new Date(DOIS_DA_MANHA));
    await comAgendador('on', () => noite.service.rodarPendentes());
    expect(noite.cliente.consultar).toHaveBeenCalledTimes(1);

    const dia = montar({ cfg: {}, periodo: 'DIURNO' });
    dia.respostas.push(resp('137', 0, 0));
    await comAgendador('on', () => dia.service.rodarPendentes()); // 02:00: fora do diurno
    expect(dia.cliente.consultar).not.toHaveBeenCalled();
    vi.setSystemTime(new Date(MEIO_DIA));
    await comAgendador('on', () => dia.service.rodarPendentes());
    expect(dia.cliente.consultar).toHaveBeenCalledTimes(1);
  });

  it('as bordas do período: o noturno começa às 18:00 e termina às 05:59; o diurno, às 06:00 e 17:59', async () => {
    const roda = async (periodo: string, hhmm: string) => {
      const t = montar({ cfg: {}, periodo });
      t.respostas.push(resp('137', 0, 0));
      vi.setSystemTime(new Date(`2026-11-11T${hhmm}:00-03:00`));
      await comAgendador('on', () => t.service.rodarPendentes());
      return t.cliente.consultar.mock.calls.length === 1;
    };
    expect(await roda('NOTURNO', '17:59')).toBe(false);
    expect(await roda('NOTURNO', '18:00')).toBe(true);
    expect(await roda('NOTURNO', '05:59')).toBe(true);
    expect(await roda('NOTURNO', '06:00')).toBe(false);
    expect(await roda('DIURNO', '05:59')).toBe(false);
    expect(await roda('DIURNO', '06:00')).toBe(true);
    expect(await roda('DIURNO', '17:59')).toBe(true);
    expect(await roda('DIURNO', '18:00')).toBe(false);
  });

  it('empresa sem período escolhido, ou com valor desconhecido no banco, é noturna', async () => {
    const semPeriodo = montar({ cfg: {} });
    semPeriodo.respostas.push(resp('137', 0, 0));
    const estranho = montar({ cfg: {}, periodo: 'MADRUGADA' });
    estranho.respostas.push(resp('137', 0, 0));
    vi.setSystemTime(new Date(MEIO_DIA));
    await comAgendador('on', () => semPeriodo.service.rodarPendentes());
    await comAgendador('on', () => estranho.service.rodarPendentes());
    expect(semPeriodo.cliente.consultar).not.toHaveBeenCalled();
    expect(estranho.cliente.consultar).not.toHaveBeenCalled();
    vi.setSystemTime(new Date(DOIS_DA_MANHA));
    await comAgendador('on', () => semPeriodo.service.rodarPendentes());
    await comAgendador('on', () => estranho.service.rodarPendentes());
    expect(semPeriodo.cliente.consultar).toHaveBeenCalledTimes(1);
    expect(estranho.cliente.consultar).toHaveBeenCalledTimes(1);
  });

  it('quem está fora do período não ocupa vaga de quem está dentro (o limite da rodada vem depois do filtro)', async () => {
    const diurnas = Array.from({ length: 45 }, (_, i) => `D${i}`);
    const t = montar({ cfg: {}, cfgsEmpresa: diurnas.map((empresa_id) => ({ empresa_id, periodo_busca: 'DIURNO' })) });
    for (const empresa_id of diurnas) {
      t.configs.unshift({ id: `c-${empresa_id}`, empresa_id, tipo: 'NFE', ativo: true, ultimo_nsu: ZEROS, proxima_consulta_em: null, bloqueado_ate: null, em_execucao_ate: null, ultima_consulta_em: null });
    }
    t.respostas.push(resp('137', 0, 0));
    await comAgendador('on', () => t.service.rodarPendentes()); // 02:00: só a E1, que é noturna
    expect(t.cliente.consultar).toHaveBeenCalledTimes(1);
    expect(t.execucoes).toHaveLength(1);
    expect(t.execucoes[0].empresa_id).toBe('E1');
  });

  it('o estado mostra o período da empresa e quando a rotina automática volta a consultar', async () => {
    vi.setSystemTime(new Date(MEIO_DIA));
    const t = montar({ cfg: {} });
    await comAgendador('on', async () => {
      const st = await t.service.status('E1');
      expect(st.periodo).toMatchObject({ atual: 'NOTURNO', aberto_agora: false, texto: 'Noturno, das 18:00 às 05:59 (horário de Brasília)' });
      expect(st.periodo.opcoes.map((o) => o.valor)).toEqual(['NOTURNO', 'DIURNO']);
      // fora do período: a próxima busca automática é na abertura (18:00 de Brasília)
      expect(st.tipos.find((x) => x.tipo === 'NFE')?.proxima_automatica_em?.toISOString()).toBe('2026-11-11T21:00:00.000Z');
      // tipo desativado não tem próxima busca
      expect(st.tipos.find((x) => x.tipo === 'CTE')?.proxima_automatica_em).toBeNull();
    });
    await comAgendador('off', async () => {
      expect((await t.service.status('E1')).tipos.find((x) => x.tipo === 'NFE')?.proxima_automatica_em).toBeNull(); // agendador desligado
    });
    // dentro do período, vale a espera da SEFAZ: libera às 03:00 e o noturno ainda está aberto
    vi.setSystemTime(new Date(DOIS_DA_MANHA));
    t.configs[0].proxima_consulta_em = new Date(Date.parse(DOIS_DA_MANHA) + 60 * 60_000);
    await comAgendador('on', async () => {
      const st = await t.service.status('E1');
      expect(st.periodo.aberto_agora).toBe(true);
      expect(st.tipos.find((x) => x.tipo === 'NFE')?.proxima_automatica_em?.toISOString()).toBe('2026-11-11T06:00:00.000Z');
    });
    // se a espera da SEFAZ termina depois do fim do período, a busca espera a próxima abertura
    t.configs[0].proxima_consulta_em = new Date('2026-11-11T09:30:00Z'); // 06:30 de Brasília
    await comAgendador('on', async () => {
      expect((await t.service.status('E1')).tipos.find((x) => x.tipo === 'NFE')?.proxima_automatica_em?.toISOString()).toBe('2026-11-11T21:00:00.000Z');
    });
  });

  it('inclui a captura da NFS-e', async () => {
    const t = montar({ cfg: { tipo: 'NFSE' } });
    t.respostas.push(resp('137', 0, 0));
    await comAgendador('on', () => t.service.rodarPendentes());
    expect(t.cliente.consultar).toHaveBeenCalledTimes(1);
    expect(t.cliente.consultar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'NFSE' }), expect.anything());
  });
});

describe('CapturaXmlService com NFS-e Nacional (ADN)', () => {
  const nfse = (n: number) => ({ nsu: nsu(n), schema: 'NFSe', xml: `<NFSe>${n}</NFSe>` });
  /** Resposta do cliente do ADN: documentos de ultNSU - docs + 1 a ultNSU; maisDocumentos só vem quando há documentos. */
  const lote = (ult: number | string, docs: number, mais: boolean): RespostaDistribuicao => ({
    cStat: '138', xMotivo: 'Documento(s) localizado(s)', ultNSU: typeof ult === 'number' ? nsu(ult) : ult, maxNSU: typeof ult === 'number' ? nsu(ult) : ult,
    documentos: typeof ult === 'number' ? Array.from({ length: docs }, (_, i) => nfse(ult - docs + 1 + i)) : [{ nsu: ult, schema: 'NFSe', xml: '<NFSe>grande</NFSe>' }],
    maisDocumentos: mais,
  });
  const fimDaFila = (ult: number | string): RespostaDistribuicao => ({ cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: typeof ult === 'number' ? nsu(ult) : ult, maxNSU: typeof ult === 'number' ? nsu(ult) : ult, documentos: [] });

  it('lote cheio busca o seguinte na hora e o fim da fila (137) espera 1 hora; o NSU fica guardado e a UF não entra na consulta', async () => {
    const t = montar({ cfg: { tipo: 'NFSE' }, semUf: true });
    t.respostas.push(lote(50, 50, true), fimDaFila(50));
    const r = await t.service.executar('E1', 'NFSE', 'MANUAL', 'admin@fal');
    expect(r).toMatchObject({ consultas: 2, docs_recebidos: 50, docs_novos: 50, ultimo_cstat: '137' });
    expect(t.cliente.consultar).toHaveBeenNthCalledWith(1, { tipo: 'NFSE', ambiente: 'PRODUCAO', documento: '12345678000195', ufAutor: '', ultNSU: ZEROS }, expect.anything());
    expect(t.cliente.consultar).toHaveBeenNthCalledWith(2, expect.objectContaining({ tipo: 'NFSE', ultNSU: nsu(50) }), expect.anything());
    expect(t.registrados).toHaveLength(50);
    expect(t.registrados[0]).toMatchObject({ origem: 'CAPTURA', nsu: nsu(1), nomeOriginal: 'NFSe', xml: '<NFSe>1</NFSe>' });
    expect(t.configs[0]).toMatchObject({ tipo: 'NFSE', ultimo_nsu: nsu(50), ultimo_cstat: '137', em_execucao_ate: null });
    expect(t.configs[0].proxima_consulta_em.getTime()).toBeGreaterThan(Date.now() + HORA - 5000);
    expect(t.execucoes[0]).toMatchObject({ tipo: 'NFSE', consultas: 2, docs_novos: 50, origem: 'MANUAL', usuario: 'admin@fal' });
  });

  it('lote incompleto encerra a execução e espera 1 hora, sem uma segunda consulta', async () => {
    const t = montar({ cfg: { tipo: 'NFSE', ultimo_nsu: nsu(50) } });
    t.respostas.push(lote(70, 20, false));
    const r = await t.service.executar('E1', 'NFSE', 'AGENDADOR');
    expect(r).toMatchObject({ consultas: 1, docs_recebidos: 20, docs_novos: 20, ultimo_cstat: '138' });
    expect(t.configs[0].ultimo_nsu).toBe(nsu(70));
    expect(t.configs[0].proxima_consulta_em.getTime()).toBeGreaterThan(Date.now() + HORA - 5000);
  });

  it('NSU de mais de 15 dígitos é guardado e reenviado como veio', async () => {
    const grande = '12345678901234567890';
    const t = montar({ cfg: { tipo: 'NFSE' } });
    t.respostas.push(lote(grande, 1, true), fimDaFila(grande));
    await t.service.executar('E1', 'NFSE', 'AGENDADOR');
    expect(t.cliente.consultar).toHaveBeenNthCalledWith(2, expect.objectContaining({ ultNSU: grande }), expect.anything());
    expect(t.configs[0]).toMatchObject({ ultimo_nsu: grande, max_nsu: grande });
  });

  it('erro de certificado traduzido pelo cliente (284) desativa a captura da NFS-e e deixa o motivo', async () => {
    const t = montar({ cfg: { tipo: 'NFSE' } });
    t.respostas.push({ cStat: '284', xMotivo: 'E2211: Certificado de transmissão revogado.', ultNSU: ZEROS, maxNSU: ZEROS, documentos: [] });
    const r = await t.service.executar('E1', 'NFSE', 'AGENDADOR');
    expect(r.ultimo_cstat).toBe('284');
    expect(t.configs[0]).toMatchObject({ ativo: false, proxima_consulta_em: null, em_execucao_ate: null });
    expect(t.configs[0].ultimo_motivo).toMatch(/E2211: Certificado de transmissão revogado/);
    expect(t.auditoria.map((a) => a.acao)).toContain('CAPTURA_DESATIVADA');
  });

  it('falha de comunicação com o ADN: tenta de novo em 15 minutos e o NSU não anda', async () => {
    const t = montar({ cfg: { tipo: 'NFSE', ultimo_nsu: nsu(10) } });
    t.respostas.push(new ErroDeComunicacao('O ADN respondeu HTTP 429.'));
    const r = await t.service.executar('E1', 'NFSE', 'AGENDADOR');
    expect(r.mensagem).toMatch(/Falha de comunicação com a SEFAZ: O ADN respondeu HTTP 429/);
    expect(t.configs[0].ultimo_nsu).toBe(nsu(10));
    const ate = t.configs[0].proxima_consulta_em.getTime() - Date.now();
    expect(ate).toBeGreaterThan(14 * 60_000);
    expect(ate).toBeLessThan(16 * 60_000);
  });

  it('ativar: a UF do interessado não é exigida na NFS-e (o ADN não usa), mas continua sendo na NF-e e no CT-e', async () => {
    const t = montar({ semUf: true });
    await expect(t.service.configurarTipo('E1', 'NFE', true, true, 'adm')).rejects.toThrow(/Informe a UF/);
    await expect(t.service.configurarTipo('E1', 'CTE', true, true, 'adm')).rejects.toThrow(/Informe a UF/);
    const st = await t.service.configurarTipo('E1', 'NFSE', true, true, 'adm');
    expect(st.tipos.map((x) => x.tipo)).toEqual(['NFE', 'CTE', 'NFSE']);
    expect(st.tipos.find((x) => x.tipo === 'NFSE')?.ativo).toBe(true);
    expect(t.auditoria.map((a) => a.acao)).toEqual(['CAPTURA_ATIVADA']);
    expect(t.auditoria[0].detalhe).toContain('NFSE');
  });

  it('ativar: valem as mesmas exigências de certificado e confirmação de que nenhum outro sistema consulta o CNPJ', async () => {
    await expect(montar({ certificadoAtivo: false }).service.configurarTipo('E1', 'NFSE', true, true, 'adm')).rejects.toThrow(/certificado válido/);
    const t = montar();
    await expect(t.service.configurarTipo('E1', 'NFSE', true, false, 'adm')).rejects.toThrow(/nenhum outro sistema/i);
    await t.service.configurarTipo('E1', 'NFSE', true, true, 'adm');
    await t.service.configurarTipo('E1', 'NFSE', false, false, 'adm');
    expect(t.auditoria.map((a) => a.acao)).toEqual(['CAPTURA_ATIVADA', 'CAPTURA_DESATIVADA']);
  });

  it('ativar: CNPJ alfanumérico, do certificado ou da empresa, é recusado com mensagem clara (como no CT-e); a NF-e segue aceitando', async () => {
    const certificado = montar({ documentoCert: '12ABC34501DE35' });
    await expect(certificado.service.configurarTipo('E1', 'NFSE', true, true, 'adm')).rejects.toThrow(/NFS-e Nacional ainda não aceita CNPJ alfanumérico.*envio de arquivos/);
    const empresa = montar({ cnpjEmpresa: '12.ABC.345/01DE-35' });
    await expect(empresa.service.configurarTipo('E1', 'NFSE', true, true, 'adm')).rejects.toThrow(/CNPJ alfanumérico/);
    expect((await empresa.service.configurarTipo('E1', 'NFE', true, true, 'adm')).tipos.find((x) => x.tipo === 'NFE')?.ativo).toBe(true);
    expect(empresa.auditoria.map((a) => a.acao)).toEqual(['CAPTURA_ATIVADA']);
  });
});
