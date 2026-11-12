import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODULOS_BPO, SITUACOES, TIPOS } from "@/lib/servicos";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const dia = (v) => (v ? String(v).slice(0, 10) : "");

function estadoInicial(servico, tipoInicial) {
  return {
    tipo: servico?.tipo || tipoInicial || "BPO_FISCAL",
    situacao: servico?.situacao || "ATIVO",
    nome: servico?.nome || "",
    inicio: dia(servico?.inicio),
    fim: dia(servico?.fim),
    responsavel: servico?.responsavel || "",
    modulos: servico?.modulos || [],
    observacao: servico?.observacao || "",
  };
}

/**
 * Define o serviço contratado de uma ou várias empresas. Com um serviço existente, edita ele (o tipo não muda); sem ele, cria ou
 * atualiza o serviço em aberto do tipo escolhido, para todas as empresas marcadas.
 */
export default function DialogoServico({ aberto, aoFechar, empresas = [], servico = null, tipoInicial, sugestoes = [] }) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => estadoInicial(servico, tipoInicial));
  useEffect(() => { if (aberto) setF(estadoInicial(servico, tipoInicial)); }, [aberto, servico, tipoInicial]);
  const mudar = (chave, valor) => setF((e) => ({ ...e, [chave]: valor }));
  const alternarModulo = (m) => mudar("modulos", f.modulos.includes(m) ? f.modulos.filter((x) => x !== m) : [...f.modulos, m]);
  const datasOk = !f.inicio || !f.fim || f.fim >= f.inicio;

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        situacao: f.situacao, nome: f.nome || null, inicio: f.inicio || null, fim: f.fim || null, responsavel: f.responsavel || null,
        observacao: f.observacao || null, ...(f.tipo === "BPO_FISCAL" ? { modulos: f.modulos } : {}),
      };
      if (servico) return api.put(`/servicos-contratados/${servico.id}`, corpo);
      return api.post("/servicos-contratados/em-lote", { ...corpo, tipo: f.tipo, empresa_ids: empresas.map((e) => e.id) });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["servicos-contratados"] });
      toast({ title: "Serviço salvo", description: servico ? "As alterações foram gravadas." : `Novos: ${r.criados}. Atualizados: ${r.atualizados}.` });
      aoFechar();
    },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });

  const titulo = servico ? `${TIPOS[servico.tipo]}: ${empresas[0]?.razao_social || ""}` : empresas.length === 1 ? `Definir serviço: ${empresas[0].razao_social}` : `Definir serviço de ${empresas.length} empresas`;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {servico ? "Edite a situação, as datas e o responsável." : "Quem já tem esse serviço em aberto é atualizado; as demais empresas ganham um novo."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (datasOk) salvar.mutate(); }} className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Serviço</span>
              <select className={campo} value={f.tipo} disabled={!!servico} onChange={(e) => mudar("tipo", e.target.value)}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span>
              <select className={campo} value={f.situacao} onChange={(e) => mudar("situacao", e.target.value)}>
                {Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          {f.tipo === "DIAGNOSTICO_PONTUAL" && (
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome do projeto (opcional)</span>
              <input className={campo} value={f.nome} maxLength={120} onChange={(e) => mudar("nome", e.target.value)} placeholder="Ex.: Diagnóstico da Reforma 2026" /></label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Início</span>
              <input type="date" className={campo} value={f.inicio} onChange={(e) => mudar("inicio", e.target.value)} /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Fim (se houver)</span>
              <input type="date" className={campo} value={f.fim} onChange={(e) => mudar("fim", e.target.value)} aria-invalid={!datasOk} /></label>
          </div>
          {!datasOk && <p role="alert" className="text-xs text-destructive">A data de fim não pode ser anterior à de início.</p>}
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span>
            <input className={campo} value={f.responsavel} maxLength={120} list="sugestoes-responsavel" onChange={(e) => mudar("responsavel", e.target.value)} placeholder="Quem cuida deste cliente" />
            <datalist id="sugestoes-responsavel">{sugestoes.map((s) => <option key={s} value={s} />)}</datalist></label>
          {f.tipo === "BPO_FISCAL" && (
            <fieldset className="space-y-1.5">
              <legend className="text-xs text-muted-foreground">Módulos do BPO ligados a esta empresa</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(MODULOS_BPO).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"><input type="checkbox" checked={f.modulos.includes(k)} onChange={() => alternarModulo(k)} /> {v}</label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Observação</span>
            <textarea className={campo} rows={2} value={f.observacao} maxLength={2000} onChange={(e) => mudar("observacao", e.target.value)} /></label>
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={salvar.isPending || !datasOk} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
