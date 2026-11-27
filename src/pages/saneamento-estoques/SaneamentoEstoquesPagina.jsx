import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { semFuncao, temFuncao } from "@/lib/permissoes";
import PageHeader from "@/components/PageHeader";
import { telasDoSaneamento, trilhaDoProjeto } from "@/lib/trilhas";
import { useClienteDoProjeto } from "@/lib/useClienteDoProjeto";
import { san, chaves } from "@/components/saneamento-estoques/api";
import { Aviso, botaoPrimario, botaoSecundario, EstadoCarregando, EstadoErro, PermissaoContext, Quadro } from "@/components/saneamento-estoques/comuns";
import Abas, { SeletorDeFases } from "@/components/saneamento-estoques/Abas";
import Casos from "@/components/saneamento-estoques/Casos";
import Cobertura, { bloqueioDaFase } from "@/components/saneamento-estoques/Cobertura";
import Configuracao from "@/components/saneamento-estoques/Configuracao";
import Diretrizes from "@/components/saneamento-estoques/diretrizes/Diretrizes";
import Impacto from "@/components/saneamento-estoques/Impacto";
import Importacao from "@/components/saneamento-estoques/Importacao";
import TabelaUnica from "@/components/saneamento-estoques/TabelaUnica";
import Unificacoes from "@/components/saneamento-estoques/Unificacoes";
import RoteiroProjeto from "@/components/saneamento-estoques/RoteiroProjeto";
import Versoes from "@/components/saneamento-estoques/Versoes";
import VisaoGeral from "@/components/saneamento-estoques/VisaoGeral";
import {
  abaInicialDaFase, acaoDoBloqueio, areaDoParam, areaPorId, ASPECTOS_DA_FASE, camadasDaFase, destinoDaAba, faseInicial, mensagemDeErro, naoEncontrado,
  paramsDoDestino, situacaoDasFases,
} from "@/components/saneamento-estoques/logica";

/** Fechamento > Entregas finais: as versões liberadas com as entregas (Excel antes × depois, relatório PDF, política) e o Roteiro do projeto. */
function EntregasFinais({ projeto, fasesLiberadas }) {
  return (
    <div className="space-y-4">
      {!fasesLiberadas && <Aviso tom="info">O fechamento reúne as entregas depois de liberadas a Fase 1 e a Fase 2. Até lá, as versões abaixo são as entregas parciais de cada fase.</Aviso>}
      <Versoes projeto={projeto} modo="fechamento" />
      <Quadro titulo="Roteiro do projeto" nivel="h2" acoes={<RoteiroProjeto />}>
        <p className="text-sm text-foreground/80">O desenho das fases com a situação de cada etapa, para apresentar ao cliente (com modo apresentação e PDF).</p>
      </Quadro>
    </div>
  );
}

const ID_DIRETRIZES = "san-diretrizes";
/** Leva a tela até as Diretrizes, que ficam embaixo, na mesma aba (botão "Ir para Diretrizes" do resultado da importação e `?secao=diretrizes`). */
const rolarParaDiretrizes = () => document.getElementById(ID_DIRETRIZES)?.scrollIntoView?.({ behavior: "smooth", block: "start" });

/** As Diretrizes dentro da aba que junta os dados da fase e as diretrizes: faixa de título fina e só os aspectos da fase. */
function SecaoDiretrizes({ projeto, fase }) {
  return (
    <section id={ID_DIRETRIZES} aria-labelledby={`${ID_DIRETRIZES}-t`} className="scroll-mt-4 space-y-2">
      <h2 id={`${ID_DIRETRIZES}-t`} className="border-b-2 border-primary pb-1 text-sm font-semibold text-foreground">Diretrizes {fase === "fase2" ? "da Fase 2 (classificação fiscal)" : "da Fase 1 (nomes, atributos, unidades e limites)"}</h2>
      <Diretrizes projeto={projeto} aspectos={ASPECTOS_DA_FASE[fase]} rolarAoAbrir />
    </section>
  );
}

