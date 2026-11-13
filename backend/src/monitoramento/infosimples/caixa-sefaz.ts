import type { Servico } from '../catalogo';

/**
 * Caixa postal (DEC/DT-e) das SEFAZ: nenhum serviço. Na Infosimples todas as consultas de caixa postal estadual
 * (sefaz/{go,mt,ms,ma,pa}/dec/caixa-postal) exigem o certificado digital do contribuinte (pkcs12_cert e pkcs12_pass),
 * e o envio do certificado do cliente à Infosimples não é feito pelo InTAX.
 */
export const servicos: Servico[] = [];
