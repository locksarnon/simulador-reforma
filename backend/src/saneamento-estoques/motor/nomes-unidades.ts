/**
 * Camada NOMES_UNIDADES: grafia e padronização da descrição (NOME + REFERÊNCIA + COMPLEMENTO), termos genéricos, abreviações que escondem atributo distintivo,
 * caracteres inválidos, tamanho de campo (só com limite informado) e a política de unidades (menor unidade prática da medida como estoque; a maior/embalagem vira unidade
 * de compra, com fator de conversão). Corrigir a descrição NÃO funde itens. O motor só SUGERE; a descrição original é sempre preservada.
 */
/**
 * UNIDADE_CONVERSAO: `proposta.fatorSituacao` = DEFINIDO (fator exato por definição, escrito na unidade ou regra do projeto) | CONFIRMAR (lido da descrição, o analista confere)
 * | INFORMAR (sem fator: o analista informa). `proposta.exigeFator` = 'SIM' (texto: a proposta só guarda texto, número ou null) quando o fator é nulo/INFORMAR: o backend deve RECUSAR a aprovação enquanto não houver fator.
 */
import type { AnalisadorCamada, CasoProposto, ContextoAnalise, ItemTrabalho, ResultadoCamada } from '../tipos';
import { ev, justificar, montarResultado, rotuloItem, valorComum } from './base';
import { parametrosDe } from './contexto';
import { novoCaso } from './dependencias';
import { campoDe, semAcento, soTermosGenericos, txt } from './texto';
import { achadosUnidade, type Grandeza } from './unidades';

export const REGRAS_PADRAO = { espacos: true, pontoColado: true, parenteses: true, unidadeColada: true, caixaAlta: true };
const UNIDADES_COLAVEIS = 'MM|CM|MT|KG|ML|KV|HP|CV|POL|M|G|L|V|W';

/** Descrição sugerida no padrão aprovado, com o motivo de cada mudança. Não inventa nada: só reorganiza o que já está escrito. */
export function padronizarDescricao(desc: unknown, regras: Partial<typeof REGRAS_PADRAO> = REGRAS_PADRAO, abrev: Record<string, string> = {}): { sugerida: string; motivos: string[]; mudou: boolean } {
  const original = String(desc ?? ''); let s = original; const motivos: string[] = [];
  const aplica = (motivo: string, novo: string) => { if (novo !== s) { motivos.push(motivo); s = novo; } };
  if (regras.espacos) aplica('espaços duplicados ou nas pontas', s.replace(/\s+/g, ' ').trim());
  if (regras.pontoColado) aplica('espaço depois do ponto da abreviação', s.replace(/([A-Za-zÀ-ÿ]{2,})\.(?=[A-Za-zÀ-ÿ]{3,})/g, '$1. '));
  if (regras.parenteses) aplica('parênteses em volta de referência', s.replace(/\(\s*([A-Za-z0-9][A-Za-z0-9\-/.]*)\s*\)/g, (m, t: string) => (/\d/.test(t) && t.length >= 3 ? t : m)));
  if (regras.unidadeColada) aplica('unidade colada ao número', s.replace(new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s+(${UNIDADES_COLAVEIS})(?![A-Za-z0-9.])`, 'gi'), (_m, n: string, u: string) => n + u.toUpperCase()));
  for (const [de, para] of Object.entries(abrev)) {
    const re = new RegExp(String.raw`(?<![A-Za-z0-9])${de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'gi');
    const trocado = s.replace(re, para.toUpperCase());
    if (trocado !== s) { motivos.push(`abreviação aprovada: ${de.toUpperCase()} → ${para.toUpperCase()}`); s = trocado; }
  }
  if (regras.caixaAlta) aplica('caixa alta', s.toUpperCase());
  return { sugerida: s, motivos, mudou: s !== original };
}

/**
 * Abreviações que, ao serem lidas como "igual a outra grafia", apagam um atributo distintivo (cor, lado, posição, tamanho). Não se expandem sozinhas:
 * viram caso de REVISÃO para o analista confirmar o significado. Lista inicial, a ampliar com o cliente.
 */
export const ABREVIACOES_AMBIGUAS: Record<string, { atributo: string; leituras: string[] }> = {
  az: { atributo: 'cor', leituras: ['azul'] }, vd: { atributo: 'cor', leituras: ['verde'] }, vm: { atributo: 'cor', leituras: ['vermelho'] }, am: { atributo: 'cor', leituras: ['amarelo'] },
  pt: { atributo: 'cor', leituras: ['preto'] }, br: { atributo: 'cor', leituras: ['branco'] }, bc: { atributo: 'cor', leituras: ['branco'] }, bco: { atributo: 'cor', leituras: ['branco'] }, bca: { atributo: 'cor', leituras: ['branca'] },
  esq: { atributo: 'lado', leituras: ['esquerdo', 'esquerda'] }, dir: { atributo: 'lado', leituras: ['direito', 'direita'] },
  dian: { atributo: 'posição', leituras: ['dianteiro'] }, dnt: { atributo: 'posição', leituras: ['dianteiro'] }, tras: { atributo: 'posição', leituras: ['traseiro'] }, ext: { atributo: 'posição', leituras: ['externo'] },
  int: { atributo: 'posição', leituras: ['interno'] }, sup: { atributo: 'posição', leituras: ['superior'] }, inf: { atributo: 'posição', leituras: ['inferior'] },
  gde: { atributo: 'tamanho', leituras: ['grande'] }, peq: { atributo: 'tamanho', leituras: ['pequeno'] }, med: { atributo: 'tamanho', leituras: ['médio'] },
};

const CONTROLE_OU_LIXO = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f�]|Ã[\u0080-¿]|Â[\u0080-¿]|â€/;
const ROTULO_TAMANHO: Record<string, string> = { codigo: 'Código', descricao: 'Descrição', unidade: 'Unidade', grupo: 'Grupo', fabricante: 'Fabricante', referencia: 'Referência' };
const FATOR_SITUACAO: Record<string, string> = { universal: 'DEFINIDO', unidade: 'DEFINIDO', regra: 'DEFINIDO', descricao: 'CONFIRMAR' };

