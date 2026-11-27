import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { temTela } from "@/lib/permissoes";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import { ROTULO_GRUPO_NORMA } from "@/lib/novidadesLegais";
import { plural } from "@/lib/plural";

const CRUMBS = [{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Parâmetros e rotinas", to: "/admin/parametros-rotinas" }];
const botao = "botao-acao rounded-md px-3 py-[5px] text-sm hover:bg-muted disabled:opacity-50";
const botaoPrimario = "botao-acao rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50";

/** Abas de Parâmetros e rotinas (a Administração tem no máximo 7 itens no menu: as normas monitoradas são uma aba). */
export function AbasRotinas() {
  const cls = ({ isActive }) => `border-b-2 px-3 py-2 text-sm ${isActive ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`;
  return (
    <nav aria-label="Abas de parâmetros e rotinas" className="flex gap-1 border-b border-border px-6 lg:px-8">
      <NavLink to="/admin/parametros-rotinas" end className={cls}>Monitoramento das empresas</NavLink>
      <NavLink to="/admin/normas-monitoradas" className={cls}>Normas monitoradas</NavLink>
    </nav>
  );
}

/**
 * Normas monitoradas: as leis e regras que a revisão semanal confere toda segunda-feira (por padrão, todas). Nas que o InTAX lê por
 * artigo, relê o texto; nas que ficam só como referência (estaduais, instruções da Receita), confere se o documento oficial mudou.
 */
export default function NormasMonitoradasPagina() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const liberada = temTela(user, "parametros-rotinas");
  const qc = useQueryClient();
  const { data: normas = [], isLoading, isError } = useQuery({ queryKey: ["base-legal-monitoramento"], queryFn: () => api.get("/base-legal/monitoramento"), enabled: liberada });
  const [marcadas, setMarcadas] = useState(null); // null: como está gravado
  const atual = useMemo(() => marcadas ?? new Set(normas.filter((n) => n.monitorar).map((n) => n.chave)), [marcadas, normas]);
  const alterado = marcadas !== null;

  const salvar = useMutation({
    mutationFn: () => api.post("/base-legal/monitoramento", { monitoradas: [...atual] }),
    onSuccess: (r) => {
      setMarcadas(null);
      qc.invalidateQueries({ queryKey: ["base-legal-monitoramento"] });
      qc.invalidateQueries({ queryKey: ["base-legal-regras-estaduais"] });
      toast({ title: "Normas monitoradas salvas", description: `${plural(r.monitoradas, "norma monitorada", "normas monitoradas")}; ${plural(r.fora, "fica", "ficam")} fora da revisão semanal.` });
    },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const alternar = (chave) => {
    const n = new Set(atual);
    if (n.has(chave)) n.delete(chave); else n.add(chave);
    setMarcadas(n);
  };

  const colunas = [
    {
      chave: "monitorar", rotulo: "Monitorar", valor: (n) => (atual.has(n.chave) ? "Sim" : "Não"),
      render: (n) => <input type="checkbox" aria-label={`Monitorar ${n.numero}`} checked={atual.has(n.chave)} disabled={!admin} onChange={() => alternar(n.chave)} />,
    },
    { chave: "numero", rotulo: "Norma" },
    { chave: "titulo", rotulo: "Assunto", quebrar: true },
    { chave: "grupo", rotulo: "Bloco", valor: (n) => ROTULO_GRUPO_NORMA[n.grupo] || n.grupo || "" },
    { chave: "uf", rotulo: "UF", valor: (n) => n.uf || "Federal" },
    { chave: "leitura", rotulo: "Como é conferida", valor: (n) => (n.leitura === "referencia" ? "Documento oficial (só referência)" : "Texto por artigo") },
    { chave: "capturada_em", rotulo: "Última conferência", tipo: "data" },
    { chave: "atualizada_em", rotulo: "Última mudança", tipo: "data" },
  ];

  if (!liberada) return <div><PageHeader crumbs={[...CRUMBS, { label: "Normas monitoradas" }]} title="Parâmetros e rotinas" /><p role="alert" className="p-8 text-sm">Sem acesso a esta tela. Peça ao administrador.</p></div>;
  return (
    <div>
      <PageHeader crumbs={[...CRUMBS, { label: "Normas monitoradas" }]} title="Parâmetros e rotinas" />
      <AbasRotinas />
      <div className="space-y-4 px-6 py-6 lg:px-8">
        <p className="text-sm text-muted-foreground">
          Toda segunda-feira, às 5h, a revisão semanal confere as normas marcadas: relê o texto das que o InTAX lê por artigo e, nas que ficam só como referência (estaduais, instruções da Receita), confere se o documento oficial mudou. O que mudou vai para Novidades e revogações, para o e-mail da rodada e para a newsletter da semana. Por padrão, todas ficam marcadas.
        </p>
        {!admin && <p className="text-sm">Só um administrador altera a lista.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{plural(atual.size, "norma marcada", "normas marcadas")} de {normas.length}</span>
          {admin && (
            <>
              <button type="button" className={botao} onClick={() => setMarcadas(new Set(normas.map((n) => n.chave)))}>Marcar todas</button>
              <button type="button" className={botao} onClick={() => setMarcadas(new Set())}>Desmarcar todas</button>
              <button type="button" className={botaoPrimario} disabled={!alterado || salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? "Salvando…" : "Salvar"}</button>
              {alterado && <button type="button" className={botao} onClick={() => setMarcadas(null)}>Desfazer</button>}
            </>
          )}
        </div>
        {isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as normas.</p>}
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
          <TabelaPadrao id="admin:normas-monitoradas" ariaLabel="Normas monitoradas pela revisão semanal" linhas={normas} chaveLinha={(n) => n.chave} colunas={colunas} tamanhoInicial={50} />
        )}
      </div>
    </div>
  );
}
