import { Link } from "react-router-dom";
import { caminhoDoRepositorio } from "@/lib/bpoCaminhos";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { linhasDoPeriodo, arquivoSpedDaLinha, itensDoServico } from "@/lib/consultoriaDocumentos";

const estados = { PENDENTE: "Não localizado", RECEBIDO: "Recebido", VALIDADO: "Validado", DIVERGENTE: "Divergente", NAO_APLICAVEL: "Não aplicável" };
const campo = "rounded border bg-background p-2";

export default function SolicitacoesConsultoria({ servico, clientes = [], deInicial = "", ateInicial = "", aoFechar }) {
  const qc = useQueryClient();
  const [cliente, setCliente] = useState(clientes[0]?.id || "");
  const [de, setDe] = useState(deInicial);
  const [ate, setAte] = useState(ateInicial);
  const endpoint = `/consultoria/servicos/${servico.id}/clientes/${cliente}/documentos`;
  const queryKey = ["consultoria", "documentos", servico.id, cliente, de, ate];
  const consulta = useQuery({ queryKey, queryFn: () => api.get(`${endpoint}?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`), enabled: !!cliente && !!de && !!ate && de <= ate });
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
  const { arquivos = [], controles = [], sped = [], xml = [] } = consulta.data || {};
  const porChave = new Map(controles.map((c) => [`${c.item}:${c.periodo}`, c]));
  const linhas = linhasDoPeriodo(servico.id, de, ate).map((linha) => {
    const chave = `${linha.item}:${linha.periodo}`;
    const controle = porChave.get(chave);
    const recebido = arquivoSpedDaLinha(linha, sped, arquivos);
    const vinculado = arquivos.some((a) => a.id === controle?.arquivo_id) ? controle.arquivo_id : null;
    const situacao = controle ? (controle.arquivo_id && !vinculado ? "PENDENTE" : controle.situacao) : recebido ? "RECEBIDO" : "PENDENTE";
    return { ...linha, chave, situacao, arquivo_id: (controle ? vinculado : recebido) ?? "" };
  });
  const faltam = linhas.filter((l) => ["PENDENTE", "DIVERGENTE"].includes(l.situacao));
  const selecionado = clientes.find((c) => c.id === cliente);
  function emitir() {
    const lista = faltam.map((l) => `- [${l.periodo}] ${l.linha}`).join("\n");
    const conteudo = `${servico.nome}\nCliente: ${selecionado?.nome}\nPeríodo: ${de} a ${ate}\n\n${lista}\n`;
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

  return <Dialog open onOpenChange={(v) => !v && aoFechar()}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
    <DialogHeader><DialogTitle>Documentos · {servico.nome}</DialogTitle><DialogDescription>Selecionar o contribuinte e o período para conferir o acervo e emitir as pendências.</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-3 text-sm">
      <label className="grid gap-1">Cliente<select className={campo} value={cliente} onChange={(e) => setCliente(e.target.value)}><option value="">Selecione</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label className="grid gap-1">De<input className={campo} type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
      <label className="grid gap-1">Até<input className={campo} type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
    </div>
    {servico.id === "credito-estoque" && <p className="text-sm">Inventário de referência em 31/12/2026, para o estoque de abertura de 01/01/2027. O período acima filtra a busca de evidências.</p>}
    {!cliente && <p className="text-sm text-muted-foreground">Vincule um cliente ao serviço para controlar entregas e emitir a solicitação.</p>}
    {(de && ate && !linhas.length) && <p role="alert">Confira o período informado. O intervalo deve ter até 21 exercícios.</p>}
    {consulta.isFetching && <p role="status">Conferindo o repositório…</p>}
    {consulta.isError && <p role="alert">{consulta.error.message}</p>}
    {atualizar.isError && <p role="alert">{atualizar.error.message}</p>}
    {enviar.isError && <p role="alert">{enviar.error.message}</p>}
    {consulta.data && linhas.length > 0 ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{linhas.filter((l) => l.situacao === "VALIDADO").length} validados · {linhas.filter((l) => l.situacao === "RECEBIDO").length} recebidos · {faltam.length} pendências</p>
        <button disabled={!faltam.length || consulta.isFetching || atualizar.isPending} onClick={emitir} className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">Baixar lista de pendências</button>
      </div>
      <label className="block text-sm">Importar arquivo no acervo do cliente
        <input type="file" className="ml-2 max-w-full" disabled={enviar.isPending} onChange={(e) => {
          const file = e.target.files[0];
          if (file) enviar.mutate(file);
          e.target.value = "";
        }} />
      </label>
      {enviar.isPending && <p role="status">Importando arquivo…</p>}
      {xml.length > 0 && <p className="text-sm"><Link className="text-primary underline" to={caminhoDoRepositorio(cliente)}>XML no repositório</Link> · {xml.map(({ tipo, total }) => `${tipo}: ${total}`).join(" · ")} por data de emissão. Confira o tipo de operação e a cobertura antes de validar.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">Documento</th><th className="p-2">Período</th><th className="p-2">Evidência do repositório</th><th className="p-2">Situação</th></tr></thead>
        <tbody>{linhas.map((l) => <tr key={l.chave} className="border-t">
          <td className="p-2">{l.linha}</td><td className="p-2">{l.periodo}</td>
          <td className="p-2"><select aria-label={`Evidência para ${l.item}, ${l.periodo}`} value={l.arquivo_id} className={`${campo} max-w-56`} disabled={atualizar.isPending} onChange={(e) => {
            const id = e.target.value;
            salvar(l, id ? "RECEBIDO" : "PENDENTE", id);
          }}><option value="">Selecione um arquivo</option>{arquivos.map((a) => <option key={a.id} value={a.id}>{a.pasta ? `${a.pasta}/` : ""}{a.nome}</option>)}</select></td>
          <td className="p-2"><select aria-label={`Situação de ${l.item}, ${l.periodo}`} value={l.situacao} className={campo} disabled={atualizar.isPending} onChange={(e) => salvar(l, e.target.value, ["PENDENTE", "NAO_APLICAVEL"].includes(e.target.value) ? null : l.arquivo_id)}>
            {Object.entries(estados).map(([k, v]) => <option key={k} value={k} disabled={!l.arquivo_id && ["RECEBIDO", "VALIDADO", "DIVERGENTE"].includes(k)}>{v}</option>)}
          </select></td>
        </tr>)}</tbody>
      </table></div>
    </> : <ul className="list-disc space-y-1 pl-5 text-sm">{itensDoServico(servico.id).map((l) => <li key={l}>{l}</li>)}</ul>}
  </DialogContent></Dialog>;
}
