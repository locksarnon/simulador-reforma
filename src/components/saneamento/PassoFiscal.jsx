import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Info, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { hojeIso } from "./logica";
import { grupoSaneado } from "./analise";
import { Acc, Botao, Chip, Th, dataBr, fmt, ordenarPor, plural, useOrdenacao } from "./ui";
import { ACOES, ORDEM_SITUACOES, SITUACOES, decisaoValida, itensDoGrupoFiscal, leituraFiscal, linhasMatriz, mapaClasses, podeConcluir, resumoDeLeituras } from "./fiscal";
import { gerarXlsxFiscal } from "./matrizFiscal";

const slugTxt = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const formatarNcm = (v) => { const s = String(v ?? "").replace(/\D/g, ""); return s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : String(v ?? ""); };
const RANQUE = Object.fromEntries(ORDEM_SITUACOES.map((s, i) => [s, i]));
const EM_LOTE = ["BENEFICIO", "SEM_CLASSE", "DIVERGENTE"]; // situações em que "adotar a classe sugerida" pode ser feito em bloco

/** Decisão do analista em uma linha: escolhe a ação e, quando a ação pede, o NCM correto ou o fundamento escrito. */
function CelulaDecisao({ l, d, travada, onMudar }) {
  const acoes = SITUACOES[l.situacao].acoes.filter((a) => a !== "ACEITAR" || l.sugerida);
  if (!acoes.length) return <span className="text-muted-foreground">—</span>;
  const valida = decisaoValida(l.situacao, l, d);
  return (
    <div className="space-y-1">
      <select value={d?.acao || ""} disabled={travada} onChange={(e) => onMudar(l.linha, e.target.value ? { acao: e.target.value } : null)} aria-label={`Decisão fiscal da linha ${l.linha}`} className="border rounded px-1 py-0.5 bg-background text-xs max-w-[220px]">
        <option value="">Decidir…</option>
        {acoes.map((a) => <option key={a} value={a}>{ACOES[a]}</option>)}
      </select>
      {d?.acao === "NCM" && <input value={d.ncm || ""} disabled={travada} onChange={(e) => onMudar(l.linha, { ncm: e.target.value })} placeholder="NCM correto (8 dígitos)" aria-label={`NCM correto da linha ${l.linha}`} className="block w-40 border rounded px-1 py-0.5 bg-background text-xs tabular-nums" />}
      {d?.acao === "MANTER" && <input value={d.obs || ""} disabled={travada} onChange={(e) => onMudar(l.linha, { obs: e.target.value })} placeholder="Fundamento (base legal ou requisito do produto)" aria-label={`Fundamento da linha ${l.linha}`} className="block w-56 border rounded px-1 py-0.5 bg-background text-xs" />}
      {d && !valida && <p className="text-[11px] text-amber-700 dark:text-amber-300">{d.acao === "NCM" ? "Informe o NCM com 8 dígitos." : d.acao === "MANTER" ? "Escreva o fundamento (ao menos 5 caracteres)." : "Decisão incompleta."}</p>}
    </div>
  );
}

