import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Loader2, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { criteriosVazios } from "@/lib/tags";
import { botaoBarraCls, campoBarraCls } from "@/lib/estiloTabela";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function DialogoSalvar({ nomeInicial, aoSalvar, aoFechar, salvando }) {
  const [nome, setNome] = useState(nomeInicial);
  const [compartilhar, setCompartilhar] = useState(false);
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Salvar esta lista</DialogTitle>
          <DialogDescription>Guarda os filtros da tela.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (nome.trim()) aoSalvar({ nome: nome.trim(), compartilhado: compartilhar }); }} className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome da lista</span>
            <input className={`${campo} w-full`} value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Agro do BPO sem responsável" autoFocus /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={compartilhar} onChange={(e) => setCompartilhar(e.target.checked)} /> Compartilhar com a equipe</label>
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="botao-acao rounded-md px-3 py-[5px] hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={!nome.trim() || salvando} className="botao-acao inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1 font-medium text-primary-foreground disabled:opacity-60">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Listas salvas: reabre com um clique um conjunto de filtros (da pessoa ou compartilhado pela equipe) e salva o que está na tela.
 * `criterios` é o estado atual dos filtros da página; `aoAplicar(criterios)` devolve os critérios de uma lista escolhida.
 * Compacta, para a barra única da lista: sem rótulo em cima, o sentido fica dentro da caixa ("Lista salva: escolha…").
 */
export default function ListasSalvas({ escopo = "empresas", criterios, aoAplicar }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { data: listas = [] } = useQuery({ queryKey: ["filtros-salvos", escopo], queryFn: () => api.get("/filtros-salvos", { escopo }) });
  const [escolhida, setEscolhida] = useState("");
  const [abrir, setAbrir] = useState(false);
  const atual = listas.find((l) => l.id === escolhida);
  const podeApagar = atual && (atual.meu || user?.role === "admin");

  const salvar = useMutation({
    mutationFn: (dados) => api.post("/filtros-salvos", { ...dados, escopo, criterios }),
    onSuccess: (r) => {
      toast({ title: r.substituida ? "Lista atualizada" : "Lista salva", description: r.nome });
      setAbrir(false);
      setEscolhida(r.id);
      qc.invalidateQueries({ queryKey: ["filtros-salvos", escopo] });
    },
    onError: (e) => toast({ title: "Não foi possível salvar a lista", description: e.message, variant: "destructive" }),
  });
  const apagar = useMutation({
    mutationFn: (id) => api.delete(`/filtros-salvos/${id}`),
    onSuccess: () => { toast({ title: "Lista apagada" }); setEscolhida(""); qc.invalidateQueries({ queryKey: ["filtros-salvos", escopo] }); },
    onError: (e) => toast({ title: "Não foi possível apagar", description: e.message, variant: "destructive" }),
  });

  const escolher = (id) => {
    setEscolhida(id);
    const l = listas.find((x) => x.id === id);
    if (l) aoAplicar(l.criterios);
  };
  const confirmarApagar = async () => {
    if (await confirmar({ titulo: `Apagar a lista "${atual.nome}"?`, descricao: atual.compartilhado ? "Ela é compartilhada: some para toda a equipe." : "Só a lista é apagada; as empresas continuam como estão.", rotulo: "Apagar" })) apagar.mutate(atual.id);
  };

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <select className={`${campoBarraCls} max-w-[13rem]`} value={escolhida} onChange={(e) => escolher(e.target.value)} aria-label="Listas salvas">
        <option value="">{listas.length ? "Lista salva: escolha…" : "Lista salva: nenhuma"}</option>
        {listas.map((l) => <option key={l.id} value={l.id}>{l.nome}{!l.meu ? ` · ${l.criado_por || "equipe"}` : l.compartilhado ? " · equipe" : ""}</option>)}
      </select>
      <button type="button" onClick={() => setAbrir(true)} disabled={criteriosVazios(criterios)} title={criteriosVazios(criterios) ? "Use algum filtro antes de salvar" : "Salvar os filtros atuais"}
        className={`${botaoBarraCls} disabled:opacity-50`}><Bookmark className="h-3.5 w-3.5" aria-hidden="true" /> Salvar lista</button>
      {podeApagar && <button type="button" onClick={confirmarApagar} className="inline-flex h-8 items-center rounded-md px-2 text-destructive hover:bg-destructive/10" aria-label={`Apagar a lista ${atual.nome}`} title="Apagar a lista"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
      {abrir && <DialogoSalvar nomeInicial={atual?.meu ? atual.nome : ""} salvando={salvar.isPending} aoSalvar={(d) => salvar.mutate(d)} aoFechar={() => setAbrir(false)} />}
    </div>
  );
}
