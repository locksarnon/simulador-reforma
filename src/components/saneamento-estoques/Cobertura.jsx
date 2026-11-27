import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RotateCw } from "lucide-react";
import { chaves, san, atualizarTudo } from "./api";
import { Aviso, botaoPrimario, botaoSecundario, Tag, usePodeAlterar } from "./comuns";
import {
  acaoDoBloqueio, camadasAtivas, coberturaDeCamadas, FASES, fmtDataHora, LISTA_FASES, mensagemDeErro, MENSAGEM_BLOQUEIO_FASE2, ROTULO_CAMADA, ROTULO_FASE,
} from "./logica";

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");

/**
 * Selo de uma camada na faixa: o que falta fazer nela. "N em aberto / N aguardando" quando há casos; "em dia" quando analisada e sem
 * nada pendente; "não analisada", "sem itens" ou "análise indisponível" antes disso. `estado` = linha de estado-camadas (pode faltar).
 */
export function seloDaCamada(c, estado) {
  if (c.estado === "SEM_ANALISE") return { texto: "análise indisponível", tom: "neutro" };
  if (c.estado === "SEM_ITENS") return { texto: "sem itens", tom: "neutro" };
  const abertos = estado ? Number(estado.abertos) || 0 : null;
  const aguardando = estado ? Number(estado.aguardando) || 0 : c.aguardando;
  if (c.estado === "NAO_ANALISADA" && !abertos && !aguardando) return { texto: "não analisada", tom: "neutro" };
  const partes = [];
  if (abertos) partes.push(`${fmt(abertos)} em aberto`);
  if (aguardando) partes.push(`${fmt(aguardando)} aguardando`);
  if (partes.length) return { texto: partes.join(" / "), tom: "alerta" };
  return abertos === null ? { texto: "analisada", tom: "neutro" } : { texto: "em dia", tom: "ok" };
}

/** Dica do selo "desatualizada": de que camada veio a mudança e desde quando. */
export function textoDesatualizada(d) {
  if (!d) return "";
  const por = (d.por || []).map((c) => ROTULO_CAMADA[c] || c).join(" e ");
  return `${por ? `${por}: decisões` : "Decisões"} de ${fmtDataHora(d.desde)} mudaram o que esta camada usa depois da última análise dela. Analise de novo.`;
}

/** Camadas que "Analisar a fase" roda, na ordem do trabalho: só as que têm análise e itens. */
export const ordemDeAnalise = (cobertura) => cobertura.filter((c) => c.analisavel && c.estado !== "SEM_ITENS").map((c) => c.camada);

/** Resumo depois de analisar uma ou várias camadas. */
export function textoDasAnalises(feitas) {
  if (!feitas?.length) return "";
  if (feitas.length === 1) {
    const r = feitas[0];
    return `${ROTULO_CAMADA[r.camada]}: ${fmt(r.analisados)} itens analisados; ${fmt(r.casosNovos)} caso(s) novo(s), ${fmt(r.casosJaExistentes)} já existiam.${r.semDados ? ` Faltou dado para ${fmt(r.semDados.itens)} item(ns): ${r.semDados.motivo}` : ""}`;
  }
  const novos = feitas.reduce((s, r) => s + (Number(r.casosNovos) || 0), 0);
  const faltou = feitas.filter((r) => r.semDados).map((r) => ROTULO_CAMADA[r.camada]);
  return `${feitas.length} camadas analisadas, na ordem; ${fmt(novos)} caso(s) novo(s).${faltou.length ? ` Faltou dado em: ${faltou.join(", ")}.` : ""}`;
}

/**
 * Bloqueio de uma fase, pela resposta de GET fases. A Fase 1 nunca é bloqueada. Sem a resposta (carregando ou erro), a Fase 2 fica
 * bloqueada com o motivo de não ter sido possível conferir. A mensagem do servidor vale; sem ela, a da tela para o código.
 */
export function bloqueioDaFase(fase, dados, { carregando = false } = {}) {
  if (fase !== "FASE2") return null;
  if (!dados) return { codigo: null, mensagem: carregando ? "Conferindo se a Fase 2 está liberada…" : "Não foi possível conferir agora se a Fase 2 está liberada. Tente de novo em instantes." };
  const b = (dados.fases || []).find((f) => f.fase === fase)?.bloqueio;
  if (!b) return null;
  return { codigo: b.codigo || null, mensagem: b.mensagem || MENSAGEM_BLOQUEIO_FASE2[b.codigo] || "A Fase 2 ainda não está liberada." };
}

