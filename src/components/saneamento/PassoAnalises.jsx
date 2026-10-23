import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { CRITERIOS, grupoDe, hojeIso } from "./logica";
import { achadosDe, agruparAchados, criteriosAprovados, criteriosPendentesDoGrupo, grupoPodeSanear, grupoTratado, situacaoCriterio } from "./analise";
import { AbasCriterios, AcaoAprovacao, SelosCriterio } from "./CriterioUi";
import { Acc, Botao, Chip, TabelaItens, Th, fmt, ordenarPor, plural, useOrdenacao } from "./ui";
import ExportarAnalises from "./ExportarAnalises";
import TabelaAchados, { LegendaEncaminhar, rotuloEncaminhar } from "./TabelaAchados";

// Cada decisão guarda o que precisa para as listas finais: destino da unificação (duplicidade), descrição sugerida (padronização) ou a unidade e o fator.
const extraDecisao = (c, it, sugerida, extra) => (c.id === "padrao" ? { sugerida } : c.id === "duplicidade" ? { destino: it.duplicidade?.mestre ?? null }
  : c.id === "unidade" && sugerida ? { tipo: extra?.tipo ?? "grafia", de: extra?.de ?? it.unidade, para: sugerida, fator: extra?.fator ?? null, evidencia: extra?.evidencia ?? null, grandeza: extra?.grandeza ?? null } : {});
// Nos critérios com sugestão pronta (padronização, unidade) e na duplicidade dá para encaminhar tudo de uma vez; na unidade só o que tem sugestão (vazio e unidade sem regra são caso a caso).
const EM_BLOCO = ["padrao", "unidade", "duplicidade"];
const paraEncaminhar = (c, ach) => (c.id === "unidade" ? ach.filter((a) => a.sugerida) : ach);

/**
 * Passo Análises: as mesmas abas do passo Critérios, uma por problema. Em cada aba o analista vê os achados do critério em todos os grupos, com
 * como é hoje e como seria, critica cada um (encaminha para aprovação no De/para ou deixa como está) e marca o grupo como tratado. Critério sem
 * achados já abre aprovado, com a opção de revisar manualmente.
 */
