import React, { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { hojeIso } from "./logica";
import { FRENTES, ORDEM_TIPOS, TIPOS_TAREFA, aplicarRespostaExecucao, confirmacaoObsoleta, lerRespostaExecucao, linhasListaFrente, registroEfetivo, situacaoFrente, situacaoTarefa, tiposEfetivos } from "./execucao";
import { gerarListaFrente } from "./listasFinais";
import { Acc, Botao, Chip, fmt, plural } from "./ui";
import TabelaPadrao from "@/components/TabelaPadrao";

const OPCOES = [["", "Pendente"], ["FEITO", "Feito"], ["DIV", "Divergência"]];

/** Resumo curto de uma frente (para o título do lote e do tipo). */
const progresso = (r) => `administrativo ${fmt(r.adm.feitas)}/${fmt(r.adm.total)}${r.alm.total ? ` · almoxarifado ${fmt(r.alm.feitas)}/${fmt(r.alm.total)}` : ""}`;

const ROT_OPCAO = Object.fromEntries(OPCOES);
const ROT_GERAL = { CONCLUIDA: "Concluída", DIVERGENCIA: "Divergência", EM_ANDAMENTO: "Em andamento", PENDENTE: "Pendente" };
const TOM_GERAL = { CONCLUIDA: "g", DIVERGENCIA: "a", EM_ANDAMENTO: "b", PENDENTE: "n" };

/**
 * Colunas de uma frente de uma tarefa: situação (com os avisos de confirmação de outra alteração e de falta de evidência), evidência (ou explicação da divergência) e,
 * no almoxarifado, o que a equipe informou da realocação. Cada informação na sua coluna.
 */
function colunasFrente(frente, registros, onStatus, onNota) {
  const reg = (t) => registroEfetivo(t, registros[t.id])?.[frente];
  const nome = FRENTES[frente];
  const cols = [
    { chave: `${frente}Situacao`, rotulo: `${nome}: situação`, valor: (t) => (t.aplica[frente] ? ROT_OPCAO[reg(t)?.status || ""] : "—"), render: (t) => {
      if (!t.aplica[frente]) return <span className="text-muted-foreground">—</span>;
      const r = reg(t); const s = situacaoFrente(true, r);
      return (
        <span className="inline-flex items-center gap-1.5">
          <select value={r?.status || ""} onChange={(e) => onStatus(t.id, frente, e.target.value)} aria-label={`${nome}: situação de ${t.codigo}`} className="border rounded px-1 py-0.5 bg-background text-xs">
            {OPCOES.map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}
          </select>
          {confirmacaoObsoleta(t, registros[t.id], frente) && <Chip tom="a">Havia confirmação de outra alteração: não vale, confirme de novo</Chip>}
          {s === "SEM_EVIDENCIA" && <Chip tom="a">Sem evidência: pendente</Chip>}
        </span>);
    } },
    { chave: `${frente}Evidencia`, rotulo: `${nome}: evidência`, valor: (t) => { const r = reg(t); return t.aplica[frente] ? (r?.status === "DIV" ? r.obs : r?.evidencia) || "" : "—"; }, render: (t) => {
      if (!t.aplica[frente]) return <span className="text-muted-foreground">—</span>;
      const r = reg(t);
      return <input value={(r?.status === "DIV" ? r.obs : r?.evidencia) || ""} onChange={(e) => onNota(t.id, frente, r, e.target.value)} placeholder={r?.status === "DIV" ? "Explique a divergência" : "Evidência (documento, foto, link)"}
        aria-label={`${nome}: evidência de ${t.codigo}`} className="w-44 border rounded px-1 py-0.5 bg-background text-xs" />;
    } },
  ];
  if (frente === "alm") cols.push({ chave: "almRealocacao", rotulo: "Realocação", valor: (t) => { const r = reg(t); return t.aplica.alm && (r?.origem || r?.destino || r?.qtd) ? `${r.origem || "—"} → ${r.destino || "—"}${r.qtd ? ` · ${r.qtd}` : ""}` : ""; } });
  return cols;
}

/** Conteúdo de um lote (grupo): por tipo de tarefa, o registro em lote e a tabela das tarefas. Só é montado com o lote aberto. */
function Lote({ g, tarefasPorTipo, registros, evidLote, setEvidLote, onStatus, onNota, onLote }) {
  return (
    <div className="space-y-3">
      {g.tipos.map((tp) => {
        const chave = `${g.grupo}|${tp.tipo}`; const doTipo = tarefasPorTipo.get(chave) || [];
        const comAlm = doTipo.some((t) => t.aplica.alm); const evid = (evidLote[chave] || "").trim();
        return (
          <div key={tp.tipo} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2"><b className="text-sm font-medium">{TIPOS_TAREFA[tp.tipo].titulo}</b><span className="text-xs text-muted-foreground">{plural(tp.total, "tarefa", "tarefas")} · {progresso(tp)}</span></div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={evidLote[chave] || ""} onChange={(e) => setEvidLote((m) => ({ ...m, [chave]: e.target.value }))} placeholder="Evidência do lote (documento no SAP, foto, link)" aria-label={`Evidência do lote: ${TIPOS_TAREFA[tp.tipo].titulo} em ${g.grupo}`} className="border rounded px-2 py-1 text-xs bg-background w-72" />
              <Botao disabled={!evid} title={evid ? undefined : "Informe a evidência para registrar"} onClick={() => onLote(doTipo.map((t) => t.id), "adm", evid)}>Administrativo: marcar como feito</Botao>
              {comAlm && <Botao disabled={!evid} title={evid ? undefined : "Informe a evidência para registrar"} onClick={() => onLote(doTipo.filter((t) => t.aplica.alm).map((t) => t.id), "alm", evid)}>Almoxarifado: marcar como feito</Botao>}
            </div>
            <TabelaPadrao id="saneamento-execucao-tarefas" ariaLabel={`Tarefas: ${TIPOS_TAREFA[tp.tipo].titulo} em ${g.grupo}`} linhas={doTipo} chaveLinha={(t) => t.id} tamanhoInicial={50} vazio="Nenhuma tarefa." colunas={[
              { chave: "codigo", rotulo: "Código", valor: (t) => t.codigo || "—" },
              { chave: "descricao", rotulo: "Descrição", valor: (t) => t.descricao || "—" },
              { chave: "fazer", rotulo: "O que fazer", quebrar: true, valor: (t) => t.instrucao.adm, render: (t) => <span className="text-muted-foreground">{t.instrucao.adm}</span> },
              ...colunasFrente("adm", registros, onStatus, onNota),
              ...(comAlm ? colunasFrente("alm", registros, onStatus, onNota) : []),
              { chave: "situacao", rotulo: "Situação", valor: (t) => ROT_GERAL[situacaoTarefa(t, registros[t.id]).geral], render: (t) => { const s = situacaoTarefa(t, registros[t.id]).geral; return <Chip tom={TOM_GERAL[s] || "n"}>{ROT_GERAL[s]}</Chip>; } },
            ]} />
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
  const [evidLote, setEvidLote] = useState({});
  const [msg, setMsg] = useState("");
  const [gerando, setGerando] = useState("");
  const registros = estado.execucao?.registros || {};
  const cfg = tiposEfetivos(estado.execucao?.tipos);
  const alternar = (k) => setAberto((a) => ({ ...a, [k]: !a[k] }));
  const tarefasPorTipo = useMemo(() => { const m = new Map(); for (const t of tarefas) { const k = `${t.grupo}|${t.tipo}`; const l = m.get(k); if (l) l.push(t); else m.set(k, [t]); } return m; }, [tarefas]);
  const nLista = useMemo(() => ({ adm: linhasListaFrente("adm", tarefas, registros).length, alm: linhasListaFrente("alm", tarefas, registros).length }), [tarefas, registros]);

  // Atualizações funcionais: duas ações seguidas nunca sobrescrevem uma à outra.
  const editarExec = (fn) => setEstado((e) => { const ex = e.execucao || {}; return { ...e, execucao: fn({ ...ex, tipos: { ...(ex.tipos || {}) }, registros: { ...(ex.registros || {}) } }) }; });
  const setTipo = (tipo, patch) => editarExec((ex) => ({ ...ex, tipos: { ...ex.tipos, [tipo]: { ...(ex.tipos[tipo] || {}), ...patch } } }));
  // A confirmação vale só para a alteração aprovada hoje (a decisão pode ter sido descartada e outra aprovada para o mesmo item): o registro guarda a alteração, e o que foi
  // confirmado para outra não é herdado.
  const tarefaPorId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);
  const editarReg = (id, frente, patch) => editarExec((ex) => {
    const alt = tarefaPorId.get(id)?.alteracao; const atual = ex.registros[id] || {}; const ant = atual[frente];
    const base = ant && alt && ant.alteracao && ant.alteracao !== alt ? {} : ant || {};
    return { ...ex, registros: { ...ex.registros, [id]: { ...atual, [frente]: { ...base, ...patch, ...(alt ? { alteracao: alt } : {}) } } } };
  });
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
      const t = tarefaPorId.get(id); const atual = regs[id] || {}; const ant = registroEfetivo(t, atual)?.[frente];
      if (situacaoFrente(true, ant) === "FEITO") continue; // já confirmada com evidência
      regs[id] = { ...atual, [frente]: { ...(ant || {}), status: "FEITO", evidencia, por: quem, em: hojeIso(), lote: true, ...(t?.alteracao ? { alteracao: t.alteracao } : {}) } };
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
      setMsg(`Resposta importada: ${plural(x.feitas, "confirmada", "confirmadas")}${x.semEvidencia ? ` (${fmt(x.semEvidencia)} sem evidência: continuam pendentes)` : ""}, ${fmt(x.divergencias)} com divergência, ${fmt(x.semResposta)} sem resposta${x.naoAplicaveis ? `, ${plural(x.naoAplicaveis, "linha de frente que não se aplica", "linhas de frente que não se aplicam")}` : ""}${x.naoEncontradas.length ? `, ${plural(x.naoEncontradas.length, "tarefa não encontrada", "tarefas não encontradas")}` : ""}${x.desatualizadas.length ? `, ${plural(x.desatualizadas.length, "linha desatualizada", "linhas desatualizadas")} (a alteração aprovada mudou depois de a lista ser emitida: não aplicada; emita a lista de novo)` : ""}.`);
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
        <TabelaPadrao id="saneamento-execucao-tipos" ariaLabel="Tipos de tarefa e frentes aplicáveis" simples ordemInicial={null} linhas={ORDEM_TIPOS} chaveLinha={(t) => t} colunas={[
          { chave: "tipo", rotulo: "Tipo", valor: (t) => TIPOS_TAREFA[t].titulo, render: (t) => <span className="font-medium">{TIPOS_TAREFA[t].titulo}</span> },
          { chave: "geradas", rotulo: "Geradas", tipo: "numero", alinhar: "direita", valor: (t) => geradasPorTipo[t] || 0 },
          { chave: "entra", rotulo: "Entra na execução", alinhar: "centro", valor: (t) => (cfg[t].incluir ? "Sim" : "Não"), render: (t) => <input type="checkbox" aria-label={`Incluir na execução: ${TIPOS_TAREFA[t].titulo}`} checked={cfg[t].incluir} onChange={(e) => setTipo(t, { incluir: e.target.checked })} /> },
          { chave: "alm", rotulo: "Almoxarifado participa", alinhar: "centro", valor: (t) => (TIPOS_TAREFA[t].comoAlm ? (cfg[t].alm ? "Sim" : "Não") : "sem etapa física"), render: (t) => (TIPOS_TAREFA[t].comoAlm ? <input type="checkbox" aria-label={`Almoxarifado participa: ${TIPOS_TAREFA[t].titulo}`} checked={cfg[t].alm} disabled={!cfg[t].incluir} onChange={(e) => setTipo(t, { alm: e.target.checked })} /> : <span className="text-muted-foreground">sem etapa física</span>) },
          { chave: "comoAdm", rotulo: "Administrativo: o que se faz", quebrar: true, valor: (t) => TIPOS_TAREFA[t].comoAdm, render: (t) => <span className="text-muted-foreground">{TIPOS_TAREFA[t].comoAdm}</span> },
          { chave: "comoAlm", rotulo: "Almoxarifado: o que se faz", quebrar: true, valor: (t) => TIPOS_TAREFA[t].comoAlm || "", render: (t) => <span className="text-muted-foreground">{TIPOS_TAREFA[t].comoAlm || "—"}</span> },
        ]} />
      </Acc>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-sm font-medium">Listas para as equipes</span>
        <Botao disabled={!!gerando || nLista.adm === 0} onClick={() => emitir("adm")}>{gerando === "adm" ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Emitir lista do administrativo ({fmt(nLista.adm)})</Botao>
        <Botao disabled={!!gerando || nLista.alm === 0} onClick={() => emitir("alm")}>{gerando === "alm" ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Emitir lista do almoxarifado ({fmt(nLista.alm)})</Botao>
        <label className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted cursor-pointer">Importar resposta<input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={importar} /></label>
        {msg && <span className="text-xs text-muted-foreground" role="status">{msg}</span>}
        <span className="basis-full text-xs text-muted-foreground">Cada equipe responde FEITO ou DIVERGÊNCIA, com a evidência (documento no SAP, foto, link); o almoxarifado informa também os endereços e a quantidade realocada. A lista só traz o que ainda falta confirmar.</span>
      </div>

      {tarefas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma tarefa ainda: elas nascem das decisões e das inativações aprovadas no passo De/para (o corte por data sozinho não gera tarefa).</p> : resumo.grupos.map((g) => (
        <Acc key={g.grupo} aberto={!!aberto["g" + g.grupo]} onToggle={() => alternar("g" + g.grupo)}
          titulo={<><b className="font-medium">{g.grupo}</b>{g.CONCLUIDA === g.total ? <Chip tom="g">Concluído</Chip> : <Chip tom="a">Em execução</Chip>}{g.DIVERGENCIA > 0 && <Chip tom="a">{plural(g.DIVERGENCIA, "divergência", "divergências")}</Chip>}<span className="text-xs text-muted-foreground">{plural(g.total, "tarefa", "tarefas")} · {progresso(g)}</span></>}>
          <Lote g={g} tarefasPorTipo={tarefasPorTipo} registros={registros} evidLote={evidLote} setEvidLote={setEvidLote} onStatus={mudarStatus} onNota={escreverNota} onLote={registrarLote} />
        </Acc>))}
    </div>
  );
}
