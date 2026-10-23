import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { CRITERIOS, grupoDe, hojeIso } from "./logica";
import { achadosDe, agruparAchados, criteriosAprovados, criteriosPendentesDoGrupo, criterioResolvido, grupoSaneado, grupoTratado, marcaDeOutraBase, marcaValida, situacaoCriterio } from "./analise";
import { AbasCriterios, AcaoAprovacao, AvisoCriterio, SelosCriterio } from "./CriterioUi";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Acc, Botao, Chip, TabelaItens, Th, dataBr, fmt, ordenarPor, plural, useOrdenacao } from "./ui";
import ExportarAnalises from "./ExportarAnalises";
import TabelaAchados, { LegendaEncaminhar, rotuloEncaminhar } from "./TabelaAchados";
import ConjuntosDuplicidade, { LegendaConjuntos } from "./ConjuntosDuplicidade";
import { aplicarEscolha, completarEscolha, desfazerEscolha, escolhaDoConjunto, montarConjuntos } from "./conjuntos";
import { chaveDe, idItem, identificavel } from "./identidade";
import { instantaneoDoItem, propostaNcm } from "./aprovacao";

// Cada decisão guarda o que precisa para as listas finais: o código que fica (duplicidade), a descrição sugerida (padronização) ou a unidade e o fator, e como o item estava na
// hora (`antes`): a aprovação vale para essa alteração específica e não cobre o item se o cadastro mudar para outra coisa depois.
const extraDecisao = (c, it, sugerida, extra, porLinha) => {
  if (c.id === "padrao") return { sugerida };
  if (c.id === "duplicidade") {
    const mestre = it.duplicidade?.mestre != null ? porLinha?.get(it.duplicidade.mestre) : null;
    return { destino: mestre ? idItem(mestre) || null : null, ...(mestre ? { destinoAntes: instantaneoDoItem(mestre, "duplicidade") } : {}) };
  }
  if (c.id === "ncm") { const p = propostaNcm(it); return Object.keys(p).length ? { proposto: p } : {}; } // o NCM e a classe que a tela mostra em "como seria": a aprovação vale para eles
  if (c.id === "grupo") return String(it.grupo_sugerido ?? "").trim() ? { proposto: { grupo: String(it.grupo_sugerido).trim() } } : {}; // o grupo sugerido pela base: se o cadastro já estiver nele, a decisão é só reflexo
  return c.id === "unidade" && sugerida ? { tipo: extra?.tipo ?? "grafia", de: extra?.de ?? it.unidade, para: sugerida, fator: extra?.fator ?? null, evidencia: extra?.evidencia ?? null, grandeza: extra?.grandeza ?? null } : {};
};
const novaDecisao = (c, a, quem, porLinha) => { const antes = instantaneoDoItem(a.item, c.id); return { acao: "ENC", status: "PROP", grupo: grupoDe(a.item), por: quem, em: hojeIso(), ...(antes ? { antes } : {}), ...extraDecisao(c, a.item, a.sugerida, a.extra, porLinha) }; };
// Nos critérios com sugestão pronta (padronização, unidade) dá para encaminhar tudo de uma vez; na unidade só o que tem sugestão (vazio e unidade sem regra são caso a caso).
// A duplicidade tem a sua própria escolha, por conjunto (qual código fica).
const EM_BLOCO = ["padrao", "unidade"];
const ESCALAS_SALDO = [[1, "como está na base"], [1000, "÷ 1.000"], [1000000, "÷ 1.000.000"]];
// o que dá para encaminhar: com sugestão (na unidade) e com código que identifica o item (sem código, ou repetido na base, a decisão não teria a que se ligar)
const paraEncaminhar = (c, ach, indice) => (c.id === "unidade" ? ach.filter((a) => a.sugerida) : ach).filter((a) => !indice || identificavel(a.item, indice));

/**
 * Passo Análises: as mesmas abas do passo Critérios, uma por problema. Em cada aba o analista vê os achados do critério em todos os grupos, com
 * como é hoje e como seria, critica cada um (encaminha para aprovação no De/para ou deixa como está) e marca o grupo como tratado. Critério sem
 * achados já abre aprovado, com a opção de revisar manualmente.
 */
