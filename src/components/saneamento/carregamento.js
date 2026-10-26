// Quando o estado salvo do projeto pode ser carregado na tela. O salvamento automático grava o que está na tela: se a tela partisse de uma cópia velha, gravaria por cima do trabalho mais novo.
// O cache do react-query devolve, ao reabrir o projeto, a cópia de antes do último salvamento (e a leitura nova ainda vem a caminho, ou falha): só vale a leitura feita depois de a tela abrir, sem erro.
// Função pura (sem React).

/** `consulta` é o resultado do useQuery do projeto; `jaCarregado` diz se o estado já foi carregado nesta abertura da tela. */
export const podeCarregarEstado = (consulta, jaCarregado) => !jaCarregado && !!consulta?.data && !!consulta.isFetchedAfterMount && !consulta.isError;
