import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, RotateCw, Trash2 } from "lucide-react";
import { chaves, san } from "./api";
import { Aviso, botaoPrimario, botaoSecundario, campoCls, Tag, usePodeAlterar } from "./comuns";
import { caminhoDaAba, destinoDaAba, fmtData, mensagemDeErro, ROTULO_CAMADA } from "./logica";

/** Onde se mudam os critérios que vêm da Configuração (corte de movimentação): Fase 1 > 1.1 Preparar e diretrizes. */
export const DESTINO_CONFIGURACAO = { fase: "fase1", aba: "preparar" };
/** Ver nas Diretrizes: a aba que junta os dados e as Diretrizes da fase da camada (1.1 ou 2.1), rolando até as Diretrizes. */
export const destinoDasDiretrizes = (camada) => ({ ...destinoDaAba("diretrizes", { camada }), rolar: "diretrizes" });

/** O valor escrito para gente: "85%", "5 itens", "Sim". */
export function textoDoValor(p, v) {
  if (!p) return "";
  if (p.tipo === "booleano") return v === true ? "Sim" : "Não";
  if (p.tipo === "percentual") return `${v}%`;
  if (p.tipo === "numero") return `${v}${p.unidade ? ` ${p.unidade}` : ""}`;
  if (p.tipo === "data") return fmtData(v) || String(v ?? "");
  return (p.opcoes || []).find((o) => o.valor === v)?.rotulo ?? String(v ?? "");
}

/**
 * O que a tela diz depois do texto livre: encaixado num critério (proposta a confirmar) ou verificação manual. Encaixado num critério de
 * outra camada (`camadaAtual` diferente), o título diz qual.
 */
export function textoDoResultadoLivre(r, camadaAtual = null) {
  if (!r) return null;
  if (r.resultado === "PROPOSTA") {
    const p = r.proposta;
    const outra = p.camada && camadaAtual && p.camada !== camadaAtual ? ` da camada ${ROTULO_CAMADA[p.camada] || p.camada}` : "";
    return {
      tom: "info", titulo: `Encaixado no critério "${p.criterio}"${outra} com valor ${p.textoValor}`,
      texto: p.igualAoAtual ? "O critério já está com esse valor: não há o que mudar." : `Hoje está ${p.textoAtual}. Nada foi alterado: confirme para aplicar.`,
    };
  }
  return {
    tom: r.iaDisponivel ? "ok" : "alerta", titulo: "Vai para a política como verificação manual (o sistema não aplica sozinho)",
    texto: r.iaDisponivel ? (r.explicacao || null) : "A IA não estava disponível para conferir se a frase se encaixa num critério ajustável: ficou como verificação manual, com essa observação.",
  };
}

/** Mensagem de "analise de novo" quando um critério da camada mudou depois da última análise. */
export const TEXTO_CRITERIO_ALTERADO = "Critério alterado: analise a camada de novo";

