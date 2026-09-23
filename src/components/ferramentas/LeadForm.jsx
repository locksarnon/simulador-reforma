import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api/base44Client";
import { PORTES } from "@/lib/calculadoraAgro";

const CHAVE = "intax_lead";

/** Lembra os dados do contato neste navegador para não pedir de novo em outra ferramenta. */
export function lerLeadSalvo() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch { return null; }
}

/**
 * Captura de contato das ferramentas públicas. Poucos campos obrigatórios
 * (nome, e-mail) para não espantar; o resto ajuda a qualificar o contato.
 */
export default function LeadForm({ origem, titulo, subtitulo, botao = "Receber o relatório", relatorio, dados, perfil, segmento, regime, onSucesso }) {
  const salvo = lerLeadSalvo() || {};
  const [f, setF] = useState({
    nome: salvo.nome || "", email: salvo.email || "", empresa: salvo.empresa || "", cargo: salvo.cargo || "",
    telefone: salvo.telefone || "", porte: salvo.porte || "", consentimento: salvo.consentimento ?? true,
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const enviar = async (e) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = await api.post("/public/leads", {
        nome: f.nome, email: f.email, empresa: f.empresa, cargo: f.cargo, telefone: f.telefone, porte: f.porte,
        perfil, segmento, regime, origem, consentimento_email: f.consentimento, dados, relatorio,
      });
      try { localStorage.setItem(CHAVE, JSON.stringify(f)); } catch { /* navegador sem storage */ }
      onSucesso?.({ ...r, email: f.email.trim().toLowerCase(), nome: f.nome });
    } catch (err) {
      setErro(err.message || "Não foi possível enviar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-heading font-semibold text-base">{titulo}</h3>
        {subtitulo && <p className="text-sm text-muted-foreground mt-1">{subtitulo}</p>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label className="text-xs">Nome *</Label><Input value={f.nome} onChange={(e) => set("nome", e.target.value)} required autoComplete="name" /></div>
        <div><Label className="text-xs">E-mail *</Label><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} required autoComplete="email" /></div>
        <div><Label className="text-xs">Empresa</Label><Input value={f.empresa} onChange={(e) => set("empresa", e.target.value)} autoComplete="organization" /></div>
        <div><Label className="text-xs">Cargo</Label><Input value={f.cargo} onChange={(e) => set("cargo", e.target.value)} placeholder="Ex.: sócio, diretor financeiro" /></div>
        <div><Label className="text-xs">WhatsApp / telefone</Label><Input value={f.telefone} onChange={(e) => set("telefone", e.target.value)} autoComplete="tel" /></div>
        <div>
          <Label className="text-xs">Porte</Label>
          <select value={f.porte} onChange={(e) => set("porte", e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Selecione</option>
            {PORTES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
        <input type="checkbox" checked={f.consentimento} onChange={(e) => set("consentimento", e.target.checked)} className="mt-0.5" />
        <span>Aceito receber novidades da reforma tributária por e-mail (posso cancelar quando quiser). Seus dados são usados só para enviar este relatório e o contato da equipe FAL Agro, conforme a LGPD.</span>
      </label>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <button type="submit" disabled={enviando} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
        {enviando ? "Enviando…" : botao}
      </button>
    </form>
  );
}
