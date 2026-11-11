import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { indexarPorEmpresa } from "@/lib/servicos";

/** Empresas, grupos e serviços contratados juntos, com o índice por empresa e os números para os cartões. */
export function useCarteiras() {
  const empresas = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const grupos = useQuery({ queryKey: ["grupos"], queryFn: () => api.entities.Grupo.list() });
  const servicos = useQuery({ queryKey: ["servicos-contratados"], queryFn: () => api.get("/servicos-contratados") });
  const resumo = useQuery({ queryKey: ["servicos-contratados", "resumo"], queryFn: () => api.get("/servicos-contratados/resumo") });
  const mapa = useMemo(() => indexarPorEmpresa(servicos.data), [servicos.data]);
  const carregando = empresas.isLoading || grupos.isLoading || servicos.isLoading;
  const erro = empresas.error || grupos.error || servicos.error;
  const recarregar = () => { empresas.refetch(); grupos.refetch(); servicos.refetch(); resumo.refetch(); };
  return { empresas: empresas.data || [], grupos: grupos.data || [], servicos: servicos.data || [], resumo: resumo.data, mapa, carregando, erro, recarregar };
}

export const CHAVES_DOS_SERVICOS = [["servicos-contratados"], ["servicos-contratados", "resumo"]];
