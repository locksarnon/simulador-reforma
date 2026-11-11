import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DocumentosXml from "@/components/repositorio-xml/DocumentosXml";
import CertificadoXml from "@/components/repositorio-xml/CertificadoXml";
import CapturaXml from "@/components/repositorio-xml/CapturaXml";
import { fmtDoc } from "@/components/repositorio-xml/formatos";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";

/** Repositório de XML de um cliente: documentos enviados e capturados, captura automática e o certificado A1 dele. */
export default function RepositorioXmlEmpresa() {
  const { empresaId } = useParams();
  const [aba, setAba] = useState("documentos");
  const { data: empresa, isLoading, isError } = useQuery({ queryKey: ["empresa", empresaId], queryFn: () => api.entities.Empresa.get(empresaId), enabled: !!empresaId });
  const { data: grupos } = useQuery({ queryKey: ["grupos"], queryFn: () => api.entities.Grupo.list() });

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
              <p className="text-sm text-muted-foreground">Todos os XML de {empresa.razao_social} num lugar só: o que você envia por arquivo e o que é capturado da SEFAZ com o certificado do cliente. Daqui eles seguem para a Importação XML.</p>
            </div>
            <Tabs value={aba} onValueChange={setAba}>
              <TabsList>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
                <TabsTrigger value="captura">Captura</TabsTrigger>
                <TabsTrigger value="certificado">Certificado</TabsTrigger>
              </TabsList>
              <TabsContent value="documentos" className="mt-4"><DocumentosXml empresaId={empresaId} empresa={empresa} linkImportacao={linkImportacao} /></TabsContent>
              <TabsContent value="captura" className="mt-4"><CapturaXml empresaId={empresaId} /></TabsContent>
              <TabsContent value="certificado" className="mt-4"><CertificadoXml empresaId={empresaId} /></TabsContent>
            </Tabs>
          </div>
        )}
    </div>
  );
}
