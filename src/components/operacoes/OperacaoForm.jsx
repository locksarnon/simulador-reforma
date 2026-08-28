import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import InfoTooltip from "@/components/InfoTooltip";

const DIRECOES = ["Saida", "Entrada"];
const TIPOS = ["Mercadoria", "Servico", "Outro"];
const DOCS = ["NF-e", "NFC-e", "CT-e", "NFS-e", "DUIMP"];
const REGIMES = ["Lucro Real", "Lucro Presumido", "Simples Nacional", "Produtor rural PF"];
const SIM_NAO = ["Sim", "Não"];

function Field({ label, children, full, pagina, chave }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">
        {label} {chave && <InfoTooltip pagina={pagina} chave={chave} />}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function OperacaoForm({ initial, empresas, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    id_operacao: "",
    empresa_id: "",
    data: "",
    ano: new Date().getFullYear(),
    direcao: "Saida",
    tipo: "Mercadoria",
    descricao: "",
    quantidade: 0,
    preco_unitario: 0,
    desconto_incondicional: 0,
    frete: 0,
    seguro: 0,
    outras_despesas: 0,
    valor_bruto: 0,
    ncm: "",
    nbs: "",
    cfop_servico: "",
    uf_origem: "",
    uf_destino: "",
    municipio_destino: "",
    documento: "NF-e",
    regime_atual: "Lucro Real",
    c_class_trib: "000001",
    cst_ibs_cbs: "000",
    pis_pct: 0,
    cofins_pct: 0,
    icms_pct: 0,
    fcp_pct: 0,
    mva_st_pct: 0,
    iss_pct: 0,
    ipi_pct: 0,
    credito_elegivel_pct: 0,
    split_pct: 0,
    c_cred_pres: "",
    credito_presumido_ibs_pct: 0,
    credito_presumido_cbs_pct: 0,
    grupo_rtc: "",
    finalidade_dfe: "",
    crt_emitente: "3 - Regime Normal",
    ambiente: "Producao",
    reducao_informada: "Não",
    diferimento_informado: "Não",
    tributacao_regular_informada: "Não",
    credito_presumido_informado: "Não",
    compra_governamental_informado: "Não",
    custo_base_pct: 0.65,
    margem_meta_pct: 0.18,
    observacao_dfe: "",
    ...initial,
  }));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // auto-calc valor bruto
  const recalcValorBruto = (next) => {
    const q = Number(next.quantidade || 0);
    const p = Number(next.preco_unitario || 0);
    const desc = Number(next.desconto_incondicional || 0);
    const fret = Number(next.frete || 0);
    const seg = Number(next.seguro || 0);
    const out = Number(next.outras_despesas || 0);
    return Math.max(0, q * p - desc + fret + seg + out);
  };

  const handleNum = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: Number(v) };
      if (["quantidade", "preco_unitario", "desconto_incondicional", "frete", "seguro", "outras_despesas"].includes(k)) {
        next.valor_bruto = recalcValorBruto(next);
      }
      return next;
    });
  };

  // Percentuais: o usuário digita o valor em pontos percentuais (1,65) e o
  // motor recebe a fração decimal (0,0165). Exibe valor×100, armazena /100.
  const handlePct = (k) => (e) => set(k, Number(e.target.value) / 100);

  const submit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          Identificação <InfoTooltip pagina="operacao_form" chave="header_identificacao" />
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ID operação" pagina="operacao_form" chave="id_operacao">
            <Input value={form.id_operacao} onChange={(e) => set("id_operacao", e.target.value)} placeholder="OP-001" required />
          </Field>
          <Field label="Empresa" pagina="operacao_form" chave="empresa_id">
            <Select value={form.empresa_id} onValueChange={(v) => set("empresa_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {empresas.map((em) => (
                  <SelectItem key={em.id} value={em.id_empresa}>{em.id_empresa} — {em.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Data" pagina="operacao_form" chave="data">
            <Input type="date" value={form.data ? form.data.slice(0, 10) : ""} onChange={(e) => set("data", e.target.value ? e.target.value + "T00:00:00.000Z" : "")} />
          </Field>
          <Field label="Ano" pagina="operacao_form" chave="ano">
            <Input type="number" value={form.ano} onChange={(e) => set("ano", Number(e.target.value))} />
          </Field>
          <Field label="Direção" pagina="operacao_form" chave="direcao">
            <Select value={form.direcao} onValueChange={(v) => set("direcao", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIRECOES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tipo" pagina="operacao_form" chave="tipo">
            <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Descrição" full pagina="operacao_form" chave="descricao">
            <Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          Valores <InfoTooltip pagina="operacao_form" chave="header_valores" />
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantidade" pagina="operacao_form" chave="quantidade"><Input type="number" step="any" value={form.quantidade} onChange={handleNum("quantidade")} /></Field>
          <Field label="Preço unitário" pagina="operacao_form" chave="preco_unitario"><Input type="number" step="any" value={form.preco_unitario} onChange={handleNum("preco_unitario")} /></Field>
          <Field label="Desconto incondicional" pagina="operacao_form" chave="desconto_incondicional"><Input type="number" step="any" value={form.desconto_incondicional} onChange={handleNum("desconto_incondicional")} /></Field>
          <Field label="Frete" pagina="operacao_form" chave="frete"><Input type="number" step="any" value={form.frete} onChange={handleNum("frete")} /></Field>
          <Field label="Seguro" pagina="operacao_form" chave="seguro"><Input type="number" step="any" value={form.seguro} onChange={handleNum("seguro")} /></Field>
          <Field label="Outras despesas" pagina="operacao_form" chave="outras_despesas"><Input type="number" step="any" value={form.outras_despesas} onChange={handleNum("outras_despesas")} /></Field>
          <Field label="Valor bruto (calculado)" full pagina="operacao_form" chave="valor_bruto">
            <Input type="number" step="any" value={form.valor_bruto} onChange={(e) => set("valor_bruto", Number(e.target.value))} className="font-medium" />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          Classificação fiscal <InfoTooltip pagina="operacao_form" chave="header_classificacao" />
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="NCM" pagina="operacao_form" chave="ncm"><Input value={form.ncm} onChange={(e) => set("ncm", e.target.value)} /></Field>
          <Field label="NBS" pagina="operacao_form" chave="nbs"><Input value={form.nbs} onChange={(e) => set("nbs", e.target.value)} /></Field>
          <Field label="CFOP / serviço" pagina="operacao_form" chave="cfop_servico"><Input value={form.cfop_servico} onChange={(e) => set("cfop_servico", e.target.value)} /></Field>
          <Field label="UF origem" pagina="operacao_form" chave="uf_origem"><Input value={form.uf_origem} onChange={(e) => set("uf_origem", e.target.value)} /></Field>
          <Field label="UF destino" pagina="operacao_form" chave="uf_destino"><Input value={form.uf_destino} onChange={(e) => set("uf_destino", e.target.value)} /></Field>
          <Field label="Município destino" pagina="operacao_form" chave="municipio_destino"><Input value={form.municipio_destino} onChange={(e) => set("municipio_destino", e.target.value)} /></Field>
          <Field label="Documento" pagina="operacao_form" chave="documento">
            <Select value={form.documento} onValueChange={(v) => set("documento", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DOCS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Regime atual" pagina="operacao_form" chave="regime_atual">
            <Select value={form.regime_atual} onValueChange={(v) => set("regime_atual", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REGIMES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="cClassTrib" pagina="operacao_form" chave="c_class_trib"><Input value={form.c_class_trib} onChange={(e) => set("c_class_trib", e.target.value)} /></Field>
          <Field label="CST IBS/CBS" pagina="operacao_form" chave="cst_ibs_cbs"><Input value={form.cst_ibs_cbs} onChange={(e) => set("cst_ibs_cbs", e.target.value)} /></Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          Tributos atuais (%) <InfoTooltip pagina="operacao_form" chave="header_tributos_atuais" />
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            ["PIS %", "pis_pct"], ["Cofins %", "cofins_pct"], ["ICMS %", "icms_pct"],
            ["FCP %", "fcp_pct"], ["MVA ST %", "mva_st_pct"], ["ISS %", "iss_pct"],
            ["IPI %", "ipi_pct"], ["Crédito elegível %", "credito_elegivel_pct"],
          ].map(([label, key]) => (
            <Field key={key} label={label} pagina="operacao_form" chave={key}>
              <Input type="number" step="any" value={form[key] * 100} onChange={handlePct(key)} />
            </Field>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          IBS/CBS e split <InfoTooltip pagina="operacao_form" chave="header_ibs_cbs" />
        </h3>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Split %" pagina="operacao_form" chave="split_pct"><Input type="number" step="any" value={form.split_pct * 100} onChange={handlePct("split_pct")} /></Field>
          <Field label="cCredPres" pagina="operacao_form" chave="c_cred_pres"><Input value={form.c_cred_pres} onChange={(e) => set("c_cred_pres", e.target.value)} /></Field>
          <Field label="Crédito presumido IBS %" pagina="operacao_form" chave="credito_presumido_ibs_pct"><Input type="number" step="any" value={form.credito_presumido_ibs_pct * 100} onChange={handlePct("credito_presumido_ibs_pct")} /></Field>
          <Field label="Crédito presumido CBS %" pagina="operacao_form" chave="credito_presumido_cbs_pct"><Input type="number" step="any" value={form.credito_presumido_cbs_pct * 100} onChange={handlePct("credito_presumido_cbs_pct")} /></Field>
          <Field label="Grupo RTC" pagina="operacao_form" chave="grupo_rtc"><Input value={form.grupo_rtc} onChange={(e) => set("grupo_rtc", e.target.value)} /></Field>
          <Field label="Custo base % (p/ margem)" pagina="operacao_form" chave="custo_base_pct"><Input type="number" step="any" value={form.custo_base_pct * 100} onChange={handlePct("custo_base_pct")} /></Field>
          <Field label="Margem meta %" pagina="operacao_form" chave="margem_meta_pct"><Input type="number" step="any" value={form.margem_meta_pct * 100} onChange={handlePct("margem_meta_pct")} /></Field>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          DF-e <InfoTooltip pagina="operacao_form" chave="header_dfe" />
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Finalidade DF-e" pagina="operacao_form" chave="finalidade_dfe"><Input value={form.finalidade_dfe} onChange={(e) => set("finalidade_dfe", e.target.value)} /></Field>
          <Field label="CRT emitente" pagina="operacao_form" chave="crt_emitente"><Input value={form.crt_emitente} onChange={(e) => set("crt_emitente", e.target.value)} /></Field>
          <Field label="Ambiente" pagina="operacao_form" chave="ambiente">
            <Select value={form.ambiente} onValueChange={(v) => set("ambiente", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Producao">Produção</SelectItem>
                <SelectItem value="Homologacao">Homologação</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Redução informada?" pagina="operacao_form" chave="reducao_informada">
            <Select value={form.reducao_informada} onValueChange={(v) => set("reducao_informada", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIM_NAO.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Diferimento informado?" pagina="operacao_form" chave="diferimento_informado">
            <Select value={form.diferimento_informado} onValueChange={(v) => set("diferimento_informado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIM_NAO.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Tributação regular informada?" pagina="operacao_form" chave="tributacao_regular_informada">
            <Select value={form.tributacao_regular_informada} onValueChange={(v) => set("tributacao_regular_informada", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIM_NAO.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Crédito presumido informado?" pagina="operacao_form" chave="credito_presumido_informado">
            <Select value={form.credito_presumido_informado} onValueChange={(v) => set("credito_presumido_informado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIM_NAO.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Compra governamental informada?" pagina="operacao_form" chave="compra_governamental_informado">
            <Select value={form.compra_governamental_informado} onValueChange={(v) => set("compra_governamental_informado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIM_NAO.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Observação DF-e" full pagina="operacao_form" chave="observacao_dfe">
            <Input value={form.observacao_dfe} onChange={(e) => set("observacao_dfe", e.target.value)} />
          </Field>
        </div>
      </section>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted">
          Cancelar
        </button>
        <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
          Salvar operação
        </button>
      </div>
    </form>
  );
}