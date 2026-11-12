/** "1 pendência", "2 pendências": número (pt-BR) seguido da forma certa da palavra. */
export const plural = (n: number, um: string, varios: string) => `${Number(n || 0).toLocaleString('pt-BR')} ${Number(n) === 1 ? um : varios}`;

/** Só a palavra, sem o número. */
export const palavra = (n: number, um: string, varios: string) => (Number(n) === 1 ? um : varios);
