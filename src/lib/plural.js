/** "1 pendência", "2 pendências": número (pt-BR) seguido da forma certa da palavra. */
export const plural = (n, um, varios) => `${Number(n || 0).toLocaleString("pt-BR")} ${Number(n) === 1 ? um : varios}`;

/** Só a palavra, sem o número. */
export const palavra = (n, um, varios) => (Number(n) === 1 ? um : varios);
