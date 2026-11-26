import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { camadasAfetadas } from '../motor';
import type { Camada } from '../tipos';
import { regravarImpactosDosCasos } from './impactos-casos';
import {
  CAMPOS_TOPO, TX_LONGA, acrescentar, aplicarCampo, conflito, derivadosDoTrabalho, exigirVersao, fatiar, igual, quem, valorDoCampo, type Json, type Usuario,
} from './constantes';
import { SanProjetoService } from './projeto.service';
import { SanVersoesService } from './versoes.service';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type Db = Pick<Tx, 'sanItem' | 'sanDecisao' | 'sanCaso'>;
type Campo = { campo: string; antes: unknown; depois: unknown };
type Mudanca = { id: string; codigo: string; estabelecimento: string; versao: number; trabalho: Json; campos: Campo[] };
type CasoAfetado = { id: string; camada: string; afeta: string[]; versao: number; itens: string[]; decidido_por: string | null; decidido_em: Date | null };
/** Caso que voltou a "proposto" com a restauração: o desfazer o devolve a aprovado (se ninguém mexeu nele depois). */
type CasoReaberto = { id: string; versaoDepois: number; decidido_por: string | null; decidido_em: string | null };
type VinculoGuardado = { de: string; para: string; justificativa: string; criado_por: string | null };
/** Registro de uma restauração, guardado no `resumo` da versão usada como base (lista `restauracoes`). */
export type Restauracao = {
  id: string; quando: string; usuario: string; justificativa: string; itens: number; campos: number; casosDecididosDepois: number;
  casos?: CasoReaberto[]; vinculos?: VinculoGuardado[];
  desfeita: { por: string; em: string } | null;
};
/** Linha da gravação em bloco: item, versão vista e o trabalho novo. */
export type LinhaItem = { id: string; versao: number; codigo: string; trabalho: Json };

const LOTE_LEITURA = 5000;
const LOTE_GRAVACAO = 1000;
const AMOSTRA = 100;
const MIN_JUSTIFICATIVA = 10;
/** Id das decisões de uma restauração: prefixo estruturado (não vem da justificativa, que não consegue imitá-lo). Sem "_" nem "%" (curingas do LIKE). */
const prefixoDecisao = (restauracaoId: string) => `rst-${restauracaoId}-`;
const etiquetaCaso = (id: string) => `[caso:${id}]`;
const bad = (codigo: string, message: string) => new BadRequestException({ statusCode: 400, codigo, message });
const topo = (c: string) => (CAMPOS_TOPO as readonly string[]).includes(c);
const chaveCodigo = (estabelecimento: string, codigo: unknown) => `${estabelecimento}\u0000${String(codigo)}`;

/**
 * Campos em que a base de trabalho difere da foto, com o nome que as decisões usam: campo de topo pelo nome; campo extra pelo nome
 * (ou `campos.nome` quando repete o nome de um campo de topo). `id` e `estabelecimento` nunca mudam por decisão.
 */
export function diferencasDoTrabalho(atual: Json, alvo: Json): Campo[] {
  const r: Campo[] = [];
  for (const c of CAMPOS_TOPO) if (!igual(atual[c], alvo[c])) r.push({ campo: c, antes: atual[c] ?? null, depois: alvo[c] ?? null });
  const ea = (atual.campos as Json) ?? {};
  const eb = (alvo.campos as Json) ?? {};
  for (const c of [...new Set([...Object.keys(ea), ...Object.keys(eb)])].sort()) {
    if (!igual(ea[c], eb[c])) r.push({ campo: topo(c) ? `campos.${c}` : c, antes: ea[c] ?? null, depois: eb[c] ?? null });
  }
  return r;
}

/** Camadas que passam a "revisar" quando estes campos mudam: a mesma regra da aprovação (`camadasAfetadas`, com NCM → tributário → obrigações). */
export function camadasDosCampos(campos: string[]): Camada[] {
  const proposta = Object.fromEntries(campos.map((c) => [c.replace(/^campos\./, ''), 1]));
  return camadasAfetadas({ camada: 'RESTAURACAO' as Camada, tipo: 'RESTAURACAO', proposta });
}

/**
 * Grava o trabalho de vários itens, conferindo a versão de cada um. No Postgres, UM `UPDATE ... FROM jsonb_to_recordset` por bloco de
 * 1000 itens (30 mil itens = 30 comandos, não 30 mil); se algum item mudou de versão, o bloco atualiza menos linhas e a transação
 * inteira é desfeita (409). Sem SQL bruto (testes em memória), um `updateMany` por item com a mesma conferência.
 */
