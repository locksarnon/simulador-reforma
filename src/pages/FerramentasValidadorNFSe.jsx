import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Upload, CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";

const CAMADAS = [
  { key: "estrutura", titulo: "1. Estrutura do XML", desc: "O arquivo está bem formado e a raiz é reconhecida (DPS/NFSe)?" },
  { key: "autorizacao", titulo: "2. Pronto para autorização", desc: "Os campos obrigatórios do grupo IBS/CBS estão presentes e no formato exigido pelo XSD oficial (v1.01)?" },
  { key: "conformidade", titulo: "3. Conformidade tributária (inferência nossa)", desc: "Os códigos usados (cIndOp/cClassTrib) existem no nosso catálogo (Anexo VIII / Catálogos IBS-CBS). Não é uma regra oficial — é um cruzamento com o que já temos cadastrado." },
];

const SEVERIDADE_ICON = {
  info: <CheckCircle2 className="w-4 h-4 text-chart-2 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />,
  blocking: <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />,
};

function ResultBadge({ ok, label }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${ok ? "border-chart-2/30 bg-chart-2/10 text-chart-2" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {label}
    </div>
  );
}

export default function FerramentasValidadorNFSe() {
  const [xml, setXml] = useState("");
  const [resultado, setResultado] = useState(null);
  const [validando, setValidando] = useState(false);
  const [erro, setErro] = useState("");
  const fileRef = useRef(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setXml(String(reader.result || ""));
    reader.readAsText(file);
    e.target.value = "";
  };

  const validar = async () => {
    if (!xml.trim()) return;
    setValidando(true);
    setErro("");
    setResultado(null);
    try {
      const resp = await base44.functions.invoke("validarNfse", { xml });
      setResultado(resp.data);
    } catch (err) {
      setErro(err.message || "Falha ao validar.");
    } finally {
      setValidando(false);
    }
  };

  const checksPorCamada = (camada) => (resultado?.checks || []).filter((c) => c.camada === camada);

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Validador NFS-e" }]} />
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-heading font-semibold">Validador NFS-e (DPS Padrão Nacional)</h1>
            <InfoTooltip pagina="ferramentas" chave="validador_nfse_header" />
          </div>
          <p className="text-sm text-muted-foreground">
            Cole ou envie o XML da DPS/NFS-e para conferir a estrutura e os campos de IBS/CBS exigidos pelo layout nacional (XSD v1.01).
            Nada é salvo — o XML é processado só na hora e descartado.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <Textarea
            value={xml}
            onChange={(e) => setXml(e.target.value)}
            placeholder="Cole aqui o conteúdo do XML da DPS/NFS-e…"
            className="font-mono text-xs min-h-[220px]"
          />
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"
              type="button"
            >
              <Upload className="w-4 h-4" /> Enviar arquivo .xml
            </button>
            <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={onFile} />
            <button
              onClick={validar}
              disabled={!xml.trim() || validando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {validando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {validando ? "Validando…" : "Validar"}
            </button>
          </div>
        </div>

        {erro && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3">{erro}</div>
        )}

        {resultado && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ResultBadge ok={resultado.estruturaValida} label="Estrutura válida" />
              <ResultBadge ok={resultado.prontoParaAutorizacao} label="Pronto para autorização" />
              <ResultBadge ok={resultado.conformidadeTributaria} label="Conformidade tributária" />
            </div>

            {CAMADAS.map((c) => {
              const checks = checksPorCamada(c.key);
              if (checks.length === 0) return null;
              return (
                <div key={c.key} className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-medium">{c.titulo}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">{c.desc}</p>
                  <div className="space-y-2">
                    {checks.map((chk, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        {SEVERIDADE_ICON[chk.severidade] || <Info className="w-4 h-4 shrink-0 mt-0.5" />}
                        <span>{chk.mensagem}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <p className="text-xs text-muted-foreground">
              * A camada "Conformidade tributária" é um cruzamento com o nosso próprio catálogo (Anexo VIII RTC e Catálogos IBS/CBS cadastrados),
              não uma validação oficial da Receita Federal ou do Comitê Gestor. Um código não encontrado pode simplesmente estar fora do que já
              importamos — confira manualmente antes de rejeitar um documento por isso.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
