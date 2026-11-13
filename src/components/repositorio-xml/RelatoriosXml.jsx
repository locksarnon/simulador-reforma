import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import TabelaPadrao from "@/components/TabelaPadrao";
import { base, fmtDoc, fmtMoeda, ORIGENS } from "./formatos";
import {
  baixarCsv, baixarPlanilha, CHAVES_GERAL_NA_TELA, CHAVES_ITENS_NA_TELA, COLUNAS_GERAL, COLUNAS_RESUMO_GERAL, colunasProdutos, linhasParaCsv, nomeDoArquivo,
  periodoPadrao, textoDaCelula, textoDoPeriodo,
} from "./dadosDosRelatorios";

/** Linhas que a tela mostra; o Excel e o CSV levam todas as que o servidor devolveu. */
const LINHAS_NA_TELA = 500;
const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const NUMERICOS = ["moeda", "quantidade", "inteiro"];

const RELATORIOS = [
  { valor: "geral", rotulo: "Geral", ajuda: "Quantos documentos, de que tipo, em que situação e quanto valem, com a lista de cada um." },
  { valor: "produtos", rotulo: "Produtos", ajuda: "Os itens das NF-e e NFC-e do período, soltos ou somados por produto, NCM ou CFOP. Lê o XML de cada nota." },
];
const GRUPOS = [["", "Todos"], ["NFE", "NF-e | NFC-e"], ["CTE", "CT-e"], ["NFSE", "NFS-e"], ["MDFE", "MDF-e"]];
const AGRUPAMENTOS = [["itens", "Cada item (sem somar)"], ["produto", "Produto"], ["ncm", "NCM"], ["cfop", "CFOP"]];