export default function PassoAnalises({ estado, setEstado, grupos, achados, contagem, ativo, onSelecionar, quem, onComparar, onIrCriterios, onIrDepara, onAprovar, onReabrir, itemPorLinha, nomeProjeto, nomeBase, slug }) {
  const [aberto, setAberto] = useState({});
  const [exportando, setExportando] = useState(false);
  const [ordGrupos, ordenarGrupos] = useOrdenacao();
  const crit = CRITERIOS.find((c) => c.id === ativo);
  const cEst = estado.criterios[crit.id] || {};
  const sit = situacaoCriterio(estado, crit, contagem);
  const aprovado = sit !== "PENDENTE";
  const lista = achados[crit.id] || [];
  const porGrupo = useMemo(() => agruparAchados(lista), [lista]);
  const n = achadosDe(contagem, crit);
  const totalEmEscopo = grupos.reduce((s, g) => s + g.itens.length, 0);
  const aprovadosLista = criteriosAprovados(estado, contagem);
  const nSan = grupos.filter((g) => estado.saneados[g.nome]).length;
  const alternar = (k) => setAberto((a) => ({ ...a, [k]: !a[k] }));
  const concluido = (e, c) => situacaoCriterio(e, c, contagem) !== "PENDENTE" && grupos.every((g) => grupoTratado(e, g.nome, c, contagem));

  // Atualizações funcionais: duas ações seguidas nunca sobrescrevem uma à outra.
  const alternarAchado = (a) => setEstado((e) => {
    const k = `${a.item.linha}|${crit.id}`; const d = { ...e.decisoes };
    if (d[k]) { if (d[k].status === "PROP") delete d[k]; } else d[k] = { acao: "ENC", status: "PROP", grupo: grupoDe(a.item), por: quem, em: hojeIso(), ...extraDecisao(crit, a.item, a.sugerida, a.extra) };
    return { ...e, decisoes: d };
  });
  const encaminharTodas = (c, ach) => setEstado((e) => {
    const d = { ...e.decisoes };
    for (const a of ach) { const k = `${a.item.linha}|${c.id}`; if (!d[k]) d[k] = { acao: "ENC", status: "PROP", grupo: grupoDe(a.item), por: quem, em: hojeIso(), ...extraDecisao(c, a.item, a.sugerida, a.extra) }; }
    return { ...e, decisoes: d };
  });
  // Botão em bloco: encaminha só o que ainda não foi encaminhado; quando não resta nada, diz isso em vez de repetir o botão.
  const botaoEmBloco = (c, ach, ondeTxt) => {
    const todas = paraEncaminhar(c, ach); if (todas.length === 0) return null;
    const restam = todas.filter((a) => !estado.decisoes[`${a.item.linha}|${c.id}`]);
    if (restam.length === 0) return <p className="text-xs text-muted-foreground">{todas.length === 1 ? `O item ${ondeTxt} já foi encaminhado.` : `Todos os ${fmt(todas.length)} itens ${ondeTxt} já foram encaminhados.`}</p>;
    return <Botao title="Cria uma proposta para cada item, aguardando a sua aprovação no passo De/para. Nada é alterado no cadastro." onClick={() => encaminharTodas(c, restam)}>{rotuloEncaminhar(c, restam.length, restam.length < todas.length, ondeTxt)}</Botao>;
  };
  const encGrupo = (ach) => ach.filter((a) => estado.decisoes[`${a.item.linha}|${crit.id}`]).length;
  const alternarTratado = (grupo) => setEstado((e) => {
    const k = `${grupo}|${crit.id}`; const marcado = !e.tratados?.[k];
    return { ...e, tratados: { ...e.tratados, [k]: marcado }, saneados: marcado ? e.saneados : { ...e.saneados, [grupo]: false } };
  });
  const alternarSaneado = (grupo) => setEstado((e) => ({ ...e, saneados: { ...e.saneados, [grupo]: !e.saneados?.[grupo] } }));
  const botaoTratado = (grupo) => <div className="mt-2"><Botao onClick={() => alternarTratado(grupo)}>{estado.tratados?.[`${grupo}|${crit.id}`] ? "Reabrir neste grupo" : "Marcar como tratado neste grupo"}</Botao></div>;

  const corpo = !aprovado ? (
    <div className="rounded-lg border border-dashed border-border p-3 text-sm space-y-2">
      <p className="text-amber-700 dark:text-amber-300">Este critério ainda não foi aprovado.{n > 0 ? ` O teste achou ${plural(n, "item", "itens")} em escopo.` : ""}</p>
      <p className="text-muted-foreground">Confira a regra acima e aprove o critério para tratá-lo aqui. Para ajustar a regra, abra o critério no passo Critérios.</p>
      <Botao onClick={onIrCriterios}>Abrir em Critérios</Botao>
    </div>
  ) : !crit.auto ? (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Conferência manual: este critério ainda não tem teste automático. Confira os itens de cada grupo e marque como tratado.</p>
      {grupos.map((g) => {
        const chave = `${crit.id}|${g.nome}`; const trat = grupoTratado(estado, g.nome, crit, contagem);
        return (
          <Acc key={g.nome} aberto={!!aberto[chave]} onToggle={() => alternar(chave)} titulo={<><b className="font-medium">{g.nome}</b>{trat ? <Chip tom="g">Tratado</Chip> : <Chip tom="a">A tratar</Chip>}<span className="text-xs text-muted-foreground">{plural(g.itens.length, "item", "itens")} em escopo</span></>}>
            <TabelaItens itens={g.itens} colunas={["linha", "codigo", "descricao", "unidade", "ultima_mov"]} />
            {botaoTratado(g.nome)}
          </Acc>);
      })}
    </div>
  ) : n === 0 ? (
    <p className="text-sm text-muted-foreground">Nenhum achado nos {fmt(totalEmEscopo)} itens em escopo. {sit === "AUTO" ? "O critério abriu aprovado; para conferir mesmo assim, use “Revisar manualmente”." : ""}</p>
  ) : (
    <div className="space-y-2">
      {EM_BLOCO.includes(crit.id) && paraEncaminhar(crit, lista).length > 0 && <div className="flex flex-wrap items-center gap-2">{botaoEmBloco(crit, lista, "de todos os grupos")}</div>}
      {porGrupo.map(({ grupo, achados: ach }) => {
        const chave = `${crit.id}|${grupo}`; const trat = grupoTratado(estado, grupo, crit, contagem); const enc = encGrupo(ach);
        return (
          <Acc key={grupo} aberto={!!aberto[chave]} onToggle={() => alternar(chave)} titulo={<><b className="font-medium">{grupo}</b>{trat ? <Chip tom="g">Tratado</Chip> : <Chip tom="a">A tratar</Chip>}<span className="text-xs text-muted-foreground">{plural(ach.length, "achado", "achados")}{enc > 0 && ` · ${plural(enc, "encaminhado", "encaminhados")}`}</span></>}>
            {EM_BLOCO.includes(crit.id) && paraEncaminhar(crit, ach).length > 0 && <div className="flex flex-wrap items-center gap-2 mb-2">{botaoEmBloco(crit, ach, "do grupo")}</div>}
            <TabelaAchados ach={ach} crit={crit} decisoes={estado.decisoes} itemPorLinha={itemPorLinha} onAlternar={alternarAchado} onComparar={onComparar} />
            {botaoTratado(grupo)}
          </Acc>);
      })}
    </div>
  );

  // Situação por grupo: ordenável por grupo, itens e situação (saneado, pronto para sanear, com pendências).
  const linhasGrupos = useMemo(() => grupos.map((g) => {
    const san = !!estado.saneados[g.nome]; const falta = criteriosPendentesDoGrupo(estado, g.nome, contagem); const pode = grupoPodeSanear(estado, g.nome, contagem);
    return { g, san, falta, pode, rank: san ? 2 : falta.length === 0 ? 1 : 0 };
  }), [grupos, estado, contagem]);
  const gruposOrdenados = useMemo(() => ordenarPor(linhasGrupos, ordGrupos, { grupo: (x) => x.g.nome, itens: (x) => x.g.itens.length, situacao: (x) => x.rank }), [linhasGrupos, ordGrupos]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground"><b className="text-foreground">{nSan} de {grupos.length}</b> grupos saneados · critérios aprovados: {aprovadosLista.length} de {CRITERIOS.length}</p>
        <Botao onClick={() => setExportando((x) => !x)} aria-expanded={exportando}><Download className="w-3.5 h-3.5 inline mr-1" />Emitir Excel</Botao>
      </div>
      {exportando && <ExportarAnalises ativo={ativo} grupos={grupos} achados={achados} contagem={contagem} estado={estado} itemPorLinha={itemPorLinha} nomeProjeto={nomeProjeto} nomeBase={nomeBase} slug={slug} onFechar={() => setExportando(false)} />}
      <AbasCriterios estado={estado} contagem={contagem} ativo={ativo} onSelecionar={onSelecionar} marca={concluido} />
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{crit.titulo}</h3>
          <div className="flex flex-wrap items-center gap-2"><SelosCriterio crit={crit} situacao={sit} cEst={cEst} /><AcaoAprovacao situacao={sit} onAprovar={() => onAprovar(crit)} onReabrir={() => onReabrir(crit)} /></div>
        </div>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Ver a regra deste critério</summary><p className="mt-1">{cEst.regra ?? crit.regra}</p></details>
        {aprovado && crit.auto && n > 0 && <LegendaEncaminhar lista={lista} decisoes={estado.decisoes} critId={crit.id} onIrDepara={onIrDepara} />}
        {corpo}
      </div>
      <Acc aberto={!!aberto.__grupos} onToggle={() => alternar("__grupos")} titulo={<><b className="font-medium">Situação por grupo</b><span className="text-xs text-muted-foreground">{nSan} de {grupos.length} saneados</span></>}>
        {aprovadosLista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum critério aprovado ainda: aprove os critérios para tratar os grupos.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><Th chave="grupo" ord={ordGrupos} onOrdenar={ordenarGrupos}>Grupo</Th><Th chave="itens" ord={ordGrupos} onOrdenar={ordenarGrupos}>Itens</Th><Th chave="situacao" ord={ordGrupos} onOrdenar={ordenarGrupos}>Situação</Th><th className="p-1.5"></th></tr></thead>
              <tbody>{gruposOrdenados.map(({ g, san, falta, pode }) => (
                <tr key={g.nome} className="border-t border-border align-top">
                  <td className="p-1.5">{g.nome}</td><td className="p-1.5 tabular-nums">{fmt(g.itens.length)}</td>
                  <td className="p-1.5">{san ? <Chip tom="g">Saneado</Chip> : falta.length === 0 ? <Chip tom="b">Pronto para sanear</Chip> : <span className="text-muted-foreground">faltam{" "}{falta.slice(0, 3).map((c, i) => <React.Fragment key={c.id}>{i > 0 && ", "}<button type="button" className="underline text-primary" onClick={() => onSelecionar(c.id)}>{c.titulo}{situacaoCriterio(estado, c, contagem) === "PENDENTE" ? " (a aprovar)" : ""}</button></React.Fragment>)}{falta.length > 3 ? `+${falta.length - 3}` : ""}</span>}</td>
                  <td className="p-1.5 whitespace-nowrap"><Botao disabled={!san && !pode} onClick={() => alternarSaneado(g.nome)}>{san ? "Reabrir grupo" : "Marcar como saneado"}</Botao></td></tr>))}</tbody></table>
            <p className="text-xs text-muted-foreground pt-2">O grupo só encerra com todos os critérios aprovados tratados nele.</p>
          </div>)}
      </Acc>
    </div>
  );
}
