import plano from "../../docs/consultoria-tributaria.md?raw";

const IDS = ["pf-ibs-cbs", "pf-homologacao", "lcdpr", "simulador-reforma", "pj-homologacao", "pis-cofins", "credito-estoque", "tributos-pagos", "irpj-csll", "regimes-exercicio", "virada-exercicio", "conciliacao-escrituracoes"];
const secoes = plano.split(/^#### \d+\. /m).slice(1);
const listas = Object.fromEntries(IDS.map((id, i) => [id, [...secoes[i].matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1].trim())]));
const documento = (linha) => linha.split(" — ")[0].replace(/\.$/, "");
const normalizar = (linha) => documento(linha).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function itensDoServico(servico) {
  if (servico === "credito-estoque-pf") return [
    "Evidência de enquadramento no regime regular da CBS — por CPF e atividade.",
    "Inventário de 31/12/2026 — XLSX/CSV por estabelecimento, item, quantidade e valor.",
    "NF-e de aquisição dos itens ainda em estoque — XML autorizado.",
    "Declaração de importação — DI ou Duimp, quando aplicável.",
    "Comprovante do PIS/Pasep-Importação pago — quando aplicável.",
    "Comprovante da Cofins-Importação paga — quando aplicável.",
    "Memória de apuração da elegibilidade — por item e hipótese do art. 381 da LC 214/2025.",
  ];
  if (servico === "saneamento-estoques") return [
    "Cadastro de itens do ERP — XLSX/CSV completo: código, descrição, unidade, NCM, grupo, situação (ativo/bloqueado) e a classificação fiscal usada hoje.",
    "Saldo de estoque na data-base — XLSX/CSV por item, estabelecimento, quantidade e valor.",
    "Movimentação dos itens — última entrada e última saída de cada item, ou o extrato dos últimos 24 meses.",
    "NF-e de compra dos principais itens — XML autorizado, para conferir o NCM e a descrição de origem.",
    "Bloco H e Bloco K da EFD ICMS/IPI — arquivo transmitido, quando aplicável.",
    "Tabela de equivalência de códigos — de-para de fornecedor, fabricante e códigos paralelos, se existir.",
    "Política atual de cadastro e de classificação fiscal — documento ou procedimento interno, se existir.",
    "Acesso de consulta ao cadastro do ERP — ou o responsável de TI para tirar dúvidas de campos.",
  ];
  const cruzamentos = listas["conciliacao-escrituracoes"];
  if (servico === "cruzamentos-pf") {
    return [...listas.lcdpr, ...cruzamentos.filter((l) => /dirpf|pre-preenchida|rendimentos|locacao|compra e venda|medic|dimob|doi|e-financeira/i.test(normalizar(l)))];
  }
  if (servico === "conciliacao-escrituracoes") {
    const fontes = [...cruzamentos.filter((l) => !/dirpf|pre-preenchida|medic|informe de rendimentos/.test(normalizar(l))),
      ...["pis-cofins", "tributos-pagos", "irpj-csll", "virada-exercicio"].flatMap((s) => listas[s]),
      "Bloco H — inventário escriturado, quando aplicável.",
      "Bloco K — movimentação de estoque e produção, quando aplicável.",
      "Razão de estoque — XLSX/CSV, quando aplicável."];
    return [...new Map(fontes.map((l) => [normalizar(l), l])).values()];
  }
  return listas[servico] || [];
}

function classificacao(linha) {
  const nome = normalizar(linha);
  const recibo = /^(recibo|comprovante de entrega)/.test(nome);
  let sped;
  if (/^(?:(?:recibo da|recibo do) )?ecd\b/.test(nome)) sped = "ECD";
  else if (/^(?:(?:recibo da|recibo do) )?ecf\b/.test(nome)) sped = "ECF";
  else if (/efd.contribuicoes/.test(nome)) sped = "EFD_CONTRIBUICOES";
  else if (/efd.icms.ipi/.test(nome)) sped = "EFD_ICMS_IPI";
  return { sped, recibo, anual: /^(ECD|ECF)$/.test(sped) || /^(?:comprovante de entrega do |recibo da |recibo do )?(?:lcdpr|dirpf|dirf|defis)\b/.test(nome),
    mensal: Boolean(sped) || /\b(mit|dctfweb|dctf|pgdas-d|esocial|efd-reinf)\b/.test(nome) };
}

