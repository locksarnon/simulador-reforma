/** Planilha de decisão por camada: o Excel (colunas, lista, proteção), a prévia da reimportação (recusas) e a aplicação (idempotente, com marca). */
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import {
  ABA_CASOS, ABA_CONTROLE, ABA_ITENS, COLUNAS, campoCorrigivel, conferirLinha, contarConferidas, lerDecisao, recusaDoValor, sha256Curto, type CasoAtual, type LinhaLida, type RegrasDoValor,
} from './planilha-decisao';
import { SanPlanilhaDecisaoService } from './planilha-decisao.service';
import type { ImportadorPort, ItemImportado } from './portas';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const ARQ = { buffer: Buffer.from('x'), nome: 'cadastro.xlsx' };
const item = (codigo: string, ncm: string, linha: number): ItemImportado => ({
  codigo, estabelecimento: null, descricao: `Produto ${codigo}`, unidade: 'UN', ncm, grupo: 'G1', ativo: true, saldo: null,
  ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {}, linha,
});
const caso = (camada: string, tipo: string, itens: string[], atual: Record<string, unknown>, proposta: Record<string, unknown>) => ({
  camada, tipo, itens, problema: `Problema ${tipo}`, evidencia: [], atual, proposta, justificativa: `Justificativa ${tipo}.`, fundamento: `Fundamento ${tipo}`, impactos: [], origem: 'REGRA', afeta: [],
});

async function montar() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', nome: 'Saneamento 2026', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', razao_social: 'Cliente Agro Ltda', erp: 'SAP', cnae_principal: '4683400', cnae_descricao: 'Defensivos', cnaes_secundarios: [], dados_publicos_em: new Date('2026-10-01T00:00:00Z') }],
    ncm: [{ codigo: '01012100', descricao: 'Cavalos', status: 'Ativo' }, { codigo: '31010000', descricao: 'Adubos', status: 'Ativo' }, { codigo: '22021000', descricao: 'Águas', status: 'Inativo' }],
  });
  const itens = [item('C1', '1012100', 1), item('C2', '55555555', 2), item('C3', null as never, 3), item('C4', '31010000', 4)];
  const importador: ImportadorPort = { ler: async () => ({ itens, mapeamento: {}, relatorio: { aceitas: itens.length, rejeitadas: 0, pendentes: 0, linhasRejeitadas: [], linhasPendentes: [] } }) };
  const projetos = new SanProjetoService(prisma as never);
  const casos = new SanCasosService(prisma as never, projetos);
  const importacao = new SanImportacaoService(prisma as never, projetos, importador);
  const p = await projetos.criar('D1', USER);
  await projetos.confirmarAtividades(p.id, 1, USER);
  await importacao.confirmar(p.id, ARQ, undefined, [], USER);
  const id = (codigo: string) => db.sanItem.find((i) => i.codigo === codigo)!.id;
  await casos.registrarResultado(p.id, { camada: 'NCM', analisados: 4, semDados: null, semProblema: [], casos: [
    caso('NCM', 'NCM_FORMATO', [id('C1')], { codigo: 'C1', ncm: '1012100' }, { ncm: '01012100' }),
    caso('NCM', 'NCM_INEXISTENTE', [id('C2')], { codigo: 'C2', ncm: '55555555' }, {}),
    caso('NCM', 'NCM_AUSENTE', [id('C3')], { codigo: 'C3', ncm: null }, {}),
  ] } as never, { interno: true });
  await casos.registrarResultado(p.id, { camada: 'GRUPOS_FINALIDADE', analisados: 4, semDados: null, semProblema: [], casos: [
    caso('GRUPOS_FINALIDADE', 'FINALIDADE_EXCECAO', [id('C4')], { finalidade: null }, { finalidade: 'USO_CONSUMO' }),
  ] } as never, { interno: true });
  const planilha = new SanPlanilhaDecisaoService(prisma as never, projetos, casos);
  const casoDe = (tipo: string) => db.sanCaso.find((c) => c.tipo === tipo)!;
  return { prisma, db, projetoId: p.id as string, casos, planilha, casoDe, itemId: id };
}