/** Fase em que a análise em andamento foi pedida (a primeira que contém todas as camadas dela). */
export const faseDaExecucao = (ex) => (ex?.camadas?.length ? LISTA_FASES.find((f) => ex.camadas.every((c) => FASES[f].includes(c))) || null : null);

const COR_FASE = { FASE1: "border-l-teal-600", FASE2: "border-l-violet-600" };

/**
 * Cobertura, acima de todas as abas, agrupada por fase: "Fase 1 · Saneamento de estoques" e "Fase 2 · Tributário e Reforma". Em cada fase,
 * um quadro por camada com o que falta (casos em aberto e aguardando, desatualizada) e o botão de analisar a camada, e "Analisar a fase (na
 * ordem)". A Fase 2 mostra o bloqueio (Fase 1 não liberada, regime ou atividades) com o atalho para resolver, e fica sem botões até lá.
 */
export default function Cobertura({ projeto, aoIrPara }) {
  const qc = useQueryClient();
  const { pode, razao } = usePodeAlterar();
  const ativas = camadasAtivas(projeto.modulos);
  const visao = useQuery({ queryKey: chaves.visao(projeto.id), queryFn: () => san.visaoGeral(projeto.id) });
  const disponiveis = useQuery({ queryKey: chaves.camadas(), queryFn: () => san.camadasDisponiveis() });
  const estado = useQuery({ queryKey: chaves.estadoCamadas(projeto.id), queryFn: () => san.estadoCamadas(projeto.id) });
  const fases = useQuery({ queryKey: chaves.fases(projeto.id), queryFn: () => san.fases(projeto.id) });
  // A análise roda no servidor, em segundo plano: segue mesmo que você saia desta tela; aqui só se acompanha.
  const exec = useQuery({ queryKey: chaves.analises(projeto.id), queryFn: () => san.analises(projeto.id), refetchInterval: (q) => (q.state.data?.execucao?.rodando ? 2000 : false) });
  const ex = exec.data?.execucao || null;
  const rodandoAgora = !!ex?.rodando;
  const [erroInicio, setErroInicio] = useState(null);
  const [fechado, setFechado] = useState(null); // iniciadaEm do resultado que o usuário fechou
  const marco = `${rodandoAgora}-${ex?.feitas?.length ?? 0}`;
  const ultimoMarco = useRef(marco);
  useEffect(() => {
    // Cada camada concluída (e o fim da análise) renova casos, contagens e tabelas.
    if (ultimoMarco.current !== marco) { ultimoMarco.current = marco; atualizarTudo(qc, projeto.id); }
  }, [marco, qc, projeto.id]);
  const iniciar = useMutation({
    mutationFn: (lista) => san.iniciarAnalises(projeto.id, lista),
    onSuccess: (r) => qc.setQueryData(chaves.analises(projeto.id), r),
    onError: (e) => { setErroInicio(mensagemDeErro(e)); qc.invalidateQueries({ queryKey: chaves.fases(projeto.id) }); },
  });
  const ocupado = rodandoAgora || iniciar.isPending;
  const faseRodando = rodandoAgora ? faseDaExecucao(ex) : null;
  const progresso = rodandoAgora && ex.atual ? { atual: ex.camadas.indexOf(ex.atual) + 1, total: ex.camadas.length, camada: ex.atual } : null;
  // O resultado fica à vista por 30 minutos depois do fim (ou até fechar), também para quem voltou à tela depois.
  const resultado = ex && !rodandoAgora && fechado !== ex.iniciadaEm && Date.now() - Date.parse(ex.terminadaEm) < 30 * 60 * 1000
    ? (ex.erro
      ? { tom: "erro", texto: `${ex.feitas.length ? `${ex.feitas.length} camada(s) analisada(s); parou em ${ROTULO_CAMADA[ex.erro.camada]}: ` : `${ROTULO_CAMADA[ex.erro.camada]}: `}${ex.erro.mensagem}` }
      : { tom: "ok", feitas: ex.feitas })
    : null;
  const pronto = visao.data !== undefined && disponiveis.data !== undefined;
  const porCamada = new Map((estado.data?.camadas || []).map((l) => [l.camada, l]));
  const analisar = (lista) => { setErroInicio(null); iniciar.mutate(lista); };

  const blocos = LISTA_FASES.map((fase) => {
    const camadas = FASES[fase].filter((c) => ativas.includes(c));
    const cobertura = coberturaDeCamadas(camadas, disponiveis.data, visao.data);
    return { fase, cobertura, ordem: ordemDeAnalise(cobertura), bloqueio: bloqueioDaFase(fase, fases.data, { carregando: fases.isPending }) };
  });

  return (
    <section aria-labelledby="san-cobertura" className="space-y-2 border border-border bg-card p-3">
      <h2 id="san-cobertura" className="text-sm font-semibold">Cobertura das camadas</h2>
      {visao.isError || disponiveis.isError ? <p className="text-sm text-muted-foreground" role="alert">Não foi possível carregar a cobertura agora.</p>
        : !pronto ? <p className="text-sm text-muted-foreground" role="status">Carregando a cobertura…</p>
          : blocos.map(({ fase, cobertura, ordem, bloqueio }) => {
            const travaDaFase = !pode ? razao : bloqueio?.mensagem || null;
            const acao = bloqueio && acaoDoBloqueio(bloqueio.codigo);
            const idTitulo = `san-cobertura-${fase}`;
            return (
              <section key={fase} aria-labelledby={idTitulo} className={`space-y-2 border border-border border-l-4 ${COR_FASE[fase]} p-2`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={idTitulo} className="text-sm font-semibold">{ROTULO_FASE[fase]}</h3>
                  <button type="button" className={`${botaoPrimario} ml-auto px-2 py-1 text-xs`} disabled={!!travaDaFase || ocupado || !ordem.length}
                    title={travaDaFase || (!ordem.length ? "Importe o cadastro de itens antes" : `Analisa ${ordem.length} camada(s) desta fase, uma depois da outra, na ordem`)}
                    aria-label={`Analisar a ${fase === "FASE1" ? "Fase 1" : "Fase 2"} (na ordem)`} onClick={() => analisar(ordem)}>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />{faseRodando === fase && progresso ? `Analisando ${progresso.atual} de ${progresso.total}…` : "Analisar a fase (na ordem)"}
                  </button>
                </div>
                {bloqueio && (
                  <Aviso tom="bloqueio" titulo={bloqueio.codigo ? "Fase 2 ainda não liberada" : undefined}acao={acao && aoIrPara ? <button type="button" className={botaoSecundario} onClick={() => aoIrPara(acao.aba)}>{acao.rotulo}</button> : null}>
                    {bloqueio.mensagem}
                  </Aviso>
                )}
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" aria-label={`Situação de cada camada da ${fase === "FASE1" ? "Fase 1" : "Fase 2"}`}>
                  {cobertura.map((c) => {
                    const e = porCamada.get(c.camada);
                    const selo = seloDaCamada(c, e);
                    const rodando = ocupado && faseRodando === fase && progresso?.camada === c.camada;
                    const rotulo = ROTULO_CAMADA[c.camada];
                    return (
                      <li key={c.camada} className="flex flex-col gap-1 border border-border p-2 text-xs">
                        <span className="font-medium">{rotulo}</span>
                        <span className="flex flex-wrap gap-1">
                          <Tag tom={selo.tom}>{rodando ? "analisando…" : selo.texto}</Tag>
                          {e?.desatualizada && <span title={textoDesatualizada(e.desatualizada)}><Tag tom="alerta">desatualizada</Tag></span>}
                        </span>
                        {c.analisavel && (
                          <button type="button" className={`${botaoSecundario} mt-auto px-2 py-1 text-xs`} disabled={!!travaDaFase || c.estado === "SEM_ITENS" || ocupado}
                            title={travaDaFase || (c.estado === "SEM_ITENS" ? "Importe o cadastro de itens antes" : e?.executadaEm ? `Última análise: ${fmtDataHora(e.executadaEm)}` : undefined)}
                            aria-label={`Analisar ${rotulo}${fase === "FASE2" && c.camada === "OBRIGACOES" ? " (Fase 2)" : ""}`} onClick={() => analisar([c.camada])}>
                            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />{rodando ? "Analisando…" : c.estado === "NAO_ANALISADA" || c.estado === "SEM_ITENS" ? "Analisar" : "Analisar de novo"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
      {rodandoAgora && <p className="text-xs text-muted-foreground" role="status">A análise roda no servidor: pode sair desta tela ou do sistema, ela continua.</p>}
      {erroInicio && <Aviso tom="erro">{erroInicio}</Aviso>}
      {resultado && (
        <div className="flex items-start gap-2">
          <div className="flex-1">{resultado.tom === "erro" ? <Aviso tom="erro">{resultado.texto}</Aviso> : <Aviso tom={resultado.feitas.some((r) => r.semDados) ? "alerta" : "ok"}>{textoDasAnalises(resultado.feitas)}</Aviso>}</div>
          <button type="button" className="px-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Fechar o resultado da análise" onClick={() => setFechado(ex.iniciadaEm)}>Fechar</button>
        </div>
      )}
    </section>
  );
}
