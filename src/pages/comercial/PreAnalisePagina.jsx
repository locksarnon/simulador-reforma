import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Search } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import { exportarLista } from "@/lib/exportarLista";

const digitos = (s) => String(s || "").replace(/\D/g, "");
const fmtCnpj = (d) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const fmtCnae = (c) => String(c || "").replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3");
const brl = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

/**
 * Leitura inicial para a conversa comercial, a partir da divisão do CNAE (dois primeiros dígitos). É uma sugestão do InTAX para
 * orientar a reunião, não um enquadramento: o regime e os benefícios só se confirmam com as notas da empresa.
 */
export function leituraDoCnae(cnae) {
  const d = Number(String(cnae || "").slice(0, 2));
  if (d >= 1 && d <= 3) return { setor: "Agropecuária, produção florestal ou pesca", temas: ["Produtor rural contribuinte ou não do IBS/CBS (receita até R$ 3,6 milhões)", "Crédito presumido para quem compra do produtor", "Insumos agropecuários com redução de alíquota"] };
  if (d >= 10 && d <= 12) return { setor: "Indústria de alimentos, bebidas ou fumo", temas: ["Cesta básica e alíquota zero/reduzida por NCM", "Crédito amplo nas compras", "Imposto Seletivo em bebidas e fumo"] };
  if (d >= 5 && d <= 9) return { setor: "Indústria extrativa", temas: ["Imposto Seletivo na extração", "Exportação desonerada com manutenção de créditos"] };
  if (d >= 13 && d <= 33) return { setor: "Indústria de transformação", temas: ["Crédito amplo nas compras", "Fim do IPI na maior parte dos produtos e saldos credores"] };
  if (d === 45 || d === 46) return { setor: "Comércio atacadista ou de veículos", temas: ["Fim do ICMS-ST e estoque na transição", "Crédito presumido do estoque", "Clientes empresas valorizam o crédito"] };
  if (d === 47) return { setor: "Comércio varejista", temas: ["Consumidor final não aproveita crédito: preço e margem", "Split payment no cartão e no Pix"] };
  if (d >= 49 && d <= 53) return { setor: "Transporte, armazenagem e correio", temas: ["Transportador autônomo e crédito presumido", "CT-e com IBS/CBS", "Combustível e manutenção passam a gerar crédito"] };
  if (d >= 62 && d <= 63) return { setor: "Tecnologia da informação", temas: ["Serviço com alíquota cheia e pouco crédito", "Tributação no destino"] };
  if (d >= 64 && d <= 66) return { setor: "Serviços financeiros e seguros", temas: ["Regime específico de serviços financeiros"] };
  if (d >= 69 && d <= 75) return { setor: "Serviços profissionais e técnicos", temas: ["Profissões regulamentadas com redução de alíquota", "Simples Nacional × regime regular para clientes empresa"] };
  return { setor: "Outras atividades", temas: ["Mapear a cadeia de fornecedores e o crédito de cada um", "Simular a carga na transição"] };
}

/** Linhas chave/valor para a exportação da pré-análise. */
export function linhasDaPreAnalise(d) {
  const l = [
    ["CNPJ", fmtCnpj(d.cnpj)], ["Razão social", d.razao_social], ["Nome fantasia", d.nome_fantasia], ["Situação cadastral", d.situacao],
    ["Município/UF", `${d.municipio}/${d.uf}`], ["Natureza jurídica", d.natureza_juridica], ["Porte", d.porte], ["Início de atividade", d.data_inicio_atividade],
    ["Capital social", brl(d.capital_social)], ["Optante do Simples", d.opcao_pelo_simples === null ? "não informado" : d.opcao_pelo_simples ? "sim" : "não"],
    ["MEI", d.opcao_pelo_mei === null ? "não informado" : d.opcao_pelo_mei ? "sim" : "não"], ["CNAE principal", `${fmtCnae(d.cnae_codigo)} ${d.cnae_descricao}`],
    ...d.cnaes_secundarios.slice(0, 20).map((c, i) => [i === 0 ? "CNAEs secundários" : "", `${fmtCnae(c.codigo)} ${c.descricao}`]),
    ...d.socios.map((s, i) => [i === 0 ? "Sócios" : "", `${s.nome} (${s.qualificacao})`]),
  ];
  return l.map(([campo, valor]) => ({ campo, valor: valor ?? "" }));
}

