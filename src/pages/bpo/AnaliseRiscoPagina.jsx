import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import ListaDePrevistas from "@/components/ListaDePrevistas";
import PainelDeRisco from "@/components/monitoramento/PainelDeRisco";
import { useAuth } from "@/lib/AuthContext";
import { brl, multaDeDeclaracao, multaDePagamento, multaEcfReal, multaPorReceita, REGRAS } from "@/lib/multas";
import { hojeBR } from "@/lib/tarefas";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const DECLARACOES = ["dctfweb", "reinf", "pgdas", "defis", "dasn"];

function Campo({ rotulo, children }) {
  return <label className="block space-y-1"><span className="block text-xs text-muted-foreground">{rotulo}</span>{children}</label>;
}

/** Calculadora de multas por atraso: pagamento de tributo e entrega de declarações, com a fonte de cada regra. */
export function CalculadoraDeMultas() {
  const hoje = hojeBR();
  const [tipo, setTipo] = useState("pagamento");
  const [f, setF] = useState({ valor: "", data1: "", data2: hoje, selic: "", reducao: "nenhuma", porte: "DEMAIS", semMovimento: false, lucro: "", receitaAnterior: "" });
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const pronto = f.data1 && f.data2 && f.data2 >= f.data1;
  const r = useMemo(() => {
    if (!pronto) return null;
    if (tipo === "pagamento") return multaDePagamento({ valor: Number(f.valor || 0), vencimento: f.data1, pagamento: f.data2, selicAcumuladaPct: f.selic });
    if (DECLARACOES.includes(tipo)) return multaDeDeclaracao({ tipo, tributos: Number(f.valor || 0), prazo: f.data1, entrega: f.data2, reducao: f.reducao, porte: f.porte, semMovimento: f.semMovimento });
    if (tipo === "receita") return multaPorReceita({ receita: Number(f.valor || 0), prazo: f.data1, entrega: f.data2, reducao: f.reducao });
    return multaEcfReal({ lucro: Number(f.lucro || 0), receitaAnoAnterior: Number(f.receitaAnterior || 0), prazo: f.data1, entrega: f.data2, reducao: f.reducao });
  }, [tipo, f, pronto]);
  const regra = REGRAS[tipo];
  const rotuloValor = tipo === "pagamento" ? "Valor do tributo (R$)" : tipo === "receita" ? "Receita bruta do período da escrituração (R$)" : "Tributos informados na declaração (R$)";
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <form className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm" onSubmit={(e) => e.preventDefault()} aria-label="Dados do atraso">
        <Campo rotulo="O que atrasou"><select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>{Object.entries(REGRAS).map(([k, v]) => <option key={k} value={k}>{v.titulo}</option>)}</select></Campo>
        {tipo !== "ecfReal" && <Campo rotulo={rotuloValor}><input type="number" min={0} step="0.01" className={campo} value={f.valor} onChange={(e) => mudar("valor", e.target.value)} /></Campo>}
        {tipo === "ecfReal" && <>
          <Campo rotulo="Lucro líquido antes do IRPJ e da CSLL (R$)"><input type="number" min={0} className={campo} value={f.lucro} onChange={(e) => mudar("lucro", e.target.value)} /></Campo>
          <Campo rotulo="Receita bruta do ano anterior (R$)"><input type="number" min={0} className={campo} value={f.receitaAnterior} onChange={(e) => mudar("receitaAnterior", e.target.value)} /></Campo>
        </>}
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo={tipo === "pagamento" ? "Vencimento" : "Prazo de entrega"}><input type="date" className={campo} value={f.data1} onChange={(e) => mudar("data1", e.target.value)} /></Campo>
          <Campo rotulo={tipo === "pagamento" ? "Data do pagamento" : "Data da entrega"}><input type="date" className={campo} value={f.data2} onChange={(e) => mudar("data2", e.target.value)} /></Campo>
        </div>
        {tipo === "pagamento" && <Campo rotulo="Selic acumulada no período (%) — opcional"><input type="number" min={0} step="0.01" className={campo} value={f.selic} onChange={(e) => mudar("selic", e.target.value)} placeholder="da tabela da Receita Federal" /></Campo>}
        {tipo !== "pagamento" && (
          <Campo rotulo="Quando foi (ou vai ser) entregue">
            <select className={campo} value={f.reducao} onChange={(e) => mudar("reducao", e.target.value)}>
              <option value="nenhuma">Depois do lançamento de ofício (sem redução)</option>
              <option value="espontanea">Antes de qualquer procedimento de ofício (metade)</option>
              <option value="intimacao">No prazo da intimação (75%)</option>
            </select>
          </Campo>
        )}
        {(tipo === "dctfweb" || tipo === "reinf") && <Campo rotulo="Porte"><select className={campo} value={f.porte} onChange={(e) => mudar("porte", e.target.value)}><option value="DEMAIS">Demais empresas</option><option value="ME_EPP">ME ou EPP do Simples</option><option value="MEI">MEI</option></select></Campo>}
        {tipo === "dctfweb" && <label className="flex items-center gap-2"><input type="checkbox" checked={f.semMovimento} onChange={(e) => mudar("semMovimento", e.target.checked)} /> Declaração sem movimento</label>}
        {f.data2 < f.data1 && <p role="alert" className="text-xs text-destructive">A data de pagamento ou entrega é antes do prazo.</p>}
      </form>
      <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Resultado">
        {!r ? <p className="text-sm text-muted-foreground">Preencha as datas para calcular.</p> : (
          <>
            <div className="flex flex-wrap gap-6">
              <div><p className="text-xs text-muted-foreground">Multa estimada</p><p className="text-2xl font-semibold tabular-nums">{brl(r.multa)}</p></div>
              {"juros" in r && <div><p className="text-xs text-muted-foreground">Juros</p><p className="text-2xl font-semibold tabular-nums">{r.juros === null ? "—" : brl(r.juros)}</p></div>}
              {"total" in r && r.total !== null && <div><p className="text-xs text-muted-foreground">Total a pagar</p><p className="text-2xl font-semibold tabular-nums">{brl(r.total)}</p></div>}
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm">{r.passos.map((p) => <li key={p}>{p}</li>)}</ol>
          </>
        )}
        <p className="text-xs"><a href={regra.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{regra.fonte} <ExternalLink className="h-3 w-3" aria-hidden="true" /></a></p>
        <p className="text-xs text-muted-foreground">Estimativa: o valor oficial é o da notificação da Receita.</p>
      </section>
    </div>
  );
}

/** BPO Fiscal > Análise de risco: o painel da carteira (saúde fiscal, top 5, fila, radar de certidões, conferência) e a calculadora de multas. */
export default function AnaliseRiscoPagina({ abaInicial = "painel" }) {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "BPO Fiscal", to: "/area/bpo" }, { label: "Análise de risco" }]} title="Análise de risco" />
      <div className="px-6 lg:px-8 py-6">
        <Tabs defaultValue={abaInicial} className="space-y-4">
          <TabsList><TabsTrigger value="painel">Painel de risco</TabsTrigger><TabsTrigger value="multas">Calculadora de multas</TabsTrigger><TabsTrigger value="previsto">Previsto</TabsTrigger></TabsList>
          <TabsContent value="painel"><PainelDeRisco ehAdmin={user?.role === "admin"} /></TabsContent>
          <TabsContent value="multas"><CalculadoraDeMultas /></TabsContent>
          <TabsContent value="previsto"><ListaDePrevistas moduloId="analise-risco" titulo="O que ainda vem" /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
