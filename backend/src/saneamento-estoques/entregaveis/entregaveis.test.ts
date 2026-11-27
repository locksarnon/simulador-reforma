import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { PdfService } from '../../pdf/pdf.service';
import { SanVersoesService } from '../dados/versoes.service';
import { criarPrismaFalso } from '../dados/prisma-falso';
import type { DadosEntrega } from '../dados/portas';
import { EntregaveisController } from './entregaveis.controller';
import { EntregaveisService, fatiaDoNome, nomeDaPolitica, nomeDoExcel, nomeDoRelatorio } from './entregaveis.service';
import { ABAS_DE_CARGA_NO_ERP_DA_ENTREGA, NOMES_ABAS } from './excel';
import { CAMADAS_TESTE, dadosBase, itensTabela, trab, type Linha } from './__fixtures__/dados';
import { montarRelatorio } from './relatorio';
import { ABAS_DE_CARGA_NO_ERP, semLogoDeCargaNoErp, tirarLinhaDaLogo } from '../../marca/__fixtures__/excel-com-logo';

const svc = () => new EntregaveisService(new PdfService(), {} as never, {} as never);
/** Abre o Excel, confere a logo da FAL na linha 1 de cada aba e tira essa linha (as conferências por posição partem dos títulos). */
async function abrir(buf: Buffer) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as never); return tirarLinhaDaLogo(wb); }
const cabecalhos = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1).map(String);
const coluna = (ws: ExcelJS.Worksheet, nome: string) => cabecalhos(ws).indexOf(nome) + 1;
const valores = (ws: ExcelJS.Worksheet, nome: string) => { const c = coluna(ws, nome); const r: unknown[] = []; for (let i = 2; i <= ws.rowCount; i++) r.push(ws.getRow(i).getCell(c).value); return r; };
const textoDaAba = (ws: ExcelJS.Worksheet) => { const t: string[] = []; ws.eachRow((r) => r.eachCell((c) => t.push(String(c.value ?? '')))); return t.join('\n'); };

async function textoDoPdf(pdf: Buffer): Promise<string> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs' as string)) as unknown as { getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }> }> } };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  let t = '';
  for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str ?? '').join(' ') + '\n';
  return t;
}

