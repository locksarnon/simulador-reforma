import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { mapaDeTags } from "@/lib/tags";

/** Etiquetas e a ligação delas com as empresas (um pedido para cada, para pintar as listas inteiras). */
export function useTags() {
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api.get("/tags") });
  const porEmpresa = useQuery({ queryKey: ["tags", "por-empresa"], queryFn: () => api.get("/tags/por-empresa") });
  const mapa = useMemo(() => mapaDeTags(tags.data), [tags.data]);
  return {
    tags: tags.data || [],
    porEmpresa: porEmpresa.data || {},
    mapa,
    carregando: tags.isLoading || porEmpresa.isLoading,
    erro: tags.error || porEmpresa.error,
  };
}

/** Colaboradores com as empresas que cada um atende (filtro "colaborador" das listas). */
export function useColaboradores() {
  return useQuery({ queryKey: ["carteira", "colaboradores"], queryFn: () => api.get("/carteira/colaboradores") });
}