/** Comercial > Pré-análise por CNPJ: a ficha pública de um prospect e os temas da Reforma para a primeira conversa. */
export default function PreAnalisePagina() {
  const [texto, setTexto] = useState("");
  const [cnpj, setCnpj] = useState("");
  const { data: d, isFetching, error } = useQuery({ queryKey: ["pre-analise", cnpj], queryFn: () => api.get(`/cnpj/${cnpj}`), enabled: cnpj.length === 14, retry: false, staleTime: 30 * 60_000 });
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const jaCliente = useMemo(() => (emp.data || []).find((e) => digitos(e.cnpj_cpf) === cnpj), [emp.data, cnpj]);
  const leitura = d ? leituraDoCnae(d.cnae_codigo) : null;
  const buscar = (e) => { e.preventDefault(); const dg = digitos(texto); if (dg.length === 14) setCnpj(dg); };
  const exportar = (formato) => exportarLista({ titulo: `Pré-análise ${d.razao_social}`, colunas: [{ chave: "campo", rotulo: "Campo" }, { chave: "valor", rotulo: "Informação" }], linhas: [...linhasDaPreAnalise(d), { campo: "Leitura para a Reforma", valor: `${leitura.setor}: ${leitura.temas.join("; ")}` }, { campo: "Fonte", valor: "Dados públicos do CNPJ (Receita Federal, pela BrasilAPI), consultados pelo InTAX." }], formato });

  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Comercial", to: "/area/comercial" }, { label: "Pré-análise por CNPJ" }]} title="Pré-análise por CNPJ" subtitle="A ficha pública de um prospect (CNAE, porte, Simples, sócios) e os temas da Reforma para a primeira conversa. Só dados públicos." />
      <div className="px-6 lg:px-8 py-6 max-w-4xl space-y-4">
        <form onSubmit={buscar} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1 flex-1 min-w-[220px]"><span className="block text-xs text-muted-foreground">CNPJ do prospect</span><input className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" /></label>
          <button type="submit" disabled={digitos(texto).length !== 14} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />} Consultar</button>
        </form>
        {error && <p role="alert" className="rounded-md border border-red-400/60 p-3 text-sm">{error.message}</p>}
        {d && (
          <>
            {jaCliente && <p role="status" className="rounded-md border border-emerald-400/60 bg-card p-3 text-sm">Esta empresa já está no cadastro: <strong>{jaCliente.razao_social}</strong>.</p>}
            <section className="rounded-xl border border-border bg-card p-4" aria-label="Ficha do CNPJ">
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[220px]"><h2 className="font-heading text-base font-semibold">{d.razao_social}</h2><p className="text-xs text-muted-foreground">{fmtCnpj(d.cnpj)} · {d.situacao} · {d.municipio}/{d.uf}</p></div>
                <div className="flex gap-2">{[["xlsx", "Excel"], ["pdf", "PDF"]].map(([f, r]) => <button key={f} type="button" onClick={() => exportar(f)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"><Download className="h-3.5 w-3.5" aria-hidden="true" /> {r}</button>)}</div>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {linhasDaPreAnalise(d).filter((l) => l.campo && !["CNPJ", "Razão social"].includes(l.campo)).map((l) => <div key={l.campo} className="flex gap-2"><dt className="w-40 shrink-0 text-xs text-muted-foreground">{l.campo}</dt><dd>{l.valor || "—"}</dd></div>)}
              </dl>
              {d.cnaes_secundarios.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer text-xs text-primary">{d.cnaes_secundarios.length} CNAE(s) secundário(s)</summary><ul className="mt-1 text-xs">{d.cnaes_secundarios.map((c) => <li key={c.codigo}>{fmtCnae(c.codigo)} {c.descricao}</li>)}</ul></details>}
              {d.socios.length > 0 && <details className="mt-1 text-sm"><summary className="cursor-pointer text-xs text-primary">{d.socios.length} sócio(s)</summary><ul className="mt-1 text-xs">{d.socios.map((s) => <li key={s.nome}>{s.nome} · {s.qualificacao}</li>)}</ul></details>}
            </section>
            <section className="rounded-xl border border-border bg-card p-4 space-y-2" aria-label="Leitura para a Reforma">
              <h2 className="font-heading text-sm font-semibold">Para a primeira conversa: {leitura.setor}</h2>
              <ul className="list-disc pl-5 text-sm">{leitura.temas.map((t) => <li key={t}>{t}</li>)}</ul>
              <p className="text-xs text-muted-foreground">Sugestão do InTAX a partir do CNAE, para orientar a reunião. O enquadramento e os benefícios só se confirmam com as notas e o cadastro de produtos da empresa.</p>
              <div className="flex flex-wrap gap-3 text-sm"><Link to="/reforma/regimes" className="text-primary hover:underline">Comparar os regimes</Link><Link to="/comercial/propostas" className="text-primary hover:underline">Fazer uma proposta</Link></div>
            </section>
          </>
        )}
        {!d && !error && !isFetching && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Digite o CNPJ e consulte. A ficha vem dos dados públicos da Receita Federal.</p>}
      </div>
    </div>
  );
}
