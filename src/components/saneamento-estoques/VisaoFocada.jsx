import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { san, chaves, atualizarTudo } from "./api";
import { Aviso, botaoSecundario, campoCls, Carregar, EstadoCarregando, Rotulo, SeloSituacao, Tag, usePodeAlterar } from "./comuns";
import {
  casoValeParaEnquadramento, CAMPOS_DA_CAMADA, celulaDa, EXCECOES_POR_CAMADA, etiquetaDeEnquadramento, FINALIDADES, fmtDataHora, mensagemDeErro, montarExcecao, rotuloDoCampo, rotuloFinalidade,
  ROTULO_CAMADA, rotuloSituacaoCaso, textoDoValor,
} from "./logica";

const valorDoItem = (parte, campo) => (parte ? (campo in parte ? parte[campo] : parte.campos?.[campo]) : undefined);

function Campos({ camada, dados }) {
  const campos = CAMPOS_DA_CAMADA[camada] || [];
  return (
    <table className="w-full text-sm" aria-label={`Campos de ${ROTULO_CAMADA[camada]}`}>
      <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-1">Campo</th><th scope="col">Original (importado)</th><th scope="col">Atual (decisões aplicadas)</th></tr></thead>
      <tbody>
        {campos.map((c) => {
          const original = valorDoItem(dados.original, c);
          const atual = valorDoItem(dados.trabalho, c);
          const mudou = JSON.stringify(original ?? null) !== JSON.stringify(atual ?? null);
          const f = (v) => (c === "finalidade" && v ? rotuloFinalidade(v) : textoDoValor(v));
          return (
            <tr key={c} className="border-b border-border/60">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal">{rotuloDoCampo(c)}</th>
              <td className="pr-2 tabular-nums">{f(original)}</td>
              <td className={`tabular-nums ${mudou ? "font-semibold" : ""}`}>{f(atual)}{mudou && <Tag tom="info" className="ml-2">alterado</Tag>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Enquadramento legal do caso tributário, com a etiqueta "herdado do conjunto" ou "exceção". */
function Enquadramento({ caso }) {
  const p = caso.proposta || {};
  const etiqueta = etiquetaDeEnquadramento(p.origem);
  if (!p.enquadramentoLegal && !p.cClassTrib && !etiqueta) return null;
  return (
    <div className="mt-1 space-y-0.5 border-l-2 border-border pl-2 text-xs">
      {p.enquadramentoLegal && <p>{p.enquadramentoLegal}{p.artigo ? ` (${p.artigo})` : ""}</p>}
      {(p.cClassTrib || p.cst) && <p className="text-muted-foreground">cClassTrib {textoDoValor(p.cClassTrib)} · CST {textoDoValor(p.cst)}</p>}
      {etiqueta && <Tag tom={p.origem === "EXCECAO" ? "alerta" : "info"}>{etiqueta}</Tag>}
    </div>
  );
}

function FormularioDeExcecao({ projeto, item, dadosDoItem, camada, aoRegistrar }) {
  const campos = EXCECOES_POR_CAMADA[camada];
  const { pode, razao } = usePodeAlterar();
  const [valores, setValores] = useState({});
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState(null);
  const registrar = useMutation({
    mutationFn: () => san.registrarCasos(projeto.id, montarExcecao({ camada, item, valores, motivo })),
    onSuccess: () => { setValores({}); setMotivo(""); setErro(null); aoRegistrar(); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  if (!campos) return null;
  const enviar = (e) => {
    e.preventDefault();
    try { montarExcecao({ camada, item: { ...item, trabalho: dadosDoItem?.trabalho }, valores, motivo }); } catch (x) { setErro(x.message); return; }
    registrar.mutate();
  };
  return (
    <form onSubmit={enviar} className="space-y-2 border border-border bg-muted/30 p-3" aria-label="Exceção deste item">
      <h4 className="text-sm font-semibold">Exceção só para este item</h4>
      <p className="text-xs text-muted-foreground">{camada === "GRUPOS_FINALIDADE" ? "A finalidade é confirmada por grupo; use isto só se este item for diferente do grupo." : "O item herda o tratamento do conjunto; use isto só se ele for diferente."} Abre um caso individual, que precisa ser aprovado.</p>
      {campos.map((c) => (
        <label key={c.campo} className="block"><Rotulo>{c.rotulo}</Rotulo>
          {c.tipo === "finalidade" ? (
            <select className={campoCls} value={valores[c.campo] || ""} onChange={(e) => setValores((v) => ({ ...v, [c.campo]: e.target.value }))}>
              <option value="">Escolha</option>{FINALIDADES.map((f) => <option key={f} value={f}>{rotuloFinalidade(f)}</option>)}
            </select>
          ) : <input className={campoCls} value={valores[c.campo] || ""} onChange={(e) => setValores((v) => ({ ...v, [c.campo]: e.target.value }))} />}
        </label>
      ))}
      <label className="block"><Rotulo>Motivo da exceção (obrigatório)</Rotulo><textarea className={`${campoCls} min-h-[60px]`} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <button type="submit" className={botaoSecundario} disabled={!pode || registrar.isPending} title={razao}>{registrar.isPending ? "Registrando…" : "Registrar exceção"}</button>
    </form>
  );
}

/** Visão focada: o item numa camada, com os campos daquela revisão, os casos e (onde cabe) a exceção item a item. */
export default function VisaoFocada({ projeto, item, camada, aoFechar, aoAbrirCaso, aoProximoPendente }) {
  const qc = useQueryClient();
  const [historico, setHistorico] = useState(false);
  const dados = useQuery({ queryKey: [...chaves.todos(projeto.id), "item", item.id], queryFn: () => san.item(item.id) });
  const filtroCasos = { item_id: item.id, camada };
  const casos = useQuery({ queryKey: chaves.casos(projeto.id, filtroCasos), queryFn: () => san.casos(projeto.id, { ...filtroCasos, limite: 50 }) });
  const hist = useQuery({ queryKey: [...chaves.todos(projeto.id), "historico", item.id], queryFn: () => san.historicoDoItem(item.id), enabled: historico });
  const celula = celulaDa(item, camada);

  return (
    <Sheet open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{ROTULO_CAMADA[camada]}</SheetTitle>
          <SheetDescription>{item.codigo}{item.estabelecimento ? ` · ${item.estabelecimento}` : ""} — {item.descricao}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {celula ? <SeloSituacao situacao={celula.situacao} revisar={celula.revisar} /> : <Tag>Sem dados nesta camada</Tag>}
            {celula?.revisar && celula.revisar_causa && <span className="text-xs text-muted-foreground">{celula.revisar_causa}</span>}
            <button type="button" className={`${botaoSecundario} ml-auto`} onClick={aoProximoPendente}>Ir ao próximo pendente</button>
          </div>

          <section aria-label="Campos desta revisão" className="space-y-1">
            <h3 className="text-sm font-semibold">Campos desta revisão</h3>
            <Carregar consulta={dados} textoErro="Não foi possível carregar o item.">{(d) => <Campos camada={camada} dados={d} />}</Carregar>
          </section>

          <section aria-label="Casos desta camada" className="space-y-2">
            <h3 className="text-sm font-semibold">Casos deste item nesta camada</h3>
            <Carregar consulta={casos} textoErro="Não foi possível carregar os casos." vazio={(d) => (d.casos.length ? null : "Nenhum caso aberto para este item nesta camada.")}>
              {(d) => (
                <ul className="space-y-2">
                  {d.casos.map((c) => (
                    <li key={c.id} className="border border-border bg-card p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2"><Tag>{rotuloSituacaoCaso(c.situacao)}</Tag><Tag tom={c.origem === "IA" ? "info" : "neutro"}>{c.origem === "IA" ? "IA" : "Regra"}</Tag>{c.qtdItens > 1 && <Tag>conjunto de {c.qtdItens} itens</Tag>}</div>
                      <p className="mt-1">{c.problema}</p>
                      {camada === "TRIBUTARIO" && casoValeParaEnquadramento(c) && <Enquadramento caso={c} />}
                      <button type="button" className="mt-1 text-primary underline" onClick={() => aoAbrirCaso?.(c.id)}>Abrir o caso</button>
                    </li>
                  ))}
                </ul>
              )}
            </Carregar>
          </section>

          {dados.data && EXCECOES_POR_CAMADA[camada] && (
            <FormularioDeExcecao projeto={projeto} item={item} dadosDoItem={dados.data} camada={camada}
              aoRegistrar={() => { atualizarTudo(qc, projeto.id); }} />
          )}

          <section aria-label="Histórico do item" className="space-y-1">
            <button type="button" className={botaoSecundario} aria-expanded={historico} onClick={() => setHistorico((h) => !h)}>{historico ? "Esconder o histórico" : "Ver o histórico de decisões do item"}</button>
            {historico && (hist.isError ? <Aviso tom="erro">Não foi possível carregar o histórico.</Aviso> : hist.data === undefined ? <EstadoCarregando /> : hist.data.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma decisão registrada para este item.</p> : (
              <ul className="space-y-1 text-xs">
                {hist.data.map((h) => <li key={h.id} className="border border-border p-2"><span className="font-medium">{rotuloDoCampo(h.campo)}</span>: {textoDoValor(h.antes)} → {textoDoValor(h.depois)} <span className="text-muted-foreground">({h.tipo}, {h.usuario}, {fmtDataHora(h.quando)})</span>{h.fundamento && <span className="block text-muted-foreground">{h.fundamento}</span>}</li>)}
              </ul>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
