import { ERPS } from "@/lib/conhecimentoSistemas";
import ConhecimentoEmpresa from "@/components/ConhecimentoEmpresa";
import { Link, useParams, useSearchParams } from "react-router-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, UploadCloud, FileSpreadsheet, Copy, Check, Download, Loader2, RotateCcw, Lock } from "lucide-react";
import { api } from "@/api/client";
import LeadForm from "@/components/ferramentas/LeadForm";
import AnexoLeiPainel from "@/components/ferramentas/AnexoLeiPainel";
import ComparativoDuplicidade from "@/components/ferramentas/ComparativoDuplicidade";
import HistoricoValidacoes from "@/components/ferramentas/HistoricoValidacoes";
import TabelaPadrao from "@/components/TabelaPadrao";
import { useQueryClient } from "@tanstack/react-query";

const CABECALHO_MODELO = ["Codigo", "Descricao", "NCM", "Unidade", "Origem", "cClassTrib"];

const ROTULO_PROBLEMA = {
  DUPLICIDADE_EXATA: "Descrição e unidade iguais", DUPLICIDADE_PROVAVEL: "Indicação alta de duplicidade", POSSIVEL_DUPLICIDADE: "Possível duplicidade",
  NCM_AUSENTE: "NCM ausente", NCM_FORMATO: "NCM com formato errado", NCM_INEXISTENTE: "NCM inexistente", NCM_INATIVO: "NCM não vigente",
  NCM_ZERO_RESTAURADO: "Zero à esquerda corrigido", NCM_CHAVE_SAP: "NCM é código interno do SAP", DATA_INVALIDA: "Data de movimentação não reconhecida", SEM_DATA_MOVIMENTO: "Sem data de movimentação", CODIGO_AUSENTE: "Sem código", DESCRICAO_AUSENTE: "Sem descrição",
  CODIGO_DUPLICADO: "Código duplicado", PRODUTO_DUPLICADO: "Produto duplicado", CLASSE_SUGERIDA: "Classificação sugerida",
  BENEFICIO_POSSIVELMENTE_PERDIDO: "Benefício possivelmente perdido", REDUCAO_MAIOR_QUE_ESPERADO: "Redução maior que a esperada",
  SEM_AMPARO_NO_ANEXO: "Redução sem amparo nos anexos", CLASSE_DIVERGENTE: "Classe divergente", AMBIGUO_REVISAR: "NCM ambíguo — revisar",
};

const COR_SIT = {
  OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  ALERTA: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  ERRO: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};
const ROT_SIT = { OK: "OK", ALERTA: "Atenção", ERRO: "Corrigir" };
const tem = (...codigos) => (i) => i.problemas.some((p) => codigos.includes(p.codigo));
// Abas de análise: cada item aparece em todas as abas a que pertence (um duplicado com NCM errado entra nas duas).
const ABAS = [
  { id: "TODOS", titulo: "Todos os itens (sem segregação)", testa: () => true },
  { id: "REGULARES_CLASSE", titulo: "100% regulares com cClassTrib identificado", testa: (i) => i.situacao === "OK" && !!i.sugestao?.c_class_trib },
  { id: "REGULARES", titulo: "100% regulares", testa: (i) => i.situacao === "OK" },
  { id: "DUPLICADOS", titulo: "Duplicados para crítica", testa: tem("DUPLICIDADE_EXATA", "DUPLICIDADE_PROVAVEL", "POSSIVEL_DUPLICIDADE", "CODIGO_DUPLICADO", "PRODUTO_DUPLICADO") },
  { id: "NCM", titulo: "NCM a corrigir", testa: tem("NCM_AUSENTE", "NCM_CHAVE_SAP", "NCM_FORMATO", "NCM_INEXISTENTE", "NCM_INATIVO") },
  { id: "AUTO", titulo: "Corrigidos automaticamente", testa: tem("NCM_ZERO_RESTAURADO") },
  { id: "CLASSE", titulo: "cClassTrib a revisar", testa: tem("BENEFICIO_POSSIVELMENTE_PERDIDO", "REDUCAO_MAIOR_QUE_ESPERADO", "SEM_AMPARO_NO_ANEXO", "CLASSE_DIVERGENTE", "AMBIGUO_REVISAR") },
  { id: "CADASTRO", titulo: "Cadastro incompleto", testa: tem("CODIGO_AUSENTE", "DESCRICAO_AUSENTE", "DATA_INVALIDA") },
  { id: "SUGERIDA", titulo: "Com classe sugerida (anexos)", testa: (i) => !!i.sugestao?.c_class_trib && !i.sugestao.padrao },
  { id: "REFERENCIA", titulo: "NCM em capítulo citado por anexo (revisar)", testa: (i) => !!i.sugestao?.referencia },
  { id: "PADRAO", titulo: "Sem enquadramento nos anexos consultados (padrão)", testa: (i) => !!i.sugestao?.padrao },
  { id: "GRUPO", titulo: "Grupo divergente", so: "grupos", testa: (i) => i.grupo_flag === "DIFERENTE" },
  { id: "CONTA", titulo: "Conta contábil divergente", so: "gruposContabeis", testa: (i) => i.conta_flag === "DIFERENTE" },
];

// Mesma ordem e títulos da planilha corrigida (ProdutosService.exportarXlsx).
const mesesAtras = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "…");
const ROT_FLAG = { IGUAL: "Igual", DIFERENTE: "Diferente", SEM_ATUAL: "Sem valor atual", SEM_SUGESTAO: "Sem sugestão", SEM_REGRA: "Sem regra no de-para", SEM_PLANO: "Sem de-para" };
const COR_FLAG = {
  IGUAL: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  DIFERENTE: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
};
const ROT_PERIODO = { DENTRO: "Dentro", SEM_DATA: "Sem data", DATA_INVALIDA: "Data inválida" };
const COR_PERIODO = {
  DENTRO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  SEM_DATA: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  DATA_INVALIDA: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};
