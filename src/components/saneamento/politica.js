// Política de uso dos estoques (passo 8): nasce dos critérios aprovados e das causas encontradas no saneamento. Cinco procedimentos (criar, comprar, usar,
// padronizar e descontinuar), regras por grupo e uma versão estruturada para configurar o módulo de cadastro automático do cliente. Critério ainda não aprovado
// não gera regra. Só SUGERE: é uma proposta de política que o responsável revisa e aprova; nada é alterado no cadastro nem no ERP. Funções puras.
import { CRITERIOS, REGRAS_PADRAO, ROTULO_REGRAS, abreviacoesAprovadas, dataBr, dataDoCorte, normalizarParams } from "./logica";
import { indexar, partirChave } from "./identidade";
import { coerenciaDaChave } from "./aprovacao";
import { resumoInativacao } from "./inativacao";
import { coberturaDoCriterio, criteriosPendentesDoGrupo, grupoSaneado, naoAplicavelDe, situacaoCriterio } from "./analise";
import { GRANDEZAS, resumoUnidades } from "./unidades";
import { checagens } from "./checagens";
import { gruposMarcados, palavrasEmVigor } from "./observacao";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`;

export const SECOES = [
  { id: "criar", titulo: "Criar o cadastro", descricao: "Como um item novo entra no cadastro: o que precisa estar preenchido e verificado antes de gravar." },
  { id: "comprar", titulo: "Comprar", descricao: "O que o cadastro precisa ter para um item poder ser comprado e recebido sem gerar divergência de estoque." },
  { id: "usar", titulo: "Usar e movimentar", descricao: "Como o item é usado no dia a dia e o que se observa na movimentação." },
  { id: "padronizar", titulo: "Padronizar e manter", descricao: "Como manter o cadastro limpo depois do saneamento: verificação periódica e alteração com rastro." },
  { id: "descontinuar", titulo: "Descontinuar (inativar)", descricao: "Quando e como um item deixa de ser usado, sem perder histórico nem saldo." },
];

/**
 * Decisões por critério: { [critId]: { total, PROP, APR, REJ, SEM_VALIDADE } }. `vale(k, d)` diz se a decisão ainda vale para o cadastro de hoje: a que não vale (o cadastro mudou
 * para outra coisa, ou o código se repete na base) entra no total e em SEM_VALIDADE, e não conta como aguardando, aprovada nem rejeitada.
 */
export function contarDecisoes(decisoes, vale) {
  const por = {};
  for (const [k, d] of Object.entries(decisoes || {})) {
    const crit = partirChave(k).crit; const c = por[crit] || (por[crit] = { total: 0, PROP: 0, APR: 0, REJ: 0, SEM_VALIDADE: 0 });
    c.total += 1; if (vale && !vale(k, d)) c.SEM_VALIDADE += 1; else if (d.status in c) c[d.status] += 1;
  }
  return por;
}

/**
 * Monta a política a partir do estado do projeto. `contagem` é o contarAchados() dos critérios, `escopo` o aplicarEscopo(), `grupos` o agruparPorGrupo() do que está em escopo.
 * Devolve { secoes, porGrupo, pendencias, estruturada, situacao }.
 */
export function montarPolitica({ estado, contagem, escopo, grupos, itens, nomeProjeto = "", nomeBase = "" }) {
  const indiceDec = itens ? indexar(itens) : null; const valeDecisao = indiceDec ? (k, d) => coerenciaDaChave(k, d, indiceDec, estado?.decisoes).ok : undefined;
  const pol = estado?.politica || {}; const dec = contarDecisoes(estado?.decisoes, valeDecisao); const params = normalizarParams(estado?.params);
  const sitDe = (id) => situacaoCriterio(estado, CRITERIOS.find((c) => c.id === id), contagem);
  const ativo = (id) => ["APROVADO", "AUTO"].includes(sitDe(id)); // só o critério em uso gera regra: pendente, sem a análise executada ou não aplicável ficam de fora
  const achados = (id) => contagem?.porCriterio?.[id] ?? 0;
  const origem = (id) => {
    const c = CRITERIOS.find((x) => x.id === id); const e = estado?.criterios?.[id]; const s = sitDe(id);
    return `Critério "${c.titulo}", ${s === "APROVADO" ? `aprovado por ${e?.por || "—"} em ${dataBr(e?.em) || "—"}` : "aprovado automaticamente (sem achados na base)"}`;
  };
  const listaCh = checagens(estado, contagem, grupos || []);
  // Conferência manual: quantos grupos foram concluídos de fato (resultado e evidência escrita no passo Checagens), em vez de afirmar a conclusão só porque a regra foi aprovada
  const evidManual = (id) => { const g = listaCh.find((c) => c.id === id).cobertura; return `Checagem de conferência manual: ${plural(g.gruposConcluidos, "grupo concluído", "grupos concluídos")} de ${fmt(g.grupos)}, com o resultado e a evidência escrita no passo Checagens.`; };
  const evid = (id, depois) => `${achados(id) ? `${plural(achados(id), "item em escopo", "itens em escopo")} com achado na base analisada` : "nenhum achado na base analisada"}${depois ? `; ${depois}` : ""}.`;
  const regrasLigadas = Object.entries(ROTULO_REGRAS).filter(([k]) => ({ ...REGRAS_PADRAO, ...(estado?.padronizacao?.regras || {}) })[k]).map(([, r]) => r.replace(/ \(ex\.:.*\)$/, ""));
  const abrev = abreviacoesAprovadas(estado);
  const un = resumoUnidades(escopo?.emEscopo || [], { regras: estado?.politicaUnidade?.regras, rotulos: estado?.politicaUnidade?.rotulos });
  const nomesUn = Object.entries(GRANDEZAS).map(([g, v]) => `${v.rotulo.toLowerCase()} em ${un.padroes[g]}`).join(", ");
  const ajustesUn = dec.unidade || { APR: 0, total: 0 }; const dupl = dec.duplicidade || { APR: 0, total: 0 }; const pad = dec.padrao || { APR: 0, total: 0 };
  const resInativacao = resumoInativacao(estado?.inativacao, escopo, indexar(itens ?? [...(escopo?.emEscopo || []), ...(escopo?.fora || []), ...(escopo?.foraGrupos || [])]));
  const piloto = Object.entries(estado?.piloto || {}).map(([caso, p]) => `${caso}: ${p.status || "Não iniciado"}`);
  // Regra de observação (a variante não é produto): os grupos que a usam e as palavras de observação; nesses grupos cor, tipo e apresentação não geram código próprio
  const observacao = { grupos: gruposMarcados(estado?.observacao, (grupos || []).map((g) => g.nome)), palavras: palavrasEmVigor(estado?.observacao).map((p) => p.palavra) };

  const R = (id, secao, texto, origemId, evidencia, origemTxt = "Programa de trabalho do saneamento") => ({ id, secao, texto, origem: origemId ? origem(origemId) : origemTxt, evidencia });
  const regras = [];
  if (ativo("padrao")) regras.push(R("criar.descricao", "criar", `Toda descrição nova segue NOME + REFERÊNCIA + COMPLEMENTO, no padrão aprovado: ${regrasLigadas.map((r) => r.toLowerCase()).join("; ") || "sem regras de formato ligadas"}${Object.keys(abrev).length ? `; só abreviações da lista aprovada (${plural(Object.keys(abrev).length, "abreviação", "abreviações")})` : ""}; no máximo 100 caracteres no SAP B1 (a confirmar). Padronizar o nome não funde itens.`, "padrao", evid("padrao", `${plural(pad.APR, "correção aprovada", "correções aprovadas")} de ${plural(pad.total, "encaminhada", "encaminhadas")}`)));
  if (ativo("duplicidade")) regras.push(R("criar.duplicidade", "criar", `Antes de criar um item, pesquisar o cadastro por descrição normalizada (abreviações, grafia e ordem das palavras), unidade, medidas e NCM. Mesmo produto e mesmo complemento: usar o código existente. Mesmo produto com complemento diferente (cor, tamanho, lado ou posição, material, sabor, original ou paralelo): criar código próprio, com o complemento no fim da descrição. Indicação de duplicidade não é prova de identidade técnica: exige confirmação.${observacao.grupos.length ? ` Exceção por grupo: nos grupos ${observacao.grupos.join(", ")} a variante (cor, tipo, apresentação: ${observacao.palavras.join(", ")}) é observação, não produto; ela não gera código próprio e é registrada no campo adicional do item.` : ""}`, "duplicidade", evid("duplicidade", `${plural(dupl.APR, "unificação aprovada", "unificações aprovadas")} de ${plural(dupl.total, "encaminhada", "encaminhadas")}`)));
  if (ativo("identidade")) regras.push(R("criar.identidade", "criar", "Mesmo produto é o que tem a mesma referência do fabricante e a mesma medida. Original e paralelo ficam em códigos distintos, e a origem da referência é guardada: referências de fabricantes diferentes não provam equivalência técnica. Cadastro que mistura produtos é separado.", "identidade", evidManual("identidade")));
  if (ativo("unidade")) regras.push(R("criar.unidade", "criar", `A unidade de estoque é a menor unidade prática da medida em que o item é controlado: ${nomesUn}. Unidade maior (tonelada, hectolitro, dúzia, metro cúbico...) e embalagem (saca, big bag, galão, caixa, pacote...) são unidade de compra, com o fator de conversão cadastrado; uma só grafia por unidade.`, "unidade", evid("unidade", `${plural(ajustesUn.APR, "ajuste aprovado", "ajustes aprovados")} de ${plural(ajustesUn.total, "encaminhado", "encaminhados")}`)));
  if (ativo("ncm")) regras.push(R("criar.ncm", "criar", "Todo item é criado com NCM de 8 dígitos vigentes na tabela oficial e com o cClassTrib conferido contra os anexos da LC 214/2025; onde o anexo cita o capítulo ou a posição, ou o NCM abrange produtos com tratamentos diferentes, o enquadramento é revisado por especialista. Serviço é classificado por NBS e LC 116, não pelos anexos de produtos.", "ncm", evid("ncm", estado?.fiscal?.grupos ? `${plural(Object.keys(estado.fiscal.grupos).length, "grupo com revisão fiscal concluída", "grupos com revisão fiscal concluída")}` : "")));
  if (ativo("grupo")) regras.push(R("criar.grupo", "criar", "O grupo de itens segue o uso do próprio cliente: o item novo entra no grupo em que os itens do mesmo NCM já estão, e o grupo é conferido na criação.", "grupo", evid("grupo")));
  if (ativo("descricao")) regras.push(R("criar.obrigatorios", "criar", "Código e descrição são obrigatórios; item sem descrição ou sem código não é gravado.", "descricao", evid("descricao")));
  if (ativo("unidade")) regras.push(R("comprar.unidade", "comprar", "A compra pode ser feita em unidade maior ou em embalagem desde que o item tenha a unidade de compra e os itens por unidade de compra cadastrados; compra de item cujo fator ainda está a informar não é liberada.", "unidade", "O estoque é sempre controlado na unidade de estoque; a conversão é feita no recebimento."));
  regras.push(R("comprar.cadastro", "comprar", "Necessidade de item que não existe no cadastro segue o procedimento de criação; não se compra por descrição livre nem se usa código de outro produto.", null, "Regra preventiva do programa de trabalho."));
  if (ativo("ncm")) regras.push(R("comprar.fiscal", "comprar", "O NCM e o cClassTrib são conferidos antes da primeira compra do item; classificação a revisar com especialista fica como pendência registrada.", "ncm", evid("ncm")));
  if (ativo("utilizacao")) regras.push(R("usar.utilizacao", "usar", "A última movimentação de cada item é mantida e legível. Item sem data de movimentação é sinalizado para o cliente informar a data; a ausência de movimento, por si só, não determina bloqueio.", "utilizacao", evid("utilizacao")));
  if (ativo("saldos")) regras.push(R("usar.saldos", "usar", "Saldos negativos e concentração de valor são indícios, não conclusão: criticidade, prazo de reposição e sazonalidade são considerados antes de propor redução.", "saldos", evidManual("saldos")));
  if (ativo("cartilhas")) regras.push(R("usar.cartilhas", "usar", "Código usado em plano de manutenção, cartilha ou documento aberto só muda depois de atualizar o vínculo.", "cartilhas", evidManual("cartilhas")));
  regras.push(R("padronizar.periodica", "padronizar", "Os critérios aprovados são reaplicados à base viva na periodicidade definida pelo responsável, e os achados novos seguem o mesmo fluxo (encaminhar, aprovar, executar e conferir). A alteração de descrição, unidade ou grupo é registrada com aprovador e data, e a descrição original é preservada.", null, "Fluxo do programa de trabalho."));
  regras.push(R("padronizar.unificacao", "padronizar", "Unificar itens exige aprovação por caso, escolha de qual código fica (maior saldo, movimentação mais recente, cadastro mais completo, menor código) e tratamento do saldo e do histórico do código que sai: de/para e transferência de saldo, confirmados com evidência.", null, "Fluxo do programa de trabalho."));
  if (piloto.length) regras.push(R("padronizar.piloto", "padronizar", "Unificar, separar, preservar referências e descontinuar com dependências só valem como procedimento testado no ambiente do cliente; o que o piloto não comprovou fica sem liberação para execução em massa.", null, `Piloto SAP: ${piloto.join("; ")}.`));
  regras.push(R("descontinuar.corte", "descontinuar", `Item não movimentado ${params.desde ? `desde ${dataDoCorte(estado?.params)}` : "(sem data de corte definida neste projeto)"} é candidato à inativação, não à exclusão. ${params.desde ? (params.semData === "anterior" ? "O item sem data de movimentação legível é tratado como anterior à data." : "O item sem data de movimentação legível permanece no escopo, sinalizado.") : ""}`.trim(), null, `${plural(escopo?.fora?.length || 0, "item fora do escopo", "itens fora do escopo")} pelo parâmetro de saneamento (candidatos à inativação); ${plural(resInativacao.aprovados, "com a inativação aprovada", "com a inativação aprovada")}.`, "Parâmetro de saneamento do projeto"));
  regras.push(R("descontinuar.aprovacao", "descontinuar", "A data de corte seleciona candidatos para avaliação e não autoriza a inativação. A inativação só é executada depois de aprovada: em lote, por grupo de itens, com lista fechada de códigos (base e data analisadas, verificações de movimentação, saldo, documentos abertos e vínculos, aprovador e justificativa), ou item a item. Itens com saldo, documento aberto ou dependência não esclarecida ficam para decisão individual, e a aprovação em lote não cobre itens que entrem depois na lista.", null, "Fluxo do programa de trabalho (passo De/para)."));
  regras.push(R("descontinuar.saldo", "descontinuar", "Item com saldo ou histórico tem tratamento próprio: o saldo é transferido ao código que fica e o histórico é preservado antes da inativação; a inativação só conta como feita com a evidência registrada.", null, "Fluxo do programa de trabalho (passos De/para, Execução e Conferência)."));
  if (ativo("cartilhas")) regras.push(R("descontinuar.vinculos", "descontinuar", "Antes de inativar, conferir vínculos em cartilhas, planos de manutenção e documentos abertos.", "cartilhas", evidManual("cartilhas")));

  const secoes = SECOES.map((s) => ({ ...s, regras: regras.filter((r) => r.secao === s.id), responsavel: pol.secoes?.[s.id]?.responsavel || "", controle: pol.secoes?.[s.id]?.controle || "" }));
  const porGrupo = (grupos || []).map((g) => {
    const saneado = grupoSaneado(estado, g.nome, contagem);
    return { grupo: g.nome, itens: g.itens.length, saneado, criteriosPendentes: criteriosPendentesDoGrupo(estado, g.nome, contagem).length, fiscal: estado?.fiscal?.grupos?.[g.nome] ? "Revisão concluída" : saneado ? "Em revisão" : "Não liberado", regra: pol.grupos?.[g.nome]?.regra || "" };
  });
  const naoAplicaveis = CRITERIOS.filter((c) => sitDe(c.id) === "NAO_APLICAVEL").map((c) => { const n = naoAplicavelDe(estado, c); return { id: c.id, criterio: c.titulo, justificativa: n.justificativa, por: n.por || "", em: n.em || "" }; });
  const pendencias = [
    ...CRITERIOS.filter((c) => sitDe(c.id) === "PENDENTE").map((c) => `O critério "${c.titulo}" ainda não foi aprovado: a regra correspondente não entra na política.`),
    ...CRITERIOS.filter((c) => sitDe(c.id) === "SEM_ANALISE").map((c) => `O critério "${c.titulo}" não pode ser dado como verificado: ${coberturaDoCriterio(contagem, c).falta} não foi executada nesta base. A regra não entra na política até a análise ser feita ou o critério ser declarado não aplicável, com justificativa.`),
    ...listaCh.filter((c) => c.conclusao === "PENDENTE" && c.causa === "GRUPOS_SEM_CONCLUSAO").map((c) => `A checagem "${c.titulo}" tem grupos sem conclusão (${fmt(c.cobertura.gruposConcluidos)} de ${fmt(c.cobertura.grupos)} concluídos): a regra entra na política, mas a verificação não terminou.`),
    ...(Object.values(estado?.piloto || {}).filter((p) => p.status === "Testado").length < 4 ? ["O piloto SAP não tem os quatro casos testados: os procedimentos de execução ficam sem liberação."] : []),
    ...porGrupo.filter((g) => g.saneado && g.fiscal !== "Revisão concluída").map((g) => `A revisão fiscal do grupo "${g.grupo}" não foi concluída.`),
    ...secoes.filter((s) => !s.responsavel.trim() || !s.controle.trim()).map((s) => `Falta o responsável ou o controle de "${s.titulo}".`),
  ];
  const aprovada = pol.aprovada?.por ? pol.aprovada : null;
  return {
    secoes, porGrupo, pendencias, aprovada, situacao: aprovada ? "Aprovada" : "Rascunho",
    prontaParaAprovar: secoes.every((s) => s.responsavel.trim() && s.controle.trim()) && regras.length > 0,
    estruturada: estruturar({ estado, escopo, secoes, porGrupo, nomeProjeto, nomeBase, params, regrasLigadas, abrev, un, aprovada, naoAplicaveis, inativacao: resInativacao, observacao }),
  };
}

/** Versão estruturada da política (JSON), para configurar o módulo de cadastro automático do cliente. */
function estruturar({ estado, escopo, secoes, porGrupo, nomeProjeto, nomeBase, params, regrasLigadas, abrev, un, aprovada, naoAplicaveis, inativacao, observacao }) {
  const regras = { ...REGRAS_PADRAO, ...(estado?.padronizacao?.regras || {}) };
  return {
    versao: 1, projeto: nomeProjeto, base: nomeBase, situacao: aprovada ? "Aprovada" : "Rascunho", aprovadaPor: aprovada?.por || null, aprovadaEm: aprovada?.em || null,
    aviso: "Proposta de política gerada pelo saneamento: vale depois de revisada e aprovada pelo responsável. Nada foi alterado no cadastro ou no ERP pela ferramenta.",
    descricao: { formato: "NOME + REFERENCIA + COMPLEMENTO", limiteCaracteres: 100, regrasDeFormato: Object.fromEntries(Object.keys(ROTULO_REGRAS).map((k) => [k, !!regras[k]])), regrasLigadas, abreviacoesAprovadas: abrev },
    unidade: {
      politica: estado?.politicaUnidade?.ativa === false ? "desligada (só grafia, unidade vazia e unidade sem regra)" : "menor unidade pratica da medida; unidade maior e embalagem viram unidade de compra com fator",
      nomesPadrao: un.padroes, tabela: un.linhas.map((l) => ({ unidade: l.rotulo, itens: l.n, tratamento: l.texto })),
    },
    duplicidade: {
      verificarAntesDeCriar: true, comparacao: ["descricao normalizada", "unidade", "medidas", "NCM"], complementosQueFazemOutroItem: ["cor", "tom", "tamanho", "posicao", "condicao (original, paralelo, novo, usado)", "material", "sabor"],
      ordemParaEscolherQuemFica: ["maior saldo em estoque", "movimentacao mais recente", "cadastro mais completo", "menor codigo"], exigeConfirmacaoTecnica: true,
      // exceção por grupo: nos grupos listados cor, tipo e apresentação são observação (campo adicional do item) e não geram código próprio
      varianteEhObservacao: { grupos: observacao.grupos, palavras: observacao.palavras, regra: "cor, tipo e apresentacao nao geram codigo proprio; ficam no campo adicional do item" },
    },
    fiscal: { ncm: "8 digitos vigentes na tabela oficial", classificacao: "cClassTrib conferido contra os anexos da LC 214/2025; capitulo ou posicao citado no anexo e NCM ambiguo = revisao com especialista", servicos: "NBS e LC 116" },
    descontinuacao: { semMovimentoDesde: params.desde || null, itensSemData: params.semData, tratamentoComSaldoOuHistorico: "transferir saldo e preservar historico antes de inativar; evidencia obrigatoria", itensForaDoEscopo: escopo?.fora?.length ?? 0,
      aprovacao: "o corte por data so seleciona candidatos; a inativacao exige aprovacao em lote por grupo (lista fechada de codigos, base e data analisadas, verificacoes, aprovador e justificativa) ou decisao individual", candidatosInativacao: inativacao.candidatos, inativacaoAprovada: inativacao.aprovados },
    criteriosNaoAplicaveis: naoAplicaveis,
    grupos: porGrupo.map((g) => ({ nome: g.grupo, itens: g.itens, saneado: g.saneado, revisaoFiscal: g.fiscal, regra: g.regra })),
    procedimentos: secoes.map((s) => ({ id: s.id, titulo: s.titulo, responsavel: s.responsavel, controle: s.controle, regras: s.regras.map((r) => ({ id: r.id, texto: r.texto, origem: r.origem, evidencia: r.evidencia })) })),
  };
}

/** Colunas da planilha de regras: [título, chave, largura]. */
export const COLUNAS_REGRAS = [["Procedimento", "procedimento", 24], ["Regra", "texto", 90], ["Origem", "origem", 46], ["Evidência no projeto", "evidencia", 54], ["Responsável", "responsavel", 26], ["Controle", "controle", 40]];

/** Linhas da planilha de regras: uma por regra, com o responsável e o controle do procedimento. */
export const linhasRegras = (politica) => politica.secoes.flatMap((s) => s.regras.map((r) => ({ procedimento: s.titulo, texto: r.texto, origem: r.origem, evidencia: r.evidencia, responsavel: s.responsavel, controle: s.controle })));