/** Um grupo liberado para a revisão fiscal: resumo por situação, filtro, tabela de itens com decisão e a conclusão do grupo. */
function GrupoFiscal({ g, saem, classes, decisoes, concl, onMudar, onLote, onConcluir, onReabrir, onEmitir }) {
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState("DECIDIR");
  const [limite, setLimite] = useState(100);
  const [ord, ordenar] = useOrdenacao();
  const itens = useMemo(() => itensDoGrupoFiscal(g.itens, g.nome, saem), [g, saem]);
  const leituras = useMemo(() => itens.map((it) => leituraFiscal(it, classes)), [itens, classes]);
  const resumo = useMemo(() => resumoDeLeituras(leituras, decisoes), [leituras, decisoes]);
  const filtradas = useMemo(() => leituras.filter((l) => (filtro === "TODAS" ? true : filtro === "DECIDIR" ? SITUACOES[l.situacao].decide : l.situacao === filtro)), [leituras, filtro]);
  const linhas = useMemo(() => ordenarPor(filtradas, ord, {
    codigo: (l) => l.codigo, descricao: (l) => l.descricao, ncm: (l) => l.ncm, informada: (l) => l.informada, sugerida: (l) => l.sugerida, fundamento: (l) => l.fundamento,
    situacao: (l) => RANQUE[l.situacao], decisao: (l) => (decisoes?.[l.linha] ? ACOES[decisoes[l.linha].acao] : ""),
  }), [filtradas, ord, decisoes]);
  const semDecisao = filtradas.filter((l) => SITUACOES[l.situacao].decide && !decisaoValida(l.situacao, l, decisoes?.[l.linha]));
  const aceitaveis = semDecisao.filter((l) => EM_LOTE.includes(l.situacao) && l.sugerida); // em bloco só onde adotar a sugestão é o ajuste esperado; nos demais o analista decide item a item
  const travada = !!concl;
  const pode = podeConcluir(resumo);
  const diferentes = (l) => l.ncmCorrigido || (l.ncm && l.ncmOriginal && l.ncm !== l.ncmOriginal);

  return (
    <Acc aberto={aberto} onToggle={() => setAberto((a) => !a)}
      titulo={<><b className="font-medium">{g.nome}</b>{concl ? <Chip tom="g">Revisão concluída</Chip> : pode ? <Chip tom="b">Pronta para concluir</Chip> : <Chip tom="a">Em revisão</Chip>}
        <span className="text-xs text-muted-foreground">{plural(resumo.total, "item", "itens")} · {resumo.pendentes ? `${fmt(resumo.pendentes)} a decidir` : "nada a decidir"}{resumo.revisar ? ` · ${fmt(resumo.revisar)} a revisar com especialista` : ""}</span></>}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Situação fiscal dos itens">
          {[["DECIDIR", "Pedem decisão", resumo.precisaDecidir], ...ORDEM_SITUACOES.filter((s) => resumo.porSit[s] > 0).map((s) => [s, SITUACOES[s].rotulo, resumo.porSit[s]]), ["TODAS", "Todas", resumo.total]].map(([id, rot, n]) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => { setFiltro(id); setLimite(100); }}
              className={`px-2.5 py-1 text-xs rounded-md border ${filtro === id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted"}`}>{rot} <span className="tabular-nums opacity-70">{fmt(n)}</span></button>))}
        </div>
        {!travada && semDecisao.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {aceitaveis.length > 0 && <Botao title="Cria a decisão de adotar a classe sugerida nos itens listados que ainda não têm decisão. Nada é alterado no cadastro." onClick={() => onLote(aceitaveis.map((l) => l.linha), "ACEITAR")}>Adotar a classe sugerida {aceitaveis.length === 1 ? "no item sem decisão" : `nos ${fmt(aceitaveis.length)} itens sem decisão`}</Botao>}
            <Botao title="Registra os itens listados como pendência para o especialista fiscal." onClick={() => onLote(semDecisao.map((l) => l.linha), "REVISAR")}>{semDecisao.length === 1 ? "Marcar o item sem decisão" : `Marcar os ${fmt(semDecisao.length)} itens sem decisão`} como a revisar com especialista</Botao>
          </div>)}
        {linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item nesta situação.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-left text-muted-foreground">
                <Th chave="codigo" ord={ord} onOrdenar={ordenar}>Código</Th><Th chave="descricao" ord={ord} onOrdenar={ordenar}>Descrição</Th><Th chave="ncm" ord={ord} onOrdenar={ordenar}>NCM</Th>
                <Th chave="informada" ord={ord} onOrdenar={ordenar}>cClassTrib informado</Th><Th chave="sugerida" ord={ord} onOrdenar={ordenar}>cClassTrib sugerido</Th><Th chave="fundamento" ord={ord} onOrdenar={ordenar}>Fundamento</Th>
                <Th chave="situacao" ord={ord} onOrdenar={ordenar}>Situação e proposta</Th><Th chave="decisao" ord={ord} onOrdenar={ordenar}>Decisão</Th>
              </tr></thead>
              <tbody>{linhas.slice(0, limite).map((l) => (
                <tr key={l.linha} className="border-t border-border align-top">
                  <td className="p-1.5 whitespace-nowrap tabular-nums">{l.codigo || "—"}</td>
                  <td className="p-1.5 max-w-[240px] break-words">{l.descricao || "—"}</td>
                  <td className="p-1.5 whitespace-nowrap tabular-nums">{diferentes(l) ? <><span className="text-muted-foreground line-through">{formatarNcm(l.ncmOriginal)}</span><div className="font-medium">{formatarNcm(l.ncm)}</div></> : formatarNcm(l.ncm || l.ncmOriginal) || "—"}</td>
                  <td className="p-1.5 whitespace-nowrap">{l.informada || "—"}{l.cstInformada && <div className="text-[11px] text-muted-foreground">CST {l.cstInformada}</div>}</td>
                  <td className="p-1.5 max-w-[220px]">{l.sugerida ? <><b className="font-medium">{l.sugerida}</b>{l.cstSugerida && <span className="text-[11px] text-muted-foreground"> · CST {l.cstSugerida}</span>}<div className="text-[11px] text-muted-foreground break-words">{l.reducao && `redução ${l.reducao}`}{l.descricaoClasse && ` · ${l.descricaoClasse}`}</div></> : "—"}</td>
                  <td className="p-1.5 max-w-[220px] break-words text-muted-foreground">{l.fundamento || "—"}{l.confianca && <div className="text-[11px]">{l.confianca}</div>}</td>
                  <td className="p-1.5 max-w-[280px]"><Chip tom={SITUACOES[l.situacao].tom}>{SITUACOES[l.situacao].rotulo}</Chip><div className="mt-0.5 text-[11px] text-muted-foreground break-words">{l.proposta}</div>{l.mensagem && <div className="mt-0.5 text-[11px] text-muted-foreground break-words">{l.mensagem}</div>}</td>
                  <td className="p-1.5"><CelulaDecisao l={l} d={decisoes?.[l.linha]} travada={travada} onMudar={onMudar} /></td>
                </tr>))}</tbody>
            </table>
            {linhas.length > limite && <button type="button" onClick={() => setLimite(limite + 200)} className="text-xs text-primary underline p-2">Mostrar mais ({fmt(linhas.length - limite)} restantes)</button>}
          </div>)}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Botao disabled={!concl && !pode} onClick={concl ? onReabrir : onConcluir} title={!concl && !pode ? "Decida ou marque como a revisar todos os itens que pedem decisão" : undefined}>{concl ? "Reabrir a revisão do grupo" : "Concluir a revisão fiscal do grupo"}</Botao>
          <Botao onClick={onEmitir}><Download className="w-3.5 h-3.5 inline mr-1" />Matriz fiscal do grupo (Excel)</Botao>
          {concl ? <span className="text-xs text-muted-foreground">Concluída por {concl.por} em {dataBr(concl.em)}.{resumo.revisar ? ` ${plural(resumo.revisar, "item segue", "itens seguem")} como pendência para o especialista.` : ""}</span>
            : !pode ? <span className="text-xs text-muted-foreground">{resumo.total === 0 ? "O grupo não tem itens para revisar." : `Faltam ${plural(resumo.pendentes, "item", "itens")} para decidir.`}</span> : null}
        </div>
      </div>
    </Acc>
  );
}

