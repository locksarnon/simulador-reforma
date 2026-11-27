import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PdfService } from '../../pdf/pdf.service';
import { fatiar, TIPOS_EXCECAO } from '../dados/constantes';
import { SanVersoesService } from '../dados/versoes.service';
import type { DadosEntrega, EntregaveisPort } from '../dados/portas';
import { paramInteiro, paramTexto } from '../dados/validacao';
import { escalaDaBase } from '../motor/conjuntos';
import { gerarExcelDeDados, gerarExcelMapa } from './excel';
import { montarRelatorio } from './relatorio';
import { carregarPerfil } from '../../erps/erps.service';
import { conflitosDoMapa, contarMapa, filtrarMapa, montarMapa, partesDaChave, saldoDe, type CasoMapa, type Executadas, type FiltroMapa, type ItemMapa, type LinhaMapa, type MarcaExecutado } from './unificacoes';
import { fatiaDoNome, nomeDoExcel, nomeDoMapa, nomeDoRelatorio } from './nomes';
import { comNomesDeUsuarios, nomeDe, nomesDeUsuarios } from './usuarios';

export type FiltroUnificacoes = FiltroMapa & { pagina?: string | number; limite?: string | number };
const SITUACOES_MAPA = ['PROPOSTA', 'APROVADA', 'AGUARDANDO', 'REGISTRADA'];
const TIPOS_MAPA = ['UNIFICACAO', 'INATIVACAO', 'EQUIVALENCIA', 'TROCA_CODIGO'];
function listaValida(v: unknown, nome: string, validos: string[]): string | undefined {
  const t = paramTexto(v, nome);
  if (t && t.split(',').some((x) => !validos.includes(x.trim()))) throw new BadRequestException(`Valor inválido em "${nome}".`);
  return t;
}

export { fatiaDoNome, nomeDaPolitica, nomeDoExcel, nomeDoMapa, nomeDoRelatorio } from './nomes';

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PDF = 'application/pdf';

const FASES = ['FASE1', 'FASE2'] as const;
/** Fase pedida na exportação para revisão (`fase=FASE1`): só FASE1 ou FASE2; vazio = tudo, como antes. */
export function faseDoFiltro(v: unknown): DadosEntrega['fase'] {
  const t = paramTexto(v, 'fase');
  if (!t) return null;
  if (!(FASES as readonly string[]).includes(t)) throw new BadRequestException('Fase inválida: use FASE1 ou FASE2.');
  return t as DadosEntrega['fase'];
}
/** Fase gravada no resumo da versão (`resumo.fase`); versão antiga, sem fase = null. */
const faseDoResumo = (resumo: unknown): DadosEntrega['fase'] => {
  const f = (resumo as { fase?: unknown } | null)?.fase;
  return f === 'FASE1' || f === 'FASE2' ? f : null;
};
/** Marcas "Executado no ERP" do projeto (`parametros.acoesExecutadas`), só as bem formadas. */
export function executadasDe(parametros: unknown): Executadas {
  const bruto = (parametros as { acoesExecutadas?: unknown } | null)?.acoesExecutadas;
  const out: Executadas = {};
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return out;
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    const x = v as { em?: unknown; por?: unknown } | null;
    if (x && typeof x.em === 'string') out[k] = { em: x.em, por: typeof x.por === 'string' ? x.por : '' };
  }
  return out;
}
const MAX_CHAVE = 600;
/** Máximo de linhas marcadas "Executado no ERP" por projeto (a marca fica em `parametros`, lido inteiro em cada consulta do projeto). */
export const MAX_EXECUTADAS = 20_000;
/** A marca cabe? Remarcar uma linha já marcada sempre cabe; linha nova, só abaixo do limite. */
export const cabeMaisUmaExecutada = (executadas: Executadas, chave: string, max = MAX_EXECUTADAS) => chave in executadas || Object.keys(executadas).length < max;
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A consulta devolve no máximo 500 pares em conflito (o Excel do mapa traz todos). */
const comConflitosLimitados = <T extends { conflitos: unknown[] }>(c: T) => ({ ...c, totalConflitos: c.conflitos.length, conflitos: c.conflitos.slice(0, 500) });

/** Entregáveis do Saneamento de Estoques: Excel de 6 abas e relatório de fechamento em PDF. É o provider do token SAN_ENTREGAVEIS. */
@Injectable()
export class EntregaveisService implements EntregaveisPort {
  constructor(private readonly pdf: PdfService, private readonly versoes: SanVersoesService, private readonly prisma: PrismaService) {}

