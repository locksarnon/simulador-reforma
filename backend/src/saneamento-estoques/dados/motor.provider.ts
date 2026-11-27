import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { soDigitos } from '../../classificacao/ncm-classe';
import {
  AnalisadorDuplicidade, AnalisadorGrupos, AnalisadorIdentificacao, AnalisadorNcm, AnalisadorNomesUnidades, AnalisadorQualidade, novoCaso, valorComum,
  type ContextoMotor, type PapelUnificacao, type ParametrosMotor, type TabelaNcm,
} from '../motor';
import {
  AnalisadorObrigacoes, AnalisadorTributario, CatalogosFiscaisPrisma, agruparConjuntos, cenariosAplicaveis, ehAtividade, enquadrar, regraDoCnae, sugerirFinalidadePorGrupo,
  type CatalogosFiscais, type ExcecaoItem,
} from '../fiscal';
import { ROTULO_CENARIO, ROTULO_FINALIDADE, type AnalisadorCamada, type Finalidade, type Camada, type CasoProposto, type ContextoAnalise, type ItemTrabalho, type ResultadoCamada } from '../tipos';
import { ajustesDosCasos } from './ajustes';
import { codigosParaAjustes } from './impactos-casos';
import type { EntradaPreparo, MotorPort } from './portas';

/** Atividades (CNAE da trava ou id da lista fechada) → ids da lista fechada de `fiscal/atividades`. */
export function idsDeAtividades(codigos: string[]): string[] {
  const out = new Set<string>();
  for (const c of codigos) {
    if (ehAtividade(c)) { out.add(c); continue; }
    for (const a of regraDoCnae(c)?.atividades ?? []) out.add(a);
  }
  return [...out];
}

/** Tabela NCM (modelo `Ncm`, do Siscomex) em memória. A tabela não traz vigência por data nem sucessores: vigente = status "Ativo". */
export function criarTabelaNcm(linhas: { codigo: string; descricao: string | null; status: string }[]): TabelaNcm {
  const m = new Map(linhas.map((l) => [soDigitos(l.codigo), l]));
  return {
    existe: (n) => m.has(soDigitos(n)),
    vigente: (n) => m.get(soDigitos(n))?.status === 'Ativo',
    descricao: (n) => m.get(soDigitos(n))?.descricao ?? null,
    sucessores: () => [],
  };
}

/**
 * GRUPOS_FINALIDADE = os casos de grupos do motor + a confirmação da finalidade POR GRUPO (plano, seção 5: "confirma por grupo e corrige
 * exceções"; "exceção exige motivo"):
 * - FINALIDADE_GRUPO: os itens do grupo cuja finalidade (informada pelo cliente ou sugerida) é a dominante, ou que não têm sugestão
 *   (herdam a do grupo). A finalidade informada pelo cliente entra aqui para ser confirmada, nunca vira "sem problema" sozinha.
 * - FINALIDADE_EXCECAO: um caso por finalidade diferente da dominante, com os itens que a regra (ou o cliente) manda para ela. Aprovar
 *   exige o motivo escrito pelo consultor. O caso do grupo nunca sobrescreve a finalidade desses itens.
 * Item com finalidade já confirmada por decisão aprovada desta camada (a mesma que está no item) fica "sem problema".
 */
