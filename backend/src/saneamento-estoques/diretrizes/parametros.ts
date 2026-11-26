/**
 * Ponte entre as regras e os parâmetros do motor (ParametrosMotor). Os parâmetros soltos (limites, política de unidades, abreviações, caixa
 * alta) passam a vir das regras, POR GRUPO. Regra convertida dos parâmetros antigos e não editada (legado) devolve exatamente os
 * parâmetros de antes: o resultado não muda. Funções puras.
 */
import { limitesDoErp, type PerfilErp } from '../../erps/logica';
import type { LimitesCampo, ParametrosMotor, RegraUnidade } from '../motor/contexto';
import { chaveUnidade, classificarUnidade } from '../motor/unidades';
import { conteudoPadrao } from './conteudo-regra';
import type { RegraResolvivel } from './resolucao';
import type { Aspecto, LinhaLimite, RegraNomes, RegraUnidades } from './tipos';

/** Aspectos que mudam parâmetros da camada NOMES_UNIDADES. */
export const ASPECTOS_NOMES_UNIDADES: Aspecto[] = ['NOMES', 'UNIDADES', 'LIMITES'];

/** Chave de abreviação na forma que a camada compara (minúscula, sem acento, só letras e números). */
export const chaveAbreviacao = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Regras de unidade (politicaUnidade.regras) a partir das conversões de grupo: fator em unidades PADRÃO da medida do destino. */
export function regrasDeConversao(conversoes: RegraUnidades['conversoes'], codigoProduto?: string | null): Record<string, RegraUnidade> {
  const out: Record<string, RegraUnidade> = {};
  for (const c of conversoes) {
    if (c.abrangencia === 'PRODUTO' ? c.codigoProduto !== codigoProduto || codigoProduto == null : codigoProduto != null) continue;
    const destino = classificarUnidade(c.destino);
    if (!destino?.grandeza || destino.fator == null) continue; // destino sem medida conhecida: a conversão fica só como informação
    out[chaveUnidade(c.origem)] = { grandeza: destino.grandeza, fator: Math.round(c.fator * destino.fator * 1e9) / 1e9 };
  }
  return out;
}

/**
 * Parâmetros do motor para um conjunto de itens com as mesmas regras efetivas (NOMES, UNIDADES, LIMITES). Aspecto sem regra fica com o
 * parâmetro do projeto (comportamento de antes). `codigoProduto` = conversões por produto do item (partição própria).
 */
export function parametrosDaParticao(base: ParametrosMotor, regras: Partial<Record<Aspecto, RegraResolvivel>>, codigoProduto: string | null = null): ParametrosMotor {
  const p: ParametrosMotor = { ...base };
  const nomes = regras.NOMES; const unid = regras.UNIDADES; const lim = regras.LIMITES;
  if (nomes) {
    if (nomes.legado) {
      const l = nomes.parametrosLegados ?? {};
      if (l.abreviacoesAprovadas !== undefined) p.abreviacoesAprovadas = l.abreviacoesAprovadas; else delete p.abreviacoesAprovadas;
      if (l.padronizarCaixaAlta !== undefined) p.padronizarCaixaAlta = l.padronizarCaixaAlta; else delete p.padronizarCaixaAlta;
    } else {
      // Regra nova: a forma da descrição vem da própria regra (caso DESCRICAO_FORA_PADRAO); aqui só as abreviações aprovadas, para a camada
      // não apontar como ambígua uma abreviação que a regra aprovou. Mesmo formato do parâmetro antigo: chave = forma ABREVIADA, valor = forma
      // POR EXTENSO (o inverso da conversão em converterParametros).
      const c = nomes.conteudo as RegraNomes;
      p.abreviacoesAprovadas = Object.fromEntries(c.abreviacoes.map((a) => [chaveAbreviacao(a.abreviacao), a.completa]).filter(([k]) => k));
      p.padronizarCaixaAlta = false;
    }
  }
  if (unid) {
    if (unid.legado) {
      const l = unid.parametrosLegados ?? {};
      if (l.politicaUnidade !== undefined) p.politicaUnidade = l.politicaUnidade; else delete p.politicaUnidade;
    } else {
      const c = unid.conteudo as RegraUnidades;
      const pol = base.politicaUnidade ?? {};
      const rotulos = { ...(pol.rotulos ?? {}) };
      if (c.criterioEstoque === 'DEFINIDA' && c.unidadeDefinida) {
        const k = classificarUnidade(c.unidadeDefinida);
        if (k?.grandeza) rotulos[k.grandeza] = c.unidadeDefinida.trim().toUpperCase();
      }
      p.politicaUnidade = {
        ativa: c.criterioEstoque === 'MENOR_PRATICA',
        regras: { ...(pol.regras ?? {}), ...regrasDeConversao(c.conversoes), ...(codigoProduto != null ? regrasDeConversao(c.conversoes, codigoProduto) : {}) },
        rotulos,
      };
    }
  }
  if (lim) {
    if (lim.legado) {
      const l = lim.parametrosLegados ?? {};
      if (l.limites !== undefined) p.limites = l.limites; else delete p.limites;
    } else delete p.limites; // regra nova: o excesso é avaliado por destino (EXCEDE_LIMITE_DESTINO), nunca pelo parâmetro solto
  }
  return p;
}

