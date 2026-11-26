import { writeFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import type { Procedimento } from '../../diretrizes/tipos';
import { GRUPOS_CRESTANI, PROCEDIMENTOS_CRESTANI, REGRAS_CRESTANI, dadosCrestani, quadroDe } from './__fixtures__/crestani';
import { MARGEM } from './estilo';
import { gerarPdfPolitica, renderizarPolitica, type ResultadoPolitica } from './pdf';
import { dataBr, juntar, limpar } from './texto';
import { textoGrupos, topicosDaRegra } from './topicos';
import type { DadosPolitica } from './tipos';

type Item = { str?: string };
async function paginas(pdf: Buffer): Promise<string[][]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs' as string)) as unknown as { getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Item[] }> }> }> } };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const r: string[][] = [];
  for (let i = 1; i <= doc.numPages; i++) r.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => (x.str ?? '').trim()).filter(Boolean));
  return r;
}
/** Texto corrido do PDF (linhas quebradas viram espaço). */
const corrido = (ps: string[][]) => ps.flat().join(' ').replace(/\s+/g, ' ');

const ALTURA_A4 = 841.89;
const LARGURA_A4 = 595.28;
const todasAprovadas = () => REGRAS_CRESTANI.map((r) => ({ ...r, situacao: 'APROVADA' as const, aprovadaPor: 'Consultor', aprovadaEm: '2026-11-20' }));
const aprovadaTotal = (): DadosPolitica => {
  const regras = todasAprovadas();
  return dadosCrestani({ regras, ...quadroDe(regras, GRUPOS_CRESTANI), identificacao: { ...dadosCrestani().identificacao, situacao: 'APROVADA', aprovador: 'Consultor responsável' } });
};

/** Confere que nenhuma forma sai da página nem invade o cabeçalho/rodapé, e que formas da mesma página não se sobrepõem. */
function conferirGeometria(r: ResultadoPolitica) {
  for (const f of r.fluxogramas) {
    for (const n of f.nos) {
      const ctx = `${f.titulo} ${n.tipo} ${n.numero ?? ''} p${n.pagina}`;
      expect(n.x, ctx).toBeGreaterThanOrEqual(MARGEM);
      expect(n.x + n.w, ctx).toBeLessThanOrEqual(LARGURA_A4 - MARGEM + 0.01);
      expect(n.y, ctx).toBeGreaterThanOrEqual(n.pagina === 0 ? 90 : 56);
      expect(n.y + n.h, ctx).toBeLessThanOrEqual(ALTURA_A4 - 56);
      expect(n.h, ctx).toBeGreaterThan(0);
    }
    for (const a of f.nos) for (const b of f.nos) {
      if (a === b || a.pagina !== b.pagina) continue;
      const sobrepoe = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(sobrepoe, `${f.titulo}: ${a.tipo} ${a.numero} x ${b.tipo} ${b.numero}`).toBe(false);
    }
    // ordem: cada etapa começa abaixo da anterior (ou numa página seguinte)
    const principais = f.nos.filter((n) => n.tipo !== 'desvio');
    for (let i = 1; i < principais.length; i++) {
      const a = principais[i - 1]; const b = principais[i];
      expect(b.pagina > a.pagina || (b.pagina === a.pagina && b.y >= a.y + a.h), `${f.titulo} etapa ${i}`).toBe(true);
    }
  }
}