export class AnalisadorGruposFinalidade implements AnalisadorCamada {
  readonly camada = 'GRUPOS_FINALIDADE' as const;
  constructor(private readonly grupos: AnalisadorCamada, private readonly atividades: string[], private readonly confirmadas: Map<string, string> = new Map()) {}

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const base = this.grupos.analisar(itens, contexto);
    const codigo = new Map(itens.map((i) => [i.id, i.codigo]));
    const casos: CasoProposto[] = [...base.casos];
    const fin: CasoProposto[] = [];
    const prontos = new Set<string>();
    const semSugestao = new Set<string>();
    const motivosSemSugestao: string[] = [];
    const rotulo = (f: Finalidade) => ROTULO_FINALIDADE[f];
    const fundamento = 'Regra interna: sugestão por grupo, nome do item e atividades confirmadas do cliente (a finalidade define o enquadramento tributário).';
    for (const s of sugerirFinalidadePorGrupo(itens, this.atividades)) {
      const doGrupo = itens.filter((i) => (i.grupo ?? '') === (s.grupo ?? ''));
      if (!s.grupo) continue; // item sem grupo não tem finalidade por grupo
      if (!s.dominante) { doGrupo.forEach((i) => semSugestao.add(i.id)); motivosSemSugestao.push(`${s.grupo}: ${s.motivoDaRegra || s.motivo}`); continue; }
      const excecao = new Map(s.excecoes.map((x) => [x.itemId, x]));
      const doCaso: ItemTrabalho[] = [];
      const porFinalidade = new Map<Finalidade, ItemTrabalho[]>();
      for (const i of doGrupo) {
        if (i.finalidade && this.confirmadas.get(i.id) === i.finalidade) { prontos.add(i.id); continue; }
        const x = excecao.get(i.id);
        if (x) (porFinalidade.get(x.finalidade) ?? porFinalidade.set(x.finalidade, []).get(x.finalidade)!).push(i);
        else doCaso.push(i);
      }
      const informadas = doCaso.filter((i) => i.finalidade).length;
      const emExcecao = [...porFinalidade.values()].reduce((n, l) => n + l.length, 0);
      if (doCaso.length) {
        fin.push(novoCaso({
          camada: 'GRUPOS_FINALIDADE', tipo: 'FINALIDADE_GRUPO', itens: doCaso.map((i) => i.id),
          problema: `Confirmar a finalidade do grupo "${s.grupo}": ${rotulo(s.dominante)} (confiança ${s.confianca})`,
          evidencia: [
            { rotulo: 'Grupo', valor: `${s.grupo} (${s.total} itens)` },
            ...Object.entries(s.distribuicao).map(([f, n]) => ({ rotulo: `Sugestão: ${rotulo(f as Finalidade)}`, valor: `${n} itens` })),
            { rotulo: 'Sem sugestão', valor: `${s.semSugestao} itens` },
            { rotulo: 'Confiança', valor: `${s.confianca} (${Math.round(s.proporcao * 100)}% no dominante)` },
            ...(s.motivoDaRegra ? [{ rotulo: 'Motivo da sugestão', valor: s.motivoDaRegra }] : []),
            ...(s.alternativas.length ? [{ rotulo: 'Alternativas a confirmar', valor: s.alternativas.map(rotulo).join(', ') }] : []),
            ...(informadas ? [{ rotulo: 'Informada pelo cliente', valor: `${informadas} item(ns) deste caso já vieram com esta finalidade na base: aprovar confirma` }] : []),
            ...(emExcecao ? [{ rotulo: 'Exceções', valor: `${emExcecao} item(ns) com outra finalidade estão em caso próprio de exceção (exige motivo)` }] : []),
          ],
          atual: { finalidade: valorComum(doCaso.map((i) => i.finalidade ?? null)) }, proposta: { finalidade: s.dominante },
          justificativa: `${s.motivo}. Aprovar aplica e confirma a finalidade nos ${doCaso.length} item(ns) deste caso; os itens com outra finalidade ficam no caso de exceção.`,
          fundamento, afeta: ['TRIBUTARIO', 'OBRIGACOES'],
        }));
      }
      for (const [f, lista] of porFinalidade) {
        fin.push(novoCaso({
          camada: 'GRUPOS_FINALIDADE', tipo: 'FINALIDADE_EXCECAO', itens: lista.map((i) => i.id),
          problema: `Exceção no grupo "${s.grupo}": ${lista.length} item(ns) com finalidade ${rotulo(f)}, diferente da do grupo (${rotulo(s.dominante)})`,
          evidencia: [
            { rotulo: 'Grupo', valor: `${s.grupo} (${s.total} itens)` },
            { rotulo: 'Finalidade do grupo', valor: rotulo(s.dominante) },
            ...lista.slice(0, 30).map((i) => ({ rotulo: `Item ${codigo.get(i.id) ?? i.id}`, valor: i.finalidade ? 'finalidade informada pelo cliente na base' : excecao.get(i.id)!.motivo })),
            ...(lista.length > 30 ? [{ rotulo: 'Itens', valor: `e mais ${lista.length - 30}` }] : []),
          ],
          atual: { finalidade: valorComum(lista.map((i) => i.finalidade ?? null)) }, proposta: { finalidade: f },
          // Sem justificativa pronta: a exceção exige o motivo escrito pelo consultor (a aprovação recusa sem ele).
          justificativa: '', fundamento, afeta: ['TRIBUTARIO', 'OBRIGACOES'],
        }));
      }
    }
    casos.push(...fin);
    const emCaso = new Set(casos.flatMap((c) => c.itens));
    const semProblema = [...new Set([...base.semProblema, ...prontos])].filter((id) => !emCaso.has(id) && !semSugestao.has(id));
    const semDados = base.semDados ?? (semSugestao.size ? { motivo: `Há grupos sem nenhuma sugestão de finalidade: confirmar com o cliente (${motivosSemSugestao.slice(0, 10).join('; ')}${motivosSemSugestao.length > 10 ? '; …' : ''})`.slice(0, 1000), itens: semSugestao.size } : null);
    return { camada: 'GRUPOS_FINALIDADE', analisados: itens.length, semDados, casos, semProblema };
  }
}

