import { useMemo, useState } from "react";
import TabelaPadrao from "@/components/TabelaPadrao";
import { Link } from "react-router-dom";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { arquivarCliente } from "@/lib/arquivamento";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmar } from "@/components/ConfirmProvider";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import DialogoServico from "@/components/clientes/DialogoServico";
import { useCarteiras } from "@/lib/useCarteiras";
import { carteiraDaEmpresa, filtrarEmpresas, fmtDataCurta, naCarteira, SITUACOES, TIPOS, TOM_DA_SITUACAO } from "@/lib/servicos";
import { aplicarCriterios, filtrarPorColaborador, filtrarPorTags, tagsDaEmpresa } from "@/lib/tags";
import { useColaboradores, useTags } from "@/lib/useTags";
import DialogoEtiquetas from "@/components/clientes/DialogoEtiquetas";
import FiltroPorTags from "@/components/clientes/FiltroPorTags";
import ListasSalvas from "@/components/clientes/ListasSalvas";
import { EtiquetasDaEmpresa } from "@/components/clientes/TagChip";
import { plural } from "@/lib/plural";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CARTEIRAS = [["", "Todas as carteiras"], ["bpo", "Só BPO fiscal"], ["diagnostico", "Só diagnóstico pontual"], ["ambas", "Nas duas"], ["nenhuma", "Sem carteira"]];
const FILTROS_VAZIOS = { busca: "", grupo: "", carteira: "", tags: [], tagModo: "qualquer", colaborador: "" };

function Cartao({ rotulo, valor, destaque, aoClicar, ativo }) {
  const classe = `rounded-xl border bg-card px-4 py-3 text-left ${destaque ? "border-amber-400/60" : "border-border"} ${ativo ? "ring-2 ring-primary" : ""}`;
  const conteudo = <><p className="text-xs text-muted-foreground">{rotulo}</p><p className="text-xl font-semibold tabular-nums">{valor ?? "—"}</p></>;
  return aoClicar ? <button type="button" onClick={aoClicar} className={`${classe} hover:bg-muted/50`}>{conteudo}</button> : <div className={classe}>{conteudo}</div>;
}

/** Selo do serviço de uma empresa num tipo (situação e o botão de editar); "Definir" quando não há. */
export function SeloDoServico({ servico, aoEditar, rotuloVazio = "Definir" }) {
  if (!servico) {
    return <button type="button" onClick={aoEditar} className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline">{rotuloVazio}</button>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_DA_SITUACAO[servico.situacao] || "bg-muted"}`}>{SITUACOES[servico.situacao] || servico.situacao}</span>
      <button type="button" onClick={aoEditar} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Editar serviço" title="Editar"><Pencil className="h-3 w-3" aria-hidden="true" /></button>
    </span>
  );
}

/**
 * Clientes > Serviços contratados: o cadastro da empresa é um só; aqui se marca quem é do BPO fiscal e quem tem diagnóstico pontual.
 * As carteiras das áreas BPO Fiscal e Diagnóstico e Serviços saem daqui.
 */
