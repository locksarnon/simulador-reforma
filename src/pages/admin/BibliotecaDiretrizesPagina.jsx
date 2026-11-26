import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import { chaves, san } from "@/components/saneamento-estoques/api";
import { Aviso, botaoPrimario, botaoSecundario, campoCls, Rotulo, Tag } from "@/components/saneamento-estoques/comuns";
import { ehConflitoVersao } from "@/components/saneamento-estoques/logica";
import { BlocoDoAspecto } from "@/components/saneamento-estoques/diretrizes/Blocos";
import { HistoricoRegra } from "@/components/saneamento-estoques/diretrizes/FormularioRegra";
import {
  ABRANGENCIA_TODOS, ASPECTOS, conteudoPadrao, conteudoParaTela, mensagemDiretriz, normalizarConteudo, ROTULO_ASPECTO, SOBRE_ASPECTO, validarRegra,
} from "@/components/saneamento-estoques/diretrizes/logica";
import { AbasConfiguracao } from "./ErpsPagina";

const CRUMBS = [{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Configuração e ERPs", to: "/configuracao" }];
const SUBABAS = [{ id: "regras", rotulo: "Regras-modelo" }, { id: "procedimentos", rotulo: "Procedimentos" }, { id: "modelos", rotulo: "Modelos" }];

export const COLUNAS_BIBLIOTECA = [
  { chave: "aspecto", rotulo: "Aspecto", valor: (r) => ROTULO_ASPECTO[r.aspecto] || r.aspecto },
  { chave: "nome", rotulo: "Nome", render: (r) => <span className="font-medium text-primary">{r.nome}</span> },
  { chave: "indicadaPara", rotulo: "Indicada para", valor: (r) => r.indicadaPara || "—" },
  { chave: "versao", rotulo: "Versão", tipo: "numero" },
  { chave: "ativa", rotulo: "Ativa", valor: (r) => (r.ativa === false ? "Não" : "Sim") },
];

/** Procedimento da política (somente leitura): objetivo, fluxo (passos e decisões), regras práticas, evidências e fundamento. */
export function ProcedimentoLeitura({ procedimento: p }) {
  return (
    <article className="space-y-2 border border-border bg-card p-4" aria-label={p.titulo}>
      <h3 className="font-semibold">{p.titulo}</h3>
      {p.objetivo && <p className="text-sm text-muted-foreground">{p.objetivo}</p>}
      <ol className="space-y-1" aria-label={`Fluxo: ${p.titulo}`}>
        {(p.fluxo || []).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{i + 1}.</span>
            {f.tipo === "decisao" ? (
              <span className="border border-amber-600/50 bg-amber-500/10 px-2 py-1"><b>Decisão:</b> {f.pergunta} <span className="block text-xs">Sim: {f.sim} · Não: {f.nao}</span></span>
            ) : (
              <span className="border border-border px-2 py-1">{f.texto}{f.responsavel && <span className="ml-1 text-xs text-muted-foreground">({f.responsavel})</span>}</span>
            )}
          </li>
        ))}
      </ol>
      {(p.regras || []).length > 0 && <div><h4 className="text-xs font-semibold">Regras práticas</h4><ul className="list-disc pl-5 text-sm">{p.regras.map((r) => <li key={r}>{r}</li>)}</ul></div>}
      {(p.evidencias || []).length > 0 && <div><h4 className="text-xs font-semibold">Evidências a guardar</h4><ul className="list-disc pl-5 text-sm">{p.evidencias.map((r) => <li key={r}>{r}</li>)}</ul></div>}
      {p.fundamento && <p className="text-xs"><b>Fundamento:</b> {p.fundamento}</p>}
    </article>
  );
}

