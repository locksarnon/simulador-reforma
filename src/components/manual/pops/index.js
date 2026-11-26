/**
 * Manual de uso em POP (procedimento operacional padrão): um POP por tela do menu, passo a passo, com os textos reais
 * de botões e campos. Toda mudança de tela atualiza o POP dela e o FAQ no mesmo commit.
 *
 * Formato de cada POP:
 * {
 *   modulo: id do módulo em src/lib/navegacao.js (a tela que o POP explica),
 *   codigo: "POP-XXX-NN" (área + número),
 *   titulo: o que a pessoa vai fazer ("Cadastrar um cliente"),
 *   objetivo: uma frase,
 *   quem: quem faz (ex.: "Consultor" / "Administrador"),
 *   quando: quando fazer,
 *   caminho: "Menu > Área > Tela" (como a pessoa chega),
 *   antes: [o que precisa estar pronto antes],
 *   passos: [{ acao: "Clique em Novo cliente.", detalhe?: "explicação curta" }],
 *   resultado: o que a pessoa vê quando terminou,
 *   atencao: [cuidados, custos, o que não fazer],
 * }
 * Um módulo pode ter mais de um POP (um por tarefa da tela).
 */
import { POPS_INICIO_CLIENTES_ADMIN } from "./popsInicioClientesAdmin";
import { POPS_BPO } from "./popsBpo";
import { POPS_CONSULTORIA_CONSULTAS_COMERCIAL } from "./popsConsultoriaConsultasComercial";
import { POPS_SANEAMENTO_ESTOQUES } from "./popsSaneamentoEstoques";

export const POPS_ATUALIZADO_EM = "26/11/2026";
export const POPS = [...POPS_INICIO_CLIENTES_ADMIN, ...POPS_BPO, ...POPS_CONSULTORIA_CONSULTAS_COMERCIAL, ...POPS_SANEAMENTO_ESTOQUES];
