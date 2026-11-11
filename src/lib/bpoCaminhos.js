/**
 * Caminhos da área "BPO fiscal" (guarda e captura dos XML dos clientes, e o certificado digital deles).
 * A área é independente do diagnóstico e dos serviços (workroom do grupo e da empresa): o menu, as rotas e as telas
 * usam estas constantes, para mudar de lugar ou de nome num ponto só.
 */
export const CAMINHO_REPOSITORIO_XML = "/bpo/repositorio-xml";

/** Tela de uma empresa dentro do Repositório de XML (abas Documentos, Captura e Certificado). */
export const caminhoDoRepositorio = (empresaId) => `${CAMINHO_REPOSITORIO_XML}/${empresaId}`;
