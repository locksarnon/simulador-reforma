import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, ArrowLeft } from "lucide-react";
import { api } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ValidadorCadastro from "@/components/ferramentas/ValidadorCadastro";
import ComparativoDuplicidade from "@/components/ferramentas/ComparativoDuplicidade";
import { CRITERIOS, achadosDoCriterio, agruparPorGrupo, aplicarEscopo, criarTestes, criterioAprovado, grupoPodeSanear, hojeIso } from "./logica";

const PASSOS = [
  { t: "Triagem", programa: "Fixar data-base, origem e universo; definir o parâmetro de saneamento (quais itens entram no trabalho); mapear campos e grupos.", avancar: "Universo conferido, parâmetro de saneamento definido e limitações conhecidas." },
  { t: "Critérios", programa: "Cada problema de cadastro tem sua regra, exemplo e aprovação. Nada é tratado antes de o critério correspondente estar aprovado.", avancar: "Critérios aplicáveis aprovados e exceções identificadas." },
  { t: "Piloto SAP", programa: "Comprovar no ambiente do cliente os quatro casos: unificar, separar, preservar referências e descontinuar com dependências.", avancar: "Procedimento evidenciado e aceito pelo cliente e seu suporte SAP." },
  { t: "Análises", programa: "Grupo a grupo, trata-se um critério aprovado por vez. O grupo fica saneado quando todos os critérios aprovados foram tratados.", avancar: "Grupo com todos os critérios tratados e propostas encaminhadas." },
  { t: "De/para", programa: "As propostas encaminhadas viram decisões rastreáveis. Ausência de resposta não é aprovação.", avancar: "Decisão expressa por caso (ou em bloco, se optar), com aprovador e data." },
  { t: "Execução", programa: "Decisões aprovadas viram tarefas para o administrativo e o almoxarifado; só conta como feito quando as duas pontas confirmam.", avancar: "Confirmação das frentes aplicáveis, com evidências e divergências.", proxima: true },
  { t: "Conferência", programa: "Conciliar o executado com as evidências e medir volumes; casos sem prova permanecem pendentes.", avancar: "Resultados conciliados.", proxima: true },
  { t: "Fiscal", programa: "Cada grupo saneado e conferido é liberado para a revisão fiscal: NCM, CST IBS/CBS e cClassTrib por operação (produtos) e NBS/LC 116 (serviços).", avancar: "Matriz do grupo com proposta, fundamento, validação e pendências.", proxima: true },
  { t: "Política", programa: "Procedimentos para criar, comprar, usar, padronizar e descontinuar itens, a partir dos critérios aprovados e das causas encontradas.", avancar: "Política aprovada, com responsáveis e controles registrados.", proxima: true },
];
const CASOS_PILOTO = ["Unificar duplicados", "Separar cadastro que mistura produtos", "Preservar referências após renumeração de catálogo", "Descontinuar código com dependências (cartilhas)"];
const STATUS_PILOTO = ["Não iniciado", "Em teste", "Testado", "Reprovado"];

