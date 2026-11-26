import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CAMPOS_TOPO, CAMPO_AFETA, TX_LONGA, aplicarCampo, conflito, derivadosDoTrabalho, exigirVersao, fatiar, igual, quem, valorDoCampo, type Json, type Usuario,
} from './constantes';
import { SanVersoesService } from './versoes.service';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
type Db = Pick<Tx, 'sanItem' | 'sanDecisao' | 'sanCaso'>;
type Campo = { campo: string; antes: unknown; depois: unknown };
type Mudanca = { id: string; codigo: string; estabelecimento: string; versao: number; trabalho: Json; campos: Campo[] };
/** Registro de uma restauração, guardado no `resumo` da versão usada como base (lista `restauracoes`). */
export type Restauracao = {
  id: string; quando: string; usuario: string; justificativa: string; itens: number; campos: number; casosDecididosDepois: number;
  desfeita: { por: string; em: string } | null;
};

const LOTE_LEITURA = 5000;
const LOTE_GRAVACAO = 500;
const AMOSTRA = 100;
const MIN_JUSTIFICATIVA = 10;
const etiqueta = (id: string) => `[restauracao:${id}]`;
const bad = (codigo: string, message: string) => new BadRequestException({ statusCode: 400, codigo, message });
const topo = (c: string) => (CAMPOS_TOPO as readonly string[]).includes(c);

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

/**
 * "Continuar a partir desta versão": a base de trabalho volta aos valores da foto de uma versão liberada. NADA é apagado: cada campo
 * que muda grava uma decisão `restaurar` (antes, depois, quem, quando, justificativa), rastreável no histórico e desfazível.
 *
 * Casos decididos depois da versão seguem a regra de dependências que o código já usa (aprovar, desfazer, reimportar): a decisão fica
 * intacta e as células passam a "revisar". OBSOLETO não serve aqui: ele só vale para caso PROPOSTO sem edição que a análise deixou de
 * produzir; caso decidido nunca fica obsoleto. Situação de células e casos não volta à da foto (só os valores do cadastro voltam).
 */