export function linhasDoPeriodo(servico, de, ate) {
  const meses = [];
  const exercicios = [];
  if (!de || !ate || de > ate) return [];
  const inicio = new Date(de + "T00:00:00Z");
  const fim = new Date(ate + "T00:00:00Z");
  if (!Number.isFinite(+inicio) || !Number.isFinite(+fim) || fim.getUTCFullYear() - inicio.getUTCFullYear() > 20) return [];
  for (let ano = inicio.getUTCFullYear(); ano <= fim.getUTCFullYear(); ano++) {
    exercicios.push(String(ano));
    for (let mes = 1; mes <= 12; mes++) {
      const competencia = `${ano}-${String(mes).padStart(2, "0")}`;
      if (competencia >= de.slice(0, 7) && competencia <= ate.slice(0, 7)) meses.push(competencia);
    }
  }
  return itensDoServico(servico).flatMap((linha) => {
    const tipo = classificacao(linha);
    let periodos = tipo.anual ? exercicios : tipo.mensal ? meses : [`${de}/${ate}`];
    if (servico === "credito-estoque" && /de 2027/.test(normalizar(linha))) periodos = periodos.filter((p) => p.startsWith("2027-"));
    return periodos.map((periodo) => ({ item: documento(linha), linha, periodo, ...tipo }));
  });
}

export function arquivoSpedDaLinha(linha, sped, arquivos) {
  if (!linha.sped) return null;
  const tipos = linha.recibo ? "RECIBO" : "ESCRITURACAO";
  const ids = sped.filter((e) => e.escrituracao === linha.sped && (e.competencia === linha.periodo ||
    (e.periodo_inicio && e.periodo_fim && (linha.anual ? e.periodo_inicio.slice(0, 4) : e.periodo_inicio.slice(0, 7)) <= linha.periodo &&
      (linha.anual ? e.periodo_fim.slice(0, 4) : e.periodo_fim.slice(0, 7)) >= linha.periodo)))
    .flatMap((e) => Array.isArray(e.arquivos) ? e.arquivos.filter((a) => a.tipo === tipos).map((a) => a.id) : linha.recibo ? [] : [e.arquivo_id]);
  const candidatos = arquivos.filter((a) => ids.includes(a.id));
  return candidatos.length === 1 ? candidatos[0].id : null;
}

const RESOLVIDO = ["RECEBIDO", "VALIDADO", "NAO_APLICAVEL"];

/** "cadastro.xlsx (20/11/2026, ana@fal): Código ← ItemCode, Saldo ← OnHand". */
export function textoDaEvidencia(auto) {
  if (!auto) return "";
  const data = (iso) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const arquivos = auto.evidencias.map((e) => `${e.arquivo} (${data(e.data)}, ${e.usuario})`).join("; ");
  const colunas = auto.colunas.map((c) => `${c.rotulo} ← ${c.coluna}`).join(", ");
  return `Importação no Saneamento: ${arquivos}. Colunas: ${colunas}.`;
}

/**
 * Situação de cada linha: o controle manual, a EFD guardada ou a cobertura pela importação do Saneamento (`automaticos` do backend).
 * A cobertura automática vale enquanto não houver controle manual gravado depois da última importação (`prevalece`).
 * `grupo`: COBERTO (resolvida com evidência da importação), RESOLVIDO (resolvida à mão ou pela EFD) ou PENDENTE.
 */
export function situacaoDasLinhas(linhas, { arquivos = [], controles = [], sped = [], automaticos = [] } = {}) {
  const porChave = new Map(controles.map((c) => [`${c.item}:${c.periodo}`, c]));
  const autoPorChave = new Map(automaticos.map((a) => [`${a.item}:${a.periodo}`, a]));
  return linhas.map((linha) => {
    const chave = `${linha.item}:${linha.periodo}`;
    const controle = porChave.get(chave);
    const automatico = autoPorChave.get(chave) || null;
    const recebido = arquivoSpedDaLinha(linha, sped, arquivos);
    const vinculado = arquivos.some((a) => a.id === controle?.arquivo_id) ? controle.arquivo_id : null;
    let situacao;
    let origem = "MANUAL";
    if (automatico && (automatico.prevalece || !controle)) { situacao = automatico.situacao; origem = "AUTOMATICO"; }
    else if (controle) situacao = controle.arquivo_id && !vinculado ? "PENDENTE" : controle.situacao;
    else situacao = recebido ? "RECEBIDO" : "PENDENTE";
    const resolvida = RESOLVIDO.includes(situacao);
    const grupo = !resolvida ? "PENDENTE" : automatico?.cobertura === "TOTAL" ? "COBERTO" : "RESOLVIDO";
    return { ...linha, chave, situacao, origem, automatico, grupo, arquivo_id: (controle ? vinculado : recebido) ?? "" };
  });
}

/** Texto da lista de pendências (só o que falta; o parcial diz quais campos ainda faltam). */
export function textoDasPendencias(linhas) {
  return linhas.filter((l) => l.grupo === "PENDENTE")
    .map((l) => `- [${l.periodo}] ${l.linha}${l.automatico?.cobertura === "PARCIAL" ? ` (recebido em parte; faltam: ${l.automatico.faltam.join(", ")})` : ""}`).join("\n");
}
