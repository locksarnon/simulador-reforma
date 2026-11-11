import { Navigate, useParams } from "react-router-dom";
import { caminhoDoRepositorio } from "@/lib/bpoCaminhos";

/**
 * O Repositório de XML já foi uma aba da empresa (/workroom/:id/empresas/:empresaId/repositorio-xml).
 * Quem tem esse endereço guardado (favorito, aba aberta, e-mail de vencimento do certificado) cai no lugar novo.
 */
export default function RedirecionaRepositorioXml() {
  const { empresaId } = useParams();
  return <Navigate to={caminhoDoRepositorio(empresaId)} replace />;
}
