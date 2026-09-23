import React, { useMemo, useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, Copy, Check, Download, Loader2, RotateCcw, Search, Lock } from "lucide-react";
import { api } from "@/api/base44Client";
import LeadForm from "@/components/ferramentas/LeadForm";

const CABECALHO_MODELO = ["Codigo", "Descricao", "NCM", "Unidade", "Origem", "cClassTrib"];

const ROTULO_PROBLEMA = {
  NCM_AUSENTE: "NCM ausente", NCM_FORMATO: "NCM com formato errado", NCM_INEXISTENTE: "NCM inexistente", NCM_INATIVO: "NCM não vigente",
  NCM_ZERO_RESTAURADO: "Zero à esquerda corrigido", CODIGO_AUSENTE: "Sem código", DESCRICAO_AUSENTE: "Sem descrição",
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
export default function ValidadorCadastro({ modo = "interno" }) {
  const publico = modo === "publico";
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

  const rotaPrevia = publico ? "/public/produtos/amostra" : "/produtos/ler";
  const rotaValidar = publico ? "/public/produtos/amostra" : "/produtos/validar";

  const reiniciar = () => {
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
      const r = await api.upload(rotaValidar, arquivo, { mapeamento: mapa, ...(publico && (email || emailLiberado) ? { email: email || emailLiberado } : {}) });
      setResultado(r); setEtapa("resultado"); setPagina(0);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  const baixarModelo = () => api.baixar("GET", "/public/produtos/modelo", { nome: "modelo-cadastro-produtos-intax.xlsx" }).catch((e) => setErro(e.message));
  const copiarCab = async () => {
    try { await navigator.clipboard.writeText(CABECALHO_MODELO.join("\t")); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { setErro("Não foi possível copiar. Selecione e copie manualmente: " + CABECALHO_MODELO.join(", ")); }
  };
  const exportar = () => api.baixar("POST", "/produtos/exportar", { file: arquivo, campos: { mapeamento: mapa }, nome: "cadastro-validado-intax.xlsx" }).catch((e) => setErro(e.message));

  const itensFiltrados = useMemo(() => {
    if (!resultado) return [];
    const t = busca.trim().toLowerCase();
    return resultado.itens.filter((i) => {
      if (filtro === "PROBLEMAS" ? i.situacao === "OK" : filtro !== "TODOS" && i.situacao !== filtro) return false;
      if (!t) return true;
      return `${i.codigo} ${i.descricao} ${i.ncm_original}`.toLowerCase().includes(t);
    });
  }, [resultado, filtro, busca]);

  const totalPaginas = Math.max(1, Math.ceil(itensFiltrados.length / POR_PAGINA));
  const visiveis = itensFiltrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  // ── Etapa 1: enviar ──
  if (etapa === "enviar") {
    return (
      <div className="space-y-5">
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
    const obrigatoriosOk = mapa.ncm !== null && mapa.ncm !== undefined && mapa.ncm !== "";
    const indicesMapeados = new Set(Object.values(mapa).filter((v) => v !== null && v !== undefined && v !== ""));
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="w-4 h-4" /> <b className="text-foreground">{arquivo?.name}</b> · {previa.total_linhas.toLocaleString("pt-BR")} produtos
          {publico && previa.total_linhas > 300 && <span className="text-amber-600">(a amostra analisa os 300 primeiros)</span>}
        </div>

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
          <button type="button" onClick={reiniciar} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">Trocar arquivo</button>
          <button type="button" disabled={!obrigatoriosOk || carregando} onClick={() => validar()} className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {carregando && <Loader2 className="w-4 h-4 animate-spin" />} {carregando ? "Validando…" : "Validar cadastro"}
          </button>
        </div>
        {!obrigatoriosOk && <p className="text-xs text-destructive">Indique a coluna do NCM para continuar.</p>}
      </div>
    );
  }

  // ── Etapa 3: resultado ──
  if (etapa === "resultado" && resultado) {
    const r = resultado.resumo;
    const bloqueado = publico && resultado.modo !== "completo";
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao titulo="Produtos analisados" valor={r.total} ativo={filtro === "TODOS"} onClick={() => { setFiltro("TODOS"); setPagina(0); }} />
          <Cartao titulo="Sem problemas" valor={r.ok} cor="text-emerald-600" ativo={filtro === "OK"} onClick={() => { setFiltro("OK"); setPagina(0); }} />
          <Cartao titulo="Atenção" valor={r.alerta} cor="text-amber-600" ativo={filtro === "ALERTA"} onClick={() => { setFiltro("ALERTA"); setPagina(0); }} />
          <Cartao titulo="Corrigir" valor={r.erro} cor="text-red-600" ativo={filtro === "ERRO"} onClick={() => { setFiltro("ERRO"); setPagina(0); }} />
        </div>

        {!r.catalogo_ncm_carregado && <p className="text-xs text-amber-600">A tabela oficial de NCM ainda não está carregada neste ambiente: a existência do NCM não foi conferida.</p>}
        {r.truncado && <p className="text-xs text-muted-foreground">Arquivo com {r.linhas_no_arquivo.toLocaleString("pt-BR")} linhas: a amostra analisou as primeiras {r.total}.</p>}

        {r.por_problema.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.por_problema.filter((p) => p.codigo !== "CLASSE_SUGERIDA" && p.codigo !== "NCM_ZERO_RESTAURADO").slice(0, 8).map((p) => (
              <span key={p.codigo} className="text-xs px-2 py-1 rounded-full bg-muted">{ROTULO_PROBLEMA[p.codigo] || p.codigo}: <b>{p.qtd}</b></span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(0); }} placeholder="Buscar código, descrição ou NCM" className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reiniciar} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"><RotateCcw className="w-4 h-4" /> Validar outro arquivo</button>
            {!publico && <button type="button" onClick={exportar} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"><Download className="w-4 h-4" /> Baixar planilha corrigida</button>}
          </div>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Linha</th><th className="px-3 py-2 font-medium">Produto</th><th className="px-3 py-2 font-medium">NCM</th>
              <th className="px-3 py-2 font-medium">Situação</th><th className="px-3 py-2 font-medium">O que encontramos</th><th className="px-3 py-2 font-medium">Classificação sugerida</th>
            </tr></thead>
            <tbody>
              {visiveis.map((i, idx) => (
                <tr key={i.linha} className={`border-b border-border align-top last:border-0 ${idx % 2 ? "bg-muted/15" : ""}`}>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{i.linha}</td>
                  <td className="px-3 py-2 max-w-[260px]"><div className="font-medium truncate">{i.codigo || "—"}</div><div className="text-xs text-muted-foreground truncate">{i.descricao}</div></td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{i.ncm_original || "—"}{i.ncm && i.ncm !== i.ncm_original.replace(/\D/g, "") ? <div className="text-emerald-700">→ {i.ncm}</div> : null}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${COR_SIT[i.situacao]}`}>{ROT_SIT[i.situacao]}</span></td>
                  <td className="px-3 py-2 text-xs max-w-[340px]">{i.problemas.filter((p) => p.codigo !== "CLASSE_SUGERIDA").map((p, k) => <div key={k} className={p.severidade === "erro" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>• {p.mensagem}</div>)}{i.problemas.filter((p) => p.codigo !== "CLASSE_SUGERIDA").length === 0 && <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2 text-xs">{i.sugestao?.c_class_trib ? <><span className="font-mono font-semibold">{i.sugestao.c_class_trib}</span>{i.sugestao.reducao > 0 ? ` · redução ${Math.round(i.sugestao.reducao * 100)}%` : ""}<div className="text-muted-foreground">{i.sugestao.anexo} · {i.sugestao.confianca.split(" ")[0]}</div></> : i.sugestao?.ambiguo ? <span className="text-amber-700">Depende do produto</span> : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visiveis.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum item neste filtro.</p>}
        </div>

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