/** Modelo de diretrizes (somente leitura): o conjunto de regras da biblioteca e os grupos a que cada uma se aplica. */
export function ModeloLeitura({ modelo, regras }) {
  const nome = new Map((regras || []).map((r) => [r.id, r.nome]));
  return (
    <article className="space-y-2 border border-border bg-card p-4" aria-label={modelo.nome}>
      <h3 className="font-semibold">{modelo.nome}</h3>
      {modelo.descricao && <p className="text-sm text-muted-foreground">{modelo.descricao}</p>}
      <table className="w-full text-sm" aria-label={`Regras do modelo ${modelo.nome}`}>
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-1">Aspecto</th><th scope="col">Regra da biblioteca</th><th scope="col">Grupos</th></tr></thead>
        <tbody>{(modelo.atribuicoes || []).map((a, i) => (
          <tr key={i} className="border-b border-border/60"><td className="py-1 pr-2">{ROTULO_ASPECTO[a.aspecto] || a.aspecto}</td><td className="pr-2">{nome.get(a.bibliotecaId) || "Regra não encontrada na biblioteca"}</td><td>{a.grupos === "TODOS" ? "Todos os grupos" : (a.grupos || []).join(", ")}</td></tr>
        ))}</tbody>
      </table>
    </article>
  );
}

function Lista({ consulta, vazio, children }) {
  if (consulta.isError) return <Aviso tom="erro">Não foi possível carregar. {mensagemDiretriz(consulta.error)}</Aviso>;
  if (consulta.data === undefined) return <p className="text-sm text-muted-foreground" role="status">Carregando…</p>;
  const l = Array.isArray(consulta.data) ? consulta.data : [];
  if (!l.length) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  return children(l);
}

/** Administração > Configuração e ERPs > Biblioteca de diretrizes: regras-modelo FAL, procedimentos da política e modelos. */
export default function BibliotecaDiretrizesPagina() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const sub = SUBABAS.some((s) => s.id === params.get("aba")) ? params.get("aba") : "regras";
  const regras = useQuery({ queryKey: chaves.biblioteca(), queryFn: () => san.biblioteca() });
  const procedimentos = useQuery({ queryKey: chaves.procedimentos(), queryFn: () => san.procedimentos(), enabled: sub === "procedimentos" });
  const modelos = useQuery({ queryKey: chaves.modelos(), queryFn: () => san.modelos(), enabled: sub === "modelos" });
  return (
    <div>
      <PageHeader crumbs={[...CRUMBS, { label: "Biblioteca de diretrizes" }]} title="Configuração e ERPs" />
      <AbasConfiguracao />
      <div className="space-y-4 px-6 py-6 lg:px-8">
        <p className="text-sm text-muted-foreground">Regras-modelo FAL do Saneamento de estoques, cadastradas uma vez e usadas por todos os projetos. O projeto aponta para a regra da biblioteca e guarda só as exceções do cliente; quando a regra muda aqui, o projeto vê o aviso e decide se adota. Somente administradores alteram.</p>
        <div role="tablist" aria-label="Partes da biblioteca" className="flex gap-1 border-b border-border">
          {SUBABAS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={sub === s.id} onClick={() => setParams({ aba: s.id }, { replace: true })}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${sub === s.id ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{s.rotulo}</button>
          ))}
        </div>
        {sub === "regras" && (
          <div className="space-y-3">
            {admin && <button type="button" className={botaoPrimario} onClick={() => navegar("/admin/diretrizes/nova")}>Nova regra-modelo</button>}
            {regras.isError && <Aviso tom="erro">Não foi possível carregar a biblioteca. {mensagemDiretriz(regras.error)}</Aviso>}
            <TabelaPadrao id="biblioteca-diretrizes" titulo="Regras-modelo" ariaLabel="Regras-modelo da biblioteca" colunas={COLUNAS_BIBLIOTECA} linhas={Array.isArray(regras.data) ? regras.data : []}
              vazio={regras.isLoading ? "Carregando…" : "Nenhuma regra-modelo cadastrada."} aoClicarLinha={(r) => navegar(`/admin/diretrizes/${r.id}`)} />
          </div>
        )}
        {sub === "procedimentos" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Procedimentos fixos da política (cadastro, alteração, unificação, inativação, retirada e uso de materiais), com o fluxograma que vai no PDF. Somente leitura.</p>
            <Lista consulta={procedimentos} vazio="Nenhum procedimento cadastrado.">{(l) => l.map((p) => <ProcedimentoLeitura key={p.id} procedimento={p} />)}</Lista>
          </div>
        )}
        {sub === "modelos" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Conjuntos prontos de regras para um tipo de cliente. Na aba Diretrizes do projeto, “Aplicar modelo da biblioteca” cria essas regras em rascunho.</p>
            <Lista consulta={modelos} vazio="Nenhum modelo cadastrado.">{(l) => l.map((m) => <ModeloLeitura key={m.id} modelo={m} regras={regras.data} />)}</Lista>
          </div>
        )}
      </div>
    </div>
  );
}

