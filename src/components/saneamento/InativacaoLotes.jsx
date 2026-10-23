import React, { useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Acc, Botao, Chip, Th, dataBr, fmt, ordenarPor, plural, useOrdenacao } from "./ui";
import { hojeIso, normalizarParams } from "./logica";
import { textoOrigem } from "./identidade";
import { saldoNaEscala } from "./conjuntos";
import { numeroBr } from "./unidades";
import { MIN_JUSTIFICATIVA, MIN_NOTA, MOTIVOS_EXCECAO, ROT_SITUACAO, VERIFICACOES, aprovarLote, candidatosDaInativacao, coberturaDoLote, decidirIndividual, devolverALista, individualValida, inativacaoVazia, lerCodigos, resumoInativacao, retirarDaLista, revogarLote, saldoLidoEmTodos, semDataNaLista, situacaoDoCandidato, validarAprovacaoLote } from "./inativacao";

export const TXT_INATIVACAO = "A data de corte seleciona candidatos para avaliação: ela não autoriza a inativação. A inativação só vira tarefa depois de aprovada, em lote por grupo, com uma lista fechada de códigos (base e data analisadas, verificações, aprovador e justificativa), ou item a item. Itens com saldo, documento aberto ou dependência não esclarecida ficam para decisão individual, e a aprovação em lote não cobre itens que entrem na lista depois. Nada é alterado no cadastro: a ferramenta registra a aprovação e gera a tarefa para as equipes executarem e confirmarem com evidência.";
const ROT_HISTORICO = {
  LOTE_SUBSTITUIDO: (h) => `Lista fechada anterior substituída por ${h.por} em ${dataBr(h.em)} (tinha ${h.lote?.itens?.length ?? 0} itens, aprovada por ${h.lote?.por || "—"} em ${dataBr(h.lote?.em)})`,
  LOTE_REVOGADO: (h) => `Lista fechada revogada por ${h.por} em ${dataBr(h.em)}${h.motivo ? `: ${h.motivo}` : ""} (tinha ${h.lote?.itens?.length ?? 0} itens, aprovada por ${h.lote?.por || "—"})`,
  LOTE_ESVAZIADO: (h) => `Lista fechada esvaziada em ${dataBr(h.em)}: todos os itens foram retirados`,
  ITEM_RETIRADO_DA_LISTA: (h) => `${h.id} retirado da lista por ${h.por} em ${dataBr(h.em)} (${MOTIVOS_EXCECAO[h.motivo] || h.motivo}${h.nota ? `: ${h.nota}` : ""})`,
  ITEM_DEVOLVIDO_A_LISTA: (h) => `${h.id} devolvido à lista elegível por ${h.por} em ${dataBr(h.em)} (não volta à lista fechada: pede nova aprovação)`,
  INDIVIDUAL_SUBSTITUIDA: (h) => `Decisão individual de ${h.id} trocada por ${h.por} em ${dataBr(h.em)} (antes: ${h.anterior?.acao === "INATIVAR" ? "inativar" : "manter ativo"})`,
  INDIVIDUAL_REMOVIDA: (h) => `Decisão individual de ${h.id} desfeita por ${h.por} em ${dataBr(h.em)} (antes: ${h.anterior?.acao === "INATIVAR" ? "inativar" : "manter ativo"})`,
};
const TOM_SITUACAO = { LOTE: "g", INATIVAR: "g", MANTER: "n", AGUARDA_LISTA: "a", SALDO: "a", EXCECAO: "a", SEM_IDENTIDADE: "r" };

/** Uma atestação (documentos abertos, vínculos, saldo): marcar que foi conferido e escrever o que foi conferido e onde. */
function Atestacao({ titulo, valor, onMudar, ajuda }) {
  const v = valor || {};
  return (
    <div className="space-y-1 rounded-lg border border-border p-2.5">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!v.feito} onChange={(e) => onMudar({ ...v, feito: e.target.checked })} aria-label={titulo} /><span>{titulo}{ajuda && <span className="block text-xs text-muted-foreground">{ajuda}</span>}</span></label>
      <input value={v.nota || ""} onChange={(e) => onMudar({ ...v, nota: e.target.value })} placeholder={`O que foi conferido e onde (ao menos ${MIN_NOTA} caracteres)`} aria-label={`${titulo}: o que foi conferido`} className="w-full border rounded-md p-1.5 text-xs bg-background text-foreground" />
    </div>
  );
}

