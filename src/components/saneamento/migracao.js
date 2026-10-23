// Migração das decisões do formato antigo (guardadas pelo número da LINHA da planilha) para o formato novo (guardadas pelo CÓDIGO do item, como texto). Funções puras.
//
// A linha só identifica o item na base em que foi tomada a decisão: numa extração nova ela aponta para outro produto. Por isso a migração só acontece contra a BASE ORIGINAL
// (a que o analista atesta ser a que fundamentou as decisões), recuperando o código de cada decisão nessa base. Antes de aceitar, cada decisão é conferida contra o que ela
// mesma guardou (grupo, unidade de origem, código que ficava, texto da sugestão, ação fiscal); se UMA conferência falha, essa base não é a original e nada é migrado de forma
// automática. Nunca se reconstrói decisão antiga pelo número da linha de outra base. O que não vincula (ambíguo ou não encontrado) fica guardado em `legado`, intacto e fora do
// trabalho, para o analista decidir de novo. A simulação roda sobre uma cópia e não grava nada: o projeto só muda quando o resultado é aplicado.
import { grupoDe } from "./logica";
import { chaveDeId, idItem, indexar, VERSAO_CHAVES, textoOrigem } from "./identidade";
import { instantaneoDoItem, parecenca } from "./aprovacao";
import { alteracaoDaTarefa, tarefaDaDecisao } from "./execucao";
import { montarConjuntos } from "./conjuntos";
import { SITUACOES, leituraFiscal } from "./fiscal";

const comparavel = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Carimba a confirmação das equipes com a alteração aprovada, para ela não valer para outra alteração do mesmo item e critério. */
const carimbar = (v, alteracao) => ({ ...v, ...(v?.adm ? { adm: { ...v.adm, alteracao } } : {}), ...(v?.alm ? { alm: { ...v.alm, alteracao } } : {}) });

export const RESULTADO = { VINCULADA: "VINCULADA", AMBIGUA: "AMBIGUA", NAO_ENCONTRADA: "NAO_ENCONTRADA" };
export const ROT_RESULTADO = { VINCULADA: "Vinculada ao código", AMBIGUA: "Ambígua: fica pendente para revisão", NAO_ENCONTRADA: "Não encontrada na base" };
export const ROT_TIPO = { decisao: "Decisão", execucao: "Confirmação de execução", fiscal: "Decisão fiscal" };

const eNumero = (s) => /^\d+$/.test(String(s));
const chaveAntiga = (k) => { const m = /^(\d+)\|([a-z]+)$/.exec(String(k)); return m ? { linha: Number(m[1]), crit: m[2] } : null; };

/**
 * Planeja a migração contra a base dada (`itens`, a base original atestada pelo analista) sem alterar o estado recebido. Devolve { estado, relatorio }:
 *  - `estado`: o projeto como ficaria (formato novo, com `legado` para o que não vinculou);
 *  - `relatorio`: { totais, verificacao, linhas } com uma linha por decisão, confirmação de execução e decisão fiscal, o código recuperado e o motivo.
 * `origem` é a origem dos dados (ERP, instância e empresa) declarada no projeto; `base` identifica a base original ({ id, arquivo }).
 */
