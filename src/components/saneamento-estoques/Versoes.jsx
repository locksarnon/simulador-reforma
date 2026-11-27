import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, History } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import { atualizarTudo, chaves, renovarAposRestauracao, san } from "./api";
import { BotaoPolitica } from "./diretrizes/Diretrizes";
import { Aviso, botaoPerigo, botaoPrimario, botaoSecundario, campoCls, Carregar, EstadoCarregando, faixaSecaoCls, Rotulo, secaoCls, Tag, tituloSecaoCls, usePodeAlterar } from "./comuns";
import {
  avisosDaLiberacao, dadosDoErro, fase1Liberada, fmtDataHora, JUSTIFICATIVA_MINIMA, rotuloDaFaseLiberada, linhasDaPrevia, mensagemDeErro, podeRestaurar, restauracoesDaVersao, ROTULO_CAMADA, rotuloDoCampo, rotuloSituacao,
  textoDoValor, versaoCriada,
} from "./logica";

function Comparacao({ projetoId, a, b }) {
  const q = useQuery({ queryKey: [...chaves.todos(projetoId), "comparar", a, b], queryFn: () => san.compararVersoes(projetoId, a, b) });
  if (q.isError) return <Aviso tom="erro">{mensagemDeErro(q.error)}</Aviso>;
  if (!q.data) return <EstadoCarregando texto="Comparando as versões…" />;
  const d = q.data;
  const codigos = new Map([...d.alterados, ...d.acrescentados, ...d.retirados].map((i) => [i.id, i.codigo]));
  return (
    <div className="space-y-3 border border-border bg-card p-3" aria-label="Comparação das versões">
      <h3 className="font-semibold">Versão {d.de.numero} ({d.de.rotulo}) → versão {d.para.numero} ({d.para.rotulo})</h3>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[["Itens acrescentados", d.totais.acrescentados], ["Itens retirados", d.totais.retirados], ["Itens alterados", d.totais.alterados], ["Células que mudaram de situação", d.totais.celulasMudaram]].map(([r, n]) => (
          <div key={r} className="border border-border p-2"><div className="text-xl font-semibold tabular-nums">{n.toLocaleString("pt-BR")}</div>{r}</div>
        ))}
      </div>
      {d.truncado && <Aviso tom="alerta">A lista abaixo mostra só os 1.000 primeiros de cada tipo. Os totais acima são completos.</Aviso>}
      {d.alterados.length > 0 && (
        <details><summary className="cursor-pointer text-sm font-semibold">Itens alterados ({d.alterados.length})</summary>
          <ul className="mt-1 max-h-72 space-y-1 overflow-auto text-xs">{d.alterados.map((i) => <li key={i.id} className="border border-border p-1.5"><span className="font-medium tabular-nums">{i.codigo}</span>: {i.campos.map((c) => `${rotuloDoCampo(c.campo)} ${textoDoValor(c.antes)} → ${textoDoValor(c.depois)}`).join("; ")}</li>)}</ul></details>
      )}
      {d.acrescentados.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">Acrescentados ({d.acrescentados.length})</summary><p className="mt-1 max-h-40 overflow-auto text-xs tabular-nums">{d.acrescentados.map((i) => i.codigo).join(", ")}</p></details>}
      {d.retirados.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">Retirados ({d.retirados.length})</summary><p className="mt-1 max-h-40 overflow-auto text-xs tabular-nums">{d.retirados.map((i) => i.codigo).join(", ")}</p></details>}
      {d.celulas.length > 0 && (
        <details><summary className="cursor-pointer text-sm font-semibold">Mudanças de situação ({d.celulas.length})</summary>
          <ul className="mt-1 max-h-60 overflow-auto text-xs">{d.celulas.map((c) => <li key={`${c.item_id}${c.camada}`}><span className="tabular-nums">{c.codigo ?? codigos.get(c.item_id) ?? `item ${String(c.item_id).slice(0, 8)}`}</span> · {ROTULO_CAMADA[c.camada] || c.camada}: {rotuloSituacao(c.antes)} → {rotuloSituacao(c.depois)}</li>)}</ul></details>
      )}
    </div>
  );
}

/**
 * Continuar a partir de uma versão liberada: a prévia mostra antes quantos itens e campos voltam aos valores da foto; exige justificativa.
 * Nada é apagado: cada campo grava uma decisão no histórico e a restauração pode ser desfeita.
 */
export function ContinuarVersao({ projeto, versao, aoFechar }) {
  const qc = useQueryClient();
  const { pode, razao } = usePodeAlterar();
  const [justificativa, setJustificativa] = useState("");
  const [msg, setMsg] = useState(null);
  const q = useQuery({ queryKey: chaves.continuar(projeto.id, versao.id), queryFn: () => san.previaContinuar(projeto.id, versao.id) });
  const restaurar = useMutation({
    mutationFn: () => san.continuarVersao(projeto.id, versao.id, { versao: q.data.versaoProjeto, previa: q.data.previa, justificativa: justificativa.trim() }),
    onSuccess: (r) => {
      setJustificativa("");
      setMsg({ tom: "ok", texto: `Base de trabalho restaurada à versão ${versao.numero}: ${r.itens.toLocaleString("pt-BR")} itens e ${r.campos.toLocaleString("pt-BR")} campos. Confira as células marcadas “revisar”.` });
      atualizarTudo(qc, projeto.id);
      qc.invalidateQueries({ queryKey: ["san", "projeto"] });
    },
    onError: (e) => { setMsg({ tom: "erro", texto: mensagemDeErro(e) }); renovarAposRestauracao(qc, projeto.id); q.refetch(); },
  });
  const p = q.data;
  return (
    <section aria-labelledby="san-ver-continuar" className={`space-y-3 ${secaoCls}`}>
      <div className={`-mx-4 -mt-4 mb-3 flex flex-wrap items-center justify-between gap-2 ${faixaSecaoCls}`}>
        <h3 id="san-ver-continuar" className="text-sm font-semibold text-foreground">Continuar a partir da versão {versao.numero} ({versao.rotulo})</h3>
        <button type="button" className={botaoSecundario} onClick={aoFechar}>Fechar</button>
      </div>
      <p className="text-sm text-muted-foreground">A base de trabalho volta aos valores desta versão. Decisões e histórico ficam; os casos aprovados depois cujo valor deixa de valer voltam a proposto.</p>
      {q.isError && <Aviso tom="erro">{mensagemDeErro(q.error, "Não foi possível montar a prévia.")}</Aviso>}
      {!p && !q.isError && <EstadoCarregando texto="Montando a prévia…" />}
      {p && (
        <>
          <Aviso tom={p.totais.campos ? "alerta" : "info"} titulo="Prévia">
            <ul className="list-disc pl-5">{linhasDaPrevia(p).map((l) => <li key={l}>{l}</li>)}</ul>
          </Aviso>
          {p.porCampo.length > 0 && <p className="text-sm">Campos: {p.porCampo.map((c) => `${rotuloDoCampo(c.campo)} (${c.itens.toLocaleString("pt-BR")})`).join(", ")}</p>}
          {p.amostra.length > 0 && (
            <details><summary className="cursor-pointer text-sm font-semibold">Exemplos ({p.amostra.length} de {p.totais.itens.toLocaleString("pt-BR")})</summary>
              <ul className="mt-1 max-h-60 space-y-1 overflow-auto text-xs">{p.amostra.map((i) => <li key={i.id} className="border border-border p-1.5"><span className="font-medium tabular-nums">{i.codigo}</span>: {i.campos.map((c) => `${rotuloDoCampo(c.campo)} ${textoDoValor(c.antes)} → ${textoDoValor(c.depois)}`).join("; ")}</li>)}</ul></details>
          )}
          {p.totais.campos > 0 && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (podeRestaurar(p, justificativa)) restaurar.mutate(); }}>
              <label className="block"><Rotulo>Justificativa (obrigatória, ao menos {JUSTIFICATIVA_MINIMA} caracteres)</Rotulo>
                <textarea className={campoCls} rows={2} maxLength={2000} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Ex.: o cliente pediu voltar à Entrega 1 para reavaliar o NCM." /></label>
              <button type="submit" className={botaoPrimario} disabled={!pode || !podeRestaurar(p, justificativa) || restaurar.isPending} title={razao}><History className="h-4 w-4" aria-hidden="true" />{restaurar.isPending ? "Restaurando…" : "Restaurar e continuar"}</button>
            </form>
          )}
        </>
      )}
      {msg && <Aviso tom={msg.tom === "erro" ? "erro" : "ok"}>{msg.texto}</Aviso>}
    </section>
  );
}

