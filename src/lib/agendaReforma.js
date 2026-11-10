/**
 * Agenda da Reforma: textos e agrupamentos que as telas usam. As datas chegam do servidor como "AAAA-MM-DD"
 * (datas de calendário, sem fuso); aqui nunca passam por Date com fuso local.
 */

export const fmtIso = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/** "hoje", "amanhã", "em 7 dias", "ontem", "há 3 dias". */
export function quando(dias) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias === -1) return "ontem";
  return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`;
}

/** A data do marco em uma frase curta: "20/12/2026", "de 03/11/2026 a 20/12/2026" ou "a partir de 01/01/2027". */
export function periodoDoMarco(m) {
  if (m.data_fim && m.data_fim !== m.data) return `de ${fmtIso(m.data)} a ${fmtIso(m.data_fim)}`;
  return m.tipo === "marco" ? `a partir de ${fmtIso(m.data)}` : fmtIso(m.data);
}

/** O que falta para o marco, em palavras: o prazo conta do último dia; o marco de vigência, do começo. */
export function situacaoEmPalavras(m) {
  if (m.situacao === "passado") return m.tipo === "prazo" ? `prazo encerrado ${quando(m.dias_para)}` : "já passou";
  if (m.situacao === "em_andamento") {
    if (m.tipo === "prazo") return m.dias_para === 0 ? "último dia do prazo" : `termina ${quando(m.dias_para)}`;
    return "em vigor";
  }
  return quando(m.dias_para);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Agrupa por mês de início: [{ chave: "2026-12", rotulo: "dezembro de 2026", marcos }], na ordem em que os marcos chegam. */
export function agruparPorMes(marcos = []) {
  const grupos = [];
  for (const m of marcos) {
    const chave = m.data.slice(0, 7);
    let g = grupos[grupos.length - 1];
    if (!g || g.chave !== chave) {
      g = { chave, rotulo: `${MESES[Number(chave.slice(5, 7)) - 1]} de ${chave.slice(0, 4)}`, marcos: [] };
      grupos.push(g);
    }
    g.marcos.push(m);
  }
  return grupos;
}

/** "Instrumento, dispositivo (ato de dd/mm/aaaa)". */
export const textoDaFonte = (f) => `${f.instrumento}, ${f.dispositivo}${f.data ? ` (ato de ${fmtIso(f.data)})` : ""}`;

/** Quem o marco atinge: "Todos os regimes" ou a lista; mesma ideia para as UFs. */
export const regimesDoMarco = (m) => (m.regimes?.length ? m.regimes.join(", ") : "Todos os regimes");
export const ufsDoMarco = (m) => (m.ufs?.length ? m.ufs.join(", ") : "");

/** Parâmetros da consulta ao servidor a partir do que a tela escolheu (vazio não vai). */
export function paramsDaAgenda({ empresaId, regime, uf, categoria, passados } = {}) {
  const p = {};
  if (empresaId) p.empresa_id = empresaId;
  if (regime) p.regime = regime;
  if (uf) p.uf = uf;
  if (categoria) p.categoria = categoria;
  if (passados) p.passados = "1";
  return p;
}

export const urlDoCalendario = (filtros) => {
  const q = new URLSearchParams(paramsDaAgenda(filtros)).toString();
  return `/agenda-reforma/calendario.ics${q ? `?${q}` : ""}`;
};

/** Nome do arquivo .ics: agenda-reforma.ics ou agenda-reforma-<empresa>.ics (sem acento nem símbolo). */
export function nomeDoArquivoIcs(razaoSocial) {
  const limpo = String(razaoSocial || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return limpo ? `agenda-reforma-${limpo}.ics` : "agenda-reforma.ics";
}

export const ROTULO_ANTECEDENCIA = (dias) => (dias === 0 ? "no dia" : dias === 1 ? "1 dia antes" : `${dias} dias antes`);
