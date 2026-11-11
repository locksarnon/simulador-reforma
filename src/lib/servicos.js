/**
 * Serviços contratados por empresa: o cadastro é um só e a carteira de cada área (BPO fiscal, diagnóstico pontual) sai do que a empresa
 * contratou. As regras daqui espelham o servidor (backend/src/servicos-contratados).
 */
export const TIPOS = { BPO_FISCAL: "BPO fiscal", DIAGNOSTICO_PONTUAL: "Diagnóstico pontual" };
export const SITUACOES = { PROPOSTA: "Proposta", ATIVO: "Ativo", PAUSADO: "Pausado", ENCERRADO: "Encerrado" };
export const MODULOS_BPO = { XML: "Captura de XML", MONITORAMENTO: "Monitoramento fiscal", OBRIGACOES: "Obrigações e agenda", TAREFAS: "Processos e tarefas", ARQUIVOS: "Arquivos e documentos" };

/** A empresa está na carteira de um tipo quando o serviço está ativo ou pausado. */
export const NA_CARTEIRA = ["ATIVO", "PAUSADO"];
/** Um serviço novo do mesmo tipo atualiza o que está em aberto, em vez de duplicar. */
export const EM_ABERTO = ["PROPOSTA", "ATIVO", "PAUSADO"];

export const naCarteira = (servico) => !!servico && NA_CARTEIRA.includes(servico.situacao);

const tempo = (s) => new Date(s?.createdAt || 0).getTime();

/**
 * Indexa os serviços por empresa. De cada tipo vale o serviço "corrente": o mais recente que esteja em aberto; se não houver,
 * o encerrado mais recente (para a tela mostrar "Encerrado" em vez de nada).
 */
export function indexarPorEmpresa(servicos) {
  const mapa = new Map();
  for (const s of servicos || []) {
    const atual = mapa.get(s.empresa_id) || {};
    const anterior = atual[s.tipo];
    const abertoNovo = EM_ABERTO.includes(s.situacao);
    const abertoAnterior = anterior && EM_ABERTO.includes(anterior.situacao);
    if (!anterior || (abertoNovo && !abertoAnterior) || (abertoNovo === abertoAnterior && tempo(s) > tempo(anterior))) atual[s.tipo] = s;
    mapa.set(s.empresa_id, atual);
  }
  return mapa;
}

/** Em que carteira a empresa está: "bpo", "diagnostico", "ambas" ou "nenhuma". */
export function carteiraDaEmpresa(porTipo) {
  const bpo = naCarteira(porTipo?.BPO_FISCAL);
  const diag = naCarteira(porTipo?.DIAGNOSTICO_PONTUAL);
  if (bpo && diag) return "ambas";
  if (bpo) return "bpo";
  if (diag) return "diagnostico";
  return "nenhuma";
}

/** Classes do selo de situação (verde ativo, âmbar pausado, azul proposta, cinza encerrado). */
export const TOM_DA_SITUACAO = {
  ATIVO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PAUSADO: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PROPOSTA: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ENCERRADO: "bg-muted text-muted-foreground",
};

export const fmtDataCurta = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (s) => String(s || "").replace(/\D/g, "");

/** Filtra empresas por texto (nome, código ou CNPJ), grupo e carteira. */
export function filtrarEmpresas(empresas, mapa, { busca = "", grupo = "", carteira = "" } = {}) {
  const t = semAcento(busca).trim();
  const d = digitos(busca);
  return (empresas || []).filter((e) => {
    if (grupo && e.grupo !== grupo) return false;
    if (carteira && carteiraDaEmpresa(mapa.get(e.id)) !== carteira) return false;
    if (!t) return true;
    return semAcento(e.razao_social).includes(t) || semAcento(e.id_empresa).includes(t) || (d.length >= 3 && digitos(e.cnpj_cpf).includes(d));
  });
}
