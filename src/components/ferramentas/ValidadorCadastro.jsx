import { ERPS } from "@/lib/conhecimentoSistemas";
import ConhecimentoEmpresa from "@/components/ConhecimentoEmpresa";
import { Link, useParams, useSearchParams } from "react-router-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, UploadCloud, FileSpreadsheet, Copy, Check, Download, Loader2, RotateCcw, Search, Lock } from "lucide-react";
import { api } from "@/api/base44Client";
import LeadForm from "@/components/ferramentas/LeadForm";
import HistoricoValidacoes from "@/components/ferramentas/HistoricoValidacoes";
import { useQueryClient } from "@tanstack/react-query";

const CABECALHO_MODELO = ["Codigo", "Descricao", "NCM", "Unidade", "Origem", "cClassTrib"];

const ROTULO_PROBLEMA = {
  DUPLICIDADE_EXATA: "Descrição e unidade iguais", POSSIVEL_DUPLICIDADE: "Possível duplicidade",
  NCM_AUSENTE: "NCM ausente", NCM_FORMATO: "NCM com formato errado", NCM_INEXISTENTE: "NCM inexistente", NCM_INATIVO: "NCM não vigente",
  NCM_ZERO_RESTAURADO: "Zero à esquerda corrigido", DATA_INVALIDA: "Data de movimentação não reconhecida", SEM_DATA_MOVIMENTO: "Sem data de movimentação", CODIGO_AUSENTE: "Sem código", DESCRICAO_AUSENTE: "Sem descrição",
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
const POR_PAGINA = 50;

// Mesma ordem e títulos da planilha corrigida (ProdutosService.exportarXlsx).
const mesesAtras = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "…");
const COLUNAS_PERIODO = [
  { chave: "ultima_mov", titulo: "Última movimentação" },
  { chave: "periodo", titulo: "No período" },
];
const ROT_PERIODO = { DENTRO: "Dentro", SEM_DATA: "Sem data", DATA_INVALIDA: "Data inválida" };
const COR_PERIODO = {
  DENTRO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  SEM_DATA: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  DATA_INVALIDA: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};
