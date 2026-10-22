import React, { useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Trash2 } from "lucide-react";
import { api } from "@/api/base44Client";
import ProjetoSaneamento from "@/components/saneamento/ProjetoSaneamento";
import TituloPagina from "@/components/TituloPagina";

/** Saneamento de estoques completo, passo a passo: um projeto por empresa, salvo automaticamente. */
export default function FerramentasSaneamento() {
  const { empresa } = useOutletContext() || {};
  const { empresaId } = useParams();
  const [params, setParams] = useSearchParams();
  const projetoId = params.get("projeto");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["saneamentos", empresaId], queryFn: () => api.get(`/produtos/saneamentos?empresa_id=${empresaId}`) });
  const criar = useMutation({
    mutationFn: () => api.post("/produtos/saneamentos", { empresa_id: empresaId, nome }),
    onSuccess: (p) => { setNome(""); setErro(""); qc.invalidateQueries({ queryKey: ["saneamentos", empresaId] }); setParams({ projeto: p.id }); },
    onError: (e) => setErro(e.message),
  });
  const excluir = useMutation({
    mutationFn: (id) => api.delete(`/produtos/saneamentos/${id}?empresa_id=${empresaId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saneamentos", empresaId] }),
    onError: (e) => setErro(e.message),
  });

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <TituloPagina icon={ClipboardList}>Saneamento de estoques</TituloPagina>
        <p className="text-sm text-muted-foreground">Passo a passo: triagem da base, critérios aprovados, análise por grupo, decisões e, ao final, relatório e política de uso.</p>
      </div>
      {projetoId ? (
        <ProjetoSaneamento empresa={empresa} empresaId={empresaId} projetoId={projetoId} onVoltar={() => setParams({})} />
      ) : (
        <div className="space-y-4 max-w-3xl">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) criar.mutate(); }}>
            <label className="text-sm flex-1 min-w-[220px]">Novo projeto
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Saneamento de estoques 2026" className="mt-1 w-full border rounded-md p-2 bg-background" />
            </label>
            <button type="submit" disabled={!nome.trim() || criar.isPending} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">Criar projeto</button>
          </form>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <section>
            <h2 className="font-medium mb-2">Projetos desta empresa</h2>
            {lista.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : lista.error ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar os projetos.</p> : (lista.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum projeto ainda. Crie o primeiro acima.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {lista.data.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div><button type="button" onClick={() => setParams({ projeto: p.id })} className="font-medium text-primary underline-offset-2 hover:underline">{p.nome}</button>
                      <p className="text-xs text-muted-foreground">Atualizado em {new Date(p.updatedAt).toLocaleString("pt-BR")} · {p.criado_por}</p></div>
                    <button type="button" aria-label={`Excluir projeto ${p.nome}`} onClick={() => { if (window.confirm(`Excluir o projeto "${p.nome}"? A base importada continua no histórico do Validador.`)) excluir.mutate(p.id); }} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </li>))}
              </ul>)}
          </section>
        </div>
      )}
    </div>
  );
}
