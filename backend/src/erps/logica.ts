/**
 * Regras puras do Cadastro de ERPs. Espelho de src/lib/erps.js (o teste logica.test.ts confere que as duas associam igual).
 */
export const TIPOS_CONHECIMENTO = ['COLUNA_EXPORT', 'CONSULTA_EXTRACAO', 'RESTRICAO', 'ACAO_NO_ERP', 'MODELO_CARGA', 'OBSERVACAO', 'LIMITE_CAMPO'] as const;
export type TipoConhecimento = (typeof TIPOS_CONHECIMENTO)[number];
export const SITUACOES_ERP = ['COMPLETO', 'PARCIAL', 'A_DESENVOLVER'] as const;
export type SituacaoErp = (typeof SITUACOES_ERP)[number];
export const GRAUS = ['CONFIRMADO', 'NAO_CONFIRMADO'] as const;
export type GrauErp = (typeof GRAUS)[number];

export type ErpBasico = { id: string; nome: string; fabricante?: string | null; produto?: string | null; situacao?: string; ativo?: boolean; apelidos?: string[] };
export type ItemConhecimento = {
  id: string; tipo: string; tipo_ajuste: string | null; chave: string; texto: string; campo_erp: string | null; fonte_url: string | null; grau: string; ordem: number; ativo: boolean;
};
/** O ERP com o conhecimento ativo (o que as telas usam). */
export type PerfilErp = ErpBasico & { situacao: string; itens: ItemConhecimento[] };

/** Nome normalizado: sem acento, minúsculo, só letras e números separados por um espaço. */
export function normalizarNome(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Apelidos do nome (siglas de mercado) ficam no próprio Cadastro de ERPs: item OBSERVACAO com a chave "Apelidos do nome" e os apelidos no
 * texto, separados por ";" (o administrador edita como qualquer item, com histórico). A lista de ERPs (/erps) já traz `apelidos`.
 */
export const CHAVE_APELIDOS = 'Apelidos do nome';
export const apelidosDoTexto = (t: unknown): string[] => String(t ?? '').split(/[;\n]/).map((s) => s.trim()).filter(Boolean);

/**
 * Tira do fim do texto o que não identifica o ERP: a versão numérica ("10", "10.0", "9.3", "12.1.2510", "v10") e o banco (SQL, SQL Server, HANA).
 * Recebe o texto já normalizado.
 */
export function semSufixos(n: string): string {
  let s = n; let antes = '';
  while (s !== antes) { antes = s; s = s.replace(/(?:\s+(?:v?\d+|sql|server|hana|e))+$/, '').trim(); }
  return s;
}

/** Formas do nome que identificam o ERP: o nome, sem o parêntese, sem o fabricante, sem a palavra "erp", o produto, fabricante + produto e os apelidos do cadastro. */
export function formasDoNome(e: ErpBasico): Set<string> {
  const f = new Set<string>();
  const fab = normalizarNome(e.fabricante);
  const add = (s: string) => { const n = normalizarNome(s); if (n) f.add(n); };
  const nome = normalizarNome(e.nome);
  const semParentese = normalizarNome(String(e.nome ?? '').replace(/\([^)]*\)/g, ' '));
  for (const base of [nome, semParentese]) {
    add(base);
    if (fab && base.startsWith(`${fab} `)) add(base.slice(fab.length + 1));
    add(base.replace(/\berp\b/g, ' '));
  }
  if (e.produto) {
    const prod = normalizarNome(String(e.produto).replace(/\([^)]*\)/g, ' '));
    add(prod);
    if (fab) add(`${fab} ${prod}`);
  }
  for (const a of e.apelidos ?? []) add(a);
  for (const x of [...f]) { const s = semSufixos(x); if (s) f.add(s); }
  return f;
}

/**
 * Associa um texto antigo ao ERP do cadastro: casa quando o texto normalizado é uma das formas do nome de UM só ERP ativo.
 * Nenhum ou mais de um = não identificado (fica o texto, com o aviso para selecionar na lista).
 */