type Preenchimento = { decisao?: string; motivo?: string; valor?: string; versao?: number };
/** Preenche a planilha baixada como o consultor faria no Excel (e acrescenta linhas, para simular arquivo adulterado). */
async function preencher(buffer: Buffer, por: Record<string, Preenchimento>, extras: (Preenchimento & { id: string })[] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const ws = wb.getWorksheet(ABA_CASOS)!;
  const col = (cab: string) => COLUNAS.findIndex((c) => c.cab === cab) + 1;
  const escrever = (r: number, p: Preenchimento) => {
    if (p.decisao !== undefined) ws.getCell(r, col('Decisão')).value = p.decisao;
    if (p.motivo !== undefined) ws.getCell(r, col('Motivo')).value = p.motivo;
    if (p.valor !== undefined) ws.getCell(r, col('Valor corrigido')).value = p.valor;
    if (p.versao !== undefined) ws.getCell(r, col('Versão do caso')).value = p.versao;
  };
  let ultima = 0;
  ws.eachRow((row, r) => { ultima = r; const id = String(row.getCell(1).value ?? ''); if (por[id]) escrever(r, por[id]); });
  for (const e of extras) { ultima++; ws.getCell(ultima, 1).value = e.id; ws.getCell(ultima, col('Versão do caso')).value = e.versao ?? 1; escrever(ultima, e); }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('planilha de decisão: exportação', () => {
  it('uma linha por caso aberto da camada, colunas travadas, decisão em lista, aba protegida, itens e controle', async () => {
    const t = await montar();
    const { buffer, nome } = await t.planilha.baixar(t.projetoId, 'NCM');
    expect(nome).toMatch(/^Planilha de decisao - Validar NCM - \d{4}-\d{2}-\d{2}\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual([ABA_CASOS, ABA_ITENS, ABA_CONTROLE]);
    expect(wb.getWorksheet(ABA_CONTROLE)!.state).toBe('veryHidden');
    const ws = wb.getWorksheet(ABA_CASOS)!;
    expect(String(ws.getCell(1, 1).value)).toContain('Planilha de decisão');
    expect(String(ws.getCell(2, 1).value)).toContain('Cliente Agro Ltda');
    expect(String(ws.getCell(3, 1).value)).toMatch(/^1\. /);
    expect(String(ws.getCell(5, 1).value)).toMatch(/^3\. /);
    const cab = ws.getRow(7).values as unknown[];
    expect(cab.slice(1)).toEqual(COLUNAS.map((c) => c.cab));
    expect(ws.getCell(7, 1).font?.name).toBe('Arial');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 7 });
    expect(ws.autoFilter).toBeTruthy();
    expect((ws as unknown as { sheetProtection?: { sheet?: boolean } }).sheetProtection?.sheet).toBe(true);
    // Só os 3 casos da camada NCM (a exceção da outra camada fica fora).
    const ids = [8, 9, 10].map((r) => String(ws.getCell(r, 1).value));
    expect(new Set(ids)).toEqual(new Set(t.db.sanCaso.filter((c) => c.camada === 'NCM').map((c) => c.id)));
    expect(ws.getCell(11, 1).value).toBeNull();
    const dec = COLUNAS.findIndex((c) => c.chave === 'decisao') + 1;
    for (const [i, c] of COLUNAS.entries()) expect(ws.getCell(8, i + 1).protection?.locked ?? true).toBe(!('editavel' in c));
    expect(ws.getCell(8, dec).dataValidation).toMatchObject({ type: 'list', formulae: ['"Aprovar,Rejeitar,Pedir informação"'] });
    const linhaFormato = [8, 9, 10].find((r) => ws.getCell(r, 1).value === t.casoDe('NCM_FORMATO').id)!;
    const valor = (k: string) => ws.getCell(linhaFormato, COLUNAS.findIndex((c) => c.chave === k) + 1).value;
    expect(valor('proposta')).toBe('NCM: 01012100');
    expect(valor('campoCorrigivel')).toBe('NCM');
    expect(valor('codigos')).toBe('C1');
    const wi = wb.getWorksheet(ABA_ITENS)!;
    expect(wi.getRow(1).values).toEqual([undefined, 'ID do caso', 'Código', 'Descrição', 'Grupo', 'NCM', 'Unidade', 'Saldo']);
    expect(wi.rowCount).toBe(4);
  });

  it('camada inválida ou desligada: 400', async () => {
    const t = await montar();
    await expect(t.planilha.baixar(t.projetoId, 'XPTO')).rejects.toThrow();
    await expect(t.planilha.baixar(t.projetoId, 'ESTOQUE')).rejects.toThrow(/não está ligada/);
  });
});

