import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, ArrowLeft, Check, Lock, Download } from "lucide-react";
import { api } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import ValidadorCadastro from "@/components/ferramentas/ValidadorCadastro";
import ComparativoDuplicidade from "@/components/ferramentas/ComparativoDuplicidade";
import { CRITERIOS, REGRAS_PADRAO, ROTULO_REGRAS, abreviacoesAprovadas, agruparPorGrupo, aplicarEscopo, criarTestes, dataDoCorte, decisoesDoTrabalho, descobrirAbreviacoes, hojeIso, normalizarParams } from "./logica";
import { achadosDe, calcularAchados, contarAchados, criteriosAprovados, situacaoCriterio } from "./analise";
import { AbasCriterios, AcaoAprovacao, SelosCriterio } from "./CriterioUi";
import PassoAnalises from "./PassoAnalises";
import PassoExecucao from "./PassoExecucao";
import { gerarTarefas, resumoExecucao } from "./execucao";
import { gerarListaCliente, gerarXlsx, linhasQueSaem, montarListas } from "./listasFinais";
import PassoFiscal from "./PassoFiscal";
import PassoPolitica from "./PassoPolitica";
import { montarPolitica } from "./politica";
import { montarRelatorioFinal } from "./relatorioFinal";
import { gerarPdfRelatorio } from "./relatorioPdf";
import { aplicarRespostas, lerRespostaCliente, linhasListaCliente } from "./respostaCliente";
import { GRANDEZAS, fatorDaDecisao, lerFator, numeroBr, precisaFator, resumoUnidades } from "./unidades";
import { Acc, Botao, Chip, Th, dataBr, fmt, ordenarPor, plural, useOrdenacao } from "./ui";
import RelacaoTriagem from "./RelacaoTriagem";
import GruposDoSaneamento from "./GruposDoSaneamento";
import { criarSituacao } from "./relacoes";
import { detectarEscalaSaldo } from "./conjuntos";
import { useConfirmar } from "@/components/ConfirmProvider";

const PASSOS = [
  { t: "Triagem", programa: "Fixar a origem e o universo; escolher os grupos que entram no saneamento; definir o parâmetro de saneamento (itens não movimentados desde a data escolhida ficam fora do trabalho; os sem data seguem a regra escolhida); mapear campos e grupos.", avancar: "Universo conferido, parâmetro de saneamento definido e limitações conhecidas." },
  { t: "Critérios", programa: "Cada problema de cadastro tem sua regra, exemplo e aprovação. Critério sem achados na base abre aprovado (com a opção de revisar manualmente); os demais só são tratados depois de aprovados.", avancar: "Critérios aplicáveis aprovados e exceções identificadas." },
  { t: "Piloto SAP", programa: "Comprovar no ambiente do cliente os quatro casos: unificar, separar, preservar referências e descontinuar com dependências.", avancar: "Procedimento evidenciado e aceito pelo cliente e seu suporte SAP." },
  { t: "Análises", programa: "Uma aba por critério, as mesmas do passo Critérios: em cada uma o analista vê os achados em todos os grupos, vê como é hoje e como seria, e decide se encaminha cada um para aprovação no De/para (ou deixa como está) e marca o grupo como tratado. O grupo fica saneado quando todos os critérios aprovados foram tratados nele.", avancar: "Grupo com todos os critérios tratados e, nele, o que deve mudar encaminhado ao De/para." },
  { t: "De/para", programa: "Recebe o que foi encaminhado nas Análises. Cada caso é aprovado ou rejeitado, com aprovador e data, e só o aprovado entra nas listas finais e na execução. Ausência de resposta não é aprovação.", avancar: "Decisão expressa por caso (ou em bloco, se optar), com aprovador e data." },
  { t: "Execução", programa: "Decisões aprovadas viram tarefas para o administrativo e o almoxarifado; só conta como feito quando as duas pontas confirmam.", avancar: "Confirmação das frentes aplicáveis, com evidências e divergências." },
  { t: "Conferência", programa: "Emitir as listas finais (lista final corrigida, desduplicações, análises, itens inativados por data de uso e execução) e conciliar o executado com as evidências; casos sem prova permanecem pendentes.", avancar: "Listas emitidas e resultados conciliados." },
  { t: "Fiscal", programa: "Cada grupo saneado é liberado para a revisão fiscal: o analista confere o NCM e o cClassTrib (com o CST e a redução) de cada item contra os anexos da LC 214/2025 consultados e decide o que fica; o que parece serviço segue por NBS e LC 116. O CST e o cClassTrib de cada operação seguem na validação das operações.", avancar: "Matriz do grupo com proposta, fundamento, validação e pendências." },
  { t: "Política", programa: "Procedimentos para criar, comprar, usar, padronizar e descontinuar itens, a partir dos critérios aprovados e das causas encontradas. A política é uma proposta gerada do projeto: o responsável a revisa, define o responsável e o controle de cada procedimento e aprova. Sai em Excel, em JSON estruturado para o cadastro automático do cliente e no relatório do programa de trabalho em PDF.", avancar: "Política aprovada, com responsáveis e controles registrados." },
];
const CASOS_PILOTO = ["Unificar duplicados", "Separar cadastro que mistura produtos", "Preservar referências após renumeração de catálogo", "Descontinuar código com dependências (cartilhas)"];
const STATUS_PILOTO = ["Não iniciado", "Em teste", "Testado", "Reprovado"];

const estadoInicial = () => ({ passo: 0, params: { desde: "" }, criterios: {}, tratados: {}, saneados: {}, decisoes: {}, piloto: {}, bloco: false, padronizacao: { regras: { ...REGRAS_PADRAO }, abreviacoes: {} }, politicaUnidade: { ativa: true, regras: {} }, execucao: { tipos: {}, registros: {} }, gruposFora: {}, fiscal: { decisoes: {}, grupos: {} }, politica: { secoes: {}, grupos: {}, aprovada: null } });

