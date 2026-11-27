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

type Regra = {
  id: string; em: 'grupo' | 'nome' | 'ambos'; re: RegExp; tipo: 'FIXA' | 'INSUMO_AGRO' | 'SEM_SUGESTAO';
  finalidade?: Finalidade; confianca?: Confianca; motivo: string; alternativas?: Finalidade[];
};

/**
 * Ordem importa: a primeira regra que casa vale. Terceiros antes de tudo; depois os grupos de manutenção e os grupos ambíguos (que
 * dependem do cliente); depois as regras por nome ou grupo, em que uma palavra do NOME de uma regra anterior gera exceção no grupo
 * (ex.: luva no grupo de defensivos). Palavras sempre no singular e no plural (fertilizante/fertilizantes), sem acento.
 */
const REGRAS: Regra[] = [
  { id: 'imob_terceiros', em: 'grupo', re: /\b(predios|benfeitorias|edificacoes|construcoes) em (prop\.?|propriedade|imove(l|is)) de terceiros\b/, tipo: 'FIXA', finalidade: 'IMOBILIZADO', confianca: 'media', motivo: 'benfeitoria em imóvel de terceiros é ativo do cliente, não material de terceiros' },
  { id: 'terceiros', em: 'ambos', re: /\b(material|materiais|mercadoria|mercadorias|bem|bens|produtos?) (de|em poder de) terceiros\b|\bem poder de terceiros\b|\bconsignad[oa]s?\b/, tipo: 'FIXA', finalidade: 'MATERIAL_TERCEIROS', confianca: 'alta', motivo: 'indica material de terceiros ou consignado' },
  { id: 'terceiros_grupo', em: 'grupo', re: /^terceiros$|\barmazenagem (de )?terceiros\b/, tipo: 'FIXA', finalidade: 'MATERIAL_TERCEIROS', confianca: 'media', motivo: 'o grupo é de bens de terceiros (armazenagem ou guarda)' },
  {
    id: 'manut_grupo', em: 'grupo',
    re: /\bmanuten[cç]|\bcorpo de maquina|\bpecas?( de)? reposicao|\bpecas e acessorios\b|\b(aneis|anel|rolamentos?|retentor(es)?|juntas?|correias?|polias?|ferramentas?|oficina|ferro|aco|filtros?|mangueiras?|conexoes|hidraulic[ao]s?|pneumatic[ao]s?|motores|transmiss(ao|oes)|cambios?|parafusos?|fixadores?|porcas?|arruelas?|pneus?|camaras?|borracharia)\b|\beletric[ao]s?\b.*\bautomotiv|\beletronic[ao]s?\b.*\bautomotiv/,
    tipo: 'FIXA', finalidade: 'MANUTENCAO', confianca: 'alta', motivo: 'o grupo é de manutenção, peças de reposição ou materiais de oficina',
  },
  // Grupos ambíguos: dependem do uso no cliente. Sugestão de confiança baixa com alternativas, ou nenhuma sugestão (nunca se inventa).
  { id: 'nao_estoque', em: 'grupo', re: /^(servicos?|taxas?)$/, tipo: 'SEM_SUGESTAO', motivo: 'serviços e taxas não são item de estoque: confirmar com o cliente o que está cadastrado no grupo' },
  { id: 'generico', em: 'grupo', re: /^(outros|outros produtos|diversos|geral)$/, tipo: 'SEM_SUGESTAO', motivo: 'grupo genérico: a finalidade depende de cada item (reclassificar com o cliente)' },
  { id: 'plantel', em: 'grupo', re: /\bplantel\b|\brebanho\b|\bsemoventes?\b/, tipo: 'SEM_SUGESTAO', motivo: 'ativo biológico: confirmar com o cliente (animais para venda, para reprodução ou para trabalho têm tratamento diferente)', alternativas: ['REVENDA', 'IMOBILIZADO'] },
  { id: 'producao', em: 'grupo', re: /^producao( propria)?$/, tipo: 'SEM_SUGESTAO', motivo: 'grupo "Produção": confirmar com o cliente se é produto da própria produção (estoque para venda) ou insumo em processo', alternativas: ['INSUMO_PRODUCAO', 'MATERIA_PRIMA'] },
  { id: 'construcao', em: 'grupo', re: /\bconstrucao\b/, tipo: 'FIXA', finalidade: 'USO_CONSUMO', confianca: 'baixa', motivo: 'materiais de construção: consumo em reparos ou parte de obra que vira imobilizado (confirmar o uso)', alternativas: ['IMOBILIZADO', 'MANUTENCAO'] },
  { id: 'lonas', em: 'grupo', re: /\blonas?\b|\bplasticos?\b/, tipo: 'FIXA', finalidade: 'USO_CONSUMO', confianca: 'baixa', motivo: 'lonas e plásticos: consumo na cobertura e armazenagem ou embalagem do produto (confirmar o uso)', alternativas: ['EMBALAGEM'] },
  { id: 'beneficiamento', em: 'grupo', re: /\bbenef[ie]ciamento\b|\bindustrializacao\b/, tipo: 'FIXA', finalidade: 'INSUMO_PRODUCAO', confianca: 'baixa', motivo: 'materiais para beneficiamento ou industrialização: insumo do processo ou embalagem do produto (confirmar o uso)', alternativas: ['EMBALAGEM', 'MATERIA_PRIMA'] },
  // Embalagem pelo grupo ou quando o NOME começa pela embalagem (UREIA BIG BAG é ureia, não embalagem).
  { id: 'embalagem_grupo', em: 'grupo', re: /\bembalage|\bsacarias?\b/, tipo: 'FIXA', finalidade: 'EMBALAGEM', confianca: 'alta', motivo: 'o grupo é de embalagens' },
  { id: 'embalagem', em: 'nome', re: /^(embalage|sacarias?\b|big ?bags?\b|bombonas?\b|sacos? (para|de) (embalar|rafia|po|papel|aniagem)\b|caixas? de papelao\b)/, tipo: 'FIXA', finalidade: 'EMBALAGEM', confianca: 'alta', motivo: 'embalagem pelo nome' },
  { id: 'manut_nome', em: 'nome', re: /\b(rolamentos?|retentor(es)?|correias?|mancal|mancais|juntas?|buchas?|bicos? injetor(es)?|filtros? de (oleo|ar|combustivel|diesel|hidraulico)|elementos? filtrantes?|pastilhas?|laminas? de corte|discos? de corte|ponteiras?)\b/, tipo: 'FIXA', finalidade: 'MANUTENCAO', confianca: 'media', motivo: 'o nome é de peça de reposição' },
  { id: 'uso_consumo', em: 'ambos', re: /\b(epis?|epcs?|equipamentos? de protecao( individual)?|seguranca individual|ssma|uniformes?|luvas?|botas?|capacetes?|papelaria|materia(l|is) de (escritorio|expediente)|expediente|materia(l|is) de limpeza|limpeza|higiene|copa|cozinha|descartave(l|is)|toners?|cartuchos?)\b|\buso e consumo\b/, tipo: 'FIXA', finalidade: 'USO_CONSUMO', confianca: 'media', motivo: 'material de uso e consumo pelo nome ou grupo' },
  { id: 'uso_grupo', em: 'grupo', re: /\b(alimentos?|horta|refeitorio|medicamentos farmaceuticos|farmacia|saude ocupacional|pecuaria - itens)\b/, tipo: 'FIXA', finalidade: 'USO_CONSUMO', confianca: 'media', motivo: 'o grupo é de consumo interno (refeitório, saúde ocupacional ou itens de apoio)' },
  { id: 'informatica', em: 'grupo', re: /\binformatica\b|\bradiocomunicacao\b/, tipo: 'FIXA', finalidade: 'USO_CONSUMO', confianca: 'media', motivo: 'informática e comunicação: material de consumo; equipamento durável é imobilizado', alternativas: ['IMOBILIZADO'] },
  { id: 'pequeno_valor', em: 'grupo', re: /\bpequeno valor\b/, tipo: 'FIXA', finalidade: 'USO_CONSUMO', confianca: 'media', motivo: 'bens de pequeno valor são lançados como despesa (uso e consumo); acima do limite, imobilizado', alternativas: ['IMOBILIZADO'] },
  { id: 'imobilizado', em: 'ambos', re: /\b(trator(es)?|colheitadeiras?|pulverizador(es)? autopropelidos?|plantadeiras?|semeadoras?|pivos? centra(l|is)|silos?|caminh(ao|oes)|implementos? agricolas?|veiculos?|carretas?|maquinas? e equipamentos|aeronaves?|ativo imobilizado|imobilizado)\b/, tipo: 'FIXA', finalidade: 'IMOBILIZADO', confianca: 'media', motivo: 'bem durável (máquina, veículo ou equipamento) pelo nome ou grupo' },
  { id: 'imob_grupo', em: 'grupo', re: /^equipamentos$|\bmoveis e utensilios\b|\bplataformas? de graos\b/, tipo: 'FIXA', finalidade: 'IMOBILIZADO', confianca: 'media', motivo: 'o grupo é de bens duráveis (equipamentos, móveis ou implementos)' },
  { id: 'materia_prima', em: 'ambos', re: /\bmaterias?[- ]primas?\b/, tipo: 'FIXA', finalidade: 'MATERIA_PRIMA', confianca: 'media', motivo: 'o nome ou grupo diz matéria-prima' },
  {
    id: 'insumo_agro', em: 'ambos',
    re: /\b(herbicidas?|fungicidas?|inseticidas?|acaricidas?|nematicidas?|formicidas?|defensivos?|agroquimicos?|agrotoxicos?|adubos?|fertilizantes?|inoculantes?|corretivos?|calcario|gesso agricola|ureia|cloreto de potassio|superfosfato|sulfato de amonio|nitrato de amonio|sementes?|mudas?|racao|racoes|nutricao|sal mineral|nucleo mineral|suplementos? minera(l|is)|vacinas?|vermifugos?|medicamentos? veterinarios?|adjuvantes?|espalhantes?)\b/,
    tipo: 'INSUMO_AGRO', motivo: 'insumo agropecuário',
  },
  { id: 'combustivel', em: 'ambos', re: /\b(oleo diesel|diesel|gasolina|etanol|arla( 32)?|lubrificantes?|graxas?|oleos? (lubrificantes?|hidraulicos?|de motor|para motor|de transmissao)|combustive(l|is)|aditivos? (para )?(combustive(l|is)|diesel|radiador|arrefecimento))\b/, tipo: 'INSUMO_AGRO', motivo: 'combustível ou lubrificante' },
];