describe('planilha de decisão: prévia', () => {
  it('conta as decisões e recusa linha velha, de outra camada, sem motivo e com valor corrigido inválido', async () => {
    const t = await montar();
    const { buffer } = await t.planilha.baixar(t.projetoId, 'NCM');
    const formato = t.casoDe('NCM_FORMATO'); const inexistente = t.casoDe('NCM_INEXISTENTE'); const ausente = t.casoDe('NCM_AUSENTE');
    const excecao = t.casoDe('FINALIDADE_EXCECAO');
    const arq = await preencher(buffer, {
      [formato.id]: { decisao: 'Aprovar' },
      [inexistente.id]: { decisao: 'Aprovar', valor: '12345' },
      [ausente.id]: { decisao: 'Rejeitar' },
    }, [{ id: excecao.id, decisao: 'Aprovar' }, { id: 'nao-existe', decisao: 'Rejeitar', motivo: 'x' }]);
    const r = await t.planilha.previa(t.projetoId, 'NCM', { buffer: arq, nome: 'decisao.xlsx' });
    expect(r.contagem).toMatchObject({ aprovar: 1, rejeitar: 0, pedirInformacao: 0, semDecisao: 0, recusadas: 4, jaAplicadas: 0 });
    const motivo = (id: string) => r.recusadas.find((x) => x.casoId === id)?.motivo;
    expect(motivo(inexistente.id)).toMatch(/NCM corrigido inválido/);
    expect(motivo(ausente.id)).toMatch(/Rejeitar exige o Motivo/);
    expect(motivo(excecao.id)).toMatch(/camada Grupos,/);
    expect(motivo('nao-existe')).toMatch(/não pertence a este projeto/);
    expect(r.arquivo.sha).toBe(sha256Curto(arq));
    // A prévia não grava nada.
    expect(t.db.sanCaso.every((c) => c.situacao === 'PROPOSTO')).toBe(true);
  });

  it('recusa a linha cujo caso mudou depois de gerada a planilha, NCM inexistente na tabela e valor corrigido onde o caso não aceita', async () => {
    const t = await montar();
    const { buffer } = await t.planilha.baixar(t.projetoId, 'NCM');
    const formato = t.casoDe('NCM_FORMATO'); const inexistente = t.casoDe('NCM_INEXISTENTE'); const ausente = t.casoDe('NCM_AUSENTE');
    await t.casos.salvarRascunho(formato.id, { versao: formato.versao, justificativa: 'editado na tela' }, USER); // versão sobe
    const arq = await preencher(buffer, {
      [formato.id]: { decisao: 'Aprovar' },
      [inexistente.id]: { decisao: 'Aprovar', valor: '22021000' },
      [ausente.id]: { decisao: 'Pedir informação', motivo: 'Ficha técnica', valor: '01012100' },
    });
    const r = await t.planilha.previa(t.projetoId, 'NCM', { buffer: arq, nome: 'decisao.xlsx' });
    const motivo = (id: string) => r.recusadas.find((x) => x.casoId === id)?.motivo;
    expect(motivo(formato.id)).toMatch(/mudou depois que a planilha foi gerada/);
    expect(motivo(inexistente.id)).toMatch(/não consta como ativo/);
    expect(motivo(ausente.id)).toMatch(/só vale para Aprovar/);
  });

  it('planilha de outra camada: recusa o arquivo inteiro', async () => {
    const t = await montar();
    const { buffer } = await t.planilha.baixar(t.projetoId, 'NCM');
    await expect(t.planilha.previa(t.projetoId, 'GRUPOS_FINALIDADE', { buffer, nome: 'x.xlsx' })).rejects.toThrow(/camada Validar NCM/);
    await expect(t.planilha.previa(t.projetoId, 'NCM', { buffer, nome: 'x.csv' })).rejects.toThrow(/\.xlsx/);
  });
});