export default function ProjetoSaneamento({ empresa, empresaId, projetoId, onVoltar }) {
  const confirmar = useConfirmar();
  const { user } = useAuth();
  const quem = user?.email || "usuário";
  const [estado, setEstado] = useState(null);
  const [nome, setNome] = useState("");
  const [validacaoId, setValidacaoId] = useState(null);
  const [aberto, setAberto] = useState({});
  const [critAtivo, setCritAtivo] = useState(CRITERIOS[0].id);
  const [comparativo, setComparativo] = useState(null);
  const [salvo, setSalvo] = useState(null);
  const [programaAberto, setProgramaAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [msgResposta, setMsgResposta] = useState("");
  const [gerando, setGerando] = useState(false);
  const [relacao, setRelacao] = useState(null); // cartão da triagem cuja relação de itens está aberta
  const [ordAbrev, ordenarAbrev] = useOrdenacao(); const [ordUn, ordenarUn] = useOrdenacao(); const [ordDec, ordenarDec] = useOrdenacao(); // ordem das tabelas dos passos Critérios e De/para
  const carregado = useRef(false);
  const alternar = (k) => setAberto((a) => ({ ...a, [k]: !a[k] }));

  const proj = useQuery({ queryKey: ["saneamento", projetoId], queryFn: () => api.get(`/produtos/saneamentos/${projetoId}?empresa_id=${empresaId}`) });
  useEffect(() => {
    if (!proj.data || carregado.current) return;
    carregado.current = true;
    setNome(proj.data.nome); setValidacaoId(proj.data.validacao_id || null);
    setEstado({ ...estadoInicial(), ...(proj.data.estado || {}) });
  }, [proj.data]);

  // Autosave: cada ajuste é salvo sozinho.
  useEffect(() => {
    if (!carregado.current || !estado) return;
    const t = setTimeout(() => {
      api.put(`/produtos/saneamentos/${projetoId}`, { estado, validacao_id: validacaoId, empresa_id: empresaId }).then(() => setSalvo(new Date())).catch(() => setSalvo(null));
    }, 800);
    return () => clearTimeout(t);
  }, [estado, validacaoId, projetoId, empresaId]);

  useEffect(() => {
    if (!importando) return undefined;
    const aviso = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [importando]);
  const basesSalvas = useQuery({ queryKey: ["saneamento-bases", empresaId], enabled: !validacaoId, queryFn: () => api.get(`/produtos/validacoes?empresa_id=${empresaId}`) });
  const base = useQuery({ queryKey: ["saneamento-base", validacaoId], enabled: !!validacaoId, queryFn: () => api.get(`/produtos/validacoes/${validacaoId}?empresa_id=${empresaId}`), staleTime: 5 * 60 * 1000 });
  const itens = useMemo(() => base.data?.itens || [], [base.data]);
  const escopo = useMemo(() => aplicarEscopo(itens, estado?.params, estado?.gruposFora), [itens, estado?.params, estado?.gruposFora]);
  const grupos = useMemo(() => agruparPorGrupo(escopo.emEscopo), [escopo]);
  const gruposTodos = useMemo(() => agruparPorGrupo(itens), [itens]); // todos os grupos da base, para escolher quais entram no saneamento
  const emEscopoPorGrupo = useMemo(() => new Map(grupos.map((g) => [g.nome, g.itens.length])), [grupos]);
  const situacaoItem = useMemo(() => criarSituacao(escopo, dataDoCorte(estado?.params)), [escopo, estado?.params]);
  const decisoesTrabalho = useMemo(() => decisoesDoTrabalho(estado?.decisoes, escopo), [estado?.decisoes, escopo]); // sem as de grupos fora do saneamento
  const testes = useMemo(() => criarTestes(escopo.emEscopo, estado || {}), [escopo, estado?.padronizacao, estado?.politicaUnidade]);
  const achados = useMemo(() => (validacaoId ? calcularAchados(escopo.emEscopo, testes) : {}), [validacaoId, escopo, testes]);
  const contagem = useMemo(() => (validacaoId ? contarAchados(achados, escopo.emEscopo.length) : null), [validacaoId, achados, escopo]);
  const execGerada = useMemo(() => (validacaoId ? gerarTarefas({ decisoes: decisoesTrabalho, tipos: estado?.execucao?.tipos, itens, escopo, params: estado?.params }) : { tarefas: [], geradasPorTipo: {} }), [validacaoId, decisoesTrabalho, estado?.execucao?.tipos, estado?.params, itens, escopo]);
  const resumoEx = useMemo(() => resumoExecucao(execGerada.tarefas, estado?.execucao?.registros), [execGerada, estado?.execucao?.registros]);
  const mapaLinha = useMemo(() => new Map(itens.map((i) => [i.linha, i])), [itens]);
  const temSaldo = useMemo(() => itens.some((i) => i.saldo != null), [itens]);
  const temAnalise = useMemo(() => itens.some((i) => i.sugestao), [itens]); // a base foi processada com a análise de cClassTrib
  const saem = useMemo(() => linhasQueSaem(estado, itens), [estado?.decisoes, itens]); // itens unificados em outro código: fora da revisão fiscal
  const escalaSaldo = useMemo(() => estado?.saldoEscala ?? detectarEscalaSaldo(itens), [estado?.saldoEscala, itens]); // a escolha do analista vale mais que a escala detectada
  const abrevCand = useMemo(() => (estado?.passo === 1 && validacaoId ? descobrirAbreviacoes(escopo.emEscopo) : []), [estado?.passo, validacaoId, escopo]);
  const resumoUn = useMemo(() => (estado?.passo === 1 && critAtivo === "unidade" && validacaoId ? resumoUnidades(escopo.emEscopo, { regras: estado?.politicaUnidade?.regras, rotulos: estado?.politicaUnidade?.rotulos }) : null), [estado?.passo, critAtivo, validacaoId, escopo, estado?.politicaUnidade?.regras, estado?.politicaUnidade?.rotulos]);
  const listas = useMemo(() => (estado?.passo === 6 && validacaoId && base.data ? montarListas({ nomeProjeto: nome, nomeBase: base.data.nome_arquivo, estado, itens, escopo, testes, escalaSaldo }) : null), [estado, validacaoId, base.data, itens, escopo, testes, nome, escalaSaldo]);

  if (proj.isLoading || !estado) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o projeto…</p>;
  if (proj.error) return <p role="alert" className="text-sm text-destructive">Não foi possível abrir o projeto: {proj.error.message}</p>;

  const mudar = (patch) => setEstado((e) => ({ ...e, ...patch }));
  // Grupos do saneamento (funcionais, como as demais escolhas): `gruposFora` guarda só os desmarcados.
  const alternarGrupo = (nome) => setEstado((e) => { const fora = { ...(e.gruposFora || {}) }; if (fora[nome]) delete fora[nome]; else fora[nome] = true; return { ...e, gruposFora: fora }; });
  const marcarGrupos = (nomes, marcar) => setEstado((e) => { const fora = { ...(e.gruposFora || {}) }; for (const n of nomes) { if (marcar) delete fora[n]; else fora[n] = true; } return { ...e, gruposFora: fora }; });
  const passo = estado.passo;
  const irPara = (i) => mudar({ passo: Math.max(0, Math.min(PASSOS.length - 1, i)) });
  const params = normalizarParams(estado.params); // aceita projetos salvos com os dois cortes antigos
  const decisoesLista = Object.entries(decisoesTrabalho).map(([k, d]) => ({ k, ...d }));
  const nDecOcultas = Object.keys(estado.decisoes).length - Object.keys(decisoesTrabalho).length; // de grupos fora do saneamento
  const itemPorLinha = (linha) => mapaLinha.get(linha);
  const regrasPad = { ...REGRAS_PADRAO, ...(estado.padronizacao?.regras || {}) };
  const abrevPad = estado.padronizacao?.abreviacoes || {};
  const slug = (nome || "projeto").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // ── Passo 1: Triagem ──
  const importador = !validacaoId ? (
    <div className={passo === 0 ? "space-y-3" : "hidden"}>
      <div className="rounded-lg border border-dashed border-border p-4 text-sm">
        <p className="font-medium">Importe a base de itens</p>
        <p className="text-muted-foreground mt-1">Envie a exportação do ERP e confirme as colunas. Mapeie a <b>data da última movimentação</b> (não a de atualização do cadastro) e o <b>grupo de produto</b>: o parâmetro de saneamento e a análise por grupo dependem deles. Ao processar, a base fica vinculada a este projeto.</p>
        {(basesSalvas.data || []).length > 0 && (
          <label className="block mt-3 text-sm">Ou use uma base já processada nesta empresa (sem filtro de período)
            <select className="mt-1 w-full border rounded-md p-2 bg-background" defaultValue="" onChange={(e) => e.target.value && setValidacaoId(e.target.value)}>
              <option value="">Escolha uma base…</option>
              {basesSalvas.data.filter((v) => v.status === "PROCESSADA" && !v.parametros?.dataInicio && !v.parametros?.dataFim).map((v) => <option key={v.id} value={v.id}>{v.nome_arquivo} · {fmt(v.total)} itens · {new Date(v.updatedAt).toLocaleDateString("pt-BR")}</option>)}
            </select>
          </label>)}
      </div>
      <ValidadorCadastro modo="interno" empresa={empresa} modoProjeto aoCarregar={setImportando} aoProcessar={(r) => setValidacaoId(r.validacao_id)} />
    </div>
  ) : null;
  const triagem = !validacaoId ? null : base.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando a base…</p> : base.error ? (
    <div role="alert" className="rounded-lg border border-border p-4 space-y-2 text-sm">
      <p className="text-destructive">{/não encontrad/i.test(base.error.message) ? "A base deste projeto não existe mais (foi excluída)." : `Não foi possível abrir a base: ${base.error.message}`}</p>
      <p className="text-muted-foreground">Os critérios e as decisões do projeto continuam salvos. Importe a planilha de novo ou escolha outra base já processada.</p>
      <Botao onClick={() => setValidacaoId(null)}>Importar ou escolher outra base</Botao>
    </div>) : (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-primary/40 bg-card p-4 space-y-3">
        <h3 className="font-medium">Parâmetro de saneamento</h3>
        <p className="text-xs text-muted-foreground">Define quem entra no trabalho: o item cuja última movimentação é anterior à data escolhida fica fora do escopo; o movimentado nela ou depois continua. O que fazer com o item sem data de movimentação legível você escolhe abaixo.</p>
        <label className="flex flex-wrap items-center gap-2 text-sm">Desconsiderar itens não movimentados desde
          <input type="date" value={params.desde} onChange={(e) => mudar({ params: { desde: e.target.value, semData: e.target.value ? params.semData : "manter" } })} className="border rounded p-1.5 bg-background" aria-label="Desconsiderar itens não movimentados desde" />
          {params.desde && <button type="button" onClick={() => mudar({ params: { desde: "", semData: "manter" } })} className="text-xs text-primary underline">Sem corte</button>}</label>
        {escopo.resumo.semData > 0 && (() => { const temDatas = itens.some((i) => i.ultima_mov); return (
          <fieldset className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-sm">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Itens sem data de movimentação legível ({fmt(escopo.resumo.semData)})</legend>
            <label className="flex items-start gap-2"><input type="radio" name="semData" className="mt-1" checked={params.semData !== "anterior"} onChange={() => mudar({ params: { ...params, semData: "manter" } })} />
              <span>Manter no escopo, sinalizados<span className="block text-xs text-muted-foreground">O campo em branco não esconde produto ativo; o critério Utilização aponta os itens para tratar.</span></span></label>
            <label className="flex items-start gap-2"><input type="radio" name="semData" className="mt-1" checked={params.semData === "anterior"} disabled={!params.desde || !temDatas} onChange={() => mudar({ params: { ...params, semData: "anterior" } })} />
              <span>Tratar como anteriores à data informada<span className="block text-xs text-muted-foreground">{!temDatas ? "Nenhuma data de movimentação foi lida: mapeie a coluna de data para usar esta opção." : !params.desde ? "Informe a data de corte para usar esta opção." : `Saem do escopo junto com os não movimentados desde ${dataBr(params.desde)} e entram na lista de inativados por data de uso.`}</span></span></label>
            {escopo.resumo.semDataIgnorada && <p className="text-xs text-amber-700 dark:text-amber-300">Nenhuma data de movimentação foi lida nesta base: a opção de tratar como anteriores foi ignorada.</p>}
          </fieldset>); })()}
        {itens.length > 0 && !itens.some((i) => i.ultima_mov) && <p className="text-xs text-amber-700 dark:text-amber-300">Nenhuma data de movimentação foi lida. Mapeie a coluna de data na importação (use “Ajustar e refazer”) para o corte funcionar.</p>}
      </div>
      <div className={`grid grid-cols-2 ${escopo.resumo.foraGrupos > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-2`}>
        {[["universo", "Universo", escopo.resumo.total], ...(escopo.resumo.foraGrupos > 0 ? [["foraGrupos", "Fora dos grupos marcados", escopo.resumo.foraGrupos]] : []), ["fora", "Fora do escopo", escopo.resumo.fora], ["emEscopo", "Em escopo", escopo.resumo.emEscopo], ["semData", "Sem data legível", escopo.resumo.semData]].map(([id, l, v]) => (
          <button key={id} type="button" aria-pressed={relacao === id} onClick={() => setRelacao(relacao === id ? null : id)} title="Ver a relação de itens e emitir o Excel" className={`rounded-lg bg-muted/60 hover:bg-muted p-3 text-left ${relacao === id ? "ring-2 ring-primary" : ""}`}>
            <p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-medium tabular-nums">{fmt(v)}</p><p className="text-[11px] text-primary">{relacao === id ? "Ocultar relação" : "Ver relação e Excel"}</p></button>))}
      </div>
      {relacao && (relacao !== "foraGrupos" || escopo.resumo.foraGrupos > 0) && <RelacaoTriagem key={relacao} id={relacao} itens={itens} escopo={escopo} corte={dataDoCorte(estado.params)} semDataFora={escopo.resumo.semDataFora > 0} nomeProjeto={nome} nomeBase={base.data?.nome_arquivo} slug={slug} />}
      <GruposDoSaneamento grupos={gruposTodos} emEscopoPorGrupo={emEscopoPorGrupo} gruposFora={estado.gruposFora || {}} situacao={situacaoItem} onAlternar={alternarGrupo} onMarcar={marcarGrupos} />
      <Botao onClick={async () => { if (await confirmar({ titulo: "Trocar a base?", descricao: "A base vinculada sai do projeto (o arquivo continua guardado no histórico). Os critérios aprovados são mantidos, mas as decisões por item podem deixar de corresponder à nova base.", rotulo: "Trocar a base" })) setValidacaoId(null); }}>Trocar a base</Botao>
    </div>
  );

  // ── Passo 2: Critérios ──
  const crit = CRITERIOS.find((c) => c.id === critAtivo);
  const cEst = estado.criterios[crit.id] || {};
  // Alterações no critério (aprovação, regra): funcionais, para duas ações seguidas não se sobrescreverem.
  const alterarCriterio = (id, patch) => setEstado((e) => ({ ...e, criterios: { ...e.criterios, [id]: { ...(e.criterios[id] || {}), ...patch } } }));
  const aprovarCriterio = (c) => alterarCriterio(c.id, { aprovado: true, por: quem, em: hojeIso(), regra: estado.criterios[c.id]?.regra ?? c.regra });
  const reabrirCriterio = (c) => alterarCriterio(c.id, { aprovado: false }); // revisão manual
  const setCrit = (patch) => alterarCriterio(crit.id, patch);
  // Mudar o que alimenta o teste (regras de padronização, política de unidades) desfaz a aprovação: se o teste continuar sem achados, o critério volta a abrir aprovado.
  const semAprovacao = (criterios, id) => { const { aprovado: _a, por: _p, em: _e, ...resto } = criterios[id] || {}; return { ...criterios, [id]: resto }; };
  const mudarPad = (patch) => mudar({ padronizacao: { regras: regrasPad, abreviacoes: abrevPad, ...patch }, criterios: semAprovacao(estado.criterios, "padrao") });
  const painelPadrao = crit.id === "padrao" ? (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <p className="text-sm font-medium">Regras de padronização</p>
      <div className="space-y-1">{Object.entries(ROTULO_REGRAS).map(([k, rot]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!regrasPad[k]} onChange={(e) => mudarPad({ regras: { ...regrasPad, [k]: e.target.checked } })} /> {rot}</label>)}</div>
      <p className="text-sm font-medium">Abreviações encontradas na base</p>
      <p className="text-xs text-muted-foreground">Só valem as que você aprovar. A palavra completa pode ser editada. O sistema nunca troca nada sozinho: as trocas viram sugestões para aprovação.</p>
      {abrevCand.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma abreviação frequente identificada.</p> : (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><Th chave="abrev" ord={ordAbrev} onOrdenar={ordenarAbrev}>Abreviação</Th><Th chave="palavra" ord={ordAbrev} onOrdenar={ordenarAbrev}>Palavra completa</Th><Th chave="usos" ord={ordAbrev} onOrdenar={ordenarAbrev}>Usos (abrev. / completa)</Th><Th chave="aprovar" ord={ordAbrev} onOrdenar={ordenarAbrev}>Aprovar</Th></tr></thead>
            <tbody>{ordenarPor(abrevCand.slice(0, 60), ordAbrev, { abrev: (a) => a.de, palavra: (a) => a.para, usos: (a) => a.nDe, aprovar: (a) => (abrevPad[a.de.toLowerCase()]?.aprovada ? 1 : 0) }).map((a) => { const k = a.de.toLowerCase(); const cur = abrevPad[k]; const para = (cur?.para ?? a.para).toUpperCase();
              return (<tr key={k} className="border-t border-border"><td className="p-1.5 font-mono">{a.de}</td>
                <td className="p-1.5"><input value={para} onChange={(e) => mudarPad({ abreviacoes: { ...abrevPad, [k]: { para: e.target.value.toUpperCase(), aprovada: !!cur?.aprovada } } })} className="border rounded px-1.5 py-0.5 w-40 bg-background font-mono" aria-label={`Palavra completa para ${a.de}`} /></td>
                <td className="p-1.5 tabular-nums">{fmt(a.nDe)} / {fmt(a.nPara)}</td>
                <td className="p-1.5"><input type="checkbox" aria-label={`Aprovar ${a.de} → ${para}`} checked={!!cur?.aprovada} onChange={(e) => mudarPad({ abreviacoes: { ...abrevPad, [k]: { para, aprovada: e.target.checked } } })} /></td></tr>); })}</tbody></table>
        </div>)}
    </div>) : null;
  // Critério "Unidade de medida": liga/desliga a política da menor unidade e deixa o analista classificar as unidades que a tabela não conhece.
  const polUn = estado.politicaUnidade || { ativa: true, regras: {} };
  const editarUn = (fn) => setEstado((e) => {
    const pol = e.politicaUnidade || { ativa: true, regras: {} };
    return { ...e, politicaUnidade: fn({ ativa: pol.ativa !== false, regras: { ...(pol.regras || {}) }, rotulos: { ...(pol.rotulos || {}) } }), criterios: semAprovacao(e.criterios, "unidade") };
  });
  const setRegraUn = (chave, regra) => editarUn((pol) => { if (regra) pol.regras[chave] = regra; else delete pol.regras[chave]; return pol; });
  // Nome da unidade de estoque de cada medida: o que o analista digita vale mais que o padrão (vazio volta ao padrão).
  const setRotuloUn = (grandeza, valor) => editarUn((pol) => { if (valor.trim()) pol.rotulos[grandeza] = valor.toUpperCase(); else delete pol.rotulos[grandeza]; return pol; });
  const painelUnidade = crit.id === "unidade" ? (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <p className="text-sm font-medium">Política da menor unidade de estoque</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={polUn.ativa !== false} onChange={(e) => editarUn((pol) => ({ ...pol, ativa: e.target.checked }))} />
        <span>Aplicar a política: a unidade de estoque é a menor unidade prática da medida do item; a maior vira unidade de compra, com o fator de conversão.
          <span className="block text-xs text-muted-foreground">Desligada, o critério só confere a grafia (KG × KGS), a unidade vazia e a unidade sem regra.</span></span></label>
      {!validacaoId ? <p className="text-xs text-muted-foreground">Importe a base no passo Triagem para ver as unidades dela.</p> : resumoUn && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Nome da unidade de estoque de cada medida. Por padrão vale o símbolo (KG, L, M, M2) e, na contagem, a grafia que a base já usa. Troque o nome se o seu ERP usa outro (por exemplo QUILOGRAM): todos os itens passam a ser conferidos contra ele.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">{Object.entries(GRANDEZAS).map(([g, v]) => (
              <label key={g} className="flex items-center gap-1.5 text-xs">{v.rotulo}
                <input value={polUn.rotulos?.[g] ?? ""} placeholder={resumoUn.padroes[g]} onChange={(e) => setRotuloUn(g, e.target.value)} aria-label={`Nome da unidade de estoque de ${v.rotulo.toLowerCase()}`} className="border rounded px-1.5 py-0.5 w-24 bg-background font-mono uppercase" /></label>))}</div>
          </div>
          <p className="text-sm font-medium">Unidades encontradas na base ({fmt(resumoUn.linhas.length)}{resumoUn.semUnidade ? ` · ${plural(resumoUn.semUnidade, "item sem unidade", "itens sem unidade")}` : ""})</p>
          <p className="text-xs text-muted-foreground">O sistema reconhece as unidades de medida usuais e as embalagens mais comuns. As que ele não conhece aparecem como “Sem regra”: diga de que medida a unidade é (e, se souber, quantas unidades padrão ela tem) ou marque “Manter como está”. A escolha vale para todos os itens com a unidade e nada é alterado no cadastro.</p>
          <div className="max-h-80 overflow-auto"><table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><Th chave="unidade" ord={ordUn} onOrdenar={ordenarUn}>Unidade</Th><Th chave="itens" ord={ordUn} onOrdenar={ordenarUn}>Itens</Th><Th chave="trata" ord={ordUn} onOrdenar={ordenarUn}>Como a política trata</Th><th className="p-1.5">Seu ajuste</th></tr></thead>
            <tbody>{ordenarPor(resumoUn.linhas, ordUn, { unidade: (l) => l.rotulo, itens: (l) => l.n, trata: (l) => l.texto }).map((l) => {
              const sel = l.regra?.manter ? "manter" : (l.regra?.grandeza || ""); const alvo = sel && sel !== "manter" ? resumoUn.padroes[sel] : null;
              return (<tr key={l.chave} className="border-t border-border align-top">
                <td className="p-1.5 font-mono">{l.rotulo}{l.grafias.length > 1 && <span className="block text-[10px] text-muted-foreground font-sans">também: {l.grafias.slice(1, 4).join(", ")}</span>}</td>
                <td className="p-1.5 tabular-nums">{fmt(l.n)}</td>
                <td className={`p-1.5 ${l.k ? "" : "text-amber-700 dark:text-amber-300"}`}>{l.texto}</td>
                <td className="p-1.5">
                  <select aria-label={`Como tratar a unidade ${l.rotulo}`} value={sel} className="border rounded px-1 py-0.5 bg-background"
                    onChange={(e) => { const v = e.target.value; setRegraUn(l.chave, v === "" ? null : v === "manter" ? { manter: true } : { grandeza: v, fator: null, fatorTxt: "" }); }}>
                    <option value="">{l.conhecida ? "Seguir a tabela" : "Sem regra"}</option>
                    <option value="manter">Manter como está</option>
                    {Object.entries(GRANDEZAS).map(([id, v]) => <option key={id} value={id}>É medida de {v.rotulo.toLowerCase()}</option>)}
                  </select>
                  {alvo && <span className="mt-1 flex items-center gap-1 whitespace-nowrap">1 {l.rotulo.toUpperCase()} =
                    <input inputMode="decimal" value={l.regra.fatorTxt ?? (l.regra.fator ?? "")} placeholder="a informar" aria-label={`Quantos ${alvo} há em 1 ${l.rotulo}`} className="border rounded px-1 py-0.5 w-20 bg-background tabular-nums"
                      onChange={(e) => setRegraUn(l.chave, { grandeza: sel, fatorTxt: e.target.value, fator: lerFator(e.target.value) })} /> {alvo}</span>}
                </td></tr>);
            })}</tbody></table></div>
        </div>)}
    </div>) : null;
  const sit = situacaoCriterio(estado, crit, contagem);
  const nAchCrit = achadosDe(contagem, crit);
  const criterios = (
    <div className="space-y-3">
      <AbasCriterios estado={estado} contagem={contagem} ativo={critAtivo} onSelecionar={setCritAtivo} marca={(e, c) => situacaoCriterio(e, c, contagem) !== "PENDENTE"} />
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{crit.titulo}</h3><div className="flex gap-2"><SelosCriterio crit={crit} situacao={sit} cEst={cEst} /></div></div>
        <div><label className="text-xs text-muted-foreground" htmlFor="regra">Regra do critério (texto de registro)</label>
          <textarea id="regra" className="w-full border rounded-md p-2 text-sm bg-background min-h-[84px]" value={cEst.regra ?? crit.regra} onChange={(e) => setCrit({ regra: e.target.value, aprovado: false })} />
          <p className="text-xs text-muted-foreground mt-1">O texto descreve o que o critério verifica e fica registrado com a aprovação, para orientar a conferência e a política final. Editá-lo <b className="font-medium text-foreground">não muda o teste</b> e reabre a aprovação.</p></div>
        <p className="text-xs text-muted-foreground"><b className="font-medium text-foreground">O que muda o teste:</b> {crit.id === "padrao" ? "as regras de padronização e as abreviações, logo abaixo." : crit.id === "unidade" ? "a política da menor unidade e a tabela de unidades, logo abaixo." : crit.id === "utilizacao" ? <>o corte por data, no <button type="button" onClick={() => irPara(0)} className="text-primary underline">Parâmetro de saneamento (passo Triagem)</button>.</> : crit.auto ? "este critério ainda não tem ajustes: o teste automático é fixo (o texto da regra só o descreve)." : "nada: é conferência manual, e o texto da regra serve de roteiro para conferir os itens de cada grupo."}</p>
        <p className="text-xs text-muted-foreground">Exemplo: {crit.exemplo}.{crit.params && <> Parâmetro: {crit.params}.</>}</p>
        {nAchCrit != null && <p className="text-xs text-muted-foreground">Na base atual: <b>{fmt(nAchCrit)}</b> itens em escopo com achado neste critério.{sit === "AUTO" ? " Sem achados, o critério abre aprovado." : ""}</p>}
        <div className="flex flex-wrap gap-2"><AcaoAprovacao situacao={sit} onAprovar={() => aprovarCriterio(crit)} onReabrir={() => reabrirCriterio(crit)} /></div>
        <p className="text-xs text-muted-foreground">Critério sem achados abre aprovado; use “Revisar manualmente” para conferi-lo. A análise só trata critérios aprovados.</p>
        {painelPadrao}
        {painelUnidade}
      </div>
    </div>
  );

  // ── Passo 3: Piloto SAP ──
  const piloto = (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-xs text-muted-foreground">Registro dos testes no ambiente do cliente. Nenhuma capacidade é tratada como confirmada sem teste registrado.</p>
      {CASOS_PILOTO.map((nomeCaso) => { const p = estado.piloto[nomeCaso] || {}; const set = (patch) => mudar({ piloto: { ...estado.piloto, [nomeCaso]: { ...p, ...patch } } });
        return (<div key={nomeCaso} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><b className="font-medium text-sm">{nomeCaso}</b>
            <select value={p.status || "Não iniciado"} onChange={(e) => set({ status: e.target.value })} className="border rounded p-1 text-sm bg-background" aria-label={`Situação: ${nomeCaso}`}>{STATUS_PILOTO.map((s) => <option key={s}>{s}</option>)}</select></div>
          <input value={p.evidencia || ""} onChange={(e) => set({ evidencia: e.target.value })} placeholder="Evidência (descrição, referência do arquivo ou link)" className="w-full border rounded p-1.5 text-sm bg-background" />
          <input value={p.limitacao || ""} onChange={(e) => set({ limitacao: e.target.value })} placeholder="Limitações e condições de aplicação" className="w-full border rounded p-1.5 text-sm bg-background" />
        </div>); })}
    </div>
  );

  // ── Passo 4: Análises (uma aba por critério, as mesmas do passo Critérios) ──
  const analises = !validacaoId ? <p className="text-sm text-muted-foreground">Importe a base no passo Triagem para analisar.</p> : (
    <PassoAnalises estado={estado} setEstado={setEstado} grupos={grupos} achados={achados} contagem={contagem} ativo={critAtivo} onSelecionar={setCritAtivo} quem={quem}
      onComparar={setComparativo} onIrCriterios={() => irPara(1)} onIrDepara={() => irPara(4)} onAprovar={aprovarCriterio} onReabrir={reabrirCriterio}
      itemPorLinha={mapaLinha} nomeProjeto={nome} nomeBase={base.data?.nome_arquivo} slug={slug} escalaSaldo={escalaSaldo} temSaldo={temSaldo} onEscala={(v) => mudar({ saldoEscala: v })} />
  );

  // ── Passo 6: Execução (realocações físicas) ──
  const execucao = !validacaoId ? <p className="text-sm text-muted-foreground">Importe a base no passo Triagem para preparar a execução.</p> : (
    <PassoExecucao estado={estado} setEstado={setEstado} tarefas={execGerada.tarefas} geradasPorTipo={execGerada.geradasPorTipo} resumo={resumoEx} quem={quem} slug={slug}
      pilotoTestados={CASOS_PILOTO.filter((c) => estado.piloto[c]?.status === "Testado").length} pilotoTotal={CASOS_PILOTO.length} />
  );

  // ── Passo 5: De/para (decisões) ──
  const decidir = (ks, status) => setEstado((e) => { const d = { ...e.decisoes }; ks.forEach((k) => { if (d[k] && d[k].status === "PROP" && !(status === "APR" && precisaFator(d[k]))) d[k] = { ...d[k], status, decididoPor: quem, decididoEm: hojeIso() }; }); return { ...e, decisoes: d }; });
  // O fator digitado vale mais que o sugerido; apagar o campo volta a "a informar" (e impede a aprovação).
  const setFatorDecisao = (k, txt) => setEstado((e) => ({ ...e, decisoes: { ...e.decisoes, [k]: { ...e.decisoes[k], fatorTxt: txt, fatorFinal: lerFator(txt) ?? "" } } }));
  const celulaUnidade = (d, it) => {
    const f = fatorDaDecisao(d); const compra = String(d.de).toUpperCase();
    return (
      <div>{it?.descricao || "—"}
        <div className="text-[11px]"><b className="font-medium">Unidade de estoque: {d.de} → {d.para}</b>
          {d.tipo === "conversao" && (d.status === "PROP" ? (
            <label className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-muted-foreground"><span>unidade de compra {compra}: 1 =</span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap"><input inputMode="decimal" value={d.fatorTxt ?? (d.fator ?? "")} placeholder="a informar" aria-label={`Itens por unidade de compra, linha ${d.k.split("|")[0]}`} onChange={(e) => setFatorDecisao(d.k, e.target.value)} className="border rounded px-1 py-0.5 w-20 bg-background tabular-nums" /> {d.para}</span>
              {d.evidencia === "descricao" && d.fatorFinal === undefined && <span>(lido da descrição: confirme)</span>}</label>
          ) : <span className="block text-muted-foreground">unidade de compra {compra}: {f != null ? `1 = ${numeroBr(f)} ${d.para}` : "itens por unidade de compra a informar"}</span>)}
        </div></div>);
  };
  const porGrupoDec = [...new Set(decisoesLista.map((d) => d.grupo))];
  const temPadrao = decisoesLista.some((d) => d.k.endsWith("|padrao"));
  const emitirListaCliente = async () => {
    const linhas = linhasListaCliente(decisoesTrabalho, itens, { somentePendentes: true });
    if (!linhas.length) { setMsgResposta("Não há correções de descrição aguardando resposta."); return; }
    await gerarListaCliente(linhas, `${slug}-sugestoes-de-descricao.xlsx`); setMsgResposta(`Lista emitida com ${fmt(linhas.length)} sugestões.`);
  };
  const importarResposta = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    try {
      const linhas = await lerRespostaCliente(f);
      const res = aplicarRespostas(estado.decisoes, itens, linhas, { quem, hoje: hojeIso(), regras: regrasPad, abrev: abreviacoesAprovadas(estado) });
      mudar({ decisoes: res.decisoes }); const x = res.resumo;
      setMsgResposta(`Resposta importada: ${fmt(x.aceitas)} aceitas, ${fmt(x.ajustadas)} ajustadas pelo cliente, ${fmt(x.rejeitadas)} mantidas, ${fmt(x.semResposta)} sem resposta${x.naoEncontradas.length ? `, ${fmt(x.naoEncontradas.length)} códigos não encontrados` : ""}.`);
    } catch (err) { setMsgResposta(err.message); }
  };
  const depara = (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Aqui chegam os casos encaminhados no passo Análises. Aprove ou rejeite cada um: só o aprovado entra nas listas finais e na execução; sem resposta, o caso continua aguardando. Nada é alterado no cadastro.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={estado.bloco} onChange={(e) => mudar({ bloco: e.target.checked })} /> Aprovar em bloco (opcional)</label>
      <p className="text-xs text-muted-foreground">Cada caso continua registrado individualmente, com aprovador e data. Resumo: {fmt(decisoesLista.filter((d) => d.status === "PROP").length)} aguardando decisão · {fmt(decisoesLista.filter((d) => d.status === "APR").length)} aprovados · {fmt(decisoesLista.filter((d) => d.status === "REJ").length)} rejeitados.</p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <span className="text-sm font-medium">Correções de descrição com o cliente</span>
        <Botao onClick={emitirListaCliente} disabled={!temPadrao}><Download className="w-3.5 h-3.5 inline mr-1" />Emitir lista para o cliente</Botao>
        <label className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted cursor-pointer">Importar resposta<input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={importarResposta} /></label>
        {msgResposta && <span className="text-xs text-muted-foreground" role="status">{msgResposta}</span>}
        <span className="basis-full text-xs text-muted-foreground">O cliente responde OK ou escreve ao lado como deve ficar. Nada é alterado no cadastro: a resposta fica registrada como decisão, com a descrição original preservada.</span>
      </div>
      {nDecOcultas > 0 && <p className="text-xs text-muted-foreground">{plural(nDecOcultas, "decisão de grupo fora do saneamento fica guardada", "decisões de grupos fora do saneamento ficam guardadas")} e não {nDecOcultas === 1 ? "aparece" : "aparecem"} aqui.</p>}
      {decisoesLista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum caso encaminhado ainda. No passo Análises, marque “Encaminhar para aprovação” nos achados que devem ser decididos (ou use o botão que encaminha o grupo todo).</p>}
      {porGrupoDec.map((gn) => { const lista = decisoesLista.filter((d) => d.grupo === gn); const pend = lista.filter((d) => d.status === "PROP");
        return (<Acc key={gn} aberto={!!aberto["d" + gn]} onToggle={() => alternar("d" + gn)} titulo={<><b className="font-medium">{gn}</b><span className="text-xs text-muted-foreground">{fmt(lista.length)} casos · {fmt(pend.length)} aguardando decisão</span></>}>
          {estado.bloco && pend.length > 0 && <div className="flex flex-wrap gap-2 mb-2"><Botao onClick={() => decidir(pend.map((d) => d.k), "APR")}>Aprovar os {fmt(pend.filter((d) => !precisaFator(d)).length)} pendentes</Botao><Botao onClick={() => decidir(pend.map((d) => d.k), "REJ")}>Rejeitar os pendentes</Botao>{pend.some(precisaFator) && <span className="self-center text-xs text-muted-foreground">Conversões de unidade sem fator ficam aguardando.</span>}</div>}
          <div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground"><Th chave="caso" ord={ordDec} onOrdenar={ordenarDec}>Caso</Th><Th chave="criterio" ord={ordDec} onOrdenar={ordenarDec}>Critério</Th><Th chave="descricao" ord={ordDec} onOrdenar={ordenarDec}>Descrição</Th><Th chave="situacao" ord={ordDec} onOrdenar={ordenarDec}>Situação</Th><th className="p-1.5"></th></tr></thead>
            <tbody>{ordenarPor(lista, ordDec, { caso: (d) => Number(d.k.split("|")[0]), criterio: (d) => CRITERIOS.find((c) => c.id === d.k.split("|")[1])?.titulo, descricao: (d) => itemPorLinha(Number(d.k.split("|")[0]))?.descricao, situacao: (d) => (d.status === "PROP" ? 0 : d.status === "APR" ? 1 : 2) }).slice(0, 200).map((d) => { const [linha, cid] = d.k.split("|"); const it = itemPorLinha(Number(linha));
              return (<tr key={d.k} className="border-t border-border"><td className="p-1.5 tabular-nums">L{linha}</td><td className="p-1.5">{CRITERIOS.find((c) => c.id === cid)?.titulo}</td><td className="p-1.5 max-w-[280px]">{d.sugerida ? <div><span className="text-muted-foreground line-through break-words">{it?.descricao || "—"}</span><div><b className="font-medium break-words">{d.final || d.sugerida}</b>{d.origemFinal === "cliente" && <span className="ml-1 text-[10px] text-primary">ajustada pelo cliente</span>}</div></div> : cid === "duplicidade" && d.destino != null && d.destino !== Number(linha) ? <div>{it?.descricao || "—"}<div className="text-[11px] text-muted-foreground">unificar no código {itemPorLinha(d.destino)?.codigo ?? "—"}</div></div> : cid === "unidade" && d.para ? celulaUnidade(d, it) : (it?.descricao || "—")}</td>
                <td className="p-1.5">{d.status === "APR" ? <Chip tom="g">Aprovado por {d.decididoPor} em {dataBr(d.decididoEm)}</Chip> : d.status === "REJ" ? <Chip>Rejeitado</Chip> : <Chip tom="a">Aguardando</Chip>}</td>
                <td className="p-1.5 whitespace-nowrap">{!estado.bloco && d.status === "PROP" && <><Botao className="mr-1" disabled={precisaFator(d)} title={precisaFator(d) ? "Informe o fator de conversão para aprovar" : undefined} onClick={() => decidir([d.k], "APR")}>Aprovar</Botao><Botao onClick={() => decidir([d.k], "REJ")}>Rejeitar</Botao></>}</td></tr>); })}</tbody></table>
            {lista.length > 200 && <p className="text-xs text-muted-foreground p-2">Mostrando 200 de {fmt(lista.length)}.</p>}</div>
        </Acc>); })}
    </div>
  );

  const baixar = async (ids, sufixo) => { if (!listas) return; setGerando(true); try { await gerarXlsx(listas, ids, `${slug}-${sufixo}.xlsx`); } finally { setGerando(false); } };
  const conferencia = !validacaoId ? <p className="text-sm text-muted-foreground">Importe a base no passo Triagem para emitir as listas.</p> : !listas ? <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Montando as listas…</p> : (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[["Universo", listas.contagem.universo], ["Lista final", listas.contagem.listaFinal], ["Descrições corrigidas", listas.contagem.descricoesCorrigidas], ["Unidades de estoque ajustadas", listas.contagem.unidadesAjustadas], ["Unificações aprovadas", listas.contagem.unificacoesAprovadas], ["Unificações em decisão", listas.contagem.unificacoesPendentes], ["Inativados por data de uso", listas.contagem.inativados], [`Tarefas concluídas (de ${fmt(listas.contagem.tarefas)})`, listas.contagem.concluidas]].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-medium tabular-nums">{fmt(v)}</p></div>))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-medium">Listas finais</h3>
        <p className="text-xs text-muted-foreground">Cada lista sai em planilha Excel e reflete as decisões registradas aqui. A execução no SAP e no físico aparece conforme as confirmações com evidência registradas no passo Execução; nenhum cadastro é alterado por esta ferramenta.</p>
        <div className="flex flex-wrap gap-2">
          <Botao disabled={gerando} onClick={() => baixar(["resumo", "final", "dedup", "analises", "inativados", "execucao"], "listas-finais")}><Download className="w-3.5 h-3.5 inline mr-1" />Pacote completo (6 abas)</Botao>
          <Botao disabled={gerando} onClick={() => baixar(["final"], "lista-final-corrigida")}>Lista final corrigida ({fmt(listas.contagem.listaFinal)})</Botao>
          <Botao disabled={gerando} onClick={() => baixar(["dedup"], "desduplicacoes")}>Desduplicações ({fmt(listas.desduplicacoes.length)})</Botao>
          <Botao disabled={gerando} onClick={() => baixar(["analises"], "analises")}>Análises ({fmt(listas.contagem.achados)})</Botao>
          <Botao disabled={gerando} onClick={() => baixar(["inativados"], "inativados-por-data-de-uso")}>Inativados por data de uso ({fmt(listas.contagem.inativados)})</Botao>
          <Botao disabled={gerando} onClick={() => baixar(["execucao"], "execucao")}>Execução ({fmt(listas.contagem.tarefas)})</Botao>
        </div>
        {gerando && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando a planilha…</p>}
      </div>
    </div>);

  // ── Passo 8: Fiscal (revisão fiscal dos grupos saneados) ──
  const fiscalUi = !validacaoId ? <p className="text-sm text-muted-foreground">Importe a base no passo Triagem para a revisão fiscal.</p> : (
    <PassoFiscal estado={estado} setEstado={setEstado} grupos={grupos} saem={saem} quem={quem} nomeProjeto={nome} nomeBase={base.data?.nome_arquivo} slug={slug} temAnalise={temAnalise} onIrAnalises={() => irPara(3)} />
  );

  // ── Passo 9: Política de uso e relatório do programa de trabalho (PDF) ──
  // O relatório reúne o que foi feito em todos os passos: as listas são montadas na hora de emitir (a base pode ser grande) e o PDF é carregado só então.
  const emitirRelatorioFinal = async () => {
    const nomeBase = base.data?.nome_arquivo;
    const listasAgora = montarListas({ nomeProjeto: nome, nomeBase, estado, itens, escopo, testes, escalaSaldo });
    const politica = montarPolitica({ estado, contagem, escopo, grupos, nomeProjeto: nome, nomeBase });
    const rel = montarRelatorioFinal({ nomeProjeto: nome, nomeBase, quem, estado, itens, escopo, contagem, listas: listasAgora, politica });
    return gerarPdfRelatorio(rel, `${slug}-relatorio-do-programa-de-trabalho.pdf`);
  };
  const politicaUi = !validacaoId ? <p className="text-sm text-muted-foreground">Importe a base no passo Triagem para montar a política.</p> : (
    <PassoPolitica estado={estado} setEstado={setEstado} contagem={contagem} escopo={escopo} grupos={grupos} quem={quem} nomeProjeto={nome} nomeBase={base.data?.nome_arquivo} slug={slug} onRelatorio={emitirRelatorioFinal} />
  );

  const corpo = [triagem, criterios, piloto, analises, depara, execucao, conferencia, fiscalUi, politicaUi][passo];

  // Situação de cada passo, para o stepper mostrar onde está o trabalho (feito, andamento, bloqueado).
  const nGrupos = grupos.length; const nSan = grupos.filter((g) => estado.saneados[g.nome]).length;
  const nFisc = grupos.filter((g) => estado.saneados[g.nome] && estado.fiscal?.grupos?.[g.nome]).length; // grupos saneados com a revisão fiscal concluída
  const nCrit = criteriosAprovados(estado, contagem).length;
  const nPil = CASOS_PILOTO.filter((c) => estado.piloto[c]?.status === "Testado").length;
  const nDec = decisoesLista.length; const nDecFeitas = decisoesLista.filter((d) => d.status !== "PROP").length;
  const resumoPassos = [
    { feito: !!validacaoId, sub: importando ? "importando…" : validacaoId ? `${fmt(escopo.resumo.emEscopo)} em escopo` : "sem base" },
    { feito: nCrit === CRITERIOS.length, sub: `${nCrit}/${CRITERIOS.length} aprovados` },
    { feito: nPil === CASOS_PILOTO.length, sub: `${nPil}/${CASOS_PILOTO.length} testados` },
    { feito: nGrupos > 0 && nSan === nGrupos, sub: nGrupos ? `${nSan}/${nGrupos} grupos` : "sem base" },
    { feito: nDec > 0 && nDecFeitas === nDec, sub: nDec ? `${nDecFeitas}/${nDec} decididos` : "sem casos" },
    { feito: resumoEx.total > 0 && resumoEx.CONCLUIDA === resumoEx.total, sub: resumoEx.total ? `${fmt(resumoEx.CONCLUIDA)}/${fmt(resumoEx.total)} concluídas` : "sem tarefas" }, { sub: "listas finais" },
    { feito: nSan > 0 && nFisc === nSan, sub: nSan ? `${nFisc}/${nSan} grupos revisados` : "aguarda saneamento", bloqueado: nSan === 0 },
    { feito: !!estado.politica?.aprovada, sub: estado.politica?.aprovada ? "aprovada" : "em elaboração" },
  ];
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 -mx-6 lg:-mx-8 px-6 lg:px-8 py-2 bg-background/95 backdrop-blur border-b border-border space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0"><button type="button" onClick={onVoltar} className="text-muted-foreground hover:text-foreground" aria-label="Voltar à lista de projetos"><ArrowLeft className="w-4 h-4" /></button><b className="font-medium truncate">{nome}</b></div>
          {importando ? <span className="inline-flex items-center gap-1.5 text-xs text-primary"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando e processando a base… você pode trocar de aba, mas não feche esta página</span> : <span className="text-xs text-muted-foreground">{salvo ? `Salvo às ${salvo.toLocaleTimeString("pt-BR")}` : "Salvamento automático"}</span>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Passos do saneamento">
          {PASSOS.map((p, i) => {
            const rp = resumoPassos[i]; const ativo = i === passo;
            return (
              <button key={p.t} type="button" role="tab" aria-selected={ativo} onClick={() => irPara(i)}
                className={`flex-1 min-w-[104px] flex flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left ${ativo ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}>
                <span className={`flex items-center gap-1.5 text-[12px] font-medium ${ativo ? "text-primary" : ""}`}>
                  <span className={`grid place-items-center w-4 h-4 shrink-0 rounded-full text-[10px] ${rp.feito ? "bg-primary text-primary-foreground" : ativo ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>{rp.feito ? <Check className="w-3 h-3" /> : rp.bloqueado ? <Lock className="w-2.5 h-2.5" /> : i + 1}</span>
                  {p.t}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{rp.sub}</span>
              </button>);
          })}
        </div>
      </div>
      <div className="rounded-lg bg-muted/50 text-xs text-muted-foreground">
        <button type="button" onClick={() => setProgramaAberto((a) => !a)} aria-expanded={programaAberto} className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left">
          <span><b className="font-medium text-foreground">Programa de trabalho</b> · {PASSOS[passo].t}</span>
          {programaAberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {programaAberto && <div className="px-3 pb-2 space-y-1"><p>{PASSOS[passo].programa}</p><p><b className="font-medium text-foreground">Para avançar:</b> {PASSOS[passo].avancar}</p></div>}
      </div>
      {importador}
      {corpo}
      <div className="flex justify-end gap-2 pt-1">{passo > 0 && <Botao onClick={() => irPara(passo - 1)}>Voltar</Botao>}{passo < PASSOS.length - 1 && <Botao onClick={() => irPara(passo + 1)}>Concluir e seguir</Botao>}</div>
      <ComparativoDuplicidade item={comparativo} itens={itens} excluir={[]} setExcluir={() => {}} podeExcluir={false} onFechar={() => setComparativo(null)} />
    </div>
  );
}
