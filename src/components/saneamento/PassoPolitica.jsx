import React, { useMemo, useState } from "react";
import { Download, FileText, Info, Loader2 } from "lucide-react";
import { hojeIso } from "./logica";
import { Acc, Botao, Chip, Th, dataBr, fmt, ordenarPor, plural, useOrdenacao } from "./ui";
import { montarPolitica } from "./politica";
import { baixarJsonPolitica, gerarXlsxPolitica } from "./politicaXlsx";

const SUGESTOES = {
  criar: ["Responsável: gestor de cadastro / suprimentos", "Controle: conferência de duplicidade e do padrão antes de gravar"],
  comprar: ["Responsável: comprador / suprimentos", "Controle: item com unidade de compra e fator cadastrados antes do pedido"],
  usar: ["Responsável: almoxarifado / manutenção", "Controle: relatório de itens sem movimentação e sem data"],
  padronizar: ["Responsável: gestor de cadastro", "Controle: reaplicação dos critérios a cada semestre, com relatório"],
  descontinuar: ["Responsável: gestor de cadastro com o almoxarifado", "Controle: inativação só com saldo transferido e evidência"],
};

/**
 * Passo Política: a política de uso dos estoques nasce dos critérios aprovados e das causas encontradas. O analista revisa as regras, define o responsável e o
 * controle de cada procedimento, escreve regras por grupo e aprova. Sai em Excel, em JSON estruturado (cadastro automático do cliente) e no relatório em PDF.
 */
