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
import DadosDoProjeto from "@/components/consultoria/DadosDoProjeto";
import Versoes from "@/components/saneamento-estoques/Versoes";
import VisaoGeral from "@/components/saneamento-estoques/VisaoGeral";
import {
  abaInicialDaFase, acaoDoBloqueio, areaDoParam, areaPorId, ASPECTOS_DA_FASE, camadasDaFase, destinoDaAba, faseInicial, itensDaVisao, mensagemDeErro, naoEncontrado,
  paramDaArea, situacaoDasFases,
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
/** Leva a tela até as Diretrizes, que ficam embaixo, na mesma aba (botão "Ir para Diretrizes" do resultado da importação). */
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
function Painel({ projeto, fase, aba, irPara, podeImportar, recarregar, recorte, casoInicial, abrirCasos, abrirTabela, fasesLiberadas }) {
  if (aba === "tabela") return <TabelaUnica key={JSON.stringify(recorte || {})} projeto={projeto} recorte={recorte} aoAbrirCaso={(id) => abrirCasos({}, id)} />;
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
  if (aba === "casos") return <Casos key={`${fase}|${recorte?.camada}|${recorte?.grupo}|${casoInicial}`} projeto={projeto} recorte={recorte} casoInicial={casoInicial} camadasPermitidas={camadas} />;
  if (aba === "unificacoes") return <Unificacoes projeto={projeto} />;
  return <Versoes key={faseServidor} projeto={projeto} modo="fase" fase={faseServidor} />;
}

/**
 * Saneamento de Estoques e Cadastro de Produtos: a página do projeto (aberta pelo projeto de consultoria). Primeiro nível: a fase
 * (Fase 1 · Saneamento, Fase 2 · Tributário, Fechamento), em `?fase=1|2|fechamento`; segundo nível: as abas da fase e as áreas comuns,
 * em `?aba=`. Sem fase no endereço, abre a fase em andamento; endereços antigos (`?aba=casos`, `?aba=configuracao`…) seguem valendo
 * (destinoDaAba, em logica.js).
 */
export default function SaneamentoEstoquesPagina() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [recorte, setRecorte] = useState(null);
  const [casoInicial, setCasoInicial] = useState(null);

  const diag = useQuery({ queryKey: ["projetos-diagnostico", id], queryFn: () => api.get(`/projetos-diagnostico/${id}`) });
  const consulta = useQuery({ queryKey: chaves.projeto(id), queryFn: () => san.projetoDoDiagnostico(id), retry: (n, e) => !naoEncontrado(e) && n < 2 });
  const abrir = useMutation({ mutationFn: () => san.criarProjeto(id), onSuccess: () => qc.invalidateQueries({ queryKey: chaves.projeto(id) }) });
  const projeto = consulta.data;
  // Primeira vez: o saneamento do projeto é criado ao entrar (sem a tela intermediária). Uma tentativa só; se falhar, o botão tenta de novo.
  const naoAberto = consulta.isError && naoEncontrado(consulta.error);
  const tentou = useRef(false);
  useEffect(() => { if (naoAberto && !tentou.current) { tentou.current = true; abrir.mutate(); } }, [naoAberto, abrir]);

  const visao = useQuery({ queryKey: chaves.visao(projeto?.id), queryFn: () => san.visaoGeral(projeto.id), enabled: !!projeto?.id });
  const fasesQ = useQuery({ queryKey: chaves.fases(projeto?.id), queryFn: () => san.fases(projeto.id), enabled: !!projeto?.id });
  const estadoQ = useQuery({ queryKey: chaves.estadoCamadas(projeto?.id), queryFn: () => san.estadoCamadas(projeto.id), enabled: !!projeto?.id });
  const itensConhecidos = projeto?.totalItens != null ? Number(projeto.totalItens) : visao.isError ? null : visao.data !== undefined ? itensDaVisao(visao.data) : undefined;
  const fasesSabidas = !!projeto && !fasesQ.isPending;
  const bloqueio2 = projeto ? bloqueioDaFase("FASE2", fasesQ.data, { carregando: fasesQ.isPending }) : null;
  const liberada = (f) => !!(fasesQ.data?.fases || []).find((x) => x.fase === f)?.liberada;

  // A fase e a aba de partida são decididas uma vez (a fase em andamento): importar ou liberar não troca de tela sozinho.
  const [inicio, setInicio] = useState(null);
  useEffect(() => {
    if (!projeto || inicio || !fasesSabidas || itensConhecidos === undefined) return;
    const f = faseInicial(fasesQ.data);
    setInicio({ fase: f, aba: abaInicialDaFase(f, { itens: itensConhecidos, bloqueio: bloqueio2 }) });
  }, [projeto, inicio, fasesSabidas, itensConhecidos, fasesQ.data, bloqueio2]);

  const faseDaUrl = areaDoParam(params.get("fase"));
  const abaDaUrl = params.get("aba");
  const faseBase = faseDaUrl || inicio?.fase || faseInicial(fasesQ.data);
  const destino = destinoDaAba(abaDaUrl, { fase: faseBase });
  const fase = destino?.fase || faseBase;
  const abaPadrao = (f) => (inicio && inicio.fase === f && !faseDaUrl ? inicio.aba : abaInicialDaFase(f, { itens: itensConhecidos ?? null, bloqueio: bloqueio2 }));
  const aba = destino?.aba || abaPadrao(fase);
  const esperandoFase = !faseDaUrl && !abaDaUrl && !inicio && !fasesSabidas;
  const podeAlterar = temFuncao(user, "alterar");

  /** Vai a uma fase e aba: `{ fase, aba }` ou um id de aba (antigo ou de agora), resolvido na fase aberta. */
  const irPara = (d) => {
    const dest = typeof d === "string" ? destinoDaAba(d, { fase }) : d;
    if (!dest?.aba) return;
    setParams((p) => { const n = new URLSearchParams(p); n.set("fase", paramDaArea(dest.fase || fase)); n.set("aba", dest.aba); return n; }, { replace: false });
  };
  const limparRecorte = () => { setRecorte(null); setCasoInicial(null); };
  const mudarFase = (f) => { limparRecorte(); irPara({ fase: f, aba: abaInicialDaFase(f, { itens: itensConhecidos ?? null, bloqueio: bloqueio2 }) }); };
  const recarregar = () => qc.invalidateQueries({ queryKey: chaves.projeto(id) });
  const abrirCasos = (r, casoId = null) => {
    setRecorte(r && Object.keys(r).length ? r : null); setCasoInicial(casoId);
    irPara(destinoDaAba("casos", { fase, camada: r?.camada || null }));
  };
  const abrirTabela = (r) => { setRecorte(r); irPara({ fase, aba: "tabela" }); };

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
    const situacoes = situacaoDasFases({ fases: fasesQ.data, estado: estadoQ.data, modulos: projeto.modulos, bloqueio2 });
    const acao = bloqueio2 && acaoDoBloqueio(bloqueio2.codigo);
    const jaNoDestino = acao && acao.fase === fase && acao.aba === aba;
    corpo = (
      <PermissaoContext.Provider value={{ podeAlterar }}>
      <div className="space-y-4">
        {!podeAlterar && <Aviso tom="alerta">{semFuncao("alterar")} Você pode consultar, mas não gravar.</Aviso>}
        <SeletorDeFases atual={fase} situacoes={situacoes} aoMudar={mudarFase} />
        <div role="tabpanel" id="san-fase-painel" aria-labelledby={`san-fase-${fase}`} className="space-y-4">
          {fase === "fase2" && bloqueio2 && (
            <Aviso tom="bloqueio" titulo={bloqueio2.codigo ? "Fase 2 ainda não liberada" : undefined}
              acao={acao && !jaNoDestino ? <button type="button" className={botaoSecundario} onClick={() => irPara(acao)}>{acao.rotulo}</button> : null}>
              {bloqueio2.mensagem}{bloqueio2.codigo ? " Você pode consultar as abas da Fase 2; as análises dela ficam desligadas até lá." : ""}
            </Aviso>
          )}
          <Abas fase={fase} atual={aba} aoMudar={(a) => { if (a !== "casos" && a !== "tabela") limparRecorte(); irPara({ fase, aba: a }); }} />
          <div role="tabpanel" id="san-painel" aria-labelledby={`san-aba-${aba}`}>
            <Painel projeto={projeto} fase={fase} aba={aba} irPara={irPara} podeImportar={temFuncao(user, "importar")} recarregar={recarregar} recorte={recorte} casoInicial={casoInicial}
              abrirCasos={abrirCasos} abrirTabela={abrirTabela} fasesLiberadas={liberada("FASE1") && liberada("FASE2")} />
          </div>
        </div>
      </div>
      </PermissaoContext.Provider>
    );
  }

  return (
    <div>
      {/* O projeto abre direto aqui (sem a página do projeto): os dados dele (situação, data-base, documentos, exclusão) ficam no cabeçalho. */}
      <PageHeader crumbs={crumbs} title="Saneamento de estoques e cadastro de produtos" subtitle="Cadastro de itens, qualidade, duplicidades, NCM e tratamento tributário para IBS e CBS, com revisão por camada."
        actions={<div className="flex flex-wrap items-center gap-2"><DadosDoProjeto projeto={diag.data} cliente={cliente} /><RoteiroProjeto /></div>} />
      <div className="px-6 py-5 lg:px-8">{corpo}</div>
    </div>
  );
}
