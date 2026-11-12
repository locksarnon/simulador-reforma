import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { api } from "@/api/client";
import TabelaPadrao from "@/components/TabelaPadrao";
import { BotoesDocumento } from "@/components/monitoramento/CartaoServico";
import { quandoConsultou } from "@/lib/monitoramento";

export const useLeituraSitfis = (empresaId) => useQuery({ queryKey: ["monitoramento", "sitfis-leitura", empresaId], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/situacao-fiscal`), enabled: !!empresaId });

const TIPO = { PENDENCIA: "Pendência", OMISSAO: "Omissão", SUSPENSO: "Exigibilidade suspensa", OUTRO: "Informação" };
const TOM = { PENDENCIA: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", OMISSAO: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", SUSPENSO: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300", OUTRO: "bg-muted text-muted-foreground" };

/** O PDF oficial do relatório (Receita e PGFN), para ver ou baixar. */
export function PdfDoRelatorio({ dados }) {
  if (!dados?.arquivo) return null;
  return <BotoesDocumento url={`/monitoramento/consultas/${dados.consulta_id}/arquivos/${dados.arquivo.indice}`} nome={dados.arquivo.nome} rotulo="relatório de situação fiscal" />;
}

/** Uma linha por item do relatório (a primeira linha de cada seção é o cabeçalho das colunas do próprio relatório). */
export function linhasDaLeitura(leitura, filtro = () => true) {
  const out = [];
  for (const s of (leitura?.secoes || []).filter(filtro)) {
    const [cabecalho, ...itens] = s.linhas.length > 1 ? s.linhas : ["", ...s.linhas];
    (itens.length ? itens : ["(sem linhas)"]).forEach((item, i) => out.push({ id: `${s.titulo}-${i}`, orgao: s.orgao === "PGFN" ? "PGFN" : "Receita Federal", secao: s.titulo, tipo: s.tipo, item, cabecalho }));
  }
  return out;
}

const SITUACAO = {
  REGULAR: { rotulo: "Regular", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  SUSPENSO: { rotulo: "Só itens suspensos", tom: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  PENDENTE: { rotulo: "Com pendências", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
};

/** Uma linha por órgão (Receita Federal e PGFN): situação, quantas pendências, omissões e itens suspensos. */
export function resumoPorOrgao(leitura) {
  return [["RFB", "Receita Federal"], ["PGFN", "PGFN"]].map(([id, orgao]) => {
    const s = (leitura?.secoes || []).filter((x) => x.orgao === id);
    const n = (t) => s.filter((x) => x.tipo === t).length;
    const situacao = n("PENDENCIA") + n("OMISSAO") ? "PENDENTE" : n("SUSPENSO") ? "SUSPENSO" : "REGULAR";
    return { id, orgao, situacao, pendencias: n("PENDENCIA"), omissoes: n("OMISSAO"), suspensos: n("SUSPENSO"), secoes: s.filter((x) => x.tipo !== "OUTRO").map((x) => x.titulo).join("; ") };
  });
}

/** Situação fiscal resumida: a situação de cada órgão e o PDF oficial do relatório (ver e baixar). */
export function ResumoSitfis({ empresaId }) {
  const { data, isLoading } = useLeituraSitfis(empresaId);
  if (isLoading) return <p className="text-xs text-muted-foreground">Lendo o relatório de situação fiscal…</p>;
  if (!data) return <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Ainda não há relatório de situação fiscal deste cliente: consulte na subaba "Relatório de situação fiscal" ou use Atualizar tudo.</p>;
  const linhas = resumoPorOrgao(data.leitura);
  const colunas = [
    { chave: "orgao", rotulo: "Órgão", quebrar: false },
    { chave: "situacao", rotulo: "Situação", valor: (l) => SITUACAO[l.situacao].rotulo, render: (l) => <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${SITUACAO[l.situacao].tom}`}>{SITUACAO[l.situacao].rotulo}</span>, quebrar: false },
    { chave: "secoes", rotulo: "O que aparece", valor: (l) => l.secoes || "Nada pendente" },
    { chave: "consultado", rotulo: "Relatório de", valor: () => quandoConsultou(data.consultado_em) + (data.simulado ? " (demonstração)" : ""), quebrar: false },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Situação fiscal">
      {data.leitura?.certidao && <p className="text-sm">Certidão no relatório: <strong>{data.leitura.certidao.tipo}</strong>{data.leitura.certidao.validade ? `, válida até ${data.leitura.certidao.validade}` : ""}.</p>}
      {!data.leitura && <p className="text-xs text-muted-foreground">O relatório guardado não pôde ser lido automaticamente. Abra o PDF oficial.</p>}
      <TabelaPadrao id="monit:sitfis-resumo" colunas={colunas} linhas={linhas} ariaLabel="Situação fiscal por órgão" tamanhoInicial={10} documentos={() => <PdfDoRelatorio dados={data} />} />
    </section>
  );
}

/**
 * Itens lidos do Relatório de Situação Fiscal (Receita Federal e PGFN), em tabela, sem nada digitado à mão.
 * `filtro` escolhe as seções (ex.: só parcelamentos, só omissões); `vazio` é o texto quando o relatório não traz nada daquilo.
 */
export default function LeituraSitfis({ empresaId, titulo, filtro = () => true, vazio, descricao }) {
  const { data, isLoading } = useLeituraSitfis(empresaId);
  const linhas = useMemo(() => linhasDaLeitura(data?.leitura, filtro), [data, filtro]);
  if (isLoading) return <p className="text-xs text-muted-foreground">Lendo o relatório de situação fiscal…</p>;
  const colunas = [
    { chave: "orgao", rotulo: "Órgão", quebrar: false },
    { chave: "tipo", rotulo: "Tipo", valor: (l) => TIPO[l.tipo] ?? l.tipo, render: (l) => <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] ${TOM[l.tipo] ?? TOM.OUTRO}`}>{TIPO[l.tipo] ?? l.tipo}</span> },
    { chave: "secao", rotulo: "Seção do relatório" },
    { chave: "item", rotulo: "Item (como no relatório)", render: (l) => <span title={l.cabecalho ? `Colunas: ${l.cabecalho}` : undefined} className="font-mono text-xs tabular-nums">{l.item}</span> },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={titulo}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" aria-hidden="true" />{titulo}</h3>
          <p className="text-xs text-muted-foreground">
            {descricao}{" "}
            {data ? `Fonte: relatório de situação fiscal da Receita e da PGFN (Integra Contador), consultado em ${quandoConsultou(data.consultado_em)}${data.simulado ? " (demonstração)" : ""}.` : "Ainda não há relatório de situação fiscal deste cliente: consulte na aba Situação fiscal (ou use Atualizar tudo)."}
          </p>
          {data?.leitura?.certidao && <p className="mt-1 text-xs">Certidão no relatório: <strong>{data.leitura.certidao.tipo}</strong>{data.leitura.certidao.validade ? `, válida até ${data.leitura.certidao.validade}` : ""}.</p>}
        </div>
      </div>
      {data && !data.leitura && <p className="text-xs text-muted-foreground">O relatório guardado não pôde ser lido automaticamente. Abra o PDF oficial.</p>}
      {data?.leitura && linhas.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"><span className="flex-1">{vazio}</span><PdfDoRelatorio dados={data} /></div>
      ) : data?.leitura ? (
        <TabelaPadrao id="monit:sitfis" colunas={colunas} linhas={linhas} ariaLabel={titulo} documentos={() => <PdfDoRelatorio dados={data} />} />
      ) : null}
    </section>
  );
}
