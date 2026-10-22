import ConhecimentoEmpresa from "@/components/ConhecimentoEmpresa";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, History, LayoutGrid } from "lucide-react";
import { api } from "@/api/base44Client";
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
  const base = "/workroom/" + id + "/empresas/" + empresaId;
  const { data: analises = [], isLoading, isError } = useQuery({ queryKey: ["analises-empresa", empresaId], queryFn: () => api.get("/empresas/" + empresaId + "/analises") });
  const { data: validacoes = [], isError: erroValidacoes } = useQuery({ queryKey: ["validacoes-cadastro", empresaId], queryFn: () => api.get("/produtos/validacoes", { empresa_id: empresaId }) });
  const { data: projetos = [], isError: erroProjetos } = useQuery({ queryKey: ["saneamentos", empresaId], queryFn: () => api.get("/produtos/saneamentos?empresa_id=" + empresaId) });
  // Uma base importada num projeto de saneamento aparece só como o projeto, não duas vezes.
  const emProjeto = new Set(projetos.map((p) => p.validacao_id).filter(Boolean));
  const lista = [
    ...analises.map((a) => ({ ...a, to: base + "/" + a.servico + "?analise=" + a.id })),
    ...validacoes.filter((v) => !emProjeto.has(v.id)).map((v) => ({ ...v, titulo: v.nome_arquivo, servico: "validador-cadastro", to: base + "/validador-cadastro?validacao=" + v.id })),
    ...projetos.map((p) => ({ ...p, titulo: p.nome, servico: "saneamento-estoque", createdAt: p.updatedAt, to: base + "/saneamento-estoque?projeto=" + p.id })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const nomeServico = (s) => SERVICOS.find((x) => x[0] === s)?.[1] || s;

  return (
    <div className="p-4 lg:p-5 space-y-4">
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
        <h2 className="font-medium text-sm mb-2">Análises salvas</h2>
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
                      <td className="px-3 py-1.5 text-right"><Link to={a.to} className="text-primary underline">Abrir</Link></td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}
      </section>
    </div>
  );
}