/** Um grupo com candidatos: a lista fechada a aprovar (ou já aprovada), as verificações, as exceções e as decisões individuais. */
function GrupoInativacao({ g, ina, editar, estado, quem, baseInfo, escalaSaldo }) {
  const confirmar = useConfirmar();
  const [aberto, setAberto] = useState(false); const [novo, setNovo] = useState(false); const [lim, setLim] = useState(50);
  const [verifs, setVerifs] = useState({}); const [just, setJust] = useState("");
  const [codigos, setCodigos] = useState(""); const [motivo, setMotivo] = useState("DOCUMENTO"); const [nota, setNota] = useState(""); const [msg, setMsg] = useState("");
  const [ord, ordenar] = useOrdenacao(); const refCodigos = useRef(null);
  const lote = ina.lotes[g.grupo]; const cob = coberturaDoLote(g, ina);
  const lista = g.elegiveis.map((c) => c.id); const itensDaLista = g.elegiveis.map((c) => c.it); const saldoAuto = saldoLidoEmTodos(itensDaLista); const semDataN = semDataNaLista(itensDaLista);
  const p = normalizarParams(estado.params);
  const validacao = validarAprovacaoLote({ lista, justificativa: just, verificacoes: verifs, origem: estado.origem, extraidaEm: estado.extraidaEm, base: baseInfo, saldoLidoEmTodos: saldoAuto, semDataNaLista: semDataN });
  const outraBase = !!lote && (lote.base?.id !== baseInfo?.id || (lote.extraidaEm || "") !== (estado.extraidaEm || ""));
  const idsDoGrupo = useMemo(() => new Set(g.candidatos.map((c) => c.id)), [g]);
  const historico = useMemo(() => (ina.historico || []).filter((h) => h.grupo === g.grupo || idsDoGrupo.has(h.id)).slice(-6).reverse(), [ina.historico, g.grupo, idsDoGrupo]);
  const situ = (c) => situacaoDoCandidato(c, g.grupo, ina);
  const n = (s) => g.candidatos.filter((c) => situ(c) === s).length;
  const linhas = useMemo(() => ordenarPor(g.candidatos, ord, { codigo: (c) => c.id, descricao: (c) => c.it.descricao, mov: (c) => c.it.ultima_mov, saldo: (c) => (c.it.saldo != null ? Number(c.it.saldo) : null), situacao: (c) => ROT_SITUACAO[situacaoDoCandidato(c, g.grupo, ina)] }), [g, ord, ina]);

  const aprovar = async () => {
    if (!(await confirmar({ titulo: "Aprovar a inativação desta lista?", descricao: `Você aprova a inativação dos ${plural(lista.length, "item", "itens")} listados do grupo “${g.grupo}” (lista fechada). Itens que entrarem na lista depois não ficam cobertos e pedem nova aprovação. A ferramenta não altera o cadastro: gera as tarefas para as equipes executarem e confirmarem com evidência.`, rotulo: "Aprovar a lista" }))) return;
    editar((x) => aprovarLote(x, g.grupo, { lista, justificativa: just, verificacoes: verifs, base: baseInfo, origem: textoOrigem(estado.origem), extraidaEm: estado.extraidaEm, corte: p.desde, semData: p.semData, por: quem, em: hojeIso(), saldoLidoEmTodos: saldoAuto, semDataNaLista: semDataN }));
    setNovo(false); setVerifs({}); setJust("");
  };
  const revogar = async () => {
    if (!(await confirmar({ titulo: "Revogar a aprovação desta lista?", descricao: `A aprovação fica guardada no histórico do projeto e os ${plural(lote.itens.length, "item", "itens")} voltam a aguardar aprovação. Tarefas de inativação ainda não executadas deixam de existir; o que já foi confirmado pelas equipes continua registrado.`, rotulo: "Revogar a aprovação" }))) return;
    editar((x) => revogarLote(x, g.grupo, { por: quem, em: hojeIso(), motivo: "revogada pelo analista" }));
  };
  const retirar = (ids) => {
    const certos = ids.filter((id) => g.candidatos.some((c) => c.id === id && c.situacao === "ELEGIVEL")); const fora = ids.filter((id) => !certos.includes(id));
    if (certos.length) editar((x) => retirarDaLista(x, certos, { motivo, nota, por: quem, em: hojeIso() }));
    setMsg(`${certos.length ? `${plural(certos.length, "item retirado", "itens retirados")} da lista.` : "Nenhum item retirado."}${fora.length ? ` Não estão entre os elegíveis deste grupo: ${fora.slice(0, 6).join(", ")}${fora.length > 6 ? `, +${fora.length - 6}` : ""}.` : ""}`); if (certos.length) setCodigos("");
  };
  const individuais = g.individuais; // com saldo, retirados da lista e os que já têm decisão individual (vigente ou desatualizada)
  const mostrarForma = !lote || novo;

  return (
    <Acc aberto={aberto} onToggle={() => setAberto((a) => !a)}
      titulo={<><b className="font-medium">{g.grupo}</b>{lote ? (cob?.completa ? <Chip tom="g">Aprovado em lote</Chip> : <Chip tom="a">Aprovado: a lista mudou</Chip>) : <Chip tom="a">Sem aprovação</Chip>}
        <span className="text-xs text-muted-foreground">{plural(g.candidatos.length, "candidato", "candidatos")} · {fmt(n("LOTE"))} em lote · {fmt(n("INATIVAR"))} individuais · {fmt(g.candidatos.length - n("LOTE") - n("INATIVAR") - n("MANTER"))} aguardando</span></>}>
      <div className="space-y-3">
        {lote && (
          <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-xs">
            <p><b className="font-medium">Lista fechada de {plural(lote.itens.length, "item", "itens")}</b> aprovada por {lote.por} em {dataBr(lote.em)}, na base {lote.base?.arquivo || "—"} (extração de {dataBr(lote.extraidaEm)}), com corte em {dataBr(lote.corte)}.</p>
            {lote.origem && <p>Origem dos dados: {lote.origem}.</p>}
            <p>Justificativa: {lote.justificativa}</p>
            {outraBase && <p className="text-amber-700 dark:text-amber-300">Esta aprovação foi feita na base {lote.base?.arquivo || "—"} (extração de {dataBr(lote.extraidaEm)}); a base de hoje é {baseInfo?.arquivo || "—"} (extração de {dataBr(estado.extraidaEm)}). Confira se as verificações ainda valem e, se não, aprove a lista atual para registrar a base e a data de agora.</p>}
            <ul className="list-disc pl-5">{VERIFICACOES.map((v) => { const x = lote.verificacoes?.[v.id]; return x ? <li key={v.id}>{v.titulo}{x.auto ? " (feita pela ferramenta)" : ""}: {x.nota}</li> : null; })}</ul>
            {cob && cob.novos.length > 0 && <p className="text-amber-700 dark:text-amber-300">{plural(cob.novos.length, "candidato elegível está", "candidatos elegíveis estão")} fora desta aprovação ({cob.novos.slice(0, 6).join(", ")}{cob.novos.length > 6 ? `, +${cob.novos.length - 6}` : ""}): a lista aprovada não os cobre. Aprove a lista atual para incluí-los.</p>}
            {cob && cob.naoValemMais.length > 0 && <p className="text-amber-700 dark:text-amber-300">{plural(cob.naoValemMais.length, "item da lista aprovada não vale", "itens da lista aprovada não valem")} mais ({cob.naoValemMais.slice(0, 4).map((x) => `${x.id}: ${x.motivo}`).join("; ")}{cob.naoValemMais.length > 4 ? `; +${cob.naoValemMais.length - 4}` : ""}). Não geram tarefa.</p>}
            <div className="flex flex-wrap gap-2 pt-1"><Botao onClick={() => setNovo((v) => !v)} aria-expanded={novo}>{novo ? "Fechar a nova aprovação" : "Aprovar a lista atual"}</Botao><Botao onClick={revogar}>Revogar a aprovação…</Botao></div>
          </div>)}

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground">
            <Th chave="codigo" ord={ord} onOrdenar={ordenar}>Código</Th><Th chave="descricao" ord={ord} onOrdenar={ordenar}>Descrição</Th><Th chave="mov" ord={ord} onOrdenar={ordenar}>Última mov.</Th><Th chave="saldo" ord={ord} onOrdenar={ordenar}>Saldo</Th><Th chave="situacao" ord={ord} onOrdenar={ordenar}>Situação</Th><th className="p-1.5"></th></tr></thead>
            <tbody>{linhas.slice(0, lim).map((c) => { const s = situ(c); const saldo = saldoNaEscala(c.it.saldo, escalaSaldo);
              return (<tr key={c.it.linha} className="border-t border-border align-top"><td className="p-1.5 whitespace-nowrap">{c.id || "—"}</td><td className="p-1.5 max-w-[300px] break-words">{c.it.descricao || "—"}</td><td className="p-1.5 tabular-nums">{dataBr(c.it.ultima_mov)}</td><td className="p-1.5 tabular-nums text-right">{saldo == null ? "—" : numeroBr(saldo)}</td>
                <td className="p-1.5"><Chip tom={TOM_SITUACAO[s]}>{ROT_SITUACAO[s]}</Chip></td>
                <td className="p-1.5 whitespace-nowrap">{c.situacao === "ELEGIVEL" && !c.individual && <button type="button" className="text-primary underline" onClick={() => { setCodigos((t) => (t.trim() ? `${t.trim()}\n${c.id}` : c.id)); setTimeout(() => refCodigos.current?.focus(), 0); }}>Retirar da lista…</button>}</td></tr>); })}</tbody></table>
          {linhas.length > lim && <button type="button" onClick={() => setLim(lim + 200)} className="text-xs text-primary underline p-2">Mostrar mais ({fmt(linhas.length - lim)} restantes)</button>}
        </div>

        {g.elegiveis.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Retirar códigos da lista (decisão individual)</p>
              <p className="text-xs text-muted-foreground">Cole os códigos com documento aberto, dependência não esclarecida ou outro motivo (um por linha): eles saem da lista fechada e ficam para decisão individual.</p>
              <textarea ref={refCodigos} value={codigos} onChange={(e) => setCodigos(e.target.value)} rows={2} aria-label="Códigos a retirar da lista" placeholder="Um código por linha" className="w-full border rounded-md p-1.5 text-xs bg-background text-foreground" />
              <div className="flex flex-wrap items-center gap-2">
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo da retirada" className="border rounded px-1.5 py-1 text-xs bg-background">{Object.entries(MOTIVOS_EXCECAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Observação (opcional)" aria-label="Observação da retirada" className="min-w-[200px] flex-1 border rounded-md p-1.5 text-xs bg-background text-foreground" />
                <Botao disabled={!lerCodigos(codigos).length} onClick={() => retirar(lerCodigos(codigos))}>Retirar da lista</Botao>
              </div>
              {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
            </div>
          </div>)}
        {mostrarForma && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">Aprovar a lista fechada de {plural(lista.length, "item elegível", "itens elegíveis")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {semDataN === 0 ? <div className="rounded-lg border border-border p-2.5 text-xs"><b className="font-medium">{VERIFICACOES[0].titulo}</b><span className="block text-muted-foreground">Feita pela ferramenta: a última movimentação vem da base {baseInfo?.arquivo || "vinculada"}.</span></div>
                  : <Atestacao titulo={VERIFICACOES[0].titulo} valor={verifs.movimentacao} onMudar={(v) => setVerifs((x) => ({ ...x, movimentacao: v }))} ajuda={`${semDataN === 1 ? "1 item da lista não tem" : `${fmt(semDataN)} itens da lista não têm`} data de movimentação legível na base: a ferramenta não tem o que conferir neles. Confira a última movimentação no ERP.`} />}
                {saldoAuto ? <div className="rounded-lg border border-border p-2.5 text-xs"><b className="font-medium">{VERIFICACOES[1].titulo}</b><span className="block text-muted-foreground">Feita pela ferramenta: o saldo de todos os itens da lista foi lido da base e nenhum é diferente de zero (os que têm saldo ficam para decisão individual).</span></div>
                  : <Atestacao titulo={VERIFICACOES[1].titulo} valor={verifs.saldo} onMudar={(v) => setVerifs((x) => ({ ...x, saldo: v }))} ajuda="A base não traz o saldo de todos os itens da lista: confira no ERP." />}
                <Atestacao titulo={VERIFICACOES[2].titulo} valor={verifs.documentos} onMudar={(v) => setVerifs((x) => ({ ...x, documentos: v }))} ajuda="Itens com documento aberto saem da lista (campo acima)." />
                <Atestacao titulo={VERIFICACOES[3].titulo} valor={verifs.dependencias} onMudar={(v) => setVerifs((x) => ({ ...x, dependencias: v }))} ajuda="Itens com vínculo não esclarecido saem da lista (campo acima)." />
              </div>
              <label className="block text-xs text-muted-foreground">Justificativa da aprovação (fica registrada com o seu nome e a data)
                <textarea value={just} onChange={(e) => setJust(e.target.value)} rows={2} aria-label="Justificativa da aprovação" className="mt-1 w-full border rounded-md p-1.5 text-sm bg-background text-foreground" /></label>
              {!validacao.ok && <ul className="list-disc pl-5 text-xs text-muted-foreground">{validacao.faltas.map((f) => <li key={f}>{f}</li>)}</ul>}
              <Botao disabled={!validacao.ok} onClick={aprovar}>Aprovar a lista fechada de {plural(lista.length, "item", "itens")}</Botao>
            </div>
          </div>)}

        {individuais.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-medium">Decisão individual ({fmt(individuais.length)})</p>
            <p className="text-xs text-muted-foreground">Itens com saldo ou retirados da lista não entram na aprovação em lote. Para inativar, escreva a justificativa (e, havendo saldo, como ele foi tratado: transferido, baixado ou segregado).</p>
            <div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><th className="p-1.5">Código</th><th className="p-1.5">Descrição</th><th className="p-1.5 text-right">Saldo</th><th className="p-1.5">Motivo</th><th className="p-1.5">Decisão</th></tr></thead>
              <tbody>{individuais.map((c) => { const d = c.individual; const exc = ina.excecoes[c.id]; const saldo = saldoNaEscala(c.it.saldo, escalaSaldo);
                const antiga = c.individualAntiga; const motivoTxt = c.situacao === "SALDO" ? "Saldo em estoque" : c.situacao === "EXCECAO" ? MOTIVOS_EXCECAO[exc?.motivo] || "Retirado da lista" : "Decidido individualmente";
                return (<tr key={c.it.linha} className="border-t border-border align-top"><td className="p-1.5 whitespace-nowrap">{c.id}</td><td className="p-1.5 max-w-[240px] break-words">{c.it.descricao}</td><td className="p-1.5 tabular-nums text-right">{saldo == null ? "—" : numeroBr(saldo)}</td>
                  <td className="p-1.5 max-w-[200px] break-words">{motivoTxt}{exc?.nota ? `: ${exc.nota}` : ""}{c.situacao === "EXCECAO" && <div><button type="button" className="text-primary underline" title="Devolve o item à lista elegível. Ele não volta à lista fechada já aprovada: aparece como novo elegível e pede nova aprovação." onClick={() => editar((x) => devolverALista(x, [c.id], { por: quem, em: hojeIso() }))}>Devolver à lista</button></div>}</td>
                  <td className="p-1.5"><div className="space-y-1">
                    <select value={d?.acao || ""} aria-label={`Decisão sobre ${c.id}`} onChange={(e) => editar((x) => decidirIndividual(x, c.id, { acao: e.target.value || null, justificativa: d?.justificativa || "", por: quem, em: hojeIso(), item: c.it }))} className="border rounded px-1 py-0.5 bg-background"><option value="">Aguardando decisão</option><option value="INATIVAR">Inativar</option><option value="MANTER">Manter ativo</option></select>
                    {d?.acao === "INATIVAR" && <input value={d.justificativa || ""} onChange={(e) => editar((x) => decidirIndividual(x, c.id, { acao: "INATIVAR", justificativa: e.target.value, por: quem, em: hojeIso(), item: c.it }))} placeholder="Justificativa (e como o saldo foi tratado)" aria-label={`Justificativa para inativar ${c.id}`} className="block w-64 border rounded px-1.5 py-0.5 bg-background" />}
                    {d?.acao === "INATIVAR" && !individualValida(d) && <p className="text-[11px] text-amber-700 dark:text-amber-300">Escreva a justificativa (ao menos {MIN_JUSTIFICATIVA} caracteres): sem ela a inativação não gera tarefa.</p>}
                    {antiga && <p className="max-w-[260px] text-[11px] text-amber-700 dark:text-amber-300">Havia a decisão “{antiga.acao === "INATIVAR" ? "inativar" : "manter ativo"}”, de {antiga.por || "—"} em {dataBr(antiga.em)}, tomada com saldo {antiga.antes?.saldo != null ? numeroBr(saldoNaEscala(antiga.antes.saldo, escalaSaldo)) : "—"} e última movimentação {dataBr(antiga.antes?.ultima_mov)}: o item mudou desde então e a decisão não vale. Decida de novo.</p>}
                  </div></td></tr>); })}</tbody></table></div>
          </div>)}
        {historico.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-sm font-medium">Histórico deste grupo</p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{historico.map((h, i) => <li key={`${h.tipo}${h.id || h.grupo}${i}`}>{(ROT_HISTORICO[h.tipo] || (() => h.tipo))(h)}</li>)}</ul>
          </div>)}
      </div>
    </Acc>
  );
}

