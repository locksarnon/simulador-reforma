import type { Servico } from '../catalogo';
import type { Nivel, Resumo } from '../interpretar';
import { servicoInfosimples, txt } from './base';

/*
 * PER/DCOMP pela consulta pública "Receita Federal / PER/DCOMP" (receita-federal/perdcomp, por CNPJ, sem certificado).
 * A consulta "ECAC / PER/DCOMP" (ecac/perdcomp) não entra: exige o certificado A1 do cliente (pkcs12_cert e pkcs12_pass).
 */

const so = (v: string) => v.replace(/\D/g, '');

/** dd/mm/aaaa, aaaa-mm-dd ou aaaammdd → aaaammdd (formato das colunas de data do monitoramento). */
function dataAaaammdd(v: unknown): string {
  const s = txt(v);
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  return /^\d{8}$/.test(s) ? s : '';
}

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Classe da situação para contagem e nível. */
export function classeDaSituacao(situacao: string): 'nao-homologado' | 'indeferido' | 'em-analise' | 'deferido' | 'outra' {
  const s = sem(situacao);
  if (!s) return 'outra';
  if (/nao homologad|homologacao parcial|parcialmente homologad/.test(s)) return 'nao-homologado';
  if (/indeferid|deferimento parcial|parcialmente deferid/.test(s)) return 'indeferido';
  if (/analise|aguardando|pendente|em processamento|em tratamento/.test(s)) return 'em-analise';
  if (/deferid|homologad|reconhecid/.test(s)) return 'deferido';
  return 'outra';
}

type Pedido = Record<string, unknown>;

/** Os pedidos da resposta: data[].perdcomp (lista ou objeto). */
function pedidos(data: Record<string, unknown>[]): Pedido[] {
  const out: Pedido[] = [];
  for (const d of data ?? []) {
    const p = d?.perdcomp;
    if (Array.isArray(p)) out.push(...p.filter((x): x is Pedido => !!x && typeof x === 'object'));
    else if (p && typeof p === 'object') out.push(p as Pedido);
  }
  return out;
}

export function lerPerdcomp(data: Record<string, unknown>[]): Resumo {
  const linhas = pedidos(data).map((p) => ({
    numero: txt(p.perdcomp),
    tipoDocumento: txt(p.tipo_documento),
    tipoCredito: txt(p.tipo_credito),
    transmissao: dataAaaammdd(p.normalizado_data_transmissao) || dataAaaammdd(p.data_transmissao),
    situacao: txt(p.situacao),
    detalhamento: txt(p.situacao_detalhamento),
  }));
  if (!linhas.length) return { nivel: 'OK', titulo: 'Nenhum PER/DCOMP encontrado para o CNPJ.', destaques: [] };

  const conta = { 'nao-homologado': 0, indeferido: 0, 'em-analise': 0, deferido: 0, outra: 0 };
  let semSituacao = 0;
  for (const l of linhas) {
    if (!l.situacao) { semSituacao++; continue; }
    conta[classeDaSituacao(l.situacao)]++;
  }
  const negados = conta['nao-homologado'] + conta.indeferido;
  const nivel: Nivel = negados ? 'CRITICO' : conta['em-analise'] ? 'INFO' : 'OK';
  const titulo = negados
    ? `${negados} PER/DCOMP indeferido(s) ou não homologado(s): confira o prazo da manifestação de inconformidade e os débitos em cobrança.`
    : conta['em-analise']
      ? `${conta['em-analise']} PER/DCOMP em análise na Receita Federal.`
      : `${linhas.length} PER/DCOMP encontrado(s), sem indeferimento nem não homologação.`;

  const destaques = [
    { rotulo: 'PER/DCOMP encontrados', valor: String(linhas.length) },
    { rotulo: 'Em análise', valor: String(conta['em-analise']) },
    { rotulo: 'Deferidos ou homologados', valor: String(conta.deferido) },
    { rotulo: 'Indeferidos', valor: String(conta.indeferido) },
    { rotulo: 'Não homologados', valor: String(conta['nao-homologado']) },
  ];
  if (conta.outra) destaques.push({ rotulo: 'Outras situações', valor: String(conta.outra) });
  if (semSituacao) destaques.push({ rotulo: 'Sem situação no retorno (consulte pelo número)', valor: String(semSituacao) });

  return {
    nivel, titulo, destaques,
    tabela: {
      colunas: [
        { chave: 'numero', rotulo: 'Número' },
        { chave: 'tipoDocumento', rotulo: 'Tipo de documento' },
        { chave: 'tipoCredito', rotulo: 'Tipo de crédito' },
        { chave: 'transmissao', rotulo: 'Transmissão', tipo: 'data' },
        { chave: 'situacao', rotulo: 'Situação' },
        { chave: 'detalhamento', rotulo: 'Detalhamento' },
      ],
      linhas,
    },
  };
}

export const servicos: Servico[] = [
  servicoInfosimples({
    chave: 'is-perdcomp',
    rotulo: 'PER/DCOMP: pedidos e compensações',
    grupo: 'declaracoes',
    descricao: 'Os pedidos de restituição, ressarcimento ou reembolso e as declarações de compensação do CNPJ, com a situação de cada um na Receita Federal.',
    parametros: [{ nome: 'perdcomp', rotulo: 'Número do PER/DCOMP (opcional)', tipo: 'texto' }],
    consulta: {
      rota: () => 'receita-federal/perdcomp',
      parametros: (c): Record<string, string> => {
        const cnpj = so(c.cnpj ?? '');
        if (cnpj.length !== 14) throw new Error('O cadastro do cliente não tem um CNPJ válido para consultar o PER/DCOMP.');
        const numero = so(c.params?.perdcomp ?? '');
        return numero ? { cnpj, perdcomp: numero } : { cnpj };
      },
      ler: (data) => lerPerdcomp(data),
    },
  }),
];