export async function gravarItensEmBloco(tx: Tx, projetoId: string, linhas: LinhaItem[], mensagem: (codigo: string) => string) {
  const bruto = (tx as unknown as { $executeRaw?: unknown }).$executeRaw;
  for (const lote of fatiar(linhas, LOTE_GRAVACAO)) {
    if (typeof bruto === 'function') {
      const dados = lote.map((l) => ({ id: l.id, versao: l.versao, trabalho: l.trabalho, ...derivadosDoTrabalho(l.trabalho) }));
      const n = await tx.$executeRaw(Prisma.sql`UPDATE "SanItem" AS i SET "trabalho" = v.trabalho, "descricao" = v.descricao, "grupo" = v.grupo, "finalidade" = v.finalidade,
          "tambem_usado_como" = v.tambem_usado_como, "conjunto_chave" = v.conjunto_chave, "ativo" = v.ativo, "versao" = i."versao" + 1, "updatedAt" = now()
        FROM jsonb_to_recordset(${JSON.stringify(dados)}::jsonb) AS v(id text, versao int, trabalho jsonb, descricao text, grupo text, finalidade text, tambem_usado_como jsonb, conjunto_chave text, ativo boolean)
        WHERE i."id" = v.id AND i."versao" = v.versao AND i."projeto_id" = ${projetoId}`);
      if (n !== lote.length) throw conflito(mensagem(lote.length === 1 ? lote[0].codigo : 'de um dos itens'));
      continue;
    }
    for (const l of lote) {
      const r = await tx.sanItem.updateMany({ where: { id: l.id, projeto_id: projetoId, versao: l.versao }, data: { trabalho: l.trabalho as never, ...derivadosDoTrabalho(l.trabalho), versao: { increment: 1 } } });
      if (r.count === 0) throw conflito(mensagem(l.codigo));
    }
  }
}

/**
 * "Continuar a partir desta versão": a base de trabalho volta aos valores da foto de uma versão liberada. NADA é apagado: cada campo
 * que muda grava uma decisão `restaurar` (antes, depois, quem, quando, justificativa), rastreável no histórico e desfazível.
 *
 * Caso APROVADO cujo valor aplicado deixa de valer (o campo volta a outro valor) volta a PROPOSTO, como no desfazer de um caso: a célula
 * volta a "proposto", as linhas de impacto no SPED são regravadas e os vínculos de código dele saem (guardados para o desfazer). As
 * decisões dele continuam no histórico; dá para aprovar de novo ou rejeitar. OBSOLETO não serve aqui: é só para caso proposto sem edição
 * que a reexecução deixou de produzir. As dependências ("revisar") seguem a regra da aprovação: `camadasAfetadas` dos campos e o `afeta`
 * dos casos reabertos.
 */
