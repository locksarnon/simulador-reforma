import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import SolicitacoesConsultoria from "@/components/consultoria/SolicitacoesConsultoria";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useCarteiras } from "@/lib/useCarteiras";
import { fmtDataCurta } from "@/lib/servicos";
import { SITUACOES_PROJETO } from "@/lib/projetos";

const campo = "rounded-md border bg-background px-3 py-2 text-sm";
const campoCompacto = "h-8 min-w-0 rounded-md border bg-background px-2 text-xs";
const botao = "inline-block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50";
const texto = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const chave = ({ publico, id }) => `${publico}:${id}`;
const documento = (s) => String(s ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const buscaCliente = (c, busca) => texto(c.nome).includes(texto(busca.trim()))
  || (documento(busca).length > 0 && documento(c.doc).includes(documento(busca)));
const compativel = (c, s) => c.publico === s.publico && !c.arquivado_em && (c.publico === "PF" || documento(c.doc).length === 14);

export default function ConsultoriaPagina({ carteira = false }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cadastro = useCarteiras();
  const pessoas = useQuery({ queryKey: ["pessoas-fisicas"], queryFn: () => api.get("/pessoas-fisicas") });
  const catalogo = useQuery({ queryKey: ["consultoria", "catalogo"], queryFn: () => api.get("/consultoria/catalogo") });
  const vinculos = useQuery({ queryKey: ["consultoria", "vinculos"], queryFn: () => api.get("/consultoria/vinculos") });
  const projetos = useQuery({ queryKey: ["projetos-diagnostico"], queryFn: () => api.get("/projetos-diagnostico") });
  const [publico, setPublico] = useState(carteira ? "" : "PF");
  const [area, setArea] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroServico, setFiltroServico] = useState("");
  const [filtroResponsavel, setFiltroResponsavel] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [escolha, setEscolha] = useState("");
  const [painel, setPainel] = useState(null);
  const [buscaPainel, setBuscaPainel] = useState("");
  const [documentos, setDocumentos] = useState(null);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const abrirProjeto = useMutation({
    mutationFn: (confirmar_sobreposicao) => api.post(`/consultoria/carteira/clientes/${cliente.id}/projetos`, {
      servico: escolha, periodo_inicio: de, periodo_fim: ate, confirmar_sobreposicao,
    }),
    onSuccess: (resultado) => {
      if (!resultado.id) return;
      qc.invalidateQueries({ queryKey: ["consultoria", "vinculos"] });
      qc.invalidateQueries({ queryKey: ["projetos-diagnostico"] });
      setPainel(null);
      navigate(`/diagnostico/projetos/${resultado.id}`);
    },
  });
  function configurar(servico = "") {
    abrirProjeto.reset();
    setEscolha(servico);
    setDe("");
    setAte("");
    setAdicionando(true);
  }
  function abrir(valores) {
    configurar();
    setAdicionando(Boolean(valores.adicionando));
    setBuscaPainel("");
    setPainel(valores);
  }
  const servicos = catalogo.data || [];
  const todos = [
    ...cadastro.todas.filter((c) => documento(c.cnpj_cpf).length === 14).map((c) => ({ ...c, publico: "PJ", nome: c.razao_social, doc: c.cnpj_cpf })),
    ...(pessoas.data || []).map((c) => ({ ...c, publico: "PF", doc: c.cpf })),
  ];
  const trabalhos = projetos.data || [];
  function itens(c) {
    return (vinculos.data || []).filter((v) => v.publico === c.publico && v.cliente_id === c.id)
      .map((v) => servicos.find((s) => s.id === v.servico)).filter(Boolean);
  }
  function projetosDe(c, servico) {
    return trabalhos.filter((p) => (c.publico === "PF" ? p.pessoa_fisica_id === c.id : p.empresa_ids.includes(c.id))
      && (!servico || p.servico_consultoria === servico));
  }
  const legados = new Set(cadastro.servicos.filter((s) => s.tipo === "DIAGNOSTICO_PONTUAL" && ["ATIVO", "PAUSADO"].includes(s.situacao)).map((s) => s.empresa_id));
  const areas = [...new Set(servicos.filter((s) => !publico || s.publico === publico).map((s) => s.area))];
  const candidatos = servicos.filter((s) => (!publico || s.publico === publico) && (!area || s.area === area));
  const lista = todos.filter((c) => {
    const ss = itens(c);
    const possuiServico = (area || filtroServico) ? ss.some((s) => (!area || s.area === area) && (!filtroServico || s.id === filtroServico)) : ss.length || (c.publico === "PJ" && legados.has(c.id));
    const pp = projetosDe(c, filtroServico).filter((p) => !area || ss.some((s) => s.id === p.servico_consultoria && s.area === area));
    const correspondem = pp.filter((p) => (!filtroResponsavel || p.responsavel === filtroResponsavel)
      && (!filtroSituacao || p.situacao === filtroSituacao));
    const semProjeto = ss.some((s) => (!area || s.area === area) && (!filtroServico || s.id === filtroServico) && !projetosDe(c, s.id).length);
    return !c.arquivado_em && possuiServico && (!publico || c.publico === publico) && buscaCliente(c, busca)
      && (filtroSituacao === "SEM_PROJETO" ? !filtroResponsavel && semProjeto : (!filtroSituacao && !filtroResponsavel) || correspondem.length > 0);
  }).map((c) => ({ ...c, idTabela: chave(c) }));
  const cliente = painel?.cliente;
  const grupoLegado = cliente?.publico === "PJ" && cadastro.grupos.find((g) => g.numero === cliente.grupo);
  const disponiveis = cliente ? servicos.filter((s) => compativel(cliente, s)) : [];
  const escolhido = disponiveis.find((s) => s.id === escolha);
  const titulo = carteira ? "Carteira de Consultoria" : "Serviços Tributários";
  const pendente = catalogo.isLoading || vinculos.isLoading || cadastro.carregando || pessoas.isLoading || projetos.isLoading;
  const erro = catalogo.error || vinculos.error || cadastro.erro || pessoas.error || projetos.error;

  const filtrosDeCatalogo = <>
          <select aria-label="Público" className={carteira ? campoCompacto + " w-[7rem]" : campo} value={publico} onChange={(e) => { setPublico(e.target.value); setArea(""); setFiltroServico(""); }}>
            {carteira && <option value="">PF e PJ</option>}<option value="PF">Pessoa Física</option><option value="PJ">Pessoa Jurídica</option>
          </select>
          <select aria-label="Área" className={carteira ? campoCompacto + " w-[8rem]" : campo} value={area} onChange={(e) => { setArea(e.target.value); setFiltroServico(""); }}><option value="">Todas as áreas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
  </>;

  return <div>
    <PageHeader crumbs={[{ label: "Consultoria Tributária", to: "/area/diagnostico" }, { label: titulo }]} title={titulo}
      actions={carteira && <button className={botao} onClick={() => abrir({ adicionando: true })}>Adicionar cliente à carteira</button>} />
    <div className="space-y-4 px-6 py-5 lg:px-8">
      {carteira && <Link to="/diagnostico/carteira" className="text-sm text-primary hover:underline">Ver carteira de diagnósticos anteriores</Link>}
      {erro && <p role="alert">Não foi possível carregar a Consultoria. Atualize a página para tentar novamente.</p>}
      {pendente && <p role="status">Carregando…</p>}
      {!erro && !pendente && <>
        {!carteira && <div className="flex flex-wrap gap-2">{filtrosDeCatalogo}</div>}
        {carteira ? <TabelaPadrao id="carteira-consultoria" ariaLabel={titulo} linhas={lista.map((c) => ({ ...c, id: c.idTabela, clienteOriginal: c }))} vazio="Nenhum cliente com esses filtros."
          filtrosExtras={<>{filtrosDeCatalogo}
            <input type="search" aria-label="Buscar cliente" className={carteira ? campoCompacto + " w-[9rem]" : campo} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou documento" />
            <select aria-label="Serviço" className={carteira ? campoCompacto + " w-[9rem]" : campo} value={filtroServico} onChange={(e) => setFiltroServico(e.target.value)}><option value="">Todos os serviços</option>{candidatos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
            <select aria-label="Responsável" className={carteira ? campoCompacto + " w-[8rem]" : campo} value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)}><option value="">Todos os responsáveis</option>{[...new Set(trabalhos.map((p) => p.responsavel).filter(Boolean))].sort().map((r) => <option key={r}>{r}</option>)}</select>
            <select aria-label="Situação" className={carteira ? campoCompacto + " w-[8rem]" : campo} value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value)}><option value="">Todas as situações</option><option value="SEM_PROJETO">Contratado · ainda não iniciado</option><option value="EM_ANDAMENTO">Em andamento</option><option value="PAUSADO">Pausado</option><option value="CONCLUIDO">Concluído</option><option value="CANCELADO">Cancelado</option></select>
          </>}
          aoClicarLinha={(c) => abrir({ cliente: c.clienteOriginal })}
          colunas={[
            { chave: "nome", rotulo: "Cliente", render: (c) => <button className="font-medium hover:underline" onClick={(e) => { e.stopPropagation(); abrir({ cliente: c.clienteOriginal }); }}>{c.nome}</button> },
            { chave: "doc", rotulo: "Documento" },
            { chave: "servicos", rotulo: "Serviços", render: (c) => itens(c.clienteOriginal).map((s) => s.nome).join(" · ") || "Diagnóstico existente" },
          ]} /> : areas.filter((a) => !area || a === area).map((a) => <section key={a} className="space-y-2">
          <h2 className="font-semibold">{a}</h2>
          <div className="grid gap-3 md:grid-cols-2">{servicos.filter((s) => s.area === a && s.publico === publico).map((s) => <article key={s.id} className="space-y-3 rounded-lg border bg-card p-4">
            <h3 className="font-medium">{s.nome}</h3>
            {!s.projeto && <p className="text-xs text-muted-foreground">Em desenvolvimento</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button className="text-sm text-primary hover:underline" onClick={() => setDocumentos({ servico: s, somenteModelo: true })}>Ver lista de documentos</button>
              {(s.acessos || []).map((l) => <Link className="text-sm text-primary hover:underline" key={l.rota} to={l.rota}>{l.nome}</Link>)}
            </div>
          </article>)}</div>
        </section>)}
      </>}
    </div>
    <Sheet open={painel !== null} onOpenChange={(v) => !v && setPainel(null)}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{cliente?.nome || "Adicionar cliente à carteira"}</SheetTitle><SheetDescription>{cliente ? "Serviços contratados e projetos do cliente" : "Selecione um cliente do cadastro para configurar o primeiro projeto."}</SheetDescription></SheetHeader>
        <div className="mt-5 space-y-3">
          {!cliente && <>
            <input type="search" aria-label="Buscar no cadastro" className={`${campo} w-full`} value={buscaPainel} onChange={(e) => setBuscaPainel(e.target.value)} placeholder="Nome, CPF ou CNPJ" />
            <ul className="max-h-96 space-y-1 overflow-auto">{todos.filter((c) => !c.arquivado_em && buscaCliente(c, buscaPainel)).slice(0, 50).map((c) => <li key={chave(c)}>
              <button className="w-full rounded border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => abrir({ cliente: c, adicionando: true })}>{c.nome} · {c.doc}</button>
            </li>)}</ul>
          </>}
          {cliente && <>
            {adicionando && <form className="space-y-3 rounded border p-3" onSubmit={(e) => {
              e.preventDefault();
              if (escolhido && de && ate && de <= ate) abrirProjeto.mutate(false);
            }}>
              <label className="block space-y-1 text-sm"><span>Serviço</span>
                <select className={`${campo} w-full`} value={escolha} disabled={abrirProjeto.isPending} onChange={(e) => { abrirProjeto.reset(); setEscolha(e.target.value); }} required>
                  <option value="">Selecione um serviço</option>{disponiveis.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-sm">De<input type="date" className={campo} value={de} disabled={abrirProjeto.isPending} onChange={(e) => { abrirProjeto.reset(); setDe(e.target.value); }} required /></label>
                <label className="grid gap-1 text-sm">Até<input type="date" className={campo} value={ate} min={de || undefined} disabled={abrirProjeto.isPending} onChange={(e) => { abrirProjeto.reset(); setAte(e.target.value); }} required /></label>
              </div>
              {abrirProjeto.data?.sobrepostos && <div className="space-y-2 text-sm">
                <p>Já há projetos com período sobreposto:</p>
                {abrirProjeto.data.sobrepostos.map((p) => <Link key={p.id} className="block text-primary underline" to={`/diagnostico/projetos/${p.id}`}>{p.nome} · {fmtDataCurta(p.periodo_inicio)} a {fmtDataCurta(p.periodo_fim)}</Link>)}
                <button type="button" className={botao} disabled={abrirProjeto.isPending} onClick={() => abrirProjeto.mutate(true)}>Criar novo projeto mesmo assim</button>
              </div>}
              {abrirProjeto.isError && <p role="alert">{abrirProjeto.error.message}</p>}
              <div className="flex gap-3">
                {!abrirProjeto.data?.sobrepostos && <button type="submit" className={botao} disabled={!escolhido || !de || !ate || de > ate || abrirProjeto.isPending}>Abrir projeto</button>}
                <button type="button" className="text-sm" disabled={abrirProjeto.isPending} onClick={() => setAdicionando(false)}>Cancelar</button>
              </div>
            </form>}
            {!adicionando && <button className={botao} onClick={() => configurar()}>Novo projeto</button>}
            {cliente.publico === "PJ" && <Link to={`/clientes/${cliente.id}`} className="text-sm text-primary hover:underline">Abrir ficha completa</Link>}
            {grupoLegado && <Link to={`/workroom/${grupoLegado.id}/empresas/${cliente.id}/servicos`} className="block text-sm text-primary hover:underline">Ferramentas e análises da empresa</Link>}
            {itens(cliente).map((s) => {
              const pp = projetosDe(cliente, s.id);
              return <article key={s.id} className="space-y-2 rounded border p-3"><h3 className="font-medium">{s.nome}</h3>
                {!pp.length && <p className="text-xs text-muted-foreground">Contratado · ainda não iniciado</p>}
                {pp.map((p) => <Link key={p.id} className="block text-sm text-primary hover:underline" to={`/diagnostico/projetos/${p.id}`}>Continuar projeto · {fmtDataCurta(p.periodo_inicio)} a {fmtDataCurta(p.periodo_fim)} · {!s.projeto && p.situacao === "EM_ANDAMENTO" ? "Em coleta de documentos" : SITUACOES_PROJETO[p.situacao]?.rotulo || p.situacao}</Link>)}
                {!pp.length && !adicionando && <button className="text-sm text-primary hover:underline" onClick={() => configurar(s.id)}>Abrir primeiro projeto</button>}
              </article>;
            })}
            {projetosDe(cliente).filter((p) => !p.servico_consultoria).map((p) => <Link key={p.id} className="block text-sm text-primary hover:underline" to={`/diagnostico/projetos/${p.id}`}>{p.nome} · Diagnóstico existente</Link>)}
          </>}
        </div>
      </SheetContent>
    </Sheet>
    {documentos && <SolicitacoesConsultoria {...documentos} aoFechar={() => setDocumentos(null)} />}
  </div>;
}
