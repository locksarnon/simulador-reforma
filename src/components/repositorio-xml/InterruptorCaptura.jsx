import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Switch } from "@/components/ui/switch";

/** Liga ou desliga a captura de XML do cliente (os tipos, o período e a Ciência seguem a configuração global). */
export default function InterruptorCaptura({ empresaId, ligada, certificadoOk, aoMudar, compacto = false }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const mudar = useMutation({
    mutationFn: (valor) => api.put(`/captura-xml/empresas/${empresaId}/ligada`, { ligada: valor }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["captura-xml", "empresas"] });
      qc.invalidateQueries({ queryKey: ["repo-xml-captura", empresaId] });
      aoMudar?.(r);
      toast({ title: r.ligada ? "Captura ligada" : "Captura desligada", description: r.avisos?.length ? r.avisos.join(" ") : undefined });
    },
    onError: (e) => toast({ title: "Não foi possível mudar a captura", description: e.message, variant: "destructive" }),
  });
  const admin = user?.role === "admin";
  const bloqueado = !admin || mudar.isPending || (!ligada && !certificadoOk);
  const titulo = !admin ? "Só administradores ligam a captura" : !ligada && !certificadoOk ? "Envie o certificado A1 na ficha do cliente" : ligada ? "Desligar a captura" : "Ligar a captura";
  return (
    <label className={`inline-flex items-center gap-2 ${compacto ? "" : "text-sm"}`} title={titulo} onClick={(e) => e.stopPropagation()}>
      <Switch checked={!!ligada} disabled={bloqueado} aria-label={titulo}
        onCheckedChange={async (v) => {
          if (!v && !(await confirmar({ titulo: "Desligar a captura deste cliente?", descricao: "Desligada por mais de 60 dias, a SEFAZ deixa de guardar a numeração desse período.", rotulo: "Desligar" }))) return;
          mudar.mutate(v);
        }} />
      {!compacto && <span>{ligada ? "Ligada" : "Desligada"}</span>}
    </label>
  );
}