const estadoInicial = () => ({ passo: 0, params: { ateOn: false, ate: "", diasOn: false, dias: 540, dataBase: hojeIso() }, criterios: {}, tratados: {}, saneados: {}, decisoes: {}, piloto: {}, bloco: false });
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const dataBr = (d) => (d ? d.split("-").reverse().join("/") : "—");
const Chip = ({ children, tom = "n" }) => {
  const c = { g: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", a: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", b: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300", n: "bg-muted text-muted-foreground" }[tom];
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${c}`}>{children}</span>;
};
function Acc({ aberto, onToggle, titulo, children }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={aberto} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
        {aberto ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <span className="flex flex-wrap items-center gap-2 min-w-0">{titulo}</span>
      </button>
      {aberto && <div className="border-t border-border p-3">{children}</div>}
    </div>
  );
}
const Botao = ({ className = "", ...p }) => <button type="button" {...p} className={`px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-50 ${className}`} />;

export default function ProjetoSaneamento({ empresa, empresaId, projetoId, onVoltar }) {
  const { user } = useAuth();
  const quem = user?.email || "usuário";
  const [estado, setEstado] = useState(null);
  const [nome, setNome] = useState("");
  const [validacaoId, setValidacaoId] = useState(null);
  const [aberto, setAberto] = useState({});
  const [critAtivo, setCritAtivo] = useState(CRITERIOS[0].id);
  const [comparativo, setComparativo] = useState(null);
  const [salvo, setSalvo] = useState(null);
  const carregado = useRef(false);
  const alternar = (k) => setAberto((a) => ({ ...a, [k]: !a[k] }));

  const proj = useQuery({ queryKey: ["saneamento", projetoId], queryFn: () => api.get(`/produtos/saneamentos/${projetoId}?empresa_id=${empresaId}`) });
  useEffect(() => {
    if (!proj.data || carregado.current) return;
    carregado.current = true;
    setNome(proj.data.nome); setValidacaoId(proj.data.validacao_id || null);
    setEstado({ ...estadoInicial(), ...(proj.data.estado || {}) });
  }, [proj.data]);

  // Autosave: cada ajuste é salvo sozinho.
  useEffect(() => {
    if (!carregado.current || !estado) return;
    const t = setTimeout(() => {
      api.put(`/produtos/saneamentos/${projetoId}`, { estado, validacao_id: validacaoId, empresa_id: empresaId }).then(() => setSalvo(new Date())).catch(() => setSalvo(null));
    }, 800);
    return () => clearTimeout(t);
  }, [estado, validacaoId, projetoId, empresaId]);

  const base = useQuery({ queryKey: ["saneamento-base", validacaoId], enabled: !!validacaoId, queryFn: () => api.get(`/produtos/validacoes/${validacaoId}?empresa_id=${empresaId}`), staleTime: 5 * 60 * 1000 });
  const itens = useMemo(() => base.data?.itens || [], [base.data]);
  const escopo = useMemo(() => aplicarEscopo(itens, estado?.params), [itens, estado?.params]);
  const grupos = useMemo(() => agruparPorGrupo(escopo.emEscopo), [escopo]);
  const testes = useMemo(() => criarTestes(escopo.emEscopo), [escopo]);

  if (proj.isLoading || !estado) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o projeto…</p>;
  if (proj.error) return <p role="alert" className="text-sm text-destructive">Não foi possível abrir o projeto: {proj.error.message}</p>;

  const mudar = (patch) => setEstado((e) => ({ ...e, ...patch }));
  const passo = estado.passo;
  const irPara = (i) => mudar({ passo: Math.max(0, Math.min(PASSOS.length - 1, i)) });
  const params = estado.params;
  const setParam = (k, v) => mudar({ params: { ...params, [k]: v } });
  const aprovados = CRITERIOS.filter((c) => criterioAprovado(estado, c.id));
  const decisoesLista = Object.entries(estado.decisoes).map(([k, d]) => ({ k, ...d }));
  const itemPorLinha = (linha) => itens.find((i) => i.linha === linha);

  // ── Passo 1: Triagem ──
  const triagem = !validacaoId ? (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-border p-4 text-sm">
        <p className="font-medium">Importe a base de itens</p>
        <p className="text-muted-foreground mt-1">Envie a exportação do ERP e confirme as colunas. Para o parâmetro de saneamento e a análise por grupo, mapeie também a <b>data da última movimentação</b> e o <b>grupo de produto</b>. Ao processar, a base fica vinculada a este projeto.</p>
      </div>
      <ValidadorCadastro modo="interno" empresa={empresa} aoProcessar={(r) => setValidacaoId(r.validacao_id)} />
    </div>
  ) : base.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando a base…</p> : base.error ? <p role="alert" className="text-sm text-destructive">Não foi possível abrir a base: {base.error.message}</p> : (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-primary/40 bg-card p-4 space-y-3">
        <h3 className="font-medium">Parâmetro de saneamento</h3>
        <p className="text-xs text-muted-foreground">Define quem entra no trabalho. Os dois cortes são opcionais e independentes; o item sai do escopo se atender a qualquer um dos marcados. Item sem data de movimentação legível continua no escopo, sinalizado.</p>
        <label className="flex flex-wrap items-center gap-2 text-sm"><input type="checkbox" checked={params.ateOn} onChange={(e) => setParam("ateOn", e.target.checked)} /> Desconsiderar itens movimentados até
          <input type="date" value={params.ate} onChange={(e) => mudar({ params: { ...params, ate: e.target.value, ateOn: !!e.target.value } })} className="border rounded p-1.5 bg-background" aria-label="Data de corte" /></label>
        <label className="flex flex-wrap items-center gap-2 text-sm"><input type="checkbox" checked={params.diasOn} onChange={(e) => setParam("diasOn", e.target.checked)} /> Desconsiderar itens sem movimento há mais de
          <input type="number" min="1" value={params.dias} onChange={(e) => mudar({ params: { ...params, dias: Number(e.target.value), diasOn: Number(e.target.value) > 0 } })} className="border rounded p-1.5 bg-background w-24" aria-label="Dias sem movimento" /> dias, contados da data-base
          <input type="date" value={params.dataBase} onChange={(e) => setParam("dataBase", e.target.value)} className="border rounded p-1.5 bg-background" aria-label="Data-base" /></label>
        {itens.length > 0 && !itens.some((i) => i.ultima_mov) && <p className="text-xs text-amber-700 dark:text-amber-300">Nenhuma data de movimentação foi lida. Mapeie a coluna de data na importação (use “Ajustar e refazer”) para o corte funcionar.</p>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[["Universo", escopo.resumo.total], ["Fora do escopo", escopo.resumo.fora], ["Em escopo", escopo.resumo.emEscopo], ["Sem data legível", escopo.resumo.semData]].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-medium tabular-nums">{fmt(v)}</p></div>))}
      </div>
      {(params.ateOn || params.diasOn) && <p className="text-xs text-muted-foreground">Fora do escopo: {fmt(escopo.resumo.porAte)} pelo corte por data, {fmt(escopo.resumo.porDias)} pelo corte por dias parados, {fmt(escopo.resumo.ambos)} pelos dois.</p>}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">Mapa por grupo de itens (em escopo)</h3>
        {grupos.map((g) => (
          <Acc key={g.nome} aberto={!!aberto["m" + g.nome]} onToggle={() => alternar("m" + g.nome)} titulo={<><b className="font-medium">{g.nome}</b><span className="text-xs text-muted-foreground">{fmt(g.itens.length)} itens</span></>}>
            <TabelaItens itens={g.itens} colunas={["linha", "codigo", "descricao", "unidade", "ultima_mov"]} />
          </Acc>))}
        {escopo.fora.length > 0 && (
          <Acc aberto={!!aberto.fora} onToggle={() => alternar("fora")} titulo={<><b className="font-medium">Fora do escopo</b><span className="text-xs text-muted-foreground">{fmt(escopo.fora.length)} itens, com o motivo do corte</span></>}>
            <TabelaItens itens={escopo.fora.map((f) => ({ ...f.item, _motivo: f.motivos.map((m) => (m === "ate" ? "Movimento até o corte" : "Parado há mais dias que o limite")).join(" e ") }))} colunas={["linha", "codigo", "descricao", "ultima_mov", "_motivo"]} />
          </Acc>)}
      </div>
      <Botao onClick={() => { if (window.confirm("Trocar a base vinculada? Os critérios aprovados são mantidos, mas as decisões por item podem deixar de corresponder.")) setValidacaoId(null); }}>Trocar a base</Botao>
    </div>
  );

  // ── Passo 2: Critérios ──
  const crit = CRITERIOS.find((c) => c.id === critAtivo);
  const cEst = estado.criterios[crit.id] || {};
  const setCrit = (patch) => mudar({ criterios: { ...estado.criterios, [crit.id]: { ...cEst, ...patch } } });
  const criterios = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {CRITERIOS.map((c) => <button key={c.id} type="button" onClick={() => setCritAtivo(c.id)} className={`px-2.5 py-1 text-xs rounded-md border ${c.id === critAtivo ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>{c.titulo}{criterioAprovado(estado, c.id) ? " ✓" : ""}</button>)}
      </div>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{crit.titulo}</h3><div className="flex gap-2">{crit.auto ? <Chip tom="b">Teste automático</Chip> : <Chip>Conferência manual</Chip>}{cEst.aprovado ? <Chip tom="g">Aprovado por {cEst.por} em {dataBr(cEst.em)}</Chip> : <Chip tom="a">Pendente de aprovação</Chip>}</div></div>
        <div><label className="text-xs text-muted-foreground" htmlFor="regra">Regra (editável)</label>
          <textarea id="regra" className="w-full border rounded-md p-2 text-sm bg-background min-h-[84px]" value={cEst.regra ?? crit.regra} onChange={(e) => setCrit({ regra: e.target.value, aprovado: false })} /></div>
        <p className="text-xs text-muted-foreground">Exemplo: {crit.exemplo}.{crit.params && <> Parâmetro: {crit.params}.</>}</p>
        {crit.auto && validacaoId && <p className="text-xs text-muted-foreground">Na base atual: <b>{fmt(achadosDoCriterio(crit, escopo.emEscopo, testes).length)}</b> itens em escopo com achado neste critério.</p>}
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => setCrit(cEst.aprovado ? { aprovado: false } : { aprovado: true, por: quem, em: hojeIso(), regra: cEst.regra ?? crit.regra })}>{cEst.aprovado ? "Reabrir critério" : "Aprovar critério"}</Botao>
        </div>
        <p className="text-xs text-muted-foreground">Editar a regra reabre a aprovação. A análise só trata critérios aprovados.</p>
      </div>
    </div>
  );

  // ── Passo 3: Piloto SAP ──
  const piloto = (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-xs text-muted-foreground">Registro dos testes no ambiente do cliente. Nenhuma capacidade é tratada como confirmada sem teste registrado.</p>
      {CASOS_PILOTO.map((nomeCaso) => { const p = estado.piloto[nomeCaso] || {}; const set = (patch) => mudar({ piloto: { ...estado.piloto, [nomeCaso]: { ...p, ...patch } } });
        return (<div key={nomeCaso} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className="font-medium text-sm">{nomeCaso}</b>
            <select value={p.status || "Não iniciado"} onChange={(e) => set({ status: e.target.value })} className="border rounded p-1 text-sm bg-background" aria-label={`Situação: ${nomeCaso}`}>{STATUS_PILOTO.map((s) => <option key={s}>{s}</option>)}</select></div>
          <input value={p.evidencia || ""} onChange={(e) => set({ evidencia: e.target.value })} placeholder="Evidência (descrição, referência do arquivo ou link)" className="w-full border rounded p-1.5 text-sm bg-background" />
          <input value={p.limitacao || ""} onChange={(e) => set({ limitacao: e.target.value })} placeholder="Limitações e condições de aplicação" className="w-full border rounded p-1.5 text-sm bg-background" />
        </div>); })}
    </div>
  );

  // ── Passo 4: Análises ──
  const alternarDecisao = (it, c, grupo) => {
    const k = `${it.linha}|${c.id}`; const d = { ...estado.decisoes };
    if (d[k]) { if (d[k].status === "PROP") delete d[k]; } else d[k] = { acao: "ENC", status: "PROP", grupo, por: quem, em: hojeIso() };
    mudar({ decisoes: d });
  };
  const analises = !validacaoId ? <p className="text-sm text-muted-foreground">Importe a base no passo Triagem para analisar.</p> : (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground"><b className="text-foreground">{grupos.filter((g) => estado.saneados[g.nome]).length} de {grupos.length}</b> grupos saneados · critérios aprovados disponíveis: {aprovados.length} de {CRITERIOS.length}</p>
      {aprovados.length === 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Aprove ao menos um critério no passo Critérios para tratá-lo aqui.</p>}
      {grupos.map((g) => {
        const san = !!estado.saneados[g.nome];
        return (
          <Acc key={g.nome} aberto={!!aberto["g" + g.nome]} onToggle={() => alternar("g" + g.nome)} titulo={<><b className="font-medium">{g.nome}</b>{san ? <Chip tom="g">Saneado</Chip> : <Chip tom="a">Pendente</Chip>}<span className="text-xs text-muted-foreground">{fmt(g.itens.length)} {g.itens.length === 1 ? "item" : "itens"} em escopo</span></>}>
            <div className="space-y-2">
              {aprovados.map((c) => {
                const k = `${g.nome}|${c.id}`; const tratado = !!estado.tratados[k]; const chave = "a" + k;
                const ach = aberto[chave] ? achadosDoCriterio(c, g.itens, testes) : null;
                const n = ach ? ach.length : c.auto ? achadosDoCriterio(c, g.itens, testes).length : null;
                return (
                  <Acc key={c.id} aberto={!!aberto[chave]} onToggle={() => alternar(chave)} titulo={<>{c.titulo}{tratado ? <Chip tom="g">Tratado</Chip> : <Chip tom="a">A tratar</Chip>}<span className="text-xs text-muted-foreground">{c.auto ? `${fmt(n)} achados` : "conferência manual"}</span></>}>
                    {!c.auto ? <p className="text-sm text-muted-foreground">Este critério ainda não tem teste automático: confira os itens do grupo e marque como tratado.</p> : (ach || []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum achado neste grupo para este critério.</p> : (
                      <div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><th className="p-1.5">Linha</th><th className="p-1.5">Código</th><th className="p-1.5">Descrição</th><th className="p-1.5">Achado</th><th className="p-1.5">Encaminhar</th></tr></thead>
                        <tbody>{ach.slice(0, 100).map(({ item: it, motivo }) => (
                          <tr key={it.linha} className="border-t border-border align-top"><td className="p-1.5 tabular-nums">{it.linha}</td><td className="p-1.5">{it.codigo || "—"}</td><td className="p-1.5 max-w-[260px]">{it.descricao || "—"}</td>
                            <td className="p-1.5 max-w-[320px]">{motivo}{c.id === "duplicidade" && it.duplicidade && <button type="button" className="ml-2 text-primary underline" onClick={() => setComparativo(it)}>Comparar</button>}</td>
                            <td className="p-1.5"><input type="checkbox" aria-label={`Encaminhar linha ${it.linha}`} checked={!!estado.decisoes[`${it.linha}|${c.id}`]} disabled={estado.decisoes[`${it.linha}|${c.id}`] && estado.decisoes[`${it.linha}|${c.id}`].status !== "PROP"} onChange={() => alternarDecisao(it, c, g.nome)} /></td></tr>))}</tbody></table>
                        {ach.length > 100 && <p className="text-xs text-muted-foreground p-2">Mostrando 100 de {fmt(ach.length)}.</p>}</div>)}
                    <div className="mt-2"><Botao onClick={() => mudar({ tratados: { ...estado.tratados, [k]: !tratado }, saneados: tratado ? { ...estado.saneados, [g.nome]: false } : estado.saneados })}>{tratado ? "Reabrir critério no grupo" : "Marcar como tratado"}</Botao></div>
                  </Acc>);
              })}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Botao disabled={!san && !grupoPodeSanear(estado, g.nome)} onClick={() => mudar({ saneados: { ...estado.saneados, [g.nome]: !san } })}>{san ? "Reabrir grupo" : "Marcar grupo como saneado"}</Botao>
                <span className="text-xs text-muted-foreground">Só encerra com todos os critérios aprovados tratados.</span>
              </div>
            </div>
          </Acc>);
      })}
    </div>
  );

  // ── Passo 5: De/para (decisões) ──
  const decidir = (ks, status) => { const d = { ...estado.decisoes }; ks.forEach((k) => { if (d[k] && d[k].status === "PROP") d[k] = { ...d[k], status, decididoPor: quem, decididoEm: hojeIso() }; }); mudar({ decisoes: d }); };
  const porGrupoDec = [...new Set(decisoesLista.map((d) => d.grupo))];
  const depara = (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={estado.bloco} onChange={(e) => mudar({ bloco: e.target.checked })} /> Aprovar em bloco (opcional)</label>
      <p className="text-xs text-muted-foreground">Cada caso continua registrado individualmente, com aprovador e data. Resumo: {fmt(decisoesLista.filter((d) => d.status === "PROP").length)} propostos · {fmt(decisoesLista.filter((d) => d.status === "APR").length)} aprovados · {fmt(decisoesLista.filter((d) => d.status === "REJ").length)} rejeitados.</p>
      {decisoesLista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum caso encaminhado. Marque “Encaminhar” nos achados do passo Análises.</p>}
      {porGrupoDec.map((gn) => { const lista = decisoesLista.filter((d) => d.grupo === gn); const pend = lista.filter((d) => d.status === "PROP");
        return (<Acc key={gn} aberto={!!aberto["d" + gn]} onToggle={() => alternar("d" + gn)} titulo={<><b className="font-medium">{gn}</b><span className="text-xs text-muted-foreground">{fmt(lista.length)} casos · {fmt(pend.length)} aguardando decisão</span></>}>
          {estado.bloco && pend.length > 0 && <div className="flex flex-wrap gap-2 mb-2"><Botao onClick={() => decidir(pend.map((d) => d.k), "APR")}>Aprovar os {fmt(pend.length)} pendentes</Botao><Botao onClick={() => decidir(pend.map((d) => d.k), "REJ")}>Rejeitar os pendentes</Botao></div>}
          <div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><th className="p-1.5">Caso</th><th className="p-1.5">Critério</th><th className="p-1.5">Descrição</th><th className="p-1.5">Situação</th><th className="p-1.5"></th></tr></thead>
            <tbody>{lista.slice(0, 200).map((d) => { const [linha, cid] = d.k.split("|"); const it = itemPorLinha(Number(linha));
              return (<tr key={d.k} className="border-t border-border"><td className="p-1.5 tabular-nums">L{linha}</td><td className="p-1.5">{CRITERIOS.find((c) => c.id === cid)?.titulo}</td><td className="p-1.5 max-w-[280px]">{it?.descricao || "—"}</td>
                <td className="p-1.5">{d.status === "APR" ? <Chip tom="g">Aprovado por {d.decididoPor} em {dataBr(d.decididoEm)}</Chip> : d.status === "REJ" ? <Chip>Rejeitado</Chip> : <Chip tom="a">Aguardando</Chip>}</td>
                <td className="p-1.5 whitespace-nowrap">{!estado.bloco && d.status === "PROP" && <><Botao className="mr-1" onClick={() => decidir([d.k], "APR")}>Aprovar</Botao><Botao onClick={() => decidir([d.k], "REJ")}>Rejeitar</Botao></>}</td></tr>); })}</tbody></table>
            {lista.length > 200 && <p className="text-xs text-muted-foreground p-2">Mostrando 200 de {fmt(lista.length)}.</p>}</div>
        </Acc>); })}
    </div>
  );

  const proxima = (
    <div className="rounded-xl border border-dashed border-border p-4 text-sm space-y-1">
      <p className="font-medium">Disponível na próxima fase</p>
      <p className="text-muted-foreground">{PASSOS[passo].programa}</p>
      {passo === 7 && <p className="text-muted-foreground">A revisão fiscal usará as leituras que o InTAX já tem: NCM → cClassTrib pelos anexos da LC 214 (produtos) e LC 116 ↔ NBS ↔ cIndOp ↔ cClassTrib (serviços).</p>}
      <p className="text-muted-foreground">Até lá, o andamento dos passos anteriores fica salvo e você pode voltar quando quiser.</p>
    </div>
  );

  const corpo = [triagem, criterios, piloto, analises, depara][passo] ?? proxima;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
        <div className="flex items-center gap-2"><button type="button" onClick={onVoltar} className="text-muted-foreground hover:text-foreground" aria-label="Voltar à lista de projetos"><ArrowLeft className="w-4 h-4" /></button><b className="font-medium">{nome}</b></div>
        <span className="text-xs text-muted-foreground">{salvo ? `Salvo às ${salvo.toLocaleTimeString("pt-BR")}` : "Salvamento automático"}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-9 gap-1" role="tablist" aria-label="Passos do saneamento">
        {PASSOS.map((p, i) => <button key={p.t} type="button" role="tab" aria-selected={i === passo} onClick={() => irPara(i)} className={`px-1 py-1.5 rounded-md border text-center text-[11px] leading-tight ${i === passo ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}><b className="block text-sm font-medium">{i + 1}</b>{p.t}</button>)}
      </div>
      <p className="text-xs rounded-lg bg-muted/60 px-3 py-2 text-muted-foreground"><b className="font-medium text-foreground">Programa de trabalho:</b> {PASSOS[passo].programa}</p>
      {corpo}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground"><b className="font-medium text-foreground">Para avançar:</b> {PASSOS[passo].avancar}</span>
        <div className="flex gap-2">{passo > 0 && <Botao onClick={() => irPara(passo - 1)}>Voltar</Botao>}{passo < PASSOS.length - 1 && <Botao onClick={() => irPara(passo + 1)}>Concluir e seguir</Botao>}</div>
      </div>
      <ComparativoDuplicidade item={comparativo} itens={itens} excluir={[]} setExcluir={() => {}} podeExcluir={false} onFechar={() => setComparativo(null)} />
    </div>
  );
}

function TabelaItens({ itens, colunas }) {
  const [n, setN] = useState(50);
  const rot = { linha: "Linha", codigo: "Código", descricao: "Descrição", unidade: "Unidade", ultima_mov: "Última mov.", _motivo: "Motivo" };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground">{colunas.map((c) => <th key={c} className="p-1.5">{rot[c]}</th>)}</tr></thead>
        <tbody>{itens.slice(0, n).map((i) => <tr key={i.linha} className="border-t border-border">{colunas.map((c) => <td key={c} className={`p-1.5 ${c === "descricao" ? "max-w-[320px]" : ""}`}>{c === "ultima_mov" ? dataBr(i[c]) : (i[c] ?? "") || "—"}</td>)}</tr>)}</tbody></table>
      {itens.length > n && <button type="button" onClick={() => setN(n + 200)} className="text-xs text-primary underline p-2">Mostrar mais ({fmt(itens.length - n)} restantes)</button>}
    </div>
  );
}
