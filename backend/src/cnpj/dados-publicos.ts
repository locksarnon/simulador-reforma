/** O que a consulta pública do CNPJ devolve (CnpjService.consultar). */
export type DadosCnpj = {
  razao_social: string; nome_fantasia: string; uf: string; municipio: string; cnae_descricao: string; situacao: string;
  cnae_codigo: string; cnaes_secundarios: { codigo: string; descricao: string }[]; porte: string; natureza_juridica: string; codigo_municipio_ibge: string;
  opcao_pelo_simples: boolean | null; opcao_pelo_mei: boolean | null; data_inicio_atividade: string; capital_social: number | null; matriz_filial: string;
  socios: { nome: string; qualificacao: string }[];
  logradouro?: string; numero?: string; complemento?: string; bairro?: string; cep?: string; telefone?: string; email?: string;
};

const ou = (v: string | undefined | null) => (v && String(v).trim() ? String(v).trim() : null);

/**
 * Campos do cadastro do cliente preenchidos pela consulta pública do CNPJ (Receita Federal). UF e município só entram se o
 * cadastro estiver vazio (o que o escritório digitou vale mais); o resto é da Receita e é sempre atualizado.
 */
export function camposDoCnpj(d: DadosCnpj, atual: { uf?: string | null; municipio?: string | null } = {}) {
  return {
    nome_fantasia: ou(d.nome_fantasia),
    // Sempre preenchida (também marca que o cadastro já recebeu os campos novos da Receita).
    situacao_cadastral: ou(d.situacao) ?? 'não informada',
    data_abertura: ou(d.data_inicio_atividade),
    matriz_filial: ou(d.matriz_filial),
    capital_social: d.capital_social ?? null,
    opcao_simples: d.opcao_pelo_simples ?? null,
    opcao_mei: d.opcao_pelo_mei ?? null,
    cnae_principal: ou(d.cnae_codigo),
    cnae_descricao: ou(d.cnae_descricao),
    cnaes_secundarios: (d.cnaes_secundarios ?? []) as never,
    socios: (d.socios ?? []) as never,
    porte: ou(d.porte),
    natureza_juridica: ou(d.natureza_juridica),
    codigo_municipio_ibge: ou(d.codigo_municipio_ibge),
    logradouro: ou(d.logradouro),
    numero: ou(d.numero),
    complemento: ou(d.complemento),
    bairro: ou(d.bairro),
    cep: ou(d.cep),
    telefone_receita: ou(d.telefone),
    email_receita: ou(d.email),
    ...(atual.uf ? {} : { uf: ou(d.uf) }),
    ...(atual.municipio ? {} : { municipio: ou(d.municipio) }),
    dados_publicos_em: new Date(),
  };
}

/** Quanto se espera pela consulta pública do CNPJ antes de desistir (a BrasilAPI às vezes não responde). */
export const ESPERA_CONSULTA_CNPJ_MS = 20_000;

type ConsultaCnpj = { consultar(cnpj: string): Promise<DadosCnpj> };
type EmpresaComDocumento = { id: string; cnpj_cpf?: string | null; uf?: string | null; municipio?: string | null };
type PrismaEmpresa = { empresa: { update(a: { where: { id: string }; data: ReturnType<typeof camposDoCnpj> }): Promise<unknown> } };

/**
 * Consulta o CNPJ da empresa e grava os dados públicos no cadastro (o mesmo caminho do cadastro do cliente e de quem mais
 * atualiza pela Receita). Lança se o documento não for CNPJ, se a consulta falhar ou se passar do tempo; quem chama decide se
 * a falha impede ou só vira aviso.
 */
export async function atualizarEmpresaPeloCnpj<T>(prisma: PrismaEmpresa, cnpj: ConsultaCnpj, empresa: EmpresaComDocumento, esperaMs = ESPERA_CONSULTA_CNPJ_MS): Promise<T> {
  const doc = String(empresa.cnpj_cpf ?? '').replace(/\D/g, '');
  if (doc.length !== 14) throw new Error('O cliente não tem CNPJ: os dados da Receita só valem para empresas.');
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => { relogio = setTimeout(() => rejeitar(new Error('a consulta ao CNPJ não respondeu a tempo.')), esperaMs); });
  try {
    const dados = await Promise.race([cnpj.consultar(doc), limite]);
    return (await prisma.empresa.update({ where: { id: empresa.id }, data: camposDoCnpj(dados, empresa) })) as T;
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}
