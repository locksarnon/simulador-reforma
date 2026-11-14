import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import SolicitacoesConsultoria from "@/components/consultoria/SolicitacoesConsultoria";
import NovoClienteDialog from "@/components/clientes/NovoClienteDialog";
import { DialogoPessoa } from "@/pages/clientes/PessoasFisicasPagina";
import NovoDiagnosticoDialog from "@/components/diagnostico/NovoDiagnosticoDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useCarteiras } from "@/lib/useCarteiras";
import { SITUACOES_PROJETO } from "@/lib/projetos";

const campo = "rounded-md border bg-background px-3 py-2 text-sm";
const botao = "inline-block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50";
const texto = (s) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const chave = ({ publico, id }) => `${publico}:${id}`;
const documento = (s) => String(s ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const buscaCliente = (c, busca) => texto(c.nome).includes(texto(busca.trim()))
  || (documento(busca).length > 0 && documento(c.doc).includes(documento(busca)));
const compativel = (c, s) => c.publico === s.publico && !c.arquivado_em && (c.publico === "PF" || documento(c.doc).length === 14);

export default function ConsultoriaPagina({ carteira = false }) {
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
  const [painel, setPainel] = useState(null);
  const [buscaPainel, setBuscaPainel] = useState("");
  const [documentos, setDocumentos] = useState(null);
  const [novoCadastro, setNovoCadastro] = useState(null);
  const [novo, setNovo] = useState(null);
  const salvar = useMutation({
    mutationFn: ({ cliente, servico }) => api.post("/consultoria/vinculos", { cliente_id: cliente.id, servico: servico.id }),
    onSuccess: (_, { cliente }) => { qc.invalidateQueries({ queryKey: ["consultoria", "vinculos"] }); setPainel({ cliente }); },
  });
  function abrir(valores) { salvar.reset(); setBuscaPainel(""); setPainel(valores); }
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
    return c.publico === "PJ" ? trabalhos.filter((p) => p.empresa_ids.includes(c.id) && (!servico || p.servico_consultoria === servico)) : [];
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
  const servico = painel?.servico;
  const titulo = carteira ? "Carteira de Consultoria" : "Serviços Tributários";
  const pendente = catalogo.isLoading || vinculos.isLoading || cadastro.carregando || pessoas.isLoading || projetos.isLoading;
  const erro = catalogo.error || vinculos.error || cadastro.erro || pessoas.error || projetos.error;

  return <div>
    <PageHeader crumbs={[{ label: "Consultoria Tributária", to: "/area/diagnostico" }, { label: titulo }]} title={titulo}
      actions={carteira && <button className={botao} onClick={() => abrir({})}>Vincular cliente a um serviço</button>} />
    <div className="space-y-4 px-6 py-5 lg:px-8">
      {carteira && <Link to="/diagnostico/carteira" className="text-sm text-primary hover:underline">Ver carteira de diagnósticos anteriores</Link>}
      {erro && <p role="alert">Não foi possível carregar a Consultoria. Atualize a página para tentar novamente.</p>}
      {pendente && <p role="status">Carregando…</p>}
      {!erro && !pendente && <>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Público" className={campo} value={publico} onChange={(e) => { setPublico(e.target.value); setArea(""); setFiltroServico(""); }}>
            {carteira && <option value="">PF e PJ</option>}<option value="PF">Pessoa Física</option><option value="PJ">Pessoa Jurídica</option>
          </select>
          <select aria-label="Área" className={campo} value={area} onChange={(e) => { setArea(e.target.value); setFiltroServico(""); }}><option value="">Todas as áreas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
          {carteira && <>
            <input type="search" aria-label="Buscar cliente" className={campo} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou documento" />
            <select aria-label="Serviço" className={campo} value={filtroServico} onChange={(e) => setFiltroServico(e.target.value)}><option value="">Todos os serviços</option>{candidatos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
            <select aria-label="Responsável" className={campo} value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)}><option value="">Todos os responsáveis</option>{[...new Set(trabalhos.map((p) => p.responsavel).filter(Boolean))].sort().map((r) => <option key={r}>{r}</option>)}</select>
            <select aria-label="Situação" className={campo} value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value)}><option value="">Todas as situações</option><option value="SEM_PROJETO">Contratado · ainda não iniciado</option><option value="EM_ANDAMENTO">Em andamento</option><option value="PAUSADO">Pausado</option><option value="CONCLUIDO">Concluído</option><option value="CANCELADO">Cancelado</option></select>
          </>}
        </div>
        {carteira ? <TabelaPadrao id="carteira-consultoria" ariaLabel={titulo} titulo={titulo} linhas={lista.map((c) => ({ ...c, id: c.idTabela, clienteOriginal: c }))} vazio="Nenhum cliente com esses filtros."
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
              <button className={botao} onClick={() => abrir({ servico: s })}>Vincular cliente</button>
              <button className="text-sm text-primary hover:underline" onClick={() => setDocumentos({ servico: s, clientes: todos.filter((c) => compativel(c, s) && itens(c).includes(s)) })}>Documentos e solicitações</button>
              {(s.acessos || []).map((l) => <Link className="text-sm text-primary hover:underline" key={l.rota} to={l.rota}>{l.nome}</Link>)}
            </div>
          </article>)}</div>
        </section>)}
      </>}
    </div>
    <Sheet open={painel !== null} onOpenChange={(v) => !v && setPainel(null)}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{cliente?.nome || servico?.nome || "Vincular cliente a um serviço"}</SheetTitle><SheetDescription>{cliente ? "Serviços contratados e projetos do cliente" : "Selecione um cliente já cadastrado."}</SheetDescription></SheetHeader>
        <div className="mt-5 space-y-3">
          {!cliente && <>
            <input type="search" aria-label="Buscar no cadastro" className={`${campo} w-full`} value={buscaPainel} onChange={(e) => setBuscaPainel(e.target.value)} placeholder="Nome, CPF ou CNPJ" />
            {servico && <button className={botao} onClick={() => { setPainel(null); setNovoCadastro(servico); }}>Cadastrar cliente com este serviço</button>}
            <ul className="max-h-96 space-y-1 overflow-auto">{todos.filter((c) => !c.arquivado_em && (!servico || compativel(c, servico)) && buscaCliente(c, buscaPainel)).slice(0, 50).map((c) => <li key={chave(c)}>
              <button disabled={salvar.isPending} className="w-full rounded border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => servico ? salvar.mutate({ cliente: c, servico }) : abrir({ cliente: c })}>{c.nome} · {c.doc}</button>
            </li>)}</ul>
          </>}
          {cliente && <>
            {cliente.publico === "PJ" && <Link to={`/clientes/${cliente.id}`} className="text-sm text-primary hover:underline">Abrir ficha completa</Link>}
            {grupoLegado && <Link to={`/workroom/${grupoLegado.id}/empresas/${cliente.id}/servicos`} className="block text-sm text-primary hover:underline">Ferramentas e análises da empresa</Link>}
            {itens(cliente).map((s) => {
              const pp = projetosDe(cliente, s.id);
              return <article key={s.id} className="space-y-2 rounded border p-3"><h3 className="font-medium">{s.nome}</h3>
                {!pp.length && <p className="text-xs text-muted-foreground">Contratado · ainda não iniciado</p>}
                {pp.map((p) => <Link key={p.id} className="block text-sm text-primary hover:underline" to={`/diagnostico/projetos/${p.id}`}>{p.nome} · {SITUACOES_PROJETO[p.situacao]?.rotulo || p.situacao}</Link>)}
                <button className="block text-sm text-primary hover:underline" onClick={() => { setPainel(null); setDocumentos({ servico: s, clientes: [cliente] }); }}>Documentos e solicitações</button>
                {s.projeto ? <button className={botao} onClick={() => { setPainel(null); setNovo({ cliente, servico: s }); }}>Abrir projeto</button> : <p className="text-xs text-muted-foreground">Roteiro em desenvolvimento</p>}
              </article>;
            })}
            {projetosDe(cliente).filter((p) => !p.servico_consultoria).map((p) => <Link key={p.id} className="block text-sm text-primary hover:underline" to={`/diagnostico/projetos/${p.id}`}>{p.nome} · Diagnóstico existente</Link>)}
            <label className="block space-y-1 text-sm"><span>Adicionar serviço</span>
              <select className={`${campo} w-full`} value="" disabled={salvar.isPending} onChange={(e) => { const s = servicos.find((x) => x.id === e.target.value); if (s) salvar.mutate({ cliente, servico: s }); }}>
                <option value="">Selecione um serviço</option>{servicos.filter((s) => compativel(cliente, s) && !itens(cliente).includes(s)).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </label>
          </>}
          {salvar.isError && <p role="alert">{salvar.error.message}</p>}
        </div>
      </SheetContent>
    </Sheet>
    {documentos && <SolicitacoesConsultoria {...documentos} aoFechar={() => setDocumentos(null)} />}
    {novoCadastro?.publico === "PJ" && <NovoClienteDialog aberto servicoInicial={novoCadastro.id} grupos={cadastro.grupos} aoFechar={() => setNovoCadastro(null)} />}
    {novoCadastro?.publico === "PF" && <DialogoPessoa servicoInicial={novoCadastro.id} empresas={cadastro.empresas} aoFechar={() => setNovoCadastro(null)} />}
    {novo && <NovoDiagnosticoDialog aberto aoFechar={() => setNovo(null)} inicial={[novo.cliente.id]} grupos={cadastro.grupos}
      empresas={cadastro.empresas.filter((c) => itens({ publico: "PJ", id: c.id }).includes(novo.servico))} servico={novo.servico} />}
  </div>;
}