/** O conteúdo da aba: as áreas comuns (projeto inteiro) e as abas de cada fase, com os componentes de sempre filtrados pela fase. */
function Painel({ projeto, fase, aba, irPara, podeImportar, recarregar, recorte, casoInicial, aoUsarCasoInicial, aoTirarRecorte, pedido, abrirCasos, abrirTabela, fasesLiberadas, bloqueio2 }) {
  // "Abrir o caso" na Tabela leva a camada: o caso abre na aba Casos da fase dela (Fase 2 para as camadas da Fase 2).
  if (aba === "tabela") return <TabelaUnica key={`${pedido}|${JSON.stringify(recorte || {})}`} projeto={projeto} recorte={recorte} aoAbrirCaso={(id, camada) => abrirCasos(camada ? { camada } : {}, id)} />;
  if (aba === "visao") return <VisaoGeral projeto={projeto} aoAbrirCasos={abrirCasos} aoAbrirTabela={abrirTabela} />;
  if (aba === "impacto") return <Impacto projeto={projeto} />;
  if (aba === "versoes") return <Versoes projeto={projeto} modo="historico" />;
  if (fase === "fechamento") return <EntregasFinais projeto={projeto} fasesLiberadas={fasesLiberadas} />;
  const faseServidor = areaPorId(fase).fase;
  const camadas = camadasDaFase(faseServidor, projeto.modulos);
  // 1.1 Preparar e diretrizes (Fase 1) e 2.1 Premissas e diretrizes (Fase 2): os dados da fase e, embaixo, as Diretrizes dela.
  const diretrizes = <SecaoDiretrizes key={fase} projeto={projeto} fase={fase} />;
  if (aba === "preparar") {
    return (
      <div className="space-y-4">
        <Configuracao projeto={projeto} recarregar={recarregar} parte="dados" />
        <Importacao projeto={projeto} podeImportar={podeImportar} aoIrParaDiretrizes={rolarParaDiretrizes} />
        {diretrizes}
      </div>
    );
  }
  if (aba === "premissas") {
    return (
      <div className="space-y-4">
        <Configuracao projeto={projeto} recarregar={recarregar} parte="premissas" />
        {diretrizes}
      </div>
    );
  }
  if (aba === "analise") return <Cobertura projeto={projeto} fase={faseServidor} aoIrPara={irPara} />;
  // A chave muda a cada pedido de abrir os casos (Visão geral, Tabela): o caso e o recorte pedidos valem uma vez, ao montar.
  if (aba === "casos") {
    return <Casos key={`${fase}|${pedido}`} projeto={projeto} recorte={recorte} casoInicial={casoInicial} aoUsarCasoInicial={aoUsarCasoInicial} aoTirarRecorte={aoTirarRecorte}
      camadasPermitidas={camadas} bloqueioFase2={bloqueio2} />;
  }
  if (aba === "unificacoes") return <Unificacoes projeto={projeto} />;
  return <Versoes key={faseServidor} projeto={projeto} modo="fase" fase={faseServidor} />;
}

/**
 * Saneamento de Estoques e Cadastro de Produtos: a página do projeto (aberta pelo projeto de consultoria). Primeiro nível: a fase
 * (Fase 1 · Saneamento, Fase 2 · Tributário, Fechamento), em `?fase=1|2|fechamento`; segundo nível: as abas da fase e as áreas comuns,
 * em `?aba=`. Sem fase no endereço, abre a fase em andamento (também nos endereços antigos só com `?aba=casos`, `?aba=configuracao`…, que
 * esperam a resposta das fases antes de abrir: destinoDaAba, em logica.js), sempre na primeira aba dela. `?secao=diretrizes` rola até as
 * Diretrizes da aba (botão Ver nas Diretrizes); `?regra=` abre uma regra nelas. Os dois valem só na aba em que foram pedidos.
 */