export function planejarMigracao(estado, itens, { base = {}, origem = {}, por = "", em = "" } = {}) {
  const indice = indexar(itens);
  const decisoes = estado?.decisoes || {}; const registros = estado?.execucao?.registros || {}; const fiscalDec = estado?.fiscal?.decisoes || {};
  const itensComDup = (itens || []).filter((i) => i.duplicidade);
  const conjuntos = itensComDup.length ? montarConjuntos(itensComDup) : [];
  const conjuntoDe = new Map(); for (const c of conjuntos) for (const m of c.membros) conjuntoDe.set(m.linha, c);
  const linhasRel = []; const checagens = { total: 0, fortes: 0, falhas: [] };

  // Recupera o item e o código de uma linha da base original; devolve o que impede o vínculo, se houver.
  const recuperar = (linha) => {
    const it = indice.porLinha.get(linha);
    if (!it) return { resultado: RESULTADO.NAO_ENCONTRADA, motivo: `A linha ${linha} não existe na base (a base tem ${indice.porLinha.size} itens)` };
    const id = idItem(it);
    if (!id) return { it, resultado: RESULTADO.AMBIGUA, motivo: "O item não tem código na base: não dá para identificá-lo" };
    if (indice.repetidos.has(id)) return { it, id, resultado: RESULTADO.AMBIGUA, motivo: `O código ${id} aparece mais de uma vez na base: não dá para saber de qual item é a decisão` };
    return { it, id };
  };
  // conferência forte = o que a decisão guardou além do grupo (unidade de origem, código que ficava, texto da sugestão, ação fiscal); o grupo sozinho é fraco
  const conferir = (nome, ok, forte = true) => { checagens.total += 1; if (forte) checagens.fortes += 1; if (!ok) checagens.falhas.push(nome); return ok; };

  const novosDecisoes = {}; const novosRegistros = {}; const novosFiscal = {};
  const legado = { decisoes: {}, execucaoRegistros: {}, fiscalDecisoes: {} }; const motivosLegado = {};
  const migradas = new Map(); // chave antiga da decisão -> chave nova

  // ── Decisões ──
  const pendentesDecisao = [];
  for (const [k, d] of Object.entries(decisoes)) {
    const ca = chaveAntiga(k);
    if (!ca) { pendentesDecisao.push({ k, d, resultado: RESULTADO.AMBIGUA, motivo: "A chave não está no formato antigo (linha|critério)", criterio: "", linha: null }); continue; }
    const r = recuperar(ca.linha);
    const reg = { k, d, criterio: ca.crit, linha: ca.linha, ...r, falhas: [] };
    if (r.it) {
      // conferências: o que a decisão guardou tem que bater com o item que essa linha tem na base atestada como original
      if (d?.grupo != null && !conferir(`${k}: grupo`, String(d.grupo).trim() === grupoDe(r.it), false)) reg.falhas.push(`o grupo guardado na decisão (${d.grupo}) é diferente do grupo do item nesta base (${grupoDe(r.it)})`);
      if (ca.crit === "unidade" && d?.de && !conferir(`${k}: unidade`, comparavel(d.de) === comparavel(r.it.unidade))) reg.falhas.push(`a unidade de origem guardada (${d.de}) é diferente da unidade do item nesta base (${r.it.unidade || "vazia"})`);
      if (ca.crit === "padrao" && d?.sugerida) {
        const p = parecenca(d.sugerida, r.it.descricao);
        if (p < 0.25 && !conferir(`${k}: sugestão`, false)) reg.falhas.push("a descrição sugerida guardada não tem relação com a descrição do item nesta base");
        else if (p >= 0.25) conferir(`${k}: sugestão`, true);
      }
      if (ca.crit === "duplicidade" && d?.destino != null && eNumero(d.destino)) {
        const dest = indice.porLinha.get(Number(d.destino)); const conj = conjuntoDe.get(r.it.linha);
        const proximo = !!dest && (Number(d.destino) === r.it.linha || (conj ? conj.membros.some((m) => m.linha === dest.linha) : r.it.duplicidade?.mestre === dest.linha));
        if (!conferir(`${k}: código que fica`, proximo)) reg.falhas.push(dest ? "o item que ficava (linha " + d.destino + ") não está no mesmo conjunto de duplicados desta base" : `a linha ${d.destino} do item que ficava não existe nesta base`);
        reg.destino = dest || null;
      }
    }
    pendentesDecisao.push(reg);
  }

  // ── Confirmações de execução (o id da tarefa é a chave da decisão, ou "linha|inativacao") ──
  const regsExec = [];
  for (const [k, v] of Object.entries(registros)) {
    const ca = chaveAntiga(k);
    if (!ca) { regsExec.push({ k, v, resultado: RESULTADO.AMBIGUA, motivo: "O id da tarefa não está no formato antigo (linha|critério)", criterio: "", linha: null }); continue; }
    const r = recuperar(ca.linha);
    regsExec.push({ k, v, criterio: ca.crit, linha: ca.linha, ...r });
  }

  // ── Decisões fiscais (a chave é a linha) ──
  const regsFiscal = [];
  for (const [k, d] of Object.entries(fiscalDec)) {
    if (!eNumero(k)) { regsFiscal.push({ k, d, resultado: RESULTADO.AMBIGUA, motivo: "A chave não é um número de linha", criterio: "fiscal", linha: null }); continue; }
    const r = recuperar(Number(k));
    const reg = { k, d, criterio: "fiscal", linha: Number(k), ...r, falhas: [] };
    if (r.it) {
      const l = leituraFiscal(r.it, new Map(), indice);
      if (!conferir(`fiscal ${k}: ação`, !!SITUACOES[l.situacao]?.acoes.includes(d?.acao))) reg.falhas.push(`a ação fiscal guardada (${d?.acao}) não existe para a situação deste item nesta base (${SITUACOES[l.situacao]?.rotulo})`);
    }
    regsFiscal.push(reg);
  }

  const confere = checagens.falhas.length === 0 && ![...pendentesDecisao, ...regsExec, ...regsFiscal].some((x) => x.resultado === RESULTADO.NAO_ENCONTRADA);
  const verificacao = {
    confere, verificacoes: checagens.total, falhas: checagens.falhas.length, exemplos: checagens.falhas.slice(0, 5),
    // sem nenhuma conferência forte (só o grupo, ou nada, como nas confirmações de execução) a base não é contrariada, mas também não é comprovada
    fraca: confere && checagens.fortes === 0, fortes: checagens.fortes,
    mensagem: confere
      ? (checagens.total === 0 ? "Não há como conferir a base com as decisões guardadas: a migração depende só da sua atestação de que esta é a base original."
        : checagens.fortes === 0 ? `Só o grupo das decisões pôde ser conferido (${checagens.total} conferências batem): a migração depende da sua atestação de que esta é a base original.` : `As ${checagens.total} conferências batem: esta base é compatível com as decisões.`)
      : "Esta base NÃO confere com as decisões guardadas (o que a decisão guardou não bate com o item da mesma linha): não há fundamento para migrar de forma automática.",
  };

  const motivoBase = "A base não confere com as decisões guardadas: não há fundamento para migrar de forma automática";
  const resolver = (reg) => {
    if (reg.resultado === RESULTADO.NAO_ENCONTRADA) return { resultado: RESULTADO.NAO_ENCONTRADA, motivo: reg.motivo };
    if (reg.resultado === RESULTADO.AMBIGUA) return { resultado: RESULTADO.AMBIGUA, motivo: reg.motivo };
    if (reg.falhas?.length) return { resultado: RESULTADO.AMBIGUA, motivo: `A conferência falhou: ${reg.falhas.join("; ")}` };
    if (!confere) return { resultado: RESULTADO.AMBIGUA, motivo: motivoBase };
    return { resultado: RESULTADO.VINCULADA, motivo: "" };
  };
  const rel = (tipo, reg, res, chaveNova) => linhasRel.push({ tipo, chaveAntiga: reg.k, chaveNova: chaveNova || "", criterio: reg.criterio, linha: reg.linha, codigo: reg.id || "", grupo: reg.it ? grupoDe(reg.it) : "", descricao: reg.it?.descricao || "", resultado: res.resultado, motivo: res.motivo });

  for (const reg of pendentesDecisao) {
    const res = resolver(reg);
    if (res.resultado !== RESULTADO.VINCULADA) { legado.decisoes[reg.k] = reg.d; motivosLegado[`decisao ${reg.k}`] = res.motivo; rel("decisao", reg, res); continue; }
    const nova = chaveDeId(reg.id, reg.criterio); const antes = reg.d.antes ?? instantaneoDoItem(reg.it, reg.criterio); const d = { ...reg.d, ...(antes ? { antes } : {}), migradaDe: reg.k };
    if (reg.criterio === "duplicidade" && d.destino != null && eNumero(d.destino)) {
      if (!reg.destino || !idItem(reg.destino) || indice.repetidos.has(idItem(reg.destino))) { const r2 = { resultado: RESULTADO.AMBIGUA, motivo: "O item que ficava não tem código que o identifique nesta base" }; legado.decisoes[reg.k] = reg.d; motivosLegado[`decisao ${reg.k}`] = r2.motivo; rel("decisao", reg, r2); continue; }
      d.destino = idItem(reg.destino); d.destinoAntes = d.destinoAntes ?? instantaneoDoItem(reg.destino, "duplicidade");
    }
    if (novosDecisoes[nova]) { const r3 = { resultado: RESULTADO.AMBIGUA, motivo: "Há mais de uma decisão antiga para o mesmo código e critério" }; legado.decisoes[reg.k] = reg.d; motivosLegado[`decisao ${reg.k}`] = r3.motivo; rel("decisao", reg, r3); continue; }
    novosDecisoes[nova] = d; migradas.set(reg.k, { nova, d, it: reg.it }); rel("decisao", reg, res, nova);
  }
  for (const reg of regsExec) {
    const res = resolver(reg);
    if (reg.criterio === "inativacao") { const r4 = { resultado: RESULTADO.AMBIGUA, motivo: "Confirmação de inativação por data de uso: a inativação passa a exigir a aprovação de uma lista fechada de itens, e esta confirmação não tem aprovação correspondente" }; legado.execucaoRegistros[reg.k] = reg.v; motivosLegado[`execução ${reg.k}`] = r4.motivo; rel("execucao", reg, r4); continue; }
    const info = migradas.get(reg.k); const nova = info?.nova;
    if (res.resultado !== RESULTADO.VINCULADA || !nova) {
      const r5 = res.resultado !== RESULTADO.VINCULADA ? res : { resultado: RESULTADO.AMBIGUA, motivo: "Não há decisão migrada que corresponda a esta tarefa" };
      legado.execucaoRegistros[reg.k] = reg.v; motivosLegado[`execução ${reg.k}`] = r5.motivo; rel("execucao", reg, r5); continue;
    }
    const t = tarefaDaDecisao(reg.criterio, info.d, info.it, indice); // a confirmação passa a valer para a alteração da decisão migrada
    novosRegistros[nova] = t ? carimbar(reg.v, alteracaoDaTarefa(t.tipo, t.dados)) : reg.v; rel("execucao", reg, res, nova);
  }
  for (const reg of regsFiscal) {
    const res = resolver(reg);
    if (res.resultado !== RESULTADO.VINCULADA) { legado.fiscalDecisoes[reg.k] = reg.d; motivosLegado[`fiscal ${reg.k}`] = res.motivo; rel("fiscal", reg, res); continue; }
    if (novosFiscal[reg.id]) { const r6 = { resultado: RESULTADO.AMBIGUA, motivo: "Há mais de uma decisão fiscal antiga para o mesmo código" }; legado.fiscalDecisoes[reg.k] = reg.d; motivosLegado[`fiscal ${reg.k}`] = r6.motivo; rel("fiscal", reg, r6); continue; }
    novosFiscal[reg.id] = reg.d; rel("fiscal", reg, res, reg.id);
  }

  const conta = (tipo) => { const l = linhasRel.filter((x) => x.tipo === tipo); return { total: l.length, vinculadas: l.filter((x) => x.resultado === RESULTADO.VINCULADA).length, ambiguas: l.filter((x) => x.resultado === RESULTADO.AMBIGUA).length, naoEncontradas: l.filter((x) => x.resultado === RESULTADO.NAO_ENCONTRADA).length }; };
  const totais = { decisoes: conta("decisao"), execucao: conta("execucao"), fiscal: conta("fiscal") };
  const temLegado = Object.keys(legado.decisoes).length + Object.keys(legado.execucaoRegistros).length + Object.keys(legado.fiscalDecisoes).length > 0;
  const novo = {
    ...estado, versaoChaves: VERSAO_CHAVES, origem: { ...(origem || {}), declaradaPor: por, declaradaEm: em },
    decisoes: novosDecisoes, execucao: { ...(estado?.execucao || {}), registros: novosRegistros }, fiscal: { ...(estado?.fiscal || {}), decisoes: novosFiscal },
    migracao: { em, por, base, origem: textoOrigem(origem), totais, verificacao: { confere, verificacoes: checagens.total, falhas: checagens.falhas.length, fraca: confere && checagens.fortes === 0 } },
  };
  if (temLegado) novo.legado = { geradoEm: em, por, base, ...legado, motivos: motivosLegado, linhas: linhasRel.filter((x) => x.resultado !== RESULTADO.VINCULADA) }; // as linhas do que não vinculou ficam no projeto: a lista de pendências
  return { estado: novo, relatorio: { geradoEm: em, por, base, origem, totais, verificacao, linhas: linhasRel } };
}

