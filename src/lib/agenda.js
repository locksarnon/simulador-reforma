/**
 * Calendário geral (BPO Fiscal > Obrigações e agenda): grade do mês e da semana, e as camadas normalizadas num formato só.
 * As datas são "AAAA-MM-DD" do dia em Brasília; o evento de dia inteiro guarda a data em UTC; o com hora, o instante.
 */
import { MESES } from "@/lib/tarefas";

export const CAMADAS = {
  evento: { rotulo: "Eventos", cor: "#2563EB" },
  tarefa: { rotulo: "Tarefas", cor: "#0891B2" },
  obrigacao: { rotulo: "Obrigações federais", cor: "#DC2626" },
  reforma: { rotulo: "Agenda da Reforma", cor: "#7C3AED" },
  certificado: { rotulo: "Certificados A1", cor: "#B45309" },
};
export const DIAS_DA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const DIA_MS = 86_400_000;
export const isoDe = (d) => d.toISOString().slice(0, 10);
export const somarDias = (dia, n) => isoDe(new Date(Date.parse(dia) + n * DIA_MS));
/** 0 = segunda … 6 = domingo. */
const diaDaSemana = (dia) => (new Date(Date.parse(dia)).getUTCDay() + 6) % 7;

/** As 6 semanas (segunda a domingo) que mostram o mês inteiro. */
export function gradeDoMes(ano, mes) {
  const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const inicio = somarDias(primeiro, -diaDaSemana(primeiro));
  return Array.from({ length: 6 }, (_, s) => Array.from({ length: 7 }, (_, d) => {
    const dia = somarDias(inicio, s * 7 + d);
    return { dia, doMes: Number(dia.slice(5, 7)) === mes };
  }));
}

/** Os 7 dias (segunda a domingo) da semana do dia. */
export const semanaDe = (dia) => Array.from({ length: 7 }, (_, i) => somarDias(dia, i - diaDaSemana(dia)));

/** O período que a visão mostra (para buscar as camadas). */
export function periodoDaVisao(visao, dia) {
  if (visao === "dia") return { de: dia, ate: dia };
  if (visao === "semana") { const s = semanaDe(dia); return { de: s[0], ate: s[6] }; }
  const g = gradeDoMes(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)));
  return { de: g[0][0].dia, ate: g[5][6].dia };
}

/** Anda o calendário: mês, semana ou dia para frente (+1) ou para trás (-1). */
export function andar(visao, dia, n) {
  if (visao === "dia") return somarDias(dia, n);
  if (visao === "semana") return somarDias(dia, 7 * n);
  const [a, m] = dia.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export function tituloDaVisao(visao, dia) {
  const [a, m, d] = dia.split("-").map(Number);
  if (visao === "mes") return `${MESES[m - 1]} de ${a}`;
  if (visao === "dia") return `${d} de ${MESES[m - 1]} de ${a}`;
  const s = semanaDe(dia);
  const fmt = (x) => `${Number(x.slice(8, 10))}/${x.slice(5, 7)}`;
  return `Semana de ${fmt(s[0])} a ${fmt(s[6])}`;
}

/** O dia (em Brasília) e a hora de um evento. */
export function diaEHora(e) {
  if (e.dia_inteiro) return { dia: String(e.inicio).slice(0, 10), hora: null };
  const d = new Date(e.inicio);
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return { dia, hora };
}

/** Junta tudo num formato só: { id, camada, titulo, dia, hora, cor, link, detalhe, original }. */
export function normalizarCamadas({ camadas, reforma, tipos = [], nomeDaEmpresa = () => "" }) {
  const itens = [];
  const corDoTipo = new Map(tipos.map((t) => [t.id, t.cor]));
  for (const e of camadas?.eventos || []) {
    const { dia, hora } = diaEHora(e);
    const fim = e.fim ? diaEHora({ ...e, inicio: e.fim }).dia : dia;
    // Evento de vários dias aparece em cada dia.
    for (let d = dia; d <= fim; d = somarDias(d, 1)) {
      itens.push({ id: `evento:${e.id}:${d}`, camada: "evento", titulo: e.titulo, dia: d, hora: d === dia ? hora : null, cor: corDoTipo.get(e.tipo_id) || CAMADAS.evento.cor, detalhe: [e.local, nomeDaEmpresa(e.empresa_id)].filter(Boolean).join(" · "), original: e });
      if (itens.length > 2000) break;
    }
  }
  for (const t of camadas?.tarefas || []) itens.push({ id: `tarefa:${t.id}`, camada: "tarefa", titulo: t.titulo, dia: String(t.prazo).slice(0, 10), hora: null, cor: CAMADAS.tarefa.cor, link: "/bpo/tarefas", detalhe: nomeDaEmpresa(t.empresa_id), original: t });
  for (const o of camadas?.obrigacoes || []) itens.push({ id: `obrigacao:${o.obrigacao}:${o.competencia}`, camada: "obrigacao", titulo: o.nome, dia: o.data, hora: null, cor: CAMADAS.obrigacao.cor, detalhe: `Competência ${o.competencia}${o.movida ? ` · data legal ${o.data_legal.slice(8, 10)}/${o.data_legal.slice(5, 7)}` : ""}${o.confirmado ? "" : " · não confirmado"}`, original: o });
  for (const c of camadas?.certificados || []) itens.push({ id: `certificado:${c.id}`, camada: "certificado", titulo: `Vence o certificado A1 de ${nomeDaEmpresa(c.empresa_id) || c.titular}`, dia: c.dia, hora: null, cor: CAMADAS.certificado.cor, link: `/bpo/repositorio-xml/${c.empresa_id}`, detalhe: "", original: c });
  for (const m of reforma || []) itens.push({ id: `reforma:${m.id || m.chave}`, camada: "reforma", titulo: m.titulo, dia: m.data, hora: null, cor: CAMADAS.reforma.cor, link: "/agenda-reforma", detalhe: m.confirmado === false ? "não confirmado" : "", original: m });
  return itens.sort((a, b) => a.dia.localeCompare(b.dia) || (a.hora || "99").localeCompare(b.hora || "99") || a.titulo.localeCompare(b.titulo));
}

/** Itens por dia, só das camadas ligadas. */
export function porDia(itens, camadasLigadas) {
  const mapa = new Map();
  for (const i of itens) {
    if (!camadasLigadas.includes(i.camada)) continue;
    mapa.set(i.dia, [...(mapa.get(i.dia) || []), i]);
  }
  return mapa;
}
