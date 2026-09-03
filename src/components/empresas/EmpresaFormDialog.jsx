import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import InfoTooltip from "@/components/InfoTooltip";

const SIM_NAO = ["Sim", "Não"];
const REGIMES = ["Lucro Real", "Lucro Presumido", "Simples Nacional", "Produtor rural PF"];

// Setores amplos o bastante pra cobrir a maioria dos casos sem virar uma
// lista de CNAE — se precisar de algo mais fino, "Outros" + observação resolve.
const SETORES = [
  "Comércio", "Indústria", "Serviços", "Agropecuário", "Construção Civil",
  "Tecnologia", "Saúde", "Educação", "Financeiro", "Transporte e Logística",
  "Energia", "Imobiliário", "Alimentício", "Outros",
];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

const empty = {
  id_empresa: "", grupo: "", razao_social: "", cnpj_cpf: "", regime_atual: "Lucro Real",
  setor: "", uf: "", municipio: "", contribuinte_ibs_cbs: "Sim", produtor_rural: "Não",
  cooperativa: "Não", erp: "", responsavel_fiscal: "", status: "Ativa", observacao: "",
};

/**
 * Formulário completo de Empresa — único em todo o app (antes existia uma
 * cópia resumida em WorkroomOverview.jsx e a completa em EmpresasPage.jsx,
 * divergindo aos poucos). Usado tanto pelo botão "Nova empresa" do Workroom
 * quanto pela tela "Cadastro completo" (Empresas do grupo).
 *
 * @param editing — "new" para criar, um registro de Empresa pra editar, ou
 * null/undefined pra manter o dialog fechado.
 */
export default function EmpresaFormDialog({ open, onOpenChange, editing, grupoNumero }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing === "new") setForm({ ...empty, grupo: grupoNumero || "" });
    else if (editing) setForm(editing);
  }, [open, editing, grupoNumero]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ID empresa não é mais digitado à mão — é sempre a raiz do CNPJ (8
  // primeiros dígitos, que identifica a matriz/o grupo de filiais na
  // Receita), recalculada a cada edição do campo CNPJ/CPF.
  const setCnpj = (v) => {
    const digits = v.replace(/\D/g, "");
    setForm((f) => ({ ...f, cnpj_cpf: v, id_empresa: digits.length >= 8 ? digits.slice(0, 8) : "" }));
  };

  const buscarCnpj = async () => {
    const digits = form.cnpj_cpf.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast({ title: "CNPJ incompleto", description: "Preencha os 14 dígitos do CNPJ pra consultar a Receita Federal.", variant: "destructive" });
      return;
    }
    setBuscandoCnpj(true);
    try {
      const dados = await base44.integrations.Core.ConsultarCNPJ(digits);
      setForm((f) => ({
        ...f,
        razao_social: dados.razao_social || f.razao_social,
        uf: dados.uf || f.uf,
        municipio: dados.municipio || f.municipio,
      }));
      toast({ title: "CNPJ encontrado", description: dados.razao_social || "Dados da Receita Federal aplicados." });
    } catch (err) {
      toast({ title: "Falha ao consultar CNPJ", description: err.message, variant: "destructive" });
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, grupo: grupoNumero || form.grupo };
    if (editing === "new") await base44.entities.Empresa.create(payload);
    else await base44.entities.Empresa.update(editing.id, payload);
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["empresas"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing === "new" ? "Nova empresa" : `Editar ${editing?.id_empresa}`}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">CNPJ/CPF <InfoTooltip pagina="empresas" chave="cnpj_cpf" /></Label>
            <div className="flex gap-2">
              <Input value={form.cnpj_cpf} onChange={(e) => setCnpj(e.target.value)} placeholder="Só CNPJ tem busca na Receita" />
              <button
                type="button"
                onClick={buscarCnpj}
                disabled={buscandoCnpj}
                title="Consultar dados na Receita Federal (BrasilAPI)"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"
              >
                {buscandoCnpj ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Buscar
              </button>
            </div>
          </div>
          <div>
            <Label className="text-xs">ID empresa <InfoTooltip pagina="empresas" chave="id_empresa" /></Label>
            <Input value={form.id_empresa} disabled readOnly placeholder="Gerado a partir do CNPJ" className="bg-muted/50 cursor-not-allowed" />
          </div>
          <div className="col-span-2"><Label className="text-xs">Razão social <InfoTooltip pagina="empresas" chave="razao_social" /></Label><Input value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} required /></div>
          <div><Label className="text-xs">Grupo <InfoTooltip pagina="empresas" chave="grupo" /></Label><Input value={form.grupo} disabled readOnly className="bg-muted/50 cursor-not-allowed" /></div>
          <div>
            <Label className="text-xs">Regime atual <InfoTooltip pagina="empresas" chave="regime_atual" /></Label>
            <Select value={form.regime_atual} onValueChange={(v) => set("regime_atual", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REGIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Setor <InfoTooltip pagina="empresas" chave="setor" /></Label>
            <Select value={form.setor || undefined} onValueChange={(v) => set("setor", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{SETORES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">UF <InfoTooltip pagina="empresas" chave="uf" /></Label>
            <Select value={form.uf || undefined} onValueChange={(v) => set("uf", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Município <InfoTooltip pagina="empresas" chave="municipio" /></Label><Input value={form.municipio} onChange={(e) => set("municipio", e.target.value)} /></div>
          <div>
            <Label className="text-xs">Contribuinte IBS/CBS <InfoTooltip pagina="empresas" chave="contribuinte_ibs_cbs" /></Label>
            <Select value={form.contribuinte_ibs_cbs} onValueChange={(v) => set("contribuinte_ibs_cbs", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIM_NAO.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Produtor rural <InfoTooltip pagina="empresas" chave="produtor_rural" /></Label>
            <Select value={form.produtor_rural} onValueChange={(v) => set("produtor_rural", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIM_NAO.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">ERP <InfoTooltip pagina="empresas" chave="erp" /></Label><Input value={form.erp} onChange={(e) => set("erp", e.target.value)} /></div>
          <div><Label className="text-xs">Responsável fiscal <InfoTooltip pagina="empresas" chave="responsavel_fiscal" /></Label><Input value={form.responsavel_fiscal} onChange={(e) => set("responsavel_fiscal", e.target.value)} /></div>
          <div className="col-span-2"><Label className="text-xs">Observação <InfoTooltip pagina="empresas" chave="observacao" /></Label><Input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} /></div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 text-sm rounded-md border border-border">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">Salvar</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