describe('Excel: 6 abas', () => {
  it('cria as 6 abas na ordem, com cabeçalho congelado e filtro', async () => {
    const wb = await abrir(await svc().gerarExcel(dadosBase(true)));
    expect(wb.worksheets.map((w) => w.name)).toEqual([...NOMES_ABAS]);
    for (const nome of NOMES_ABAS.slice(1)) {
      const ws = wb.getWorksheet(nome)!;
      // logo da FAL + títulos; aba de carga no ERP: só os títulos (sem a logo)
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: (ABAS_DE_CARGA_NO_ERP_DA_ENTREGA as readonly string[]).includes(nome) ? 1 : 2 });
      expect(ws.autoFilter).toBeTruthy();
      expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    }
  });

  it('abas de carga no ERP (Cadastro saneado, De para e equivalências) saem sem a logo, títulos na linha 1 e filtro a partir dela; o Resumo e as demais têm a logo', async () => {
    expect([...ABAS_DE_CARGA_NO_ERP_DA_ENTREGA]).toEqual(['Cadastro saneado', 'De para e equivalências']);
    for (const liberada of [true, false]) {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await svc().gerarExcel(dadosBase(liberada))) as never);
      for (const nome of ABAS_DE_CARGA_NO_ERP_DA_ENTREGA) {
        const ws = wb.getWorksheet(nome)!;
        semLogoDeCargaNoErp(ws);
        expect(ABAS_DE_CARGA_NO_ERP['saneamento-estoques/entregaveis/excel.ts'].abas).toContain(nome);
        expect(ws.getRow(1).getCell(1).value).toBe(nome === 'Cadastro saneado' ? 'Código' : 'Tipo de registro');
        expect(String(ws.getRow(2).getCell(1).value ?? '')).not.toBe('');
        expect(String(ws.autoFilter)).toMatch(/^A1:/);
      }
      for (const nome of wb.worksheets.map((w) => w.name).filter((n) => !(ABAS_DE_CARGA_NO_ERP_DA_ENTREGA as readonly string[]).includes(n))) {
        const ws = wb.getWorksheet(nome)!;
        expect(ws.getImages().length, nome).toBe(1);
        expect(ws.getImages()[0].range.tl.nativeRow, nome).toBe(0);
        expect(ws.getRow(1).cellCount, nome).toBe(0);
      }
      expect(wb.getWorksheet(NOMES_ABAS[0])!.getImages()).toHaveLength(1);
    }
  });

  it('cadastro: códigos e NCM como texto (zeros preservados), como era × como ficou, finalidade, situação por camada', async () => {
    const wb = await abrir(await svc().gerarExcel(dadosBase(true)));
    const ws = wb.getWorksheet('Cadastro saneado')!;
    // Entrega liberada: sem coluna totalmente vazia (estabelecimento único) e sem identificador interno.
    expect(cabecalhos(ws).slice(0, 12)).toEqual(['Código', 'Situação do item', 'Código de destino', 'Descrição (como era)', 'Descrição (como ficou)', 'Unidade', 'NCM', 'Grupo', 'Finalidade', 'Origem da finalidade', 'Também usado como', 'Ativo']);
    expect(cabecalhos(ws)).not.toContain('Estabelecimento');
    expect(cabecalhos(ws)).not.toContain('ID interno');
    expect(valores(ws, 'Código')).toEqual(['00123', '000456', '0789']);
    expect(ws.getRow(2).getCell(1).type).toBe(ExcelJS.ValueType.String);
    expect(ws.getRow(2).getCell(1).numFmt).toBe('@');
    expect(ws.getRow(2).getCell(coluna(ws, 'NCM')).numFmt).toBe('@');
    expect(valores(ws, 'Descrição (como era)')[0]).toBe('ADUBO NPK 04148 SC50');
    expect(valores(ws, 'Descrição (como ficou)')[0]).toBe('ADUBO NPK 04-14-08 SC 50KG');
    // Material do cliente: rótulos, nunca o nome interno do campo.
    expect(valores(ws, 'Campos alterados')[0]).toBe('Descrição, cClassTrib');
    expect(valores(ws, 'Finalidade')).toEqual(['Insumo de produção', 'Revenda', null]);
    expect(valores(ws, 'Também usado como')[1]).toBe('Matéria-prima');
    expect(valores(ws, 'Tratamento tributário')).toEqual(['Aprovado', 'Proposto (revisar)', 'Pendente']);
    expect(valores(ws, 'Camadas a revisar')[1]).toBe('Tratamento tributário');
    expect(cabecalhos(ws)).not.toContain('Marca');
    // A revisão (ferramenta interna) continua completa.
    const rev = (await abrir(await svc().gerarExcel(dadosBase(false)))).getWorksheet('Cadastro saneado')!;
    expect(cabecalhos(rev)).toContain('Estabelecimento');
    expect(valores(rev, 'ID interno')).toEqual(['i1', 'i2', 'i3']);
  });

  it('cenários: um por finalidade aplicável, lei + artigo, CST, cClassTrib, origem; liberada só com enquadramento concluído', async () => {
    const wb = await abrir(await svc().gerarExcel(dadosBase(true)));
    const ws = wb.getWorksheet('Cenários tributários')!;
    expect(cabecalhos(ws)).toEqual(['Código', 'Descrição saneada', 'NCM', 'Finalidade', 'Cenário', 'Enquadramento legal (texto da lei)', 'Artigo / anexo', 'CST', 'cClassTrib', 'Origem', 'Situação', 'Observação']);
    const por = (cod: string) => { const r: ExcelJS.Row[] = []; ws.eachRow((row, i) => { if (i > 1 && row.getCell(1).value === cod) r.push(row); }); return r; };
    const v = (r: ExcelJS.Row, nome: string) => r.getCell(coluna(ws, nome)).value;
    const i1 = por('00123');
    // Insumo de produção: o rótulo diz a finalidade real; o cenário fixo do plano (compra) vai na observação. A devolução tem crédito
    // diferente (estorno) e por isso aparece.
    expect(i1.map((r) => v(r, 'Cenário'))).toEqual(['Aquisição (insumo de produção)', 'Devolução']);
    expect(v(i1[0], 'Observação')).toContain('Aquisição de insumo de produção avaliada no cenário "Compra para revenda"');
    expect(v(i1[0], 'Enquadramento legal (texto da lei)')).toBe('Insumos agropecuários: redução de 60% das alíquotas');
    expect(v(i1[0], 'Artigo / anexo')).toBe('LC 214/2025, Anexo IX, item 12');
    expect(v(i1[0], 'CST')).toBe('200');
    expect(v(i1[0], 'cClassTrib')).toBe('200003');
    expect(v(i1[0], 'Origem')).toBe('Herdado do conjunto');
    expect(v(i1[0], 'Observação')).toContain('Crédito em regra, nas condições da lei: Crédito amplo');
    // Sem enquadramento concluído (célula "revisar", finalidade não confirmada): fora da aba, contados no Resumo por motivo.
    expect(por('000456')).toEqual([]);
    expect(por('0789')).toEqual([]);
    const resumo = textoDaAba(wb.getWorksheet('Resumo da entrega')!);
    for (const x of ['Itens sem enquadramento nesta entrega', 'Aguardando revisão (NCM ou finalidade mudou depois da decisão)', 'Finalidade não confirmada', '"Devolução" só aparece quando o tratamento difere do da aquisição']) expect(resumo, x).toContain(x);
  });

  it('cenários (liberada): devolução igual à aquisição é omitida e a contagem vai ao Resumo', async () => {
    const d = dadosBase(true);
    const c = d.casos.find((x) => x.id === 'c-trib')! as Linha;
    c.evidencia = [{ rotulo: 'Compra para revenda', valor: 'EM_REGRA: Crédito amplo' }, { rotulo: 'Devolução', valor: 'EM_REGRA: Crédito amplo' }];
    const wb = await abrir(await svc().gerarExcel(d));
    const ws = wb.getWorksheet('Cenários tributários')!;
    expect(valores(ws, 'Cenário')).toEqual(['Aquisição (insumo de produção)']);
    expect(textoDaAba(wb.getWorksheet('Resumo da entrega')!)).toContain('(1 linha(s) iguais omitidas)');
    // A revisão mostra todas.
    const rev = (await abrir(await svc().gerarExcel({ ...d, liberada: false, versao: null }))).getWorksheet('Cenários tributários')!;
    expect(valores(rev, 'Cenário').filter((x) => x === 'Devolução').length).toBeGreaterThan(0);
  });

  it('revisão inclui o proposto com marca visível e fundo amarelo; liberada não tem coluna Marca', async () => {
    const rev = await abrir(await svc().gerarExcel(dadosBase(false)));
    const ws = rev.getWorksheet('Cenários tributários')!;
    expect(cabecalhos(ws)).toContain('Marca');
    const linhas: ExcelJS.Row[] = []; ws.eachRow((r, i) => { if (i > 1 && r.getCell(1).value === '000456') linhas.push(r); });
    expect(linhas[0].getCell(coluna(ws, 'cClassTrib')).value).toBe('200030');
    expect(linhas[0].getCell(coluna(ws, 'Enquadramento legal (texto da lei)')).value).toBe('Sementes e mudas');
    expect(linhas[0].getCell(coluna(ws, 'Marca')).value).toBe('Proposto — não aprovado');
    expect((linhas[0].getCell(1).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFFF2CC');
    const cad = rev.getWorksheet('Cadastro saneado')!;
    expect(valores(cad, 'Marca')).toEqual([null, 'Proposto — não aprovado', null]);
    expect(String(valores(cad, 'Propostas não aprovadas')[1])).toContain('Tratamento tributário: cClassTrib: 200030');
    expect(textoDaAba(rev.getWorksheet('Resumo da entrega')!)).toContain('EXPORTAÇÃO PARA REVISÃO');
    const lib = await abrir(await svc().gerarExcel(dadosBase(true)));
    expect(cabecalhos(lib.getWorksheet('Cadastro saneado')!)).not.toContain('Marca');
    expect(textoDaAba(lib.getWorksheet('Resumo da entrega')!)).not.toContain('EXPORTAÇÃO PARA REVISÃO');
  });

  it('os dois formatos de linha (foto × tabela) geram o mesmo cadastro', async () => {
    const a = await abrir(await svc().gerarExcel({ ...dadosBase(true, 'foto'), liberada: true }));
    const b = await abrir(await svc().gerarExcel({ ...dadosBase(true, 'tabela'), liberada: true }));
    const c = (w: ExcelJS.Workbook) => { const ws = w.getWorksheet('Cadastro saneado')!; return ['Código', 'NCM', 'Grupo', 'Finalidade', 'Origem da finalidade', 'Ativo', 'Tratamento tributário', 'Descrição (como era)', 'Descrição (como ficou)', 'Situação do item'].map((n) => valores(ws, n)); };
    expect(c(a)).toEqual(c(b));
  });

  it('de/para = mapa de unificações: por item que morre, o que fica, saldos, ação no ERP e alertas; liberada exclui o só proposto', async () => {
    const base = dadosBase(true);
    (base.itens[0].trabalho as Linha).saldo = 10; (base.itens[1].trabalho as Linha).saldo = 4;
    const lib = await abrir(await svc().gerarExcel(base));
    const ws = lib.getWorksheet('De para e equivalências')!;
    // Liberada: sem as colunas totalmente vazias (estabelecimento único, nenhum alerta).
    expect(cabecalhos(ws)).toEqual(['Tipo de registro', 'Código que sai', 'Descrição (código que sai)', 'Unidade (código que sai)', 'Saldo (código que sai)',
      'Código que fica', 'Descrição (código que fica)', 'Unidade (código que fica)', 'Saldo atual (código que fica)', 'Saldo que entra', 'Saldo consolidado', 'Situação', 'Ação no ERP',
      'Início da vigência', 'Justificativa', 'Responsável', 'Data da decisão', 'Executado no ERP']);
    expect(valores(ws, 'Executado no ERP')).toEqual(['Não']);
    // O vínculo gravado pela unificação aprovada não vira uma segunda linha; a equivalência só proposta fica fora da entrega liberada.
    expect(valores(ws, 'Tipo de registro')).toEqual(['Unificação de códigos']);
    expect(valores(ws, 'Código que sai')).toEqual(['000456']);
    expect(ws.getRow(2).getCell(2).numFmt).toBe('@');
    expect(valores(ws, 'Código que fica')).toEqual(['00123']);
    expect(valores(ws, 'Descrição (código que sai)')).toEqual(['SEMENTE SOJA']);
    expect([valores(ws, 'Saldo (código que sai)')[0], valores(ws, 'Saldo atual (código que fica)')[0], valores(ws, 'Saldo que entra')[0], valores(ws, 'Saldo consolidado')[0]]).toEqual([4, 10, 4, 14]);
    expect(valores(ws, 'Situação')).toEqual(['Aprovada']);
    expect(valores(ws, 'Ação no ERP')).toEqual(['Transferir o saldo de 000456 para 00123 e inativar 000456']);
    expect(valores(ws, 'Início da vigência')[0]).toBeInstanceOf(Date);
    expect((valores(ws, 'Início da vigência')[0] as Date).toISOString().slice(0, 10)).toBe('2027-01-01'); // a data do vínculo
    expect(cabecalhos(ws)).not.toContain('Alerta de coerência');
    expect(cabecalhos(ws)).not.toContain('Marca');
    expect(textoDaAba(ws)).not.toMatch(/\[caso:|PROPOR_|c-dup/);
    const rev = await abrir(await svc().gerarExcel(dadosBase(false)));
    const wr = rev.getWorksheet('De para e equivalências')!;
    expect(valores(wr, 'Situação')).toEqual(['Aprovada', 'Proposta']);
    expect(valores(wr, 'Tipo de registro')[1]).toBe('Equivalência (nenhum código sai)');
    expect(valores(wr, 'Marca')).toEqual([null, 'Proposto — não aprovado']);
    // Sem saldo na base: a linha avisa e a ação manda conferir no ERP.
    expect(String(valores(wr, 'Alerta de coerência')[0])).toContain('Saldo de 000456 não informado na base');
    expect(valores(wr, 'Saldo consolidado')[0]).toBeNull();
  });

  it('SPED: colunas do plano, datas como data; liberada exclui impacto de caso não aprovado', async () => {
    const lib = await abrir(await svc().gerarExcel(dadosBase(true)));
    const ws = lib.getWorksheet('Impactos no SPED')!;
    expect(cabecalhos(ws)).toEqual(['Obrigação', 'Competência', 'Versão do leiaute', 'Registro', 'Campo', 'Valor original', 'Valor proposto', 'Motivo', 'Evidência', 'Início', 'Avaliar períodos anteriores', 'Responsável', 'Tipo de ajuste', 'Camada / caso']);
    expect(ws.rowCount).toBe(2);
    expect(valores(ws, 'Obrigação')).toEqual(['EFD ICMS/IPI']);
    expect(valores(ws, 'Versão do leiaute')).toEqual(['não confirmado']);
    expect(valores(ws, 'Tipo de ajuste')).toEqual(['Ajuste cadastral futuro']);
    const ini = valores(ws, 'Início')[0] as Date;
    expect(ini).toBeInstanceOf(Date);
    expect(ini.toISOString().slice(0, 10)).toBe('2027-01-01');
    expect(ws.getRow(2).getCell(coluna(ws, 'Início')).numFmt).toBe('dd/mm/yyyy');
    const rev = await abrir(await svc().gerarExcel(dadosBase(false)));
    const wr = rev.getWorksheet('Impactos no SPED')!;
    expect(wr.rowCount).toBe(3);
    expect(valores(wr, 'Marca')).toEqual([null, 'Proposto — não aprovado']);
    expect(valores(wr, 'Tipo de ajuste')[1]).toBe('Impacto em escrituração já entregue');
  });

  it('pendências e histórico (liberada): pendências por tipo e grupo, histórico só das decisões aprovadas', async () => {
    const wb = await abrir(await svc().gerarExcel(dadosBase(true)));
    const ws = wb.getWorksheet('Pendências e histórico')!;
    // 3 casos abertos (c-trib2 em Sementes; c-ncm e c-dup2 em Sementes e Adubos) = 5 linhas tipo × grupo + 2 alterações aprovadas.
    expect(valores(ws, 'Registro')).toEqual(['Pendência', 'Pendência', 'Pendência', 'Pendência', 'Pendência', 'Histórico', 'Histórico']);
    expect(cabecalhos(ws)).not.toContain('ID do caso');
    const ncm = []; ws.eachRow((r, i) => { if (i > 1 && r.getCell(coluna(ws, 'Tipo')).value === 'Informação insuficiente para o NCM') ncm.push([r.getCell(coluna(ws, 'Grupo')).value, r.getCell(coluna(ws, 'Itens')).value, r.getCell(coluna(ws, 'Situação')).value]); });
    expect(ncm).toEqual(expect.arrayContaining([['Sementes', 1, 'Aguardando informação: 1'], ['Adubos', 1, 'Aguardando informação: 1']]));
    const hist = ws.getRow(7);
    expect(hist.getCell(coluna(ws, 'Código do item (ou exemplos)')).value).toBe('00123');
    expect(hist.getCell(coluna(ws, 'Campo')).value).toBe('Descrição');
    expect(hist.getCell(coluna(ws, 'Antes')).value).toBe('ADUBO NPK 04148 SC50');
    expect(hist.getCell(coluna(ws, 'Depois')).value).toBe('ADUBO NPK 04-14-08 SC 50KG');
    expect(hist.getCell(coluna(ws, 'Fundamento')).value).toBe('Padrão de nomes');
    expect(hist.getCell(coluna(ws, 'Responsável')).value).toBe('ana@fal.test');
    expect(hist.getCell(coluna(ws, 'Data')).value).toBeInstanceOf(Date);
    // Data no relógio de São Paulo: 10/11/2026 12:00 UTC = 09:00 em Brasília.
    expect((hist.getCell(coluna(ws, 'Data')).value as Date).toISOString()).toBe('2026-11-10T09:00:00.000Z');
  });

  it('pendências e histórico (revisão): completo, um caso por linha e todas as decisões', async () => {
    const d = dadosBase(false);
    d.decisoes.push({ id: 'd3', projeto_id: 'P1', item_id: 'i2', caso_id: 'c-dup2', campo: 'caso:c-dup2', antes: null, depois: 'REJEITADO', fundamento: 'Não é o mesmo', usuario: 'ana@fal.test', tipo: 'rejeitar', quando: new Date('2026-11-12T12:00:00Z') });
    const ws = (await abrir(await svc().gerarExcel(d))).getWorksheet('Pendências e histórico')!;
    expect(valores(ws, 'Registro')).toEqual(['Pendência', 'Pendência', 'Pendência', 'Histórico', 'Histórico', 'Histórico']);
    expect(valores(ws, 'Situação / tipo').slice(0, 3)).toEqual(['Proposto', 'Aguardando informação', 'Proposto']);
    expect(cabecalhos(ws)).toContain('ID do caso');
    // Na liberada, a rejeição não entra no histórico.
    const lib = (await abrir(await svc().gerarExcel({ ...d, liberada: true, versao: { numero: 2, rotulo: 'Entrega 1', criadaEm: '2026-11-20T15:00:00.000Z' } }))).getWorksheet('Pendências e histórico')!;
    expect(valores(lib, 'Registro').filter((x) => x === 'Histórico')).toHaveLength(2);
  });

  it('resumo: cobertura por camada, totais por situação, exclusões e pendências da entrega liberada', async () => {
    const wb = await abrir(await svc().gerarExcel(dadosBase(true)));
    const ws = wb.getWorksheet('Resumo da entrega')!;
    const t = textoDaAba(ws);
    for (const s of ['Agropecuária Teste Ltda', 'Versão 2 — Entrega 1', 'SAP B1 10', 'Situação por camada (itens)', 'Tratamento tributário', 'Total (item × camada)', 'Tipos de pendência', 'Linhas de impacto no SPED excluídas', 'Nenhum', 'Analisados (%)']) expect(t).toContain(s);
    // Datas como texto dd/mm/aaaa (São Paulo): data-base, liberação (com hora) e confirmação das atividades.
    for (const s of ['31/12/2026', '20/11/2026 12:00', 'ana@fal.test em 01/11/2026']) expect(t, s).toContain(s);
    expect(t).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // Na entrega liberada, o Resumo não conta casos.
    expect(t).not.toContain('Casos por camada');
    let achou = false;
    ws.eachRow((r) => {
      if (r.getCell(1).value === 'Tratamento tributário' && r.getCell(2).value === 3) {
        achou = true; expect(r.getCell(3).value).toBe(1); expect(r.getCell(5).value).toBe(1); expect(r.getCell(6).value).toBe(1); expect(r.getCell(8).value as number).toBeCloseTo(2 / 3);
        expect(r.getCell(8).numFmt).toBe('0.0%'); expect(r.getCell(2).numFmt).toBe('#,##0');
      }
      if (r.getCell(1).value === 'Itens com pendência') { expect(r.getCell(2).value).toBe(2); expect(r.getCell(2).numFmt).toBe('#,##0'); } // o mesmo número do relatório
    });
    expect(achou).toBe(true);
  });

  it('nenhuma aba contém a palavra "minuta"', async () => {
    for (const lib of [true, false]) {
      const wb = await abrir(await svc().gerarExcel(dadosBase(lib)));
      for (const ws of wb.worksheets) expect(textoDaAba(ws)).not.toMatch(/minuta|rascunho de vers/i);
    }
  });
});

describe('Relatório de fechamento (PDF)', () => {
  it('estrutura: seções, números reais, comentário por camada e aviso', () => {
    const doc = montarRelatorio(dadosBase(true));
    expect(doc.secoes.map((s) => s.titulo)).toEqual(['Resultado da entrega', 'Pendências', 'Itens recebidos e analisados', 'Situação por camada (itens)', 'Revisões executadas', 'Comentário por aspecto tratado', 'Impacto nas obrigações (SPED)', 'Limitações', 'Versão liberada']);
    // Abre com o resultado em itens.
    const res = doc.secoes[0];
    expect(res.destaques?.map((d) => [d.rotulo, d.valor])).toEqual([['Itens a inativar', '0'], ['Unificações', '1'], ['Finalidade definida', '0']]);
    expect(res.itens).toEqual(expect.arrayContaining(['1 unificação: 1 código deixa de existir, com o saldo levado ao código que fica.', '1 descrição padronizada.']));
    // Pendências em itens e por tipo.
    const pend = doc.secoes[1];
    expect(pend.paragrafos![0]).toMatch(/^2 itens têm alguma pendência \(66,7% do cadastro\), em 3 tipos; 2 itens dependem de informação do cliente/);
    expect(pend.tabela!.linhas.find((l) => l[0] === 'Informação insuficiente para o NCM')).toEqual(['Informação insuficiente para o NCM', 'Validar NCM', '2', '2', '2']);
    expect(JSON.stringify(doc)).not.toMatch(/casos aprovados|casos pendentes/i);
    expect(doc.secoes[2].destaques?.[0]).toMatchObject({ rotulo: 'Itens recebidos', valor: '3' });
    expect(doc.secoes[3].tabela!.linhas.find((l) => l[0] === 'Tratamento tributário')).toEqual(['Tratamento tributário', '66,7%', '0', '1', '2', '0']);
    const coment = doc.secoes[5].paragrafos!;
    expect(coment).toHaveLength(8);
    expect(coment.find((c) => c.startsWith('Tratamento tributário'))).toContain('2 de 3 itens analisados (66,7%)');
    expect(coment.find((c) => c.startsWith('Duplicidades'))).toContain('1 vínculo de código antigo e novo registrado');
    const sped = doc.secoes[6];
    expect(sped.tabela!.linhas[0]).toEqual(['Ajuste cadastral futuro', '1', 'EFD ICMS/IPI', '0200']);
    expect(sped.tabela!.linhas[2][0]).toBe('Impacto em escrituração já entregue');
    expect(doc.aviso).toMatch(/não constitui parecer/);
    expect(JSON.stringify(doc)).not.toMatch(/minuta|rascunho de vers/i);
    expect(doc.secoes.length).toBeLessThanOrEqual(20);
  });

  it('gera PDF real com os números certos (texto extraído do PDF)', async () => {
    const pdf = await svc().gerarRelatorioPdf(dadosBase(true));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const t = await textoDoPdf(pdf);
    for (const s of ['Relatório de fechamento', 'Agropecuária Teste Ltda', 'Versão 2: Entrega 1', 'Resultado da entrega', 'cadastro.xlsx', 'Comentário por aspecto tratado', 'Impacto nas obrigações (SPED)', 'Ajuste cadastral futuro', 'não constitui parecer', 'Data-base 31/12/2026', 'liberada em 20/11/2026']) expect(t, s).toContain(s);
    expect(t).toMatch(/itens a inativar/i);
    expect(t.indexOf('Resultado da entrega')).toBeLessThan(t.indexOf('Itens recebidos e analisados'));
    expect(t).not.toMatch(/minuta/i);
  }, 60000);

  it('recusa gerar o relatório sem versão liberada', async () => {
    await expect(svc().gerarRelatorioPdf(dadosBase(false))).rejects.toThrow(/versão liberada/);
  });
});

describe('nomes de arquivo e controller', () => {
  it('nomes sem acento, sem espaço e sem "minuta"', () => {
    expect(fatiaDoNome('Agropecuária Crestani Ltda.')).toBe('agropecuaria-crestani-ltda');
    expect(fatiaDoNome('')).toBe('cliente');
    expect(nomeDoExcel('Agropecuária Teste Ltda', { numero: 2 })).toBe('saneamento-estoques_agropecuaria-teste-ltda_entrega-v2.xlsx');
    expect(nomeDoExcel('Agropecuária Teste Ltda', null, new Date('2026-11-25T12:00:00Z'))).toBe('saneamento-estoques_agropecuaria-teste-ltda_revisao_25-11-2026.xlsx');
    // 23h50 de 26/11 em São Paulo (02h50 de 27/11 UTC) ainda é 26/11.
    expect(nomeDoExcel('Teste', null, new Date('2026-11-27T02:50:00Z'))).toBe('saneamento-estoques_teste_revisao_26-11-2026.xlsx');
    expect(nomeDaPolitica('Agropecuária Crestani Ltda', { numero: 3 })).toBe('politica-estoques_agropecuaria-crestani-ltda_v3.pdf');
    expect(nomeDaPolitica('Crestani', null, new Date('2026-11-27T02:50:00Z'))).toBe('politica-estoques_crestani_revisao_26-11-2026.pdf');
    expect(nomeDoRelatorio('Teste', { numero: 3 })).toBe('relatorio-fechamento_teste_v3.pdf');
    for (const n of [nomeDoExcel('x', { numero: 1 }), nomeDoExcel('x', null), nomeDoRelatorio('x', { numero: 1 })]) expect(n).not.toMatch(/minuta/i);
  });

  it('controller devolve StreamableFile com tipo e nome certos; sem versaoId = revisão', async () => {
    const chamadas: unknown[] = [];
    const fake = {
      excel: async (id: string, v?: string) => { chamadas.push(['excel', id, v]); return { buffer: Buffer.from('x'), nome: v ? 'a_entrega-v1.xlsx' : 'a_revisao_2026-11-25.xlsx' }; },
      relatorio: async (id: string, v?: string) => { chamadas.push(['relatorio', id, v]); return { buffer: Buffer.from('%PDF'), nome: 'relatorio-fechamento_a_v1.pdf' }; },
    };
    const c = new EntregaveisController(fake as never);
    const rev = await c.excel('P1');
    expect(rev.getHeaders()).toMatchObject({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'attachment; filename="a_revisao_2026-11-25.xlsx"' });
    const lib = await c.excel('P1', 'V1');
    expect(lib.getHeaders().disposition).toContain('a_entrega-v1.xlsx');
    const pdf = await c.relatorio('P1', '');
    expect(pdf.getHeaders()).toMatchObject({ type: 'application/pdf', disposition: 'attachment; filename="relatorio-fechamento_a_v1.pdf"' });
    expect(chamadas).toEqual([['excel', 'P1', undefined], ['excel', 'P1', 'V1'], ['relatorio', 'P1', undefined]]);
  });
});

describe('fluxo completo com o banco falso (versões reais)', () => {
  it('versão liberada e revisão saem do SanVersoesService e viram Excel e PDF', async () => {
    const base = dadosBase(false);
    const { prisma } = criarPrismaFalso({
      empresa: [{ id: 'E1', razao_social: 'Agropecuária Teste Ltda', cnpj_cpf: '00000000000100' }],
      projetoDiagnostico: [{ id: 'D1', nome: 'Saneamento 2026' }],
      sanProjeto: [{ id: 'P1', diagnostico_id: 'D1', empresa_id: 'E1', data_base: new Date('2026-12-31T00:00:00Z'), erp: 'SAP B1', estabelecimentos: [], modulos: { conciliacao: false }, versao: 1 }],
      sanItem: itensTabela().map((i) => ({ ...i, createdAt: new Date('2026-11-01T00:00:00Z') })),
      sanCelula: base.celulas.map((c, k) => ({ id: `ce${k}`, projeto_id: 'P1', ...c })),
      sanCaso: base.casos.map((c) => ({ ...c, chave: String(c.id), createdAt: new Date('2026-11-09T12:00:00Z') })),
      sanDecisao: base.decisoes, sanImpactoSped: base.impactosSped, sanVinculoCodigo: base.vinculos, sanImportacao: base.importacoes,
    });
    const versoes = new SanVersoesService(prisma as never);
    const s = new EntregaveisService(new PdfService(), versoes, prisma as never);
    const v = await versoes.criar('P1', { rotulo: 'Entrega 1' }, { email: 'ana@fal.test' });
    const x = await s.excel('P1', v.id);
    expect(x.nome).toBe('saneamento-estoques_agropecuaria-teste-ltda_entrega-v1.xlsx');
    const wb = await abrir(x.buffer);
    expect(valores(wb.getWorksheet('Cadastro saneado')!, 'Código')).toEqual(['000456', '00123', '0789']);
    const r = await s.excel('P1');
    expect(r.nome).toMatch(/_revisao_\d{2}-\d{2}-\d{4}\.xlsx$/);
    const pdf = await s.relatorio('P1');
    expect(pdf.nome).toBe('relatorio-fechamento_agropecuaria-teste-ltda_v1.pdf');
    expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
    await expect(s.relatorio('P1', 'inexistente')).rejects.toThrow();
  });

  it('sem versão liberada o relatório é recusado', async () => {
    const { prisma } = criarPrismaFalso({ sanProjeto: [{ id: 'P1', diagnostico_id: 'D1', empresa_id: 'E1', data_base: new Date(), estabelecimentos: [], modulos: {}, versao: 1 }] });
    const s = new EntregaveisService(new PdfService(), new SanVersoesService(prisma as never), prisma as never);
    await expect(s.relatorio('P1')).rejects.toThrow(/Libere uma versão/);
  });
});

describe('30 mil linhas', () => {
  it('gera o Excel de 30 mil itens em fluxo, sem estourar a memória', async () => {
    const N = 30_000;
    const itens: Linha[] = []; const celulas: Linha[] = []; const decisoes: Linha[] = [];
    for (let k = 0; k < N; k++) {
      const id = `it${k}`; const codigo = String(k).padStart(8, '0');
      const fin = k % 3 ? 'REVENDA' : 'INSUMO_PRODUCAO';
      itens.push({ id, codigo, estabelecimento: '', trabalho: trab({ descricao: `PRODUTO ${k} EMBALAGEM 20KG`, ncm: k % 2 ? '01012100' : '31052000', finalidade: fin, campos: { cClassTrib: '200003', cst: '200', enquadramentoLegal: 'Texto da lei do enquadramento', artigo: 'LC 214/2025, Anexo IX' } }), grupo: `Grupo ${k % 40}`, finalidade: fin, tambemUsadoComo: [], conjunto: null, ativo: true });
      for (const c of CAMADAS_TESTE) celulas.push({ item_id: id, camada: c, situacao: k % 5 ? 'APROVADO' : 'SEM_PROBLEMA', revisar: false, caso_id: null });
      if (k % 3 === 0) decisoes.push({ item_id: id, caso_id: null, campo: 'descricao', antes: `P ${k}`, depois: `PRODUTO ${k}`, fundamento: 'Padrão', usuario: 'ana', tipo: 'aprovar', quando: new Date('2026-11-10T12:00:00Z') });
    }
    const dados = { ...dadosBase(true), itens, celulas, decisoes, casos: [], impactosSped: [], vinculos: [] } as DadosEntrega;
    (globalThis as { gc?: () => void }).gc?.();
    const antes = process.memoryUsage();
    const t0 = performance.now();
    const buf = await svc().gerarExcel(dados);
    const seg = (performance.now() - t0) / 1000;
    const depois = process.memoryUsage();
    // eslint-disable-next-line no-console
    console.log(`[30k] ${seg.toFixed(1)} s · arquivo ${(buf.length / 1048576).toFixed(1)} MB · heap +${Math.round((depois.heapUsed - antes.heapUsed) / 1048576)} MB · rss ${Math.round(depois.rss / 1048576)} MB`);
    expect(buf.length).toBeGreaterThan(1_000_000);
    expect(seg).toBeLessThan(120);
    // confere o arquivo com o leitor em fluxo do próprio exceljs: primeira e última linha da aba de cadastro
    const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buf) as never, { sharedStrings: 'ignore', worksheets: 'emit', styles: 'ignore', hyperlinks: 'ignore', entries: 'ignore' });
    const contagens: number[] = []; let primeiro = ''; let ultimo = '';
    for await (const ws of leitor as unknown as AsyncIterable<AsyncIterable<{ getCell: (n: number) => { value: unknown } }>>) {
      let c = 0; let p = ''; let u = '';
      // Cadastro saneado (carga no ERP, sem a logo): linha 1 = títulos, linha 2 = primeiro item.
      for await (const row of ws) { c++; if (c === 2) p = String(row.getCell(1).value); u = String(row.getCell(1).value); }
      contagens.push(c);
      if (c === N + 1 && !primeiro) { primeiro = p; ultimo = u; }
    }
    expect(contagens).toContain(N + 1);
    expect(primeiro).toBe('00000000');
    expect(ultimo).toBe('00029999');
  }, 240_000);
});