describe('Política: utilidades de texto', () => {
  it('lista em português, datas e caracteres fora da fonte', () => {
    expect(juntar(['A'])).toBe('A');
    expect(juntar(['A', 'B'])).toBe('A e B');
    expect(juntar(['A', 'B', 'C'])).toBe('A, B e C');
    expect(dataBr('2026-12-01')).toBe('01/12/2026');
    expect(dataBr('2026-11-26T02:00:00Z')).toBe('25/11/2026');
    expect(dataBr(null)).toBeNull();
    expect(limpar('A → B ≤ 3 ✓')).toBe('A -> B <= 3 ');
    expect(limpar('Ação'.normalize('NFD'))).toBe('Ação');
    expect(textoGrupos({ todos: false, grupos: ['HERBICIDAS', 'FUNGICIDAS', 'HERBICIDAS', 'INSETICIDAS'] })).toBe('FUNGICIDAS, HERBICIDAS e INSETICIDAS');
  });

  it('tópicos por aspecto, sem código interno', () => {
    const texto = REGRAS_CRESTANI.map((r) => { const t = topicosDaRegra(r.conteudo); return [...t.topicos, ...t.tabelas.flatMap((x) => [x.titulo, ...x.cabecalho, ...x.linhas.flat()])].join(' | '); }).join(' || ');
    for (const proibido of ['MENOR_PRATICA', 'LEIAUTE_OFICIAL', 'SUGERIR_ABREVIACAO', 'SOLICITAR_REVISAO', 'QUANDO_APLICAVEL', 'PRINCIPIO_ATIVO', 'USO_INTERNO', 'CAMPO_PROPRIO', 'undefined', 'null', 'NaN']) {
      expect(texto, proibido).not.toContain(proibido);
    }
    const n01 = topicosDaRegra(REGRAS_CRESTANI[0].conteudo);
    expect(n01.topicos).toContain('Estrutura: nome + referência + marca + apresentação + complemento');
    expect(n01.topicos).toContain('Componentes obrigatórios: nome e referência');
    expect(n01.topicos).toContain('Escrita em maiúsculas');
    const n03 = topicosDaRegra(REGRAS_CRESTANI.find((r) => r.codigo === 'N03')!.conteudo);
    expect(n03.topicos).toContain('Referência obrigatória');
    const l01 = topicosDaRegra(REGRAS_CRESTANI.find((r) => r.codigo === 'L01')!.conteudo);
    expect(l01.topicos[0]).toBe('Limite efetivo da descrição: 120 caracteres (NF-e, xProd)');
    expect(l01.tabelas[0].linhas.map((l) => l[2])).toEqual(['120', 'não confirmado', '100 (não confirmado)']);
    const u01 = topicosDaRegra(REGRAS_CRESTANI.find((r) => r.codigo === 'U01')!.conteudo);
    expect(u01.tabelas[0].linhas).toContainEqual(['1 SC = 22,5 KG', 'Produto 310877']);
    expect(u01.tabelas[0].linhas).toContainEqual(['1 TON = 1.000 KG', 'Todo o grupo']);
  });

  it('limite do ERP acima do leiaute oficial gera alerta e não conta', () => {
    const t = topicosDaRegra({
      aspecto: 'LIMITES', linhas: [
        { destino: 'NF-e', campo: 'xProd', campoItem: 'descricao', limite: 120, origem: 'LEIAUTE_OFICIAL', referencia: 'MOC', confirmado: true, tratamento: 'SUGERIR_ABREVIACAO', preservar: [] },
        { destino: 'ERP X', campo: 'Nome', campoItem: 'descricao', limite: 200, origem: 'ERP', referencia: 'Manual', confirmado: true, tratamento: 'SUGERIR_ABREVIACAO', preservar: [] },
      ],
    });
    expect(t.topicos[0]).toBe('Limite efetivo da descrição: 120 caracteres (NF-e, xProd)');
    expect(t.topicos).toContain('O ERP X aceita 200 caracteres em Nome, acima do leiaute oficial (120); vale o leiaute');
  });
});

