/**
 * Sugestão de Finalidade do item (lista fechada do contrato) a partir do grupo, do nome e das atividades confirmadas.
 * Função pura e determinística. NUNCA decide: devolve sugestão, motivo e confiança; o consultor confirma por grupo.
 */
import { Finalidade, FINALIDADES, ItemTrabalho } from '../tipos';
import type { Atividade } from './atividades';

export type Confianca = 'alta' | 'media' | 'baixa';

export type ContextoGrupo = {
  grupo: string | null;
  /** Finalidades já confirmadas ou sugeridas para os demais itens do mesmo grupo (contagem). Opcional. */
  distribuicao?: Partial<Record<Finalidade, number>>;
};

export type SugestaoFinalidade = {
  finalidade: Finalidade | null;
  confianca: Confianca;
  motivo: string;
  /** Outras finalidades plausíveis quando as atividades confirmadas permitem mais de uma leitura. */
  alternativas: Finalidade[];
};

export const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Regra = { id: string; em: 'grupo' | 'nome' | 'ambos'; re: RegExp; tipo: 'FIXA' | 'INSUMO_AGRO'; finalidade?: Finalidade; confianca?: Confianca; motivo: string };

/** Ordem importa: a primeira regra que casa vale (peça e manutenção antes de máquina; terceiros antes de tudo). */
const REGRAS: Regra[] = [
  { id: 'terceiros', em: 'ambos', re: /\b(material|mercadoria|bem|bens) (de|em poder de) terceiros\b|\bem poder de terceiros\b|\bconsignad[oa]/, tipo: 'FIXA', finalidade: 'MATERIAL_TERCEIROS', confianca: 'alta', motivo: 'indica material de terceiros ou consignado' },
  { id: 'manut_grupo', em: 'grupo', re: /\bmanuten[cç]|\bcorpo de maquina|\bpecas? (de )?reposicao|\bpecas e acessorios\b/, tipo: 'FIXA', finalidade: 'MANUTENCAO', confianca: 'alta', motivo: 'o grupo é de manutenção ou peças de reposição' },
  { id: 'embalagem', em: 'ambos', re: /\bembalag|\bsacaria\b|\bbig ?bag\b|\bbombona\b|\bsaco (para|de) (embalar|rafia|po|papel|aniagem)|\bcaixa de papelao\b/, tipo: 'FIXA', finalidade: 'EMBALAGEM', confianca: 'alta', motivo: 'embalagem pelo nome ou grupo' },
  { id: 'manut_nome', em: 'nome', re: /\b(rolamento|retentor|correia|mancal|junta|bucha|bico injetor|filtro de (oleo|ar|combustivel)|elemento filtrante|pastilha|lamina de corte|disco de corte|ponteira)\b/, tipo: 'FIXA', finalidade: 'MANUTENCAO', confianca: 'media', motivo: 'o nome é de peça de reposição' },
  { id: 'uso_consumo', em: 'ambos', re: /\b(epi|equipamento de protecao individual|uniforme|luva|bota|capacete|papelaria|material de escritorio|material de limpeza|higiene|copa e cozinha|descartavel|toner|cartucho)\b|\buso e consumo\b/, tipo: 'FIXA', finalidade: 'USO_CONSUMO', confianca: 'media', motivo: 'material de uso e consumo pelo nome ou grupo' },
  { id: 'imobilizado', em: 'ambos', re: /\b(trator|colheitadeira|pulverizador autopropelido|plantadeira|semeadora|pivo central|silo|caminhao|implemento agricola|veiculo|carreta|maquinas? e equipamentos|ativo imobilizado|imobilizado)\b/, tipo: 'FIXA', finalidade: 'IMOBILIZADO', confianca: 'media', motivo: 'bem durável (máquina, veículo ou equipamento) pelo nome ou grupo' },
  { id: 'materia_prima', em: 'ambos', re: /\bmateria[- ]prima\b/, tipo: 'FIXA', finalidade: 'MATERIA_PRIMA', confianca: 'media', motivo: 'o nome ou grupo diz matéria-prima' },
  { id: 'insumo_agro', em: 'ambos', re: /\b(herbicida|fungicida|inseticida|acaricida|defensivo|agroquimico|adubo|fertilizante|inoculante|corretivo|calcario|ureia|semente|sementes|muda|mudas|racao|sal mineral|nucleo mineral|vacina|vermifugo|medicamento veterinario|adjuvante|espalhante|formicida)\b/, tipo: 'INSUMO_AGRO', motivo: 'insumo agropecuário' },
  { id: 'combustivel', em: 'ambos', re: /\b(oleo diesel|diesel|gasolina|etanol|arla|lubrificante|graxa)\b/, tipo: 'INSUMO_AGRO', motivo: 'combustível ou lubrificante' },
];

