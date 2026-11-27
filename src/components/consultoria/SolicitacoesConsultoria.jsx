import { Link } from "react-router-dom";
import { caminhoDoRepositorio } from "@/lib/bpoCaminhos";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import CampoArquivo from "@/components/ui/CampoArquivo";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { linhasDoPeriodo, itensDoServico, situacaoDasLinhas, textoDaEvidencia, textoDasPendencias } from "@/lib/consultoriaDocumentos";
import BuscaNaTabela from "@/components/BuscaNaTabela";

const estados = { PENDENTE: "Não localizado", RECEBIDO: "Recebido", VALIDADO: "Validado", DIVERGENTE: "Divergente", NAO_APLICAVEL: "Não aplicável" };
const campo = "rounded border bg-background px-2 py-1";
const etiqueta = "ml-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground";

/** Uma linha do controle: documento, (período), evidência e situação. Coberta pela importação = texto da evidência, sem escolher arquivo. */
function LinhaDocumento({ l, arquivos, comPeriodo, ocupado, salvar }) {
  const auto = l.automatico;
  const coberta = l.origem === "AUTOMATICO" && auto?.cobertura === "TOTAL";
  return <tr className="border-t align-top">
    <td className="px-2 py-1.5">{l.item}{l.origem === "AUTOMATICO" && <span className={etiqueta}>automático</span>}{auto && l.origem === "MANUAL" && <span className={etiqueta}>manual</span>}</td>
    {comPeriodo && <td className="px-2 py-1.5 whitespace-nowrap">{l.periodo}</td>}
    <td className="px-2 py-1.5">
      {auto && <p className="text-xs text-muted-foreground">{auto.cobertura === "PARCIAL" ? `Recebido em parte. Faltam: ${auto.faltam.join(", ")}. ` : ""}{textoDaEvidencia(auto)}</p>}
      {!coberta && <select aria-label={`Evidência para ${l.item}, ${l.periodo}`} value={l.arquivo_id} className={`${campo} mt-1 max-w-56`} disabled={ocupado} onChange={(e) => {
        const id = e.target.value;
        salvar(l, id ? "RECEBIDO" : "PENDENTE", id);
      }}><option value="">Selecione um arquivo</option>{arquivos.map((a) => <option key={a.id} value={a.id}>{a.pasta ? `${a.pasta}/` : ""}{a.nome}</option>)}</select>}
    </td>
    <td className="px-2 py-1.5"><select aria-label={`Situação de ${l.item}, ${l.periodo}`} value={l.origem === "AUTOMATICO" ? "AUTOMATICO" : l.situacao} className={campo} disabled={ocupado}
      onChange={(e) => salvar(l, e.target.value, ["PENDENTE", "NAO_APLICAVEL", "AUTOMATICO"].includes(e.target.value) ? null : l.arquivo_id)}>
      {auto && <option value="AUTOMATICO">{auto.cobertura === "TOTAL" ? "Automático: Recebido" : "Automático: em parte"}</option>}
      {Object.entries(estados).map(([k, v]) => <option key={k} value={k} disabled={!l.arquivo_id && !auto && ["RECEBIDO", "VALIDADO", "DIVERGENTE"].includes(k)}>{v}</option>)}
    </select></td>
  </tr>;
}

function Tabela({ linhas, ...props }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead><tr className="text-xs text-muted-foreground"><th className="px-2 py-1">Documento</th>{props.comPeriodo && <th className="px-2 py-1">Período</th>}<th className="px-2 py-1">Evidência</th><th className="px-2 py-1">Situação</th></tr></thead>
    <tbody>{linhas.map((l) => <LinhaDocumento key={l.chave} l={l} {...props} />)}</tbody>
  </table></div>;
}

/**
 * O controle agrupado: Pendente (aberto, só o que falta), Coberto pela importação (fechado, uma linha de resumo) e Recebidos e conferidos
 * (fechado). Separado do diálogo para poder ser conferido sem o portal.
 */
export function ChecklistDocumentos({ linhas, arquivos = [], ocupado = false, salvar = () => {}, importarOutro = null, acervo = null }) {
  // Coluna Período só quando algum documento se repete por período (mensal/anual); um por documento = o período do cabeçalho.
  const comPeriodo = new Set(linhas.map((l) => l.item)).size < linhas.length;
  const props = { arquivos, comPeriodo, ocupado, salvar };
  const pendentes = linhas.filter((l) => l.grupo === "PENDENTE");
  const cobertos = linhas.filter((l) => l.grupo === "COBERTO");
  const resolvidos = linhas.filter((l) => l.grupo === "RESOLVIDO");
  return <div className="space-y-3">
    <section aria-label="Pendente" className="space-y-1">
      <h3 className="text-sm font-semibold">Pendente ({pendentes.length})</h3>
      {pendentes.length ? <Tabela linhas={pendentes} {...props} /> : <p className="text-sm text-muted-foreground">Nada pendente.</p>}
      {importarOutro}
      {acervo}
    </section>
    {cobertos.length > 0 && <details className="rounded border px-2 py-1 text-sm">
      <summary className="cursor-pointer">Coberto pela importação ({cobertos.length}): {cobertos.map((l) => l.item).join(" · ")}</summary>
      <Tabela linhas={cobertos} {...props} />
    </details>}
    {resolvidos.length > 0 && <details className="rounded border px-2 py-1 text-sm">
      <summary className="cursor-pointer">Recebidos e conferidos ({resolvidos.length}): {resolvidos.map((l) => l.item).join(" · ")}</summary>
      <Tabela linhas={resolvidos} {...props} />
    </details>}
  </div>;
}

