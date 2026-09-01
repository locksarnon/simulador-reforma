import React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PainelExecutivoView from "@/components/painel/PainelExecutivoView";
import PageHeader from "@/components/PageHeader";

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const grupoNumero = searchParams.get("grupo") || "";
  const empresaId = searchParams.get("empresa") || "";

  const { data: grupos = [] } = useQuery({
    queryKey: ["grupos"],
    queryFn: () => base44.entities.Grupo.list(),
  });
  // Empresas do grupo escolhido — para popular o segundo seletor. Sem grupo
  // selecionado não tem o que listar (empresa sempre pertence a um grupo).
  const { data: empresasDoGrupo = [] } = useQuery({
    queryKey: ["empresas", grupoNumero],
    queryFn: () => base44.entities.Empresa.filter({ grupo: grupoNumero }),
    enabled: !!grupoNumero,
  });

  const grupoSelecionado = grupos.find((g) => g.numero === grupoNumero);
  const empresaSelecionada = empresasDoGrupo.find((e) => e.id_empresa === empresaId);

  const handleGrupoChange = (e) => {
    const value = e.target.value;
    // Trocar de grupo invalida a empresa escolhida — ela pertencia ao grupo anterior.
    if (value) setSearchParams({ grupo: value });
    else setSearchParams({});
  };
  const handleEmpresaChange = (e) => {
    const value = e.target.value;
    if (value) setSearchParams({ grupo: grupoNumero, empresa: value });
    else setSearchParams({ grupo: grupoNumero });
  };

  const grupoLabel = grupoSelecionado ? `Grupo ${grupoSelecionado.numero} · ${grupoSelecionado.nome}` : "";
  const empresaLabel = empresaSelecionada
    ? `${grupoLabel} — ${empresaSelecionada.id_empresa} · ${empresaSelecionada.razao_social}`
    : "";

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "DataHub", to: "/" },
          ...(grupoSelecionado ? [{ label: grupoSelecionado.nome, to: `/workroom/${grupoSelecionado.id}` }] : []),
          { label: empresaSelecionada ? empresaSelecionada.razao_social : "Painel Executivo" },
        ]}
      />
    <PainelExecutivoView
      grupoNumero={grupoNumero || undefined}
      empresaId={empresaId || undefined}
      grupoLabel={grupoLabel}
      empresaLabel={empresaLabel}
      escopo={empresaSelecionada ? "empresa" : (grupoSelecionado ? "grupo" : "global")}
      grupoId={grupoSelecionado?.id || null}
      empresaDbId={empresaSelecionada?.id || null}
      headerControls={
        <>
          <select
            value={grupoNumero}
            onChange={handleGrupoChange}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos os grupos</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.numero}>{g.numero} · {g.nome}</option>
            ))}
          </select>
          {grupoNumero && (
            <select
              value={empresaId}
              onChange={handleEmpresaChange}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todas as empresas do grupo</option>
              {empresasDoGrupo.map((e) => (
                <option key={e.id} value={e.id_empresa}>{e.id_empresa} · {e.razao_social}</option>
              ))}
            </select>
          )}
        </>
      }
    />
    </div>
  );
}
