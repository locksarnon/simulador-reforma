import { useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";

const reforma = "Reforma Tributária";
const creditos = "Créditos e Oportunidades Tributárias";
const planejamento = "Planejamento Tributário";
const catalogo = {
  PF: [
    [reforma, [
      ["Enquadramento e opção de IBS/CBS do produtor rural"],
      ["Homologação fiscal do ERP para IBS/CBS do produtor rural"],
    ]],
    [creditos, [["Revisão do livro-caixa rural (LCDPR)"]]],
  ],
  PJ: [
    [reforma, [
      ["Simulador da Reforma Tributária", [
        ["Painel Executivo", "/cockpit"],
        ["Comparação de regimes na transição", "/reforma/regimes"],
        ["Cenários e alíquotas", "/cenarios"],
        ["Transição 2026–2033", "/transicao"],
      ]],
      ["Homologação fiscal do ERP para IBS/CBS"],
    ]],
    [creditos, [
      ["Créditos de PIS e Cofins"],
      ["Crédito presumido de estoque", [["Abrir calculadora de estoque", "/ferramentas/credito-estoque"]], true],
      ["Conciliação de tributos pagos"],
      ["Revisão de saldos de IRPJ e CSLL"],
    ]],
    [planejamento, [["Comparação de regimes para o exercício"], ["Análise de virada de exercício"]]],
    ["Outros Serviços Tributários", [["Conciliação de escriturações e declarações"]]],
  ],
};

export default function ConsultoriaPagina() {
  const [publico, setPublico] = useState("");
  return <div>
    <PageHeader crumbs={[{ label: "Consultoria Tributária", to: "/area/diagnostico" }, { label: "Serviços Tributários" }]} title="Serviços Tributários" />
    <div className="space-y-6 px-6 py-5 lg:px-8">
      <div role="group" aria-label="Tipo de cliente" className="flex flex-wrap gap-3">
        {Object.entries({ PF: "Pessoa Física", PJ: "Pessoa Jurídica" }).map(([id, nome]) => (
          <button type="button" key={id} aria-pressed={publico === id} onClick={() => setPublico(id)}
            className={`rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring ${publico === id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
            {nome}
          </button>
        ))}
      </div>
      {!publico && <p className="text-sm text-muted-foreground">Escolha Pessoa Física ou Pessoa Jurídica para ver os serviços.</p>}
      {(catalogo[publico] || []).map(([area, servicos]) => (
        <section key={area} className="space-y-3">
          <h2 className="font-semibold">{area}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {servicos.map(([nome, acessos, roteiroPendente]) => (
              <article key={nome} className="space-y-2 rounded-lg border bg-card p-4">
                <h3 className="font-medium">{nome}</h3>
                {(!acessos || roteiroPendente) && <span className="inline-block rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {roteiroPendente ? "Roteiro completo em desenvolvimento" : "Em desenvolvimento"}
                </span>}
                {acessos && <ul className="space-y-1 text-sm">{acessos.map(([rotulo, to]) => (
                  <li key={to}><Link to={to} className="text-primary hover:underline">{rotulo}</Link></li>
                ))}</ul>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  </div>;
}
