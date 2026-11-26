import { useQuery } from "@tanstack/react-query";
import { chaves, san } from "./api";
import { Carregar, MarcaRevisar, SeloSituacao } from "./comuns";
import { ROTULO_CAMADA, rotuloSituacao, situacaoAgregada, totalDeCelulas } from "./logica";

/** Resumo de uma célula da matriz: "12 pend · 3 prop · 5 aprov". */
export function resumoDeContagem(c) {
  const curto = { PENDENTE: "pend.", SEM_PROBLEMA: "s/ prob.", PROPOSTO: "prop.", APROVADO: "aprov.", AGUARDANDO_INFORMACAO: "aguard." };
  return ["PENDENTE", "AGUARDANDO_INFORMACAO", "PROPOSTO", "APROVADO", "SEM_PROBLEMA"].filter((s) => c[s] > 0).map((s) => `${c[s].toLocaleString("pt-BR")} ${curto[s]}`).join(" · ");
}

/** Matriz grupo × camada com a situação agregada e as contagens. Clicar numa célula abre os casos do recorte. */
export default function VisaoGeral({ projeto, aoAbrirCasos, aoAbrirTabela }) {
  const q = useQuery({ queryKey: chaves.visao(projeto.id), queryFn: () => san.visaoGeral(projeto.id) });
  return (
    <Carregar consulta={q} textoErro="Não foi possível carregar a visão geral." tituloVazio="Nada para mostrar ainda" vazio={(d) => (d.grupos.length ? null : "Importe o cadastro de itens para ver a situação de cada grupo de produtos.")}>
      {(d) => (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Cada célula mostra a situação mais urgente do grupo naquela camada: primeiro o que está pendente, depois o que aguarda informação ou está proposto. Clique para abrir os casos do recorte; clique no nome do grupo para ver os produtos.</p>
          <div className="overflow-auto border border-border bg-card">
            <table className="w-full min-w-[900px] text-sm" aria-label="Situação por grupo e camada">
              <thead>
                <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <th scope="col" className="sticky left-0 z-10 w-56 bg-muted px-2 py-2">Grupo de produtos</th>
                  <th scope="col" className="px-2 text-right">Itens</th>
                  {d.camadas.map((c) => <th key={c} scope="col" className="min-w-[150px] px-2">{ROTULO_CAMADA[c]}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.grupos.map((g) => (
                  <tr key={g.grupo} className="border-t border-border/60 align-top">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium">
                      <button type="button" className="text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Ver os produtos deste grupo na tabela" onClick={() => aoAbrirTabela({ grupo: g.grupo })}>{g.grupo}</button>
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums">{g.itens.toLocaleString("pt-BR")}</td>
                    {d.camadas.map((camada) => {
                      const c = g.camadas[camada] || {};
                      const agregada = situacaoAgregada(c);
                      return (
                        <td key={camada} className="px-2 py-1.5">
                          {agregada ? (
                            <button type="button" onClick={() => aoAbrirCasos({ camada, grupo: g.grupo })} className="block w-full border border-transparent p-1 text-left hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`${g.grupo}, ${ROTULO_CAMADA[camada]}: ${rotuloSituacao(agregada)}, ${totalDeCelulas(c)} produto(s)${c.revisar ? `, ${c.revisar} para revisar` : ""}. Abrir os casos.`}>
                              <SeloSituacao situacao={agregada} curto />
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">{resumoDeContagem(c)}</span>
                              {c.revisar > 0 && <span className="mt-0.5 inline-flex items-center"><MarcaRevisar /><span className="ml-1 text-[11px]">{c.revisar.toLocaleString("pt-BR")}</span></span>}
                            </button>
                          ) : <span className="text-xs text-muted-foreground" aria-label="Sem dados">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Carregar>
  );
}
