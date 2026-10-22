import ConhecimentoEmpresa from "@/components/ConhecimentoEmpresa";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/base44Client";
const SERVICOS = [
  ["importacao-xml", "Diagnóstico tributário", "Importe XML, revise as operações e consulte o painel da empresa."],
  ["validador-cadastro", "Validação de cadastro", "Conferência rápida de uma planilha: NCM, cClassTrib e duplicidades."],
  ["saneamento-estoque", "Saneamento de estoques", "Projeto completo, passo a passo: triagem, critérios, análise por grupo, decisões e política de uso."],
  ["classificacao-servicos", "Classificação e conversão de serviços", "Consulte a correlação entre LC 116, NBS, cIndOp e cClassTrib."],
  ["validador-nfse", "Validação de NFS-e", "Confira os documentos de serviço desta empresa."],
];
export default function EmpresaServicos({ historico = false }) {
  const { empresa } = useOutletContext();
  const { id, empresaId } = useParams();
  const base = '/workroom/' + id + '/empresas/' + empresaId;
  const { data: analises = [], isLoading, isError } = useQuery({ queryKey: ['analises-empresa', empresaId], queryFn: () => api.get('/empresas/' + empresaId + '/analises') });
  const { data: validacoes = [], isError: erroValidacoes } = useQuery({ queryKey: ['validacoes-cadastro', empresaId], queryFn: () => api.get('/produtos/validacoes', { empresa_id: empresaId }) });
  const lista = [...analises.map(a => ({ ...a, to: base + '/' + a.servico + '?analise=' + a.id })), ...validacoes.map(v => ({ ...v, titulo: v.nome_arquivo, servico: 'Validação de cadastro', to: base + '/validador-cadastro?validacao=' + v.id }))].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return <div className="p-6 lg:p-8 space-y-6">
    <div><h1 className="text-xl font-heading font-semibold">{historico ? 'Histórico de análises' : 'Serviços e análises'}</h1><p className="text-sm text-muted-foreground mt-1">{empresa.razao_social} · Escolha um serviço ou retome uma análise salva.</p></div>
    {!historico && <div className="grid md:grid-cols-2 gap-4">{SERVICOS.map(([to, titulo, desc]) => <Link key={to} to={base + '/' + to} className="block p-5 rounded-xl border border-border bg-card hover:border-primary hover:bg-muted/30"><h2 className="font-medium">{titulo}</h2><p className="text-sm text-muted-foreground mt-2">{desc}</p><span className="block text-primary text-sm mt-4">Acessar serviço →</span></Link>)}</div>}
    {!historico && <ConhecimentoEmpresa empresa={empresa} editar />}
    <section><h2 className="font-medium mb-3">Análises salvas</h2>{isLoading ? <p>Carregando…</p> : isError || erroValidacoes ? <p role="alert">Não foi possível carregar todo o histórico. Tente novamente.</p> : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma análise salva nesta empresa. O diagnóstico tributário permanece disponível nas abas de importação, operações e painel.</p> : <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-muted text-left"><tr><th className="p-3">Análise</th><th className="p-3">Serviço</th><th className="p-3">Data</th><th className="p-3">Ação</th></tr></thead><tbody>{lista.map(a => <tr key={a.id} className="border-t border-border"><td className="p-3">{a.titulo}</td><td className="p-3">{SERVICOS.find(s => s[0] === a.servico)?.[1] || a.servico}</td><td className="p-3">{new Date(a.createdAt).toLocaleString('pt-BR')}</td><td className="p-3"><Link to={a.to} className="text-primary underline">Abrir análise</Link></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