export default function ServicosContratadosPagina() {
  const { empresas, grupos, servicos, resumo, mapa, carregando, erro, recarregar } = useCarteiras();
  const { tags, porEmpresa, mapa: mapaTags } = useTags();
  const { data: colaboradores = [] } = useColaboradores();
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [marcadas, setMarcadas] = useState(new Set());
  const [dialogo, setDialogo] = useState(null); // { empresas, servico, tipoInicial }
  const [dialogoTags, setDialogoTags] = useState(null); // empresas a etiquetar

  const lista = useMemo(() => {
    const base = filtrarEmpresas(empresas, mapa, filtros);
    const comTags = filtrarPorTags(base, porEmpresa, filtros.tags, filtros.tagModo);
    return filtrarPorColaborador(comTags, colaboradores, filtros.colaborador).sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR"));
  }, [empresas, mapa, filtros, porEmpresa, colaboradores]);
  const sugestoes = useMemo(() => [...new Set(servicos.map((s) => s.responsavel).filter(Boolean))].sort(), [servicos]);
  const grupoDe = (e) => grupos.find((g) => g.numero === e.grupo);
  const mudar = (chave, valor) => setFiltros((f) => ({ ...f, [chave]: valor }));
  const abrir = (empresasAlvo, servico = null, tipoInicial) => setDialogo({ empresas: empresasAlvo, servico, tipoInicial });
  const nomeDoGrupo = (e) => { const g = grupoDe(e); return g ? `${g.numero} ${g.nome}` : e.grupo || ""; };
  const servicoDe = (e, tipo) => mapa.get(e.id)?.[tipo];
  const CURTO = { BPO_FISCAL: "do BPO", DIAGNOSTICO_PONTUAL: "do diagnóstico" };
  const colunas = [
    { chave: "razao_social", rotulo: "Empresa", render: (e) => <span className="font-medium">{e.razao_social}</span> },
    { chave: "documento", rotulo: "CNPJ/CPF", valor: (e) => e.cnpj_cpf || e.id_empresa || "", render: (e) => <span className="tabular-nums text-muted-foreground">{e.cnpj_cpf || e.id_empresa || "—"}</span> },
    { chave: "tags", rotulo: "Etiquetas", valor: (e) => tagsDaEmpresa(porEmpresa, mapaTags, e.id).map((t) => t.nome).join(", "), render: (e) => <EtiquetasDaEmpresa tags={tagsDaEmpresa(porEmpresa, mapaTags, e.id)} aoEditar={() => setDialogoTags([e])} /> },
    { chave: "grupo", rotulo: "Grupo", valor: nomeDoGrupo, render: (e) => <span className="text-muted-foreground">{nomeDoGrupo(e) || "—"}</span> },
    ...Object.keys(TIPOS).flatMap((tipo) => [
      { chave: `situacao_${tipo}`, rotulo: TIPOS[tipo], valor: (e) => SITUACOES[servicoDe(e, tipo)?.situacao] || "",
        render: (e) => <SeloDoServico servico={servicoDe(e, tipo)} aoEditar={() => abrir([e], servicoDe(e, tipo) || null, tipo)} /> },
      { chave: `responsavel_${tipo}`, rotulo: `Responsável ${CURTO[tipo]}`, valor: (e) => servicoDe(e, tipo)?.responsavel || "", render: (e) => servicoDe(e, tipo)?.responsavel || <span className="text-muted-foreground">—</span> },
      { chave: `inicio_${tipo}`, rotulo: `Início ${CURTO[tipo]}`, tipo: "data", valor: (e) => servicoDe(e, tipo)?.inicio || "", render: (e) => fmtDataCurta(servicoDe(e, tipo)?.inicio) },
    ]),
  ];
  const selecionadas = empresas.filter((e) => marcadas.has(e.id));
  const { user } = useAuth();
  const confirmar = useConfirmar();
  const qc = useQueryClient();
  const [excluindo, setExcluindo] = useState(null); // { feitas, total }
  const excluirEmLote = async () => {
    const alvo = [...selecionadas];
    const nomes = alvo.slice(0, 5).map((e) => e.razao_social).join("; ") + (alvo.length > 5 ? ` e mais ${alvo.length - 5}` : "");
    if (!(await confirmar({ titulo: `Arquivar ${plural(alvo.length, "cliente", "clientes")}?`, descricao: `${nomes}. Saem das listas e das rotinas; o histórico fica guardado.`, rotulo: `Arquivar ${alvo.length}` }))) return;
    const falhas = [];
    setExcluindo({ feitas: 0, total: alvo.length });
    for (const [i, e] of alvo.entries()) {
      try { await arquivarCliente(e.id); } catch { falhas.push(e.razao_social); }
      setExcluindo({ feitas: i + 1, total: alvo.length });
    }
    setExcluindo(null);
    setMarcadas(new Set());
    qc.invalidateQueries({ queryKey: ["empresas"] });
    recarregar();
    const ok = alvo.length - falhas.length;
    toast(falhas.length
      ? { title: `${ok} de ${alvo.length} arquivados`, description: `Não saíram: ${falhas.join("; ")}. Tente de novo.`, variant: "destructive" }
      : { title: `${plural(ok, "cliente arquivado", "clientes arquivados")}` });
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Serviços contratados" }]}
        title="Serviços contratados"
      />
      <div className="px-6 lg:px-8 py-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao rotulo="Empresas no cadastro" valor={resumo?.empresas} aoClicar={() => mudar("carteira", "")} ativo={filtros.carteira === ""} />
          <Cartao rotulo="No BPO fiscal" valor={resumo?.em_carteira?.BPO_FISCAL} aoClicar={() => mudar("carteira", "bpo")} ativo={filtros.carteira === "bpo"} />
          <Cartao rotulo="Com diagnóstico pontual" valor={resumo?.em_carteira?.DIAGNOSTICO_PONTUAL} aoClicar={() => mudar("carteira", "diagnostico")} ativo={filtros.carteira === "diagnostico"} />
          <Cartao rotulo="Sem carteira" valor={resumo?.sem_carteira} destaque={(resumo?.sem_carteira ?? 0) > 0} aoClicar={() => mudar("carteira", "nenhuma")} ativo={filtros.carteira === "nenhuma"} />
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1 flex-1 min-w-[200px]"><span className="block text-xs text-muted-foreground">Buscar (nome, código ou CNPJ)</span>
              <input type="search" className={`${campo} w-full`} value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Carteira</span>
              <select className={campo} value={filtros.carteira} onChange={(e) => mudar("carteira", e.target.value)}>{CARTEIRAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Grupo</span>
              <select className={campo} value={filtros.grupo} onChange={(e) => mudar("grupo", e.target.value)}>
                <option value="">Todos</option>{grupos.map((g) => <option key={g.id} value={g.numero}>{g.numero} {g.nome}</option>)}
              </select></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Colaborador</span>
              <select className={campo} value={filtros.colaborador} onChange={(e) => mudar("colaborador", e.target.value)}>
                <option value="">Todos</option><option value="sem">Sem colaborador</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
              </select></label>
            <button type="button" onClick={recarregar} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" title="Buscar de novo"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Atualizar</button>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <FiltroPorTags tags={tags} escolhidas={filtros.tags} modo={filtros.tagModo} aoMudar={(p) => setFiltros((f) => ({ ...f, ...p }))} />
            <ListasSalvas criterios={filtros} aoAplicar={(c) => setFiltros(aplicarCriterios(FILTROS_VAZIOS, c))} />
          </div>

          {selecionadas.length > 0 && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">{plural(selecionadas.length, "empresa marcada", "empresas marcadas")}</span>
              <button type="button" onClick={() => abrir(selecionadas, null, "BPO_FISCAL")} className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Definir BPO fiscal</button>
              <button type="button" onClick={() => abrir(selecionadas, null, "DIAGNOSTICO_PONTUAL")} className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted">Definir diagnóstico pontual</button>
              <button type="button" onClick={() => setDialogoTags(selecionadas)} className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted">Etiquetar</button>
              {user?.role === "admin" && (
                <button type="button" onClick={excluirEmLote} disabled={!!excluindo} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 bg-background px-3 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-60">
                  {excluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                  {excluindo ? `${excluindo.feitas} de ${excluindo.total}…` : "Arquivar"}
                </button>
              )}
              <button type="button" onClick={() => setMarcadas(new Set())} className="ml-auto text-xs text-muted-foreground hover:underline">Limpar seleção</button>
            </div>
          )}

          {carregando && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
          {!carregando && erro && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar. <button type="button" onClick={recarregar} className="text-primary hover:underline">Tentar de novo</button></p>}
          {!carregando && !erro && (
            <TabelaPadrao
              id="servicos-contratados" ariaLabel="Serviços contratados por empresa" titulo="Serviços contratados" colunas={colunas} linhas={lista}
              selecao={{ marcadas, aoMudar: setMarcadas }}
              vazio={empresas.length === 0 ? <>Nenhuma empresa cadastrada. <Link to="/" className="text-primary hover:underline">Cadastre o cliente em Clientes</Link>.</> : "Nenhuma empresa com esses filtros."}
            />
          )}
          <p className="text-xs text-muted-foreground">{lista.length} de {plural(empresas.length, "empresa", "empresas")}</p>
        </div>
      </div>
      {dialogo && <DialogoServico aberto empresas={dialogo.empresas} servico={dialogo.servico} tipoInicial={dialogo.tipoInicial} sugestoes={sugestoes} aoFechar={() => { setDialogo(null); setMarcadas(new Set()); }} />}
      {dialogoTags && <DialogoEtiquetas empresas={dialogoTags} tags={tags} porEmpresa={porEmpresa} aoSalvar={() => setMarcadas(new Set())} aoFechar={() => setDialogoTags(null)} />}
    </div>
  );
}

export { carteiraDaEmpresa, naCarteira };
