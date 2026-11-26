import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TIPOS_AJUSTE } from '../saneamento-estoques/fiscal/impactoSped';
import { CARGA_ERPS, idDoItemDaCarga, type ErpCarga } from './carga';
import { apelidosDoTexto, associarErp, CHAVE_APELIDOS, GRAUS, SITUACOES_ERP, TIPOS_CONHECIMENTO, type ErpBasico, type PerfilErp } from './logica';

/** Apelidos do nome (item OBSERVACAO "Apelidos do nome" ativo) de um ERP com os conhecimentos. */
const apelidosDe = (c: { tipo: string; chave?: string; texto?: string; ativo: boolean }[]) => c.filter((i) => i.ativo && i.tipo === 'OBSERVACAO' && i.chave === CHAVE_APELIDOS).flatMap((i) => apelidosDoTexto(i.texto));

type Usuario = { email?: string; role?: string } | undefined;
const quem = (u: Usuario) => u?.email ?? 'sistema';
type Json = Record<string, unknown>;

const texto = (v: unknown, max: number) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const CAMPOS_ERP = ['nome', 'fabricante', 'produto', 'versoes', 'situacao', 'ativo'] as const;
const CAMPOS_ITEM = ['tipo', 'tipo_ajuste', 'chave', 'texto', 'campo_erp', 'fonte_url', 'grau', 'ordem', 'ativo'] as const;
const so = (o: Json, campos: readonly string[]) => Object.fromEntries(campos.map((c) => [c, o[c] ?? null]));
const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Dados do ERP vindos da tela, validados. `parcial` = atualização (só o que veio). */
export function validarErp(e: Json, parcial = false): Json {
  const d: Json = {};
  if (!parcial || e.nome !== undefined) { const n = texto(e.nome, 120); if (!n) throw new BadRequestException('Informe o nome do ERP.'); d.nome = n; }
  if (!parcial || e.fabricante !== undefined) { const f = texto(e.fabricante, 120); if (!f) throw new BadRequestException('Informe o fabricante.'); d.fabricante = f; }
  if (e.produto !== undefined) d.produto = texto(e.produto, 160);
  if (e.versoes !== undefined) {
    if (!Array.isArray(e.versoes)) throw new BadRequestException('As versões devem ser uma lista.');
    d.versoes = [...new Set(e.versoes.map((v) => String(v ?? '').trim().slice(0, 40)).filter(Boolean))].slice(0, 50);
  }
  if (!parcial || e.situacao !== undefined) {
    const s = String(e.situacao ?? 'A_DESENVOLVER');
    if (!(SITUACOES_ERP as readonly string[]).includes(s)) throw new BadRequestException('Situação do perfil inválida (COMPLETO, PARCIAL ou A_DESENVOLVER).');
    d.situacao = s;
  }
  if (e.ativo !== undefined) { if (typeof e.ativo !== 'boolean') throw new BadRequestException('"ativo" deve ser verdadeiro ou falso.'); d.ativo = e.ativo; }
  return d;
}