/** Restaurações feitas a partir da versão, com o botão Desfazer (o campo que mudou depois por outra decisão impede o desfazer). */
function Restauracoes({ projeto, versao }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { pode, razao } = usePodeAlterar();
  const [erro, setErro] = useState(null);
  const desfazer = useMutation({
    mutationFn: (r) => san.desfazerRestauracao(projeto.id, versao.id, r.id, projeto.versao),
    onSuccess: () => { setErro(null); atualizarTudo(qc, projeto.id); renovarAposRestauracao(qc, projeto.id); },
    onError: (e) => { setErro(mensagemDeErro(e)); renovarAposRestauracao(qc, projeto.id); },
  });
  const lista = restauracoesDaVersao(versao);
  if (!lista.length) return null;
  const pedir = async (r) => {
    const ok = await confirmar({ titulo: "Desfazer a restauração?", rotulo: "Desfazer", descricao: `Os ${r.campos} campos de ${r.itens} itens voltam ao valor de antes da restauração de ${fmtDataHora(r.quando)}. Cada um grava uma decisão no histórico.` });
    if (ok) desfazer.mutate(r);
  };
  return (
    <ul className="mt-1 space-y-1 text-xs text-muted-foreground" aria-label={`Restaurações a partir da versão ${versao.numero}`}>
      {lista.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2">
          <span>Base restaurada a esta versão em {fmtDataHora(r.quando)} por {r.usuario} ({r.itens.toLocaleString("pt-BR")} itens): “{r.justificativa}”</span>
          {r.desfeita ? <Tag>Desfeita em {fmtDataHora(r.desfeita.em)}</Tag>
            : <button type="button" className={botaoPerigo} disabled={!pode || desfazer.isPending} title={razao} onClick={() => pedir(r)}>Desfazer restauração</button>}
        </li>
      ))}
      {erro && <li className="text-destructive" role="alert">{erro}</li>}
    </ul>
  );
}