export function associarErp(texto: unknown, erps: ErpBasico[]): ErpBasico | null {
  const t = normalizarNome(texto);
  if (!t) return null;
  const s = semSufixos(t);
  const achados = erps.filter((e) => { if (e.ativo === false) return false; const f = formasDoNome(e); return f.has(t) || (!!s && f.has(s)); });
  return achados.length === 1 ? achados[0] : null;
}

/** Perfil com conhecimento específico? A_DESENVOLVER (e o "Outro ERP") usa só as regras gerais, sem alertas específicos. */
export const perfilEspecifico = (p: PerfilErp | null | undefined): p is PerfilErp => !!p && p.situacao !== 'A_DESENVOLVER' && p.ativo !== false;

const ativos = (p: PerfilErp | null | undefined, tipo: TipoConhecimento) => (perfilEspecifico(p) ? p.itens.filter((i) => i.ativo !== false && i.tipo === tipo).sort((a, b) => a.ordem - b.ordem) : []);

/** Restrições do ERP para os tipos de ajuste (só as ligadas a um tipo; as gerais ficam na ficha do ERP). */
export function restricoesDoTipo(p: PerfilErp | null | undefined, tipos: string[]): ItemConhecimento[] {
  const s = new Set(tipos);
  return ativos(p, 'RESTRICAO').filter((i) => i.tipo_ajuste && s.has(i.tipo_ajuste));
}

export const A_CONFIRMAR = '(a confirmar no ERP)';

/**
 * Texto da "Ação no ERP" para o tipo de ajuste, com {sai} e {fica} trocados pelos códigos; null = sem texto específico. Item NAO_CONFIRMADO
 * sai com "(a confirmar no ERP)" no fim (tela, Excel e PDF usam este texto).
 */
export function acaoNoErp(p: PerfilErp | null | undefined, tipo: string, codigos: { sai?: string; fica?: string } = {}): string | null {
  const i = ativos(p, 'ACAO_NO_ERP').find((x) => x.tipo_ajuste === tipo);
  if (!i) return null;
  const t = i.texto.replace(/\{sai\}/g, codigos.sai ?? '').replace(/\{fica\}/g, codigos.fica ?? '').trim();
  return i.grau === 'CONFIRMADO' ? t : `${t} ${A_CONFIRMAR}`;
}

/** Colunas do export por campo do saneamento (COLUNA_EXPORT: chave = campo, campo_erp = cabeçalho). */
export function colunasDoExport(p: PerfilErp | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of ativos(p, 'COLUNA_EXPORT')) if (i.campo_erp) (out[i.chave] ??= []).push(i.campo_erp);
  return out;
}

/**
 * LIMITE_CAMPO: tamanho máximo de um campo do cadastro de itens no ERP (restrição adicional ao leiaute oficial, que é o teto).
 * Convenção do item: `chave` = campo do item no saneamento (CAMPOS_LIMITE), `campo_erp` = campo do ERP (ex.: OITM.ItemName) e `texto`
 * começando por "<n> caracteres" quando o tamanho é confirmado; sem número no início (ou grau NAO_CONFIRMADO) = limite não confirmado
 * (null), nunca um número genérico. Tamanho configurável no ERP (ex.: SX3 do Protheus) fica registrado no texto, sem número.
 */
export const CAMPOS_LIMITE = ['descricao', 'codigo', 'unidade', 'referencia', 'fabricante'] as const;
export type CampoLimite = (typeof CAMPOS_LIMITE)[number];
export type LimiteCampoErp = { campoItem: CampoLimite; campoErp: string | null; limite: number | null; confirmado: boolean; observacao: string; fonteUrl: string | null };

