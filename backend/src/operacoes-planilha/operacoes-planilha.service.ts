import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { formatoDoArquivo, lerPlanilha, lerPrevia } from '../produtos/leitura-planilha';
import { CAMPOS, CAMPOS_PCT, IDS_CAMPOS, Mapeamento, sugerirMapeamento } from './campos';
import { Contexto, EmpresaRef, LinhaConvertida, OPCOES_PADRAO, OpcoesImportacao, converterLinha, indexarEmpresas } from './conversao';

type Arquivo = { buffer: Buffer; originalname?: string };

const LOTE_GRAVACAO = 1000;
const LOTE_CONSULTA = 5000;
const AMOSTRA_ERROS = 100;
const AMOSTRA_VALIDAS = 30;
/** pg_advisory_xact_lock: uma importação grava por vez, com a consulta das já existentes e a gravação na mesma transação. */
const TRAVA_IMPORTACAO = 727401;
/** Números da planilha chegam como texto brasileiro nos dois formatos (ver OpcoesLeitura). */
const OPCOES_LEITURA = { numerosBR: true } as const;

/** Mapeamento enviado pela tela (JSON): só campos conhecidos, índices de coluna inteiros. */
export function lerMapeamento(bruto?: string): Mapeamento {
  if (!bruto) throw new BadRequestException('Indique quais colunas da planilha são cada campo.');
  try {
    const m = JSON.parse(bruto);
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error();
    const out: Mapeamento = {};
    for (const [k, v] of Object.entries(m)) {
      if (!IDS_CAMPOS.includes(k)) throw new Error();
      const n = v === null || v === '' || v === undefined ? null : Number(v);
      if (n !== null && (!Number.isInteger(n) || n < 0 || n > 16383)) throw new Error();
      out[k] = n;
    }
    return out;
  } catch {
    throw new BadRequestException('Mapeamento de colunas inválido.');
  }
}

/** Opções da importação (JSON); o que faltar ou vier estranho volta ao padrão. */
export function lerOpcoes(bruto?: string): OpcoesImportacao {
  if (!bruto) return { ...OPCOES_PADRAO };
  let o: Record<string, unknown>;
  try { o = JSON.parse(bruto); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(); } catch { throw new BadRequestException('Opções de importação inválidas.'); }
  const cred = o.creditoElegivelCompras === null || o.creditoElegivelCompras === undefined || o.creditoElegivelCompras === '' ? null : Number(o.creditoElegivelCompras);
  if (cred !== null && (!Number.isFinite(cred) || cred < 0 || cred > 1)) throw new BadRequestException('O crédito elegível das compras deve ficar entre 0% e 100%.');
  return {
    empresaPadrao: typeof o.empresaPadrao === 'string' && o.empresaPadrao ? o.empresaPadrao : null,
    direcaoPadrao: o.direcaoPadrao === 'Entrada' || o.direcaoPadrao === 'Saida' ? o.direcaoPadrao : null,
    tipoPadrao: o.tipoPadrao === 'Servico' ? 'Servico' : 'Mercadoria',
    unidadePct: o.unidadePct === 'fracao' ? 'fracao' : 'pontos',
    preencherTributos: o.preencherTributos === undefined ? true : Boolean(o.preencherTributos),
    creditoElegivelCompras: cred,
    grupoId: typeof o.grupoId === 'string' && o.grupoId ? o.grupoId : null,
  };
}

/** O multer entrega o nome em latin1 ("operações.csv" chega como "operaÃ§Ãµes.csv"): devolve o texto certo, e deixa como está o que já veio certo. */
export function nomeDoArquivo(file: Arquivo): string {
  const bruto = file.originalname || 'planilha';
  if ([...bruto].some((c) => c.charCodeAt(0) > 255)) return bruto;
  const corrigido = Buffer.from(bruto, 'latin1').toString('utf8');
  return corrigido.includes('�') ? bruto : corrigido;
}

/**
 * duplicada: a operação já existe (mesmo ID na mesma empresa, ou nota que já entrou pelo XML) e a linha fica de fora.
 * diferente: a duplicada traz percentuais ou classificação diferentes do que está gravado (nada é alterado, o usuário é avisado).
 * parcialXml: a nota já tem itens importados por XML, mas menos que as linhas da planilha: a linha entra, com aviso.
 */