/** Limite efetivo por campo do item: o MENOR limite confirmado entre as linhas. Linha sem número ou não confirmada fica de fora (pendência). */
export function limitesEfetivos(linhas: LinhaLimite[]): Map<LinhaLimite['campoItem'], { limite: number; linha: LinhaLimite }> {
  const m = new Map<LinhaLimite['campoItem'], { limite: number; linha: LinhaLimite }>();
  for (const l of linhas) {
    if (!l.confirmado || l.limite == null) continue;
    const ja = m.get(l.campoItem);
    if (!ja || l.limite < ja.limite) m.set(l.campoItem, { limite: l.limite, linha: l });
  }
  return m;
}

/** Alertas da regra de limites: ERP configurado acima do leiaute oficial (o leiaute é o teto). `oficiais` = linhas oficiais conhecidas além das da regra. */
export function alertasDeLimites(linhas: LinhaLimite[], oficiais: LinhaLimite[] = []): string[] {
  const alertas: string[] = [];
  const teto = new Map<string, LinhaLimite>();
  for (const l of [...linhas, ...oficiais]) {
    if (l.origem !== 'LEIAUTE_OFICIAL' || !l.confirmado || l.limite == null) continue;
    const ja = teto.get(l.campoItem);
    if (!ja || l.limite < (ja.limite as number)) teto.set(l.campoItem, l);
  }
  for (const l of linhas) {
    if (l.origem !== 'ERP' || l.limite == null) continue;
    const t = teto.get(l.campoItem);
    if (t && l.limite > (t.limite as number)) alertas.push(`${l.destino} (${l.campo}) aceita ${l.limite} caracteres, acima do leiaute oficial ${t.destino} (${t.campo}: ${t.limite}). Vale o menor: o cadastro deve caber em ${t.limite}.`);
  }
  for (const l of linhas) if (!l.confirmado || l.limite == null) alertas.push(`Limite de ${l.destino} (${l.campo}) não confirmado: pendência (nenhum número genérico é usado).`);
  return alertas;
}

const ROTULO_CAMPO: Record<string, string> = { codigo: 'Código', descricao: 'Descrição', unidade: 'Unidade', referencia: 'Referência', fabricante: 'Fabricante', grupo: 'Grupo' };

/** Id fixo da regra-modelo de limites com as linhas oficiais (LIMITES_OFICIAIS): a biblioteca de conteúdo não traz regra de LIMITES. */
export const ID_BIBLIOTECA_LIMITES = 'bib-limites-oficiais';

/**
 * Linhas de limite de origem ERP a partir do Cadastro de ERPs, pela MESMA regra de `limitesDoErp` (erps/logica.ts): conhecimento LIMITE_CAMPO
 * ativo de ERP ativo e com perfil específico (A_DESENVOLVER fica de fora), na ordem do cadastro; só CONFIRMADO com "<n> caracteres" vira
 * limite, o resto entra sem número (pendência).
 */
export function linhasDoErp(perfil: PerfilErp | null | undefined): LinhaLimite[] {
  if (!perfil) return [];
  return limitesDoErp(perfil).map((l) => ({
    destino: perfil.nome.slice(0, 120), campo: String(l.campoErp || l.campoItem).slice(0, 120), campoItem: l.campoItem, limite: l.limite, origem: 'ERP',
    referencia: `Cadastro de ERPs: ${String(l.observacao).slice(0, 400)}`, url: l.fonteUrl && /^https?:\/\//i.test(l.fonteUrl) ? l.fonteUrl.slice(0, 500) : null, confirmado: l.confirmado,
    tratamento: 'SUGERIR_ABREVIACAO', preservar: ['NOME', 'REFERENCIA'],
  } satisfies LinhaLimite));
}

/**
 * Regra equivalente "Todos os grupos" para cada aspecto com parâmetro antigo preenchido. O motor usa `parametrosLegados` (resultado idêntico).
 * `linhasPadrao` (leiaute oficial e ERP) entram na regra de limites convertida, depois das do parâmetro antigo: valem quando a regra for editada.
 */
