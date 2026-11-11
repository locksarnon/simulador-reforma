import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileDown, FileUp, Loader2, Send, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { base, dividirEmLotes, fmtData, fmtDoc, fmtMoeda, importavelNoImportador, MAX_PDF_NO_ZIP, nomeDoPdf, ORIGENS, PORTAIS_NOTAS_EMITIDAS, rotuloTipo, situacaoCiencia, temPdf, TIPOS } from "./formatos";

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
const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const botaoIcone = "p-0.5 rounded hover:bg-muted";

function Cartao({ rotulo, valor, destaque, onClick }) {
  const classe = `rounded-xl border bg-card px-4 py-3 text-left ${destaque ? "border-amber-400/60" : "border-border"}`;
  const conteudo = (
    <>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor ?? "—"}</p>
    </>
  );
  if (!onClick) return <div className={classe}>{conteudo}</div>;
  return <button type="button" onClick={onClick} title="Abrir a aba Só o resumo" className={`${classe} hover:bg-muted/50`}>{conteudo}</button>;
}

/**
 * Tabela de documentos do repositório da empresa. Dois modos, cada um numa aba da empresa:
 *  - "completos" (padrão): os documentos com XML completo, que podem ir ao importador e ter PDF;
 *  - "resumos": os que a SEFAZ entregou só em resumo (sem o XML completo), separados dos demais.
 * `linkImportacao` é o caminho da Importação XML da empresa (que fica no diagnóstico, dentro do grupo); `null` esconde o link.
 * `aoAbrirResumos` liga o cartão "Só o resumo" à aba dos resumos.
 */
