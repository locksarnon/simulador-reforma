import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const COR = /^#[0-9a-fA-F]{6}$/;
export const COR_PADRAO = '#1E764D';
export const MODOS_TAG = ['adicionar', 'remover', 'definir'] as const;
export const ESCOPOS_FILTRO = ['empresas'] as const;
const CARTEIRAS = ['', 'bpo', 'diagnostico', 'ambas', 'nenhuma'];
const SITUACOES = ['', 'PROPOSTA', 'ATIVO', 'PAUSADO', 'ENCERRADO'];

type Ator = { id: string; role?: string };

function nomeValido(valor: unknown, rotulo: string, max: number) {
  const n = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (!n) throw new BadRequestException(`Informe o nome da ${rotulo}.`);
  if (n.length > max) throw new BadRequestException(`O nome da ${rotulo} pode ter até ${max} caracteres.`);
  return n;
}

function corValida(valor: unknown) {
  if (valor === undefined || valor === null || valor === '') return COR_PADRAO;
  const c = String(valor);
  if (!COR.test(c)) throw new BadRequestException('A cor precisa estar no formato #RRGGBB.');
  return c.toUpperCase();
}

const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** Mantém só os critérios que a lista de empresas conhece, com tamanho limitado: o que vier a mais é descartado. */
export function criteriosDeEmpresas(bruto: unknown) {
  const c = (bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}) as Record<string, unknown>;
  const carteira = texto(c.carteira, 20);
  const situacao = texto(c.situacao, 20);
  return {
    busca: texto(c.busca, 100),
    grupo: texto(c.grupo, 30),
    carteira: CARTEIRAS.includes(carteira) ? carteira : '',
    situacao: SITUACOES.includes(situacao) ? situacao : '',
    tags: Array.isArray(c.tags) ? [...new Set(c.tags.map((t) => texto(t, 40)).filter(Boolean))].slice(0, 30) : [],
    tagModo: c.tagModo === 'todas' ? 'todas' : 'qualquer',
    colaborador: texto(c.colaborador, 40),
  };
}