describe('planilha de decisão: aplicação', () => {
  it('aplica pelo caminho da tela, com a marca do arquivo; repetir o mesmo arquivo não decide de novo', async () => {
    const t = await montar();
    const { buffer } = await t.planilha.baixar(t.projetoId, 'NCM');
    const formato = t.casoDe('NCM_FORMATO'); const inexistente = t.casoDe('NCM_INEXISTENTE'); const ausente = t.casoDe('NCM_AUSENTE');
    const arq = await preencher(buffer, {
      [formato.id]: { decisao: 'Aprovar' },
      [inexistente.id]: { decisao: 'aprovar', valor: '3101.00.00', motivo: 'Conferido com a ficha técnica' },
      [ausente.id]: { decisao: 'Pedir informação', motivo: 'Enviar a ficha técnica do produto' },
    });
    const sha = sha256Curto(arq);
    const marca = `(planilha decisao.xlsx, ${sha})`;
    await expect(t.planilha.aplicar(t.projetoId, 'NCM', { buffer: arq, nome: 'decisao.xlsx' }, USER)).rejects.toThrow(/confirme/);
    const r = await t.planilha.aplicar(t.projetoId, 'NCM', { buffer: arq, nome: 'decisao.xlsx' }, USER, { confirmar: 'true' });
    expect(r).toMatchObject({ aplicadas: { aprovar: 2, rejeitar: 0, pedirInformacao: 1 }, jaAplicadas: 0, recusadas: [], restantes: 0 });
    expect(t.db.sanItem.find((i) => i.codigo === 'C1')!.trabalho.ncm).toBe('01012100');
    expect(t.db.sanItem.find((i) => i.codigo === 'C2')!.trabalho.ncm).toBe('31010000');
    const decisoes = t.db.sanDecisao.filter((d) => d.tipo === 'aprovar' && d.campo === 'ncm');
    expect(decisoes).toHaveLength(2);
    for (const d of decisoes) { expect(d.fundamento).toContain(marca); expect(d.usuario).toBe(USER.email); }
    expect(decisoes.find((d) => d.caso_id === inexistente.id)!.fundamento).toMatch(/^Conferido com a ficha técnica/);
    expect(t.db.sanCaso.find((c) => c.id === ausente.id)).toMatchObject({ situacao: 'AGUARDANDO_INFORMACAO' });
    expect(t.db.sanCaso.find((c) => c.id === ausente.id)!.motivo).toContain(marca);

    const de_novo = await t.planilha.aplicar(t.projetoId, 'NCM', { buffer: arq, nome: 'decisao.xlsx' }, USER, { confirmar: 'true' });
    expect(de_novo).toMatchObject({ aplicadas: { aprovar: 0, rejeitar: 0, pedirInformacao: 0 }, jaAplicadas: 3, recusadas: [] });
    expect(t.db.sanDecisao.filter((d) => d.tipo === 'aprovar' && d.campo === 'ncm')).toHaveLength(2);
  });

  it('rejeitar e aprovar exceção com motivo; o caso aguardando informação volta a ser decidido pela planilha', async () => {
    const t = await montar();
    const ausente = t.casoDe('NCM_AUSENTE');
    await t.casos.pedirInformacao(ausente.id, { versao: ausente.versao, motivo: 'Ficha técnica' });
    const { buffer } = await t.planilha.baixar(t.projetoId, 'NCM');
    const inexistente = t.casoDe('NCM_INEXISTENTE');
    const arq = await preencher(buffer, { [inexistente.id]: { decisao: 'Rejeitar', motivo: 'O NCM está certo' }, [ausente.id]: { decisao: 'Aprovar', valor: '01012100' } });
    const r = await t.planilha.aplicar(t.projetoId, 'NCM', { buffer: arq, nome: 'decisao.xlsx' }, USER, { confirmar: true });
    expect(r).toMatchObject({ aplicadas: { aprovar: 1, rejeitar: 1 }, recusadas: [] });
    expect(t.db.sanCaso.find((c) => c.id === inexistente.id)).toMatchObject({ situacao: 'REJEITADO' });
    expect(t.db.sanCaso.find((c) => c.id === inexistente.id)!.motivo).toMatch(/^O NCM está certo \(planilha decisao\.xlsx, [0-9a-f]{12}\)$/);
    expect(t.db.sanCaso.find((c) => c.id === ausente.id)).toMatchObject({ situacao: 'APROVADO' });
    expect(t.db.sanItem.find((i) => i.codigo === 'C3')!.trabalho.ncm).toBe('01012100');

    const exc = t.casoDe('FINALIDADE_EXCECAO');
    const p2 = await t.planilha.baixar(t.projetoId, 'GRUPOS_FINALIDADE');
    const sem = await preencher(p2.buffer, { [exc.id]: { decisao: 'Aprovar', motivo: 'ok' } });
    expect((await t.planilha.previa(t.projetoId, 'GRUPOS_FINALIDADE', { buffer: sem, nome: 'g.xlsx' })).recusadas[0].motivo).toMatch(/exceção exige o Motivo/);
    const com = await preencher(p2.buffer, { [exc.id]: { decisao: 'Aprovar', motivo: 'Usado só na manutenção da fazenda' } });
    const r2 = await t.planilha.aplicar(t.projetoId, 'GRUPOS_FINALIDADE', { buffer: com, nome: 'g.xlsx' }, USER, { confirmar: 'true' });
    expect(r2.aplicadas.aprovar).toBe(1);
    expect(t.db.sanItem.find((i) => i.codigo === 'C4')!.trabalho.finalidade).toBe('USO_CONSUMO');
  });
});

