import React, { useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import ConfirmarExclusao from "@/components/ConfirmarExclusao";
import LimparDadosButton from "@/components/LimparDadosButton";
import ProjetoSaneamento from "@/components/saneamento/ProjetoSaneamento";
import TituloPagina from "@/components/TituloPagina";

/** Saneamento de estoques completo, passo a passo: um projeto por empresa, salvo automaticamente. */
export default function FerramentasSaneamento() {
  const { empresa } = useOutletContext() || {};
  const { id: grupoId, empresaId } = useParams();
  const [params, setParams] = useSearchParams();
  const projetoId = params.get("projeto");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [alvo, setAlvo] = useState(null); // projeto que a pessoa quer excluir
  const [apagarBase, setApagarBase] = useState(true);
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["saneamentos", empresaId], queryFn: () => api.get(`/produtos/saneamentos?empresa_id=${empresaId}`) });
  const criar = useMutation({
    mutationFn: () => api.post("/produtos/saneamentos", { empresa_id: empresaId, nome }),
    onSuccess: (p) => { setNome(""); setErro(""); qc.invalidateQueries({ queryKey: ["saneamentos", empresaId] }); setParams({ projeto: p.id }); },
    onError: (e) => setErro(e.message),
  });
  // Exclui o projeto e, se a pessoa quiser, a base importada nele (senão a base reaparece na lista como "Validação de cadastro").
  const excluirProjeto = async () => {
    const r = await api.delete(`/produtos/saneamentos/${alvo.id}?empresa_id=${empresaId}&apagar_base=${apagarBase && !!alvo.validacao_id}`);
    for (const chave of [["saneamentos", empresaId], ["validacoes-cadastro", empresaId], ["saneamento-bases", empresaId], ["saneamento-base"]]) qc.invalidateQueries({ queryKey: chave });
    toast({ title: "Projeto excluído", description: r?.aviso });
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <TituloPagina icon={ClipboardList}>Saneamento de estoques</TituloPagina>
        <p className="text-sm text-muted-foreground">Passo a passo: triagem da base, checagens por grupo, decisões e, ao final, relatório e política de uso.</p>
      </div>
      {projetoId ? (
        <ProjetoSaneamento key={projetoId} empresa={empresa} empresaId={empresaId} projetoId={projetoId} onVoltar={() => setParams({})} />
      ) : (
        <div className="space-y-4">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) criar.mutate(); }}>
            <label className="text-sm flex-1 min-w-[220px]">Novo projeto
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Saneamento de estoques 2026" className="mt-1 w-full border rounded-md p-2 bg-background" />
            </label>
            <button type="submit" disabled={!nome.trim() || criar.isPending} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">Criar projeto</button>
          </form>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="font-medium">Projetos desta empresa</h2>
              {(lista.data || []).length > 0 && (
                <LimparDadosButton
                  tela="saneamento" grupoId={grupoId} empresaId={empresaId} rotulo="Limpar projetos"
                  oQueApaga="Apaga todos os projetos de saneamento desta empresa e as bases importadas neles (arquivos incluídos). Outras análises da empresa ficam."
                />)}
            </div>
            {lista.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : lista.error ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar os projetos.</p> : (lista.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum projeto ainda. Crie o primeiro acima.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {lista.data.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div><button type="button" onClick={() => setParams({ projeto: p.id })} className="font-medium text-primary underline-offset-2 hover:underline">{p.nome}</button>
                      <p className="text-xs text-muted-foreground">Atualizado em {new Date(p.updatedAt).toLocaleString("pt-BR")} · {p.criado_por}</p></div>
                    <button type="button" aria-label={`Excluir projeto ${p.nome}`} title="Excluir" onClick={() => { setApagarBase(true); setAlvo(p); }} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </li>))}
              </ul>)}
          </section>
        </div>
      )}
      <ConfirmarExclusao aberto={!!alvo} titulo="Excluir o projeto de saneamento?" onFechar={() => setAlvo(null)} onConfirmar={excluirProjeto}>
        <p><b className="text-foreground">{alvo?.nome}</b></p>
        {alvo?.validacao_id && (
          <label className="flex items-start gap-2 text-foreground">
            <input type="checkbox" className="mt-1" checked={apagarBase} onChange={(e) => setApagarBase(e.target.checked)} />
            <span>Apagar também a base importada neste projeto (arquivo e análise). Se não marcar, a base continua na lista de análises como “Validação de cadastro”.</span>
          </label>)}
        <p className="font-medium text-destructive">Esta ação não pode ser desfeita.</p>
      </ConfirmarExclusao>
    </div>
  );
}