/**
 * Etiquetas das empresas e listas salvas (filtros que a pessoa quer reabrir com um clique). Qualquer pessoa cria e aplica etiquetas;
 * apagar uma etiqueta mexe em todas as empresas que a usam, por isso é só do administrador.
 */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Etiquetas ─────────────────────────────────────────────────────
  async listar() {
    const tags = await this.prisma.tag.findMany({ orderBy: { nome: 'asc' }, include: { _count: { select: { empresas: true } } } });
    return tags.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor, empresas: t._count.empresas }));
  }

  /** empresa_id → ids das etiquetas dela (um pedido só para pintar as listas inteiras). */
  async porEmpresa() {
    const rel = await this.prisma.empresaTag.findMany({ select: { tag_id: true, empresa_id: true } });
    const mapa: Record<string, string[]> = {};
    for (const r of rel) (mapa[r.empresa_id] ??= []).push(r.tag_id);
    return mapa;
  }

  private async nomeEmUso(nome: string, exceto?: string) {
    return this.prisma.tag.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' }, ...(exceto ? { id: { not: exceto } } : {}) } });
  }

  async criar(entrada: { nome?: string; cor?: string }) {
    const nome = nomeValido(entrada.nome, 'etiqueta', 40);
    const cor = corValida(entrada.cor);
    if (await this.nomeEmUso(nome)) throw new ConflictException('Já existe uma etiqueta com esse nome.');
    const t = await this.prisma.tag.create({ data: { nome, cor } });
    return { id: t.id, nome: t.nome, cor: t.cor, empresas: 0 };
  }

  async atualizar(id: string, entrada: { nome?: string; cor?: string }) {
    const t = await this.prisma.tag.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Etiqueta não encontrada.');
    const data: { nome?: string; cor?: string } = {};
    if (entrada.nome !== undefined) {
      data.nome = nomeValido(entrada.nome, 'etiqueta', 40);
      if (await this.nomeEmUso(data.nome, id)) throw new ConflictException('Já existe uma etiqueta com esse nome.');
    }
    if (entrada.cor !== undefined) data.cor = corValida(entrada.cor);
    const novo = await this.prisma.tag.update({ where: { id }, data });
    return { id: novo.id, nome: novo.nome, cor: novo.cor };
  }

  async excluir(id: string) {
    const t = await this.prisma.tag.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Etiqueta não encontrada.');
    await this.prisma.tag.delete({ where: { id } }); // as ligações com as empresas saem em cascata
    return { excluida: true };
  }

  /** Muda várias empresas de uma vez para UMA etiqueta: adicionar, remover ou definir (deixa só as enviadas). */
  async aplicar(entrada: { tag_id?: string; empresa_ids?: string[]; modo?: string }) {
    const modo = entrada.modo ?? 'adicionar';
    if (!MODOS_TAG.includes(modo as never)) throw new BadRequestException('Modo inválido. Use adicionar, remover ou definir.');
    const tag = await this.prisma.tag.findUnique({ where: { id: String(entrada.tag_id ?? '') } });
    if (!tag) throw new NotFoundException('Etiqueta não encontrada.');
    const ids = [...new Set((entrada.empresa_ids ?? []).map(String))];
    if (modo !== 'definir' && ids.length === 0) throw new BadRequestException('Escolha pelo menos uma empresa.');
    if (ids.length && (await this.prisma.empresa.count({ where: { id: { in: ids } } })) !== ids.length) throw new NotFoundException('Alguma empresa escolhida não existe mais.');
    const atuais = new Set((await this.prisma.empresaTag.findMany({ where: { tag_id: tag.id }, select: { empresa_id: true } })).map((r) => r.empresa_id));
    const adicionar = modo === 'remover' ? [] : ids.filter((i) => !atuais.has(i));
    const remover = modo === 'adicionar' ? [] : modo === 'remover' ? ids.filter((i) => atuais.has(i)) : [...atuais].filter((i) => !ids.includes(i));
    if (adicionar.length) await this.prisma.empresaTag.createMany({ data: adicionar.map((empresa_id) => ({ tag_id: tag.id, empresa_id })), skipDuplicates: true });
    if (remover.length) await this.prisma.empresaTag.deleteMany({ where: { tag_id: tag.id, empresa_id: { in: remover } } });
    return { adicionadas: adicionar.length, removidas: remover.length, total: atuais.size + adicionar.length - remover.length };
  }

  /** Deixa uma empresa com exatamente estas etiquetas. */
  async definirDaEmpresa(empresaId: string, tagIds: string[] | undefined) {
    if (!(await this.prisma.empresa.count({ where: { id: empresaId } }))) throw new NotFoundException('Empresa não encontrada.');
    const ids = [...new Set((tagIds ?? []).map(String))];
    if (ids.length && (await this.prisma.tag.count({ where: { id: { in: ids } } })) !== ids.length) throw new NotFoundException('Alguma etiqueta escolhida não existe mais.');
    const atuais = new Set((await this.prisma.empresaTag.findMany({ where: { empresa_id: empresaId }, select: { tag_id: true } })).map((r) => r.tag_id));
    const adicionar = ids.filter((i) => !atuais.has(i));
    const remover = [...atuais].filter((i) => !ids.includes(i));
    if (adicionar.length) await this.prisma.empresaTag.createMany({ data: adicionar.map((tag_id) => ({ tag_id, empresa_id: empresaId })), skipDuplicates: true });
    if (remover.length) await this.prisma.empresaTag.deleteMany({ where: { empresa_id: empresaId, tag_id: { in: remover } } });
    return { tag_ids: ids };
  }

  // ── Listas salvas ─────────────────────────────────────────────────
  private escopoValido(escopo: unknown) {
    const e = String(escopo ?? 'empresas');
    if (!ESCOPOS_FILTRO.includes(e as never)) throw new BadRequestException('Escopo inválido.');
    return e;
  }

  /** As listas da pessoa e as compartilhadas pela equipe, com o nome de quem criou. */
  async listarFiltros(user: Ator, escopo?: string) {
    const e = this.escopoValido(escopo);
    const filtros = await this.prisma.filtroSalvo.findMany({ where: { escopo: e, OR: [{ dono: user.id }, { compartilhado: true }] }, orderBy: { nome: 'asc' } });
    const donos = [...new Set(filtros.map((f) => f.dono))];
    const pessoas = donos.length ? await this.prisma.user.findMany({ where: { id: { in: donos } }, select: { id: true, name: true, email: true } }) : [];
    const nome = new Map(pessoas.map((p) => [p.id, p.name || p.email]));
    return filtros.map((f) => ({ id: f.id, nome: f.nome, escopo: f.escopo, criterios: f.criterios, compartilhado: f.compartilhado, meu: f.dono === user.id, criado_por: nome.get(f.dono) ?? null }));
  }

  /** Salvar com um nome que a pessoa já usou atualiza aquela lista, em vez de criar uma repetida. */
  async salvarFiltro(user: Ator, entrada: { nome?: string; escopo?: string; criterios?: unknown; compartilhado?: boolean }) {
    const escopo = this.escopoValido(entrada.escopo);
    const nome = nomeValido(entrada.nome, 'lista', 60);
    const criterios = criteriosDeEmpresas(entrada.criterios);
    const existente = await this.prisma.filtroSalvo.findFirst({ where: { dono: user.id, escopo, nome: { equals: nome, mode: 'insensitive' } } });
    const dados = { nome, criterios, compartilhado: Boolean(entrada.compartilhado) };
    if (existente) {
      const f = await this.prisma.filtroSalvo.update({ where: { id: existente.id }, data: dados });
      return { id: f.id, nome: f.nome, substituida: true };
    }
    const f = await this.prisma.filtroSalvo.create({ data: { ...dados, escopo, dono: user.id } });
    return { id: f.id, nome: f.nome, substituida: false };
  }

  private async filtroDaPessoa(user: Ator, id: string) {
    const f = await this.prisma.filtroSalvo.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Lista não encontrada.');
    if (f.dono !== user.id && user.role !== 'admin') throw new ForbiddenException('Só quem criou a lista, ou um administrador, pode mudar ou apagar.');
    return f;
  }

  async atualizarFiltro(user: Ator, id: string, entrada: { nome?: string; compartilhado?: boolean }) {
    await this.filtroDaPessoa(user, id);
    const data: { nome?: string; compartilhado?: boolean } = {};
    if (entrada.nome !== undefined) data.nome = nomeValido(entrada.nome, 'lista', 60);
    if (entrada.compartilhado !== undefined) data.compartilhado = Boolean(entrada.compartilhado);
    const f = await this.prisma.filtroSalvo.update({ where: { id }, data });
    return { id: f.id, nome: f.nome, compartilhado: f.compartilhado };
  }

  async excluirFiltro(user: Ator, id: string) {
    await this.filtroDaPessoa(user, id);
    await this.prisma.filtroSalvo.delete({ where: { id } });
    return { excluida: true };
  }
}