export default function SolicitacoesConsultoria({ servico, clientes = [], deInicial = "", ateInicial = "", somenteModelo = false, caminhoImportacao = null, aoFechar }) {
  const qc = useQueryClient();
  const [cliente, setCliente] = useState(clientes[0]?.id || "");
  const [de, setDe] = useState(deInicial);
  const [ate, setAte] = useState(ateInicial);
  const endpoint = `/consultoria/servicos/${servico.id}/clientes/${cliente}/documentos`;
  const queryKey = ["consultoria", "documentos", servico.id, cliente, de, ate];
  // Sempre fresco: ao abrir e ao voltar para a janela (ex.: depois de importar no Saneamento em outra aba).
  const consulta = useQuery({ queryKey, queryFn: () => api.get(`${endpoint}?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`), enabled: !!cliente && !!de && !!ate && de <= ate,
    staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true });
  const enviar = useMutation({
    mutationFn: (file) => api.upload("/documentos/arquivos", file, {
      ...(servico.publico === "PF" ? { pessoa_fisica_id: cliente } : { empresa_id: cliente }),
      pasta: "Consultoria Tributária",
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consultoria", "documentos", servico.id, cliente] }),
  });
  const atualizar = useMutation({
    mutationFn: (dados) => api.post(endpoint, dados),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const linhas = situacaoDasLinhas(linhasDoPeriodo(servico.id, de, ate), consulta.data || {});
  const { arquivos = [], xml = [] } = consulta.data || {};
  const faltam = linhas.filter((l) => l.grupo === "PENDENTE");
  const selecionado = clientes.find((c) => c.id === cliente);
  function emitir() {
    const conteudo = `${servico.nome}\nCliente: ${selecionado?.nome}\nPeríodo: ${de} a ${ate}\n\n${textoDasPendencias(linhas)}\n`;
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `solicitacoes-${servico.id}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function salvar(linha, situacao, arquivo_id) {
    atualizar.mutate({ item: linha.item, periodo: linha.periodo, situacao, arquivo_id: arquivo_id || null });
  }
  const ocupado = atualizar.isPending;
  const automaticos = consulta.data?.automaticos?.length > 0;

  return <Dialog open onOpenChange={(v) => !v && aoFechar()}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
    <DialogHeader><DialogTitle>Documentos · {servico.nome}</DialogTitle><DialogDescription>{somenteModelo ? "Modelo de documentos solicitados para este serviço." : "O que já chegou e o que falta. Confira o cliente e o período."}</DialogDescription></DialogHeader>
    {!somenteModelo && <div className="flex flex-wrap items-end gap-2 text-sm">
      <label className="grid gap-0.5 text-xs">Cliente<select className={campo} value={cliente} onChange={(e) => setCliente(e.target.value)}><option value="">Selecione</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label className="grid gap-0.5 text-xs">De<input className={campo} type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
      <label className="grid gap-0.5 text-xs">Até<input className={campo} type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
    </div>}
    {["credito-estoque", "credito-estoque-pf"].includes(servico.id) && <p className="text-sm">Inventário de referência em 31/12/2026, para o estoque de abertura de 01/01/2027. O período acima filtra a busca de evidências.</p>}
    {!somenteModelo && !cliente && <p className="text-sm text-muted-foreground">Vincule um cliente ao serviço para controlar entregas e emitir a solicitação.</p>}
    {(de && ate && !linhas.length) && <p role="alert">Confira o período informado. O intervalo deve ter até 21 exercícios.</p>}
    {consulta.isFetching && <p role="status" className="text-xs text-muted-foreground">Conferindo o repositório…</p>}
    {consulta.isError && <p role="alert">{consulta.error.message}</p>}
    {atualizar.isError && <p role="alert">{atualizar.error.message}</p>}
    {enviar.isError && <p role="alert">{enviar.error.message}</p>}
    {consulta.data && linhas.length > 0 ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{linhas.filter((l) => l.grupo === "COBERTO").length} cobertos pela importação · {linhas.filter((l) => l.grupo === "RESOLVIDO").length} recebidos · {faltam.length} pendentes</p>
        <button disabled={!faltam.length || consulta.isFetching || ocupado} onClick={emitir} className="botao-acao rounded bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50">Baixar lista de pendências</button>
      </div>
      {xml.length > 0 && <p className="text-sm"><Link className="text-primary underline" to={caminhoDoRepositorio(cliente)}>XML no repositório</Link> · {xml.map(({ tipo, total }) => `${tipo}: ${total}`).join(" · ")} por data de emissão. Confira o tipo de operação e a cobertura antes de validar.</p>}
      {linhas.length > 15 && <BuscaNaTabela />}
      <ChecklistDocumentos linhas={linhas} arquivos={arquivos} ocupado={ocupado} salvar={salvar}
        importarOutro={caminhoImportacao && faltam.length > 0 && <p className="text-sm">Falta algo{automaticos ? " que a planilha não trouxe" : ""}? <Link className="text-primary underline" to={caminhoImportacao}>Importe outro arquivo no Saneamento</Link>: a lista se atualiza sozinha.</p>}
        acervo={<details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Importar arquivo no acervo do cliente</summary>
          <CampoArquivo rotulo="Importar arquivo no acervo do cliente" disabled={enviar.isPending} aoEscolher={([file]) => { if (file) enviar.mutate(file); }} />
          {enviar.isPending && <p role="status">Importando arquivo…</p>}
        </details>} />
    </> : <ul className="list-disc space-y-1 pl-5 text-sm">{itensDoServico(servico.id).map((l) => <li key={l}>{l}</li>)}</ul>}
  </DialogContent></Dialog>;
}