/**
 * Inativação por data de uso (passo De/para): os itens que o corte deixou fora do escopo são candidatos, e só a aprovação (em lote, com lista fechada, ou individual) gera tarefa.
 * Cada grupo mostra a lista a aprovar, as verificações, as exceções e as decisões individuais.
 */
export default function InativacaoLotes({ estado, setEstado, escopo, indice, quem, baseInfo, escalaSaldo = 1, onMudarExtracao }) {
  const ina = estado.inativacao || inativacaoVazia();
  const cand = useMemo(() => candidatosDaInativacao(escopo, indice, ina), [escopo, indice, ina]);
  const resumo = useMemo(() => resumoInativacao(ina, escopo, indice), [ina, escopo, indice]);
  const editar = (fn) => setEstado((e) => ({ ...e, inativacao: fn(e.inativacao || inativacaoVazia()) }));
  if (!cand.total) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Inativação por data de uso">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">Inativação por data de uso</h3><Chip>{plural(resumo.candidatos, "candidato", "candidatos")}</Chip><Chip tom="g">{fmt(resumo.aprovados)} aprovados</Chip><Chip tom="a">{fmt(resumo.aguardando)} aguardando</Chip>{resumo.semIdentidade > 0 && <Chip tom="r">{fmt(resumo.semIdentidade)} sem código que os identifique</Chip>}</div>
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /><p>{TXT_INATIVACAO}</p></div>
      <label className="flex flex-wrap items-center gap-2 text-sm">Data da extração da base analisada
        <input type="date" value={estado.extraidaEm || ""} onChange={(e) => onMudarExtracao(e.target.value)} aria-label="Data da extração da base analisada" className="border rounded p-1.5 bg-background" />
        {!estado.extraidaEm && <span className="text-xs text-amber-700 dark:text-amber-300">Obrigatória para aprovar uma lista: a aprovação registra a base e a data analisadas.</span>}</label>
      <div className="space-y-2">{cand.grupos.map((g) => <GrupoInativacao key={g.grupo} g={g} ina={ina} editar={editar} estado={estado} quem={quem} baseInfo={baseInfo} escalaSaldo={escalaSaldo} />)}</div>
    </section>
  );
}
