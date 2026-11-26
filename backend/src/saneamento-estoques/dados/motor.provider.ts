import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { soDigitos } from '../../classificacao/ncm-classe';
import {
  AnalisadorDuplicidade, AnalisadorGrupos, AnalisadorIdentificacao, AnalisadorNcm, AnalisadorNomesUnidades, AnalisadorQualidade, novoCaso,
  type ContextoMotor, type ParametrosMotor, type TabelaNcm,
} from '../motor';
import {
  AnalisadorObrigacoes, AnalisadorTributario, CatalogosFiscaisPrisma, agruparConjuntos, cenariosAplicaveis, ehAtividade, enquadrar, regraDoCnae, sugerirFinalidadePorGrupo,
  type CatalogosFiscais, type ExcecaoItem,
} from '../fiscal';
import { ROTULO_CENARIO, ROTULO_FINALIDADE, type AnalisadorCamada, type Camada, type CasoProposto, type ContextoAnalise, type ItemTrabalho, type ResultadoCamada } from '../tipos';
import { ajustesDosCasos } from './ajustes';
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
 * GRUPOS_FINALIDADE = os casos de grupos do motor + um caso FINALIDADE_GRUPO por grupo (confirmação por grupo): itens = os do grupo que
 * ainda não têm a finalidade dominante; proposta { finalidade }; as exceções (itens que a regra manda para outra finalidade) ficam
 * listadas na evidência e o consultor as ajusta depois, item a item, com decisão própria.
 */
export class AnalisadorGruposFinalidade implements AnalisadorCamada {
  readonly camada = 'GRUPOS_FINALIDADE' as const;
  constructor(private readonly grupos: AnalisadorCamada, private readonly atividades: string[]) {}

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const base = this.grupos.analisar(itens, contexto);
    const codigo = new Map(itens.map((i) => [i.id, i.codigo]));
    const casos: CasoProposto[] = [...base.casos];
    const fin: CasoProposto[] = [];
    const prontos = new Set<string>();
    const semSugestao = new Set<string>();
    for (const s of sugerirFinalidadePorGrupo(itens, this.atividades)) {
      const doGrupo = itens.filter((i) => (i.grupo ?? '') === (s.grupo ?? ''));
      if (!s.grupo) continue; // item sem grupo não tem finalidade por grupo
      if (!s.dominante) { doGrupo.forEach((i) => semSugestao.add(i.id)); continue; }
      const faltam = doGrupo.filter((i) => i.finalidade !== s.dominante);
      doGrupo.filter((i) => i.finalidade === s.dominante).forEach((i) => prontos.add(i.id));
      if (!faltam.length) continue;
      const excecoes = s.excecoes.filter((x) => faltam.some((f) => f.id === x.itemId));
      fin.push(novoCaso({
        camada: 'GRUPOS_FINALIDADE', tipo: 'FINALIDADE_GRUPO', itens: faltam.map((i) => i.id),
        problema: `Confirmar a finalidade do grupo "${s.grupo}": ${ROTULO_FINALIDADE[s.dominante]} (confiança ${s.confianca})`,
        evidencia: [
          { rotulo: 'Grupo', valor: `${s.grupo} (${s.total} itens)` },
          ...Object.entries(s.distribuicao).map(([f, n]) => ({ rotulo: `Sugestão: ${ROTULO_FINALIDADE[f as keyof typeof ROTULO_FINALIDADE]}`, valor: `${n} itens` })),
          { rotulo: 'Sem sugestão', valor: `${s.semSugestao} itens` },
          { rotulo: 'Confiança', valor: `${s.confianca} (${Math.round(s.proporcao * 100)}% no dominante)` },
          ...excecoes.slice(0, 15).map((x) => ({ rotulo: `Exceção ${codigo.get(x.itemId) ?? x.itemId}`, valor: `${ROTULO_FINALIDADE[x.finalidade]}: ${x.motivo}` })),
          ...(excecoes.length > 15 ? [{ rotulo: 'Exceções', valor: `e mais ${excecoes.length - 15} itens` }] : []),
        ],
        atual: { finalidade: null }, proposta: { finalidade: s.dominante },
        justificativa: `${s.motivo}. Aprovar aplica a finalidade a todos os itens do grupo; os itens em exceção devem ser ajustados depois, um a um.`,
        fundamento: 'Regra interna: sugestão por grupo, nome do item e atividades confirmadas do cliente (a finalidade define o enquadramento tributário).',
        afeta: ['TRIBUTARIO', 'OBRIGACOES'],
      }));
    }
    casos.push(...fin);
    const emCaso = new Set(casos.flatMap((c) => c.itens));
    const semProblema = [...new Set([...base.semProblema, ...prontos])].filter((id) => !emCaso.has(id) && !semSugestao.has(id));
    const semDados = base.semDados ?? (semSugestao.size ? { motivo: 'Há grupos sem nenhuma sugestão de finalidade: confirmar com o cliente', itens: semSugestao.size } : null);
    return { camada: 'GRUPOS_FINALIDADE', analisados: itens.length, semDados, casos, semProblema };
  }
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

/** Motor do Saneamento: liga os analisadores puros de `motor/` e `fiscal/` ao banco (catálogos, tabela NCM e ajustes), uma vez por execução. */
@Injectable()
export class MotorSaneamento implements MotorPort {
  constructor(private readonly prisma: PrismaService, private readonly catalogos: CatalogosFiscaisPrisma) {}

  camadas(): Camada[] {
    return ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'TRIBUTARIO', 'OBRIGACOES'];
  }

  async preparar(camada: Camada, { projetoId, contexto }: EntradaPreparo): Promise<{ analisador: AnalisadorCamada; contexto: ContextoAnalise }> {
    const ctx = contexto as ContextoMotor;
    switch (camada) {
      case 'IDENTIFICACAO': return { analisador: new AnalisadorIdentificacao(), contexto: ctx };
      case 'QUALIDADE': return { analisador: new AnalisadorQualidade(), contexto: ctx };
      case 'DUPLICIDADE': return { analisador: new AnalisadorDuplicidade(), contexto: ctx };
      case 'NOMES_UNIDADES': return { analisador: new AnalisadorNomesUnidades(), contexto: ctx };
      case 'GRUPOS_FINALIDADE': return { analisador: new AnalisadorGruposFinalidade(new AnalisadorGrupos(), ctx.atividades), contexto: ctx };
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
        const casos = await this.prisma.sanCaso.findMany({
          where: { projeto_id: projetoId, situacao: { in: ['PROPOSTO', 'RASCUNHO', 'APROVADO'] }, camada: { not: 'OBRIGACOES' } },
          select: { camada: true, tipo: true, itens: true, justificativa: true, situacao: true, atual: true, proposta: true },
        });
        return { analisador: new AnalisadorObrigacoes(ajustesDosCasos(casos)), contexto: ctx };
      }
      default: throw new Error(`Camada sem análise: ${camada}`);
    }
  }
}

export type { ParametrosMotor };
