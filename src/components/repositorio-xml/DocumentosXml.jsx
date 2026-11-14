import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileDown, FileUp, Loader2, Send, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { ABAS_DE_DOCUMENTOS, base, dividirEmLotes, documentoDoEvento, fmtData, fmtDoc, fmtMoeda, importavelNoImportador, MAX_PDF_NO_ZIP, nomeDoPdf, ORIGENS, PORTAIS_NOTAS_EMITIDAS, rotuloTipo, situacaoCiencia, temPdf, TIPOS } from "./formatos";
import { plural } from "@/lib/plural";
import RecuperacaoHistorica from "./RecuperacaoHistorica";
import TabelaPadrao from "@/components/TabelaPadrao";

/** Linhas por página: 10, 50, 100, 500 ou todas (0). "Todas" busca em partes de 500 até o teto abaixo. */
const OPCOES_POR_PAGINA = [10, 50, 100, 500, 0];
const POR_PAGINA_PADRAO = 50;
const PARTE = 500; // o servidor entrega no máximo 500 linhas por pedido
const TETO_TODAS = 5000; // acima disso a tabela fica pesada: a tela avisa e pede para filtrar
const CHAVE_POR_PAGINA = "repo-xml-por-pagina";

function lerPorPagina() {
  try {
    const guardado = localStorage.getItem(CHAVE_POR_PAGINA);
    const n = guardado === null ? NaN : Number(guardado);
    return OPCOES_POR_PAGINA.includes(n) ? n : POR_PAGINA_PADRAO;
  } catch {
    return POR_PAGINA_PADRAO;
  }
}

const SITUACAO = {
  AUTORIZADA: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  CANCELADA: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  DENEGADA: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};
const TOM_CIENCIA = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  erro: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  aviso: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  neutro: "text-muted-foreground",
};
const campo = "h-9 rounded-md border border-border bg-background px-2.5 text-sm";
const botaoIcone = "p-0.5 rounded hover:bg-muted";
/** O importador lê só o XML completo de NF-e, NFC-e e CT-e (e dos eventos deles): o resumo nunca vai. */
const noImportador = (d) => d.conteudo === "COMPLETO" && importavelNoImportador(d);

/**
 * Tabela de documentos do repositório da empresa. Dois modos, cada um numa aba da empresa:
 *  - "completos" (padrão): os documentos com XML completo, que podem ir ao importador e ter PDF; `grupo` (NFE, CTE, NFSE ou MDFE)
 *    limita a tabela a um tipo de documento, como nas abas NF-e | NFC-e, CT-e, NFS-e e MDF-e;
 *  - "resumos": a aba Resumos e eventos SEFAZ: o que a SEFAZ entregou só em resumo (sem o XML completo) e os eventos (cancelamento,
 *    carta de correção, manifestação etc.), de qualquer tipo, separados dos documentos.
 * `linkImportacao` é o caminho da Importação XML da empresa (que fica no diagnóstico, dentro do grupo); `null` esconde o link.
 */
