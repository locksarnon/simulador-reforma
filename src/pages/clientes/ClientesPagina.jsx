import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowRight, Loader2, Pencil, Plus, RefreshCw, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmar } from "@/components/ConfirmProvider";
import { toast } from "@/components/ui/use-toast";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PageHeader from "@/components/PageHeader";
import BotaoExportar from "@/components/BotaoExportar";
import EmpresaFormDialog from "@/components/empresas/EmpresaFormDialog";
import DialogoServico from "@/components/clientes/DialogoServico";
import DialogoEtiquetas from "@/components/clientes/DialogoEtiquetas";
import NovoClienteDialog from "@/components/clientes/NovoClienteDialog";
import ChipDeServico from "@/components/clientes/ChipDeServico";
import AtalhosDoCliente from "@/components/clientes/AtalhosDoCliente";
import FiltroPorTags from "@/components/clientes/FiltroPorTags";
import ListasSalvas from "@/components/clientes/ListasSalvas";
import { EtiquetasDaEmpresa } from "@/components/clientes/TagChip";
import { useCarteiras } from "@/lib/useCarteiras";
import { useColaboradores, useTags } from "@/lib/useTags";
import { aplicarCriterios, filtrarPorColaborador, filtrarPorTags, tagsDaEmpresa } from "@/lib/tags";
import { contarRapidos, filtrarClientes, FILTROS_RAPIDOS, grupoVisivel, mascararDocumento, rotuloDoGrupo } from "@/lib/clientes";
import { SITUACOES, TIPOS } from "@/lib/servicos";
import { arquivarCliente, CHAVES_APOS_ARQUIVAR, desarquivarCliente, TEXTO_ARQUIVAR } from "@/lib/arquivamento";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const FILTROS_VAZIOS = { busca: "", rapido: "todos", regime: "", uf: "", tags: [], tagModo: "qualquer", colaborador: "" };
const TIPOS_DE_SERVICO = Object.keys(TIPOS);