function Entrega({ projetoId, versao, rotulo }) {
  // O relatório PDF só existe para a versão liberada; a exportação para revisão é só o Excel.

  const [erro, setErro] = useState(null);
  const baixar = useMutation({ mutationFn: (tipo) => san.baixarEntrega(projetoId, tipo, versao), onError: (e) => setErro(mensagemDeErro(e, "Não foi possível gerar o arquivo agora.")), onSuccess: () => setErro(null) });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={botaoSecundario} disabled={baixar.isPending} onClick={() => baixar.mutate("excel")} aria-label={`Baixar o Excel: ${rotulo}`}><Download className="h-4 w-4" aria-hidden="true" />Excel</button>
      {versao && <button type="button" className={botaoSecundario} disabled={baixar.isPending} onClick={() => baixar.mutate("pdf")} aria-label={`Baixar o relatório PDF: ${rotulo}`}><FileText className="h-4 w-4" aria-hidden="true" />Relatório PDF</button>}
      <BotaoPolitica projetoId={projetoId} versao={versao} />
      {baixar.isPending && <span className="text-xs text-muted-foreground" role="status">Gerando…</span>}
      {erro && <span className="text-xs text-destructive" role="alert">{erro}</span>}
    </div>
  );
}

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");

/**
 * O que entra e o que fica fora de uma versão liberada, a partir do estado das camadas: "Entram: N aprovados (…). Ficam fora: N pendentes,
 * N aguardando informação." Sem dados (falhou a leitura): vazio, e o diálogo mostra só o texto padrão.
 */
export function textoDaLiberacao(estado) {
  if (!estado) return "";
  const e = estado.efeitos || {};
  const efeitos = [
    [e.inativados, (n) => `${fmt(n)} ${n === 1 ? "item inativado" : "itens inativados"}`],
    [e.unificacoes, (n) => `${fmt(n)} ${n === 1 ? "unificação" : "unificações"}`],
    [e.finalidade, (n) => `${fmt(n)} ${n === 1 ? "item com finalidade" : "itens com finalidade"}`],
    [e.descricao, (n) => `${fmt(n)} ${n === 1 ? "descrição padronizada" : "descrições padronizadas"}`],
    [e.unidade, (n) => `${fmt(n)} ${n === 1 ? "unidade ajustada" : "unidades ajustadas"}`],
    [e.ncm, (n) => `${fmt(n)} ${n === 1 ? "NCM corrigido" : "NCMs corrigidos"}`],
    [e.tributario, (n) => `${fmt(n)} ${n === 1 ? "item com tratamento tributário" : "itens com tratamento tributário"}`],
  ].filter(([n]) => Number(n) > 0).map(([n, f]) => f(Number(n)));
  const aprovados = Number(estado.aprovados) || 0;
  const entram = `Entram: ${fmt(aprovados)} ${aprovados === 1 ? "caso aprovado" : "casos aprovados"}${efeitos.length ? ` (${efeitos.join(", ")})` : ""}.`;
  const fora = `Ficam fora: ${fmt(estado.abertos)} ${Number(estado.abertos) === 1 ? "pendente" : "pendentes"} de decisão, ${fmt(estado.aguardando)} aguardando informação.`;
  return `${entram}
${fora}`;
}

