import React, { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import PainelExecutivoView from "@/components/painel/PainelExecutivoView";
import PageHeader from "@/components/PageHeader";
import { useEmpresaEmFoco } from "@/lib/EmpresaEmFoco";
import { opcoesDoSeletor, rotuloDoGrupo } from "@/lib/clientes";

export { opcoesDoSeletor };

/** Valor do seletor único: "" (toda a carteira), "g:NUMERO" (um grupo) ou "e:NUMERO|ID_EMPRESA" (uma empresa). */
export function valorDoSeletor(grupoNumero, empresaId) {
  if (grupoNumero && empresaId) return `e:${grupoNumero}|${empresaId}`;
  if (grupoNumero) return `g:${grupoNumero}`;
  return "";
}

/** Planejamento tributário > Painel executivo: carga, margem e caixa da carteira, de um grupo ou de uma empresa. */
export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const grupoNumero = searchParams.get("grupo") || "";
  const empresaId = searchParams.get("empresa") || "";
  const { empresaId: emFoco } = useEmpresaEmFoco();

  const { data: grupos = [] } = useQuery({ queryKey: ["grupos"], queryFn: () => api.entities.Grupo.list() });
  const { data: empresas = [] } = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });

  // Abre já na empresa em foco (a escolhida no topo), quando o endereço não diz outra coisa.
  useEffect(() => {
    if (grupoNumero || empresaId || !emFoco || searchParams.get("todos")) return;
    const e = empresas.find((x) => x.id === emFoco);
    if (e?.grupo) setSearchParams({ grupo: e.grupo, empresa: e.id_empresa }, { replace: true });
  }, [emFoco, empresas, grupoNumero, empresaId, searchParams, setSearchParams]);

  const grupoSelecionado = grupos.find((g) => g.numero === grupoNumero);
  const empresaSelecionada = empresas.find((e) => e.grupo === grupoNumero && e.id_empresa === empresaId);
  const { grupos: gruposReais, empresas: todas } = useMemo(() => opcoesDoSeletor(grupos, empresas), [grupos, empresas]);
  const grupoEhReal = grupoSelecionado && gruposReais.some((g) => g.id === grupoSelecionado.id);

  const mudar = (e) => {
    const v = e.target.value;
    if (!v) return setSearchParams({ todos: "1" });
    if (v.startsWith("g:")) return setSearchParams({ grupo: v.slice(2) });
    const [grupo, empresa] = v.slice(2).split("|");
    setSearchParams({ grupo, empresa });
  };

  const grupoLabel = grupoSelecionado && grupoEhReal ? rotuloDoGrupo(grupoSelecionado) : "";
  const empresaLabel = empresaSelecionada ? [grupoLabel, empresaSelecionada.razao_social].filter(Boolean).join(" — ") : "";
  const contexto = empresaSelecionada ? empresaSelecionada.razao_social : grupoSelecionado ? rotuloDoGrupo(grupoSelecionado) : "Toda a carteira";

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Planejamento tributário", to: "/area/reforma" }, { label: "Painel executivo" }]}
        title="Painel executivo"
        subtitle={`Analisando: ${contexto}. Para trocar, use o seletor "Analisar" no painel.`}
      />
      <PainelExecutivoView
        grupoNumero={grupoNumero || undefined}
        empresaId={empresaId || undefined}
        grupoLabel={grupoLabel}
        empresaLabel={empresaLabel}
        escopo={empresaSelecionada ? "empresa" : grupoSelecionado ? "grupo" : "global"}
        grupoId={grupoSelecionado?.id || null}
        empresaDbId={empresaSelecionada?.id || null}
        headerControls={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Analisar</span>
            <select value={valorDoSeletor(grupoNumero, empresaId)} onChange={mudar} aria-label="Escolha a carteira, um grupo ou uma empresa" className="h-9 max-w-[22rem] rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Toda a carteira</option>
              {gruposReais.length > 0 && <optgroup label="Grupos econômicos">{gruposReais.map((g) => <option key={g.id} value={`g:${g.numero}`}>{rotuloDoGrupo(g)}</option>)}</optgroup>}
              <optgroup label="Empresas">{todas.map((e) => <option key={e.id} value={`e:${e.grupo}|${e.id_empresa}`}>{e.razao_social}</option>)}</optgroup>
            </select>
          </label>
        }
      />
    </div>
  );
}