export default function DocumentosXml({ empresaId, empresa, linkImportacao = "../importacao-xml", modo = "completos", aoAbrirResumos }) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const soResumos = modo === "resumos";
  const confirmar = useConfirmar();
  const qc = useQueryClient();
  const seletor = useRef(null);

  const [filtros, setFiltros] = useState({ tipo: "", origem: "", de: "", ate: "", pendentes: false });
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

  // Cada aba mostra um só tipo de conteúdo: o resumo nunca aparece junto com os documentos de XML completo.
  const parametros = { ...filtros, conteudo: soResumos ? "RESUMO" : "COMPLETO", pendentes: filtros.pendentes ? "true" : undefined, q: q || undefined };
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
      const partes = [`${soma.novos} novo(s)`];
      if (soma.atualizados) partes.push(`${soma.atualizados} completado(s)`);
      if (soma.duplicados) partes.push(`${soma.duplicados} já existiam`);
      if (soma.ignorados.length) partes.push(`${soma.ignorados.length} ignorado(s): ${soma.ignorados.slice(0, 3).map((x) => `${x.nome} (${x.motivo})`).join("; ")}${soma.ignorados.length > 3 ? "…" : ""}`);
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
    mutationFn: (ids) => api.post(`${base(empresaId)}/documentos/enviar-importacao`, { ids }),
    onSuccess: (r) => { toast({ title: "Enviado ao importador", description: `${r.arquivos} arquivo(s) no lote. Abra "Importação XML" para conferir e confirmar.` }); setSelecionados(new Set()); atualizar(); },
    onError: (e) => toast({ title: "Não foi possível enviar ao importador", description: e.message, variant: "destructive" }),
  });
  const excluir = useMutation({
    mutationFn: (ids) => api.post(`${base(empresaId)}/documentos/excluir`, { ids }),
    onSuccess: (r) => { toast({ title: "Excluído", description: `${r.excluidos} documento(s) removido(s) do repositório.` }); setSelecionados(new Set()); atualizar(); },
    onError: (e) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }),
  });

  const enviarAoImportador = async () => {
    const ids = [...selecionados];
    const pendentes = resumo?.nao_enviados_ao_importador ?? 0;
    if (!ids.length && !pendentes) { toast({ title: "Nada pendente", description: "Todos os XML completos já foram enviados ao importador." }); return; }
    const ok = await confirmar({
      titulo: "Enviar ao importador?",
      descricao: ids.length ? `Enviar ${ids.length} documento(s) selecionado(s) (somente XML completo) ao importador de XML.` : `Enviar os ${pendentes} XML completo(s) que ainda não foram ao importador.`,
      rotulo: "Enviar", perigoso: false,
    });
    if (ok) importar.mutate(ids.length ? ids : undefined);
  };
  const excluirSelecionados = async () => {
    const ids = [...selecionados];
    if (ids.length && await confirmar({ titulo: "Excluir do repositório?", descricao: `${ids.length} documento(s) serão apagados do repositório e do armazenamento. Se vieram da captura, o que já foi baixado da SEFAZ não volta sozinho.`, rotulo: "Excluir" })) excluir.mutate(ids);
  };
  const baixarZip = async () => {
    const incluirPdf = comPdf && !soResumos;
    setBaixandoZip(true);
    try {
      await api.baixar("post", `${base(empresaId)}/documentos/zip`, {
        body: incluirPdf ? { ...parametros, incluir_pdf: "true" } : parametros,
        nome: `${incluirPdf ? "xml-e-pdf" : soResumos ? "resumos" : "xml"}-${(empresa?.id_empresa || "empresa").replace(/[^\w-]/g, "")}.zip`,
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

  const todosMarcados = itens.length > 0 && itens.every((d) => selecionados.has(d.id));
  const alternarTodos = () => setSelecionados(todosMarcados ? new Set() : new Set(itens.map((d) => d.id)));
  const alternar = (id) => setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      {!soResumos && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Cartao rotulo="Documentos no repositório" valor={resumo?.total} />
          <Cartao rotulo="Enviados por arquivo" valor={resumo?.por_origem?.UPLOAD ?? 0} />
          <Cartao rotulo="Captura automática" valor={resumo?.por_origem?.CAPTURA ?? 0} />
          <Cartao rotulo="Só o resumo (sem XML)" valor={resumo?.so_resumo} destaque={(resumo?.so_resumo ?? 0) > 0} onClick={aoAbrirResumos} />
          <Cartao rotulo="Aguardando o importador" valor={resumo?.nao_enviados_ao_importador} destaque={(resumo?.nao_enviados_ao_importador ?? 0) > 0} />
        </div>
      )}

      {soResumos ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm space-y-1">
          <p className="font-medium">Documentos que a SEFAZ entregou só em resumo</p>
          <p className="text-xs text-muted-foreground">
            Estes documentos ainda não têm o XML completo; por isso ficam fora da aba Documentos e do importador. Quando o XML completo chega (a captura o traz depois da Ciência da Operação, ou você o envia por arquivo na aba Documentos), o documento sai desta lista e passa para a aba Documentos. Se o XML completo nunca chegar, ele continua aqui.
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
            <p className="text-xs text-muted-foreground">NF-e, CT-e, MDF-e, NFS-e Nacional e eventos. O que já existe não duplica, e um resumo é trocado pelo XML completo quando ele chega. Documentos que não citam o CNPJ desta empresa são recusados. O importador lê NF-e, NFC-e e CT-e; a NFS-e e o MDF-e ficam só guardados aqui.</p>
          </div>
          <input ref={seletor} type="file" multiple accept=".xml,.zip" className="hidden" onChange={(e) => enviarArquivos(e.target.files)} />
          <button type="button" disabled={progresso !== null} onClick={() => seletor.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {progresso !== null ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando {progresso}%</> : <><FileUp className="w-4 h-4" /> Escolher arquivos</>}
          </button>
        </div>
      )}

      {!soResumos && (
        <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Como baixar nas SEFAZ as notas que o cliente emitiu (MT, MS, GO, MA e PA)</summary>
          <p className="mt-2 text-xs text-muted-foreground">A captura automática não traz o que o próprio cliente emitiu. Alternativas: pedir que o ERP dele inclua o CNPJ da FAL no campo autXML das notas, ou baixar o lote no portal da SEFAZ e enviar aqui em ZIP. Orientação conferida em 10/11/2026 nas páginas das SEFAZ; os portais mudam, confirme no portal.</p>
          <ul className="mt-2 space-y-1.5">
            {PORTAIS_NOTAS_EMITIDAS.map((p) => (
              <li key={p.uf} className="flex gap-2"><span className="font-semibold w-7 shrink-0">{p.uf}</span><span>{p.texto}{p.link && <> <a href={p.link} target="_blank" rel="noreferrer" className="text-primary hover:underline">Página oficial</a></>}</span></li>
            ))}
          </ul>
        </details>
      )}

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Tipo</span>
            <select className={campo} value={filtros.tipo} onChange={(e) => mudarFiltro("tipo", e.target.value)}>
              <option value="">Todos</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Origem</span>
            <select className={campo} value={filtros.origem} onChange={(e) => mudarFiltro("origem", e.target.value)}>
              <option value="">Todas</option>{Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Emissão de</span><input type="date" className={campo} value={filtros.de} onChange={(e) => mudarFiltro("de", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">até</span><input type="date" className={campo} value={filtros.ate} onChange={(e) => mudarFiltro("ate", e.target.value)} /></label>
          <label className="space-y-1 flex-1 min-w-[180px]"><span className="block text-xs text-muted-foreground">Buscar (chave, número, emitente)</span><input type="search" className={`${campo} w-full`} value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
          {!soResumos && <label className="flex items-center gap-2 pb-1.5"><input type="checkbox" checked={filtros.pendentes} onChange={(e) => mudarFiltro("pendentes", e.target.checked)} /> <span>Só os que faltam enviar ao importador</span></label>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!soResumos && (
            <>
              <button type="button" onClick={enviarAoImportador} disabled={importar.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
                {importar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {selecionados.size ? `Enviar ${selecionados.size} ao importador` : "Enviar pendentes ao importador"}
              </button>
              {linkImportacao && <Link to={linkImportacao} className="text-sm text-primary hover:underline">Abrir Importação XML</Link>}
            </>
          )}
          <button type="button" onClick={baixarZip} disabled={!total || baixandoZip} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">
            {baixandoZip ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparando o ZIP…</> : <><Download className="w-4 h-4" /> Baixar ZIP dos filtros</>}
          </button>
          {!soResumos && (
            <label className="inline-flex items-center gap-1.5 text-sm" title={`Gera o PDF (DANFE, DANFE NFC-e, DACTE, DAMDFE ou DANFSe) de cada documento com XML completo, até ${MAX_PDF_NO_ZIP} documentos por ZIP. Eventos vão só em XML.`}>
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
          <span className="text-xs text-muted-foreground">{isFetching ? "Atualizando…" : `${total} documento(s)`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] leading-5">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-1.5 pr-2 w-8"><input type="checkbox" aria-label={todas ? "Selecionar todos os exibidos" : "Selecionar todos da página"} checked={todosMarcados} onChange={alternarTodos} /></th>
                <th className="py-1.5 pr-3">Tipo</th><th className="py-1.5 pr-3">Nº / série</th><th className="py-1.5 pr-3">Emissão</th>
                <th className="py-1.5 pr-3">Emitente</th><th className="py-1.5 pr-3 text-right">Valor</th><th className="py-1.5 pr-3">Situação</th>
                <th className="py-1.5 pr-3">Origem</th><th className="py-1.5 pr-3">{soResumos ? "Ciência da Operação" : "Importador"}</th><th className="py-1.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</td></tr>}
              {!isLoading && itens.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">
                  {soResumos ? "Nenhum documento só em resumo. Quando a captura trouxer um resumo sem o XML completo, ele aparece aqui." : "Nenhum documento neste repositório ainda. Envie os XML do cliente acima."}
                </td></tr>
              )}
              {itens.map((d) => {
                const ciencia = soResumos ? situacaoCiencia(d) : null;
                return (
                  <tr key={d.id} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="py-1 pr-2"><input type="checkbox" aria-label={`Selecionar ${d.chave}`} checked={selecionados.has(d.id)} onChange={() => alternar(d.id)} /></td>
                    <td className="py-1 pr-3 whitespace-nowrap">{rotuloTipo(d)}{d.tipo === "EVENTO" && <span className="text-xs text-muted-foreground"> {d.evento_tipo}</span>}</td>
                    <td className="py-1 pr-3 whitespace-nowrap tabular-nums" title={d.chave}>{d.numero ?? "—"}{d.serie ? ` / ${d.serie}` : ""}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{fmtData(d.data_emissao)}</td>
                    <td className="py-1 pr-3 max-w-[340px]" title={[d.emitente_nome, fmtDoc(d.emitente_doc)].filter(Boolean).join(" · ")}><span className="block truncate">{d.emitente_nome ? <>{d.emitente_nome} <span className="text-xs text-muted-foreground tabular-nums">{fmtDoc(d.emitente_doc)}</span></> : <span className="tabular-nums">{fmtDoc(d.emitente_doc)}</span>}</span></td>
                    <td className="py-1 pr-3 text-right tabular-nums whitespace-nowrap">{fmtMoeda(d.valor_total)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {d.situacao && <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${SITUACAO[d.situacao] || "bg-muted"}`}>{d.situacao.charAt(0) + d.situacao.slice(1).toLowerCase()}</span>}
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap">{ORIGENS[d.origem] || d.origem}</td>
                    {soResumos ? (
                      <td className="py-1 pr-3 whitespace-nowrap" title={ciencia.dica || undefined}>
                        <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_CIENCIA[ciencia.tom]}`}>{ciencia.rotulo}</span>
                        {d.ciencia_em && ["REGISTRADA", "REJEITADA"].includes(d.ciencia_status) && <span className="text-xs text-muted-foreground"> {fmtData(d.ciencia_em)}</span>}
                      </td>
                    ) : (
                      <td className="py-1 pr-3 whitespace-nowrap">{!importavelNoImportador(d) ? <span className="text-muted-foreground" title="O importador ainda não lê este tipo de documento (NFS-e e MDF-e); ele fica guardado aqui">—</span> : d.lote_importacao_id ? <span className="text-emerald-700 dark:text-emerald-400">Enviado {fmtData(d.importado_em)}</span> : <span className="text-amber-700 dark:text-amber-400">Pendente</span>}</td>
                    )}
                    <td className="py-1">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => baixarUm(d)} title="Baixar o XML" aria-label={`Baixar ${d.chave}`} className={botaoIcone}><Download className="w-3.5 h-3.5" /></button>
                        {temPdf(d) && (
                          <>
                            <button type="button" onClick={() => visualizarPdf(d)} title="Visualizar o PDF" aria-label={`Visualizar o PDF de ${d.chave}`} className={botaoIcone}><Eye className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => baixarPdf(d)} title="Baixar o PDF" aria-label={`Baixar o PDF de ${d.chave}`} className={botaoIcone}><FileDown className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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
