import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base, fmtData, fmtDataHora } from "./formatos";

const campo = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const SITUACAO = {
  ATIVO: ["Ativo", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"],
  VENCIDO: ["Vencido", "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"],
  REVOGADO: ["Removido do cofre", "bg-muted text-muted-foreground"],
};
const ACAO = {
  ENVIO: "Envio do certificado", REVOGACAO: "Remoção do certificado",
  USO_CAPTURA: "Uso na captura", USO_MANIFESTACAO: "Uso na manifestação",
  CAPTURA_ATIVADA: "Captura ativada", CAPTURA_DESATIVADA: "Captura desativada", CAPTURA_AMBIENTE: "Ambiente da SEFAZ alterado", CAPTURA_PERIODO: "Período da busca alterado",
  CIENCIA_ATIVADA: "Ciência automática ativada", CIENCIA_DESATIVADA: "Ciência automática desativada", EMPRESA_EXCLUIDA: "Empresa excluída",
};

function Bloco({ titulo, children, acao }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-sm">{titulo}</h3>{acao}</div>
      {children}
    </section>
  );
}

/** Certificado digital A1 do cliente (cofre). Mudanças só para administradores. */
export default function CertificadoXml({ empresaId }) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const confirmar = useConfirmar();
  const qc = useQueryClient();
  const [envioAberto, setEnvioAberto] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["repo-xml-cert", empresaId], queryFn: () => api.get(`${base(empresaId)}/certificado`) });
  const { data: auditoria } = useQuery({
    queryKey: ["repo-xml-auditoria", empresaId], queryFn: () => api.get(`${base(empresaId)}/auditoria-certificado`, { limite: 20 }), enabled: admin,
  });
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["repo-xml-cert", empresaId] }); qc.invalidateQueries({ queryKey: ["repo-xml-auditoria", empresaId] }); };

  const enviar = useMutation({
    mutationFn: () => api.upload(`${base(empresaId)}/certificado`, arquivo, { senha }),
    onSuccess: (c) => {
      setSenha(""); setArquivo(null); setErro(""); setEnvioAberto(false); atualizar();
      toast({ title: "Certificado guardado no cofre", description: `${c.titular}, válido até ${fmtData(c.valido_ate)}. A senha do arquivo não foi guardada.` });
    },
    onError: (e) => { setSenha(""); setErro(e.message); },
  });
  const remover = useMutation({
    mutationFn: () => api.delete(`${base(empresaId)}/certificado`),
    onSuccess: () => { atualizar(); toast({ title: "Certificado removido do cofre", description: "A chave foi apagada e a captura desta empresa foi desativada." }); },
    onError: (e) => toast({ title: "Não foi possível remover", description: e.message, variant: "destructive" }),
  });

  const abrirEnvio = () => { setArquivo(null); setSenha(""); setErro(""); setEnvioAberto(true); };
  const confirmarRemocao = async () => {
    if (await confirmar({ titulo: "Remover o certificado do cofre?", descricao: "A chave privada guardada será apagada e a captura automática desta empresa será desativada. Para voltar a usar, será preciso enviar o certificado de novo.", rotulo: "Remover" })) remover.mutate();
  };

  if (isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…</p>;
  const cert = data?.certificado;
  const ativo = cert && cert.situacao !== "REVOGADO";
  const [rotuloSituacao, classeSituacao] = SITUACAO[cert?.situacao] || SITUACAO.REVOGADO;

  return (
    <div className="space-y-4">
      {!data?.cofre_configurado && (
        <div role="alert" className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
          <p>O cofre de certificados ainda não está configurado neste servidor. Quem administra o servidor precisa definir a chave-mestra <code>CERT_VAULT_KEY</code> (passo a passo no arquivo <code>.env.example</code>) antes de guardar certificados.</p>
        </div>
      )}

      <Bloco titulo="Certificado digital A1 do cliente" acao={admin && data?.cofre_configurado && (
        <button type="button" onClick={abrirEnvio} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"><KeyRound className="w-4 h-4" /> {ativo ? "Substituir certificado" : "Enviar certificado A1"}</button>
      )}>
        {!cert ? (
          <p className="text-sm text-muted-foreground">Nenhum certificado guardado para {data?.empresa?.razao_social || "esta empresa"}. O certificado A1 (arquivo .pfx ou .p12) do próprio cliente permite capturar sozinho os XML das notas em que ele é destinatário.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><ShieldCheck className="w-4 h-4 text-muted-foreground" aria-hidden="true" /><span className="font-medium">{cert.titular}</span><span className={`rounded px-1.5 py-0.5 text-xs ${classeSituacao}`}>{rotuloSituacao}</span></div>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              <div className="flex gap-2"><dt className="text-muted-foreground">CNPJ/CPF do titular</dt><dd className="tabular-nums">{cert.documento_formatado}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Emitido por</dt><dd>{cert.emissor || "—"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Válido de</dt><dd>{fmtData(cert.valido_de)} até {fmtData(cert.valido_ate)}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Vence em</dt><dd className={cert.dias_para_vencer < 30 ? "text-amber-700 dark:text-amber-400 font-medium" : ""}>{cert.situacao === "REVOGADO" ? "—" : cert.dias_para_vencer < 0 ? "vencido" : `${cert.dias_para_vencer} dia(s)`}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Enviado por</dt><dd>{cert.enviado_por} em {fmtDataHora(cert.enviado_em)}</dd></div>
              {cert.revogado_em && <div className="flex gap-2"><dt className="text-muted-foreground">Removido</dt><dd>{cert.revogado_por} em {fmtDataHora(cert.revogado_em)}</dd></div>}
            </dl>
            {admin && cert.situacao !== "REVOGADO" && (
              <button type="button" onClick={confirmarRemocao} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /> Remover do cofre</button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">A chave privada fica cifrada (AES-256-GCM) com uma chave que não está no banco de dados. A senha do arquivo é usada só no envio e não é guardada. Cada uso do certificado fica registrado na auditoria.</p>
      </Bloco>

      {admin && (
        <Bloco titulo="Auditoria do cofre (últimos 20 registros)">
          {!auditoria?.length ? <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-2 pr-3">Quando</th><th className="py-2 pr-3">Ação</th><th className="py-2 pr-3">Quem</th><th className="py-2">Detalhe</th></tr></thead>
              <tbody>{auditoria.map((a) => (
                <tr key={a.id} className="border-b border-border/60"><td className="py-1.5 pr-3 whitespace-nowrap">{fmtDataHora(a.createdAt)}</td><td className="py-1.5 pr-3 whitespace-nowrap">{ACAO[a.acao] || a.acao}</td><td className="py-1.5 pr-3">{a.usuario}</td><td className="py-1.5 text-muted-foreground">{a.detalhe}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Bloco>
      )}

      <Dialog open={envioAberto} onOpenChange={(v) => { if (!enviar.isPending) { setEnvioAberto(v); if (!v) setSenha(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar certificado A1</DialogTitle>
            <DialogDescription>Arquivo .pfx ou .p12 do próprio cliente ({data?.empresa?.cnpj_formatado || "CNPJ não cadastrado"}). O InTAX confere a senha, a validade e se o titular é a empresa; só então guarda a chave cifrada.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); setErro(""); enviar.mutate(); }}>
            <label className="block space-y-1"><span className="font-medium">Arquivo do certificado</span>
              <input type="file" accept=".pfx,.p12" className={campo} onChange={(e) => setArquivo(e.target.files?.[0] || null)} /></label>
            <label className="block space-y-1"><span className="font-medium">Senha do certificado</span>
              <input type="password" autoComplete="new-password" className={campo} value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
            {erro && <p role="alert" className="text-destructive">{erro}</p>}
            <DialogFooter>
              <button type="button" disabled={enviar.isPending} onClick={() => setEnvioAberto(false)} className="px-4 py-2 rounded-md border border-border hover:bg-muted disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={enviar.isPending || !arquivo || !senha} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50">
                {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Guardar no cofre
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