/** Item de conhecimento vindo da tela, validado. Sem fonte oficial o grau é sempre NAO_CONFIRMADO. */
export function validarItem(e: Json, parcial = false): Json {
  const d: Json = {};
  if (!parcial || e.tipo !== undefined) {
    if (!(TIPOS_CONHECIMENTO as readonly string[]).includes(String(e.tipo))) throw new BadRequestException(`Tipo de conhecimento inválido (${TIPOS_CONHECIMENTO.join(', ')}).`);
    d.tipo = e.tipo;
  }
  if (e.tipo_ajuste !== undefined) {
    const t = e.tipo_ajuste == null || e.tipo_ajuste === '' ? null : String(e.tipo_ajuste);
    if (t && !(TIPOS_AJUSTE as readonly string[]).includes(t)) throw new BadRequestException(`Tipo de ajuste inválido (${TIPOS_AJUSTE.join(', ')}).`);
    d.tipo_ajuste = t;
  }
  if (!parcial || e.chave !== undefined) { const c = texto(e.chave, 200); if (!c) throw new BadRequestException('Informe o rótulo (ou, nas colunas do export, o campo do saneamento).'); d.chave = c; }
  if (!parcial || e.texto !== undefined) { const t = texto(e.texto, 8000); if (!t) throw new BadRequestException('Informe o texto.'); d.texto = t; }
  if (e.campo_erp !== undefined) d.campo_erp = texto(e.campo_erp, 300);
  if (e.fonte_url !== undefined) {
    const u = texto(e.fonte_url, 600);
    if (u && !/^https?:\/\//i.test(u)) throw new BadRequestException('A fonte deve ser um endereço (http ou https).');
    d.fonte_url = u;
  }
  if (!parcial || e.grau !== undefined) {
    const g = String(e.grau ?? 'NAO_CONFIRMADO');
    if (!(GRAUS as readonly string[]).includes(g)) throw new BadRequestException('Grau inválido (CONFIRMADO ou NAO_CONFIRMADO).');
    d.grau = g;
  }
  if (e.ordem !== undefined) { const n = Number(e.ordem); if (!Number.isInteger(n)) throw new BadRequestException('A ordem deve ser um número inteiro.'); d.ordem = n; }
  if (e.ativo !== undefined) { if (typeof e.ativo !== 'boolean') throw new BadRequestException('"ativo" deve ser verdadeiro ou falso.'); d.ativo = e.ativo; }
  return d;
}

/** Perfil do ERP (só o conhecimento ativo), para as telas e os entregáveis. Sem ERP ou sem a tabela: null (regras gerais). */
export async function carregarPerfil(prisma: unknown, erpId: string | null | undefined): Promise<PerfilErp | null> {
  if (!erpId) return null;
  const p = prisma as { erp?: { findUnique: (a: unknown) => Promise<unknown> } };
  if (!p.erp?.findUnique) return null;
  const e = (await p.erp.findUnique({ where: { id: erpId }, include: { conhecimentos: { where: { ativo: true }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] } } })) as (ErpBasico & { situacao: string; conhecimentos: PerfilErp['itens'] }) | null;
  if (!e) return null;
  const { conhecimentos, ...erp } = e;
  return { ...erp, itens: conhecimentos };
}

/**
 * Nome do ERP para exibir (Excel, PDF, foto da versão, contexto da IA): o do Cadastro de ERPs pelo erp_id; sem vínculo (ou sem a tabela), o
 * texto antigo guardado no registro. null = nenhum dos dois.
 */
export async function nomeDoErp(prisma: unknown, erpId: string | null | undefined, textoAntigo?: string | null): Promise<string | null> {
  const p = prisma as { erp?: { findUnique: (a: unknown) => Promise<{ nome?: string } | null> } };
  const e = erpId && p.erp?.findUnique ? await p.erp.findUnique({ where: { id: erpId }, select: { nome: true } }) : null;
  return e?.nome || String(textoAntigo ?? '').trim() || null;
}

