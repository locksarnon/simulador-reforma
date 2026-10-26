import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { CRITERIOS, grupoDe, hojeIso } from "./logica";
import { NOTA_MIN, achadosDe, agruparAchados, criteriosPendentesDoGrupo, grupoSaneado, grupoTratado, marcaDeOutraBase, marcaManualCompleta, marcaValida, situacaoCriterio } from "./analise";
import { checagens, linhasEvidencia, resumoChecagens, textoCobertura, textoConclusao } from "./checagens";
import { AbasCriterios, AcaoAprovacao, AvisoCriterio, ChipConclusao, SelosCriterio } from "./CriterioUi";
import ChecagensResumo from "./ChecagensResumo";
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
    const obs = it.duplicidade?.observacao?.palavras; // a variante (observação) do item que sai segue na decisão, para o campo adicional do item mantido
    return { destino: mestre ? idItem(mestre) || null : null, ...(mestre ? { destinoAntes: instantaneoDoItem(mestre, "duplicidade") } : {}), ...(mestre && mestre.linha !== it.linha && obs?.length ? { observacao: [...obs] } : {}) };
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

const ResultadoChip = ({ resultado }) => (resultado === "COM_ACHADOS" ? <Chip tom="b">Com achados</Chip> : <Chip tom="g">Sem achados</Chip>);

/** Conclusão de um grupo na conferência manual: o resultado (sem achados ou com achados) e a evidência escrita, que ficam registrados com quem concluiu e quando. */
function ConclusaoManualGrupo({ grupo, aviso, onConcluir }) {
  const [nota, setNota] = useState("");
  const valida = nota.trim().length >= NOTA_MIN;
  const concluir = (resultado) => { if (!valida) return; onConcluir(resultado, nota.trim()); setNota(""); };
  return (
    <div className="mt-2 space-y-1.5">
      {aviso}
      <label className="block text-xs text-muted-foreground">Evidência: o que foi conferido e onde, ou o que foi achado (ao menos {NOTA_MIN} caracteres)
        <input value={nota} onChange={(e) => setNota(e.target.value)} aria-label={`Evidência da conferência do grupo ${grupo}`} className="mt-1 w-full border rounded-md p-1.5 text-sm bg-background text-foreground" /></label>
      <div className="flex flex-wrap items-center gap-2">
        <Botao disabled={!valida} onClick={() => concluir("SEM_ACHADOS")}>Concluir sem achados</Botao>
        <Botao disabled={!valida} onClick={() => concluir("COM_ACHADOS")}>Concluir com achados</Botao>
        {!valida && <span className="text-xs text-muted-foreground">Escreva a evidência para concluir.</span>}
      </div>
    </div>);
}

/** Conclui sem achados, de uma vez, os grupos que faltam numa conferência manual: uma só evidência, registrada em cada grupo. */
function ConclusaoEmBloco({ faltam, onConcluir }) {
  const [nota, setNota] = useState("");
  const valida = nota.trim().length >= NOTA_MIN; const quais = faltam === 1 ? "o grupo que falta" : `os ${fmt(faltam)} grupos que faltam`;
  return (
    <div className="rounded-lg border border-border p-3 space-y-1.5">
      <label className="block text-xs text-muted-foreground">Para concluir sem achados {quais} de uma vez, escreva a evidência (o que foi conferido e onde, ao menos {NOTA_MIN} caracteres). Ela fica registrada em cada grupo, com o seu nome e a data.
        <input value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Evidência para concluir os grupos que faltam" className="mt-1 w-full border rounded-md p-1.5 text-sm bg-background text-foreground" /></label>
      <Botao disabled={!valida} onClick={() => onConcluir(nota.trim())}>Concluir sem achados {quais}</Botao>
    </div>);
}

/**
 * Passo Checagens (reúne o que eram os passos Critérios e Análises): uma aba por problema de cadastro. Cada checagem mostra a cobertura (o que foi examinado), a conclusão
 * (verificada sem achados, verificada com achados, não se aplica ou pendente) e a evidência. Em cada aba o analista aprova a regra, vê os achados do critério em todos os grupos,
 * com como é hoje e como seria, encaminha o que deve mudar para aprovação no De/para e conclui cada grupo. A conferência manual só conclui o grupo com o resultado e a evidência
 * escrita. O grupo é saneado quando todas as checagens aplicáveis estão concluídas nele. `regraUi` traz a regra, o exemplo e os ajustes da checagem aberta.
 */
