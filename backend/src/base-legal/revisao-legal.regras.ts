import { FUNDAMENTOS_CALCULO, FundamentoCalculo } from './fundamentos-calculo';

export type TipoRevisao = 'cartao' | 'fundamento' | 'marco';

/** Dispositivo da Base legal cujo texto mudou (ou que saiu do texto oficial) numa atualização. */
export type MudancaDispositivo = {
  caminho: string;
  rotulo: string;
  mudanca: 'alterado' | 'revogado';
  /** Texto novo, quando alterado: serve para ver se o trecho citado ainda consta nele. */
  texto?: string;
};

export type NormaMudada = { chave: string; numero: string };

export type NovaRevisao = {
  tipo: TipoRevisao;
  alvo_id: string;
  alvo_titulo: string;
  norma_chave: string;
  norma_numero: string;
  caminho: string;
  rotulo: string;
  mudanca: 'alterado' | 'revogado';
  detalhe: string | null;
};

type Citacao = { norma: string; caminho: string; trecho?: string | null };
type Alvo = { id: string; titulo: string; citacoes: Citacao[] };

export const normalizarTexto = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** O que mudou, em palavras: se havia um trecho citado, diz se ele ainda consta no texto novo. */
function detalheDa(m: MudancaDispositivo, trechos: string[], tipo: TipoRevisao): string {
  if (m.mudanca === 'revogado') return 'O dispositivo foi revogado ou saiu do texto oficial.';
  if (!trechos.length || m.texto === undefined) return 'O texto do dispositivo mudou.';
  const novo = normalizarTexto(m.texto);
  const ausentes = trechos.filter((t) => !novo.includes(normalizarTexto(t)));
  const varios = trechos.length > 1;
  if (tipo === 'marco') {
    return ausentes.length ? 'O trecho de onde a data foi lida não consta mais no texto do dispositivo.' : 'O texto do dispositivo mudou; o trecho de onde a data foi lida ainda consta nele.';
  }
  if (!ausentes.length) return `O texto do dispositivo mudou; ${varios ? 'os trechos citados no cartão ainda constam' : 'o trecho citado no cartão ainda consta'} nele.`;
  if (!varios) return 'O trecho citado no cartão não consta mais no texto do dispositivo.';
  return `${ausentes.length} dos ${trechos.length} trechos citados no cartão não constam mais no texto do dispositivo.`;
}

function revisoesDe(tipo: TipoRevisao, alvos: Alvo[], norma: NormaMudada, mudancas: MudancaDispositivo[]): NovaRevisao[] {
  const porCaminho = new Map(mudancas.map((m) => [m.caminho, m]));
  const saida: NovaRevisao[] = [];
  for (const alvo of alvos) {
    const daNorma = alvo.citacoes.filter((c) => c.norma === norma.chave);
    const caminhos = [...new Set(daNorma.map((c) => c.caminho))];
    for (const caminho of caminhos) {
      const m = porCaminho.get(caminho);
      if (!m) continue;
      const trechos = daNorma.filter((c) => c.caminho === caminho && c.trecho && c.trecho.trim()).map((c) => c.trecho as string);
      saida.push({
        tipo, alvo_id: alvo.id, alvo_titulo: alvo.titulo, norma_chave: norma.chave, norma_numero: norma.numero,
        caminho, rotulo: m.rotulo, mudanca: m.mudanca, detalhe: detalheDa(m, trechos, tipo),
      });
    }
  }
  return saida;
}

const comoFundamentos = (v: unknown): Citacao[] => (Array.isArray(v) ? v.filter((f): f is Citacao => Boolean(f) && typeof f.norma === 'string' && typeof f.caminho === 'string') : []);

/** Cartões de pergunta frequente que citam algum dos dispositivos alterados. */
export function revisoesDeCartoes(cartoes: { id: string; pergunta: string; fundamentos: unknown }[], norma: NormaMudada, mudancas: MudancaDispositivo[]): NovaRevisao[] {
  return revisoesDe('cartao', cartoes.map((c) => ({ id: c.id, titulo: c.pergunta, citacoes: comoFundamentos(c.fundamentos) })), norma, mudancas);
}

/** Notas "i" do cálculo (fundamentos legais) que citam algum dos dispositivos alterados. */
export function revisoesDeFundamentos(norma: NormaMudada, mudancas: MudancaDispositivo[], fundamentos: FundamentoCalculo[] = FUNDAMENTOS_CALCULO): NovaRevisao[] {
  return revisoesDe('fundamento', fundamentos.map((f) => ({ id: f.chave, titulo: f.titulo, citacoes: f.refs })), norma, mudancas);
}

/** Fonte de um marco da agenda; as que trazem norma_chave e caminho estão ligadas a um dispositivo da Base legal. */
export type FonteDoMarco = { instrumento?: string; dispositivo?: string; url?: string; trecho?: string | null; norma_chave?: string | null; caminho?: string | null };
export type MarcoCitante = { id: string; titulo: string; fontes: unknown };

const comoFontes = (v: unknown): FonteDoMarco[] => (Array.isArray(v) ? v.filter((f): f is FonteDoMarco => Boolean(f) && typeof f === 'object') : []);

/** Marcos da agenda cuja fonte é um dos dispositivos alterados. */
export function revisoesDeMarcos(marcos: MarcoCitante[], norma: NormaMudada, mudancas: MudancaDispositivo[]): NovaRevisao[] {
  const alvos = marcos.map((m) => ({
    id: m.id,
    titulo: m.titulo,
    citacoes: comoFontes(m.fontes)
      .filter((f) => f.norma_chave && f.caminho)
      .map((f) => ({ norma: f.norma_chave as string, caminho: f.caminho as string, trecho: f.trecho })),
  }));
  return revisoesDe('marco', alvos, norma, mudancas);
}

/** Quantos itens citam os dispositivos, sem gravar nada (para avisar o administrador antes de aprovar a atualização). */
export type Impacto = { cartoes: number; publicados: number; fundamentos: number; marcos: number };

export function impactoDe(
  cartoes: { id: string; pergunta: string; status: string; fundamentos: unknown }[],
  marcos: MarcoCitante[],
  norma: NormaMudada,
  mudancas: MudancaDispositivo[],
): Impacto {
  const dosCartoes = revisoesDeCartoes(cartoes, norma, mudancas);
  const idsCartoes = new Set(dosCartoes.map((r) => r.alvo_id));
  return {
    cartoes: idsCartoes.size,
    publicados: cartoes.filter((c) => idsCartoes.has(c.id) && c.status === 'revisado').length,
    fundamentos: new Set(revisoesDeFundamentos(norma, mudancas).map((r) => r.alvo_id)).size,
    marcos: new Set(revisoesDeMarcos(marcos, norma, mudancas).map((r) => r.alvo_id)).size,
  };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Frase curta para o aviso da Base legal: o que a atualização atinge. Vazia quando nada é citado. */
export function frasePorImpacto(i: Impacto): string {
  const partes = [
    i.cartoes ? `${plural(i.cartoes, 'cartão de pergunta frequente', 'cartões de pergunta frequente')}${i.publicados ? ` (${plural(i.publicados, 'publicado', 'publicados')})` : ''}` : '',
    i.fundamentos ? plural(i.fundamentos, 'nota do cálculo', 'notas do cálculo') : '',
    i.marcos ? plural(i.marcos, 'marco da agenda', 'marcos da agenda') : '',
  ].filter(Boolean);
  return partes.length ? `Citam estes dispositivos: ${partes.join(', ')}. Depois da atualização, voltam para revisão.` : '';
}