export default function PassoPolitica({ estado, setEstado, contagem, escopo, grupos, itens, quem, nomeProjeto, nomeBase, slug, onRelatorio }) {
  const [aberto, setAberto] = useState({});
  const [gerando, setGerando] = useState(false); const [gerandoRelatorio, setGerandoRelatorio] = useState(false); const [msg, setMsg] = useState("");
  const [ord, ordenar] = useOrdenacao();
  const politica = useMemo(() => montarPolitica({ estado, contagem, escopo, grupos, itens, nomeProjeto, nomeBase }), [estado, contagem, escopo, grupos, itens, nomeProjeto, nomeBase]);
  const alternar = (k) => setAberto((a) => ({ ...a, [k]: !a[k] }));
  const aprovada = politica.aprovada;

  // Editar qualquer coisa tira a aprovação: a política aprovada é a que o responsável viu inteira.
  const editar = (fn) => setEstado((e) => { const p = e.politica || {}; return { ...e, politica: { ...fn({ ...p, secoes: { ...(p.secoes || {}) }, grupos: { ...(p.grupos || {}) } }), aprovada: null } }; });
  const setSecao = (id, patch) => editar((p) => { p.secoes[id] = { ...(p.secoes[id] || {}), ...patch }; return p; });
  const setGrupo = (nome, regra) => editar((p) => { if (regra.trim()) p.grupos[nome] = { regra }; else delete p.grupos[nome]; return p; });
  const aprovar = () => setEstado((e) => ({ ...e, politica: { ...(e.politica || {}), aprovada: { por: quem, em: hojeIso() } } }));
  const reabrir = () => setEstado((e) => ({ ...e, politica: { ...(e.politica || {}), aprovada: null } }));

  const linhasGrupos = useMemo(() => ordenarPor(politica.porGrupo, ord, { grupo: (g) => g.grupo, itens: (g) => g.itens, saneado: (g) => (g.saneado ? 1 : 0), fiscal: (g) => g.fiscal, regra: (g) => g.regra }), [politica.porGrupo, ord]);
  const emitirExcel = async () => {
    setGerando(true); setMsg("");
    try { await gerarXlsxPolitica(politica, { nomeProjeto, nomeBase }, `${slug}-politica-de-uso.xlsx`); setMsg("Planilha da política emitida."); }
    catch (e) { setMsg(`Não foi possível emitir a planilha: ${e.message}`); } finally { setGerando(false); }
  };
  const emitirJson = () => { baixarJsonPolitica(politica, `${slug}-politica-estruturada.json`); setMsg("Política estruturada baixada (JSON)."); };
  const emitirRelatorio = async () => {
    setGerandoRelatorio(true); setMsg("");
    try { const paginas = await onRelatorio(); setMsg(`Relatório emitido (${plural(paginas, "página", "páginas")}).`); }
    catch (e) { setMsg(`Não foi possível emitir o relatório: ${e.message}`); } finally { setGerandoRelatorio(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <p>A política de uso dos estoques nasce dos critérios aprovados e do que o saneamento encontrou: cinco procedimentos (criar, comprar, usar, padronizar e descontinuar), regras por grupo e uma versão estruturada para configurar o módulo de cadastro automático do cliente. É uma proposta: o responsável revisa as regras, define o responsável e o controle de cada procedimento e aprova. Critério ainda não aprovado não gera regra, e a similaridade entre descrições nunca é tratada como probabilidade. Nada é alterado no cadastro.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {aprovada ? <Chip tom="g">Política aprovada por {aprovada.por} em {dataBr(aprovada.em)}</Chip> : <Chip tom="a">Rascunho</Chip>}
        <span className="text-xs text-muted-foreground">{plural(politica.secoes.reduce((n, s) => n + s.regras.length, 0), "regra", "regras")} em {plural(politica.secoes.length, "procedimento", "procedimentos")}</span>
      </div>
      {politica.pendencias.length > 0 && (
        <Acc aberto={!!aberto.__pend} onToggle={() => alternar("__pend")} titulo={<><b className="font-medium">Pendências</b><Chip tom="a">{fmt(politica.pendencias.length)}</Chip><span className="text-xs text-muted-foreground">o que ainda falta para a política ficar completa</span></>}>
          <ul className="list-disc pl-5 space-y-1 text-sm">{politica.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
        </Acc>)}
      {politica.secoes.map((s) => (
        <Acc key={s.id} aberto={!!aberto[s.id]} onToggle={() => alternar(s.id)}
          titulo={<><b className="font-medium">{s.titulo}</b><span className="text-xs text-muted-foreground">{plural(s.regras.length, "regra", "regras")}</span>{s.responsavel.trim() && s.controle.trim() ? <Chip tom="g">Responsável e controle definidos</Chip> : <Chip tom="a">Falta responsável ou controle</Chip>}</>}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{s.descricao}</p>
            <ol className="space-y-2">{s.regras.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-2.5 text-sm">
                <p>{r.texto}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Origem: {r.origem}. Evidência: {r.evidencia}</p>
              </li>))}</ol>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">Responsável por este procedimento
                <input value={s.responsavel} onChange={(e) => setSecao(s.id, { responsavel: e.target.value })} placeholder={SUGESTOES[s.id][0]} className="mt-1 w-full border rounded-md p-1.5 text-sm bg-background text-foreground" /></label>
              <label className="text-xs text-muted-foreground">Controle (como se verifica)
                <input value={s.controle} onChange={(e) => setSecao(s.id, { controle: e.target.value })} placeholder={SUGESTOES[s.id][1]} className="mt-1 w-full border rounded-md p-1.5 text-sm bg-background text-foreground" /></label>
            </div>
          </div>
        </Acc>))}
      <Acc aberto={!!aberto.__grupos} onToggle={() => alternar("__grupos")} titulo={<><b className="font-medium">Regras por grupo</b><span className="text-xs text-muted-foreground">{plural(politica.porGrupo.length, "grupo", "grupos")} · escreva o que é específico de cada grupo (opcional)</span></>}>
        {politica.porGrupo.length === 0 ? <p className="text-sm text-muted-foreground">Importe a base e trate os grupos para escrever regras por grupo.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground">
              <Th chave="grupo" ord={ord} onOrdenar={ordenar}>Grupo</Th><Th chave="itens" ord={ord} onOrdenar={ordenar}>Itens</Th><Th chave="saneado" ord={ord} onOrdenar={ordenar}>Saneado</Th><Th chave="fiscal" ord={ord} onOrdenar={ordenar}>Revisão fiscal</Th><Th chave="regra" ord={ord} onOrdenar={ordenar}>Regra do grupo</Th>
            </tr></thead>
              <tbody>{linhasGrupos.map((g) => (
                <tr key={g.grupo} className="border-t border-border align-top">
                  <td className="p-1.5">{g.grupo}</td><td className="p-1.5 tabular-nums">{fmt(g.itens)}</td>
                  <td className="p-1.5">{g.saneado ? <Chip tom="g">Saneado</Chip> : <Chip>Não</Chip>}</td>
                  <td className="p-1.5">{g.fiscal === "Revisão concluída" ? <Chip tom="g">{g.fiscal}</Chip> : <span className="text-muted-foreground">{g.fiscal}</span>}</td>
                  <td className="p-1.5"><input value={g.regra} onChange={(e) => setGrupo(g.grupo, e.target.value)} aria-label={`Regra do grupo ${g.grupo}`} placeholder="Ex.: unidade, atributos obrigatórios ou cuidado deste grupo" className="w-full min-w-[260px] border rounded px-1.5 py-1 bg-background" /></td>
                </tr>))}</tbody></table>
          </div>)}
      </Acc>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Botao disabled={!aprovada && !politica.prontaParaAprovar} onClick={aprovada ? reabrir : aprovar} title={!aprovada && !politica.prontaParaAprovar ? "Defina o responsável e o controle de todos os procedimentos" : undefined}>{aprovada ? "Reabrir a política" : "Aprovar a política"}</Botao>
          {!aprovada && !politica.prontaParaAprovar && <span className="text-xs text-muted-foreground">Para aprovar, defina o responsável e o controle de todos os procedimentos.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Botao disabled={gerando} onClick={emitirExcel}>{gerando ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Emitir a política (Excel)</Botao>
          <Botao onClick={emitirJson} title="Política estruturada para configurar o módulo de cadastro automático do cliente"><Download className="w-3.5 h-3.5 inline mr-1" />Política estruturada (JSON)</Botao>
          <Botao disabled={gerandoRelatorio} onClick={emitirRelatorio} title="Relatório do programa de trabalho: escopo, critérios, piloto, análises, decisões, execução, revisão fiscal e política">{gerandoRelatorio ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <FileText className="w-3.5 h-3.5 inline mr-1" />}Relatório do programa de trabalho (PDF)</Botao>
          {msg && <span className="text-xs text-muted-foreground" role="status">{msg}</span>}
        </div>
        <p className="text-xs text-muted-foreground">O relatório em PDF reúne o que foi feito em todos os passos e a política; pode ser emitido a qualquer momento, e o que ainda não foi feito aparece como pendente.</p>
      </div>
    </div>
  );
}
