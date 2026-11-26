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
import { ev, justificar, montarResultado } from './base';
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
      if (txt(it.unidade)) {
        const u = testeUnidade(it);
        if (u.achado && u.extra?.tipo === 'conversao') {
          const e = u.extra;
          c({ camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_CONVERSAO', itens: id, problema: u.motivo ?? 'Unidade maior ou embalagem como unidade de estoque',
            evidencia: [ev('Origem', 'Coluna da unidade e descrição da base importada'), ev('Unidade atual', e.de), ev('Medida', e.grandeza), ev('Evidência do fator', e.evidencia ?? 'nenhuma: a informar')], atual: { codigo: it.codigo, unidade: it.unidade },
            proposta: { unidade: u.sugerida ?? null, unidadeCompra: e.de, fatorConversao: e.fator, fatorSituacao: e.fator == null ? 'INFORMAR' : FATOR_SITUACAO[e.evidencia ?? ''] ?? 'CONFIRMAR', exigeFator: e.fator == null ? 'SIM' : 'NAO' },
            fundamento: 'Política de unidade de estoque: menor unidade prática da medida; a maior/embalagem vira unidade de compra',
            impactos: ['Unidades e fatores de conversão (SPED 0190, 0220) e itens dos documentos', 'Duplicidade: itens em unidades diferentes passam a ser comparáveis'],
            justificativa: justificar(`${u.motivo}. A unidade de estoque é a menor unidade prática; a atual passa a ser a de compra.`, e.fator == null ? 'informar quantas unidades de estoque há em cada unidade de compra (o motor não adivinha o conteúdo).' : e.evidencia === 'descricao' ? 'confirmar o conteúdo lido da descrição e aprovar.' : 'aprovar a conversão (fator exato).') });
        } else if (u.achado && u.extra?.tipo === 'grafia') {
          c({ camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_GRAFIA', itens: id, problema: u.motivo ?? 'Grafia da unidade diferente da padrão', evidencia: [ev('Origem', 'Coluna da unidade na base importada'), ev('Grafia atual', u.extra.de), ev('Grafia padrão', u.extra.para)], atual: { codigo: it.codigo, unidade: it.unidade },
            proposta: { unidade: u.extra.para }, impactos: ['Unidades (SPED 0190)'], justificativa: justificar('A mesma unidade escrita de formas diferentes fragmenta relatórios e conversões.', 'aprovar a grafia padrão.') });
        } else if (u.achado && !u.sugerida) {
          c({ camada: 'NOMES_UNIDADES', tipo: 'UNIDADE_SEM_REGRA', itens: id, problema: u.motivo ?? 'Unidade sem regra na política', evidencia: [ev('Origem', 'Coluna da unidade na base importada'), ev('Unidade', it.unidade)], atual: { codigo: it.codigo, unidade: it.unidade },
            justificativa: justificar('A política não conhece esta unidade e o motor não a adivinha (rolo, balde, frasco... dependem do item).', 'classificar a unidade na tabela de unidades do projeto (medida e fator) ou marcá-la para manter.') });
        }
      }
    }
    return montarResultado('NOMES_UNIDADES', itens, casos);
  }
}
