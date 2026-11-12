import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base, fmtData, fmtDataHora } from "./formatos";
import { plural } from "@/lib/plural";

const campo = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const SITUACAO = {
  ATIVO: ["Ativo", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"],
  VENCIDO: ["Vencido", "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"],
  REVOGADO: ["Removido do cofre", "bg-muted text-muted-foreground"],
};
const ACAO = {
  ENVIO: "Envio do certificado", REVOGACAO: "Remoção do certificado",
  USO_CAPTURA: "Uso na captura", USO_MANIFESTACAO: "Uso na manifestação", USO_INTEGRA_CONTADOR: "Uso no Integra Contador (termo de autorização)", USO_CONSULTA_CADASTRO: "Uso na consulta ao cadastro do ICMS (pré-análise)",
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

/** PIN do cofre: quando ligado, enviar, substituir ou remover certificado pede o PIN. Só o hash fica guardado. */
export function PinDoCofre({ ativo }) {
  const qc = useQueryClient();
  const [atual, setAtual] = useState("");
  const [novo, setNovo] = useState("");
  const salvar = useMutation({
    mutationFn: (valor) => api.put("/certificados/pin", { atual, novo: valor }),
    onSuccess: (r) => { setAtual(""); setNovo(""); qc.invalidateQueries({ queryKey: ["cert-pin"] }); toast({ title: r.ativo ? "PIN do cofre salvo" : "PIN do cofre tirado" }); },
    onError: (e) => toast({ title: "Não foi possível mudar o PIN", description: e.message, variant: "destructive" }),
  });
  const so = (v) => v.replace(/\D/g, "").slice(0, 8);
  return (
    <Bloco titulo={`PIN do cofre: ${ativo ? "ligado" : "desligado"}`}>
      <p className="text-xs text-muted-foreground">De 4 a 8 números; vale para todas as empresas.</p>
      <form className="flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); salvar.mutate(novo); }}>
        {ativo && <label className="space-y-1"><span className="block text-xs text-muted-foreground">PIN atual</span><input type="password" inputMode="numeric" autoComplete="off" className={campo} value={atual} onChange={(e) => setAtual(so(e.target.value))} /></label>}
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">{ativo ? "PIN novo" : "PIN"}</span><input type="password" inputMode="numeric" autoComplete="off" className={campo} value={novo} onChange={(e) => setNovo(so(e.target.value))} /></label>
        <button type="submit" disabled={novo.length < 4 || (ativo && atual.length < 4) || salvar.isPending} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-60">{ativo ? "Trocar o PIN" : "Ligar o PIN"}</button>
        {ativo && <button type="button" onClick={() => salvar.mutate("")} disabled={atual.length < 4 || salvar.isPending} className="px-3 py-2 rounded-md border border-border text-sm disabled:opacity-60">Tirar o PIN</button>}
      </form>
    </Bloco>
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
  const [pin, setPin] = useState("");
  const [pedirPin, setPedirPin] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["repo-xml-cert", empresaId], queryFn: () => api.get(`${base(empresaId)}/certificado`) });
  const { data: pinEstado } = useQuery({ queryKey: ["cert-pin"], queryFn: () => api.get("/certificados/pin") });
  const comPin = !!pinEstado?.ativo;
  const { data: auditoria } = useQuery({
    queryKey: ["repo-xml-auditoria", empresaId], queryFn: () => api.get(`${base(empresaId)}/auditoria-certificado`, { limite: 20 }), enabled: admin,
  });
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["repo-xml-cert", empresaId] }); qc.invalidateQueries({ queryKey: ["repo-xml-auditoria", empresaId] }); };

  const enviar = useMutation({
    mutationFn: () => api.upload(`${base(empresaId)}/certificado`, arquivo, { senha, ...(comPin ? { pin } : {}) }),
    onSuccess: (c) => {
      setSenha(""); setPin(""); setArquivo(null); setErro(""); setEnvioAberto(false); atualizar();
      toast({ title: "Certificado guardado no cofre", description: `${c.titular}, válido até ${fmtData(c.valido_ate)}. A senha do arquivo não foi guardada.` });
    },
    onError: (e) => { setSenha(""); setPin(""); setErro(e.message); },
  });
  const remover = useMutation({
    mutationFn: () => (comPin ? api.post(`${base(empresaId)}/certificado/remover`, { pin }) : api.delete(`${base(empresaId)}/certificado`)),
    onSuccess: () => { setPin(""); setPedirPin(false); atualizar(); toast({ title: "Certificado removido do cofre", description: "A chave foi apagada e a captura desta empresa foi desativada." }); },
    onError: (e) => toast({ title: "Não foi possível remover", description: e.message, variant: "destructive" }),
  });

  const abrirEnvio = () => { setArquivo(null); setSenha(""); setErro(""); setEnvioAberto(true); };
  const confirmarRemocao = async () => {
    if (await confirmar({ titulo: "Remover o certificado do cofre?", descricao: "A chave privada guardada será apagada e a captura automática desta empresa será desativada. Para voltar a usar, será preciso enviar o certificado de novo.", rotulo: "Remover" })) {
      if (comPin) { setPin(""); setPedirPin(true); } else remover.mutate();
    }
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
              <div className="flex gap-2"><dt className="text-muted-foreground">Vence em</dt><dd className={cert.dias_para_vencer < 30 ? "text-amber-700 dark:text-amber-400 font-medium" : ""}>{cert.situacao === "REVOGADO" ? "—" : cert.dias_para_vencer < 0 ? "vencido" : plural(cert.dias_para_vencer, "dia", "dias")}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Enviado por</dt><dd>{cert.enviado_por} em {fmtDataHora(cert.enviado_em)}</dd></div>
              {cert.revogado_em && <div className="flex gap-2"><dt className="text-muted-foreground">Removido</dt><dd>{cert.revogado_por} em {fmtDataHora(cert.revogado_em)}</dd></div>}
            </dl>
            {admin && cert.situacao !== "REVOGADO" && (
              <button type="button" onClick={confirmarRemocao} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /> Remover do cofre</button>
            )}
          </div>
        )}
      </Bloco>

      {admin && <PinDoCofre ativo={comPin} />}

      <Dialog open={pedirPin} onOpenChange={(v) => { if (!remover.isPending) { setPedirPin(v); if (!v) setPin(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>PIN do cofre</DialogTitle><DialogDescription>Para remover o certificado, digite o PIN do cofre.</DialogDescription></DialogHeader>
          <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); remover.mutate(); }}>
            <input type="password" inputMode="numeric" autoComplete="off" autoFocus aria-label="PIN do cofre" className={campo} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            <DialogFooter><button type="button" onClick={() => setPedirPin(false)} className="px-3 py-1.5 rounded-md border border-border">Cancelar</button><button type="submit" disabled={pin.length < 4 || remover.isPending} className="px-4 py-1.5 rounded-md bg-destructive text-destructive-foreground disabled:opacity-60">Remover</button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
            {comPin && <label className="block space-y-1"><span className="font-medium">PIN do cofre</span>
              <input type="password" inputMode="numeric" autoComplete="off" className={campo} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} /></label>}
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
