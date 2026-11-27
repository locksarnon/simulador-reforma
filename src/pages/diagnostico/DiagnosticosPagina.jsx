import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import { botaoBarraCls, campoBarraCls } from "@/lib/estiloTabela";
import NovoDiagnosticoDialog from "@/components/diagnostico/NovoDiagnosticoDialog";
import { useCarteiras } from "@/lib/useCarteiras";
import { fmtDataCurta } from "@/lib/servicos";
import { SITUACOES_PROJETO } from "@/lib/projetos";


/** Diagnósticos > Projetos: cada trabalho pontual com o seu escopo; "Novo diagnóstico" é a ação principal. */
export default function DiagnosticosPagina({ consultoria = false }) {
  const navigate = useNavigate();
  const { empresas, grupos, carregando: carregandoCadastro } = useCarteiras();
  const projetos = useQuery({ queryKey: ["projetos-diagnostico"], queryFn: () => api.get("/projetos-diagnostico") });
  const [novo, setNovo] = useState(false);
  const [filtro, setFiltro] = useState({ busca: "", situacao: "abertos" });
  const nomeDe = useMemo(() => new Map(empresas.map((e) => [e.id, e.razao_social])), [empresas]);
  const lista = useMemo(() => {
    const q = filtro.busca.trim().toLowerCase();
    return (projetos.data || [])
      .filter((p) => consultoria || !p.pessoa_fisica_id)
      .filter((p) => filtro.situacao === "todos" || (filtro.situacao === "abertos" ? ["EM_ANDAMENTO", "PAUSADO"].includes(p.situacao) : p.situacao === filtro.situacao))
      .filter((p) => !filtro.exclusao || p.exclusao_solicitada_em)
      .filter((p) => !q || p.nome.toLowerCase().includes(q) || p.empresa_ids.some((id) => (nomeDe.get(id) || "").toLowerCase().includes(q)));
  }, [projetos.data, filtro, nomeDe, consultoria]);
  const atrasado = (p) => p.prazo && ["EM_ANDAMENTO", "PAUSADO"].includes(p.situacao) && new Date(p.prazo) < new Date(new Date().toISOString().slice(0, 10));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, ...(consultoria ? [{ label: "Consultoria Tributária", to: "/area/diagnostico" }, { label: "Projetos" }] : [{ label: "Diagnósticos" }])]}
        title={consultoria ? "Projetos de Consultoria" : "Diagnósticos"}
        actions={consultoria ? undefined : <button type="button" onClick={() => setNovo(true)} className="botao-acao inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo diagnóstico</button>}
      />
      <div className="px-6 lg:px-8 py-5 space-y-3">
        {(projetos.isLoading || carregandoCadastro) ? <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p> : (
          <TabelaPadrao
            id="diagnosticos-projetos" ariaLabel="Projetos de diagnóstico" linhas={lista}
            busca={{ valor: filtro.busca, aoMudar: (v) => setFiltro((f) => ({ ...f, busca: v })), placeholder: "Nome do projeto ou da empresa", rotulo: "Buscar pelo nome do projeto ou da empresa" }}
            filtrosExtras={<>
              <select aria-label="Situação" className={campoBarraCls} value={filtro.situacao} onChange={(e) => setFiltro((f) => ({ ...f, situacao: e.target.value }))}>
                <option value="abertos">Situação: em andamento e pausados</option><option value="todos">Situação: todas</option>
                {Object.entries(SITUACOES_PROJETO).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}
              </select>
              <label className="inline-flex h-8 items-center gap-1.5 text-xs"><input type="checkbox" checked={Boolean(filtro.exclusao)} onChange={(e) => setFiltro((f) => ({ ...f, exclusao: e.target.checked, situacao: e.target.checked ? "todos" : f.situacao }))} /> Exclusão pendente</label>
            </>}
            acoes={<Link to="/consultoria/carteira" className={botaoBarraCls}>Carteira de Consultoria</Link>}
            aoClicarLinha={(p) => navigate(`/diagnostico/projetos/${p.id}`)}
            vazio={consultoria ? "Nenhum projeto com esses filtros." : (projetos.data || []).length === 0 ? <>Nenhum diagnóstico ainda. <button type="button" onClick={() => setNovo(true)} className="text-primary hover:underline">Criar o primeiro</button></> : "Nenhum diagnóstico com esses filtros."}
            colunas={[
              { chave: "nome", rotulo: "Diagnóstico", render: (p) => <Link to={`/diagnostico/projetos/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary hover:underline">{p.nome}{p.exclusao_solicitada_em && <span className="block text-xs text-muted-foreground">Exclusão pendente</span>}</Link> },
              { chave: "empresas", rotulo: "Empresas", valor: (p) => p.empresa_ids.map((id) => nomeDe.get(id) || "empresa removida").join(", "),
                render: (p) => <span className="text-xs">{p.pessoa_fisica_id ? "Pessoa física" : p.empresa_ids.slice(0, 3).map((id) => nomeDe.get(id) || "empresa removida").join(", ")}{p.empresa_ids.length > 3 ? ` e mais ${p.empresa_ids.length - 3}` : ""}</span> },
              { chave: "situacao", rotulo: "Situação", valor: (p) => SITUACOES_PROJETO[p.situacao]?.rotulo || p.situacao, render: (p) => <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SITUACOES_PROJETO[p.situacao]?.tom || ""}`}>{SITUACOES_PROJETO[p.situacao]?.rotulo || p.situacao}</span> },
              { chave: "prazo", rotulo: "Prazo", tipo: "data", valor: (p) => (p.prazo ? String(p.prazo).slice(0, 10) : ""),
                render: (p) => <span className={`tabular-nums ${atrasado(p) ? "font-medium text-red-700 dark:text-red-400" : ""}`}>{p.prazo ? fmtDataCurta(p.prazo) : "—"}{atrasado(p) ? " · atrasado" : ""}</span> },
              { chave: "responsavel", rotulo: "Responsável", render: (p) => <span className="text-muted-foreground">{p.responsavel || "—"}</span> },
              { chave: "escopo", rotulo: "Escopo", render: (p) => (p.escopo ? <span className="block max-w-[28rem] truncate text-muted-foreground" title={p.escopo}>{p.escopo}</span> : <span className="text-muted-foreground">—</span>) },
            ]}
          />
        )}
      </div>
      <NovoDiagnosticoDialog aberto={novo} aoFechar={() => setNovo(false)} empresas={empresas} grupos={grupos} />
    </div>
  );
}
