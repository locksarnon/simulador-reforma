import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DocumentosXml from "@/components/repositorio-xml/DocumentosXml";
import CertificadoXml from "@/components/repositorio-xml/CertificadoXml";
import CapturaXml from "@/components/repositorio-xml/CapturaXml";

/** Repositório de XML de um cliente: documentos enviados e capturados, e o certificado A1 usado na captura. */
export default function EmpresaRepositorioXml() {
  const { empresaId } = useParams();
  const [aba, setAba] = useState("documentos");
  const { data: empresa } = useQuery({ queryKey: ["empresa", empresaId], queryFn: () => api.entities.Empresa.get(empresaId), enabled: !!empresaId });

  return (
    <div className="px-6 lg:px-8 py-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Repositório de XML</h2>
        <p className="text-sm text-muted-foreground">Todos os XML de {empresa?.razao_social || "esta empresa"} num lugar só: o que você envia por arquivo e o que é capturado da SEFAZ com o certificado do cliente. Daqui eles seguem para a Importação XML.</p>
      </div>
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="captura">Captura</TabsTrigger>
          <TabsTrigger value="certificado">Certificado e autorização</TabsTrigger>
        </TabsList>
        <TabsContent value="documentos" className="mt-4"><DocumentosXml empresaId={empresaId} empresa={empresa} /></TabsContent>
        <TabsContent value="captura" className="mt-4"><CapturaXml empresaId={empresaId} /></TabsContent>
        <TabsContent value="certificado" className="mt-4"><CertificadoXml empresaId={empresaId} /></TabsContent>
      </Tabs>
    </div>
  );
}
