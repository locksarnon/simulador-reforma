import React, { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { hojeIso } from "./logica";
import { FRENTES, ORDEM_TIPOS, TIPOS_TAREFA, aplicarRespostaExecucao, lerRespostaExecucao, linhasListaFrente, situacaoFrente, situacaoTarefa, tiposEfetivos } from "./execucao";
import { gerarListaFrente } from "./listasFinais";
import { Acc, Botao, Chip, Th, fmt, ordenarPor, plural, useOrdenacao } from "./ui";

const OPCOES = [["", "Pendente"], ["FEITO", "Feito"], ["DIV", "Divergência"]];
// Ordem das situações nas colunas ordenáveis (o que não se aplica fica por último)
const RANQUE_FRENTE = { NA: null, PENDENTE: 0, SEM_EVIDENCIA: 1, DIVERGENCIA: 2, FEITO: 3 };
const RANQUE_GERAL = { PENDENTE: 0, EM_ANDAMENTO: 1, DIVERGENCIA: 2, CONCLUIDA: 3 };

/** Resumo curto de uma frente (para o título do lote e do tipo). */
const progresso = (r) => `administrativo ${fmt(r.adm.feitas)}/${fmt(r.adm.total)}${r.alm.total ? ` · almoxarifado ${fmt(r.alm.feitas)}/${fmt(r.alm.total)}` : ""}`;

/** Uma frente de uma tarefa: situação, evidência (ou explicação da divergência) e, no almoxarifado, o que a equipe informou da realocação. */
function CelulaFrente({ t, frente, reg, onStatus, onNota }) {
  if (!t.aplica[frente]) return <span className="text-muted-foreground">—</span>;
  const s = situacaoFrente(true, reg);
  return (
    <div className="space-y-1">
      <select value={reg?.status || ""} onChange={(e) => onStatus(t.id, frente, e.target.value)} aria-label={`${FRENTES[frente]}: situação de ${t.codigo}`} className="border rounded px-1 py-0.5 bg-background text-xs">
        {OPCOES.map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}
      </select>
      <input value={(reg?.status === "DIV" ? reg.obs : reg?.evidencia) || ""} onChange={(e) => onNota(t.id, frente, reg, e.target.value)} placeholder={reg?.status === "DIV" ? "Explique a divergência" : "Evidência (documento, foto, link)"}
        aria-label={`${FRENTES[frente]}: evidência de ${t.codigo}`} className="block w-44 border rounded px-1 py-0.5 bg-background text-xs" />
      {s === "SEM_EVIDENCIA" && <Chip tom="a">Sem evidência: pendente</Chip>}
      {frente === "alm" && (reg?.origem || reg?.destino || reg?.qtd) && <div className="text-[11px] text-muted-foreground">{reg.origem || "—"} → {reg.destino || "—"}{reg.qtd ? ` · ${reg.qtd}` : ""}</div>}
    </div>
  );
}

/** Conteúdo de um lote (grupo): por tipo de tarefa, o registro em lote e a tabela das tarefas. Só é montado com o lote aberto. */
function Lote({ g, tarefasPorTipo, registros, mostrar, setMostrar, evidLote, setEvidLote, onStatus, onNota, onLote }) {
  const [ord, ordenar] = useOrdenacao(); // a mesma ordem vale para as tabelas de todos os tipos do lote
  return (
    <div className="space-y-3">
      {g.tipos.map((tp) => {
        const chave = `${g.grupo}|${tp.tipo}`; const doTipo = tarefasPorTipo.get(chave) || []; const lim = mostrar[chave] || 50;
        const comAlm = doTipo.some((t) => t.aplica.alm); const evid = (evidLote[chave] || "").trim();
        return (
          <div key={tp.tipo} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2"><b className="text-sm font-medium">{TIPOS_TAREFA[tp.tipo].titulo}</b><span className="text-xs text-muted-foreground">{plural(tp.total, "tarefa", "tarefas")} · {progresso(tp)}</span></div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={evidLote[chave] || ""} onChange={(e) => setEvidLote((m) => ({ ...m, [chave]: e.target.value }))} placeholder="Evidência do lote (documento no SAP, foto, link)" aria-label={`Evidência do lote: ${TIPOS_TAREFA[tp.tipo].titulo} em ${g.grupo}`} className="border rounded px-2 py-1 text-xs bg-background w-72" />
              <Botao disabled={!evid} title={evid ? undefined : "Informe a evidência para registrar"} onClick={() => onLote(doTipo.map((t) => t.id), "adm", evid)}>Administrativo: marcar como feito</Botao>
              {comAlm && <Botao disabled={!evid} title={evid ? undefined : "Informe a evidência para registrar"} onClick={() => onLote(doTipo.filter((t) => t.aplica.alm).map((t) => t.id), "alm", evid)}>Almoxarifado: marcar como feito</Botao>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><Th chave="codigo" ord={ord} onOrdenar={ordenar}>Código</Th><Th chave="descricao" ord={ord} onOrdenar={ordenar}>Descrição</Th><Th chave="fazer" ord={ord} onOrdenar={ordenar}>O que fazer</Th><Th chave="adm" ord={ord} onOrdenar={ordenar}>Administrativo</Th><Th chave="alm" ord={ord} onOrdenar={ordenar}>Almoxarifado</Th><Th chave="situacao" ord={ord} onOrdenar={ordenar}>Situação</Th></tr></thead>
                <tbody>{ordenarPor(doTipo, ord, { codigo: (t) => t.codigo, descricao: (t) => t.descricao, fazer: (t) => t.instrucao.adm, adm: (t) => RANQUE_FRENTE[situacaoTarefa(t, registros[t.id]).adm], alm: (t) => RANQUE_FRENTE[situacaoTarefa(t, registros[t.id]).alm], situacao: (t) => RANQUE_GERAL[situacaoTarefa(t, registros[t.id]).geral] }).slice(0, lim).map((t) => {
                  const s = situacaoTarefa(t, registros[t.id]);
                  return (
                    <tr key={t.id} className="border-t border-border align-top">
                      <td className="p-1.5 tabular-nums">{t.codigo || "—"}</td><td className="p-1.5 max-w-[220px]">{t.descricao || "—"}</td>
                      <td className="p-1.5 max-w-[320px] text-muted-foreground"><span className="line-clamp-3" title={t.instrucao.adm}>{t.instrucao.adm}</span></td>
                      <td className="p-1.5"><CelulaFrente t={t} frente="adm" reg={registros[t.id]?.adm} onStatus={onStatus} onNota={onNota} /></td>
                      <td className="p-1.5"><CelulaFrente t={t} frente="alm" reg={registros[t.id]?.alm} onStatus={onStatus} onNota={onNota} /></td>
                      <td className="p-1.5 whitespace-nowrap">{s.geral === "CONCLUIDA" ? <Chip tom="g">Concluída</Chip> : s.geral === "DIVERGENCIA" ? <Chip tom="a">Divergência</Chip> : s.geral === "EM_ANDAMENTO" ? <Chip tom="b">Em andamento</Chip> : <Chip>Pendente</Chip>}</td>
                    </tr>);
                })}</tbody></table>
              {doTipo.length > lim && <button type="button" onClick={() => setMostrar((m) => ({ ...m, [chave]: lim + 200 }))} className="text-xs text-primary underline p-2">Mostrar mais ({fmt(doTipo.length - lim)} restantes)</button>}
            </div>
          </div>);
      })}
    </div>
  );
}

/**
 * Passo Execução (realocações físicas): as decisões aprovadas viram tarefas para o administrativo (SAP) e, onde há movimento físico, para o almoxarifado.
 * A tarefa só conta como concluída quando todas as frentes aplicáveis confirmam com evidência. As equipes recebem uma planilha e devolvem a resposta.
 */
export default function PassoExecucao({ estado, setEstado, tarefas, geradasPorTipo, resumo, quem, slug, pilotoTestados, pilotoTotal }) {
  const [aberto, setAberto] = useState({});
  const [mostrar, setMostrar] = useState({});
  const [evidLote, setEvidLote] = useState({});
  const [msg, setMsg] = useState("");
  const [gerando, setGerando] = useState("");
  const [ordTipos, ordenarTipos] = useOrdenacao();
  const registros = estado.execucao?.registros || {};
  const cfg = tiposEfetivos(estado.execucao?.tipos);
  const alternar = (k) => setAberto((a) => ({ ...a, [k]: !a[k] }));
  const tarefasPorTipo = useMemo(() => { const m = new Map(); for (const t of tarefas) { const k = `${t.grupo}|${t.tipo}`; const l = m.get(k); if (l) l.push(t); else m.set(k, [t]); } return m; }, [tarefas]);
  const nLista = useMemo(() => ({ adm: linhasListaFrente("adm", tarefas, registros).length, alm: linhasListaFrente("alm", tarefas, registros).length }), [tarefas, registros]);

  // Atualizações funcionais: duas ações seguidas nunca sobrescrevem uma à outra.
  const editarExec = (fn) => setEstado((e) => { const ex = e.execucao || {}; return { ...e, execucao: fn({ ...ex, tipos: { ...(ex.tipos || {}) }, registros: { ...(ex.registros || {}) } }) }; });
  const setTipo = (tipo, patch) => editarExec((ex) => ({ ...ex, tipos: { ...ex.tipos, [tipo]: { ...(ex.tipos[tipo] || {}), ...patch } } }));
  const editarReg = (id, frente, patch) => editarExec((ex) => { const atual = ex.registros[id] || {}; return { ...ex, registros: { ...ex.registros, [id]: { ...atual, [frente]: { ...(atual[frente] || {}), ...patch } } } }; });
  const limparReg = (id, frente) => editarExec((ex) => {
    const atual = { ...(ex.registros[id] || {}) }; delete atual[frente];
    const regs = { ...ex.registros }; if (Object.keys(atual).length) regs[id] = atual; else delete regs[id];
    return { ...ex, registros: regs };
  });
  const mudarStatus = (id, frente, v) => (v === "" ? limparReg(id, frente) : editarReg(id, frente, { status: v, por: quem, em: hojeIso() }));
  // Escreve no campo que o status pede: a evidência (feito ou pendente) ou a explicação da divergência.
  const escreverNota = (id, frente, reg, txt) => editarReg(id, frente, reg?.status === "DIV" ? { obs: txt } : { evidencia: txt, por: quem, em: hojeIso() });
  const registrarLote = (ids, frente, evidencia) => editarExec((ex) => {
    const regs = { ...ex.registros };
    for (const id of ids) {
      const atual = regs[id] || {}; const ant = atual[frente];
      if (situacaoFrente(true, ant) === "FEITO") continue; // já confirmada com evidência
      regs[id] = { ...atual, [frente]: { ...(ant || {}), status: "FEITO", evidencia, por: quem, em: hojeIso(), lote: true } };
    }
    return { ...ex, registros: regs };
  });

  const emitir = async (frente) => {
    setGerando(frente); setMsg("");
    try {
      const linhas = linhasListaFrente(frente, tarefas, registros);
      await gerarListaFrente(frente, linhas, `${slug}-tarefas-${frente === "adm" ? "administrativo" : "almoxarifado"}.xlsx`);
      setMsg(`Lista emitida com ${plural(linhas.length, "tarefa", "tarefas")}.`);
    } catch (e) { setMsg(`Não foi possível emitir a lista: ${e.message}`); } finally { setGerando(""); }
  };
  const importar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    try {
      const linhas = await lerRespostaExecucao(f);
      const res = aplicarRespostaExecucao(registros, tarefas, linhas, { quem, hoje: hojeIso() });
      editarExec((ex) => ({ ...ex, registros: res.registros }));
      const x = res.resumo;
      setMsg(`Resposta importada: ${plural(x.feitas, "confirmada", "confirmadas")}${x.semEvidencia ? ` (${fmt(x.semEvidencia)} sem evidência: continuam pendentes)` : ""}, ${fmt(x.divergencias)} com divergência, ${fmt(x.semResposta)} sem resposta${x.naoAplicaveis ? `, ${plural(x.naoAplicaveis, "linha de frente que não se aplica", "linhas de frente que não se aplicam")}` : ""}${x.naoEncontradas.length ? `, ${plural(x.naoEncontradas.length, "tarefa não encontrada", "tarefas não encontradas")}` : ""}.`);
    } catch (err) { setMsg(err.message); }
  };

  const cartoes = [["Tarefas", resumo.total], ["Concluídas", resumo.CONCLUIDA], ["Em andamento", resumo.EM_ANDAMENTO], ["Pendentes", resumo.PENDENTE], ["Com divergência", resumo.DIVERGENCIA]];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Cada decisão aprovada vira tarefa para o administrativo (SAP) e, quando há movimento físico, para o almoxarifado (realocações). A tarefa só conta como concluída quando todas as frentes aplicáveis confirmam com evidência; sem prova, continua pendente. Nada é alterado no SAP nem no físico por esta ferramenta.</p>
      {pilotoTestados < pilotoTotal && <p className="text-xs text-amber-700 dark:text-amber-300">O piloto SAP está com {pilotoTestados} de {pilotoTotal} casos testados. Unificar, separar e descontinuar sem teste registrado pode falhar no SAP: prepare as listas, mas confirme o piloto antes de liberar os lotes.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {cartoes.map(([l, v]) => <div key={l} className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-medium tabular-nums">{fmt(v)}</p></div>)}
      </div>
      {resumo.semEvidencia > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{plural(resumo.semEvidencia, "confirmação está", "confirmações estão")} sem evidência e não {resumo.semEvidencia === 1 ? "conta" : "contam"} como feita{resumo.semEvidencia === 1 ? "" : "s"}.</p>}

      <Acc aberto={!!aberto.__tipos} onToggle={() => alternar("__tipos")} titulo={<><b className="font-medium">Tipos de tarefa e frentes aplicáveis</b><span className="text-xs text-muted-foreground">escolha o que entra na execução e onde há movimento físico</span></>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><Th chave="tipo" ord={ordTipos} onOrdenar={ordenarTipos}>Tipo</Th><Th chave="geradas" ord={ordTipos} onOrdenar={ordenarTipos}>Geradas</Th><Th chave="entra" ord={ordTipos} onOrdenar={ordenarTipos}>Entra na execução</Th><Th chave="alm" ord={ordTipos} onOrdenar={ordenarTipos}>Almoxarifado participa</Th><th className="p-1.5">O que se faz</th></tr></thead>
            <tbody>{ordenarPor(ORDEM_TIPOS, ordTipos, { tipo: (t) => TIPOS_TAREFA[t].titulo, geradas: (t) => geradasPorTipo[t] || 0, entra: (t) => (cfg[t].incluir ? 1 : 0), alm: (t) => (TIPOS_TAREFA[t].comoAlm ? (cfg[t].alm ? 1 : 0) : null) }).map((t) => {
              const base = TIPOS_TAREFA[t]; const c = cfg[t];
              return (
                <tr key={t} className="border-t border-border align-top">
                  <td className="p-1.5 font-medium">{base.titulo}</td><td className="p-1.5 tabular-nums">{fmt(geradasPorTipo[t] || 0)}</td>
                  <td className="p-1.5"><input type="checkbox" aria-label={`Incluir na execução: ${base.titulo}`} checked={c.incluir} onChange={(e) => setTipo(t, { incluir: e.target.checked })} /></td>
                  <td className="p-1.5">{base.comoAlm ? <input type="checkbox" aria-label={`Almoxarifado participa: ${base.titulo}`} checked={c.alm} disabled={!c.incluir} onChange={(e) => setTipo(t, { alm: e.target.checked })} /> : <span className="text-muted-foreground">sem etapa física</span>}</td>
                  <td className="p-1.5 text-muted-foreground max-w-[460px]"><b className="font-medium text-foreground">Administrativo:</b> {base.comoAdm}{base.comoAlm && <><br /><b className="font-medium text-foreground">Almoxarifado:</b> {base.comoAlm}</>}</td>
                </tr>);
            })}</tbody></table>
        </div>
      </Acc>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-sm font-medium">Listas para as equipes</span>
        <Botao disabled={!!gerando || nLista.adm === 0} onClick={() => emitir("adm")}>{gerando === "adm" ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Emitir lista do administrativo ({fmt(nLista.adm)})</Botao>
        <Botao disabled={!!gerando || nLista.alm === 0} onClick={() => emitir("alm")}>{gerando === "alm" ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Emitir lista do almoxarifado ({fmt(nLista.alm)})</Botao>
        <label className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted cursor-pointer">Importar resposta<input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={importar} /></label>
        {msg && <span className="text-xs text-muted-foreground" role="status">{msg}</span>}
        <span className="basis-full text-xs text-muted-foreground">Cada equipe responde FEITO ou DIVERGÊNCIA, com a evidência (documento no SAP, foto, link); o almoxarifado informa também os endereços e a quantidade realocada. A lista só traz o que ainda falta confirmar.</span>
      </div>

      {tarefas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma tarefa ainda: elas nascem das decisões aprovadas no passo De/para e dos itens inativados pelo parâmetro de saneamento.</p> : resumo.grupos.map((g) => (
        <Acc key={g.grupo} aberto={!!aberto["g" + g.grupo]} onToggle={() => alternar("g" + g.grupo)}
          titulo={<><b className="font-medium">{g.grupo}</b>{g.CONCLUIDA === g.total ? <Chip tom="g">Concluído</Chip> : <Chip tom="a">Em execução</Chip>}{g.DIVERGENCIA > 0 && <Chip tom="a">{plural(g.DIVERGENCIA, "divergência", "divergências")}</Chip>}<span className="text-xs text-muted-foreground">{plural(g.total, "tarefa", "tarefas")} · {progresso(g)}</span></>}>
          <Lote g={g} tarefasPorTipo={tarefasPorTipo} registros={registros} mostrar={mostrar} setMostrar={setMostrar} evidLote={evidLote} setEvidLote={setEvidLote} onStatus={mudarStatus} onNota={escreverNota} onLote={registrarLote} />
        </Acc>))}
    </div>
  );
}