export default function DocumentosXml({ empresaId, empresa, linkImportacao = "../importacao-xml", modo = "completos", grupo, datas, seletorCompetencia }) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const soResumos = modo === "resumos";
  const confirmar = useConfirmar();
  const qc = useQueryClient();
  const seletor = useRef(null);

  const [filtros, setFiltros] = useState({ tipo: "", modelo: "", origem: "", de: "", ate: "", ...datas, pendentes: false, papel_cte: "" });
  const [incluirNaoTomados, setIncluirNaoTomados] = useState(false);
  const docEmpresa = String(empresa?.cnpj_cpf || "").replace(/\D/g, "");
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(lerPorPagina);
  const [selecionados, setSelecionados] = useState(new Set());
  const [progresso, setProgresso] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const [comPdf, setComPdf] = useState(false);
  const [baixandoZip, setBaixandoZip] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setQ(busca.trim()); setPagina(0); }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  // Cada aba mostra um só tipo de conteúdo: os resumos e os eventos nunca aparecem junto com os documentos de XML completo.
  // A aba dos resumos e eventos pede o grupo RESUMOS_EVENTOS e não filtra o conteúdo (o evento vem com XML completo ou só em resumo).
  const parametros = {
    ...filtros,
    modelo: filtros.modelo || undefined,
    papel_cte: grupo === "CTE" && filtros.papel_cte ? filtros.papel_cte : undefined,
    grupo: soResumos ? "RESUMOS_EVENTOS" : grupo || undefined,
    conteudo: soResumos ? undefined : "COMPLETO",
    pendentes: filtros.pendentes ? "true" : undefined,
    q: q || undefined,
  };
  const { data: resumo } = useQuery({ queryKey: ["repo-xml-resumo", empresaId], queryFn: () => api.get(`${base(empresaId)}/resumo`), enabled: !soResumos });
  const todas = porPagina === 0;
  const { data: lista, isLoading, isFetching } = useQuery({
    queryKey: ["repo-xml-docs", empresaId, parametros, pagina, porPagina],
    queryFn: async () => {
      const buscar = (limit, offset) => api.get(`${base(empresaId)}/documentos`, { ...parametros, limit, offset });
      if (!todas) return buscar(porPagina, pagina * porPagina);
      // "Todas": busca em partes de 500 até acabar ou chegar ao teto.
      const itens = [];
      let total = 0;
      while (itens.length < TETO_TODAS) {
        const parte = await buscar(PARTE, itens.length);
        total = parte.total;
        itens.push(...parte.itens);
        if (!parte.itens.length || itens.length >= total) break;
      }
      return { total, itens: itens.slice(0, TETO_TODAS) };
    },
    placeholderData: (anterior) => anterior,
  });
  const itens = lista?.itens || [];
  const total = lista?.total || 0;
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["repo-xml-docs", empresaId] }); qc.invalidateQueries({ queryKey: ["repo-xml-resumo", empresaId] }); };

  const mudarFiltro = (chave, valor) => { setFiltros((f) => ({ ...f, [chave]: valor })); setPagina(0); setSelecionados(new Set()); };
  const mudarPorPagina = (valor) => {
    setPorPagina(valor);
    setPagina(0);
    try { localStorage.setItem(CHAVE_POR_PAGINA, String(valor)); } catch { /* sem storage: vale só nesta visita */ }
  };

  const enviarArquivos = async (arquivos) => {
    const lista = [...arquivos].filter((f) => /\.(xml|zip)$/i.test(f.name));
    if (!lista.length) { toast({ title: "Nenhum arquivo válido", description: "Envie arquivos .xml ou .zip.", variant: "destructive" }); return; }
    const soma = { novos: 0, atualizados: 0, duplicados: 0, ignorados: [] };
    try {
      let enviados = 0;
      for (const lote of dividirEmLotes(lista)) {
        setProgresso(Math.round((enviados / lista.length) * 100));
        const form = new FormData();
        lote.forEach((f) => form.append("arquivos", f));
        const r = await api.post(`${base(empresaId)}/documentos`, form);
        enviados += lote.length;
        soma.novos += r.novos; soma.atualizados += r.atualizados; soma.duplicados += r.duplicados; soma.ignorados.push(...r.ignorados);
      }
      const partes = [plural(soma.novos, "novo", "novos")];
      if (soma.atualizados) partes.push(plural(soma.atualizados, "completado", "completados"));
      if (soma.duplicados) partes.push(`${soma.duplicados} já existiam`);
      if (soma.ignorados.length) partes.push(`${plural(soma.ignorados.length, "ignorado", "ignorados")}: ${soma.ignorados.slice(0, 3).map((x) => `${x.nome} (${x.motivo})`).join("; ")}${soma.ignorados.length > 3 ? "…" : ""}`);
      toast({ title: "Envio concluído", description: partes.join(" · "), variant: soma.ignorados.length && !soma.novos && !soma.atualizados ? "destructive" : undefined });
    } catch (e) {
      toast({ title: "Não foi possível enviar", description: e.message, variant: "destructive" });
    } finally {
      setProgresso(null);
      if (seletor.current) seletor.current.value = "";
      atualizar();
    }
  };

  const importar = useMutation({
    mutationFn: (ids) => api.post(`${base(empresaId)}/documentos/enviar-importacao`, { ids, incluir_nao_tomados: incluirNaoTomados }),
    onSuccess: (r) => { toast({ title: "Enviado ao importador", description: `${plural(r.arquivos, "arquivo", "arquivos")} no lote.` }); setSelecionados(new Set()); atualizar(); },
    onError: (e) => toast({ title: "Não foi possível enviar ao importador", description: e.message, variant: "destructive" }),
  });
  const excluir = useMutation({
    mutationFn: (ids) => api.post(`${base(empresaId)}/documentos/excluir`, { ids }),
    onSuccess: (r) => { toast({ title: "Excluído", description: `${plural(r.excluidos, "documento removido", "documentos removidos")}.` }); setSelecionados(new Set()); atualizar(); },
    onError: (e) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }),
  });

  const naoTomados = resumo?.cte_nao_tomados ?? 0;
  const enviarAoImportador = async () => {
    const ids = [...selecionados];
    const pendentes = resumo?.nao_enviados_ao_importador ?? 0;
    if (!ids.length && !pendentes) { toast({ title: "Nada pendente", description: "Todos os XML completos já foram enviados ao importador." }); return; }
    const ok = await confirmar({
      titulo: "Enviar ao importador?",
      descricao: `${ids.length ? `Enviar ${plural(ids.length, "documento selecionado", "documentos selecionados")} (só XML completo).` : `Enviar ${plural(pendentes, "XML completo pendente", "XML completos pendentes")}.`}${naoTomados && !incluirNaoTomados ? ` Os CT-e em que o cliente não é o tomador (${naoTomados}) ficam de fora.` : ""}`,
      rotulo: "Enviar", perigoso: false,
    });
    if (ok) importar.mutate(ids.length ? ids : undefined);
  };
  const excluirSelecionados = async () => {
    const ids = [...selecionados];
    if (ids.length && await confirmar({ titulo: "Excluir do repositório?", descricao: `${plural(ids.length, "documento será apagado", "documentos serão apagados")} do repositório. O que já veio da SEFAZ não volta sozinho.`, rotulo: "Excluir" })) excluir.mutate(ids);
  };
  const baixarZip = async () => {
    const incluirPdf = comPdf && !soResumos;
    setBaixandoZip(true);
    try {
      await api.baixar("post", `${base(empresaId)}/documentos/zip`, {
        body: incluirPdf ? { ...parametros, incluir_pdf: "true" } : parametros,
        nome: `${incluirPdf ? "xml-e-pdf" : soResumos ? "resumos-e-eventos" : "xml"}-${(empresa?.id_empresa || "empresa").replace(/[^\w-]/g, "")}.zip`,
      });
    } catch (e) { toast({ title: "Não foi possível baixar", description: e.message, variant: "destructive" }); }
    finally { setBaixandoZip(false); }
  };
  const baixarUm = async (d) => {
    try { await api.baixar("get", `${base(empresaId)}/documentos/${d.id}/arquivo`, { nome: `${d.chave}.xml` }); }
    catch (e) { toast({ title: "Não foi possível baixar", description: e.message, variant: "destructive" }); }
  };
  const baixarPdf = async (d) => {
    try { await api.baixar("get", `${base(empresaId)}/documentos/${d.id}/pdf`, { nome: nomeDoPdf(d) }); }
    catch (e) { toast({ title: "Não foi possível gerar o PDF", description: e.message, variant: "destructive" }); }
  };
  const visualizarPdf = async (d) => {
    try { await api.visualizar("get", `${base(empresaId)}/documentos/${d.id}/pdf`); }
    catch (e) { toast({ title: "Não foi possível abrir o PDF", description: e.message, variant: "destructive" }); }
  };


  return (
    <div className="space-y-4">
      {admin && !soResumos && grupo === "NFE" && <RecuperacaoHistorica key={empresaId} empresaId={empresaId} />}
      {soResumos ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm space-y-1">
          <p className="font-medium">Resumos e eventos da SEFAZ</p>
          <p className="text-xs text-muted-foreground">
            Aqui ficam os documentos que a SEFAZ entregou só em resumo e os eventos (cancelamento, carta de correção, manifestação etc.), de todos os tipos de documento; as abas de cada tipo mostram só os documentos com XML completo. Um documento em resumo ainda não tem o XML completo, por isso fica fora do importador e sem PDF. Quando o XML completo chega (a captura o traz depois da Ciência da Operação, ou você o envia por arquivo numa das abas de documentos), o documento sai desta lista e passa para a aba do tipo dele. Se o XML completo nunca chegar, ele continua aqui. Os eventos de NF-e e CT-e vão ao importador junto com os documentos, quando você envia os pendentes; a coluna Importador mostra quais já foram.
          </p>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); enviarArquivos(e.dataTransfer.files); }}
          className={`rounded-xl border-2 border-dashed px-4 py-5 flex flex-wrap items-center gap-3 transition-colors ${arrastando ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <FileUp className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex-1 min-w-[220px] text-sm">
            <p className="font-medium">Arraste aqui os XML ou ZIP do cliente, ou escolha os arquivos</p>
            <p className="text-xs text-muted-foreground">NF-e, CT-e, MDF-e, NFS-e Nacional e eventos deste CNPJ.</p>
          </div>
          <input ref={seletor} type="file" multiple accept=".xml,.zip" className="hidden" onChange={(e) => enviarArquivos(e.target.files)} />
          <button type="button" disabled={progresso !== null} onClick={() => seletor.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {progresso !== null ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando {progresso}%</> : <><FileUp className="w-4 h-4" /> Escolher arquivos</>}
          </button>
        </div>
      )}

      {!soResumos && grupo !== "NFSE" && (
        <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Como baixar nas SEFAZ as notas que o cliente emitiu (MT, MS, GO, MA e PA)</summary>
          <p className="mt-2 text-xs text-muted-foreground">Peça ao ERP do cliente o CNPJ da FAL no campo autXML, ou envie aqui o ZIP baixado no portal.</p>
          <ul className="mt-2 space-y-1.5">
            {PORTAIS_NOTAS_EMITIDAS.map((p) => (
              <li key={p.uf} className="flex gap-2"><span className="font-semibold w-7 shrink-0">{p.uf}</span><span>{p.texto}{p.link && <> <a href={p.link} target="_blank" rel="noreferrer" className="text-primary hover:underline">Página oficial</a></>}</span></li>
            ))}
          </ul>
        </details>
      )}

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          {grupo ? (
            <>
              {grupo === "CTE" && (
                <label className="space-y-1"><span className="block text-xs text-muted-foreground">Tomador do serviço</span>
                  <select className={campo} value={filtros.papel_cte} onChange={(e) => mudarFiltro("papel_cte", e.target.value)} aria-label="Tomador do serviço">
                    <option value="">Todos os CT-e</option><option value="TOMADOR">Tomados pelo cliente</option><option value="OUTRO">O cliente não é o tomador</option>
                  </select></label>
              )}
              {grupo === "NFE" && (
                <label className="space-y-1"><span className="block text-xs text-muted-foreground">Modelo</span>
                  <select className={campo} value={filtros.modelo} onChange={(e) => mudarFiltro("modelo", e.target.value)}>
                    <option value="">NF-e e NFC-e</option><option value="55">NF-e</option><option value="65">NFC-e</option>
                  </select></label>
              )}
            </>
          ) : (
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Tipo</span>
              <select className={campo} value={filtros.tipo} onChange={(e) => mudarFiltro("tipo", e.target.value)}>
                <option value="">Todos</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          )}
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Origem</span>
            <select className={campo} value={filtros.origem} onChange={(e) => mudarFiltro("origem", e.target.value)}>
              <option value="">Todas</option>{Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          {seletorCompetencia}
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Emissão de</span><input type="date" className={campo} value={filtros.de} onChange={(e) => mudarFiltro("de", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">até</span><input type="date" className={campo} value={filtros.ate} onChange={(e) => mudarFiltro("ate", e.target.value)} /></label>
          <label className="space-y-1 w-52 max-w-full"><span className="block text-xs text-muted-foreground">Buscar (chave, número, emitente)</span><input type="search" className={`${campo} w-full`} value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
          {!soResumos && <label className="flex items-center gap-2 pb-1.5"><input type="checkbox" checked={filtros.pendentes} onChange={(e) => mudarFiltro("pendentes", e.target.checked)} /> <span>Só os que faltam enviar ao importador</span></label>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!soResumos && (
            <>
              <button type="button" onClick={enviarAoImportador} disabled={importar.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
                {importar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {selecionados.size ? `Enviar ${selecionados.size} ao importador` : "Enviar pendentes ao importador"}
              </button>
              {naoTomados > 0 && <label className="flex items-center gap-1.5 text-xs" title="Por padrão, só vão ao importador os CT-e em que o cliente é o tomador (contrata e paga o frete)."><input type="checkbox" checked={incluirNaoTomados} onChange={(e) => setIncluirNaoTomados(e.target.checked)} />Incluir CT-e em que o cliente não é o tomador ({naoTomados})</label>}
              {linkImportacao && <Link to={linkImportacao} className="text-sm text-primary hover:underline">Abrir Importação XML</Link>}
            </>
          )}
          <button type="button" onClick={baixarZip} disabled={!total || baixandoZip} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">
            {baixandoZip ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparando o ZIP…</> : <><Download className="w-4 h-4" /> Baixar ZIP dos filtros</>}
          </button>
          {!soResumos && (
            <label className="inline-flex items-center gap-1.5 text-sm" title={`Gera o PDF (DANFE, DANFE NFC-e, DACTE, DAMDFE ou DANFSe) de cada documento com XML completo, até ${MAX_PDF_NO_ZIP} documentos por ZIP.`}>
              <input type="checkbox" checked={comPdf} onChange={(e) => setComPdf(e.target.checked)} /> Incluir os PDF dos documentos
            </label>
          )}
          {admin && selecionados.size > 0 && (
            <button type="button" onClick={excluirSelecionados} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /> Excluir {selecionados.size}</button>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">Mostrar
            <select className={`${campo} py-0.5 text-xs`} value={porPagina} onChange={(e) => mudarPorPagina(Number(e.target.value))} aria-label="Documentos por página">
              {OPCOES_POR_PAGINA.map((n) => <option key={n} value={n}>{n === 0 ? "Todos" : n}</option>)}
            </select>
          </label>
          <span className="text-xs text-muted-foreground">{isFetching ? "Atualizando…" : plural(total, "documento", "documentos")}</span>
        </div>

        <TabelaPadrao simples id={soResumos ? "repo-xml-resumos" : "repo-xml-documentos"} ariaLabel={soResumos ? "Resumos e eventos" : "Documentos do repositório"}
          linhas={itens} chaveLinha={(d) => d.id}
          selecao={{ marcadas: selecionados, aoMudar: setSelecionados }}
          vazio={isLoading ? <><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</> : soResumos ? "Nenhum resumo nem evento neste repositório ainda. Quando a captura trouxer um resumo sem o XML completo ou um evento (como um cancelamento), ele aparece aqui." : ABAS_DE_DOCUMENTOS.find((a) => a.grupo === grupo)?.vazio || "Nenhum documento neste repositório ainda. Envie os XML do cliente acima."}
          colunas={[
            { chave: "tipo", rotulo: "Tipo", valor: (d) => rotuloTipo(d) },
            ...(soResumos ? [
              { chave: "evento_tipo", rotulo: "Evento", valor: (d) => (d.tipo === "EVENTO" ? d.evento_tipo || "" : "") },
              { chave: "evento_documento", rotulo: "Documento do evento", valor: (d) => (d.tipo === "EVENTO" ? documentoDoEvento(d) : "") },
            ] : []),
            { chave: "numero", rotulo: "Número", alinhar: "direita", valor: (d) => (d.numero == null || d.numero === "" ? null : Number(d.numero) || String(d.numero)), render: (d) => <span title={d.chave}>{d.numero ?? "—"}</span> },
            { chave: "serie", rotulo: "Série", alinhar: "direita", valor: (d) => (d.serie == null || d.serie === "" ? null : Number(d.serie) || String(d.serie)), render: (d) => d.serie ?? "" },
            { chave: "data_emissao", rotulo: "Emissão", tipo: "data", render: (d) => fmtData(d.data_emissao) },
            { chave: "emitente_nome", rotulo: "Emitente", valor: (d) => d.emitente_nome || "" },
            { chave: "emitente_doc", rotulo: "CNPJ/CPF do emitente", valor: (d) => (d.emitente_doc ? fmtDoc(d.emitente_doc) : ""), render: (d) => <span className="tabular-nums">{d.emitente_doc ? fmtDoc(d.emitente_doc) : ""}</span> },
            ...(grupo === "CTE" ? [{
              chave: "tomador_doc", rotulo: "Tomador",
              valor: (d) => (!d.tomador_doc ? "" : d.tomador_doc === docEmpresa ? "Cliente" : fmtDoc(d.tomador_doc)),
              render: (d) => (!d.tomador_doc ? <span className="text-muted-foreground">—</span> : d.tomador_doc === docEmpresa ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Cliente</span> : <span className="tabular-nums">{fmtDoc(d.tomador_doc)}</span>),
            }] : []),
            { chave: "valor_total", rotulo: "Valor", alinhar: "direita", valor: (d) => (d.valor_total == null || d.valor_total === "" ? null : Number(d.valor_total)), render: (d) => fmtMoeda(d.valor_total) },
            { chave: "situacao", rotulo: "Situação", valor: (d) => (d.situacao ? d.situacao.charAt(0) + d.situacao.slice(1).toLowerCase() : ""), render: (d) => d.situacao && <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${SITUACAO[d.situacao] || "bg-muted"}`}>{d.situacao.charAt(0) + d.situacao.slice(1).toLowerCase()}</span> },
            { chave: "origem", rotulo: "Origem", valor: (d) => ORIGENS[d.origem] || d.origem || "" },
            ...(soResumos ? [
              { chave: "ciencia", rotulo: "Ciência da Operação", valor: (d) => situacaoCiencia(d).rotulo, render: (d) => { const c = situacaoCiencia(d); return <span title={c.dica || undefined} className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_CIENCIA[c.tom]}`}>{c.rotulo}</span>; } },
              { chave: "ciencia_em", rotulo: "Data da Ciência", tipo: "data", valor: (d) => (d.ciencia_em && ["REGISTRADA", "REJEITADA"].includes(d.ciencia_status) ? d.ciencia_em : null), render: (d) => (d.ciencia_em && ["REGISTRADA", "REJEITADA"].includes(d.ciencia_status) ? fmtData(d.ciencia_em) : "") },
            ] : []),
            { chave: "importador", rotulo: "Importador", valor: (d) => (!noImportador(d) ? "" : d.lote_importacao_id ? "Enviado" : "Pendente"), render: (d) => (!noImportador(d) ? <span className="text-muted-foreground" title={d.conteudo === "COMPLETO" ? "O importador ainda não lê este tipo de documento (NFS-e e MDF-e); ele fica guardado aqui" : "Só o resumo está guardado: o importador lê só o XML completo"}>—</span> : d.lote_importacao_id ? <span className="text-emerald-700 dark:text-emerald-400">Enviado</span> : <span className="text-amber-700 dark:text-amber-400">Pendente</span>) },
            { chave: "importado_em", rotulo: "Enviado em", tipo: "data", valor: (d) => (noImportador(d) && d.lote_importacao_id ? d.importado_em || null : null), render: (d) => (noImportador(d) && d.lote_importacao_id ? fmtData(d.importado_em) : "") },
          ]}
          documentos={(d) => (
            <div className="flex items-center justify-end gap-1">
              <button type="button" onClick={() => baixarUm(d)} title="Baixar o XML" aria-label={`Baixar ${d.chave}`} className={botaoIcone}><Download className="w-3.5 h-3.5" /></button>
              {temPdf(d) && (
                <>
                  <button type="button" onClick={() => visualizarPdf(d)} title="Visualizar o PDF" aria-label={`Visualizar o PDF de ${d.chave}`} className={botaoIcone}><Eye className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => baixarPdf(d)} title="Baixar o PDF" aria-label={`Baixar o PDF de ${d.chave}`} className={botaoIcone}><FileDown className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          )}
        />

        {todas ? (
          total > TETO_TODAS && (
            <p role="status" className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 p-2">
              Mostrando os primeiros {TETO_TODAS.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} documentos. Refine os filtros (período, tipo ou busca) para ver o resto.
            </p>
          )
        ) : total > porPagina && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{pagina * porPagina + 1}–{Math.min((pagina + 1) * porPagina, total)} de {total}</span>
            <div className="flex gap-2">
              <button type="button" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50">Anterior</button>
              <button type="button" disabled={(pagina + 1) * porPagina >= total} onClick={() => setPagina((p) => p + 1)} className="px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50">Próxima</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