/** Ficha rápida do cliente, ao lado da lista: dados, serviços e atalhos. */
function FichaRapida({ empresa, porTipo, grupo, nomesDaEquipe, tags, grupos, aoFechar, aoEditarServico, aoEditarDados }) {
  const navigate = useNavigate();
  return (
    <Sheet open={!!empresa} onOpenChange={(v) => !v && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {empresa && (
          <div className="space-y-5 text-sm">
            <SheetHeader className="text-left">
              <SheetTitle>{empresa.razao_social}</SheetTitle>
              <SheetDescription>{[mascararDocumento(empresa.cnpj_cpf), empresa.regime_atual, [empresa.municipio, empresa.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "Sem dados cadastrais"}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate(`/clientes/${empresa.id}`)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">Abrir ficha completa <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" onClick={aoEditarDados} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted"><Pencil className="h-4 w-4" aria-hidden="true" /> Editar dados</button>
            </div>
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Serviços contratados</h3>
              {TIPOS_DE_SERVICO.map((tipo) => {
                const s = porTipo[tipo];
                return (
                  <div key={tipo} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                    <div><p className="font-medium">{TIPOS[tipo]}</p><p className="text-xs text-muted-foreground">{s ? `${SITUACOES[s.situacao]}${s.responsavel ? ` · ${s.responsavel}` : ""}` : "Não contratado"}</p></div>
                    <ChipDeServico empresa={empresa} tipo={tipo} servico={s} aoEditar={() => aoEditarServico(tipo)} />
                  </div>
                );
              })}
            </section>
            <section className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Equipe e etiquetas</h3>
              <p>{nomesDaEquipe.length ? nomesDaEquipe.join(", ") : <span className="text-muted-foreground">Nenhum colaborador ligado.</span>}</p>
              {tags.length > 0 && <EtiquetasDaEmpresa tags={tags} />}
              {grupo && <p className="text-xs text-muted-foreground">Grupo econômico: {grupo.nome}</p>}
            </section>
            {(empresa.email_contato || empresa.whatsapp_contato) && (
              <section className="space-y-1">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contato</h3>
                {empresa.email_contato && <p><a href={`mailto:${empresa.email_contato}`} className="text-primary hover:underline">{empresa.email_contato}</a></p>}
                {empresa.whatsapp_contato && <p>{empresa.whatsapp_contato}</p>}
              </section>
            )}
            <section className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ir para</h3>
              <AtalhosDoCliente empresa={empresa} grupos={grupos} />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Clientes: a lista única do escritório. Busca, filtros, os serviços de cada cliente na própria linha (um clique liga), ações em
 * lote e a ficha rápida ao lado. O grupo econômico é só um dado do cliente.
 */
export default function ClientesPagina() {
  const { user } = useAuth();
  const ehAdmin = user?.role === "admin";
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { empresas: ativas, arquivadas, grupos, servicos, mapa, carregando, erro, recarregar } = useCarteiras();
  const { tags, porEmpresa, mapa: mapaTags } = useTags();
  const { data: colaboradores = [] } = useColaboradores();
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [marcadas, setMarcadas] = useState(new Set());
  const [aberta, setAberta] = useState(null);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [dialogo, setDialogo] = useState(null);
  const [dialogoTags, setDialogoTags] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const vendoArquivados = filtros.rapido === "arquivados";
  const empresas = vendoArquivados ? arquivadas : ativas;

  const atendidas = useMemo(() => new Set(colaboradores.flatMap((c) => c.empresa_ids || [])), [colaboradores]);
  const equipeDe = (id) => colaboradores.filter((c) => (c.empresa_ids || []).includes(id)).map((c) => c.name || c.email);
  const grupoDe = (e) => grupoVisivel(grupos.find((g) => g.numero === e.grupo), empresas);
  const contagem = useMemo(() => ({ ...contarRapidos(ativas, mapa, atendidas), arquivados: arquivadas.length }), [ativas, arquivadas, mapa, atendidas]);
  const regimes = useMemo(() => [...new Set(empresas.map((e) => e.regime_atual).filter(Boolean))].sort(), [empresas]);
  const ufs = useMemo(() => [...new Set(empresas.map((e) => e.uf).filter(Boolean))].sort(), [empresas]);
  const lista = useMemo(() => {
    const base = filtrarClientes(empresas, vendoArquivados ? { ...filtros, rapido: "todos" } : filtros, mapa, grupos, atendidas);
    return filtrarPorColaborador(filtrarPorTags(base, porEmpresa, filtros.tags, filtros.tagModo), colaboradores, filtros.colaborador);
  }, [empresas, filtros, mapa, grupos, atendidas, porEmpresa, colaboradores, vendoArquivados]);
  const sugestoes = useMemo(() => [...new Set(servicos.map((s) => s.responsavel).filter(Boolean))].sort(), [servicos]);
  const mudar = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  const todasMarcadas = lista.length > 0 && lista.every((e) => marcadas.has(e.id));
  const alternar = (id) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selecionadas = empresas.filter((e) => marcadas.has(e.id));
  const abertaAgora = aberta ? empresas.find((e) => e.id === aberta) : null;

  const arquivarEmLote = async () => {
    const alvo = [...selecionadas];
    const desarquivar = vendoArquivados;
    const nomes = alvo.slice(0, 5).map((e) => e.razao_social).join("; ") + (alvo.length > 5 ? ` e mais ${alvo.length - 5}` : "");
    if (!(await confirmar({ titulo: `${desarquivar ? "Desarquivar" : "Arquivar"} ${alvo.length} cliente(s)?`, descricao: `${nomes}. ${desarquivar ? "Eles voltam às listas; os serviços continuam pausados até você ligar de novo." : TEXTO_ARQUIVAR}`, rotulo: desarquivar ? "Desarquivar" : "Arquivar" }))) return;
    const falhas = [];
    setExcluindo({ feitas: 0, total: alvo.length });
    for (const [i, e] of alvo.entries()) {
      try { await (desarquivar ? desarquivarCliente(e.id) : arquivarCliente(e.id)); } catch { falhas.push(e.razao_social); }
      setExcluindo({ feitas: i + 1, total: alvo.length });
    }
    setExcluindo(null); setMarcadas(new Set());
    CHAVES_APOS_ARQUIVAR.forEach((k) => qc.invalidateQueries({ queryKey: k })); recarregar();
    toast(falhas.length ? { title: `${alvo.length - falhas.length} feito(s); ${falhas.length} não`, description: `Não mudaram: ${falhas.join("; ")}.`, variant: "destructive" } : { title: `${alvo.length} cliente(s) ${desarquivar ? "desarquivado(s)" : "arquivado(s)"}` });
  };

  const colunasExport = [
    { chave: "razao_social", rotulo: "Cliente" }, { chave: "cnpj_cpf", rotulo: "CNPJ/CPF" }, { chave: "regime_atual", rotulo: "Regime" },
    { chave: "municipio", rotulo: "Município" }, { chave: "uf", rotulo: "UF" },
    { chave: "bpo", rotulo: "BPO fiscal", valor: (e) => SITUACOES[mapa.get(e.id)?.BPO_FISCAL?.situacao] || "" },
    { chave: "diag", rotulo: "Diagnóstico pontual", valor: (e) => SITUACOES[mapa.get(e.id)?.DIAGNOSTICO_PONTUAL?.situacao] || "" },
    { chave: "equipe", rotulo: "Equipe", valor: (e) => equipeDe(e.id).join(", ") },
    { chave: "tags", rotulo: "Etiquetas", valor: (e) => tagsDaEmpresa(porEmpresa, mapaTags, e.id).map((t) => t.nome).join(", ") },
    { chave: "grupo", rotulo: "Grupo econômico", valor: (e) => grupoDe(e)?.nome || "" },
    { chave: "email_contato", rotulo: "E-mail" }, { chave: "whatsapp_contato", rotulo: "WhatsApp" },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes" }]}
        title={`Clientes${empresas.length ? ` · ${empresas.length}` : ""}`}
        subtitle="Todos os clientes do escritório numa lista só. Marque os serviços de cada um na própria linha."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link to="/clientes/importacao" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"><Upload className="h-4 w-4" aria-hidden="true" /> Planilha cadastral</Link>
            <button type="button" onClick={() => setNovo(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo cliente</button>
          </div>
        )}
      />
      <div className="px-6 lg:px-8 py-5 space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros rápidos">
          {[...FILTROS_RAPIDOS, { id: "arquivados", rotulo: "Arquivados" }].map((f) => (
            <button key={f.id} type="button" aria-pressed={filtros.rapido === f.id} onClick={() => mudar("rapido", f.id)} className={`rounded-full px-3 py-1 text-sm ${filtros.rapido === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {f.rotulo} <span className="tabular-nums opacity-80">{contagem[f.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex-1 min-w-[220px] space-y-1"><span className="block text-xs text-muted-foreground">Buscar</span>
            <input type="search" className={`${campo} w-full`} placeholder="Nome, CNPJ/CPF, cidade ou grupo" value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Regime</span>
            <select className={campo} value={filtros.regime} onChange={(e) => mudar("regime", e.target.value)}><option value="">Todos</option>{regimes.map((r) => <option key={r}>{r}</option>)}<option value="—">Sem regime</option></select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">UF</span>
            <select className={campo} value={filtros.uf} onChange={(e) => mudar("uf", e.target.value)}><option value="">Todas</option>{ufs.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Colaborador</span>
            <select className={campo} value={filtros.colaborador} onChange={(e) => mudar("colaborador", e.target.value)}><option value="">Todos</option><option value="sem">Sem colaborador</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}</select></label>
          <button type="button" onClick={recarregar} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted" title="Buscar de novo"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Atualizar</button>
          <BotaoExportar titulo="Clientes" linhas={lista} colunas={colunasExport} />
          <Link to="/clientes/importacao" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted" title="Importar ou atualizar o cadastro por planilha"><Upload className="h-3.5 w-3.5" aria-hidden="true" /> Importar planilha</Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FiltroPorTags tags={tags} escolhidas={filtros.tags} modo={filtros.tagModo} aoMudar={(p) => setFiltros((f) => ({ ...f, ...p }))} />
          <ListasSalvas criterios={filtros} aoAplicar={(c) => setFiltros(aplicarCriterios(FILTROS_VAZIOS, c))} />
        </div>

        {selecionadas.length > 0 && (
          <div role="status" className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm">
            <span className="font-medium">{selecionadas.length} marcado(s)</span>
            <button type="button" onClick={() => setDialogo({ empresas: selecionadas, servico: null, tipoInicial: "BPO_FISCAL" })} className="rounded-md bg-primary px-3 py-1 text-primary-foreground">Ligar BPO fiscal</button>
            <button type="button" onClick={() => setDialogo({ empresas: selecionadas, servico: null, tipoInicial: "DIAGNOSTICO_PONTUAL" })} className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted">Ligar diagnóstico</button>
            <button type="button" onClick={() => setDialogoTags(selecionadas)} className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted">Etiquetar</button>
            {ehAdmin && <Link to="/clientes/carteira" className="rounded-md border border-border bg-background px-3 py-1 hover:bg-muted">Definir colaborador</Link>}
            {ehAdmin && (
              <button type="button" onClick={arquivarEmLote} disabled={!!excluindo} className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 bg-background px-3 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-60">
                {excluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
                {excluindo ? `${excluindo.feitas} de ${excluindo.total}…` : vendoArquivados ? "Desarquivar" : "Arquivar"}
              </button>
            )}
            <button type="button" onClick={() => setMarcadas(new Set())} className="ml-auto text-xs text-muted-foreground hover:underline">Limpar seleção</button>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-[13px] leading-5" aria-label="Clientes">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Marcar todos os clientes da lista" checked={todasMarcadas} onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(lista.map((e) => e.id)))} /></th>
                <th className="px-2 py-2">Cliente</th><th className="px-2 py-2">Regime</th><th className="px-2 py-2">Serviços</th><th className="px-2 py-2">Equipe</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td colSpan={5} className="py-10 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
              {!carregando && erro && <tr><td colSpan={5} className="py-10 text-center" role="alert">Não foi possível carregar os clientes. <button type="button" onClick={recarregar} className="text-primary hover:underline">Tentar de novo</button></td></tr>}
              {!carregando && !erro && lista.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">
                  {empresas.length === 0 ? <>Cadastre o primeiro cliente. <button type="button" onClick={() => setNovo(true)} className="text-primary hover:underline">Novo cliente</button></> : <>Nenhum cliente com esses filtros. <button type="button" onClick={() => setFiltros(FILTROS_VAZIOS)} className="text-primary hover:underline">Limpar filtros</button></>}
                </td></tr>
              )}
              {!carregando && lista.map((e) => {
                const porTipo = mapa.get(e.id) || {};
                const grupo = grupoDe(e);
                const equipe = equipeDe(e.id);
                return (
                  <tr key={e.id} onClick={() => setAberta(e.id)} className={`cursor-pointer border-b border-border/60 align-top last:border-0 hover:bg-muted/40 ${aberta === e.id ? "bg-muted/60" : ""}`}>
                    <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}><input type="checkbox" aria-label={`Marcar ${e.razao_social}`} checked={marcadas.has(e.id)} onChange={() => alternar(e.id)} /></td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); setAberta(e.id); }} className="text-left font-medium hover:text-primary hover:underline">{e.razao_social}</button>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{[mascararDocumento(e.cnpj_cpf), [e.municipio, e.uf].filter(Boolean).join("/"), rotuloDoGrupo(grupo)].filter(Boolean).join(" · ") || "—"}</p>
                      <EtiquetasDaEmpresa tags={tagsDaEmpresa(porEmpresa, mapaTags, e.id)} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{e.regime_atual || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{TIPOS_DE_SERVICO.map((tipo) => <ChipDeServico key={tipo} empresa={e} tipo={tipo} servico={porTipo[tipo]} aoEditar={() => setDialogo({ empresas: [e], servico: porTipo[tipo], tipoInicial: tipo })} />)}</div></td>
                    <td className="px-2 py-2 text-muted-foreground">{equipe.length ? equipe.join(", ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{lista.length} de {empresas.length} cliente(s). Clique no nome para ver a ficha; no "+" para ligar um serviço.</p>
      </div>

      <FichaRapida
        empresa={abertaAgora} porTipo={abertaAgora ? mapa.get(abertaAgora.id) || {} : {}} grupo={abertaAgora ? grupoDe(abertaAgora) : null}
        nomesDaEquipe={abertaAgora ? equipeDe(abertaAgora.id) : []} tags={abertaAgora ? tagsDaEmpresa(porEmpresa, mapaTags, abertaAgora.id) : []} grupos={grupos}
        aoFechar={() => setAberta(null)}
        aoEditarServico={(tipo) => setDialogo({ empresas: [abertaAgora], servico: (mapa.get(abertaAgora.id) || {})[tipo] || null, tipoInicial: tipo })}
        aoEditarDados={() => setEditando(abertaAgora)}
      />
      <NovoClienteDialog aberto={novo} aoFechar={() => setNovo(false)} grupos={grupos} colaboradores={colaboradores} />
      <EmpresaFormDialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)} editing={editando} grupoNumero={editando?.grupo} />
      {dialogo && <DialogoServico aberto empresas={dialogo.empresas} servico={dialogo.servico} tipoInicial={dialogo.tipoInicial} sugestoes={sugestoes} aoFechar={() => { setDialogo(null); setMarcadas(new Set()); }} />}
      {dialogoTags && <DialogoEtiquetas empresas={dialogoTags} tags={tags} porEmpresa={porEmpresa} aoSalvar={() => setMarcadas(new Set())} aoFechar={() => setDialogoTags(null)} />}
    </div>
  );
}
