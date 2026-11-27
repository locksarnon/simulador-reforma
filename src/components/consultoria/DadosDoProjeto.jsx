import { useState } from "react";
import { FileText, Loader2, Settings2, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import SolicitacoesConsultoria from "@/components/consultoria/SolicitacoesConsultoria";
import { useCatalogoConsultoria } from "@/components/clientes/ServicosConsultoria";
import { porDataBase } from "@/lib/dataBase";
import { fmtDataCurta } from "@/lib/servicos";
import { SITUACOES_PROJETO } from "@/lib/projetos";
import { rotaSaneamento } from "@/lib/trilhas";
import { useAcoesDoProjeto } from "@/lib/useAcoesDoProjeto";

const dia = (v) => (v ? String(v).slice(0, 10) : "");
const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const botao = "botao-acao inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-[5px] text-sm hover:bg-muted";

/**
 * Dados do projeto dentro da ferramenta em que ele abre direto (Saneamento de estoques): situação, nome, data-base (ou período), prazo,
 * responsável, escopo, documentos e solicitações e a exclusão. É o que antes ficava na página do projeto, sem a parada intermediária.
 */
export default function DadosDoProjeto({ projeto: p, cliente = null }) {
  const [aberto, setAberto] = useState(false);
  const [documentos, setDocumentos] = useState(false);
  const [form, setForm] = useState(null);
  const catalogo = useCatalogoConsultoria(Boolean(p?.servico_consultoria));
  const servico = catalogo.data?.find((c) => c.id === p?.servico_consultoria);
  const acoes = useAcoesDoProjeto(p, { aoSalvar: () => setAberto(false) });
  if (!p) return null;
  const soDataBase = porDataBase(p.servico_consultoria);
  const abrir = () => {
    setForm({ nome: p.nome, escopo: p.escopo || "", periodo_inicio: dia(p.periodo_inicio), periodo_fim: dia(p.periodo_fim), prazo: dia(p.prazo), responsavel: p.responsavel || "" });
    setAberto(true);
  };
  const mudar = (chave) => (e) => setForm((f) => ({ ...f, [chave]: e.target.value, ...(soDataBase && chave === "periodo_inicio" ? { periodo_fim: e.target.value } : {}) }));
  const salvar = (e) => { e.preventDefault(); acoes.salvar.mutate({ ...form, prazo: form.prazo || null }); };

  return (
    <>
      <button type="button" className={botao} onClick={abrir}><Settings2 className="h-4 w-4" aria-hidden="true" /> Dados do projeto</button>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Dados do projeto</SheetTitle>
            <SheetDescription>{p.nome}</SheetDescription>
          </SheetHeader>
          {form && (
            <div className="mt-4 space-y-4 text-sm">
              {acoes.pendente && (
                <section className="space-y-2 rounded-md border bg-muted p-3" aria-label="Solicitação de exclusão">
                  <p><strong>Exclusão aguardando autorização.</strong> Solicitada por {p.exclusao_solicitada_por} em {fmtDataCurta(p.exclusao_solicitada_em)}.</p>
                  {acoes.admin && <button type="button" className={botao} disabled={acoes.exclusao.isPending} onClick={() => acoes.exclusao.mutate(true)}>Recusar exclusão</button>}
                </section>
              )}
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Situação</span>
                <select className={campo} value={p.situacao} disabled={acoes.salvar.isPending} onChange={(e) => acoes.salvar.mutate({ situacao: e.target.value })}>
                  {Object.entries(SITUACOES_PROJETO).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}
                </select>
              </label>
              <form className="space-y-3" onSubmit={salvar} aria-label="Editar os dados do projeto">
                <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome</span><input className={campo} value={form.nome} onChange={mudar("nome")} required /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(soDataBase ? [["periodo_inicio", "Data-base"]] : [["periodo_inicio", "De"], ["periodo_fim", "Até"]]).map(([chave, rotulo]) => (
                    <label key={chave} className="block space-y-1"><span className="block text-xs text-muted-foreground">{rotulo}</span><input type="date" className={campo} value={form[chave]} onChange={mudar(chave)} /></label>
                  ))}
                  <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Prazo</span><input type="date" className={campo} value={form.prazo} onChange={mudar("prazo")} /></label>
                  <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span><input className={campo} value={form.responsavel} onChange={mudar("responsavel")} /></label>
                </div>
                <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Objetivo e escopo</span><textarea className={`${campo} min-h-[72px]`} value={form.escopo} onChange={mudar("escopo")} /></label>
                <button type="submit" disabled={acoes.salvar.isPending} className="botao-acao inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
                  {acoes.salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
                </button>
              </form>
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {servico && <button type="button" className={botao} onClick={() => { setAberto(false); setDocumentos(true); }}><FileText className="h-4 w-4" aria-hidden="true" /> Documentos e solicitações</button>}
                {(acoes.admin || !acoes.pendente) && (
                  <button type="button" className={`${botao} botao-acao-perigo text-destructive hover:bg-destructive/10`} disabled={acoes.exclusao.isPending} onClick={acoes.excluir}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> {acoes.acaoExclusao}
                  </button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {documentos && servico && (
        <SolicitacoesConsultoria servico={servico} clientes={cliente?.id ? [{ id: cliente.id, nome: cliente.nome }] : []}
          deInicial={dia(p.periodo_inicio)} ateInicial={dia(p.periodo_fim)} aoFechar={() => setDocumentos(false)}
          caminhoImportacao={p.servico_consultoria === "saneamento-estoques" ? rotaSaneamento(p.id) : null} />
      )}
    </>
  );
}
