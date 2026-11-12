import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DocumentosXml from "@/components/repositorio-xml/DocumentosXml";
import CertificadoXml from "@/components/repositorio-xml/CertificadoXml";
import CapturaXml from "@/components/repositorio-xml/CapturaXml";
import CartoesDoRepositorio from "@/components/repositorio-xml/CartoesDoRepositorio";
import RelatoriosXml from "@/components/repositorio-xml/RelatoriosXml";
import { ABAS_DE_DOCUMENTOS, fmtDoc } from "@/components/repositorio-xml/formatos";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";

/**
 * Menu da empresa no desenho do menu do Notalize: uma barra horizontal, texto simples nos itens e o item aberto em destaque.
 * Aqui o destaque é o verde da marca, e a fonte é a do sistema. Primeiro o que configura (certificado e captura), depois um item
 * por tipo de documento, os resumos e os relatórios. Em tela estreita a barra quebra em duas linhas (sem rolagem lateral, que
 * esconderia os últimos itens).
 */
const ITEM_DO_MENU = "rounded-none px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=active]:hover:bg-primary";
const ABAS_COM_CARTOES = [...ABAS_DE_DOCUMENTOS.map((a) => a.valor), "resumos"];

/** Repositório de XML de um cliente: documentos por tipo, resumos e eventos, relatórios, captura automática e o certificado A1 dele. */
export default function RepositorioXmlEmpresa() {
  const { empresaId } = useParams();
  const [aba, setAba] = useState("nfe");
  const { data: empresa, isLoading, isError } = useQuery({ queryKey: ["empresa", empresaId], queryFn: () => api.entities.Empresa.get(empresaId), enabled: !!empresaId });
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => api.entities.Grupo.list() });
  // Mesma consulta do resumo dos cartões (o cache é um só): a aba "Resumos e eventos SEFAZ" mostra quantas linhas tem.
  const { data: contagem } = useQuery({ queryKey: ["repo-xml-resumo", empresaId], queryFn: () => api.get(`/repositorio-xml/empresas/${empresaId}/resumo`), enabled: !!empresaId });
  const resumosEEventos = contagem?.resumos_e_eventos ?? 0;

  const grupo = empresa ? (grupos || []).find((g) => g.numero === empresa.grupo) : null;
  // A Importação XML é do diagnóstico, dentro do grupo e da empresa: o caminho só existe quando o grupo da empresa é conhecido.
  const linkImportacao = empresa && grupo ? `/workroom/${grupo.id}/empresas/${empresa.id}/importacao-xml` : null;
  const subtitulo = empresa ? [fmtDoc(empresa.cnpj_cpf) !== "—" ? `CNPJ ${fmtDoc(empresa.cnpj_cpf)}` : null, grupo ? `Grupo ${grupo.numero} ${grupo.nome}` : null, empresa.uf].filter(Boolean).join(" · ") : "";

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "DataHub", to: "/" },
          { label: "Repositório de XML", to: CAMINHO_REPOSITORIO_XML },
          { label: isLoading ? "Carregando..." : (empresa?.razao_social || "Empresa") },
        ]}
        title={isLoading ? "Carregando..." : empresa?.razao_social}
        subtitle={subtitulo}
      />
      {isLoading ? <p className="p-6">Carregando empresa…</p>
        : isError || !empresa ? <p role="alert" className="p-6">Empresa não encontrada. <Link to={CAMINHO_REPOSITORIO_XML} className="text-primary hover:underline">Voltar à lista do Repositório de XML</Link>.</p>
        : (
          <div className="px-6 lg:px-8 py-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Repositório de XML</h2>
            </div>
            <Tabs value={aba} onValueChange={setAba} className="space-y-4">
              <div className="border border-border bg-card">
                <TabsList aria-label="Menu do repositório" className="h-auto w-full flex-wrap justify-start gap-1 rounded-none bg-transparent p-1.5">
                  <TabsTrigger value="certificado" className={ITEM_DO_MENU}>Certificado</TabsTrigger>
                  <TabsTrigger value="captura" className={ITEM_DO_MENU}>Captura</TabsTrigger>
                  {ABAS_DE_DOCUMENTOS.map((a) => <TabsTrigger key={a.valor} value={a.valor} className={ITEM_DO_MENU}>{a.rotulo}</TabsTrigger>)}
                  <TabsTrigger value="resumos" className={ITEM_DO_MENU}>{resumosEEventos > 0 ? `Resumos e eventos SEFAZ (${resumosEEventos})` : "Resumos e eventos SEFAZ"}</TabsTrigger>
                  <TabsTrigger value="relatorios" className={ITEM_DO_MENU}>Relatórios</TabsTrigger>
                </TabsList>
              </div>
              {ABAS_COM_CARTOES.includes(aba) && <CartoesDoRepositorio empresaId={empresaId} aoAbrirResumos={() => setAba("resumos")} />}
              <TabsContent value="certificado" className="mt-0"><CertificadoXml empresaId={empresaId} /></TabsContent>
              <TabsContent value="captura" className="mt-0"><CapturaXml empresaId={empresaId} /></TabsContent>
              {ABAS_DE_DOCUMENTOS.map((a) => (
                <TabsContent key={a.valor} value={a.valor} className="mt-0"><DocumentosXml empresaId={empresaId} empresa={empresa} linkImportacao={linkImportacao} grupo={a.grupo} /></TabsContent>
              ))}
              <TabsContent value="resumos" className="mt-0"><DocumentosXml modo="resumos" empresaId={empresaId} empresa={empresa} linkImportacao={null} /></TabsContent>
              <TabsContent value="relatorios" className="mt-0"><RelatoriosXml empresaId={empresaId} empresa={empresa} /></TabsContent>
            </Tabs>
          </div>
        )}
    </div>
  );
}
