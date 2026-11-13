import type { Servico } from '../catalogo';

/**
 * Débitos e guias de ISS e IPTU nas prefeituras de MT, MS, GO, MA e PA.
 * Conferido no catálogo oficial da Infosimples (https://infosimples.com/consultas/apis.json, 839 consultas, 13/11/2026):
 * não há consulta de débitos ou guias de ISS/IPTU para nenhum município dessas UFs. Nelas só existem a CND municipal
 * (pref/cnd e as rotas por município, já usada nas certidões automáticas) e a consulta de NFS-e (Cuiabá e Campo Grande).
 * Débitos e guias de IPTU/ISS só existem para SP (São Paulo, Campinas), RJ (Rio de Janeiro), MG (Belo Horizonte) e DF.
 * Quando a Infosimples publicar a consulta para algum desses municípios, o serviço entra aqui.
 */
export const servicos: Servico[] = [];