export default function PassoChecagens({ estado, setEstado, grupos, achados, contagem, temBase, ativo, onSelecionar, quem, onComparar, onIrDepara, onIrTriagem, onAprovar, onReabrir, onNaoAplicavel, itemPorLinha, indice, nomeProjeto, nomeBase, slug, escalaSaldo = 1, temSaldo = false, onEscala, regraUi, escopoResumo, extraidaEm }) {
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
  const nSan = grupos.filter((g) => grupoSaneado(estado, g.nome, contagem)).length;
  const listaChecagens = useMemo(() => checagens(estado, contagem, grupos), [estado, contagem, grupos]);
  const resumo = useMemo(() => resumoChecagens(listaChecagens), [listaChecagens]);
  const conclusoes = useMemo(() => Object.fromEntries(listaChecagens.map((c) => [c.id, c.conclusao])), [listaChecagens]);
  const checagem = listaChecagens.find((c) => c.id === crit.id);
  const evidencia = linhasEvidencia(checagem);
  const alternar = (k) => setAberto((a) => ({ ...a, [k]: !a[k] }));
  const estaAberto = (k, padrao) => (k in aberto ? aberto[k] : padrao); // o que tem padrão (a visão geral, a regra da checagem que pede ação) abre sozinho até o analista mexer
  const alternarPadrao = (k, padrao) => setAberto((a) => ({ ...a, [k]: !(k in a ? a[k] : padrao) }));

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
  // A conclusão do grupo guarda quem concluiu, quando, sobre qual base e o resultado (marcas antigas eram só "true" e continuam valendo no teste automático; a feita sobre outra base não vale para esta;
  // na conferência manual a marca precisa trazer o resultado e a evidência escrita).
  const baseId = contagem?.baseId ?? null; const marca = (extra = {}) => ({ por: quem, em: hojeIso(), ...(baseId ? { base: baseId } : {}), ...extra });
  const reabrirGrupo = (grupo) => setEstado((e) => ({ ...e, tratados: { ...e.tratados, [`${grupo}|${crit.id}`]: false }, saneados: { ...e.saneados, [grupo]: false } }));
  const concluirAuto = (grupo) => setEstado((e) => { // teste automático: o resultado vem dos achados do grupo
    const k = `${grupo}|${crit.id}`; const resultado = (contagem?.porGrupoCriterio?.[k] ?? 0) > 0 ? "COM_ACHADOS" : "SEM_ACHADOS";
    return { ...e, tratados: { ...e.tratados, [k]: marca({ resultado }) } };
  });
  const concluirManual = (grupo, resultado, nota) => setEstado((e) => ({ ...e, tratados: { ...e.tratados, [`${grupo}|${crit.id}`]: marca({ resultado, nota }) } }));
  const concluirTodosSemAchados = async (nota) => {
    const faltam = grupos.filter((g) => !grupoTratado(estado, g.nome, crit, contagem)).map((g) => g.nome);
    if (!faltam.length) return;
    if (!(await confirmar({ titulo: "Concluir os grupos sem achados?", descricao: `Você declara que conferiu os itens ${faltam.length === 1 ? "do grupo que falta" : `dos ${faltam.length} grupos que faltam`} na checagem “${crit.titulo}” e não achou nada. A evidência escrita (“${nota}”) fica registrada em cada grupo, com o seu nome e a data. Nada é alterado no cadastro.`, rotulo: "Concluir sem achados" }))) return;
    setEstado((e) => { const t = { ...e.tratados }; for (const nome of faltam) t[`${nome}|${crit.id}`] = marca({ resultado: "SEM_ACHADOS", nota }); return { ...e, tratados: t }; });
  };
  const alternarSaneado = (grupo) => setEstado((e) => ({ ...e, saneados: { ...e.saneados, [grupo]: !e.saneados?.[grupo] } }));
  const avisoOutraBase = (m) => marcaDeOutraBase(m, baseId) && <p className="text-xs text-amber-700 dark:text-amber-300">A conclusão deste grupo foi feita sobre outra base{m.por ? ` (${m.por}${m.em ? `, ${dataBr(m.em)}` : ""})` : ""} e não vale para esta: confira os itens de novo.</p>;
  const botaoConcluirAuto = (grupo) => { const m = estado.tratados?.[`${grupo}|${crit.id}`]; return (
    <div className="mt-2 space-y-1">
      {avisoOutraBase(m)}
      <Botao onClick={() => (marcaValida(m, baseId) ? reabrirGrupo(grupo) : concluirAuto(grupo))}>{marcaValida(m, baseId) ? "Reabrir neste grupo" : "Concluir a checagem neste grupo"}</Botao>
    </div>); };

  const corpo = !temBase ? <p className="text-sm text-muted-foreground">Não há itens em escopo: importe a base ou revise o parâmetro de saneamento no passo Triagem. Sem itens em escopo, nada é verificado.</p>
    : sit === "NAO_APLICAVEL" || sit === "SEM_ANALISE" ? null : !aprovado ? (
      <div className="rounded-lg border border-dashed border-border p-3 text-sm space-y-1">
        <p className="text-amber-700 dark:text-amber-300">A regra desta checagem ainda não foi aprovada.{n > 0 ? ` O teste achou ${plural(n, "item", "itens")} em escopo.` : ""}</p>
        <p className="text-muted-foreground">Confira a regra em “Regra, exemplo e ajustes” (logo acima) e aprove-a para tratar os achados aqui.</p>
      </div>
    ) : !crit.auto ? (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Conferência manual: esta checagem não tem teste automático. Confira os itens de cada grupo e conclua o grupo com o resultado e a evidência escrita (o que foi conferido e onde, ou o que foi achado). O grupo só é saneado com a conferência concluída.</p>
        {grupos.some((g) => !grupoTratado(estado, g.nome, crit, contagem)) && <ConclusaoEmBloco faltam={grupos.filter((g) => !grupoTratado(estado, g.nome, crit, contagem)).length} onConcluir={concluirTodosSemAchados} />}
        {grupos.map((g) => {
          const chave = `${crit.id}|${g.nome}`; const trat = grupoTratado(estado, g.nome, crit, contagem); const m = estado.tratados?.[`${g.nome}|${crit.id}`];
          const marcaAntiga = marcaValida(m, baseId) && !marcaManualCompleta(m); // marca de antes da evidência escrita: não conclui o grupo
          return (
            <Acc key={g.nome} aberto={!!aberto[chave]} onToggle={() => alternar(chave)} titulo={<><b className="font-medium">{g.nome}</b>{trat ? <Chip tom="g">Concluído</Chip> : <Chip tom="a">A concluir</Chip>}{trat && <ResultadoChip resultado={m.resultado} />}<span className="text-xs text-muted-foreground">{plural(g.itens.length, "item", "itens")} em escopo</span></>}>
              <TabelaItens itens={g.itens} colunas={["linha", "codigo", "descricao", "unidade", "ultima_mov"]} />
              {trat ? (
                <div className="mt-2 space-y-1">
                  <p className="text-xs"><ResultadoChip resultado={m.resultado} /> por {m.por || "—"} em {dataBr(m.em)}: {m.nota}</p>
                  <Botao onClick={() => reabrirGrupo(g.nome)}>Reabrir neste grupo</Botao>
                </div>
              ) : <ConclusaoManualGrupo grupo={g.nome} onConcluir={(resultado, nota) => concluirManual(g.nome, resultado, nota)}
                aviso={<>{avisoOutraBase(m)}{marcaAntiga && <p className="text-xs text-amber-700 dark:text-amber-300">Havia uma marca anterior sem o resultado e a evidência escrita: ela não conclui mais o grupo. Registre a conclusão abaixo.</p>}</>} />}
            </Acc>);
        })}
      </div>
    ) : n === 0 ? (
      <p className="text-sm text-muted-foreground">Nenhum achado nos {fmt(totalEmEscopo)} itens em escopo. {sit === "AUTO" ? "A regra abriu aprovada; para conferir mesmo assim, use “Revisar manualmente”." : ""}</p>
    ) : (
      <div className="space-y-2">
        {EM_BLOCO.includes(crit.id) && paraEncaminhar(crit, lista, indice).length > 0 && <div className="flex flex-wrap items-center gap-2">{botaoEmBloco(crit, lista, "de todos os grupos")}</div>}
        {ehDup && <div className="flex flex-wrap items-center gap-2">{botaoAceitar(conjuntos, "de todos os grupos")}</div>}
        {porGrupo.map(({ grupo, achados: ach }) => {
          const chave = `${crit.id}|${grupo}`; const trat = grupoTratado(estado, grupo, crit, contagem); const enc = encGrupo(ach);
          const cards = ehDup ? conjuntos.filter((c) => c.grupo === grupo) : []; // conjuntos aparecem no grupo de itens mais frequente entre os membros
          const resto = ehDup ? ach.filter((a) => !emConjunto.has(a.item.linha)) : ach; // achados sem conjunto para comparar seguem na tabela de achados
          return (
            <Acc key={grupo} aberto={!!aberto[chave]} onToggle={() => alternar(chave)} titulo={<><b className="font-medium">{grupo}</b>{trat ? <Chip tom="g">Concluído</Chip> : <Chip tom="a">A concluir</Chip>}<span className="text-xs text-muted-foreground">{ehDup ? `${plural(cards.length, "conjunto", "conjuntos")} · ${plural(ach.length, "item", "itens")}` : `${plural(ach.length, "achado", "achados")}${enc > 0 ? ` · ${plural(enc, "encaminhado", "encaminhados")}` : ""}`}</span></>}>
              {EM_BLOCO.includes(crit.id) && paraEncaminhar(crit, ach, indice).length > 0 && <div className="flex flex-wrap items-center gap-2 mb-2">{botaoEmBloco(crit, ach, "do grupo")}</div>}
              {ehDup && cards.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">{botaoAceitar(cards, "do grupo")}</div>
                  <ConjuntosDuplicidade conjuntos={cards} decisoes={estado.decisoes} escala={escalaSaldo} indice={indice} onEscolher={escolher} onDesfazer={desfazer} onCompletar={completar} onComparar={onComparar} />
                </div>)}
              {resto.length > 0 && <>{ehDup && cards.length > 0 && <p className="mt-3 mb-1 text-xs text-muted-foreground">Outros achados de duplicidade deste grupo (sem conjunto para comparar)</p>}<TabelaAchados ach={resto} crit={crit} decisoes={estado.decisoes} itemPorLinha={itemPorLinha} indice={indice} escalaSaldo={escalaSaldo} onAlternar={alternarAchado} onComparar={onComparar} /></>}
              {ehDup && cards.length === 0 && resto.length === 0 && <p className="text-xs text-muted-foreground">Os itens deste grupo estão em conjuntos de outro grupo.</p>}
              {botaoConcluirAuto(grupo)}
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
  const regraAberta = estaAberto(`regra|${crit.id}`, sit === "PENDENTE" || sit === "SEM_ANALISE"); // a regra que pede aprovação abre sozinha

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground"><b className="text-foreground">{resumo.concluidas} de {resumo.total}</b> checagens concluídas{resumo.NAO_APLICAVEL > 0 ? ` (${plural(resumo.NAO_APLICAVEL, "não se aplica", "não se aplicam")})` : ""} · <b className="text-foreground">{nSan} de {grupos.length}</b> grupos saneados</p>
        <div className="flex flex-wrap items-center gap-3">
          {temSaldo && <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="A exportação do ERP pode trazer o saldo multiplicado (a da Crestani vem ×1.000.000). A escala só muda como o saldo é mostrado.">Saldo da base
            <select value={escalaSaldo} onChange={(e) => onEscala(Number(e.target.value))} aria-label="Escala do saldo em estoque" className="border rounded px-1 py-0.5 bg-background text-foreground">
              {ESCALAS_SALDO.map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}</select></label>}
          {temBase && <Botao onClick={() => setExportando((x) => !x)} aria-expanded={exportando}><Download className="w-3.5 h-3.5 inline mr-1" />Emitir Excel</Botao>}
        </div>
      </div>
      {exportando && temBase && <ExportarAnalises ativo={ativo} grupos={grupos} achados={achados} contagem={contagem} estado={estado} itemPorLinha={itemPorLinha} indice={indice} escalaSaldo={escalaSaldo} nomeProjeto={nomeProjeto} nomeBase={nomeBase} slug={slug} onFechar={() => setExportando(false)} />}
      <Acc aberto={estaAberto("__visao", true)} onToggle={() => alternarPadrao("__visao", true)} titulo={<><b className="font-medium">Visão geral das checagens</b><span className="text-xs text-muted-foreground">cobertura, conclusão e evidência de cada uma{resumo.PENDENTE > 0 ? ` · ${plural(resumo.PENDENTE, "pendente", "pendentes")}` : ""}</span></>}>
        <ChecagensResumo lista={listaChecagens} resumo={resumo} escopo={temBase ? escopoResumo : null} nomeBase={nomeBase} extraidaEm={extraidaEm} onAbrir={onSelecionar} />
      </Acc>
      <AbasCriterios contagem={contagem} ativo={ativo} onSelecionar={onSelecionar} conclusoes={conclusoes} />
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{crit.titulo}</h3>
          <div className="flex flex-wrap items-center gap-2">{crit.auto ? <Chip tom="b">Teste automático</Chip> : <Chip>Conferência manual</Chip>}<ChipConclusao conclusao={checagem.conclusao} /></div>
        </div>
        <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[88px_1fr]">
          <dt className="text-muted-foreground">Cobertura</dt><dd>{textoCobertura(checagem)}</dd>
          <dt className="text-muted-foreground">Conclusão</dt><dd>{textoConclusao(checagem)}</dd>
          <dt className="text-muted-foreground">Evidência</dt><dd>{evidencia.length ? evidencia.map((l) => <div key={l}>{l}</div>) : <span className="text-muted-foreground">—</span>}</dd>
        </dl>
        <AcaoAprovacao key={crit.id} situacao={sit} onAprovar={() => onAprovar(crit)} onReabrir={() => onReabrir(crit)} onNaoAplicavel={(j) => onNaoAplicavel(crit, j)} />
        <AvisoCriterio estado={estado} crit={crit} situacao={sit} contagem={contagem} onIrTriagem={onIrTriagem} />
        <Acc aberto={regraAberta} onToggle={() => alternarPadrao(`regra|${crit.id}`, sit === "PENDENTE" || sit === "SEM_ANALISE")} titulo={<><b className="font-medium">Regra, exemplo e ajustes</b><SelosCriterio situacao={sit} cEst={cEst} /></>}>
          {regraUi}
        </Acc>
        {temBase && aprovado && crit.auto && n > 0 && (ehDup && conjuntos.length > 0 ? <LegendaConjuntos conjuntos={conjuntos} decisoes={estado.decisoes} onIrDepara={onIrDepara} indice={indice} /> : <LegendaEncaminhar lista={lista} decisoes={estado.decisoes} critId={crit.id} onIrDepara={onIrDepara} indice={indice} />)}
        {corpo}
      </div>
      {temBase && (
        <Acc aberto={!!aberto.__grupos} onToggle={() => alternar("__grupos")} titulo={<><b className="font-medium">Situação por grupo</b><span className="text-xs text-muted-foreground">{nSan} de {grupos.length} saneados</span></>}>
          {grupos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum grupo em escopo.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><Th chave="grupo" ord={ordGrupos} onOrdenar={ordenarGrupos}>Grupo</Th><Th chave="itens" ord={ordGrupos} onOrdenar={ordenarGrupos}>Itens</Th><Th chave="situacao" ord={ordGrupos} onOrdenar={ordenarGrupos}>Situação</Th><th className="p-1.5"></th></tr></thead>
                <tbody>{gruposOrdenados.map(({ g, san, falta, pode }) => (
                  <tr key={g.nome} className="border-t border-border align-top">
                    <td className="p-1.5">{g.nome}</td><td className="p-1.5 tabular-nums">{fmt(g.itens.length)}</td>
                    <td className="p-1.5">{san ? <Chip tom="g">Saneado</Chip> : falta.length === 0 ? <Chip tom="b">Pronto para sanear</Chip> : <span className="text-muted-foreground">faltam{" "}{falta.slice(0, 3).map((c, i) => <React.Fragment key={c.id}>{i > 0 && ", "}<button type="button" className="underline text-primary" onClick={() => onSelecionar(c.id)}>{c.titulo}{{ PENDENTE: " (regra a aprovar)", SEM_ANALISE: " (análise não executada)" }[situacaoCriterio(estado, c, contagem)] ?? ""}</button></React.Fragment>)}{falta.length > 3 ? `+${falta.length - 3}` : ""}</span>}</td>
                    <td className="p-1.5 whitespace-nowrap"><Botao disabled={!san && !pode} onClick={() => alternarSaneado(g.nome)}>{san ? "Reabrir grupo" : "Marcar como saneado"}</Botao></td></tr>))}</tbody></table>
              <p className="text-xs text-muted-foreground pt-2">O grupo só encerra com todas as checagens aplicáveis concluídas nele, as de conferência manual inclusive (resultado e evidência escrita). A checagem que não se aplica ao projeto precisa de justificativa escrita.</p>
            </div>)}
        </Acc>)}
    </div>
  );
}
