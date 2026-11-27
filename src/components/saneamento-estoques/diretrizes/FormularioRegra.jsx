import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, History, Play, Save } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import TabelaPadrao from "@/components/TabelaPadrao";
import { atualizarTudo, chaves, san } from "../api";
import { Aviso, botaoPrimario, botaoSecundario, campoCls, MarcaRevisar, Rotulo, rotuloCls, SecaoForm, Tag, usePodeAlterar } from "../comuns";
import { ehConflitoVersao, fmtDataHora } from "../logica";
import { BlocoDoAspecto, ExemplosReais, SeletorMultiplo } from "./Blocos";
import Janela from "./Janela";
import {
  ABRANGENCIA_TODOS, alteracoesParaSalvar, aplicarComPrevia, ASPECTOS, chaveTransferencias, conteudoParaTela, conteudoPadrao, ehSobreposicao, ehTodos, gruposDaAbrangencia,
  lerHistorico, mensagemDiretriz, normalizarConteudo, resumoPrevia, ROTULO_ASPECTO, SITUACAO_REGRA, SOBRE_ASPECTO, subgruposDisponiveis, transferencias, validarRegra,
} from "./logica";

const COLUNAS_HISTORICO = [
  { chave: "quando", rotulo: "Quando", render: (h) => fmtDataHora(h.quando) },
  { chave: "quem", rotulo: "Quem" },
  { chave: "acao", rotulo: "Ação" },
  { chave: "mudou", rotulo: "Antes → depois", quebrar: true },
];

/** Histórico de uma regra (quem, quando, ação, antes → depois). `consulta` = useQuery da rota histórico. */
export function HistoricoRegra({ consulta, id = "historico-regra" }) {
  if (consulta.isError) return <Aviso tom="erro">Não foi possível carregar o histórico.</Aviso>;
  if (consulta.data === undefined) return <p className="text-sm text-muted-foreground" role="status">Carregando o histórico…</p>;
  return <TabelaPadrao id={id} ariaLabel="Histórico da regra" colunas={COLUNAS_HISTORICO} linhas={lerHistorico(consulta.data)} ordemInicial={{ chave: "quando", dir: -1 }} tamanhoInicial={10} simples vazio="Sem alterações registradas." />;
}

/**
 * Prévia de "Aplicar e reanalisar": grupos, itens, camadas e sobreposições. Só aplica depois de "Confirmar e aplicar";
 * com sobreposição, a transferência dos grupos precisa ser marcada antes.
 */
