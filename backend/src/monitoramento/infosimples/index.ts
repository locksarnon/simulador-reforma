import type { Servico } from '../catalogo';
import { servicos as simeiSimples } from './simei-simples';
import { servicos as inscricaoEstadual } from './inscricao-estadual';
import { servicos as caixaSefaz } from './caixa-sefaz';
import { servicos as perdcomp } from './perdcomp';
import { servicos as dividas } from './dividas';
import { servicos as tributosMunicipais } from './tributos-municipais';

/** Serviços do monitoramento atendidos pela Infosimples, por frente. */
export const SERVICOS_INFOSIMPLES: Servico[] = [...simeiSimples, ...inscricaoEstadual, ...caixaSefaz, ...perdcomp, ...dividas, ...tributosMunicipais];