/** Finalidade confirmada por decisão aprovada da camada GRUPOS_FINALIDADE: item → finalidade aprovada (o último caso aprovado vale). */
export function finalidadesConfirmadas(aprovados: { itens: string[]; proposta: unknown }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of aprovados) {
    const f = (c.proposta as { finalidade?: unknown } | null)?.finalidade;
    if (typeof f === 'string') for (const i of c.itens) m.set(i, f);
  }
  return m;
}

/**
 * TRIBUTARIO com as exceções por item já aprovadas (o item sai do conjunto e a exceção não é proposta de novo) e com o enquadramento
 * CONFERIDO dos itens que já estavam certos: um caso ENQUADRAMENTO_CONFERIDO por conjunto (nasce aprovado pelo sistema, não mexe nas
 * células nem no cadastro) para que a aba de cenários, o Excel e o PDF mostrem lei, artigo, CST e crédito também para os itens corretos.
 */
export class AnalisadorTributarioCompleto implements AnalisadorCamada {
  readonly camada = 'TRIBUTARIO' as const;
  constructor(private readonly catalogos: CatalogosFiscais, private readonly excecoes: Record<string, ExcecaoItem> = {}) {}

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const base = new AnalisadorTributario(this.catalogos, { excecoes: this.excecoes }).analisar(itens, contexto);
    const porId = new Map(itens.map((i) => [i.id, i]));
    const informada = (i: ItemTrabalho) => String(i.campos?.cClassTrib ?? i.campos?.c_class_trib ?? '').trim();
    const casos: CasoProposto[] = [];
    const semProblema = new Set(base.semProblema);
    for (const c of base.casos) {
      // Exceção que já foi aplicada ao item: nada a propor (o item está como a exceção manda).
      if (c.tipo === 'EXCECAO_ITEM' && c.itens.length === 1) {
        const it = porId.get(c.itens[0]);
        if (it && informada(it) && informada(it) === String(c.proposta.cClassTrib)) { semProblema.add(it.id); continue; }
      }
      casos.push(c);
    }
    const emCaso = new Set(casos.flatMap((c) => c.itens));
    for (const [chave, grupo] of agruparConjuntos(itens)) {
      const [ncm, fin] = chave.split('|');
      if (ncm === 'SEM_NCM' || fin === 'SEM_FINALIDADE') continue;
      const certos = grupo.filter((i) => semProblema.has(i.id) && !emCaso.has(i.id) && !this.excecoes[i.id]);
      if (!certos.length) continue;
      const finalidade = grupo[0].finalidade!;
      const enqs = cenariosAplicaveis(finalidade).map((c) => enquadrar(ncm, finalidade, c, contexto.dataBase, this.catalogos));
      const ref = enqs[0];
      if (!ref || enqs.some((e) => e.status === 'AGUARDANDO_INFORMACAO') || certos.some((i) => informada(i) !== ref.cClassTrib)) continue;
      casos.push(novoCaso({
        camada: 'TRIBUTARIO', tipo: 'ENQUADRAMENTO_CONFERIDO', itens: certos.map((i) => i.id),
        problema: `Enquadramento conferido do conjunto ${ncm} × ${ROTULO_FINALIDADE[finalidade]}: a classe informada confere`,
        evidencia: [
          { rotulo: 'Conjunto', valor: `${ncm} × ${ROTULO_FINALIDADE[finalidade]}` }, { rotulo: 'Itens no conjunto', valor: String(certos.length) },
          ...enqs.map((e) => ({ rotulo: ROTULO_CENARIO[e.cenario], valor: e.credito ? `${e.credito.situacao}: ${e.credito.descricao}` : '—' })),
        ],
        atual: { cClassTrib: ref.cClassTrib }, proposta: { cClassTrib: ref.cClassTrib, cst: ref.cst, enquadramentoLegal: ref.enquadramentoLegal, artigo: ref.artigo, origem: 'HERDADO' },
        justificativa: ref.observacao || 'A classe informada confere com o enquadramento pela tabela da SVRS e pelos anexos da LC 214 carregados.', fundamento: ref.artigo, afeta: [],
      }));
    }
    return { ...base, casos, semProblema: [...semProblema] };
  }
}

