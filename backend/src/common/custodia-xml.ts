import { PrismaService } from '../prisma/prisma.service';

export const AVISO_CUSTODIA_SO_ADMIN =
  'Esta empresa tem certificado do cliente, XML ou captura de XML guardados no Repositório de XML: apenas administradores podem excluí-la.';

type PrismaCustodia = Pick<PrismaService, 'certificadoDigital' | 'documentoXml' | 'capturaXmlConfig' | 'xmlEmpresaConfig'>;

/**
 * Dentre as empresas informadas, as que guardam algo do Repositório de XML: o certificado A1 do cliente (chave cifrada), documentos
 * ou configuração da captura. Excluir uma delas destrói o que o cliente confiou à FAL, então só administradores podem, e quem exclui
 * precisa apagar também esses registros e arquivos (senão sobrariam órfãos, sem dono e sem tela para remover).
 */
export async function empresasComCustodiaXml(prisma: PrismaCustodia, empresaIds: string[]): Promise<string[]> {
  if (!empresaIds.length) return [];
  const onde = { empresa_id: { in: empresaIds } };
  const [certificados, documentos, capturas, configs] = await Promise.all([
    prisma.certificadoDigital.groupBy({ by: ['empresa_id'], where: onde }),
    prisma.documentoXml.groupBy({ by: ['empresa_id'], where: onde }),
    prisma.capturaXmlConfig.groupBy({ by: ['empresa_id'], where: onde }),
    prisma.xmlEmpresaConfig.groupBy({ by: ['empresa_id'], where: onde }),
  ]);
  return [...new Set([...certificados, ...documentos, ...capturas, ...configs].map((r) => r.empresa_id))];
}
