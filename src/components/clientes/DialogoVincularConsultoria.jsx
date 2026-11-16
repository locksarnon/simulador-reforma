import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OpcoesPorArea, useCatalogoConsultoria, vincularConsultoria } from "@/components/clientes/ServicosConsultoria";
import { temCnpj } from "@/lib/consultoria";
import { plural } from "@/lib/plural";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const nomes = (lista) => lista.slice(0, 5).join("; ") + (lista.length > 5 ? ` e mais ${lista.length - 5}` : "");

/**
 * Vincula um serviço de Consultoria Tributária (catálogo de pessoa jurídica) a um ou vários clientes. Só entra quem tem CNPJ
 * completo; os demais ficam de fora e aparecem no aviso. Quem já tinha o serviço continua com ele, sem duplicar.
 */
export default function DialogoVincularConsultoria({ empresas = [], aoFechar }) {
  const qc = useQueryClient();
  const catalogo = useCatalogoConsultoria();
  const [servico, setServico] = useState("");
  const [andamento, setAndamento] = useState(null);
  const opcoes = (catalogo.data || []).filter((s) => s.publico === "PJ");
  const aptas = empresas.filter((e) => temCnpj(e.cnpj_cpf));
  const semCnpj = empresas.filter((e) => !temCnpj(e.cnpj_cpf)).map((e) => e.razao_social);

  const vincular = async (ev) => {
    ev.preventDefault();
    if (!servico || !aptas.length) return;
    const falhas = [];
    setAndamento({ feitas: 0, total: aptas.length });
    for (const [i, e] of aptas.entries()) {
      try { await vincularConsultoria(e.id, servico); } catch { falhas.push(e.razao_social); }
      setAndamento({ feitas: i + 1, total: aptas.length });
    }
    setAndamento(null);
    qc.invalidateQueries({ queryKey: ["consultoria", "vinculos"] });
    const ok = aptas.length - falhas.length;
    const nome = opcoes.find((s) => s.id === servico)?.nome || "";
    const fora = [semCnpj.length ? `Sem CNPJ, ficaram de fora: ${nomes(semCnpj)}.` : "", falhas.length ? `Não foi possível vincular: ${nomes(falhas)}.` : ""].filter(Boolean).join(" ");
    toast({ title: `${nome}: ${plural(ok, "cliente vinculado", "clientes vinculados")}`, description: fora || undefined, variant: falhas.length ? "destructive" : undefined });
    aoFechar();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !andamento) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{empresas.length === 1 ? `Vincular consultoria: ${empresas[0].razao_social}` : `Vincular consultoria a ${plural(empresas.length, "cliente", "clientes")}`}</DialogTitle>
          <DialogDescription>Escolha o serviço de Consultoria Tributária. Os projetos são abertos depois, na Carteira de Consultoria.</DialogDescription>
        </DialogHeader>
        <form onSubmit={vincular} className="space-y-3 text-sm">
          {catalogo.isError ? <p role="alert">Não foi possível carregar os serviços.</p> : (
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Serviço de consultoria</span>
              <select className={campo} value={servico} onChange={(e) => setServico(e.target.value)} disabled={!!andamento} required>
                <option value="">Escolha o serviço</option>
                <OpcoesPorArea servicos={opcoes} />
              </select></label>
          )}
          {semCnpj.length > 0 && <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">A consultoria exige CNPJ completo. Ficam de fora: {nomes(semCnpj)}.</p>}
          <DialogFooter>
            <button type="button" onClick={aoFechar} disabled={!!andamento} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-60">Cancelar</button>
            <button type="submit" disabled={!servico || !aptas.length || !!andamento} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
              {andamento && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {andamento ? `${andamento.feitas} de ${andamento.total}…` : `Vincular ${plural(aptas.length, "cliente", "clientes")}`}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
