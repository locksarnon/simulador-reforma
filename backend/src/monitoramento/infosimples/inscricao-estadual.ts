import type { Servico } from '../catalogo';
import type { Nivel, Resumo } from '../interpretar';
import { servicoInfosimples, txt, type ContextoInfosimples } from './base';

// ---------------------------------------------------------------------------------------------------------------------------------
// Inscrição estadual: situação cadastral na SEFAZ pelo SINTEGRA (https://infosimples.com/consultas/sintegra-unificada/).
// A consulta unificada chama o SINTEGRA da UF informada; o preço adicional é o da consulta da UF (MT R$ 0,06; MS, MA e PA R$ 0,04;
// GO sem adicional). Ficam de fora PE e SE (o SINTEGRA de lá exige login gov.br ou certificado digital) e MG e PI (sem SINTEGRA
// no catálogo da Infosimples).
// ---------------------------------------------------------------------------------------------------------------------------------

/** UFs atendidas sem login do contribuinte. */
export const UFS_SINTEGRA = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MS', 'MT', 'PA', 'PB', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SP', 'TO',
];

const ufDe = (c: ContextoInfosimples) => String(c.uf ?? '').trim().toUpperCase();

export function parametrosSintegra(c: ContextoInfosimples): Record<string, string> {
  const cnpj = String(c.cnpj ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) throw new Error('Cadastre o CNPJ do cliente (14 dígitos) para fazer esta consulta.');
  const uf = ufDe(c);
  if (!/^[A-Z]{2}$/.test(uf)) throw new Error('Cadastre a UF do cliente para consultar a inscrição estadual.');
  return { uf, cnpj };
}

type Situacao = 'ATIVA' | 'IRREGULAR' | 'OUTRA';

/** Classifica o texto da situação cadastral do SINTEGRA. */
export function classificarSituacao(texto: string): Situacao {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!t) return 'OUTRA';
  if (/suspen|baixad|inapt|cancelad|cassad|\bnul[ao]\b|bloquead|interditad|paralisad|inativ|nao\s*ativ|nao\s*habilitad|inabilitad|excluid|revogad|desabilitad/.test(t)) return 'IRREGULAR';
  if (/ativ|habilitad|regular/.test(t)) return 'ATIVA';
  return 'OUTRA';
}

/** "31/12/2024", "2024-12-31" ou "20241231" → "20241231" (formato de data das tabelas do monitoramento). */
function aaaammdd(v: unknown): string {
  const s = txt(v);
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  return s;
}
const dataDe = (o: Record<string, unknown>, campo: string) => aaaammdd(txt(o[`normalizado_${campo}`]) || o[campo]);
const dataBr = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : s);

function endereco(o: Record<string, unknown>): string {
  const rua = [txt(o.endereco_logradouro), txt(o.endereco_numero), txt(o.endereco_complemento)].filter(Boolean).join(', ');
  const cidade = [txt(o.endereco_municipio), txt(o.endereco_uf)].filter(Boolean).join('/');
  const cep = txt(o.normalizado_endereco_cep) || txt(o.endereco_cep);
  return [rua, txt(o.endereco_bairro), cidade, cep ? `CEP ${cep}` : ''].filter(Boolean).join(' - ') || txt(o.endereco_estabelecimento);
}

/** CNAE principal: texto da atividade (alguns estados mandam objeto ou lista). */
function cnae(o: Record<string, unknown>): string {
  const v = o.atividade_economica ?? o.atividade_economica_principal;
  const juntar = (x: unknown) => (x && typeof x === 'object' ? Object.values(x as Record<string, unknown>).map(txt).filter(Boolean).join(' - ') : txt(x));
  if (Array.isArray(v)) return v.map(juntar).filter(Boolean).join('; ');
  return juntar(v);
}

/** Regime de apuração do ICMS (o nome do campo muda conforme o estado). */
const regime = (o: Record<string, unknown>) => txt(o.regime_apuracao) || txt(o.forma_tributacao) || txt(o.regime_pagamento);

