/**
 * Regime do cliente (premissa obrigatória da Fase 2, docs/saneamento-fases.md "Regime do cliente"). Lista fechada com o fundamento na
 * LC 214/2025; o espelho está na tela (src/components/saneamento-estoques). Gravado em `parametros.regimeCliente` do projeto.
 */
export const REGIMES_CLIENTE = [
  { codigo: 'REGULAR', rotulo: 'Contribuinte do regime regular', fundamento: 'LC 214/2025, arts. 21 e 41' },
  { codigo: 'SIMPLES_NO_SIMPLES', rotulo: 'Simples Nacional, recolhendo IBS e CBS no Simples', fundamento: 'LC 214/2025, art. 47, § 9º' },
  { codigo: 'SIMPLES_REGULAR', rotulo: 'Simples Nacional, com opção pelo regime regular do IBS e da CBS', fundamento: 'LC 214/2025, art. 41, § 3º' },
  { codigo: 'PRODUTOR_RURAL_NAO_CONTRIBUINTE', rotulo: 'Produtor rural não contribuinte', fundamento: 'LC 214/2025, art. 164' },
  { codigo: 'PRODUTOR_RURAL_CONTRIBUINTE', rotulo: 'Produtor rural contribuinte por opção', fundamento: 'LC 214/2025, art. 165' },
] as const;

export type RegimeCliente = (typeof REGIMES_CLIENTE)[number]['codigo'];
export const CODIGOS_REGIME_CLIENTE: readonly RegimeCliente[] = REGIMES_CLIENTE.map((r) => r.codigo);
export const ehRegimeCliente = (v: unknown): v is RegimeCliente => typeof v === 'string' && (CODIGOS_REGIME_CLIENTE as readonly string[]).includes(v);
