import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, Send, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { ROTULO_ANTECEDENCIA } from "@/lib/agendaReforma";

const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * Lembretes por e-mail da agenda: cada pessoa escolhe as antecedências e se quer todas as empresas ou só uma.
 * Só as datas confirmadas em fonte oficial geram aviso; o servidor manda o e-mail às 7h, uma vez por data e antecedência.
 * `empresa` é a empresa em foco na tela (aba da empresa ou filtro), quando houver.
 */
export default function LembretesAgenda({ empresa = null }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["agenda-lembretes"], queryFn: () => api.get("/agenda-reforma/lembretes") });
  const [escopo, setEscopo] = useState(empresa ? empresa.id : "todas");
  const [dias, setDias] = useState(null);
  const [ocupado, setOcupado] = useState("");

  const permitidos = data?.dias_permitidos ?? [60, 30, 15, 7, 3, 1, 0];
  const escopoValido = escopo === "todas" || (empresa && escopo === empresa.id) ? escopo : "todas";
  // Quem já tem lembrete para este escopo vê as antecedências que escolheu, não o padrão.
  const existente = data?.lembretes?.find((l) => l.escopo === escopoValido);
  const escolhidos = dias ?? existente?.dias_antes ?? data?.dias_padrao ?? [30, 7, 1];
  const alternar = (n) => setDias((escolhidos.includes(n) ? escolhidos.filter((x) => x !== n) : [...escolhidos, n]).sort((a, b) => b - a));
  const recarregar = () => qc.invalidateQueries({ queryKey: ["agenda-lembretes"] });

  const executar = async (nome, fn, sucesso) => {
    setOcupado(nome);
    try { const r = await fn(); toast(typeof sucesso === "function" ? sucesso(r) : { title: sucesso }); recarregar(); }
    catch (e) { toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" }); }
    finally { setOcupado(""); }
  };

  const salvar = () => executar("salvar", () => api.put("/agenda-reforma/lembretes", { escopo: escopoValido, dias_antes: escolhidos, ativo: true }), "Lembrete salvo");
  const testar = () => executar("teste", () => api.post("/agenda-reforma/lembretes/teste", { escopo: escopoValido }), (r) => ({ title: "E-mail de teste enviado", description: `${r.datas} data(s) dos próximos 60 dias.` }));
  const alternarAtivo = (l) => executar(`ativo-${l.id}`, () => api.put("/agenda-reforma/lembretes", { escopo: l.escopo, dias_antes: l.dias_antes, ativo: !l.ativo }), l.ativo ? "Lembrete pausado" : "Lembrete reativado");
  const remover = (l) => executar(`remover-${l.id}`, () => api.delete(`/agenda-reforma/lembretes/${l.id}`), "Lembrete removido");

  return (
    <section aria-label="Lembretes por e-mail" className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-medium flex items-center gap-2"><BellRing className="w-4 h-4" /> Lembretes por e-mail</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Você recebe um e-mail às 7h quando faltam os dias escolhidos para uma data confirmada em fonte oficial (para um prazo, conta o último dia). Cada aviso sai uma vez só.</p>
      </div>
      {data && !data.email_configurado && <p role="status" className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 p-2">O envio de e-mail ainda não está configurado no servidor: os lembretes ficam salvos, mas nenhuma mensagem sai até a configuração.</p>}

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
        <>
          {data?.lembretes?.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.lembretes.map((l) => (
                <li key={l.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className={l.ativo ? "" : "opacity-60"}>
                    <p className="font-medium">{l.escopo === "todas" ? "Todas as empresas" : l.empresa || "Empresa removida"}{!l.ativo && <span className="ml-2 text-[10px] uppercase text-muted-foreground">pausado</span>}</p>
                    <p className="text-xs text-muted-foreground">{l.dias_antes.map(ROTULO_ANTECEDENCIA).join(", ")}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => alternarAtivo(l)} disabled={Boolean(ocupado)} className="px-2.5 py-1 rounded-md border border-border text-xs hover:bg-muted disabled:opacity-50">{l.ativo ? "Pausar" : "Reativar"}</button>
                    <button type="button" onClick={() => remover(l)} disabled={Boolean(ocupado)} aria-label="Remover lembrete" className="px-2 py-1 rounded-md border border-border text-xs text-red-600 hover:bg-muted disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-3">
            {empresa && (
              <label className="text-xs">Avisar sobre
                <select className={`${campo} block mt-1`} value={escopoValido} onChange={(e) => { setEscopo(e.target.value); setDias(null); }}>
                  <option value="todas">Todas as empresas</option>
                  <option value={empresa.id}>{empresa.razao_social}</option>
                </select>
              </label>
            )}
            <fieldset className="text-xs">
              <legend className="mb-1">Avisar</legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {permitidos.map((n) => (
                  <label key={n} className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={escolhidos.includes(n)} onChange={() => alternar(n)} /> {ROTULO_ANTECEDENCIA(n)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={salvar} disabled={Boolean(ocupado) || !escolhidos.length} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
              {ocupado === "salvar" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar lembrete
            </button>
            <button type="button" onClick={testar} disabled={Boolean(ocupado)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">
              {ocupado === "teste" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar e-mail de teste para mim
            </button>
          </div>
        </>
      )}
    </section>
  );
}
