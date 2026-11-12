import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import { diaEHora } from "@/lib/agenda";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Converte a data e a hora digitadas (horário de Brasília) no instante ISO. */
export function instanteDeBrasilia(dia, hora) {
  return new Date(`${dia}T${hora || "00:00"}:00-03:00`).toISOString();
}

/** "14:00" → "15:00" (até 23:59). */
export function maisUmaHora(h) {
  const [hh, mm] = String(h || "00:00").split(":").map(Number);
  return hh >= 23 ? "23:59" : `${String(hh + 1).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}`;
}

/** O que impede salvar o período do evento (o fim antes do início), em palavras; null se está certo. */
export function problemaDoPeriodo(f) {
  if (f.dia_inteiro) return f.dia_fim && f.dia_fim < f.dia ? "A data final é antes da inicial." : null;
  if (!f.hora_fim) return null;
  const fimDia = f.dia_fim || f.dia;
  return `${fimDia}T${f.hora_fim}` <= `${f.dia}T${f.hora}` ? "O fim precisa ser depois do início." : null;
}

/** Novo evento (no dia escolhido) ou edição de um existente. */
export default function DialogoEvento({ evento, diaInicial, tipos, empresas, colaboradores, usuario, empresaInicial, aoFechar }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const editando = !!evento;
  const ini = evento ? diaEHora(evento) : { dia: diaInicial, hora: "09:00" };
  const fim = evento?.fim ? diaEHora({ ...evento, inicio: evento.fim }) : { dia: ini.dia, hora: evento ? null : "10:00" };
  const [f, setF] = useState({
    titulo: evento?.titulo || "", dia_inteiro: evento?.dia_inteiro ?? false, dia: ini.dia, hora: ini.hora || "09:00", dia_fim: fim.dia, hora_fim: fim.hora || "",
    tipo_id: evento?.tipo_id || "", empresa_id: evento?.empresa_id || empresaInicial || "", responsavel: evento?.responsavel || "", local: evento?.local || "", descricao: evento?.descricao || "",
  });
  const mudar = (k, v) => setF((e) => {
    const n = { ...e, [k]: v };
    // O fim acompanha o início: se ficaria antes (ou vazio), passa a ser uma hora depois; a data final idem.
    if (k === "hora" && (!e.hora_fim || e.hora_fim <= v)) n.hora_fim = maisUmaHora(v);
    if (k === "dia" && (!e.dia_fim || e.dia_fim < v)) n.dia_fim = v;
    return n;
  });
  const problema = problemaDoPeriodo(f);
  const corpo = () => ({
    titulo: f.titulo, dia_inteiro: f.dia_inteiro, descricao: f.descricao || null, local: f.local || null, tipo_id: f.tipo_id || null, empresa_id: f.empresa_id || null, responsavel: f.responsavel || null,
    inicio: f.dia_inteiro ? f.dia : instanteDeBrasilia(f.dia, f.hora),
    fim: f.dia_inteiro ? (f.dia_fim && f.dia_fim !== f.dia ? f.dia_fim : null) : (f.hora_fim ? instanteDeBrasilia(f.dia_fim || f.dia, f.hora_fim) : null),
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["agenda"] });
  const salvar = useMutation({
    mutationFn: () => (editando ? api.put(`/agenda-geral/eventos/${evento.id}`, corpo()) : api.post("/agenda-geral/eventos", corpo())),
    onSuccess: () => { toast({ title: editando ? "Evento salvo" : "Evento criado" }); recarregar(); aoFechar(); },
    onError: (e) => toast({ title: "Não foi possível salvar o evento", description: e.message, variant: "destructive" }),
  });
  const excluir = useMutation({
    mutationFn: () => api.delete(`/agenda-geral/eventos/${evento.id}`),
    onSuccess: () => { toast({ title: "Evento excluído" }); recarregar(); aoFechar(); },
    onError: (e) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }),
  });
  const podeExcluir = editando && (evento.criado_por === usuario?.id || usuario?.role === "admin");

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>Horário de Brasília.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (f.titulo.trim() && !problema) salvar.mutate(); }} className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Título</span>
            <input className={campo} value={f.titulo} maxLength={200} onChange={(e) => mudar("titulo", e.target.value)} autoFocus required /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.dia_inteiro} onChange={(e) => mudar("dia_inteiro", e.target.checked)} /> Dia inteiro</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">{f.dia_inteiro ? "De" : "Dia"}</span><input type="date" className={campo} value={f.dia} onChange={(e) => mudar("dia", e.target.value)} required /></label>
            {f.dia_inteiro
              ? <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Até (opcional)</span><input type="date" className={campo} value={f.dia_fim} min={f.dia} onChange={(e) => mudar("dia_fim", e.target.value)} /></label>
              : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Início</span><input type="time" className={campo} value={f.hora} onChange={(e) => mudar("hora", e.target.value)} required /></label>
                  <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Fim</span><input type="time" className={campo} value={f.hora_fim} onChange={(e) => mudar("hora_fim", e.target.value)} /></label>
                </div>
              )}
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Tipo</span>
              <select className={campo} value={f.tipo_id} onChange={(e) => mudar("tipo_id", e.target.value)}><option value="">Sem tipo</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span>
              <select className={campo} value={f.responsavel} onChange={(e) => mudar("responsavel", e.target.value)}><option value="">Ninguém em especial</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}</select></label>
          </div>
          <SeletorDeEmpresa empresas={empresas} valor={f.empresa_id} aoMudar={(v) => mudar("empresa_id", v)} />
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Local (opcional)</span><input className={campo} value={f.local} maxLength={200} onChange={(e) => mudar("local", e.target.value)} placeholder="Sala, endereço ou link da reunião" /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Descrição (opcional)</span><textarea className={`${campo} min-h-[64px]`} value={f.descricao} maxLength={2000} onChange={(e) => mudar("descricao", e.target.value)} /></label>
          {problema && <p role="alert" className="text-xs text-destructive">{problema}</p>}
          <DialogFooter className="gap-2">
            {podeExcluir && (
              <button type="button" onClick={async () => { if (await confirmar({ titulo: "Excluir este evento?", descricao: f.titulo, rotulo: "Excluir" })) excluir.mutate(); }} className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Excluir</button>
            )}
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={!f.titulo.trim() || !!problema || salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
              {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