export default function SaneamentoEstoquesPagina() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // O recorte (Visão geral) e o caso a abrir (Tabela) valem só para a aba em que foram pedidos (`onde` = "fase|aba"): sair dela os tira.
  const [recorte, setRecorte] = useState(null); // { dados, onde }
  const [casoInicial, setCasoInicial] = useState(null); // { id, onde }
  const [pedido, setPedido] = useState(0);

  const diag = useQuery({ queryKey: ["projetos-diagnostico", id], queryFn: () => api.get(`/projetos-diagnostico/${id}`) });
  const consulta = useQuery({ queryKey: chaves.projeto(id), queryFn: () => san.projetoDoDiagnostico(id), retry: (n, e) => !naoEncontrado(e) && n < 2 });
  const abrir = useMutation({ mutationFn: () => san.criarProjeto(id), onSuccess: () => qc.invalidateQueries({ queryKey: chaves.projeto(id) }) });
  const projeto = consulta.data;
  // Primeira vez: o saneamento do projeto é criado ao entrar (sem a tela intermediária). Uma tentativa só; se falhar, o botão tenta de novo.
  const naoAberto = consulta.isError && naoEncontrado(consulta.error);
  const tentou = useRef(false);
  useEffect(() => { if (naoAberto && !tentou.current) { tentou.current = true; abrir.mutate(); } }, [naoAberto, abrir]);

  const fasesQ = useQuery({ queryKey: chaves.fases(projeto?.id), queryFn: () => san.fases(projeto.id), enabled: !!projeto?.id });
  const estadoQ = useQuery({ queryKey: chaves.estadoCamadas(projeto?.id), queryFn: () => san.estadoCamadas(projeto.id), enabled: !!projeto?.id });
  const fasesSabidas = !!projeto && !fasesQ.isPending;
  // GET fases falhou (e não há resposta anterior): nada de "Bloqueada" para sempre; a página diz que não conferiu e oferece tentar de novo.
  const fasesComErro = fasesQ.isError && !fasesQ.data;
  const bloqueio2 = projeto ? bloqueioDaFase("FASE2", fasesQ.data, { carregando: fasesQ.isPending }) : null;
  const liberada = (f) => !!(fasesQ.data?.fases || []).find((x) => x.fase === f)?.liberada;

  // A fase de partida é decidida uma vez (a fase em andamento; com erro nas fases, a Fase 1): importar ou liberar não troca de tela sozinho.
  const [inicio, setInicio] = useState(null);
  useEffect(() => {
    if (!projeto || inicio || !fasesSabidas) return;
    setInicio({ fase: faseInicial(fasesQ.data) });
  }, [projeto, inicio, fasesSabidas, fasesQ.data]);

  const faseDaUrl = areaDoParam(params.get("fase"));
  const abaDaUrl = params.get("aba");
  const secao = params.get("secao");
  const faseBase = faseDaUrl || inicio?.fase || faseInicial(fasesQ.data);
  const destino = destinoDaAba(abaDaUrl, { fase: faseBase });
  const fase = destino?.fase || faseBase;
  const aba = destino?.aba || abaInicialDaFase(fase);
  const onde = `${fase}|${aba}`;
  // Sem a fase no endereço (também no endereço antigo só com ?aba=), espera saber a fase em andamento: nada de abrir a 1.x e trocar para a 2.x.
  const esperandoFase = !faseDaUrl && !inicio && !fasesSabidas;
  const podeAlterar = temFuncao(user, "alterar");

  // Trocar de aba (clique, link, voltar ou avançar do navegador) tira o recorte e o caso pedidos para outra aba.
  useEffect(() => {
    setRecorte((r) => (r && r.onde !== onde ? null : r));
    setCasoInicial((c) => (c && c.onde !== onde ? null : c));
  }, [onde]);
  // ?secao=diretrizes: rola até as Diretrizes da aba (1.1 ou 2.1) e tira o pedido do endereço.
  const prontoParaRolar = !!projeto && !esperandoFase && (aba === "preparar" || aba === "premissas");
  useEffect(() => {
    if (secao !== "diretrizes" || !prontoParaRolar) return;
    rolarParaDiretrizes();
    setParams((p) => { const n = new URLSearchParams(p); n.delete("secao"); return n; }, { replace: true });
  }, [secao, prontoParaRolar, setParams]);

  /** Vai a uma fase e aba: `{ fase, aba, rolar? }` ou um id de aba (antigo ou de agora), resolvido na fase aberta. */
  const irPara = (d) => {
    const dest = typeof d === "string" ? destinoDaAba(d, { fase }) : d;
    if (!dest?.aba) return;
    setParams((p) => paramsDoDestino(p, dest, fase), { replace: false });
  };
  const mudarFase = (f) => irPara({ fase: f, aba: abaInicialDaFase(f) });
  const recarregar = () => qc.invalidateQueries({ queryKey: chaves.projeto(id) });
  const abrirCasos = (r, casoId = null) => {
    const dest = destinoDaAba("casos", { fase, camada: r?.camada || null });
    const ondeDest = `${dest.fase}|${dest.aba}`;
    setRecorte(r && Object.keys(r).length ? { dados: r, onde: ondeDest } : null);
    setCasoInicial(casoId ? { id: casoId, onde: ondeDest } : null);
    setPedido((n) => n + 1);
    irPara(dest);
  };
  // A Tabela é uma aba de cada fase (1.2 e 2.2): abre a da fase aberta (do Fechamento, a da Fase 1).
  const abrirTabela = (r) => {
    const dest = destinoDaAba("tabela", { fase });
    setRecorte(r ? { dados: r, onde: `${dest.fase}|${dest.aba}` } : null); setCasoInicial(null); setPedido((n) => n + 1); irPara(dest);
  };

  const cliente = useClienteDoProjeto(diag.data);
  const crumbs = trilhaDoProjeto({ projeto: diag.data || { id, servico_consultoria: "saneamento-estoques" }, cliente, telas: telasDoSaneamento(id, esperandoFase ? {} : { fase, aba }) });

  let corpo;
  if (naoAberto && abrir.isError) {
    corpo = <Aviso tom="erro" titulo="Não foi possível abrir o saneamento deste projeto" acao={<button type="button" className={botaoPrimario} disabled={abrir.isPending} onClick={() => abrir.mutate()}>Tentar de novo</button>}>{mensagemDeErro(abrir.error)}</Aviso>;
  } else if (naoAberto) corpo = <EstadoCarregando texto="Abrindo o saneamento: lendo as atividades do CNPJ e a data-base do projeto…" />;
  else if (consulta.isError) corpo = <EstadoErro erro={consulta.error} aoTentar={() => consulta.refetch()} texto="Não foi possível abrir o projeto de saneamento." />;
  else if (!projeto) corpo = <EstadoCarregando texto="Abrindo o projeto…" />;
  else if (esperandoFase) corpo = <EstadoCarregando texto="Abrindo a fase em andamento…" />;
  else {
    const situacoes = situacaoDasFases({ fases: fasesQ.data, estado: estadoQ.data, modulos: projeto.modulos, bloqueio2, erro: fasesComErro });
    const acao = bloqueio2 && acaoDoBloqueio(bloqueio2.codigo);
    const jaNoDestino = acao && acao.fase === fase && acao.aba === aba;
    const recorteAqui = recorte && recorte.onde === onde ? recorte.dados : null;
    const casoAqui = casoInicial && casoInicial.onde === onde ? casoInicial.id : null;
    corpo = (
      <PermissaoContext.Provider value={{ podeAlterar }}>
      <div className="space-y-4">
        {!podeAlterar && <Aviso tom="alerta">{semFuncao("alterar")} Você pode consultar, mas não gravar.</Aviso>}
        {fasesComErro && (
          <Aviso tom="alerta" titulo="Não foi possível conferir a situação das fases"
            acao={<button type="button" className={botaoSecundario} disabled={fasesQ.isFetching} onClick={() => fasesQ.refetch()}>{fasesQ.isFetching ? "Conferindo…" : "Tentar de novo"}</button>}>
            {mensagemDeErro(fasesQ.error)} Você pode consultar as abas; a liberação de cada fase aparece quando a conferência voltar.
          </Aviso>
        )}
        <SeletorDeFases atual={fase} situacoes={situacoes} aoMudar={mudarFase} />
        <div role="tabpanel" id="san-fase-painel" aria-labelledby={`san-fase-${fase}`} className="space-y-4">
          {fase === "fase2" && bloqueio2 && !fasesComErro && (
            <Aviso tom="bloqueio" titulo={bloqueio2.codigo ? "Fase 2 ainda não liberada" : undefined}
              acao={acao && !jaNoDestino ? <button type="button" className={botaoSecundario} onClick={() => irPara(acao)}>{acao.rotulo}</button> : null}>
              {bloqueio2.mensagem}{bloqueio2.codigo ? " Você pode consultar as abas da Fase 2; as análises e as decisões dela ficam desligadas até lá." : ""}
            </Aviso>
          )}
          <Abas fase={fase} atual={aba} aoMudar={(a) => irPara({ fase, aba: a })} />
          <div role="tabpanel" id="san-painel" aria-labelledby={`san-aba-${aba}`}>
            <Painel projeto={projeto} fase={fase} aba={aba} irPara={irPara} podeImportar={temFuncao(user, "importar")} recarregar={recarregar} recorte={recorteAqui} casoInicial={casoAqui}
              aoUsarCasoInicial={() => setCasoInicial(null)} aoTirarRecorte={() => setRecorte(null)} pedido={pedido}
              abrirCasos={abrirCasos} abrirTabela={abrirTabela} fasesLiberadas={liberada("FASE1") && liberada("FASE2")} bloqueio2={bloqueio2} />
          </div>
        </div>
      </div>
      </PermissaoContext.Provider>
    );
  }

  return (
    <div>
      <PageHeader crumbs={crumbs} title="Saneamento de estoques e cadastro de produtos" subtitle="Cadastro de itens, qualidade, duplicidades, NCM e tratamento tributário para IBS e CBS, com revisão por camada." actions={<RoteiroProjeto />} />
      <div className="px-6 py-5 lg:px-8">{corpo}</div>
    </div>
  );
}
