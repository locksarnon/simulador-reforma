import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, Search } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import TituloPagina from "@/components/TituloPagina";
import { fmtDoc } from "@/components/repositorio-xml/formatos";
import { caminhoDoRepositorio } from "@/lib/bpoCaminhos";

const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soAlfanumericos = (s) => String(s ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();

/** Junta cada empresa ao seu grupo, filtra pelo texto (nome, ID, CNPJ, UF, município ou grupo; sem acento) e ordena pelo nome. */
export function filtrarEmpresas(empresas, grupos, busca) {
  const texto = normalizar(busca).trim();
  const digitos = soAlfanumericos(texto);
  // Texto só de dígitos e pontuação de CNPJ ("12.345.678/0001-95") também casa com o CNPJ sem pontuação; "#001" é grupo, não CNPJ.
  const pareceCnpj = /^[0-9a-z./-]+$/i.test(texto) && digitos.length >= 4;
  const porNumero = new Map((grupos || []).map((g) => [g.numero, g]));
  const linhas = (empresas || []).map((empresa) => ({ empresa, grupo: porNumero.get(empresa.grupo) || null }));
  const filtradas = !texto ? linhas : linhas.filter(({ empresa: e, grupo: g }) => {
    const alvo = normalizar([e.razao_social, e.id_empresa, e.cnpj_cpf, e.uf, e.municipio, g?.nome, g?.numero, e.grupo].filter(Boolean).join(" "));
    return alvo.includes(texto) || (pareceCnpj && soAlfanumericos(e.cnpj_cpf).includes(digitos));
  });
  return [...filtradas].sort((a, b) => String(a.empresa.razao_social ?? "").localeCompare(String(b.empresa.razao_social ?? ""), "pt-BR", { sensitivity: "base" }));
}

/** BPO fiscal: lista de todas as empresas, de qualquer grupo, para abrir o Repositório de XML de uma delas. */
export default function RepositorioXmlLista() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const { data: empresas, isLoading, isError } = useQuery({ queryKey: ["empresas", "bpo-lista"], queryFn: () => api.entities.Empresa.list() });
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => api.entities.Grupo.list() });
  const linhas = useMemo(() => filtrarEmpresas(empresas, grupos, busca), [empresas, grupos, busca]);

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Repositório de XML" }]} />
      <div className="p-6 lg:p-8 space-y-5">
        <div>
          <TituloPagina icon={Archive}>Repositório de XML</TituloPagina>
        </div>

        <label className="relative block">
          <span className="sr-only">Buscar empresa</span>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por empresa, CNPJ ou grupo…" className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
        </label>

        {isLoading ? <p className="text-sm text-muted-foreground">Carregando as empresas…</p>
          : isError ? <p role="alert" className="text-sm text-red-600">Não foi possível carregar as empresas.</p>
          : (
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2.5 px-4 font-medium">Empresa</th>
                    <th className="py-2.5 px-4 font-medium">CNPJ</th>
                    <th className="py-2.5 px-4 font-medium">Grupo</th>
                    <th className="py-2.5 px-4 font-medium">UF</th>
                    <th className="py-2.5 px-4 font-medium w-24"><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ empresa: e, grupo: g }) => (
                    <tr key={e.id} onClick={() => navigate(caminhoDoRepositorio(e.id))} className="border-t border-border/50 hover:bg-muted/20 cursor-pointer">
                      <td className="py-2.5 px-4">
                        <Link to={caminhoDoRepositorio(e.id)} onClick={(ev) => ev.stopPropagation()} className="font-medium hover:underline">{e.razao_social}</Link>
                        <span className="block text-xs text-muted-foreground">{e.id_empresa}</span>
                      </td>
                      <td className="py-2.5 px-4 tabular-nums text-muted-foreground">{fmtDoc(e.cnpj_cpf)}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{g ? `${g.numero} ${g.nome}` : (e.grupo || "—")}</td>
                      <td className="py-2.5 px-4">{e.uf || "—"}</td>
                      <td className="py-2.5 px-4 text-right">
                        <Link to={caminhoDoRepositorio(e.id)} onClick={(ev) => ev.stopPropagation()} className="text-primary hover:underline">Abrir ›</Link>
                      </td>
                    </tr>
                  ))}
                  {linhas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        {(empresas || []).length === 0
                          ? <>Nenhuma empresa cadastrada. Cadastre as empresas em <Link to="/" className="text-primary hover:underline">Clientes</Link>.</>
                          : "Nenhuma empresa encontrada para essa busca."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