describe('Política: PDF', () => {
  it('gera PDF válido com o conteúdo esperado (exemplo Crestani)', async () => {
    const pdf = await gerarPdfPolitica(dadosCrestani());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-8).toString()).toContain('%%EOF');
    if (process.env.POLITICA_EXEMPLO) writeFileSync(process.env.POLITICA_EXEMPLO, pdf);
    const ps = await paginas(pdf);
    const t = corrido(ps);
    for (const esperado of [
      'Política de estoques e cadastro de produtos', 'Agropecuária Crestani Ltda', 'Versão 2 — Onda 1', 'Vigência a partir de 01/12/2026',
      '1. Identificação', 'SAP Business One', 'DATA DE EMISSÃO', '26/11/2026', 'Pendente de aprovação',
      '2. Regras vigentes por aspecto', '2.1 Padrão de nomes', 'Regra N01 — Padrão geral de nomes', 'Aplicável a todos os grupos',
      'Regra N02 — Nomes de defensivos agrícolas', 'Aplicável aos grupos: FUNGICIDAS, HERBICIDAS, INSETICIDAS, OUTROS DEFENSIVOS e TRATAMENTO DE SEMENTES',
      'Estrutura: nome + referência + marca + apresentação + complemento', 'Escrita em maiúsculas', 'ABREVIAÇÕES APROVADAS', 'QUILOGRAMA', 'DIAM',
      'Observação: Nome comercial conforme o registro no MAPA.', 'Obrigatórios em todos os itens: princípio ativo, concentração, registro no MAPA e marca', 'Princípio ativo', 'Quando aplicável: produtos com mais de uma formulação registrada', 'Teor de umidade',
      'Unidade de estoque: a menor unidade prática de medida do item', 'Unidade de estoque: L, definida para o grupo', '1 CX = 12 UN',
      'Limite efetivo da descrição: 120 caracteres (NF-e, xProd)', 'não confirmado', 'Leiaute oficial', 'MOC da NF-e, Anexo I, campo I04',
      'cClassTrib', 'entrada, saída e uso interno',
      '3. Procedimentos', '3.5 Retirada e uso de materiais', 'FLUXOGRAMA', 'Início', 'Fim', 'ALMOXARIFADO', 'Não', 'Sim:',
      'Devolver o pedido ao requisitante com o motivo', 'REGRAS PRÁTICAS', 'EVIDÊNCIAS A GUARDAR', 'FUNDAMENTO', 'LC 214/2025, art. 57, § 3º',
      '4. Quadro de consulta por grupo', 'Grupo', 'Nomes', 'Atributos', 'Unidades', 'Limites', 'Fiscal', 'Sem regra', 'N03 (em aprovação)', 'F02 (em aprovação)',
      '5. Versão e pendências', 'liberada em 24/11/2026', 'GRUPOS SEM REGRA', 'LIMITES DE CARACTERES NÃO CONFIRMADOS', 'REGRAS EM APROVAÇÃO (2)',
      'Regra N03 — Nomes de peças de manutenção', 'Em aprovação: não vigente', 'InTAX por FAL Agro',
    ]) expect(t, esperado).toContain(esperado);
    for (const proibido of ['minuta', 'Minuta', 'MINUTA', 'undefined', 'null', 'NaN', '[object', 'MENOR_PRATICA', 'LEIAUTE_OFICIAL', 'QUANDO_APLICAVEL', 'Infinity']) {
      expect(t, proibido).not.toContain(proibido);
    }
    // a fonte não tem esses: nada vira caractere trocado
    expect(t).not.toMatch(/[→≤≥✓]/);
    expect(t).not.toMatch(/\bAPROVADA\b/);
  }, 60000);

  it('regra não aprovada não aparece como vigente: só na seção de pendências', async () => {
    const t = corrido(await paginas(await gerarPdfPolitica(dadosCrestani())));
    const pend = t.indexOf('5.2 Pendências');
    expect(pend).toBeGreaterThan(0);
    for (const c of ['Regra N03', 'Regra F02']) {
      expect(t.indexOf(c), c).toBeGreaterThan(pend);
      expect(t.split(c).length - 1, c).toBe(1);
    }
    // regra aprovada aparece uma vez, na seção 2
    expect(t.indexOf('Regra N01')).toBeLessThan(t.indexOf('3. Procedimentos'));
    expect(t.split('Regra N01 —').length - 1).toBe(1);
    // aspecto sem regra aprovada não fica vazio
    expect(t).not.toContain('Nenhuma regra aprovada neste aspecto');
  }, 60000);

  it('marca RASCUNHO conforme a situação', async () => {
    const tem = async (d: DadosPolitica) => corrido(await paginas(await gerarPdfPolitica(d))).includes('RASCUNHO');
    // regra em rascunho
    expect(await tem(dadosCrestani())).toBe(true);
    // tudo aprovado: sem marca
    const aprovada = aprovadaTotal();
    expect(await tem(aprovada)).toBe(false);
    // regras aprovadas, mas situação Rascunho
    expect(await tem({ ...aprovada, identificacao: { ...aprovada.identificacao, situacao: 'RASCUNHO' } })).toBe(true);
    // situação Aprovada, mas uma regra voltou a rascunho
    expect(await tem({ ...aprovada, regras: aprovada.regras.map((r, i) => (i === 0 ? { ...r, situacao: 'RASCUNHO' as const } : r)) })).toBe(true);
  }, 60000);

  it('marca RASCUNHO em todas as páginas; aprovada mostra o aprovador e "não há pendências" quando não há', async () => {
    const ps = await paginas(await gerarPdfPolitica(dadosCrestani()));
    for (const [i, p] of ps.entries()) expect(p.join(' '), `página ${i + 1}`).toContain('RASCUNHO');

    const d = aprovadaTotal();
    const semPend: DadosPolitica = { ...d, quadro: d.quadro.map((q) => ({ ...q, codigos: { NOMES: 'N01', ATRIBUTOS: 'A01', UNIDADES: 'U01', LIMITES: 'L01', FISCAL: 'F01' } })), pendencias: { gruposSemRegra: [] },
      regras: d.regras.map((r) => (r.conteudo.aspecto === 'LIMITES' ? { ...r, conteudo: { ...r.conteudo, linhas: r.conteudo.linhas.filter((l) => l.confirmado && l.limite != null) } } : r)) };
    const t = corrido(await paginas(await gerarPdfPolitica(semPend)));
    expect(t).toContain('SITUAÇÃO Aprovada');
    expect(t).toContain('aprovada por Consultor responsável');
    expect(t).toContain('Não há pendências');
    expect(t.split('Sem regra').length - 1).toBe(1); // só na explicação do quadro
  }, 60000);

  it('grupos juntos numa linha só por regra, sem repetir o texto por grupo', async () => {
    const t = corrido(await paginas(await gerarPdfPolitica(dadosCrestani())));
    const aplicaveis = t.match(/Aplicável a(os grupos:| todos os grupos)/g) ?? [];
    expect(aplicaveis.length).toBe(REGRAS_CRESTANI.length);
    expect(t).toContain('Aplicável aos grupos: COMBUSTIVEIS e LUBRIFICANTES');
    expect(t).toContain('Aplicável aos grupos: CORRETIVOS DE SOLO e FERTILIZANTES');
    expect(t).toContain('Aplicável aos grupos: PECAS DE MANUTENCAO');
  }, 60000);

  it('quadro com 200 grupos: todos presentes, em ordem, com o cabeçalho repetido em cada página', async () => {
    const grupos = Array.from({ length: 200 }, (_, i) => `GRUPO ${String(i + 1).padStart(3, '0')}`);
    const regras = todasAprovadas();
    const d = dadosCrestani({ regras, ...quadroDe(regras, grupos), procedimentos: [] });
    const r = await renderizarPolitica(d);
    const ps = await paginas(r.pdf);
    const comGrupo = ps.filter((p) => p.some((s) => /^GRUPO \d{3}$/.test(s)));
    expect(comGrupo.length).toBeGreaterThan(3);
    for (const p of comGrupo) {
      const cab = p.indexOf('Atributos');
      expect(cab).toBeGreaterThanOrEqual(0);
      expect(cab).toBeLessThan(p.findIndex((s) => /^GRUPO \d{3}$/.test(s)));
      expect(p).toContain('Fiscal');
    }
    const vistos = ps.flat().filter((s) => /^GRUPO \d{3}$/.test(s));
    expect(vistos).toEqual(grupos);
  }, 60000);

  it('fluxograma: procedimentos reais, sem forma cortada nem sobreposta', async () => {
    const r = await renderizarPolitica(dadosCrestani());
    expect(r.fluxogramas.map((f) => f.titulo)).toEqual(PROCEDIMENTOS_CRESTANI.map((p) => p.titulo));
    for (const [i, f] of r.fluxogramas.entries()) {
      const p = PROCEDIMENTOS_CRESTANI[i];
      expect(f.nos.filter((n) => n.tipo === 'passo' || n.tipo === 'decisao').map((n) => n.numero)).toEqual(p.fluxo.map((_, k) => k + 1));
      expect(f.nos.filter((n) => n.tipo === 'desvio').length).toBe(p.fluxo.filter((e) => e.tipo === 'decisao').length);
      expect(f.nos[0].tipo).toBe('inicio');
      expect(f.nos[f.nos.length - 1].tipo).toBe('fim');
    }
    conferirGeometria(r);
  }, 60000);

  it('fluxograma longo (15 etapas) e em qualquer posição da página: continua na página seguinte com indicação, sem cortar forma', async () => {
    const longo: Procedimento = {
      id: 'longo', titulo: 'Recebimento de mercadorias', objetivo: 'Conferir a mercadoria recebida contra o pedido e a nota fiscal antes da entrada no estoque.',
      fluxo: Array.from({ length: 15 }, (_, i) => (i % 4 === 2
        ? { tipo: 'decisao' as const, pergunta: `Conferência ${i + 1}: a quantidade e o produto recebidos conferem com o pedido de compra e com a nota fiscal?`, sim: 'seguir para a próxima conferência', nao: `Registrar a divergência ${i + 1} e avisar o comprador e o fornecedor` }
        : { tipo: 'passo' as const, texto: `Etapa ${i + 1}: conferir o documento, registrar a conferência no ERP e guardar o comprovante assinado pelo responsável pelo recebimento`, responsavel: i % 2 ? 'Almoxarifado' : 'Fiscal' })),
      regras: ['Nada entra no estoque sem conferência'], evidencias: ['Nota fiscal conferida'], fundamento: null,
    };
    let quebrou = 0;
    // empurra o fluxograma por várias posições da página variando a quantidade de procedimentos curtos antes dele
    for (let k = 0; k <= 5; k++) {
      const procs = [...PROCEDIMENTOS_CRESTANI.slice(0, k), longo];
      const r = await renderizarPolitica(dadosCrestani({ procedimentos: procs }));
      conferirGeometria(r);
      const f = r.fluxogramas[r.fluxogramas.length - 1];
      expect(f.nos.filter((n) => n.tipo === 'passo' || n.tipo === 'decisao').length).toBe(15);
      const paginasDoFluxo = new Set(f.nos.map((n) => n.pagina));
      const t = corrido(await paginas(r.pdf));
      if (paginasDoFluxo.size > 1) {
        quebrou++;
        expect(t).toContain('Continua na próxima página');
        expect(t).toContain('Continuação do fluxograma: Recebimento de mercadorias');
      }
      for (let i = 1; i <= 15; i++) expect(t).toContain(i % 4 === 3 ? `Conferência ${i}:` : `Etapa ${i}:`);
    }
    expect(quebrou).toBeGreaterThan(0);
  }, 60000);

  it('fluxograma de 1 a 15 etapas não estoura a página', async () => {
    for (let n = 1; n <= 15; n++) {
      const p: Procedimento = {
        id: `p${n}`, titulo: `Procedimento ${n}`, objetivo: 'Objetivo do procedimento.',
        fluxo: Array.from({ length: n }, (_, i) => (i % 3 === 1 ? { tipo: 'decisao' as const, pergunta: `Pergunta ${i + 1}?`, sim: 'seguir', nao: 'Corrigir e repetir' } : { tipo: 'passo' as const, texto: `Passo ${i + 1}`, responsavel: null })),
        regras: [], evidencias: [], fundamento: null,
      };
      const r = await renderizarPolitica(dadosCrestani({ procedimentos: [p, p] }));
      conferirGeometria(r);
    }
  }, 120000);
});
