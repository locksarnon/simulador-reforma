import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Info, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { hojeIso } from "./logica";
import { grupoSaneado } from "./analise";
import { Acc, Botao, Chip, dataBr, fmt, plural } from "./ui";
import TabelaPadrao from "@/components/TabelaPadrao";
import { ACOES, ORDEM_SITUACOES, SITUACOES, decisaoFiscalDe, decisaoValida, itensDoGrupoFiscal, leituraFiscal, linhasMatriz, mapaClasses, podeConcluir, resumoDeLeituras } from "./fiscal";
import { indexar, motivoSemIdentidade } from "./identidade";
import { gerarXlsxFiscal } from "./matrizFiscal";

const slugTxt = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const formatarNcm = (v) => { const s = String(v ?? "").replace(/\D/g, ""); return s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : String(v ?? ""); };
const EM_LOTE = ["BENEFICIO", "SEM_CLASSE", "DIVERGENTE"]; // situações em que "adotar a classe sugerida" pode ser feito em bloco

const acoesDe = (l) => SITUACOES[l.situacao].acoes.filter((a) => a !== "ACEITAR" || l.sugerida);
/** Aviso da decisão de uma linha: item sem código que o identifique, ou decisão incompleta. */
function avisoDecisao(l, d, motivoBloqueio) {
  if (!acoesDe(l).length) return "";
  if (motivoBloqueio) return `${motivoBloqueio}. Corrija no ERP e traga a base de novo.`;
  if (!d || decisaoValida(l.situacao, l, d)) return "";
  return d.acao === "NCM" ? "Informe o NCM com 8 dígitos." : d.acao === "MANTER" ? "Escreva o fundamento (ao menos 5 caracteres)." : "Decisão incompleta.";
}

/**
 * Colunas da decisão do analista em uma linha: a ação, o complemento que a ação pede (o NCM correto ou o fundamento escrito) e o aviso. Cada informação na sua coluna.
 */
function colunasDecisao({ decisoes, travada, bloqueio, onMudar }) {
  return [
    { chave: "decisao", rotulo: "Decisão", valor: (l) => { const d = decisaoFiscalDe(decisoes, l); return d ? ACOES[d.acao] : ""; }, render: (l) => {
      const acoes = acoesDe(l); if (!acoes.length || bloqueio(l)) return <span className="text-muted-foreground">—</span>;
      const d = decisaoFiscalDe(decisoes, l);
      return (
        <select value={d?.acao || ""} disabled={travada} onChange={(e) => onMudar(l.id, e.target.value ? { acao: e.target.value } : null)} aria-label={`Decisão fiscal do código ${l.id}`} className="border rounded px-1 py-0.5 bg-background text-xs">
          <option value="">Decidir…</option>
          {acoes.map((a) => <option key={a} value={a}>{ACOES[a]}</option>)}
        </select>);
    } },
    { chave: "complemento", rotulo: "NCM correto ou fundamento", valor: (l) => { const d = decisaoFiscalDe(decisoes, l); return d?.acao === "NCM" ? d.ncm || "" : d?.acao === "MANTER" ? d.obs || "" : ""; }, render: (l) => {
      if (!acoesDe(l).length || bloqueio(l)) return null;
      const d = decisaoFiscalDe(decisoes, l);
      if (d?.acao === "NCM") return <input value={d.ncm || ""} disabled={travada} onChange={(e) => onMudar(l.id, { ncm: e.target.value })} placeholder="NCM correto (8 dígitos)" aria-label={`NCM correto do código ${l.id}`} className="w-40 border rounded px-1 py-0.5 bg-background text-xs tabular-nums" />;
      if (d?.acao === "MANTER") return <input value={d.obs || ""} disabled={travada} onChange={(e) => onMudar(l.id, { obs: e.target.value })} placeholder="Fundamento (base legal ou requisito do produto)" aria-label={`Fundamento do código ${l.id}`} className="w-56 border rounded px-1 py-0.5 bg-background text-xs" />;
      return null;
    } },
    { chave: "aviso", rotulo: "Aviso", quebrar: true, valor: (l) => avisoDecisao(l, decisaoFiscalDe(decisoes, l), bloqueio(l)), render: (l) => { const t = avisoDecisao(l, decisaoFiscalDe(decisoes, l), bloqueio(l)); return t ? <span className="text-[11px] text-amber-700 dark:text-amber-300">{t}</span> : null; } },
  ];
}

