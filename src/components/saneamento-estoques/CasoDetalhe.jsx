import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import { san, chaves, atualizarTudo } from "./api";
import { Aviso, botaoPerigo, botaoPrimario, botaoSecundario, campoCls, Carregar, Rotulo, Tag, usePodeAlterar } from "./comuns";
import {
  acoesDoCaso, aposConflito, camposDivergentes, converterProposta, edicaoInicial, edicaoSuja, ehAtividadesConfirmadas, ehConflitoVersao, ehPropostaDesatualizada, etiquetaDeEnquadramento,
  FINALIDADES, interpretarRespostaParecer, lerParecer, mensagemDeErro, mensagemDoParecer, precisaConfirmarFator, precisaInformarFator, propostaEditavel, razaoSemAprovar, ROTULO_CAMADA, ROTULO_CONFIANCA, rotuloDoCampo, rotuloFinalidade, rotuloSituacaoCaso, textoDoValor,
} from "./logica";

function Lista({ titulo, itens }) {
  if (!itens?.length) return null;
  return <div><h5 className="text-xs font-semibold">{titulo}</h5><ul className="list-disc space-y-0.5 pl-5 text-sm">{itens.map((t) => <li key={t}>{t}</li>)}</ul></div>;
}

/** Parecer da IA: recomendação, confiança, argumentos, o que confirmar, fontes e a prática de mercado (rotulada, nunca como norma). */
export function ParecerIa({ parecer }) {
  return (
    <div className="space-y-2 border border-sky-600/50 bg-sky-500/5 p-3" aria-label="Parecer da IA">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">Parecer da IA</h4>
        {parecer.confianca && <Tag tom={parecer.confianca === "baixa" ? "alerta" : "info"}>{ROTULO_CONFIANCA[parecer.confianca]}</Tag>}
        <span className="text-xs text-muted-foreground">É uma sugestão: quem decide é o consultor.</span>
      </div>
      <p className="text-sm">{parecer.recomendacao}</p>
      <div className="grid gap-3 sm:grid-cols-2"><Lista titulo="A favor" itens={parecer.aFavor} /><Lista titulo="Contra" itens={parecer.contra} /></div>
      <Lista titulo="O que confirmar" itens={parecer.oQueConfirmar} />
      <Lista titulo="Fontes" itens={parecer.fontes} />
      {parecer.praticaDeMercado && <div className="border-l-2 border-amber-600/60 pl-2 text-sm"><Tag tom="alerta">Prática de mercado, não é norma</Tag><p className="mt-1">{parecer.praticaDeMercado}</p></div>}
    </div>
  );
}

function CampoDaProposta({ campo, valor, disabled, aoMudar, destaque }) {
  if (campo === "finalidade") {
    // Sem opção vazia: a finalidade de um grupo não pode ser apagada por engano.
    return (
      <select className={campoCls} disabled={disabled} value={valor || ""} aria-label={`Proposta para ${rotuloDoCampo(campo)}`} onChange={(e) => aoMudar(e.target.value)}>
        {!valor && <option value="" disabled>Escolha a finalidade</option>}{FINALIDADES.map((f) => <option key={f} value={f}>{rotuloFinalidade(f)}</option>)}
      </select>
    );
  }
  // Guarda o texto como foi digitado (0,05 continua digitável); a conversão para número só acontece ao salvar.
  return <input className={`${campoCls} ${destaque ? "ring-2 ring-amber-500" : ""}`} inputMode={destaque ? "decimal" : undefined} disabled={disabled} value={valor ?? ""} aria-label={`Proposta para ${rotuloDoCampo(campo)}`} onChange={(e) => aoMudar(e.target.value)} />;
}