@Injectable()
export class SanRestauracaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly versoes: SanVersoesService,
    private readonly projetos: SanProjetoService,
  ) {}

  /** O que mudaria (só lê). `previa` é a assinatura da base vista: a restauração recusa (409) se a base mudou depois. */
  async previa(projetoId: string, versaoId: string) {
    const p = await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true, versao: true } });
    if (!p) throw new NotFoundException('Projeto de saneamento não encontrado.');
    const calc = await this.calcular(this.prisma, projetoId, versaoId);
    const porCampo = new Map<string, number>();
    for (const m of calc.mudancas) for (const c of m.campos) porCampo.set(c.campo, (porCampo.get(c.campo) ?? 0) + 1);
    return {
      versao: calc.versao, versaoProjeto: p.versao, previa: calc.assinatura,
      totais: {
        itens: calc.mudancas.length, campos: calc.mudancas.reduce((s, m) => s + m.campos.length, 0), itensNaFoto: calc.itensNaFoto,
        itensNovosDepois: calc.itensNovosDepois, itensAusentes: calc.itensAusentes, casosDecididosDepois: calc.casos.length,
      },
      porCampo: [...porCampo].map(([campo, itens]) => ({ campo, itens })).sort((a, b) => b.itens - a.itens || (a.campo < b.campo ? -1 : 1)),
      camadasRevisar: [...new Set(calc.mudancas.flatMap((m) => calc.camadasDoItem(m.id, m.campos.map((c) => c.campo))))].sort(),
      casosReabertos: calc.casos.slice(0, AMOSTRA).map((c) => ({ id: c.id, camada: c.camada })),
      amostra: calc.mudancas.slice(0, AMOSTRA).map(({ id, codigo, campos }) => ({ id, codigo, campos })),
      ignorados: calc.ignorados,
    };
  }

  /** Restaura a base de trabalho aos valores da foto, com justificativa. Exige a `versao` do projeto e a assinatura da prévia. */
  async continuar(projetoId: string, versaoId: string, e: { versao?: unknown; previa?: unknown; justificativa?: unknown }, usuario?: Usuario) {
    const versao = exigirVersao(e.versao);
    const justificativa = String(e.justificativa ?? '').trim().slice(0, 2000);
    if (justificativa.length < MIN_JUSTIFICATIVA) throw bad('JUSTIFICATIVA_CURTA', `Explique por que a base volta a esta versão (ao menos ${MIN_JUSTIFICATIVA} caracteres).`);
    if (typeof e.previa !== 'string' || !e.previa) throw new BadRequestException('Faça a prévia antes e envie a assinatura que ela mostrou ("previa").');
    const dataBase = await this.projetos.dataBase(projetoId);
    return this.prisma.$transaction(async (tx) => {
      // O projeto sobe de versão primeiro: duas restaurações ao mesmo tempo não passam juntas.
      const pr = await tx.sanProjeto.updateMany({ where: { id: projetoId, versao }, data: { versao: { increment: 1 } } });
      if (pr.count === 0) {
        if (!(await tx.sanProjeto.findUnique({ where: { id: projetoId }, select: { id: true } }))) throw new NotFoundException('Projeto de saneamento não encontrado.');
        throw conflito('O projeto foi alterado por outra pessoa depois da prévia. Refaça a prévia.');
      }
      const calc = await this.calcular(tx, projetoId, versaoId);
      if (calc.assinatura !== e.previa) throw conflito('A base de trabalho mudou depois da prévia. Refaça a prévia para ver o que muda agora.');
      if (!calc.mudancas.length) throw bad('NADA_A_RESTAURAR', `A base de trabalho já está igual à versão ${calc.versao.numero}: nada a restaurar.`);
      const id = randomUUID();
      const prefixo = prefixoDecisao(id);
      const fundamento = `Restauração da versão ${calc.versao.numero} (${calc.versao.rotulo}): ${justificativa}`;
      const quemFez = quem(usuario);
      let seq = 0;
      const linhas: LinhaItem[] = [];
      const decs: Json[] = [];
      for (const m of calc.mudancas) {
        const trabalho = JSON.parse(JSON.stringify(m.trabalho)) as Json;
        for (const c of m.campos) {
          aplicarCampo(trabalho, c.campo, c.depois, false);
          decs.push({ id: `${prefixo}${++seq}`, projeto_id: projetoId, item_id: m.id, caso_id: null, campo: c.campo, antes: (c.antes ?? null) as never, depois: (c.depois ?? null) as never, fundamento, usuario: quemFez, tipo: 'restaurar' });
        }
        linhas.push({ id: m.id, versao: m.versao, codigo: m.codigo, trabalho });
      }
      await gravarItensEmBloco(tx, projetoId, linhas, (cod) => `O item ${cod} foi alterado por outra pessoa durante a restauração. Refaça a prévia.`);
      for (const l of fatiar(decs, 2000)) await tx.sanDecisao.createMany({ data: l as never });
      await this.atualizarGrupos(tx, projetoId, linhas);

      // Casos cujo valor aplicado deixou de valer voltam a "proposto" (célula, impacto no SPED e vínculos coerentes com a base).
      const casos: CasoReaberto[] = [];
      for (const c of calc.casos) {
        const r = await tx.sanCaso.updateMany({ where: { id: c.id, versao: c.versao, situacao: 'APROVADO' }, data: { situacao: 'PROPOSTO', decidido_por: null, decidido_em: null, versao: { increment: 1 } } });
        if (r.count === 0) throw conflito('Um caso foi alterado por outra pessoa durante a restauração. Refaça a prévia.');
        casos.push({ id: c.id, versaoDepois: c.versao + 1, decidido_por: c.decidido_por, decidido_em: c.decidido_em ? new Date(c.decidido_em).toISOString() : null });
      }
      const idsCasos = casos.map((c) => c.id);
      for (const lote of fatiar(idsCasos, 1000)) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, caso_id: { in: lote }, situacao: 'APROVADO' }, data: { situacao: 'PROPOSTO' } });
      await this.regravarImpactos(tx, projetoId, idsCasos, dataBase);
      const vinculos = await this.tirarVinculos(tx, projetoId, idsCasos);

      const causa = `Revisar: a base de trabalho voltou aos valores da versão ${calc.versao.numero} (restauração); confira esta camada.`;
      const celulasRevisar = await this.marcarRevisar(tx, projetoId, calc.mudancas.map((m) => ({ id: m.id, camadas: calc.camadasDoItem(m.id, m.campos.map((c) => c.campo)) })), causa);
      const campos = decs.length;
      const registro: Restauracao = { id, quando: new Date().toISOString(), usuario: quemFez, justificativa, itens: calc.mudancas.length, campos, casosDecididosDepois: casos.length, casos, vinculos, desfeita: null };
      await this.gravarRegistro(tx, versaoId, (lista) => [...lista, registro]);
      return { restauracao: registro, versao: calc.versao, itens: registro.itens, campos, celulasRevisar, casosDecididosDepois: casos.length, ignorados: calc.ignorados };
    }, TX_LONGA);
  }

  /**
   * Desfaz uma restauração: cada campo volta ao valor de antes dela (decisão `desfazer`), os casos que ela reabriu voltam a aprovados
   * (célula, impacto no SPED e vínculos de volta) e as camadas dependentes ficam "revisar". Campo alterado de novo depois → 409
   * CAMPO_ALTERADO_DEPOIS; caso reaberto que alguém decidiu ou editou depois → 409 CASO_ALTERADO_DEPOIS. Já desfeita: não grava nada.
   */
  async desfazer(projetoId: string, versaoId: string, restauracaoId: string, e: { versao?: unknown }, usuario?: Usuario) {
    const dataBase = await this.projetos.dataBase(projetoId);
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.sanVersao.findFirst({ where: { id: versaoId, projeto_id: projetoId }, select: { id: true, numero: true, resumo: true } });
      if (!v) throw new NotFoundException('Versão não encontrada.');
      const registro = restauracoesDe(v.resumo).find((r) => r.id === restauracaoId);
      if (!registro) throw new NotFoundException('Restauração não encontrada.');
      if (registro.desfeita) return { restauracao: registro, jaDesfeita: true };
      const versao = exigirVersao(e.versao);
      const pr = await tx.sanProjeto.updateMany({ where: { id: projetoId, versao }, data: { versao: { increment: 1 } } });
      if (pr.count === 0) throw conflito();
      const decs = await tx.sanDecisao.findMany({ where: { projeto_id: projetoId, tipo: 'restaurar', id: { startsWith: prefixoDecisao(restauracaoId) } }, select: { item_id: true, campo: true, antes: true, depois: true } });
      const porItem = new Map<string, typeof decs>();
      for (const d of decs) acrescentar(porItem, d.item_id, d);
      const fundamento = `Restauração da versão ${v.numero} desfeita`;
      const quemFez = quem(usuario);
      const linhas: LinhaItem[] = [];
      const novas: Json[] = [];
      const alvos: { id: string; camadas: Camada[] }[] = [];
      for (const lote of fatiar([...porItem.keys()], LOTE_LEITURA)) {
        for (const item of await tx.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, codigo: true, trabalho: true, versao: true } })) {
          const lista = porItem.get(item.id)!;
          const trabalho = JSON.parse(JSON.stringify(item.trabalho)) as Json;
          for (const d of lista) {
            if (!igual(valorDoCampo(trabalho, d.campo), d.depois)) {
              throw new ConflictException({ statusCode: 409, codigo: 'CAMPO_ALTERADO_DEPOIS', message: `Não dá para desfazer: o campo "${d.campo}" do item ${item.codigo} foi alterado depois por outra decisão. Desfaça essa primeiro.` });
            }
            aplicarCampo(trabalho, d.campo, d.antes, false);
            novas.push({ projeto_id: projetoId, item_id: item.id, caso_id: null, campo: d.campo, antes: (d.depois ?? null) as never, depois: (d.antes ?? null) as never, fundamento, usuario: quemFez, tipo: 'desfazer' });
          }
          linhas.push({ id: item.id, versao: item.versao, codigo: item.codigo, trabalho });
          alvos.push({ id: item.id, camadas: camadasDosCampos(lista.map((d) => d.campo)) });
        }
      }
      await gravarItensEmBloco(tx, projetoId, linhas, () => 'Um item foi alterado por outra pessoa durante o desfazer. Tente de novo.');
      for (const l of fatiar(novas, 2000)) await tx.sanDecisao.createMany({ data: l as never });
      await this.atualizarGrupos(tx, projetoId, linhas);

      // Casos reabertos pela restauração voltam a aprovados, se ninguém os decidiu ou editou depois.
      const casos = registro.casos ?? [];
      for (const c of casos) {
        const r = await tx.sanCaso.updateMany({
          where: { id: c.id, versao: c.versaoDepois, situacao: 'PROPOSTO' },
          data: { situacao: 'APROVADO', decidido_por: c.decidido_por, decidido_em: c.decidido_em ? new Date(c.decidido_em) : null, versao: { increment: 1 } },
        });
        if (r.count === 0) throw new ConflictException({ statusCode: 409, codigo: 'CASO_ALTERADO_DEPOIS', message: 'Não dá para desfazer: um caso que a restauração reabriu foi decidido ou editado depois. Reabra-o (volte-o a proposto) antes.' });
      }
      const idsCasos = casos.map((c) => c.id);
      for (const lote of fatiar(idsCasos, 1000)) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, caso_id: { in: lote }, situacao: 'PROPOSTO' }, data: { situacao: 'APROVADO' } });
      await this.regravarImpactos(tx, projetoId, idsCasos, dataBase);
      await this.devolverVinculos(tx, projetoId, registro.vinculos ?? []);
      const afetaDosCasos = await this.afetaDosCasos(tx, idsCasos);
      for (const a of alvos) for (const cam of afetaDosCasos.get(a.id) ?? []) if (!a.camadas.includes(cam)) a.camadas.push(cam);
      await this.marcarRevisar(tx, projetoId, alvos, `Revisar: a restauração da versão ${v.numero} foi desfeita; confira esta camada.`);

      const desfeita = { por: quemFez, em: new Date().toISOString() };
      await this.gravarRegistro(tx, versaoId, (lista) => lista.map((r) => (r.id === restauracaoId ? { ...r, desfeita } : r)));
      return { restauracao: { ...registro, desfeita }, jaDesfeita: false, itens: porItem.size, campos: decs.length, casosAprovadosDeNovo: casos.length };
    }, TX_LONGA);
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async gravarRegistro(tx: Tx, versaoId: string, f: (lista: Restauracao[]) => Restauracao[]) {
    const v = await tx.sanVersao.findUnique({ where: { id: versaoId }, select: { resumo: true } });
    const resumo = ((v?.resumo as Json) ?? {}) as Json;
    await tx.sanVersao.update({ where: { id: versaoId }, data: { resumo: { ...resumo, restauracoes: f(restauracoesDe(resumo)) } as never } });
  }

  /** A célula guarda o grupo do item (visão geral): acompanha o trabalho novo. */
  private async atualizarGrupos(tx: Tx, projetoId: string, linhas: LinhaItem[]) {
    const porGrupo = new Map<string, string[]>();
    for (const l of linhas) { const g = derivadosDoTrabalho(l.trabalho).grupo ?? ''; acrescentar(porGrupo, g, l.id); }
    for (const [grupo, ids] of porGrupo) for (const lote of fatiar(ids, 5000)) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, item_id: { in: lote } }, data: { grupo } });
  }

  /** Marca "revisar" (célula já trabalhada) nas camadas de cada item, agrupando os itens com as mesmas camadas. */
  private async marcarRevisar(tx: Tx, projetoId: string, alvos: { id: string; camadas: string[] }[], causa: string) {
    const porCamadas = new Map<string, string[]>();
    for (const a of alvos) { const k = [...new Set(a.camadas)].sort().join(','); if (k) acrescentar(porCamadas, k, a.id); }
    let n = 0;
    for (const [camadas, ids] of porCamadas) {
      for (const lote of fatiar(ids, 5000)) {
        const x = await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, item_id: { in: lote }, camada: { in: camadas.split(',') }, situacao: { not: 'PENDENTE' } }, data: { revisar: true, revisar_causa: causa } });
        n += x.count;
      }
    }
    return n;
  }

  /** Regrava as linhas de impacto no SPED dos casos pela situação de agora: a MESMA função da decisão do caso (competência entregue, exceções). */
  private async regravarImpactos(tx: Tx, projetoId: string, casoIds: string[], dataBase: string) {
    await regravarImpactosDosCasos(tx, projetoId, casoIds, dataBase);
  }

  /** Tira a etiqueta dos casos reabertos dos vínculos de código (some o vínculo sem outro caso), guardando como estavam para o desfazer. */
  private async tirarVinculos(tx: Tx, projetoId: string, casoIds: string[]): Promise<VinculoGuardado[]> {
    if (!casoIds.length) return [];
    const tags = casoIds.map(etiquetaCaso);
    const guardados: VinculoGuardado[] = [];
    for (const v of await tx.sanVinculoCodigo.findMany({ where: { projeto_id: projetoId, justificativa: { contains: '[caso:' } } })) {
      if (!tags.some((t) => v.justificativa.includes(t))) continue;
      guardados.push({ de: v.de, para: v.para, justificativa: v.justificativa, criado_por: v.criado_por ?? null });
      const resto = tags.reduce((s, t) => s.split(t).join(''), v.justificativa);
      if (/\[caso:[^\]]+\]/.test(resto)) await tx.sanVinculoCodigo.update({ where: { id: v.id }, data: { justificativa: resto } });
      else await tx.sanVinculoCodigo.deleteMany({ where: { id: v.id } });
    }
    return guardados;
  }

  private async devolverVinculos(tx: Tx, projetoId: string, guardados: VinculoGuardado[]) {
    for (const g of guardados) {
      const ja = await tx.sanVinculoCodigo.findFirst({ where: { projeto_id: projetoId, de: g.de, para: g.para } });
      if (ja) await tx.sanVinculoCodigo.update({ where: { id: ja.id }, data: { justificativa: g.justificativa } });
      else await tx.sanVinculoCodigo.create({ data: { projeto_id: projetoId, de: g.de, para: g.para, justificativa: g.justificativa, criado_por: g.criado_por } });
    }
  }

  /** item → camadas do `afeta` dos casos (para as dependências). */
  private async afetaDosCasos(db: Db, casoIds: string[]) {
    const s = new Map<string, Set<Camada>>();
    for (const lote of fatiar(casoIds, 1000)) {
      for (const c of await db.sanCaso.findMany({ where: { id: { in: lote } }, select: { itens: true, afeta: true, camada: true } })) {
        const afeta = ((c.afeta as string[]) ?? []).filter((x) => x !== c.camada) as Camada[];
        for (const i of c.itens) { const x = s.get(i) ?? new Set<Camada>(); for (const a of afeta) x.add(a); s.set(i, x); }
      }
    }
    return new Map([...s].map(([i, x]) => [i, [...x]] as const));
  }

  /** Compara a base de agora com a foto (itens lidos em blocos), acha os casos aprovados que deixam de valer e monta a assinatura. */
  private async calcular(db: Db, projetoId: string, versaoId: string) {
    // Só a seção `itens` da foto vira objeto (células, casos, decisões etc. não são lidos): prévia e continuar com pouca memória.
    const { versao, itens: alvo } = await this.versoes.trabalhoDosItensDaFoto(projetoId, versaoId);
    const mudancas: Mudanca[] = [];
    // Códigos em uso (coluna e código de trabalho), por estabelecimento: o restaurado não pode repetir o de outro item.
    const codigos = new Map<string, Set<string>>();
    const usar = (k: string, id: string) => { const s = codigos.get(k) ?? new Set<string>(); s.add(id); codigos.set(k, s); };
    let itensNovosDepois = 0;
    let vistos = 0;
    let cursor: string | undefined;
    for (;;) {
      const lote = await db.sanItem.findMany({
        where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: LOTE_LEITURA, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, codigo: true, estabelecimento: true, trabalho: true, versao: true },
      });
      for (const i of lote) {
        const trabalho = ((i.trabalho as Json) ?? {}) as Json;
        usar(chaveCodigo(i.estabelecimento, i.codigo), i.id);
        if (trabalho.codigo != null) usar(chaveCodigo(i.estabelecimento, trabalho.codigo), i.id);
        const t = alvo.get(i.id);
        if (!t) { itensNovosDepois++; continue; }
        vistos++;
        const campos = diferencasDoTrabalho(trabalho, t);
        if (campos.length) mudancas.push({ id: i.id, codigo: i.codigo, estabelecimento: i.estabelecimento, versao: i.versao, trabalho, campos });
      }
      if (lote.length < LOTE_LEITURA) break;
      cursor = lote[lote.length - 1].id;
    }

    // Código que voltaria a repetir o de outro item do mesmo estabelecimento (coluna, código de trabalho ou outro restaurado): fica de fora.
    const ignorados: { itemId: string; codigo: string; campo: string; motivo: string }[] = [];
    const novoCodigo = (m: Mudanca) => m.campos.find((c) => c.campo === 'codigo' && c.depois != null)?.depois;
    for (const m of mudancas) { const n = novoCodigo(m); if (n != null) usar(chaveCodigo(m.estabelecimento, n), m.id); }
    for (const m of mudancas) {
      const n = novoCodigo(m);
      if (n == null) continue;
      const donos = codigos.get(chaveCodigo(m.estabelecimento, n)) ?? new Set<string>();
      if ([...donos].some((x) => x !== m.id)) {
        m.campos = m.campos.filter((c) => c.campo !== 'codigo');
        ignorados.push({ itemId: m.id, codigo: m.codigo, campo: 'codigo', motivo: `O código ${String(n)} já é usado por outro item deste estabelecimento: o código atual foi mantido.` });
      }
    }
    const efetivas = mudancas.filter((m) => m.campos.length);

    // Casos APROVADOS com decisão de aplicação vigente (a última do caso no item e campo é "aprovar") num campo que volta a OUTRO valor.
    const destino = new Map<string, unknown>();
    for (const m of efetivas) for (const c of m.campos) destino.set(`${m.id}\u0000${c.campo}`, c.depois);
    const ultima = new Map<string, { caso: string; tipo: string; depois: unknown; item: string; campo: string }>();
    for (const lote of fatiar(efetivas.map((m) => m.id), LOTE_LEITURA)) {
      const decs = await db.sanDecisao.findMany({
        where: { projeto_id: projetoId, item_id: { in: lote }, caso_id: { not: null }, tipo: { in: ['aprovar', 'desfazer'] } },
        orderBy: [{ quando: 'asc' }, { id: 'asc' }], select: { item_id: true, campo: true, caso_id: true, tipo: true, depois: true },
      });
      for (const d of decs) ultima.set(`${d.caso_id}\u0000${d.item_id}\u0000${d.campo}`, { caso: d.caso_id!, tipo: d.tipo, depois: d.depois, item: d.item_id, campo: d.campo });
    }
    const candidatos = new Set<string>();
    for (const u of ultima.values()) {
      const k = `${u.item}\u0000${u.campo}`;
      if (u.tipo === 'aprovar' && destino.has(k) && !igual(destino.get(k), u.depois)) candidatos.add(u.caso);
    }
    const casos: CasoAfetado[] = [];
    for (const lote of fatiar([...candidatos], LOTE_LEITURA)) {
      const achados = await db.sanCaso.findMany({ where: { projeto_id: projetoId, id: { in: lote }, situacao: 'APROVADO' }, select: { id: true, camada: true, afeta: true, versao: true, itens: true, decidido_por: true, decidido_em: true } });
      for (const c of achados) casos.push({ ...c, afeta: (c.afeta as string[]) ?? [] });
    }
    casos.sort((a, b) => (a.id < b.id ? -1 : 1));
    const afetaPorItem = new Map<string, Set<string>>();
    for (const c of casos) for (const i of c.itens) { const s = afetaPorItem.get(i) ?? new Set<string>(); for (const a of c.afeta) if (a !== c.camada) s.add(a); afetaPorItem.set(i, s); }
    const camadasDoItem = (id: string, campos: string[]) => [...new Set([...camadasDosCampos(campos), ...(afetaPorItem.get(id) ?? [])])].sort();
    const assinatura = createHash('sha1').update([...efetivas.map((m) => `${m.id}:${m.versao}`), ...casos.map((c) => `caso:${c.id}:${c.versao}`)].sort().join('|')).digest('hex');
    return {
      versao: { id: versao.id, numero: versao.numero, rotulo: versao.rotulo, createdAt: versao.createdAt }, mudancas: efetivas, ignorados, casos, camadasDoItem, assinatura,
      itensNaFoto: alvo.size, itensNovosDepois, itensAusentes: alvo.size - vistos,
    };
  }
}

export function restauracoesDe(resumo: unknown): Restauracao[] {
  const l = (resumo as Json | null)?.restauracoes;
  return Array.isArray(l) ? (l as Restauracao[]) : [];
}
