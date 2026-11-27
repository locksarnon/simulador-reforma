import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { usePermissoes } from "@/lib/usePermissao";
import InterruptorCaptura from "@/components/repositorio-xml/InterruptorCaptura";
import { Archive, ArrowRight, Loader2, Pencil, Plus, Upload } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmar } from "@/components/ConfirmProvider";
import { toast } from "@/components/ui/use-toast";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import BotaoFiltro from "@/components/BotaoFiltro";
import { botaoBarraCls, campoBarraCls } from "@/lib/estiloTabela";
import EmpresaFormDialog from "@/components/empresas/EmpresaFormDialog";
import DialogoServico from "@/components/clientes/DialogoServico";
import DialogoEtiquetas from "@/components/clientes/DialogoEtiquetas";
import NovoClienteDialog from "@/components/clientes/NovoClienteDialog";
import ChipDeServico from "@/components/clientes/ChipDeServico";
import AtalhosDoCliente from "@/components/clientes/AtalhosDoCliente";
import ServicosConsultoria, { useCatalogoConsultoria, useVinculosConsultoria } from "@/components/clientes/ServicosConsultoria";
import DialogoVincularConsultoria from "@/components/clientes/DialogoVincularConsultoria";
import FiltroPorTags from "@/components/clientes/FiltroPorTags";
import ListasSalvas from "@/components/clientes/ListasSalvas";
import { EtiquetasDaEmpresa } from "@/components/clientes/TagChip";
import { useCarteiras } from "@/lib/useCarteiras";
import { useColaboradores, useTags } from "@/lib/useTags";
import { aplicarCriterios, filtrarPorColaborador, filtrarPorTags, tagsDaEmpresa } from "@/lib/tags";
import { contarRapidos, filtrarClientes, FILTROS_RAPIDOS, grupoVisivel, mascararDocumento, rotuloDoGrupo } from "@/lib/clientes";
import { SITUACOES, TIPOS_OFERECIDOS } from "@/lib/servicos";
import { indexarConsultoria, temCnpj } from "@/lib/consultoria";
import { arquivarCliente, CHAVES_APOS_ARQUIVAR, desarquivarCliente, TEXTO_ARQUIVAR } from "@/lib/arquivamento";
import { plural, palavra } from "@/lib/plural";

const FILTROS_VAZIOS = { busca: "", rapido: "todos", regime: "", uf: "", tags: [], tagModo: "qualquer", colaborador: "" };
const TIPOS_DE_SERVICO = Object.keys(TIPOS_OFERECIDOS);

/** Selo da Consultoria Tributária na linha do cliente: os serviços vinculados ou "+ Consultoria" para vincular. */
function SeloConsultoria({ empresa, servicos, aoAbrir }) {
  if (!temCnpj(empresa.cnpj_cpf)) return <span className="text-[11px] text-muted-foreground" title="A consultoria exige CNPJ completo.">—</span>;
  const nomes = servicos.map((s) => s.nome).join(" · ");
  if (servicos.length) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); aoAbrir(); }} title={`${nomes}. Clique para ver ou vincular outro.`} className="rounded bg-emerald-100 px-1.5 py-0.5 text-left text-[11px] font-medium leading-4 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
        {servicos.length === 1 ? servicos[0].nome : `${servicos.length} serviços`}
      </button>
    );
  }
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); aoAbrir(); }} aria-label={`Vincular consultoria para ${empresa.razao_social}`} className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground hover:border-primary hover:text-primary">
      <Plus className="h-3 w-3" aria-hidden="true" />Consultoria
    </button>
  );
}