type Processada = LinhaConvertida & { duplicada: boolean; duplicadaXml: boolean; diferente: boolean; parcialXml: boolean };
type Banco = { operacao: PrismaService['operacao']; historicoXML: PrismaService['historicoXML'] };

/** Campos que a planilha pode ter corrigido sem mudar a identidade da linha. Comparados com o que já está gravado. */
const CAMPOS_COMPARADOS = [
  'pis_pct', 'cofins_pct', 'icms_pct', 'iss_pct', 'ipi_pct', 'is_pct', 'credito_elegivel_pct',
  'credito_presumido_ibs_pct', 'credito_presumido_cbs_pct', 'c_class_trib', 'cst_ibs_cbs', 'c_cred_pres',
] as const;
const igualGravado = (a: unknown, b: unknown) =>
  typeof a === 'number' || typeof b === 'number' ? Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 1e-9 : String(a ?? '') === String(b ?? '');

/**
 * Percentuais que a planilha trouxe (não os preenchidos pela tabela). Em pontos, um PIS, Cofins, ICMS, ISS ou IPI todo abaixo
 * do piso (0,1% ou 1%) é quase certo uma fração (0,0165) lida como pontos: avisa em vez de gravar o imposto 100 vezes menor.
 */
const PERCENTUAIS_CONFERIDOS: { id: string; padrao?: string; piso: number; rotulo: string }[] = [
  { id: 'pis_pct', padrao: 'PIS', piso: 0.001, rotulo: 'PIS' },
  { id: 'cofins_pct', padrao: 'Cofins', piso: 0.001, rotulo: 'Cofins' },
  { id: 'icms_pct', padrao: 'ICMS interestadual', piso: 0.01, rotulo: 'ICMS' },
  { id: 'iss_pct', piso: 0.001, rotulo: 'ISS' },
  { id: 'ipi_pct', piso: 0.001, rotulo: 'IPI' },
];