export function PreviaAplicar({ previa, aoConfirmar, aoCancelar, ocupado }) {
  const [transferir, setTransferir] = useState(false);
  const r = resumoPrevia(previa);
  const sobrepoe = r.sobreposicoes.length > 0;
  return (
    <Janela titulo="Prévia da aplicação" aoFechar={ocupado ? undefined : aoCancelar}>
    <section aria-label="Prévia da aplicação" className="space-y-2 border-2 border-primary/60 bg-card p-3">
      <h3 className="text-sm font-semibold">Antes de aplicar, confira o que muda</h3>
      <p className="text-sm">{r.texto}</p>
      <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className={rotuloCls}>Grupos</dt><dd>{r.grupos.length ? r.grupos.join(", ") : "Nenhum grupo com itens importados"}</dd>
        <dt className={rotuloCls}>Análises refeitas</dt><dd>{r.camadas.length ? r.camadas.join(", ") : "—"}</dd>
      </dl>
      {sobrepoe && (
        <Aviso tom="alerta" titulo="Grupos já cobertos por outra regra do mesmo aspecto">
          <ul className="list-disc pl-5">{r.sobreposicoes.map((s) => <li key={`${s.grupo}-${s.regraAtual}`}>{s.grupo}: hoje na regra {s.regraAtual}</li>)}</ul>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={transferir} onChange={(e) => setTransferir(e.target.checked)} />Confirmo transferir esses grupos para esta regra (o histórico fica)</label>
        </Aviso>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botaoPrimario} disabled={ocupado || (sobrepoe && !transferir)} onClick={() => aoConfirmar({ ok: true, confirmarTransferencia: transferir })}><Play className="h-4 w-4" aria-hidden="true" />{ocupado ? "Aplicando…" : "Confirmar e aplicar"}</button>
        <button type="button" className={botaoSecundario} disabled={ocupado} onClick={aoCancelar}>Cancelar</button>
      </div>
    </section>
    </Janela>
  );
}

/** Aviso de transferência: o grupo escolhido já é de outra regra do mesmo aspecto. Pede confirmação antes de salvar. */
export function AvisoTransferencia({ lista, confirmado, aoConfirmar }) {
  if (!lista.length) return null;
  return (
    <Aviso tom="alerta" titulo={lista.some((t) => t.padrao) ? "Outra regra já vale para todos os grupos" : "Grupo já coberto por outra regra"}>
      <ul className="list-disc pl-5">{lista.map((t) => <li key={`${t.grupo}-${t.regraId}`}>{t.grupo}: hoje na regra {t.codigo} — {t.nome}</li>)}</ul>
      <p className="mt-1">Cada grupo tem uma regra por aspecto. Ao salvar, {lista.length === 1 ? "ele passa" : "eles passam"} para esta regra; o histórico da regra atual fica.</p>
      <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={confirmado} onChange={(e) => aoConfirmar(e.target.checked)} />Confirmo a transferência</label>
    </Aviso>
  );
}

function estadoInicial(regra, inicial) {
  if (regra) {
    const a = regra.abrangencia || ABRANGENCIA_TODOS;
    return {
      aspecto: regra.aspecto, nome: regra.nome || "", todos: ehTodos(a), grupos: gruposDaAbrangencia(a), subgrupos: a.subgrupos || [], observacao: regra.observacao || "",
      bibliotecaId: regra.bibliotecaId || null, conteudo: conteudoParaTela(regra.aspecto, regra.conteudoEfetivo || regra.alteracoes),
    };
  }
  const aspecto = inicial?.aspecto || "NOMES";
  return {
    aspecto, nome: inicial?.nome || "", todos: inicial?.todos ?? true, grupos: inicial?.grupos || [], subgrupos: [], observacao: inicial?.observacao || "",
    bibliotecaId: null, conteudo: conteudoParaTela(aspecto, inicial?.conteudo || conteudoPadrao(aspecto)),
  };
}
const abrangenciaDo = (f) => (f.todos ? ABRANGENCIA_TODOS : { todos: false, grupos: f.grupos, ...(f.subgrupos.length ? { subgrupos: f.subgrupos } : {}) });

/**
 * Formulário da regra do projeto: identificação, "partir de regra da biblioteca", o bloco do aspecto e as 4 ações (Salvar rascunho,
 * Aplicar e reanalisar — sempre com a prévia antes —, Aprovar, Histórico). 409: mostra a mensagem, recarrega e mantém o que foi digitado.
 */
export default function FormularioRegra({ projeto, dados, regraId: regraIdInicial = null, inicial = null, aoFechar }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { pode, razao } = usePodeAlterar();
  const regraServidorInicial = regraIdInicial ? (dados.regras || []).find((r) => r.id === regraIdInicial) || null : null;
  const [regraId, setRegraId] = useState(regraIdInicial);
  const regraServidor = regraId ? (dados.regras || []).find((r) => r.id === regraId) || null : null;
  const [form, setForm] = useState(() => estadoInicial(regraServidorInicial, inicial));
  const [base, setBase] = useState(() => (regraServidorInicial ? normalizarConteudo(estadoInicial(regraServidorInicial).conteudo) : null));
  const [salvo, setSalvo] = useState(() => (regraServidorInicial ? JSON.stringify(estadoInicial(regraServidorInicial)) : null));
  const [versaoLocal, setVersaoLocal] = useState(null);
  const [transfConfirmada, setTransfConfirmada] = useState("");
  const [msg, setMsg] = useState(null);
  const [erros, setErros] = useState([]);
  const [previa, setPrevia] = useState(null); // { dados, resolver }
  const [verHistorico, setVerHistorico] = useState(false);
  const versao = versaoLocal ?? regraServidor?.versao;
  const bibliotecaVersao = regraServidor?.bibliotecaVersao ?? null;

  const biblioteca = useQuery({ queryKey: chaves.biblioteca(), queryFn: () => san.biblioteca(), enabled: !regraId });
  const modelosDoAspecto = (biblioteca.data || []).filter((r) => r.aspecto === form.aspecto && r.ativa !== false);
  const temExemplos = !!regraId && (form.aspecto === "NOMES" || form.aspecto === "LIMITES");
  const exemplos = useQuery({ queryKey: chaves.exemplosRegra(projeto.id, regraId), queryFn: () => san.exemplosRegra(regraId), enabled: temExemplos });
  const historico = useQuery({ queryKey: chaves.historicoRegra(projeto.id, regraId), queryFn: () => san.historicoRegra(regraId), enabled: !!regraId && verHistorico });

  const set = (parte) => setForm((f) => ({ ...f, ...parte }));
  const suja = !regraId || JSON.stringify(form) !== salvo;
  const abrangencia = abrangenciaDo(form);
  const transf = transferencias({ abrangencia, aspecto: form.aspecto, regraId, regras: dados.regras });
  const chaveT = chaveTransferencias(transf);
  const transferenciaPendente = transf.length > 0 && transfConfirmada !== chaveT;
  const gruposDisponiveis = (dados.grupos || []).map((g) => g.grupo);
  const itensDoGrupo = new Map((dados.grupos || []).map((g) => [g.grupo, g.itens]));
  const subgrupos = form.todos ? [] : subgruposDisponiveis(dados.grupos, form.grupos);

  /** Recarrega a regra do servidor (após 409): a versão nova vale para o próximo pedido; o que foi digitado fica na tela. */
  const recarregar = async () => {
    const d = await qc.fetchQuery({ queryKey: chaves.diretrizes(projeto.id), queryFn: () => san.diretrizes(projeto.id), staleTime: 0 });
    const r = (d?.regras || []).find((x) => x.id === regraId);
    if (r) { setVersaoLocal(r.versao); setBase(normalizarConteudo(conteudoParaTela(r.aspecto, r.conteudoEfetivo || r.alteracoes))); }
  };
  const falhou = async (err) => {
    setMsg({ tom: ehConflitoVersao(err) || ehSobreposicao(err) ? "alerta" : "erro", texto: mensagemDiretriz(err) });
    if (ehConflitoVersao(err)) await recarregar();
  };
  /** Depois de gravar: guarda a versão nova e o estado salvo, e renova as diretrizes (e as análises). */
  const gravou = async (resp, f = form) => {
    if (resp && typeof resp.versao === "number") setVersaoLocal(resp.versao);
    if (resp?.id && !regraId) setRegraId(resp.id);
    setSalvo(JSON.stringify(f));
    setBase(normalizarConteudo(f.conteudo));
    await atualizarTudo(qc, projeto.id);
  };

  const salvarAgora = async () => {
    const e = validarRegra({ nome: form.nome, abrangencia, conteudo: form.conteudo });
    if (transferenciaPendente) e.push("Confirme a transferência dos grupos que já estão em outra regra.");
    setErros(e);
    if (e.length) return null;
    const editado = normalizarConteudo(form.conteudo);
    const alteracoes = alteracoesParaSalvar({ bibliotecaId: form.bibliotecaId, base, editado, anteriores: regraServidor?.alteracoes });
    const corpo = { nome: form.nome.trim(), abrangencia, observacao: form.observacao.trim() || null, ...(alteracoes !== undefined ? { alteracoes } : {}) };
    const resp = regraId ? await san.alterarRegra(regraId, { versao, ...corpo }) : await san.criarRegra(projeto.id, { aspecto: form.aspecto, ...corpo, bibliotecaId: form.bibliotecaId || undefined });
    await gravou(resp);
    return resp || {};
  };
  /** Regra aprovada: salvar a devolve a Rascunho (e marca "revisar" no que depende dela). Pede confirmação antes. */
  const podeSalvarAprovada = async () => (regraServidor?.situacao !== "APROVADA" ? true
    : confirmar({ titulo: "Alterar uma regra aprovada?", rotulo: "Salvar", perigoso: false, descricao: "A regra volta a Rascunho e as conclusões que dependem dela ficam marcadas \"revisar\". Decisões e versões anteriores ficam." }));
  const salvar = useMutation({
    mutationFn: async () => ((await podeSalvarAprovada()) ? salvarAgora() : null),
    onSuccess: (r) => { if (r) setMsg({ tom: "ok", texto: "Rascunho salvo." }); },
    onError: falhou,
  });

  const aplicar = useMutation({
    mutationFn: async () => {
      setMsg(null);
      // A prévia e a aplicação usam o id e a versão mais recentes (o rascunho pode ter acabado de ser criado ou salvo).
      let id = regraId;
      let v = versao;
      if (suja) {
        if (!(await podeSalvarAprovada())) return { aplicado: false };
        const r = await salvarAgora();
        if (!r) return { aplicado: false };
        if (r.id) id = r.id;
        if (typeof r.versao === "number") v = r.versao;
        else {
          const d = await qc.fetchQuery({ queryKey: chaves.diretrizes(projeto.id), queryFn: () => san.diretrizes(projeto.id), staleTime: 0 });
          v = (d?.regras || []).find((x) => x.id === id)?.versao ?? v;
        }
      }
      if (!id) return { aplicado: false };
      return aplicarComPrevia({
        buscarPrevia: () => san.previaRegra(id),
        confirmar: (p) => new Promise((resolver) => setPrevia({ dados: p, enviando: false, resolver: (resp) => { setPrevia((x) => (x ? { ...x, enviando: !!resp?.ok } : x)); resolver(resp); } })),
        aplicar: (extra) => san.aplicarRegra(id, { versao: v, ...extra }),
      });
    },
    onSuccess: async (r) => {
      setPrevia(null);
      if (!r?.aplicado) { if (r?.motivo) setMsg({ tom: "alerta", texto: r.motivo }); return; }
      if (r.resultado && typeof r.resultado.versao === "number") setVersaoLocal(r.resultado.versao);
      await atualizarTudo(qc, projeto.id);
      setMsg({ tom: "ok", texto: `Regra aplicada. ${resumoPrevia(r.previa).textoFeito}` });
    },
    onError: (e) => { setPrevia(null); falhou(e); },
  });
  const aprovar = useMutation({
    mutationFn: () => san.aprovarRegra(regraId, versao),
    onSuccess: async (resp) => { if (resp && typeof resp.versao === "number") setVersaoLocal(resp.versao); await atualizarTudo(qc, projeto.id); setMsg({ tom: "ok", texto: "Regra aprovada. Ela entra na política como vigente." }); },
    onError: falhou,
  });
  const pedirAprovacao = async () => {
    const ok = await confirmar({ titulo: "Aprovar a regra?", rotulo: "Aprovar", perigoso: false, descricao: "A regra passa a valer na política do cliente. Você fica registrado como aprovador." });
    if (ok) aprovar.mutate();
  };

  const ocupado = salvar.isPending || aplicar.isPending || aprovar.isPending;
  const desabilitado = !pode || ocupado;

  const escolherDaBiblioteca = async (id) => {
    if (!id) { set({ bibliotecaId: null }); setBase(null); return; }
    try {
      const r = await qc.fetchQuery({ queryKey: chaves.regraBiblioteca(id), queryFn: () => san.regraBiblioteca(id) });
      const conteudo = conteudoParaTela(r.aspecto, r.conteudo);
      setForm((f) => ({ ...f, bibliotecaId: r.id, nome: f.nome.trim() ? f.nome : r.nome, observacao: f.observacao || r.observacao || "", conteudo }));
      setBase(normalizarConteudo(conteudo));
    } catch (e) { setMsg({ tom: "erro", texto: mensagemDiretriz(e) }); }
  };

  return (
    <article className="space-y-4 border border-border bg-card p-4" aria-label="Regra">
      <header className="flex flex-wrap items-center gap-2">
        <button type="button" className={botaoSecundario} onClick={aoFechar}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar às diretrizes</button>
        <h2 className="text-base font-semibold">{regraServidor ? `Regra ${regraServidor.codigo} — ${ROTULO_ASPECTO[form.aspecto]}` : `Nova regra — ${ROTULO_ASPECTO[form.aspecto]}`}</h2>
        {regraServidor && <Tag tom={regraServidor.situacao === "APROVADA" ? "ok" : "neutro"}>{SITUACAO_REGRA[regraServidor.situacao] || "Rascunho"}</Tag>}
        {regraServidor?.revisar && <MarcaRevisar causa="Algo de que esta regra depende mudou: confira." />}
        {regraServidor?.aprovadaPor && regraServidor.situacao === "APROVADA" && <span className="text-xs text-muted-foreground">Aprovada por {regraServidor.aprovadaPor} em {fmtDataHora(regraServidor.aprovadaEm)}</span>}
        {form.bibliotecaId && <Tag tom="info">Da biblioteca{bibliotecaVersao ? ` (versão ${bibliotecaVersao})` : ""}</Tag>}
      </header>
      {msg && <Aviso tom={msg.tom === "erro" ? "erro" : msg.tom === "alerta" ? "alerta" : "ok"}>{msg.texto}</Aviso>}

      <SecaoForm titulo="Identificação" corpoCls="grid gap-4 sm:grid-cols-2">
        <label className="block"><Rotulo>Aspecto</Rotulo>
          <select className={campoCls} disabled={desabilitado || !!regraId} value={form.aspecto} onChange={(e) => { const a = e.target.value; setForm((f) => ({ ...f, aspecto: a, bibliotecaId: null, conteudo: conteudoParaTela(a, conteudoPadrao(a)) })); setBase(null); }}>
            {ASPECTOS.map((a) => <option key={a} value={a}>{ROTULO_ASPECTO[a]}</option>)}
          </select>
          <span className="mt-1 block text-xs text-foreground/75">{SOBRE_ASPECTO[form.aspecto]}</span>
        </label>
        <label className="block"><Rotulo>Nome da regra</Rotulo><input className={campoCls} disabled={desabilitado} maxLength={160} value={form.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Ex.: Descrição de peças de manutenção" /></label>
        {!regraId && (
          <label className="block sm:col-span-2"><Rotulo>Partir de uma regra da biblioteca (opcional)</Rotulo>
            <select className={campoCls} disabled={desabilitado || biblioteca.data === undefined} value={form.bibliotecaId || ""} onChange={(e) => escolherDaBiblioteca(e.target.value)}>
              <option value="">{biblioteca.isError ? "Biblioteca indisponível agora" : biblioteca.data === undefined ? "Carregando a biblioteca…" : modelosDoAspecto.length ? "Regra nova, sem modelo" : "Nenhuma regra deste aspecto na biblioteca"}</option>
              {modelosDoAspecto.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.indicadaPara ? ` — ${r.indicadaPara}` : ""} (versão {r.versao})</option>)}
            </select>
            <span className="mt-1 block text-xs text-foreground/75">O conteúdo da biblioteca é carregado abaixo; ajuste só o que for diferente para este cliente.</span>
          </label>
        )}
        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" disabled={desabilitado} checked={form.todos} onChange={(e) => set({ todos: e.target.checked })} />Todos os grupos <span className="text-xs font-normal text-foreground/75">(padrão; vale também para grupos novos)</span></label>
          {!form.todos && (gruposDisponiveis.length ? (
            <SeletorMultiplo rotulo="Grupos abrangidos" opcoes={gruposDisponiveis} marcados={form.grupos} aoMudar={(grupos) => set({ grupos, subgrupos: form.subgrupos.filter((s) => subgruposDisponiveis(dados.grupos, grupos).includes(s)) })} desabilitado={desabilitado}
              rotuloDe={(g) => (itensDoGrupo.has(g) ? `${g} (${Number(itensDoGrupo.get(g) || 0).toLocaleString("pt-BR")} itens)` : g)} />
          ) : <p className="text-sm text-muted-foreground">Os grupos aparecem depois de importar o cadastro de itens. Até lá, use Todos os grupos.</p>)}
          {subgrupos.length > 0 && <SeletorMultiplo rotulo="Subgrupos (opcional; vazio = todos os subgrupos)" opcoes={subgrupos} marcados={form.subgrupos} aoMudar={(s) => set({ subgrupos: s })} desabilitado={desabilitado} />}
          <AvisoTransferencia lista={transf} confirmado={!transferenciaPendente} aoConfirmar={(ok) => setTransfConfirmada(ok ? chaveT : "")} />
        </div>
        <label className="block sm:col-span-2"><Rotulo>Observação</Rotulo><textarea className={`${campoCls} min-h-[56px]`} disabled={desabilitado} maxLength={2000} value={form.observacao} onChange={(e) => set({ observacao: e.target.value })} /></label>
      </SecaoForm>

      <SecaoForm titulo={ROTULO_ASPECTO[form.aspecto]}>
        <BlocoDoAspecto aspecto={form.aspecto} valor={form.conteudo} aoMudar={(conteudo) => set({ conteudo })} desabilitado={desabilitado}
          exemplos={temExemplos || !regraId ? <ExemplosReais consulta={exemplos} salva={!!regraId} /> : null} />
      </SecaoForm>

      {erros.length > 0 && <Aviso tom="erro" titulo="Corrija antes de salvar"><ul className="list-disc pl-5">{erros.map((e) => <li key={e}>{e}</li>)}</ul></Aviso>}
      {previa && <PreviaAplicar previa={previa.dados} ocupado={previa.enviando}aoConfirmar={(r) => previa.resolver(r)} aoCancelar={() => previa.resolver(false)} />}

      <SecaoForm titulo="Ações" corpoCls="flex flex-wrap items-center gap-2">
        <button type="button" className={botaoSecundario} disabled={desabilitado || (!suja && !!regraId)} title={razao} onClick={() => salvar.mutate()}><Save className="h-4 w-4" aria-hidden="true" />{salvar.isPending ? "Salvando…" : "Salvar rascunho"}</button>
        <button type="button" className={botaoPrimario} disabled={desabilitado || !!previa} title={razao || "Mostra antes quantos grupos e itens serão analisados de novo"} onClick={() => aplicar.mutate()}><Play className="h-4 w-4" aria-hidden="true" />{aplicar.isPending && !previa ? "Preparando a prévia…" : "Aplicar e reanalisar"}</button>
        <button type="button" className={botaoPrimario} disabled={desabilitado || !regraId || suja || regraServidor?.situacao === "APROVADA"} title={razao || (!regraId || suja ? "Salve o rascunho antes de aprovar" : regraServidor?.situacao === "APROVADA" ? "A regra já está aprovada" : undefined)} onClick={pedirAprovacao}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{aprovar.isPending ? "Aprovando…" : "Aprovar"}</button>
        <button type="button" className={botaoSecundario} disabled={!regraId} aria-expanded={verHistorico} onClick={() => setVerHistorico((v) => !v)}><History className="h-4 w-4" aria-hidden="true" />Histórico</button>
        {suja && regraId && <span className="text-xs text-amber-800 dark:text-amber-200" role="status">Há alterações não salvas. Aplicar salva o rascunho antes.</span>}
      </SecaoForm>
      {verHistorico && regraId && <SecaoForm titulo="Histórico da regra" ariaLabel="Histórico"><HistoricoRegra consulta={historico} id={`historico-regra-${regraId}`} /></SecaoForm>}
    </article>
  );
}