function Indicador({ rotulo, valor, destaque }) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-3 ${destaque ? "border-amber-400/60" : "border-border"}`}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor ?? "—"}</p>
    </div>
  );
}

/** Colunas do relatório no formato da tabela padrão: números ordenam como número, datas como data, o resto pelo texto da célula. */
function colunasDaTabela(colunas) {
  return colunas.map((c) => {
    const numerico = NUMERICOS.includes(c.tipo);
    return {
      chave: c.chave,
      rotulo: c.titulo,
      alinhar: numerico ? "direita" : undefined,
      tipo: c.tipo === "data" ? "data" : undefined,
      quebrar: c.chave === "descricao" ? true : undefined,
      valor: (l) => {
        if (numerico) { const v = l[c.chave]; return v == null || v === "" ? null : Number(v); }
        if (c.tipo === "data") return l[c.chave] || null;
        return textoDaCelula(c, l);
      },
      render: (l) => textoDaCelula(c, l) || "—",
    };
  });
}

/** Tabela do relatório: as colunas dizem o título, o tipo (que decide o alinhamento e a ordenação) e como mostrar cada célula. */
export function Tabela({ colunas, linhas, rotuloDaTabela, simples = false, id }) {
  return <TabelaPadrao id={id} simples={simples} ariaLabel={rotuloDaTabela} colunas={colunasDaTabela(colunas)} linhas={linhas} tamanhoInicial={50} />;
}

function BotoesDeArquivo({ aoBaixar, baixando }) {
  const classe = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={!!baixando} onClick={() => aoBaixar("xlsx")} className={classe}>
        {baixando === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Baixar Excel
      </button>
      <button type="button" disabled={!!baixando} onClick={() => aoBaixar("csv")} className={classe}>
        {baixando === "csv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Baixar CSV
      </button>
    </div>
  );
}

export function ResultadoGeral({ dados, aoBaixar, baixando }) {
  const colunasDaTela = COLUNAS_GERAL.filter((c) => CHAVES_GERAL_NA_TELA.includes(c.chave));
  const visiveis = dados.linhas.slice(0, LINHAS_NA_TELA);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Indicador rotulo="Documentos" valor={dados.resumo.documentos.toLocaleString("pt-BR")} />
        <Indicador rotulo="Valor das autorizadas" valor={fmtMoeda(dados.resumo.valor_autorizadas)} />
        <Indicador rotulo="Canceladas" valor={dados.resumo.canceladas.toLocaleString("pt-BR")} destaque={dados.resumo.canceladas > 0} />
      </div>
      {dados.resumo.documentos === 0 ? <p className="text-sm text-muted-foreground py-4">Nenhum documento nos filtros escolhidos.</p> : (
        <>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Por documento</p>
            <Tabela colunas={COLUNAS_RESUMO_GERAL} linhas={dados.resumo.por_documento} rotuloDaTabela="Resumo por documento" simples />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Documentos</p>
            <BotoesDeArquivo aoBaixar={aoBaixar} baixando={baixando} />
          </div>
          <Tabela colunas={colunasDaTela} linhas={visiveis} rotuloDaTabela="Documentos do período" id="repo-xml-relatorio-geral" />
          {dados.linhas.length > LINHAS_NA_TELA && <p role="status" className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 p-2">Mostrando as primeiras {LINHAS_NA_TELA} de {dados.linhas.length.toLocaleString("pt-BR")} linhas. O Excel e o CSV trazem todas.</p>}
          {dados.truncado && <p role="status" className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 p-2">A lista foi cortada no limite de {dados.linhas.length.toLocaleString("pt-BR")} linhas; os totais acima contam todos os documentos. Reduza o período para ver o resto.</p>}
        </>
      )}
    </div>
  );
}

export function ResultadoProdutos({ dados, aoBaixar, baixando }) {
  const colunas = colunasProdutos(dados.modo);
  const todas = dados.modo === "itens" ? dados.linhas : dados.grupos;
  const colunasDaTela = dados.modo === "itens" ? colunas.filter((c) => CHAVES_ITENS_NA_TELA.includes(c.chave)) : colunas;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador rotulo="Notas lidas" valor={dados.resumo.notas.toLocaleString("pt-BR")} />
        <Indicador rotulo="Itens" valor={dados.resumo.itens.toLocaleString("pt-BR")} />
        <Indicador rotulo="Valor total dos itens" valor={fmtMoeda(dados.resumo.valor_total)} />
        <Indicador rotulo="Notas que não deu para ler" valor={dados.resumo.notas_com_falha.toLocaleString("pt-BR")} destaque={dados.resumo.notas_com_falha > 0} />
      </div>
      {dados.falhas.length > 0 && (
        <details className="rounded-xl border border-amber-400/60 bg-card px-4 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Notas que não deu para ler ({dados.resumo.notas_com_falha})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {dados.falhas.map((f) => <li key={f.chave}><span className="tabular-nums">{f.chave}</span> — {f.motivo}</li>)}
            {dados.resumo.notas_com_falha > dados.falhas.length && <li className="text-muted-foreground">… e mais {dados.resumo.notas_com_falha - dados.falhas.length}.</li>}
          </ul>
        </details>
      )}
      {todas.length === 0 ? <p className="text-sm text-muted-foreground py-4">Nenhum item nos filtros escolhidos.</p> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">{dados.modo === "itens" ? "Itens das notas" : `Somados por ${dados.modo === "produto" ? "produto" : dados.modo.toUpperCase()}`}</p>
            <BotoesDeArquivo aoBaixar={aoBaixar} baixando={baixando} />
          </div>
          <Tabela colunas={colunasDaTela} linhas={todas.slice(0, LINHAS_NA_TELA)} rotuloDaTabela="Produtos do período" id={`repo-xml-relatorio-produtos-${dados.modo}`} />
          {todas.length > LINHAS_NA_TELA && <p role="status" className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 p-2">Mostrando as primeiras {LINHAS_NA_TELA} de {todas.length.toLocaleString("pt-BR")} linhas. O Excel e o CSV trazem todas.</p>}
          {dados.truncado && <p role="status" className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 p-2">O relatório foi cortado no limite de linhas do servidor; reduza o período ou use um agrupamento.</p>}
        </>
      )}
    </div>
  );
}

/**
 * Relatórios do Repositório de XML da empresa (os mesmos que o Notalize tem): Geral e Produtos. O relatório só roda quando a pessoa
 * pede ("Gerar relatório"), porque o de Produtos abre o XML de cada nota.
 */
export default function RelatoriosXml({ empresaId, empresa, hoje }) {
  const padrao = periodoPadrao(hoje);
  const [qual, setQual] = useState("geral");
  const [comum, setComum] = useState({ de: padrao.de, ate: padrao.ate, origem: "" });
  const [geral, setGeral] = useState({ grupo: "", situacao: "", incluirResumos: false });
  const [produtos, setProdutos] = useState({ modelo: "", situacao: "AUTORIZADA", agrupar: "itens", busca: "" });
  const [resultado, setResultado] = useState(null);
  const [baixando, setBaixando] = useState(null);

  const gerar = useMutation({
    mutationFn: async () => {
      const params = qual === "geral"
        ? { ...comum, grupo: geral.grupo, situacao: geral.situacao, incluir_resumos: geral.incluirResumos ? "true" : undefined }
        : { ...comum, modelo: produtos.modelo, situacao: produtos.situacao, agrupar: produtos.agrupar, busca: produtos.busca.trim() };
      const dados = await api.get(`${base(empresaId)}/relatorios/${qual}`, params);
      return { qual, usados: { ...comum }, dados };
    },
    onSuccess: setResultado,
    onError: (e) => toast({ title: "Não foi possível gerar o relatório", description: e.message, variant: "destructive" }),
  });

  const mudarComum = (chave, valor) => setComum((c) => ({ ...c, [chave]: valor }));
  const atual = resultado && resultado.qual === qual ? resultado : null;

  const baixar = async (formato) => {
    if (!atual) return;
    const { dados, usados } = atual;
    const nome = nomeDoArquivo({ qual, empresa, de: usados.de, ate: usados.ate, extensao: formato });
    const cabecalho = [[empresa?.razao_social, empresa?.cnpj_cpf ? `CNPJ ${fmtDoc(empresa.cnpj_cpf)}` : ""].filter(Boolean).join(" · "), textoDoPeriodo(usados.de, usados.ate), `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`];
    setBaixando(formato);
    try {
      const colunas = qual === "geral" ? COLUNAS_GERAL : colunasProdutos(dados.modo);
      const linhas = qual === "geral" ? dados.linhas : dados.modo === "itens" ? dados.linhas : dados.grupos;
      if (formato === "csv") baixarCsv(linhasParaCsv(colunas, linhas), nome);
      else {
        const abas = qual === "geral"
          ? [
            { nome: "Resumo", titulo: "Relatório Geral — resumo por documento", linhasDeTexto: cabecalho, colunas: COLUNAS_RESUMO_GERAL, linhas: dados.resumo.por_documento, totais: false },
            { nome: "Documentos", titulo: "Relatório Geral — documentos", linhasDeTexto: cabecalho, colunas, linhas },
          ]
          : [{ nome: "Produtos", titulo: `Relatório de Produtos${dados.modo === "itens" ? " — itens das notas" : ` — por ${dados.modo === "produto" ? "produto" : dados.modo.toUpperCase()}`}`, linhasDeTexto: cabecalho, colunas, linhas }];
        await baixarPlanilha(abas, nome);
      }
    } catch (e) {
      toast({ title: "Não foi possível gerar o arquivo", description: e.message, variant: "destructive" });
    } finally {
      setBaixando(null);
    }
  };

  const ajuda = RELATORIOS.find((r) => r.valor === qual)?.ajuda;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-base font-semibold">Relatórios</h3>
          <p className="text-xs text-muted-foreground">{ajuda}</p>
        </div>
        <div role="tablist" aria-label="Relatório" className="inline-flex border border-border bg-card p-0.5 gap-0.5">
          {RELATORIOS.map((r) => (
            <button key={r.valor} type="button" role="tab" aria-selected={qual === r.valor} onClick={() => setQual(r.valor)}
              className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${qual === r.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              {r.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Emissão de</span><input type="date" className={campo} value={comum.de} onChange={(e) => mudarComum("de", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">até</span><input type="date" className={campo} value={comum.ate} onChange={(e) => mudarComum("ate", e.target.value)} /></label>
          {qual === "geral" ? (
            <>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">Documento</span>
                <select className={campo} value={geral.grupo} onChange={(e) => setGeral((g) => ({ ...g, grupo: e.target.value }))}>{GRUPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span>
                <select className={campo} value={geral.situacao} onChange={(e) => setGeral((g) => ({ ...g, situacao: e.target.value }))}>
                  <option value="">Todas</option><option value="AUTORIZADA">Autorizadas</option><option value="CANCELADA">Canceladas</option><option value="DENEGADA">Denegadas</option>
                </select></label>
            </>
          ) : (
            <>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">Documento</span>
                <select className={campo} value={produtos.modelo} onChange={(e) => setProdutos((p) => ({ ...p, modelo: e.target.value }))}>
                  <option value="">NF-e e NFC-e</option><option value="55">Só NF-e</option><option value="65">Só NFC-e</option>
                </select></label>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span>
                <select className={campo} value={produtos.situacao} onChange={(e) => setProdutos((p) => ({ ...p, situacao: e.target.value }))}>
                  <option value="AUTORIZADA">Só autorizadas</option><option value="TODAS">Todas</option>
                </select></label>
            </>
          )}
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Origem</span>
            <select className={campo} value={comum.origem} onChange={(e) => mudarComum("origem", e.target.value)}>
              <option value="">Todas</option>{Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          {qual === "produtos" && (
            <>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">Somar por</span>
                <select className={campo} value={produtos.agrupar} onChange={(e) => setProdutos((p) => ({ ...p, agrupar: e.target.value }))}>{AGRUPAMENTOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
              <label className="space-y-1 flex-1 min-w-[180px]"><span className="block text-xs text-muted-foreground">Buscar nos itens (código, descrição, NCM ou CFOP)</span>
                <input type="search" className={`${campo} w-full`} value={produtos.busca} onChange={(e) => setProdutos((p) => ({ ...p, busca: e.target.value }))} /></label>
            </>
          )}
          {qual === "geral" && <label className="flex items-center gap-2 pb-1.5"><input type="checkbox" checked={geral.incluirResumos} onChange={(e) => setGeral((g) => ({ ...g, incluirResumos: e.target.checked }))} /> <span>Contar também os que só têm o resumo</span></label>}
        </div>
        <button type="button" onClick={() => gerar.mutate()} disabled={gerar.isPending} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
          {gerar.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando…</> : "Gerar relatório"}
        </button>
      </div>

      {atual
        ? (qual === "geral" ? <ResultadoGeral dados={atual.dados} aoBaixar={baixar} baixando={baixando} /> : <ResultadoProdutos dados={atual.dados} aoBaixar={baixar} baixando={baixando} />)
        : <p className="text-sm text-muted-foreground">Escolha o período e os filtros e clique em Gerar relatório.</p>}
    </div>
  );
}