function CampoValor({ parametro, valor, aoMudar, desabilitado, id }) {
  if (parametro.tipo === "booleano") {
    return (
      <select id={id} className={`${campoCls} w-auto py-0.5 text-xs`} value={valor ? "sim" : "nao"} disabled={desabilitado} onChange={(e) => aoMudar(e.target.value === "sim")}>
        <option value="sim">Sim</option><option value="nao">Não</option>
      </select>
    );
  }
  if (parametro.tipo === "lista") {
    return (
      <select id={id} className={`${campoCls} w-auto py-0.5 text-xs`} value={valor} disabled={desabilitado} onChange={(e) => aoMudar(e.target.value)}>
        {(parametro.opcoes || []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input id={id} type={parametro.tipo === "data" ? "date" : "number"} className={`${campoCls} w-20 py-0.5 text-xs`} value={valor ?? ""} min={parametro.min} max={parametro.max} step={1}
        disabled={desabilitado} onChange={(e) => aoMudar(parametro.tipo === "data" ? e.target.value : e.target.value === "" ? "" : Number(e.target.value))} />
      {parametro.unidade && <span>{parametro.unidade}</span>}
    </span>
  );
}

/** Um critério ajustável: o texto, o valor editável ali mesmo e "Salvar" quando mudou. */
function CriterioAjustavel({ projetoId, camada, criterio, pode, razao, aoAlterar }) {
  const qc = useQueryClient();
  const p = criterio.parametro;
  const [valor, setValor] = useState(p.valor);
  const [erro, setErro] = useState(null);
  const mudou = valor !== p.valor;
  const salvar = useMutation({
    mutationFn: () => san.ajustarCriterio(projetoId, camada, p.chave, valor),
    onSuccess: (r) => { setErro(null); qc.setQueryData(chaves.criterios(projetoId), r); qc.invalidateQueries({ queryKey: chaves.estadoCamadas(projetoId) }); if (r.alterado) aoAlterar(); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const id = `crit-${camada}-${p.chave}`;
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <label htmlFor={id}>{criterio.texto}:</label>
        <CampoValor id={id} parametro={p} valor={valor} aoMudar={setValor} desabilitado={!pode || salvar.isPending} />
        {mudou && (
          <>
            <button type="button" className={`${botaoPrimario} px-2 py-0.5 text-xs`} disabled={!pode || salvar.isPending || valor === ""} onClick={() => salvar.mutate()}>{salvar.isPending ? "Salvando…" : "Salvar"}</button>
            <button type="button" className={`${botaoSecundario} px-2 py-0.5 text-xs`} onClick={() => { setValor(p.valor); setErro(null); }}>Cancelar</button>
          </>
        )}
        {p.alterado && !mudou && <Tag tom="info">padrão: {textoDoValor(p, p.padrao)}</Tag>}
      </div>
      <p className="pl-4 text-[11px] text-muted-foreground">{p.ajuda}{!pode && razao ? ` ${razao}` : ""}</p>
      {erro && <p role="alert" className="pl-4 text-[11px] text-destructive">{erro}</p>}
    </li>
  );
}

/** "Acrescentar critério (texto livre)": a IA encaixa num critério ajustável (proposta a confirmar) ou fica como verificação manual. */
function TextoLivre({ projetoId, camada, pode, razao, aoAlterar, resultadoInicial = null }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState(resultadoInicial);
  const [erro, setErro] = useState(null);
  const enviar = useMutation({
    mutationFn: () => san.normalizarCriterio(projetoId, camada, texto),
    onSuccess: (r) => {
      setErro(null); setResultado(r);
      if (r.resultado === "MANUAL") { setTexto(""); if (r.camadas) qc.setQueryData(chaves.criterios(projetoId), { camadas: r.camadas, historico: r.historico || [] }); }
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  // Aplicar grava o critério na camada da proposta (pode ser outra): só esta camada fica "alterada" quando a proposta é dela; a outra
  // camada mostra "desatualizada" pelo estado das camadas, que é renovado.
  const aplicar = useMutation({
    mutationFn: (p) => san.ajustarCriterio(projetoId, p.camada, p.chave, p.valor),
    onSuccess: (r, p) => { setResultado(null); setTexto(""); qc.setQueryData(chaves.criterios(projetoId), r); qc.invalidateQueries({ queryKey: chaves.estadoCamadas(projetoId) }); if (r.alterado && p.camada === camada) aoAlterar(); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const msg = textoDoResultadoLivre(resultado, camada);
  const id = `crit-livre-${camada}`;
  return (
    <div className="space-y-1.5 border-t border-border pt-2">
      <label htmlFor={id} className="block font-medium">Acrescentar critério (texto livre)</label>
      <p className="text-[11px] text-muted-foreground">Escreva em uma frase. O sistema confere se ela se encaixa num critério que ele sabe aplicar; se não, ela vai para a política como verificação manual.</p>
      <textarea id={id} rows={2} className={`${campoCls} text-xs`} value={texto} maxLength={400} disabled={!pode || enviar.isPending} title={!pode ? razao : undefined}
        placeholder="Ex.: só indicar duplicidade com similaridade a partir de 90%" onChange={(e) => setTexto(e.target.value)} />
      <button type="button" className={`${botaoSecundario} px-2 py-0.5 text-xs`} disabled={!pode || enviar.isPending || texto.trim().length < 5} onClick={() => { setResultado(null); enviar.mutate(); }}>
        {enviar.isPending ? "Conferindo…" : "Acrescentar"}
      </button>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {msg && (
        <Aviso tom={msg.tom} titulo={msg.titulo}
          acao={resultado.resultado === "PROPOSTA" && !resultado.proposta.igualAoAtual ? (
            <span className="flex gap-1">
              <button type="button" className={`${botaoPrimario} px-2 py-0.5 text-xs`} disabled={!pode || aplicar.isPending} onClick={() => aplicar.mutate(resultado.proposta)}>{aplicar.isPending ? "Aplicando…" : "Aplicar"}</button>
              <button type="button" className={`${botaoSecundario} px-2 py-0.5 text-xs`} onClick={() => setResultado(null)}>Descartar</button>
            </span>
          ) : null}>
          {msg.texto}
        </Aviso>
      )}
    </div>
  );
}

/**
 * "O que foi considerado" de uma camada (cartão da Cobertura, aba Análise): fechado por padrão. Aberto, lista o que a camada confere, em
 * português simples. Dois jeitos de mudar, separados: o valor dos critérios ajustáveis (ali mesmo, com "Salvar") e "Acrescentar critério
 * (texto livre)". Critério alterado: aviso "analise a camada de novo" com o botão. Critérios das Diretrizes e da Configuração levam até lá.
 * `dados` = a linha da camada em GET criterios; `aoAnalisar` = analisar a camada em segundo plano (o mesmo da Cobertura).
 */
export default function Considerado({ projetoId, camada, rotulo, dados, aoIrPara, aoAnalisar, analisando = false, desatualizadaPorCriterio = false, abertoInicial = false, alteradoInicial = false, resultadoInicial = null, aberto: abertoControlado, aoAlternar }) {
  const qc = useQueryClient();
  const { pode, razao } = usePodeAlterar();
  const [abertoLocal, setAberto] = useState(abertoInicial);
  // Controlado pela Cobertura (o cartão aberto ocupa a linha toda) ou por conta própria.
  const aberto = abertoControlado ?? abertoLocal;
  const alternar = () => (aoAlternar ? aoAlternar(!aberto) : setAberto((a) => !a));
  const [alterado, setAlterado] = useState(alteradoInicial);
  const [erroRemover, setErroRemover] = useState(null);
  const remover = useMutation({
    mutationFn: (id) => san.removerCriterioManual(projetoId, id),
    onSuccess: (r) => { setErroRemover(null); qc.setQueryData(chaves.criterios(projetoId), r); qc.invalidateQueries({ queryKey: chaves.estadoCamadas(projetoId) }); },
    onError: (e) => setErroRemover(mensagemDeErro(e)),
  });
  const criterios = dados?.criterios || [];
  const manuais = dados?.manuais || [];
  const idPainel = `considerado-${camada}`;
  const pedirAnalise = alterado || desatualizadaPorCriterio;
  return (
    <div className="text-xs">
      <button type="button" className="inline-flex items-center gap-1 text-left font-medium text-foreground hover:underline" aria-expanded={aberto} aria-controls={idPainel} onClick={alternar}>
        {aberto ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        O que foi considerado{criterios.length ? ` (${criterios.length + manuais.length})` : ""}
      </button>
      {aberto && (
        <div id={idPainel} className="mt-1.5 space-y-2" aria-label={`O que foi considerado em ${rotulo}`}>
          {pedirAnalise && (
            <Aviso tom="alerta" titulo={TEXTO_CRITERIO_ALTERADO}
              acao={aoAnalisar ? <button type="button" className={`${botaoSecundario} px-2 py-0.5 text-xs`} disabled={!pode || analisando} onClick={() => { setAlterado(false); aoAnalisar(); }}><RotateCw className="h-3.5 w-3.5" aria-hidden="true" />Analisar de novo</button> : null}>
              Os casos desta camada ainda são da regra anterior.
            </Aviso>
          )}
          {!dados ? <p className="text-muted-foreground">Carregando…</p> : (
            <ul className="space-y-1.5">
              {criterios.map((c) => {
                if (c.parametro) return <CriterioAjustavel key={`${c.id}-${String(c.parametro.valor)}`} projetoId={projetoId} camada={camada} criterio={c} pode={pode} razao={razao} aoAlterar={() => setAlterado(true)} />;
                return (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-1.5">
                    <span aria-hidden="true">•</span>
                    <span>{c.texto}{c.origem === "CONFIGURACAO" ? `: ${c.valorConfiguracao ? fmtData(c.valorConfiguracao) : "corte não definido (critério não aplicado)"}` : ""}</span>
                    {c.origem === "DIRETRIZES" && aoIrPara && <button type="button" className="text-primary underline" onClick={() => aoIrPara(destinoDasDiretrizes(camada))}>Ver nas Diretrizes</button>}
                    {c.origem === "CONFIGURACAO" && aoIrPara && <button type="button" className="text-primary underline" onClick={() => aoIrPara(DESTINO_CONFIGURACAO)}>Alterar em {caminhoDaAba(DESTINO_CONFIGURACAO.fase, DESTINO_CONFIGURACAO.aba)}</button>}
                  </li>
                );
              })}
              {manuais.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline gap-1.5">
                  <span aria-hidden="true">•</span><span>{m.texto}</span><Tag tom="alerta">verificação manual</Tag>
                  {m.nota && <span className="text-[11px] text-muted-foreground">{m.nota}</span>}
                  <button type="button" className="text-muted-foreground hover:text-destructive disabled:opacity-50" aria-label={`Remover a verificação manual: ${m.texto}`} disabled={!pode || remover.isPending} onClick={() => remover.mutate(m.id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {erroRemover && <Aviso tom="erro">{erroRemover}</Aviso>}
          <TextoLivre projetoId={projetoId} camada={camada} pode={pode} razao={razao} aoAlterar={() => setAlterado(true)} resultadoInicial={resultadoInicial} />
        </div>
      )}
    </div>
  );
}