describe('planilha de decisão: orçamento de tempo', () => {
  it('o que não coube volta em restantes; chamar de novo com o mesmo arquivo continua', async () => {
    const t = await montar();
    const { buffer } = await t.planilha.baixar(t.projetoId, 'NCM');
    const arq = await preencher(buffer, {
      [t.casoDe('NCM_FORMATO').id]: { decisao: 'Aprovar' },
      [t.casoDe('NCM_INEXISTENTE').id]: { decisao: 'Rejeitar', motivo: 'Fica como está' },
      [t.casoDe('NCM_AUSENTE').id]: { decisao: 'Pedir informação', motivo: 'Ficha técnica' },
    });
    const a = await t.planilha.aplicar(t.projetoId, 'NCM', { buffer: arq, nome: 'd.xlsx' }, USER, { confirmar: 'true', orcamentoMs: 1 });
    const feitas = (r: typeof a) => r.aplicadas.aprovar + r.aplicadas.rejeitar + r.aplicadas.pedirInformacao;
    expect(feitas(a)).toBe(1);
    expect(a.restantes).toBe(2);
    let total = feitas(a); let r = a;
    while (r.restantes) { r = await t.planilha.aplicar(t.projetoId, 'NCM', { buffer: arq, nome: 'd.xlsx' }, USER, { confirmar: 'true', orcamentoMs: 1 }); total += feitas(r); expect(r.recusadas).toEqual([]); }
    expect(total).toBe(3);
    expect(r.jaAplicadas).toBe(3 - feitas(r));
  });
});

