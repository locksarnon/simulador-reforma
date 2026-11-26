import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';
import { decidirAcesso, TELAS } from '../permissoes/permissoes';
import { TIPOS_AJUSTE } from '../saneamento-estoques/fiscal/impactoSped';
import { CARGA_ERPS, idDoItemDaCarga } from './carga';
import { ErpsController } from './erps.controller';
import { carregarPerfil, ErpsService } from './erps.service';
import { acaoNoErp, associarErp, colunasDoExport, normalizarNome, perfilEspecifico, restricoesDoTipo, type PerfilErp } from './logica';

type Linha = Record<string, unknown> & { id: string };

/** Prisma em memória, só com o que o Cadastro de ERPs usa. */
function montar() {
  const erps: Linha[] = []; const itens: Linha[] = []; const hist: Linha[] = [];
  const empresas: Linha[] = [
    { id: 'E1', erp: 'Protheus', erp_id: null }, { id: 'E2', erp: 'SAP Business One', erp_id: null }, { id: 'E3', erp: 'Sankhya', erp_id: null },
    { id: 'E4', erp: 'siagri', erp_id: null }, { id: 'E5', erp: null, erp_id: null }, { id: 'E6', erp: 'Outro', erp_id: null },
  ];
  const projetos: Linha[] = [{ id: 'P1', erp: 'TOTVS Protheus', erp_id: null }, { id: 'P2', erp: 'ERP da casa', erp_id: null }];
  let seq = 0;
  const igualNome = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
  const agora = () => new Date(Date.UTC(2026, 10, 26, 12, 0, seq++));
  const comItens = (e: Linha, inc?: { conhecimentos?: { where?: { ativo?: boolean } } }) => {
    if (!inc?.conhecimentos) return { ...e };
    return { ...e, conhecimentos: itens.filter((i) => i.erp_id === e.id && (inc.conhecimentos!.where?.ativo === undefined || i.ativo === inc.conhecimentos!.where.ativo)).sort((a, b) => Number(a.ordem) - Number(b.ordem)) };
  };
  const semVinculo = (lista: Linha[]) => ({
    findMany: async () => lista.filter((r) => r.erp_id == null && r.erp != null).map((r) => ({ id: r.id, erp: r.erp })),
    updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Linha }) => {
      let count = 0; for (const r of lista) if (where.id.in.includes(r.id) && r.erp_id == null) { Object.assign(r, data); count++; }
      return { count };
    },
  });
  const prisma: Record<string, unknown> = {
    erp: {
      findUnique: async ({ where, include }: { where: { id: string }; include?: never }) => { const e = erps.find((x) => x.id === where.id); return e ? comItens(e, include) : null; },
      findFirst: async ({ where }: { where: { nome: { equals: string }; id?: { not: string } } }) => erps.find((x) => igualNome(x.nome, where.nome.equals) && x.id !== where.id?.not) ?? null,
      findMany: async (a: { include?: { conhecimentos?: unknown } } = {}) => [...erps].sort((x, y) => String(x.nome).localeCompare(String(y.nome))).map((e) => (a.include ? comItens(e, { conhecimentos: {} }) : { ...e })),
      create: async ({ data }: { data: Linha }) => { const e = { ativo: true, versoes: [], produto: null, ...data, id: data.id ?? `ERP${++seq}`, createdAt: agora(), updatedAt: agora() }; erps.push(e); return { ...e }; },
      update: async ({ where, data }: { where: { id: string }; data: Linha }) => ({ ...Object.assign(erps.find((x) => x.id === where.id)!, data, { updatedAt: agora() }) }),
    },
    erpConhecimento: {
      findUnique: async ({ where }: { where: { id: string } }) => { const i = itens.find((x) => x.id === where.id); return i ? { ...i } : null; },
      create: async ({ data }: { data: Linha }) => { const i = { ativo: true, ordem: 0, tipo_ajuste: null, campo_erp: null, fonte_url: null, ...data, id: data.id ?? `K${++seq}`, createdAt: agora() }; itens.push(i); return { ...i }; },
      update: async ({ where, data }: { where: { id: string }; data: Linha }) => ({ ...Object.assign(itens.find((x) => x.id === where.id)!, data) }),
    },
    erpHistorico: {
      findMany: async ({ where }: { where: { acao?: { in: string[] }; erp_id?: string } }) => hist.filter((h) => (!where.acao || where.acao.in.includes(String(h.acao))) && (!where.erp_id || h.erp_id === where.erp_id)).reverse(),
      create: async ({ data }: { data: Linha }) => { const h = { conhecimento_id: null, ...data, id: `H${++seq}`, createdAt: agora() }; hist.push(h); return h; },
    },
    empresa: semVinculo(empresas),
    sanProjeto: semVinculo(projetos),
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  const service = new ErpsService(prisma as never);
  return { service, prisma, erps, itens, hist, empresas, projetos };
}

