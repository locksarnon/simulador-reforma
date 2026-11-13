import { useMemo, useState } from "react";
import TabelaPadrao from "@/components/TabelaPadrao";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useCarteiras } from "@/lib/useCarteiras";
import { fmtDataCurta, MODULOS_BPO, naCarteira, SITUACOES, TIPOS, TOM_DA_SITUACAO } from "@/lib/servicos";
import { caminhoDoRepositorio } from "@/lib/bpoCaminhos";
import { aplicarCriterios, filtrarPorColaborador, filtrarPorTags, tagsDaEmpresa } from "@/lib/tags";
import { useColaboradores, useTags } from "@/lib/useTags";
import DialogoEtiquetas from "@/components/clientes/DialogoEtiquetas";
import FiltroPorTags from "@/components/clientes/FiltroPorTags";
import ListasSalvas from "@/components/clientes/ListasSalvas";
import { EtiquetasDaEmpresa } from "@/components/clientes/TagChip";
import { plural } from "@/lib/plural";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const digitos = (s) => String(s || "").replace(/\D/g, "");
const FILTROS_VAZIOS = { busca: "", situacao: "", grupo: "", tags: [], tagModo: "qualquer", colaborador: "" };

/** Caminhos que a carteira oferece para entrar numa empresa. */
const ACOES = {
  BPO_FISCAL: (e) => [{ rotulo: "Captura de XML", to: caminhoDoRepositorio(e.id) }],
  DIAGNOSTICO_PONTUAL: (e, g) => (g ? [{ rotulo: "Abrir diagnóstico", to: `/workroom/${g.id}/empresas/${e.id}` }] : []),
};

/**
 * Carteira de uma área: as empresas que contrataram aquele serviço (ativo ou pausado), com responsável, início e o caminho para
 * trabalhar em cada uma. Se nada foi marcado ainda, a página explica como marcar e oferece ver todas as empresas.
 */
