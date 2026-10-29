import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import InfoTooltip from "@/components/InfoTooltip";
import PctInput from "@/components/ui/pct-input";
import { useRascunho } from "@/hooks/useRascunho";
import RascunhoAviso from "@/components/RascunhoAviso";
import { RESSALVA_CRED_PRES } from "@/lib/ressalvas";
import { sugerirTributosAtuais } from "@/lib/tabelasLegais";
import { PRODUTOS_COMBUSTIVEL } from "@/motor/combustiveis";
import { TETO_IS_BENS_MINERAIS, classificarImpostoSeletivo } from "@/motor/impostoSeletivo";
import { CREDITOS_PRESUMIDOS, codigoParaTela, creditoPresumidoPorCodigo } from "@/lib/creditoPresumido";
import { chaveCredPres } from "@/motor/taxEngine";

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

// Serviço de transporte: CFOPs de prestação (x351 a x360) ou descrição de frete. A dica do transporte só aparece para eles.
const ehServicoDeTransporte = (f) =>
  f.tipo === "Servico" &&
  (/^[1-35-7]35[1-9]$|^[1-35-7]360$/.test(String(f.cfop_servico || "").trim()) ||
    /frete|transport|\bct-?e\b|carga/i.test(String(f.descricao || "")));

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
    is_pct: 0,
    combustivel_produto: "",
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
  const rascunho = useRascunho(`operacao:${initial?.id || "nova"}`, form, true);

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

  // Preenchimento pela tabela da legislação (PIS/Cofins pelo regime; ICMS só quando interestadual).
  const [explicacaoTabela, setExplicacaoTabela] = useState([]);
  const aplicarTabela = () => {
    const s = sugerirTributosAtuais(form);
    setForm((f) => ({
      ...f,
      ...(s.pis_pct !== undefined ? { pis_pct: s.pis_pct, cofins_pct: s.cofins_pct } : {}),
      ...(s.icms_pct !== undefined ? { icms_pct: s.icms_pct } : {}),
    }));
    setExplicacaoTabela(s.explicacao);
  };

  // Regimes específicos: o NCM no Anexo XVII da LC 214 avisa do Imposto Seletivo; o produto de combustível define a unidade da quantidade.
  const enquadramentoIs = classificarImpostoSeletivo(form.ncm);
  const produtoComb = PRODUTOS_COMBUSTIVEL.find((p) => p.id === form.combustivel_produto);
  // Crédito presumido: a orientação muda com o código escolhido (frete de autônomo, produtor rural, resíduos, bem usado).
  const credPresSel = creditoPresumidoPorCodigo(form.c_cred_pres);
  // "2" e "02" são o mesmo código: a lista mostra a opção oficial (dois dígitos, como no XML) para as duas formas.
  const opcaoOficial = CREDITOS_PRESUMIDOS.find((c) => chaveCredPres(c.codigo) === chaveCredPres(form.c_cred_pres));
  const codigoCredPresSelect = opcaoOficial ? opcaoOficial.codigo : form.c_cred_pres;
  const codigoForaDaTabela = Boolean(form.c_cred_pres) && !opcaoOficial;

  const submit = (e) => {
    e.preventDefault();
    rascunho.limpar();
    // Select não aceita valor vazio: "nenhum" volta a ser nulo no banco.
    onSave({ ...form, combustivel_produto: form.combustivel_produto || null });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <RascunhoAviso rascunho={rascunho} aplicar={(v) => setForm(v)} />
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
          {ehServicoDeTransporte(form) && (
            <p className="col-span-3 text-xs text-muted-foreground bg-muted/40 border border-border rounded-md p-2.5">
              Serviço de transporte: o frete de carga usa a tributação integral (cClassTrib 000001) e o local da operação é o da entrega (LC 214, art. 11, VII), então informe a UF e o município de destino.
              Passageiros: 200049 (coletivo rodoviário, ferroviário e hidroviário intermunicipal e interestadual, redução de 40%), 200050 (aéreo regional de passageiros ou de carga, 40%) e 200021 (urbano ferroviário e hidroviário, alíquota zero).
              Transporte de bens a zonas de exportação: 200001.
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          Tributos atuais (%) <InfoTooltip pagina="operacao_form" chave="header_tributos_atuais" />
          <button type="button" onClick={aplicarTabela} className="ml-auto text-xs font-normal px-2.5 py-1 rounded-md border border-border hover:bg-muted" title="Preenche PIS/Cofins pelo regime e o ICMS interestadual pelas UFs">
            Preencher pela tabela da legislação
          </button>
        </h3>
        {explicacaoTabela.length > 0 && (
          <ul className="mb-3 text-xs text-muted-foreground list-disc pl-5 space-y-0.5">{explicacaoTabela.map((t) => <li key={t}>{t}</li>)}</ul>
        )}
        <div className="grid grid-cols-4 gap-3">
          {[
            ["PIS %", "pis_pct"], ["Cofins %", "cofins_pct"], ["ICMS %", "icms_pct"],
            ["FCP %", "fcp_pct"], ["MVA ST %", "mva_st_pct"], ["ISS %", "iss_pct"],
            ["IPI %", "ipi_pct"], ["Crédito elegível %", "credito_elegivel_pct"],
          ].map(([label, key]) => (
            <Field key={key} label={label} pagina="operacao_form" chave={key}>
              <PctInput value={form[key]} onChange={(v) => set(key, v)} />
            </Field>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          IBS/CBS e split <InfoTooltip pagina="operacao_form" chave="header_ibs_cbs" />
        </h3>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Split %" pagina="operacao_form" chave="split_pct"><PctInput value={form.split_pct} onChange={(v) => set("split_pct", v)} /></Field>
          <Field label="Crédito presumido (cCredPres)" pagina="operacao_form" chave="c_cred_pres">
            <Select value={codigoCredPresSelect || "nenhum"} onValueChange={(v) => set("c_cred_pres", v === "nenhum" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum</SelectItem>
                {CREDITOS_PRESUMIDOS.map((c) => <SelectItem key={c.codigo} value={c.codigo}>{codigoParaTela(c.codigo)} — {c.nome}</SelectItem>)}
                {codigoForaDaTabela && <SelectItem value={form.c_cred_pres}>{form.c_cred_pres} ({credPresSel ? "código antigo" : "fora da tabela oficial"})</SelectItem>}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Crédito presumido IBS %" pagina="operacao_form" chave="credito_presumido_ibs_pct"><PctInput value={form.credito_presumido_ibs_pct} onChange={(v) => set("credito_presumido_ibs_pct", v)} /></Field>
          <Field label="Crédito presumido CBS %" pagina="operacao_form" chave="credito_presumido_cbs_pct"><PctInput value={form.credito_presumido_cbs_pct} onChange={(v) => set("credito_presumido_cbs_pct", v)} /></Field>
          <Field label="Grupo RTC" pagina="operacao_form" chave="grupo_rtc"><Input value={form.grupo_rtc} onChange={(e) => set("grupo_rtc", e.target.value)} /></Field>
          <Field label="Custo base % (p/ margem)" pagina="operacao_form" chave="custo_base_pct"><PctInput value={form.custo_base_pct} onChange={(v) => set("custo_base_pct", v)} /></Field>
          <Field label="Margem meta %" pagina="operacao_form" chave="margem_meta_pct"><PctInput value={form.margem_meta_pct} onChange={(v) => set("margem_meta_pct", v)} /></Field>
        </div>
        {credPresSel && (
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-muted-foreground bg-muted/40 border border-border rounded-md p-2.5">
              <b className="text-foreground">{credPresSel.nome}.</b> {credPresSel.orientacao}
              {" "}A compra com crédito presumido não gera também o crédito normal de IBS/CBS ({credPresSel.baseLegal}).
            </p>
            {form.direcao === "Saida" && (
              <p className="text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-2.5" role="status">
                O crédito presumido vale só em compra (Entrada). Esta operação está como Saída, então o crédito não será calculado.
              </p>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-2.5">{RESSALVA_CRED_PRES}</p>
      </section>

      <section>
        <h3 className="text-sm font-heading font-medium mb-3 flex items-center gap-1.5">
          Regimes específicos da Reforma <InfoTooltip pagina="operacao_form" chave="header_regimes_especificos" />
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Venda a órgão público?" pagina="operacao_form" chave="compra_governamental_informado">
            <Select value={form.compra_governamental_informado || "Não"} onValueChange={(v) => set("compra_governamental_informado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SIM_NAO.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Combustível (regime específico)" pagina="operacao_form" chave="combustivel_produto">
            <Select value={form.combustivel_produto || "nenhum"} onValueChange={(v) => set("combustivel_produto", v === "nenhum" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Não é combustível</SelectItem>
                {PRODUTOS_COMBUSTIVEL.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Imposto Seletivo %" pagina="operacao_form" chave="is_pct">
            <PctInput value={form.is_pct} onChange={(v) => set("is_pct", v)} />
          </Field>
        </div>
        <div className="mt-3 space-y-2 text-xs">
          {produtoComb && (
            <p className="text-muted-foreground bg-muted/40 border border-border rounded-md p-2.5">
              {produtoComb.nome}: o tributo é a <b className="text-foreground">quantidade em {produtoComb.unidade === "kg" ? "quilogramas" : "litros (volume a 20 °C)"}</b> × a alíquota por {produtoComb.unidade === "kg" ? "quilo" : "litro"} cadastrada em Catálogos &gt; Combustíveis. Informe a Quantidade acima nessa unidade. Para revenda, deixe o crédito elegível em 0% (LC 214, art. 180). Venda de distribuidor ou posto, com o tributo já cobrado antes, usa o cClassTrib 620006 (sem débito); sem ele o motor cobra de novo. As classes de mistura de etanol (620004 e 620005, art. 179) não são calculadas.
            </p>
          )}
          {enquadramentoIs && (
            <p className="text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-md p-2.5">
              Este NCM está no Anexo XVII da LC 214 ({enquadramentoIs.nome}): sujeito ao Imposto Seletivo, cuja alíquota depende de lei ordinária ainda não publicada.
              {enquadramentoIs.confirmar && <> {enquadramentoIs.confirmar}</>} Só informe a alíquota se a empresa for contribuinte do IS (fabricante, importador ou extrativista); na revenda o IS já vem dentro do preço.
              {enquadramentoIs.teto != null && (
                <> <button type="button" className="underline font-medium" onClick={() => set("is_pct", TETO_IS_BENS_MINERAIS)}>Usar o teto legal de 0,25%</button></>
              )}
            </p>
          )}
          {enquadramentoIs?.teto != null && Number(form.is_pct) > enquadramentoIs.teto + 1e-12 && (
            <p className="text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-2.5" role="alert">
              A alíquota informada passa do máximo legal de 0,25% para bens minerais extraídos (LC 214, art. 422, §2º).
            </p>
          )}
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