describe('planilha de decisão: conferência da linha (sem arquivo)', () => {
  const regras: RegrasDoValor = {
    ncm: (n) => ({ existe: n !== '11111111', vigente: n !== '22222222' }),
    limite: (_i, campo) => (campo === 'descricao' ? 20 : 6),
    unidade: (_i, v) => (['UN', 'KG'].includes(v) ? null : `Unidade "${v}" não reconhecida.`),
  };
  const base: CasoAtual = { id: 'K1', projeto_id: 'P1', versao: 3, camada: 'NOMES_UNIDADES', situacao: 'PROPOSTO', tipo: 'DESCRICAO_FORA_PADRAO', problema: 'x', itens: ['I1'], atual: { descricao: 'abc' }, proposta: { descricao: 'ABC' }, fundamento: null, justificativa: 'j' };
  const linha = (p: Partial<LinhaLida>): LinhaLida => ({ linha: 8, id: 'K1', versao: '3', decisao: '', motivo: '', valorCorrigido: '', valorNumerico: false, ...p });
  const conferir = (l: LinhaLida, c: CasoAtual | undefined = base) => conferirLinha(l, c, { projetoId: 'P1', camada: 'NOMES_UNIDADES', regras, vistos: new Set() });

  it('lê a decisão sem depender de acento ou maiúscula', () => {
    expect(lerDecisao('APROVAR')).toBe('aprovar');
    expect(lerDecisao(' pedir informacao ')).toBe('pedir');
    expect(lerDecisao('')).toBe('');
    expect(lerDecisao('Talvez')).toBeNull();
  });

  it('aceita, conta e recusa pelas regras', () => {
    const ls = [
      conferir(linha({ decisao: 'Aprovar' })),
      conferir(linha({ decisao: 'Aprovar', valorCorrigido: 'PARAFUSO SEXTAVADO' })),
      conferir(linha({ decisao: 'Aprovar', valorCorrigido: 'PARAFUSO SEXTAVADO ZINCADO 10MM' })),
      conferir(linha({ decisao: 'Talvez' })),
      conferir(linha({ versao: '2', decisao: 'Rejeitar', motivo: 'm' })),
      conferir(linha({ decisao: 'Pedir informação' })),
      conferir(linha({ motivo: 'sem decisão' })),
      conferir(linha({})),
      conferir(linha({ decisao: 'Aprovar' }), { ...base, situacao: 'APROVADO' }),
      conferir(linha({ decisao: 'Aprovar' }), { ...base, situacao: 'OBSOLETO' }),
    ];
    expect(ls[0]).toMatchObject({ acao: 'aprovar', recusa: null, valor: null });
    expect(ls[1]).toMatchObject({ acao: 'aprovar', recusa: null, campo: 'descricao', valor: 'PARAFUSO SEXTAVADO' });
    expect(ls[2].recusa).toMatch(/limite de 20 caracteres/);
    expect(ls[3].recusa).toMatch(/inválida/);
    expect(ls[4].recusa).toMatch(/versão 2 na planilha, 3 agora/);
    expect(ls[5].recusa).toMatch(/exige o Motivo/);
    expect(ls[6].recusa).toMatch(/sem a Decisão/);
    expect(ls[7]).toMatchObject({ acao: 'nenhuma', recusa: null });
    expect(ls[8].recusa).toMatch(/já foi aprovado/);
    expect(ls[9].recusa).toMatch(/substituído/);
    expect(contarConferidas(ls)).toEqual({ aprovar: 2, rejeitar: 0, pedirInformacao: 0, semDecisao: 1, recusadas: 7 });
  });

  it('valor corrigido: NCM, unidade e campo que o caso corrige', () => {
    expect(recusaDoValor('ncm', '1234', 'I1', regras)).toMatch(/8 dígitos/);
    expect(recusaDoValor('ncm', '11111111', 'I1', regras)).toMatch(/não existe/);
    expect(recusaDoValor('ncm', '22222222', 'I1', regras)).toMatch(/não consta como ativo/);
    expect(recusaDoValor('ncm', '01012100', 'I1', regras)).toBeNull();
    expect(recusaDoValor('unidade', 'CAIXOTE', 'I1', regras)).toMatch(/limite de 6|não reconhecida/);
    expect(recusaDoValor('unidade', 'KG', 'I1', regras)).toBeNull();
    expect(campoCorrigivel({ tipo: 'NCM_INCOMPATIVEL_DESCRICAO', camada: 'NCM_CLASSIFICACAO', itens: ['a'] })).toBe('ncm');
    expect(campoCorrigivel({ tipo: 'UNIDADE_GRAFIA', camada: 'NOMES_UNIDADES', itens: ['a'] })).toBe('unidade');
    expect(campoCorrigivel({ tipo: 'NCM_FORMATO', camada: 'NCM', itens: ['a', 'b'] })).toBeNull();
    expect(campoCorrigivel({ tipo: 'FINALIDADE_GRUPO', camada: 'FINALIDADE', itens: ['a'] })).toBeNull();
    const fin = { ...base, camada: 'GRUPOS_FINALIDADE', tipo: 'FINALIDADE_GRUPO', proposta: { finalidade: 'REVENDA' } };
    expect(conferirLinha(linha({ decisao: 'Aprovar', valorCorrigido: 'X' }), fin, { projetoId: 'P1', camada: 'GRUPOS_FINALIDADE', regras, vistos: new Set() }).recusa).toMatch(/não aceita valor corrigido/);
    const sem = { ...base, tipo: 'NCM_AUSENTE', camada: 'NCM', proposta: {} };
    expect(conferirLinha(linha({ decisao: 'Aprovar' }), sem, { projetoId: 'P1', camada: 'NCM', regras, vistos: new Set() }).recusa).toMatch(/informe o Valor corrigido \(NCM\)/);
  });

  it('o mesmo caso duas vezes: vale a primeira linha', () => {
    const vistos = new Set<string>();
    const a = conferirLinha(linha({ decisao: 'Aprovar' }), base, { projetoId: 'P1', camada: 'NOMES_UNIDADES', regras, vistos });
    const b = conferirLinha(linha({ linha: 9, decisao: 'Rejeitar', motivo: 'm' }), base, { projetoId: 'P1', camada: 'NOMES_UNIDADES', regras, vistos });
    expect(a.recusa).toBeNull();
    expect(b.recusa).toMatch(/mais de uma vez/);
  });
});