export function converterParametros(motor: ParametrosMotor | null | undefined, linhasPadrao: LinhaLimite[] = []):{ aspecto: Aspecto; nome: string; observacao: string; alteracoes: Record<string, unknown>; parametrosLegados: ParametrosMotor }[] {
  const m = motor ?? {};
  const out: ReturnType<typeof converterParametros> = [];
  const nota = 'Convertida automaticamente dos parâmetros que o projeto já tinha antes das Diretrizes; enquanto não for editada, a análise segue exatamente como antes.';
  // No parâmetro antigo a chave é a forma ABREVIADA e o valor a forma POR EXTENSO (motor/nomes-unidades.ts: "sext" → "SEXTAVADO"); na regra,
  // `completa` = por extenso e `abreviacao` = a forma curta.
  const abrev = m.abreviacoesAprovadas && typeof m.abreviacoesAprovadas === 'object' ? Object.entries(m.abreviacoesAprovadas).filter(([curta, extenso]) => String(curta).trim() && String(extenso ?? '').trim()) : [];
  if (abrev.length || typeof m.padronizarCaixaAlta === 'boolean') {
    out.push({
      aspecto: 'NOMES', nome: 'Padrão de nomes do projeto', observacao: nota,
      alteracoes: {
        capitalizacao: m.padronizarCaixaAlta === true ? 'MAIUSCULAS' : 'PRESERVAR',
        abreviacoes: abrev.map(([curta, extenso]) => ({ completa: String(extenso).trim().slice(0, 120), abreviacao: String(curta).trim().slice(0, 60) })),
      },
      parametrosLegados: { ...(m.abreviacoesAprovadas !== undefined ? { abreviacoesAprovadas: m.abreviacoesAprovadas } : {}), ...(m.padronizarCaixaAlta !== undefined ? { padronizarCaixaAlta: m.padronizarCaixaAlta } : {}) },
    });
  }
  if (m.politicaUnidade && typeof m.politicaUnidade === 'object') {
    const pol = m.politicaUnidade;
    const padrao = conteudoPadrao('UNIDADES') as RegraUnidades;
    const conversoes: RegraUnidades['conversoes'] = [];
    for (const [chave, r] of Object.entries(pol.regras ?? {})) {
      const f = r?.fator == null || r.fator === '' ? null : Number(r.fator);
      const destino = r?.grandeza ? (pol.rotulos as Record<string, string> | undefined)?.[r.grandeza] ?? { massa: 'KG', volume: 'L', comprimento: 'M', area: 'M2', contagem: 'UN' }[r.grandeza as string] : null;
      if (!r?.manter && destino && f != null && Number.isFinite(f) && f > 0 && chaveUnidade(chave) !== chaveUnidade(destino)) conversoes.push({ origem: chave.toUpperCase().slice(0, 20), destino: String(destino).slice(0, 20), fator: f, abrangencia: 'GRUPO', codigoProduto: null });
    }
    out.push({
      aspecto: 'UNIDADES', nome: 'Unidades do projeto',
      observacao: `${nota}${pol.ativa === false ? ' A política da menor unidade prática estava desligada no projeto.' : ''}`,
      alteracoes: { criterioEstoque: padrao.criterioEstoque, conversoes },
      parametrosLegados: { politicaUnidade: pol },
    });
  }
  const lim = m.limites && typeof m.limites === 'object' ? (Object.entries(m.limites) as [keyof LimitesCampo, number][]).filter(([, v]) => typeof v === 'number' && v > 0) : [];
  if (lim.length) {
    const linhas: LinhaLimite[] = lim.filter(([k]) => k !== 'grupo').map(([k, v]) => ({
      destino: 'ERP do cliente (parâmetro do projeto)', campo: ROTULO_CAMPO[k] ?? k, campoItem: k as LinhaLimite['campoItem'], limite: Math.floor(v), origem: 'CLIENTE',
      referencia: 'Limite informado no projeto antes das Diretrizes', url: null, confirmado: true, tratamento: 'SOLICITAR_REVISAO', preservar: [],
    }));
    const grupo = lim.find(([k]) => k === 'grupo');
    out.push({
      aspecto: 'LIMITES', nome: 'Limites de campo do projeto',
      observacao: `${nota}${grupo ? ` O limite do campo Grupo (${grupo[1]}) continua valendo pelo parâmetro antigo (não há linha de grupo nas Diretrizes).` : ''}`,
      alteracoes: { linhas: [...linhas, ...linhasPadrao] }, parametrosLegados: { limites: m.limites },
    });
  }
  return out;
}