  gerarExcel(dados: DadosEntrega): Promise<Buffer> { return gerarExcelDeDados(dados); }

  async gerarRelatorioPdf(dados: DadosEntrega): Promise<Buffer> {
    if (!dados.liberada || !dados.versao) throw new BadRequestException('O relatório de fechamento é gerado a partir de uma versão liberada.');
    return this.pdf.gerar(montarRelatorio(dados));
  }

  /** Dados da versão (liberada) ou da base atual (revisão), com o nome do cliente e do projeto para o cabeçalho. */
  async dados(projetoId: string, versaoId?: string, fase?: DadosEntrega['fase']): Promise<DadosEntrega> {
    const d = versaoId ? await this.versoes.exportar(projetoId, versaoId) : await this.versoes.exportarAtual(projetoId);
    const { foto: _foto, ...dados } = d as DadosEntrega & { foto?: unknown };
    // Versão: vale a fase gravada nela (resumo.fase); revisão: a escolhida na tela.
    dados.fase = versaoId ? faseDoResumo((await this.prisma.sanVersao.findFirst({ where: { id: versaoId, projeto_id: projetoId }, select: { resumo: true } }))?.resumo) : (fase ?? null);
    const executadas = executadasDe(objeto(dados.projeto).parametros);
    if (Object.keys(executadas).length) {
      const nomes = await nomesDeUsuarios(this.prisma, Object.values(executadas).map((x) => x.por));
      for (const x of Object.values(executadas)) x.por = nomeDe(nomes, x.por);
      dados.projeto = { ...dados.projeto, parametros: { ...objeto(dados.projeto.parametros), acoesExecutadas: executadas } };
    }
    const projeto = dados.projeto;
    const empresa = projeto.empresa_id ? await this.prisma.empresa.findUnique({ where: { id: String(projeto.empresa_id) }, select: { razao_social: true, cnpj_cpf: true } }) : null;
    const diag = projeto.diagnostico_id ? await this.prisma.projetoDiagnostico.findUnique({ where: { id: String(projeto.diagnostico_id) }, select: { nome: true } }) : null;
    // Foto liberada antes do Cadastro de ERPs não tem erp_id: vale o ERP atual do projeto.
    const erpId = projeto.erp_id !== undefined ? (projeto.erp_id as string | null) : (await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { erp_id: true } }))?.erp_id ?? null;
    const perfilErp = await carregarPerfil(this.prisma, erpId);
    // Quem decidiu, aprovou ou confirmou aparece pelo nome do cadastro de usuários (não pelo e-mail).
    return comNomesDeUsuarios(this.prisma, { ...dados, perfilErp, projeto: { ...projeto, clienteNome: empresa?.razao_social ?? '', clienteDocumento: empresa?.cnpj_cpf ?? '', diagnosticoNome: diag?.nome ?? '' } });
  }

  async excel(projetoId: string, versaoId?: string, fase?: DadosEntrega['fase']): Promise<{ buffer: Buffer; nome: string }> {
    const dados = await this.dados(projetoId, versaoId, fase);
    const nome = nomeDoExcel(String(dados.projeto.clienteNome ?? ''), dados.versao);
    // Os dados são só desta requisição: o gerador esvazia as listas brutas depois de montar o modelo (menos memória no pico).
    return { buffer: await gerarExcelDeDados(dados, { consumir: true }), nome };
  }

  /**
   * Mapa de unificações e inativações da base atual (o mesmo da aba "De para e equivalências" da exportação para revisão). Lê só o que o
   * mapa usa: os casos de Duplicidades, as inativações e exceções da Qualidade, os itens citados (em blocos: o que a linha mostra), de todos
   * os itens só código e saldo extraídos do JSON pelo banco (`codigosESaldos`: a escala do saldo, a mesma detecção da Duplicidade) e os vínculos.
   */
  async mapaAtual(projetoId: string): Promise<{ linhas: LinhaMapa[]; corteDefinido: boolean; escalaSaldo: number }> {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { data_base: true, parametros: true, erp_id: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const brutos = await this.prisma.sanCaso.findMany({
      where: { projeto_id: projetoId, situacao: { in: ['PROPOSTO', 'RASCUNHO', 'APROVADO', 'AGUARDANDO_INFORMACAO'] }, OR: [{ camada: 'DUPLICIDADE' }, { camada: 'QUALIDADE', tipo: { in: ['SEM_MOVIMENTACAO', ...TIPOS_EXCECAO] } }] },
      orderBy: { id: 'asc' },
      select: { id: true, camada: true, tipo: true, itens: true, proposta: true, justificativa: true, motivo: true, situacao: true, decidido_por: true, decidido_em: true },
    });
    const casos: CasoMapa[] = brutos.map((c) => ({
      id: c.id, camada: c.camada, tipo: c.tipo, itens: c.itens, proposta: (c.proposta ?? {}) as Record<string, unknown>, justificativa: c.justificativa ?? '', motivo: c.motivo ?? '',
      situacao: c.situacao, decididoPor: c.decidido_por ?? '', decididoEm: c.decidido_em ?? null,
    }));
    const ids = new Set<string>();
    for (const c of casos) for (const id of c.itens) ids.add(id);
    const itens = new Map<string, ItemMapa>();
    for (const lote of fatiar([...ids], 5000)) {
      for (const i of await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, codigo: true, estabelecimento: true, trabalho: true, ativo: true } })) {
        const t = (i.trabalho ?? {}) as Record<string, unknown>;
        itens.set(i.id, { id: i.id, codigo: String(t.codigo ?? i.codigo), estab: i.estabelecimento ?? '', descricao: String(t.descricao ?? ''), unidade: String(t.unidade ?? ''), saldo: saldoDe(t.saldo), ativo: typeof t.ativo === 'boolean' ? t.ativo : (i.ativo ?? null) });
      }
    }
    const escala = escalaDaBase(await this.codigosESaldos(projetoId));
    const vinculos = await this.prisma.sanVinculoCodigo.findMany({ where: { projeto_id: projetoId }, orderBy: { createdAt: 'asc' } });
    const executadas = executadasDe(p.parametros);
    const nomes = await nomesDeUsuarios(this.prisma, [...casos.map((c) => c.decididoPor), ...vinculos.map((v) => v.criado_por), ...Object.values(executadas).map((x) => x.por)]);
    for (const c of casos) c.decididoPor = nomeDe(nomes, c.decididoPor);
    for (const x of Object.values(executadas)) x.por = nomeDe(nomes, x.por);
    const linhas = montarMapa({
      liberada: false, dataBase: p.data_base, casos, item: (id) => itens.get(id), escala, perfilErp: await carregarPerfil(this.prisma, p.erp_id), executadas,
      vinculos: vinculos.map((v) => ({ de: v.de, para: v.para, inicio: v.inicio, justificativa: v.justificativa, criadoPor: v.criado_por === 'sistema' ? 'sistema' : nomeDe(nomes, v.criado_por ?? '') })),
    });
    const corte = (p.parametros as { corteMovimentacao?: unknown } | null)?.corteMovimentacao;
    return { linhas, corteDefinido: typeof corte === 'string' && corte !== '', escalaSaldo: escala };
  }

  /**
   * Código (o de trabalho, senão o da importação) e saldo de todos os itens, só para a escala do saldo. No Postgres, uma consulta que
   * extrai os dois campos do JSON (antes cada página lia o `trabalho` inteiro de 30 mil itens); sem SQL bruto (testes), em blocos.
   */
  async codigosESaldos(projetoId: string): Promise<{ id: string; codigo: string; saldo: number | null }[]> {
    if (typeof (this.prisma as unknown as { $queryRaw?: unknown }).$queryRaw === 'function') {
      const linhas = await this.prisma.$queryRaw<{ id: string; codigo: string | null; saldo: string | null }[]>(Prisma.sql`SELECT "id", COALESCE("trabalho"->>'codigo', "codigo") AS "codigo", "trabalho"->>'saldo' AS "saldo" FROM "SanItem" WHERE "projeto_id" = ${projetoId}`);
      return linhas.map((l) => ({ id: l.id, codigo: String(l.codigo ?? ''), saldo: saldoDe(l.saldo) }));
    }
    const out: { id: string; codigo: string; saldo: number | null }[] = [];
    let cursor: string | undefined;
    for (;;) {
      const lote = await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: 5000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, codigo: true, trabalho: true } });
      for (const i of lote) { const t = (i.trabalho ?? {}) as Record<string, unknown>; out.push({ id: i.id, codigo: String(t.codigo ?? i.codigo), saldo: saldoDe(t.saldo) }); }
      if (lote.length < 5000) break;
      cursor = lote[lote.length - 1].id;
    }
    return out;
  }

  /** Consulta "Unificações" da tela: filtro por situação, tipo e código; página (`pagina` a partir de 1, `limite` até 500). */
  async unificacoes(projetoId: string, f: FiltroUnificacoes = {}) {
    const filtro: FiltroMapa = { situacao: listaValida(f.situacao, 'situacao', SITUACOES_MAPA), tipo: listaValida(f.tipo, 'tipo', TIPOS_MAPA), busca: paramTexto(f.busca, 'busca') };
    const limite = Math.min(Math.max(paramInteiro(f.limite, 'limite') ?? 100, 1), 500);
    const pagina = Math.max(paramInteiro(f.pagina, 'pagina') ?? 1, 1);
    const { linhas, corteDefinido, escalaSaldo } = await this.mapaAtual(projetoId);
    const filtradas = filtrarMapa(linhas, filtro);
    return {
      linhas: filtradas.slice((pagina - 1) * limite, pagina * limite), pagina, limite, total: filtradas.length, totalGeral: linhas.length,
      ...comConflitosLimitados(contarMapa(linhas)), corteDefinido, escalaSaldo,
    };
  }

  /** Excel só do mapa (com o mesmo filtro da tela): o que vai para quem faz os ajustes no ERP. */
  async excelUnificacoes(projetoId: string, f: FiltroMapa = {}): Promise<{ buffer: Buffer; nome: string }> {
    const filtro: FiltroMapa = { situacao: listaValida(f.situacao, 'situacao', SITUACOES_MAPA), tipo: listaValida(f.tipo, 'tipo', TIPOS_MAPA), busca: paramTexto(f.busca, 'busca') };
    const { linhas, escalaSaldo } = await this.mapaAtual(projetoId);
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { empresa_id: true } });
    const empresa = p?.empresa_id ? await this.prisma.empresa.findUnique({ where: { id: String(p.empresa_id) }, select: { razao_social: true } }) : null;
    const nome = nomeDoMapa(empresa?.razao_social ?? '');
    // Os conflitos vêm do mapa inteiro (o par pode ter uma linha fora do filtro).
    return { buffer: await gerarExcelMapa(filtrarMapa(linhas, filtro), { escala: escalaSaldo, conflitos: conflitosDoMapa(linhas) }), nome };
  }

  /**
   * Marca uma linha do mapa como "Executado no ERP": grava quando e quem em `parametros.acoesExecutadas[chave]` do projeto, sem mexer na
   * versão do projeto (a tela de Configuração não recebe conflito). A chave é a da linha (`chaveDaLinha`): o caso tem de ser deste projeto,
   * de Duplicidades ou Qualidade, e estar aprovado; a troca de código, um vínculo deste projeto.
   */
  async marcarExecutada(projetoId: string, chaveBruta: unknown, usuario: AuthUser | undefined): Promise<{ chave: string; executado: MarcaExecutado }> {
    const chave = await this.validarChave(projetoId, chaveBruta, true);
    const marca: MarcaExecutado = { em: new Date().toISOString(), por: usuario?.email ?? 'sistema' };
    await this.gravarExecutada(projetoId, chave, marca);
    const nomes = await nomesDeUsuarios(this.prisma, [marca.por]);
    return { chave, executado: { ...marca, por: nomeDe(nomes, marca.por) } };
  }

  /** Desmarca (a linha volta a "não executada"). O caso pode ter sido reaberto depois: desmarcar não exige aprovação. */
  async desmarcarExecutada(projetoId: string, chaveBruta: unknown): Promise<{ chave: string; executado: null }> {
    const chave = await this.validarChave(projetoId, chaveBruta, false);
    await this.gravarExecutada(projetoId, chave, null);
    return { chave, executado: null };
  }

  private async validarChave(projetoId: string, bruta: unknown, exigirAprovado: boolean): Promise<string> {
    const chave = typeof bruta === 'string' ? bruta.trim() : '';
    if (!chave || chave.length > MAX_CHAVE) throw new BadRequestException('Informe a linha do mapa (campo "chave").');
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true, parametros: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    // Limite de marcas por projeto (só ao marcar uma linha nova; desmarcar e remarcar a mesma sempre podem).
    if (exigirAprovado && !cabeMaisUmaExecutada(executadasDe(p.parametros), chave)) {
      throw new BadRequestException(`O projeto já tem ${MAX_EXECUTADAS.toLocaleString('pt-BR')} linhas marcadas como executadas no ERP (o limite).`);
    }
    const partes = partesDaChave(chave);
    if (partes[0] === 'vinculo') {
      if (partes.length !== 3 || !partes[1] || !partes[2]) throw new BadRequestException('Linha do mapa inválida.');
      const v = await this.prisma.sanVinculoCodigo.findFirst({ where: { projeto_id: projetoId, de: partes[1], para: partes[2] }, select: { id: true } });
      if (!v) throw new NotFoundException('Esta troca de código não pertence a este projeto.');
      return chave;
    }
    if (partes.length !== 1 && partes.length !== 3) throw new BadRequestException('Linha do mapa inválida.');
    const caso = await this.prisma.sanCaso.findFirst({ where: { id: partes[0], projeto_id: projetoId }, select: { camada: true, situacao: true, itens: true, proposta: true } });
    if (!caso || !['DUPLICIDADE', 'QUALIDADE'].includes(caso.camada)) throw new NotFoundException('Esta ação não pertence ao mapa de unificações deste projeto.');
    if (exigirAprovado && caso.situacao !== 'APROVADO') throw new BadRequestException('Só a ação aprovada pode ser marcada como executada no ERP: aprove o caso antes.');
    // Linha de item (unificação ou inativação): o código que sai e o estabelecimento têm de ser de um item do caso (ou, na unificação, um
    // código de `consolidar` que não está na base: linha sem estabelecimento). Desmarcar não confere (o caso pode ter mudado depois).
    if (partes.length === 3 && exigirAprovado) {
      const [, codigo, estab] = partes;
      if (!codigo) throw new BadRequestException('Linha do mapa inválida.');
      const itens = await this.prisma.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: caso.itens } }, select: { codigo: true, estabelecimento: true, trabalho: true } });
      const doCaso = itens.some((i) => String(((i.trabalho as Record<string, unknown> | null)?.codigo) ?? i.codigo) === codigo && (i.estabelecimento ?? '') === estab);
      const consolidar = String(((caso.proposta as Record<string, unknown> | null)?.consolidar) ?? '').split('|').map((x) => x.trim()).filter(Boolean);
      if (!doCaso && !(estab === '' && consolidar.includes(codigo))) throw new NotFoundException('Esta linha não pertence ao caso indicado no mapa de unificações.');
    }
    return chave;
  }

  /** Grava (ou apaga, com `marca` null) só esta chave, de forma atômica no banco (jsonb), sem regravar os demais parâmetros. */
  private async gravarExecutada(projetoId: string, chave: string, marca: MarcaExecutado | null) {
    if (typeof (this.prisma as unknown as { $executeRaw?: unknown }).$executeRaw === 'function') {
      if (marca) await this.prisma.$executeRaw`UPDATE "SanProjeto" SET "parametros" = jsonb_set(COALESCE("parametros", '{}'::jsonb), '{acoesExecutadas}', COALESCE("parametros"->'acoesExecutadas', '{}'::jsonb) || jsonb_build_object(${chave}::text, jsonb_build_object('em', ${marca.em}::text, 'por', ${marca.por}::text))) WHERE "id" = ${projetoId}`;
      else await this.prisma.$executeRaw`UPDATE "SanProjeto" SET "parametros" = jsonb_set(COALESCE("parametros", '{}'::jsonb), '{acoesExecutadas}', COALESCE("parametros"->'acoesExecutadas', '{}'::jsonb) - ${chave}::text) WHERE "id" = ${projetoId}`;
      return;
    }
    const atual = (await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { parametros: true } }))?.parametros as Record<string, unknown> | null;
    const executadas = { ...executadasDe(atual) };
    if (marca) executadas[chave] = marca; else delete executadas[chave];
    await this.prisma.sanProjeto.update({ where: { id: projetoId }, data: { parametros: { ...(atual ?? {}), acoesExecutadas: executadas } as never } });
  }

  /** Sem `versaoId`, usa a última versão liberada; sem nenhuma versão, recusa. */
  async relatorio(projetoId: string, versaoId?: string): Promise<{ buffer: Buffer; nome: string }> {
    let id = versaoId;
    if (!id) {
      const [ultima] = await this.versoes.listar(projetoId);
      if (!ultima) throw new BadRequestException('Libere uma versão do cadastro antes de gerar o relatório de fechamento.');
      id = ultima.id;
    }
    const dados = await this.dados(projetoId, id);
    return { buffer: await this.gerarRelatorioPdf(dados), nome: nomeDoRelatorio(String(dados.projeto.clienteNome ?? ''), dados.versao!) };
  }
}