/**
 * Papel de cada item nas unificações (casos de Duplicidades com decisão PROPOR_CONSOLIDACAO): o item do caso cujo código é o `manter` FICA;
 * os que estão em `consolidar` SAEM. `outro` = o(s) código(s) do outro lado, para a evidência.
 */
export function papeisDeUnificacao(casos: { itens: string[]; proposta: unknown }[], itens: Pick<ItemTrabalho, 'id' | 'codigo'>[]): Map<string, PapelUnificacao> {
  const codigo = new Map<string, string>();
  for (const i of itens) codigo.set(i.id, String(i.codigo));
  const out = new Map<string, PapelUnificacao>();
  for (const c of casos) {
    const p = (c.proposta ?? {}) as Record<string, unknown>;
    if (p.decisao !== 'PROPOR_CONSOLIDACAO' || !p.manter || !p.consolidar) continue;
    const manter = String(p.manter).trim();
    const saem = String(p.consolidar).split('|').map((x) => x.trim()).filter(Boolean);
    for (const id of c.itens) {
      const cod = codigo.get(id);
      if (cod === manter) out.set(id, { papel: 'FICA', outro: saem.join(', ') });
      else if (cod != null && saem.includes(cod) && out.get(id)?.papel !== 'FICA') out.set(id, { papel: 'SAI', outro: manter });
    }
  }
  return out;
}

/** Motor do Saneamento: liga os analisadores puros de `motor/` e `fiscal/` ao banco (catálogos, tabela NCM e ajustes), uma vez por execução. */
@Injectable()
export class MotorSaneamento implements MotorPort {
  constructor(private readonly prisma: PrismaService, private readonly catalogos: CatalogosFiscaisPrisma) {}

