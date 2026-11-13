import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, Search } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import TituloPagina from "@/components/TituloPagina";
import TabelaPadrao from "@/components/TabelaPadrao";
import { fmtDoc } from "@/components/repositorio-xml/formatos";
import { caminhoDoRepositorio } from "@/lib/bpoCaminhos";
import InterruptorCaptura from "@/components/repositorio-xml/InterruptorCaptura";
import { SeloCertificado } from "@/pages/clientes/ClientesPagina";

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
  const { data: captura } = useQuery({ queryKey: ["captura-xml", "empresas"], queryFn: () => api.get("/captura-xml/empresas"), staleTime: 60_000 });
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
            <TabelaPadrao
              id="repositorio-xml-empresas" ariaLabel="Empresas do Repositório de XML" linhas={linhas} chaveLinha={(l) => l.empresa.id}
              aoClicarLinha={(l) => navigate(caminhoDoRepositorio(l.empresa.id))}
              vazio={(empresas || []).length === 0
                ? <>Nenhuma empresa cadastrada. Cadastre as empresas em <Link to="/" className="text-primary hover:underline">Clientes</Link>.</>
                : "Nenhuma empresa encontrada para essa busca."}
              colunas={[
                { chave: "empresa", rotulo: "Empresa", valor: (l) => l.empresa.razao_social, render: ({ empresa: e }) => <Link to={caminhoDoRepositorio(e.id)} onClick={(ev) => ev.stopPropagation()} className="font-medium hover:underline">{e.razao_social}</Link> },
                { chave: "codigo", rotulo: "Código", valor: (l) => l.empresa.id_empresa || "", render: (l) => <span className="text-muted-foreground">{l.empresa.id_empresa || "—"}</span> },
                { chave: "cnpj", rotulo: "CNPJ", valor: (l) => fmtDoc(l.empresa.cnpj_cpf), render: (l) => <span className="tabular-nums text-muted-foreground">{fmtDoc(l.empresa.cnpj_cpf)}</span> },
                { chave: "grupo", rotulo: "Grupo", valor: ({ empresa: e, grupo: g }) => (g ? `${g.numero} ${g.nome}` : (e.grupo || "")), render: ({ empresa: e, grupo: g }) => <span className="text-muted-foreground">{g ? `${g.numero} ${g.nome}` : (e.grupo || "—")}</span> },
                { chave: "uf", rotulo: "UF", valor: (l) => l.empresa.uf || "", render: (l) => l.empresa.uf || "—" },
                { chave: "certificado", rotulo: "Certificado", tipo: "data", valor: (l) => captura?.[l.empresa.id]?.certificado?.valido_ate || "", render: (l) => <SeloCertificado certificado={captura?.[l.empresa.id]?.certificado} /> },
                { chave: "captura", rotulo: "Captura", valor: (l) => (captura?.[l.empresa.id]?.ligada ? "Ligada" : "Desligada"), render: ({ empresa: e }) => <InterruptorCaptura compacto empresaId={e.id} ligada={!!captura?.[e.id]?.ligada} certificadoOk={["VALIDO", "A_VENCER"].includes(captura?.[e.id]?.certificado?.situacao)} /> },
                { chave: "abrir", rotulo: "Abrir", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "", render: ({ empresa: e }) => <Link to={caminhoDoRepositorio(e.id)} onClick={(ev) => ev.stopPropagation()} className="text-primary hover:underline">Abrir ›</Link> },
              ]}
            />
          )}
      </div>
    </div>
  );
}
