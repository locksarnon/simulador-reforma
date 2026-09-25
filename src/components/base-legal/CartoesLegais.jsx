import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ChevronDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

/** Um cartão: pergunta, resposta e a base legal com link para o artigo. */
export function CartaoResposta({ c, admin, onMudou, onEditar, aberto = false }) {
  const [ocupado, setOcupado] = useState("");
  const agir = async (acao) => {
    if (acao === "excluir" && !window.confirm("Excluir este cartão?")) return;
    setOcupado(acao);
    try {
      if (acao === "excluir") await api.delete(`/base-legal/cartoes/${c.id}`);
      else await api.post(`/base-legal/cartoes/${c.id}/${acao}`, {});
      toast({ title: acao === "revisar" ? "Cartão revisado e publicado" : acao === "despublicar" ? "Cartão voltou para rascunho" : "Cartão excluído" });
      onMudou?.();
    } catch (e) { toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" }); }
    finally { setOcupado(""); }
  };

  return (
    <details open={aberto} className="group rounded-lg border border-border bg-card">
      <summary className="cursor-pointer list-none p-3 flex items-start gap-2">
        <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 transition-transform group-open:rotate-180 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">{c.pergunta}</span>
        {admin && <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded shrink-0 ${c.status === "revisado" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"}`}>{c.status === "revisado" ? "Revisado" : "Rascunho"}</span>}
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap mt-3">{c.resposta}</p>
        {c.ressalvas && <p className="text-sm rounded-lg bg-muted/60 p-3"><b>Atenção:</b> {c.ressalvas}</p>}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base legal</p>
          <ul className="space-y-2">
            {c.fundamentos.map((f, i) => (
              <li key={i} className="rounded-lg border border-border p-2.5">
                <Link to={`/base-legal/${f.norma}/${f.caminho}`} className="text-sm font-medium text-primary hover:underline">{f.numero} — {f.rotulo}</Link>
                {f.trecho && <p className="text-sm text-muted-foreground mt-1 border-l-2 border-border pl-3 italic">“{f.trecho}”</p>}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            {c.status === "revisado" ? <><BadgeCheck className="w-3.5 h-3.5 text-emerald-600" /> Revisado{admin && c.revisado_por ? ` por ${c.revisado_por}` : ""} em {fmt(c.revisado_em)}</> : "Ainda não revisado — só o administrador vê este cartão."}
          </p>
          {admin && (
            <div className="flex flex-wrap gap-2">
              {c.status === "revisado"
                ? <button type="button" disabled={Boolean(ocupado)} onClick={() => agir("despublicar")} className="px-2.5 py-1 rounded-md border border-border text-xs hover:bg-muted">Voltar para rascunho</button>
                : <button type="button" disabled={Boolean(ocupado)} onClick={() => agir("revisar")} className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs inline-flex items-center gap-1">{ocupado === "revisar" && <Loader2 className="w-3 h-3 animate-spin" />} Revisar e publicar</button>}
              <button type="button" onClick={() => onEditar(c)} className="px-2.5 py-1 rounded-md border border-border text-xs hover:bg-muted inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Editar</button>
              <button type="button" disabled={Boolean(ocupado)} onClick={() => agir("excluir")} className="px-2.5 py-1 rounded-md border border-border text-xs hover:bg-muted text-red-600 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Excluir</button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

const paraTexto = (fs = []) => fs.map((f) => `${f.norma}/${f.caminho} :: ${f.trecho || ""}`).join("\n");
const deTexto = (t) => t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
  const [ref, ...resto] = l.split("::");
  const [norma, caminho] = ref.trim().split("/");
  return { norma, caminho, trecho: resto.join("::").trim() };
});

function Editor({ inicial, onFechar, onSalvo }) {
  const [f, setF] = useState({ tema: inicial?.tema || "", pergunta: inicial?.pergunta || "", sinonimos: inicial?.sinonimos || "", resposta: inicial?.resposta || "", ressalvas: inicial?.ressalvas || "", fundamentos: paraTexto(inicial?.fundamentos) });
  const [salvando, setSalvando] = useState(false);
  const campo = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  const salvar = async () => {
    setSalvando(true);
    try {
      const corpo = { ...f, fundamentos: deTexto(f.fundamentos) };
      if (inicial?.id) await api.put(`/base-legal/cartoes/${inicial.id}`, corpo); else await api.post("/base-legal/cartoes", corpo);
      toast({ title: "Cartão salvo como rascunho", description: "Depois de conferir, use Revisar e publicar." });
      onSalvo();
    } catch (e) { toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }); }
    finally { setSalvando(false); }
  };
  return (
    <div className="rounded-xl border border-primary/40 bg-card p-4 space-y-3">
      <p className="text-sm font-medium">{inicial?.id ? "Editar cartão" : "Novo cartão"}</p>
      <div className="grid sm:grid-cols-[200px_1fr] gap-3">
        <label className="text-xs">Tema<input className={campo} value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })} placeholder="Ex.: Produtor rural" /></label>
        <label className="text-xs">Pergunta<input className={campo} value={f.pergunta} onChange={(e) => setF({ ...f, pergunta: e.target.value })} /></label>
      </div>
      <label className="text-xs block">Outras formas de perguntar (palavras-chave, separadas por espaço)<input className={campo} value={f.sinonimos} onChange={(e) => setF({ ...f, sinonimos: e.target.value })} /></label>
      <label className="text-xs block">Resposta<textarea rows={4} className={campo} value={f.resposta} onChange={(e) => setF({ ...f, resposta: e.target.value })} /></label>
      <label className="text-xs block">Atenção (opcional)<textarea rows={2} className={campo} value={f.ressalvas} onChange={(e) => setF({ ...f, ressalvas: e.target.value })} /></label>
      <label className="text-xs block">Base legal — uma por linha: <code>norma/artigo :: trecho copiado da lei</code> (ex.: <code>lcp-214-2025/art-164 :: receita inferior a R$ 3.600.000,00</code>). O trecho é conferido contra o texto da lei.<textarea rows={4} className={`${campo} font-mono text-xs`} value={f.fundamentos} onChange={(e) => setF({ ...f, fundamentos: e.target.value })} /></label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onFechar} className="px-3 py-1.5 rounded-md border border-border text-sm">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-1.5">{salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar rascunho</button>
      </div>
    </div>
  );
}

/** Perguntas frequentes com resposta e base legal, agrupadas por tema. Consultores veem só os revisados. */
export default function CartoesLegais({ admin }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(null); // null | "novo" | cartão
  const [carregando, setCarregando] = useState(false);
  const { data: cartoes = [], isLoading } = useQuery({ queryKey: ["base-legal-cartoes"], queryFn: () => api.get("/base-legal/cartoes") });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["base-legal-cartoes"] });

  const carregarLote = async () => {
    setCarregando(true);
    try {
      const r = await api.post("/base-legal/cartoes/semear", {});
      toast({ title: `${r.criados} cartão(ões) criado(s) como rascunho`, description: r.erros?.length ? `${r.erros.length} com problema no trecho.` : "Cada trecho foi conferido contra o texto da lei." });
      recarregar();
    } catch (e) { toast({ title: "Não foi possível carregar", description: e.message, variant: "destructive" }); }
    finally { setCarregando(false); }
  };

  const porTema = cartoes.reduce((m, c) => { (m[c.tema] ||= []).push(c); return m; }, {});
  const pendentes = cartoes.filter((c) => c.status !== "revisado").length;

  if (!admin && !isLoading && cartoes.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2"><BadgeCheck className="w-4 h-4" /> Perguntas frequentes revisadas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Respostas conferidas pela equipe, sempre com o artigo. {admin && pendentes > 0 && <b>{pendentes} aguardando revisão.</b>}</p>
        </div>
        {admin && (
          <div className="flex gap-2">
            {cartoes.length === 0 && <button type="button" onClick={carregarLote} disabled={carregando} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted inline-flex items-center gap-1.5">{carregando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Carregar lote inicial</button>}
            <button type="button" onClick={() => setEditando("novo")} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo cartão</button>
          </div>
        )}
      </div>
      {editando && <Editor inicial={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); recarregar(); }} />}
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
        <div className="space-y-4">
          {Object.entries(porTema).map(([tema, itens]) => (
            <div key={tema} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tema}</p>
              {itens.map((c) => <CartaoResposta key={c.id} c={c} admin={admin} onMudou={recarregar} onEditar={setEditando} />)}
            </div>
          ))}
          {cartoes.length === 0 && admin && <p className="text-sm text-muted-foreground">Nenhum cartão ainda. Carregue o lote inicial (rascunhos com a base legal já conferida) e revise um a um.</p>}
        </div>
      )}
    </section>
  );
}
