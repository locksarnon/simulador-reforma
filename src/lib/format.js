export const BRL = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

export const pct = (v, digits = 2) =>
  `${((Number(v) || 0) * 100).toFixed(digits)}%`;

export const num = (v) => Number(v) || 0;

export const fmtInt = (v) => (Number(v) || 0).toLocaleString("pt-BR");