function estadoDaFicha(r) {
  const aspecto = r?.aspecto || "NOMES";
  return { aspecto, nome: r?.nome || "", indicadaPara: r?.indicadaPara || "", observacao: r?.observacao || "", ativa: r ? r.ativa !== false : true, conteudo: conteudoParaTela(aspecto, r?.conteudo || conteudoPadrao(aspecto)) };
}

/** Formulário da regra-modelo (dados + o bloco do aspecto, os mesmos do projeto). Só o administrador grava; cada gravação gera versão nova. */
export function FichaRegraBiblioteca({ regra, admin, aoSalvar, salvando, erro }) {
  const [f, setF] = useState(() => estadoDaFicha(regra));
  const [erros, setErros] = useState([]);
  const set = (parte) => setF((x) => ({ ...x, ...parte }));
  const desabilitado = !admin || salvando;
  const enviar = () => {
    const e = validarRegra({ nome: f.nome, abrangencia: ABRANGENCIA_TODOS, conteudo: f.conteudo });
    setErros(e);
    if (e.length) return;
    aoSalvar({ aspecto: f.aspecto, nome: f.nome.trim(), indicadaPara: f.indicadaPara.trim() || null, observacao: f.observacao.trim() || null, ativa: f.ativa, conteudo: normalizarConteudo(f.conteudo) });
  };
  return (
    <form aria-label="Regra-modelo" className="space-y-4 border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><Rotulo>Aspecto</Rotulo>
          <select className={campoCls} disabled={desabilitado || !!regra} value={f.aspecto} onChange={(e) => set({ aspecto: e.target.value, conteudo: conteudoParaTela(e.target.value, conteudoPadrao(e.target.value)) })}>{ASPECTOS.map((a) => <option key={a} value={a}>{ROTULO_ASPECTO[a]}</option>)}</select>
          <span className="mt-1 block text-xs text-muted-foreground">{SOBRE_ASPECTO[f.aspecto]}</span>
        </label>
        <label className="block"><Rotulo>Nome</Rotulo><input className={campoCls} disabled={desabilitado} maxLength={160} value={f.nome} onChange={(e) => set({ nome: e.target.value })} /></label>
        <label className="block"><Rotulo>Indicada para (tipo de grupo)</Rotulo><input className={campoCls} disabled={desabilitado} maxLength={200} value={f.indicadaPara} onChange={(e) => set({ indicadaPara: e.target.value })} placeholder="Ex.: Peças de manutenção" /></label>
        <label className="flex items-center gap-2 text-sm sm:mt-5"><input type="checkbox" disabled={desabilitado} checked={f.ativa} onChange={(e) => set({ ativa: e.target.checked })} />Ativa (aparece para os projetos)</label>
        <label className="block sm:col-span-2"><Rotulo>Observação</Rotulo><textarea className={`${campoCls} min-h-[56px]`} disabled={desabilitado} maxLength={2000} value={f.observacao} onChange={(e) => set({ observacao: e.target.value })} /></label>
      </div>
      <section aria-label={ROTULO_ASPECTO[f.aspecto]} className="space-y-2">
        <h2 className="text-sm font-semibold">{ROTULO_ASPECTO[f.aspecto]}</h2>
        <BlocoDoAspecto aspecto={f.aspecto} valor={f.conteudo} aoMudar={(conteudo) => set({ conteudo })} desabilitado={desabilitado} />
      </section>
      {erros.length > 0 && <Aviso tom="erro" titulo="Corrija antes de salvar"><ul className="list-disc pl-5">{erros.map((e) => <li key={e}>{e}</li>)}</ul></Aviso>}
      {erro && <Aviso tom={erro.tom === "alerta" ? "alerta" : "erro"}>{erro.texto}</Aviso>}
      {admin ? <button type="submit" className={botaoPrimario} disabled={salvando}><Save className="h-4 w-4" aria-hidden="true" />{salvando ? "Salvando…" : regra ? "Salvar nova versão" : "Criar regra-modelo"}</button>
        : <p className="text-xs text-muted-foreground">Somente administradores alteram a biblioteca.</p>}
    </form>
  );
}

