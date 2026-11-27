import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RotateCw } from "lucide-react";
import { chaves, san, atualizarTudo } from "./api";
import { Aviso, botaoPrimario, Tag, usePodeAlterar } from "./comuns";
import { camadasAtivas, coberturaDeCamadas, estadoDaTrava, fmtDataHora, mensagemDeErro, ROTULO_CAMADA } from "./logica";

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

/** Camadas que "Analisar todas" roda, na ordem do trabalho (a mesma das abas): só as que têm análise e itens. */
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
 * Cobertura: uma linha com o que falta em cada camada (casos em aberto e aguardando, camada desatualizada) e "Analisar todas (na ordem)".
 * Cada camada também pode ser analisada sozinha (botão ao lado do selo).
 */
export default function Cobertura({ projeto }) {
  const qc = useQueryClient();
  const trava = estadoDaTrava(projeto);
  const { pode, razao } = usePodeAlterar();
  const camadas = camadasAtivas(projeto.modulos);
  const visao = useQuery({ queryKey: chaves.visao(projeto.id), queryFn: () => san.visaoGeral(projeto.id) });
  const disponiveis = useQuery({ queryKey: chaves.camadas(), queryFn: () => san.camadasDisponiveis() });
  const estado = useQuery({ queryKey: chaves.estadoCamadas(projeto.id), queryFn: () => san.estadoCamadas(projeto.id) });
  const [resultado, setResultado] = useState(null);
  const [progresso, setProgresso] = useState(null); // { atual, total, camada }
  const executar = useMutation({
    mutationFn: async (lista) => {
      const feitas = [];
      for (let n = 0; n < lista.length; n++) {
        setProgresso({ atual: n + 1, total: lista.length, camada: lista[n] });
        try { feitas.push(await san.executarCamada(projeto.id, lista[n])); } catch (e) { throw Object.assign(e, { feitas, camada: lista[n] }); }
      }
      return feitas;
    },
    onSuccess: (feitas) => { setProgresso(null); setResultado({ tom: "ok", feitas }); atualizarTudo(qc, projeto.id); },
    onError: (e) => {
      setProgresso(null);
      const antes = e.feitas?.length ? `${e.feitas.length} camada(s) analisada(s); parou em ${ROTULO_CAMADA[e.camada]}: ` : "";
      setResultado({ tom: "erro", texto: `${antes}${mensagemDeErro(e)}` });
      atualizarTudo(qc, projeto.id);
    },
  });
  const cobertura = coberturaDeCamadas(camadas, disponiveis.data, visao.data);
  const pronto = visao.data !== undefined && disponiveis.data !== undefined;
  const porCamada = new Map((estado.data?.camadas || []).map((l) => [l.camada, l]));
  const ordem = ordemDeAnalise(cobertura);
  const bloqueio = !pode ? razao : trava.bloqueada ? trava.mensagem : null;
  const analisar = (lista) => { setResultado(null); executar.mutate(lista); };

  return (
    <section aria-labelledby="san-cobertura" className="border border-border bg-card px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 id="san-cobertura" className="text-xs font-semibold">Cobertura das camadas</h2>
        {visao.isError || disponiveis.isError ? <span className="text-muted-foreground" role="alert">Não foi possível carregar a cobertura agora.</span>
          : !pronto ? <span className="text-muted-foreground" role="status">Carregando a cobertura…</span>
            : (
              <ul className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1" aria-label="Situação de cada camada">
                {cobertura.map((c) => {
                  const e = porCamada.get(c.camada);
                  const selo = seloDaCamada(c, e);
                  const rodando = executar.isPending && progresso?.camada === c.camada;
                  return (
                    <li key={c.camada} className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="font-medium">{ROTULO_CAMADA[c.camada]}</span>
                      <Tag tom={selo.tom}>{rodando ? "analisando…" : selo.texto}</Tag>
                      {e?.desatualizada && <span title={textoDesatualizada(e.desatualizada)}><Tag tom="alerta">desatualizada</Tag></span>}
                      {c.analisavel && c.estado !== "SEM_ITENS" && (
                        <button type="button" className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-40" disabled={!!bloqueio || executar.isPending}
                          title={bloqueio || `Analisar ${ROTULO_CAMADA[c.camada]}${e?.executadaEm ? ` (última análise: ${fmtDataHora(e.executadaEm)})` : ""}`}
                          aria-label={`Analisar ${ROTULO_CAMADA[c.camada]}`} onClick={() => analisar([c.camada])}>
                          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
        <button type="button" className={`${botaoPrimario} ml-auto px-2 py-1 text-xs`} disabled={!pronto || !!bloqueio || executar.isPending || !ordem.length}
          title={bloqueio || (!ordem.length ? "Importe o cadastro de itens antes" : `Analisa ${ordem.length} camada(s), uma depois da outra, na ordem das abas`)} onClick={() => analisar(ordem)}>
          <Play className="h-3.5 w-3.5" aria-hidden="true" />{executar.isPending && progresso ? `Analisando ${progresso.atual} de ${progresso.total}…` : "Analisar todas (na ordem)"}
        </button>
      </div>
      {trava.bloqueada && <p className="mt-1 text-muted-foreground">{trava.mensagem}: as análises ficam bloqueadas até lá.</p>}
      {resultado?.tom === "erro" && <div className="mt-2"><Aviso tom="erro">{resultado.texto}</Aviso></div>}
      {resultado?.tom === "ok" && <div className="mt-2"><Aviso tom={resultado.feitas.some((r) => r.semDados) ? "alerta" : "ok"}>{textoDasAnalises(resultado.feitas)}</Aviso></div>}
    </section>
  );
}
