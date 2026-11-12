import { api } from "@/api/client";

/** Clientes não são excluídos, só arquivados: estas são as chamadas e os textos únicos da confirmação. */
export const arquivarCliente = (id) => api.post(`/clientes/${id}/arquivar`);
export const desarquivarCliente = (id) => api.post(`/clientes/${id}/desarquivar`);
export const TEXTO_ARQUIVAR = "O cliente sai das listas, da carteira e das rotinas; os serviços ficam pausados e a captura de XML é desligada. Todo o histórico (XML, análises, consultas, documentos) continua guardado e ele pode ser desarquivado a qualquer momento em Clientes > Arquivados.";
/** Chaves para atualizar as telas depois de arquivar ou desarquivar. */
export const CHAVES_APOS_ARQUIVAR = [["empresas"], ["servicos-contratados"], ["monitoramento"], ["carteira"]];