export default function PassoAnalises({ estado, setEstado, grupos, achados, contagem, ativo, onSelecionar, quem, onComparar, onIrCriterios, onIrDepara, onIrTriagem, onAprovar, onReabrir, onNaoAplicavel, itemPorLinha, indice, nomeProjeto, nomeBase, slug, escalaSaldo = 1, temSaldo = false, onEscala }) {
  const confirmar = useConfirmar();
  const [aberto, setAberto] = useState({});
  const [exportando, setExportando] = useState(false);
  const [ordGrupos, ordenarGrupos] = useOrdenacao();
  const crit = CRITERIOS.find((c) => c.id === ativo);
  const cEst = estado.criterios[crit.id] || {};
  const sit = situacaoCriterio(estado, crit, contagem);
  const aprovado = sit === "APROVADO" || sit === "AUTO"; // em uso: gera análise; não aplicável e sem análise executada ficam de fora
  const lista = achados[crit.id] || [];
  const porGrupo = useMemo(() => agruparAchados(lista), [lista]);
  const n = achadosDe(contagem, crit);
  const totalEmEscopo = grupos.reduce((s, g) => s + g.itens.length, 0);
  const aprovadosLista = criteriosAprovados(estado, contagem);
  const nNaoAplicaveis = CRITERIOS.filter((c) => situacaoCriterio(estado, c, contagem) === "NAO_APLICAVEL").length;
  const nSan = grupos.filter((g) => grupoSaneado(estado, g.nome, contagem)).length;
  const alternar = (k) => setAberto((a) => ({ ...a, [k]: !a[k] }));
  const concluido = (e, c) => criterioResolvido(e, c, contagem) && (situacaoCriterio(e, c, contagem) === "NAO_APLICAVEL" || grupos.every((g) => grupoTratado(e, g.nome, c, contagem)));

  // Atualizações funcionais: duas ações seguidas nunca sobrescrevem uma à outra.
  const alternarAchado = (a) => setEstado((e) => {
    if (!identificavel(a.item, indice)) return e;
    const k = chaveDe(a.item, crit.id); const d = { ...e.decisoes };
    if (d[k]) { if (d[k].status === "PROP") delete d[k]; } else d[k] = novaDecisao(crit, a, quem, itemPorLinha);
    return { ...e, decisoes: d };
  });
  const encaminharTodas = (c, ach) => setEstado((e) => {
    const d = { ...e.decisoes };
    for (const a of ach) { if (!identificavel(a.item, indice)) continue; const k = chaveDe(a.item, c.id); if (!d[k]) d[k] = novaDecisao(c, a, quem, itemPorLinha); }
    return { ...e, decisoes: d };
  });
  // Botão em bloco: encaminha só o que ainda não foi encaminhado; quando não resta nada, diz isso em vez de repetir o botão.
  const botaoEmBloco = (c, ach, ondeTxt) => {
    const todas = paraEncaminhar(c, ach, indice); if (todas.length === 0) return null;
    const restam = todas.filter((a) => !estado.decisoes[chaveDe(a.item, c.id)]);
    if (restam.length === 0) return <p className="text-xs text-muted-foreground">{todas.length === 1 ? `O item ${ondeTxt} já foi encaminhado.` : `Todos os ${fmt(todas.length)} itens ${ondeTxt} já foram encaminhados.`}</p>;
    return <Botao title="Cria uma proposta para cada item, aguardando a sua aprovação no passo De/para. Nada é alterado no cadastro." onClick={() => encaminharTodas(c, restam)}>{rotuloEncaminhar(c, restam.length, restam.length < todas.length, ondeTxt)}</Botao>;
  };
  const encGrupo = (ach) => ach.filter((a) => identificavel(a.item, indice) && estado.decisoes[chaveDe(a.item, crit.id)]).length;
  // Duplicidade: conjuntos de itens parecidos, lado a lado, com a sugestão de qual código fica. Escolher quem fica encaminha os outros ao De/para.
  const ehDup = crit.id === "duplicidade";
  const conjuntos = useMemo(() => (ehDup && aprovado ? montarConjuntos(lista.map((a) => a.item), { escala: escalaSaldo }) : []), [ehDup, aprovado, lista, escalaSaldo]);
  const emConjunto = useMemo(() => new Set(conjuntos.flatMap((c) => c.membros.map((m) => m.linha))), [conjuntos]);
  const escolher = (conj, id, origem) => setEstado((e) => { const d = aplicarEscolha(e.decisoes, conj, id, { quem, hoje: hojeIso(), origem, indice }); return d === e.decisoes ? e : { ...e, decisoes: d }; });
  const desfazer = (conj) => setEstado((e) => { const d = desfazerEscolha(e.decisoes, conj); return d === e.decisoes ? e : { ...e, decisoes: d }; });
  const completar = (conj) => setEstado((e) => { const d = completarEscolha(e.decisoes, conj, { quem, hoje: hojeIso(), origem: "analista", indice }); return d === e.decisoes ? e : { ...e, decisoes: d }; });
  const aceitarVarios = (conjs) => setEstado((e) => { let d = e.decisoes; for (const c of conjs) d = aplicarEscolha(d, c, c.sugestao.id, { quem, hoje: hojeIso(), origem: "sugestao", indice }); return d === e.decisoes ? e : { ...e, decisoes: d }; });
  // Aceitar a sugestão em bloco só nos conjuntos de indicação alta ou idênticos e ainda sem escolha; os de indicação possível o analista olha um a um.
  const botaoAceitar = (conjs, ondeTxt) => {
    const fortes = conjs.filter((c) => c.nivel !== "POSSIVEL" && escolhaDoConjunto(c, estado.decisoes).status === "nenhuma");
    if (!fortes.length) return null;
    return <Botao title="Em cada conjunto, mantém o código sugerido e encaminha os outros ao De/para para aprovação. Os conjuntos de indicação possível ficam para você escolher um a um." onClick={() => aceitarVarios(fortes)}>Aceitar a sugestão {fortes.length === 1 ? "no conjunto de indicação alta ou idêntico" : `nos ${fmt(fortes.length)} conjuntos de indicação alta ou idênticos`} {ondeTxt}</Botao>;
  };
  // A marca de tratado guarda quem conferiu, quando e sobre qual base (marcas antigas eram só "true" e continuam valendo; a feita sobre outra base não vale para esta).
  const baseId = contagem?.baseId ?? null; const marca = () => ({ por: quem, em: hojeIso(), ...(baseId ? { base: baseId } : {}) });
  const alternarTratado = (grupo) => setEstado((e) => {
    const k = `${grupo}|${crit.id}`; const marcado = !marcaValida(e.tratados?.[k], baseId);
    return { ...e, tratados: { ...e.tratados, [k]: marcado ? marca() : false }, saneados: marcado ? e.saneados : { ...e.saneados, [grupo]: false } };
  });
  const alternarSaneado = (grupo) => setEstado((e) => ({ ...e, saneados: { ...e.saneados, [grupo]: !e.saneados?.[grupo] } }));
  const botaoTratado = (grupo) => { const m = estado.tratados?.[`${grupo}|${crit.id}`]; return (
    <div className="mt-2 space-y-1">
      {marcaDeOutraBase(m, baseId) && <p className="text-xs text-amber-700 dark:text-amber-300">A marca de tratado deste grupo foi feita sobre outra base{m.por ? ` (${m.por}${m.em ? `, ${dataBr(m.em)}` : ""})` : ""} e não vale para esta: confira os itens de novo.</p>}
      <Botao onClick={() => alternarTratado(grupo)}>{marcaValida(m, baseId) ? "Reabrir neste grupo" : "Marcar como tratado neste grupo"}</Botao>
    </div>); };
  // Conferência manual de muitos grupos de uma vez: continua uma declaração do analista, registrada em cada grupo com o seu nome e a data.
  const conferirTodos = async () => {
    const faltam = grupos.filter((g) => !grupoTratado(estado, g.nome, crit, contagem)).map((g) => g.nome);
    if (!faltam.length) return;
    if (!(await confirmar({ titulo: "Marcar todos os grupos como conferidos?", descricao: `Você declara que conferiu os itens ${faltam.length === 1 ? "do grupo que falta" : `dos ${faltam.length} grupos que faltam`} no critério “${crit.titulo}”. Cada grupo fica registrado como tratado, com o seu nome e a data. Nada é alterado no cadastro.`, rotulo: "Marcar como conferidos" }))) return;
    setEstado((e) => { const t = { ...e.tratados }; for (const nome of faltam) t[`${nome}|${crit.id}`] = marca(); return { ...e, tratados: t }; });
  };

  const corpo = sit === "NAO_APLICAVEL" || sit === "SEM_ANALISE" ? null : !aprovado ? (
    <div className="rounded-lg border border-dashed border-border p-3 text-sm space-y-2">
      <p className="text-amber-700 dark:text-amber-300">Este critério ainda não foi aprovado.{n > 0 ? ` O teste achou ${plural(n, "item", "itens")} em escopo.` : ""}</p>
      <p className="text-muted-foreground">Confira a regra acima e aprove o critério para tratá-lo aqui. Para ajustar a regra, abra o critério no passo Critérios.</p>
      <Botao onClick={onIrCriterios}>Abrir em Critérios</Botao>
    </div>
  ) : !crit.auto ? (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Conferência manual: este critério ainda não tem teste automático. Confira os itens de cada grupo e marque como tratado: o grupo só é saneado com a conferência concluída.</p>
      {grupos.some((g) => !grupoTratado(estado, g.nome, crit, contagem)) && <div className="flex flex-wrap items-center gap-2"><Botao onClick={conferirTodos} title="Registra a conferência de todos os grupos que faltam, cada um com o seu nome e a data">Marcar todos os grupos como conferidos</Botao></div>}
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
      {EM_BLOCO.includes(crit.id) && paraEncaminhar(crit, lista, indice).length > 0 && <div className="flex flex-wrap items-center gap-2">{botaoEmBloco(crit, lista, "de todos os grupos")}</div>}
      {ehDup && <div className="flex flex-wrap items-center gap-2">{botaoAceitar(conjuntos, "de todos os grupos")}</div>}
      {porGrupo.map(({ grupo, achados: ach }) => {
        const chave = `${crit.id}|${grupo}`; const trat = grupoTratado(estado, grupo, crit, contagem); const enc = encGrupo(ach);
        const cards = ehDup ? conjuntos.filter((c) => c.grupo === grupo) : []; // conjuntos aparecem no grupo de itens mais frequente entre os membros
        const resto = ehDup ? ach.filter((a) => !emConjunto.has(a.item.linha)) : ach; // achados sem conjunto para comparar seguem na tabela de achados
        return (
          <Acc key={grupo} aberto={!!aberto[chave]} onToggle={() => alternar(chave)} titulo={<><b className="font-medium">{grupo}</b>{trat ? <Chip tom="g">Tratado</Chip> : <Chip tom="a">A tratar</Chip>}<span className="text-xs text-muted-foreground">{ehDup ? `${plural(cards.length, "conjunto", "conjuntos")} · ${plural(ach.length, "item", "itens")}` : `${plural(ach.length, "achado", "achados")}${enc > 0 ? ` · ${plural(enc, "encaminhado", "encaminhados")}` : ""}`}</span></>}>
            {EM_BLOCO.includes(crit.id) && paraEncaminhar(crit, ach, indice).length > 0 && <div className="flex flex-wrap items-center gap-2 mb-2">{botaoEmBloco(crit, ach, "do grupo")}</div>}
            {ehDup && cards.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">{botaoAceitar(cards, "do grupo")}</div>
                <ConjuntosDuplicidade conjuntos={cards} decisoes={estado.decisoes} escala={escalaSaldo} indice={indice} onEscolher={escolher} onDesfazer={desfazer} onCompletar={completar} onComparar={onComparar} />
              </div>)}
            {resto.length > 0 && <>{ehDup && cards.length > 0 && <p className="mt-3 mb-1 text-xs text-muted-foreground">Outros achados de duplicidade deste grupo (sem conjunto para comparar)</p>}<TabelaAchados ach={resto} crit={crit} decisoes={estado.decisoes} itemPorLinha={itemPorLinha} indice={indice} escalaSaldo={escalaSaldo} onAlternar={alternarAchado} onComparar={onComparar} /></>}
            {ehDup && cards.length === 0 && resto.length === 0 && <p className="text-xs text-muted-foreground">Os itens deste grupo estão em conjuntos de outro grupo.</p>}
            {botaoTratado(grupo)}
          </Acc>);
      })}
    </div>
  );

  // Situação por grupo: ordenável por grupo, itens e situação (saneado, pronto para sanear, com pendências).
  const linhasGrupos = useMemo(() => grupos.map((g) => {
    const falta = criteriosPendentesDoGrupo(estado, g.nome, contagem); const pode = falta.length === 0; const san = !!estado.saneados[g.nome] && pode;
    return { g, san, falta, pode, rank: san ? 2 : pode ? 1 : 0 };
  }), [grupos, estado, contagem]);
  const gruposOrdenados = useMemo(() => ordenarPor(linhasGrupos, ordGrupos, { grupo: (x) => x.g.nome, itens: (x) => x.g.itens.length, situacao: (x) => x.rank }), [linhasGrupos, ordGrupos]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground"><b className="text-foreground">{nSan} de {grupos.length}</b> grupos saneados · critérios aprovados: {aprovadosLista.length} de {CRITERIOS.length}{nNaoAplicaveis > 0 ? ` (${plural(nNaoAplicaveis, "não aplicável", "não aplicáveis")})` : ""}</p>
        <div className="flex flex-wrap items-center gap-3">
          {temSaldo && <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="A exportação do ERP pode trazer o saldo multiplicado (a da Crestani vem ×1.000.000). A escala só muda como o saldo é mostrado.">Saldo da base
            <select value={escalaSaldo} onChange={(e) => onEscala(Number(e.target.value))} aria-label="Escala do saldo em estoque" className="border rounded px-1 py-0.5 bg-background text-foreground">
              {ESCALAS_SALDO.map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}</select></label>}
          <Botao onClick={() => setExportando((x) => !x)} aria-expanded={exportando}><Download className="w-3.5 h-3.5 inline mr-1" />Emitir Excel</Botao>
        </div>
      </div>
      {exportando && <ExportarAnalises ativo={ativo} grupos={grupos} achados={achados} contagem={contagem} estado={estado} itemPorLinha={itemPorLinha} indice={indice} escalaSaldo={escalaSaldo} nomeProjeto={nomeProjeto} nomeBase={nomeBase} slug={slug} onFechar={() => setExportando(false)} />}
      <AbasCriterios estado={estado} contagem={contagem} ativo={ativo} onSelecionar={onSelecionar} marca={concluido} />
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{crit.titulo}</h3>
          <div className="flex flex-wrap items-center gap-2"><SelosCriterio crit={crit} situacao={sit} cEst={cEst} /></div>
        </div>
        <AcaoAprovacao key={crit.id} situacao={sit} onAprovar={() => onAprovar(crit)} onReabrir={() => onReabrir(crit)} onNaoAplicavel={(j) => onNaoAplicavel(crit, j)} />
        <AvisoCriterio estado={estado} crit={crit} situacao={sit} contagem={contagem} onIrTriagem={onIrTriagem} />
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Ver a regra deste critério</summary><p className="mt-1">{cEst.regra ?? crit.regra}</p></details>
        {aprovado && crit.auto && n > 0 && (ehDup && conjuntos.length > 0 ? <LegendaConjuntos conjuntos={conjuntos} decisoes={estado.decisoes} onIrDepara={onIrDepara} indice={indice} /> : <LegendaEncaminhar lista={lista} decisoes={estado.decisoes} critId={crit.id} onIrDepara={onIrDepara} indice={indice} />)}
        {corpo}
      </div>
      <Acc aberto={!!aberto.__grupos} onToggle={() => alternar("__grupos")} titulo={<><b className="font-medium">Situação por grupo</b><span className="text-xs text-muted-foreground">{nSan} de {grupos.length} saneados</span></>}>
        {grupos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum grupo em escopo.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><Th chave="grupo" ord={ordGrupos} onOrdenar={ordenarGrupos}>Grupo</Th><Th chave="itens" ord={ordGrupos} onOrdenar={ordenarGrupos}>Itens</Th><Th chave="situacao" ord={ordGrupos} onOrdenar={ordenarGrupos}>Situação</Th><th className="p-1.5"></th></tr></thead>
              <tbody>{gruposOrdenados.map(({ g, san, falta, pode }) => (
                <tr key={g.nome} className="border-t border-border align-top">
                  <td className="p-1.5">{g.nome}</td><td className="p-1.5 tabular-nums">{fmt(g.itens.length)}</td>
                  <td className="p-1.5">{san ? <Chip tom="g">Saneado</Chip> : falta.length === 0 ? <Chip tom="b">Pronto para sanear</Chip> : <span className="text-muted-foreground">faltam{" "}{falta.slice(0, 3).map((c, i) => <React.Fragment key={c.id}>{i > 0 && ", "}<button type="button" className="underline text-primary" onClick={() => onSelecionar(c.id)}>{c.titulo}{{ PENDENTE: " (a aprovar)", SEM_ANALISE: " (análise não executada)" }[situacaoCriterio(estado, c, contagem)] ?? ""}</button></React.Fragment>)}{falta.length > 3 ? `+${falta.length - 3}` : ""}</span>}</td>
                  <td className="p-1.5 whitespace-nowrap"><Botao disabled={!san && !pode} onClick={() => alternarSaneado(g.nome)}>{san ? "Reabrir grupo" : "Marcar como saneado"}</Botao></td></tr>))}</tbody></table>
            <p className="text-xs text-muted-foreground pt-2">O grupo só encerra com todos os critérios aplicáveis aprovados e tratados nele, os de conferência manual inclusive. Critério que não se aplica ao projeto precisa de justificativa escrita.</p>
          </div>)}
      </Acc>
    </div>
  );
}
