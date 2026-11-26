import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { semFuncao, temFuncao } from "@/lib/permissoes";
import PageHeader from "@/components/PageHeader";
import { san, chaves } from "@/components/saneamento-estoques/api";
import { Aviso, botaoPrimario, EstadoCarregando, EstadoErro, EstadoVazio, PermissaoContext } from "@/components/saneamento-estoques/comuns";
import Abas from "@/components/saneamento-estoques/Abas";
import Casos from "@/components/saneamento-estoques/Casos";
import Cobertura from "@/components/saneamento-estoques/Cobertura";
import Configuracao from "@/components/saneamento-estoques/Configuracao";
import Impacto from "@/components/saneamento-estoques/Impacto";
import Importacao from "@/components/saneamento-estoques/Importacao";
import TabelaUnica from "@/components/saneamento-estoques/TabelaUnica";
import Unificacoes from "@/components/saneamento-estoques/Unificacoes";
import Versoes from "@/components/saneamento-estoques/Versoes";
import VisaoGeral from "@/components/saneamento-estoques/VisaoGeral";
import { ABAS, abaInicial, mensagemDeErro, naoEncontrado } from "@/components/saneamento-estoques/logica";

function Painel({ projeto, aba, irPara, podeImportar, recarregar, recorte, casoInicial, abrirCasos, abrirTabela }) {
  const configuracao = () => irPara("configuracao");
  if (aba === "configuracao") return <Configuracao projeto={projeto} recarregar={recarregar} />;
  if (aba === "importacao") return <Importacao projeto={projeto} podeImportar={podeImportar} aoIrParaConfiguracao={configuracao} />;
  if (aba === "tabela") return <TabelaUnica key={JSON.stringify(recorte || {})} projeto={projeto} recorte={recorte} aoAbrirCaso={(id) => abrirCasos({}, id)} aoIrParaConfiguracao={configuracao} />;
  if (aba === "visao") return <VisaoGeral projeto={projeto} aoAbrirCasos={abrirCasos} aoAbrirTabela={abrirTabela} />;
  if (aba === "casos") return <Casos key={`${recorte?.camada}|${recorte?.grupo}|${casoInicial}`} projeto={projeto} recorte={recorte} casoInicial={casoInicial} />;
  if (aba === "impacto") return <Impacto projeto={projeto} />;
  if (aba === "unificacoes") return <Unificacoes projeto={projeto} />;
  return <Versoes projeto={projeto} />;
}

/** Saneamento de Estoques e Cadastro de Produtos: a página do projeto (aberta pelo projeto de consultoria). */
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
  // A aba de partida é decidida uma vez: confirmar ou reabrir as atividades não troca de aba sozinho.
  const [padrao, setPadrao] = useState(null);
  useEffect(() => { if (projeto && !padrao) setPadrao(abaInicial(null, projeto)); }, [projeto, padrao]);
  const aba = ABAS.some((a) => a.id === params.get("aba")) ? params.get("aba") : padrao || abaInicial(null, projeto);
  const podeAlterar = temFuncao(user, "alterar");

  const irPara = (a) => setParams((p) => { const n = new URLSearchParams(p); n.set("aba", a); return n; }, { replace: false });
  const recarregar = () => qc.invalidateQueries({ queryKey: chaves.projeto(id) });
  const abrirCasos = (r, casoId = null) => { setRecorte(r && Object.keys(r).length ? r : null); setCasoInicial(casoId); irPara("casos"); };
  const abrirTabela = (r) => { setRecorte(r); irPara("tabela"); };

  const nome = diag.data?.nome || "Projeto";
  const crumbs = [{ label: "Consultoria Tributária", to: "/consultoria/carteira" }, { label: "Projetos", to: "/consultoria/projetos" }, { label: nome, to: `/diagnostico/projetos/${id}` }, { label: "Saneamento de estoques" }];

  let corpo;
  if (consulta.isError && naoEncontrado(consulta.error)) {
    corpo = (
      <EstadoVazio titulo="Este projeto ainda não foi aberto no Saneamento de estoques">
        <p className="mb-3">Ao abrir, as atividades do cliente são lidas do CNPJ e a data-base vem do projeto de consultoria.</p>
        <button type="button" className={botaoPrimario} disabled={abrir.isPending} onClick={() => abrir.mutate()}>{abrir.isPending ? "Abrindo…" : "Abrir o saneamento deste projeto"}</button>
        {abrir.isError && <div className="mt-3 text-left"><Aviso tom="erro">{mensagemDeErro(abrir.error)}</Aviso></div>}
      </EstadoVazio>
    );
  } else if (consulta.isError) corpo = <EstadoErro erro={consulta.error} aoTentar={() => consulta.refetch()} texto="Não foi possível abrir o projeto de saneamento." />;
  else if (!projeto) corpo = <EstadoCarregando texto="Abrindo o projeto…" />;
  else {
    corpo = (
      <PermissaoContext.Provider value={{ podeAlterar }}>
      <div className="space-y-4">
        {!podeAlterar && <Aviso tom="alerta">{semFuncao("alterar")} Você pode consultar, mas não gravar.</Aviso>}
        <Cobertura projeto={projeto} />
        <Abas atual={aba} aoMudar={(a) => { if (a !== "casos" && a !== "tabela") { setRecorte(null); setCasoInicial(null); } irPara(a); }} />
        <div role="tabpanel" id="san-painel" aria-labelledby={`san-aba-${aba}`}>
          <Painel projeto={projeto} aba={aba} irPara={irPara} podeImportar={temFuncao(user, "importar")} recarregar={recarregar} recorte={recorte} casoInicial={casoInicial} abrirCasos={abrirCasos} abrirTabela={abrirTabela} />
        </div>
      </div>
      </PermissaoContext.Provider>
    );
  }

  return (
    <div>
      <PageHeader crumbs={crumbs} title="Saneamento de estoques e cadastro de produtos" subtitle="Cadastro de itens, qualidade, duplicidades, NCM e tratamento tributário para IBS e CBS, com revisão por camada." />
      <div className="px-6 py-5 lg:px-8">{corpo}</div>
    </div>
  );
}