/** Sem acento, minúsculo e com os espaços repetidos reduzidos ("PARAFUSOS  E FIXADORES" = "parafusos e fixadores"). */
const limpo = (s: unknown) => semAcento(s).replace(/\s+/g, ' ').trim();
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
  const grupo = limpo(item.grupo ?? contextoGrupo?.grupo ?? ''); const nome = limpo(item.descricao);
  for (const r of REGRAS) {
    if (!r.re.test(alvo(r, grupo, nome))) continue;
    if (r.tipo === 'SEM_SUGESTAO') return { finalidade: null, confianca: 'baixa', motivo: r.motivo, alternativas: r.alternativas ?? [] };
    if (r.tipo === 'FIXA') return { finalidade: r.finalidade!, confianca: r.confianca!, motivo: r.motivo, alternativas: r.alternativas ?? [] };
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
  /** Por que a regra sugeriu (ou não sugeriu) a finalidade do grupo: o motivo mais frequente entre os itens do dominante (ou dos sem sugestão). */
  motivoDaRegra: string;
  /** Outras finalidades plausíveis (grupo ambíguo ou que depende das atividades). */
  alternativas: Finalidade[];
  excecoes: { itemId: string; finalidade: Finalidade; motivo: string }[];
};

const ORDEM_CONFIANCA: Confianca[] = ['baixa', 'media', 'alta'];
const menorConfianca = (a: Confianca, b: Confianca): Confianca => (ORDEM_CONFIANCA.indexOf(a) <= ORDEM_CONFIANCA.indexOf(b) ? a : b);
function maisFrequente(lista: string[]): string | null {
  const n = new Map<string, number>();
  for (const x of lista) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

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
    const pelaProporcao: Confianca = !dominante ? 'baixa' : proporcao >= 0.9 && com / lista.length >= 0.8 ? 'alta' : proporcao >= 0.6 ? 'media' : 'baixa';
    // A confiança do grupo nunca é maior que a das sugestões que o formam (grupo ambíguo fica "baixa" mesmo com todos os itens iguais).
    const daRegra = sug.filter((x) => x.s.finalidade === dominante);
    const confianca = daRegra.reduce<Confianca>((c, x) => menorConfianca(c, x.s.confianca), pelaProporcao);
    const motivoDaRegra = maisFrequente(daRegra.map((x) => x.s.motivo)) ?? '';
    const alternativas = [...new Set(daRegra.flatMap((x) => x.s.alternativas))].filter((f) => f !== dominante);
    const excecoes = dominante ? sug.filter((x) => x.s.finalidade && x.s.finalidade !== dominante).map((x) => ({ itemId: x.it.id, finalidade: x.s.finalidade!, motivo: x.s.motivo })) : [];
    saida.push({
      grupo: k || null, total: lista.length, distribuicao, semSugestao, dominante, proporcao: Math.round(proporcao * 100) / 100, confianca,
      motivo: dominante ? `${ord[0][1]} de ${lista.length} itens apontam para esta finalidade${semSugestao ? `; ${semSugestao} sem sugestão` : ''}` : 'nenhum item do grupo teve sugestão',
      motivoDaRegra, alternativas, excecoes,
    });
  }
  return saida;
}