@Injectable()
export class OperacoesPlanilhaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cabeçalho, amostra e a sugestão de colunas, para a tela de mapeamento. */
  async previa(file: Arquivo) {
    const p = await lerPrevia(file, OPCOES_LEITURA);
    return {
      ...p,
      mapeamentoSugerido: sugerirMapeamento(p.cabecalho),
      campos: CAMPOS.map((c) => ({ id: c.id, rotulo: c.rotulo, tipo: c.tipo, obrigatorio: Boolean(c.obrigatorio), ajuda: c.ajuda })),
    };
  }

  /** Modelo de planilha para baixar: uma aba com os títulos e uma linha de exemplo, outra com a explicação de cada coluna. */
  async modelo(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'InTAX'; wb.created = new Date();
    const ws = wb.addWorksheet('Operações');
    ws.addRow(CAMPOS.map((c) => c.coluna));
    ws.addRow(CAMPOS.map((c) => c.exemplo));
    const cab = ws.getRow(1);
    cab.font = { bold: true };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF4' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    CAMPOS.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(12, Math.min(36, c.coluna.length + 4)); });

    const aj = wb.addWorksheet('Como preencher');
    aj.addRow(['Coluna', 'Obrigatória', 'Como preencher', 'Exemplo']);
    for (const c of CAMPOS) aj.addRow([c.coluna, c.obrigatorio ? 'Sim' : 'Não', c.ajuda, c.exemplo]);
    aj.addRow([]);
    [
      'Uma linha por operação (um CT-e, uma NF-e ou um lançamento). Apague a linha de exemplo antes de enviar.',
      'Percentuais em pontos percentuais: 18 é 18%, 1,65 é 1,65%. Se a sua planilha usa fração (0,18), escolha essa unidade na tela de importação. Células formatadas como percentual no Excel (1,65%) são lidas certas nas duas unidades.',
      'Valores em reais, com vírgula ou ponto nos centavos (12.500,00 ou 12500.00). Datas como 15/01/2027 ou 2027-01-15.',
      'Você pode enviar a sua própria planilha, com outros títulos de coluna: na tela de importação você indica qual coluna é cada campo.',
      'As colunas Empresa, Entrada/Saída e Data podem ficar de fora se a tela de importação for usada com uma empresa e uma direção para todas as linhas.',
      'Enviar a mesma planilha de novo não duplica: a linha igual à já importada é ignorada. A linha em que você corrigiu empresa, data, valor, descrição, documento, CFOP, NCM, NBS, UF ou quantidade entra como nova; apague a antiga em Operações. Percentual ou classificação corrigidos numa linha já importada NÃO alteram a operação gravada (a conferência avisa): edite a operação, ou apague a antiga e importe de novo.',
    ].forEach((t) => aj.addRow([t]));
    aj.getRow(1).font = { bold: true };
    aj.getColumn(1).width = 34; aj.getColumn(2).width = 12; aj.getColumn(3).width = 90; aj.getColumn(4).width = 30;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Confere as exigências mínimas do mapeamento antes de ler a planilha inteira. */
  private conferirMapeamento(mapa: Mapeamento, opcoes: OpcoesImportacao) {
    const tem = (id: string) => mapa[id] !== null && mapa[id] !== undefined;
    if (!tem('data')) throw new BadRequestException('Indique a coluna da data da operação.');
    if (!tem('valor_bruto')) throw new BadRequestException('Indique a coluna do valor da operação.');
    if (!tem('empresa') && !opcoes.empresaPadrao) throw new BadRequestException('Indique a coluna da empresa ou escolha uma empresa para todas as linhas.');
    if (!tem('direcao') && !opcoes.direcaoPadrao) throw new BadRequestException('Indique a coluna de Entrada ou Saída ou escolha uma direção para todas as linhas.');
    const usadas = Object.entries(mapa).filter(([, v]) => v !== null && v !== undefined).map(([, v]) => v as number);
    if (new Set(usadas).size !== usadas.length) throw new BadRequestException('A mesma coluna da planilha foi usada em mais de um campo.');
  }

  /** Empresas que a importação pode usar: as do grupo informado (se houver) ou todas. */
  private async empresasDoEscopo(opcoes: OpcoesImportacao): Promise<EmpresaRef[]> {
    const where: Record<string, unknown> = {};
    if (opcoes.grupoId) {
      const grupo = await this.prisma.grupo.findUnique({ where: { id: opcoes.grupoId }, select: { numero: true } });
      if (!grupo) throw new BadRequestException('Grupo não encontrado.');
      where.grupo = grupo.numero;
    }
    return this.prisma.empresa.findMany({ where, select: { id: true, id_empresa: true, cnpj_cpf: true, regime_atual: true, status: true } });
  }

  /**
   * Lê e converte todas as linhas, sem consultar o que já foi importado. O ID de uma linha sem ID na planilha nasce do conteúdo
   * dela (mais a ordem entre linhas idênticas do mesmo arquivo): o mesmo conteúdo dá sempre o mesmo ID, em qualquer envio.
   */
  private async converter(file: Arquivo, mapa: Mapeamento, opcoes: OpcoesImportacao) {
    this.conferirMapeamento(mapa, opcoes);
    // Com a empresa escolhida para todas as linhas, a coluna Empresa não é lida.
    const mapaEfetivo: Mapeamento = opcoes.empresaPadrao ? { ...mapa, empresa: null } : mapa;
    formatoDoArquivo(file);
    const colunas = Object.values(mapaEfetivo).filter((v): v is number => v !== null && v !== undefined);
    const planilha = await lerPlanilha(file, colunas, OPCOES_LEITURA);
    const empresas = await this.empresasDoEscopo(opcoes);
    const classes = new Set((await this.prisma.classTrib.findMany({ where: { status: 'Ativo' }, select: { c_class_trib: true } })).map((c) => c.c_class_trib));
    const ctx: Contexto = {
      mapeamento: mapaEfetivo, opcoes, empresas, indiceEmpresas: indexarEmpresas(empresas), formato: 'csv',
      nomeArquivo: nomeDoArquivo(file),
      arquivoHash: createHash('sha1').update(file.buffer).digest('hex').slice(0, 8),
      classesCatalogo: classes,
    };
    const linhas: Processada[] = planilha.linhas.map((v, i) => ({
      ...converterLinha(v, planilha.linhasFisicas[i] ?? i + 2, ctx), duplicada: false, duplicadaXml: false, diferente: false, parcialXml: false,
    }));

    const ocorrencias = new Map<string, number>();
    for (const l of linhas) {
      if (!l.ok || !l.dados || l.idInformado || !l.chaveConteudo) continue;
      const h = createHash('sha1').update(l.chaveConteudo).digest('hex').slice(0, 12);
      const n = (ocorrencias.get(h) ?? 0) + 1;
      ocorrencias.set(h, n);
      l.dados.id_operacao = `PL${h}-${n}`;
    }

    // ID informado repetido dentro da própria planilha (por empresa).
    const vistos = new Set<string>();
    for (const l of linhas) {
      if (!l.ok || !l.dados) continue;
      const chave = `${l.dados.empresa_id}|${l.dados.id_operacao}`;
      if (vistos.has(chave)) { l.ok = false; l.dados = null; l.erros.push('ID da operação repetido na planilha.'); } else vistos.add(chave);
    }
    return { linhas, planilha, empresas };
  }

  /**
   * Marca as linhas que já existem: mesmo ID na mesma empresa, ou nota (chave de 44 dígitos) que já entrou pelo XML. Ficam de
   * fora da gravação, sem erro. Na importação roda dentro da transação com a trava, para dois envios iguais não gravarem duas vezes.
   */
  private async marcarJaExistentes(db: Banco, linhas: Processada[], empresas: EmpresaRef[]) {
    const candidatas = linhas.filter((l) => l.ok && l.dados);
    const empresasDasLinhas = [...new Set(candidatas.map((l) => String(l.dados!.empresa_id)))];
    const gravadas = new Map<string, Record<string, unknown>>();
    if (empresasDasLinhas.length > 0) {
      for (let i = 0; i < candidatas.length; i += LOTE_CONSULTA) {
        const ids = candidatas.slice(i, i + LOTE_CONSULTA).map((l) => String(l.dados!.id_operacao));
        const achadas = await db.operacao.findMany({
          where: { empresa_id: { in: empresasDasLinhas }, id_operacao: { in: ids } },
          select: { id_operacao: true, empresa_id: true, ...Object.fromEntries(CAMPOS_COMPARADOS.map((c) => [c, true])) },
        });
        for (const a of achadas) gravadas.set(`${a.empresa_id}|${a.id_operacao}`, a as unknown as Record<string, unknown>);
      }
    }
    for (const l of candidatas) {
      const g = gravadas.get(`${l.dados!.empresa_id}|${l.dados!.id_operacao}`);
      if (!g) continue;
      l.duplicada = true;
      // A linha é a mesma operação, mas pode trazer percentual ou classificação corrigidos: nada é alterado, o usuário é avisado.
      l.diferente = CAMPOS_COMPARADOS.some((c) => !igualGravado(l.dados![c], g[c]));
    }

    // A mesma nota que já entrou pelo XML não conta de novo. O histórico guarda a chave por empresa pelo id do cadastro, e a
    // matriz e a filial costumam dividir o mesmo id_empresa (a raiz do CNPJ): vale qualquer cadastro com esse id.
    const idsBanco = new Map<string, string[]>();
    for (const e of empresas) if (e.id) idsBanco.set(e.id_empresa, [...(idsBanco.get(e.id_empresa) ?? []), e.id]);
    const comChave = candidatas.filter((l) => !l.duplicada && l.chaveDocumento);
    const donos = [...new Set(comChave.flatMap((l) => idsBanco.get(String(l.dados!.empresa_id)) ?? []))];
    if (comChave.length > 0 && donos.length > 0) {
      const itensPorNota = new Map<string, Set<string>>(); // cadastro|chave -> itens da nota importados por XML
      const chaves = [...new Set(comChave.map((l) => l.chaveDocumento as string))];
      for (let i = 0; i < chaves.length; i += LOTE_CONSULTA) {
        const achadas = await db.historicoXML.findMany({
          where: { empresa_id: { in: donos }, chave_nfe: { in: chaves.slice(i, i + LOTE_CONSULTA) } },
          select: { empresa_id: true, chave_nfe: true, numero_item: true },
        });
        for (const a of achadas) {
          const k = `${a.empresa_id}|${a.chave_nfe}`;
          itensPorNota.set(k, (itensPorNota.get(k) ?? new Set()).add(String(a.numero_item)));
        }
      }
      // Nota por nota: se o XML já trouxe pelo menos tantos itens quantas são as linhas da planilha, a nota está dentro; se
      // trouxe menos, as linhas entram (não dá para saber qual item é qual) e ficam com o aviso.
      const porNota = new Map<string, Processada[]>();
      for (const l of comChave) {
        const k = `${l.dados!.empresa_id}|${l.chaveDocumento}`;
        porNota.set(k, [...(porNota.get(k) ?? []), l]);
      }
      for (const [, grupo] of porNota) {
        const l0 = grupo[0];
        const jaNoXml = Math.max(0, ...(idsBanco.get(String(l0.dados!.empresa_id)) ?? []).map((id) => itensPorNota.get(`${id}|${l0.chaveDocumento}`)?.size ?? 0));
        if (jaNoXml === 0) continue;
        if (jaNoXml >= grupo.length) for (const l of grupo) { l.duplicada = true; l.duplicadaXml = true; }
        else {
          for (const l of grupo) {
            l.parcialXml = true;
            l.avisos.push(`A nota já tem ${jaNoXml} item(ns) importado(s) por XML e a planilha traz ${grupo.length} linha(s) dela: confira para não contar em dobro.`);
          }
        }
      }
    }
  }

  private resumo(linhas: Processada[], planilhaFormato: string) {
    const novas = linhas.filter((l) => l.ok && !l.duplicada);
    const padroes: Record<string, number> = {};
    for (const l of linhas) if (l.ok) for (const p of l.padroes) padroes[p] = (padroes[p] || 0) + 1;
    const porAno: Record<string, number> = {};
    for (const l of novas) { const a = String(l.dados!.ano); porAno[a] = (porAno[a] || 0) + 1; }
    const comprasSemCredito = novas.filter((l) => l.dados!.direcao === 'Entrada' && Number(l.dados!.credito_elegivel_pct) === 0 && !l.dados!.c_cred_pres).length;
    const comprasSemPisCofins = novas.filter((l) => l.dados!.direcao === 'Entrada' && Number(l.dados!.pis_pct) === 0 && Number(l.dados!.cofins_pct) === 0).length;
    const duplicadasPorXml = linhas.filter((l) => l.ok && l.duplicadaXml).length;
    const jaExistiamDiferentes = linhas.filter((l) => l.ok && l.duplicada && !l.duplicadaXml && l.diferente).length;
    const notasParciaisXml = new Set(linhas.filter((l) => l.ok && l.parcialXml).map((l) => `${l.dados!.empresa_id}|${l.chaveDocumento}`)).size;
    const alertas: string[] = [];
    if (comprasSemPisCofins > 0) alertas.push(`${comprasSemPisCofins} compra(s) entram sem PIS/Cofins: a tabela da legislação só preenche as vendas, porque o PIS/Cofins de uma compra é o do fornecedor. Informe as colunas PIS e Cofins se quiser o crédito desses tributos no sistema atual (só quem está no Lucro Real tem).`);
    if (comprasSemCredito > 0) alertas.push(`${comprasSemCredito} compra(s) entram sem crédito elegível (0%): o IBS/CBS delas não gera crédito. Informe a coluna “Crédito elegível” ou escolha o percentual para compras.`);
    if (duplicadasPorXml > 0) alertas.push(`${duplicadasPorXml} linha(s) trazem a chave de uma nota que já entrou pelo XML e ficam de fora, para a nota não contar duas vezes.`);
    if (notasParciaisXml > 0) alertas.push(`${notasParciaisXml} nota(s) já têm itens importados por XML, mas menos que as linhas da planilha: as linhas entram, mas confira para não contar em dobro.`);
    if (jaExistiamDiferentes > 0) alertas.push(`${jaExistiamDiferentes} linha(s) já importada(s) trazem percentual ou classificação diferente do que está gravado (PIS, Cofins, ICMS, ISS, IPI, crédito, cClassTrib, CST ou cCredPres). Elas NÃO foram alteradas: para corrigir, edite a operação ou apague a antiga em Operações e importe de novo.`);
    return {
      formato: planilhaFormato,
      total: linhas.length,
      novas: novas.length,
      comErro: linhas.filter((l) => !l.ok).length,
      duplicadas: linhas.filter((l) => l.ok && l.duplicada).length,
      duplicadasPorXml,
      jaExistiamDiferentes,
      comAviso: novas.filter((l) => l.avisos.length > 0).length,
      padroes, porAno, comprasSemCredito, alertas,
    };
  }

  /** Suspeita de percentual em fração (0,0165) lido como pontos: o imposto sairia 100 vezes menor, sem erro nenhum. */
  private alertasDePercentuais(linhas: Processada[], mapa: Mapeamento, opcoes: OpcoesImportacao): string[] {
    if (opcoes.unidadePct !== 'pontos') return [];
    const alertas: string[] = [];
    for (const c of PERCENTUAIS_CONFERIDOS) {
      if (mapa[c.id] === null || mapa[c.id] === undefined) continue;
      const lidos = linhas
        .filter((l) => l.ok && l.dados && !(c.padrao && l.padroes.includes(c.padrao)))
        .map((l) => Number(l.dados![c.id]))
        .filter((v) => v > 0);
      if (lidos.length >= 3 && lidos.every((v) => v < c.piso)) {
        alertas.push(`Todos os valores de ${c.rotulo} ficaram abaixo de ${c.piso === 0.01 ? '1%' : '0,1%'}. Se a planilha traz fração (0,18) e não pontos (18), troque a unidade dos percentuais para “fração”.`);
      }
    }
    return alertas;
  }

  /** Lê tudo, converte e devolve o resumo e uma amostra com erros e avisos; não grava nada. */
  async validar(file: Arquivo, mapeamentoBruto?: string, opcoesBruto?: string) {
    const mapa = lerMapeamento(mapeamentoBruto); const opcoes = lerOpcoes(opcoesBruto);
    const { linhas, planilha, empresas } = await this.converter(file, mapa, opcoes);
    await this.marcarJaExistentes(this.prisma, linhas, empresas);
    const sinal = (l: Processada) => ({ linha: l.linha, ok: l.ok, duplicada: l.duplicada, diferente: l.diferente, erros: l.erros, avisos: l.avisos, padroes: l.padroes, previa: l.previa });
    const colunasPct = CAMPOS_PCT.filter((id) => mapa[id] !== null && mapa[id] !== undefined);
    const r = this.resumo(linhas, planilha.formato);
    return {
      ...r,
      alertas: [...r.alertas, ...this.alertasDePercentuais(linhas, mapa, opcoes)],
      colunasPercentuais: colunasPct,
      amostraErros: linhas.filter((l) => !l.ok).slice(0, AMOSTRA_ERROS).map(sinal),
      amostraValidas: linhas.filter((l) => l.ok).slice(0, AMOSTRA_VALIDAS).map(sinal),
    };
  }

  /**
   * Grava as linhas válidas que ainda não existem. Reenviar a mesma planilha não duplica nada: a linha igual à já importada é
   * ignorada. Tudo na mesma transação, com a trava de importação: ou entra tudo, ou nada (o reenvio é seguro).
   */
  async importar(file: Arquivo, mapeamentoBruto?: string, opcoesBruto?: string) {
    const mapa = lerMapeamento(mapeamentoBruto); const opcoes = lerOpcoes(opcoesBruto);
    const { linhas, planilha, empresas } = await this.converter(file, mapa, opcoes);
    let gravadas = 0;
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${TRAVA_IMPORTACAO})`);
        await this.marcarJaExistentes(tx as unknown as Banco, linhas, empresas);
        const novas = linhas.filter((l) => l.ok && !l.duplicada && l.dados);
        for (let i = 0; i < novas.length; i += LOTE_GRAVACAO) {
          const lote = novas.slice(i, i + LOTE_GRAVACAO).map((l) => l.dados as any);
          const r = await tx.operacao.createMany({ data: lote });
          gravadas += r.count;
        }
      },
      { maxWait: 30_000, timeout: 600_000 },
    );
    const resumo = this.resumo(linhas, planilha.formato);
    return {
      importadas: gravadas,
      jaExistiam: resumo.duplicadas,
      jaExistiamPorXml: resumo.duplicadasPorXml,
      jaExistiamDiferentes: resumo.jaExistiamDiferentes,
      comErro: resumo.comErro,
      total: resumo.total,
      alertas: [...resumo.alertas, ...this.alertasDePercentuais(linhas, mapa, opcoes)],
    };
  }
}