/**
 * Sem a base original não há fundamento para migrar: guarda tudo o que estava pela linha em `legado` (intacto, fora do trabalho) e segue no formato novo. Não apaga nada.
 */
export function guardarComoLegado(estado, { por = "", em = "", motivo = "A base original não está disponível: não há fundamento para migrar de forma automática" } = {}) {
  const decisoes = estado?.decisoes || {}; const registros = estado?.execucao?.registros || {}; const fiscalDec = estado?.fiscal?.decisoes || {};
  const motivos = {};
  for (const k of Object.keys(decisoes)) motivos[`decisao ${k}`] = motivo; for (const k of Object.keys(registros)) motivos[`execução ${k}`] = motivo; for (const k of Object.keys(fiscalDec)) motivos[`fiscal ${k}`] = motivo;
  const total = { total: Object.keys(decisoes).length, vinculadas: 0, ambiguas: Object.keys(decisoes).length, naoEncontradas: 0 };
  const linha = (tipo, k) => { const ca = tipo === "fiscal" ? { linha: Number(k), crit: "fiscal" } : chaveAntiga(k); return { tipo, chaveAntiga: k, chaveNova: "", criterio: ca?.crit ?? "", linha: ca?.linha ?? null, codigo: "", grupo: "", descricao: "", resultado: RESULTADO.AMBIGUA, motivo }; };
  const linhas = [...Object.keys(decisoes).map((k) => linha("decisao", k)), ...Object.keys(registros).map((k) => linha("execucao", k)), ...Object.keys(fiscalDec).map((k) => linha("fiscal", k))];
  return {
    ...estado, versaoChaves: VERSAO_CHAVES, decisoes: {}, execucao: { ...(estado?.execucao || {}), registros: {} }, fiscal: { ...(estado?.fiscal || {}), decisoes: {} },
    legado: { geradoEm: em, por, base: null, decisoes, execucaoRegistros: registros, fiscalDecisoes: fiscalDec, motivos, linhas },
    migracao: { em, por, base: null, origem: "", totais: { decisoes: total, execucao: { total: Object.keys(registros).length, vinculadas: 0, ambiguas: Object.keys(registros).length, naoEncontradas: 0 }, fiscal: { total: Object.keys(fiscalDec).length, vinculadas: 0, ambiguas: Object.keys(fiscalDec).length, naoEncontradas: 0 } }, verificacao: null, semBase: true },
  };
}

/** Quantos registros do formato antigo seguem guardados em `legado` (pendentes de revisão). */
export const totalLegado = (estado) => Object.keys(estado?.legado?.decisoes || {}).length + Object.keys(estado?.legado?.execucaoRegistros || {}).length + Object.keys(estado?.legado?.fiscalDecisoes || {}).length;