const COLUNAS = [
  { chave: "linha", titulo: "Linha", alinhar: "text-right" },
  { chave: "codigo", titulo: "Código" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "unidade", titulo: "Unidade" },
  { chave: "principio_ativo", titulo: "Princípio ativo" },
  { chave: "grupo_contabil", titulo: "Grupo contábil atual" },
  { chave: "ncm_original", titulo: "NCM informado" },
  { chave: "ncm", titulo: "NCM corrigido" },
  { chave: "situacao", titulo: "Situação" },
  { chave: "problemas", titulo: "Problemas encontrados" },
  { chave: "informado", titulo: "cClassTrib informado" },
  { chave: "sugerido", titulo: "cClassTrib sugerido" },
  { chave: "reducao", titulo: "Redução sugerida", alinhar: "text-right" },
  { chave: "confianca", titulo: "Confiança" },
  { chave: "anexo", titulo: "Base na lei" },
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
export default function ValidadorCadastro({ modo = "interno", empresa }) {
  const publico = modo === "publico";
  const { empresaId } = useParams();
  const [searchParams] = useSearchParams();
  const [opcoes, setOpcoes] = useState({ cClassTrib: true, duplicidades: true, principioAtivo: false, dataInicio: "", dataFim: "", erps: empresa?.erp ? [empresa.erp] : [], addons: empresa?.addons || [], gruposContabeis: false });
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
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [filtro, setFiltro] = useState("PROBLEMAS");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [emailLiberado, setEmailLiberado] = useState("");
  const inputRef = useRef(null);
  const qc = useQueryClient();
  const [abrindo, setAbrindo] = useState(null);

  const rotaPrevia = publico ? "/public/produtos/amostra" : "/produtos/ler";
  const rotaValidar = publico ? "/public/produtos/amostra" : "/produtos/validar";

  const reiniciar = () => {
    setExcluir([]); setProblemasSelecionados([]); setPeriodoFiltro("ANALISE");
    setEtapa("enviar"); setArquivo(null); setPrevia(null); setMapa({}); setResultado(null); setErro("");
    setFiltro("PROBLEMAS"); setBusca(""); setPagina(0); setEmailLiberado("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const receber = async (file) => {
    if (!file) return;
    setErro(""); setCarregando(true);
    try {
      const r = await api.upload(rotaPrevia, file, publico ? { somente_ler: "true" } : {});
      setArquivo(file); setPrevia(r); setMapa(r.mapeamento || {}); setEtapa("colunas");
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
      const idSalvo = !publico && resultado?.validacao_id;
      const r = idSalvo
        ? await api.post(`/produtos/validacoes/${idSalvo}/refazer`, { mapeamento: mapa, opcoes, empresa_id: empresaId })
        : await api.upload(rotaValidar, arquivo, { mapeamento: mapa, ...(!publico ? { empresa_id: empresaId, opcoes } : {}), ...(publico && (email || emailLiberado) ? { email: email || emailLiberado } : {}) });
      setExcluir([]); setPeriodoFiltro("ANALISE"); setResultado(r); setEtapa("resultado"); setPagina(0);
      if (!publico) qc.invalidateQueries({ queryKey: ["validacoes-cadastro"] });
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
      try { setPrevia(await api.get(`/produtos/validacoes/${resultado.validacao_id}/colunas`, { empresa_id: empresaId })); } catch (e) { setErro(e.message); setCarregando(false); return; }
      setCarregando(false);
    }
    if (resultado?.mapeamento) setMapa(resultado.mapeamento);
    if (resultado?.opcoes) setOpcoes(resultado.opcoes);
    setExcluir([]); setEtapa("colunas");
  };

  const abrirSalva = async (v) => {
    setErro(""); setAbrindo(v.id);
    try {
      const r = await api.get(`/produtos/validacoes/${v.id}`, { empresa_id: empresaId });
      if (r.opcoes) setOpcoes(r.opcoes);
      setArquivo(null); setResultado(r); setMapa(r.mapeamento || {}); setEtapa("resultado"); setPagina(0); setFiltro("PROBLEMAS"); setBusca(""); setPeriodoFiltro("ANALISE");
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

  const painelOpcoes = !publico && <fieldset className="rounded-xl border border-border p-5 space-y-4"><legend className="font-medium px-2">Escopo do saneamento</legend><p className="text-sm">NCM: validação obrigatória em todas as análises.</p><div className="flex flex-wrap gap-4">{[['cClassTrib','Conferir cClassTrib'],['duplicidades','Investigar duplicidades'],['principioAtivo','Comparar princípio ativo, concentração e formulação'],['gruposContabeis','Analisar grupos contábeis (requer plano de referência)']].map(([k, nome]) => <label key={k} className="text-sm flex items-center gap-2"><input type="checkbox" checked={opcoes[k]} onChange={e => mudarOpcao(k, e.target.checked)} />{nome}</label>)}</div><div><p className="text-sm font-medium mb-2">ERPs de referência</p><div className="flex flex-wrap gap-4">{[...ERPS,...opcoes.erps.filter(e=>!ERPS.includes(e))].map(erp => <label key={erp} className="text-sm flex gap-2"><input type="checkbox" checked={opcoes.erps.includes(erp)} onChange={e => mudarOpcao('erps', e.target.checked ? [...opcoes.erps, erp] : opcoes.erps.filter(x => x !== erp))} />{erp}</label>)}</div><p className="text-xs text-muted-foreground mt-2">A seleção registra o contexto do ERP. Regras específicas e sugestões contábeis dependem de perfis e plano de contas homologados.</p></div><div className="flex flex-wrap gap-3"><label className="text-sm">De <input aria-label="Data inicial do corte" type="date" value={opcoes.dataInicio} onChange={e => mudarOpcao('dataInicio', e.target.value)} className="border rounded p-2 bg-background" /></label><label className="text-sm">Até <input aria-label="Data final do corte" type="date" value={opcoes.dataFim} onChange={e => mudarOpcao('dataFim', e.target.value)} className="border rounded p-2 bg-background" /></label></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Atalho — sanear só quem movimentou nos últimos:</span>{[6, 12, 18, 24, 36].map(m => <button key={m} type="button" onClick={() => { mudarOpcao("dataInicio", mesesAtras(m)); mudarOpcao("dataFim", ""); }} className="px-2.5 py-1 rounded-full border border-border hover:bg-muted">{m} meses</button>)}{(opcoes.dataInicio || opcoes.dataFim) && <button type="button" onClick={() => { mudarOpcao("dataInicio", ""); mudarOpcao("dataFim", ""); }} className="px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted">Limpar período</button>}</div><p className="text-xs text-muted-foreground">Deixe as datas vazias para analisar todo o arquivo. Com período, indique a coluna da data da última movimentação (ou do cadastro): quem tem data fora do período sai do saneamento e vai para uma aba separada da planilha; quem não tem data legível continua na análise, sinalizado. Datas lidas como dia/mês/ano. <Link className="text-primary underline" to="/ferramentas/consulta-ncm" target="_blank" rel="noreferrer">Abrir consulta NCM</Link></p></fieldset>;

  const baixarModelo = () => api.baixar("GET", "/public/produtos/modelo", { nome: "modelo-cadastro-produtos-intax.xlsx" }).catch((e) => setErro(e.message));
  const copiarCab = async () => {
    try { await navigator.clipboard.writeText(CABECALHO_MODELO.join("\t")); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { setErro("Não foi possível copiar. Selecione e copie manualmente: " + CABECALHO_MODELO.join(", ")); }
  };
  const exportar = () => (arquivo
    ? api.baixar("POST", "/produtos/exportar", { file: arquivo, campos: { mapeamento: mapa, opcoes, excluir }, nome: "cadastro-validado-intax.xlsx" })
    : api.baixar("GET", `/produtos/validacoes/${resultado?.validacao_id}/exportar`, { nome: "cadastro-validado-intax.xlsx" })
  ).catch((e) => setErro(e.message));

  const itensFiltrados = useMemo(() => {
    if (!resultado) return [];
    const t = busca.trim().toLowerCase();
    return resultado.itens.filter((i) => {
      if (periodoFiltro === "FORA") return false;
      if (problemasSelecionados.length && !i.problemas.some(p => problemasSelecionados.includes(p.codigo))) return false;
      if (filtro === "PROBLEMAS" ? i.situacao === "OK" : filtro !== "TODOS" && i.situacao !== filtro) return false;
      if (!t) return true;
      return `${i.codigo} ${i.descricao} ${i.ncm_original}`.toLowerCase().includes(t);
    });
  }, [resultado, filtro, busca, problemasSelecionados, periodoFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(itensFiltrados.length / POR_PAGINA));
  const visiveis = itensFiltrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  // ── Etapa 1: enviar ──
  if (etapa === "enviar") {
    return (
      <div className="space-y-5">
        {!publico && empresa && <ConhecimentoEmpresa empresa={empresa} />}
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

        {!publico && <HistoricoValidacoes empresaId={empresaId} onAbrir={abrirSalva} abrindo={abrindo} />}

        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
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
          <p className="text-xs text-muted-foreground">Exportou direto do ERP (Protheus, SAP, Sankhya…)? Envie como está: na próxima tela você indica qual coluna é qual, e o sistema tenta reconhecer sozinho.</p>
        </div>
      </div>
    );
  }

  // ── Etapa 2: conferir colunas ──
  if (etapa === "colunas" && previa) {
    const tem = k => mapa[k] !== null && mapa[k] !== undefined && mapa[k] !== "";
    const obrigatoriosOk = tem("ncm") && (publico || ((!opcoes.duplicidades || (tem("descricao") && tem("unidade"))) && (!opcoes.principioAtivo || tem("principio_ativo")) && (!(opcoes.dataInicio || opcoes.dataFim) || tem("data_cadastro"))));
    const indicesMapeados = new Set(Object.values(mapa).filter((v) => v !== null && v !== undefined && v !== ""));
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="w-4 h-4" /> <b className="text-foreground">{arquivo?.name || resultado?.nome_arquivo}</b> · {previa.total_linhas.toLocaleString("pt-BR")} produtos
          {publico && previa.total_linhas > 300 && <span className="text-amber-600">(a amostra analisa os 300 primeiros)</span>}
        </div>

        {painelOpcoes}
        <div className="rounded-xl border border-border bg-card p-5">
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
              {previa.colunas.map((c) => <th key={c.indice} className={`px-3 py-2 font-medium whitespace-nowrap ${indicesMapeados.has(c.indice) ? "bg-primary/10 text-foreground" : ""}`}>{c.nome}</th>)}
            </tr></thead>
            <tbody>
              {previa.previa.slice(0, 6).map((l, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {l.map((v, j) => <td key={j} className={`px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate ${indicesMapeados.has(j) ? "bg-primary/5" : ""}`}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <div className="flex gap-2">
          {resultado && <button type="button" onClick={() => setEtapa("resultado")} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">Voltar ao resultado</button>}
          <button type="button" onClick={reiniciar} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">Trocar arquivo</button>
          <button type="button" disabled={!obrigatoriosOk || carregando} onClick={() => validar()} className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {carregando && <Loader2 className="w-4 h-4 animate-spin" />} {carregando ? "Validando…" : "Validar cadastro"}
          </button>
        </div>
        {!obrigatoriosOk && <p className="text-xs text-destructive">Mapeie o NCM e as colunas exigidas pelo escopo selecionado (descrição, unidade, princípio ativo e data, quando aplicável).</p>}
      </div>
    );
  }

  // ── Etapa 3: resultado ──
  if (etapa === "resultado" && resultado) {
    const r = resultado.resumo;
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
                <button key={v} type="button" onClick={() => { setPeriodoFiltro(v); setPagina(0); }} className={`px-3 py-1.5 rounded-full border ${periodoFiltro === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{rot}</button>
              ))}
            </div>
            {periodoFiltro === "FORA" && <p className="text-xs text-muted-foreground">Estes produtos não entram no saneamento: são candidatos a inativar no ERP. A lista completa vai numa aba própria da planilha baixada.</p>}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao titulo="Produtos analisados" valor={r.total} ativo={filtro === "TODOS"} onClick={() => { setFiltro("TODOS"); setPagina(0); }} />
          <Cartao titulo="Sem problemas" valor={r.ok} cor="text-emerald-600" ativo={filtro === "OK"} onClick={() => { setFiltro("OK"); setPagina(0); }} />
          <Cartao titulo="Atenção" valor={r.alerta} cor="text-amber-600" ativo={filtro === "ALERTA"} onClick={() => { setFiltro("ALERTA"); setPagina(0); }} />
          <Cartao titulo="Corrigir" valor={r.erro} cor="text-red-600" ativo={filtro === "ERRO"} onClick={() => { setFiltro("ERRO"); setPagina(0); }} />
        </div>

        {r.tributacao_padrao !== undefined && (
          <p className="text-xs text-muted-foreground">cClassTrib sugerido: <b className="text-foreground">{r.com_sugestao.toLocaleString("pt-BR")}</b> com benefício identificado nos anexos da LC 214 · <b className="text-foreground">{r.tributacao_padrao.toLocaleString("pt-BR")}</b> sem benefício nos anexos consultados (sugestão padrão 000001 — confirme se há outra base legal, como produtor rural ou regime específico).</p>
        )}
        {!r.catalogo_ncm_carregado && <p className="text-xs text-amber-600">A tabela oficial de NCM ainda não está carregada neste ambiente: a existência do NCM não foi conferida.</p>}
        {r.truncado && <p className="text-xs text-muted-foreground">Arquivo com {r.linhas_no_arquivo.toLocaleString("pt-BR")} linhas: a amostra analisou as primeiras {r.total}.</p>}

        {r.por_problema.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.por_problema.filter((p) => p.codigo !== "CLASSE_SUGERIDA" && p.codigo !== "NCM_ZERO_RESTAURADO").slice(0, 8).map((p) => (
              <label key={p.codigo} className="text-xs px-2 py-1 rounded-full bg-muted flex gap-2"><input type="checkbox" checked={problemasSelecionados.includes(p.codigo)} onChange={e => { setProblemasSelecionados(s => e.target.checked ? [...s, p.codigo] : s.filter(x => x !== p.codigo)); setFiltro("TODOS"); setPagina(0); }} />{ROTULO_PROBLEMA[p.codigo] || p.codigo}: <b>{p.qtd}</b></label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} placeholder="Buscar código, descrição ou NCM" className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-2 text-sm" />
          </div>
          <div className="flex gap-2">
            {!publico && resultado.validacao_id && <button type="button" onClick={ajustar} disabled={carregando} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-primary text-primary text-sm hover:bg-primary/5 disabled:opacity-50">{carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />} Ajustar parâmetros e refazer</button>}
            <button type="button" onClick={reiniciar} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"><RotateCcw className="w-4 h-4" /> Validar outro arquivo</button>
            {!publico && <button type="button" onClick={exportar} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"><Download className="w-4 h-4" /> Baixar planilha corrigida</button>}
          </div>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {!publico && arquivo && <p className="text-xs text-muted-foreground">Selecione as linhas duplicadas que deseja retirar da cópia saneada ({excluir.length} selecionadas). A exportação mantém o relatório completo e registra as exclusões em aba separada. O cadastro do ERP não é alterado.</p>}
        {/* Mesma estrutura da planilha corrigida (ver ProdutosService.exportarXlsx): uma linha por produto, um dado por coluna, nada empilhado dentro da célula. */}
        {r.periodo && periodoFiltro === "FORA" ? (
          <div className="rounded-xl border border-border bg-card overflow-auto max-h-[70vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-muted"><tr className="text-left text-muted-foreground">
                {["Linha", "Código", "Descrição", "NCM informado", "Última movimentação"].map((t) => <th key={t} className="px-3 py-2 font-medium whitespace-nowrap border-b border-r border-border last:border-r-0">{t}</th>)}
              </tr></thead>
              <tbody>
                {(resultado.fora_periodo || []).slice(0, 500).map((f) => (
                  <tr key={f.linha}>
                    <td className="px-3 py-1.5 border-b border-r border-border text-right tabular-nums text-muted-foreground">{f.linha}</td>
                    <td className="px-3 py-1.5 border-b border-r border-border font-medium">{f.codigo || "—"}</td>
                    <td className="px-3 py-1.5 border-b border-r border-border max-w-[320px] truncate" title={f.descricao}>{f.descricao || "—"}</td>
                    <td className="px-3 py-1.5 border-b border-r border-border font-mono">{f.ncm_original || "—"}</td>
                    <td className="px-3 py-1.5 border-b border-border tabular-nums">{dataBr(f.ultima_mov)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(resultado.fora_periodo || []).length > 500 && <p className="p-3 text-xs text-muted-foreground">Mostrando 500 de {resultado.fora_periodo.length.toLocaleString("pt-BR")}. A lista completa está na planilha baixada.</p>}
          </div>
        ) : (
        <div className="rounded-xl border border-border bg-card overflow-auto max-h-[70vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="text-left text-muted-foreground">
                {!publico && arquivo && <th className="p-2 border border-border">Excluir da cópia saneada</th>}
                {(r.periodo ? [...COLUNAS, ...COLUNAS_PERIODO] : COLUNAS).map((c) => <th key={c.chave} className={`px-3 py-2 font-medium whitespace-nowrap border-b border-r border-border last:border-r-0 ${c.alinhar || ""}`}>{c.titulo}</th>)}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i, idx) => {
                const problemas = i.problemas.filter((p) => p.codigo !== "CLASSE_SUGERIDA");
                const temErro = problemas.some((p) => p.severidade === "erro");
                const sug = i.sugestao?.c_class_trib ? i.sugestao : null;
                const ncmMudou = i.ncm && i.ncm !== (i.ncm_original || "").replace(/\D/g, "");
                const cel = "px-3 py-1.5 whitespace-nowrap border-b border-r border-border last:border-r-0";
                return (
                  <tr key={i.linha} className={idx % 2 ? "bg-muted/15" : ""}>
                    {!publico && arquivo && <td className={cel}><input type="checkbox" aria-label={`Excluir linha ${i.linha} da cópia saneada`} disabled={!i.candidatos_duplicidade?.length} checked={excluir.includes(i.linha)} onChange={e => setExcluir(xs => e.target.checked ? [...xs, i.linha] : xs.filter(n => n !== i.linha))} /></td>}
                    <td className={`${cel} tabular-nums text-muted-foreground text-right`}>{i.linha}</td>
                    <td className={`${cel} font-medium`}>{i.codigo || "—"}</td>
                    <td className={`${cel} max-w-[320px] truncate`} title={i.descricao}>{i.descricao || "—"}</td>
                    <td className={cel}>{i.unidade || "—"}</td>
                    <td className={cel}>{i.principio_ativo || "—"}</td>
                    <td className={cel}>{i.grupo_contabil || "—"}</td>
                    <td className={`${cel} font-mono`}>{i.ncm_original || "—"}</td>
                    <td className={`${cel} font-mono ${ncmMudou ? "text-emerald-700 dark:text-emerald-400 font-semibold" : ""}`}>{i.ncm || "—"}</td>
                    <td className={cel}><span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${COR_SIT[i.situacao]}`}>{ROT_SIT[i.situacao]}</span></td>
                    <td className={`${cel} ${temErro ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>{problemas.length ? problemas.map((p) => p.mensagem).join(" | ") : "—"}</td>
                    <td className={`${cel} font-mono`}>{i.c_class_trib_informado || "—"}</td>
                    <td className={`${cel} font-mono font-semibold`}>{sug ? sug.c_class_trib : i.sugestao?.ambiguo ? <span className="font-sans font-normal text-amber-700">Depende do produto</span> : "—"}</td>
                    <td className={`${cel} text-right tabular-nums`}>{sug ? `${Math.round(sug.reducao * 100)}%` : "—"}</td>
                    <td className={cel}>{sug ? sug.confianca : "—"}</td>
                    <td className={cel}>{sug?.anexo || "—"}</td>
                    {r.periodo && (
                      <>
                        <td className={`${cel} tabular-nums`}>{i.ultima_mov ? i.ultima_mov.split("-").reverse().join("/") : "—"}</td>
                        <td className={cel}><span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${COR_PERIODO[i.periodo] || ""}`}>{ROT_PERIODO[i.periodo] || "—"}</span></td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visiveis.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum item neste filtro.</p>}
        </div>
        )}

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{itensFiltrados.length.toLocaleString("pt-BR")} itens · página {pagina + 1} de {totalPaginas}</span>
            <div className="flex gap-2">
              <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="px-3 py-1.5 rounded-md border border-border disabled:opacity-40">Anterior</button>
              <button disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina((p) => p + 1)} className="px-3 py-1.5 rounded-md border border-border disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}

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
