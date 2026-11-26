import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import TabelaPadrao from "@/components/TabelaPadrao";
import { chaves, san } from "./api";
import { Carregar } from "./comuns";
import { contarPorTipoDeAjuste, fmtData, rotuloTipoAjuste, TIPOS_DE_AJUSTE } from "./logica";

const COLUNAS = [
  { chave: "tipo_ajuste", rotulo: "Tipo de ajuste", valor: (l) => rotuloTipoAjuste(l.tipo_ajuste) },
  { chave: "obrigacao", rotulo: "Obrigação" },
  { chave: "competencia", rotulo: "Competência" },
  { chave: "versao_leiaute", rotulo: "Leiaute" },
  { chave: "registro", rotulo: "Registro" },
  { chave: "campo", rotulo: "Campo" },
  { chave: "valor_original", rotulo: "Original" },
  { chave: "valor_proposto", rotulo: "Proposto" },
  { chave: "motivo", rotulo: "Motivo", quebrar: true },
  { chave: "evidencia", rotulo: "Evidência", quebrar: true },
  { chave: "inicio", rotulo: "Início da vigência", valor: (l) => fmtData(l.inicio) },
  { chave: "avaliar_anteriores", rotulo: "Avaliar períodos anteriores", valor: (l) => (l.avaliar_anteriores ? "Sim" : "Não") },
  { chave: "responsavel", rotulo: "Responsável" },
];

const COLUNAS_VINCULO = [
  { chave: "de", rotulo: "Código antigo" }, { chave: "para", rotulo: "Código novo" },
  { chave: "inicio", rotulo: "A partir de", valor: (v) => fmtData(v.inicio) }, { chave: "justificativa", rotulo: "Justificativa", quebrar: true },
];

/** Impacto nas obrigações: o checklist por tipo de ajuste e os vínculos de código antigo → novo. Somente leitura. */
export default function Impacto({ projeto }) {
  const impactos = useQuery({ queryKey: chaves.impactos(projeto.id), queryFn: () => san.impactos(projeto.id) });
  const vinculos = useQuery({ queryKey: [...chaves.todos(projeto.id), "vinculos"], queryFn: () => san.vinculos(projeto.id) });
  const [tipo, setTipo] = useState("");
  const linhas = useMemo(() => (impactos.data || []).filter((l) => !tipo || l.tipo_ajuste === tipo), [impactos.data, tipo]);
  const contagem = contarPorTipoDeAjuste(impactos.data);
  return (
    <div className="space-y-6">
      <section aria-labelledby="san-imp-sped" className="space-y-2">
        <h2 id="san-imp-sped" className="font-semibold">Checklist por tipo de ajuste</h2>
        <p className="text-sm text-muted-foreground">O que conferir nas obrigações acessórias a cada ajuste aprovado. A retificação e a transmissão não fazem parte deste serviço.</p>
        <Carregar consulta={impactos} textoErro="Não foi possível carregar o impacto nas obrigações." tituloVazio="Nenhum impacto registrado ainda" vazio={(d) => (d.length ? null : "As linhas do checklist são geradas quando você roda a camada Impacto nas obrigações (faixa de Cobertura, no alto) e quando aprova ajustes que alteram o cadastro.")}>
          {() => (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo de ajuste">
                <button type="button" aria-pressed={tipo === ""} onClick={() => setTipo("")} className={`border px-2.5 py-1 text-sm ${tipo === "" ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>Todos ({impactos.data.length})</button>
                {Object.entries(TIPOS_DE_AJUSTE).map(([k, v]) => (
                  <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(tipo === k ? "" : k)} className={`border px-2.5 py-1 text-sm ${tipo === k ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>{v} ({contagem[k]})</button>
                ))}
              </div>
              <TabelaPadrao id="saneamento-estoques-impactos" ariaLabel="Impacto nas obrigações" colunas={COLUNAS} linhas={linhas} chaveLinha={(l) => l.id} vazio="Nenhuma linha neste tipo de ajuste." />
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