/** Tamanho no início do texto ("200 caracteres..."); null quando o texto não começa por um número de caracteres. */
export function tamanhoDoTexto(texto: unknown): number | null {
  const m = /^\s*(\d{1,5})\s*caracteres\b/i.exec(String(texto ?? ''));
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Limites de campo do ERP (itens LIMITE_CAMPO ativos). Só CONFIRMADO com tamanho no texto vira limite; o resto fica null (pendente). */
export function limitesDoErp(p: PerfilErp | null | undefined): LimiteCampoErp[] {
  return ativos(p, 'LIMITE_CAMPO')
    .filter((i) => (CAMPOS_LIMITE as readonly string[]).includes(i.chave))
    .map((i) => {
      const n = i.grau === 'CONFIRMADO' ? tamanhoDoTexto(i.texto) : null;
      return { campoItem: i.chave as CampoLimite, campoErp: i.campo_erp, limite: n, confirmado: n !== null, observacao: i.texto, fonteUrl: i.fonte_url };
    });
}

export const consultasDeExtracao = (p: PerfilErp | null | undefined) => ativos(p, 'CONSULTA_EXTRACAO');

/** Item do perfil do ERP como vai para a IA. */
export type ItemErpIa = { tipo: 'restrição' | 'ação no ERP'; tipoDeAjuste: string | null; rotulo: string; texto: string };
/** O ERP do cliente no contexto da IA: só restrições e ações do perfil, separadas em confirmadas e "a confirmar". */
export type ErpParaIa = { nome: string; versao: string | null; origem: 'Cadastro de ERPs do InTAX'; perfil: string; confirmados: ItemErpIa[]; aConfirmar: ItemErpIa[] };

const MAX_ITENS_IA = 12;

/**
 * ERP do cliente para a IA (Analisar com IA e parecer do saneamento). Entram as RESTRIÇÕES e as AÇÕES NO ERP ativas do perfil (com `tipos`,
 * só as desses tipos de ajuste e as gerais, sem tipo). CONFIRMADO vai em `confirmados`; o resto em `aConfirmar`. Sem perfil específico (a
 * desenvolver, "Outro ERP" ou sem vínculo), só o nome e o aviso de que valem as regras gerais. Sem nome nem perfil: null.
 */
export function erpParaIa(perfil: PerfilErp | null | undefined, o: { nome?: string | null; versao?: string | null; tipos?: string[] } = {}): ErpParaIa | null {
  const nome = perfil?.nome || String(o.nome ?? '').trim();
  if (!nome) return null;
  const base = { nome, versao: String(o.versao ?? '').trim() || null, origem: 'Cadastro de ERPs do InTAX' as const };
  if (!perfilEspecifico(perfil)) {
    return { ...base, perfil: perfil ? 'perfil a desenvolver: valem só as regras gerais' : 'ERP sem perfil no Cadastro de ERPs: valem só as regras gerais', confirmados: [], aConfirmar: [] };
  }
  const tipos = o.tipos ? new Set(o.tipos) : null;
  const itens = [...ativos(perfil, 'RESTRICAO'), ...ativos(perfil, 'ACAO_NO_ERP')].filter((i) => !tipos || !i.tipo_ajuste || tipos.has(i.tipo_ajuste));
  const paraIa = (i: ItemConhecimento): ItemErpIa => ({
    tipo: i.tipo === 'RESTRICAO' ? 'restrição' : 'ação no ERP', tipoDeAjuste: i.tipo_ajuste, rotulo: String(i.chave).slice(0, 120), texto: String(i.texto).replace(/\s+/g, ' ').slice(0, 400),
  });
  return {
    ...base, perfil: perfil.situacao === 'COMPLETO' ? 'completo' : 'parcial',
    confirmados: itens.filter((i) => i.grau === 'CONFIRMADO').slice(0, MAX_ITENS_IA).map(paraIa),
    aConfirmar: itens.filter((i) => i.grau !== 'CONFIRMADO').slice(0, MAX_ITENS_IA).map(paraIa),
  };
}

/** Regra do prompt quando o ERP do cliente vai no contexto. */
export const REGRA_ERP_IA = '- ERP do cliente (erpDoCliente): as restrições e ações vêm do Cadastro de ERPs do InTAX; ao usá-las, diga que vêm do Cadastro de ERPs. Não recomende procedimento que contrarie uma restrição em "confirmados". Os itens de "aConfirmar" são "a confirmar": não os trate como fato e ponha-os no que o consultor deve conferir. Sem perfil, valem só as regras gerais: não invente particularidade do ERP.';