/** Um grupo liberado para a revisão fiscal: resumo por situação, filtro, tabela de itens com decisão e a conclusão do grupo. */
function GrupoFiscal({ g, todosItens, saem, classes, decisoes, concl, onMudar, onLote, onConcluir, onReabrir, onEmitir }) {
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState("DECIDIR");
  const itens = useMemo(() => itensDoGrupoFiscal(g.itens, g.nome, saem), [g, saem]);
  const indice = useMemo(() => indexar(todosItens), [todosItens]);
  const leituras = useMemo(() => itens.map((it) => leituraFiscal(it, classes, indice)), [itens, classes, indice]);
  const resumo = useMemo(() => resumoDeLeituras(leituras, decisoes), [leituras, decisoes]);
  const filtradas = useMemo(() => leituras.filter((l) => (filtro === "TODAS" ? true : filtro === "DECIDIR" ? SITUACOES[l.situacao].decide : l.situacao === filtro)), [leituras, filtro]);
  const semDecisao = filtradas.filter((l) => SITUACOES[l.situacao].decide && !decisaoValida(l.situacao, l, decisaoFiscalDe(decisoes, l)));
  const decidiveis = semDecisao.filter((l) => !l.semIdentidade); // item sem código (ou com código repetido) não recebe decisão: fica como pendência do grupo
  const aceitaveis = decidiveis.filter((l) => EM_LOTE.includes(l.situacao) && l.sugerida); // em bloco só onde adotar a sugestão é o ajuste esperado; nos demais o analista decide item a item
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
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
              className={`px-2.5 py-1 text-xs rounded-md border ${filtro === id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted"}`}>{rot} <span className="tabular-nums opacity-70">{fmt(n)}</span></button>))}
        </div>
        {!travada && decidiveis.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {aceitaveis.length > 0 && <Botao title="Cria a decisão de adotar a classe sugerida nos itens listados que ainda não têm decisão. Nada é alterado no cadastro." onClick={() => onLote(aceitaveis.map((l) => l.id), "ACEITAR")}>Adotar a classe sugerida {aceitaveis.length === 1 ? "no item sem decisão" : `nos ${fmt(aceitaveis.length)} itens sem decisão`}</Botao>}
            <Botao title="Registra os itens listados como pendência para o especialista fiscal." onClick={() => onLote(decidiveis.map((l) => l.id), "REVISAR")}>{decidiveis.length === 1 ? "Marcar o item sem decisão" : `Marcar os ${fmt(decidiveis.length)} itens sem decisão`} como a revisar com especialista</Botao>
          </div>)}
        <TabelaPadrao id="saneamento-fiscal-itens" ariaLabel={`Revisão fiscal do grupo ${g.nome}`} linhas={filtradas} chaveLinha={(l) => l.linha} tamanhoInicial={100} vazio="Nenhum item nesta situação." colunas={[
          { chave: "codigo", rotulo: "Código", valor: (l) => l.codigo || "—" },
          { chave: "descricao", rotulo: "Descrição", valor: (l) => l.descricao || "—" },
          { chave: "ncm", rotulo: "NCM", valor: (l) => formatarNcm(l.ncm || l.ncmOriginal) || "—", render: (l) => <span className={`tabular-nums ${diferentes(l) ? "font-medium" : ""}`}>{formatarNcm(l.ncm || l.ncmOriginal) || "—"}</span> },
          { chave: "ncmOriginal", rotulo: "NCM original", valor: (l) => (diferentes(l) ? formatarNcm(l.ncmOriginal) : ""), render: (l) => (diferentes(l) ? <span className="tabular-nums text-muted-foreground line-through">{formatarNcm(l.ncmOriginal)}</span> : null) },
          { chave: "informada", rotulo: "cClassTrib informado", valor: (l) => l.informada || "—" },
          { chave: "cstInformada", rotulo: "CST informado", valor: (l) => l.cstInformada || "" },
          { chave: "sugerida", rotulo: "cClassTrib sugerido", valor: (l) => l.sugerida || "—", render: (l) => (l.sugerida ? <b className="font-medium">{l.sugerida}</b> : "—") },
          { chave: "cstSugerida", rotulo: "CST sugerido", valor: (l) => (l.sugerida ? l.cstSugerida || "" : "") },
          { chave: "reducao", rotulo: "Redução", valor: (l) => (l.sugerida ? l.reducao || "" : "") },
          { chave: "descricaoClasse", rotulo: "Descrição da classe", quebrar: true, valor: (l) => (l.sugerida ? l.descricaoClasse || "" : "") },
          { chave: "fundamento", rotulo: "Fundamento", quebrar: true, valor: (l) => l.fundamento || "—", render: (l) => <span className="text-muted-foreground">{l.fundamento || "—"}</span> },
          { chave: "confianca", rotulo: "Confiança", valor: (l) => l.confianca || "" },
          { chave: "situacao", rotulo: "Situação", valor: (l) => SITUACOES[l.situacao].rotulo, render: (l) => <Chip tom={SITUACOES[l.situacao].tom}>{SITUACOES[l.situacao].rotulo}</Chip> },
          { chave: "proposta", rotulo: "Proposta", quebrar: true, valor: (l) => l.proposta || "", render: (l) => <span className="text-muted-foreground">{l.proposta}</span> },
          { chave: "mensagem", rotulo: "Mensagem", quebrar: true, valor: (l) => l.mensagem || "", render: (l) => <span className="text-muted-foreground">{l.mensagem}</span> },
          ...colunasDecisao({ decisoes, travada, bloqueio: (l) => (l.semIdentidade ? motivoSemIdentidade(l, indice) : ""), onMudar }),
        ]} />
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
export default function PassoFiscal({ estado, setEstado, grupos, todosItens, contagem, saem, quem, nomeProjeto, nomeBase, slug, temAnalise, onIrAnalises }) {
  const catalogo = useQuery({ queryKey: ["classTrib"], queryFn: () => api.entities.ClassTrib.list(), staleTime: 10 * 60 * 1000 });
  const classes = useMemo(() => mapaClasses(catalogo.data), [catalogo.data]);
  const fiscal = estado.fiscal || {}; const decisoes = fiscal.decisoes || {}; const concluidos = fiscal.grupos || {};
  const liberados = grupos.filter((g) => grupoSaneado(estado, g.nome, contagem));
  const [gerando, setGerando] = useState(false); const [msg, setMsg] = useState("");

  const editar = (fn) => setEstado((e) => { const f = e.fiscal || {}; return { ...e, fiscal: fn({ ...f, decisoes: { ...(f.decisoes || {}) }, grupos: { ...(f.grupos || {}) } }) }; });
  // a decisão fiscal é do código do item (texto), não da linha da planilha
  const mudar = (id, patch) => editar((f) => { if (patch === null) delete f.decisoes[id]; else f.decisoes[id] = { ...(f.decisoes[id] || {}), ...patch, por: quem, em: hojeIso() }; return f; });
  const lote = (ids, acao) => editar((f) => { for (const id of ids) f.decisoes[id] = { ...(f.decisoes[id] || {}), acao, por: quem, em: hojeIso() }; return f; });
  const concluir = (nome) => editar((f) => { f.grupos[nome] = { por: quem, em: hojeIso() }; return f; });
  const reabrir = (nome) => editar((f) => { delete f.grupos[nome]; return f; });

  const emitir = async (gs, sufixo) => {
    setGerando(true); setMsg("");
    try {
      const resumos = []; const todas = [];
      for (const g of gs) {
        const itens = itensDoGrupoFiscal(g.itens, g.nome, saem);
        resumos.push({ grupo: g.nome, resumo: resumoDeLeituras(itens.map((it) => leituraFiscal(it, classes, indexar(todosItens))), decisoes), concluida: concluidos[g.nome] || null });
        todas.push(...itens);
      }
      const linhas = linhasMatriz(todas, classes, decisoes, indexar(todosItens));
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
          <p className="text-muted-foreground">A revisão fiscal só começa em grupo saneado: com todas as checagens aplicáveis concluídas nele, as de conferência manual inclusive. Conclua as checagens de cada grupo no passo Checagens e marque o grupo como saneado.</p>
          <Botao onClick={onIrAnalises}>Ir para as Checagens</Botao>
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
            <GrupoFiscal key={g.nome} g={g} todosItens={todosItens} saem={saem} classes={classes} decisoes={decisoes} concl={concluidos[g.nome]} onMudar={mudar} onLote={lote}
              onConcluir={() => concluir(g.nome)} onReabrir={() => reabrir(g.nome)} onEmitir={() => emitir([g], slugTxt(g.nome))} />))}
        </>)}
    </div>
  );
}
