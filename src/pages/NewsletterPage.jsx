import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Loader2, Send, CheckCheck, Save, FlaskConical, AlertTriangle } from "lucide-react";
import { api, base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";

const COR = {
  Rascunho: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  Aprovada: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  Enviando: "bg-blue-100 text-blue-800",
  Enviada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
};

/**
 * Newsletter: o Radar gera o rascunho toda segunda; uma pessoa revisa,
 * aprova e dispara. Nada é enviado sem aprovação (o Radar é gerado por IA).
 */
export default function NewsletterPage() {
  const qc = useQueryClient();
  const { data: edicoes = [] } = useQuery({ queryKey: ["nlEdicoes"], queryFn: () => base44.entities.NewsletterEdicao.filter({}, "-createdAt", 30) });
  const { data: resumo } = useQuery({ queryKey: ["nlResumo"], queryFn: () => api.get("/newsletter/resumo") });
  const [selId, setSelId] = useState(null);
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [emailTeste, setEmailTeste] = useState("");

  const ed = edicoes.find((e) => e.id === selId) || null;
  useEffect(() => { if (!selId && edicoes[0]) setSelId(edicoes[0].id); }, [edicoes, selId]);
  useEffect(() => { if (ed) { setAssunto(ed.assunto); setCorpo(ed.corpo_html); } }, [ed?.id, ed?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const recarregar = () => { qc.invalidateQueries({ queryKey: ["nlEdicoes"] }); qc.invalidateQueries({ queryKey: ["nlResumo"] }); };
  const acao = async (nome, fn, msgOk) => {
    setOcupado(nome);
    try { const r = await fn(); if (msgOk) toast({ title: msgOk }); recarregar(); return r; } catch (e) { toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" }); } finally { setOcupado(""); }
    return null;
  };

  const editavel = ed && (ed.status === "Rascunho" || ed.status === "Aprovada");
  const alterado = ed && (assunto !== ed.assunto || corpo !== ed.corpo_html);

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Newsletter" }]} />
      <div className="p-6 lg:p-8 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2"><Mail className="w-5 h-5 text-muted-foreground" /><h1 className="text-xl font-heading font-semibold">Newsletter</h1></div>
            <p className="text-sm text-muted-foreground">Radar de novidades por e-mail: o rascunho nasce do Radar toda segunda, você revisa, aprova e envia.</p>
          </div>
          <button onClick={() => acao("rascunho", async () => { const n = await api.post("/newsletter/rascunho"); setSelId(n.id); }, "Rascunho pronto")} disabled={ocupado === "rascunho"} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">
            {ocupado === "rascunho" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Gerar rascunho do Radar
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Inscritos ativos</p><p className="text-2xl font-semibold tabular-nums">{resumo?.inscritos_ativos ?? "—"}</p></div>
          <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Total de inscritos</p><p className="text-2xl font-semibold tabular-nums">{resumo?.inscritos_total ?? "—"}</p></div>
          <div className="rounded-lg border border-border bg-card p-3 col-span-2 lg:col-span-1"><p className="text-xs text-muted-foreground">Envio de e-mail</p><p className={`text-sm font-medium mt-1 ${resumo?.email_configurado ? "text-emerald-600" : "text-amber-600"}`}>{resumo ? (resumo.email_configurado ? "Configurado" : "Não configurado") : "—"}</p></div>
        </div>
        {resumo && !resumo.email_configurado && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-sm"><AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" /><span>O servidor ainda não tem o e-mail configurado (SMTP). Você pode preparar e aprovar edições, mas o envio só funciona depois da configuração.</span></div>
        )}

        <div className="grid lg:grid-cols-[260px_1fr] gap-4">
          <div className="space-y-2">
            {edicoes.map((e) => (
              <button key={e.id} onClick={() => setSelId(e.id)} className={`w-full text-left rounded-lg border p-3 text-sm ${e.id === selId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/30"}`}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{e.semana_referencia || "—"}</span><span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${COR[e.status] || ""}`}>{e.status}</span></div>
                <p className="mt-1 line-clamp-2">{e.assunto}</p>
                {e.status === "Enviada" && <p className="text-[11px] text-muted-foreground mt-1">{e.destinatarios} enviados{e.falhas ? ` · ${e.falhas} falhas` : ""}</p>}
              </button>
            ))}
            {edicoes.length === 0 && <p className="text-sm text-muted-foreground p-3 border border-dashed border-border rounded-lg">Nenhuma edição ainda. Gere o Radar de Novidades e depois o rascunho.</p>}
          </div>

          {ed && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium">Assunto</label>
                <input value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={!editavel} className="w-full h-10 mt-1 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60" />
              </div>
              <div>
                <p className="text-xs font-medium mb-1">Prévia do e-mail</p>
                <div className="rounded-lg border border-border bg-white text-[#1c2b24] p-5 max-h-[420px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: corpo }} />
              </div>
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Editar conteúdo (HTML)</summary>
                <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} disabled={!editavel} rows={10} className="w-full mt-2 rounded-md border border-input bg-background p-2 font-mono text-xs disabled:opacity-60" />
              </details>

              <div className="flex flex-wrap items-center gap-2">
                {editavel && <button onClick={() => acao("salvar", () => api.put(`/newsletter/edicoes/${ed.id}`, { assunto, corpo_html: corpo }), "Edição salva (volta para rascunho)")} disabled={!alterado || !!ocupado} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"><Save className="w-4 h-4" /> Salvar</button>}
                <input value={emailTeste} onChange={(e) => setEmailTeste(e.target.value)} placeholder="e-mail para teste (vazio = o seu)" className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm" />
                <button onClick={() => acao("teste", () => api.post(`/newsletter/edicoes/${ed.id}/teste`, { para: emailTeste }), "Teste enviado")} disabled={!!ocupado} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"><FlaskConical className="w-4 h-4" /> Enviar teste</button>
                {ed.status === "Rascunho" && <button onClick={() => acao("aprovar", () => api.post(`/newsletter/edicoes/${ed.id}/aprovar`), "Edição aprovada")} disabled={alterado || !!ocupado} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"><CheckCheck className="w-4 h-4" /> Aprovar</button>}
                {ed.status === "Aprovada" && <button onClick={() => { if (window.confirm(`Enviar para ${resumo?.inscritos_ativos ?? 0} inscritos? Esta ação não pode ser desfeita.`)) acao("enviar", () => api.post(`/newsletter/edicoes/${ed.id}/enviar`), "Envio concluído"); }} disabled={!!ocupado} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">{ocupado === "enviar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar para {resumo?.inscritos_ativos ?? 0} inscritos</button>}
              </div>
              {ed.aprovada_por && <p className="text-xs text-muted-foreground">Aprovada por {ed.aprovada_por}{ed.aprovada_em ? ` em ${new Date(ed.aprovada_em).toLocaleString("pt-BR")}` : ""}.</p>}
              {alterado && <p className="text-xs text-amber-600">Há alterações não salvas — salve antes de aprovar.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
