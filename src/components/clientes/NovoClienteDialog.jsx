import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mascararDocumento } from "@/lib/clientes";
import ServicosConsultoria from "./ServicosConsultoria";
import { TIPOS } from "@/lib/servicos";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Produtor rural PF", "Imune/Isenta"];
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const VAZIO = { cnpj_cpf: "", razao_social: "", regime_atual: "", uf: "", municipio: "", email_contato: "", whatsapp_contato: "", inscricao_estadual: "", grupo: "", servicos: [], consultoria: [], responsavel: "", colaborador_id: "", publicos: null };

function Campo({ rotulo, children, dica }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs text-muted-foreground">{rotulo}</span>
      {children}
      {dica && <span className="block text-[11px] text-muted-foreground">{dica}</span>}
    </label>
  );
}

/**
 * Clientes > Novo cliente: o documento primeiro (o CNPJ busca nome, cidade, CNAE e porte na Receita), os serviços marcados
 * na hora e o grupo econômico só se houver. Ao salvar, abre a ficha do cliente.
 */
export default function NovoClienteDialog({ aberto, aoFechar, grupos = [], colaboradores = [], servicoInicial, bpoInicial = false }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [f, setF] = useState(VAZIO);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => { if (aberto) { setF({ ...VAZIO, consultoria: servicoInicial ? [servicoInicial] : [], servicos: bpoInicial ? ["BPO_FISCAL"] : [] }); setErro(""); } }, [aberto, servicoInicial, bpoInicial]);
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const digitos = f.cnpj_cpf.replace(/\D/g, "");
  const alternarServico = (tipo) => setF((x) => ({ ...x, servicos: x.servicos.includes(tipo) ? x.servicos.filter((s) => s !== tipo) : [...x.servicos, tipo] }));

  const buscar = async () => {
    if (digitos.length !== 14) { setErro("A busca na Receita é pelo CNPJ (14 dígitos). Para CPF, preencha o nome à mão."); return; }
    setBuscando(true); setErro("");
    try {
      const d = await api.get(`/cnpj/${digitos}`);
      const regime = d.opcao_pelo_mei ? "MEI" : d.opcao_pelo_simples ? "Simples Nacional" : "";
      setF((x) => ({ ...x, razao_social: d.razao_social || x.razao_social, uf: d.uf || x.uf, municipio: d.municipio || x.municipio, regime_atual: x.regime_atual || regime, publicos: d }));
    } catch (e) {
      setErro(e.message || "Não foi possível consultar o CNPJ agora. Preencha os dados à mão.");
    } finally { setBuscando(false); }
  };

  const salvar = useMutation({
    mutationFn: () => {
      const p = f.publicos;
      return api.post("/clientes", {
        cnpj_cpf: f.cnpj_cpf, razao_social: f.razao_social, regime_atual: f.regime_atual || null, uf: f.uf || null, municipio: f.municipio || null,
        email_contato: f.email_contato || null, whatsapp_contato: f.whatsapp_contato || null, inscricao_estadual: f.inscricao_estadual || null,
        produtor_rural: f.regime_atual === "Produtor rural PF" ? "Sim" : null,
        grupo: f.grupo || null, servicos: f.servicos, servicos_consultoria: digitos.length === 14 ? f.consultoria : [], responsavel: f.responsavel || null, colaborador_id: f.colaborador_id || null,
        cnae_principal: p?.cnae_codigo || null, cnae_descricao: p?.cnae_descricao || null, porte: p?.porte || null, natureza_juridica: p?.natureza_juridica || null, codigo_municipio_ibge: p?.codigo_municipio_ibge || null,
      });
    },
    onSuccess: (empresa) => {
      ["empresas", "grupos", "servicos-contratados", "carteira"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["consultoria", "vinculos"] });
      toast({ title: "Cliente cadastrado", description: empresa.razao_social });
      aoFechar();
      navigate(`/clientes/${empresa.id}`);
    },
    onError: (e) => setErro(e.message || "Não foi possível cadastrar."),
  });

  const enviar = (ev) => {
    ev.preventDefault();
    if (!f.razao_social.trim()) { setErro("Informe o nome ou a razão social."); return; }
    if (digitos && digitos.length !== 11 && digitos.length !== 14) { setErro("O CNPJ tem 14 dígitos e o CPF tem 11."); return; }
    salvar.mutate();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Comece pelo CNPJ.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-3 text-sm" noValidate>
          <Campo rotulo="CNPJ ou CPF">
            <div className="flex gap-2">
              <input className={campo} value={f.cnpj_cpf} onChange={(e) => mudar("cnpj_cpf", e.target.value)} onBlur={() => { mudar("cnpj_cpf", mascararDocumento(f.cnpj_cpf)); if (digitos.length === 14 && !f.publicos && !buscando) buscar(); }} inputMode="numeric" placeholder="00.000.000/0001-00" autoFocus />
              <button type="button" onClick={buscar} disabled={buscando} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-60">
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />} Buscar na Receita
              </button>
            </div>
          </Campo>
          {f.publicos && <p role="status" className="rounded-md bg-muted/60 px-3 py-2 text-xs">{f.publicos.situacao ? `Situação na Receita: ${f.publicos.situacao}. ` : ""}{f.publicos.cnae_descricao ? `CNAE: ${f.publicos.cnae_descricao}. ` : ""}{f.publicos.porte ? `Porte: ${f.publicos.porte}.` : ""}</p>}
          <Campo rotulo="Nome ou razão social"><input className={campo} value={f.razao_social} onChange={(e) => mudar("razao_social", e.target.value)} /></Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo rotulo="Regime"><select className={campo} value={f.regime_atual} onChange={(e) => mudar("regime_atual", e.target.value)}><option value="">Não informado</option>{REGIMES.map((r) => <option key={r}>{r}</option>)}</select></Campo>
            <Campo rotulo="UF"><select className={campo} value={f.uf} onChange={(e) => mudar("uf", e.target.value)}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
            <Campo rotulo="Município"><input className={campo} value={f.municipio} onChange={(e) => mudar("municipio", e.target.value)} /></Campo>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="E-mail de contato"><input type="email" className={campo} value={f.email_contato} onChange={(e) => mudar("email_contato", e.target.value)} placeholder="fiscal@cliente.com.br" /></Campo>
            <Campo rotulo="WhatsApp de contato"><input className={campo} value={f.whatsapp_contato} onChange={(e) => mudar("whatsapp_contato", e.target.value)} placeholder="(65) 99999-0000" /></Campo>
          </div>
          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-xs text-muted-foreground">Serviços que o cliente contratou</legend>
            <div className="flex flex-wrap gap-4">
              {Object.entries(TIPOS).map(([tipo, rotulo]) => (
                <label key={tipo} className="inline-flex items-center gap-2"><input type="checkbox" checked={f.servicos.includes(tipo)} onChange={() => alternarServico(tipo)} /> {rotulo}</label>
              ))}
            </div>
          </fieldset>
          {digitos.length === 14 && <ServicosConsultoria publico="PJ" selecao={f.consultoria} mudar={(v) => mudar("consultoria", v)} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {user?.role === "admin" ? (
              <Campo rotulo="Colaborador responsável"><select className={campo} value={f.colaborador_id} onChange={(e) => { const c = colaboradores.find((x) => x.id === e.target.value); setF((x) => ({ ...x, colaborador_id: e.target.value, responsavel: c ? (c.name || c.email) : "" })); }}><option value="">Ninguém por enquanto</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}</select></Campo>
            ) : (
              <Campo rotulo="Responsável"><input className={campo} value={f.responsavel} onChange={(e) => mudar("responsavel", e.target.value)} /></Campo>
            )}
            <Campo rotulo="Grupo econômico (opcional)" dica="Só para quem faz parte de um grupo com outras empresas.">
              <select className={campo} value={f.grupo} onChange={(e) => mudar("grupo", e.target.value)}><option value="">Nenhum</option>{[...grupos].filter((g) => g.tipo !== "Cliente individual").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((g) => <option key={g.id} value={g.numero}>{g.nome}</option>)}</select>
            </Campo>
          </div>
          {erro && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{erro}</p>}
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Cadastrar cliente</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