export function lerSintegra(data: Record<string, unknown>[]): Resumo {
  const itens = (data ?? []).filter((x) => x && typeof x === 'object' && (txt(x.inscricao_estadual) || txt(x.situacao_cadastral)));
  if (!itens.length) return { nivel: 'INFO', titulo: 'O SINTEGRA não listou inscrição estadual para este CNPJ.', destaques: [] };

  const linhas = itens.map((o) => {
    const situacao = txt(o.situacao_cadastral);
    const especial = txt(o.situacao_especial);
    return {
      inscricao: txt(o.normalizado_inscricao_estadual) || txt(o.inscricao_estadual) || '—',
      situacao: situacao || '—',
      data: dataDe(o, 'situacao_cadastral_data'),
      regime: regime(o) || '—',
      cnae: cnae(o) || '—',
      endereco: endereco(o) || '—',
      observacoes: [txt(o.situacao_cadastral_observacoes), especial ? `Situação especial: ${especial}` : ''].filter(Boolean).join(' ') || '—',
      _s: classificarSituacao(situacao),
      _especial: Boolean(especial),
    };
  });

  const irregulares = linhas.filter((l) => l._s === 'IRREGULAR');
  const indefinidas = linhas.filter((l) => l._s === 'OUTRA');
  const nivel: Nivel = irregulares.length ? 'CRITICO' : indefinidas.length || linhas.some((l) => l._especial) ? 'ATENCAO' : 'OK';
  const p = linhas[0];
  const titulo = irregulares.length
    ? linhas.length === 1
      ? `Inscrição estadual ${p.inscricao} com situação ${p.situacao.toLowerCase()} na SEFAZ.`
      : `${irregulares.length} de ${linhas.length} inscrições estaduais com situação irregular na SEFAZ.`
    : indefinidas.length
      ? 'Situação da inscrição estadual a conferir na SEFAZ.'
      : linhas.length === 1
        ? `Inscrição estadual ${p.inscricao} ativa na SEFAZ.`
        : `${linhas.length} inscrições estaduais ativas na SEFAZ.`;

  const destaques = [
    { rotulo: 'Razão social', valor: txt(itens[0].razao_social) || txt(itens[0].nome) },
    ...(linhas.length === 1
      ? [
          { rotulo: 'Inscrição estadual', valor: p.inscricao },
          { rotulo: 'Situação', valor: p.data ? `${p.situacao} desde ${dataBr(p.data)}` : p.situacao },
          { rotulo: 'Regime de apuração', valor: p.regime },
          { rotulo: 'CNAE', valor: p.cnae },
          { rotulo: 'Endereço', valor: p.endereco },
        ]
      : [{ rotulo: 'Inscrições', valor: String(linhas.length) }]),
  ].filter((d) => d.valor && d.valor !== '—');

  return {
    nivel,
    titulo,
    destaques,
    tabela: {
      colunas: [
        { chave: 'inscricao', rotulo: 'Inscrição estadual' },
        { chave: 'situacao', rotulo: 'Situação' },
        { chave: 'data', rotulo: 'Data da situação', tipo: 'data' },
        { chave: 'regime', rotulo: 'Regime de apuração' },
        { chave: 'cnae', rotulo: 'CNAE' },
        { chave: 'endereco', rotulo: 'Endereço' },
        { chave: 'observacoes', rotulo: 'Observações' },
      ],
      linhas: linhas.map(({ _s, _especial, ...l }) => l),
    },
  };
}

export const servicos: Servico[] = [
  servicoInfosimples({
    chave: 'is-sintegra',
    rotulo: 'Inscrição estadual (SINTEGRA)',
    grupo: 'situacao',
    descricao: 'Situação cadastral das inscrições estaduais do CNPJ na SEFAZ: ativa, suspensa, baixada ou inapta, com data, regime de apuração, CNAE e endereço.',
    ufs: UFS_SINTEGRA,
    consulta: {
      rota: (c) => (UFS_SINTEGRA.includes(ufDe(c)) ? 'sintegra/unificada' : null),
      parametros: parametrosSintegra,
      ler: (data) => lerSintegra(data),
      adicional: 0.06,
    },
  }),
];
