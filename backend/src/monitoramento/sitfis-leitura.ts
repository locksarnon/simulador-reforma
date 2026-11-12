/**
 * Leitura do Relatório de Situação Fiscal (Receita Federal e PGFN, "Informações de apoio para emissão de certidão"), o PDF que o
 * Integra Contador devolve no SITFIS. As seções têm títulos fixos seguidos de traços, ex.: "Pendência - Débito (SIEF) ______",
 * "Parcelamento com Exigibilidade Suspensa (SISPAR) ______", "Certidão Emitida ______". Conferido em relatórios reais de 2025.
 * Seções de omissão de declaração são reconhecidas pelo título com "Omissão" (não havia exemplo real; formato não confirmado).
 */
export type SecaoSitfis = { titulo: string; orgao: 'RFB' | 'PGFN'; tipo: 'PENDENCIA' | 'SUSPENSO' | 'OMISSAO' | 'OUTRO'; assunto: 'DEBITO' | 'PARCELAMENTO' | 'INSCRICAO' | 'PROCESSO' | 'OMISSAO' | 'OUTRO'; linhas: string[] };
export type LeituraSitfis = {
  emitidoEm: string | null;
  certidao: { tipo: string; codigo: string | null; emissao: string | null; validade: string | null } | null;
  secoes: SecaoSitfis[];
  semPendencias: boolean;
};

const CABECALHO = /^(MINIST[ÉE]RIO DA FAZENDA|SECRETARIA ESPECIAL DA RECEITA|PROCURADORIA-GERAL DA FAZENDA NACIONAL|INFORMA[ÇC][ÕO]ES DE APOIO|P[áa]gina:|CNPJ: \d{2}\.\d{3}\.\d{3} - )/i;
const SEM_SECAO = /^(Dados Cadastrais|S[óo]cios e Administradores|Diagn[óo]stico Fiscal)/i;

function classificar(titulo: string): Pick<SecaoSitfis, 'tipo' | 'assunto'> {
  const t = titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tipo = /omiss/.test(t) ? 'OMISSAO' : /^pendencia/.test(t) ? 'PENDENCIA' : /exigibilidade suspensa/.test(t) ? 'SUSPENSO' : 'OUTRO';
  const assunto = /omiss/.test(t) ? 'OMISSAO' : /parcelamento|sicob|siefpar|sipade|sispar/.test(t) ? 'PARCELAMENTO' : /inscricao/.test(t) ? 'INSCRICAO' : /processo/.test(t) ? 'PROCESSO' : /debito/.test(t) ? 'DEBITO' : 'OUTRO';
  return { tipo, assunto };
}

export function lerRelatorioSitfis(texto: string): LeituraSitfis {
  const linhas = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const emitido = texto.match(/(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/);
  let orgao: SecaoSitfis['orgao'] = 'RFB';
  const secoes: SecaoSitfis[] = [];
  let atual: SecaoSitfis | null = null;
  let certidao: LeituraSitfis['certidao'] = null;
  let emCertidao = false;
  for (const l of linhas) {
    if (CABECALHO.test(l)) continue;
    const ehTitulo = /_{6,}/.test(l);
    if (ehTitulo) {
      const titulo = l.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
      if (/Procuradoria-Geral/i.test(titulo)) { orgao = 'PGFN'; atual = null; emCertidao = false; continue; }
      if (/Diagn[óo]stico Fiscal na Receita/i.test(titulo)) { orgao = 'RFB'; atual = null; emCertidao = false; continue; }
      emCertidao = /^Certid[ãa]o Emitida/i.test(titulo);
      if (emCertidao || SEM_SECAO.test(titulo) || !titulo) { atual = null; continue; }
      atual = { titulo, orgao, ...classificar(titulo), linhas: [] };
      secoes.push(atual);
      continue;
    }
    if (emCertidao) {
      const m = l.match(/^(Certid[ãa]o [^:]+):\s*([\w.]+)?\s*(?:Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4}))?\s*(?:Data de Validade:\s*(\d{2}\/\d{2}\/\d{4}))?/i);
      if (m) certidao = { tipo: m[1].trim(), codigo: m[2] ?? null, emissao: m[3] ?? null, validade: m[4] ?? null };
      continue;
    }
    if (atual && !/^CNPJ: \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(l)) atual.linhas.push(l);
  }
  const relevantes = secoes.filter((s) => s.tipo === 'PENDENCIA' || s.tipo === 'OMISSAO');
  return { emitidoEm: emitido ? emitido[1] : null, certidao, secoes, semPendencias: relevantes.length === 0 };
}

/** Resumo para o cartão do monitoramento: nível e título a partir das seções lidas. */
export function resumoDoSitfis(l: LeituraSitfis) {
  const pend = l.secoes.filter((s) => s.tipo === 'PENDENCIA');
  const omis = l.secoes.filter((s) => s.tipo === 'OMISSAO');
  const susp = l.secoes.filter((s) => s.tipo === 'SUSPENSO');
  const partes = [
    pend.length ? `${pend.length} pendência(s): ${pend.map((s) => s.titulo).join('; ')}` : 'Sem pendências',
    omis.length ? `${omis.length} omissão(ões) de declaração` : '',
    susp.length ? `${susp.length} item(ns) com exigibilidade suspensa` : '',
  ].filter(Boolean);
  return { nivel: pend.length || omis.length ? 'CRITICO' : susp.length ? 'ATENCAO' : 'OK', titulo: `${partes.join('; ')}.` } as const;
}
