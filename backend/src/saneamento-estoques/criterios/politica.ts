/** Critérios das análises para a política (função pura, sem Nest nem banco). */
import { ROTULO_CAMADA } from '../rotulos';
import type { Camada } from '../tipos';
import { CATALOGO_CRITERIOS, criteriosDaCamada, textoDoValor, valorCriterio, type CriterioManual, type CriteriosGravados } from './catalogo';

type Json = Record<string, unknown>;
const lerManuais = (par: Json | null | undefined): CriterioManual[] => (Array.isArray(par?.criteriosManuais) ? (par!.criteriosManuais as CriterioManual[]) : []);
export type CriteriosDaPolitica = { camada: string; itens: { texto: string; manual: boolean }[] }[];

/**
 * Critérios para a seção "Critérios das análises" da política: por camada, o texto com o valor efetivo e as verificações manuais.
 * Função pura sobre `parametros` (os do projeto ou os congelados na versão). `camadas` = as ativas no projeto.
 */
export function criteriosParaPolitica(parametros: Json | null | undefined, camadas: Camada[]): CriteriosDaPolitica {
  const gravados = (parametros?.criterios ?? {}) as CriteriosGravados;
  const manuais = lerManuais(parametros);
  return camadas.filter((c) => CATALOGO_CRITERIOS.some((x) => x.camada === c) || manuais.some((m) => m.camada === c)).map((camada) => ({
    camada: ROTULO_CAMADA[camada],
    itens: [
      ...criteriosDaCamada(camada).map((c) => {
        if (c.parametro) return { texto: `${c.texto}: ${textoDoValor(c.parametro, valorCriterio(gravados, camada, c.parametro.chave))}`, manual: false };
        if (c.origem === 'CONFIGURACAO') {
          const corte = parametros?.corteMovimentacao as string | null | undefined;
          return { texto: `${c.texto} (${corte ? `corte em ${corte.slice(8, 10)}/${corte.slice(5, 7)}/${corte.slice(0, 4)}` : 'corte não definido: critério não aplicado'})`, manual: false };
        }
        return { texto: c.texto, manual: false };
      }),
      ...manuais.filter((m) => m.camada === camada).map((m) => ({ texto: m.texto, manual: true })),
    ],
  }));
}
