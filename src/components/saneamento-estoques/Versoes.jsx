import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import { chaves, san } from "./api";
import { Aviso, botaoPrimario, botaoSecundario, campoCls, Carregar, EstadoCarregando, Rotulo, Tag, usePodeAlterar } from "./comuns";
import { avisosDaLiberacao, dadosDoErro, fmtDataHora, mensagemDeErro, ROTULO_CAMADA, rotuloDoCampo, rotuloSituacao, textoDoValor, versaoCriada } from "./logica";

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

function Entrega({ projetoId, versao, rotulo }) {
  // O relatório PDF só existe para a versão liberada; a exportação para revisão é só o Excel.

  const [erro, setErro] = useState(null);
  const baixar = useMutation({ mutationFn: (tipo) => san.baixarEntrega(projetoId, tipo, versao), onError: (e) => setErro(mensagemDeErro(e, "Não foi possível gerar o arquivo agora.")), onSuccess: () => setErro(null) });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={botaoSecundario} disabled={baixar.isPending} onClick={() => baixar.mutate("excel")} aria-label={`Baixar o Excel: ${rotulo}`}><Download className="h-4 w-4" aria-hidden="true" />Excel</button>
      {versao && <button type="button" className={botaoSecundario} disabled={baixar.isPending} onClick={() => baixar.mutate("pdf")} aria-label={`Baixar o relatório PDF: ${rotulo}`}><FileText className="h-4 w-4" aria-hidden="true" />Relatório PDF</button>}
      {baixar.isPending && <span className="text-xs text-muted-foreground" role="status">Gerando…</span>}
      {erro && <span className="text-xs text-destructive" role="alert">{erro}</span>}
    </div>
  );
}

/** Versões: liberar (foto da base), listar, comparar duas e baixar. "Para revisão" (base de agora) não é "liberada". */
export default function Versoes({ projeto }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const q = useQuery({ queryKey: chaves.versoes(projeto.id), queryFn: () => san.versoes(projeto.id) });
  const [rotulo, setRotulo] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [msg, setMsg] = useState(null);
  const [avisos, setAvisos] = useState(null);
  const { pode, razao } = usePodeAlterar();
  const liberar = useMutation({
    mutationFn: (extra) => san.liberarVersao(projeto.id, rotulo.trim(), extra),
    onSuccess: (v) => {
      const lista = avisosDaLiberacao(v);
      // O servidor pediu confirmação (avisos e nada criado): mostra antes de liberar de fato.
      if (lista.length && !versaoCriada(v)) { setAvisos(lista); setMsg(null); return; }
      setAvisos(null); setRotulo("");
      setMsg({ tom: lista.length ? "alerta" : "ok", texto: `Versão ${v.numero} liberada.${lista.length ? ` Avisos: ${lista.join(" ")}` : ""}` });
      qc.invalidateQueries({ queryKey: chaves.versoes(projeto.id) });
    },
    onError: (e) => {
      const lista = avisosDaLiberacao(dadosDoErro(e));
      if (lista.length) { setAvisos(lista); setMsg(null); } else setMsg({ tom: "erro", texto: mensagemDeErro(e) });
    },
  });
  const pedirLiberacao = async () => {
    const ok = await confirmar({ titulo: "Liberar uma versão?", rotulo: "Liberar", perigoso: false, descricao: `Guarda uma foto da base como está agora, com o rótulo "${rotulo.trim()}". A versão liberada não muda depois.` });
    if (ok) liberar.mutate();
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="san-ver-rev" className="space-y-2 border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 id="san-ver-rev" className="font-semibold">Para revisão</h2><Tag tom="alerta">Não é entrega</Tag></div>
        <p className="text-sm text-muted-foreground">Exportação da base como está agora, com tudo o que ainda está proposto ou pendente. Serve para conferir o trabalho; não vai ao cliente.</p>
        <Entrega projetoId={projeto.id} versao={null} rotulo="para revisão" />
      </section>

      <section aria-labelledby="san-ver-lib" className="space-y-2 border border-border bg-card p-4">
        <h2 id="san-ver-lib" className="font-semibold">Liberar uma versão</h2>
        <p className="text-sm text-muted-foreground">A versão liberada é a entrega: só os dados aprovados, com as exclusões e pendências informadas.</p>
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
                  <thead><tr className="bg-muted/50 text-left text-xs text-muted-foreground"><th scope="col" className="px-2 py-1.5">Comparar</th><th scope="col">Versão</th><th scope="col">Rótulo</th><th scope="col">Liberada por</th><th scope="col">Quando</th><th scope="col" className="text-right">Itens</th><th scope="col" className="text-right">Casos abertos</th><th scope="col">Baixar</th></tr></thead>
                  <tbody>
                    {lista.map((v) => (
                      <tr key={v.id} className="border-t border-border/60 align-top">
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <label className="mr-2 text-xs"><input type="radio" name="comparar-a" checked={a === v.id} onChange={() => setA(v.id)} aria-label={`Versão ${v.numero} como a primeira da comparação (antes)`} /> A</label>
                          <label className="text-xs"><input type="radio" name="comparar-b" checked={b === v.id} onChange={() => setB(v.id)} aria-label={`Versão ${v.numero} como a segunda da comparação (depois)`} /> B</label>
                        </td>
                        <td className="whitespace-nowrap tabular-nums">{v.numero} <Tag tom="ok">Liberada</Tag></td><td>{v.rotulo}</td><td>{v.usuario}</td><td>{fmtDataHora(v.createdAt)}</td>
                        <td className="text-right tabular-nums">{(v.resumo?.itens ?? 0).toLocaleString("pt-BR")}</td><td className="text-right tabular-nums">{(v.resumo?.casosAbertos ?? 0).toLocaleString("pt-BR")}</td>
                        <td className="py-1"><Entrega projetoId={projeto.id} versao={v} rotulo={`versão ${v.numero}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">{a && b && a === b ? "Escolha duas versões diferentes para comparar." : "Marque A (antes) e B (depois) para comparar duas versões."}</p>
              {a && b && a !== b && <Comparacao projetoId={projeto.id} a={a} b={b} />}
            </>
          )}
        </Carregar>
      </section>
    </div>
  );
}