describe('revisão fiscal nos entregáveis (achados 2, 4, 9 e 10)', () => {
  it('achado 4: exceção aprovada mostra o enquadramento e o artigo dela ("não confirmado"), não os herdados que ficaram no cadastro', async () => {
    const d = dadosBase(true);
    const c = d.casos.find((x) => x.id === 'c-trib')! as Linha;
    Object.assign(c, { tipo: 'EXCECAO_MANUAL', proposta: { cClassTrib: '200003', cst: '200', origem: 'EXCECAO' }, justificativa: 'Produto de outro item do anexo' });
    const ws = (await abrir(await svc().gerarExcel(d))).getWorksheet('Cenários tributários')!;
    const linha = ws.getRow(2);
    expect(linha.getCell(1).value).toBe('00123');
    expect(linha.getCell(coluna(ws, 'Enquadramento legal (texto da lei)')).value).toBe('não confirmado');
    expect(linha.getCell(coluna(ws, 'Artigo / anexo')).value).toBe('não confirmado');
    expect(linha.getCell(coluna(ws, 'Origem')).value).toBe('Exceção do item');
  });
  it('achado 2: sem a última competência entregue, o Resumo e o PDF dizem "não avaliado"; com ela, contam as linhas', async () => {
    const d = dadosBase(true);
    d.impactosSped = d.impactosSped.filter((i) => i.tipo_ajuste !== 'ESCRITURACAO_ENTREGUE');
    const resumo = async (x: DadosEntrega) => textoDaAba((await abrir(await svc().gerarExcel(x))).getWorksheet('Resumo da entrega')!);
    expect(await resumo(d)).toContain('não avaliado (competência entregue não informada)');
    expect(JSON.stringify(montarRelatorio(d))).toContain('Escrituração já entregue: não avaliado (competência entregue não informada).');
    d.projeto = { ...d.projeto, parametros: { competenciaEntregue: '2026-10' } };
    expect(await resumo(d)).toContain('nenhuma linha (última competência entregue informada: 10/2026)');
    expect(await resumo(d)).toContain('10/2026');
  });
  it('achado 10: o material do cliente não traz o código interno do tipo de caso', async () => {
    const wb = await abrir(await svc().gerarExcel(dadosBase(false)));
    const imp = textoDaAba(wb.getWorksheet('Impactos no SPED')!);
    const pend = textoDaAba(wb.getWorksheet('Pendências e histórico')!);
    for (const t of [imp, pend]) expect(t).not.toMatch(/ENQUADRAMENTO_CONJUNTO|DESCRICAO_FORA_DO_PADRAO|NCM_INFO_INSUFICIENTE|APRESENTACOES_DISTINTAS/);
    expect(imp).toContain('Tratamento tributário · Enquadramento do conjunto');
    expect(pend).toContain('Informação insuficiente para o NCM');
  });
});