const traco = (v) => v || "—";
const selo = (cor, texto) => <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${cor}`}>{texto}</span>;
const problemasDoItem = (i) => i.problemas.filter((p) => p.codigo !== "CLASSE_SUGERIDA");
const sugestaoDoItem = (i) => (i.sugestao?.c_class_trib ? i.sugestao : null);

/** Colunas da tabela de resultado: a mesma ordem e os mesmos títulos da planilha corrigida (ProdutosService.exportarXlsx). */
function colunasDosItens({ opRes, periodo, podeExcluir, excluir, setExcluir, aoComparar, aoAbrirAnexo }) {
  return [
    ...(podeExcluir ? [{
      chave: "excluir", rotulo: "Excluir da cópia saneada", valor: () => "", ordenavel: false, filtravel: false, alinhar: "centro",
      render: (i) => <input type="checkbox" aria-label={`Excluir linha ${i.linha} da cópia saneada`} disabled={!i.candidatos_duplicidade?.length} checked={excluir.includes(i.linha)} onChange={(e) => setExcluir((xs) => (e.target.checked ? [...xs, i.linha] : xs.filter((n) => n !== i.linha)))} />,
    }] : []),
    { chave: "linha", rotulo: "Linha", tipo: "numero", alinhar: "direita", render: (i) => <span className="text-muted-foreground">{i.linha}</span> },
    { chave: "codigo", rotulo: "Código", render: (i) => <span className="font-medium">{traco(i.codigo)}</span> },
    { chave: "descricao", rotulo: "Descrição", render: (i) => traco(i.descricao) },
    { chave: "unidade", rotulo: "Unidade", render: (i) => traco(i.unidade) },
    { chave: "principio_ativo", rotulo: "Princípio ativo", render: (i) => traco(i.principio_ativo) },
    { chave: "grupo_contabil", rotulo: "Grupo contábil atual", render: (i) => traco(i.grupo_contabil) },
    { chave: "ncm_original", rotulo: "NCM informado", render: (i) => <span className="font-mono">{traco(i.ncm_original)}</span> },
    {
      chave: "ncm", rotulo: "NCM corrigido",
      render: (i) => { const mudou = i.ncm && i.ncm !== (i.ncm_original || "").replace(/\D/g, ""); return <span className={`font-mono ${mudou ? "text-emerald-700 dark:text-emerald-400 font-semibold" : ""}`}>{traco(i.ncm)}</span>; },
    },
    { chave: "situacao", rotulo: "Situação", valor: (i) => ROT_SIT[i.situacao], render: (i) => selo(COR_SIT[i.situacao], ROT_SIT[i.situacao]) },
    {
      chave: "problemas", rotulo: "Problemas encontrados", quebrar: true, valor: (i) => problemasDoItem(i).map((p) => p.mensagem).join(" | "),
      render: (i) => {
        const ps = problemasDoItem(i);
        return (
          <span className={ps.some((p) => p.severidade === "erro") ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>
            {ps.length ? ps.map((p) => p.mensagem).join(" | ") : "—"}
            {i.duplicidade && <button type="button" onClick={() => aoComparar(i)} className="ml-2 text-primary underline underline-offset-2 hover:opacity-80 whitespace-nowrap">Comparar</button>}
          </span>
        );
      },
    },
    { chave: "informado", rotulo: "cClassTrib informado", valor: (i) => i.c_class_trib_informado, render: (i) => <span className="font-mono">{traco(i.c_class_trib_informado)}</span> },
    {
      chave: "sugerido", rotulo: "cClassTrib sugerido",
      valor: (i) => sugestaoDoItem(i)?.c_class_trib || (i.sugestao?.referencia ? "Revisar" : i.sugestao?.ambiguo ? "Depende do produto" : ""),
      render: (i) => (sugestaoDoItem(i) ? <span className="font-mono font-semibold">{i.sugestao.c_class_trib}</span>
        : i.sugestao?.referencia ? <span className="text-amber-700" title="NCM em capítulo/posição citado por anexo: o enquadramento depende dos requisitos do item. Nenhuma classe foi sugerida.">Revisar</span>
          : i.sugestao?.ambiguo ? <span className="text-amber-700">Depende do produto</span> : "—"),
    },
    {
      chave: "reducao", rotulo: "Redução sugerida", alinhar: "direita",
      valor: (i) => (sugestaoDoItem(i) ? Math.round(i.sugestao.reducao * 100) : null), render: (i) => (sugestaoDoItem(i) ? `${Math.round(i.sugestao.reducao * 100)}%` : "—"),
    },
    { chave: "confianca", rotulo: "Confiança", valor: (i) => (i.sugestao?.confianca && (sugestaoDoItem(i) || i.sugestao.referencia) ? i.sugestao.confianca : ""), render: (i) => (i.sugestao?.confianca && (sugestaoDoItem(i) || i.sugestao.referencia) ? i.sugestao.confianca : "—") },
    {
      chave: "anexo", rotulo: "Base na lei", valor: (i) => i.sugestao?.anexo,
      render: (i) => (i.sugestao?.anexo ? <button type="button" onClick={() => aoAbrirAnexo(i.sugestao.anexo)} className="text-primary underline underline-offset-2 hover:opacity-80" title="Abrir o anexo da LC 214/2025 sem sair desta tela">{i.sugestao.anexo}</button> : "—"),
    },
    ...(opRes.grupos ? [
      { chave: "grupo_atual", rotulo: "Grupo atual", render: (i) => traco(i.grupo_atual) },
      { chave: "grupo_sugerido", rotulo: "Grupo sugerido (uso do cliente)", render: (i) => <span title={i.grupo_evidencia || i.grupo_sugerido || ""}>{traco(i.grupo_sugerido)}</span> },
      { chave: "grupo_flag", rotulo: "Flag grupo", valor: (i) => ROT_FLAG[i.grupo_flag], render: (i) => selo(COR_FLAG[i.grupo_flag] || "bg-muted text-muted-foreground", ROT_FLAG[i.grupo_flag] || "—") },
    ] : []),
    ...(opRes.gruposContabeis ? [
      { chave: "conta_atual", rotulo: "Conta contábil atual", valor: (i) => i.grupo_contabil, render: (i) => traco(i.grupo_contabil) },
      { chave: "conta_sugerida", rotulo: "Conta contábil sugerida", render: (i) => traco(i.conta_sugerida) },
      { chave: "conta_flag", rotulo: "Flag conta", valor: (i) => ROT_FLAG[i.conta_flag], render: (i) => selo(COR_FLAG[i.conta_flag] || "bg-muted text-muted-foreground", ROT_FLAG[i.conta_flag] || "—") },
    ] : []),
    ...(periodo ? [
      { chave: "ultima_mov", rotulo: "Última movimentação", tipo: "data", render: (i) => (i.ultima_mov ? i.ultima_mov.split("-").reverse().join("/") : "—") },
      { chave: "periodo", rotulo: "No período", valor: (i) => ROT_PERIODO[i.periodo], render: (i) => selo(COR_PERIODO[i.periodo] || "", ROT_PERIODO[i.periodo] || "—") },
    ] : []),
  ];
}

const COLUNAS_FORA = [
  { chave: "linha", rotulo: "Linha", tipo: "numero", alinhar: "direita", render: (f) => <span className="text-muted-foreground">{f.linha}</span> },
  { chave: "codigo", rotulo: "Código", render: (f) => <span className="font-medium">{traco(f.codigo)}</span> },
  { chave: "descricao", rotulo: "Descrição", render: (f) => traco(f.descricao) },
  { chave: "ncm_original", rotulo: "NCM informado", render: (f) => <span className="font-mono">{traco(f.ncm_original)}</span> },
  { chave: "ultima_mov", rotulo: "Última movimentação", tipo: "data", render: (f) => dataBr(f.ultima_mov) },
];

const COLUNAS_GRUPOS_SUGERIDOS = [
  { chave: "grupo", rotulo: "Grupo sugerido (uso do cliente)", render: (g) => <span className="font-medium">{g.grupo}</span> },
  { chave: "qtd", rotulo: "Itens", tipo: "numero", alinhar: "direita" },
  { chave: "atuais", rotulo: "Hoje estão em", quebrar: true, valor: (g) => g.atuais.map((a) => `${a.grupo} (${a.qtd})`).join(" · ") },
];

function Cartao({ titulo, valor, cor, ativo, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`text-left rounded-lg border p-3 transition-colors ${ativo ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/40"} bg-card`}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={`text-2xl font-semibold tabular-nums ${cor || ""}`}>{valor.toLocaleString("pt-BR")}</p>
    </button>
  );
}

