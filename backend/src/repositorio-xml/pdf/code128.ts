/**
 * Código de barras Code 128, conjunto C (pares de dígitos), o usado na chave de acesso de 44 dígitos do DANFE.
 * Cada símbolo tem 6 larguras (barra, espaço, barra, espaço, barra, espaço) que somam 11 módulos; o símbolo de parada tem 7
 * larguras (13 módulos). Os valores 0 a 99 são os pares de dígitos; 105 é o início do conjunto C e 106 é a parada.
 */
const PADROES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const INICIO_C = 105;
const PARADA = 106;

/**
 * Larguras (em módulos) das barras e dos espaços, alternando, começando por uma barra: início, um símbolo por par de dígitos,
 * dígito verificador e parada. Exige só dígitos e quantidade par.
 */
export function largurasCode128C(digitos: string): number[] {
  if (!/^[0-9]+$/.test(digitos) || digitos.length % 2 !== 0) throw new Error('Code 128C exige só dígitos, em quantidade par.');
  const valores = [INICIO_C];
  for (let i = 0; i < digitos.length; i += 2) valores.push(Number(digitos.slice(i, i + 2)));
  let soma = INICIO_C;
  for (let i = 1; i < valores.length; i += 1) soma += valores[i] * i;
  valores.push(soma % 103, PARADA);
  return valores.flatMap((v) => PADROES[v].split('').map(Number));
}

/** Os mesmos módulos como texto: "1" é barra e "0" é espaço (a forma que as bibliotecas de código de barras costumam devolver). */
export function modulosCode128C(digitos: string): string {
  return largurasCode128C(digitos).map((largura, i) => (i % 2 === 0 ? '1' : '0').repeat(largura)).join('');
}
