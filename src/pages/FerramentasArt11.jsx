import React from "react";
import { BookOpenText, ExternalLink } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";

const REGRAS = [
  { inciso: "I", titulo: "Bem móvel material", regra: "Local de entrega ou disponibilização do bem ao destinatário." },
  { inciso: "II", titulo: "Bem imóvel e serviços sobre imóvel", regra: "Onde o imóvel está situado." },
  { inciso: "III", titulo: "Serviços prestados sobre pessoas", regra: "Local da prestação do serviço (ex.: serviços de beleza, saúde)." },
  { inciso: "IV–IX", titulo: "Casos específicos", regra: "Feiras/eventos, serviços sobre bens móveis, transporte de passageiros, transporte de carga, exploração de rodovia/utilidade e telefonia fixa — cada um com sua própria regra de local." },
  { inciso: "X", titulo: "Demais serviços e bens móveis intangíveis (regra residual)", regra: "Se a operação é onerosa: domicílio do adquirente. Se não onerosa: domicílio do destinatário." },
];

export default function FerramentasArt11() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Guia do Art. 11" }]} />
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <BookOpenText className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-heading font-semibold">Guia do Art. 11 — Local da Operação</h1>
            <InfoTooltip pagina="ferramentas" chave="art11_header" />
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Resumo comentado do Art. 11 da LC 214/2025 — as regras de territorialidade que definem onde uma
            operação é considerada realizada para fins de IBS/CBS, e como isso se conecta ao cIndOp.
          </p>
        </div>

        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50 p-4 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          <strong>Isto é um resumo explicativo, não o texto literal da lei.</strong> Não temos aqui a transcrição
          exata dos incisos e parágrafos — o Art. 11 tem 10 incisos e mais de 9 parágrafos com detalhes que este
          resumo simplifica. Para qualquer decisão que dependa da redação exata, consulte o texto oficial.
        </div>

        <section className="space-y-3">
          <h2 className="font-heading font-medium text-base">Por que "local da operação" importa</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            O IBS é um imposto de competência compartilhada entre estados e municípios, cobrado no <strong>destino</strong>
            — ou seja, o valor arrecadado pertence ao estado/município onde a operação é considerada realizada, não
            onde o vendedor está sediado. O Art. 11 é a regra que decide, caso a caso, qual é esse local — e por
            tabela, decide quem recebe a arrecadação e qual alíquota municipal/estadual se aplica quando ela varia
            por jurisdição.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading font-medium text-base">As regras, por tipo de operação</h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2.5 px-4 font-medium w-20">Inciso</th>
                    <th className="py-2.5 px-4 font-medium">Situação</th>
                    <th className="py-2.5 px-4 font-medium">Onde fica o local da operação</th>
                  </tr>
                </thead>
                <tbody>
                  {REGRAS.map((r) => (
                    <tr key={r.inciso} className="border-t border-border/50">
                      <td className="py-2.5 px-4 font-mono text-xs">{r.inciso}</td>
                      <td className="py-2.5 px-4 font-medium">{r.titulo}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{r.regra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading font-medium text-base">A ligação com o cIndOp</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            O <strong>cIndOp</strong> (Código Indicador da Operação) é o campo da NFS-e/DPS que declara, entre
            outras coisas, se a operação é <strong>onerosa</strong> (com pagamento) ou <strong>não onerosa</strong>{" "}
            (brinde, bonificação, doação). Essa distinção é justamente o critério que o inciso X do Art. 11 usa
            para decidir entre domicílio do adquirente e domicílio do destinatário — por isso as duas ferramentas
            (guia de territorialidade e identificador de cIndOp) andam juntas: o cIndOp é, na prática, como o
            sistema informa ao Fisco qual regra do Art. 11 se aplica àquela nota. Veja o{" "}
            <a href="/ferramentas/classificacao" className="text-primary underline underline-offset-2">
              Classificador &amp; Conversor
            </a>{" "}
            para consultar o cIndOp de um serviço específico.
          </p>
        </section>

        <a
          href="https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp214.htm"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Texto oficial da LC 214/2025 no Planalto
        </a>
      </div>
    </div>
  );
}