/**
 * Validador de cadastro de produtos (NCM x classificação). Três caminhos de
 * entrada: modelo pronto, copiar o cabeçalho, ou enviar a exportação do ERP
 * como está e indicar as colunas. modo "publico" limita a 300 itens e libera o
 * detalhe após o cadastro do contato.
 */
export default function ValidadorCadastro({ modo = "interno", empresa, aoProcessar, aoCarregar, modoProjeto = false }) {
  const publico = modo === "publico";
  const { empresaId } = useParams();
  const [searchParams] = useSearchParams();
  const [opcoes, setOpcoes] = useState({ cClassTrib: true, duplicidades: true, principioAtivo: false, dataInicio: "", dataFim: "", erps: empresa?.erp ? [empresa.erp] : [], addons: empresa?.addons || [], gruposContabeis: false, grupos: false });
  const [excluir, setExcluir] = useState([]);
  const [problemasSelecionados, setProblemasSelecionados] = useState([]);
  const [periodoFiltro, setPeriodoFiltro] = useState("ANALISE");
  const mudarOpcao = (k, v) => setOpcoes(o => ({ ...o, [k]: v }));
  const [etapa, setEtapa] = useState("enviar");
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [mapa, setMapa] = useState({});
  const [resultado, setResultado] = useState(null);
  const [carregando, setCarregando] = useState(false);
  // Avisa quem hospeda este componente quando há envio/processamento em andamento (o projeto de saneamento mostra isso em qualquer aba).
  useEffect(() => { aoCarregar?.(carregando); }, [carregando]); // eslint-disable-line react-hooks/exhaustive-deps
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [filtro, setFiltro] = useState("TODOS");
  const [aba, setAba] = useState("TODOS");
  // Autosave: a análise existe no servidor desde o upload (rascunho); cada ajuste é salvo sozinho.
  const [rascunhoId, setRascunhoId] = useState(null);
  const [autosave, setAutosave] = useState(null);
  const [plano, setPlano] = useState(null);
  const [comparativo, setComparativo] = useState(null); // item cujo comparativo de duplicidade está aberto
  const [baseLeiAberta, setBaseLeiAberta] = useState(null); // ex.: "Anexo IX, item 2" — painel lateral do anexo
  const idAuto = !publico ? (resultado?.validacao_id || rascunhoId) : null;
  // Dentro de um projeto de saneamento: avisa quando a base foi processada e salva, para vinculá-la ao projeto.
  useEffect(() => { if (aoProcessar && resultado?.validacao_id) aoProcessar(resultado); }, [resultado?.validacao_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [emailLiberado, setEmailLiberado] = useState("");
  const inputRef = useRef(null);
  const qc = useQueryClient();
  const [abrindo, setAbrindo] = useState(null);

  const rotaPrevia = publico ? "/public/produtos/amostra" : "/produtos/ler";
  const rotaValidar = publico ? "/public/produtos/amostra" : "/produtos/validar";

  const reiniciar = () => {
    setExcluir([]); setProblemasSelecionados([]); setPeriodoFiltro("ANALISE"); setRascunhoId(null); setAutosave(null); setPlano(null);
    setEtapa("enviar"); setArquivo(null); setPrevia(null); setMapa({}); setResultado(null); setErro("");
    setFiltro("TODOS"); setAba("TODOS"); setEmailLiberado("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const receber = async (file) => {
    if (!file) return;
    setErro(""); setCarregando(true);
    try {
      // Interno: já cria a análise como rascunho no servidor (arquivo guardado), para não perder nada se a tela fechar.
      const r = publico ? await api.upload(rotaPrevia, file, { somente_ler: "true" }) : await api.upload("/produtos/rascunhos", file, { empresa_id: empresaId });
      setArquivo(file); setPrevia(r); setMapa(r.mapeamento || {}); setRascunhoId(!publico ? r.validacao_id : null); setPlano(null); setEtapa("colunas");
      if (!publico) qc.invalidateQueries({ queryKey: ["validacoes-cadastro"] });
    } catch (e) {
      setErro(e.status === 429 ? "Muitos envios seguidos. Aguarde um minuto e tente de novo." : e.message);
    } finally {
      setCarregando(false);
    }
  };

  const validar = async (email) => {
    setErro(""); setCarregando(true);
    try {
      // Refazer depois de ajustar parâmetros: usa o arquivo já guardado no servidor e atualiza a mesma validação do histórico.
      const idSalvo = !publico && (resultado?.validacao_id || rascunhoId);
      const r = idSalvo
        ? await api.post(`/produtos/validacoes/${idSalvo}/refazer`, { mapeamento: mapa, opcoes, empresa_id: empresaId })
        : await api.upload(rotaValidar, arquivo, { mapeamento: mapa, ...(!publico ? { empresa_id: empresaId, opcoes } : {}), ...(publico && (email || emailLiberado) ? { email: email || emailLiberado } : {}) });
      setExcluir([]); setPeriodoFiltro("ANALISE"); setResultado(r); setRascunhoId(null); setEtapa("resultado");      if (!publico) qc.invalidateQueries({ queryKey: ["validacoes-cadastro"] });
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  // Volta da tela de resultado para as colunas/parâmetros, mantendo tudo o que já foi escolhido, para ajustar e refazer.
  const ajustar = async () => {
    setErro("");
    if (!previa && resultado?.validacao_id) {
      setCarregando(true);
      try { const d = await api.get(`/produtos/validacoes/${resultado.validacao_id}/colunas`, { empresa_id: empresaId }); setPrevia(d); setPlano(d.plano || null); } catch (e) { setErro(e.message); setCarregando(false); return; }
      setCarregando(false);
    }
    if (resultado?.mapeamento) setMapa(resultado.mapeamento);
    if (resultado?.opcoes) setOpcoes(resultado.opcoes);
    setExcluir([]); setEtapa("colunas");
  };

  const anexarPlano = async (file) => {
    if (!file || !idAuto) return;
    setErro("");
    try { setPlano(await api.upload(`/produtos/validacoes/${idAuto}/plano-contas`, file, { empresa_id: empresaId })); } catch (e) { setErro(e.message); }
  };
  const removerPlano = async () => {
    try { await api.delete(`/produtos/validacoes/${idAuto}/plano-contas?empresa_id=${encodeURIComponent(empresaId || "")}`); setPlano(null); } catch (e) { setErro(e.message); }
  };

  const abrirSalva = async (v) => {
    setErro(""); setAbrindo(v.id);
    try {
      if (v.status === "RASCUNHO") {
        // Retomar de onde parou: colunas, parâmetros e linhas marcadas exatamente como foram autosalvos.
        const d = await api.get(`/produtos/validacoes/${v.id}/colunas`, { empresa_id: empresaId });
        setArquivo(null); setResultado(null); setPrevia(d); setMapa(d.mapeamento || {}); if (d.opcoes) setOpcoes(d.opcoes);
        setExcluir(d.excluir || []); setRascunhoId(v.id); setPlano(d.plano || null); setAutosave(null); setEtapa("colunas");
        return;
      }
      const r = await api.get(`/produtos/validacoes/${v.id}`, { empresa_id: empresaId });
      if (r.opcoes) setOpcoes(r.opcoes);
      setExcluir(r.excluir || []); setRascunhoId(null); setAutosave(null);
      setArquivo(null); setResultado(r); setMapa(r.mapeamento || {}); setEtapa("resultado"); setFiltro("TODOS"); setAba("TODOS"); setPeriodoFiltro("ANALISE");
    } catch (e) {
      setErro(e.message);
    } finally {
      setAbrindo(null);
    }
  };

  const validacaoId = searchParams.get('validacao');
  useEffect(() => { if (!publico && validacaoId) abrirSalva({ id: validacaoId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validacaoId, empresaId, publico]);

  const painelOpcoes = !publico && <fieldset className="rounded-xl border border-border p-5 space-y-4"><legend className="font-medium px-2">{modoProjeto ? "Análises a executar" : "Escopo do saneamento"}</legend><p className="text-sm">NCM: validação obrigatória em todas as análises.</p><div className="flex flex-wrap gap-4">{[['cClassTrib','Conferir cClassTrib'],['duplicidades','Investigar duplicidades'],['principioAtivo','Comparar princípio ativo, concentração e formulação'],['grupos','Sugerir grupos de produto pelo uso do cliente neste arquivo (só com certeza alta)'],['gruposContabeis','Análise contábil: conta atual × sugerida (requer o de-para da empresa)']].map(([k, nome]) => <label key={k} className="text-sm flex items-center gap-2"><input type="checkbox" checked={opcoes[k]} onChange={e => mudarOpcao(k, e.target.checked)} />{nome}</label>)}</div>{opcoes.gruposContabeis && <div className="rounded-lg border border-dashed border-border p-3 space-y-2"><p className="text-sm font-medium">De-para contábil da empresa</p><p className="text-xs text-muted-foreground">Arquivo .xlsx ou .csv com uma coluna <b>cClassTrib</b> (ou <b>Grupo sugerido</b>) e uma coluna <b>Conta contábil</b> (opcional: <b>Nome da conta</b>). O InTAX só sugere a conta que o seu de-para indica; sem regra para o item, nenhuma conta é sugerida.</p>{!idAuto ? <p className="text-xs text-muted-foreground">Envie a planilha de produtos primeiro para anexar o de-para.</p> : <div className="flex flex-wrap items-center gap-2"><input type="file" accept=".xlsx,.csv,.txt" onChange={(e) => anexarPlano(e.target.files?.[0])} className="text-xs" />{plano && <span className="text-xs">Anexado: <b>{plano.nome}</b> ({plano.linhas} regras) <button type="button" onClick={removerPlano} className="underline text-destructive ml-1">remover</button></span>}</div>}{opcoes.gruposContabeis && !plano && idAuto && <p className="text-xs text-amber-700 dark:text-amber-300">Sem de-para anexado, o resultado mostra só a conta atual.</p>}</div>}{!modoProjeto && <div><p className="text-sm font-medium mb-2">ERPs de referência</p><div className="flex flex-wrap gap-4">{[...ERPS,...opcoes.erps.filter(e=>!ERPS.includes(e))].map(erp => <label key={erp} className="text-sm flex gap-2"><input type="checkbox" checked={opcoes.erps.includes(erp)} onChange={e => mudarOpcao('erps', e.target.checked ? [...opcoes.erps, erp] : opcoes.erps.filter(x => x !== erp))} />{erp}</label>)}</div><p className="text-xs text-muted-foreground mt-2">A seleção registra o contexto do ERP. Regras específicas e sugestões contábeis dependem de perfis e plano de contas homologados.</p></div>}{modoProjeto ? <p className="text-xs text-muted-foreground">O corte por movimentação (itens não movimentados desde uma data, e o que fazer com os itens sem data) é definido no <b>Parâmetro de saneamento</b>, logo após o processamento. Nesta etapa, só indique qual coluna traz a data da última movimentação.</p> : <><div className="flex flex-wrap gap-3"><label className="text-sm">De <input aria-label="Data inicial do corte" type="date" value={opcoes.dataInicio} onChange={e => mudarOpcao('dataInicio', e.target.value)} className="border rounded p-2 bg-background" /></label><label className="text-sm">Até <input aria-label="Data final do corte" type="date" value={opcoes.dataFim} onChange={e => mudarOpcao('dataFim', e.target.value)} className="border rounded p-2 bg-background" /></label></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Atalho — sanear só quem movimentou nos últimos:</span>{[6, 12, 18, 24, 36].map(m => <button key={m} type="button" onClick={() => { mudarOpcao("dataInicio", mesesAtras(m)); mudarOpcao("dataFim", ""); }} className="px-2.5 py-1 rounded-full border border-border hover:bg-muted">{m} meses</button>)}{(opcoes.dataInicio || opcoes.dataFim) && <button type="button" onClick={() => { mudarOpcao("dataInicio", ""); mudarOpcao("dataFim", ""); }} className="px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted">Limpar período</button>}</div><p className="text-xs text-muted-foreground">Deixe as datas vazias para analisar todo o arquivo. Com período, indique a coluna da data da última movimentação (ou do cadastro): quem tem data fora do período sai do saneamento e vai para uma aba separada da planilha; quem não tem data legível continua na análise, sinalizado. Datas lidas como dia/mês/ano. <Link className="text-primary underline" to="/ferramentas/consulta-ncm" target="_blank" rel="noreferrer">Abrir consulta NCM</Link></p></>}</fieldset>;

  const baixarModelo = () => api.baixar("GET", "/public/produtos/modelo", { nome: "modelo-cadastro-produtos-intax.xlsx" }).catch((e) => setErro(e.message));
  const copiarCab = async () => {
    try { await navigator.clipboard.writeText(CABECALHO_MODELO.join("\t")); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { setErro("Não foi possível copiar. Selecione e copie manualmente: " + CABECALHO_MODELO.join(", ")); }
  };
  const exportar = async () => {
    try {
      if (!publico && resultado?.validacao_id) {
        // Garante que as linhas marcadas já estão salvas e baixa o resultado guardado (inclui grupos, conta sugerida e período).
        await api.put(`/produtos/validacoes/${resultado.validacao_id}/progresso`, { excluir, empresa_id: empresaId });
        await api.baixar("GET", `/produtos/validacoes/${resultado.validacao_id}/exportar`, { nome: "cadastro-validado-intax.xlsx" });
      } else if (arquivo) {
        await api.baixar("POST", "/produtos/exportar", { file: arquivo, campos: { mapeamento: mapa, opcoes, excluir }, nome: "cadastro-validado-intax.xlsx" });
      }
    } catch (e) { setErro(e.message); }
  };

  useEffect(() => {
    if (!idAuto || (etapa !== "colunas" && etapa !== "resultado")) return undefined;
    const t = setTimeout(async () => {
      setAutosave({ estado: "salvando" });
      try {
        // Em análise já processada o servidor só guarda as linhas marcadas (os parâmetros dela mudam ao refazer).
        await api.put(`/produtos/validacoes/${idAuto}/progresso`, { mapeamento: mapa, opcoes, excluir, empresa_id: empresaId });
        setAutosave({ estado: "salvo", em: new Date() });
        qc.invalidateQueries({ queryKey: ["validacoes-cadastro"] });
      } catch { setAutosave({ estado: "erro" }); }
    }, 900);
    return () => clearTimeout(t);
  }, [idAuto, etapa, mapa, opcoes, excluir, empresaId, qc]);
  const indicadorAutosave = !publico && idAuto && autosave && (
    <span className={`text-xs ${autosave.estado === "erro" ? "text-destructive" : "text-muted-foreground"}`}>
      {autosave.estado === "salvando" && "Salvando…"}
      {autosave.estado === "salvo" && `Salvo automaticamente às ${autosave.em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
      {autosave.estado === "erro" && "Não foi possível salvar automaticamente"}
    </span>
  );

  const itensFiltrados = useMemo(() => {
    if (!resultado) return [];
    const abaAtual = ABAS.find((a) => a.id === aba) || ABAS[0];
    return resultado.itens.filter((i) => {
      if (periodoFiltro === "FORA") return false;
      if (!abaAtual.testa(i)) return false;
      if (problemasSelecionados.length && !i.problemas.some(p => problemasSelecionados.includes(p.codigo))) return false;
      return !(filtro === "PROBLEMAS" ? i.situacao === "OK" : filtro !== "TODOS" && i.situacao !== filtro);
    });
  }, [resultado, filtro, problemasSelecionados, periodoFiltro, aba]);

  const contagemAbas = useMemo(() => Object.fromEntries(ABAS.map((a) => [a.id, resultado ? resultado.itens.filter(a.testa).length : 0])), [resultado]);

  // ── Etapa 1: enviar ──
  if (etapa === "enviar") {
    return (
      <div className="space-y-5">
        {!publico && !modoProjeto && empresa && <ConhecimentoEmpresa empresa={empresa} />}
        {painelOpcoes}
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${arrastando ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => receber(e.target.files?.[0])} />
          {carregando ? <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" /> : <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground" />}
          <p className="mt-3 font-medium">{carregando ? "Lendo o arquivo…" : "Arraste sua planilha aqui ou clique para escolher"}</p>
          <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx) ou CSV{publico ? " · até 300 produtos, 2 MB" : " · até 50 mil produtos"}</p>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {!publico && !modoProjeto && <HistoricoValidacoes empresaId={empresaId} onAbrir={abrirSalva} abrindo={abrindo} />}

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-heading font-semibold text-sm">Como preparar a planilha</h3>
          <p className="text-sm text-muted-foreground">Uma linha por produto. Colunas: <b className="text-foreground">Código, Descrição e NCM</b> (obrigatórias) e Unidade, Origem e cClassTrib (opcionais).</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={baixarModelo} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted">
              <Download className="w-4 h-4" /> Baixar planilha modelo
            </button>
            <button type="button" onClick={copiarCab} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted">
              {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? "Cabeçalho copiado — cole no Excel" : "Copiar cabeçalho"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Etapa 2: conferir colunas ──
  if (etapa === "colunas" && previa) {
    const tem = k => mapa[k] !== null && mapa[k] !== undefined && mapa[k] !== "";
    const obrigatoriosOk = tem("ncm") && (publico || ((!opcoes.duplicidades || tem("descricao")) && (!opcoes.principioAtivo || tem("principio_ativo")) && (!opcoes.grupos || tem("grupo_produto")) && (!opcoes.gruposContabeis || tem("grupo_contabil")) && (!(opcoes.dataInicio || opcoes.dataFim) || tem("data_cadastro"))));
    const indicesMapeados = new Set(Object.values(mapa).filter((v) => v !== null && v !== undefined && v !== ""));
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="w-4 h-4" /> <b className="text-foreground">{arquivo?.name || previa?.nome_arquivo || resultado?.nome_arquivo}</b> · {previa.total_linhas.toLocaleString("pt-BR")} produtos
          {publico && previa.total_linhas > 300 && <span className="text-amber-600">(a amostra analisa os 300 primeiros)</span>}
        </div>

        {painelOpcoes}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-heading font-semibold text-sm mb-1">Confirme as colunas</h3>
          <p className="text-xs text-muted-foreground mb-4">Reconhecemos automaticamente o que foi possível. Ajuste se algo estiver errado.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {previa.campos.map((c) => (
              <div key={c.campo}>
                <label className="text-xs font-medium">{c.rotulo}{c.obrigatorio && <span className="text-destructive"> *</span>}</label>
                <select
                  value={mapa[c.campo] ?? ""}
                  onChange={(e) => setMapa((m) => ({ ...m, [c.campo]: e.target.value === "" ? null : Number(e.target.value) }))}
                  className={`w-full h-10 mt-1 rounded-md border bg-background px-2 text-sm ${c.obrigatorio && (mapa[c.campo] === null || mapa[c.campo] === undefined) ? "border-destructive" : "border-input"}`}
                >
                  <option value="">{c.obrigatorio ? "— escolha a coluna —" : "— não tenho —"}</option>
                  {previa.colunas.map((col) => <option key={col.indice} value={col.indice}>{col.nome}{col.exemplo ? ` (ex.: ${String(col.exemplo).slice(0, 24)})` : ""}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-left text-muted-foreground">
              {previa.colunas.map((c) => <th key={c.indice} className={`px-2 py-1.5 font-medium whitespace-nowrap ${indicesMapeados.has(c.indice) ? "bg-primary/10 text-foreground" : ""}`}>{c.nome}</th>)}
            </tr></thead>
            <tbody>
              {previa.previa.slice(0, 6).map((l, i) => (
                <tr key={i} className="border-b border-border last:border-0 align-middle">
                  {l.map((v, j) => <td key={j} className={`px-2 py-1 whitespace-nowrap ${indicesMapeados.has(j) ? "bg-primary/5" : ""}`}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <div className="flex gap-2">
          {indicadorAutosave}
          {resultado && <button type="button" onClick={() => setEtapa("resultado")} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">Voltar ao resultado</button>}
          <button type="button" onClick={reiniciar} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">Trocar arquivo</button>
          <button type="button" disabled={!obrigatoriosOk || carregando} onClick={() => validar()} className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {carregando && <Loader2 className="w-4 h-4 animate-spin" />} {carregando ? (modoProjeto ? "Processando…" : "Validando…") : (modoProjeto ? "Processar base" : "Validar cadastro")}
          </button>
        </div>
        {!obrigatoriosOk && <p className="text-xs text-destructive">Mapeie o NCM e as colunas exigidas pelo escopo selecionado (descrição, unidade, princípio ativo e data, quando aplicável).</p>}
      </div>
    );
  }

  // ── Etapa 3: resultado ──
  if (etapa === "resultado" && resultado) {
    const r = resultado.resumo;
    const opRes = resultado.opcoes || {};
    const bloqueado = publico && resultado.modo !== "completo";
    return (
      <div className="space-y-5">
        {resultado.avisos?.map(a => <p key={a} className="text-sm text-amber-700 dark:text-amber-300">{a}</p>)}
        {r.periodo && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-sm">
              Base enviada: <b>{r.periodo.base.toLocaleString("pt-BR")}</b> produtos. Período {dataBr(r.periodo.inicio)} a {r.periodo.fim ? dataBr(r.periodo.fim) : "hoje"}: movimentaram <b className="text-primary">{r.periodo.dentro.toLocaleString("pt-BR")}</b>
              {r.periodo.sem_data + r.periodo.data_invalida > 0 && <> · sem data legível (mantidos na análise): <b>{(r.periodo.sem_data + r.periodo.data_invalida).toLocaleString("pt-BR")}</b></>}
              {" "}· sem movimento no período: <b>{r.periodo.fora.toLocaleString("pt-BR")}</b>.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {[["ANALISE", "No saneamento"], ["FORA", "Sem movimento no período"]].map(([v, rot]) => (
                <button key={v} type="button" onClick={() => { setPeriodoFiltro(v); setAba(v === "FORA" ? "FORA" : "TODOS"); }} className={`px-3 py-1.5 rounded-full border ${periodoFiltro === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{rot}</button>
              ))}
            </div>
            {periodoFiltro === "FORA" && <p className="text-xs text-muted-foreground">Estes produtos não entram no saneamento: são candidatos a inativar no ERP. A lista completa vai numa aba própria da planilha baixada.</p>}
          </div>
        )}
        {r.grupos?.length > 0 && (
          <details className="rounded-xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Grupos sugeridos pelo uso do cliente ({r.grupos.length})</summary>
            <div className="mt-3 overflow-auto max-h-[50vh]">
              <TabelaPadrao id="validador:grupos-sugeridos" ariaLabel="Grupos sugeridos pelo uso do cliente" simples colunas={COLUNAS_GRUPOS_SUGERIDOS} linhas={r.grupos} chaveLinha={(g) => g.grupo} />
            </div>
          </details>
        )}
        <div role="tablist" aria-label="Análises" className="flex flex-wrap gap-2">
          {[...ABAS.filter((a) => !a.so || opRes[a.so]), ...(r.periodo ? [{ id: "FORA", titulo: "Sem movimento no período" }] : [])].map((a) => {
            const n = a.id === "FORA" ? r.periodo?.fora ?? 0 : contagemAbas[a.id];
            const ativa = aba === a.id;
            return (
              <button key={a.id} type="button" role="tab" aria-selected={ativa} onClick={() => { setAba(a.id); setPeriodoFiltro(a.id === "FORA" ? "FORA" : "ANALISE"); if (a.id === "TODOS") { setFiltro("TODOS"); setProblemasSelecionados([]); } }}
                className={`px-3 py-1.5 rounded-full border text-xs whitespace-nowrap ${ativa ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {a.titulo} <b className="tabular-nums">({n.toLocaleString("pt-BR")})</b>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao titulo="Produtos analisados" valor={r.total} ativo={filtro === "TODOS"} onClick={() => setFiltro("TODOS")} />
          <Cartao titulo="Sem problemas" valor={r.ok} cor="text-emerald-600" ativo={filtro === "OK"} onClick={() => setFiltro("OK")} />
          <Cartao titulo="Atenção" valor={r.alerta} cor="text-amber-600" ativo={filtro === "ALERTA"} onClick={() => setFiltro("ALERTA")} />
          <Cartao titulo="Corrigir" valor={r.erro} cor="text-red-600" ativo={filtro === "ERRO"} onClick={() => setFiltro("ERRO")} />
        </div>

        {r.referencias_anexo > 0 && (
          <p className="text-xs text-muted-foreground"><b className="text-foreground">{r.referencias_anexo.toLocaleString("pt-BR")}</b> itens estão em capítulo/posição que um anexo cita por inteiro (ex.: Anexo IX, item 2 — Capítulo 31): nenhuma classe foi sugerida e o enquadramento deve ser revisado conforme os requisitos do item. Clique em "Base na lei" para ler o anexo.</p>
        )}
        {r.tributacao_padrao !== undefined && (
          <p className="text-xs text-muted-foreground">cClassTrib sugerido: <b className="text-foreground">{r.com_sugestao.toLocaleString("pt-BR")}</b> com benefício identificado nos anexos da LC 214 · <b className="text-foreground">{r.tributacao_padrao.toLocaleString("pt-BR")}</b> sem enquadramento nos anexos consultados (sugestão padrão 000001). Anexos consultados: {(r.anexos_consultados || []).join(", ")}. Isto não indica ausência de benefício por outra base legal (produtor rural, regime específico) e o Anexo XI (bens de soberania e segurança) ainda não está mapeado por NCM.</p>
        )}
        {!r.catalogo_ncm_carregado && <p className="text-xs text-amber-600">A tabela oficial de NCM ainda não está carregada neste ambiente: a existência do NCM não foi conferida.</p>}
        {r.truncado && <p className="text-xs text-muted-foreground">Arquivo com {r.linhas_no_arquivo.toLocaleString("pt-BR")} linhas: a amostra analisou as primeiras {r.total}.</p>}

        {r.por_problema.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.por_problema.filter((p) => p.codigo !== "CLASSE_SUGERIDA" && p.codigo !== "NCM_ZERO_RESTAURADO").slice(0, 8).map((p) => (
              <label key={p.codigo} className="text-xs px-2 py-1 rounded-full bg-muted flex gap-2"><input type="checkbox" checked={problemasSelecionados.includes(p.codigo)} onChange={e => { setProblemasSelecionados(s => e.target.checked ? [...s, p.codigo] : s.filter(x => x !== p.codigo)); setFiltro("TODOS"); }} />{ROTULO_PROBLEMA[p.codigo] || p.codigo}: <b>{p.qtd}</b></label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <div className="flex flex-wrap items-center gap-2">
            {indicadorAutosave}
            {!publico && resultado.validacao_id && <button type="button" onClick={ajustar} disabled={carregando} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-primary text-primary text-sm hover:bg-primary/5 disabled:opacity-50">{carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />} Ajustar parâmetros e refazer</button>}
            <button type="button" onClick={reiniciar} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"><RotateCcw className="w-4 h-4" /> Validar outro arquivo</button>
            {!publico && <button type="button" onClick={exportar} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"><Download className="w-4 h-4" /> Baixar planilha corrigida</button>}
          </div>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {!publico && arquivo && <p className="text-xs text-muted-foreground">Selecione as linhas duplicadas que deseja retirar da cópia saneada ({excluir.length} selecionadas). A exportação mantém o relatório completo e registra as exclusões em aba separada. O cadastro do ERP não é alterado.</p>}
        {/* Mesma estrutura da planilha corrigida (ver ProdutosService.exportarXlsx): uma linha por produto, um dado por coluna, nada empilhado dentro da célula. */}
        {r.periodo && periodoFiltro === "FORA" ? (
          <TabelaPadrao id="validador:fora-periodo" ariaLabel="Sem movimento no período" colunas={COLUNAS_FORA} linhas={resultado.fora_periodo || []} chaveLinha={(f) => f.linha} tamanhoInicial={100} vazio="Nenhum item sem movimento no período." />
        ) : (
          <TabelaPadrao id="validador:itens" ariaLabel="Itens validados" tamanhoInicial={100} vazio="Nenhum item neste filtro." linhas={itensFiltrados} chaveLinha={(i) => i.linha}
            colunas={colunasDosItens({ opRes, periodo: !!r.periodo, podeExcluir: !publico && !!arquivo, excluir, setExcluir, aoComparar: setComparativo, aoAbrirAnexo: setBaseLeiAberta })} />
        )}

        <ComparativoDuplicidade item={comparativo} itens={resultado.itens} excluir={excluir} setExcluir={setExcluir} podeExcluir={!publico && !!arquivo} onFechar={() => setComparativo(null)} />
        <AnexoLeiPainel baseLei={baseLeiAberta} onFechar={() => setBaseLeiAberta(null)} />

        {bloqueado && resultado.detalhes_bloqueados && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-1">
            <div className="flex items-center gap-2 px-4 pt-4 text-sm font-medium"><Lock className="w-4 h-4" /> Há mais itens com problemas. Veja o detalhe completo:</div>
            <LeadForm
              origem="validador_cadastro" titulo="Libere o resultado completo" subtitulo="Informe seus dados e mostramos todos os itens com o que corrigir."
              botao="Ver resultado completo" dados={{ produtos: r.total, corrigir: r.erro, atencao: r.alerta }}
              onSucesso={(l) => { setEmailLiberado(l.email); validar(l.email); }}
            />
          </div>
        )}
        {publico && resultado.modo === "completo" && (
          <p className="text-sm text-muted-foreground">Quer validar o cadastro inteiro (sem limite de itens), com planilha corrigida para o seu ERP? Fale com a equipe FAL Agro para o diagnóstico InTAX.</p>
        )}
        <p className="text-[11px] text-muted-foreground">Sugestões orientativas, baseadas nos anexos da LC 214/2025 já mapeados. A classificação fiscal é responsabilidade do contribuinte e deve ser validada por um especialista.</p>
      </div>
    );
  }
  return null;
}