const alvo = (r: Regra, grupo: string, nome: string) => (r.em === 'grupo' ? grupo : r.em === 'nome' ? nome : `${grupo} ${nome}`);
const tem = (ats: Atividade[], ...q: Atividade[]) => q.some((a) => ats.includes(a));

/** Decide a finalidade do insumo agropecuário pelas atividades confirmadas. */
function insumoAgro(ats: Atividade[], motivoBase: string): SugestaoFinalidade {
  const revende = tem(ats, 'REVENDA_INSUMOS');
  const comercio = tem(ats, 'COMERCIO_ATACADISTA', 'COMERCIO_VAREJISTA');
  const produz = tem(ats, 'PRODUCAO_AGRICOLA', 'PECUARIA', 'PRODUCAO_FLORESTAL');
  if (ats.length === 0) return { finalidade: null, confianca: 'baixa', motivo: `${motivoBase}, mas não há atividades confirmadas para decidir entre revenda e insumo de produção`, alternativas: ['REVENDA', 'INSUMO_PRODUCAO'] };
  if (revende && !produz) return { finalidade: 'REVENDA', confianca: 'alta', motivo: `${motivoBase}; o cliente confirmou revenda de insumos e não confirmou produção`, alternativas: [] };
  if (produz && !revende && !comercio) return { finalidade: 'INSUMO_PRODUCAO', confianca: 'alta', motivo: `${motivoBase}; o cliente produz e não confirmou comércio de insumos`, alternativas: [] };
  if (revende && produz) return { finalidade: 'REVENDA', confianca: 'baixa', motivo: `${motivoBase}; o cliente revende e também produz: o mesmo item pode ser revenda ou insumo (confirmar por grupo)`, alternativas: ['INSUMO_PRODUCAO'] };
  if (comercio && !produz) return { finalidade: 'REVENDA', confianca: 'media', motivo: `${motivoBase}; o cliente confirmou comércio e não confirmou produção`, alternativas: [] };
  if (comercio && produz) return { finalidade: 'INSUMO_PRODUCAO', confianca: 'baixa', motivo: `${motivoBase}; o cliente produz e também comercializa: confirmar por grupo`, alternativas: ['REVENDA'] };
  if (tem(ats, 'INDUSTRIALIZACAO')) return { finalidade: 'INSUMO_PRODUCAO', confianca: 'media', motivo: `${motivoBase}; o cliente industrializa`, alternativas: [] };
  return { finalidade: null, confianca: 'baixa', motivo: `${motivoBase}; as atividades confirmadas não indicam revenda nem produção`, alternativas: ['REVENDA', 'INSUMO_PRODUCAO'] };
}

