import React, { useState } from "react";
import ConhecimentoEmpresa from "@/components/ConhecimentoEmpresa";
import ConfirmarExclusao from "@/components/ConfirmarExclusao";
import LimparDadosButton from "@/components/LimparDadosButton";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, History, LayoutGrid, Trash2 } from "lucide-react";
import { api } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import TituloPagina from "@/components/TituloPagina";

const SERVICOS = [
  ["importacao-xml", "Diagnóstico tributário", "Importe XML, revise as operações e consulte o painel."],
  ["validador-cadastro", "Validação de cadastro", "Conferência rápida de uma planilha: NCM, cClassTrib e duplicidades."],
  ["saneamento-estoque", "Saneamento de estoques", "Projeto completo, passo a passo, até a política de uso."],
  ["classificacao-servicos", "Classificação de serviços", "Correlação entre LC 116, NBS, cIndOp e cClassTrib."],
  ["validador-nfse", "Validação de NFS-e", "Confira os documentos de serviço desta empresa."],
];

export default function EmpresaServicos({ historico = false }) {
  const { empresa } = useOutletContext();
  const { id, empresaId } = useParams();
  const qc = useQueryClient();
  const base = "/workroom/" + id + "/empresas/" + empresaId;
  const { data: analises = [], isLoading, isError } = useQuery({ queryKey: ["analises-empresa", empresaId], queryFn: () => api.get("/empresas/" + empresaId + "/analises") });
  const { data: validacoes = [], isError: erroValidacoes } = useQuery({ queryKey: ["validacoes-cadastro", empresaId], queryFn: () => api.get("/produtos/validacoes", { empresa_id: empresaId }) });
  const { data: projetos = [], isError: erroProjetos } = useQuery({ queryKey: ["saneamentos", empresaId], queryFn: () => api.get("/produtos/saneamentos?empresa_id=" + empresaId) });
  const [alvo, setAlvo] = useState(null); // item da lista que a pessoa quer excluir
  const [apagarBase, setApagarBase] = useState(true);

  // Uma base importada num projeto de saneamento aparece só como o projeto, não duas vezes.
  const emProjeto = new Set(projetos.map((p) => p.validacao_id).filter(Boolean));
  const lista = [
    ...analises.map((a) => ({ ...a, tipo: "analise", to: base + "/" + a.servico + "?analise=" + a.id })),
    ...validacoes.filter((v) => !emProjeto.has(v.id)).map((v) => ({ ...v, tipo: "validacao", titulo: v.nome_arquivo, servico: "validador-cadastro", to: base + "/validador-cadastro?validacao=" + v.id })),
    ...projetos.map((p) => ({ ...p, tipo: "projeto", titulo: p.nome, servico: "saneamento-estoque", createdAt: p.updatedAt, to: base + "/saneamento-estoque?projeto=" + p.id })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const nomeServico = (s) => SERVICOS.find((x) => x[0] === s)?.[1] || s;

  const atualizarListas = () => {
    for (const chave of [["analises-empresa", empresaId], ["validacoes-cadastro", empresaId], ["saneamentos", empresaId], ["saneamento-bases", empresaId], ["saneamento-base"]]) qc.invalidateQueries({ queryKey: chave });
  };
  const excluirAlvo = async () => {
    let r;
    if (alvo.tipo === "analise") r = await api.delete(`/empresas/${empresaId}/analises/${alvo.id}`);
    else if (alvo.tipo === "validacao") r = await api.delete(`/produtos/validacoes/${alvo.id}`);
    else r = await api.delete(`/produtos/saneamentos/${alvo.id}?empresa_id=${empresaId}&apagar_base=${apagarBase && !!alvo.validacao_id}`);
    atualizarListas();
    toast({ title: "Excluído", description: r?.aviso });
  };

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <TituloPagina icon={historico ? History : LayoutGrid}>{historico ? "Histórico de análises" : "Serviços e análises"}</TituloPagina>
        <p className="text-sm text-muted-foreground mt-0.5">{empresa.razao_social} · escolha um serviço ou retome uma análise salva.</p>
      </div>
      {!historico && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {SERVICOS.map(([to, titulo, desc]) => (
            <Link key={to} to={base + "/" + to} className="group flex items-start justify-between gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary hover:bg-muted/30">
              <div className="min-w-0">
                <h2 className="font-medium text-sm">{titulo}</h2>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
            </Link>))}
        </div>)}
      {!historico && <ConhecimentoEmpresa empresa={empresa} editar />}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="font-medium text-sm">Análises salvas</h2>
          {lista.length > 0 && (
            <LimparDadosButton
              tela="analises" grupoId={id} empresaId={empresaId} rotulo="Limpar análises salvas"
              oQueApaga="Apaga todas as análises salvas desta empresa: análises de serviços, validações de cadastro (com os arquivos guardados) e projetos de saneamento. A empresa e os demais dados dela ficam."
            />)}
        </div>
        {isLoading ? <p className="text-sm">Carregando…</p>
          : isError || erroValidacoes || erroProjetos ? <p role="alert" className="text-sm">Não foi possível carregar todo o histórico. Tente novamente.</p>
          : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma análise salva nesta empresa. O diagnóstico tributário permanece disponível nas abas de importação, operações e painel.</p>
          : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Análise</th><th className="px-3 py-2 font-medium">Serviço</th><th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>
                  {lista.map((a) => (
                    <tr key={a.servico + a.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-1.5">{a.titulo}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{nomeServico(a.servico)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{new Date(a.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <Link to={a.to} className="text-primary underline">Abrir</Link>
                        <button type="button" onClick={() => { setApagarBase(true); setAlvo(a); }} aria-label={`Excluir ${a.titulo}`} title="Excluir" className="ml-3 p-1 align-middle text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
      </section>

      <ConfirmarExclusao aberto={!!alvo} titulo={alvo?.tipo === "projeto" ? "Excluir o projeto de saneamento?" : alvo?.tipo === "validacao" ? "Excluir a validação de cadastro?" : "Excluir a análise salva?"} onFechar={() => setAlvo(null)} onConfirmar={excluirAlvo}>
        <p><b className="text-foreground">{alvo?.titulo}</b> · {alvo ? nomeServico(alvo.servico) : ""}</p>
        {alvo?.tipo === "validacao" && <p>O arquivo guardado também será apagado. Projetos de saneamento que usam esta base ficam sem base vinculada.</p>}
        {alvo?.tipo === "projeto" && alvo.validacao_id && (
          <label className="flex items-start gap-2 text-foreground">
            <input type="checkbox" className="mt-1" checked={apagarBase} onChange={(e) => setApagarBase(e.target.checked)} />
            <span>Apagar também a base importada neste projeto (arquivo e análise). Se não marcar, a base continua na lista como “Validação de cadastro”.</span>
          </label>)}
        <p className="font-medium text-destructive">Esta ação não pode ser desfeita.</p>
      </ConfirmarExclusao>
    </div>
  );
}