/** Detalhe do caso: problema, evidência, dados originais e atuais, proposta editável, justificativa, parecer da IA e as ações. */
export default function CasoDetalhe({ projeto, casoId, aoIrAoProximo, aoMudou }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const consulta = useQuery({ queryKey: chaves.caso(casoId), queryFn: () => san.caso(casoId) });
  const caso = consulta.data;
  const unico = caso && caso.itens?.length === 1 ? caso.itens[0] : null;
  const item = useQuery({ queryKey: [...chaves.todos(projeto.id), "item", unico], queryFn: () => san.item(unico), enabled: !!unico });
  const [edicaoLocal, setEdicao] = useState(null);
  const [modo, setModo] = useState(null); // 'rejeitar' | 'pedir'
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState(null);
  const [divergencia, setDivergencia] = useState(null); // { campos, vars }
  const { pode, razao } = usePodeAlterar();

  // A edição vale para este caso; ao trocar de caso, volta a vir do servidor.
  const edicao = caso ? (edicaoLocal && edicaoLocal.id === caso.id ? edicaoLocal : edicaoInicial(caso)) : null;
  const mudarEdicao = (parte) => setEdicao({ ...edicao, ...parte });
  const acoes = acoesDoCaso(caso);
  const parecer = lerParecer(caso);

  const depois = (mensagem) => async (_dados, variaveis) => {
    setEdicao(null); setModo(null); setTexto(""); setDivergencia(null); setAviso(mensagem ? { tom: "ok", texto: mensagem } : null);
    await atualizarTudo(qc, projeto.id);
    await qc.invalidateQueries({ queryKey: chaves.caso(casoId) });
    aoMudou?.();
    if (variaveis?.ir) aoIrAoProximo?.();
  };
  const falhou = async (err, vars) => {
    if (ehPropostaDesatualizada(err)) {
      setDivergencia({ campos: camposDivergentes(err), vars });
      setAviso({ tom: "alerta", texto: mensagemDeErro(err, "A proposta ficou desatualizada: o cadastro mudou depois que o caso foi proposto.") });
      return;
    }
    if (ehConflitoVersao(err) || ehAtividadesConfirmadas(err)) {
      atualizarTudo(qc, projeto.id);
      // Mantém o que foi digitado, recarrega o caso e usa a versão nova na próxima tentativa.
      const novo = await qc.fetchQuery({ queryKey: chaves.caso(casoId), queryFn: () => san.caso(casoId), staleTime: 0 });
      const r = aposConflito(edicao, novo, caso);
      setEdicao({ ...r.edicao, id: novo.id });
      setAviso({ tom: "alerta", texto: r.aviso });
      return;
    }
    setAviso({ tom: "erro", texto: mensagemDeErro(err) });
  };
  // A proposta digitada (texto) vira o tipo certo só aqui, ao enviar.
  const montarProposta = () => {
    const r = converterProposta(edicao.proposta, caso.proposta);
    if (r.invalidos.length) throw new Error(`Digite um número válido em: ${r.invalidos.map(rotuloDoCampo).join(", ")}.`);
    return r.valor;
  };
  const rascunho = useMutation({ mutationFn: () => san.salvarRascunho(casoId, { versao: caso.versao, proposta: montarProposta(), justificativa: edicao.justificativa }), onSuccess: depois("Rascunho salvo."), onError: falhou });
  const aprovar = useMutation({
    mutationFn: (v) => san.aprovar(casoId, {
      versao: caso.versao, proposta: montarProposta(), justificativa: edicao.justificativa, fundamento: edicao.fundamento || edicao.justificativa,
      ...(v?.confirmarDivergencia ? { confirmarDivergencia: true } : {}), ...(v?.confirmarFator ? { confirmarFator: true } : {}),
    }),
    onSuccess: depois("Caso aprovado."), onError: falhou,
  });
  /** Aprovar: o fator lido da descrição só segue com confirmação explícita do consultor. */
  const aprovarAgora = async (vars = {}) => {
    if (precisaConfirmarFator(caso) && !vars.confirmarFator) {
      const ok = await confirmar({ titulo: "Confirmar o fator de conversão?", rotulo: "Confirmo o fator", perigoso: false, descricao: `O fator ${textoDoValor(edicao.proposta?.fatorConversao)} foi lido da descrição do item, não de uma regra definida. Confirme que ele está correto antes de aprovar.` });
      if (!ok) return;
      vars = { ...vars, confirmarFator: true };
    }
    aprovar.mutate(vars);
  };
  const rejeitar = useMutation({ mutationFn: () => san.rejeitar(casoId, { versao: caso.versao, justificativa: texto }), onSuccess: depois("Caso rejeitado."), onError: falhou });
  const pedir = useMutation({ mutationFn: () => san.pedirInformacao(casoId, { versao: caso.versao, motivo: texto }), onSuccess: depois("Pedido de informação registrado."), onError: falhou });
  const reabrir = useMutation({ mutationFn: () => san.reabrir(casoId, caso.versao), onSuccess: depois("Caso reaberto."), onError: falhou });
  const pedirParecer = useMutation({
    mutationFn: () => san.pedirParecerIa(casoId),
    onSuccess: (r) => {
      const res = interpretarRespostaParecer(r);
      setAviso({ tom: res.ok ? "ok" : "alerta", texto: res.texto });
      if (res.ok) qc.invalidateQueries({ queryKey: chaves.caso(casoId) });
    },
    onError: (err) => setAviso({ tom: err?.status === 400 ? "erro" : "alerta", texto: err?.status === 400 ? mensagemDeErro(err) : mensagemDoParecer(err) }),
  });
  const ocupado = [aprovar, rascunho, rejeitar, pedir, reabrir].some((x) => x.isPending);

  const pedirReabertura = async () => {
    const desfaz = acoes.desfaz;
    const ok = await confirmar({
      titulo: desfaz ? "Desfazer a aprovação?" : "Reabrir o caso?", rotulo: desfaz ? "Desfazer" : "Reabrir",
      descricao: desfaz ? "Cada campo alterado por este caso volta ao valor anterior, e o desfazer fica no histórico." : "O caso volta a ficar proposto, sem alterar o cadastro.", perigoso: desfaz,
    });
    if (ok) reabrir.mutate();
  };
  const bloqueioAprovar = caso ? razaoSemAprovar(caso, edicao?.proposta, edicao?.justificativa) : null;

  return (
    <Carregar consulta={consulta} textoErro="Não foi possível carregar o caso.">
      {(c) => {
        const campos = [...new Set([...Object.keys(c.atual || {}), ...Object.keys(edicao.proposta || {})])];
        const original = item.data?.original;
        const trabalho = item.data?.trabalho;
        const pega = (parte, k) => (parte ? (k in parte ? parte[k] : parte.campos?.[k]) : undefined);
        const origemProposta = edicao.proposta?.origem;
        const suja = edicaoSuja(edicao, c);
        return (
          <article className="space-y-4 border border-border bg-card p-4" aria-label="Detalhe do caso">
            <header className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Tag>{ROTULO_CAMADA[c.camada]}</Tag><Tag tom={c.situacao === "APROVADO" ? "ok" : "info"}>{rotuloSituacaoCaso(c.situacao)}</Tag>
                <Tag tom={c.origem === "IA" ? "info" : "neutro"}>Origem: {c.origem === "IA" ? "IA" : "regra"}</Tag>
                <Tag>{c.itens.length.toLocaleString("pt-BR")} {c.itens.length === 1 ? "item" : "itens"}</Tag>
                {etiquetaDeEnquadramento(origemProposta) && <Tag tom={origemProposta === "EXCECAO" ? "alerta" : "info"}>{etiquetaDeEnquadramento(origemProposta)}</Tag>}
              </div>
              <h3 className="text-base font-semibold">{c.problema}</h3>
              {c.motivo && <p className="text-sm text-muted-foreground">Motivo registrado: {c.motivo}</p>}
            </header>

            {aviso && <Aviso tom={aviso.tom === "erro" ? "erro" : aviso.tom === "alerta" ? "alerta" : "ok"}>{aviso.texto}</Aviso>}
            {divergencia && (
              <Aviso tom="alerta" titulo="A proposta ficou desatualizada" acao={pode && <button type="button" className={botaoPrimario} disabled={ocupado} onClick={() => aprovarAgora({ ...(divergencia.vars || {}), confirmarDivergencia: true })}>Aprovar mesmo assim</button>}>
                <p>Estes campos mudaram no cadastro depois que o caso foi proposto:</p>
                <ul className="list-disc pl-5">{divergencia.campos.map((d, n) => <li key={`${n}-${d.campo}`}>{rotuloDoCampo(d.campo)}: agora {textoDoValor(d.atual)}; o caso esperava {textoDoValor(d.esperado)}</li>)}</ul>
              </Aviso>
            )}

            {c.evidencia?.length > 0 && (
              <section aria-label="Evidência"><h4 className="mb-1 text-sm font-semibold">Evidência</h4>
                <dl className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[max-content_1fr]">{c.evidencia.map((e) => <div key={e.rotulo} className="contents"><dt className="text-muted-foreground">{e.rotulo}</dt><dd>{e.valor}</dd></div>)}</dl>
              </section>
            )}

            {campos.length > 0 && (
              <section aria-label="Dados e proposta"><h4 className="mb-1 text-sm font-semibold">Dados e proposta</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-1">Campo</th>{unico && <th scope="col">Original (importado)</th>}<th scope="col">Atual</th><th scope="col">Proposta (editável)</th></tr></thead>
                    <tbody>
                      {campos.map((k) => (
                        <tr key={k} className="border-b border-border/60 align-top">
                          <th scope="row" className="py-1.5 pr-2 text-left font-normal">{rotuloDoCampo(k)}</th>
                          {unico && <td className="pr-2 tabular-nums">{textoDoValor(pega(original, k))}</td>}
                          <td className="pr-2 tabular-nums">{textoDoValor(k in (c.atual || {}) ? c.atual[k] : pega(trabalho, k))}</td>
                          <td className={k === "fatorConversao" && precisaInformarFator(c) ? "bg-amber-500/10" : ""}>{k in (edicao.proposta || {}) ? (propostaEditavel(k)
                            ? <CampoDaProposta campo={k} valor={edicao.proposta[k]} destaque={k === "fatorConversao" && precisaInformarFator(c)} disabled={!pode || !acoes.editar || ocupado} aoMudar={(v) => mudarEdicao({ proposta: { ...edicao.proposta, [k]: v } })} />
                            : <span>{textoDoValor(edicao.proposta[k])}</span>) : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Object.keys(c.proposta || {}).length === 0 && <p className="mt-1 text-sm text-muted-foreground">Este caso não traz alteração proposta: não há o que aprovar. Rejeite ou peça informação.</p>}
              </section>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><Rotulo>Justificativa</Rotulo><textarea className={`${campoCls} min-h-[84px]`} disabled={!pode || !acoes.editar || ocupado} value={edicao.justificativa} onChange={(e) => mudarEdicao({ justificativa: e.target.value })} /></label>
              <label className="block"><Rotulo>Fundamento (norma, artigo, critério)</Rotulo><textarea className={`${campoCls} min-h-[84px]`} disabled value={edicao.fundamento || "—"} readOnly /></label>
            </div>
            {c.impactos?.length > 0 && <Lista titulo="Impactos a conferir" itens={c.impactos} />}

            {parecer && <ParecerIa parecer={parecer} />}
            {acoes.aprovar && (
            <div>
              <button type="button" className={botaoSecundario} disabled={!pode || pedirParecer.isPending} title={razao} onClick={() => pedirParecer.mutate()}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />{pedirParecer.isPending ? "Consultando a IA…" : parecer ? "Pedir novo parecer da IA" : "Pedir parecer da IA"}
              </button>
              <span className="ml-2 text-xs text-muted-foreground">A IA só sugere; nunca grava a decisão.</span>
            </div>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              {modo && (
                <div className="space-y-1">
                  <label className="block"><Rotulo>{modo === "rejeitar" ? "Justificativa da rejeição (obrigatória)" : "Que informação falta? (obrigatório)"}</Rotulo><textarea className={`${campoCls} min-h-[64px]`} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
                  <div className="flex gap-2">
                    <button type="button" className={modo === "rejeitar" ? botaoPerigo : botaoPrimario} disabled={!texto.trim() || ocupado} onClick={() => (modo === "rejeitar" ? rejeitar : pedir).mutate()}>{modo === "rejeitar" ? "Confirmar rejeição" : "Registrar pedido"}</button>
                    <button type="button" className={botaoSecundario} onClick={() => { setModo(null); setTexto(""); }}>Cancelar</button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {suja && acoes.editar && <p className="w-full text-xs text-amber-800 dark:text-amber-200" role="status">Há alterações ainda não salvas como rascunho. Aprovar envia a proposta e a justificativa como estão na tela.</p>}
                {acoes.aprovar && <button type="button" className={botaoPrimario} disabled={!pode || ocupado || !!bloqueioAprovar} title={razao || bloqueioAprovar || undefined} onClick={() => aprovarAgora()}>Aprovar</button>}
                {acoes.aprovar && aoIrAoProximo && <button type="button" className={botaoPrimario} disabled={!pode || ocupado || !!bloqueioAprovar} title={razao || bloqueioAprovar || undefined} onClick={() => aprovarAgora({ ir: true })}>Aprovar e ir ao próximo</button>}
                {acoes.aprovar && bloqueioAprovar && <span className="text-xs text-muted-foreground">{bloqueioAprovar}</span>}
                {acoes.salvarRascunho && <button type="button" className={botaoSecundario} disabled={!pode || ocupado || !suja} title={razao} onClick={() => rascunho.mutate()}>Salvar rascunho</button>}
                {acoes.salvarRascunho && aoIrAoProximo && <button type="button" className={botaoSecundario} disabled={!pode || ocupado} title={razao} onClick={() => rascunho.mutate({ ir: true })}>Salvar e ir ao próximo pendente</button>}
                {acoes.rejeitar && <button type="button" className={botaoPerigo} disabled={!pode || ocupado} title={razao} onClick={() => { setModo("rejeitar"); setTexto(""); }}>Rejeitar…</button>}
                {acoes.pedirInformacao && <button type="button" className={botaoSecundario} disabled={!pode || ocupado} title={razao} onClick={() => { setModo("pedir"); setTexto(""); }}>Pedir informação…</button>}
                {acoes.reabrir && <button type="button" className={botaoSecundario} disabled={!pode || ocupado} title={razao} onClick={pedirReabertura}>{acoes.desfaz ? "Desfazer aprovação" : "Reabrir"}</button>}
              </div>
            </div>
          </article>
        );
      }}
    </Carregar>
  );
}