@Injectable()
export class SanRestauracaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly versoes: SanVersoesService,
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
        itensNovosDepois: calc.itensNovosDepois, itensAusentes: calc.itensAusentes, casosDecididosDepois: calc.casos.size,
      },
      porCampo: [...porCampo].map(([campo, itens]) => ({ campo, itens })).sort((a, b) => b.itens - a.itens || (a.campo < b.campo ? -1 : 1)),
      camadasRevisar: [...new Set(calc.mudancas.flatMap((m) => calc.camadasDoItem(m)))].sort(),
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
      const fundamento = `Restauração da versão ${calc.versao.numero} (${calc.versao.rotulo}): ${justificativa} ${etiqueta(id)}`;
      const quemFez = quem(usuario);
      const causa = `Revisar: a base de trabalho voltou aos valores da versão ${calc.versao.numero} (restauração); confira esta camada.`;
      let celulasRevisar = 0;
      for (const lote of fatiar(calc.mudancas, LOTE_GRAVACAO)) {
        const decs: Json[] = [];
        const porGrupo = new Map<string, string[]>();
        const revisarPor = new Map<string, string[]>();
        for (const m of lote) {
          const trabalho = JSON.parse(JSON.stringify(m.trabalho)) as Json;
          for (const c of m.campos) {
            aplicarCampo(trabalho, c.campo, c.depois, false);
            decs.push({ projeto_id: projetoId, item_id: m.id, caso_id: null, campo: c.campo, antes: (c.antes ?? null) as never, depois: (c.depois ?? null) as never, fundamento, usuario: quemFez, tipo: 'restaurar' });
          }
          const d = derivadosDoTrabalho(trabalho);
          const r = await tx.sanItem.updateMany({ where: { id: m.id, versao: m.versao }, data: { trabalho: trabalho as never, ...d, versao: { increment: 1 } } });
          if (r.count === 0) throw conflito(`O item ${m.codigo} foi alterado por outra pessoa durante a restauração. Refaça a prévia.`);
          const g = d.grupo ?? '';
          porGrupo.set(g, [...(porGrupo.get(g) ?? []), m.id]);
          const camadas = calc.camadasDoItem(m).join(',');
          if (camadas) revisarPor.set(camadas, [...(revisarPor.get(camadas) ?? []), m.id]);
        }
        for (const l of fatiar(decs, 2000)) await tx.sanDecisao.createMany({ data: l as never });
        for (const [grupo, ids] of porGrupo) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, item_id: { in: ids } }, data: { grupo } });
        for (const [camadas, ids] of revisarPor) {
          const x = await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, item_id: { in: ids }, camada: { in: camadas.split(',') }, situacao: { not: 'PENDENTE' } }, data: { revisar: true, revisar_causa: causa } });
          celulasRevisar += x.count;
        }
      }
      const campos = calc.mudancas.reduce((s, m) => s + m.campos.length, 0);
      const registro: Restauracao = { id, quando: new Date().toISOString(), usuario: quemFez, justificativa, itens: calc.mudancas.length, campos, casosDecididosDepois: calc.casos.size, desfeita: null };
      await this.gravarRegistro(tx, versaoId, (lista) => [...lista, registro]);
      return { restauracao: registro, versao: calc.versao, itens: registro.itens, campos, celulasRevisar, casosDecididosDepois: calc.casos.size, ignorados: calc.ignorados };
    }, TX_LONGA);
  }

  /**
   * Desfaz uma restauração: cada campo volta ao valor de antes dela (decisão `desfazer`) e as camadas que usam o campo ficam "revisar".
   * Se o campo mudou depois por outra decisão, recusa (409 CAMPO_ALTERADO_DEPOIS), como o desfazer de um caso. Já desfeita: não grava nada.
   */
  async desfazer(projetoId: string, versaoId: string, restauracaoId: string, e: { versao?: unknown }, usuario?: Usuario) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.sanVersao.findFirst({ where: { id: versaoId, projeto_id: projetoId }, select: { id: true, numero: true, resumo: true } });
      if (!v) throw new NotFoundException('Versão não encontrada.');
      const registro = restauracoesDe(v.resumo).find((r) => r.id === restauracaoId);
      if (!registro) throw new NotFoundException('Restauração não encontrada.');
      if (registro.desfeita) return { restauracao: registro, jaDesfeita: true };
      const versao = exigirVersao(e.versao);
      const pr = await tx.sanProjeto.updateMany({ where: { id: projetoId, versao }, data: { versao: { increment: 1 } } });
      if (pr.count === 0) throw conflito();
      const decs = await tx.sanDecisao.findMany({ where: { projeto_id: projetoId, tipo: 'restaurar', fundamento: { contains: etiqueta(restauracaoId) } }, select: { item_id: true, campo: true, antes: true, depois: true } });
      const porItem = new Map<string, typeof decs>();
      for (const d of decs) porItem.set(d.item_id, [...(porItem.get(d.item_id) ?? []), d]);
      const fundamento = `Restauração da versão ${v.numero} desfeita ${etiqueta(restauracaoId)}`;
      const quemFez = quem(usuario);
      for (const lote of fatiar([...porItem.keys()], LOTE_GRAVACAO)) {
        const itens = await tx.sanItem.findMany({ where: { projeto_id: projetoId, id: { in: lote } }, select: { id: true, codigo: true, trabalho: true, versao: true } });
        const novas: Json[] = [];
        const porGrupo = new Map<string, string[]>();
        const revisarPor = new Map<string, string[]>();
        for (const item of itens) {
          const lista = porItem.get(item.id)!;
          const trabalho = JSON.parse(JSON.stringify(item.trabalho)) as Json;
          for (const d of lista) {
            if (!igual(valorDoCampo(trabalho, d.campo), d.depois)) {
              throw new ConflictException({ statusCode: 409, codigo: 'CAMPO_ALTERADO_DEPOIS', message: `Não dá para desfazer: o campo "${d.campo}" do item ${item.codigo} foi alterado depois por outra decisão. Desfaça essa primeiro.` });
            }
            aplicarCampo(trabalho, d.campo, d.antes, false);
            novas.push({ projeto_id: projetoId, item_id: item.id, caso_id: null, campo: d.campo, antes: (d.depois ?? null) as never, depois: (d.antes ?? null) as never, fundamento, usuario: quemFez, tipo: 'desfazer' });
          }
          const der = derivadosDoTrabalho(trabalho);
          const r = await tx.sanItem.updateMany({ where: { id: item.id, versao: item.versao }, data: { trabalho: trabalho as never, ...der, versao: { increment: 1 } } });
          if (r.count === 0) throw conflito();
          const g = der.grupo ?? '';
          porGrupo.set(g, [...(porGrupo.get(g) ?? []), item.id]);
          const camadas = camadasDosCampos(lista.map((d) => d.campo)).join(',');
          revisarPor.set(camadas, [...(revisarPor.get(camadas) ?? []), item.id]);
        }
        for (const l of fatiar(novas, 2000)) await tx.sanDecisao.createMany({ data: l as never });
        for (const [grupo, ids] of porGrupo) await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, item_id: { in: ids } }, data: { grupo } });
        for (const [camadas, ids] of revisarPor) {
          await tx.sanCelula.updateMany({ where: { projeto_id: projetoId, item_id: { in: ids }, camada: { in: camadas.split(',') }, situacao: { not: 'PENDENTE' } }, data: { revisar: true, revisar_causa: `Revisar: a restauração da versão ${v.numero} foi desfeita; confira esta camada.` } });
        }
      }
      const desfeita = { por: quemFez, em: new Date().toISOString() };
      await this.gravarRegistro(tx, versaoId, (lista) => lista.map((r) => (r.id === restauracaoId ? { ...r, desfeita } : r)));
      return { restauracao: { ...registro, desfeita }, jaDesfeita: false, itens: porItem.size, campos: decs.length };
    }, TX_LONGA);
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async gravarRegistro(tx: Tx, versaoId: string, f: (lista: Restauracao[]) => Restauracao[]) {
    const v = await tx.sanVersao.findUnique({ where: { id: versaoId }, select: { resumo: true } });
    const resumo = ((v?.resumo as Json) ?? {}) as Json;
    await tx.sanVersao.update({ where: { id: versaoId }, data: { resumo: { ...resumo, restauracoes: f(restauracoesDe(resumo)) } as never } });
  }

  /** Compara a base de agora com a foto (itens lidos em blocos), acha casos decididos depois e monta a assinatura. */
  private async calcular(db: Db, projetoId: string, versaoId: string) {
    const { versao, foto } = await this.versoes.foto(projetoId, versaoId);
    const alvo = new Map<string, Json>();
    for (const i of foto.itens) alvo.set(String(i.id), ((i.trabalho as Json) ?? {}) as Json);
    const mudancas: Mudanca[] = [];
    let itensNovosDepois = 0;
    let vistos = 0;
    let cursor: string | undefined;
    for (;;) {
      const lote = await db.sanItem.findMany({
        where: { projeto_id: projetoId }, orderBy: { id: 'asc' }, take: LOTE_LEITURA, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, codigo: true, estabelecimento: true, trabalho: true, versao: true },
      });
      for (const i of lote) {
        const t = alvo.get(i.id);
        if (!t) { itensNovosDepois++; continue; }
        vistos++;
        const trabalho = ((i.trabalho as Json) ?? {}) as Json;
        const campos = diferencasDoTrabalho(trabalho, t);
        if (campos.length) mudancas.push({ id: i.id, codigo: i.codigo, estabelecimento: i.estabelecimento, versao: i.versao, trabalho, campos });
      }
      if (lote.length < LOTE_LEITURA) break;
      cursor = lote[lote.length - 1].id;
    }

    // Código que voltaria a repetir o de outro item do mesmo estabelecimento: fica de fora (como na aprovação).
    const ignorados: { itemId: string; codigo: string; campo: string; motivo: string }[] = [];
    const comCodigo = mudancas.filter((m) => m.campos.some((c) => c.campo === 'codigo' && c.depois != null));
    for (const lote of fatiar(comCodigo, LOTE_LEITURA)) {
      const ocupados = await db.sanItem.findMany({ where: { projeto_id: projetoId, codigo: { in: lote.map((m) => String(m.campos.find((c) => c.campo === 'codigo')!.depois)) } }, select: { id: true, codigo: true, estabelecimento: true } });
      for (const m of lote) {
        const novo = String(m.campos.find((c) => c.campo === 'codigo')!.depois);
        if (ocupados.some((o) => o.codigo === novo && o.estabelecimento === m.estabelecimento && o.id !== m.id)) {
          m.campos = m.campos.filter((c) => c.campo !== 'codigo');
          ignorados.push({ itemId: m.id, codigo: m.codigo, campo: 'codigo', motivo: `O código ${novo} já pertence a outro item deste projeto: o código atual foi mantido.` });
        }
      }
    }
    const efetivas = mudancas.filter((m) => m.campos.length);

    // Casos decididos depois da versão que mexeram nos campos que voltam: a camada deles também fica "revisar".
    const quando = new Date(versao.createdAt);
    const casosPorItem = new Map<string, Set<string>>();
    const casos = new Set<string>();
    for (const lote of fatiar(efetivas, LOTE_LEITURA)) {
      const pares = new Set(lote.flatMap((m) => m.campos.map((c) => `${m.id}\u0000${c.campo}`)));
      const decs = await db.sanDecisao.findMany({ where: { projeto_id: projetoId, item_id: { in: lote.map((m) => m.id) }, caso_id: { not: null }, quando: { gt: quando } }, select: { item_id: true, campo: true, caso_id: true } });
      for (const d of decs) {
        if (!d.caso_id || !pares.has(`${d.item_id}\u0000${d.campo}`)) continue;
        casos.add(d.caso_id);
        casosPorItem.set(d.item_id, (casosPorItem.get(d.item_id) ?? new Set()).add(d.caso_id));
      }
    }
    const camadaDoCaso = new Map<string, string>();
    for (const lote of fatiar([...casos], LOTE_LEITURA)) for (const c of await db.sanCaso.findMany({ where: { id: { in: lote } }, select: { id: true, camada: true } })) camadaDoCaso.set(c.id, c.camada);
    const camadasDoItem = (m: Mudanca) => {
      const s = new Set(camadasDosCampos(m.campos.map((c) => c.campo)));
      for (const k of casosPorItem.get(m.id) ?? []) { const cam = camadaDoCaso.get(k); if (cam) s.add(cam); }
      return [...s].sort();
    };
    const assinatura = createHash('sha1').update(efetivas.map((m) => `${m.id}:${m.versao}`).sort().join('|')).digest('hex');
    return {
      versao: { id: versao.id, numero: versao.numero, rotulo: versao.rotulo, createdAt: versao.createdAt }, mudancas: efetivas, ignorados, casos, camadasDoItem, assinatura,
      itensNaFoto: alvo.size, itensNovosDepois, itensAusentes: alvo.size - vistos,
    };
  }
}

/** Camadas que usam os campos (a mesma regra da reimportação; campo sem regra própria → qualidade). */
function camadasDosCampos(campos: string[]): string[] {
  return [...new Set(campos.flatMap((c) => CAMPO_AFETA[c.replace(/^campos\./, '')] ?? ['QUALIDADE']))].sort();
}

export function restauracoesDe(resumo: unknown): Restauracao[] {
  const l = (resumo as Json | null)?.restauracoes;
  return Array.isArray(l) ? (l as Restauracao[]) : [];
}