export function sugerirFinalidade(item: Pick<ItemTrabalho, 'descricao' | 'grupo' | 'finalidade'>, atividades: string[], contextoGrupo?: ContextoGrupo | null): SugestaoFinalidade {
  if (item.finalidade) return { finalidade: item.finalidade, confianca: 'alta', motivo: 'finalidade já presente no item (informada na base ou decidida antes)', alternativas: [] };
  const ats = atividades as Atividade[];
  const grupo = semAcento(item.grupo ?? contextoGrupo?.grupo ?? ''); const nome = semAcento(item.descricao);
  for (const r of REGRAS) {
    if (!r.re.test(alvo(r, grupo, nome))) continue;
    if (r.tipo === 'FIXA') return { finalidade: r.finalidade!, confianca: r.confianca!, motivo: r.motivo, alternativas: [] };
    // combustível só é insumo de produção quando o cliente produz; sem isso fica sem sugestão
    if (r.id === 'combustivel') {
      return tem(ats, 'PRODUCAO_AGRICOLA', 'PECUARIA', 'PRODUCAO_FLORESTAL', 'INDUSTRIALIZACAO', 'TRANSPORTE')
        ? { finalidade: 'INSUMO_PRODUCAO', confianca: 'media', motivo: `${r.motivo}; o cliente tem atividade que o consome na operação`, alternativas: ['USO_CONSUMO'] }
        : { finalidade: null, confianca: 'baixa', motivo: `${r.motivo}; as atividades confirmadas não indicam o consumo`, alternativas: ['USO_CONSUMO', 'REVENDA'] };
    }
    return insumoAgro(ats, r.motivo);
  }
  const d = contextoGrupo?.distribuicao;
  if (d) {
    const total = FINALIDADES.reduce((s, f) => s + (d[f] ?? 0), 0);
    const [f, n] = FINALIDADES.map((x) => [x, d[x] ?? 0] as const).sort((a, b) => b[1] - a[1])[0];
    if (total >= 3 && n / total >= 0.7) return { finalidade: f, confianca: 'media', motivo: `${Math.round((n / total) * 100)}% dos itens do grupo têm essa finalidade`, alternativas: [] };
  }
  return { finalidade: null, confianca: 'baixa', motivo: 'nenhum indício no grupo ou no nome', alternativas: [] };
}

export type SugestaoGrupo = {
  grupo: string | null;
  total: number;
  distribuicao: Partial<Record<Finalidade, number>>;
  semSugestao: number;
  dominante: Finalidade | null;
  /** Fração dos itens com sugestão que têm a finalidade dominante. */
  proporcao: number;
  confianca: Confianca;
  motivo: string;
  excecoes: { itemId: string; finalidade: Finalidade; motivo: string }[];
};

/** Agrega a sugestão por grupo: distribuição, finalidade dominante e os itens que fogem dela (exceções a confirmar). */
export function sugerirFinalidadePorGrupo(itens: Pick<ItemTrabalho, 'id' | 'descricao' | 'grupo' | 'finalidade'>[], atividades: string[]): SugestaoGrupo[] {
  const grupos = new Map<string, typeof itens>();
  for (const it of itens) { const k = it.grupo ?? ''; (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(it); }
  const saida: SugestaoGrupo[] = [];
  for (const [k, lista] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
    const sug = lista.map((it) => ({ it, s: sugerirFinalidade(it, atividades, { grupo: k || null }) }));
    const distribuicao: Partial<Record<Finalidade, number>> = {};
    let semSugestao = 0;
    for (const { s } of sug) { if (s.finalidade) distribuicao[s.finalidade] = (distribuicao[s.finalidade] ?? 0) + 1; else semSugestao++; }
    const com = lista.length - semSugestao;
    const ord = FINALIDADES.map((f) => [f, distribuicao[f] ?? 0] as const).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1] || FINALIDADES.indexOf(a[0]) - FINALIDADES.indexOf(b[0]));
    const dominante = ord[0]?.[0] ?? null;
    const proporcao = com > 0 && ord[0] ? ord[0][1] / com : 0;
    const confianca: Confianca = !dominante ? 'baixa' : proporcao >= 0.9 && com / lista.length >= 0.8 ? 'alta' : proporcao >= 0.6 ? 'media' : 'baixa';
    const excecoes = dominante ? sug.filter((x) => x.s.finalidade && x.s.finalidade !== dominante).map((x) => ({ itemId: x.it.id, finalidade: x.s.finalidade!, motivo: x.s.motivo })) : [];
    saida.push({
      grupo: k || null, total: lista.length, distribuicao, semSugestao, dominante, proporcao: Math.round(proporcao * 100) / 100, confianca,
      motivo: dominante ? `${ord[0][1]} de ${lista.length} itens apontam para esta finalidade${semSugestao ? `; ${semSugestao} sem sugestão` : ''}` : 'nenhum item do grupo teve sugestão',
      excecoes,
    });
  }
  return saida;
}