/** Até 5 exemplos do conjunto (código e descrição) e a quantidade de itens. */
const exemplos = (grupo: ItemTrabalho[]) => [
  ...(grupo.length > 1 ? [ev('Itens do conjunto', grupo.length)] : []),
  ...grupo.slice(0, 5).map((x) => ev(grupo.length > 1 ? 'Exemplo' : 'Item', `${rotuloItem(x)}: ${x.descricao ?? ''}`.slice(0, 300))),
];
/**
 * "Como é hoje": a unidade é a mesma em todo o conjunto; o código só quando o caso é de um item (no conjunto, cada item tem o seu).
 * Com `proposta` (conversão), também a unidade de compra e o fator atuais, só os que a proposta altera (valor proposto não nulo) ou que
 * têm valor hoje: nenhuma chave nula sobra para campo que a proposta não muda (fator "a informar" com o item sem fator). Valor que muda
 * de item para item sai como "varia por item" e a conferência de divergência, na aprovação, vai item a item.
 */
const atualDaUnidade = (grupo: ItemTrabalho[], proposta?: Record<string, unknown>): Record<string, string | number | null> => {
  const base: Record<string, string | number | null> = grupo.length === 1 ? { codigo: grupo[0].codigo, unidade: grupo[0].unidade } : { unidade: grupo[0].unidade };
  if (!proposta) return base;
  for (const k of ['unidadeCompra', 'fatorConversao']) {
    const v = valorComum(grupo.map((x) => (x.campos?.[k] ?? null) as string | number | null));
    if (v != null || proposta[k] != null) base[k] = v;
  }
  return base;
};
const conjunto = (motivo: string, grupo: ItemTrabalho[]) => (grupo.length > 1 ? `${motivo} (${grupo.length} itens com esta unidade)` : motivo);

export class AnalisadorNomesUnidades implements AnalisadorCamada {
  readonly camada = 'NOMES_UNIDADES' as const;

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const par = parametrosDe(contexto);
    const pol = par.politicaUnidade ?? {};
    const abrevAprovadas = par.abreviacoesAprovadas ?? {};
    const aprovadasChaves = new Set(Object.keys(abrevAprovadas).map((k) => semAcento(k).toLowerCase()));
    const testeUnidade = achadosUnidade(itens, { politica: pol.ativa !== false, regras: pol.regras ?? {}, rotulos: (pol.rotulos ?? {}) as Partial<Record<Grandeza, string>> });
    const regrasForma = { ...REGRAS_PADRAO, caixaAlta: par.padronizarCaixaAlta === true };
    const casos: CasoProposto[] = [];
    const c = (x: Parameters<typeof novoCaso>[0]) => casos.push(novoCaso(x));
    // Casos de unidade por conjunto: a chave junta o que tem a mesma unidade escrita (exata) e a mesma proposta.
    type Montador = (grupo: ItemTrabalho[]) => Parameters<typeof novoCaso>[0];
    const grupos = new Map<string, { itens: ItemTrabalho[]; montar: Montador }>();
    const juntar = (chave: (string | number | null)[], it: ItemTrabalho, montar: Montador) => {
      const k = chave.map(String).join('\u0000');
      const g = grupos.get(k);
      if (g) g.itens.push(it); else grupos.set(k, { itens: [it], montar });
    };

