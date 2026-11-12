import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EscolhaDeEmpresas from "@/components/diagnostico/EscolhaDeEmpresas";
import { nomeSugerido } from "@/lib/projetos";
import { rotuloDoGrupo } from "@/lib/clientes";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Diagnósticos > Novo diagnóstico: o escopo (empresa, parte de um grupo ou o grupo todo), o nome, o objetivo e o prazo. */
export default function NovoDiagnosticoDialog({ aberto, aoFechar, empresas, grupos, inicial = [] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ids, setIds] = useState(inicial);
  const [grupo, setGrupo] = useState(null);
  const [nome, setNome] = useState("");
  const [nomeTocado, setNomeTocado] = useState(false);
  const [escopo, setEscopo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => { if (aberto) { setIds(inicial); setGrupo(null); setNome(""); setNomeTocado(false); setEscopo(""); setPrazo(""); setResponsavel(""); setErro(""); } }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const primeira = empresas.find((e) => e.id === ids[0]);
  const alvo = grupo && ids.every((id) => empresas.find((e) => e.id === id)?.grupo === grupo.numero) ? rotuloDoGrupo(grupo) : ids.length === 1 ? primeira?.razao_social : ids.length > 1 ? `${primeira?.razao_social} e mais ${ids.length - 1}` : "";
  const nomeFinal = nomeTocado ? nome : nomeSugerido(alvo);
  const grupoDoEscopo = grupo && ids.some((id) => empresas.find((e) => e.id === id)?.grupo === grupo.numero) ? grupo.numero : (ids.length ? empresas.find((e) => e.id === ids[0])?.grupo : null);

  const criar = useMutation({
    mutationFn: () => api.post("/projetos-diagnostico", { nome: nomeFinal, empresa_ids: ids, grupo_numero: grupoDoEscopo || null, escopo: escopo || null, prazo: prazo || null, responsavel: responsavel || null }),
    onSuccess: (p) => {
      ["projetos-diagnostico", "servicos-contratados"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Diagnóstico criado", description: p.nome });
      aoFechar();
      navigate(`/diagnostico/projetos/${p.id}`);
    },
    onError: (e) => setErro(e.message || "Não foi possível criar."),
  });

  const enviar = (ev) => {
    ev.preventDefault();
    if (!ids.length) { setErro("Escolha pelo menos uma empresa."); return; }
    if (!nomeFinal.trim()) { setErro("Dê um nome ao diagnóstico."); return; }
    criar.mutate();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo diagnóstico</DialogTitle>
          <DialogDescription>Uma empresa, parte de um grupo ou o grupo inteiro.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-3 text-sm" noValidate>
          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">Empresas do diagnóstico</span>
            <EscolhaDeEmpresas empresas={empresas} grupos={grupos} valor={ids} aoMudar={setIds} aoEscolherGrupo={setGrupo} />
          </div>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome</span><input className={campo} value={nomeFinal} onChange={(e) => { setNome(e.target.value); setNomeTocado(true); }} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Objetivo e escopo</span><textarea className={`${campo} min-h-[72px]`} value={escopo} onChange={(e) => setEscopo(e.target.value)} placeholder="Ex.: crédito presumido do estoque, saneamento do cadastro e simulação da Reforma para 2027" /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Prazo de entrega</span><input type="date" className={campo} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span><input className={campo} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} /></label>
          </div>
          {erro && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{erro}</p>}
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={criar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{criar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Criar diagnóstico</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
