import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import TabelaPadrao from "@/components/TabelaPadrao";
import { AlertasErp, usePerfilErp } from "@/components/erps/erps";
import { chaves, san } from "./api";
import { botaoSecundario, Carregar, TextoLongo } from "./comuns";
import { fmtData, paginasDeImpacto, rotuloTipoAjuste, TIPOS_DE_AJUSTE } from "./logica";

const COLUNAS = [
  { chave: "tipo_ajuste", rotulo: "Tipo de ajuste", valor: (l) => rotuloTipoAjuste(l.tipo_ajuste) },
  { chave: "obrigacao", rotulo: "Obrigação" },
  { chave: "competencia", rotulo: "Competência" },
  { chave: "versao_leiaute", rotulo: "Leiaute", render: (l) => <TextoLongo texto={l.versao_leiaute} largura="max-w-[10rem]" /> },
  { chave: "registro", rotulo: "Registro" },
  { chave: "campo", rotulo: "Campo", render: (l) => <TextoLongo texto={l.campo} largura="max-w-[12rem]" /> },
  { chave: "valor_original", rotulo: "Original" },
  { chave: "valor_proposto", rotulo: "Proposto" },
  { chave: "motivo", rotulo: "Motivo", render: (l) => <TextoLongo texto={l.motivo} largura="max-w-[24rem]" /> },
  { chave: "evidencia", rotulo: "Evidência", render: (l) => <TextoLongo texto={l.evidencia} largura="max-w-[18rem]" /> },
  { chave: "inicio", rotulo: "Início da vigência", valor: (l) => fmtData(l.inicio) },
  { chave: "avaliar_anteriores", rotulo: "Avaliar períodos anteriores", valor: (l) => (l.avaliar_anteriores ? "Sim" : "Não") },
  { chave: "responsavel", rotulo: "Responsável" },
];

const COLUNAS_VINCULO = [
  { chave: "de", rotulo: "Código antigo" }, { chave: "para", rotulo: "Código novo" },
  { chave: "inicio", rotulo: "A partir de", valor: (v) => fmtData(v.inicio) }, { chave: "justificativa", rotulo: "Justificativa", render: (v) => <TextoLongo texto={v.justificativa} largura="max-w-[28rem]" /> },
];

/** Impacto nas obrigações: o checklist por tipo de ajuste e os vínculos de código antigo → novo. Somente leitura. */
export default function Impacto({ projeto }) {
  const [tipo, setTipo] = useState("");
  // Paginado no servidor (um projeto grande tem dezenas de milhares de linhas); o filtro por tipo também vai ao servidor.
  const impactos = useInfiniteQuery({
    queryKey: chaves.impactos(projeto.id, tipo),
    queryFn: ({ pageParam }) => san.impactos(projeto.id, { ...(tipo ? { tipo_ajuste: tipo } : {}), ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined,
    getNextPageParam: (u) => u.proximo || undefined,
    gcTime: 60_000,
  });
  const vinculos = useQuery({ queryKey: [...chaves.todos(projeto.id), "vinculos"], queryFn: () => san.vinculos(projeto.id) });
  const pag = useMemo(() => paginasDeImpacto(impactos.data), [impactos.data]);
  const linhas = pag.linhas;
  const contagem = pag.porTipo;
  const perfilErp = usePerfilErp(projeto.erp_id).data;
  const tiposAjuste = impactos.data?.pages?.[0]?.tiposAjuste || [];
  return (
    <div className="space-y-6">
      <section aria-labelledby="san-imp-sped" className="space-y-2">
        <h2 id="san-imp-sped" className="font-semibold">Checklist por tipo de ajuste</h2>
        <p className="text-sm text-muted-foreground">O que conferir nas obrigações acessórias a cada ajuste aprovado. A retificação e a transmissão não fazem parte deste serviço.</p>
        <AlertasErp perfil={perfilErp} tipos={tiposAjuste} titulo={perfilErp ? `Restrições do ${perfilErp.nome} para os ajustes deste projeto` : undefined} />
        <Carregar consulta={impactos} textoErro="Não foi possível carregar o impacto nas obrigações." tituloVazio="Nenhum impacto registrado ainda" vazio={() => (pag.totalGeral ? null : "As linhas do checklist são geradas quando você roda a camada Impacto nas obrigações (Cobertura das camadas, no alto) e quando aprova ajustes que alteram o cadastro.")}>
          {() => (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo de ajuste">
                <button type="button" aria-pressed={tipo === ""} onClick={() => setTipo("")} className={`border px-2.5 py-1 text-sm ${tipo === "" ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>Todos ({pag.totalGeral.toLocaleString("pt-BR")})</button>
                {Object.entries(TIPOS_DE_AJUSTE).map(([k, v]) => (
                  <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(tipo === k ? "" : k)} className={`border px-2.5 py-1 text-sm ${tipo === k ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>{v} ({(contagem[k] || 0).toLocaleString("pt-BR")})</button>
                ))}
              </div>
              <TabelaPadrao id="saneamento-estoques-impactos" ariaLabel="Impacto nas obrigações" colunas={COLUNAS} linhas={linhas} chaveLinha={(l) => l.id} vazio="Nenhuma linha neste tipo de ajuste." />
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span role="status">Mostrando {linhas.length.toLocaleString("pt-BR")} de {pag.total.toLocaleString("pt-BR")} linha(s){tipo ? " deste tipo" : ""}. Filtros e ordenação da tabela valem para as linhas carregadas.</span>
                {impactos.hasNextPage && <button type="button" className={botaoSecundario} onClick={() => impactos.fetchNextPage()} disabled={impactos.isFetchingNextPage}>{impactos.isFetchingNextPage ? "Carregando…" : "Carregar mais linhas"}</button>}
              </div>
            </>
          )}
        </Carregar>
      </section>
      <section aria-labelledby="san-imp-vinc" className="space-y-2">
        <h2 id="san-imp-vinc" className="font-semibold">Vínculos de código (antigo → novo)</h2>
        <Carregar consulta={vinculos} textoErro="Não foi possível carregar os vínculos." vazio={(d) => (d.length ? null : "Nenhum código foi consolidado ou substituído.")}>
          {(d) => <TabelaPadrao id="saneamento-estoques-vinculos" ariaLabel="Vínculos de código" colunas={COLUNAS_VINCULO} linhas={d} chaveLinha={(v) => v.id} simples />}
        </Carregar>
      </section>
    </div>
  );
}