/** Ficha rápida do cliente, ao lado da lista: dados, serviços e atalhos. */
function FichaRapida({ empresa, porTipo, grupo, nomesDaEquipe, tags, aoFechar, aoEditarServico, aoEditarDados }) {
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
              <button type="button" onClick={() => navigate(`/clientes/${empresa.id}`)} className="botao-acao inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground">Abrir ficha completa <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" onClick={aoEditarDados} className="botao-acao inline-flex items-center gap-1.5 rounded-md px-3 py-[5px] hover:bg-muted"><Pencil className="h-4 w-4" aria-hidden="true" /> Editar dados</button>
            </div>
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Serviços contratados</h3>
              {TIPOS_DE_SERVICO.map((tipo) => {
                const s = porTipo[tipo];
                return (
                  <div key={tipo} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                    <div><p className="font-medium">{TIPOS_OFERECIDOS[tipo]}</p><p className="text-xs text-muted-foreground">{s ? `${SITUACOES[s.situacao]}${s.responsavel ? ` · ${s.responsavel}` : ""}` : "Não contratado"}</p></div>
                    <ChipDeServico empresa={empresa} tipo={tipo} servico={s} aoEditar={() => aoEditarServico(tipo)} />
                  </div>
                );
              })}
              {temCnpj(empresa.cnpj_cpf)
                ? <ServicosConsultoria publico="PJ" clienteId={empresa.id} somenteLeitura={!!empresa.arquivado_em} />
                : <p className="text-xs text-muted-foreground">Consultoria Tributária: disponível para cliente com CNPJ.</p>}
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
              <AtalhosDoCliente empresa={empresa} />
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
/** Certificado A1 do cliente: validade e situação (vencido, vence em 30 dias, válido) ou "sem certificado". */
export function SeloCertificado({ certificado }) {
  if (!certificado) return <span className="text-[11px] text-muted-foreground">Sem certificado</span>;
  const tom = certificado.situacao === "VENCIDO" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : certificado.situacao === "A_VENCER" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${tom}`} title={certificado.titular || undefined}>{new Date(certificado.valido_ate).toLocaleDateString("pt-BR")}</span>;
}

export default function ClientesPagina() {
  const captura = useQuery({ queryKey: ["captura-xml", "empresas"], queryFn: () => api.get("/captura-xml/empresas"), staleTime: 60_000 });
  const { user } = useAuth();
  const ehAdmin = user?.role === "admin";
  const { pode } = usePermissoes();
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
  const [vinculando, setVinculando] = useState(null);
  const [dialogoTags, setDialogoTags] = useState(null);
  const catalogo = useCatalogoConsultoria();
  const vinculos = useVinculosConsultoria();
  const consultoriaDe = useMemo(() => indexarConsultoria(vinculos.data, catalogo.data), [vinculos.data, catalogo.data]);
  const comConsultoria = useMemo(() => new Set(consultoriaDe.keys()), [consultoriaDe]);
  const [excluindo, setExcluindo] = useState(null);
  const vendoArquivados = filtros.rapido === "arquivados";
  const empresas = vendoArquivados ? arquivadas : ativas;

  const atendidas = useMemo(() => new Set(colaboradores.flatMap((c) => c.empresa_ids || [])), [colaboradores]);
  const equipeDe = (id) => colaboradores.filter((c) => (c.empresa_ids || []).includes(id)).map((c) => c.name || c.email);
  const grupoDe = (e) => grupoVisivel(grupos.find((g) => g.numero === e.grupo), empresas);
  const contagem = useMemo(() => ({ ...contarRapidos(ativas, mapa, atendidas, comConsultoria), arquivados: arquivadas.length }), [ativas, arquivadas, mapa, atendidas, comConsultoria]);
  const regimes = useMemo(() => [...new Set(empresas.map((e) => e.regime_atual).filter(Boolean))].sort(), [empresas]);
  const ufs = useMemo(() => [...new Set(empresas.map((e) => e.uf).filter(Boolean))].sort(), [empresas]);
  const lista = useMemo(() => {
    const base = filtrarClientes(empresas, vendoArquivados ? { ...filtros, rapido: "todos" } : filtros, mapa, grupos, atendidas, comConsultoria);
    return filtrarPorColaborador(filtrarPorTags(base, porEmpresa, filtros.tags, filtros.tagModo), colaboradores, filtros.colaborador);
  }, [empresas, filtros, mapa, grupos, atendidas, porEmpresa, colaboradores, vendoArquivados, comConsultoria]);
  const sugestoes = useMemo(() => [...new Set(servicos.map((s) => s.responsavel).filter(Boolean))].sort(), [servicos]);
  const mudar = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));
  const selecionadas = empresas.filter((e) => marcadas.has(e.id));
  const abertaAgora = aberta ? empresas.find((e) => e.id === aberta) : null;

  const arquivarEmLote = async () => {
    const alvo = [...selecionadas];
    const desarquivar = vendoArquivados;
    const nomes = alvo.slice(0, 5).map((e) => e.razao_social).join("; ") + (alvo.length > 5 ? ` e mais ${alvo.length - 5}` : "");
    if (!(await confirmar({ titulo: `${desarquivar ? "Desarquivar" : "Arquivar"} ${plural(alvo.length, "cliente", "clientes")}?`, descricao: `${nomes}. ${desarquivar ? "Eles voltam às listas; os serviços continuam pausados até você ligar de novo." : TEXTO_ARQUIVAR}`, rotulo: desarquivar ? "Desarquivar" : "Arquivar" }))) return;
    const falhas = [];
    setExcluindo({ feitas: 0, total: alvo.length });
    for (const [i, e] of alvo.entries()) {
      try { await (desarquivar ? desarquivarCliente(e.id) : arquivarCliente(e.id)); } catch { falhas.push(e.razao_social); }
      setExcluindo({ feitas: i + 1, total: alvo.length });
    }
    setExcluindo(null); setMarcadas(new Set());
    CHAVES_APOS_ARQUIVAR.forEach((k) => qc.invalidateQueries({ queryKey: k })); recarregar();
    toast(falhas.length ? { title: `${alvo.length - falhas.length} de ${alvo.length} feitos`, description: `Não mudaram: ${falhas.join("; ")}.`, variant: "destructive" } : { title: `${plural(alvo.length, "cliente", "clientes")} ${desarquivar ? palavra(alvo.length, "desarquivado", "desarquivados") : palavra(alvo.length, "arquivado", "arquivados")}` });
  };

  const ver = (texto) => texto || <span className="text-muted-foreground">—</span>;
  const colunas = [
    { chave: "razao_social", rotulo: "Cliente", render: (e) => <button type="button" onClick={(ev) => { ev.stopPropagation(); setAberta(e.id); }} className="text-left font-medium hover:text-primary hover:underline">{e.razao_social}</button> },
    { chave: "cnpj_cpf", rotulo: "CNPJ/CPF", valor: (e) => mascararDocumento(e.cnpj_cpf), render: (e) => <span className="tabular-nums">{ver(mascararDocumento(e.cnpj_cpf))}</span> },
    { chave: "regime_atual", rotulo: "Regime", render: (e) => ver(e.regime_atual) },
    { chave: "municipio", rotulo: "Município", render: (e) => ver(e.municipio) },
    { chave: "uf", rotulo: "UF", render: (e) => ver(e.uf) },
    { chave: "grupo", rotulo: "Grupo econômico", valor: (e) => rotuloDoGrupo(grupoDe(e)) || "", render: (e) => ver(rotuloDoGrupo(grupoDe(e))) },
    { chave: "tags", rotulo: "Etiquetas", valor: (e) => tagsDaEmpresa(porEmpresa, mapaTags, e.id).map((t) => t.nome).join(", "), render: (e) => <EtiquetasDaEmpresa tags={tagsDaEmpresa(porEmpresa, mapaTags, e.id)} /> },
    ...TIPOS_DE_SERVICO.map((tipo) => ({
      chave: `servico_${tipo}`, rotulo: TIPOS_OFERECIDOS[tipo], valor: (e) => SITUACOES[mapa.get(e.id)?.[tipo]?.situacao] || "",
      render: (e) => { const porTipo = mapa.get(e.id) || {}; return <ChipDeServico empresa={e} tipo={tipo} servico={porTipo[tipo]} aoEditar={() => setDialogo({ empresas: [e], servico: porTipo[tipo], tipoInicial: tipo })} />; },
    })),
    { chave: "consultoria", rotulo: "Consultoria", valor: (e) => (consultoriaDe.get(e.id) || []).map((s) => s.nome).join(", "),
      render: (e) => <SeloConsultoria empresa={e} servicos={consultoriaDe.get(e.id) || []} aoAbrir={() => setAberta(e.id)} /> },
    { chave: "equipe", rotulo: "Equipe", valor: (e) => equipeDe(e.id).join(", "), render: (e) => <span className="text-muted-foreground">{equipeDe(e.id).join(", ") || "—"}</span> },
    { chave: "certificado", rotulo: "Certificado", tipo: "data", valor: (e) => captura.data?.[e.id]?.certificado?.valido_ate || "", render: (e) => <SeloCertificado certificado={captura.data?.[e.id]?.certificado} /> },
    { chave: "captura", rotulo: "Captura de XML", valor: (e) => (captura.data?.[e.id]?.ligada ? "Ligada" : "Desligada"), render: (e) => <InterruptorCaptura compacto empresaId={e.id} ligada={!!captura.data?.[e.id]?.ligada} certificadoOk={["VALIDO", "A_VENCER"].includes(captura.data?.[e.id]?.certificado?.situacao)} /> },
    { chave: "email_contato", rotulo: "E-mail", render: (e) => ver(e.email_contato) },
    { chave: "whatsapp_contato", rotulo: "WhatsApp", render: (e) => ver(e.whatsapp_contato) },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes" }]}
        title="Clientes"
      />
      <div className="px-6 lg:px-8 py-5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros rápidos">
            {[...FILTROS_RAPIDOS, { id: "arquivados", rotulo: "Arquivados" }].map((f) => (
              <BotaoFiltro key={f.id} ativo={filtros.rapido === f.id} contagem={contagem[f.id] ?? 0} onClick={() => mudar("rapido", f.id)}>{f.rotulo}</BotaoFiltro>
            ))}
          </div>
          <button type="button" onClick={() => setNovo(true)} className="botao-acao ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo cliente</button>
        </div>


        {selecionadas.length > 0 && (
          <div role="status" className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm">
            <span className="font-medium">{plural(selecionadas.length, "marcado", "marcados")}</span>
            <button type="button" onClick={() => setDialogo({ empresas: selecionadas, servico: null, tipoInicial: "BPO_FISCAL" })} className="botao-acao rounded-md bg-primary px-3 py-0.5 text-primary-foreground">Ligar BPO fiscal</button>
            {!vendoArquivados && <button type="button" onClick={() => setVinculando(selecionadas)} className="botao-acao rounded-md bg-background px-3 py-[3px] hover:bg-muted">Vincular consultoria</button>}
            <button type="button" onClick={() => setDialogoTags(selecionadas)} className="botao-acao rounded-md bg-background px-3 py-[3px] hover:bg-muted">Etiquetar</button>
            {ehAdmin && <Link to="/clientes/carteira" className="botao-acao rounded-md bg-background px-3 py-[3px] hover:bg-muted">Definir colaborador</Link>}
            {pode("arquivar_clientes") && (
              <button type="button" onClick={arquivarEmLote} disabled={!!excluindo} className="botao-acao botao-acao-perigo inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-[3px] text-destructive hover:bg-destructive/10 disabled:opacity-60">
                {excluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
                {excluindo ? `${excluindo.feitas} de ${excluindo.total}…` : vendoArquivados ? "Desarquivar" : "Arquivar"}
              </button>
            )}
            <button type="button" onClick={() => setMarcadas(new Set())} className="ml-auto text-xs text-muted-foreground hover:underline">Limpar seleção</button>
          </div>
        )}

        {carregando && <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {!carregando && erro && <p className="py-10 text-center text-sm" role="alert">Não foi possível carregar os clientes. <button type="button" onClick={recarregar} className="text-primary hover:underline">Tentar de novo</button></p>}
        {!carregando && !erro && (
          <TabelaPadrao
            id="clientes-lista" ariaLabel="Clientes" colunas={colunas} linhas={lista}
            busca={{ valor: filtros.busca, aoMudar: (v) => mudar("busca", v), placeholder: "Nome, CNPJ/CPF, cidade ou grupo", rotulo: "Buscar clientes por nome, CNPJ/CPF, cidade ou grupo" }}
            filtrosExtras={<>
              <select aria-label="Regime" className={campoBarraCls} value={filtros.regime} onChange={(e) => mudar("regime", e.target.value)}><option value="">Regime: todos</option>{regimes.map((r) => <option key={r}>{r}</option>)}<option value="—">Sem regime</option></select>
              <select aria-label="UF" className={campoBarraCls} value={filtros.uf} onChange={(e) => mudar("uf", e.target.value)}><option value="">UF: todas</option>{ufs.map((u) => <option key={u}>{u}</option>)}</select>
              <select aria-label="Colaborador" className={`${campoBarraCls} max-w-[12rem]`} value={filtros.colaborador} onChange={(e) => mudar("colaborador", e.target.value)}><option value="">Colaborador: todos</option><option value="sem">Sem colaborador</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}</select>
              <FiltroPorTags compacto tags={tags} escolhidas={filtros.tags} modo={filtros.tagModo} aoMudar={(p) => setFiltros((f) => ({ ...f, ...p }))} />
              <ListasSalvas criterios={filtros} aoAplicar={(c) => setFiltros(aplicarCriterios(FILTROS_VAZIOS, c))} />
            </>}
            acoes={<Link to="/clientes/importacao" className={botaoBarraCls} title="Importar ou atualizar o cadastro por planilha"><Upload className="h-3.5 w-3.5" aria-hidden="true" /> Importar planilha</Link>}
            selecao={{ marcadas, aoMudar: setMarcadas }}
            aoClicarLinha={(e) => setAberta(e.id)}
            destaqueLinha={(e) => (aberta === e.id ? "bg-muted/60" : "")}
            vazio={empresas.length === 0 ? <>Cadastre o primeiro cliente. <button type="button" onClick={() => setNovo(true)} className="text-primary hover:underline">Novo cliente</button></> : <>Nenhum cliente com esses filtros. <button type="button" onClick={() => setFiltros(FILTROS_VAZIOS)} className="text-primary hover:underline">Limpar filtros</button></>}
          />
        )}
        <p className="text-xs text-muted-foreground">{lista.length} de {plural(empresas.length, "cliente", "clientes")}</p>
      </div>

      <FichaRapida
        empresa={abertaAgora} porTipo={abertaAgora ? mapa.get(abertaAgora.id) || {} : {}} grupo={abertaAgora ? grupoDe(abertaAgora) : null}
        nomesDaEquipe={abertaAgora ? equipeDe(abertaAgora.id) : []} tags={abertaAgora ? tagsDaEmpresa(porEmpresa, mapaTags, abertaAgora.id) : []}
        aoFechar={() => setAberta(null)}
        aoEditarServico={(tipo) => setDialogo({ empresas: [abertaAgora], servico: (mapa.get(abertaAgora.id) || {})[tipo] || null, tipoInicial: tipo })}
        aoEditarDados={() => setEditando(abertaAgora)}
      />
      <NovoClienteDialog aberto={novo} aoFechar={() => setNovo(false)} grupos={grupos} colaboradores={colaboradores} />
      <EmpresaFormDialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)} editing={editando} grupoNumero={editando?.grupo} />
      {dialogo && <DialogoServico aberto empresas={dialogo.empresas} servico={dialogo.servico} tipoInicial={dialogo.tipoInicial} sugestoes={sugestoes} aoFechar={() => { setDialogo(null); setMarcadas(new Set()); }} />}
      {vinculando && <DialogoVincularConsultoria empresas={vinculando} aoFechar={() => { setVinculando(null); setMarcadas(new Set()); }} />}
      {dialogoTags && <DialogoEtiquetas empresas={dialogoTags} tags={tags} porEmpresa={porEmpresa} aoSalvar={() => setMarcadas(new Set())} aoFechar={() => setDialogoTags(null)} />}
    </div>
  );
}