  camadas(): Camada[] {
    return ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'TRIBUTARIO', 'OBRIGACOES'];
  }

  async preparar(camada: Camada, { projetoId, itens, contexto }: EntradaPreparo): Promise<{ analisador: AnalisadorCamada; contexto: ContextoAnalise }> {
    const ctx = contexto as ContextoMotor;
    switch (camada) {
      case 'IDENTIFICACAO': return { analisador: new AnalisadorIdentificacao(), contexto: ctx };
      case 'QUALIDADE': {
        // Itens que já estão numa unificação proposta ou aprovada: a inativação por falta de movimento não os toca (o código que fica recebe o saldo).
        const unificacoes = await this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, camada: 'DUPLICIDADE', situacao: { in: ['PROPOSTO', 'RASCUNHO', 'APROVADO'] } }, select: { itens: true, proposta: true } });
        return { analisador: new AnalisadorQualidade(), contexto: { ...ctx, unificacoes: papeisDeUnificacao(unificacoes, itens) } as ContextoMotor };
      }
      case 'DUPLICIDADE': return { analisador: new AnalisadorDuplicidade(), contexto: ctx };
      case 'NOMES_UNIDADES': return { analisador: new AnalisadorNomesUnidades(), contexto: ctx };
      case 'GRUPOS_FINALIDADE': {
        const aprovados = await this.prisma.sanCaso.findMany({ where: { projeto_id: projetoId, camada: 'GRUPOS_FINALIDADE', situacao: 'APROVADO' }, orderBy: { decidido_em: 'asc' }, select: { itens: true, proposta: true } });
        return { analisador: new AnalisadorGruposFinalidade(new AnalisadorGrupos(), ctx.atividades, finalidadesConfirmadas(aprovados)), contexto: ctx };
      }
      case 'NCM': {
        const linhas = await this.prisma.ncm.findMany({ select: { codigo: true, descricao: true, status: true } });
        // Tabela vazia = não carregada: o motor não afirma que o NCM "não existe".
        return { analisador: new AnalisadorNcm(), contexto: { ...ctx, tabelaNcm: linhas.length ? criarTabelaNcm(linhas) : undefined } as ContextoMotor };
      }
      case 'TRIBUTARIO': {
        // Exceções por item já aprovadas (EXCECAO_MANUAL ou EXCECAO_ITEM): o item fica fora do conjunto.
        const aprovadas = await this.prisma.sanCaso.findMany({
          where: { projeto_id: projetoId, camada: 'TRIBUTARIO', situacao: 'APROVADO', tipo: { in: ['EXCECAO_MANUAL', 'EXCECAO_ITEM'] } },
          select: { itens: true, proposta: true, justificativa: true },
        });
        const excecoes: Record<string, ExcecaoItem> = {};
        for (const c of aprovadas) {
          const classe = (c.proposta as { cClassTrib?: unknown } | null)?.cClassTrib;
          if (classe) for (const id of c.itens) excecoes[id] = { motivo: c.justificativa, cClassTrib: String(classe) };
        }
        return { analisador: new AnalisadorTributarioCompleto(await this.catalogos.carregar(), excecoes), contexto: ctx };
      }
      case 'OBRIGACOES': {
        // Aguardando informação entra só para a exceção viva tirar seus itens do caso de regra (não gera ajuste).
        const casos = await this.prisma.sanCaso.findMany({
          where: { projeto_id: projetoId, situacao: { in: ['PROPOSTO', 'RASCUNHO', 'APROVADO', 'AGUARDANDO_INFORMACAO'] }, camada: { not: 'OBRIGACOES' } },
          select: { camada: true, tipo: true, itens: true, justificativa: true, situacao: true, atual: true, proposta: true },
        });
        const parametros = (await this.prisma.sanProjeto.findUnique({ where: { id: projetoId }, select: { parametros: true } }))?.parametros as { competenciaEntregue?: unknown } | null;
        const competenciaEntregue = typeof parametros?.competenciaEntregue === 'string' ? parametros.competenciaEntregue : null;
        const codigos = await codigosParaAjustes(this.prisma, casos);
        return { analisador: new AnalisadorObrigacoes(ajustesDosCasos(casos, { dataBase: ctx.dataBase, competenciaEntregue, codigos })), contexto: ctx };
      }
      default: throw new Error(`Camada sem análise: ${camada}`);
    }
  }
}

export type { ParametrosMotor };