const ADMIN = { email: 'adm@fal', role: 'admin' };

describe('carga inicial do Cadastro de ERPs', () => {
  it('cria os 4 ERPs e o conhecimento, e reaplicar não duplica nada', async () => {
    const t = montar();
    const r1 = await t.service.aplicarCarga();
    expect(t.erps.map((e) => e.nome).sort()).toEqual(['Aliare Siagri', 'Outro ERP (sem perfil)', 'SAP Business One', 'TOTVS Protheus']);
    const total = CARGA_ERPS.reduce((s, e) => s + e.itens.length, 0);
    expect(t.itens).toHaveLength(total);
    expect(r1.criados).toBe(4 + total);
    const r2 = await t.service.aplicarCarga();
    expect(r2).toEqual({ criados: 0, atualizados: 0 });
    expect(t.itens).toHaveLength(total);
    expect(t.erps).toHaveLength(4);
  });

  it('situações: SAP completo, Siagri e Protheus parciais, Outro a desenvolver e sem conhecimento', async () => {
    const t = montar(); await t.service.aplicarCarga();
    const sit = Object.fromEntries(t.erps.map((e) => [e.nome, e.situacao]));
    expect(sit).toEqual({ 'SAP Business One': 'COMPLETO', 'Aliare Siagri': 'PARCIAL', 'TOTVS Protheus': 'PARCIAL', 'Outro ERP (sem perfil)': 'A_DESENVOLVER' });
    expect(t.itens.filter((i) => i.erp_id === 'erp-outro')).toHaveLength(0);
  });

  it('todo item tem fonte oficial (URL) e grau; tipos de ajuste válidos', () => {
    for (const e of CARGA_ERPS) for (const i of e.itens) {
      expect(i.fonte_url, `${e.nome}/${i.k}`).toMatch(/^https:\/\//);
      expect(['CONFIRMADO', 'NAO_CONFIRMADO']).toContain(i.grau);
      if (i.tipo_ajuste) expect(TIPOS_AJUSTE as readonly string[]).toContain(i.tipo_ajuste);
    }
  });

  it('SAP: NCM pelo JOIN OITM→ONCM, consultas A a D, unificação OIGE + OIGN + inativar, nunca "fusão" como ação', () => {
    const sap = CARGA_ERPS.find((e) => e.id === 'erp-sap-b1')!;
    expect(sap.itens.find((i) => i.tipo === 'COLUNA_EXPORT' && i.chave === 'ncm')!.campo_erp).toBe('NcmCode');
    const a = sap.itens.find((i) => i.k === 'consulta-a')!;
    expect(a.texto).toContain('LEFT JOIN "ONCM"  T2 ON T2."AbsEntry"   = T0."NCMCode"');
    expect(sap.itens.filter((i) => i.tipo === 'CONSULTA_EXTRACAO').map((i) => i.chave.slice(0, 10))).toEqual(['Consulta A', 'Consulta B', 'Consulta C', 'Consulta D']);
    const unif = sap.itens.find((i) => i.tipo === 'ACAO_NO_ERP' && i.tipo_ajuste === 'CONSOLIDOU_INATIVOU')!;
    expect(unif.texto).toMatch(/OIGE.*\{sai\}.*OIGN.*\{fica\}.*inativar \{sai\}/);
    for (const i of sap.itens.filter((x) => x.tipo === 'ACAO_NO_ERP')) expect(i.texto.toLowerCase()).not.toContain('fusão');
  });

  it('Siagri: perguntas abertas entram como observação não confirmada', () => {
    const s = CARGA_ERPS.find((e) => e.id === 'erp-aliare-siagri')!;
    const perguntas = s.itens.filter((i) => i.k.startsWith('p-'));
    expect(perguntas).toHaveLength(11);
    for (const p of perguntas) { expect(p.tipo).toBe('OBSERVACAO'); expect(p.grau).toBe('NAO_CONFIRMADO'); }
  });

  it('Protheus: pontos confirmados do relatório', () => {
    const p = CARGA_ERPS.find((e) => e.id === 'erp-totvs-protheus')!;
    const txt = (k: string) => p.itens.find((i) => i.k === k)!;
    expect(txt('r-codigo').texto).toContain('B1_COD não pode ser alterado');
    expect(txt('r-excluir').texto).toContain("B1_MSBLQL = '1'");
    expect(txt('r-bloquear-antes').texto).toMatch(/zerar o saldo.*depois bloquear/);
    expect(txt('a-unificar').texto).toContain('MATA261');
    expect(txt('r-fusao').texto).toContain('MATA260 foi descontinuada em 2022');
    expect(txt('r-segum').texto).toMatch(/zerar o saldo.*reimplantar depois do fechamento/);
    expect(txt('o-usai').texto).toMatch(/B2_USAI.*só considera saídas.*SD1, SD2 e SD3/);
    expect(txt('r-sbz').texto).toContain('MV_ARQPROD = SBZ');
    expect(txt('o-sped').texto).toMatch(/0205.*AIF.*B1_CODANT.*MV_HISTTAB.*0220.*MV_GER0220.*SB9.*MATR460/);
    expect(txt('r-tributario').texto).toMatch(/Configurador de Tributos \(Perfil de Produto\), não na SB1/);
    expect(txt('m-execauto').chave).toContain('ExecAuto/MVC da MATA010');
    expect(txt('m-mile').texto).toContain('só faz inclusão');
    expect(txt('r-1um').grau).toBe('NAO_CONFIRMADO');
    for (const k of ['r-codigo', 'r-excluir', 'r-bloquear-antes', 'a-unificar', 'r-segum', 'o-usai', 'r-sbz', 'o-sped', 'r-tributario', 'm-execauto', 'm-mile']) expect(txt(k).grau, k).toBe('CONFIRMADO');
  });

  it('o que o administrador editou não é sobrescrito pela carga; o que ninguém editou é atualizado', async () => {
    const t = montar(); await t.service.aplicarCarga();
    const idEditado = idDoItemDaCarga('erp-sap-b1', 'r-fusao');
    await t.service.atualizarItem('erp-sap-b1', idEditado, { texto: 'Texto do administrador' }, ADMIN);
    const outroId = idDoItemDaCarga('erp-sap-b1', 'r-lote');
    Object.assign(t.itens.find((i) => i.id === outroId)!, { texto: 'versão antiga da carga' });
    const r = await t.service.aplicarCarga();
    expect(r.atualizados).toBe(1);
    expect(t.itens.find((i) => i.id === idEditado)!.texto).toBe('Texto do administrador');
    expect(t.itens.find((i) => i.id === outroId)!.texto).not.toBe('versão antiga da carga');
    expect(t.hist.some((h) => h.acao === 'CARGA' && h.conhecimento_id === outroId)).toBe(true);
  });
});

describe('edição com histórico', () => {
  it('cria, altera e registra quem, antes e depois', async () => {
    const t = montar(); await t.service.aplicarCarga();
    const e = await t.service.criar({ nome: 'Sankhya Om', fabricante: 'Sankhya', situacao: 'A_DESENVOLVER', versoes: ['4.20', '4.20', ' '] }, ADMIN);
    expect(e.versoes).toEqual(['4.20']);
    await t.service.atualizar(e.id, { situacao: 'PARCIAL' }, ADMIN);
    const ficha = await t.service.obter(e.id);
    const alterou = ficha.historico.find((h) => h.acao === 'ALTEROU')!;
    expect(alterou.usuario).toBe('adm@fal');
    expect((alterou.antes as Linha).situacao).toBe('A_DESENVOLVER');
    expect((alterou.depois as Linha).situacao).toBe('PARCIAL');
    const k = await t.service.criarItem(e.id, { tipo: 'RESTRICAO', tipo_ajuste: 'INATIVOU', chave: 'X', texto: 'Y', fonte_url: 'https://exemplo.gov.br', grau: 'CONFIRMADO' }, ADMIN);
    await t.service.atualizarItem(e.id, k.id, { ativo: false }, ADMIN);
    expect(t.hist.filter((h) => h.conhecimento_id === k.id).map((h) => h.acao)).toEqual(['CRIOU', 'ALTEROU']);
  });

  it('recusa dado inválido e nome repetido', async () => {
    const t = montar(); await t.service.aplicarCarga();
    await expect(t.service.criar({ nome: 'sap business one', fabricante: 'SAP' }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    await expect(t.service.criar({ nome: 'X', fabricante: 'Y', situacao: 'TALVEZ' }, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.criarItem('erp-sap-b1', { tipo: 'RESTRICAO', tipo_ajuste: 'FUSAO', chave: 'a', texto: 'b' }, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.criarItem('erp-sap-b1', { tipo: 'RESTRICAO', chave: 'a', texto: 'b', fonte_url: 'ftp://x' }, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('permissões', () => {
  it('só o administrador altera; ler é de todos', () => {
    const t = montar();
    const c = new ErpsController(t.service);
    const consultor = { id: 'u', email: 'c@fal', name: null, role: 'user' as never };
    expect(() => c.criar(consultor, { nome: 'X', fabricante: 'Y' })).toThrow(ForbiddenException);
    expect(() => c.atualizar(consultor, 'erp-sap-b1', {})).toThrow(ForbiddenException);
    expect(() => c.criarItem(consultor, 'erp-sap-b1', {})).toThrow(ForbiddenException);
    expect(() => c.atualizarItem(consultor, 'erp-sap-b1', 'k', {})).toThrow(ForbiddenException);
    // O guarda deixa qualquer nível ler a lista e o perfil (as telas precisam), inclusive quem é só leitura.
    const leitura = { role: 'user', nivel: 'SOMENTE_LEITURA' };
    expect(decidirAcesso(leitura, { metodo: 'GET', rota: 'erps' })).toEqual({ ok: true });
    expect(decidirAcesso(leitura, { metodo: 'GET', rota: 'erps/:id/perfil' })).toEqual({ ok: true });
    expect(decidirAcesso(leitura, { metodo: 'POST', rota: 'erps' }).ok).toBe(false);
    expect(TELAS.find((x) => x.id === 'configuracao')!.titulo).toBe('Configuração e ERPs');
  });
});

describe('associação do texto antigo', () => {
  it('associa quando o nome casa sem ambiguidade; o texto fica; o resto fica sem vínculo', async () => {
    const t = montar(); await t.service.aplicarCarga();
    const r = await t.service.associarTextosAntigos();
    const por = Object.fromEntries(t.empresas.map((e) => [e.id, e.erp_id]));
    expect(por).toEqual({ E1: 'erp-totvs-protheus', E2: 'erp-sap-b1', E3: null, E4: 'erp-aliare-siagri', E5: null, E6: 'erp-outro' });
    expect(t.empresas.find((e) => e.id === 'E1')!.erp).toBe('Protheus');
    expect(t.projetos.map((p) => p.erp_id)).toEqual(['erp-totvs-protheus', null]);
    expect(r).toEqual({ empresas: 4, projetos: 1 });
    expect(await t.service.associarTextosAntigos()).toEqual({ empresas: 0, projetos: 0 });
  });

  it('nome ambíguo não associa', () => {
    const erps = [{ id: 'a', nome: 'TOTVS Protheus', fabricante: 'TOTVS' }, { id: 'b', nome: 'Protheus', fabricante: 'Outro' }];
    expect(associarErp('Protheus', erps)).toBeNull();
    expect(associarErp('TOTVS  protheus', erps)?.id).toBe('a');
    expect(normalizarNome('  Aliare / Siágri ')).toBe('aliare siagri');
  });

  it('o espelho da tela (src/lib/erps.js) associa igual', async () => {
    const tela = await import(pathToFileURL(join(__dirname, '../../../src/lib/erps.js')).href);
    const erps = CARGA_ERPS.map((e) => ({ id: e.id, nome: e.nome, fabricante: e.fabricante, produto: e.produto }));
    for (const texto of ['Protheus', 'SAP Business One', 'SAP B1', 'siagri', 'Siagri AgriBusiness', 'Outro', 'Sankhya', 'TOTVS', 'business one', '', 'Outro ERP (sem perfil)']) {
      expect(tela.associarErp(texto, erps)?.id ?? null, texto).toBe(associarErp(texto, erps)?.id ?? null);
    }
  });
});

describe('perfil usado pelas telas', () => {
  it('restrições por tipo de ajuste, ação com os códigos e colunas do export', async () => {
    const t = montar(); await t.service.aplicarCarga();
    const sap = (await carregarPerfil(t.prisma, 'erp-sap-b1'))!;
    expect(perfilEspecifico(sap)).toBe(true);
    expect(restricoesDoTipo(sap, ['MUDOU_UNIDADE']).map((i) => i.chave)).toEqual(['Unidade de estoque travada', 'Grupo de UdM']);
    expect(restricoesDoTipo(sap, ['MUDOU_UNIDADE']).every((i) => i.fonte_url && i.grau)).toBe(true);
    expect(acaoNoErp(sap, 'CONSOLIDOU_INATIVOU', { sai: 'A1', fica: 'B2' })).toMatch(/OIGE\) de A1.*OIGN\) em B2.*inativar A1/);
    expect(colunasDoExport(sap).ncm).toEqual(['NcmCode']);
    const outro = (await carregarPerfil(t.prisma, 'erp-outro')) as PerfilErp;
    expect(perfilEspecifico(outro)).toBe(false);
    expect(restricoesDoTipo(outro, ['MUDOU_UNIDADE'])).toEqual([]);
    expect(acaoNoErp(outro, 'CONSOLIDOU_INATIVOU')).toBeNull();
    expect(await carregarPerfil(t.prisma, null)).toBeNull();
    expect(await carregarPerfil({}, 'erp-sap-b1')).toBeNull();
  });

  it('item desativado sai do perfil', async () => {
    const t = montar(); await t.service.aplicarCarga();
    await t.service.atualizarItem('erp-sap-b1', idDoItemDaCarga('erp-sap-b1', 'r-udm-grupo'), { ativo: false }, ADMIN);
    const sap = (await carregarPerfil(t.prisma, 'erp-sap-b1'))!;
    expect(restricoesDoTipo(sap, ['MUDOU_UNIDADE']).map((i) => i.chave)).toEqual(['Unidade de estoque travada']);
  });
});