    for (const it of itens) {
      const id = [it.id];
      const desc = it.descricao ?? '';
      if (txt(desc)) {
        // Padronização (forma): sugere, não funde itens.
        const p = padronizarDescricao(desc, regrasForma, abrevAprovadas);
        if (p.mudou) {
          c({ camada: 'NOMES_UNIDADES', tipo: 'DESCRICAO_FORA_DO_PADRAO', itens: id, problema: `Descrição fora do padrão: ${p.motivos.join('; ')}`, evidencia: [ev('Origem', 'Coluna da descrição na base importada'), ...p.motivos.map((m) => ev('Ajuste', m))],
            atual: { codigo: it.codigo, descricao: desc }, proposta: { descricao: p.sugerida }, fundamento: 'Padrão NOME + REFERÊNCIA + COMPLEMENTO (política de padronização do projeto)',
            justificativa: justificar('A forma da descrição segue o padrão do projeto; só muda grafia, espaços e caixa, nada do conteúdo. Padronizar o nome não funde itens.', 'aprovar a descrição sugerida (a original é preservada no histórico).') });
        }
        if (soTermosGenericos(desc)) {
          c({ camada: 'NOMES_UNIDADES', tipo: 'TERMO_GENERICO', itens: id, problema: 'Descrição só com termos genéricos: não identifica o produto', evidencia: [ev('Origem', 'Coluna da descrição na base importada'), ev('Descrição', desc)], atual: { codigo: it.codigo, descricao: desc },
            justificativa: justificar('Termos como "material", "peça" ou "diversos" não dizem qual produto é; classificação e duplicidade ficam sem base.', 'pedir ao cliente o nome do produto, a referência e o complemento; o motor não inventa característica.') });
        }
        const achadas = (semAcento(desc).toLowerCase().split(/[^a-z0-9]+/)).filter((t) => ABREVIACOES_AMBIGUAS[t] && !aprovadasChaves.has(t));
        if (achadas.length) {
          const u = [...new Set(achadas)];
          c({ camada: 'NOMES_UNIDADES', tipo: 'ABREVIACAO_ESCONDE_ATRIBUTO', itens: id, problema: `Abreviação que esconde atributo distintivo: ${u.map((t) => t.toUpperCase()).join(', ')}`,
            evidencia: [ev('Origem', 'Coluna da descrição na base importada'), ...u.map((t) => ev(t.toUpperCase(), `${ABREVIACOES_AMBIGUAS[t].atributo}: possivelmente ${ABREVIACOES_AMBIGUAS[t].leituras.join(' / ')}`))], atual: { codigo: it.codigo, descricao: desc },
            justificativa: justificar('Abreviar cor, lado, posição ou tamanho faz itens diferentes parecerem iguais (e itens iguais parecerem diferentes).', 'confirmar o significado com o cliente; só então aprovar a abreviação ou escrever por extenso. Caso de revisão: o motor não expande sozinho.') });
        }
        if (CONTROLE_OU_LIXO.test(desc)) {
          c({ camada: 'NOMES_UNIDADES', tipo: 'CARACTERES_INVALIDOS', itens: id, problema: 'Descrição com caractere de controle ou acentuação corrompida', evidencia: [ev('Origem', 'Coluna da descrição na base importada'), ev('Valor lido', JSON.stringify(desc))], atual: { codigo: it.codigo, descricao: desc },
            justificativa: justificar('Caracteres de controle e texto corrompido (acento lido errado) quebram buscas, exportações e arquivos fiscais.', 'conferir a descrição correta no ERP; o motor não adivinha o texto original.') });
        }
      }
      // Tamanho: só com limite informado pelo projeto/ERP (o motor nunca inventa limite).
      if (par.limites) {
        const estouros = Object.entries(par.limites).filter(([campo, lim]) => lim != null && lim > 0 && String(campoDe(it, campo) ?? '').length > (lim as number));
        if (estouros.length) {
          c({ camada: 'NOMES_UNIDADES', tipo: 'TAMANHO_EXCEDIDO', itens: id, problema: `Campo(s) acima do limite do ERP: ${estouros.map(([k]) => ROTULO_TAMANHO[k] ?? k).join(', ')}`,
            evidencia: [ev('Origem', 'Limites de campo informados para o projeto'), ...estouros.map(([k, lim]) => ev(ROTULO_TAMANHO[k] ?? k, `${String(campoDe(it, k) ?? '').length} caracteres (limite ${lim})`))], atual: { codigo: it.codigo },
            justificativa: justificar('O ERP de destino não aceita campo maior que o limite informado.', 'abreviar sem perder o atributo distintivo (aprovar a abreviação com o cliente); o motor não corta o texto.') });
        }
      }
      // Unidade: política da menor unidade de estoque. Unidade ausente é caso da Qualidade.
      // Trabalho por conjunto: itens com a MESMA unidade escrita e a MESMA proposta formam um só caso (resultado por item na aprovação).
      if (txt(it.unidade)) {
        const u = testeUnidade(it);
        if (u.achado && u.extra?.tipo === 'conversao') {
          const e = u.extra;
          const situacao = e.fator == null ? 'INFORMAR' : FATOR_SITUACAO[e.evidencia ?? ''] ?? 'CONFIRMAR';
          const proposta = { unidade: u.sugerida ?? null, unidadeCompra: e.de, fatorConversao: e.fator, fatorSituacao: situacao, exigeFator: e.fator == null ? 'SIM' : 'NAO' };
          juntar(['UNIDADE_CONVERSAO', it.unidade, u.sugerida ?? '', e.grandeza, e.fator ?? '', situacao, e.evidencia ?? ''], it, (grupo) => ({
            camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_CONVERSAO', itens: grupo.map((x) => x.id), problema: conjunto(u.motivo ?? 'Unidade maior ou embalagem como unidade de estoque', grupo),
            evidencia: [ev('Origem', 'Coluna da unidade e descrição da base importada'), ev('Unidade atual', e.de), ev('Medida', e.grandeza), ev('Evidência do fator', e.evidencia ?? 'nenhuma: a informar'), ...exemplos(grupo)],
            atual: atualDaUnidade(grupo, proposta),
            proposta,
            fundamento: 'Política de unidade de estoque: menor unidade prática da medida; a maior/embalagem vira unidade de compra',
            impactos: ['Unidades e fatores de conversão (SPED 0190, 0220) e itens dos documentos', 'Duplicidade: itens em unidades diferentes passam a ser comparáveis'],
            justificativa: justificar(`${u.motivo}. A unidade de estoque é a menor unidade prática; a atual passa a ser a de compra.${grupo.length > 1 ? ` A proposta vale para os ${grupo.length} itens do conjunto (mesma unidade e mesmo fator).` : ''}`,
              e.fator == null ? `informar quantas unidades de estoque há em cada unidade de compra (o motor não adivinha o conteúdo)${grupo.length > 1 ? '; o fator informado vale para todos os itens do conjunto: item de conteúdo diferente vira exceção (motivo obrigatório) antes de aprovar o conjunto' : ''}.` : e.evidencia === 'descricao' ? 'confirmar o conteúdo lido da descrição e aprovar.' : 'aprovar a conversão (fator exato).'),
          }));
        } else if (u.achado && u.extra?.tipo === 'grafia') {
          const g = u.extra;
          juntar(['UNIDADE_GRAFIA', it.unidade, g.para], it, (grupo) => ({
            camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_GRAFIA', itens: grupo.map((x) => x.id), problema: conjunto(u.motivo ?? 'Grafia da unidade diferente da padrão', grupo),
            evidencia: [ev('Origem', 'Coluna da unidade na base importada'), ev('Grafia atual', g.de), ev('Grafia padrão', g.para), ...exemplos(grupo)], atual: atualDaUnidade(grupo),
            proposta: { unidade: g.para }, impactos: ['Unidades (SPED 0190)'], justificativa: justificar('A mesma unidade escrita de formas diferentes fragmenta relatórios e conversões.', 'aprovar a grafia padrão.'),
          }));
        } else if (u.achado && !u.sugerida) {
          juntar(['UNIDADE_SEM_REGRA', it.unidade], it, (grupo) => ({
            camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_SEM_REGRA', itens: grupo.map((x) => x.id), problema: conjunto(u.motivo ?? 'Unidade sem regra na política', grupo),
            evidencia: [ev('Origem', 'Coluna da unidade na base importada'), ev('Unidade', it.unidade), ...exemplos(grupo)], atual: atualDaUnidade(grupo),
            justificativa: justificar('A política não conhece esta unidade e o motor não a adivinha (rolo, balde, frasco... dependem do item).', 'classificar a unidade na tabela de unidades do projeto (medida e fator) ou marcá-la para manter.'),
          }));
        }
      }
    }
    for (const g of grupos.values()) c(g.montar(g.itens));
    return montarResultado('NOMES_UNIDADES', itens, casos);
  }
}