/** Cadastro de ERPs: lista, ficha, edição (só administrador, com histórico), carga inicial e associação dos textos antigos. */
@Injectable()
export class ErpsService implements OnApplicationBootstrap {
  private readonly log = new Logger(ErpsService.name);
  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    void this.iniciar();
  }

  /** Carga inicial + associação dos textos antigos. Falha não derruba o servidor. */
  async iniciar() {
    try {
      const c = await this.aplicarCarga();
      const a = await this.associarTextosAntigos();
      this.log.log(`Cadastro de ERPs: ${c.criados} criado(s), ${c.atualizados} atualizado(s) pela carga; ${a.empresas} cliente(s) e ${a.projetos} projeto(s) associados.`);
    } catch (e) {
      this.log.warn(`Cadastro de ERPs: carga inicial não aplicada (${(e as Error).message}).`);
    }
  }

  async listar() {
    const erps = await this.prisma.erp.findMany({ orderBy: { nome: 'asc' }, include: { conhecimentos: { select: { tipo: true, grau: true, ativo: true, chave: true, texto: true } } } });
    return erps.map(({ conhecimentos, ...e }) => {
      const ativos = conhecimentos.filter((c) => c.ativo);
      return { ...e, apelidos: apelidosDe(conhecimentos), itens: ativos.length, confirmados: ativos.filter((c) => c.grau === 'CONFIRMADO').length, restricoes: ativos.filter((c) => c.tipo === 'RESTRICAO').length };
    });
  }

  /** Ficha do ERP com o histórico. O e-mail de quem alterou só vai para o administrador; para os demais, o nome da pessoa (ou "usuário"). */
  async obter(id: string, leitor?: Usuario) {
    const e = await this.prisma.erp.findUnique({ where: { id }, include: { conhecimentos: { orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }, { createdAt: 'asc' }] } } });
    if (!e) throw new NotFoundException('ERP não encontrado.');
    const bruto = await this.prisma.erpHistorico.findMany({ where: { erp_id: id }, orderBy: { createdAt: 'desc' }, take: 300 });
    if (leitor?.role === 'admin') return { ...e, historico: bruto };
    const emails = [...new Set(bruto.map((h) => h.usuario).filter((u) => u.includes('@')))];
    const p = this.prisma as unknown as { user?: { findMany: (a: unknown) => Promise<{ email: string; name: string | null }[]> } };
    const nomes = new Map((emails.length && p.user?.findMany ? await p.user.findMany({ where: { email: { in: emails } }, select: { email: true, name: true } }) : []).map((u) => [u.email, u.name]));
    const historico = bruto.map((h) => (h.usuario.includes('@') ? { ...h, usuario: nomes.get(h.usuario)?.trim() || 'usuário' } : h));
    return { ...e, historico };
  }

  async perfil(id: string) {
    const p = await carregarPerfil(this.prisma, id);
    if (!p) throw new NotFoundException('ERP não encontrado.');
    return p;
  }

  async criar(e: Json, usuario: Usuario) {
    const d = validarErp(e);
    await this.nomeLivre(String(d.nome));
    const r = await this.prisma.$transaction(async (tx) => {
      const erp = await tx.erp.create({ data: d as never });
      await tx.erpHistorico.create({ data: { erp_id: erp.id, acao: 'CRIOU', usuario: quem(usuario), antes: undefined, depois: so(erp as unknown as Json, CAMPOS_ERP) as never } });
      return erp;
    });
    await this.associarTextosAntigos();
    return r;
  }

  async atualizar(id: string, e: Json, usuario: Usuario) {
    const d = validarErp(e, true);
    const atual = await this.prisma.erp.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('ERP não encontrado.');
    if (d.nome !== undefined && d.nome !== atual.nome) await this.nomeLivre(String(d.nome), id);
    const r = await this.prisma.$transaction(async (tx) => {
      const novo = await tx.erp.update({ where: { id }, data: d as never });
      await tx.erpHistorico.create({ data: { erp_id: id, acao: 'ALTEROU', usuario: quem(usuario), antes: so(atual as unknown as Json, CAMPOS_ERP) as never, depois: so(novo as unknown as Json, CAMPOS_ERP) as never } });
      return novo;
    });
    if (d.nome !== undefined || d.produto !== undefined || d.ativo !== undefined) await this.associarTextosAntigos();
    return r;
  }

  async criarItem(erpId: string, e: Json, usuario: Usuario) {
    const d = validarItem(e);
    if (!(await this.prisma.erp.findUnique({ where: { id: erpId } }))) throw new NotFoundException('ERP não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.erpConhecimento.create({ data: { ...(d as object), erp_id: erpId } as never });
      await tx.erpHistorico.create({ data: { erp_id: erpId, conhecimento_id: item.id, acao: 'CRIOU', usuario: quem(usuario), depois: so(item as unknown as Json, CAMPOS_ITEM) as never } });
      return item;
    });
  }

  async atualizarItem(erpId: string, itemId: string, e: Json, usuario: Usuario) {
    const d = validarItem(e, true);
    const atual = await this.prisma.erpConhecimento.findUnique({ where: { id: itemId } });
    if (!atual || atual.erp_id !== erpId) throw new NotFoundException('Item de conhecimento não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const novo = await tx.erpConhecimento.update({ where: { id: itemId }, data: d as never });
      await tx.erpHistorico.create({ data: { erp_id: erpId, conhecimento_id: itemId, acao: 'ALTEROU', usuario: quem(usuario), antes: so(atual as unknown as Json, CAMPOS_ITEM) as never, depois: so(novo as unknown as Json, CAMPOS_ITEM) as never } });
      return novo;
    });
  }

  private async nomeLivre(nome: string, exceto?: string) {
    const ja = await this.prisma.erp.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' }, ...(exceto ? { id: { not: exceto } } : {}) } });
    if (ja) throw new ConflictException('Já existe um ERP com este nome.');
  }

  /**
   * Carga inicial (idempotente): cria o ERP e o item que faltam (pelo id fixo) e atualiza só o que nenhuma pessoa editou (sem histórico de
   * CRIOU/ALTEROU). O que o administrador mudou nunca é sobrescrito. Tudo o que a carga faz fica no histórico como CARGA.
   */
  async aplicarCarga(carga: ErpCarga[] = CARGA_ERPS) {
    let criados = 0; let atualizados = 0;
    const editados = new Set((await this.prisma.erpHistorico.findMany({ where: { acao: { in: ['CRIOU', 'ALTEROU'] } }, select: { erp_id: true, conhecimento_id: true } })).map((h) => h.conhecimento_id ?? `erp:${h.erp_id}`));
    for (const c of carga) {
      const dadosErp = { nome: c.nome, fabricante: c.fabricante, produto: c.produto ?? null, versoes: c.versoes, situacao: c.situacao };
      const erp = await this.prisma.erp.findUnique({ where: { id: c.id } });
      if (!erp) {
        // Um ERP com o mesmo nome criado à mão fica como está (o nome é único): a carga desse ERP não entra.
        if (await this.prisma.erp.findFirst({ where: { nome: { equals: c.nome, mode: 'insensitive' } } })) continue;
        await this.prisma.erp.create({ data: { id: c.id, ...dadosErp } });
        await this.prisma.erpHistorico.create({ data: { erp_id: c.id, acao: 'CARGA', usuario: 'sistema', depois: dadosErp as never } });
        criados++;
      } else if (!editados.has(`erp:${c.id}`) && !igual(so(erp as unknown as Json, Object.keys(dadosErp)), dadosErp)) {
        await this.prisma.erp.update({ where: { id: c.id }, data: dadosErp });
        await this.prisma.erpHistorico.create({ data: { erp_id: c.id, acao: 'CARGA', usuario: 'sistema', antes: so(erp as unknown as Json, Object.keys(dadosErp)) as never, depois: dadosErp as never } });
        atualizados++;
      }
      for (const [ordem, i] of c.itens.entries()) {
        const id = idDoItemDaCarga(c.id, i.k);
        const dados = { tipo: i.tipo, tipo_ajuste: i.tipo_ajuste ?? null, chave: i.chave, texto: i.texto, campo_erp: i.campo_erp ?? null, fonte_url: i.fonte_url, grau: i.grau, ordem };
        const atual = await this.prisma.erpConhecimento.findUnique({ where: { id } });
        if (!atual) {
          await this.prisma.erpConhecimento.create({ data: { id, erp_id: c.id, ...dados } });
          criados++;
        } else if (!editados.has(id) && !igual(so(atual as unknown as Json, Object.keys(dados)), dados)) {
          await this.prisma.erpConhecimento.update({ where: { id }, data: dados });
          await this.prisma.erpHistorico.create({ data: { erp_id: c.id, conhecimento_id: id, acao: 'CARGA', usuario: 'sistema', antes: so(atual as unknown as Json, Object.keys(dados)) as never, depois: dados as never } });
          atualizados++;
        }
      }
    }
    return { criados, atualizados };
  }

  /**
   * Textos antigos de ERP (cadastro do cliente e projeto de saneamento) sem vínculo: associa quando o nome casa, sem ambiguidade, com um ERP
   * do cadastro. O texto fica como estava; o que não casa continua sem vínculo e a tela pede para selecionar na lista.
   */
  async associarTextosAntigos() {
    const lidos = await this.prisma.erp.findMany({ select: { id: true, nome: true, fabricante: true, produto: true, ativo: true, conhecimentos: { select: { tipo: true, chave: true, texto: true, ativo: true } } } });
    const erps: ErpBasico[] = lidos.map(({ conhecimentos, ...e }) => ({ ...e, apelidos: apelidosDe(conhecimentos ?? []) }));
    let empresas = 0; let projetos = 0;
    const porTexto = (lista: { id: string; erp: string | null }[]) => {
      const m = new Map<string, string[]>();
      for (const r of lista) { const e = associarErp(r.erp, erps); if (e) { const l = m.get(e.id); if (l) l.push(r.id); else m.set(e.id, [r.id]); } }
      return m;
    };
    const emp = await this.prisma.empresa.findMany({ where: { erp_id: null, erp: { not: null } }, select: { id: true, erp: true } });
    for (const [erpId, ids] of porTexto(emp)) empresas += (await this.prisma.empresa.updateMany({ where: { id: { in: ids }, erp_id: null }, data: { erp_id: erpId } })).count;
    const proj = await this.prisma.sanProjeto.findMany({ where: { erp_id: null, erp: { not: null } }, select: { id: true, erp: true } });
    for (const [erpId, ids] of porTexto(proj)) projetos += (await this.prisma.sanProjeto.updateMany({ where: { id: { in: ids }, erp_id: null }, data: { erp_id: erpId } })).count;
    return { empresas, projetos };
  }
}