/** Versões: liberar (foto da base), listar, comparar duas e baixar. "Para revisão" (base de agora) não é "liberada". */
export default function Versoes({ projeto }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const q = useQuery({ queryKey: chaves.versoes(projeto.id), queryFn: () => san.versoes(projeto.id) });
  const [rotulo, setRotulo] = useState("");
  // Fase da liberação: Fase 1 (Cadastro saneado) ou Fase 2 (Tributário aprovado, só depois de uma Fase 1 liberada).
  const fases = useQuery({ queryKey: chaves.fases(projeto.id), queryFn: () => san.fases(projeto.id) });
  const [fase, setFase] = useState("FASE1");
  const podeFase2 = fase1Liberada(fases.data, q.data);
  const faseEnviada = fase === "FASE2" && !podeFase2 ? "FASE1" : fase;
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [msg, setMsg] = useState(null);
  const [avisos, setAvisos] = useState(null);
  const [continuarDe, setContinuarDe] = useState(null);
  const { pode, razao } = usePodeAlterar();
  const liberar = useMutation({
    mutationFn: (extra) => san.liberarVersao(projeto.id, rotulo.trim(), { fase: faseEnviada, ...(extra || {}) }),
    onSuccess: (v) => {
      const lista = avisosDaLiberacao(v);
      // O servidor pediu confirmação (avisos e nada criado): mostra antes de liberar de fato.
      if (lista.length && !versaoCriada(v)) { setAvisos(lista); setMsg(null); return; }
      setAvisos(null); setRotulo("");
      setMsg({ tom: lista.length ? "alerta" : "ok", texto: `Versão ${v.numero} liberada.${lista.length ? ` Avisos: ${lista.join(" ")}` : ""}` });
      qc.invalidateQueries({ queryKey: chaves.versoes(projeto.id) });
      qc.invalidateQueries({ queryKey: chaves.fases(projeto.id) });
    },
    onError: (e) => {
      const lista = avisosDaLiberacao(dadosDoErro(e));
      if (lista.length) { setAvisos(lista); setMsg(null); } else setMsg({ tom: "erro", texto: mensagemDeErro(e) });
    },
  });
  const pedirLiberacao = async () => {
    // A conta do que entra e do que fica fora é lida na hora (o que a pessoa vê é o que vai na foto).
    const estado = await qc.fetchQuery({ queryKey: chaves.estadoCamadas(projeto.id), queryFn: () => san.estadoCamadas(projeto.id), staleTime: 0 }).catch(() => null);
    const conta = textoDaLiberacao(estado);
    const ok = await confirmar({ titulo: "Liberar uma versão?", rotulo: "Liberar", perigoso: false, descricao: `${conta ? `${conta}

` : ""}Guarda uma foto da base como está agora, como ${rotuloDaFaseLiberada(faseEnviada)}, com o rótulo "${rotulo.trim()}". A versão liberada não muda depois.` });
    if (ok) liberar.mutate();
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="san-ver-rev" className={`space-y-2 ${secaoCls}`}>
        <div className={`-mx-4 -mt-4 mb-3 flex flex-wrap items-center gap-2 ${faixaSecaoCls}`}><h2 id="san-ver-rev" className="text-sm font-semibold text-foreground">Para revisão</h2><Tag tom="alerta">Não é entrega</Tag></div>
        <p className="text-sm text-muted-foreground">Exportação da base como está agora, com tudo o que ainda está proposto ou pendente. Serve para conferir o trabalho; não vai ao cliente.</p>
        <Entrega projetoId={projeto.id} versao={null} rotulo="para revisão" />
      </section>

      <section aria-labelledby="san-ver-lib" className={`space-y-2 ${secaoCls}`}>
        <h2 id="san-ver-lib" className={tituloSecaoCls}>Liberar uma versão</h2>
        <p className="text-sm text-muted-foreground">A versão liberada é a entrega: só os dados aprovados, com as exclusões e pendências informadas.</p>
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-medium">Fase desta liberação</legend>
          {["FASE1", "FASE2"].map((f) => (
            <label key={f} className={`flex items-center gap-2 text-sm ${f === "FASE2" && !podeFase2 ? "text-muted-foreground" : ""}`}>
              <input type="radio" name="san-ver-fase" value={f} checked={faseEnviada === f} disabled={f === "FASE2" && !podeFase2} onChange={() => setFase(f)} />
              {rotuloDaFaseLiberada(f)}
            </label>
          ))}
          {!podeFase2 && <p className="text-xs text-muted-foreground">A Fase 2 (Tributário aprovado) fica disponível depois de liberada uma versão da Fase 1 (Cadastro saneado).</p>}
        </fieldset>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (rotulo.trim()) pedirLiberacao(); }}>
          <label className="block min-w-[240px] flex-1"><Rotulo>Rótulo da versão</Rotulo><input className={campoCls} value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Ex.: Entrega 1" maxLength={120} /></label>
          <button type="submit" className={botaoPrimario} disabled={!pode || !rotulo.trim() || liberar.isPending} title={razao}>{liberar.isPending ? "Liberando…" : "Liberar versão"}</button>
        </form>
        {avisos && (
          <Aviso tom="alerta" titulo="Antes de liberar, confira os avisos" acao={<button type="button" className={botaoPrimario} disabled={liberar.isPending} onClick={() => liberar.mutate({ confirmarAvisos: true })}>Liberar mesmo assim</button>}>
            <ul className="list-disc pl-5">{avisos.map((a, n) => <li key={`${n}-${a}`}>{a}</li>)}</ul>
          </Aviso>
        )}
        {msg && <Aviso tom={msg.tom === "erro" ? "erro" : msg.tom === "alerta" ? "alerta" : "ok"}>{msg.texto}</Aviso>}
      </section>

      <section aria-labelledby="san-ver-lista" className="space-y-2">
        <h2 id="san-ver-lista" className="font-semibold">Versões liberadas</h2>
        <Carregar consulta={q} textoErro="Não foi possível carregar as versões." tituloVazio="Nenhuma versão liberada" vazio={(d) => (d.length ? null : "Libere a primeira versão quando houver decisões aprovadas para entregar.")}>
          {(lista) => (
            <>
              <div className="overflow-x-auto border border-border bg-card">
                <table className="w-full text-sm" aria-label="Versões liberadas">
                  <thead><tr className="bg-muted/50 text-left text-xs text-muted-foreground"><th scope="col" className="px-2 py-1.5">Comparar</th><th scope="col">Versão</th><th scope="col">Fase</th><th scope="col">Rótulo</th><th scope="col">Liberada por</th><th scope="col">Quando</th><th scope="col" className="text-right">Itens</th><th scope="col" className="text-right">Casos abertos</th><th scope="col">Baixar</th><th scope="col">Continuar</th></tr></thead>
                  <tbody>
                    {lista.map((v) => (
                      <tr key={v.id} className="border-t border-border/60 align-top">
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <label className="mr-2 text-xs"><input type="radio" name="comparar-a" checked={a === v.id} onChange={() => setA(v.id)} aria-label={`Versão ${v.numero} como a primeira da comparação (antes)`} /> A</label>
                          <label className="text-xs"><input type="radio" name="comparar-b" checked={b === v.id} onChange={() => setB(v.id)} aria-label={`Versão ${v.numero} como a segunda da comparação (depois)`} /> B</label>
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{v.numero} <Tag tom="ok">Liberada</Tag></td><td className="whitespace-nowrap">{rotuloDaFaseLiberada(v.resumo?.fase) || "—"}</td><td>{v.rotulo}<Restauracoes projeto={projeto} versao={v} /></td><td>{v.usuario}</td><td>{fmtDataHora(v.createdAt)}</td>
                        <td className="text-right tabular-nums">{(v.resumo?.itens ?? 0).toLocaleString("pt-BR")}</td><td className="text-right tabular-nums">{(v.resumo?.casosAbertos ?? 0).toLocaleString("pt-BR")}</td>
                        <td className="py-1"><Entrega projetoId={projeto.id} versao={v} rotulo={`versão ${v.numero}`} /></td>
                        <td className="py-1"><button type="button" className={botaoSecundario} disabled={!pode} title={razao} onClick={() => setContinuarDe(v)} aria-label={`Continuar a partir da versão ${v.numero}`}><History className="h-4 w-4" aria-hidden="true" />Continuar a partir desta versão</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">{a && b && a === b ? "Escolha duas versões diferentes para comparar." : "Marque A (antes) e B (depois) para comparar duas versões."}</p>
              {a && b && a !== b && <Comparacao projetoId={projeto.id} a={a} b={b} />}
              {continuarDe && <ContinuarVersao key={continuarDe.id} projeto={projeto} versao={continuarDe} aoFechar={() => setContinuarDe(null)} />}
            </>
          )}
        </Carregar>
      </section>
    </div>
  );
}