/** /admin/diretrizes/:id — ficha da regra-modelo ("nova" para criar) com o histórico de versões. */
export function RegraBibliotecaPagina() {
  const { id } = useParams();
  const nova = id === "nova";
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const qc = useQueryClient();
  const navegar = useNavigate();
  const q = useQuery({ queryKey: chaves.regraBiblioteca(id), queryFn: () => san.regraBiblioteca(id), enabled: !nova && !!id });
  const historico = useQuery({ queryKey: chaves.historicoBiblioteca(id), queryFn: () => san.historicoBiblioteca(id), enabled: !nova && !!id });
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);
  const salvar = useMutation({
    mutationFn: (d) => (nova ? san.criarRegraBiblioteca(d) : san.alterarRegraBiblioteca(id, { versao: q.data?.versao, ...d })),
    onSuccess: async (r) => {
      setErro(null);
      await qc.invalidateQueries({ queryKey: ["san-biblioteca"] });
      if (nova && r?.id) navegar(`/admin/diretrizes/${r.id}`, { replace: true });
      else setOk(`Salvo. A regra-modelo está na versão ${r?.versao ?? (Number(q.data?.versao || 0) + 1)}; os projetos que a usam veem o aviso de atualização.`);
    },
    onError: async (e) => {
      setOk(null);
      if (ehConflitoVersao(e)) {
        setErro({ tom: "alerta", texto: "Outra pessoa alterou esta regra-modelo depois que você a abriu. Recarregamos os dados e mantivemos o que você digitou: confira e salve de novo." });
        await qc.invalidateQueries({ queryKey: chaves.regraBiblioteca(id) });
      } else setErro({ tom: "erro", texto: mensagemDiretriz(e) });
    },
  });
  const r = q.data;
  const titulo = nova ? "Nova regra-modelo" : r?.nome || "Regra-modelo";
  return (
    <div>
      <PageHeader crumbs={[...CRUMBS, { label: "Biblioteca de diretrizes", to: "/admin/diretrizes" }, { label: titulo }]} title="Configuração e ERPs" />
      <AbasConfiguracao />
      <div className="space-y-4 px-6 py-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={botaoSecundario} onClick={() => navegar("/admin/diretrizes")}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar à biblioteca</button>
          <h1 className="text-base font-semibold">{titulo}</h1>
          {r && <Tag>Versão {r.versao}</Tag>}
          {r && <Tag tom={r.ativa === false ? "alerta" : "ok"}>{r.ativa === false ? "Inativa" : "Ativa"}</Tag>}
        </div>
        {ok && <Aviso tom="ok">{ok}</Aviso>}
        {nova && !admin && <Aviso tom="alerta">Somente administradores criam regras-modelo.</Aviso>}
        {!nova && q.isError && <Aviso tom="erro">Regra-modelo não encontrada. {mensagemDiretriz(q.error)}</Aviso>}
        {!nova && !q.isError && !r && <p className="text-sm text-muted-foreground" role="status">Carregando…</p>}
        {(nova || r) && <FichaRegraBiblioteca key={r?.id || "nova"} regra={nova ? null : r} admin={admin} salvando={salvar.isPending} erro={erro} aoSalvar={(d) => salvar.mutate(d)} />}
        {!nova && r && (
          <section aria-label="Histórico de versões" className="space-y-2">
            <h2 className="font-semibold">Histórico de versões</h2>
            <HistoricoRegra consulta={historico} id="biblioteca-historico" />
          </section>
        )}
      </div>
    </div>
  );
}