export default function CarteiraPagina({ tipo, area, titulo, subtitulo }) {
  const { empresas, grupos, servicos, mapa, carregando, erro, recarregar } = useCarteiras();
  const { tags, porEmpresa, mapa: mapaTags } = useTags();
  const { data: colaboradores = [] } = useColaboradores();
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [todas, setTodas] = useState(false);
  const [dialogoTags, setDialogoTags] = useState(null); // empresa a etiquetar

  const daCarteira = useMemo(() => empresas.filter((e) => naCarteira(mapa.get(e.id)?.[tipo])), [empresas, mapa, tipo]);
  const ninguemMarcado = !carregando && !erro && servicos.length > 0 && daCarteira.length === 0;
  const base = todas ? empresas : daCarteira;
  const lista = useMemo(() => {
    const t = semAcento(filtros.busca).trim();
    const d = digitos(filtros.busca);
    const buscadas = base.filter((e) => (!filtros.grupo || e.grupo === filtros.grupo)
      && (!filtros.situacao || mapa.get(e.id)?.[tipo]?.situacao === filtros.situacao)
      && (!t || semAcento(e.razao_social).includes(t) || semAcento(e.id_empresa).includes(t) || (d.length >= 3 && digitos(e.cnpj_cpf).includes(d))));
    return filtrarPorColaborador(filtrarPorTags(buscadas, porEmpresa, filtros.tags, filtros.tagModo), colaboradores, filtros.colaborador)
      .sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR"));
  }, [base, filtros, mapa, tipo, porEmpresa, colaboradores]);
  const mudar = (chave, valor) => setFiltros((f) => ({ ...f, [chave]: valor }));
  const grupoDe = (e) => grupos.find((g) => g.numero === e.grupo);
  const servicoDe = (e) => mapa.get(e.id)?.[tipo];
  const nomeDoGrupo = (e) => { const g = grupoDe(e); return g ? `${g.numero} ${g.nome}` : e.grupo || ""; };
  const colunas = [
    { chave: "razao_social", rotulo: "Empresa", render: (e) => <span className="font-medium">{e.razao_social}</span> },
    { chave: "documento", rotulo: "CNPJ/CPF", valor: (e) => e.cnpj_cpf || e.id_empresa || "", render: (e) => <span className="tabular-nums text-muted-foreground">{e.cnpj_cpf || e.id_empresa || "—"}</span> },
    { chave: "tags", rotulo: "Etiquetas", valor: (e) => tagsDaEmpresa(porEmpresa, mapaTags, e.id).map((t) => t.nome).join(", "), render: (e) => <EtiquetasDaEmpresa tags={tagsDaEmpresa(porEmpresa, mapaTags, e.id)} aoEditar={() => setDialogoTags([e])} /> },
    { chave: "grupo", rotulo: "Grupo", valor: nomeDoGrupo, render: (e) => <span className="text-muted-foreground">{nomeDoGrupo(e) || "—"}</span> },
    { chave: "situacao", rotulo: "Situação", valor: (e) => { const s = servicoDe(e); return s ? SITUACOES[s.situacao] || s.situacao : "Sem serviço"; },
      render: (e) => { const s = servicoDe(e); return s ? <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_DA_SITUACAO[s.situacao] || "bg-muted"}`}>{SITUACOES[s.situacao] || s.situacao}</span> : <span className="text-muted-foreground">Sem serviço</span>; } },
    { chave: "responsavel", rotulo: "Responsável", valor: (e) => servicoDe(e)?.responsavel || "", render: (e) => servicoDe(e)?.responsavel || "—" },
    { chave: "inicio", rotulo: "Desde", tipo: "data", valor: (e) => servicoDe(e)?.inicio || "", render: (e) => fmtDataCurta(servicoDe(e)?.inicio) },
    ...(tipo === "BPO_FISCAL" ? [{ chave: "modulos", rotulo: "Módulos ligados", valor: (e) => (servicoDe(e)?.modulos || []).map((m) => MODULOS_BPO[m] || m).join(", "), render: (e) => <span className="text-[11px] text-muted-foreground">{(servicoDe(e)?.modulos || []).map((m) => MODULOS_BPO[m] || m).join(", ") || "—"}</span> }] : []),
    { chave: "acesso", rotulo: "Ir para", ordenavel: false, filtravel: false, valor: () => "",
      render: (e) => <div className="flex gap-3">{ACOES[tipo](e, grupoDe(e)).map((a) => <Link key={a.to} to={a.to} className="text-primary hover:underline">{a.rotulo}</Link>)}</div> },
  ];

  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: area.titulo, to: `/area/${area.id}` }, { label: titulo }]} title={titulo} subtitle={subtitulo} />
      <div className="px-6 lg:px-8 py-6 space-y-4">
        {ninguemMarcado && !todas && (
          <div role="status" className="rounded-xl border border-amber-400/60 bg-card p-4 text-sm space-y-2">
            <p className="font-medium">Nenhuma empresa está na carteira de {TIPOS[tipo].toLowerCase()} ainda.</p>
            
            <div className="flex gap-2">
              <Link to="/clientes/servicos-contratados" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">Definir a carteira</Link>
              <button type="button" onClick={() => setTodas(true)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Ver todas as empresas</button>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1 flex-1 min-w-[200px]"><span className="block text-xs text-muted-foreground">Buscar (nome, código ou CNPJ)</span>
              <input type="search" className={`${campo} w-full`} value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span>
              <select className={campo} value={filtros.situacao} onChange={(e) => mudar("situacao", e.target.value)}>
                <option value="">Todas</option>{Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Grupo</span>
              <select className={campo} value={filtros.grupo} onChange={(e) => mudar("grupo", e.target.value)}>
                <option value="">Todos</option>{grupos.map((g) => <option key={g.id} value={g.numero}>{g.numero} {g.nome}</option>)}
              </select></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Colaborador</span>
              <select className={campo} value={filtros.colaborador} onChange={(e) => mudar("colaborador", e.target.value)}>
                <option value="">Todos</option><option value="sem">Sem colaborador</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
              </select></label>
            {(todas || daCarteira.length > 0) && (
              <label className="flex items-center gap-2 pb-1.5"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> <span>Mostrar todas as empresas</span></label>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FiltroPorTags tags={tags} escolhidas={filtros.tags} modo={filtros.tagModo} aoMudar={(p) => setFiltros((f) => ({ ...f, ...p }))} />
            <ListasSalvas criterios={filtros} aoAplicar={(c) => setFiltros(aplicarCriterios(FILTROS_VAZIOS, c))} />
          </div>
          {carregando && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
          {!carregando && erro && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar. <button type="button" onClick={recarregar} className="text-primary hover:underline">Tentar de novo</button></p>}
          {!carregando && !erro && (
            <TabelaPadrao
              id={`carteira-${tipo}`} ariaLabel={`Empresas da carteira: ${titulo}`} titulo={titulo} colunas={colunas} linhas={lista}
              vazio={ninguemMarcado ? "Nenhuma empresa na carteira." : servicos.length === 0 && empresas.length === 0 ? "Nenhuma empresa cadastrada." : "Nenhuma empresa com esses filtros."}
            />
          )}
          <p className="text-xs text-muted-foreground">{plural(lista.length, "empresa", "empresas")} {todas ? "(todas)" : "na carteira"}.</p>
        </div>
      </div>
      {dialogoTags && <DialogoEtiquetas empresas={dialogoTags} tags={tags} porEmpresa={porEmpresa} aoFechar={() => setDialogoTags(null)} />}
    </div>
  );
}