/**
 * Passo Fiscal: cada grupo saneado é liberado para a revisão fiscal. O analista confere o NCM e o cClassTrib de cada item contra os anexos da LC 214/2025
 * consultados e decide o que fica; o resultado é a matriz fiscal do grupo (proposta, fundamento, validação e pendências).
 */
export default function PassoFiscal({ estado, setEstado, grupos, contagem, saem, quem, nomeProjeto, nomeBase, slug, temAnalise, onIrAnalises }) {
  const catalogo = useQuery({ queryKey: ["classTrib"], queryFn: () => base44.entities.ClassTrib.list(), staleTime: 10 * 60 * 1000 });
  const classes = useMemo(() => mapaClasses(catalogo.data), [catalogo.data]);
  const fiscal = estado.fiscal || {}; const decisoes = fiscal.decisoes || {}; const concluidos = fiscal.grupos || {};
  const liberados = grupos.filter((g) => grupoSaneado(estado, g.nome, contagem));
  const [gerando, setGerando] = useState(false); const [msg, setMsg] = useState("");

  const editar = (fn) => setEstado((e) => { const f = e.fiscal || {}; return { ...e, fiscal: fn({ ...f, decisoes: { ...(f.decisoes || {}) }, grupos: { ...(f.grupos || {}) } }) }; });
  const mudar = (linha, patch) => editar((f) => { if (patch === null) delete f.decisoes[linha]; else f.decisoes[linha] = { ...(f.decisoes[linha] || {}), ...patch, por: quem, em: hojeIso() }; return f; });
  const lote = (linhas, acao) => editar((f) => { for (const l of linhas) f.decisoes[l] = { ...(f.decisoes[l] || {}), acao, por: quem, em: hojeIso() }; return f; });
  const concluir = (nome) => editar((f) => { f.grupos[nome] = { por: quem, em: hojeIso() }; return f; });
  const reabrir = (nome) => editar((f) => { delete f.grupos[nome]; return f; });

  const emitir = async (gs, sufixo) => {
    setGerando(true); setMsg("");
    try {
      const resumos = []; const todas = [];
      for (const g of gs) {
        const itens = itensDoGrupoFiscal(g.itens, g.nome, saem);
        resumos.push({ grupo: g.nome, resumo: resumoDeLeituras(itens.map((it) => leituraFiscal(it, classes)), decisoes), concluida: concluidos[g.nome] || null });
        todas.push(...itens);
      }
      const linhas = linhasMatriz(todas, classes, decisoes);
      await gerarXlsxFiscal({ linhas, resumos, nomeProjeto, nomeBase }, `${slug}-matriz-fiscal-${sufixo}.xlsx`);
      setMsg(`Matriz emitida: ${plural(linhas.length, "item", "itens")} em ${plural(gs.length, "grupo", "grupos")}.`);
    } catch (e) { setMsg(`Não foi possível emitir a matriz: ${e.message}`); } finally { setGerando(false); }
  };

  const nConcl = liberados.filter((g) => concluidos[g.nome]).length;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <p>Cada grupo saneado é liberado para a revisão fiscal. Aqui você confere o NCM e o cClassTrib de cada item contra os anexos da LC 214/2025 consultados e decide o que fica; o resultado é a matriz fiscal do grupo, com proposta, fundamento, validação e pendências. A ferramenta só sugere: nada é alterado no cadastro, e o enquadramento que depende dos requisitos do produto fica para revisão com especialista. O CST e a redução vêm do catálogo de classes; o CST e o cClassTrib de cada operação seguem na validação das operações.</p>
      </div>
      {!temAnalise && <p className="text-xs text-amber-700 dark:text-amber-300">Esta base foi processada sem a análise de cClassTrib: o NCM é conferido, mas não há classe sugerida. Use “Trocar a base” no passo Triagem e processe de novo com a opção de cClassTrib marcada.</p>}
      {catalogo.isLoading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando o catálogo de classes…</p>}
      {catalogo.error && <p className="text-xs text-amber-700 dark:text-amber-300">Não foi possível carregar o catálogo de classes ({catalogo.error.message}): a revisão segue sem o CST e a redução.</p>}
      {liberados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm space-y-2">
          <p className="font-medium">Nenhum grupo liberado ainda</p>
          <p className="text-muted-foreground">A revisão fiscal só começa em grupo saneado: com todos os critérios aplicáveis aprovados e tratados nele, os de conferência manual inclusive. Trate os critérios de cada grupo no passo Análises e marque o grupo como saneado.</p>
          <Botao onClick={onIrAnalises}>Ir para as Análises</Botao>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground"><b className="text-foreground">{nConcl} de {liberados.length}</b> grupos com a revisão fiscal concluída</p>
            <div className="flex flex-wrap items-center gap-2">
              {msg && <span className="text-xs text-muted-foreground" role="status">{msg}</span>}
              <Botao disabled={gerando} onClick={() => emitir(liberados, liberados.length === 1 ? slugTxt(liberados[0].nome) : "grupos-liberados")}>{gerando ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}{liberados.length === 1 ? "Matriz fiscal do grupo (Excel)" : `Matriz fiscal dos ${liberados.length} grupos (Excel)`}</Botao>
            </div>
          </div>
          {liberados.map((g) => (
            <GrupoFiscal key={g.nome} g={g} saem={saem} classes={classes} decisoes={decisoes} concl={concluidos[g.nome]} onMudar={mudar} onLote={lote}
              onConcluir={() => concluir(g.nome)} onReabrir={() => reabrir(g.nome)} onEmitir={() => emitir([g], slugTxt(g.nome))} />))}
        </>)}
    </div>
  );
}
