import { useQuery } from "@tanstack/react-query";
import { chaves, san } from "./api";
import { Carregar, MarcaRevisar } from "./comuns";
import { LISTA_SITUACOES, ROTULO_CAMADA, rotuloSituacao, situacaoAgregada, SITUACOES, totalDeCelulas } from "./logica";
import BuscaNaTabela from "@/components/BuscaNaTabela";

/** Resumo de uma célula da matriz: "12 pend · 3 prop · 5 aprov". */
export function resumoDeContagem(c) {
  const curto = { PENDENTE: "pend.", SEM_PROBLEMA: "s/ prob.", PROPOSTO: "prop.", APROVADO: "aprov.", AGUARDANDO_INFORMACAO: "aguard." };
  return ["PENDENTE", "AGUARDANDO_INFORMACAO", "PROPOSTO", "APROVADO", "SEM_PROBLEMA"].filter((s) => c[s] > 0).map((s) => `${c[s].toLocaleString("pt-BR")} ${curto[s]}`).join(" · ");
}

/** Só o que exige ação ganha cor (pendente e aguardando informação); proposto, aprovado e sem problema ficam neutros. */
export const COR_DE_ACAO = {
  PENDENTE: "border-orange-600/60 bg-orange-500/10 text-orange-900 dark:text-orange-200",
  AGUARDANDO_INFORMACAO: "border-sky-600/60 border-dashed bg-sky-500/10 text-sky-900 dark:text-sky-200",
};

/** Grupos do maior para o menor (itens), com a linha de totais por camada. Função pura. */
export function matrizOrdenada(dados) {
  const grupos = [...(dados?.grupos || [])].sort((a, b) => (b.itens || 0) - (a.itens || 0) || String(a.grupo).localeCompare(String(b.grupo), "pt-BR"));
  const total = { itens: grupos.reduce((s, g) => s + (g.itens || 0), 0), camadas: {} };
  for (const camada of dados?.camadas || []) {
    const soma = Object.fromEntries([...LISTA_SITUACOES, "revisar"].map((k) => [k, 0]));
    for (const g of grupos) for (const k of Object.keys(soma)) soma[k] += Number(g.camadas?.[camada]?.[k]) || 0;
    total.camadas[camada] = soma;
  }
  return { grupos, total };
}

function Celula({ contagem, rotuloLinha, camada, aoAbrir }) {
  const c = contagem || {};
  const agregada = situacaoAgregada(c);
  if (!agregada) return <span className="text-xs text-muted-foreground" aria-label="Sem dados">—</span>;
  const cor = COR_DE_ACAO[agregada];
  return (
    <button type="button" onClick={aoAbrir} className="block w-full border border-transparent p-1 text-left hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${rotuloLinha}, ${ROTULO_CAMADA[camada]}: ${rotuloSituacao(agregada)}, ${totalDeCelulas(c)} produto(s)${c.revisar ? `, ${c.revisar} para revisar` : ""}. Abrir os casos.`}>
      <span className={cor ? `inline-flex border px-1.5 py-0.5 text-xs font-medium ${cor}` : "text-xs text-foreground/80"}>{SITUACOES[agregada]?.curto}</span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">{resumoDeContagem(c)}</span>
      {c.revisar > 0 && <span className="mt-0.5 inline-flex items-center"><MarcaRevisar /><span className="ml-1 text-[11px]">{c.revisar.toLocaleString("pt-BR")}</span></span>}
    </button>
  );
}

/** Matriz grupo × camada com a situação agregada e as contagens. Clicar numa célula abre os casos do recorte. */
export default function VisaoGeral({ projeto, aoAbrirCasos, aoAbrirTabela }) {
  const q = useQuery({ queryKey: chaves.visao(projeto.id), queryFn: () => san.visaoGeral(projeto.id) });
  return (
    <Carregar consulta={q} textoErro="Não foi possível carregar a visão geral." tituloVazio="Nada para mostrar ainda" vazio={(d) => (d.grupos.length ? null : "Importe o cadastro de itens para ver a situação de cada grupo de produtos.")}>
      {(d) => {
        const { grupos, total } = matrizOrdenada(d);
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Grupos do maior para o menor. Em cor, só o que pede ação: pendente e aguardando informação. Clique numa célula para abrir os casos; no nome do grupo, para ver os produtos.</p>
            <BuscaNaTabela />
            <div className="max-h-[70vh] overflow-auto border border-border bg-card">
              <table className="w-full text-sm" aria-label="Situação por grupo e camada">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-muted text-left text-xs text-muted-foreground">
                    <th scope="col" className="sticky left-0 z-30 w-56 min-w-[14rem] bg-cabecalho px-2 py-2 text-cabecalho-foreground">Grupo de produtos</th>
                    <th scope="col" className="bg-cabecalho px-2 text-right text-cabecalho-foreground">Itens</th>
                    {d.camadas.map((c) => <th key={c} scope="col" className="min-w-[130px] bg-cabecalho px-2 text-cabecalho-foreground">{ROTULO_CAMADA[c]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b-2 border-border align-top font-medium">
                    <th scope="row" className="sticky left-0 z-10 bg-muted px-2 py-2 text-left">Total ({grupos.length.toLocaleString("pt-BR")} {grupos.length === 1 ? "grupo" : "grupos"})</th>
                    <td className="bg-muted/40 px-2 py-2 text-right tabular-nums">{total.itens.toLocaleString("pt-BR")}</td>
                    {d.camadas.map((camada) => <td key={camada} className="bg-muted/40 px-2 py-1.5"><Celula contagem={total.camadas[camada]} rotuloLinha="Todos os grupos" camada={camada} aoAbrir={() => aoAbrirCasos({ camada })} /></td>)}
                  </tr>
                  {grupos.map((g) => (
                    <tr key={g.grupo} className="border-t border-border/60 align-top">
                      <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium">
                        <button type="button" className="text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Ver os produtos deste grupo na tabela" onClick={() => aoAbrirTabela({ grupo: g.grupo })}>{g.grupo}</button>
                      </th>
                      <td className="px-2 py-2 text-right tabular-nums">{g.itens.toLocaleString("pt-BR")}</td>
                      {d.camadas.map((camada) => <td key={camada} className="px-2 py-1.5"><Celula contagem={g.camadas[camada]} rotuloLinha={g.grupo} camada={camada} aoAbrir={() => aoAbrirCasos({ camada, grupo: g.grupo })} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }}
    </Carregar>
  );
}
