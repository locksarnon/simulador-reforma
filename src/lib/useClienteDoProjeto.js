import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { clienteDoProjeto } from "@/lib/trilhas";

/**
 * Cliente do projeto para a trilha (nome e página na carteira), pelas mesmas consultas do cadastro que as outras telas usam
 * (empresas — inclusive arquivadas — e pessoas físicas, esta só quando o projeto é de pessoa física).
 */
export function useClienteDoProjeto(p) {
  const pj = Boolean(p && !p.pessoa_fisica_id && p.empresa_ids?.length === 1);
  const empresas = useQuery({ queryKey: ["empresas", "todas"], queryFn: () => api.entities.Empresa.listTodas(), enabled: pj });
  const pessoas = useQuery({ queryKey: ["pessoas-fisicas"], queryFn: () => api.get("/pessoas-fisicas"), enabled: Boolean(p?.pessoa_fisica_id) });
  const cliente = clienteDoProjeto(p, { empresas: empresas.data || [], pessoas: pessoas.data || [] });
  // Nome ainda chegando: marca para a trilha esperar, em vez de passar por "Projetos" e depois pular para a carteira.
  const carregando = (pj && empresas.isLoading) || (Boolean(p?.pessoa_fisica_id) && pessoas.isLoading);
  return cliente && carregando ? { ...cliente, carregando: true } : cliente;
}
